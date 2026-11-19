// the merge of the characters of a run of text that two people edit at once, e.g. two keys in one
// paragraph, or a key in a word that another person makes bold. the run is cut into units, i.e. a
// tag, a comment, a character reference, a surrogate pair, or one code unit, hence none of them is
// ever cut by a merge. each side is diffed by units against the run before both

import { myers } from '../editor/merge.ts';

const UNITS = /<!--[^]*?-->|<\/?[A-Za-z](?:[^<>"']|"[^"]*"|'[^']*')*>|&(?:#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,8}|[A-Za-z][A-Za-z0-9]{1,31});|[\uD800-\uDBFF][\uDC00-\uDFFF]|[^]/g;
const units = (text: string): string[] => text.match(UNITS) ?? [];

// the run a0 to a1 of the units before, replaced by the run b0 to b1 of the units of one side
type Hunk = { a0: number; a1: number; b0: number; b1: number };
// a hunk with its new text and its first unit, of theirs when side is 0 and of ours when side is 1,
// where k is its index in the edits of its side
type Unit = { a0: number; a1: number; text: string; first: string; side: 0 | 1; k: number };

// the most pairs of units compared in the search for the longest run in common, about 4 ms on a laptop
const CELLS = 1 << 20;
// the most units in which a part may differ to be diffed with the Myers algorithm
const MAX = 500;

// the first index of the units p from p0 to p1 within t from t0 to t1, by Knuth-Morris-Pratt at a
// cost linear in both, since indexOf takes time quadratic in the length of p on a text of a short
// period, e.g. a run of one letter
function find(t: string[], t0: number, t1: number, p: string[], p0: number, p1: number): number {
  const n = p1 - p0;
  const back = new Int32Array(n + 1);
  back[0] = -1;
  for (let i = 0, k = -1; i < n; back[++i] = ++k) while (k >= 0 && p[p0 + k] !== p[p0 + i]) k = back[k];
  let i = t0;
  for (let k = 0; k < n; i++, k++) {
    if (i === t1) return -1;
    while (k >= 0 && p[p0 + k] !== t[i]) k = back[k];
  }
  return i - n;
}

// the hunks that turn the units x into y. each part between the start and the end that both share
// is diffed with the Myers algorithm, or split around its longest run in common when its sides differ
// in more than MAX units, e.g. for a long paste into a paragraph and a key at its end. a part that is
// too long to compare, or that does not have a unit in common, is one hunk
function hunks(x: string[], y: string[]): Hunk[] {
  const out: Hunk[] = [];
  const parts: Hunk[] = [{ a0: 0, a1: x.length, b0: 0, b1: y.length }];
  let cells = CELLS;
  for (let part = parts.pop(); part; part = parts.pop()) {
    let { a0, a1, b0, b1 } = part;
    while (a0 < a1 && b0 < b1 && x[a0] === y[b0]) [a0, b0] = [a0 + 1, b0 + 1];
    while (a0 < a1 && b0 < b1 && x[a1 - 1] === y[b1 - 1]) [a1, b1] = [a1 - 1, b1 - 1];
    const lx = a1 - a0, ly = b1 - b0;
    if (!lx || !ly) {
      if (lx || ly) out.push({ a0, a1, b0, b1 });
      continue;
    }
    if (Math.abs(lx - ly) <= MAX) {
      const found = myers(x.slice(a0, a1), y.slice(b0, b1), MAX);
      if (found) {
        out.push(...found.map((h) => ({ a0: a0 + h.a0, a1: a0 + h.a1, b0: b0 + h.b0, b1: b0 + h.b1 })));
        continue;
      }
      cells -= MAX * (lx + ly);
    }
    // a side that holds the other whole, e.g. a paste around a run that did not change, is split at
    // its first occurrence at a linear cost
    let best = 0, bx = 0, by = 0;
    const k = find(y, b0, b1, x, a0, a1), j = k < 0 ? find(x, a0, a1, y, b0, b1) : -1;
    if (k >= 0) [best, bx, by] = [lx, a0, k];
    else if (j >= 0) [best, bx, by] = [ly, j, b0];
    else if (lx * ly <= cells) {
      cells -= lx * ly;
      let prev = new Uint32Array(ly + 1), row = new Uint32Array(ly + 1);
      for (let i = 1; i <= lx; i++) {
        for (let j = 1; j <= ly; j++) {
          const v = x[a0 + i - 1] === y[b0 + j - 1] ? prev[j - 1] + 1 : 0;
          row[j] = v;
          if (v > best) [best, bx, by] = [v, a0 + i - v, b0 + j - v];
        }
        [prev, row] = [row, prev];
      }
    }
    if (best) parts.push({ a0: bx + best, a1, b0: by + best, b1 }, { a0, a1: bx, b0, b1: by });
    else out.push({ a0, a1, b0, b1 });
  }
  out.sort((p, q) => p.a0 - q.a0);
  // a removal or an insertion that can be made as well further back, over units that repeat, is made
  // at the start of a line there, as a line was removed or put in, e.g. a removal of a line given as the
  // rest of its first line and the start of the next one that begins with the same letter
  out.forEach((h, i) => {
    const t = h.a0 === h.a1 ? y : h.b0 === h.b1 ? x : null, s = t === x ? h.a0 : h.b0, n = t === x ? h.a1 - h.a0 : h.b1 - h.b0;
    if (!t) return;
    for (let k = 1, lo = out[i - 1]?.a1 ?? 0; h.a0 - k >= lo && x[h.a0 - k] === t[s + n - k] && k <= n; k++) {
      if (h.a0 > k && x[h.a0 - k - 1] !== '\n') continue;
      Object.assign(h, { a0: h.a0 - k, a1: h.a1 - k, b0: h.b0 - k, b1: h.b1 - k });
      return;
    }
  });
  const size = (h: Hunk) => h.a1 - h.a0 + h.b1 - h.b0;
  return out.reduce((list: Hunk[], h) => {
    const last = list[list.length - 1], gap = last ? x.slice(last.a1, h.a0) : [];
    if (last && gap.length <= Math.min(size(last), size(h)) && [last, h].some((k) => [...x.slice(k.a0, k.a1), ...y.slice(k.b0, k.b1)].some(isTag)) && gap.every((u) => /^\s$/.test(u))) list[list.length - 1] = { a0: last.a0, a1: h.a1, b0: last.b0, b1: h.b1 };
    else list.push(h);
    return list;
  }, []);
}

const isTag = (u: string) => u.length > 2 && u[0] === '<';

// a hunk that removes units split into the tags at the ends of each side and the rest, hence a key
// at the start of a word that the other side types over in italic goes before the new word
function peel(x: string[], y: string[], h: Hunk): Hunk[] {
  let { a0, a1, b0, b1 } = h;
  // one tag that becomes another, e.g. with another attribute, stays one replacement
  if (a1 - a0 === 1 && b1 - b0 === 1 && isTag(x[a0]) && isTag(y[b0])) return [h];
  const head: Hunk[] = [], tail: Hunk[] = [];
  for (; a0 < a1 && isTag(x[a0]); a0++) head.push({ a0, a1: a0 + 1, b0, b1: b0 });
  for (; b0 < b1 && isTag(y[b0]); b0++) head.push({ a0, a1: a0, b0, b1: b0 + 1 });
  for (; b1 > b0 && isTag(y[b1 - 1]); b1--) tail.unshift({ a0: a1, a1, b0: b1 - 1, b1 });
  for (; a1 > a0 && isTag(x[a1 - 1]); a1--) tail.unshift({ a0: a1 - 1, a1, b0: b1, b1 });
  return [...head, ...(a0 < a1 || b0 < b1 ? [{ a0, a1, b0, b1 }] : []), ...tail];
}

const conflict = (a: Unit, b: Unit) =>
  (a.a0 < b.a1 && b.a0 < a.a1) || (a.a0 === a.a1 && b.a0 < a.a0 && a.a0 < b.a1) || (b.a0 === b.a1 && a.a0 < b.a0 && b.a0 < a.a1);

// a deletion d moved to end or to start at an insertion of the other side strictly inside it, over
// units of x that read the same, when no other edit is hit, e.g. the deletion of 'le stab' in
// 'unstable stable', diffed as 'stable ', and an insertion before ' point'. d itself when it
// cannot be moved
function slid(x: string[], d: Unit, all: Unit[]): Unit {
  const at = d.text ? undefined : all.find((e) => e.side !== d.side && e.a0 === e.a1 && d.a0 < e.a0 && e.a0 < d.a1)?.a0;
  if (at === undefined) return d;
  const fits = (m: Unit) => !all.some((o) => o !== d && conflict(o, m));
  let left = true, right = true;
  for (let i = 1; left && i <= d.a1 - at; i++) left = d.a0 - i >= 0 && x[d.a0 - i] === x[d.a1 - i];
  const l = { ...d, a0: d.a0 - (d.a1 - at), a1: at };
  if (left && fits(l)) return l;
  for (let i = 0; right && i < at - d.a0; i++) right = d.a1 + i < x.length && x[d.a0 + i] === x[d.a1 + i];
  const r = { ...d, a0: at, a1: d.a1 + (at - d.a0) };
  return right && fits(r) ? r : d;
}

// the formats of each side, i.e. an insertion that starts with a start tag and the next insertion of
// the same side that holds its end tag, as pairs with the side
function formats(all: Unit[]): [Unit, Unit, 0 | 1][] {
  const out: [Unit, Unit, 0 | 1][] = [];
  for (const open of all) {
    const name = open.a0 === open.a1 ? /^<([A-Za-z][\w-]*)/.exec(open.text)?.[1] : undefined;
    const close = name && all.find((e) => e.side === open.side && e.k > open.k && e.a0 === e.a1 && e.text.includes(`</${name}>`));
    if (close) out.push([open, close, open.side]);
  }
  return out;
}

// whether an edit o of the other side clashes with a format put around the units s to e of x: o
// crosses an end of the run, removes the whole run, or holds a tag inside the run or at its ends.
// a plain edit inside the run, also one that types over the whole run, is kept inside the element
function clashes(x: string[], s: number, e: number, o: Unit): boolean {
  if ((o.a0 < s && s < o.a1) || (o.a0 < e && e < o.a1)) return true;
  const plain = o.text.replace(/<[^>]*>/g, '') !== '';
  if (o.a0 <= s && e <= o.a1 && o.a0 < o.a1 && !plain) return true;
  return s <= o.a0 && o.a1 <= e && (o.text.includes('<') || x.slice(o.a0, o.a1).some(isTag));
}

const isEnd = (u: string) => u.startsWith('</');
const isStart = (u: string) => isTag(u) && !/^<[/!]/.test(u);
// the order of insertions at one point: one that starts with an end tag, then one of text, then one
// that starts with a start tag. a key at an end of a word that the other side formats thus stays
// outside the new element
const rank = (e: Unit) => (isEnd(e.first) ? 0 : isStart(e.first) ? 2 : 1);

// whether a text starts a new word, i.e. starts with a space
export const spaced = (text: string): boolean => /^(\s|&nbsp;)/.test(text);
export const goesOn = (u = ''): boolean => /^[\s\p{L}\p{M}\p{N}]$/u.test(u);

// true when a comes before b in the merged run. two insertions at one point are in the order of rank,
// then one that goes on with the word or the space before it first, then theirs first, apart from two end tags,
// of which the one of ours comes first, hence two formats of one run nest. an insertion at an end of
// a replaced range goes outside the range
function before(a: Unit, b: Unit, x: string[]): boolean {
  if (a.a0 !== b.a0) return a.a0 < b.a0;
  const ai = a.a0 === a.a1, bi = b.a0 === b.a1;
  if (!ai || !bi) return ai;
  if (a.side === b.side) return a.k < b.k;
  if (rank(a) !== rank(b)) return rank(a) < rank(b);
  if (rank(a) === 1 && spaced(a.text) !== spaced(b.text) && goesOn(x[a.a0 - 1])) return spaced(b.text);
  return rank(a) === 0 ? a.side > b.side : a.side < b.side;
}

// the run x with the edits of both sides, where theirs and ours are the run as each side made it. an
// edit of ours equal to one of theirs is taken once, unless twice is true and it is the only such
// edit and an insertion, e.g. the same letter typed at one point by two people. at a conflict, the
// side wins keeps its edits, and the other side keeps those that neither conflict nor join a word
// with one that conflicts, see clashes() for a format. conflicted is true when there was a conflict
export function mergeRun(x: string, theirs: string, ours: string, twice: boolean, wins: 'ours' | 'theirs'): { text: string; conflicted: boolean } {
  const base = units(x);
  let all: Unit[] = [];
  [units(theirs), units(ours)].forEach((y, side) => {
    for (const h of hunks(base, y).flatMap((h) => (h.a0 < h.a1 ? peel(base, y, h) : [h]))) {
      const text = y.slice(h.b0, h.b1);
      all.push({ a0: h.a0, a1: h.a1, text: text.join(''), first: text[0] ?? '', side: side as 0 | 1, k: all.length });
    }
  });
  const same = (a: Unit, b: Unit) => a.side !== b.side && a.a0 === b.a0 && a.a1 === b.a1 && a.text === b.text;
  const equal = all.filter((t) => t.side === 0 && all.some((o) => same(t, o)));
  if (!(twice && equal.length === 1 && equal[0].a0 === equal[0].a1)) all = all.filter((t) => !equal.includes(t));
  for (const side of [1, 0]) all = all.map((d) => (d.side === side ? slid(base, d, all) : d));
  // a key inside text that the other side removes or types over goes to the end of the word of
  // this change, as a caret does in runsOf(), e.g. a key in slide, which the other side types over
  // as deck, diffed as sli removed and ck put in, goes after deck
  const tags = (e: Unit) => e.text.includes('<') || base.slice(e.a0, e.a1).some(isTag);
  const plain = (u: string) => /^[\p{L}\p{M}\p{N}]+$/u.test(u);
  // a side that also changes tags in the run keeps its conflicts, e.g. a format that types over letters
  const formatted = [0, 1].map((side) => all.some((u) => u.side === side && tags(u)));
  const inside = (e: Unit, o: Unit) => e.a0 === e.a1 && o.side !== e.side && o.a0 < e.a0 && e.a0 < o.a1 && !tags(e) && !formatted[o.side];
  for (const o of all) {
    if (!all.includes(o) || o.a0 === o.a1 || formatted[o.side]) continue;
    let end = o.a1;
    while (end < base.length && plain(base[end])) end++;
    const rest = all.filter((n) => n.side === o.side && n !== o && o.a1 <= n.a0 && n.a1 <= end && !n.text.includes('<')).sort((a, b) => a.a0 - b.a0);
    if (!all.some((e) => inside(e, { ...o, a1: rest.at(-1)?.a1 ?? o.a1 }))) continue;
    for (const n of rest) o.text += base.slice(o.a1, n.a0).join('') + n.text, (o.a1 = n.a1);
    if (o.a1 < end) o.text += base.slice(o.a1, end).join(''), (o.a1 = end);
    all = all.filter((u) => !rest.includes(u));
  }
  all = all.map((e) => {
    const o = all.find((o) => inside(e, o));
    return o ? { ...e, a0: o.a1, a1: o.a1 } : e;
  });
  const loser = wins === 'ours' ? 0 : 1;
  const hit = new Set<Unit>();
  for (const a of all) for (const b of all) if (a.side === loser && b.side !== loser && conflict(a, b)) hit.add(a);
  for (const [open, close, side] of formats(all)) {
    for (const o of all) {
      if (o.side === side || !clashes(base, open.a0, close.a0, o)) continue;
      for (const e of side === loser ? [open, close] : [o]) hit.add(e);
    }
  }
  if (hit.size) {
    // the edits of the side that loses that the units between them join into one word with an edit
    // that conflicts go as well, hence the letters of one word typed over by both are not mixed
    const word = (u: string) => !/^\s$/.test(u) && !u.startsWith('&nbsp');
    const fragment = (e: Unit) => !/[\s<]/.test(e.text) && base.slice(e.a0, e.a1).every(word);
    const lost = all.filter((e) => e.side === loser);
    for (let more = true; more; ) {
      more = false;
      for (const e of lost) {
        if (hit.has(e) || !fragment(e)) continue;
        const joined = [...hit].some((h) => base.slice(Math.min(e.a1, h.a1), Math.max(e.a0, h.a0)).every(word));
        if (joined) more = !!hit.add(e);
      }
    }
    // a format of the side that loses goes with an edit inside its run that goes, e.g. one that types
    // over letters of its word, and an element is not left open, hence the edits of tags of the side
    // that loses go together
    for (const [open, close, side] of formats(all)) if (side === loser && [...hit].some((h) => open.a0 <= h.a0 && h.a1 <= close.a0)) hit.add(open);
    if ([...hit].some(tags)) for (const e of lost) if (tags(e)) hit.add(e);
    all = all.filter((e) => !hit.has(e));
  }
  all.sort((a, b) => (before(a, b, base) ? -1 : before(b, a, base) ? 1 : 0));
  const out: string[] = [];
  let at = 0;
  for (const e of all) {
    out.push(base.slice(at, e.a0).join(''), e.text);
    at = Math.max(at, e.a1);
  }
  out.push(base.slice(at).join(''));
  return { text: out.join(''), conflicted: hit.size > 0 };
}
