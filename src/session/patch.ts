// patches of one text and the rules that order two operations of a session. an operation is a
// list of patches of one text version, sorted by start, that do not overlap. two patches of the
// same text conflict when they share a character, or when one of them is an insertion strictly
// inside the other. two insertions at one point do not conflict, and at such a tie the text of
// the operation ordered first comes first. an insertion at the start of a replaced range comes
// before the new text of the range, and one at its end after it

import { changes } from '../editor/merge.ts';
import { tokenize, type Token } from '../editor/tokens.ts';
import type { Patch } from './protocol.ts';

export type { Patch };

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
// true when offset i falls between the two halves of a surrogate pair
const splitsPair = (text: string, i: number) => i > 0 && i < text.length && isHigh(text.charCodeAt(i - 1)) && isLow(text.charCodeAt(i));
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

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

// the patches that turn the text after an operation back into the text before it
export function invert(text: string, patches: Patch[]): Patch[] {
  let delta = 0;
  return patches.map((p) => {
    const start = p.start + delta;
    delta += p.text.length - (p.end - p.start);
    return { start, end: start + p.text.length, text: text.slice(p.start, p.end) };
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

// the patches of theirs and ours, two operations of one text, in one operation, where a patch of
// the side that wins is kept at a conflict and the patches of the other side that it conflicts
// with are left out. theirs is ordered first at a tie. conflicts are the patches of ours that
// conflict with a patch of theirs
export function mergePatches(theirs: Patch[], ours: Patch[], wins: 'ours' | 'theirs' = 'ours'): { patches: Patch[]; conflicts: Patch[] } {
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
  const keptTheirs = wins === 'ours' ? theirs.filter((_, j) => !hitTheirs[j]) : theirs;
  const keptOurs = wins === 'ours' ? ours : ours.filter((_, i) => !hitOurs[i]);
  return { patches: combine(keptTheirs, keptOurs), conflicts };
}

// the last text tokenized, since a diff is taken many times against one base
let cached: { text: string; tokens: Token[] } | null = null;
function tokensOf(text: string): Token[] {
  if (cached?.text !== text) cached = { text, tokens: tokenize(text) };
  return cached.tokens;
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

// the operation that turns base into text: the line diff of changes() narrowed to characters, or
// one patch between the common prefix and suffix when changes() gives up, widened to tokens
export function diff(base: string, text: string): Patch[] {
  if (base === text) return [];
  const found = changes(base, text);
  if (found) return widen(base, found.flatMap((p) => byLine(base, p)));
  let pre = 0;
  const max = Math.min(base.length, text.length);
  while (pre < max && base.charCodeAt(pre) === text.charCodeAt(pre)) pre++;
  let suf = 0;
  while (suf < max - pre && base.charCodeAt(base.length - 1 - suf) === text.charCodeAt(text.length - 1 - suf)) suf++;
  return widen(base, [{ start: pre, end: base.length - suf, text: text.slice(pre, text.length - suf) }]);
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
