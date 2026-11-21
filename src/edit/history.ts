import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Authority } from '../session/authority.ts';
import { apply, applyEach, byWords, diff, unsliced } from '../session/patch.ts';
import { parseVersion, shown, VERSION_NAME_MAX, type AsideInfo, type AppliedOp, type HistoryAnswer, type Mark, type Patch, type Removal, type Restored, type VersionDetail, type VersionInfo } from '../session/protocol.ts';
import { slideChanges, slidesOf, type Slide } from '../session/slides.ts';
import { AUTHOR, setAsideSync, renameRetriedSync } from './disk.ts';

export type HistoryOptions = {
  quiet?: number;
  longest?: number;
  maxBytes?: number;
  keep?: number;
  asideBytes?: number;
  asideFiles?: number;
  asideTotal?: number;
  checkpointBytes?: number;
  now?: () => number;
  clock?: () => number;
  log?: (message: string) => void;
};

type Version = VersionInfo & { patches: Patch[]; marks: Mark[] };

type Open = { first: number; last: number; since: number; time: number; authors: Set<string>; marks: Mark[]; author: string; ops: Patch[] };

type Range = { start: number; end: number };

export const isVersionId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id);
const newId = () => randomBytes(9).toString('base64url');
const ASIDE = /^([0-9]{1,16})\.([A-Za-z0-9_-]{1,40})\.([A-Za-z0-9_-]{1,64})\.html$/;
const STEP = 50;
const REMOVAL_MAX = 4096;
const CHECKPOINTS = 64;

function rangesOf(patches: Patch[]): Range[] {
  let delta = 0;
  return patches.map((p) => {
    const start = p.start + delta;
    delta += p.text.length - (p.end - p.start);
    return { start, end: start + p.text.length };
  });
}

function tidy(marks: Mark[]): Mark[] {
  marks.sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Mark[] = [];
  for (const m of marks) {
    const last = out[out.length - 1];
    if (last && last.author === m.author && m.start <= last.end) last.end = Math.max(last.end, m.end);
    else out.push({ ...m });
  }
  return out;
}

function first(n: number, at: (i: number) => boolean): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function shifter(patches: Patch[]): (offset: number, after: boolean) => number {
  const deltas = [0];
  for (const p of patches) deltas.push(deltas[deltas.length - 1] + p.text.length - (p.end - p.start));
  return (offset, after) => {
    const i = first(patches.length, (k) => {
      const p = patches[k];
      return !(p.end < offset || (p.end === offset && (p.start < p.end || after)));
    });
    return i < patches.length && patches[i].start < offset ? patches[i].start + deltas[i] : offset + deltas[i];
  };
}

export function moveMarks(marks: Mark[], patches: Patch[], author: string): Mark[] {
  if (patches.length === 0) return marks;
  const ranges = rangesOf(patches);
  const written = ranges.filter((r) => r.start < r.end);
  const shift = shifter(patches);
  const out: Mark[] = [];
  for (const m of marks) {
    const start = shift(m.start, true);
    const end = m.start === m.end ? start : Math.max(start, shift(m.end, false));
    if (start === end) {
      const r = written[first(written.length, (k) => written[k].end >= start)];
      if (!r || r.start > start) out.push({ start, end, author: m.author });
      continue;
    }
    let at = start;
    for (let k = first(written.length, (i) => written[i].end > start); k < written.length && written[k].start < end; k++) {
      if (written[k].start > at) out.push({ start: at, end: written[k].start, author: m.author });
      at = Math.max(at, written[k].end);
    }
    if (at < end) out.push({ start: at, end, author: m.author });
  }
  const mine = out.filter((m) => m.author === author).sort((a, b) => a.start - b.start);
  let k = 0;
  let reach = -1;
  for (const r of ranges) {
    if (r.start === r.end) {
      while (k < mine.length && mine[k].start <= r.start) reach = Math.max(reach, mine[k++].end);
      if (reach >= r.start) continue;
    }
    out.push({ start: r.start, end: r.end, author });
    reach = Math.max(reach, r.end);
  }
  return tidy(out);
}

function compose(a: Patch[], b: Patch[]): Patch[] {
  const out: Patch[] = [];
  let i = 0;
  let delta = 0;
  const next = () => {
    const p = a[i++];
    delta += p.text.length - (p.end - p.start);
    return p;
  };
  let [head, unjoinedTail] = ['', ''];
  for (const q of b) {
    while (i < a.length && a[i].start + delta + a[i].text.length < q.start) out.push(next());
    const before = delta;
    let [low, high, pre, post] = [q.start, q.end, '', ''];
    const o = out[out.length - 1];
    if (o && q.start < o.end + delta) {
      out.pop();
      high = o.end + delta;
      [low, high, pre, post] = [o.start + delta, Math.max(high, q.end), head + unjoinedTail.slice(0, unjoinedTail.length - (high - q.start)), unjoinedTail.slice(unjoinedTail.length - (high - q.end))];
    }
    while (i < a.length && a[i].start + delta <= q.end) {
      const at = a[i].start + delta;
      const p = next();
      if (at < low) [low, pre] = [at, p.text.slice(0, q.start - at) + pre];
      if (at + p.text.length > high) [high, post] = [at + p.text.length, post + p.text.slice(q.end - at)];
    }
    [head, unjoinedTail] = [pre + q.text, post];
    if (low - before < high - delta || head || unjoinedTail) out.push({ start: low - before, end: high - delta, text: head + unjoinedTail });
  }
  return out.concat(a.slice(i));
}

function overwrites(marks: Mark[], p: Patch): boolean {
  for (let k = first(marks.length, (i) => marks[i].start > p.end) - 1; k >= 0 && (marks[k].start === marks[k].end || marks[k].end >= p.start); k--) {
    const m = marks[k];
    if (m.author !== AUTHOR && (m.start === m.end ? m.start >= p.start : p.start < p.end && p.start < m.end && m.start < p.end)) return true;
  }
  return false;
}

function touches(marks: Mark[], p: Patch): boolean {
  for (let k = first(marks.length, (i) => marks[i].start > p.end) - 1; k >= 0 && (marks[k].start === marks[k].end || marks[k].end >= p.start); k--) if (marks[k].author !== AUTHOR && marks[k].end >= p.start) return true;
  return false;
}

function clip(marks: Mark[], patches: Patch[], author: string): Mark[] {
  const ranges = rangesOf(patches);
  const out: Mark[] = [];
  for (const m of marks) {
    for (let k = first(ranges.length, (i) => ranges[i].end >= m.start); k < ranges.length && ranges[k].start <= m.end; k++) {
      const r = ranges[k];
      if (m.start === m.end || r.start === r.end) {
        if (m.start === m.end && r.start <= m.start && m.start <= r.end) out.push({ ...m });
        else if (r.start === r.end && m.start <= r.start && r.start <= m.end) out.push({ start: r.start, end: r.start, author: m.author });
      } else if (m.start < r.end && r.start < m.end) {
        out.push({ start: Math.max(m.start, r.start), end: Math.min(m.end, r.end), author: m.author });
      }
    }
  }
  const kept = tidy(out);
  const added: Mark[] = [];
  let k = 0;
  let reach = -1;
  for (const r of ranges) {
    const empty = r.start === r.end;
    while (k < kept.length && (empty ? kept[k].start <= r.start : kept[k].start < r.end)) reach = Math.max(reach, kept[k++].end);
    if (empty ? reach >= r.start : reach > r.start) continue;
    added.push({ start: r.start, end: r.end, author });
    reach = Math.max(reach, r.end);
  }
  return added.length ? tidy([...kept, ...added]) : kept;
}

const refined = (before: string, ops: Patch[]): Patch[] => ops.flatMap((p) => diff(before.slice(p.start, p.end), p.text).map((q) => ({ start: p.start + q.start, end: p.start + q.end, text: q.text })));

function removalsOf(before: string, patches: Patch[], marks: Mark[], author: string): Removal[] {
  const out: Removal[] = [];
  let delta = 0;
  let k = 0;
  for (const p of patches) {
    const at = p.start + delta;
    delta += p.text.length - (p.end - p.start);
    if (p.end === p.start || p.end - p.start > REMOVAL_MAX) continue;
    const end = at + p.text.length;
    while (k < marks.length && marks[k].end < at) k++;
    const m = marks[k];
    out.push({ at, text: before.slice(p.start, p.end), author: m && m.start <= end ? m.author : author });
  }
  return out;
}

const copied = (patches: Patch[]): Patch[] => patches.map((p) => ({ start: p.start, end: p.end, text: unsliced(p.text) }));

const validPatches = (patches: unknown, n: number): patches is Patch[] => {
  if (!Array.isArray(patches)) return false;
  let at = 0;
  for (const p of patches) {
    if (!p || typeof p.text !== 'string' || !Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < at || p.end < p.start || p.end > n) return false;
    at = p.end;
  }
  return true;
};

const MAX_PATCHES = 2000;

export function operationOf(a: string, b: string): Patch[] {
  const patches = diff(a, b);
  if (patches.length <= MAX_PATCHES) return patches;
  return [{ start: patches[0].start, end: patches[patches.length - 1].end, text: b.slice(patches[0].start, b.length - (a.length - patches[patches.length - 1].end)) }];
}

const validMarks = (marks: unknown, n: number): marks is Mark[] =>
  Array.isArray(marks) && marks.every((m) => m && Number.isInteger(m.start) && Number.isInteger(m.end) && 0 <= m.start && m.start <= m.end && m.end <= n && typeof m.author === 'string');
const numbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((n) => Number.isInteger(n));

export function cleanVersionName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = shown(raw).replace(/(?!\s)\p{Cc}/gu, '').replace(/\s+/g, ' ').trim();
  return Array.from(name).length > VERSION_NAME_MAX ? null : name;
}

class Unreadable extends Error {}

export class History {
  rev = 0;
  restores = 0;
  overwritten = 0;
  readonly found: { before: string; patches: Patch[] } | null = null;
  private readonly dir: string;
  private readonly file: string;
  private readonly asideDir: string;
  private readonly authority: Authority;
  private readonly quiet: number;
  private readonly longest: number;
  private readonly maxBytes: number;
  private readonly keep: number;
  private readonly asideBytes: number;
  private readonly asideFiles: number;
  private readonly asideTotal: number;
  private readonly checkpointBytes: number;
  private readonly now: () => number;
  private readonly clock: () => number;
  private readonly log: (message: string) => void;
  private held: string;
  private base = { time: 0, text: '' };
  private versions: Version[] = [];
  private checkpoints = new Map<number, string>();
  private step = STEP;
  private lastText = '';
  private lastSlides: Slide[] | null = null;
  private open: Open | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private bytes = 0;
  private broken = false;
  private frozen = false;
  private names = 0;
  private stopped = false;
  private asides: AsideInfo[] = [];
  private asideSizes = new Map<string, number>();
  private restored: { n: number; told: Restored } | null = null;
  private typed: Mark[] = [];
  private listeners = new Set<() => void>();

  constructor(dir: string, authority: Authority, options: HistoryOptions = {}) {
    this.dir = dir;
    this.file = join(dir, 'history.jsonl');
    this.asideDir = join(dir, 'aside');
    this.authority = authority;
    this.quiet = options.quiet ?? 60_000;
    this.longest = options.longest ?? 300_000;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.keep = options.keep ?? 30 * 24 * 3600 * 1000;
    this.asideBytes = options.asideBytes ?? 8 * 1024 * 1024;
    this.asideFiles = options.asideFiles ?? 50;
    this.asideTotal = options.asideTotal ?? 256 * 1024 * 1024;
    this.checkpointBytes = options.checkpointBytes ?? 16 * 1024 * 1024;
    this.now = options.now ?? Date.now;
    this.clock = options.clock ?? (() => performance.now());
    this.log = options.log ?? (() => {});
    try {
      mkdirSync(dir, { recursive: true });
    } catch {}
    let loaded: string[] | null = null;
    try {
      loaded = this.load();
    } catch (e) {
      if (!(e instanceof Unreadable)) this.log(`could not read ${this.file}: ${(e as Error).message}`);
      const aside = join(dir, `history-unreadable-${Date.now()}.jsonl`);
      if (setAsideSync(this.file, aside)) this.log(`the version history could not be read, hence it was kept in ${aside} and a new history begins`);
      else {
        this.frozen = true;
        this.log(`the version history could not be read nor kept in ${aside}, hence ${this.file} is left as it is and the history of this run is not written`);
      }
      this.versions = [];
      this.checkpoints.clear();
      this.step = STEP;
    }
    const text = authority.text;
    if (!loaded) {
      this.base = { time: this.now(), text };
      this.lastText = text;
      const start = this.version([], [], [], text);
      start.start = true;
      this.versions.push(start);
      this.writeAll();
    } else {
      this.found = { before: this.lastText, patches: copied(diff(this.lastText, text)) };
      if (this.found.patches.length) {
        const patches = this.found.patches;
        const authors = loaded.length ? loaded : [AUTHOR];
        this.push(this.version(authors, patches, clip([], patches, authors.length > 1 ? '' : authors[0]), text), text);
      } else if (loaded.length) this.writeAll();
      if (this.bytes > this.maxBytes) this.compact();
    }
    this.held = text;
    this.readAsides();
    authority.observe((op, after) => this.operation(op, after));
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  list(): HistoryAnswer {
    return { rev: this.rev, versions: this.versions.map(info).reverse(), aside: [...this.asides].reverse() };
  }

  get(id: unknown): VersionDetail | null {
    const i = this.indexOf(id);
    if (i < 0) return null;
    const v = this.versions[i];
    const removals = v.patches.some((p) => p.end > p.start) ? removalsOf(this.textAt(i - 1), v.patches, v.marks, v.authors.length === 1 ? v.authors[0] : '') : [];
    return { ...info(v), marks: v.marks, removals };
  }

  textOf(id: unknown): string | null {
    const i = this.indexOf(id);
    return i < 0 ? null : this.textAt(i);
  }

  name(id: unknown, raw: unknown): VersionInfo | null | 'long' {
    const name = cleanVersionName(raw);
    if (name === null) return 'long';
    let v: Version | null;
    if (id === 'current') {
      this.close();
      v = this.versions[this.versions.length - 1] ?? this.close(true);
    } else v = this.find(id);
    if (!v) return null;
    if ((v.name ?? '') !== name) {
      if (name) v.name = name;
      else delete v.name;
      this.append({ kind: 'name', id: v.id, name });
      if (++this.names > this.versions.length + 1000) this.writeAll();
      this.changed();
    }
    return info(v);
  }

  restore(id: unknown, person: string): { id: string | null } | null {
    const i = this.indexOf(id);
    if (i < 0) return null;
    const target = this.textAt(i);
    const was = this.versions[i];
    this.close();
    if (this.authority.text === target) return { id: null };
    this.authority.enter(operationOf(this.authority.text, target), person);
    const v = this.close(false, was.id);
    this.restored = { n: this.authority.n, told: { by: person, id: was.id, time: was.time } };
    this.restores++;
    this.changed();
    return { id: v?.id ?? null };
  }

  restoredAfter(since: unknown): Restored | null {
    const at = parseVersion(since);
    if (!at || !this.restored) return null;
    return at.epoch !== this.authority.epoch || at.n < this.restored.n ? this.restored.told : null;
  }

  overwrittenAfter(since: unknown): boolean {
    const at = parseVersion(since);
    return !!at && at.epoch === this.authority.epoch && at.n < this.overwritten;
  }

  setAside(text: string, author: string): AsideInfo | null {
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length > this.asideBytes) return null;
    const aside: AsideInfo = { id: newId(), time: this.now(), author };
    mkdirSync(this.asideDir, { recursive: true });
    const tmp = join(this.asideDir, `.${asideName(aside)}.tmp`);
    writeFileSync(tmp, bytes);
    renameRetriedSync(tmp, join(this.asideDir, asideName(aside)));
    this.asides.push(aside);
    this.asideSizes.set(aside.id, bytes.length);
    const theirs = this.asides.filter((a) => a.author === author);
    for (const old of theirs.slice(0, Math.max(0, theirs.length - this.asideFiles))) this.dropAside(old);
    this.trimAsides();
    this.changed();
    return aside;
  }

  private dropAside(a: AsideInfo): void {
    this.asides.splice(this.asides.indexOf(a), 1);
    this.asideSizes.delete(a.id);
    try {
      unlinkSync(join(this.asideDir, asideName(a)));
    } catch {}
  }

  private trimAsides(): void {
    let total = 0;
    for (const n of this.asideSizes.values()) total += n;
    while (total > this.asideTotal && this.asides.length > 1) {
      total -= this.asideSizes.get(this.asides[0].id) ?? 0;
      this.dropAside(this.asides[0]);
    }
  }

  asideText(id: unknown): string | null {
    const aside = this.asides.find((a) => a.id === id);
    if (!aside) return null;
    try {
      return readFileSync(join(this.asideDir, asideName(aside)), 'utf8');
    } catch {
      return null;
    }
  }

  close(empty = false, restored?: string, text = this.authority.text): Version | null {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const open = this.open;
    this.open = null;
    if (open && open.author !== AUTHOR) this.typed = moveMarks(this.typed, open.ops, open.author);
    if (text === this.lastText && !empty) {
      if (open) this.writeAll();
      return null;
    }
    const patches = copied(open ? refined(this.lastText, open.ops) : diff(this.lastText, text));
    const author = open?.author ?? AUTHOR;
    const v = this.version(open ? [...open.authors] : [], patches, clip(open?.marks ?? [], patches, author), text, open?.time);
    if (restored) v.restored = restored;
    this.push(v, text);
    return v;
  }

  stopSync(): void {
    if (this.stopped) return;
    this.close();
    this.stopped = true;
  }

  private changed(): void {
    this.rev++;
    for (const fn of this.listeners) fn();
  }

  private find(id: unknown): Version | null {
    const i = this.indexOf(id);
    return i < 0 ? null : this.versions[i];
  }

  private indexOf(id: unknown): number {
    if (!isVersionId(id)) return -1;
    for (let i = this.versions.length - 1; i >= 0; i--) if (this.versions[i].id === id) return i;
    return -1;
  }

  private textAt(i: number): string {
    if (i === this.versions.length - 1) return this.lastText;
    let from = -1;
    for (const k of this.checkpoints.keys()) if (k <= i && k > from) from = k;
    return applyEach(from < 0 ? this.base.text : this.checkpoints.get(from)!, this.versions.slice(from + 1, i + 1).map((v) => v.patches));
  }

  private checkpoint(i: number, text: string): void {
    if ((i + 1) % this.step !== 0) return;
    this.checkpoints.set(i, text);
    const budget = Math.max(this.checkpointBytes, 4 * 2 * text.length);
    const bytes = () => [...this.checkpoints.values()].reduce((sum, t) => sum + 2 * t.length, 0);
    while (this.checkpoints.size > CHECKPOINTS || bytes() > budget) {
      this.step *= 2;
      for (const k of [...this.checkpoints.keys()]) if ((k + 1) % this.step !== 0) this.checkpoints.delete(k);
    }
  }

  private version(authors: string[], patches: Patch[], marks: Mark[], text: string, time = this.now()): Version {
    this.lastSlides ??= slidesOf(this.lastText);
    const slides = slidesOf(text);
    const changes = slideChanges(this.lastText, this.lastSlides, text, slides, marks);
    this.lastSlides = slides;
    const v: Version = { id: newId(), time, authors, slides: changes.slides, patches, marks };
    if (changes.removed) v.removed = changes.removed;
    return v;
  }

  private push(v: Version, text: string): void {
    this.versions.push(v);
    this.lastText = text;
    this.checkpoint(this.versions.length - 1, text);
    const { name, ...line } = v;
    this.append({ kind: 'version', ...line });
    if (name) {
      this.append({ kind: 'name', id: v.id, name });
      this.names++;
    }
    if (this.bytes > this.maxBytes) this.compact();
    this.changed();
  }

  private operation(op: AppliedOp, text: string): void {
    if (this.stopped) return;
    const t = this.clock();
    const w = this.now();
    if (this.open && (this.due(this.open, t, w) || (op.author === AUTHOR) !== (this.open.author === AUTHOR))) this.close(false, undefined, this.held);
    if (op.author === AUTHOR) {
      const patches = op.patches.flatMap((p) => (touches(this.typed, p) ? byWords(this.held, p) : [p]));
      if (patches.some((p) => overwrites(this.typed, p))) this.overwritten = this.authority.n;
      this.typed = moveMarks(this.typed, patches, AUTHOR);
    }
    this.held = text;
    const open = (this.open ??= { first: t, last: t, since: w, time: w, authors: new Set(), marks: [], author: op.author, ops: [] });
    open.last = t;
    open.time = w;
    open.author = op.author;
    if (!open.authors.has(op.author)) {
      open.authors.add(op.author);
      this.append({ kind: 'open', author: op.author });
    }
    open.marks = moveMarks(open.marks, op.patches, op.author);
    open.ops = compose(open.ops, op.patches);
    this.arm();
  }

  private due(open: Open, t: number, w: number): boolean {
    return t - open.last >= this.quiet || t - open.first >= this.longest || w - open.time >= this.quiet || w - open.since >= this.longest;
  }

  private arm(): void {
    if (this.timer || !this.open) return;
    const wait = Math.max(0, Math.min(this.open.last + this.quiet, this.open.first + this.longest) - this.clock());
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.open) return;
      if (this.due(this.open, this.clock(), this.now())) this.close();
      else this.arm();
    }, wait);
    this.timer.unref?.();
  }

  private append(line: object): void {
    if (this.frozen) return;
    if (this.broken) {
      this.writeAll();
      return;
    }
    const data = `${JSON.stringify(line)}\n`;
    try {
      appendFileSync(this.file, data);
      this.bytes += Buffer.byteLength(data);
    } catch (e) {
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
      this.broken = true;
    }
  }

  private writeAll(): void {
    if (this.frozen) return;
    const lines = [JSON.stringify({ kind: 'base', ...this.base })];
    for (const v of this.versions) {
      const { name, ...line } = v;
      lines.push(JSON.stringify({ kind: 'version', ...line }));
    }
    const named = this.versions.filter((v) => v.name);
    for (const v of named) lines.push(JSON.stringify({ kind: 'name', id: v.id, name: v.name }));
    for (const author of this.open?.authors ?? []) lines.push(JSON.stringify({ kind: 'open', author }));
    const data = `${lines.join('\n')}\n`;
    const tmp = join(this.dir, `.history.jsonl.${randomBytes(6).toString('hex')}.tmp`);
    try {
      writeFileSync(tmp, data);
      renameRetriedSync(tmp, this.file);
      this.bytes = Buffer.byteLength(data);
      this.names = named.length;
      this.broken = false;
    } catch (e) {
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
      this.broken = true;
      try {
        unlinkSync(tmp);
      } catch {}
    }
  }

  private compact(): void {
    const cutoff = this.now() - this.keep;
    let k = this.versions.findIndex((v) => v.time >= cutoff);
    if (k < 0) k = this.versions.length - 1;
    const keep = this.versions.flatMap((v, i) => (i >= k || v.name ? [i] : []));
    if (keep[0] === 0 && keep.length === this.versions.length) return;
    const first = keep[0];
    const versions = keep.map((i, j) => (j === 0 || keep[j - 1] === i - 1 ? this.versions[i] : { ...this.versions[i], patches: copied(diff(this.textAt(keep[j - 1]), this.textAt(i))) }));
    if (first > 0) this.base = { time: this.versions[first - 1].time, text: this.textAt(first - 1) };
    const kept = new Map<number, string>();
    for (const [i, text] of this.checkpoints) if (keep.includes(i)) kept.set(keep.indexOf(i), text);
    this.versions = versions;
    this.checkpoints = kept;
    this.step = STEP;
    this.writeAll();
    this.changed();
  }

  private load(): string[] | null {
    let content: string;
    try {
      content = readFileSync(this.file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    if (content === '') return null;
    const lines = content.split('\n');
    let last = lines.length - 1;
    if (lines[last] === '') last--;
    let good = 0;
    let text = '';
    const names = new Map<string, string>();
    let open: string[] = [];
    for (let i = 0; i <= last; i++) {
      const record = this.parse(lines[i], i, text);
      if (record === null) {
        if (i < last || i === 0) throw new Unreadable();
        try {
          truncateSync(this.file, Buffer.byteLength(content.slice(0, good)));
        } catch {
          this.broken = true;
        }
        break;
      }
      if (record.kind === 'base') {
        this.base = { time: record.time, text: record.text };
        text = record.text;
      } else if (record.kind === 'version') {
        text = apply(text, record.v.patches);
        this.versions.push(record.v);
        this.checkpoint(this.versions.length - 1, text);
        open = [];
      } else if (record.kind === 'open') {
        if (!open.includes(record.author)) open.push(record.author);
      } else {
        names.set(record.id, record.name);
        this.names++;
      }
      good += lines[i].length + 1;
    }
    if (good > content.length) {
      try {
        appendFileSync(this.file, '\n');
      } catch {
        this.broken = true;
      }
    }
    for (const v of this.versions) {
      const name = names.get(v.id);
      if (name) v.name = name;
    }
    this.lastText = text;
    this.bytes = statSync(this.file).size;
    return open;
  }

  private parse(line: string, i: number, text: string): { kind: 'base'; time: number; text: string } | { kind: 'version'; v: Version } | { kind: 'name'; id: string; name: string } | { kind: 'open'; author: string } | null {
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(line);
    } catch {
      return null;
    }
    if (!r || typeof r !== 'object') return null;
    if (i === 0) return r.kind === 'base' && Number.isFinite(r.time) && typeof r.text === 'string' ? { kind: 'base', time: r.time as number, text: r.text } : null;
    if (r.kind === 'name') return isVersionId(r.id) && typeof r.name === 'string' ? { kind: 'name', id: r.id, name: r.name } : null;
    if (r.kind === 'open') return typeof r.author === 'string' ? { kind: 'open', author: r.author } : null;
    if (r.kind !== 'version' || !isVersionId(r.id) || !Number.isFinite(r.time) || !Array.isArray(r.authors) || !r.authors.every((a) => typeof a === 'string')) return null;
    if (!validPatches(r.patches, text.length) || !numbers(r.slides)) return null;
    const after = text.length + (r.patches as Patch[]).reduce((s, p) => s + p.text.length - (p.end - p.start), 0);
    const v: Version = { id: r.id, time: r.time as number, authors: r.authors as string[], slides: r.slides, patches: r.patches as Patch[], marks: validMarks(r.marks, after) ? r.marks : [] };
    const removed = r.removed as Version['removed'];
    if (removed && numbers(removed.slides) && Number.isInteger(removed.elements)) v.removed = { slides: removed.slides, elements: removed.elements };
    if (isVersionId(r.restored)) v.restored = r.restored;
    if (r.start === true) v.start = true;
    return { kind: 'version', v };
  }

  private readAsides(): void {
    let names: string[] = [];
    try {
      names = readdirSync(this.asideDir);
    } catch {}
    for (const name of names) {
      const m = ASIDE.exec(name);
      if (!m) continue;
      this.asides.push({ id: m[2], time: Number(m[1]), author: m[3] });
      try {
        this.asideSizes.set(m[2], statSync(join(this.asideDir, name)).size);
      } catch {}
    }
    this.asides.sort((a, b) => a.time - b.time);
    this.trimAsides();
  }
}

const asideName = (a: AsideInfo) => `${a.time}.${a.id}.${a.author}.html`;

function info(v: Version): VersionInfo {
  const out: VersionInfo = { id: v.id, time: v.time, authors: v.authors, slides: v.slides };
  if (v.name) out.name = v.name;
  if (v.removed) out.removed = v.removed;
  if (v.restored) out.restored = v.restored;
  if (v.start) out.start = true;
  return out;
}
