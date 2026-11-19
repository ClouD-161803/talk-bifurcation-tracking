// a three-way merge of the edits of the page with a file changed since it was read, e.g. by an
// agent or by a git pull. the changes of the file are found with a line diff of the text that was
// read, base, and the text now in the file, theirs, and each change is narrowed to the characters
// that differ. an edit of the page is a conflict when it overlaps a change of the file. every
// range is in base

import { widen } from '../session/patch.ts';

export type Edit = { start: number; end: number; text: string };
export type Merge = { text: string; conflicts: Edit[] };

// beyond MAX_LINES changed lines the diff is given up, and the texts are taken as two files
const MAX_LINES = 2000;

const linesOf = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

function offsets(lines: string[]): number[] {
  const out = [0];
  for (const line of lines) out.push(out[out.length - 1] + line.length);
  return out;
}

type Hunk = { a0: number; a1: number; b0: number; b1: number };

// the length of the slices compared before the texts are compared character by character
const CHUNK = 2048;

// the lengths of the start and of the end that a and b share, where the end is counted only in
// the part after the start
export function shared(a: string, b: string): [number, number] {
  const n = Math.min(a.length, b.length);
  let s = 0;
  while (s + CHUNK <= n && a.slice(s, s + CHUNK) === b.slice(s, s + CHUNK)) s += CHUNK;
  while (s < n && a.charCodeAt(s) === b.charCodeAt(s)) s += 1;
  const most = n - s;
  let t = 0;
  while (t + CHUNK <= most && a.slice(a.length - t - CHUNK, a.length - t) === b.slice(b.length - t - CHUNK, b.length - t)) t += CHUNK;
  while (t < most && a.charCodeAt(a.length - 1 - t) === b.charCodeAt(b.length - 1 - t)) t += 1;
  return [s, t];
}

// the hunks that turn the lines a into the lines b, each the range a0 to a1 of a replaced by the
// range b0 to b1 of b, found with the Myers algorithm. null when more than max lines differ
function diff(a: ArrayLike<string>, b: ArrayLike<string>, max: number): Hunk[] | null {
  const n = a.length, m = b.length;
  const limit = Math.min(n + m, max);
  const off = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= limit && found < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;
  // the path is followed back from its end, with one deleted or inserted line at each step
  const steps: { x: number; y: number; del: boolean }[] = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const k = x - y;
    const pk = k === -d || (k !== d && prev[off + k - 1] < prev[off + k + 1]) ? k + 1 : k - 1;
    const del = pk === k - 1;
    const px = prev[off + pk], py = px - pk;
    while (x > px + (del ? 1 : 0) && y > py + (del ? 0 : 1)) {
      x--;
      y--;
    }
    steps.push({ x: px, y: py, del });
    x = px;
    y = py;
  }
  steps.reverse();
  const hunks: Hunk[] = [];
  for (const s of steps) {
    const last = hunks[hunks.length - 1];
    const h = last && last.a1 === s.x && last.b1 === s.y ? last : { a0: s.x, a1: s.x, b0: s.y, b1: s.y };
    if (h !== last) hunks.push(h);
    if (s.del) h.a1 += 1;
    else h.b1 += 1;
  }
  return hunks;
}

// a line that opens or closes a slide
const SECTION = /^[ \t]*<\/?section[\s>]/m;

// the first line and the number of lines of each multiline slide of lines by its text, with the
// first line -1 for a text that occurs more than once
function slidesOf(lines: string[]): Map<string, number[]> {
  const out = new Map<string, number[]>(), open: number[] = [];
  lines.forEach((line, i) => {
    const t = line.trimStart();
    if (/^<section[\s>]/.test(t) && !t.includes('</section')) open.push(i);
    const from = t.startsWith('</section') ? open.pop() ?? -1 : -1;
    if (from < 0) return;
    const text = lines.slice(from, i + 1).join('');
    out.set(text, [out.has(text) ? -1 : from, i + 1 - from]);
  });
  return out;
}

// copies of a and b in which the lines of a slide that is moved from a to b are replaced by marks
// that match no line, hence the diff gives its removal and its insertion whole. a slide is moved
// when it occurs once in each, outside the longest run of such slides in the same order in both,
// counted in lines. null when no slide is moved
function markMoved(a: string[], b: string[]): [string[], string[]] | null {
  const inB = slidesOf(b);
  // a slide of a stack that is paired whole, which comes before it, moves or stays with the stack,
  // hence it is not weighed again
  let end = 0;
  const pairs = [...slidesOf(a)].map(([t, [from, n]]) => [from, inB.get(t)?.[0] ?? -1, n]).filter((p) => p.every((v) => v >= 0)).sort((p, q) => p[0] - q[0]).filter(([from, , n]) => from >= end && (end = from + n));
  // the heaviest run in the same order, by dynamic programming over the slides
  const best = pairs.map((p) => p[2]), prev = pairs.map(() => -1);
  pairs.forEach((p, i) => pairs.forEach((q, j) => {
    if (j < i && q[1] < p[1] && best[j] + p[2] > best[i]) [best[i], prev[i]] = [best[j] + p[2], j];
  }));
  const kept = new Set<number>();
  for (let i = best.indexOf(Math.max(...best)); i >= 0; i = prev[i]) kept.add(i);
  if (kept.size === pairs.length) return null;
  const x = [...a], y = [...b];
  pairs.forEach(([from, to, n], i) => {
    for (let k = 0; k < n && !kept.has(i); k++) [x[from + k], y[to + k]] = ['\0a', '\0b'];
  });
  return [x, y];
}

// the changes that turn base into theirs, as edits of base in the order of the file. null when
// the texts are too far apart to be one file, i.e. when the diff is given up or the changes replace
// more than half of base, e.g. for an empty file or another deck. a plain diff skips moved slides
export function changes(base: string, theirs: string, plain?: boolean): Edit[] | null {
  if (base === theirs) return [];
  // a change within one line is the part between the shared start and end, as the line diff
  // narrows it, and the lines of the whole text are not split
  const [head, tail] = shared(base, theirs);
  const end = base.length - tail;
  const text = theirs.slice(head, theirs.length - tail);
  if (!base.slice(head, end).includes('\n') && !text.includes('\n')) return end - head > base.length / 2 ? null : [{ start: head, end, text }];
  const a = linesOf(base), b = linesOf(theirs);
  let x = a, y = b, pre = 0, suf = 0;
  const trim = () => {
    pre = suf = 0;
    while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
    while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  };
  trim();
  // a slide is looked for as moved only when both hold as many slides where they differ, hence not
  // when a slide is copied and the slide copied is changed
  const slides = (l: string[]) => l.slice(pre, l.length - suf).join('').split(SECTION).length;
  const moved = !plain && slides(a) > 1 && slides(a) === slides(b) && markMoved(a, b);
  if (moved) {
    [x, y] = moved;
    trim();
  }
  const hunks = diff(x.slice(pre, x.length - suf), y.slice(pre, y.length - suf), MAX_LINES);
  if (!hunks) return null;
  const oa = offsets(a), ob = offsets(b);
  const out: Edit[] = [];
  let removed = 0;
  for (const h of hunks) {
    let start = oa[pre + h.a0], end = oa[pre + h.a1];
    let text = theirs.slice(ob[pre + h.b0], ob[pre + h.b1]);
    // each hunk is narrowed to the characters that differ, hence a change of one text on a line
    // does not overlap an edit of another text on the same line
    const old = base.slice(start, end);
    let p = 0;
    while (p < old.length && p < text.length && old[p] === text[p]) p++;
    let s = 0;
    while (s < old.length - p && s < text.length - p && old[old.length - 1 - s] === text[text.length - 1 - s]) s++;
    start += p;
    end -= s;
    text = text.slice(p, text.length - s);
    removed += end - start;
    out.push({ start, end, text });
  }
  // the marks count only when each of their hunks is the half of a move of equal lines, and the
  // texts are diffed again without them otherwise, unless the texts have no diff without them, e.g.
  // after slides moved past each other that the mover types in
  if (moved) {
    const m = movesIn(base, out, false).flatMap((v) => v.was);
    if (hunks.some((h, i) => !m.includes(out[i]) && /\0/.test(`${x.slice(pre + h.a0, pre + h.a1)}${y.slice(pre + h.b0, pre + h.b1)}`))) return changes(base, theirs, true) ?? out;
  }
  // a moved slide is in both texts, which are thus one file
  return removed > base.length / 2 && !moved ? null : out;
}

// a and b overlap when they share a character, or when one of them is an insertion inside the
// other or at one of its ends
export function overlaps(a: Edit, b: Edit): boolean {
  if (a.start < b.end && b.start < a.end) return true;
  return (a.start === a.end || b.start === b.end) && a.start <= b.end && b.start <= a.end;
}

// a and b clash when they share a character, or when one of them is an insertion strictly inside
// the other, which is the rule of conflict() in src/session/patch.ts, by which the authority of a
// session refuses an operation
export function clash(a: Edit, b: Edit): boolean {
  if (a.start < b.end && b.start < a.end) return true;
  return (a.start === a.end && b.start < a.start && a.start < b.end) || (b.start === b.end && a.start < b.start && b.start < a.end);
}

// base with edits that do not overlap
export function apply(base: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let text = base;
  for (const e of sorted) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  return text;
}

// the changes that turn base into theirs, or else one change from the first character in which
// they differ to the last, hence no change is dropped
export function edits(base: string, theirs: string): Edit[] {
  const found = changes(base, theirs);
  if (found) return found;
  const n = Math.min(base.length, theirs.length);
  let s = 0;
  while (s < n && base[s] === theirs[s]) s++;
  let t = 0;
  while (t < n - s && base[base.length - 1 - t] === theirs[theirs.length - 1 - t]) t++;
  return [{ start: s, end: base.length - t, text: theirs.slice(s, theirs.length - t) }];
}

// a move of a list of edits: removals of whole lines, cuts, in the order of base, whose lines are
// written in the insertion put, also with changes of the mover in them. was holds the edits of the
// list that cuts and put are turned from, see turn()
type Move = { cuts: Edit[]; put: Edit; was: Edit[] };

// a text with words outside tags, i.e. not an empty list item
const WORDED = /(^|>)[^<]*[^\s<]/;
const flat = (s: string) => s.replace(/\s*\n\s*/g, '\n').trim();
// the words of a text outside its tags, with each CJK character a word
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}';
const WORD = new RegExp(`[${CJK}]|(?:(?![${CJK}])[\\p{L}\\p{N}])+`, 'gu');
const wordsOf = (s: string) => s.replace(/<[^<>]*>/g, ' ').match(WORD) ?? [];

// whether every tag of s that s closes somewhere is closed after it is opened and before s ends
function balanced(s: string): boolean {
  const closed = new Set([...s.matchAll(/<\/([\w-]+)/g)].map((m) => m[1].toLowerCase())), depth = new Map<string, number>();
  for (const m of s.matchAll(/<(\/?)([\w-]+)(?:[^<>"']|"[^"]*"|'[^']*')*?(\/?)>/g)) {
    const name = m[2].toLowerCase(), d = (depth.get(name) ?? 0) + (m[1] ? -1 : 1);
    if (!closed.has(name) || m[3]) continue;
    if (d < 0) return false;
    depth.set(name, d);
  }
  return [...depth.values()].every((d) => d === 0);
}

// a removal or an insertion of whole lines turned over the equal lines next to it until its text is
// balanced, e.g. a slide that the diff removes from its heading to the start tag of the next slide,
// which is the same removal. e itself when no turn is balanced
function turn(base: string, e: Edit): Edit {
  const cut = !e.text;
  const text = cut ? base.slice(e.start, e.end) : e.text;
  if ((base[e.start - 1] ?? '\n') !== '\n' || !text.endsWith('\n') || (cut && e.end === e.start) || (!cut && e.start !== e.end) || balanced(text)) return e;
  const lines = linesOf(text);
  for (const way of [-1, 1]) {
    let at = e.start, t = lines;
    for (let k = 0; k < lines.length; k++) {
      const end = cut ? at + t.join('').length : at;
      const line = way < 0 ? base.slice(base.lastIndexOf('\n', at - 2) + 1, at) : base.slice(end, base.indexOf('\n', end) + 1 || base.length);
      if (!line || line !== (way < 0 ? t[t.length - 1] : t[0])) break;
      t = way < 0 ? [line, ...t.slice(0, -1)] : [...t.slice(1), line];
      at += way * line.length;
      const out = cut ? { start: at, end: at + text.length, text: '' } : { start: at, end: at, text: t.join('') };
      if (balanced(t.join(''))) return out;
    }
  }
  return e;
}

// the moves of list. a removal and an insertion whose lines are equal once trimmed are a move, and
// lines that two removals or two insertions hold are never moved, since it is not known which one
// moved. a removal, or a run of them, and an insertion that keeps more than half of its words in
// their order, and not the words of another removal, are a move as well, e.g. a slide that the
// mover also types in, when the tags of both are whole, unless fuzzy is false
function movesIn(base: string, list: Edit[], fuzzy = true): Move[] {
  const cut = new Map<string, Edit | null>(), put = new Map(cut), was = new Map<Edit, Edit>();
  for (const x of list) {
    const e = turn(base, x);
    // a turn onto another edit of the list is not taken
    if (e !== x && list.some((f) => f !== x && (e.text ? clash(e, f) || (f.start === f.end && f.start === e.start) : overlaps(e, f)))) continue;
    was.set(e, x);
    const w = !e.text && e.end > e.start && (base[e.start - 1] ?? '\n') + base[e.end - 1] === '\n\n', by = w ? cut : put;
    const t = flat(w ? base.slice(e.start, e.end) : e.start === e.end ? e.text : '');
    if (WORDED.test(t)) by.set(t, by.has(t) ? null : e);
  }
  const of = (cuts: Edit[], put: Edit): Move => ({ cuts, put, was: [...cuts, put].map((e) => was.get(e)!) });
  const out: Move[] = [], used = new Set<Edit>();
  for (const [t, f] of put) {
    let r = t + '\n';
    const g: Edit[] = [];
    for (const [k, e] of cut) if (e && r.startsWith(k + '\n')) r = r.slice(g.push(e) && k.length + 1);
    if (f && !r) {
      out.push(of(g, f));
      for (const e of [...g, f]) used.add(e);
    }
  }
  // the runs of the removals left, in their order, scored by the words that the insertion keeps
  // less those that it does not keep
  const cuts = [...cut.values()].filter((e): e is Edit => !!e && !used.has(e)).sort((a, b) => a.start - b.start);
  if (!fuzzy || cuts.length > 8) return out;
  for (const f of put.values()) {
    if (!f || used.has(f) || !cuts.length || !balanced(f.text)) continue;
    const words = wordsOf(f.text);
    let best: Edit[] = [], score = 0;
    for (let i = 0; i < cuts.length; i++) for (let j = i; j < cuts.length; j++) {
      if (cuts.slice(i, j + 1).some((e) => used.has(e))) break;
      if (!balanced(cuts.slice(i, j + 1).map((e) => base.slice(e.start, e.end)).join(''))) continue;
      const mine = cuts.slice(i, j + 1).flatMap((e) => wordsOf(base.slice(e.start, e.end)));
      const hunks = diff(mine, words, MAX_LINES) ?? [];
      const gone = hunks.reduce((n, h) => n + h.a1 - h.a0, 0), added = ` ${hunks.flatMap((h) => words.slice(h.b0, h.b1)).join(' ')} `;
      // the words of another removal in the insertion are moved with it
      if (cuts.some((e, k) => (k < i || k > j) && wordsOf(base.slice(e.start, e.end)).length && added.includes(` ${wordsOf(base.slice(e.start, e.end)).join(' ')} `))) continue;
      if (mine.length - 2 * gone > score) [best, score] = [cuts.slice(i, j + 1), mine.length - 2 * gone];
    }
    if (!best.length) continue;
    out.push(of(best, f));
    best.forEach((e) => used.add(e));
  }
  return out;
}

// the edits of each move of list that an edit of others clashes with. with others the list
// itself, every move of the list
export function moves(base: string, list: Edit[], others: Edit[], hit: (a: Edit, b: Edit) => boolean = () => true): Edit[] {
  return movesIn(base, list).flatMap(({ was }) => (others === list || was.some((x) => others.some((o) => hit(x, o))) ? was : []));
}

// the offset o of a moved onto b with the edits m that turn a into b, after an insertion at o when
// after is true. null for an offset inside a change
function through(m: Edit[], o: number, after: boolean): number | null {
  let d = 0;
  for (const e of m) {
    if (e.end < o || (e.end === o && (e.start < e.end || after))) d += e.text.length - (e.end - e.start);
    else if (e.start < o) return null;
  }
  return o + d;
}

// the offset in b of the offset o of a, where b is a with its lines moved, reindented, or changed
// in part, read from the characters of both, or from their lines when they differ in more than 500
// characters. a line of a is then found in b among the lines equal to it once trimmed, or as the
// line at its place in a run of changed lines as long in both, whose characters are then diffed.
// null for an offset inside a change
function across(a: string, b: string, o: number, after: boolean): number | null {
  const m = charEdits(a, b, 500);
  if (m) return through(m, o, after);
  const la = linesOf(a), lb = linesOf(b), oa = offsets(la), ob = offsets(lb);
  const hunks = diff(la.map((l) => l.trim()), lb.map((l) => l.trim()), MAX_LINES);
  if (!hunks) return null;
  // the line of o, where the end of a is the end of its last line
  let i = 0;
  while (i < la.length - 1 && oa[i + 1] <= o) i++;
  let j = i;
  for (const h of hunks) {
    if (h.a1 <= i) j += h.b1 - h.b0 - (h.a1 - h.a0);
    else if (h.a0 <= i) {
      if (h.a1 - h.a0 !== h.b1 - h.b0) return null;
      j = h.b0 + i - h.a0;
      const col = through(charEdits(la[i], lb[j], 500) ?? [{ start: 0, end: la[i].length, text: lb[j] }], o - oa[i], after);
      return col === null ? null : ob[j] + col;
    }
  }
  if (j >= lb.length) return null;
  // the column of o in its line without the white space at its ends, which a move may change
  const col = o - oa[i], lead = la[i].length - la[i].trimStart().length, body = la[i].trim().length;
  const lead2 = lb[j].length - lb[j].trimStart().length;
  if (col === 0) return ob[j];
  if (col <= lead) return ob[j] + lead2;
  if (col >= lead + body) return ob[j + 1] - (la[i].length - col);
  return ob[j] + lead2 + col - lead;
}

// a with each move given the edits of b inside its removals, written into its insertion at the
// same text, and b without them. an edit that cannot be found in the insertion with the same text
// around it, e.g. one in a word that the mover changed, stays in b
export function carry(base: string, a: Edit[], b: Edit[]): [Edit[], Edit[]] {
  let rest = b;
  const now = new Map<Edit, Edit>();
  for (const { cuts, put, was } of movesIn(base, a)) {
    const src = cuts.map((c) => base.slice(c.start, c.end)).join('');
    const into: Edit[] = [], taken = new Set<Edit>();
    let at = 0;
    for (const c of cuts) {
      for (const x of rest) {
        if (x.start < c.start || x.end > c.end || !clash(x, c)) continue;
        const o = at + x.start - c.start, s = across(src, put.text, o, true), e = x.end > x.start ? across(src, put.text, o + x.end - x.start, false) : s;
        if (s === null || e === null || e < s || flat(put.text.slice(s, e)) !== flat(src.slice(o, o + x.end - x.start))) continue;
        into.push({ start: s, end: e, text: x.text });
        taken.add(x);
      }
      at += c.end - c.start;
    }
    // an edit of b that the move cannot take, e.g. a cut of the same slide at other lines, leaves
    // the move to stay(), with the edits of b inside it. the same cut is the same removal
    const left = rest.filter((x) => !taken.has(x));
    if (left.some((x) => [...cuts, put].some((e) => clash(x, e) && !(e !== put && equal(x, e))))) continue;
    rest = left;
    // the move is taken as turned, which is the same text
    [...cuts, into.length ? { ...put, text: apply(put.text, into) } : put].forEach((e, i) => now.set(was[i], e));
  }
  return [now.size ? a.map((e) => now.get(e) ?? e).sort((x, y) => x.start - y.start || x.end - y.end) : a, rest];
}

// list with each move in it that an edit of others clashes with undone: its cuts and put are
// replaced by the changes that the mover made in the moved text, each cut with the part of put that
// its text is in. true when a move is undone. hit tells a clash, e.g. conflict() in
// src/session/patch.ts
export function stay(base: string, list: Edit[], others: Edit[], hit: (a: Edit, b: Edit) => boolean = clash): [Edit[], boolean] {
  const gone = new Map<Edit, Edit[]>();
  for (const { cuts, put, was } of movesIn(base, list)) {
    if (!was.some((x) => others.some((o) => hit(x, o)))) continue;
    const src = cuts.map((c) => base.slice(c.start, c.end)).join('');
    let at = 0, from = 0;
    const kept = cuts.flatMap((c, i) => {
      at += c.end - c.start;
      const to = i === cuts.length - 1 ? put.text.length : Math.max(from, across(src, put.text, at, false) ?? across(src, put.text, at, true) ?? from);
      const old = base.slice(c.start, c.end), now = put.text.slice(from, to);
      from = to;
      return (charEdits(old, now, 500) ?? [{ start: 0, end: old.length, text: now }]).map((e) => ({ start: c.start + e.start, end: c.start + e.end, text: e.text }));
    });
    was.forEach((e, i) => gone.set(e, i ? [] : kept));
  }
  return [list.flatMap((e) => gone.get(e) ?? [e]).sort((x, y) => x.start - y.start || x.end - y.end), gone.size > 0];
}

const equal = (a: Edit, b: Edit) => a.start === b.start && a.end === b.end && a.text === b.text;

// the start tags at the start of s, the text after them, and the end tags at its end
function tagged(s: string): [string, string, string] {
  const open = /^(?:<[A-Za-z](?:[^<>"']|"[^"]*"|'[^']*')*>)*/.exec(s)![0];
  const rest = s.slice(open.length);
  const close = /(?:<\/[^<>]+>)*$/.exec(rest)![0];
  return [open, rest.slice(0, rest.length - close.length), close];
}

type Form = { pre: string; open: string; inner: string; close: string; post: string; lo: number; hi: number };

// the parts of e when it puts start and end tags around the run of base that it replaces, or takes
// them off it, e.g. italic or a link put on or taken off. lo to hi is the run without its own
// start and end tags, and e writes it as inner between its tags open and close, either as it is or
// as plain text with keys of its own. pre and post are plain text that e puts before and after,
// e.g. a key next to the new element
function around(base: string, e: Edit): Form | null {
  const run = base.slice(e.start, e.end);
  const tags = e.text.includes('<');
  const pre = tags ? e.text.slice(0, e.text.indexOf('<')) : '';
  const post = tags ? e.text.slice(e.text.lastIndexOf('>') + 1) : '';
  const [open, inner, close] = tagged(e.text.slice(pre.length, e.text.length - post.length));
  const [was, old, shut] = tagged(run);
  if ((open === was && close === shut) || (inner !== old && (inner + old).includes('<'))) return null;
  return { pre, open, inner, close, post, lo: e.start + was.length, hi: e.end - shut.length };
}

// a with each format in it that clashes only with edits of plain text of b inside its run, e.g.
// keys typed in a word that a makes italic, given these edits in its text, and b without them.
// first is true when a is ordered first, whose insertion then comes first at one point
function absorb(base: string, a: Edit[], b: Edit[], first: boolean): [Edit[], Edit[]] {
  let rest = b;
  const out = a.map((w) => {
    const f = around(base, w);
    const hits = f ? rest.filter((e) => clash(w, e)) : [];
    if (!f || !hits.length || !hits.every((e) => f.lo <= e.start && e.end <= f.hi && !(e.text + base.slice(e.start, e.end)).includes('<'))) return w;
    const old = base.slice(f.lo, f.hi);
    const own = fine(old, f.inner);
    const others = hits.map((e) => ({ start: e.start - f.lo, end: e.end - f.lo, text: e.text }));
    const run = first ? mergeEdits(old, others, own, 'ours', true) : mergeEdits(old, own, others, 'ours', true);
    // a run that the edits remove, and edits that clash inside it, are left as a conflict
    if (!run.text || run.conflicts.length) return w;
    rest = rest.filter((e) => !hits.includes(e));
    return { start: w.start, end: w.end, text: f.pre + f.open + run.text + f.close + f.post };
  });
  return [out, rest];
}

// two lists of edits of base in which a format of one list and the edits of plain text of the other
// list inside the run of this format no longer clash: the format holds these edits, and the other
// list is left without them. both are thus kept by a merge. two formats of one run, a format
// inside a run, and a removal of the whole run clash as before. first is true when a is ordered
// first at a tie
export function nest(base: string, a: Edit[], b: Edit[], first = false): [Edit[], Edit[]] {
  const [x, y] = absorb(base, a, b, first);
  const [v, u] = absorb(base, y, x, !first);
  return [u, v];
}

// the edits of the page, ours, written into theirs. a change of the file equal to an edit of the
// page is taken once. at a conflict, the edit of the page is kept with prefer set to ours, and the
// change of the file with prefer set to theirs, and every edit and change outside a conflict is
// kept. null when theirs is not the same file as base
export function merge(base: string, ours: Edit[], theirs: string, prefer: 'ours' | 'theirs'): Merge | null {
  const all = changes(base, theirs);
  return all && mergeEdits(base, ours, all, prefer);
}

// a deletion d in the list own moved to end or to start at an insertion of others strictly inside
// it, where base reads the same and no other edit is hit, e.g. 'le stab' of 'unstable stable',
// which the diff may give as 'stable ', and an insertion before ' point'. d itself when it cannot
// be moved. the text of a moved deletion is the text of d, hence its markup stays whole
function slid(base: string, d: Edit, own: Edit[], others: Edit[]): Edit {
  const at = d.text ? undefined : others.find((e) => e.start === e.end && d.start < e.start && e.start < d.end)?.start;
  if (at === undefined) return d;
  // a move whose ends cut a tag or a character reference of base is refused
  const fits = (m: Edit) => {
    const [w] = widen(base, [m]);
    return w.start === m.start && w.end === m.end && ![...own, ...others].some((o) => o !== d && clash(o, m));
  };
  // a letter before the start or past the end of base is undefined, and stops the move
  let left = true, right = true;
  for (let i = 1; left && i <= d.end - at; i++) left = base[d.start - i] === base[d.end - i];
  const l = { start: d.start - (d.end - at), end: at, text: '' };
  if (left && fits(l)) return l;
  for (let i = 0; right && i < at - d.start; i++) right = base[d.start + i] === base[d.end + i];
  const r = { start: at, end: d.end + (at - d.start), text: '' };
  return right && fits(r) ? r : d;
}

// the same merge with the changes of the file, all, given as edits of base. with apart, an edit
// and a change conflict only when they clash, and of two insertions at one point the change comes
// first, as the authority of a session orders the operation that arrived first. a format and the
// edits of plain text inside its run are then both kept, see nest(). with twice, an
// edit equal to a change is kept as well, e.g. the same letter typed at one point by two people,
// when it is the only such edit and an insertion. several equal edits are one change that the diff
// split, e.g. a word replaced by the same word, which is taken once
export function mergeEdits(base: string, ours: Edit[], all: Edit[], prefer: 'ours' | 'theirs', apart = false, twice = false): Merge {
  if (apart) {
    // the edits of each side inside a move of the other side go with the move, the received side
    // first, hence of two moves of one text the later one is kept
    [all, ours] = carry(base, all, ours);
    [ours, all] = carry(base, ours, all);
    [ours, all] = nest(base, ours, all);
    // a move in a session that a change inside the moved element clashes with is undone, with the
    // changes of the mover kept in place, hence the element is neither doubled nor a change lost. it
    // is found before slid() moves the removal of the move off the change
    const others = all.filter((h) => !ours.some((o) => equal(o, h)));
    const [mine, a] = stay(base, ours, others), [theirs, b] = stay(base, others, ours);
    if (a || b) return mergeEdits(base, mine, [...theirs, ...all.filter((h) => !others.includes(h))].sort((x, y) => x.start - y.start || x.end - y.end), prefer, apart, twice);
    ours = ours.map((d) => slid(base, d, ours, all));
    all = all.map((d) => slid(base, d, all, ours));
  }
  const hit = apart ? clash : overlaps;
  const both = ours.filter((o) => all.some((h) => equal(o, h)));
  const keys = twice && both.length === 1 && both[0].start === both[0].end;
  const same = (a: Edit, b: Edit) => !keys && equal(a, b);
  const others = all.filter((h) => !ours.some((o) => same(o, h)));
  const conflicts = ours.filter((o) => others.some((h) => hit(o, h)));
  const keptTheirs = prefer === 'theirs' ? all : all.filter((h) => !conflicts.some((o) => hit(o, h)));
  const keptOurs = (prefer === 'ours' ? ours : ours.filter((o) => !conflicts.includes(o))).filter((o) => !keptTheirs.some((h) => same(o, h)));
  return { text: apply(base, [...keptOurs, ...keptTheirs]), conflicts };
}

// the edits that turn a into b, one per run of changed characters, found with the Myers algorithm
// over the UTF-16 units between the start and the end that they share. null when more than max
// units differ there and both texts have units there
export function charEdits(a: string, b: string, max: number): Edit[] | null {
  const [head, tail] = shared(a, b);
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  if (!x || !y) return x === y ? [] : [{ start: head, end: a.length - tail, text: y }];
  const hunks = diff(x, y, max);
  return hunks && hunks.map((h) => ({ start: head + h.a0, end: head + h.a1, text: y.slice(h.b0, h.b1) }));
}

// the most pairs of units that anchored() compares, which take it about 4 ms on a laptop
const CELLS = 1 << 20;

// t.indexOf(p) by Knuth-Morris-Pratt at a cost linear in both, since indexOf in V8 takes time
// quadratic in the length of p on a text of a short period, e.g. a run of one letter
function find(t: string, p: string): number {
  const back = new Int32Array(p.length + 1);
  back[0] = -1;
  for (let i = 0, k = -1; i < p.length; back[++i] = ++k) while (k >= 0 && p.charCodeAt(k) !== p.charCodeAt(i)) k = back[k];
  let i = 0;
  for (let k = 0; k < p.length; i++, k++) {
    if (i === t.length) return -1;
    while (k >= 0 && p.charCodeAt(k) !== t.charCodeAt(i)) k = back[k];
  }
  return i - p.length;
}

// the edits that turn a into b around the longest run of units that the parts between their shared
// start and end have in common, with the parts before and after the run diffed by charEdits(), e.g.
// for the old text of a paragraph after a long paste and a key at its end. null when the parts are
// too long to compare or have no unit in common. a side that differs in more than 500 units is
// anchored again within the cells left, or else is one edit
function anchored(a: string, b: string): Edit[] | null {
  const [head, tail] = shared(a, b);
  const whole: [number, string, string] = [head, a.slice(head, a.length - tail), b.slice(head, b.length - tail)];
  // the parts left to diff, each at its offset in a, with the next part in the order of a last
  const parts = [whole], out: Edit[] = [];
  let cells = CELLS;
  for (let part = parts.pop(); part; part = parts.pop()) {
    const [at, x, y] = part;
    // charEdits() gives up on whole in fine(), and on a part whose sides differ in length by over 500
    const tried = part !== whole && Math.abs(x.length - y.length) <= 500;
    const found = tried ? charEdits(x, y, 500) : null;
    if (found) {
      out.push(...found.map((e) => ({ start: e.start + at, end: e.end + at, text: e.text })));
      continue;
    }
    // a charEdits() that gives up has made about 500 rounds over both sides, which are taken from
    // the cells, hence a chain of parts that each give up ends within the budget
    if (tried) cells -= 500 * (x.length + y.length);
    let best = 0, bx = 0, by = 0;
    // a side that holds the other whole, e.g. a paste around a run that did not change, is split at
    // its first occurrence, which the cells would give as well, at linear cost
    const k = find(y, x), j = k < 0 ? find(x, y) : -1;
    if (k >= 0) [best, bx, by] = [x.length, 0, k];
    else if (j >= 0) [best, bx, by] = [y.length, j, 0];
    else if (x.length * y.length <= cells) {
      cells -= x.length * y.length;
      let prev = new Uint32Array(y.length + 1), row = new Uint32Array(y.length + 1);
      for (let i = 1; i <= x.length; i++) {
        for (let j = 1; j <= y.length; j++) {
          const v = x.charCodeAt(i - 1) === y.charCodeAt(j - 1) ? prev[j - 1] + 1 : 0;
          row[j] = v;
          if (v > best) [best, bx, by] = [v, i - v, j - v];
        }
        [prev, row] = [row, prev];
      }
    }
    if (best) parts.push([at + bx + best, x.slice(bx + best), y.slice(by + best)], [at, x.slice(0, bx), y.slice(0, by)]);
    else if (part === whole) return null;
    else out.push({ start: at, end: at + x.length, text: y });
  }
  return out;
}

const WORDS = /\w+|\s+|[^\w\s]+/g;

// the edits that turn a into b, one per run of changed words, each narrowed to the characters that
// differ, found with the Myers algorithm over the words, spaces, and runs of other characters
// between the start and the end that a and b share. null when more than max of them differ
function wordEdits(a: string, b: string, max: number): Edit[] | null {
  const [head, tail] = shared(a, b);
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  const xs = x.match(WORDS) ?? [], ys = y.match(WORDS) ?? [];
  const hunks = diff(xs, ys, max);
  if (!hunks) return null;
  const ox = offsets(xs), oy = offsets(ys);
  return hunks.map((h) => {
    const old = x.slice(ox[h.a0], ox[h.a1]), text = y.slice(oy[h.b0], oy[h.b1]);
    const [p, s] = shared(old, text);
    return { start: head + ox[h.a0] + p, end: head + ox[h.a1] - s, text: text.slice(p, text.length - s) };
  });
}

// the edits that turn a into b for a merge of a session, one per run of changed characters, also
// around the longest run in common past 500 changed units, e.g. for a paste, or one per run of
// changed words where the parts are too long for anchored(), or of changed lines past 250 changed
// words. an edit is widened so that it cuts neither a tag nor a character reference of b, nor one
// of a, as the authority widens a patch, and a start tag and its end tag that b puts around a run
// are one edit over the run. a merge thus never writes into a tag that neither side wrote, and a
// key before a word that another person makes bold stays before the new element
export function fine(a: string, b: string): Edit[] {
  const chars = charEdits(a, b, 500);
  let found = chars ?? anchored(a, b) ?? wordEdits(a, b, 250) ?? edits(a, b);
  // a move, which mergeEdits() tells apart, as the removal and the insertion of its lines. it is
  // looked for only when the character edits remove some text and are several or cross a line, and
  // every other change stays as its runs of characters, hence a key between two of them is apart
  // from both. the edits are kept only when mergeEdits() reads each move in them as a move as well
  if (chars?.some((e) => e.end > e.start) && (chars[1] || /\n/.test(chars[0].text + a.slice(chars[0].start, chars[0].end)))) {
    const lines = changes(a, b) ?? [];
    const moved = moves(a, lines, lines);
    if (moved[0]) {
      // the other changes as the character edits of the whole text, hence as the person who makes
      // them alone, e.g. a removal of a line that another person removes as well, unless they
      // reach into a move
      const rest = charEdits(a, apply(a, lines.filter((e) => !moved.includes(e))), 500);
      const apart = rest?.every((x) => moved.every((e) => x.end < e.start || x.start > e.end));
      const out = apart ? [...moved, ...rest!].sort((x, y) => x.start - y.start || x.end - y.end) : lines.flatMap((e) => (moved.includes(e) ? [e] : charEdits(a.slice(e.start, e.end), e.text, 500)?.map((x) => ({ ...x, start: x.start + e.start, end: x.end + e.start })) ?? [e]));
      const read = moves(a, out, lines);
      if (moved.every((e) => read.includes(e))) found = out;
    }
  }
  if (!found.length) return found;
  // the edits as patches of b back to a, widened to the tokens of b, and turned around again
  let d = 0;
  const back = widen(b, found.map((e) => {
    const start = e.start + d;
    d += e.text.length - (e.end - e.start);
    return { start, end: start + e.text.length, text: a.slice(e.start, e.end) };
  }));
  d = 0;
  const out = widen(a, wraps(b, back.map((p) => {
    const start = p.start - d;
    d += p.end - p.start - p.text.length;
    return { start, end: start + p.text.length, text: b.slice(p.start, p.end) };
  })));
  // each edit without the letters that it keeps at its ends, e.g. the m of moon that the diff
  // matched with the m of <em>. widen() then makes whole again a tag that this cuts
  return widen(a, out.map((e) => {
    const [s, t] = shared(a.slice(e.start, e.end), e.text);
    return { start: e.start + s, end: e.end - t, text: e.text.slice(s, e.text.length - t) };
  }));
}

// the edits of a into b with each pair that wraps a run in a new element, i.e. a start tag in the
// new text of one and its end tag in the new text of a later one, joined into one edit over the run,
// as the authority reads a format. an insertion at the start of the run then goes before the element
function wraps(b: string, es: Edit[]): Edit[] {
  const at: number[] = [];
  let d = 0;
  for (const e of es) {
    at.push(e.start + d);
    d += e.text.length - (e.end - e.start);
  }
  const last = at[at.length - 1] + es[es.length - 1].text.length;
  const out: Edit[] = [];
  for (let i = 0; i < es.length; i++) {
    let k = i;
    for (const m of es[i].text.matchAll(/<([A-Za-z][\w:-]*)(?:\s[^<>]*)?>/g)) {
      const tag = new RegExp(`<(/?)${m[1]}(?=[\\s/>])[^<>]*>`, 'gi');
      tag.lastIndex = at[i] + m.index + m[0].length;
      let depth = 1, end: RegExpExecArray | null = null;
      for (let t = tag.exec(b); t && t.index < last; t = tag.exec(b)) if ((depth += t[1] ? -1 : 1) === 0) {
        end = t;
        break;
      }
      if (!end) continue;
      for (let j = i + 1; j < es.length; j++) if (at[j] <= end.index && end.index + end[0].length <= at[j] + es[j].text.length) k = Math.max(k, j);
    }
    out.push(k === i ? es[i] : { start: es[i].start, end: es[k].end, text: b.slice(at[i], at[k] + es[k].text.length) });
    i = k;
  }
  return out;
}

// the most units in which another person may have changed a text that revert() is given
const OTHERS = 500;

// the offset in text of the at-th character of its copy with each &nbsp; read as one space
const real = (text: string, at: number): number => {
  let i = 0;
  for (let c = 0; c < at; c++) i += text.startsWith('&nbsp;', i) ? 6 : 1;
  return i;
};

// now with the change that turns base into target made again, where now is base with the edits
// of other people, e.g. an undo of the typing of the person over the keys of another person. the
// change is one span of base, found by the start and the end that base and target share, on copies
// in which &nbsp; reads as a space, since the browser rewrites a space beside the typing. an edit
// of others before the span moves it, and one after it is left as it is. the diff places an
// insertion among repeated letters at any of them, hence an insertion inside the span is taken
// before it or after it where the span then reads as in base. the span may also be rotated over
// equal letters at its ends, e.g. " big" or "big " before a space, and each rotation must give the
// same text. null when an edit of others overlaps the span otherwise, when the span or an
// insertion of others beside it can be read in two places that give different texts, when an edit
// of others at an end of the span can be slid over equal letters into it, when the diff of the
// reversed texts gives another text, or when the edits of others are too many to diff
export function revert(base: string, target: string, now: string): string | null {
  if (now === base) return target;
  const b = base.replaceAll('&nbsp;', ' '), t = target.replaceAll('&nbsp;', ' '), n = now.replaceAll('&nbsp;', ' ');
  if (b === t) return now;
  // a diff may read a removal and an insertion of equal letters on either side of the span, where
  // the diff of the reversed texts reads them the other way round. both must give the same text
  const rev = (s: string) => s.split('').reverse().join('');
  const ahead = charEdits(b, n, OTHERS), back = charEdits(rev(b), rev(n), OTHERS);
  if (!ahead || !back) return null;
  const one = over(ahead, target, now, b, t, n);
  const two = one === null ? null : over(back.reverse().map((e) => ({ start: b.length - e.end, end: b.length - e.start, text: rev(e.text) })), target, now, b, t, n, false);
  return two !== null && one!.replaceAll('&nbsp;', ' ') === two.replaceAll('&nbsp;', ' ') ? one : null;
}

// revert() with the edits others of other people that turn b into n, read by one diff. slid is
// false for the diff of the reversed texts, which puts an edit at the other end of a run of equal
// letters, where slides() would refuse it
function over(others: Edit[], target: string, now: string, b: string, t: string, n: string, slid = true): string | null {
  const [head, tail] = shared(b, t);
  let all = tail;
  while (all < b.length && all < t.length && b[b.length - 1 - all] === t[t.length - 1 - all]) all++;
  if (slid && slides(others, b, head - Math.min(head, all - tail), b.length - tail)) return null;
  let got: string | null = null;
  for (let k = 0; k <= Math.min(head, all - tail); k++) {
    const s = head - k, e = b.length - tail - k;
    const p = place(others, b, n, s, e);
    if (p < 0) return null;
    // an insertion of others beside the span that the span can be read across is not told apart
    // from the same letters typed by the person
    const span = b.slice(s, e), rest = n.slice(0, p) + n.slice(p + span.length);
    for (const o of others) {
      if (o.start !== o.end || (o.start !== s && o.start !== e)) continue;
      for (let j = 1; j <= o.text.length; j++) {
        const q = o.start === s ? p - j : p + j;
        if (n.slice(q, q + span.length) === span && n.slice(0, q) + n.slice(q + span.length) !== rest) return null;
      }
    }
    const out = now.slice(0, real(now, p)) + target.slice(real(target, s), real(target, t.length - tail - k)) + now.slice(real(now, p + span.length));
    if (got === null) got = out;
    else if (out.replaceAll('&nbsp;', ' ') !== got.replaceAll('&nbsp;', ' ')) return null;
  }
  return got;
}

// whether an edit of others at an end of the widest span [lo, hi) of b can be slid over equal
// letters into it, where the diff could have placed it as well, e.g. the removal of an s after
// "this", which is also the removal of the s of "this"
function slides(others: Edit[], b: string, lo: number, hi: number): boolean {
  return others.some((o) => {
    if (o.start !== hi && o.end !== lo) return false;
    let l = o.start, r = o.end;
    if (o.start === o.end) {
      for (let x = o.text; l > 0 && b[l - 1] === x.at(-1); l--) x = b[l - 1] + x.slice(0, -1);
      for (let x = o.text; r < b.length && b[r] === x[0]; r++) x = x.slice(1) + b[r];
    } else {
      while (l > 0 && b[l - 1] === b[o.end - 1 - (o.start - l)]) l--;
      while (r < b.length && b[r] === b[o.start + (r - o.end)]) r++;
    }
    return o.start === hi ? l < hi : r > lo;
  });
}

// the start in n of the span [s, e) of b, where n is b with the edits others, or -1 when one of
// them overlaps the span. the first m insertions inside the span are taken before it, from all of
// them to none, until the span reads as in b
function place(others: Edit[], b: string, n: string, s: number, e: number): number {
  let d = 0;
  const inside: number[] = [];
  for (const o of others) {
    if (o.end <= s) d += o.text.length - (o.end - o.start);
    else if (o.start >= e) break;
    else if (o.start === o.end) inside.push(o.text.length);
    else return -1;
  }
  for (let m = inside.length; m >= 0; m--) {
    const p = s + d + inside.slice(0, m).reduce((x, y) => x + y, 0);
    if (n.slice(p, p + e - s) === b.slice(s, e)) return p;
  }
  return -1;
}
