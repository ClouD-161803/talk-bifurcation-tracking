import { constants, copyFileSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, type Stats } from 'node:fs';
import { open, readFile, realpath, rename, stat } from 'node:fs/promises';
import { isUtf8 } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { changes } from '../editor/merge.ts';
import type { Authority } from '../session/authority.ts';
import { apply, copy, diff, mergePatches, type Patch } from '../session/patch.ts';

export const AUTHOR = 'file';
const QUIET = 250;
const LATEST = 1000;
const POLL = 500;
const STABLE = 300;
const SETTLE = 2000;
const SETTLE_EMPTY = 5000;
const SETTLE_AT_STOP = 7000;
const CHAIN_TEXTS = 5000;
const CHAIN_BYTES = 64 * 1024 * 1024;
const SLICE = 15;
const BUDGET = 5000;
const MAX_LINES = 2000;
const MAX_EDITS = 1024;
const KEPT_CHARS = 16 * 1024 * 1024;

export class NotUtf8 extends Error {}

export function decode(bytes: Buffer): { text: string; bom: boolean } {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new NotUtf8('the file is not valid UTF-8');
  return text.charCodeAt(0) === 0xfeff ? { text: text.slice(1), bom: true } : { text, bom: false };
}

const encode = (text: string, bom: boolean) => Buffer.from(bom ? `﻿${text}` : text, 'utf8');

const endsHtml = (text: string | Buffer) => /<\/html>\s*$/i.test(typeof text === 'string' ? text.slice(-256) : text.subarray(-256).toString('latin1'));

export const hasConflict = (text: string) => /^<{7}(?: |\r?$)/m.test(text) && /^={7}\r?$/m.test(text) && /^>{7}(?: |\r?$)/m.test(text);
const CONFLICT = 'index.html holds the conflict markers of git. The session keeps the last text without them, and takes the file again once they are resolved';

export const signature = (s: Stats) => `${s.size}:${s.mtimeMs}:${s.ino}`;

const modeOf = (s: Stats) => (process.platform === 'win32' ? null : s.mode & 0o7777);

const RETRY = new Set(['EPERM', 'EBUSY', 'EACCES']);

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

export function renameRetriedSync(from: string, to: string, tries = 21): void {
  const wait = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt++) {
    try {
      return renameSync(from, to);
    } catch (e) {
      if (attempt + 1 >= tries || !RETRY.has((e as NodeJS.ErrnoException).code ?? '')) throw e;
      Atomics.wait(wait, 0, 0, 10 * (attempt + 1));
    }
  }
}

export function setAsideSync(file: string, aside: string, move = true): boolean {
  if (move) {
    try {
      renameRetriedSync(file, aside);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return true;
    }
  }
  try {
    copyFileSync(file, aside, constants.COPYFILE_EXCL);
    return true;
  } catch {
    return false;
  }
}

type Step = { stat: string } | { resolve: string } | { read: string } | { write: string; bytes: Buffer; mode: number | null } | { syncFolder: string } | { sleep: number };
type Task<T = void> = Generator<Step, T, any>;

const missing = (e: NodeJS.ErrnoException) => {
  if (e.code === 'ENOENT') return null;
  throw e;
};

function perform(step: Step): Promise<unknown> {
  if ('sleep' in step) return new Promise((done) => setTimeout(done, step.sleep));
  if ('stat' in step) return stat(step.stat).catch(missing);
  if ('resolve' in step) return realpath(step.resolve).catch(() => step.resolve);
  if ('read' in step) return readFile(step.read);
  if ('syncFolder' in step) return syncFolder(step.syncFolder);
  return writeSynced(step.write, step.bytes, step.mode);
}

async function writeSynced(file: string, bytes: Buffer, mode: number | null): Promise<void> {
  const handle = await open(file, 'w');
  try {
    await handle.writeFile(bytes);
    if (mode !== null) await handle.chmod(mode);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncFolder(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
  try {
    const handle = await open(dir, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {}
}

const weight = (delta: Patch[]) => delta.reduce((n, p) => n + 2 * p.text.length + 32, 0);

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

type Rank = { lines: number; chars: number; steps: number };
const order = (r: Rank, s: Rank) => r.lines - s.lines || r.chars - s.chars || r.steps - s.steps;

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
    rows.push(v.slice(off - d, off + d + 1));
  }
  if (found < 0) return null;
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
    if (r.a0 === r.a1 || r.b0 === r.b1) {
      chars += old.length + now.length + 1;
      continue;
    }
    chars += edits(old, now);
  }
  return { lines: found, chars };
}

function edits(old: string, now: string): number {
  let p = 0;
  while (p < old.length && p < now.length && old.charCodeAt(p) === now.charCodeAt(p)) p++;
  let s = 0;
  while (s < old.length - p && s < now.length - p && old.charCodeAt(old.length - 1 - s) === now.charCodeAt(now.length - 1 - s)) s++;
  const n = old.length - p - s, m = now.length - p - s;
  if (n === 0 || m === 0) return n + m;
  const max = Math.min(n + m, MAX_EDITS), off = max + 1, v = new Int32Array(2 * max + 3);
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && old.charCodeAt(p + x) === now.charCodeAt(p + y)) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return d;
    }
  }
  return n + m;
}

function removeQuietly(file: string): void {
  try {
    unlinkSync(file);
  } catch {}
}

export type WriteError = { message: string; unwritten: number };

export type DiskOptions = {
  log?: (message: string) => void;
  onWriteError?: (error: WriteError | null) => void;
  onWritten?: (n: number, text: string) => void;
  onPoll?: () => void;
  quiet?: number;
  latest?: number;
  poll?: number;
  stable?: number;
  partial?: number;
  budget?: number;
};

export class Disk {
  readonly file: string;
  private target: string;
  private mode: number | null = null;
  bom: boolean;
  private authority: Authority;
  private known = '';
  private written: string;
  private taken: string | null = null;
  private conflict: string | null = null;
  private writtenN: number;
  private failures = 0;
  private retryAt = 0;
  private head: string;
  private back: Patch[][] = [];
  private backBytes = 0;
  private reach = 0;
  private firstUnwritten: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poller: ReturnType<typeof setInterval> | null = null;
  private busy: Promise<void> | null = null;
  private stopped = false;
  private stopping: Promise<number> | null = null;
  private log: (message: string) => void;
  private onWriteError: (error: WriteError | null) => void;
  private onWritten: (n: number, text: string) => void;
  private onPoll: () => void;
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
    this.onPoll = options.onPoll ?? (() => {});
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
    const dir = dirname(this.target), prefix = `.${basename(this.target)}.`;
    try {
      for (const name of readdirSync(dir)) {
        if (name.startsWith(prefix) && /^[0-9a-f]{12}\.tmp$/.test(name.slice(prefix.length))) removeQuietly(join(dir, name));
      }
    } catch {}
    authority.observe(() => this.schedule());
  }

  start(): void {
    this.poller = setInterval(() => {
      void this.exclusive(() => this.check(Infinity));
      this.onPoll();
    }, this.timing.poll);
  }

  schedule(): void {
    if (this.stopped) return;
    const now = performance.now();
    this.firstUnwritten ??= now;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(this.timing.quiet, this.firstUnwritten + this.timing.latest - now), this.retryAt - now);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.exclusive(() => this.write());
    }, wait);
  }

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
    this.reach++;
    this.head = text;
    while (this.back.length > CHAIN_TEXTS || this.backBytes > CHAIN_BYTES) this.backBytes -= weight(this.back.shift()!);
  }

  private *write(limit = Infinity): Task {
    this.firstUnwritten = null;
    for (let tries = 0; tries < 5; tries++) {
      if (!(yield* this.check(limit))) {
        this.log(`${this.file} is still being written by another program, and the edit command does not write it`);
        return;
      }
      if ((yield* this.put()) !== 'changed') return;
    }
    this.schedule();
  }

  private *put(): Task<'changed' | void> {
    const text = this.authority.text, n = this.authority.n;
    if (this.conflict) return;
    if (text === this.written) {
      this.writtenN = n;
      this.onWritten(n, text);
      return;
    }
    const tmp = this.tmpName();
    let renamed = false, made: Stats;
    try {
      yield { write: tmp, bytes: encode(text, this.bom), mode: this.mode };
      made = yield { stat: tmp };
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
    this.onWritten(n, text);
    this.known = signature(made!);
    this.remember(text);
    if (this.failures) {
      this.failures = 0;
      this.retryAt = 0;
      this.onWriteError(null);
    }
    yield { syncFolder: dirname(this.target) };
  }

  private *check(limit: number): Task<boolean> {
    const target: string = yield { resolve: this.file };
    if (target !== this.target) [this.target, this.known] = [target, ''];
    const info: Stats | null = yield { stat: this.target };
    if (!info) {
      this.known = '';
      return true;
    }
    this.mode = modeOf(info);
    let sig = signature(info);
    if (sig === this.known) return true;
    let bytes: Buffer = yield { read: this.target };
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
    if (hasConflict(read.text) && !hasConflict(this.written)) {
      if (this.conflict === null) this.log(`${this.file} holds the conflict markers of git, hence it is not taken, and the edits of the session are written into it once the markers are gone`);
      this.conflict = this.known = sig;
      this.onWriteError({ message: CONFLICT, unwritten: this.authority.n - this.writtenN });
      return true;
    }
    if (this.conflict !== null) {
      this.conflict = null;
      if (!this.failures) this.onWriteError(null);
    }
    if (read.text === this.written && read.bom === this.bom) {
      this.known = sig;
      return true;
    }
    yield* this.merge(read.text);
    this.known = sig;
    this.bom = read.bom;
    this.written = this.taken = read.text;
    if (this.authority.text === read.text) this.onWritten((this.writtenN = this.authority.n), read.text);
    else this.schedule();
    return true;
  }

  private *merge(theirs: string): Task {
    if (theirs !== this.authority.text) {
      const base = this.taken !== null && theirs.startsWith(this.taken) ? this.taken : yield* this.nearest(theirs);
      if (base === theirs) this.log(`${this.file} was written with an earlier text of the session, and the edit command keeps the newer edits and writes them back`);
      const current = this.authority.text;
      const file = diff(base, theirs);
      const session = diff(base, current);
      const merged = apply(base, mergePatches(session, file, 'ours').patches);
      const patches = diff(current, merged);
      if (patches.length) this.authority.enter(patches, AUTHOR);
    }
    this.remember(theirs);
    this.reach = 0;
  }

  private *nearest(theirs: string): Task<string> {
    const back = this.back, budget = this.timing.budget, reach = Math.min(this.reach, back.length);
    let slice = performance.now();
    const deadline = slice + budget;
    function* breathe(): Task {
      if (performance.now() - slice < SLICE) return;
      yield { sleep: 0 };
      slice = performance.now();
    }
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
    const every = Math.max(1, Math.ceil((reach * Math.max(1, length)) / KEPT_CHARS));
    const kept = new Map<number, string[]>();
    const bounds: Rank[] = [];
    type Candidate = { rank: Rank; lines: string[] };
    let best: Candidate | null = null, over = false;
    const better = (current: Candidate | null, steps: number, at: string[]): Candidate | null => {
      const size = measure(at, mine, Math.min(current?.rank.lines ?? MAX_LINES, MAX_LINES));
      const rank = size && { ...size, steps };
      return rank && (!current || order(rank, current.rank) < 0) ? { rank, lines: at } : current;
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
      if (steps === 0) best = better(best, 0, lines);
      if (steps === reach) break;
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
      if (bound.steps) best = better(best, bound.steps, yield* rebuild(bound.steps));
      yield* breathe();
      over = performance.now() >= deadline;
    }
    if (over) this.log(`the search for the text that another program changed into ${this.file} was cut after ${budget / 1000} s, and the change is merged on the nearest text found by then`);
    if (best) return best.lines.join('\n');
    return (yield* rebuild(bounds[0].steps)).join('\n');
  }
}

export function readText(file: string): { text: string; bom: boolean } {
  return decode(readFileSync(file));
}
