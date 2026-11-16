// the anchors of comments moved by an operation. an anchor is the start tag of an element, and a
// comment on an element keeps the start tag of its slide as well. a patch that only passes an
// anchor shifts it, and a start tag replaced keeps its element. a slide whose text is unchanged is
// followed wherever it moves, since a line diff may move the text of a slide and leave its start
// tag in place, and an element whose text the patches take from its place is followed to where
// they insert it. a removed element falls back to its slide, and a removed slide to the deck, with
// the removed text kept up to 4 kB, by which a re-insertion of it unchanged attaches the anchor
// again. an element of a removed slide keeps the text of the slide as well, and is looked for only
// inside a re-insertion of the whole slide. pure, for the edit command and the browser

import { tokenize } from '../editor/tokens.ts';
import { checksum, shiftOffset } from './patch.ts';
import type { Anchor, Patch } from './protocol.ts';
import { pairInPlace, pairs, shared, slidesOf, VOID, type Slide } from './slides.ts';

export type Anchored = { anchor: Anchor | null; slide: Anchor | null; removed?: { text: string | null; slide?: string } };
// the items in the order given, true in changed for an item moved otherwise than by a shift, and
// the slides of the text after, or null when they were neither given nor needed. a shift keeps the
// numbers of the slides, which only their offsets are kept for
export type Moved = { items: Anchored[]; changed: boolean[]; slides: Slide[] | null };

export const REMOVED_MAX = 4096;
const CHECK_TAG = 256;

// what a start reads the element of an anchor by when its offset may be stale: its start tag, cut at
// CHECK_TAG characters, and the checksum of its text, cut at REMOVED_MAX
export type Check = { tag: string; sum: string };

type Span = { start: number; end: number };

const tagOf = (s: Slide): Anchor => ({ start: s.start, end: s.open, tag: 'section' });
const sameAnchor = (a: Anchor | null, b: Anchor | null) => a === b || (!!a && !!b && a.start === b.start && a.end === b.end && a.tag === b.tag);
const shiftTag = (a: Anchor, patches: Patch[]): Anchor => ({ start: shiftOffset(a.start, patches, true), end: shiftOffset(a.end, patches, false), tag: a.tag });
// true when p changes a character of [s, e) or inserts strictly inside it
const touches = (p: Patch, s: number, e: number) => (p.start < p.end ? p.start < e && s < p.end : s < p.start && p.start < e);
const withRemoved = (anchor: Anchor | null, slide: Anchor | null, removed?: Anchored['removed']): Anchored => (removed ? { anchor, slide, removed } : { anchor, slide });

// the start tag that begins at offset i of text, or null
export function startTagAt(text: string, i: number): Anchor | null {
  if (!Number.isInteger(i) || i < 0 || text.charCodeAt(i) !== 60 || !/[A-Za-z]/.test(text.charAt(i + 1))) return null;
  // the tag is read from a slice that grows until it holds the whole tag
  for (let size = 256; ; size *= 4) {
    const whole = i + size >= text.length;
    const t = tokenize(text.slice(i, i + size))[0];
    if (t?.type === 'start' && (whole || t.end < size)) return text.charCodeAt(i + t.end - 1) === 62 ? { start: i, end: i + t.end, tag: t.name } : null;
    if (whole || (t && t.type !== 'start' && t.type !== 'text')) return null;
  }
}

// the slide that holds offset i, or null
export function slideAt(slides: Slide[], i: number): Slide | null {
  let lo = 0;
  let hi = slides.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (slides[mid].start <= i) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 && i < slides[found].end ? slides[found] : null;
}

export function slideAnchorAt(slides: Slide[], i: number): Anchor | null {
  const s = slideAt(slides, i);
  return s ? tagOf(s) : null;
}

// the end of the element whose start tag is at: the end of its end tag, or the start of the end
// tag of an ancestor that closes it, read from a slice that grows up to limit, and close, the start
// of its end tag or end when it has none. -1 for both when it does not end before limit
function elementClose(text: string, at: Anchor, limit: number): { end: number; close: number } {
  if (VOID.has(at.tag)) return { end: at.end, close: at.end };
  for (let size = Math.max(1024, 2 * (at.end - at.start)); ; size *= 4) {
    const whole = at.start + size >= limit;
    const tokens = tokenize(text.slice(at.start, whole ? limit : at.start + size));
    const first = tokens[0];
    if (!first || first.type !== 'start' || first.selfClosing) return { end: at.end, close: at.end };
    // the last token of a slice may be cut
    const n = whole ? tokens.length : tokens.length - 1;
    const open: string[] = [];
    for (let k = 0; k < n; k++) {
      const t = tokens[k];
      if (t.type === 'start') {
        if (!t.selfClosing && !VOID.has(t.name)) open.push(t.name);
      } else if (t.type === 'end') {
        const i = open.lastIndexOf(t.name);
        if (i < 0) return { end: at.start + t.start, close: at.start + t.start };
        open.length = i;
        if (i === 0) return { end: at.start + t.end, close: at.start + t.start };
      }
    }
    if (whole) return { end: -1, close: -1 };
  }
}

const elementEnd = (text: string, at: Anchor, limit: number) => elementClose(text, at, limit).end;

// the ranges of the text after the patches that they inserted, sorted
function insertedSpans(patches: Patch[]): Span[] {
  const out: Span[] = [];
  let delta = 0;
  for (const p of patches) {
    if (p.text) out.push({ start: p.start + delta, end: p.start + delta + p.text.length });
    delta += p.text.length - (p.end - p.start);
  }
  return out;
}

// true when [s, e) shares a character with one of the sorted spans
function overlaps(spans: Span[], s: number, e: number): boolean {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid].end <= s) lo = mid + 1;
    else if (spans[mid].start >= e) hi = mid - 1;
    else return true;
  }
  return false;
}

// the place of text in after, inside within when it is given, that overlaps the inserted spans, the
// nearest to near, or -1. only the text around the spans is read, unless it is about as long as all
function findInserted(after: string, text: string, inserted: Span[], near: number, within: Span | null = null): number {
  if (!text || !inserted.length) return -1;
  const len = text.length;
  const lo = within ? within.start : 0;
  const hi = within ? within.end : after.length;
  let best = -1;
  let n = 0;
  const scan = (from: number, to: number) => {
    const w = from === 0 && to === after.length ? after : after.slice(from, to);
    for (let o = w.indexOf(text); o >= 0 && n < 256; o = w.indexOf(text, o + 1), n++) {
      const at = from + o;
      if (overlaps(inserted, at, at + len) && (best < 0 || Math.abs(at - near) < Math.abs(best - near))) best = at;
    }
  };
  let total = 0;
  for (const s of inserted) total += s.end - s.start + 2 * len;
  if (total >= hi - lo) {
    scan(lo, hi);
    return best;
  }
  for (let k = 0; k < inserted.length; k++) {
    const from = Math.max(lo, inserted[k].start - len + 1);
    let to = inserted[k].end + len - 1;
    while (k + 1 < inserted.length && inserted[k + 1].start - len + 1 < to) to = inserted[++k].end + len - 1;
    if (from < Math.min(hi, to)) scan(from, Math.min(hi, to));
  }
  return best;
}

// the slides of before matched to those of after. a slide that no patch touches is the same slide at
// its shifted place. of the others, a slide of equal text is matched first, the nearest between
// several, and then the rest in order, two slides only when they share at least half of the shorter
// text without tags. of the slides left out on both sides, pairInPlace of slides.ts pairs those
// edited in place, as slideChanges does for the version history. a slide left out is removed
function matchSlides(before: string, s0: Slide[], after: string, s1: Slide[], patches: Patch[]): { to: Int32Array; kept: Uint8Array } {
  const to = new Int32Array(s0.length).fill(-1);
  const kept = new Uint8Array(s0.length);
  const used = new Uint8Array(s1.length);
  const starts = new Map(s1.map((s, j) => [s.start, j]));
  let k = 0;
  let delta = 0;
  for (let i = 0; i < s0.length; i++) {
    const s = s0[i];
    for (; k < patches.length && patches[k].end <= s.start; k++) delta += patches[k].text.length - (patches[k].end - patches[k].start);
    let touched = false;
    for (let q = k; q < patches.length && patches[q].start < s.end && !touched; q++) touched = touches(patches[q], s.start, s.end);
    const j = touched ? undefined : starts.get(s.start + delta);
    if (j === undefined || used[j] || s1[j].end - s1[j].start !== s.end - s.start) continue;
    to[i] = j;
    kept[i] = 1;
    used[j] = 1;
  }
  const textA = (i: number) => before.slice(s0[i].start, s0[i].end);
  const restB = [...s1.keys()].filter((j) => !used[j]);
  const textB = restB.map((j) => after.slice(s1[j].start, s1[j].end));
  const byText = new Map<string, number[]>();
  restB.forEach((j, x) => {
    const list = byText.get(textB[x]);
    if (list) list.push(j);
    else byText.set(textB[x], [j]);
  });
  const restA: number[] = [];
  for (let i = 0; i < s0.length; i++) {
    if (to[i] >= 0) continue;
    const t = textA(i);
    let best = -1;
    for (const j of byText.get(t) ?? []) if (!used[j] && (best < 0 || Math.abs(j - i) < Math.abs(best - i))) best = j;
    if (best < 0) {
      restA.push(i);
      continue;
    }
    to[i] = best;
    kept[i] = 1;
    used[best] = 1;
  }
  const left = restB.filter((j) => !used[j]);
  for (const p of pairs(restA.map(textA), left.map((j) => after.slice(s1[j].start, s1[j].end)), true)) {
    to[restA[p.i]] = left[p.j];
    used[left[p.j]] = 1;
  }
  pairInPlace(to, s1.length, textA, (j) => after.slice(s1[j].start, s1[j].end));
  return { to, kept };
}

type Region = { tokens: ReturnType<typeof tokenize>; fresh: ReturnType<typeof tokenize> };

// the start tag from start to end of text, or null, since a tag read from a region may be cut
function wholeTag(text: string, start: number, end: number): Anchor | null {
  const t = startTagAt(text, start);
  return t && t.end === end ? t : null;
}

// the start tag of the element of a in after, found from the patches alone, or null. regions holds
// the tokens of the regions read for other anchors of the same operation
function byPatches(a: Anchor, before: string, patches: Patch[], after: string, regions: Map<string, Region>): Anchor | null {
  let first = -1;
  let last = -1;
  for (let k = 0; k < patches.length && patches[k].start <= a.end; k++) {
    if (!touches(patches[k], a.start, a.end)) continue;
    if (first < 0) first = k;
    last = k;
  }
  if (first < 0) return shiftTag(a, patches);
  let inside = true;
  for (let k = first; k <= last; k++) if (!(patches[k].start > a.start && patches[k].end < a.end)) inside = false;
  // an attribute changed, and the start tag is still at its place
  if (inside) return startTagAt(after, shiftOffset(a.start, patches, true));
  // the start tag replaced: found by its place among the start tags of its name in the region
  const a0 = Math.min(a.start, patches[first].start);
  const b0 = Math.max(a.end, patches[last].end);
  let delta = 0;
  for (let k = 0; k < first; k++) delta += patches[k].text.length - (patches[k].end - patches[k].start);
  let grow = 0;
  for (let k = first; k <= last; k++) grow += patches[k].text.length - (patches[k].end - patches[k].start);
  const a1 = a0 + delta;
  const b1 = b0 + delta + grow;
  const key = `${a0}:${b0}`;
  let region = regions.get(key);
  if (!region) regions.set(key, (region = { tokens: tokenize(before.slice(a0, b0)), fresh: tokenize(after.slice(a1, b1)) }));
  const fresh = region.fresh;
  const t0 = fresh[0];
  if (a0 === a.start && b0 === a.end && fresh.length === 1 && t0.type === 'start' && t0.end === b1 - a1) return wholeTag(after, a1, b1);
  // by name first, and then among all start tags, which follows a renamed element
  for (const named of [true, false]) {
    const old = region.tokens.filter((t) => t.type === 'start' && (!named || t.name === a.tag));
    const now = fresh.filter((t) => t.type === 'start' && (!named || t.name === a.tag));
    const k = old.findIndex((t) => t.start === a.start - a0);
    const t = now[k];
    if (k >= 0 && old.length === now.length && t.type === 'start') return wholeTag(after, a1 + t.start, a1 + t.end);
  }
  return null;
}

// true when the tag of a is still a start tag of its name after a patch inside it
function keepsTag(after: string, a: Anchor, patches: Patch[]): boolean {
  const t = startTagAt(after, shiftOffset(a.start, patches, true));
  return !!t && t.tag === a.tag && t.end === shiftOffset(a.end, patches, false);
}

const changedFrom = (it: Anchored, next: Anchored, patches: Patch[]) =>
  !sameAnchor(next.anchor, it.anchor && shiftTag(it.anchor, patches)) ||
  !sameAnchor(next.slide, it.slide && shiftTag(it.slide, patches)) ||
  !!next.removed !== !!it.removed ||
  next.removed?.text !== it.removed?.text ||
  next.removed?.slide !== it.removed?.slide;

// true when the nearest < or > before p is a > or there is none, and the nearest at or after its end
// is a < or there is none
function betweenTags(text: string, p: Patch): boolean {
  if (p.start > 0 && text.lastIndexOf('<', p.start - 1) > text.lastIndexOf('>', p.start - 1)) return false;
  const gt = text.indexOf('>', p.end);
  if (gt < 0) return true;
  const lt = text.indexOf('<', p.end);
  return lt >= 0 && lt < gt;
}

// items moved by patches, which make after from before. slides are those of before when they are
// known, e.g. from the call for the operation before
export function moveAnchors(before: string, patches: Patch[], after: string, items: Anchored[], slides: Slide[] | null = null): Moved {
  if (!patches.length) return { items, changed: items.map(() => false), slides };
  if (!items.length) return { items, changed: [], slides: null };
  const p = patches[0];
  // the fast path of typing: one patch between a > and the next <, which neither removes nor inserts
  // one, hence no element appears, goes, or moves, as it could inside a tag or an HTML comment
  if (patches.length === 1 && !/[<>]/.test(p.text) && !/[<>]/.test(before.slice(p.start, p.end)) && betweenTags(before, p)) {
    const out: Anchored[] = new Array(items.length);
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if ((it.anchor && touches(p, it.anchor.start, it.anchor.end) && !keepsTag(after, it.anchor, patches)) || (it.slide && touches(p, it.slide.start, it.slide.end) && !keepsTag(after, it.slide, patches))) {
        return slow(before, patches, after, items, slides);
      }
      out[k] = withRemoved(it.anchor && shiftTag(it.anchor, patches), it.slide && shiftTag(it.slide, patches), it.removed);
    }
    const shifted = slides && slides.map((s) => ({ start: shiftOffset(s.start, patches, true), end: shiftOffset(s.end, patches, false), open: shiftOffset(s.open, patches, false), number: s.number }));
    return { items: out, changed: items.map(() => false), slides: shifted };
  }
  return slow(before, patches, after, items, slides);
}

type Matched = { s1: Slide[]; to: Int32Array; kept: Uint8Array };

// the slides of after when the patches change the inside of one slide and no section tag, hence
// the slides are only shifted, found by reading that slide alone, or null
function shiftedSlides(before: string, patches: Patch[], after: string, s0: Slide[]): Matched | null {
  const s = slideAt(s0, patches[0].start);
  if (!s || patches[0].start < s.open) return null;
  const close = before.lastIndexOf('</', s.end - 1);
  if (close < s.open || patches[patches.length - 1].end > close) return null;
  const growth = patches.reduce((n, q) => n + q.text.length - (q.end - q.start), 0);
  const end = s.end + growth;
  // read from the end of the start tag, the slide ends at its end tag as before, and holds no other
  // section tag, hence what follows is read as before
  const tokens = tokenize(after.slice(s.open, end));
  const last = tokens[tokens.length - 1];
  if (!last || last.type !== 'end' || last.name !== 'section' || last.start !== close + growth - s.open || last.end !== end - s.open) return null;
  for (let k = 0; k < tokens.length - 1; k++) {
    const t = tokens[k];
    if ((t.type === 'start' || t.type === 'end') && t.name === 'section') return null;
  }
  const i = s0.indexOf(s);
  const s1 = s0.map((x, k) => (k < i ? x : k === i ? { ...x, end } : { start: x.start + growth, end: x.end + growth, open: x.open + growth, number: x.number }));
  const kept = new Uint8Array(s0.length).fill(1);
  kept[i] = before.slice(s.start, s.end) === after.slice(s.start, end) ? 1 : 0;
  return { s1, to: Int32Array.from(s0.keys()), kept };
}

function matchedSlides(before: string, s0: Slide[], after: string, patches: Patch[]): Matched {
  const s1 = slidesOf(after);
  return { s1, ...matchSlides(before, s0, after, s1, patches) };
}

const squeeze = (text: string) => text.replace(/\n[ \t]*/g, '\n');

function slow(before: string, patches: Patch[], after: string, items: Anchored[], given: Slide[] | null): Moved {
  const s0 = given ?? slidesOf(before);
  const { s1, to, kept } = shiftedSlides(before, patches, after, s0) ?? matchedSlides(before, s0, after, patches);
  const index = new Map(s0.map((s, i) => [s.start, i]));
  const inserted = insertedSpans(patches);
  // an element longer than every inserted span and than REMOVED_MAX is neither found by its text nor
  // kept as removed text, hence its end is not looked for further
  const cap = inserted.reduce((n, s) => Math.max(n, s.end - s.start), REMOVED_MAX) + 1;
  const regions = new Map<string, Region>();

  // false when the patches removed the element of a, whose text in before ends at end and whose end
  // tag starts at close: a removal of its end tag that may as well start at a.start, where it then
  // covers the element, as when a line diff keeps the start tag for a sibling that starts the same way
  const stays = (a: Anchor, close: number, end: number): boolean => {
    const q = patches.find((p) => touches(p, close, end));
    if (!q || q.text) return true;
    if (q.start <= a.start) return q.end < end;
    const k = q.start - a.start;
    if (patches.some((p) => p !== q && touches(p, a.start, q.start))) return true;
    return !(q.end - k >= end && before.startsWith(before.slice(a.start, q.start), q.end - k));
  };

  // the element that the element of found holds alone, when it reads as the element of a did, given
  // as its text, as when the patches wrapped it in a new element of the same start tag, or null
  const wrapped = (a: Anchor, text: string, found: Anchor): Anchor | null => {
    const s = slideAt(s1, found.start);
    const { close } = elementClose(after, found, s ? s.end : after.length);
    if (close <= found.end) return null;
    const inner = after.slice(found.end, close);
    const o = found.end + inner.length - inner.trimStart().length;
    const t = startTagAt(after, o);
    return t && t.tag === a.tag && overlaps(inserted, o, close) && squeeze(inner.trim()) === squeeze(text) ? t : null;
  };

  // the element of a where the patches inserted its text, when the element of found lost some of its
  // inner text, as when a line diff shows a move as a swap of two texts, or null. an element that
  // only gained text was edited, and the inserted text is a copy
  const swapped = (a: Anchor, close: number, text: string, found: Anchor): Anchor | null => {
    const o = findInserted(after, text, inserted, found.start);
    if (o < 0) return null;
    const s = slideAt(s1, found.start);
    const c = elementClose(after, found, s ? s.end : after.length).close;
    const old = before.slice(a.end, close);
    return shared(old, c > found.end ? after.slice(found.end, c) : '') < old.length ? { start: o, end: o + a.end - a.start, tag: a.tag } : null;
  };

  // the element of a in after, or null, and its text in before, or null when it is longer than cap
  const locate = (a: Anchor, limit: number): { anchor: Anchor | null; text: string | null } => {
    const found = byPatches(a, before, patches, after, regions);
    if (found && !patches.some((q) => touches(q, a.start, limit))) return { anchor: found, text: null };
    const bound = Math.max(a.end, Math.min(limit, a.start + cap));
    const { end: e, close } = elementClose(before, a, bound);
    if (e < 0 && bound < limit) return { anchor: found, text: null };
    const end = e < 0 ? bound : e;
    const text = before.slice(a.start, end);
    if (!patches.some((q) => touches(q, a.start, end)) || (found && after.startsWith(text, found.start))) return { anchor: found, text };
    // an element found by its start tag is still the element, unless the patches removed it
    if (found && e > a.end) {
      if (stays(a, close, end)) return { anchor: wrapped(a, text, found) ?? swapped(a, close, text, found) ?? found, text };
      const o = findInserted(after, text, inserted, found.start);
      return { anchor: o >= 0 ? { start: o, end: o + a.end - a.start, tag: a.tag } : null, text };
    }
    // the text of an element taken from its place is looked for where the patches inserted text
    const o = findInserted(after, text, inserted, found?.start ?? shiftOffset(a.start, patches));
    if (o >= 0) return { anchor: { start: o, end: o + a.end - a.start, tag: a.tag }, text };
    return { anchor: found, text };
  };

  // the start tag of the name of a at its place among those of its name in slide from, found in the
  // slide to of after, or null when the two slides do not hold as many
  const samePlace = (a: Anchor, from: Slide, to: Slide): Anchor | null => {
    const named = (text: string, s: Slide) => tokenize(text.slice(s.start, s.end)).filter((t) => t.type === 'start' && t.name === a.tag);
    const old = named(before, from);
    const now = named(after, to);
    const k = old.findIndex((t) => t.start === a.start - from.start);
    return k >= 0 && old.length === now.length ? wholeTag(after, to.start + now[k].start, to.start + now[k].end) : null;
  };

  // the element of a removed text that the patches inserted again into the slide of it, or anywhere
  // for a thread of the deck, unless the same operation took the text from elsewhere
  const reattach = (it: Anchored, text: string): Anchored | null => {
    const took = (x: string) => patches.some((p) => p.end - p.start >= x.length && before.slice(p.start, p.end).includes(x));
    let within: Span | null = null;
    if (it.slide) {
      const i = index.get(it.slide.start) ?? -1;
      if (i < 0 || to[i] < 0) return null;
      within = s1[to[i]];
    } else {
      // a thread of the deck is of a removed slide, whose whole text has to be inserted again
      const whole = it.removed?.slide ?? (startTagAt(text, 0)?.tag === 'section' ? text : null);
      const s = whole ? findInserted(after, whole, inserted, 0) : -1;
      if (s < 0 || took(whole!)) return null;
      within = { start: s, end: s + whole!.length };
      // an element that had fallen back to the slide before its removal falls back to it again
      if (!whole!.includes(text)) {
        const slide = slideAt(s1, s);
        return slide?.start === s ? { anchor: tagOf(slide), slide: tagOf(slide), removed: { text } } : null;
      }
    }
    const o = findInserted(after, text, inserted, it.anchor ? shiftOffset(it.anchor.start, patches) : within ? within.start : 0, within);
    const t = o >= 0 ? startTagAt(after, o) : null;
    if (!t || took(text)) return null;
    const slide = slideAt(s1, o);
    return slide?.start === o ? { anchor: tagOf(slide), slide: tagOf(slide) } : { anchor: t, slide: slide && tagOf(slide) };
  };

  const move = (it: Anchored): Anchored => {
    const again = it.removed?.text ? reattach(it, it.removed.text) : null;
    if (again) return again;
    const a = it.anchor;
    if (!a) return withRemoved(null, null, it.removed);
    let i = it.slide ? (index.get(it.slide.start) ?? -1) : -1;
    if (i < 0) {
      const s = slideAt(s0, a.start);
      i = s ? index.get(s.start)! : -1;
    }
    const j = i >= 0 ? to[i] : -1;
    // a comment on a slide, or one fallen back to it
    if (it.slide && a.start === it.slide.start) {
      if (j >= 0) return withRemoved(tagOf(s1[j]), tagOf(s1[j]), it.removed);
      const whole = i >= 0 && s0[i].end - s0[i].start <= REMOVED_MAX ? before.slice(s0[i].start, s0[i].end) : null;
      if (!it.removed) return { anchor: null, slide: null, removed: { text: whole } };
      return { anchor: null, slide: null, removed: whole && it.removed.text ? { text: it.removed.text, slide: whole } : it.removed };
    }
    // an element of a slide whose text is unchanged, wherever the slide went
    if (j >= 0 && kept[i]) {
      const d = s1[j].start - s0[i].start;
      return { anchor: { start: a.start + d, end: a.end + d, tag: a.tag }, slide: tagOf(s1[j]) };
    }
    // an element of a removed slide is kept only where the patches inserted its text, as by a move.
    // a line diff may leave its start tag in place for an element of another slide
    if (i >= 0 && j < 0) {
      const bound = Math.max(a.end, Math.min(s0[i].end, a.start + cap));
      const e = elementEnd(before, a, bound);
      const text = e < 0 ? null : before.slice(a.start, e);
      const o = text ? findInserted(after, text, inserted, shiftOffset(a.start, patches)) : -1;
      if (o >= 0) return { anchor: { start: o, end: o + a.end - a.start, tag: a.tag }, slide: slideAnchorAt(s1, o) };
      const kept = text !== null && text.length <= REMOVED_MAX ? text : null;
      const whole = kept && s0[i].end - s0[i].start <= REMOVED_MAX ? before.slice(s0[i].start, s0[i].end) : null;
      return { anchor: null, slide: null, removed: whole ? { text: kept, slide: whole } : { text: kept } };
    }
    const found = locate(a, i >= 0 ? s0[i].end : before.length);
    const at = found.anchor && slideAnchorAt(s1, found.anchor.start);
    // an element changed at a start tag outside the slide that its slide was paired with is found by
    // its place in that slide, since a line diff may leave its start tag to an element of the next one
    if (found.anchor && j >= 0 && at?.start !== s1[j].start && found.text !== null && !after.startsWith(found.text, found.anchor.start)) {
      const t = samePlace(a, s0[i], s1[j]);
      if (t) return { anchor: t, slide: tagOf(s1[j]) };
    } else if (found.anchor) return { anchor: found.anchor, slide: at };
    const back = j >= 0 ? tagOf(s1[j]) : null;
    return { anchor: back, slide: back, removed: { text: found.text !== null && found.text.length <= REMOVED_MAX ? found.text : null } };
  };

  const out = items.map(move);
  return { items: out, changed: items.map((it, k) => changedFrom(it, out[k], patches)), slides: s1 };
}

// the check of the element of a in text
export function checkOf(text: string, a: Anchor): Check {
  const limit = Math.min(text.length, a.start + REMOVED_MAX);
  const e = elementEnd(text, a, limit);
  return { tag: text.slice(a.start, Math.min(a.end, a.start + CHECK_TAG)), sum: checksum(text.slice(a.start, e < 0 ? limit : e)) };
}

// the start tag of the name of a, the nearest to its offset, whose element reads as at the check, or
// null. the checksum holds the length of the text it was taken of
export function findChecked(text: string, a: Anchor, c: Check): Anchor | null {
  const len = parseInt(c.sum, 16);
  const at = (o: number) => {
    if (checksum(text.slice(o, o + len)) !== c.sum) return null;
    const t = startTagAt(text, o);
    return t && t.tag === a.tag ? t : null;
  };
  if (text.startsWith(c.tag, a.start)) {
    const t = at(a.start);
    if (t) return t;
  }
  let l = a.start > 0 ? text.lastIndexOf(c.tag, a.start - 1) : -1;
  let h = text.indexOf(c.tag, a.start + 1);
  for (let n = 0; n < 256 && (l >= 0 || h >= 0); n++) {
    if (h < 0 || (l >= 0 && a.start - l <= h - a.start)) {
      const t = at(l);
      if (t) return t;
      l = l > 0 ? text.lastIndexOf(c.tag, l - 1) : -1;
    } else {
      const t = at(h);
      if (t) return t;
      h = text.indexOf(c.tag, h + 1);
    }
  }
  return null;
}

// items checked against text, e.g. at a start of the edit command when their text is not known. an
// item with a check keeps the nearest element that reads as at the check, and an item without one an
// anchor that is still a start tag of its name. an element falls back to its slide, or to the deck,
// and a slide that is not found by its check is kept at its offset
export function checkAnchors(text: string, items: Anchored[], slides: Slide[] = slidesOf(text), checks: (Check | null | undefined)[] = []): Moved {
  const starts = new Map(slides.map((s) => [s.start, s]));
  const out = items.map((it, k): Anchored => {
    if (!it.anchor) return withRemoved(null, null, it.removed);
    const c = checks[k];
    const found = c ? findChecked(text, it.anchor, c) : null;
    if (found) return withRemoved(found, slideAnchorAt(slides, found.start), it.removed);
    const onSlide = !!it.slide && it.slide.start === it.anchor.start;
    const t = !c || onSlide ? startTagAt(text, it.anchor.start) : null;
    if (t && t.end === it.anchor.end && t.tag === it.anchor.tag) return withRemoved(t, slideAnchorAt(slides, t.start), it.removed);
    const back = it.slide && it.slide.tag === 'section' && starts.get(it.slide.start)?.open === it.slide.end ? it.slide : null;
    return { anchor: back, slide: back, removed: it.removed ?? { text: null } };
  });
  return { items: out, changed: items.map((it, k) => changedFrom(it, out[k], [])), slides };
}
