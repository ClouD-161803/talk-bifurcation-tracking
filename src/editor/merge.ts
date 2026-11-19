// a three-way merge of the edits of the page with a file changed since it was read, e.g. by an
// agent or by a git pull. the changes of the file are found with a line diff of the text that was
// read, base, and the text now in the file, theirs, and each change is narrowed to the characters
// that differ. an edit of the page is a conflict when it overlaps a change of the file. every
// range is in base

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
export function myers(a: ArrayLike<string>, b: ArrayLike<string>, max: number): Hunk[] | null {
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
  const hunks = myers(x.slice(pre, x.length - suf), y.slice(pre, y.length - suf), MAX_LINES);
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
      const hunks = myers(mine, words, MAX_LINES) ?? [];
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
  const hunks = myers(la.map((l) => l.trim()), lb.map((l) => l.trim()), MAX_LINES);
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

const equal = (a: Edit, b: Edit) => a.start === b.start && a.end === b.end && a.text === b.text;

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

// the edits of the page, ours, written into theirs. a change of the file equal to an edit of the
// page is taken once. at a conflict, the edit of the page is kept with prefer set to ours, and the
// change of the file with prefer set to theirs, and every edit and change outside a conflict is
// kept. null when theirs is not the same file as base
export function merge(base: string, ours: Edit[], theirs: string, prefer: 'ours' | 'theirs'): Merge | null {
  const all = changes(base, theirs);
  return all && mergeEdits(base, ours, all, prefer);
}

// the same merge with the changes of the file, all, given as edits of base
export function mergeEdits(base: string, ours: Edit[], all: Edit[], prefer: 'ours' | 'theirs'): Merge {
  const others = all.filter((h) => !ours.some((o) => equal(o, h)));
  const conflicts = ours.filter((o) => others.some((h) => overlaps(o, h)));
  const keptTheirs = prefer === 'theirs' ? others : others.filter((h) => !conflicts.some((o) => overlaps(o, h)));
  const keptOurs = prefer === 'ours' ? ours : ours.filter((o) => !conflicts.includes(o));
  return { text: apply(base, [...keptOurs, ...keptTheirs]), conflicts };
}

// the edits that turn a into b, one per run of changed characters, found with the Myers algorithm
// over the UTF-16 units between the start and the end that they share. null when more than max
// units differ there and both texts have units there
export function charEdits(a: string, b: string, max: number): Edit[] | null {
  const [head, tail] = shared(a, b);
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  if (!x || !y) return x === y ? [] : [{ start: head, end: a.length - tail, text: y }];
  const hunks = myers(x, y, max);
  return hunks && hunks.map((h) => ({ start: head + h.a0, end: head + h.a1, text: y.slice(h.b0, h.b1) }));
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
