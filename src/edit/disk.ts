// index.html on disk as one more replica of a session. the text of the authority is written at
// most once per 250 ms of quiet and at the latest 1 s after the first unwritten operation, by a
// temporary file in the same folder and a rename over the file. a change that the edit command did
// not write itself is found by a stat every 500 ms, and merged as an operation of the author file,
// on the base of the text written lately that is nearest to it, where the file wins a conflict

import { readFileSync, renameSync, statSync, unlinkSync, writeFileSync, type Stats } from 'node:fs';
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { changes } from '../editor/merge.ts';
import type { Authority } from '../session/authority.ts';
import { apply, diff, mergePatches, size } from '../session/patch.ts';

export const AUTHOR = 'file';
const QUIET = 250;
const LATEST = 1000;
const POLL = 500;
const RING_TEXTS = 64;
const RING_CHARS = 8 * 1024 * 1024;

export class NotUtf8 extends Error {}

// the text of the bytes of a file without a leading byte-order mark, and whether it had one. bytes
// that are not valid UTF-8 are refused rather than replaced
export function decode(bytes: Buffer): { text: string; bom: boolean } {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new NotUtf8('the file is not valid UTF-8');
  return text.charCodeAt(0) === 0xfeff ? { text: text.slice(1), bom: true } : { text, bom: false };
}

const encode = (text: string, bom: boolean) => Buffer.from(bom ? `﻿${text}` : text, 'utf8');

const signature = (s: Stats) => `${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.ino}`;

const RETRY = new Set(['EPERM', 'EBUSY', 'EACCES']);
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// a rename over a file that another program may hold open for a moment, as on Windows
export async function renameRetried(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (e) {
      if (attempt >= 20 || !RETRY.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
      await sleep(10 * (attempt + 1));
    }
  }
}

export function renameRetriedSync(from: string, to: string): void {
  const wait = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt++) {
    try {
      return renameSync(from, to);
    } catch (e) {
      if (attempt >= 20 || !RETRY.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
      Atomics.wait(wait, 0, 0, 10 * (attempt + 1));
    }
  }
}

export type DiskOptions = { log?: (message: string) => void };

export class Disk {
  readonly file: string;
  bom: boolean;
  private authority: Authority;
  private known = '';
  private written: string;
  // the texts written or read lately, newest last, as the candidate bases of a change of the file
  private ring: { n: number; text: string }[] = [];
  private firstUnwritten: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poller: ReturnType<typeof setInterval> | null = null;
  private busy: Promise<void> | null = null;
  private stopped = false;
  private log: (message: string) => void;

  constructor(file: string, authority: Authority, bom: boolean, options: DiskOptions = {}) {
    this.file = file;
    this.authority = authority;
    this.bom = bom;
    this.written = authority.text;
    this.log = options.log ?? (() => {});
    this.remember(authority.n, authority.text);
    try {
      this.known = signature(statSync(file));
    } catch {}
    authority.observe(() => this.schedule());
  }

  start(): void {
    this.poller = setInterval(() => void this.exclusive(() => this.check()), POLL);
  }

  // an operation was applied: the file is written after 250 ms of quiet, and at the latest 1 s
  // after the first operation that is not written
  schedule(): void {
    if (this.stopped) return;
    const now = Date.now();
    this.firstUnwritten ??= now;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(QUIET, this.firstUnwritten + LATEST - now));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.exclusive(() => this.write());
    }, wait);
  }

  // the text of the authority written at once, at a stop of the edit command
  stopSync(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.poller) clearInterval(this.poller);
    if (this.authority.text === this.written) return;
    const tmp = this.tmpName();
    try {
      writeFileSync(tmp, encode(this.authority.text, this.bom));
      renameRetriedSync(tmp, this.file);
      this.written = this.authority.text;
    } catch (e) {
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
      try {
        unlinkSync(tmp);
      } catch {}
    }
  }

  // resolves once a write or a check in progress is over
  async idle(): Promise<void> {
    while (this.busy) await this.busy;
  }

  private async exclusive(task: () => Promise<void>): Promise<void> {
    while (this.busy) await this.busy;
    if (this.stopped) return;
    const run = task().catch((e) => this.log(String(e?.message ?? e)));
    this.busy = run.finally(() => {
      this.busy = null;
    });
    await this.busy;
  }

  private tmpName(): string {
    return join(dirname(this.file), `.${basename(this.file)}.${randomBytes(6).toString('hex')}.tmp`);
  }

  private remember(n: number, text: string): void {
    if (this.ring.length && this.ring[this.ring.length - 1].text === text) return;
    this.ring.push({ n, text });
    let chars = this.ring.reduce((s, e) => s + e.text.length, 0);
    while (this.ring.length > 1 && (this.ring.length > RING_TEXTS || chars > RING_CHARS)) chars -= this.ring.shift()!.text.length;
  }

  private async write(): Promise<void> {
    this.firstUnwritten = null;
    // a change of the file since the last write is merged first, so that it is not overwritten
    await this.check();
    const text = this.authority.text, n = this.authority.n;
    if (text === this.written) return;
    const tmp = this.tmpName();
    try {
      await writeFile(tmp, encode(text, this.bom));
      await renameRetried(tmp, this.file);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      this.log(`could not write ${this.file}, trying again: ${(e as Error).message}`);
      this.schedule();
      return;
    }
    this.written = text;
    this.known = signature(await stat(this.file));
    this.remember(n, text);
  }

  // a change of the file that the edit command did not write
  private async check(): Promise<void> {
    let info: Stats;
    try {
      info = await stat(this.file);
    } catch {
      return;
    }
    if (signature(info) === this.known) return;
    // the file is read until two reads agree, since a program may be writing it
    let bytes = await readFile(this.file);
    for (let i = 0; i < 20; i++) {
      await sleep(20);
      const again = await readFile(this.file);
      if (again.equals(bytes)) break;
      bytes = again;
    }
    const sig = signature(await stat(this.file));
    let read: { text: string; bom: boolean };
    try {
      read = decode(bytes);
    } catch {
      this.log(`${this.file} was changed into a file that is not valid UTF-8, and the change is left out`);
      this.known = sig;
      return;
    }
    this.known = sig;
    this.bom = read.bom;
    this.merge(read.text);
    this.written = read.text;
    if (this.authority.text !== read.text) this.schedule();
  }

  // the text now on disk, written by another program from a text that it read some time before
  merge(theirs: string): void {
    const current = this.authority.text;
    if (theirs === current) return;
    let base: string | null = null, best = Infinity;
    for (let i = this.ring.length - 1; i >= 0; i--) {
      const text = this.ring[i].text;
      const found = text === theirs ? [] : changes(text, theirs);
      if (found && size(found) < best) {
        best = size(found);
        base = text;
      }
    }
    let merged: string;
    if (base === null) {
      merged = theirs;
    } else {
      const file = diff(base, theirs);
      const session = diff(base, current);
      merged = apply(base, mergePatches(session, file, 'ours').patches);
    }
    const patches = diff(current, merged);
    if (patches.length) this.authority.enter(patches, AUTHOR);
    this.remember(this.authority.n, theirs);
  }
}

// the text of index.html at a start, or an error that says why it cannot be read
export function readText(file: string): { text: string; bom: boolean } {
  return decode(readFileSync(file));
}
