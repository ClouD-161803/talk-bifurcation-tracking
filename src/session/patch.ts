// patches of one text and the rules that order two operations of a session. an operation is a
// list of patches of one text version, sorted by start, that do not overlap. two patches of the
// same text conflict when they share a character, or when one of them is an insertion strictly
// inside the other. two insertions at one point do not conflict, and at such a tie the text of
// the operation ordered first comes first. an insertion at the start of a replaced range comes
// before the new text of the range, and one at its end after it

import { balanced, carry, changes, shared, stay } from '../editor/merge.ts';
import { goesOn, mergeRun, spaced } from './run.ts';
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

// the text after each list of patches in turn. the text is kept as pieces, i.e. slices of the texts
// before, and joined once, hence many lists cost the length of the text once and not once each
export function applyEach(text: string, lists: Iterable<Patch[]>): string {
  let pieces = [text];
  for (const patches of lists) {
    if (!patches.length) continue;
    const out: string[] = [];
    let i = 0, o = 0, at = 0;
    const walk = (n: number, keep: boolean) => {
      while (n > 0) {
        const p = pieces[i], rest = p.length - o;
        if (rest <= n) {
          if (keep) out.push(o ? p.slice(o) : p);
          n -= rest;
          i++;
          o = 0;
        } else {
          if (keep) out.push(p.slice(o, o + n));
          o += n;
          n = 0;
        }
      }
    };
    for (const p of patches) {
      walk(p.start - at, true);
      walk(p.end - p.start, false);
      if (p.text) out.push(p.text);
      at = p.end;
    }
    if (i < pieces.length) out.push(o ? pieces[i].slice(o) : pieces[i]);
    for (let k = i + 1; k < pieces.length; k++) out.push(pieces[k]);
    pieces = out;
  }
  return pieces.length === 1 ? pieces[0] : pieces.join('');
}

export function conflict(a: Patch, b: Patch): boolean {
  if (a.start < b.end && b.start < a.end) return true;
  if (a.start === a.end && b.start < a.start && a.start < b.end) return true;
  return b.start === b.end && a.start < b.start && b.start < a.end;
}

// true when a comes before b in the text with both, where a is of the operation ordered first
// when aFirst is true. the two do not conflict. of two insertions at one point, one that goes on
// with the word before it comes before one that starts a new word, hence a word typed key by key
// stays whole beside a word that another person puts in at once at the same point. with the base,
// this holds only after a space or a letter, e.g. not after a full stop
function before(a: Patch, b: Patch, aFirst: boolean, base?: string): boolean {
  if (a.start !== b.start) return a.start < b.start;
  const ai = a.start === a.end, bi = b.start === b.end;
  if (ai && bi) return spaced(a.text) === spaced(b.text) || (base !== undefined && !goesOn(base[a.start - 1])) ? aFirst : spaced(b.text);
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
export function combine(first: Patch[], second: Patch[], base?: string): Patch[] {
  const out: Patch[] = [];
  let i = 0, j = 0;
  while (i < first.length || j < second.length) {
    if (j >= second.length || (i < first.length && before(first[i], second[j], true, base))) out.push(first[i++]);
    else out.push(second[j++]);
  }
  return out;
}

// the patches of theirs and ours, two operations of one text, in one operation, where a patch of
// the side that wins is kept at a conflict and the patches of the other side that it conflicts
// with are left out. theirs is ordered first at a tie. conflicts are the patches of ours that
// conflict with a patch of theirs. with base, the text of both operations, the patches of each side
// inside a move of the other side go with the move, see carry(), and a move of either side that
// conflicts all the same is undone, with the changes of the mover in place, see stay(), apart from
// a move of the side keep, which the dialog after a break decides. with nested as well, the patches
// that conflict are merged by their characters over the lines of base that they span, see
// mergeRun(), and are a conflict only when their characters conflict. an edit of ours equal to one
// of theirs in such a run is taken once, unless twice is true and it is the only one and an insertion
export function mergePatches(theirs: Patch[], ours: Patch[], wins: 'ours' | 'theirs' = 'ours', base?: string, nested = true, keep?: 'ours' | 'theirs' | false, twice = true): { patches: Patch[]; conflicts: Patch[] } {
  const out = merged(theirs, ours, wins, base, nested, keep, twice);
  if (!base || [...theirs, ...ours].every(plain(base)) || balanced(apply(base, out.patches)) || !balanced(apply(base, theirs) + apply(base, ours))) return out;
  const k = ours.filter((p) => plain(base)(p) && !theirs.some((t) => conflict(p, t)));
  return { patches: combine(theirs, k, base), conflicts: ours.filter((o) => !k.includes(o)) };
}

const plain = (base: string) => (p: Patch) => !/</.test(p.text + base.slice(p.start, p.end));

function merged(theirs: Patch[], ours: Patch[], wins: 'ours' | 'theirs', base: string | undefined, nested: boolean, keep: 'ours' | 'theirs' | false | undefined, twice: boolean): { patches: Patch[]; conflicts: Patch[] } {
  if (base !== undefined) {
    [theirs, ours] = carry(base, theirs, ours);
    [ours, theirs] = carry(base, ours, theirs);
  }
  const twin = (o: Patch) => !o.text && base?.slice(o.start, o.end).trim() === '' && theirs.some((t) => t.start === o.start && t.end === o.end && !t.text);
  if (ours.some(twin)) ours = ours.filter((o) => !twin(o));
  // both lists are sorted, hence the patches of theirs near a patch of ours are found in one walk,
  // as in shift()
  const hitOurs = new Uint8Array(ours.length), hitTheirs = new Uint8Array(theirs.length);
  const pairs: [number, number][] = [];
  let k = 0;
  for (let i = 0; i < ours.length; i++) {
    const o = ours[i];
    while (k < theirs.length && theirs[k].end <= o.start) k++;
    for (let j = k; j < theirs.length && theirs[j].start < o.end; j++) {
      if (conflict(o, theirs[j])) {
        hitOurs[i] = hitTheirs[j] = 1;
        pairs.push([j, i]);
      }
    }
  }
  if (!pairs.length) return { patches: combine(theirs, ours, base), conflicts: [] };
  const [o, undone] = base === undefined || keep === 'ours' ? [ours, false] : stay(base, ours, theirs, conflict);
  const [t, gone] = base === undefined || keep === 'theirs' ? [theirs, false] : stay(base, theirs, ours, conflict);
  if (undone || gone) return { patches: merged(t, o, wins, base, nested, keep, twice).patches, conflicts: ours.filter((_, i) => hitOurs[i]) };
  // the lines of the patches that conflict, each merged by its characters with every patch of both
  // sides on it when the characters do not conflict. the lines end where a removal of whole lines
  // ends, unless its side puts as many lines there
  const runs: Patch[] = [];
  if (base !== undefined && nested) {
    const all = [...theirs, ...ours];
    const into = (p: Patch, a: number, b: number) => (p.start === p.end ? a < p.start && p.start < b : p.start < b && a < p.end);
    const lines: [number, number][] = [];
    for (const [j] of pairs) {
      let a = theirs[j].start, b = theirs[j].end;
      if (lines.length && lines[lines.length - 1][1] >= a) continue;
      for (let wider = true; wider; ) {
        a = a && base.lastIndexOf('\n', a - 1) + 1;
        if (base[b - 1] !== '\n' || b === a || [theirs, ours].some((l) => l.some((p) => p.end === b && l.some((q) => q.start === b && q.end === b && base.slice(p.start, b).split('\n').length === q.text.split('\n').length)))) b = base.indexOf('\n', b);
        if (b < 0) b = base.length;
        wider = false;
        for (const p of all) if (into(p, a, b) && (p.start < a || p.end > b)) [a, b, wider] = [Math.min(a, p.start), Math.max(b, p.end), true];
      }
      while (lines.length && lines[lines.length - 1][1] >= a) a = Math.min(a, lines.pop()![0]);
      lines.push([a, b]);
    }
    for (const [a, b] of lines) {
      const tj = theirs.flatMap((p, j) => (into(p, a, b) ? [j] : [])), oi = ours.flatMap((p, i) => (into(p, a, b) ? [i] : []));
      const at = (list: Patch[]) => apply(base.slice(a, b), list.map((p) => ({ start: p.start - a, end: p.end - a, text: p.text })));
      const run = mergeRun(base.slice(a, b), at(tj.map((j) => theirs[j])), at(oi.map((i) => ours[i])), twice, wins);
      runs.push({ start: a, end: b, text: run.text });
      for (const j of tj) hitTheirs[j] = 2;
      for (const i of oi) hitOurs[i] = run.conflicted && hitOurs[i] ? 3 : 2;
    }
  }
  const conflicts = ours.filter((_, i) => hitOurs[i] === 1 || hitOurs[i] === 3);
  const keptTheirs = theirs.filter((_, j) => hitTheirs[j] < 2 && (wins === 'theirs' || !hitTheirs[j]));
  const keptOurs = ours.filter((_, i) => hitOurs[i] < 2 && (wins === 'ours' || !hitOurs[i]));
  return { patches: combine(keptTheirs, combine(runs, keptOurs, base), base), conflicts };
}

// base with the edits that turn it into theirs and into ours, merged by mergePatches(), where ours
// wins at a conflict and theirs comes first at a tie. with once, an edit of theirs equal to one of
// ours is taken once, e.g. a change held back that the page already shows
export function mergeTexts(base: string, theirs: string, ours: string, once = false): string {
  const o = diff(base, ours);
  const t = diff(base, theirs).filter((p) => !once || !o.some((q) => q.start === p.start && q.end === p.end && q.text === p.text));
  return apply(base, mergePatches(t, o, 'ours', base, true, undefined, !once).patches);
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
  const [p, e] = shared(last.text, text), tail = n - e;
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
  return groups.map((g, i) => {
    const parts: string[] = [];
    let at = g.start;
    for (const p of g.patches) {
      parts.push(base.slice(at, p.start), p.text);
      at = p.end;
    }
    parts.push(base.slice(at, g.end));
    let { start, end } = g, text = parts.join('');
    const head = base.slice(Math.max(groups[i - 1]?.end ?? 0, start - 34), start), r = referenceAt(head + text, head.length);
    if (r) [start, text] = [start - head.length + r.start, head.slice(r.start) + text];
    const tail = base.slice(end, Math.min(groups[i + 1]?.start ?? base.length, end + 34)), q = referenceAt(text + tail, text.length);
    if (q) [end, text] = [end + q.end - text.length, text + tail.slice(0, q.end - text.length)];
    return { start, end, text };
  });
}

// a patch over as many old lines as new ones split into a patch per line, each narrowed to the
// characters that differ, since changes() gives one hunk for a run of changed lines
function byLine(base: string, p: Patch): Patch[] {
  const old = base.slice(p.start, p.end).split('\n'), next = p.text.split('\n');
  if (old.length < 2 || old.length !== next.length) return [p];
  const out: Patch[] = [];
  let at = p.start;
  old.forEach((a, i) => {
    narrow(base, at, (at += a.length + 1) - 1, next[i], out);
  });
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

// a patch of base aligned again by words, hence narrowed to the words that differ
export const byWords = (base: string, p: Patch): Patch[] => aligned(base, p.start, p.end, p.text, 0, p.text.length, WORDS);

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
  // an insertion that ends with a space after a space, and before no letter, starts with this space
  // instead, e.g. a word put in at the end of a paragraph after a space that another person typed, as
  // runsOf() reads it. a word put in before another word keeps the space after it
  return widen(base, cap(base, patches)).map((p, i, all) => {
    const c = base[p.start - 1] ?? '', at = p.start - 1;
    return p.start < p.end || c !== ' ' || !p.text.endsWith(c) || spaced(p.text) || goesOn(base[p.start]) || all[i - 1]?.end === p.start ? p : { start: at, end: at, text: c + p.text.slice(0, -1) };
  });
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

// the start of the line of offset i of text when only spaces and tabs come before i on it, else i
function lineStart(text: string, i: number): number {
  let s = i;
  while (s > 0 && (text[s - 1] === ' ' || text[s - 1] === '\t')) s--;
  return s === 0 || text[s - 1] === '\n' ? s : i;
}

// p moved by k characters, or null when the text with it would differ, i.e. when the text that a
// removal takes, or the text next to an insertion, does not repeat over k characters
function slid(base: string, p: Patch, k: number): Patch | null {
  const s = p.start + k, e = p.end + k;
  if (s < 0 || e > base.length) return null;
  if (p.start < p.end) {
    const same = k < 0 ? base.slice(s, p.start) === base.slice(e, p.end) : base.slice(p.start, s) === base.slice(p.end, e);
    return same ? { start: s, end: e, text: '' } : null;
  }
  const around = k < 0 ? base.slice(s, p.start) + p.text : p.text + base.slice(p.start, s);
  const text = k < 0 ? around.slice(0, p.text.length) : around.slice(k);
  return (k < 0 ? around.slice(p.text.length) === base.slice(s, p.start) : around.slice(0, k) === base.slice(p.start, s)) ? { start: s, end: s, text } : null;
}

const pure = (p: Patch) => (p.start === p.end ? p.text !== '' : p.text === '');

// the removal or insertion that p makes, without the characters at its start or its end that it
// takes and puts back, e.g. a tag that widen() took into a removal next to it, or null
export function coreOf(base: string, p: Patch): Patch | null {
  if (pure(p)) return p;
  const old = base.slice(p.start, p.end), n = Math.min(old.length, p.text.length);
  let head = 0;
  while (head < n && old.charCodeAt(head) === p.text.charCodeAt(head)) head++;
  let tail = 0;
  while (tail < n - head && old.charCodeAt(old.length - 1 - tail) === p.text.charCodeAt(p.text.length - 1 - tail)) tail++;
  const c = { start: p.start + head, end: p.end - tail, text: p.text.slice(head, p.text.length - tail) };
  return pure(c) ? c : null;
}

// the patches of diff(base, text) with each removal and each insertion that could be made at another
// place with the same text moved to one of places, the offsets of text at which the editor put or
// removed an element, or to the start of the line of one when its indentation alone comes before it.
// diff() places a change as late as it can, hence without places the removal of the first of two
// equal elements reads as the removal of the second, and its comments move to the first
export function placed(base: string, patches: Patch[], places: readonly number[], text: string): Patch[] {
  if (!places.length) return patches;
  const marks = places.flatMap((h) => [lineStart(text, h), h]);
  const out: Patch[] = [];
  let delta = 0;
  patches.forEach((p, i) => {
    const lo = out.length ? out[out.length - 1].end : 0, hi = i + 1 < patches.length ? patches[i + 1].start : base.length;
    const pure = coreOf(base, p);
    const found = !!pure && marks.some((h) => {
      const k = h - pure.start - delta;
      const moved = k === 0 ? pure : Math.abs(k) <= 4 * LONG && slid(base, pure, k);
      const [w] = moved ? widen(base, [moved]) : [];
      if (!w || w.start < lo || w.end > hi) return false;
      out.push(k === 0 ? p : w);
      return true;
    });
    if (!found) out.push(p);
    delta += p.text.length - (p.end - p.start);
  });
  return out;
}

// offsets of a moved onto b: those before the first character that differs stay, those after the
// last one move with the end, and those between are dropped
export function moveOffsets(offsets: readonly number[], a: string, b: string): number[] {
  if (!offsets.length || a === b) return [...offsets];
  const [head, e] = shared(a, b), tail = a.length - e;
  return offsets.flatMap((h) => (h <= head ? [h] : h >= tail ? [h + b.length - a.length] : []));
}

// the patches of theirs with each that is the same change as a patch of ours, made at another place
// of base, moved onto the place of ours, e.g. the removal of one of two equal elements that a diff
// placed late. a resync takes the difference of two texts, which does not tell the place
export function alignTo(base: string, theirs: Patch[], ours: Patch[]): Patch[] {
  const used = new Set<Patch>();
  const out = theirs.map((t) => {
    if (!pure(t)) return t;
    const o = ours.find((o) => !used.has(o) && o.start !== t.start && o.end - o.start === t.end - t.start && slid(base, t, o.start - t.start)?.text === o.text);
    if (!o) return t;
    used.add(o);
    return o;
  });
  if (!used.size) return theirs;
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return valid(out, base.length) ? out : theirs;
}
