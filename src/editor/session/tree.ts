// the tree of source.ts kept in step with an apply of the session, so that a change inside one
// element is read again without a parse of the whole file. every range of the tree is an offset
// into source.text, hence the ranges after a change are moved by the change of its length

import { RAW_TEXT, tokenize, type Range, type Token } from '../tokens.ts';
import { contentRange, decode, elementRange, segmentsOf, VOID, type Source, type SrcEl, type SrcNode, type SrcText } from '../source.ts';
import { fragmentRoot, parseFragment } from '../model/fragments.ts';
import { isTextElement, type Pairing } from '../render.ts';

// the part in which two texts differ: a and b are equal before start, and a after endA is equal
// to b after endB
export type Window = { start: number; endA: number; endB: number };

// the length of the slices compared before the texts are compared character by character
const CHUNK = 2048;

export function windowOf(a: string, b: string): Window | null {
  if (a === b) return null;
  const n = Math.min(a.length, b.length);
  let s = 0;
  while (s + CHUNK <= n && a.slice(s, s + CHUNK) === b.slice(s, s + CHUNK)) s += CHUNK;
  while (s < n && a.charCodeAt(s) === b.charCodeAt(s)) s += 1;
  const most = n - s;
  let t = 0;
  while (t + CHUNK <= most && a.slice(a.length - t - CHUNK, a.length - t) === b.slice(b.length - t - CHUNK, b.length - t)) t += CHUNK;
  while (t < most && a.charCodeAt(a.length - 1 - t) === b.charCodeAt(b.length - 1 - t)) t += 1;
  return { start: s, endA: a.length - t, endB: b.length - t };
}

const move = (r: Range | null, d: number): void => {
  if (!r) return;
  r.start += d;
  r.end += d;
};

// every range of node and of the nodes inside it moved by d. the attributes of a start tag are
// those of its token, hence they are moved once, through attrs
function shiftNode(node: SrcNode, d: number): void {
  if (node.kind === 'element') {
    move(node.open, d);
    for (const a of node.attrs) move(a, d);
    move(node.close, d);
    for (const c of node.children) shiftNode(c, d);
    return;
  }
  move(node.range, d);
  if (node.kind === 'text') for (const s of node.segments) move(s.raw, d);
}

// the ranges after the child at index of parent moved by d: those of the children after it, of
// the end tag of parent, and so on up to div.slides
function shiftAfter(parent: SrcEl, index: number, d: number): void {
  if (!d) return;
  let p: SrcEl | null = parent;
  let i = index;
  while (p) {
    for (let k = i + 1; k < p.children.length; k++) shiftNode(p.children[k], d);
    move(p.close, d);
    const up: SrcEl | null = p.parent;
    if (up) i = up.children.indexOf(p);
    p = up;
  }
}

function adopt(el: SrcEl, source: Source): void {
  el.source = source;
  for (const c of el.children) if (c.kind === 'element') adopt(c, source);
}

const FOREIGN = new Set(['svg', 'math']);

// how the elements in bytes, the bytes of el, are closed. 'closed' when each is closed by its end
// tag inside them, apart from el when its end tag is left out. 'open' when one is left open, or is
// closed by the end tag of an element around it, since the parser of the whole file may carry it
// over the elements after el, where a parse of bytes alone closes it at their end. 'out' when an end
// tag closes an element around el, i.e. the change reaches past el and is read at its parent
export function closing(bytes: string, el: SrcEl): 'closed' | 'open' | 'out' {
  const open: string[] = [];
  // the parser closes a self-closing tag only in SVG and MathML, and ignores its slash elsewhere
  let outer = false;
  for (let e = el.parent; e && !outer; e = e.parent) outer = FOREIGN.has(e.tag.toLowerCase());
  for (const t of tokenize(bytes)) {
    if (t.type === 'start' && !VOID.has(t.name) && !(t.selfClosing && (outer || FOREIGN.has(t.name) || open.some((n) => FOREIGN.has(n))))) open.push(t.name);
    else if (t.type === 'end') {
      const i = open.lastIndexOf(t.name);
      if (i < 0) return open.length > (el.open ? 1 : 0) ? 'open' : 'out';
      if (i < open.length - 1) return 'open';
      open.pop();
    }
  }
  return open.length === 0 || (open.length === 1 && !el.close) ? 'closed' : 'open';
}

// el read again from text, a text that differs from source.text only inside el, as a new node in
// its place, with the ranges after it moved and source.text set to text. null, with nothing
// changed, when the new bytes are not one element of the tag of el, or when keep refuses it
export function graft(source: Source, el: SrcEl, text: string, keep: (root: SrcEl) => boolean = () => true): SrcEl | null {
  const r = elementRange(el);
  const parent = el.parent;
  if (!r || !parent) return null;
  const d = text.length - source.text.length;
  const bytes = text.slice(r.start, r.end + d);
  if (closing(bytes, el) !== 'closed') return null;
  let root: SrcEl | null;
  let kids: number;
  try {
    const fragment = parseFragment(bytes, source.crlf, null);
    root = fragmentRoot(fragment);
    kids = fragment.slides.children.length;
  } catch {
    return null;
  }
  const fr = root && elementRange(root);
  if (!root || !fr || kids !== 1 || root.tag !== el.tag || !root.open !== !el.open || !root.close !== !el.close || fr.end - fr.start !== bytes.length || !keep(root)) return null;
  const index = parent.children.indexOf(el);
  shiftNode(root, r.start - fr.start);
  adopt(root, source);
  root.parent = parent;
  shiftAfter(parent, index, d);
  parent.children[index] = root;
  source.text = text;
  return root;
}

type StartTag = Extract<Token, { type: 'start' }>;

// the start tag of el read from text, a text that differs from source.text only inside this tag,
// at offsets from the start of the tag. null when the new bytes are not one start tag of the same
// name
export function startTag(source: Source, el: SrcEl, text: string): StartTag | null {
  const open = el.open;
  if (!open || !el.parent) return null;
  const bytes = text.slice(open.start, open.end + text.length - source.text.length);
  const tokens = tokenize(bytes);
  const t = tokens[0];
  return tokens.length === 1 && t.type === 'start' && t.name === el.tag.toLowerCase() && t.end === bytes.length ? t : null;
}

// the start tag of el read again from text as startTag() reads it, with the ranges after it moved.
// false, with nothing changed, when startTag() is null
export function retag(source: Source, el: SrcEl, text: string): boolean {
  const t = startTag(source, el, text);
  const open = el.open;
  if (!t || !open || !el.parent) return false;
  const d = text.length - source.text.length;
  move(t, open.start);
  for (const a of t.attrs) move(a, open.start);
  el.open = t;
  el.attrs = t.attrs;
  for (const c of el.children) shiftNode(c, d);
  move(el.close, d);
  shiftAfter(el.parent, el.parent.children.indexOf(el), d);
  source.text = text;
  return true;
}

// a newline right after the start tag of these elements is dropped by the parser
const PRE_LIKE = new Set(['pre', 'textarea', 'listing']);

// the text node at index of parent as the parser reads it from text, a text that differs from
// source.text only inside the bytes of this node: its decoded text, with each character reference
// decoded as at the parse of the file, or null when the change is a tag or a node made empty
export function decodedIn(parent: SrcEl, index: number, text: string, d: number): string | null {
  const k = parent.children[index];
  if (k?.kind !== 'text' || RAW_TEXT.has(parent.tag)) return null;
  const raw = text.slice(k.range.start, k.range.end + d);
  if (raw.includes('<')) return null;
  const lead = index === 0 && PRE_LIKE.has(parent.tag) ? (/^\r?\n/.exec(raw)?.[0].length ?? 0) : 0;
  if (lead !== k.lead) return null;
  const plain = raw.slice(lead).replace(/\r\n?/g, '\n');
  const decoded = plain.includes('&') ? decode(plain) : plain;
  return decoded ? decoded : null;
}

// the text node at index of parent set to its bytes in text, whose decoded text decodedIn gave,
// with the ranges after it moved and source.text set to text
export function retext(source: Source, parent: SrcEl, index: number, text: string, decoded: string): void {
  const k = parent.children[index] as SrcText;
  const d = text.length - source.text.length;
  k.range.end += d;
  const start = k.range.start + k.lead;
  k.decoded = decoded;
  k.segments = segmentsOf(text.slice(start, k.range.end), start, false, decoded);
  shiftAfter(parent, index, d);
  source.text = text;
}

// the text node of el, or of an element inside it, whose bytes hold [start, end), with its parent
// and its index there
export function textAt(el: SrcEl, start: number, end: number): { parent: SrcEl; index: number } | null {
  for (let i = 0; i < el.children.length; i++) {
    const c = el.children[i];
    if (c.kind === 'text') {
      if (start >= c.range.start + c.lead && end <= c.range.end) return { parent: el, index: i };
      continue;
    }
    if (c.kind !== 'element' || !c.open) continue;
    const r = contentRange(c);
    if (r && start >= r.start && end <= r.end && start >= c.open.end) return textAt(c, start, end);
  }
  return null;
}

// where a change of [start, end) of source.text falls: inside the content of a text element of the
// pairing, inside a start tag, or among the children of an element, each with its element on the
// page. a change outside the content of div.slides, or inside a script, is reloaded
export type Spot =
  | { kind: 'text'; el: SrcEl; live: Element }
  | { kind: 'tag'; el: SrcEl; live: Element }
  | { kind: 'within'; el: SrcEl; live: Element }
  | { kind: 'reload' };

// the element of the page paired with s among the children of live
export function liveChild(pairing: Pairing, live: Element, s: SrcEl): Element | null {
  for (const c of live.children) if (pairing.elements.get(c) === s) return c;
  return null;
}

// whether [start, end) changes the text of a script or of another element whose text is raw, rather
// than putting or taking the whole element
function inRaw(el: SrcEl, start: number, end: number): boolean {
  for (const k of el.children) {
    if (k.kind !== 'element') continue;
    const r = elementRange(k);
    if (!r || end <= r.start || start >= r.end || (start <= r.start && end >= r.end)) continue;
    if (RAW_TEXT.has(k.tag) || inRaw(k, start, end)) return true;
  }
  return false;
}

export function locate(source: Source, pairing: Pairing, start: number, end: number): Spot {
  let el = source.slides;
  let live = pairing.root;
  const range = contentRange(el);
  if (!live || !range || start < range.start || end > range.end || inRaw(el, start, end)) return { kind: 'reload' };
  for (;;) {
    let inner: { el: SrcEl; live: Element } | null = null;
    for (const k of el.children) {
      if (k.kind !== 'element') continue;
      const r = elementRange(k);
      if (!r || start <= r.start || end >= r.end) continue;
      if (RAW_TEXT.has(k.tag)) return { kind: 'reload' };
      const lk = liveChild(pairing, live, k);
      if (!lk) return { kind: 'within', el, live };
      if (k.open && end < k.open.end) return { kind: 'tag', el: k, live: lk };
      const c = contentRange(k);
      if (!c || start < c.start || end > c.end) return { kind: 'within', el, live };
      const textEl = pairing.byLive.get(lk);
      if (textEl) return textEl.src === k ? { kind: 'text', el: k, live: lk } : { kind: 'within', el, live };
      // a text element that could not be paired is replaced as a whole
      if (isTextElement(k)) return { kind: 'within', el, live };
      inner = { el: k, live: lk };
      break;
    }
    if (!inner) return { kind: 'within', el, live };
    ({ el, live } = inner);
  }
}

// the indexes from div.slides down to el, through the children of each element
export function pathOf(el: SrcEl): number[] {
  const out: number[] = [];
  for (let e = el; e.parent; e = e.parent) out.unshift(e.parent.children.indexOf(e));
  return out;
}

export function atPath(root: SrcEl, path: number[]): SrcEl | null {
  let el: SrcEl = root;
  for (const i of path) {
    const c = el.children[i];
    if (c?.kind !== 'element') return null;
    el = c;
  }
  return el;
}
