import { readFileSync, statSync } from 'node:fs';
import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { citedKeys, folderTex, skippedLines, texScript } from '../texfile.ts';
import { renameRetried, signature } from './disk.ts';

const STABLE = 300;
const RETRY = 500;

const keysOf = (html: string) => citedKeys(html).sort().join(',');

export type DerivedTex = {
  text: string;
  files: Map<string, string>;
  sources: boolean;
  unread: string[];
  skipped: string[];
  key: string;
};

export function deriveTex(dir: string, html: string): DerivedTex {
  const files = new Map<string, string>();
  const unread: string[] = [];
  const hash = createHash('sha256');
  const text = (name: string): string | null => {
    const file = join(dir, name);
    try {
      files.set(name, signature(statSync(file)));
      const read = readFileSync(file, 'utf8');
      if (name === 'preamble.tex' || name === 'references.bib') hash.update(`${name}\n${read.length}\n${read}`);
      return read;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (!files.has(name)) files.set(name, '');
      if (code !== 'ENOENT' && code !== 'ENOTDIR') unread.push(`${name} is not read: ${(e as Error).message}`);
      return null;
    }
  };
  const { preamble, bibliography, tex, missing } = folderTex(text, html);
  return { text: texScript(tex), files, sources: files.get('preamble.tex') !== '' || files.get('references.bib') !== '', unread, skipped: skippedLines(preamble, bibliography, missing, 'index.html'), key: hash.digest('hex') };
}

export type TexOptions = {
  log?: (message: string) => void;
  onChange?: () => void;
  onWriteError?: (message: string | null) => void;
  stable?: number;
  retry?: number;
};

const unreadLine = (unread: string[]) => `tex.js is not written, since ${unread.join(', and ')}`;

type Seen = { sig: string; at: number } | null;

export class TexWriter {
  private dir: string;
  private file: string;
  private log: (message: string) => void;
  private onChange: () => void;
  private onWriteError: (message: string | null) => void;
  private stable: number;
  private retry: number;
  private html: string;
  private keys: string;
  private watched: Map<string, string>;
  private sourcesSeen: Seen = null;
  private texts: string;
  private texSig: string;
  private texSeen: Seen = null;
  private chain: Promise<void> = Promise.resolve();
  private due = false;
  private settled: Map<string, string> | null = null;
  private polling = false;
  private stopped = false;
  private failure: string | null = null;
  private failures = 0;
  private retryAt = 0;
  private skipped = '';

  constructor(dir: string, html: string, options: TexOptions = {}) {
    this.dir = dir;
    this.file = join(dir, 'tex.js');
    this.log = options.log ?? (() => {});
    this.onChange = options.onChange ?? (() => {});
    this.onWriteError = options.onWriteError ?? (() => {});
    this.stable = options.stable ?? STABLE;
    this.retry = options.retry ?? RETRY;
    this.html = html;
    this.keys = keysOf(html);
    const derived = deriveTex(dir, html);
    this.watched = derived.files;
    this.texts = derived.key;
    this.texSig = sigOf(this.file);
    if (derived.sources && !derived.unread.length) {
      this.skipped = derived.skipped.join('\n');
      for (const line of derived.skipped) this.log(line);
    } else if (derived.sources) this.log(unreadLine(derived.unread));
  }

  written(html: string): void {
    if (html === this.html) return;
    this.html = html;
    if (keysOf(html) !== this.keys) this.derive();
  }

  sourceWritten(): void {
    this.derive(new Map([...this.watched.keys()].map((name) => [name, sigOf(join(this.dir, name))])));
  }

  poll(): void {
    if (this.polling || this.stopped) return;
    this.polling = true;
    void this.run(async () => {
      try {
        await this.look();
      } finally {
        this.polling = false;
      }
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.idle();
  }

  async idle(): Promise<void> {
    let chain;
    do await (chain = this.chain);
    while (chain !== this.chain);
  }

  private run(task: () => Promise<void>): Promise<void> {
    return (this.chain = this.chain.then(task).catch((e) => this.log(`tex.js: ${(e as Error).message}`)));
  }

  private derive(settled: Map<string, string> | null = null): void {
    this.settled = settled ?? this.settled;
    if (this.due) return;
    this.due = true;
    void this.run(() => {
      this.due = false;
      return this.write();
    });
  }

  private async look(): Promise<void> {
    const now = performance.now();
    const sigs = await Promise.all([...this.watched.keys()].map(async (name) => [name, await statSig(join(this.dir, name))] as const));
    const sources = sigs.map(([name, sig]) => `${name}\n${sig}`).join('\n');
    if (sigs.some(([name, sig]) => this.watched.get(name) !== sig)) {
      if (this.sourcesSeen?.sig !== sources) this.sourcesSeen = { sig: sources, at: now };
      else if (now - this.sourcesSeen.at >= this.stable) this.derive(new Map(sigs));
    } else {
      this.sourcesSeen = null;
      if (this.failure !== null && now >= this.retryAt) this.derive();
    }
    const tex = await statSig(this.file);
    if (tex !== this.texSig) {
      if (this.texSeen?.sig !== tex) this.texSeen = { sig: tex, at: now };
      else if (now - this.texSeen.at >= this.stable) {
        this.texSig = tex;
        this.texSeen = null;
        this.onChange();
      }
    } else this.texSeen = null;
  }

  private async write(): Promise<void> {
    const html = this.html;
    const settled = this.settled;
    this.settled = null;
    const derived = deriveTex(this.dir, html);
    const base = settled ?? this.watched;
    if ([...derived.files].some(([name, sig]) => base.has(name) && base.get(name) !== sig)) return;
    const settle = () => {
      this.keys = keysOf(html);
      this.watched = derived.files;
      this.texts = derived.key;
      this.sourcesSeen = null;
      if (this.failure === null) return;
      this.failure = null;
      this.failures = 0;
      this.retryAt = 0;
      this.onWriteError(null);
    };
    if (!derived.sources) return settle();
    if (derived.unread.length) {
      settle();
      this.log(unreadLine(derived.unread));
      return;
    }
    if (derived.skipped.join('\n') !== this.skipped) {
      this.skipped = derived.skipped.join('\n');
      for (const line of derived.skipped) this.log(line);
    }
    const old = await readFile(this.file, 'utf8').catch(() => null);
    if (old === derived.text) {
      const changed = derived.key !== this.texts;
      settle();
      if (settled && changed) this.onChange();
      return;
    }
    const tmp = join(this.dir, `.tex.js.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(tmp, derived.text);
      const made = await stat(tmp);
      await renameRetried(tmp, this.file);
      settle();
      this.texSig = signature(made);
      this.texSeen = null;
      this.onChange();
    } catch (e) {
      await unlink(tmp).catch(() => {});
      this.keys = keysOf(html);
      this.watched = derived.files;
      this.sourcesSeen = null;
      this.failures++;
      this.retryAt = performance.now() + Math.min(5000, this.retry * 2 ** (this.failures - 1));
      const reason = (e as NodeJS.ErrnoException).code ?? (e as Error).message;
      if (reason === this.failure) return;
      this.failure = reason;
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
      this.onWriteError((e as Error).message);
    }
  }
}

function sigOf(file: string): string {
  try {
    return signature(statSync(file));
  } catch {
    return '';
  }
}

const statSig = (file: string) => stat(file).then(signature, () => '');
