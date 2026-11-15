// the version history of a session. a version is a state of the text of index.html with its time,
// the people who changed the deck since the version before, and an optional name. a version is
// closed 60 s after the last operation, at the latest 5 min after the first operation since the
// version before, at once when a person names the current state or restores a version, and at a
// stop. the versions are kept in .session/history.jsonl, appended only: a first line
// { kind: "base", time, text }, then a line { kind: "version", id, time, authors, patches, marks,
// slides, removed?, restored? } per version, whose patches turn the text of the version before
// into its own, and a line { kind: "name", id, name } per name given or taken off. the texts that
// a person set aside at a conflict are kept in .session/aside/, one file each

import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Authority } from '../session/authority.ts';
import { apply, copy, diff } from '../session/patch.ts';
import { parseVersion, VERSION_NAME_MAX, type AsideInfo, type AppliedOp, type HistoryAnswer, type Mark, type Patch, type Restored, type VersionDetail, type VersionInfo } from '../session/protocol.ts';
import { slideChanges, slidesOf, type Slide } from '../session/slides.ts';
import { AUTHOR, setAsideSync, renameRetriedSync } from './disk.ts';

export type HistoryOptions = {
  // a version is closed quiet ms after the last operation, and at the latest longest ms after the
  // first operation since the version before
  quiet?: number;
  longest?: number;
  // past maxBytes the file is written anew without the versions older than keep ms, apart from
  // the named ones and those after them
  maxBytes?: number;
  keep?: number;
  // the texts set aside: at most asideBytes each, and at most asideFiles per person, the oldest of
  // the person removed first
  asideBytes?: number;
  asideFiles?: number;
  now?: () => number;
  // the time in ms of a clock that does not jump, which stands while the computer sleeps, as the
  // timers do
  clock?: () => number;
  log?: (message: string) => void;
};

type Version = VersionInfo & { patches: Patch[]; marks: Mark[] };

// first and last are times of clock, since and time of now
type Open = { first: number; last: number; since: number; time: number; authors: Set<string>; marks: Mark[]; author: string };

type Range = { start: number; end: number };

export const isVersionId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id);
const newId = () => randomBytes(9).toString('base64url');
const ASIDE = /^([0-9]{1,16})\.([A-Za-z0-9_-]{1,40})\.([A-Za-z0-9_-]{1,64})\.html$/;
// a text is rebuilt from the nearest text kept, one every STEP versions at the start, and fewer
// once more than CHECKPOINTS are kept
const STEP = 50;
const CHECKPOINTS = 64;

// the new ranges of the patches of an operation in the text after it
function rangesOf(patches: Patch[]): Range[] {
  let delta = 0;
  return patches.map((p) => {
    const start = p.start + delta;
    delta += p.text.length - (p.end - p.start);
    return { start, end: start + p.text.length };
  });
}

// marks sorted, with the marks of one author that touch joined, which also takes in an empty mark
// at the place of a mark of its author
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

// the first index of a list of n for which at is true, where at is false and then true
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

// shiftOffset of patch.ts for many offsets, by a binary search of the sorted patches
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

// the marks of an open version moved over an operation, with the ranges that the operation wrote
// marked as changed by its author. a removal leaves an empty mark at its place, and an older mark
// keeps only what the operation did not write over. the ranges are sorted and do not overlap,
// hence the ranges that meet a mark are found by a binary search
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
  // a removal inside a mark of the same author is already marked. reach is the furthest end of
  // the marks of author that start at or before the removal
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

// the marks of a version kept to the ranges that the version changed, since a change made and
// undone in one version is not a change of it. a range without a mark is given to the author of
// the nearest mark that was left out, as when the diff of the version places a change at another
// equal line, and to author when no mark was left out
function clip(marks: Mark[], patches: Patch[], author: string): Mark[] {
  const ranges = rangesOf(patches);
  const out: Mark[] = [];
  const dropped: Mark[] = [];
  for (const m of marks) {
    const n = out.length;
    // the ends of the ranges do not decrease, hence the ranges that meet m follow one another
    for (let k = first(ranges.length, (i) => ranges[i].end >= m.start); k < ranges.length && ranges[k].start <= m.end; k++) {
      const r = ranges[k];
      if (m.start === m.end || r.start === r.end) {
        if (m.start === m.end && r.start <= m.start && m.start <= r.end) out.push({ ...m });
        else if (r.start === r.end && m.start <= r.start && r.start <= m.end) out.push({ start: r.start, end: r.start, author: m.author });
      } else if (m.start < r.end && r.start < m.end) {
        out.push({ start: Math.max(m.start, r.start), end: Math.min(m.end, r.end), author: m.author });
      }
    }
    if (out.length === n) dropped.push(m);
  }
  const kept = tidy(out);
  dropped.sort((a, b) => a.start - b.start);
  // the index of the dropped mark that reaches furthest among the first i + 1
  const furthest: number[] = [];
  dropped.forEach((m, i) => furthest.push(i > 0 && dropped[furthest[i - 1]].end >= m.end ? furthest[i - 1] : i));
  const gap = (m: Mark, r: Range) => Math.max(0, m.start - r.end, r.start - m.end);
  // of the dropped marks that start at or before r the nearest reaches furthest, and of those after
  // it the nearest starts first
  const nearest = (r: Range): string => {
    const i = first(dropped.length, (k) => dropped[k].start > r.start);
    const before = i > 0 ? dropped[furthest[i - 1]] : null;
    const after = i < dropped.length ? dropped[i] : null;
    if (before && (!after || gap(before, r) <= gap(after, r))) return before.author;
    return after?.author ?? author;
  };
  // a range is held by a mark that starts before its end, or at its place when it is empty, and
  // reaches into it. reach is the furthest end of those marks
  const added: Mark[] = [];
  let k = 0;
  let reach = -1;
  for (const r of ranges) {
    const empty = r.start === r.end;
    while (k < kept.length && (empty ? kept[k].start <= r.start : kept[k].start < r.end)) reach = Math.max(reach, kept[k++].end);
    if (empty ? reach >= r.start : reach > r.start) continue;
    added.push({ start: r.start, end: r.end, author: nearest(r) });
    reach = Math.max(reach, r.end);
  }
  return added.length ? tidy([...kept, ...added]) : kept;
}

// patches whose texts are copied, since a slice of a text keeps the whole text in memory
const copied = (patches: Patch[]): Patch[] => patches.map((p) => ({ start: p.start, end: p.end, text: copy(p.text) }));

// the patches of a version, sorted, in bounds, and without overlap. valid() of patch.ts is not
// used, since it caps the patches of one operation and a version may hold more
const validPatches = (patches: unknown, n: number): patches is Patch[] => {
  if (!Array.isArray(patches)) return false;
  let at = 0;
  for (const p of patches) {
    if (!p || typeof p.text !== 'string' || !Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < at || p.end < p.start || p.end > n) return false;
    at = p.end;
  }
  return true;
};

// the most patches that the authority takes in one operation, as valid() of patch.ts allows
const MAX_PATCHES = 2000;

// the patches that turn a into b in one operation that the authority takes: the diff, or one
// patch from the common start to the common end when the diff has too many
export function operationOf(a: string, b: string): Patch[] {
  const patches = diff(a, b);
  if (patches.length <= MAX_PATCHES) return patches;
  return [{ start: patches[0].start, end: patches[patches.length - 1].end, text: b.slice(patches[0].start, b.length - (a.length - patches[patches.length - 1].end)) }];
}

const validMarks = (marks: unknown, n: number): marks is Mark[] =>
  Array.isArray(marks) && marks.every((m) => m && Number.isInteger(m.start) && Number.isInteger(m.end) && 0 <= m.start && m.start <= m.end && m.end <= n && typeof m.author === 'string');
const numbers = (x: unknown): x is number[] => Array.isArray(x) && x.every((n) => Number.isInteger(n));

// a name as it is kept, trimmed with inner whitespace collapsed, or null when it is too long
export function cleanVersionName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  return Array.from(name).length > VERSION_NAME_MAX ? null : name;
}

class Unreadable extends Error {}

export class History {
  // grows with every change of the list of versions or of the texts set aside
  rev = 0;
  // the count of restores
  restores = 0;
  // the patches from the text of the last version to index.html at the start, or null when the
  // history began at this start
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
  private readonly now: () => number;
  private readonly clock: () => number;
  private readonly log: (message: string) => void;
  // the text after the last operation
  private held: string;
  private base = { time: 0, text: '' };
  private versions: Version[] = [];
  // the texts after some versions, by index, as starting points of a rebuild
  private checkpoints = new Map<number, string>();
  private step = STEP;
  private lastText = '';
  private lastSlides: Slide[] | null = null;
  private open: Open | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private bytes = 0;
  // true when the file may not hold every line, after a write that failed
  private broken = false;
  // true when the file could not be read nor set aside, hence it is not written in this run
  private frozen = false;
  // the lines of a name in the file, which is written anew once they are many more than the versions
  private names = 0;
  private stopped = false;
  private asides: AsideInfo[] = [];
  // the last restore, with the n of the version of the authority that it made
  private restored: { n: number; told: Restored } | null = null;
  private listeners = new Set<() => void>();

  // dir is the .session folder of the talk
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
    this.now = options.now ?? Date.now;
    this.clock = options.clock ?? (() => performance.now());
    this.log = options.log ?? (() => {});
    try {
      mkdirSync(dir, { recursive: true });
    } catch {}
    let loaded = false;
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
      this.writeAll();
    } else {
      this.found = { before: this.lastText, patches: copied(diff(this.lastText, text)) };
      if (this.found.patches.length) {
        const patches = this.found.patches;
        this.push(this.version([AUTHOR], patches, clip([], patches, AUTHOR), text), text);
      }
      if (this.bytes > this.maxBytes) this.compact();
    }
    this.held = text;
    this.readAsides();
    authority.observe((op, after) => this.operation(op, after));
  }

  // calls fn after every change of rev
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  list(): HistoryAnswer {
    return { rev: this.rev, versions: this.versions.map(info).reverse(), aside: [...this.asides].reverse() };
  }

  get(id: unknown): VersionDetail | null {
    const v = this.find(id);
    return v ? { ...info(v), marks: v.marks } : null;
  }

  // the text of the deck at version id, or null for an unknown id
  textOf(id: unknown): string | null {
    const i = this.indexOf(id);
    return i < 0 ? null : this.textAt(i);
  }

  // the version of the current state closed at once and named. name is cleaned, and an empty name
  // takes the name off. null for an unknown id, and 'long' for a name over VERSION_NAME_MAX
  name(id: unknown, raw: unknown): VersionInfo | null | 'long' {
    const name = cleanVersionName(raw);
    if (name === null) return 'long';
    let v: Version | null;
    if (id === 'current') {
      this.close();
      // a deck without a version yet gets one that holds the base
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

  // the deck made to read as version id by one operation of person, between a version of the
  // current state and a version of the restore. null for an unknown id. id is null in the answer
  // when the deck already reads as the version
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

  // the last restore when it is after the version since of a page, which is the latest restore
  // that the page has not had. every restore is after a version of an earlier start
  restoredAfter(since: unknown): Restored | null {
    const at = parseVersion(since);
    if (!at || !this.restored) return null;
    return at.epoch !== this.authority.epoch || at.n < this.restored.n ? this.restored.told : null;
  }

  // a text that a person set aside, or null when it is too large
  setAside(text: string, author: string): AsideInfo | null {
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length > this.asideBytes) return null;
    const aside: AsideInfo = { id: newId(), time: this.now(), author };
    mkdirSync(this.asideDir, { recursive: true });
    const tmp = join(this.asideDir, `.${asideName(aside)}.tmp`);
    writeFileSync(tmp, bytes);
    renameRetriedSync(tmp, join(this.asideDir, asideName(aside)));
    this.asides.push(aside);
    const theirs = this.asides.filter((a) => a.author === author);
    for (const old of theirs.slice(0, Math.max(0, theirs.length - this.asideFiles))) {
      this.asides.splice(this.asides.indexOf(old), 1);
      try {
        unlinkSync(join(this.asideDir, asideName(old)));
      } catch {}
    }
    this.changed();
    return aside;
  }

  // the text set aside as id, or null
  asideText(id: unknown): string | null {
    const aside = this.asides.find((a) => a.id === id);
    if (!aside) return null;
    try {
      return readFileSync(join(this.asideDir, asideName(aside)), 'utf8');
    } catch {
      return null;
    }
  }

  // the open version closed, e.g. at a stop. empty closes a version without a change when there
  // is not any, so that it can be named. restored is the id of the version that it restores
  close(empty = false, restored?: string, text = this.authority.text): Version | null {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const open = this.open;
    this.open = null;
    if (text === this.lastText && !empty) return null;
    const patches = copied(diff(this.lastText, text));
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
    let text = from < 0 ? this.base.text : this.checkpoints.get(from)!;
    for (let k = from + 1; k <= i; k++) text = apply(text, this.versions[k].patches);
    return text;
  }

  private checkpoint(i: number, text: string): void {
    if ((i + 1) % this.step !== 0) return;
    this.checkpoints.set(i, text);
    if (this.checkpoints.size <= CHECKPOINTS) return;
    this.step *= 2;
    for (const k of [...this.checkpoints.keys()]) if ((k + 1) % this.step !== 0) this.checkpoints.delete(k);
  }

  // a new version of text, which patches make from the text of the last version
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
    // the timer is late after a sleep, hence a version that is due is closed on the text before op
    if (this.open && this.due(this.open, t, w)) this.close(false, undefined, this.held);
    this.held = text;
    const open = (this.open ??= { first: t, last: t, since: w, time: w, authors: new Set(), marks: [], author: op.author });
    open.last = t;
    open.time = w;
    open.author = op.author;
    open.authors.add(op.author);
    open.marks = moveMarks(open.marks, op.patches, op.author);
    this.arm();
  }

  // whether open is to be closed at the times t of clock and w of now. a wall clock set back does
  // not hold it open, and one that jumped ahead in a sleep closes it
  private due(open: Open, t: number, w: number): boolean {
    return t - open.last >= this.quiet || t - open.first >= this.longest || w - open.time >= this.quiet || w - open.since >= this.longest;
  }

  // one timer at a time, which looks again at the times of the open version when it fires
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

  // the file written anew from memory, by a temporary file and a rename
  private writeAll(): void {
    if (this.frozen) return;
    const lines = [JSON.stringify({ kind: 'base', ...this.base })];
    for (const v of this.versions) {
      const { name, ...line } = v;
      lines.push(JSON.stringify({ kind: 'version', ...line }));
    }
    const named = this.versions.filter((v) => v.name);
    for (const v of named) lines.push(JSON.stringify({ kind: 'name', id: v.id, name: v.name }));
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

  // the versions before the oldest of the last keep ms and before the oldest named one left out,
  // the version before them becoming the base
  private compact(): void {
    const cutoff = this.now() - this.keep;
    let k = this.versions.findIndex((v) => v.time >= cutoff);
    if (k < 0) k = this.versions.length - 1;
    const named = this.versions.findIndex((v) => v.name);
    if (named >= 0) k = Math.min(k, named);
    if (k <= 0) return;
    this.base = { time: this.versions[k - 1].time, text: this.textAt(k - 1) };
    this.versions = this.versions.slice(k);
    const kept = new Map<number, string>();
    for (const [i, text] of this.checkpoints) if (i >= k) kept.set(i - k, text);
    this.checkpoints = kept;
    this.step = STEP;
    this.writeAll();
    this.changed();
  }

  // true when the file was read, false when it does not exist or is empty. throws Unreadable for a
  // file without a base, or with a line other than the last that cannot be read
  private load(): boolean {
    let content: string;
    try {
      content = readFileSync(this.file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw e;
    }
    if (content === '') return false;
    const lines = content.split('\n');
    // the index of the last line with text, which a crash may have cut
    let last = lines.length - 1;
    if (lines[last] === '') last--;
    let good = 0;
    let text = '';
    const names = new Map<string, string>();
    for (let i = 0; i <= last; i++) {
      const record = this.parse(lines[i], i, text);
      if (record === null) {
        if (i < last || i === 0) throw new Unreadable();
        // the line cut by a crash is taken off, so that the next line is appended whole
        truncateSync(this.file, Buffer.byteLength(content.slice(0, good)));
        break;
      }
      if (record.kind === 'base') {
        this.base = { time: record.time, text: record.text };
        text = record.text;
      } else if (record.kind === 'version') {
        text = apply(text, record.v.patches);
        this.versions.push(record.v);
        this.checkpoint(this.versions.length - 1, text);
      } else {
        names.set(record.id, record.name);
        this.names++;
      }
      good += lines[i].length + 1;
    }
    if (good > content.length) appendFileSync(this.file, '\n');
    for (const v of this.versions) {
      const name = names.get(v.id);
      if (name) v.name = name;
    }
    this.lastText = text;
    this.bytes = statSync(this.file).size;
    return true;
  }

  private parse(line: string, i: number, text: string): { kind: 'base'; time: number; text: string } | { kind: 'version'; v: Version } | { kind: 'name'; id: string; name: string } | null {
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(line);
    } catch {
      return null;
    }
    if (!r || typeof r !== 'object') return null;
    if (i === 0) return r.kind === 'base' && Number.isFinite(r.time) && typeof r.text === 'string' ? { kind: 'base', time: r.time as number, text: r.text } : null;
    if (r.kind === 'name') return isVersionId(r.id) && typeof r.name === 'string' ? { kind: 'name', id: r.id, name: r.name } : null;
    if (r.kind !== 'version' || !isVersionId(r.id) || !Number.isFinite(r.time) || !Array.isArray(r.authors) || !r.authors.every((a) => typeof a === 'string')) return null;
    if (!validPatches(r.patches, text.length) || !numbers(r.slides)) return null;
    const after = text.length + (r.patches as Patch[]).reduce((s, p) => s + p.text.length - (p.end - p.start), 0);
    const v: Version = { id: r.id, time: r.time as number, authors: r.authors as string[], slides: r.slides, patches: r.patches as Patch[], marks: validMarks(r.marks, after) ? r.marks : [] };
    const removed = r.removed as Version['removed'];
    if (removed && numbers(removed.slides) && Number.isInteger(removed.elements)) v.removed = { slides: removed.slides, elements: removed.elements };
    if (isVersionId(r.restored)) v.restored = r.restored;
    return { kind: 'version', v };
  }

  private readAsides(): void {
    let names: string[] = [];
    try {
      names = readdirSync(this.asideDir);
    } catch {}
    for (const name of names) {
      const m = ASIDE.exec(name);
      if (m) this.asides.push({ id: m[2], time: Number(m[1]), author: m[3] });
    }
    this.asides.sort((a, b) => a.time - b.time);
  }
}

const asideName = (a: AsideInfo) => `${a.time}.${a.id}.${a.author}.html`;

function info(v: Version): VersionInfo {
  const out: VersionInfo = { id: v.id, time: v.time, authors: v.authors, slides: v.slides };
  if (v.name) out.name = v.name;
  if (v.removed) out.removed = v.removed;
  if (v.restored) out.restored = v.restored;
  return out;
}
