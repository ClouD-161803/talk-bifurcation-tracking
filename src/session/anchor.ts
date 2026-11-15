// the anchors of comments moved by an operation. an anchor is the start tag of an element, and a
// comment on an element keeps the start tag of its slide as well. a patch that only passes an
// anchor shifts it, and a start tag replaced keeps its element. a slide whose text is unchanged is
// followed wherever it moves, since a line diff may move the text of a slide and leave its start
// tag in place, and an element whose text the patches take from its place is followed to where
// they insert it. a removed element falls back to its slide, and a removed slide to the deck, with
// the removed text kept up to 4 kB, by which a re-insertion of it unchanged attaches the anchor
// again. pure, for the edit command and the browser

import { tokenize } from '../editor/tokens.ts';
import { shiftOffset } from './patch.ts';
import type { Anchor, Patch } from './protocol.ts';
import { pairs, slidesOf, VOID, type Slide } from './slides.ts';

export type Anchored = { anchor: Anchor | null; slide: Anchor | null; removed?: { text: string | null } };
// the items in the order given, true in changed for an item moved otherwise than by a shift, and
// the slides of the text after, or null when they were neither given nor needed. a shift keeps the
// numbers of the slides, which only their offsets are kept for
export type Moved = { items: Anchored[]; changed: boolean[]; slides: Slide[] | null };

export const REMOVED_MAX = 4096;

type Span = { start: number; end: number };

const tagOf = (s: Slide): Anchor => ({ start: s.start, end: s.open, tag: 'section' });
const sameAnchor = (a: Anchor | null, b: Anchor | null) => a === b || (!!a && !!b && a.start === b.start && a.end === b.end && a.tag === b.tag);
const shiftTag = (a: Anchor, patches: Patch[]): Anchor => ({ start: shiftOffset(a.start, patches, true), end: shiftOffset(a.end, patches, false), tag: a.tag });
// true when p changes a character of [s, e) or inserts strictly inside it
const touches = (p: Patch, s: number, e: number) => (p.start < p.end ? p.start < e && s < p.end : s < p.start && p.start < e);
const withRemoved = (anchor: Anchor | null, slide: Anchor | null, removed?: { text: string | null }): Anchored => (removed ? { anchor, slide, removed } : { anchor, slide });

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
// tag of an ancestor that closes it, read from a slice that grows up to limit. -1 when it does not
// end before limit
function elementEnd(text: string, at: Anchor, limit: number): number {
  if (VOID.has(at.tag)) return at.end;
  for (let size = Math.max(1024, 2 * (at.end - at.start)); ; size *= 4) {
    const whole = at.start + size >= limit;
    const tokens = tokenize(text.slice(at.start, whole ? limit : at.start + size));
    const first = tokens[0];
    if (!first || first.type !== 'start' || first.selfClosing) return at.end;
    // the last token of a slice may be cut
    const n = whole ? tokens.length : tokens.length - 1;
    const open: string[] = [];
    for (let k = 0; k < n; k++) {
      const t = tokens[k];
      if (t.type === 'start') {
        if (!t.selfClosing && !VOID.has(t.name)) open.push(t.name);
      } else if (t.type === 'end') {
        const i = open.lastIndexOf(t.name);
        if (i < 0) return at.start + t.start;
        open.length = i;
        if (i === 0) return at.start + t.end;
      }
    }
    if (whole) return -1;
  }
}

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

// the place of text in after that overlaps the inserted spans, the nearest to near, or -1
function findInserted(after: string, text: string, inserted: Span[], near: number): number {
  if (!text || !inserted.length) return -1;
  let best = -1;
  for (let o = after.indexOf(text), n = 0; o >= 0 && n < 256; o = after.indexOf(text, o + 1), n++) {
    if (overlaps(inserted, o, o + text.length) && (best < 0 || Math.abs(o - near) < Math.abs(best - near))) best = o;
  }
  return best;
}

// the slides of before matched to those of after. a slide that no patch touches is the same slide at
// its shifted place. of the others, a slide of equal text is matched first, the nearest between
// several, and then the rest in order, two slides only when they share at least half of the shorter
// text. a slide left out is removed
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
  for (const p of pairs(restA.map(textA), left.map((j) => after.slice(s1[j].start, s1[j].end)), true)) to[restA[p.i]] = left[p.j];
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
  next.removed?.text !== it.removed?.text;

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

function slow(before: string, patches: Patch[], after: string, items: Anchored[], given: Slide[] | null): Moved {
  const s0 = given ?? slidesOf(before);
  const { s1, to, kept } = shiftedSlides(before, patches, after, s0) ?? matchedSlides(before, s0, after, patches);
  const index = new Map(s0.map((s, i) => [s.start, i]));
  const inserted = insertedSpans(patches);
  // an element longer than every inserted span and than REMOVED_MAX is neither found by its text nor
  // kept as removed text, hence its end is not looked for further
  const cap = inserted.reduce((n, s) => Math.max(n, s.end - s.start), REMOVED_MAX) + 1;
  const regions = new Map<string, Region>();

  // the element of a in after, or null, and its text in before, or null when it is longer than cap
  const locate = (a: Anchor, limit: number): { anchor: Anchor | null; text: string | null } => {
    const found = byPatches(a, before, patches, after, regions);
    if (found && !patches.some((q) => touches(q, a.start, limit))) return { anchor: found, text: null };
    const bound = Math.max(a.end, Math.min(limit, a.start + cap));
    const e = elementEnd(before, a, bound);
    if (e < 0 && bound < limit) return { anchor: found, text: null };
    const end = e < 0 ? bound : e;
    const text = before.slice(a.start, end);
    // the text of an element taken from its place is looked for where the patches inserted text
    if (patches.some((q) => touches(q, a.start, end)) && !(found && after.startsWith(text, found.start))) {
      const o = findInserted(after, text, inserted, found?.start ?? shiftOffset(a.start, patches));
      if (o >= 0) return { anchor: { start: o, end: o + a.end - a.start, tag: a.tag }, text };
    }
    return { anchor: found, text };
  };

  const move = (it: Anchored): Anchored => {
    if (it.removed?.text) {
      const o = findInserted(after, it.removed.text, inserted, it.anchor ? shiftOffset(it.anchor.start, patches) : 0);
      const t = o >= 0 ? startTagAt(after, o) : null;
      if (t) {
        const slide = slideAt(s1, o);
        return slide?.start === o ? { anchor: tagOf(slide), slide: tagOf(slide) } : { anchor: t, slide: slide && tagOf(slide) };
      }
    }
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
      return { anchor: null, slide: null, removed: it.removed ?? { text: i >= 0 && s0[i].end - s0[i].start <= REMOVED_MAX ? before.slice(s0[i].start, s0[i].end) : null } };
    }
    // an element of a slide whose text is unchanged, wherever the slide went
    if (j >= 0 && kept[i]) {
      const d = s1[j].start - s0[i].start;
      return { anchor: { start: a.start + d, end: a.end + d, tag: a.tag }, slide: tagOf(s1[j]) };
    }
    const found = locate(a, i >= 0 ? s0[i].end : before.length);
    if (found.anchor) return { anchor: found.anchor, slide: slideAnchorAt(s1, found.anchor.start) };
    const back = j >= 0 ? tagOf(s1[j]) : null;
    return { anchor: back, slide: back, removed: { text: found.text !== null && found.text.length <= REMOVED_MAX ? found.text : null } };
  };

  const out = items.map(move);
  return { items: out, changed: items.map((it, k) => changedFrom(it, out[k], patches)), slides: s1 };
}

// items checked against text, e.g. at a start of the edit command when their text is not known:
// an anchor that is not a start tag of its name falls back to its slide, or to the deck
export function checkAnchors(text: string, items: Anchored[], slides: Slide[] = slidesOf(text)): Moved {
  const starts = new Map(slides.map((s) => [s.start, s]));
  const out = items.map((it): Anchored => {
    if (!it.anchor) return withRemoved(null, null, it.removed);
    const t = startTagAt(text, it.anchor.start);
    if (t && t.end === it.anchor.end && t.tag === it.anchor.tag) return withRemoved(t, slideAnchorAt(slides, t.start), it.removed);
    const back = it.slide && it.slide.tag === 'section' && starts.get(it.slide.start)?.open === it.slide.end ? it.slide : null;
    return { anchor: back, slide: back, removed: it.removed ?? { text: null } };
  });
  return { items: out, changed: items.map((it, k) => changedFrom(it, out[k], [])), slides };
}
