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

// the changes that turn base into theirs, as edits of base in the order of the file. null when
// the texts are too far apart to be one file, i.e. when the diff is given up or the changes replace
// more than half of base, e.g. for an empty file or another deck
export function changes(base: string, theirs: string): Edit[] | null {
  if (base === theirs) return [];
  // a change within one line is the part between the shared start and end, as the line diff
  // narrows it, and the lines of the whole text are not split
  const [head, tail] = shared(base, theirs);
  const end = base.length - tail;
  const text = theirs.slice(head, theirs.length - tail);
  if (!base.slice(head, end).includes('\n') && !text.includes('\n')) return end - head > base.length / 2 ? null : [{ start: head, end, text }];
  const a = linesOf(base), b = linesOf(theirs);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const hunks = diff(a.slice(pre, a.length - suf), b.slice(pre, b.length - suf), MAX_LINES);
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
  return removed > base.length / 2 ? null : out;
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

const equal = (a: Edit, b: Edit) => a.start === b.start && a.end === b.end && a.text === b.text;

// the edits of the page, ours, written into theirs. a change of the file equal to an edit of the
// page is taken once. at a conflict, the edit of the page is kept with prefer set to ours, and the
// change of the file with prefer set to theirs, and every edit and change outside a conflict is
// kept. null when theirs is not the same file as base
export function merge(base: string, ours: Edit[], theirs: string, prefer: 'ours' | 'theirs'): Merge | null {
  const all = changes(base, theirs);
  return all && mergeEdits(base, ours, all, prefer);
}

// the same merge with the changes of the file, all, given as edits of base. with apart, an edit
// and a change conflict only when they clash, and of two insertions at one point the change comes
// first, as the authority of a session orders the operation that arrived first. with twice, an
// edit equal to a change is kept as well, e.g. the same letter typed at one point by two people
export function mergeEdits(base: string, ours: Edit[], all: Edit[], prefer: 'ours' | 'theirs', apart = false, twice = false): Merge {
  const hit = apart ? clash : overlaps;
  const same = (a: Edit, b: Edit) => !twice && equal(a, b);
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

// the edits that turn a into b for a merge of a session, one per run of changed characters, or of
// changed words past 500 changed units, e.g. for a paste, or of changed lines past 250 changed
// words. an edit is widened so that it cuts neither a tag nor a character reference of b, nor one
// of a, as the authority widens a patch, hence a merge never writes into a tag that neither side
// wrote, e.g. a key before a word that another person makes bold
export function fine(a: string, b: string): Edit[] {
  const found = charEdits(a, b, 500) ?? wordEdits(a, b, 250) ?? edits(a, b);
  if (!found.length) return found;
  // the edits as patches of b back to a, widened to the tokens of b, and turned around again
  let d = 0;
  const back = widen(b, found.map((e) => {
    const start = e.start + d;
    d += e.text.length - (e.end - e.start);
    return { start, end: start + e.text.length, text: a.slice(e.start, e.end) };
  }));
  d = 0;
  return widen(a, wraps(b, back.map((p) => {
    const start = p.start - d;
    d += p.end - p.start - p.text.length;
    return { start, end: start + p.text.length, text: b.slice(p.start, p.end) };
  })));
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
// of others at an end of the span can be slid over equal letters into it, or when the edits of
// others are too many to diff
export function revert(base: string, target: string, now: string): string | null {
  if (now === base) return target;
  const b = base.replaceAll('&nbsp;', ' '), t = target.replaceAll('&nbsp;', ' '), n = now.replaceAll('&nbsp;', ' ');
  if (b === t) return now;
  const others = charEdits(b, n, OTHERS);
  if (!others) return null;
  const [head, tail] = shared(b, t);
  let all = tail;
  while (all < b.length && all < t.length && b[b.length - 1 - all] === t[t.length - 1 - all]) all++;
  if (slides(others, b, head - Math.min(head, all - tail), b.length - tail)) return null;
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
