// the version history of a session. a version is a state of the text of index.html with its time,
// the people who changed the deck since the version before, and an optional name. a version is
// closed 60 s after the last operation, at the latest 5 min after the first operation since the
// version before, at once when a person names the current state, and at a
// stop. the versions are kept in .session/history.jsonl, appended only: a first line
// { kind: "base", time, text }, then a line { kind: "version", id, time, authors, patches, marks,
// slides, removed? } per version, whose patches turn the text of the version before
// into its own, and a line { kind: "name", id, name } per name given or taken off.

import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Authority } from '../session/authority.ts';
import { apply, diff, shiftOffset } from '../session/patch.ts';
import { VERSION_NAME_MAX, type AppliedOp, type HistoryAnswer, type Mark, type Patch, type VersionDetail, type VersionInfo } from '../session/protocol.ts';
import { slideChanges, slidesOf, type Slide } from '../session/slides.ts';
import { AUTHOR, renameRetriedSync } from './disk.ts';

export type HistoryOptions = {
  // a version is closed quiet ms after the last operation, and at the latest longest ms after the
  // first operation since the version before
  quiet?: number;
  longest?: number;
  now?: () => number;
  log?: (message: string) => void;
};

type Version = VersionInfo & { patches: Patch[]; marks: Mark[] };

type Open = { first: number; last: number; time: number; authors: Set<string>; marks: Mark[]; author: string };

type Range = { start: number; end: number };

export const isVersionId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id);
const newId = () => randomBytes(9).toString('base64url');
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

// the marks of an open version moved over an operation, with the ranges that the operation wrote
// marked as changed by its author. a removal leaves an empty mark at its place, and an older mark
// keeps only what the operation did not write over
export function moveMarks(marks: Mark[], patches: Patch[], author: string): Mark[] {
  if (patches.length === 0) return marks;
  const ranges = rangesOf(patches);
  const out: Mark[] = [];
  for (const m of marks) {
    const start = shiftOffset(m.start, patches, true);
    const end = m.start === m.end ? start : Math.max(start, shiftOffset(m.end, patches, false));
    let pieces: Range[] = [{ start, end }];
    for (const r of ranges) {
      if (r.start === r.end) continue;
      pieces = pieces.flatMap((p) => {
        if (p.start === p.end) return r.start <= p.start && p.start <= r.end ? [] : [p];
        if (p.end <= r.start || r.end <= p.start) return [p];
        return [{ start: p.start, end: r.start }, { start: r.end, end: p.end }].filter((x) => x.start < x.end);
      });
    }
    for (const p of pieces) out.push({ start: p.start, end: p.end, author: m.author });
  }
  for (const r of ranges) {
    // a removal inside a mark of the same author is already marked
    if (r.start === r.end && out.some((m) => m.author === author && m.start <= r.start && r.start <= m.end)) continue;
    out.push({ start: r.start, end: r.end, author });
  }
  return tidy(out);
}

// the marks of a version kept to the ranges that the version changed, since a change made and
// undone in one version is not a change of it. a range without a mark is given to author
function clip(marks: Mark[], patches: Patch[], author: string): Mark[] {
  const ranges = rangesOf(patches);
  const out: Mark[] = [];
  for (const m of marks) {
    for (const r of ranges) {
      if (m.start === m.end || r.start === r.end) {
        if (m.start === m.end && r.start <= m.start && m.start <= r.end) out.push({ ...m });
        else if (r.start === r.end && m.start <= r.start && r.start <= m.end) out.push({ start: r.start, end: r.start, author: m.author });
      } else if (m.start < r.end && r.start < m.end) {
        out.push({ start: Math.max(m.start, r.start), end: Math.min(m.end, r.end), author: m.author });
      }
    }
  }
  for (const r of ranges) {
    const held = out.some((m) => (r.start === r.end ? m.start <= r.start && r.start <= m.end : m.start < r.end && r.start < m.end));
    if (!held) out.push({ start: r.start, end: r.end, author });
  }
  return tidy(out);
}

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
  // the patches from the text of the last version to index.html at the start, or null when the
  // history began at this start
  readonly found: { before: string; patches: Patch[] } | null = null;
  private readonly dir: string;
  private readonly file: string;
  private readonly authority: Authority;
  private readonly quiet: number;
  private readonly longest: number;
  private readonly now: () => number;
  private readonly log: (message: string) => void;
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
  private stopped = false;
  private listeners = new Set<() => void>();

  // dir is the .session folder of the talk
  constructor(dir: string, authority: Authority, options: HistoryOptions = {}) {
    this.dir = dir;
    this.file = join(dir, 'history.jsonl');
    this.authority = authority;
    this.quiet = options.quiet ?? 60_000;
    this.longest = options.longest ?? 300_000;
    this.now = options.now ?? Date.now;
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
      try {
        renameSync(this.file, aside);
        this.log(`the version history could not be read, hence it was moved to ${aside} and a new history begins`);
      } catch {}
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
      this.found = { before: this.lastText, patches: diff(this.lastText, text) };
      if (this.found.patches.length) {
        const patches = this.found.patches;
        this.push(this.version([AUTHOR], patches, clip([], patches, AUTHOR), text), text);
      }
    }
    authority.observe((op) => this.operation(op));
  }

  // calls fn after every change of rev
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  list(): HistoryAnswer {
    return { rev: this.rev, versions: this.versions.map(info).reverse(), aside: [] };
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
      this.changed();
    }
    return info(v);
  }

  // the open version closed, e.g. at a stop. empty closes a version without a change when there
  // is not any, so that it can be named
  close(empty = false): Version | null {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const open = this.open;
    this.open = null;
    const text = this.authority.text;
    if (text === this.lastText && !empty) return null;
    const patches = diff(this.lastText, text);
    const author = open?.author ?? AUTHOR;
    const v = this.version(open ? [...open.authors] : [], patches, clip(open?.marks ?? [], patches, author), text, open?.time);
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
    if (name) this.append({ kind: 'name', id: v.id, name });
    this.changed();
  }

  private operation(op: AppliedOp): void {
    if (this.stopped) return;
    const t = Date.now();
    const open = (this.open ??= { first: t, last: t, time: 0, authors: new Set(), marks: [], author: op.author });
    open.last = t;
    open.time = this.now();
    open.author = op.author;
    open.authors.add(op.author);
    open.marks = moveMarks(open.marks, op.patches, op.author);
    this.arm();
  }

  // one timer at a time, which looks again at the times of the open version when it fires
  private arm(): void {
    if (this.timer || !this.open) return;
    const due = () => Math.min(this.open!.last + this.quiet, this.open!.first + this.longest);
    const wait = () => Math.max(0, due() - Date.now());
    const fire = () => {
      this.timer = null;
      if (!this.open) return;
      if (wait() > 0) this.arm();
      else this.close();
    };
    this.timer = setTimeout(fire, wait());
    this.timer.unref?.();
  }

  private append(line: object): void {
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
    const lines = [JSON.stringify({ kind: 'base', ...this.base })];
    for (const v of this.versions) {
      const { name, ...line } = v;
      lines.push(JSON.stringify({ kind: 'version', ...line }));
    }
    for (const v of this.versions) if (v.name) lines.push(JSON.stringify({ kind: 'name', id: v.id, name: v.name }));
    const data = `${lines.join('\n')}\n`;
    const tmp = join(this.dir, `.history.jsonl.${randomBytes(6).toString('hex')}.tmp`);
    try {
      writeFileSync(tmp, data);
      renameRetriedSync(tmp, this.file);
      this.bytes = Buffer.byteLength(data);
      this.broken = false;
    } catch (e) {
      this.log(`could not write ${this.file}: ${(e as Error).message}`);
      this.broken = true;
      try {
        unlinkSync(tmp);
      } catch {}
    }
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
      } else names.set(record.id, record.name);
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
    return { kind: 'version', v };
  }
}

function info(v: Version): VersionInfo {
  const out: VersionInfo = { id: v.id, time: v.time, authors: v.authors, slides: v.slides };
  if (v.name) out.name = v.name;
  if (v.removed) out.removed = v.removed;
  return out;
}
