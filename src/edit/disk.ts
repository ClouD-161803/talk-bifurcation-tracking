// index.html on disk as one more replica of a session. the text of the authority is written at
// most once per 250 ms of quiet and at the latest 1 s after the first unwritten operation, by a
// temporary file in the same folder and a rename over the file. a change that the edit command did
// not write itself is found by a stat every 500 ms, and merged as an operation of the author file,
// on the base of the text written lately that is nearest to it, where the file wins a conflict

import { readFileSync, renameSync, statSync, unlinkSync, writeFileSync, type Stats } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isUtf8 } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { changes } from '../editor/merge.ts';
import type { Authority } from '../session/authority.ts';
import { apply, diff, mergePatches, size } from '../session/patch.ts';

export const AUTHOR = 'file';
const QUIET = 250;
const LATEST = 1000;
const POLL = 500;
// a file that looks partly written is taken once it has not changed for 2 s, or 5 s when it is
// empty, and at a stop the wait ends after 7 s
const SETTLE = 2000;
const SETTLE_EMPTY = 5000;
const SETTLE_AT_STOP = 7000;
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

// the change time is left out, since a rename changes it on some systems
const signature = (s: Stats) => `${s.size}:${s.mtimeMs}:${s.ino}`;

const RETRY = new Set(['EPERM', 'EBUSY', 'EACCES']);

// a rename over a file that another program may hold open for a moment, as on Windows, for the
// other files of .session/
export async function renameRetried(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (e) {
      if (attempt >= 20 || !RETRY.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
      await new Promise((done) => setTimeout(done, 10 * (attempt + 1)));
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

// a step of a task of the disk, i.e. a stat, a read, or a write of a file, or a pause. a task is a
// generator of its steps, hence it runs asynchronously while the edit command runs, and at once at
// a stop
type Step = { stat: string } | { read: string } | { write: string; bytes: Buffer } | { sleep: number };
type Task<T = void> = Generator<Step, T, any>;

const missing = (e: NodeJS.ErrnoException) => {
  if (e.code === 'ENOENT') return null;
  throw e;
};

function perform(step: Step): Promise<unknown> {
  if ('sleep' in step) return new Promise((done) => setTimeout(done, step.sleep));
  if ('stat' in step) return stat(step.stat).catch(missing);
  if ('read' in step) return readFile(step.read);
  return writeFile(step.write, step.bytes);
}

const PAUSE = new Int32Array(new SharedArrayBuffer(4));

function performSync(step: Step): unknown {
  if ('sleep' in step) return void Atomics.wait(PAUSE, 0, 0, step.sleep);
  if ('stat' in step) return statSync(step.stat, { throwIfNoEntry: false }) ?? null;
  if ('read' in step) return readFileSync(step.read);
  return writeFileSync(step.write, step.bytes);
}

// a task run at once, as at a stop
function finish(task: Task<unknown>): void {
  let next = task.next();
  while (!next.done) {
    let value: unknown, failed = false;
    try {
      value = performSync(next.value);
    } catch (e) {
      [value, failed] = [e, true];
    }
    next = failed ? task.throw(value) : task.next(value);
  }
}

function removeQuietly(file: string): void {
  try {
    unlinkSync(file);
  } catch {}
}

// quiet, latest, and poll are the times of the writes and the checks in ms, shorter in the tests
export type DiskOptions = { log?: (message: string) => void; quiet?: number; latest?: number; poll?: number };

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
  private timing: { quiet: number; latest: number; poll: number };

  constructor(file: string, authority: Authority, bom: boolean, options: DiskOptions = {}) {
    this.file = file;
    this.authority = authority;
    this.bom = bom;
    this.written = authority.text;
    this.log = options.log ?? (() => {});
    this.timing = { quiet: options.quiet ?? QUIET, latest: options.latest ?? LATEST, poll: options.poll ?? POLL };
    this.remember(authority.n, authority.text);
    try {
      this.known = signature(statSync(file));
    } catch {}
    authority.observe(() => this.schedule());
  }

  start(): void {
    this.poller = setInterval(() => void this.exclusive(() => this.check(Infinity)), this.timing.poll);
  }

  // an operation was applied: the file is written after 250 ms of quiet, and at the latest 1 s
  // after the first operation that is not written
  schedule(): void {
    if (this.stopped) return;
    // a monotonic clock, since a step of the wall clock would move the deadline
    const now = performance.now();
    this.firstUnwritten ??= now;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(this.timing.quiet, this.firstUnwritten + this.timing.latest - now));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.exclusive(() => this.write());
    }, wait);
  }

  // the text of the authority written at once, at a stop of the edit command, after a change of the
  // file is merged. a task in flight is left at its next step, hence its write cannot land after this
  // one
  stopSync(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.poller) clearInterval(this.poller);
    finish(this.write(SETTLE_AT_STOP));
  }

  // resolves once a write or a check in progress is over
  async idle(): Promise<void> {
    while (this.busy) await this.busy;
  }

  private async exclusive(task: () => Task<unknown>): Promise<void> {
    while (this.busy) await this.busy;
    if (this.stopped) return;
    const run = this.drive(task()).catch((e) => this.log(String(e?.message ?? e)));
    this.busy = run.finally(() => {
      this.busy = null;
    });
    await this.busy;
  }

  // a task run asynchronously, and left at the first step that ends after a stop
  private async drive(task: Task<unknown>): Promise<void> {
    let next = task.next();
    while (!next.done) {
      let value: unknown, failed = false;
      try {
        value = await perform(next.value);
      } catch (e) {
        [value, failed] = [e, true];
      }
      if (this.stopped) return void task.return(undefined);
      next = failed ? task.throw(value) : task.next(value);
    }
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

  private *write(limit = Infinity): Task {
    this.firstUnwritten = null;
    // a change of the file since the last write is merged first, so that it is not overwritten, and
    // so is a change made while the temporary file is written
    for (let tries = 0; tries < 5; tries++) {
      if (!(yield* this.check(limit))) {
        this.log(`${this.file} is still being written by another program, and the edit command does not write it`);
        return;
      }
      if ((yield* this.put()) !== 'changed') return;
    }
    this.schedule();
  }

  // the text of the authority into the file, by a temporary file and a rename, or changed when
  // another program wrote the file in the meantime
  private *put(): Task<'changed' | void> {
    const text = this.authority.text, n = this.authority.n;
    if (text === this.written) return;
    const tmp = this.tmpName();
    let renamed = false, made: Stats;
    try {
      yield { write: tmp, bytes: encode(text, this.bom) };
      // a write after the rename changes the signature of the temporary file
      made = yield { stat: tmp };
      // the rename is done between two steps, i.e. right after the check for a stop, so that a write
      // that began before a stop does not land after it. it is tried again for a moment when another
      // program holds the file open, as on Windows
      for (let attempt = 0; !renamed; attempt++) {
        const now = statSync(this.file, { throwIfNoEntry: false });
        if ((now ? signature(now) : '') !== this.known) return 'changed';
        try {
          renameSync(tmp, this.file);
          renamed = true;
        } catch (e) {
          if (attempt >= 20 || !RETRY.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
          yield { sleep: 10 * (attempt + 1) };
        }
      }
    } catch (e) {
      this.log(`could not write ${this.file}${this.stopped ? '' : ', trying again'}: ${(e as Error).message}`);
      this.schedule();
      return;
    } finally {
      if (!renamed) removeQuietly(tmp);
    }
    this.written = text;
    this.known = signature(made!);
    this.remember(n, text);
  }

  // a change of the file that the edit command did not write, or false when the file was still
  // being written after limit ms
  private *check(limit: number): Task<boolean> {
    const info: Stats | null = yield { stat: this.file };
    // a file that is gone is written again
    if (!info) {
      this.known = '';
      return true;
    }
    // the signature is taken before the read, so that a write after the read is seen at the next check
    let sig = signature(info);
    if (sig === this.known) return true;
    let bytes: Buffer = yield { read: this.file };
    // the file is read until it has not changed for a while, since a program may be writing it: 20 ms
    // for a file that looks complete, and longer for a file that is empty, shorter than half of the
    // text before, or not valid UTF-8, since such a file is often written in steps
    const before = Buffer.byteLength(this.written), started = performance.now();
    let since = started, told = false;
    for (let reads = 0; ; reads++) {
      const wait = bytes.length === 0 ? SETTLE_EMPTY : bytes.length * 2 < before || !isUtf8(bytes) ? SETTLE : 0;
      if (!wait && reads >= 20) break;
      if (wait && !told) {
        this.log(`${this.file} looks partly written, and the edit command waits until it has not changed for ${wait / 1000} s`);
        told = true;
      }
      if (performance.now() - started > limit) return false;
      yield { sleep: wait ? 100 : 20 };
      const now: Stats | null = yield { stat: this.file };
      if (!now) {
        this.known = '';
        return true;
      }
      const again: Buffer = yield { read: this.file };
      if (!again.equals(bytes)) [bytes, sig, since] = [again, signature(now), performance.now()];
      else if (performance.now() - since >= wait) break;
    }
    let read: { text: string; bom: boolean };
    try {
      read = decode(bytes);
    } catch {
      this.log(`${this.file} was changed into a file that is not valid UTF-8, and the change is left out`);
      this.known = sig;
      return true;
    }
    this.known = sig;
    // the bytes of the last write or read, as after a touch of the file
    if (read.text === this.written && read.bom === this.bom) return true;
    this.bom = read.bom;
    this.merge(read.text);
    this.written = read.text;
    if (this.authority.text !== read.text) this.schedule();
    return true;
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
