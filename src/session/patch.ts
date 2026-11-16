// patches of one text and the rules that order two operations of a session. an operation is a
// list of patches of one text version, sorted by start, that do not overlap. two patches of the
// same text conflict when they share a character, or when one of them is an insertion strictly
// inside the other. two insertions at one point do not conflict, and at such a tie the text of
// the operation ordered first comes first. an insertion at the start of a replaced range comes
// before the new text of the range, and one at its end after it

import { changes, fine, moves, nest } from '../editor/merge.ts';
import { tokenize, type Token } from '../editor/tokens.ts';
import type { Patch } from './protocol.ts';

export type { Patch };

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
// true when offset i falls between the two halves of a surrogate pair
const splitsPair = (text: string, i: number) => i > 0 && i < text.length && isHigh(text.charCodeAt(i - 1)) && isLow(text.charCodeAt(i));
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// text with each lone surrogate replaced by U+FFFD, since an operation must not carry one
export function wellFormed(text: string): string {
  const native = (text as { isWellFormed?: () => boolean }).isWellFormed;
  if (native ? native.call(text) : !LONE.test(text)) return text;
  const parts: string[] = [];
  let at = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isHigh(c) && i + 1 < text.length && isLow(text.charCodeAt(i + 1))) i++;
    else if (isHigh(c) || isLow(c)) {
      parts.push(text.slice(at, i), '�');
      at = i + 1;
    }
  }
  parts.push(text.slice(at));
  return parts.join('');
}

// the most patches of an operation. diff() does not give more, since changes() gives up beyond
// 2000 changed lines
export const MAX_PATCHES = 2000;

// true when patches is an operation of a text of length n, i.e. at most MAX_PATCHES, sorted,
// without overlap, with integer offsets in bounds, and without a lone surrogate in a text or at a
// cut of the text when it is given. insertions at one point, which a shift may bring together, are
// applied in list order
export function valid(patches: unknown, n: number, text?: string): patches is Patch[] {
  if (!Array.isArray(patches) || patches.length > MAX_PATCHES) return false;
  let last: Patch | null = null;
  for (const p of patches as Patch[]) {
    if (!p || typeof p !== 'object' || typeof p.text !== 'string') return false;
    if (!Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < 0 || p.end < p.start || p.end > n) return false;
    if (last && p.start < last.end) return false;
    if (LONE.test(p.text)) return false;
    if (text !== undefined && (splitsPair(text, p.start) || splitsPair(text, p.end))) return false;
    last = p;
  }
  return true;
}

// text with the patches of one operation
export function apply(text: string, patches: Patch[]): string {
  if (patches.length === 0) return text;
  const parts: string[] = [];
  let at = 0;
  for (const p of patches) {
    parts.push(text.slice(at, p.start), p.text);
    at = p.end;
  }
  parts.push(text.slice(at));
  return parts.join('');
}

export function conflict(a: Patch, b: Patch): boolean {
  if (a.start < b.end && b.start < a.end) return true;
  if (a.start === a.end && b.start < a.start && a.start < b.end) return true;
  return b.start === b.end && a.start < b.start && b.start < a.end;
}

// true when a comes before b in the text with both, where a is of the operation ordered first
// when aFirst is true. the two do not conflict
function before(a: Patch, b: Patch, aFirst: boolean): boolean {
  if (a.start !== b.start) return a.start < b.start;
  const ai = a.start === a.end, bi = b.start === b.end;
  if (ai && bi) return aFirst;
  return ai;
}

// the patches of an operation moved onto the text with the operation over applied, where over is
// ordered first when overFirst is true. null when a patch conflicts with a patch of over. the
// patches are moved and never cut, hence an operation is applied whole or not at all
export function shift(patches: Patch[], over: Patch[], overFirst = true): Patch[] | null {
  const out: Patch[] = [];
  let j = 0, k = 0, delta = 0;
  for (const p of patches) {
    // a patch of over that ends at or before p conflicts neither with p nor with a later patch,
    // and of the others only those that start before the end of p can conflict with it
    while (k < over.length && over[k].end <= p.start) k++;
    for (let i = k; i < over.length && over[i].start < p.end; i++) if (conflict(p, over[i])) return null;
    while (j < over.length && before(over[j], p, overFirst)) {
      delta += over[j].text.length - (over[j].end - over[j].start);
      j++;
    }
    out.push({ start: p.start + delta, end: p.end + delta, text: p.text });
  }
  return out;
}

// an offset of a text moved onto the text with the patches applied. an offset at an insertion
// goes after it when after is true, and an offset inside a replaced range goes to its start
export function shiftOffset(offset: number, patches: Patch[], after = true): number {
  let delta = 0;
  for (const p of patches) {
    if (p.end < offset || (p.end === offset && (p.start < p.end || after))) delta += p.text.length - (p.end - p.start);
    else if (p.start < offset) return p.start + delta;
    else break;
  }
  return offset + delta;
}

// a copy of text, since a slice of 13 or more characters keeps the whole string that it was cut
// from alive in V8, e.g. a version of the deck kept by a patch in the log of the authority
export const copy = (text: string): string => (text.length < 13 ? text : JSON.parse(JSON.stringify(text)));

// the patches that turn the text after an operation back into the text before it
export function invert(text: string, patches: Patch[]): Patch[] {
  let delta = 0;
  return patches.map((p) => {
    const start = p.start + delta;
    delta += p.text.length - (p.end - p.start);
    return { start, end: start + p.text.length, text: copy(text.slice(p.start, p.end)) };
  });
}

// one operation of base with the patches of first and second, which do not conflict, where first
// is ordered first at a tie
export function combine(first: Patch[], second: Patch[]): Patch[] {
  const out: Patch[] = [];
  let i = 0, j = 0;
  while (i < first.length || j < second.length) {
    if (j >= second.length || (i < first.length && before(first[i], second[j], true))) out.push(first[i++]);
    else out.push(second[j++]);
  }
  return out;
}

// the patches of one operation of base with each that conflicts with a patch of the other given
// as the edits that fine() finds in it, since a patch spans a line from its first change to its
// last, e.g. a format and a key of the same operation further on the line
function finer(base: string, patches: Patch[], other: Patch[]): Patch[] {
  return patches.flatMap((p) => (other.some((o) => conflict(p, o)) ? fine(base, apply(base, [p])) : [p]));
}

// the patches of theirs and ours, two operations of one text, in one operation, where a patch of
// the side that wins is kept at a conflict and the patches of the other side that it conflicts
// with are left out. theirs is ordered first at a tie. conflicts are the patches of ours that
// conflict with a patch of theirs. with base, the text of both operations, a move of either side
// that conflicts is left out whole, see mergeEdits(), apart from a move of the side keep, which the
// dialog after a break decides, and with nested as well, a format of one side and the edits of plain
// text of the other side inside its run do not conflict, and both are kept, see nest()
export function mergePatches(theirs: Patch[], ours: Patch[], wins: 'ours' | 'theirs' = 'ours', base?: string, nested = true, keep?: 'ours' | 'theirs' | false): { patches: Patch[]; conflicts: Patch[] } {
  if (base !== undefined && nested) {
    // the finer edits are taken only when none of them conflicts, since the letters of one word
    // replaced on both sides would be mixed
    const [t, o] = nest(base, finer(base, theirs, ours), finer(base, ours, theirs), true);
    [theirs, ours] = t.some((p) => o.some((q) => conflict(p, q))) ? nest(base, theirs, ours, true) : [t, o];
  }
  // both lists are sorted, hence the patches of theirs near a patch of ours are found in one walk,
  // as in shift()
  const hitOurs = new Uint8Array(ours.length), hitTheirs = new Uint8Array(theirs.length);
  let k = 0, any = false;
  for (let i = 0; i < ours.length; i++) {
    const o = ours[i];
    while (k < theirs.length && theirs[k].end <= o.start) k++;
    for (let j = k; j < theirs.length && theirs[j].start < o.end; j++) {
      if (conflict(o, theirs[j])) hitOurs[i] = hitTheirs[j] = 1;
    }
    any ||= hitOurs[i] === 1;
  }
  const conflicts = ours.filter((_, i) => hitOurs[i]);
  if (!any) return { patches: combine(theirs, ours), conflicts };
  const gone = new Set(!base ? [] : ([[ours, theirs, 'ours'], [theirs, ours, 'theirs']] as const).flatMap(([a, b, s]) => (keep === s ? [] : moves(base, a, b, conflict))));
  if (gone.size) return { patches: mergePatches(theirs.filter((p) => !gone.has(p)), ours.filter((p) => !gone.has(p)), wins, base, false, keep).patches, conflicts };
  const keptTheirs = wins === 'ours' ? theirs.filter((_, j) => !hitTheirs[j]) : theirs;
  const keptOurs = wins === 'ours' ? ours : ours.filter((_, i) => !hitOurs[i]);
  return { patches: combine(keptTheirs, keptOurs), conflicts };
}

// the last text tokenized, since a diff is taken many times against one base. odd is true when the
// text holds U+0130, whose lowercase is two code units long, which moves the offsets of tokenize()
let cached: { text: string; tokens: Token[]; odd: boolean } | null = null;
function tokensOf(text: string): Token[] {
  if (cached?.text === text) return cached.tokens;
  const tokens = (cached && retokenize(cached, text)) ?? tokenize(text);
  cached = { text, tokens, odd: text.includes('\u0130') };
  return tokens;
}

// the characters past its end that tokenize() reads to end a token, at most, i.e. </textarea and one
const AHEAD = 12;

// the length of the start that a and b share, compared in blocks
function sharedStart(a: string, b: string, n: number): number {
  let i = 0;
  for (let w = 4096; w > 1; w >>= 4) while (i + w <= n && a.slice(i, i + w) === b.slice(i, i + w)) i += w;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

function sharedEnd(a: string, b: string, n: number): number {
  let i = 0;
  for (let w = 4096; w > 1; w >>= 4) while (i + w <= n && a.slice(a.length - i - w, a.length - i) === b.slice(b.length - i - w, b.length - i)) i += w;
  while (i < n && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++;
  return i;
}

// a token of tokens moved by d
function moved(t: Token, d: number): Token {
  if (t.type !== 'start') return { ...t, start: t.start + d, end: t.end + d };
  return { ...t, start: t.start + d, end: t.end + d, attrs: t.attrs.map((a) => ({ ...a, start: a.start + d, end: a.end + d })) };
}

// the tokens of text from those of the last text, the same as tokenize(text) gives: the tokens read
// only from the start that both share are kept, the text from there is tokenized again up to a token
// that starts in the end that both share, and the tokens of the last text from this one on are moved.
// a start tag may be followed by raw text, hence the tokens are joined only where none comes before.
// null when tokenize(text) costs about as much
function retokenize(last: { text: string; tokens: Token[]; odd: boolean }, text: string): Token[] | null {
  const old = last.tokens, n = text.length, d = n - last.text.length;
  const both = Math.min(n, last.text.length);
  const p = sharedStart(last.text, text, both);
  const tail = n - sharedEnd(last.text, text, both - p);
  if (last.odd || text.slice(p, tail).includes('\u0130')) return null;
  let lo = 0, hi = old.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (old[mid].end + AHEAD <= p) lo = mid + 1;
    else hi = mid;
  }
  let kept = lo;
  while (kept > 0 && old[kept - 1].type === 'start') kept--;
  const from = kept ? old[kept - 1].end : 0;
  // the index of the token of the last text that starts at offset at, after a token that is not a start tag
  const joins = (at: number): number => {
    let lo = 0, hi = old.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (old[mid].start < at) lo = mid + 1;
      else if (old[mid].start > at) hi = mid - 1;
      else return mid > 0 && old[mid - 1].type === 'start' ? -1 : mid;
    }
    return -1;
  };
  for (let width = 1024; ; width *= 4) {
    const to = Math.min(n, Math.max(from, tail) + width);
    if (2 * (to - from) > n) return null;
    const out = old.slice(0, kept);
    let afterStart = false;
    let wider = false;
    for (const t of tokenize(text.slice(from, to))) {
      const start = t.start + from;
      const j = start >= tail && !afterStart ? joins(start - d) : -1;
      if (j >= 0) {
        for (let i = j; i < old.length; i++) out.push(d ? moved(old[i], d) : old[i]);
        return out;
      }
      // a token that may read past the end of the slice is tokenized again in a wider one
      if ((wider = to < n && t.end + from + AHEAD > to)) break;
      out.push(moved(t, from));
      afterStart = t.type === 'start';
    }
    if (!wider && to === n) return out;
  }
}

// the start or end tag that holds offset i strictly inside, by bisection of the tokens
function tagAt(tokens: Token[], i: number): Token | null {
  let lo = 0, hi = tokens.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = tokens[mid];
    if (t.end <= i) lo = mid + 1;
    else if (t.start > i) hi = mid - 1;
    else return (t.type === 'start' || t.type === 'end') && t.start < i ? t : null;
  }
  return null;
}

// the range of the quoted value of an attribute of tag, without its quotes, that holds a and b
function valueAround(text: string, tag: Token, a: number, b: number): { start: number; end: number } | null {
  if (tag.type !== 'start') return null;
  for (const attr of tag.attrs) {
    if (attr.value === null) continue;
    const end = attr.end - 1, start = end - attr.value.length;
    const quote = text[end];
    if ((quote === '"' || quote === "'") && text[start - 1] === quote && start <= a && b <= end) return { start, end };
  }
  return null;
}

const REFERENCE = /&(?:#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,8}|[A-Za-z][A-Za-z0-9]{1,31});/y;
// the range of a character reference that holds offset i strictly inside
function referenceAt(text: string, i: number): { start: number; end: number } | null {
  for (let s = i - 1; s >= 0 && s >= i - 34; s--) {
    const c = text[s];
    if (c === '&') {
      REFERENCE.lastIndex = s;
      const m = REFERENCE.exec(text);
      return m && s + m[0].length > i ? { start: s, end: s + m[0].length } : null;
    }
    if (!/[#A-Za-z0-9]/.test(c)) return null;
  }
  return null;
}

// the range a to b of text widened so that it does not cut a token: a range inside a quoted
// attribute value to the whole value, a range elsewhere inside a tag to the whole tag, and a range
// that cuts a character reference or a surrogate pair to the whole of it
function widenRange(text: string, tokens: Token[], a: number, b: number): [number, number] {
  for (;;) {
    let s = a, e = b;
    const ta = tagAt(tokens, s), tb = tagAt(tokens, e);
    if (ta && ta === tb) {
      const value = valueAround(text, ta, s, e);
      if (value) [s, e] = [value.start, value.end];
      else [s, e] = [ta.start, ta.end];
    } else {
      if (ta) s = ta.start;
      if (tb) e = tb.end;
    }
    const ra = referenceAt(text, s), rb = referenceAt(text, e);
    if (ra) s = ra.start;
    if (rb) e = rb.end;
    if (splitsPair(text, s)) s--;
    if (splitsPair(text, e)) e++;
    if (s === a && e === b) return [s, e];
    [a, b] = [s, e];
  }
}

// the patches of base widened to token boundaries, so that two patches that are valid alone are
// valid together. patches whose widened ranges overlap are joined into one
export function widen(base: string, patches: Patch[]): Patch[] {
  if (patches.length === 0) return patches;
  const tokens = tokensOf(base);
  const groups: { start: number; end: number; patches: Patch[] }[] = [];
  for (const p of patches) {
    const [s, e] = widenRange(base, tokens, p.start, p.end);
    let group = { start: s, end: e, patches: [p] };
    for (let last = groups[groups.length - 1]; last; last = groups[groups.length - 1]) {
      const touch = group.start < last.end || (group.start === last.end && group.start === group.end && last.start === last.end);
      if (!touch) break;
      groups.pop();
      group = { start: Math.min(last.start, group.start), end: Math.max(last.end, group.end), patches: [...last.patches, ...group.patches] };
    }
    groups.push(group);
  }
  return groups.map((g) => {
    const parts: string[] = [];
    let at = g.start;
    for (const p of g.patches) {
      parts.push(base.slice(at, p.start), p.text);
      at = p.end;
    }
    parts.push(base.slice(at, g.end));
    return { start: g.start, end: g.end, text: parts.join('') };
  });
}

// a patch over as many old lines as new ones split into a patch per line, each narrowed to the
// characters that differ, since changes() gives one hunk for a run of changed lines
function byLine(base: string, p: Patch): Patch[] {
  const old = base.slice(p.start, p.end).split('\n');
  const next = p.text.split('\n');
  if (old.length < 2 || old.length !== next.length) return [p];
  const out: Patch[] = [];
  let at = p.start;
  for (let i = 0; i < old.length; i++) {
    const a = old[i], b = next[i];
    let pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    let suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    if (a !== b) out.push({ start: at + pre, end: at + a.length - suf, text: b.slice(pre, b.length - suf) });
    at += a.length + 1;
  }
  return out;
}

const LINES = /[^\n]*\n|[^\n]+$/g;
const WORDS = /\w+|\s+|[^\w\s]+/g;
// a patch over more characters of base is aligned again by words, e.g. a replace on one long line
const LONG = 1000;

// the pieces that unit matches in text from a to b, with the offset of each and b last
function pieces(text: string, a: number, b: number, unit: RegExp): { parts: string[]; at: number[] } {
  const parts: string[] = [], at: number[] = [];
  for (const m of text.slice(a, b).matchAll(unit)) {
    parts.push(m[0]);
    at.push(a + m.index);
  }
  at.push(b);
  return { parts, at };
}

// the pairs of indices of equal pieces of a and b that occur once in each, in the longest run that
// is in the same order in both, by patience sorting
function anchors(a: string[], b: string[]): [number, number][] {
  const once = (parts: string[]) => {
    const at = new Map<string, number>();
    parts.forEach((p, i) => at.set(p, at.has(p) ? -1 : i));
    return at;
  };
  const inA = once(a), inB = once(b);
  const pairs: [number, number][] = [];
  a.forEach((p, i) => {
    const j = inB.get(p);
    if (j !== undefined && j >= 0 && inA.get(p) === i) pairs.push([i, j]);
  });
  const tails: number[] = [];
  const prev = new Int32Array(pairs.length);
  pairs.forEach(([, j], k) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][1] < j) lo = mid + 1;
      else hi = mid;
    }
    prev[k] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = k;
  });
  const out: [number, number][] = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(pairs[k]);
  return out.reverse();
}

// the patch that replaces base from a to b with text, narrowed to the characters that differ, onto
// out unless the two are equal
function narrow(base: string, a: number, b: number, text: string, out: Patch[]): void {
  const n = b - a, m = text.length;
  let pre = 0;
  while (pre < n && pre < m && base.charCodeAt(a + pre) === text.charCodeAt(pre)) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && base.charCodeAt(b - 1 - suf) === text.charCodeAt(m - 1 - suf)) suf++;
  if (pre + suf < n || pre + suf < m) out.push({ start: a + pre, end: b - suf, text: text.slice(pre, m - suf) });
}

// the patches that turn base from a0 to a1 into text from b0 to b1, aligned on the anchors of unit
// and the equal pieces next to them. a gap between anchors with as many lines on both sides gives a
// patch per line, and any other gap one patch
function aligned(base: string, a0: number, a1: number, text: string, b0: number, b1: number, unit: RegExp): Patch[] {
  const a = pieces(base, a0, a1, unit), b = pieces(text, b0, b1, unit);
  const out: Patch[] = [];
  let i = 0, j = 0;
  for (const [ai, bj] of [...anchors(a.parts, b.parts), [a.parts.length, b.parts.length]]) {
    for (; i < ai && j < bj && a.parts[i] === b.parts[j]; i++, j++);
    let ei = ai, ej = bj;
    for (; ei > i && ej > j && a.parts[ei - 1] === b.parts[ej - 1]; ei--, ej--);
    if (unit === LINES && ei - i === ej - j) for (; i < ei; i++, j++) narrow(base, a.at[i], a.at[i + 1], b.parts[j], out);
    else if (i < ei || j < ej) narrow(base, a.at[i], a.at[ei], text.slice(b.at[j], b.at[ej]), out);
    i = ai + 1;
    j = bj + 1;
  }
  return out;
}

// at most MAX_PATCHES patches, since valid() refuses more, with neighbors joined in runs of one
// length, hence a conflict covers one run
function cap(base: string, patches: Patch[]): Patch[] {
  if (patches.length <= MAX_PATCHES) return patches;
  const run = Math.ceil(patches.length / MAX_PATCHES);
  const out: Patch[] = [];
  for (let i = 0; i < patches.length; i += run) {
    const group = patches.slice(i, i + run);
    const parts = group.flatMap((p, k) => (k === 0 ? [p.text] : [base.slice(group[k - 1].end, p.start), p.text]));
    out.push({ start: group[0].start, end: group[group.length - 1].end, text: parts.join('') });
  }
  return out;
}

// the operation that turns base into text: the line diff of changes() narrowed to characters, or
// the lines aligned on those that occur once in both texts when changes() gives up, since one patch
// over most of the deck would conflict with any edit of someone else. a patch over a long range is
// aligned again by words, and the patches are widened to tokens
export function diff(base: string, text: string): Patch[] {
  if (base === text) return [];
  const found = changes(base, text);
  const lines = found ? found.flatMap((p) => byLine(base, p)) : aligned(base, 0, base.length, text, 0, text.length, LINES);
  const patches = lines.flatMap((p) => (p.end - p.start > LONG ? aligned(base, p.start, p.end, p.text, 0, p.text.length, WORDS) : [p]));
  return widen(base, cap(base, patches));
}

// the size of an operation, i.e. the characters it removes and inserts
export const size = (patches: Patch[]) => patches.reduce((n, p) => n + p.end - p.start + p.text.length, 0);

// a 32-bit FNV-1a hash of the UTF-16 code units of text with its length, in hex
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length.toString(16)}-${(h >>> 0).toString(16).padStart(8, '0')}`;
}
