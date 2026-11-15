// index.html on disk as one more replica of a session. the text of the authority is written at
// most once per 250 ms of quiet and at the latest 1 s after the first unwritten operation, by a
// temporary file next to the file and a rename over it, and at once at a stop. a change that the
// edit command did not write itself is found by a stat every 500 ms and before each write, and
// merged as an operation of the author file, on the base of the text written or read lately that is
// nearest to it, where the file wins a conflict. the reads and the writes are done one at a time

import { chmodSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync, type Stats } from 'node:fs';
import { chmod, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isUtf8 } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { changes } from '../editor/merge.ts';
import type { Authority } from '../session/authority.ts';
import { apply, diff, mergePatches, size, type Patch } from '../session/patch.ts';

export const AUTHOR = 'file';
const QUIET = 250;
const LATEST = 1000;
const POLL = 500;
// a file that looks partly written is taken once it has not changed for 2 s, or 5 s when it is
// empty, and at a stop the wait ends after 7 s
const SETTLE = 2000;
const SETTLE_EMPTY = 5000;
const SETTLE_AT_STOP = 7000;
// the chain of the texts written or read keeps the last 5000 of them, and at most 64 MB of the
// patches that lead back to them
const CHAIN_TEXTS = 5000;
const CHAIN_BYTES = 64 * 1024 * 1024;
// the texts of the chain that are nearest to a change of the file by the count of their lines, and
// that are compared by a diff
const NEAREST = 8;

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

// the mode of a file, given to the temporary file that replaces it. a file on Windows has no mode
// but the read-only flag, and a read-only file is not replaced by a rename there anyway
const modeOf = (s: Stats) => (process.platform === 'win32' ? null : s.mode & 0o7777);

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
type Step = { stat: string } | { read: string } | { write: string; bytes: Buffer; mode: number | null } | { sleep: number };
type Task<T = void> = Generator<Step, T, any>;

const missing = (e: NodeJS.ErrnoException) => {
  if (e.code === 'ENOENT') return null;
  throw e;
};

function perform(step: Step): Promise<unknown> {
  if ('sleep' in step) return new Promise((done) => setTimeout(done, step.sleep));
  if ('stat' in step) return stat(step.stat).catch(missing);
  if ('read' in step) return readFile(step.read);
  return writeFile(step.write, step.bytes).then(() => (step.mode === null ? undefined : chmod(step.write, step.mode)));
}

const PAUSE = new Int32Array(new SharedArrayBuffer(4));

function performSync(step: Step): unknown {
  if ('sleep' in step) return void Atomics.wait(PAUSE, 0, 0, step.sleep);
  if ('stat' in step) return statSync(step.stat, { throwIfNoEntry: false }) ?? null;
  if ('read' in step) return readFileSync(step.read);
  writeFileSync(step.write, step.bytes);
  if (step.mode !== null) chmodSync(step.write, step.mode);
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

// a copy of text, since a slice keeps in memory the whole text that it was cut from
const copy = (text: string) => (text.length < 16 ? text : Buffer.from(text, 'utf16le').toString('utf16le'));
const weight = (delta: Patch[]) => delta.reduce((n, p) => n + 2 * p.text.length + 32, 0);

// the patches that turn text back into before. the common start and end are skipped by chunks, and
// the changes are found on the whole lines between them, so that a small change of a large deck is
// cheap. they are not widened to tokens as in diff(), since only their size matters here
function reverse(text: string, before: string): Patch[] {
  const max = Math.min(text.length, before.length);
  let pre = 0, suf = 0;
  for (let c = 65536; c >= 1; c >>= 4) while (pre + c <= max && text.slice(pre, pre + c) === before.slice(pre, pre + c)) pre += c;
  for (let c = 65536; c >= 1; c >>= 4) {
    while (suf + c <= max - pre && text.slice(text.length - suf - c, text.length - suf) === before.slice(before.length - suf - c, before.length - suf)) suf += c;
  }
  const from = pre === 0 ? 0 : text.lastIndexOf('\n', pre - 1) + 1;
  let to = text.indexOf('\n', text.length - suf);
  if (to < 0) to = text.length;
  const found = changes(text.slice(from, to), before.slice(from, before.length - text.length + to)) ?? [
    { start: pre - from, end: text.length - suf - from, text: before.slice(pre, before.length - suf) },
  ];
  return found.map((p) => ({ start: p.start + from, end: p.end + from, text: copy(p.text) }));
}

// the lines of a text turned back by a delta of the chain. count is told the lines that the delta
// removes and adds
function stepBack(lines: string[], delta: Patch[], count?: (lines: string[], by: number) => void): string[] {
  const starts = new Array<number>(lines.length);
  for (let i = 0, at = 0; i < lines.length; i++) {
    starts[i] = at;
    at += lines[i].length + 1;
  }
  const lineOf = (at: number) => {
    let lo = 0, hi = lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const out: string[] = [];
  let next = 0;
  // the patches that touch a common line are applied together, to the lines that they touch
  for (let j = 0; j < delta.length; ) {
    const a = lineOf(delta[j].start);
    let k = j, b = lineOf(delta[j].end);
    while (k + 1 < delta.length && lineOf(delta[k + 1].start) <= b) b = lineOf(delta[++k].end);
    const old = lines.slice(a, b + 1), segment = old.join('\n'), at = starts[a];
    let changed = segment.slice(0, delta[j].start - at);
    for (let m = j; m <= k; m++) changed += delta[m].text + segment.slice(delta[m].end - at, m < k ? delta[m + 1].start - at : segment.length);
    const now = changed.split('\n');
    count?.(old, -1);
    count?.(now, 1);
    for (let i = next; i < a; i++) out.push(lines[i]);
    for (const line of now) out.push(line);
    next = b + 1;
    j = k + 1;
  }
  for (let i = next; i < lines.length; i++) out.push(lines[i]);
  return out;
}

function removeQuietly(file: string): void {
  try {
    unlinkSync(file);
  } catch {}
}

// a write that failed, with the number of operations that are not in the file
export type WriteError = { message: string; unwritten: number };

// onWriteError is called at each failed write, and with null at the first write that succeeds after
// one failed. quiet, latest, and poll are the times of the writes and the checks in ms, shorter in
// the tests
export type DiskOptions = {
  log?: (message: string) => void;
  onWriteError?: (error: WriteError | null) => void;
  quiet?: number;
  latest?: number;
  poll?: number;
};

export class Disk {
  readonly file: string;
  // the file that is written, i.e. the target of file when it is a symbolic link, so that the link
  // is kept, and its mode
  private target: string;
  private mode: number | null = null;
  bom: boolean;
  private authority: Authority;
  private known = '';
  private written: string;
  // the number of operations of the authority in the text written or read last
  private writtenN: number;
  // the failed writes in a row, and the time before which a failed write is not tried again
  private failures = 0;
  private retryAt = 0;
  // the newest text written or read, and a chain of the patches that turn each text written or read
  // before it back into the one before, newest last. these texts are the candidate bases of a change
  // of the file
  private head: string;
  private back: Patch[][] = [];
  private backBytes = 0;
  private firstUnwritten: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poller: ReturnType<typeof setInterval> | null = null;
  private busy: Promise<void> | null = null;
  private stopped = false;
  private log: (message: string) => void;
  private onWriteError: (error: WriteError | null) => void;
  private timing: { quiet: number; latest: number; poll: number };

  constructor(file: string, authority: Authority, bom: boolean, options: DiskOptions = {}) {
    this.file = file;
    this.authority = authority;
    this.bom = bom;
    this.written = authority.text;
    this.writtenN = authority.n;
    this.log = options.log ?? (() => {});
    this.onWriteError = options.onWriteError ?? (() => {});
    this.timing = { quiet: options.quiet ?? QUIET, latest: options.latest ?? LATEST, poll: options.poll ?? POLL };
    this.head = authority.text;
    try {
      this.target = realpathSync(file);
    } catch {
      this.target = file;
    }
    try {
      const info = statSync(this.target);
      this.known = signature(info);
      this.mode = modeOf(info);
    } catch {}
    // a temporary file left by an edit command that was killed during a write
    const dir = dirname(this.target), prefix = `.${basename(this.target)}.`;
    try {
      for (const name of readdirSync(dir)) {
        if (name.startsWith(prefix) && /^[0-9a-f]{12}\.tmp$/.test(name.slice(prefix.length))) removeQuietly(join(dir, name));
      }
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
    const wait = Math.max(0, Math.min(this.timing.quiet, this.firstUnwritten + this.timing.latest - now), this.retryAt - now);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.exclusive(() => this.write());
    }, wait);
  }

  // the text of the authority written at once, at a stop of the edit command, after a change of the
  // file is merged, and the number of operations that are not in the file. a task in flight is left
  // at its next step, hence its write cannot land after this one
  stopSync(): number {
    if (!this.stopped) {
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
      if (this.poller) clearInterval(this.poller);
      finish(this.write(SETTLE_AT_STOP));
      const unwritten = this.authority.n - this.writtenN;
      if (unwritten) this.log(`${unwritten} operations are not written into ${this.file}`);
    }
    return this.authority.n - this.writtenN;
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
    return join(dirname(this.target), `.${basename(this.target)}.${randomBytes(6).toString('hex')}.tmp`);
  }

  private remember(text: string): void {
    if (text === this.head) return;
    const delta = reverse(text, this.head);
    this.back.push(delta);
    this.backBytes += weight(delta);
    this.head = text;
    while (this.back.length > CHAIN_TEXTS || this.backBytes > CHAIN_BYTES) this.backBytes -= weight(this.back.shift()!);
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
    if (text === this.written) {
      this.writtenN = n;
      return;
    }
    const tmp = this.tmpName();
    let renamed = false, made: Stats;
    try {
      yield { write: tmp, bytes: encode(text, this.bom), mode: this.mode };
      // a write after the rename changes the signature of the temporary file
      made = yield { stat: tmp };
      // the rename is done between two steps, i.e. right after the check for a stop, so that a write
      // that began before a stop does not land after it. it is tried again for a moment when another
      // program holds the file open, as on Windows
      for (let attempt = 0; !renamed; attempt++) {
        const now = statSync(this.target, { throwIfNoEntry: false });
        if ((now ? signature(now) : '') !== this.known) return 'changed';
        try {
          renameSync(tmp, this.target);
          renamed = true;
        } catch (e) {
          if (attempt >= 20 || !RETRY.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
          yield { sleep: 10 * (attempt + 1) };
        }
      }
    } catch (e) {
      const message = (e as Error).message;
      this.log(`could not write ${this.file}${this.stopped ? '' : ', trying again'}: ${message}`);
      // a write that keeps failing, as on a full disk or in a read-only folder, is tried again at most
      // every 5 s
      this.failures++;
      this.retryAt = performance.now() + Math.min(5000, this.timing.quiet * 2 ** this.failures);
      this.onWriteError({ message, unwritten: this.authority.n - this.writtenN });
      this.schedule();
      return;
    } finally {
      if (!renamed) removeQuietly(tmp);
    }
    this.written = text;
    this.writtenN = n;
    this.known = signature(made!);
    this.remember(text);
    if (this.failures) {
      this.failures = 0;
      this.retryAt = 0;
      this.onWriteError(null);
    }
  }

  // a change of the file that the edit command did not write, or false when the file was still
  // being written after limit ms
  private *check(limit: number): Task<boolean> {
    const info: Stats | null = yield { stat: this.target };
    // a file that is gone is written again
    if (!info) {
      this.known = '';
      return true;
    }
    this.mode = modeOf(info);
    // the signature is taken before the read, so that a write after the read is seen at the next check
    let sig = signature(info);
    if (sig === this.known) return true;
    let bytes: Buffer = yield { read: this.target };
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
      const now: Stats | null = yield { stat: this.target };
      if (!now) {
        this.known = '';
        return true;
      }
      const again: Buffer = yield { read: this.target };
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
    // the bytes of the last write or read, as after a touch of the file
    if (read.text === this.written && read.bom === this.bom) {
      this.known = sig;
      return true;
    }
    // the signature is kept only after the merge, since a stop leaves this task at a step of the merge
    yield* this.merge(read.text);
    this.known = sig;
    this.bom = read.bom;
    this.written = read.text;
    if (this.authority.text === read.text) this.writtenN = this.authority.n;
    else this.schedule();
    return true;
  }

  // the text now on disk, written by another program from a text that it read some time before
  private *merge(theirs: string): Task {
    if (theirs !== this.authority.text) {
      const base = yield* this.nearest(theirs);
      // theirs is an earlier text of the session, as from an editor that saves a copy it did not
      // reload, or from a git checkout. the newer edits of the session are kept and written back,
      // since a stale save must not revert the edits of everyone
      if (base === theirs) this.log(`${this.file} was written with an earlier text of the session, and the edit command keeps the newer edits and writes them back`);
      // the session may have changed while the chain was searched
      const current = this.authority.text;
      const file = diff(base, theirs);
      const session = diff(base, current);
      const merged = apply(base, mergePatches(session, file, 'ours').patches);
      const patches = diff(current, merged);
      if (patches.length) this.authority.enter(patches, AUTHOR);
    }
    this.remember(theirs);
  }

  // the text of the chain that is nearest to theirs. the texts are rebuilt as lines from the newest
  // back, each is measured by the lines that it has more or fewer of than theirs, and the nearest few
  // are compared by a diff. a change based on a text older than the chain is merged on the kept text
  // nearest to it, hence the edits of the session between the two texts are reverted, since the file
  // lacks them
  private *nearest(theirs: string): Task<string> {
    // the count of each line in the text minus its count in theirs, and the distance, i.e. the
    // characters of the lines that are counted more or fewer times
    const counts = new Map<string, number>();
    let distance = 0;
    const count = (lines: string[], by: number) => {
      for (const line of lines) {
        const was = counts.get(line) ?? 0, now = was + by;
        distance += (Math.abs(now) - Math.abs(was)) * (line.length + 1);
        if (now) counts.set(line, now);
        else counts.delete(line);
      }
    };
    let lines = this.head.split('\n');
    count(lines, 1);
    count(theirs.split('\n'), -1);
    // the nearest texts by the count of their lines, as their steps back from the head
    const best: { distance: number; steps: number }[] = [];
    const keep = (steps: number) => {
      let i = best.length;
      while (i > 0 && best[i - 1].distance > distance) i--;
      if (i < NEAREST) best.splice(i, 0, { distance, steps });
      if (best.length > NEAREST) best.pop();
    };
    keep(0);
    for (let steps = 1; steps <= this.back.length; steps++) {
      if (distance === 0 && lines.join('\n') === theirs) return theirs;
      lines = stepBack(lines, this.back[this.back.length - steps], count);
      keep(steps);
      if (steps % 256 === 0) yield { sleep: 0 };
    }
    if (distance === 0 && lines.join('\n') === theirs) return theirs;
    // the nearest few are rebuilt and compared by a diff. a text too far apart for changes() ranks by
    // the count of its lines, and of two equal texts the newer is taken
    let base = '', rank = [Infinity, Infinity];
    lines = this.head.split('\n');
    const farthest = Math.max(...best.map((b) => b.steps));
    for (let steps = 0; steps <= farthest; steps++) {
      if (steps) lines = stepBack(lines, this.back[this.back.length - steps]);
      const candidate = best.find((b) => b.steps === steps);
      if (!candidate) continue;
      const text = lines.join('\n'), found = changes(text, theirs), real = found ? size(found) : Infinity;
      if (real < rank[0] || (real === rank[0] && candidate.distance < rank[1])) [base, rank] = [text, [real, candidate.distance]];
      yield { sleep: 0 };
    }
    return base;
  }
}

// the text of index.html at a start, or an error that says why it cannot be read
export function readText(file: string): { text: string; bom: boolean } {
  return decode(readFileSync(file));
}
