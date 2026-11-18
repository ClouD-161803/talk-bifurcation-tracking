// the side of the edit command that registers a session with a relay, pulls the requests of the
// guests, and pushes the answers. the protocol is described at the top of scripts/relay.mjs. the
// address of the relay and the secret of the group are kept in the configuration folder of the
// user, never in the talk folder

import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readBody, type Request, type Response } from './http.ts';
import type { Ended } from '../session/protocol.ts';

// the largest file, or range of a file, that is answered through the relay
export const RELAY_BODY = 16 * 1024 * 1024;
// the largest answer that the relay takes, e.g. index.html, which a guest loads whole
export const RELAY_ANSWER = 64 * 1024 * 1024;
const PULLS = 4;
// the files answered through the relay at once, each read into memory before it is pushed
const FILE_ANSWERS = 8;

export type RelayConfig = { relay: string; secret: string };

export function configFile(): string {
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'beeson-slides', 'relay.json');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'beeson-slides', 'relay.json');
}

export function loadConfig(): Partial<RelayConfig> {
  try {
    const value = JSON.parse(readFileSync(configFile(), 'utf8'));
    return { relay: typeof value.relay === 'string' ? value.relay : undefined, secret: typeof value.secret === 'string' ? value.secret : undefined };
  } catch {
    return {};
  }
}

export function saveConfig(config: RelayConfig): void {
  const file = configFile();
  mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {}
}

export const ADDRESS_RULE = 'the address of the relay must start with https://';

// the address of a relay without a trailing slash, or null when it is not an https URL, or an http
// URL of this computer, without credentials, query, or fragment. a guest needs https, since
// navigator.clipboard and crypto.randomUUID work only in a secure context
export function relayAddress(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const local = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// header values are latin-1, hence the JSON of the headers is kept in ASCII
const asciiJson = (value: unknown) => JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export class Taken extends Error {
  constructor() {
    super('this session is already shared by another edit command, e.g. one started in a copy of this talk folder');
  }
}

type Pulled = { id: string; method: string; path: string; query: string; headers: Record<string, string>; body: string };

export class RelayLink {
  readonly relay: string;
  readonly link: string;
  private secret: string;
  private key: string;
  private token = '';
  private handle: (request: Request) => Promise<Response>;
  private running = false;
  private registering: Promise<void> | null = null;
  private controllers = new Set<AbortController>();
  // the requests of guests being answered, which a stop lets finish
  private serving = new Set<Promise<void>>();
  private fileSlots = FILE_ANSWERS;
  private fileQueue: (() => void)[] = [];
  private log: (message: string) => void;

  constructor(relay: string, secret: string, key: string, handle: (request: Request) => Promise<Response>, log: (message: string) => void) {
    this.relay = relay;
    this.secret = secret;
    this.key = key;
    this.handle = handle;
    this.log = log;
    this.link = `${relay}/${key}/index.html?edit&session`;
  }

  // false once stopped, or once another edit command took the key
  get active(): boolean {
    return this.running;
  }

  // registers the session and starts the pulls. rejects when the relay refuses the registration
  async start(): Promise<void> {
    await this.register();
    this.running = true;
    for (let i = 0; i < PULLS; i++) void this.pullLoop();
  }

  // ended is the record of End session, which the relay answers to the guests that come later
  async stop(ended?: Ended): Promise<void> {
    this.running = false;
    for (const c of this.controllers) c.abort();
    // an answer of ended still in flight would reach the guest as a 502 once the session is deleted
    await Promise.race([Promise.allSettled([...this.serving]), sleep(1500)]);
    const body = ended && JSON.stringify({ ended });
    await fetch(`${this.relay}/host/${this.key}`, { method: 'DELETE', headers: { ...this.auth(), ...(body && { 'Content-Type': 'application/json' }) }, body, signal: AbortSignal.timeout(3000) }).catch(() => {});
  }

  private auth(): Record<string, string> {
    return { Authorization: `Bearer ${this.secret}`, 'x-relay-token': this.token };
  }

  private register(): Promise<void> {
    this.registering ??= (async () => {
      try {
        const response = await fetch(`${this.relay}/host/${this.key}`, { method: 'POST', headers: this.auth(), signal: AbortSignal.timeout(10_000) });
        if (response.status === 409) {
          await response.body?.cancel();
          throw new Taken();
        }
        if (!response.ok) throw new Error(`the relay refused the session with ${response.status} ${(await response.text()).slice(0, 200)}`);
        const { token } = (await response.json()) as { token?: unknown };
        if (typeof token !== 'string') throw new Error('the relay did not give a token');
        this.token = token;
      } finally {
        this.registering = null;
      }
    })();
    return this.registering;
  }

  private async pullLoop(): Promise<void> {
    let backoff = 500;
    while (this.running) {
      const controller = new AbortController();
      this.controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 40_000);
      try {
        const response = await fetch(`${this.relay}/host/${this.key}/pull`, { method: 'POST', headers: this.auth(), signal: controller.signal });
        if (response.status === 401 || response.status === 404) {
          await response.body?.cancel();
          if (!this.running) break;
          // the relay dropped the session, e.g. at its restart, hence it is registered again
          await this.register();
          continue;
        }
        if (!response.ok) throw new Error(`pull answered ${response.status}`);
        const pulled = (await response.json()) as Pulled[];
        if (Array.isArray(pulled)) {
          for (const item of pulled) {
            const serving = this.serve(item);
            this.serving.add(serving);
            void serving.finally(() => this.serving.delete(serving));
          }
        }
        backoff = 500;
      } catch (e) {
        if (!this.running) break;
        if (e instanceof Taken) {
          this.running = false;
          this.log(`the session is no longer shared: ${e.message}`);
          break;
        }
        this.log(`the relay is not reached, trying again: ${(e as Error).message}`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 10_000);
      } finally {
        clearTimeout(timer);
        this.controllers.delete(controller);
      }
    }
  }

  private async serve(item: Pulled): Promise<void> {
    if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id)) return;
    let response: Response;
    let body: Buffer;
    let slot = false;
    try {
      const ok = typeof item.method === 'string' && typeof item.path === 'string' && typeof item.query === 'string' && typeof item.body === 'string';
      if (!ok || !item.path.startsWith(`/${this.key}/`)) throw new Error('malformed request');
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(item.headers ?? {})) if (typeof v === 'string') headers[k.toLowerCase()] = v;
      response = await this.handle({ method: item.method, path: item.path, query: item.query, headers, body: Buffer.from(item.body, 'base64'), direct: false });
      const b = response.body;
      if (b !== undefined && typeof b === 'object' && !Buffer.isBuffer(b)) {
        if (this.fileSlots > 0) this.fileSlots--;
        else await new Promise<void>((done) => this.fileQueue.push(done));
        slot = true;
      }
      body = b === undefined ? Buffer.alloc(0) : typeof b === 'string' ? Buffer.from(b) : Buffer.isBuffer(b) ? b : await readBody(b);
    } catch (e) {
      response = { status: 502, headers: { 'Content-Type': 'text/plain' } };
      body = Buffer.from((e as Error).message);
    }
    if (body.length > RELAY_ANSWER) {
      response = { status: 413, headers: { 'Content-Type': 'text/plain' } };
      body = Buffer.from('the answer is too large for the relay');
    }
    try {
      const push = async () => {
        const token = this.token;
        const pushed = await fetch(`${this.relay}/host/${this.key}/push/${item.id}`, {
          method: 'POST',
          headers: { ...this.auth(), 'Content-Type': 'application/octet-stream', 'x-relay-status': String(response.status), 'x-relay-headers': asciiJson(response.headers) },
          body,
          signal: AbortSignal.timeout(60_000),
        });
        await pushed.body?.cancel();
        return { status: pushed.status, token };
      };
      let pushed = await push();
      if (pushed.status === 401 && this.running) {
        // the token changed under the push, or the relay forgot the session, hence the answer
        // goes once more after a registration, which keeps the waiting requests of the session
        if (this.registering) await this.registering.catch(() => {});
        if (this.token === pushed.token) await this.register();
        pushed = await push();
      }
      if (pushed.status < 200 || pushed.status > 299) this.log(`the relay refused an answer with ${pushed.status}`);
    } catch (e) {
      this.log(`an answer did not reach the relay: ${(e as Error).message}`);
    } finally {
      if (slot) {
        const next = this.fileQueue.shift();
        if (next) next();
        else this.fileSlots++;
      }
    }
  }
}
