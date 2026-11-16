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

// the hunks that turn the lines a into the lines b, each the range a0 to a1 of a replaced by the
// range b0 to b1 of b, found with the Myers algorithm. null when more than max lines differ
function diff(a: string[], b: string[], max: number): Hunk[] | null {
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
    const from = t.startsWith('</section') ? open.pop() : undefined;
    if (from === undefined) return;
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
  const pairs = [...slidesOf(a)].map(([t, [from, n]]) => [from, inB.get(t)?.[0] ?? -1, n]).filter(([from, to]) => from >= 0 && to >= 0).sort((p, q) => p[0] - q[0]).filter(([from, , n]) => from >= end && (end = from + n));
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
// more than half of base, e.g. for an empty file or another deck
export function changes(base: string, theirs: string): Edit[] | null {
  if (base === theirs) return [];
  const a = linesOf(base), b = linesOf(theirs);
  let x = a, y = b, pre = 0, suf = 0;
  const trim = () => {
    pre = suf = 0;
    while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
    while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  };
  trim();
  const moved = SECTION.test(a.slice(pre, a.length - suf).join('') + b.slice(pre, b.length - suf).join('')) && markMoved(a, b);
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
  // a moved slide is in both texts, which are thus one file
  return removed > base.length / 2 && !moved ? null : out;
}

// a and b overlap when they share a character, or when one of them is an insertion inside the
// other or at one of its ends
export function overlaps(a: Edit, b: Edit): boolean {
  if (a.start < b.end && b.start < a.end) return true;
  return (a.start === a.end || b.start === b.end) && a.start <= b.end && b.start <= a.end;
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

// e and the edit of list that make a move of the line of base at offset at, i.e. e removes the line
// and the other edit inserts it elsewhere. null when e is not a part of such a move
export function moveOf(base: string, list: Edit[], e: Edit, at: number): Edit[] | null {
  if (e.start === e.end) return null;
  const p = Math.min(Math.max(at, e.start), e.end - 1);
  const end = base.indexOf('\n', p);
  const line = base.slice(Math.max(e.start, base.lastIndexOf('\n', p - 1) + 1), Math.min(e.end, end < 0 ? base.length : end)).trim();
  if (!line || e.text.includes(line)) return null;
  const f = list.find((x) => x !== e && x.text.split('\n').some((l) => l.trim() === line));
  return f ? [e, f] : null;
}

const equal = (a: Edit, b: Edit) => a.start === b.start && a.end === b.end && a.text === b.text;

// the edits of the page, ours, written into theirs. a change of the file equal to an edit of the
// page is taken once. at a conflict, the edit of the page is kept with prefer set to ours, and the
// change of the file with prefer set to theirs, and every edit and change outside a conflict is
// kept. null when theirs is not the same file as base
export function merge(base: string, ours: Edit[], theirs: string, prefer: 'ours' | 'theirs'): Merge | null {
  const all = changes(base, theirs);
  return all && mergeEdits(base, ours, all, prefer);
}

// the same merge with the changes of the file, all, given as edits of base. with shared set, only
// edits that share a character conflict, as in a session, see src/session/patch.ts. at an insertion
// of both sides at one point the change of the file comes first
export function mergeEdits(base: string, ours: Edit[], all: Edit[], prefer: 'ours' | 'theirs', shared = false): Merge {
  const hit = shared ? (a: Edit, b: Edit) => a.start < b.end && b.start < a.end : overlaps;
  const others = all.filter((h) => !ours.some((o) => equal(o, h)));
  const conflicts = ours.filter((o) => others.some((h) => hit(o, h)));
  // a move in a session that a change inside the moved element conflicts with is left out whole,
  // hence the element is neither doubled nor its change lost
  const moves = new Set<Edit>();
  if (shared) for (const o of conflicts) for (const h of others) if (hit(o, h)) for (const e of moveOf(base, ours, o, h.start) ?? moveOf(base, all, h, o.start) ?? []) moves.add(e);
  if (moves.size) return { text: mergeEdits(base, ours.filter((e) => !moves.has(e)), all.filter((e) => !moves.has(e)), prefer, shared).text, conflicts };
  const keptTheirs = prefer === 'theirs' ? all : all.filter((h) => !conflicts.some((o) => hit(o, h)));
  const keptOurs = (prefer === 'ours' ? ours : ours.filter((o) => !conflicts.includes(o))).filter((o) => !keptTheirs.some((h) => equal(o, h)));
  return { text: apply(base, [...keptOurs, ...keptTheirs]), conflicts };
}
