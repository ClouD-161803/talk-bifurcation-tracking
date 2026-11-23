import type { Pairing } from '../render.ts';
import type { Source, SrcEl, SrcNode, SrcText } from '../source.ts';
import type { Range, Token } from '../tokens.ts';
import { contentRange, decode, elementRange, fragmentRoot, isTextElement, parseFragment, RAW_TEXT, segmentsOf, shared, tokenize, VOID } from './host.ts';

export type Window = { start: number; endA: number; endB: number };

export function windowOf(a: string, b: string): Window | null {
  if (a === b) return null;
  const [s, t] = shared(a, b);
  return { start: s, endA: a.length - t, endB: b.length - t };
}

const move = (r: Range | null, d: number): void => {
  if (!r) return;
  r.start += d;
  r.end += d;
};

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

export function closing(bytes: string, el: SrcEl): 'closed' | 'open' | 'out' {
  const open: string[] = [];
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

export function startTag(source: Source, el: SrcEl, text: string): StartTag | null {
  const open = el.open;
  if (!open || !el.parent) return null;
  const bytes = text.slice(open.start, open.end + text.length - source.text.length);
  const tokens = tokenize(bytes);
  const t = tokens[0];
  return tokens.length === 1 && t.type === 'start' && t.name === el.tag.toLowerCase() && t.end === bytes.length ? t : null;
}

export function retag(source: Source, el: SrcEl, text: string, t = startTag(source, el, text)): boolean {
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

const NEWLINE_DROPPED_AFTER_START = new Set(['pre', 'textarea', 'listing']);

export function decodedIn(parent: SrcEl, index: number, text: string, d: number): string | null {
  const k = parent.children[index];
  if (k?.kind !== 'text' || RAW_TEXT.has(parent.tag)) return null;
  const raw = text.slice(k.range.start, k.range.end + d);
  if (raw.includes('<')) return null;
  const lead = index === 0 && NEWLINE_DROPPED_AFTER_START.has(parent.tag) ? (/^\r?\n/.exec(raw)?.[0].length ?? 0) : 0;
  if (lead !== k.lead) return null;
  const plain = raw.slice(lead).replace(/\r\n?/g, '\n');
  const decoded = plain.includes('&') ? decode(plain) : plain;
  return decoded ? decoded : null;
}

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

export type Spot =
  | { kind: 'text'; el: SrcEl; live: Element }
  | { kind: 'tag'; el: SrcEl; live: Element }
  | { kind: 'within'; el: SrcEl; live: Element }
  | { kind: 'reload' };

export function liveChild(pairing: Pairing, live: Element, s: SrcEl): Element | null {
  for (const c of live.children) if (pairing.elements.get(c) === s) return c;
  return null;
}

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
      if (isTextElement(k)) return { kind: 'within', el, live };
      inner = { el: k, live: lk };
      break;
    }
    if (!inner) return { kind: 'within', el, live };
    ({ el, live } = inner);
  }
}

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
