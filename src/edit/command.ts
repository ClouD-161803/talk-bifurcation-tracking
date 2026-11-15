// the edit command: it serves the talk folder to the browsers of a session at
// http://127.0.0.1:<port>/<key>/, keeps the authority of the session, and writes every edit into
// index.html. a request through a relay is handled by the same code as a direct one, with host
// false and without the check of the Host header, since the relay already matched the key

import { createReadStream, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { Authority } from '../session/authority.ts';
import type { HelloRequest, NameRequest, OpRequest } from '../session/protocol.ts';
import { Disk, readText } from './disk.ts';
import { error, fileInside, json, paramNames, segmentsOf, serveFile, withParam, type Request, type Response } from './http.ts';
import { isClientId, MAX_STATE, People } from './people.ts';
import { ADDRESS_RULE, loadConfig, RELAY_BODY, relayAddress, RelayLink, saveConfig } from './relay.ts';

export const DEFAULT_PORT = 8765;
const JSON_MAX = 16 * 1024 * 1024;
export const MEDIA_MAX = 64 * 1024 * 1024;
const MEDIA_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'mp4', 'webm', 'json']);

export type StartOptions = {
  folder?: string;
  // 0 for a free port. without a port, DEFAULT_PORT is tried first
  port?: number;
  relay?: string;
  log?: (message: string) => void;
};

export type Running = {
  url: string;
  port: number;
  key: string;
  root: string;
  authority: Authority;
  // the link of the session through the relay, or null
  link: () => string | null;
  close: () => Promise<void>;
};

// the key of the session, kept in .session/key so that a link survives a restart
function keyOf(root: string): string {
  const dir = join(root, '.session');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'key');
  try {
    const key = readFileSync(file, 'utf8').trim();
    if (/^[A-Za-z0-9_-]{22,128}$/.test(key)) return key;
  } catch {}
  const key = randomBytes(16).toString('base64url');
  writeFileSync(file, `${key}\n`, { mode: 0o600 });
  return key;
}

// a name of an upload made safe for every system, or null when its type is not an image, a video,
// or json
export function cleanName(raw: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }
  name = (name.split(/[\\/]/).pop() ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  if (!MEDIA_TYPES.has(ext)) return null;
  let stem = name.slice(0, dot).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 80);
  if (!stem) stem = 'media';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/.test(stem)) stem = `${stem}-file`;
  return `${stem}.${ext}`;
}

const isJson = (request: Request) => (request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() === 'application/json';

export async function start(options: StartOptions = {}): Promise<Running> {
  const log = options.log ?? ((m: string) => process.stderr.write(`${m}\n`));
  // the native realpath resolves the short names of Windows, as realpath of fs/promises does
  const root = realpathSync.native(resolve(options.folder ?? '.'));
  const index = join(root, 'index.html');
  const { text, bom } = readText(index);
  const key = keyOf(root);
  const authority = new Authority(text);
  const disk = new Disk(index, authority, bom, { log });
  const people = new People(authority, join(root, '.session', 'people.json'), log);
  let port = 0;
  let relay: RelayLink | null = null;

  async function share(request: Request): Promise<Response> {
    if (!request.direct) return error(403, 'only the host can share a session');
    if (request.method === 'GET') return json(200, { link: relay?.link ?? null });
    if (request.method === 'DELETE') {
      // the guests are told before the relay that carries the answers is left
      people.endGuests();
      await relay?.stop();
      relay = null;
      return json(200, { link: null });
    }
    if (request.method !== 'POST') return error(405, 'GET, POST, or DELETE');
    if (!isJson(request)) return error(415, 'the body must be application/json');
    let body: { relay?: unknown; secret?: unknown };
    try {
      body = JSON.parse(request.body.toString('utf8') || '{}');
    } catch {
      return error(400, 'the body is not JSON');
    }
    const saved = loadConfig();
    const address = relayAddress(body.relay ?? saved.relay);
    const secret = body.secret ?? saved.secret;
    if (!address) return json(400, { link: null, error: ADDRESS_RULE });
    if (typeof secret !== 'string' || secret.length < 16) return json(400, { link: null, error: 'the secret has fewer than 16 characters' });
    try {
      await connect(address, secret);
    } catch (e) {
      return json(502, { link: null, error: (e as Error).message });
    }
    if (body.relay !== undefined || body.secret !== undefined) saveConfig({ relay: address, secret });
    return json(200, { link: relay!.link });
  }

  async function connect(address: string, secret: string): Promise<void> {
    await relay?.stop();
    relay = null;
    const next = new RelayLink(address, secret, key, handle, log);
    await next.start();
    relay = next;
  }

  async function media(name: string, request: Request): Promise<Response> {
    if (request.method !== 'PUT') return error(405, 'PUT');
    const clean = cleanName(name);
    if (!clean) return error(415, 'the file must be an image, a video, or json');
    if (request.body.length > MEDIA_MAX) return error(413, 'the file is larger than 64 MB');
    const dir = join(root, 'media');
    await mkdir(dir, { recursive: true });
    const real = await realpath(dir);
    if (!real.startsWith(root + sep)) return error(403, 'media/ leaves the talk folder');
    const dot = clean.lastIndexOf('.');
    for (let i = 1; i < 1000; i++) {
      const candidate = i === 1 ? clean : `${clean.slice(0, dot)}-${i}${clean.slice(dot)}`;
      try {
        await writeFile(join(real, candidate), request.body, { flag: 'wx' });
        return json(200, { path: `media/${candidate}` });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
    return error(409, 'too many files of this name');
  }

  async function api(route: string, request: Request): Promise<Response> {
    if (route.startsWith('media/')) return media(route.slice(6), request);
    if (route === 'share') return share(request);
    if (route === 'events') {
      if (request.method !== 'GET') return error(405, 'GET');
      const query = new URLSearchParams(request.query);
      const waiting = people.events(query.get('client') ?? '', query.get('since') ?? '');
      return waiting ? json(200, await waiting) : error(404, 'say hello first');
    }
    if (!['hello', 'name', 'op', 'presence', 'bye'].includes(route)) return error(404, 'not found');
    if (request.method !== 'POST') return error(405, 'POST');
    if (!isJson(request)) return error(415, 'the body must be application/json');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(request.body.toString('utf8'));
      if (!body || typeof body !== 'object') throw new Error();
    } catch {
      return error(400, 'the body is not a JSON object');
    }
    if (route === 'hello') {
      const hello = body as Partial<HelloRequest>;
      const joined = people.hello(hello.name, hello.person, hello.client, request.direct, hello.claim === true);
      if ('taken' in joined) return json(200, { taken: joined.taken });
      if ('empty' in joined) return error(400, 'the name is empty');
      if ('full' in joined) return error(503, 'the session is full');
      const { member } = joined;
      const answer = { client: member.client, person: member.person, name: member.name, color: member.color, host: member.host, v: authority.version, people: people.list(), known: people.known() };
      const ops = typeof hello.v === 'string' ? authority.since(hello.v) : null;
      return json(200, ops ? { ...answer, ops } : { ...answer, text: authority.text });
    }
    if (route === 'op') {
      const person = people.personOf(body.client);
      if (person === null) return json(200, { ok: false, reason: 'unknown', v: authority.version });
      if (Array.isArray(body.patches) && body.patches.length > 100_000) return json(200, { ok: false, reason: 'invalid', v: authority.version });
      return json(200, authority.submit(body as unknown as OpRequest, person).answer);
    }
    if (!isClientId(body.client)) return error(400, 'client is missing');
    if (route === 'name') {
      const renamed = people.rename(body.client, (body as Partial<NameRequest>).name);
      if (!renamed) return error(404, 'say hello first');
      if ('empty' in renamed) return error(400, 'the name is empty');
      return json(200, renamed);
    }
    if (route === 'presence') {
      if ((JSON.stringify(body.state ?? null) ?? '').length > MAX_STATE) return error(413, 'the presence is too large');
      return people.presence(body.client, body.state ?? null) ? json(200, {}) : error(404, 'say hello first');
    }
    people.bye(body.client);
    return json(200, {});
  }

  function indexHtml(request: Request): Response {
    let version = authority.version;
    let html = authority.text;
    if (paramNames(request.query).has('session')) {
      const mode = request.headers['sec-fetch-mode'];
      const navigation = mode ? mode === 'navigate' : (request.headers.accept ?? '').includes('text/html');
      const v = new URLSearchParams(request.query).get('v');
      // a page and the text that the editor reads are of one version, hence a navigation is sent to
      // the URL of the current version
      if (navigation && v !== authority.version) {
        return { status: 302, headers: { Location: `index.html?${withParam(request.query, 'v', authority.version)}`, 'Cache-Control': 'no-store' } };
      }
      if (v !== null) {
        const n = authority.reach(v);
        if (n === null) return error(409, `version ${v} is not in the log, the current version is ${authority.version}`);
        html = authority.textAt(n)!;
        version = v;
      }
    }
    const body = Buffer.from(disk.bom ? `﻿${html}` : html, 'utf8');
    return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'x-session-version': version }, body };
  }

  async function handle(request: Request): Promise<Response> {
    const prefix = `/${key}/`;
    if (!request.path.startsWith(prefix)) return error(404, 'not found');
    const rest = request.path.slice(prefix.length);
    if (rest.startsWith('.session/')) return api(rest.slice('.session/'.length), request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return error(405, 'GET or HEAD');
    if (rest === '') return { status: 302, headers: { Location: 'index.html' } };
    const segments = segmentsOf(rest);
    if (!segments) return error(404, 'not found');
    if (segments.length === 1 && segments[0].toLowerCase() === 'index.html') return indexHtml(request);
    const file = await fileInside(root, segments);
    if (!file) return error(404, 'not found');
    return serveFile(file, request, request.direct ? Infinity : RELAY_BODY);
  }

  async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const q = url.indexOf('?');
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v;
    if (headers.host !== `127.0.0.1:${port}` && headers.host !== `localhost:${port}`) return send(req, res, error(403, 'the Host header is not this computer'));
    const limit = req.method === 'PUT' ? MEDIA_MAX : JSON_MAX;
    const chunks: Buffer[] = [];
    let length = 0;
    if (Number(headers['content-length'] ?? 0) > limit) return send(req, res, error(413, 'the body is too large'), true);
    try {
      for await (const chunk of req) {
        length += (chunk as Buffer).length;
        if (length > limit) return send(req, res, error(413, 'the body is too large'), true);
        chunks.push(chunk as Buffer);
      }
    } catch {
      // the browser closed the connection before the end of the body
      res.destroy();
      return;
    }
    const request: Request = { method: req.method ?? 'GET', path: q < 0 ? url : url.slice(0, q), query: q < 0 ? '' : url.slice(q + 1), headers, body: Buffer.concat(chunks), direct: true };
    let response: Response;
    try {
      response = await handle(request);
    } catch (e) {
      log(`a request failed: ${(e as Error).message}`);
      response = error(500, 'the request failed');
    }
    send(req, res, response);
  }

  function send(req: IncomingMessage, res: ServerResponse, response: Response, close = false): void {
    if (res.headersSent) return;
    const headers = { ...response.headers };
    const b = response.body;
    if (close) headers.Connection = 'close';
    const head = req.method === 'HEAD';
    if (b !== undefined && typeof b === 'object' && !Buffer.isBuffer(b)) {
      headers['Content-Length'] = String(b.end - b.start + 1);
      res.writeHead(response.status, headers);
      if (head || b.end < b.start) res.end();
      else createReadStream(b.file, { start: b.start, end: b.end }).on('error', () => res.destroy()).pipe(res);
      return;
    }
    const bytes = b === undefined ? Buffer.alloc(0) : Buffer.isBuffer(b) ? b : Buffer.from(b);
    headers['Content-Length'] = String(bytes.length);
    res.writeHead(response.status, headers);
    res.end(head ? undefined : bytes);
  }

  const server = createServer((req, res) =>
    onRequest(req, res).catch((e) => {
      log(`a request failed: ${(e as Error).message}`);
      res.destroy();
    }),
  );
  server.headersTimeout = 20_000;
  server.requestTimeout = 120_000;
  await new Promise<void>((done, fail) => {
    const tryListen = (p: number) => {
      server.once('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE' && options.port === undefined && p !== 0) tryListen(0);
        else fail(e);
      });
      server.listen(p, '127.0.0.1', () => {
        server.removeAllListeners('error');
        done();
      });
    };
    tryListen(options.port ?? DEFAULT_PORT);
  });
  port = (server.address() as { port: number }).port;
  disk.start();

  if (options.relay) {
    const address = relayAddress(options.relay);
    const secret = process.env.SLIDES_RELAY_SECRET || loadConfig().secret;
    if (!address) log(`${ADDRESS_RULE}, and the session is not shared`);
    else if (!secret || secret.length < 16) log('the secret of the relay is not set, and the session is not shared');
    else await connect(address, secret).then(() => log(`shared at ${relay!.link}`), (e) => log(`the session is not shared: ${(e as Error).message}`));
  }

  let closing: Promise<void> | null = null;
  return {
    url: `http://127.0.0.1:${port}/${key}/`,
    port,
    key,
    root,
    authority,
    link: () => relay?.link ?? null,
    close: () =>
      (closing ??= (async () => {
        people.end();
        disk.stopSync();
        await Promise.race([relay?.stop(), new Promise((done) => setTimeout(done, 2000))]);
        // a poll that arrives in this time is answered with ended, rather than reset by the close
        await new Promise((done) => setTimeout(done, 200));
        await new Promise<void>((done) => {
          server.close(() => done());
          setTimeout(() => {
            server.closeAllConnections();
          }, 300);
        });
      })()),
  };
}
