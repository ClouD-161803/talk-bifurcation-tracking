// tex.js of a talk folder written by the edit command from preamble.tex, references.bib, and the
// deck, with the text that npm run tex writes. it is derived again after a write of index.html that
// cites other papers, and after a change on disk of preamble.tex, of references.bib, or of a file
// that the preamble reads, once the change is stable. it is written only when its text changes,
// and never in a folder without preamble.tex and references.bib, whose tex.js may be shared with
// another deck. every change of tex.js on disk, by the edit command or by another program, is
// counted, and the pages draw the deck again with it. so is a stable change of the text of
// preamble.tex or references.bib that leaves the text of tex.js as it is, after which the pages read
// the sources again, e.g. for a paper added to references.bib that the deck does not cite yet

import { readFileSync, statSync } from 'node:fs';
import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { citedKeys, folderTex, skippedLines, texScript } from '../texfile.ts';
import { renameRetried, signature } from './disk.ts';

const STABLE = 300;
// the wait before the first retry of a failed write of tex.js, doubled at each further failure up to
// 5 s, as for a failed write of index.html in disk.ts
const RETRY = 500;

// the cited keys of a deck in one order, since a citation moved in the deck does not change tex.js
const keysOf = (html: string) => citedKeys(html).sort().join(',');

export type DerivedTex = {
  text: string;
  // the files of the folder that were read or looked up, with their signatures, '' when missing
  files: Map<string, string>;
  // whether the folder has preamble.tex or references.bib
  sources: boolean;
  // the files that exist but could not be read, each with its reason
  unread: string[];
  // the skipped lines of the sources and the cited keys without an entry, as npm run tex prints them
  skipped: string[];
  // a hash of the texts of preamble.tex and references.bib, which the pages read
  key: string;
};

/**
 * The text of tex.js for the deck html in the folder dir, as npm run tex derives it
 * from the files of the folder, with the signature of each file that was read or looked up.
 */
export function deriveTex(dir: string, html: string): DerivedTex {
  const files = new Map<string, string>();
  const unread: string[] = [];
  const hash = createHash('sha256');
  const text = (name: string): string | null => {
    const file = join(dir, name);
    try {
      // the signature before the read, hence a change during the read is found by the next poll
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

// onChange is called at each change of tex.js on disk, and after a stable change of the text of
// preamble.tex or references.bib that leaves tex.js as it is. onWriteError is called with the
// message of a failed write of tex.js, once for each reason, and with null at the next derivation
// that does not fail. stable is the time in ms that a changed file must not change before it is
// taken, and retry the wait in ms before the first retry of a failed write, both set in the tests
export type TexOptions = {
  log?: (message: string) => void;
  onChange?: () => void;
  onWriteError?: (message: string | null) => void;
  stable?: number;
  retry?: number;
};

// the line logged while a source, or a file that preamble.tex inputs, cannot be read
const unreadLine = (unread: string[]) => `tex.js is not written, since ${unread.join(', and ')}`;

// a signature that differs from the one taken last, and the time at which it was first seen
type Seen = { sig: string; at: number } | null;

export class TexWriter {
  private dir: string;
  private file: string;
  private log: (message: string) => void;
  private onChange: () => void;
  private onWriteError: (message: string | null) => void;
  private stable: number;
  private retry: number;
  // the text of index.html written last, and the cited keys of the text of the last derivation
  private html: string;
  private keys: string;
  // the files read or looked up by the last derivation, with their signatures, and a change of them
  private watched: Map<string, string>;
  private sourcesSeen: Seen = null;
  // the key of the texts of the sources of the last derivation
  private texts: string;
  // the signature of tex.js written or counted last, and a change of it
  private texSig: string;
  private texSeen: Seen = null;
  // the derivations and the polls run one at a time
  private chain: Promise<void> = Promise.resolve();
  private due = false;
  // the signatures of the sources after a stable change of them, which the derivation that is due
  // follows, or null
  private settled: Map<string, string> | null = null;
  private polling = false;
  private stopped = false;
  // the reason of the write of tex.js that failed last, the failed writes in a row, and the time
  // before which a poll does not try the write again
  private failure: string | null = null;
  private failures = 0;
  private retryAt = 0;
  // the skipped lines and the keys without an entry logged last
  private skipped = '';

  // html is the text of index.html at the start. the files are read for their signatures, and
  // nothing is written
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
    // the skipped lines, or the reason why tex.js is not written, are logged at the start as well,
    // since the next derivation logs only a change
    if (derived.sources && !derived.unread.length) {
      this.skipped = derived.skipped.join('\n');
      for (const line of derived.skipped) this.log(line);
    } else if (derived.sources) this.log(unreadLine(derived.unread));
  }

  // index.html holds html on disk. tex.js is derived again when it cites other keys
  written(html: string): void {
    if (html === this.html) return;
    this.html = html;
    if (keysOf(html) !== this.keys) this.derive();
  }

  // a source written by the edit command, which is taken at once rather than once it is stable
  sourceWritten(): void {
    this.derive(new Map([...this.watched.keys()].map((name) => [name, sigOf(join(this.dir, name))])));
  }

  // a stat of the files of the last derivation and of tex.js, at each poll of index.html
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

  // no poll after a stop. resolves once the derivation of the last write of index.html is over
  async stop(): Promise<void> {
    this.stopped = true;
    await this.idle();
  }

  // resolves once every derivation and poll is over
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
    // a source that changed since it was found stable, or since the last derivation, e.g. one that an
    // editor is saving now, is taken at a later poll, once it is stable
    const base = settled ?? this.watched;
    if ([...derived.files].some(([name, sig]) => base.has(name) && base.get(name) !== sig)) return;
    // the keys and the files of the derivation are kept once a write is not owed for them, hence a
    // write that failed is tried again at the next poll
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
    // a tex.js without the macros of a file that is not read would break every page
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
      // the derivation is taken, hence it is tried again at the retry, and a new change at once
      this.keys = keysOf(html);
      this.watched = derived.files;
      this.sourcesSeen = null;
      this.failures++;
      this.retryAt = performance.now() + Math.min(5000, this.retry * 2 ** (this.failures - 1));
      // the message names the temporary file, which differs at each try
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
