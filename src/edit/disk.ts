// index.html on disk as one more replica of a session. the text of the authority is written at
// most once per 250 ms of quiet and at the latest 1 s after the first unwritten operation, by a
// temporary file next to the file and a rename over it, and at once at a stop. a change that the
// edit command did not write itself is found by a stat every 500 ms and before each write, and
// merged as an operation of the author file, on the base of the text written or read lately that is
// nearest to it, where the file wins a conflict. the reads and the writes are done one at a time

import { readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, type Stats } from 'node:fs';
import { chmod, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isUtf8 } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { changes } from '../editor/merge.ts';
import type { Authority } from '../session/authority.ts';
import { apply, diff, mergePatches, type Patch } from '../session/patch.ts';

export const AUTHOR = 'file';
const QUIET = 250;
const LATEST = 1000;
const POLL = 500;
// a changed file is taken once its size and modification time have not changed for 300 ms, or for
// 2 s when it looks partly written, or 5 s when it is empty, and at a stop the wait ends after 7 s
const STABLE = 300;
const SETTLE = 2000;
const SETTLE_EMPTY = 5000;
const SETTLE_AT_STOP = 7000;
// the chain of the texts written or read keeps the last 5000 of them, and at most 64 MB of the
// patches that lead back to them
const CHAIN_TEXTS = 5000;
const CHAIN_BYTES = 64 * 1024 * 1024;
// the search for the base of a change of the file yields to the event loop after SLICE ms, ends
// after BUDGET ms with the nearest text found so far, and gives up a line diff of more than
// MAX_LINES lines, as changes() does. it keeps the lines of a text of the chain every few steps,
// about KEPT_CHARS characters in all, so that a candidate is rebuilt from a kept text near it
const SLICE = 15;
const BUDGET = 5000;
const MAX_LINES = 2000;
const KEPT_CHARS = 16 * 1024 * 1024;

export class NotUtf8 extends Error {}

// the text of the bytes of a file without a leading byte-order mark, and whether it had one. bytes
// that are not valid UTF-8 are refused rather than replaced
export function decode(bytes: Buffer): { text: string; bom: boolean } {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new NotUtf8('the file is not valid UTF-8');
  return text.charCodeAt(0) === 0xfeff ? { text: text.slice(1), bom: true } : { text, bom: false };
}

const encode = (text: string, bom: boolean) => Buffer.from(bom ? `﻿${text}` : text, 'utf8');

// whether a text ends with the end tag of html and white space, read in its last 256 characters
const endsHtml = (text: string | Buffer) => /<\/html>\s*$/i.test(typeof text === 'string' ? text.slice(-256) : text.subarray(-256).toString('latin1'));

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
// generator of its steps, hence it is left at a step when the edit command stops
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

// the size of a line diff, i.e. the lines removed and added, and the characters that differ
// inside them, and the steps back from the head of the text that it was measured on
type Rank = { lines: number; chars: number; steps: number };
const order = (r: Rank, s: Rank) => r.lines - s.lines || r.chars - s.chars || r.steps - s.steps;

// the size of a line diff of the lines a and b, found with the Myers algorithm. a run of changed
// lines counts the characters between the common start and end of its two sides. null when more
// than cap lines differ
function measure(a: string[], b: string[], cap: number): { lines: number; chars: number } | null {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const n = a.length - pre - suf, m = b.length - pre - suf, max = Math.min(n + m, cap), off = max + 1;
  const v = new Int32Array(2 * max + 3), rows: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[pre + x] === b[pre + y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    // the row of the diagonals -d to d, for the way back
    rows.push(v.slice(off - d, off + d + 1));
  }
  if (found < 0) return null;
  // the way back, one removed or added line per round, joined into runs of changed lines
  const runs: { a0: number; a1: number; b0: number; b1: number }[] = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const row = rows[d - 1], k = x - y;
    const down = k === -d || (k !== d && row[k - 1 + d - 1] < row[k + 1 + d - 1]);
    const pk = down ? k + 1 : k - 1, px = row[pk + d - 1], py = px - pk;
    const ex = down ? px : px + 1, ey = down ? py + 1 : py;
    const later = runs[runs.length - 1];
    if (later && later.a0 === ex && later.b0 === ey) [later.a0, later.b0] = [px, py];
    else runs.push({ a0: px, a1: ex, b0: py, b1: ey });
    [x, y] = [px, py];
  }
  let chars = 0;
  for (const r of runs) {
    const old = a.slice(pre + r.a0, pre + r.a1).join('\n'), now = b.slice(pre + r.b0, pre + r.b1).join('\n');
    // whole lines removed or added count their line breaks
    if (r.a0 === r.a1 || r.b0 === r.b1) {
      chars += old.length + now.length + 1;
      continue;
    }
    let p = 0;
    while (p < old.length && p < now.length && old.charCodeAt(p) === now.charCodeAt(p)) p++;
    let s = 0;
    while (s < old.length - p && s < now.length - p && old.charCodeAt(old.length - 1 - s) === now.charCodeAt(now.length - 1 - s)) s++;
    chars += old.length + now.length - 2 * (p + s);
  }
  return { lines: found, chars };
}

function removeQuietly(file: string): void {
  try {
    unlinkSync(file);
  } catch {}
}

// a write that failed, with the number of operations that are not in the file
export type WriteError = { message: string; unwritten: number };

// onWriteError is called at each failed write, and with null at the first write that succeeds after
// one failed. onWritten is called with n once the file holds the text of version n of the authority.
// quiet, latest, and poll are the times of the writes and the checks in ms, stable and partial the
// times that a changed file must not change before it is taken, when it looks complete and when it
// looks partly written, and budget the time of the search for the base of a change of the file,
// shorter in the tests
export type DiskOptions = {
  log?: (message: string) => void;
  onWriteError?: (error: WriteError | null) => void;
  onWritten?: (n: number) => void;
  quiet?: number;
  latest?: number;
  poll?: number;
  stable?: number;
  partial?: number;
  budget?: number;
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
  // the text last taken from a write of another program
  private taken: string | null = null;
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
  private stopping: Promise<number> | null = null;
  private log: (message: string) => void;
  private onWriteError: (error: WriteError | null) => void;
  private onWritten: (n: number) => void;
  private timing: { quiet: number; latest: number; poll: number; stable: number; partial: number; budget: number };

  constructor(file: string, authority: Authority, bom: boolean, options: DiskOptions = {}) {
    this.file = file;
    this.authority = authority;
    this.bom = bom;
    this.written = authority.text;
    this.writtenN = authority.n;
    this.log = options.log ?? (() => {});
    this.onWriteError = options.onWriteError ?? (() => {});
    this.onWritten = options.onWritten ?? (() => {});
    this.timing = {
      quiet: options.quiet ?? QUIET,
      latest: options.latest ?? LATEST,
      poll: options.poll ?? POLL,
      stable: options.stable ?? STABLE,
      partial: options.partial ?? SETTLE,
      budget: options.budget ?? BUDGET,
    };
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

  // the text of the authority written at a stop of the edit command, after a change of the file is
  // merged, and the number of operations that are not in the file. a task in flight is left at its
  // next step, hence its write cannot land after this one
  stop(): Promise<number> {
    return (this.stopping ??= (async () => {
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
      if (this.poller) clearInterval(this.poller);
      try {
        await this.drive(this.write(SETTLE_AT_STOP), true);
      } catch (e) {
        this.log(`could not write ${this.file}: ${(e as Error).message}`);
      }
      const unwritten = this.authority.n - this.writtenN;
      if (unwritten) this.log(`${unwritten} operations are not written into ${this.file}`);
      return unwritten;
    })());
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

  // a task run asynchronously, and left at the first step that ends after a stop, unless it is the
  // last task, i.e. the one of the stop
  private async drive(task: Task<unknown>, last = false): Promise<void> {
    let next = task.next();
    while (!next.done) {
      let value: unknown, failed = false;
      try {
        value = await perform(next.value);
      } catch (e) {
        [value, failed] = [e, true];
      }
      if (this.stopped && !last) return void task.return(undefined);
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
      this.onWritten(n);
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
    this.onWritten(n);
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
    // the file is taken once its size and modification time have not changed for a while, since a
    // program may be writing it: 300 ms for a file that looks complete, whatever its size, and longer
    // for a file that looks partly written, i.e. empty, shorter than half of the text before, not
    // valid UTF-8, or without the end tag of html that the text before had. a write in steps whose
    // first step looks complete, or whose pause is longer, is taken in parts, and a change of the
    // same size within the resolution of the modification time is seen only by the read at the end
    const { stable, partial } = this.timing;
    const before = Buffer.byteLength(this.written), ended = endsHtml(this.written), started = performance.now();
    let since = started, told = false;
    for (;;) {
      const wait = bytes.length === 0 ? SETTLE_EMPTY : bytes.length * 2 < before || !isUtf8(bytes) || (ended && !endsHtml(bytes)) ? partial : stable;
      if (wait > stable && !told) {
        this.log(`${this.file} looks partly written, and the edit command waits until it has not changed for ${wait / 1000} s`);
        told = true;
      }
      if (performance.now() - started > limit) return false;
      yield { sleep: Math.min(100, Math.ceil(wait / 3)) };
      const now: Stats | null = yield { stat: this.target };
      if (!now) {
        this.known = '';
        return true;
      }
      if (signature(now) !== sig) {
        [sig, since] = [signature(now), performance.now()];
        bytes = yield { read: this.target };
      } else if (performance.now() - since >= wait) {
        const again: Buffer = yield { read: this.target };
        if (again.equals(bytes)) break;
        [bytes, since] = [again, performance.now()];
      }
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
    this.written = this.taken = read.text;
    if (this.authority.text === read.text) this.onWritten((this.writtenN = this.authority.n));
    else this.schedule();
    return true;
  }

  // the text now on disk, written by another program from a text that it read some time before
  private *merge(theirs: string): Task {
    if (theirs !== this.authority.text) {
      // the rest of a write in two steps whose first step was taken, i.e. a text that extends the one
      // last taken, is merged on it, since its tail is not in any text of the chain. a rest written
      // into a handle on a file that a write of the edit command has replaced is not in the file
      const base = this.taken !== null && theirs.startsWith(this.taken) ? this.taken : yield* this.nearest(theirs);
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

  // the text of the chain nearest to theirs, i.e. with the smallest line diff to it, then with the
  // fewest characters changed inside the changed lines, then the newest. the texts are rebuilt as
  // lines from the head back, and each gets a lower bound of its rank: the lines that it has more or
  // fewer of than theirs, and the difference of the lengths. the texts are then measured in the order
  // of their bounds, until the bound of the next is above the best rank found. a change based on a
  // text older than the chain is merged on the kept text nearest to it, hence the edits of the
  // session between the two texts are reverted, since the file lacks them
  private *nearest(theirs: string): Task<string> {
    const back = this.back, budget = this.timing.budget;
    let slice = performance.now();
    const deadline = slice + budget;
    function* breathe(): Task {
      if (performance.now() - slice < SLICE) return;
      yield { sleep: 0 };
      slice = performance.now();
    }
    // the count of each line in the text minus its count in theirs, and the lines counted more or
    // fewer times
    const counts = new Map<string, number>();
    let distance = 0;
    const count = (lines: string[], by: number) => {
      for (const line of lines) {
        const was = counts.get(line) ?? 0, now = was + by;
        distance += Math.abs(now) - Math.abs(was);
        if (now) counts.set(line, now);
        else counts.delete(line);
      }
    };
    const mine = theirs.split('\n');
    let lines = this.head.split('\n'), length = this.head.length;
    count(lines, 1);
    count(mine, -1);
    const every = Math.max(1, Math.ceil((back.length * Math.max(1, length)) / KEPT_CHARS));
    const kept = new Map<number, string[]>();
    const bounds: Rank[] = [];
    // a cast, since the narrowing of typescript does not see the assignments in consider()
    let best = null as { rank: Rank; lines: string[] } | null, over = false;
    const consider = (steps: number, at: string[]) => {
      const size = measure(at, mine, Math.min(best?.rank.lines ?? MAX_LINES, MAX_LINES));
      const rank = size && { ...size, steps };
      if (rank && (!best || order(rank, best.rank) < 0)) best = { rank, lines: at };
    };
    for (let steps = 0; ; steps++) {
      if (steps) {
        const delta = back[back.length - steps];
        lines = stepBack(lines, delta, count);
        for (const p of delta) length += p.text.length - (p.end - p.start);
      }
      if (distance === 0 && length === theirs.length && lines.join('\n') === theirs) return theirs;
      bounds.push({ lines: distance, chars: Math.abs(length - theirs.length), steps });
      if (steps % every === 0) kept.set(steps, lines);
      // the head is measured first, so that a search cut short by the budget has a base
      if (steps === 0) consider(0, lines);
      if (steps === back.length) break;
      yield* breathe();
      if ((over = performance.now() >= deadline)) break;
    }
    function* rebuild(steps: number): Task<string[]> {
      const from = steps - (steps % every);
      let at = kept.get(from)!;
      for (let s = from + 1; s <= steps; s++) {
        at = stepBack(at, back[back.length - s]);
        yield* breathe();
      }
      return at;
    }
    bounds.sort(order);
    for (const bound of bounds) {
      if (over || (best && order(bound, best.rank) > 0) || bound.lines > MAX_LINES) break;
      if (bound.steps) consider(bound.steps, yield* rebuild(bound.steps));
      yield* breathe();
      over = performance.now() >= deadline;
    }
    // the search does not cover a chain whose texts are all near theirs by their bounds, e.g. after
    // thousands of moves of slides, on a slow machine
    if (over) this.log(`the search for the text that another program changed into ${this.file} was cut after ${budget / 1000} s, and the change is merged on the nearest text found by then`);
    if (best) return best.lines.join('\n');
    // every text is too far from theirs for a line diff, and the one with the smallest bound is taken
    return (yield* rebuild(bounds[0].steps)).join('\n');
  }
}

// the text of index.html at a start, or an error that says why it cannot be read
export function readText(file: string): { text: string; bom: boolean } {
  return decode(readFileSync(file));
}
