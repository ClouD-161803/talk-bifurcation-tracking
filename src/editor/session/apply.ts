// the apply of a session: the deck on the page made to read as a new text of the file, e.g. the text
// with the edits of another person, through the smallest change of the page that the change of the
// text needs. a change inside one text element is written into one text node with replaceData, or
// else into the content of the element with setContentWithTex. a change inside a start tag is set
// on the attributes of the element. any other change places, removes, and moves the units of the
// innermost element around it, and a unit whose text did not change keeps its node on the page.
// the work is planned before the page is changed, and a change that cannot be planned is a reload

import type { App } from '../app.ts';
import { mathLookup, setContentWithTex, type MathInfo, type MathLookup } from '../math.ts';
import { media } from '../media/store.ts';
import { detached, isTextElement, pair, pairElement, renderDeck, renderTextElement, unitsWithin, virtualChildren, type Pairing, type TextElement } from '../render.ts';
import { contentRange, elementRange, parseSource, VOID, type Piece, type Source, type SrcEl, type SrcText } from '../source.ts';
import { stateOf } from '../tags.ts';
import { RAW_TEXT, type Attr } from '../tokens.ts';
import { caretOf, mapOffset, putCaret, textIn } from './caret.ts';
import { refreshHeads } from '../history.ts';
import { atPath, decodedIn, graft, liveChild, pathOf, retag, retext, textAt, type Spot, type Window } from './tree.ts';

export const NO_MATH: MathLookup = () => null;
const SVG = 'http://www.w3.org/2000/svg';

// what an apply changed on the page. touched holds for the elements changed, replaced, or taken
// off the page, whose entries of the history are pruned, and within holds for an element inside
// which the apply changed, placed, or took an element. hosts are the text elements whose content
// was set and placed the new elements, which are typeset by the promises of typeset, and caret
// puts the caret back after them
export type Done = {
  changed: Element[];
  touched: (el: Element) => boolean;
  within: (root: Element) => boolean;
  hosts: Element[];
  placed: Element[];
  typeset: Promise<unknown>[];
  structural: boolean;
  caret: (() => void) | null;
};

type Ctx = {
  app: App;
  source: Source;
  pairing: Pairing;
  text: string;
  touched: Set<Element>;
  gone: Element[];
  // the parents of the elements taken off the page
  cuts: Element[];
  changed: Element[];
  hosts: Element[];
  placed: Element[];
  typeset: Promise<unknown>[];
};

const done = (ctx: Ctx, structural: boolean, caret: (() => void) | null): Done => {
  const marks = [...ctx.touched, ...ctx.placed, ...ctx.cuts].filter((el) => el.isConnected);
  return {
    changed: [...new Set(ctx.changed)].filter((el) => el.isConnected),
    touched: (el) => ctx.touched.has(el) || ctx.gone.some((g) => g.contains(el)),
    within: (root) => marks.some((m) => root.contains(m)),
    hosts: ctx.hosts,
    placed: ctx.placed,
    typeset: ctx.typeset,
    structural,
    caret,
  };
};

type Jax = { MathJax?: { startup?: { document?: { getMathItemsWithin(els: Element[]): { typesetRoot?: Element; math: string; display: boolean; start: { delim?: string }; end: { delim?: string } }[] } } } };

// the formulas of el, read from MathJax for el alone, since mathLookup() reads those of the whole
// deck, which is too slow for an apply at each character typed
function lookupFor(el: Element): MathLookup {
  if (!el.querySelector('mjx-container')) return NO_MATH;
  const doc = (window as unknown as Jax).MathJax?.startup?.document;
  if (!doc) return mathLookup();
  const map = new Map<Element, MathInfo>();
  for (const item of doc.getMathItemsWithin([el])) if (item.typesetRoot) map.set(item.typesetRoot, { tex: item.math, display: item.display, open: item.start.delim ?? '', close: item.end.delim ?? '' });
  return (e) => map.get(e) ?? null;
}

// a text of the page reads as the text of the file, where a space typed at the end of a line is a
// no-break space on the page, as render.ts writes it
const sameText = (live: string, file: string): boolean => live === file || (!file.includes(' ') && live.replace(/ /g, ' ') === file);

// the caret of the person in host, put back at its character after the content of host is set
function keepCaret(app: App, host: Element): ((after: boolean) => void) | null {
  if (app.caretHost() !== host) return null;
  const before = caretOf(host, lookupFor(host));
  if (!before) return null;
  let inputs = -1;
  return (after) => {
    if (!host.isConnected) return;
    // after MathJax, the caret is put back only when the person did not type meanwhile
    if (after && inputs !== typed) return;
    inputs = typed;
    const math = lookupFor(host);
    putCaret(host, mapOffset(before.offset, before.text, textIn(host, math)), math);
  };
}

// the inputs on the page, which tell keepCaret that the person typed while MathJax ran
let typed = 0;
document.addEventListener('input', () => void (typed += 1), true);

// the element of the page that holds the children of s, an element inside the text element of
// textEl, reached through the items of the page, which match the children of the file one to one
function liveIn(textEl: TextElement, s: SrcEl, math: MathLookup): Element | null {
  const path: number[] = [];
  for (let e = s; e !== textEl.src; e = e.parent!) {
    if (!e.parent) return null;
    path.unshift(e.parent.children.indexOf(e));
  }
  let live = textEl.live;
  let src = textEl.src;
  for (const i of path) {
    const items = virtualChildren(live, math);
    const item = items[i];
    if (items.length !== src.children.length || item?.kind !== 'element') return null;
    live = item.el;
    src = src.children[i] as SrcEl;
  }
  return live;
}

const shiftPiece = (p: Piece, d: number): Piece =>
  p.kind === 'text' ? { kind: 'text', dec: { start: p.dec.start + d, end: p.dec.end + d } } : { kind: 'math', dec: { start: p.dec.start + d, end: p.dec.end + d }, inner: { start: p.inner.start + d, end: p.inner.end + d } };

// a change inside one text node of the text element, outside its formulas, written into the text
// node of the page with replaceData, which keeps the caret and the selection of the person. false,
// with nothing changed, when the change is not one of plain characters in a run of text
function inPlace(ctx: Ctx, textEl: TextElement, w: Window): boolean {
  const at = textAt(textEl.src, w.start, w.endA);
  if (!at) return false;
  const d = ctx.text.length - ctx.source.text.length;
  const decoded = decodedIn(at.parent, at.index, ctx.text, d);
  const math = lookupFor(textEl.live);
  const host = decoded === null ? null : liveIn(textEl, at.parent, math);
  if (decoded === null || !host) return false;
  const k = at.parent.children[at.index] as SrcText;
  const items = virtualChildren(host, math);
  const item = items[at.index];
  if (items.length !== at.parent.children.length || item?.kind !== 'text' || !k.pieces || k.pieces.length !== item.pieces.length) return false;
  const old = k.decoded;
  let p = 0;
  while (p < old.length && p < decoded.length && old[p] === decoded[p]) p++;
  let s = 0;
  while (s < old.length - p && s < decoded.length - p && old[old.length - 1 - s] === decoded[decoded.length - 1 - s]) s++;
  const cut = old.length - p - s;
  const ins = decoded.slice(p, decoded.length - s);
  const j = k.pieces.findIndex((q) => q.kind === 'text' && q.dec.start <= p && p + cut <= q.dec.end);
  const piece = k.pieces[j];
  const lp = item.pieces[j];
  if (j < 0 || lp.kind !== 'text') return false;
  const was = old.slice(piece.dec.start, piece.dec.end);
  const now = was.slice(0, p - piece.dec.start) + ins + was.slice(p - piece.dec.start + cut);
  // a dollar or a backslash may start a formula, which MathJax then typesets
  if (/[$\\]/.test(now) || !sameText(lp.node.data, was)) return false;
  lp.node.replaceData(p - piece.dec.start, cut, ins);
  const grow = ins.length - cut;
  k.pieces = k.pieces.map((q, i) => (i < j ? q : i === j ? { kind: 'text', dec: { start: q.dec.start, end: q.dec.end + grow } } : shiftPiece(q, grow)));
  retext(ctx.source, at.parent, at.index, ctx.text, decoded);
  return true;
}

// the text element paired again with s, its element in the file, in place of textEl. null when the
// page does not read as s, and the element is then a problem, as at an open
export function repairText(pairing: Pairing, textEl: TextElement, s: SrcEl, math: MathLookup): TextElement | null {
  const scratch: Pairing = { texts: [], byLive: new Map(), elements: new Map(), inner: new Map(), sections: [], problems: [], root: null };
  pairElement(s, textEl.live, textEl.slide, math, scratch);
  const next = scratch.byLive.get(textEl.live) ?? null;
  const i = pairing.texts.indexOf(textEl);
  pairing.elements.set(textEl.live, s);
  if (next) {
    if (i >= 0) pairing.texts[i] = next;
    else pairing.texts.push(next);
    pairing.byLive.set(textEl.live, next);
    for (const [k, v] of scratch.inner) pairing.inner.set(k, v);
  } else {
    if (i >= 0) pairing.texts.splice(i, 1);
    pairing.byLive.delete(textEl.live);
    pairing.problems.push(...scratch.problems);
  }
  return next;
}

// the content of the element of the page set to content with setContentWithTex, whose typesetting
// is waited for after the apply. the elements inside it are replaced
function setContent(ctx: Ctx, live: Element, content: string): void {
  for (const el of live.querySelectorAll('*')) {
    ctx.touched.add(el);
    ctx.pairing.inner.delete(el);
  }
  ctx.typeset.push(setContentWithTex(live, content));
  ctx.touched.add(live);
  ctx.changed.push(live);
  ctx.hosts.push(live);
}

// a change inside a text element, read again as the element and set as its content
function coarse(ctx: Ctx, textEl: TextElement): ((after: boolean) => void) | null | false {
  const next = graft(ctx.source, textEl.src, ctx.text);
  const range = next && contentRange(next);
  if (!next || !range) return false;
  const caret = keepCaret(ctx.app, textEl.live);
  setContent(ctx, textEl.live, ctx.text.slice(range.start, range.end));
  // the formulas are typeset after the apply, hence the page reads as the file without them now
  repairText(ctx.pairing, textEl, next, NO_MATH);
  caret?.(false);
  return caret;
}

// the name of an attribute of the file on el: the name of the page in its case, which SVG keeps,
// e.g. viewBox, where the file is read in lower case
function liveName(el: Element, name: string): string {
  const own = [...el.attributes].find((a) => a.name.toLowerCase() === name);
  if (own || el.namespaceURI !== SVG) return own?.name ?? name;
  try {
    const g = new DOMParser().parseFromString(`<svg><g ${name}=""></g></svg>`, 'text/html').querySelector('g');
    return g?.attributes[0]?.name ?? name;
  } catch {
    return name;
  }
}

// the change of a start tag from the attributes from to those of to, set on el: each class, each
// declaration, and each attribute that changed, so that the classes and the declarations that the
// theme and reveal.js set at run time are kept
function setTag(ctx: Ctx, el: Element, from: Attr[], to: Attr[]): boolean {
  const a = stateOf(from);
  const b = stateOf(to);
  let any = false;
  let more = false;
  for (const c of a.classes) if (!b.classes.includes(c)) (el.classList.remove(c), (more = true));
  for (const c of b.classes) if (!a.classes.includes(c)) (el.classList.add(c), (more = true));
  // every step is shown while the deck is edited, as Doc.place marks the steps of a new slide
  if (b.classes.includes('fragment') && !a.classes.includes('fragment')) el.classList.add('visible');
  const style = (el as HTMLElement).style;
  if (style) {
    for (const k of Object.keys(a.style)) if (!(k in b.style)) (style.removeProperty(k), (any = true));
    for (const [k, v] of Object.entries(b.style)) {
      if (a.style[k] === v) continue;
      const important = /^(.*?)\s*!\s*important$/i.exec(v);
      style.setProperty(k, important ? important[1] : v, important ? 'important' : '');
      any = true;
    }
  }
  for (const k of new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)])) {
    if (k === 'class' || k === 'style' || a.attrs[k] === b.attrs[k]) continue;
    const name = liveName(el, k);
    if (b.attrs[k] === undefined) el.removeAttribute(name);
    else el.setAttribute(name, b.attrs[k]);
    more = true;
  }
  if (any || more) {
    ctx.touched.add(el);
    ctx.changed.push(el);
  }
  return more;
}

type Page = { Beeson?: { mount?(root: Element): void; refreshChrome?(): void } };

// the slides of reveal.js read again, with the theme drawn again around them
export function refresh(app: App): void {
  (window as unknown as Page).Beeson?.refreshChrome?.();
  app.deck()?.sync?.();
  app.deck()?.layout();
}

function makeCtx(app: App, text: string): Ctx {
  return { app, source: app.source!, pairing: app.pairing!, text, touched: new Set(), gone: [], cuts: [], changed: [], hosts: [], placed: [], typeset: [] };
}

// the deck made to read as text, which differs from the text of the source in w, at spot. null when
// it cannot be done, after which the page is loaded again. the page is changed synchronously, and
// the formulas of the new content are typeset by the promises of the result
export function applyAt(app: App, text: string, w: Window, spot: Spot): Done | null {
  const ctx = makeCtx(app, text);
  if (spot.kind === 'text') {
    const textEl = ctx.pairing.byLive.get(spot.live)!;
    if (inPlace(ctx, textEl, w)) {
      ctx.touched.add(spot.live);
      ctx.changed.push(spot.live);
      if (!checkText(ctx, textEl.live)) return null;
      refreshHeads(textEl.live);
      return done(ctx, false, null);
    }
    const caret = coarse(ctx, textEl);
    if (caret === false) return within(ctx, spot.el, spot.live);
    if (!checkText(ctx, textEl.live)) return null;
    refreshHeads(textEl.live);
    return done(ctx, false, caret && (() => caret(true)));
  }
  if (spot.kind === 'tag') {
    const from = spot.el.attrs;
    if (!retag(ctx.source, spot.el, text)) return within(ctx, spot.el, spot.live);
    // a class or an attribute may be read by the theme or by reveal.js, e.g. a step, where a place
    // or a size in the style is not
    if (setTag(ctx, spot.live, from, spot.el.attrs)) refresh(app);
    return done(ctx, false, null);
  }
  if (spot.kind === 'within') return structural(ctx, spot.el, spot.live);
  return null;
}

// a change of el as a whole, applied among the children of its parent
function within(ctx: Ctx, el: SrcEl, live: Element): Done | null {
  const parent = el.parent;
  const up = live.parentElement;
  if (!parent || !up || ctx.pairing.elements.get(up) !== parent) return null;
  return structural(ctx, parent, up);
}

// the text element on the page reads as its bytes in the new text. an element that stopped being a
// text element is a reload, since its new children are not paired, and typing in it would be lost
function checkText(ctx: Ctx, live: Element): boolean {
  const textEl = ctx.pairing.byLive.get(live);
  if (!textEl || !isTextElement(textEl.src)) return false;
  const range = contentRange(textEl.src);
  return !!range && ctx.source.text === ctx.text && renderTextElement(ctx.source, textEl, lookupFor(live), ctx.app.tagEdits) === ctx.text.slice(range.start, range.end);
}

// a unit of a container in the plan of its new children: one kept, possibly moved, one placed from
// the new text, one whose content or start tag changed, or one whose text element changed
type Op =
  | { kind: 'keep'; node: Element | null; stable: boolean }
  | { kind: 'place'; src: SrcEl; bytes: string; node: Element | null }
  | { kind: 'text'; node: Element; to: SrcEl }
  | { kind: 'inner'; node: Element; from: SrcEl; to: SrcEl; plan: Plan | null };
// the ops of the units between the units that kept their place at the start and at the end, and
// after, the node of the first unit kept at the end
type Plan = { live: Element; ops: Op[]; after: Element | null };

// raw is set when a script or another element of raw text is put or taken among the children of
// an element that is kept, which is a reload
type Planner = { liveOf: Map<SrcEl, Element>; drops: { node: Element; bytes: string; role: string }[]; places: (Op & { kind: 'place' })[]; caretHost: Element | null; raw: boolean };

// the visible text among the children of s, outside its units, which a plan does not change
const strayText = (s: SrcEl): string => s.children.flatMap((c) => (c.kind === 'text' && /\S/.test(c.decoded) ? [c.decoded.trim()] : [])).join('\n');

// the indexes of the longest increasing run of values, which keep their place
function longestRun(values: number[]): Set<number> {
  const tails: number[] = [];
  const prev = new Array<number>(values.length).fill(-1);
  values.forEach((v, i) => {
    if (v < 0) return;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]] < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const out = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.add(i);
  return out;
}

// the plan that makes the children of live, the element of from, read as those of to
function reconcile(ctx: Ctx, pl: Planner, from: SrcEl, to: SrcEl, live: Element): Plan | null {
  if (strayText(from) !== strayText(to)) return null;
  const ou = unitsWithin(from)?.units ?? [];
  const nu = unitsWithin(to)?.units ?? [];
  const ot = from.source.text;
  const nt = to.source.text;
  const body = (t: string, u: { range: { start: number }; end: number }) => t.slice(u.range.start, u.end);
  let p = 0;
  while (p < ou.length && p < nu.length && body(ot, ou[p]) === body(nt, nu[p])) p++;
  let q = 0;
  while (q < ou.length - p && q < nu.length - p && body(ot, ou[ou.length - 1 - q]) === body(nt, nu[nu.length - 1 - q])) q++;
  const om = ou.slice(p, ou.length - q);
  const nm = nu.slice(p, nu.length - q);
  const nodeOf = (s: SrcEl) => pl.liveOf.get(s) ?? null;
  const pool = new Map<string, number[]>();
  om.forEach((u, i) => {
    const b = body(ot, u);
    pool.set(b, [...(pool.get(b) ?? []), i]);
  });
  const match = nm.map((u) => pool.get(body(nt, u))?.shift() ?? -1);
  const stable = longestRun(match);
  const used = new Set(match.filter((i) => i >= 0));
  const ops: Op[] = [];
  let lo = -1;
  nm.forEach((u, j) => {
    if (match[j] >= 0) {
      if (stable.has(j)) lo = match[j];
      ops.push({ kind: 'keep', node: nodeOf(om[match[j]].el), stable: stable.has(j) });
      return;
    }
    // an old unit of the same tag between the same units kept in place is the same unit changed
    let hi = om.length;
    for (let k = j + 1; k < nm.length; k++) {
      if (stable.has(k)) {
        hi = match[k];
        break;
      }
    }
    for (let i = lo + 1; i < hi; i++) {
      if (used.has(i) || om[i].el.tag !== u.el.tag) continue;
      const op = change(ctx, pl, om[i].el, u.el, nodeOf(om[i].el));
      if (!op) break;
      used.add(i);
      ops.push(op);
      return;
    }
    if (RAW_TEXT.has(u.el.tag)) pl.raw = true;
    const op = { kind: 'place' as const, src: u.el, bytes: body(nt, u), node: null };
    pl.places.push(op);
    ops.push(op);
  });
  om.forEach((u, i) => {
    const node = nodeOf(u.el);
    if (used.has(i)) return;
    if (RAW_TEXT.has(u.el.tag)) pl.raw = true;
    if (node) pl.drops.push({ node, bytes: body(ot, u), role: roleOf(node) });
  });
  let after: Element | null = null;
  for (let i = ou.length - q; i < ou.length && !after; i++) after = nodeOf(ou[i].el);
  return { live, ops, after };
}

// the op of an old unit a changed into b, or null when b is placed in its stead
function change(ctx: Ctx, pl: Planner, a: SrcEl, b: SrcEl, node: Element | null): Op | null {
  if (!node || a.tag !== b.tag || RAW_TEXT.has(a.tag) || !a.open !== !b.open || isStack(a) !== isStack(b)) return null;
  const aText = isTextElement(a);
  if (aText !== isTextElement(b)) return null;
  if (aText) return ctx.pairing.byLive.get(node)?.src === a ? { kind: 'text', node, to: b } : null;
  if (VOID.has(a.tag)) return { kind: 'inner', node, from: a, to: b, plan: null };
  const plan = reconcile(ctx, pl, a, b, node);
  return plan && { kind: 'inner', node, from: a, to: b, plan };
}

// a slide that holds the slides of a vertical stack, which reveal.js and the theme set up apart
// from a slide, hence a slide that becomes a stack or stops being one is placed anew
const isStack = (e: SrcEl): boolean => e.tag === 'section' && e.children.some((c) => c.kind === 'element' && c.tag === 'section');

// the role of a slide on the page, kept by a node reused in another place
const roleOf = (el: Element): string => (el.localName !== 'section' ? '' : el.parentElement?.localName === 'section' ? 'inner' : el.querySelector(':scope > section') ? 'stack' : 'slide');
const roleIn = (e: SrcEl): string => (e.tag !== 'section' ? '' : e.parent?.tag === 'section' ? 'inner' : isStack(e) ? 'stack' : 'slide');

const isUnit = (ctx: Ctx, placed: Set<Element>, el: Element): boolean => ctx.pairing.elements.has(el) || placed.has(el);

// the next sibling of n that is the node of a unit
function nextUnit(ctx: Ctx, placed: Set<Element>, n: Element): Element | null {
  for (let s = n.nextElementSibling; s; s = s.nextElementSibling) if (isUnit(ctx, placed, s)) return s;
  return null;
}

// a new element of the page made from its element in the new text, as Doc.place makes one
function make(ctx: Ctx, src: SrcEl): Element {
  const node = document.importNode(src.node, true) as Element;
  media.resolve(node);
  if (node.localName === 'section') for (const f of node.querySelectorAll('.fragment')) f.classList.add('visible');
  ctx.placed.push(node);
  ctx.changed.push(node);
  return node;
}

function execute(ctx: Ctx, plan: Plan, placed: Set<Element>, focus: { el: HTMLElement | null }): void {
  for (const op of plan.ops) {
    if (op.kind === 'text') {
      const range = contentRange(op.to)!;
      setContent(ctx, op.node, ctx.text.slice(range.start, range.end));
    } else if (op.kind === 'inner') {
      setTag(ctx, op.node, op.from.attrs, op.to.attrs);
      if (op.plan) execute(ctx, op.plan, placed, focus);
    } else if (op.kind === 'place') {
      op.node ??= make(ctx, op.src);
      placed.add(op.node);
      // the empty notes that the notes pane made on the slide give way to the notes of the file
      if (op.node.matches('aside.notes')) {
        for (const c of [...plan.live.children]) {
          if (c === op.node || !c.matches('aside.notes') || ctx.pairing.elements.has(c) || c.textContent?.trim()) continue;
          if (c.contains(document.activeElement)) focus.el = op.node as HTMLElement;
          c.remove();
        }
      }
    }
  }
  let next = plan.after;
  let moved = false;
  for (let j = plan.ops.length - 1; j >= 0; j--) {
    const op = plan.ops[j];
    const n = op.node;
    if (!n) continue;
    const stays = (op.kind === 'keep' && op.stable) || (n.parentNode === plan.live && nextUnit(ctx, placed, n) === next);
    if (!stays) {
      moved ||= op.kind === 'keep';
      plan.live.insertBefore(n, next && next.parentNode === plan.live ? next : null);
    }
    next = n;
  }
  // the units kept among units that moved changed their order, whichever of them the longest run
  // kept in place, hence an undo of an earlier move of any of them would undo this order
  if (moved) {
    for (const op of plan.ops) {
      if (op.kind !== 'keep' || !op.node) continue;
      ctx.touched.add(op.node);
      ctx.changed.push(op.node);
    }
  }
}

// the change at the children of el, the element of live: the units of the new text planned against
// those of the page, the page changed by the plan, and the pairing made again from the new text
function structural(ctx: Ctx, el: SrcEl, live: Element): Done | null {
  const app = ctx.app;
  let next: Source;
  try {
    next = parseSource(ctx.text);
  } catch {
    return null;
  }
  // the element of the new text at the place of el, which is the same element when it starts and
  // ends where el does. a change read at the wrong level, e.g. a slide put before a slide whose
  // heading starts as its own, is planned at the parent of el
  const d = ctx.text.length - ctx.source.text.length;
  let to = atPath(next.slides, pathOf(el));
  for (;;) {
    const a = el.parent ? elementRange(el) : contentRange(el);
    const b = to && (to.parent ? elementRange(to) : contentRange(to));
    if (to && a && b && to.tag === el.tag && b.start === a.start && b.end === a.end + d && isStack(to) === isStack(el)) break;
    const up = live.parentElement;
    if (!el.parent || !up || ctx.pairing.elements.get(up) !== el.parent) return null;
    el = el.parent;
    live = up;
    to = atPath(next.slides, pathOf(el));
  }
  const pl: Planner = { liveOf: new Map(), drops: [], places: [], caretHost: app.caretHost(), raw: false };
  for (const [l, s] of ctx.pairing.elements) pl.liveOf.set(s, l);
  const plan = reconcile(ctx, pl, el, to, live);
  if (!plan || pl.raw) return null;
  // a unit taken from one element and placed in another keeps its node, unless it is a slide that
  // changes its role
  const pool = new Map<string, Element[]>();
  const key = (bytes: string, role: string) => `${role}\n${bytes}`;
  for (const d of pl.drops) pool.set(key(d.bytes, d.role), [...(pool.get(key(d.bytes, d.role)) ?? []), d.node]);
  for (const op of pl.places) op.node = pool.get(key(op.bytes, roleIn(op.src)))?.shift() ?? null;
  const reused = new Set(pl.places.flatMap((op) => (op.node ? [op.node] : [])));
  const deck = app.deck();
  const current = app.current();
  const at = current && deck ? deck.getIndices(current) : null;
  const host = pl.caretHost;
  const caret = host ? caretOf(host, lookupFor(host)) : null;
  const problems = ctx.pairing.problems.length;
  for (const d of pl.drops) {
    if (reused.has(d.node)) {
      ctx.touched.add(d.node);
      continue;
    }
    if (d.node.parentElement) ctx.cuts.push(d.node.parentElement);
    d.node.remove();
    detached.add(d.node);
    ctx.gone.push(d.node);
  }
  for (const n of reused) ctx.changed.push(n);
  const focus = { el: null as HTMLElement | null };
  execute(ctx, plan, new Set(), focus);
  app.source = next;
  const math = mathLookup();
  app.pairing = pair(next, app.slides(), math);
  ctx.source = next;
  ctx.pairing = app.pairing;
  if (app.pairing.problems.length > problems || renderDeck(next, app.pairing, math, app.tagEdits).text !== ctx.text) return null;
  app.typing.attach();
  focus.el?.focus({ preventScroll: true });
  (window as unknown as Page).Beeson?.refreshChrome?.();
  keepSlide(app, current, at);
  const put = () => {
    if (!host?.isConnected || !caret) return;
    if (app.caretHost() === host && !ctx.hosts.includes(host)) return;
    const m = lookupFor(host);
    putCaret(host, mapOffset(caret.offset, caret.text, textIn(host, m)), m);
  };
  put();
  const inputs = typed;
  return done(ctx, true, () => {
    if (typed === inputs) put();
  });
}

// the current slide of the person kept through an apply, since reveal.js keeps its index. a slide
// taken off the page gives way to the slide at its index, i.e. the slide after it, or the last one
export function keepSlide(app: App, current: Element | null, at: { h: number; v?: number } | null): void {
  const deck = app.deck();
  if (!deck) return;
  deck.sync?.();
  // reveal.js keeps its index and its current slide through sync, hence the indexes are compared
  if (current?.isConnected) {
    const at = deck.getIndices(current);
    const now = deck.getIndices();
    if (at.h !== now.h || (at.v ?? 0) !== (now.v ?? 0)) deck.slide(at.h, at.v);
    return;
  }
  if (!at) return;
  const count = app.slides().querySelectorAll(':scope > section').length;
  deck.slide(Math.max(0, Math.min(at.h, count - 1)), 0);
}
