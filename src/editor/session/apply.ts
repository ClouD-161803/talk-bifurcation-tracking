import type { App } from '../app.ts';
import type { Edit } from '../merge.ts';
import type { MathLookup } from '../math.ts';
import type { Pairing, TextElement } from '../render.ts';
import type { Piece, Source, SrcEl, SrcText } from '../source.ts';
import type { Attr } from '../tokens.ts';
import { caretOf, contentRange, detached, elementRange, isTextElement, mapOffset, mathIn, mathLookup, media, pair, pairElement, parseSource, putCaret, RAW_TEXT, refreshHeads, renderDeck, renderTextElement, runsOf, setContentWithTex, stateOf, textIn, unitsWithin, virtualChildren, VOID } from './host.ts';
import { atPath, closing, decodedIn, graft, liveChild, pathOf, retag, retext, startTag, textAt, type Spot, type Window } from './tree.ts';

export const NO_MATH: MathLookup = () => null;
const SVG = 'http://www.w3.org/2000/svg';

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
  reordered: Set<Element>;
  gone: Element[];
  cuts: Element[];
  changed: Element[];
  hosts: Element[];
  placed: Element[];
  typeset: Promise<unknown>[];
  window: Window;
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

const sameText = (live: string, file: string): boolean => live === file || (!file.includes(' ') && live.replace(/ /g, ' ') === file);

function keepCaret(app: App, host: Element): ((after: boolean) => void) | null {
  if (app.caretHost() !== host) return null;
  const before = caretOf(host, mathIn(host));
  if (!before) return null;
  let inputs = -1;
  return (after) => {
    if (!host.isConnected) return;
    if (after && inputs !== typed) return;
    inputs = typed;
    const math = mathIn(host);
    const text = textIn(host, math);
    putCaret(host, mapOffset(before.offset, before.text, text), math, mapOffset(before.anchor, before.text, text));
  };
}

let typed = 0;
document.addEventListener('input', () => void (typed += 1), true);

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

const drawn = (range: Range): boolean => /\S/.test(range.toString());

function drawSpaces(host: Element, node: Text, runs: Edit[]): void {
  const space = (i: number) => node.data[i] === ' ' || node.data[i] === '\u00a0';
  let delta = 0;
  for (const e of runs) {
    let a = e.start + delta, b = a + e.text.length;
    delta += e.text.length - (e.end - e.start);
    while (a > 0 && space(a - 1)) a--;
    while (b < node.length && space(b)) b++;
    for (let i = a; i < b; ) {
      if (!space(i)) {
        i++;
        continue;
      }
      let j = i;
      while (j < b && space(j)) j++;
      const range = document.createRange();
      range.setStart(host, 0);
      range.setEnd(node, i);
      const first = !drawn(range);
      range.setStart(node, j);
      range.setEnd(host, host.childNodes.length);
      const last = !drawn(range);
      let run = '';
      for (let k = i; k < j; k++) run += run.endsWith(' ') || (k === i && first) || (k === j - 1 && last) ? '\u00a0' : ' ';
      if (run !== node.data.slice(i, j)) node.replaceData(i, j - i, run);
      i = j;
    }
  }
}

function retype(host: Element, node: Text, was: string, now: string, file: string): void {
  const runs = runsOf(was, now);
  for (const e of [...runs].reverse()) node.replaceData(e.start, e.end - e.start, e.text);
  if (!file.includes('\u00a0')) drawSpaces(host, node, runs);
}

function inPlace(ctx: Ctx, textEl: TextElement, w: Window): boolean {
  const at = textAt(textEl.src, w.start, w.endA);
  if (!at) return false;
  const d = ctx.text.length - ctx.source.text.length;
  const decoded = decodedIn(at.parent, at.index, ctx.text, d);
  const math = mathIn(textEl.live);
  const host = decoded === null ? null : liveIn(textEl, at.parent, math);
  if (decoded === null || (!/\S/.test(decoded) && at.parent === textEl.src && (textEl.src.tag === 'div' || textEl.src.tag === 'span')) || !host) return false;
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
  const q = p - piece.dec.start;
  const now = was.slice(0, q) + ins + was.slice(q + cut);
  if (/[$\\]/.test(ins + was.slice(q, q + cut) + (now[q - 1] ?? '') + (now[q + ins.length] ?? '')) || !sameText(lp.node.data, was)) return false;
  const sel = getSelection();
  const ends = sel?.rangeCount ? ([[sel.anchorNode, sel.anchorOffset], [sel.focusNode, sel.focusOffset]] as const) : null;
  retype(textEl.live, lp.node, was, now, decoded);
  if (sel && ends?.some(([n]) => n === lp.node)) {
    const [[an, ao], [fn, fo]] = ends.map(([n, o]) => [n, n === lp.node ? mapOffset(o, was, now) : o] as const);
    if (an && fn && (sel.anchorOffset !== ao || sel.focusOffset !== fo)) sel.setBaseAndExtent(an, ao, fn, fo);
  }
  const grow = ins.length - cut;
  k.pieces = k.pieces.map((q, i) => (i < j ? q : i === j ? { kind: 'text', dec: { start: q.dec.start, end: q.dec.end + grow } } : shiftPiece(q, grow)));
  retext(ctx.source, at.parent, at.index, ctx.text, decoded);
  return true;
}

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

function setContent(ctx: Ctx, live: Element, content: string, was: string | null = null): void {
  const node = live.firstChild;
  if (was !== null && live.childNodes.length === 1 && node instanceof Text && !/[<&$\\]/.test(was + content) && sameText(node.data, was)) {
    retype(live, node, was, content, content);
    ctx.touched.add(live);
    ctx.changed.push(live);
    ctx.hosts.push(live);
    return;
  }
  for (const el of live.querySelectorAll('*')) {
    ctx.touched.add(el);
    ctx.pairing.inner.delete(el);
  }
  ctx.typeset.push(setContentWithTex(live, content));
  showSteps(live, false);
  ctx.touched.add(live);
  ctx.changed.push(live);
  ctx.hosts.push(live);
}

function coarse(ctx: Ctx, textEl: TextElement): ((after: boolean) => void) | null | false | 'reload' {
  let text = true;
  const next = graft(ctx.source, textEl.src, ctx.text, (root) => (text = isTextElement(root)));
  if (!text) return 'reload';
  const range = next && contentRange(next);
  if (!next || !range) return false;
  const caret = keepCaret(ctx.app, textEl.live);
  const steps = !!textEl.live.querySelector('.fragment');
  setContent(ctx, textEl.live, ctx.text.slice(range.start, range.end));
  repairText(ctx.pairing, textEl, next, NO_MATH);
  if (steps || textEl.live.querySelector('.fragment')) {
    restep(ctx, textEl.live);
    ctx.app.deck()?.sync?.();
  }
  caret?.(false);
  return caret;
}

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

function setTag(ctx: Ctx, el: Element, from: Attr[], to: Attr[]): boolean {
  const a = stateOf(from);
  const b = stateOf(to);
  let any = false;
  let more = false;
  if (a.classes.join(' ') !== b.classes.join(' ')) {
    const step = b.classes.includes('fragment') && !a.classes.includes('fragment');
    const unstep = a.classes.includes('fragment') && !b.classes.includes('fragment');
    const runtime = [...el.classList].filter((c) => !a.classes.includes(c) && !b.classes.includes(c) && !(unstep && c === 'visible'));
    const editor = runtime.filter((c) => c.startsWith('beeson-'));
    const list = [...new Set([...b.classes, ...runtime.filter((c) => !editor.includes(c)), ...(step ? ['visible'] : []), ...editor])];
    if (list.length) el.setAttribute('class', list.join(' '));
    else el.removeAttribute('class');
    more = a.classes.some((c) => !b.classes.includes(c)) || b.classes.some((c) => !a.classes.includes(c));
  }
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
  const viewer = el.localName === 'tycho-viewer';
  let motion = false;
  for (const k of new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)])) {
    if (k === 'class' || k === 'style' || a.attrs[k] === b.attrs[k] || (viewer && k === 'theme')) continue;
    const name = liveName(el, k);
    if (b.attrs[k] === undefined) el.removeAttribute(name);
    else el.setAttribute(name, b.attrs[k]);
    more = true;
    motion ||= MOTION.includes(k);
  }
  if (motion && el.matches('.backdrop')) (window as unknown as Page).Beeson?.remount?.(el);
  const theme = b.attrs['data-keep-theme'] === undefined ? (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark') : b.attrs.theme;
  if (viewer && (theme ?? null) !== el.getAttribute('theme')) {
    if (theme === undefined) el.removeAttribute('theme');
    else el.setAttribute('theme', theme);
    any = true;
  }
  if (any || more) {
    ctx.touched.add(el);
    ctx.changed.push(el);
  }
  return more;
}

type Page = { Beeson?: { mount?(root: Element): void; refreshChrome?(): void; remount?(el: Element): void } };
const MOTION = ['data-duration', 'data-stagger', 'data-loop'];
const CAMERA = ['data-azimuth', 'data-elevation', 'data-zoom', 'data-turn', 'data-zscale'];
const DRAWN = '.surface, .plot';
const figureOf = (attrs: Attr[]): string | null => {
  const s = stateOf(attrs);
  return s.classes.includes('tikz') ? (s.attrs['data-figure'] ?? '') : null;
};
const backdropOf = (attrs: Attr[]): boolean => stateOf(attrs).classes.includes('backdrop');

function redrawn(el: Element, from: Attr[], to: Attr[]): boolean {
  if (figureOf(from) !== figureOf(to)) return true;
  const holder = el.closest(DRAWN);
  if (!holder) return false;
  const a = stateOf(from).attrs;
  const b = stateOf(to).attrs;
  const free = holder === el && el.matches('.surface') ? CAMERA : [];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].some((k) => k !== 'class' && k !== 'style' && a[k] !== b[k] && !free.includes(k));
}

function showSteps(el: Element, self = true): void {
  if (self && el.classList.contains('fragment')) el.classList.add('visible');
  for (const f of el.querySelectorAll('.fragment')) f.classList.add('visible');
}

function restep(ctx: Ctx, el: Element): void {
  const scope = el.closest('section') ?? el;
  for (const f of scope.querySelectorAll('.fragment, [data-fragment-index]')) {
    const src = ctx.pairing.elements.get(f) ?? ctx.pairing.inner.get(f);
    if (!src) continue;
    const v = stateOf(src.attrs).attrs['data-fragment-index'];
    if (v === undefined) f.removeAttribute('data-fragment-index');
    else if (f.getAttribute('data-fragment-index') !== v) f.setAttribute('data-fragment-index', v);
  }
}

function refreshText(host: Element, had: boolean): void {
  if (had || host.querySelector('cite') || host.closest('p.theorem')) (window as unknown as Page).Beeson?.refreshChrome?.();
  else refreshHeads(host);
}

export function refresh(app: App): void {
  (window as unknown as Page).Beeson?.refreshChrome?.();
  app.deck()?.sync?.();
  app.deck()?.layout();
}

function makeCtx(app: App, text: string, window: Window): Ctx {
  return { app, source: app.source!, pairing: app.pairing!, text, touched: new Set(), reordered: new Set(), gone: [], cuts: [], changed: [], hosts: [], placed: [], typeset: [], window };
}

export function partial(target?: string): never {
  throw Object.assign(new Error('the deck does not read as the text after an apply'), { target });
}

export function applyAt(app: App, text: string, w: Window, spot: Spot): Done | null {
  const ctx = makeCtx(app, text, w);
  if (spot.kind === 'text') {
    const textEl = ctx.pairing.byLive.get(spot.live)!;
    const had = !!textEl.live.querySelector('cite');
    if (inPlace(ctx, textEl, w)) {
      ctx.touched.add(spot.live);
      ctx.changed.push(spot.live);
      if (!checkText(ctx, textEl.live)) partial();
      refreshText(textEl.live, had);
      return done(ctx, false, null);
    }
    const r = elementRange(textEl.src);
    if (r && closing(text.slice(r.start, r.end + text.length - ctx.source.text.length), textEl.src) === 'open') return null;
    const caret = coarse(ctx, textEl);
    if (caret === 'reload') return null;
    if (caret === false) return within(ctx, spot.el, spot.live);
    if (!checkText(ctx, textEl.live)) partial();
    refreshText(textEl.live, had);
    return done(ctx, false, caret && (() => caret(true)));
  }
  if (spot.kind === 'tag') {
    const from = spot.el.attrs;
    const t = startTag(ctx.source, spot.el, text);
    if (t && (redrawn(spot.live, from, t.attrs) || backdropOf(from) !== backdropOf(t.attrs))) return null;
    if (!t || !retag(ctx.source, spot.el, text, t)) return within(ctx, spot.el, spot.live);
    if (setTag(ctx, spot.live, from, spot.el.attrs)) {
      restep(ctx, spot.live);
      refresh(app);
    }
    return done(ctx, false, null);
  }
  if (spot.kind === 'within') return structural(ctx, spot.el, spot.live);
  return null;
}

function within(ctx: Ctx, el: SrcEl, live: Element): Done | null {
  const parent = el.parent;
  const up = live.parentElement;
  if (!parent || !up || ctx.pairing.elements.get(up) !== parent) return null;
  return structural(ctx, parent, up);
}

function checkText(ctx: Ctx, live: Element): boolean {
  const textEl = ctx.pairing.byLive.get(live);
  if (!textEl || !isTextElement(textEl.src)) return false;
  const range = contentRange(textEl.src);
  return !!range && ctx.source.text === ctx.text && renderTextElement(ctx.source, textEl, mathIn(live), ctx.app.tagEdits) === ctx.text.slice(range.start, range.end);
}

type Op =
  | { kind: 'keep'; node: Element | null; stable: boolean }
  | { kind: 'place'; src: SrcEl; bytes: string; node: Element | null }
  | { kind: 'text'; node: Element; from: SrcEl; to: SrcEl }
  | { kind: 'inner'; node: Element; from: SrcEl; to: SrcEl; plan: Plan | null };
type Plan = { live: Element; ops: Op[]; after: Element | null };

type Planner = { liveOf: Map<SrcEl, Element>; drops: { node: Element; bytes: string; role: string }[]; places: (Op & { kind: 'place' })[]; caretHost: Element | null; reload: boolean };

const strayText = (s: SrcEl): string => s.children.flatMap((c) => (c.kind === 'text' && /\S/.test(c.decoded) ? [c.decoded.trim()] : [])).join('\n');

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

function reconcile(ctx: Ctx, pl: Planner, from: SrcEl, to: SrcEl, live: Element): Plan | null {
  if (strayText(from) !== strayText(to)) return null;
  const ou = unitsWithin(from)?.units ?? [];
  const nu = unitsWithin(to)?.units ?? [];
  const ot = from.source.text;
  const nt = to.source.text;
  const body = (t: string, u: { range: { start: number; end: number } }) => t.slice(u.range.start, u.range.end);
  const w = from.source === ctx.source ? ctx.window : null;
  let p = 0;
  while (p < ou.length && p < nu.length && (!w || ou[p].range.end <= w.start) && body(ot, ou[p]) === body(nt, nu[p])) p++;
  let q = 0;
  while (q < ou.length - p && q < nu.length - p && (!w || ou[ou.length - 1 - q].range.start >= w.endA) && body(ot, ou[ou.length - 1 - q]) === body(nt, nu[nu.length - 1 - q])) q++;
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
    if (RAW_TEXT.has(u.el.tag) || live.closest(DRAWN)) pl.reload = true;
    const op = { kind: 'place' as const, src: u.el, bytes: body(nt, u), node: null };
    pl.places.push(op);
    ops.push(op);
  });
  om.forEach((u, i) => {
    const node = nodeOf(u.el);
    if (used.has(i)) return;
    if (RAW_TEXT.has(u.el.tag) || live.closest(DRAWN)) pl.reload = true;
    if (node) pl.drops.push({ node, bytes: body(ot, u), role: roleOf(node) });
  });
  let after: Element | null = null;
  for (let i = ou.length - q; i < ou.length && !after; i++) after = nodeOf(ou[i].el);
  return { live, ops, after };
}

function change(ctx: Ctx, pl: Planner, a: SrcEl, b: SrcEl, node: Element | null): Op | null {
  if (!node || a.tag !== b.tag || RAW_TEXT.has(a.tag) || !a.open !== !b.open || isStack(a) !== isStack(b) || backdropOf(a.attrs) !== backdropOf(b.attrs)) return null;
  const aText = isTextElement(a);
  if (aText !== isTextElement(b)) return null;
  if (aText) {
    if (ctx.pairing.byLive.get(node)?.src !== a) return null;
    if (redrawn(node, a.attrs, b.attrs)) pl.reload = true;
    return { kind: 'text', node, from: a, to: b };
  }
  if (redrawn(node, a.attrs, b.attrs)) pl.reload = true;
  if (VOID.has(a.tag)) return { kind: 'inner', node, from: a, to: b, plan: null };
  const plan = reconcile(ctx, pl, a, b, node);
  return plan && { kind: 'inner', node, from: a, to: b, plan };
}

const isStack = (e: SrcEl): boolean => e.tag === 'section' && e.children.some((c) => c.kind === 'element' && c.tag === 'section');

const roleOf = (el: Element): string => (el.localName !== 'section' ? '' : el.parentElement?.localName === 'section' ? 'inner' : el.querySelector(':scope > section') ? 'stack' : 'slide');
const roleIn = (e: SrcEl): string => (e.tag !== 'section' ? '' : e.parent?.tag === 'section' ? 'inner' : isStack(e) ? 'stack' : 'slide');

const isUnit = (ctx: Ctx, placed: Set<Element>, el: Element): boolean => ctx.pairing.elements.has(el) || placed.has(el);

function nextUnit(ctx: Ctx, placed: Set<Element>, n: Element): Element | null {
  for (let s = n.nextElementSibling; s; s = s.nextElementSibling) if (isUnit(ctx, placed, s)) return s;
  return null;
}

function make(ctx: Ctx, src: SrcEl): Element {
  const node = document.importNode(src.node, true) as Element;
  media.resolve(node);
  showSteps(node);
  ctx.placed.push(node);
  ctx.changed.push(node);
  return node;
}

function execute(ctx: Ctx, plan: Plan, placed: Set<Element>, focus: { el: HTMLElement | null }): void {
  for (const op of plan.ops) {
    if (op.kind === 'text') {
      setTag(ctx, op.node, op.from.attrs, op.to.attrs);
      const was = contentRange(op.from)!;
      const range = contentRange(op.to)!;
      const content = ctx.text.slice(range.start, range.end);
      const before = ctx.source.text.slice(was.start, was.end);
      if (content !== before) setContent(ctx, op.node, content, before);
    } else if (op.kind === 'inner') {
      setTag(ctx, op.node, op.from.attrs, op.to.attrs);
      if (op.plan) execute(ctx, op.plan, placed, focus);
    } else if (op.kind === 'place') {
      op.node ??= make(ctx, op.src);
      placed.add(op.node);
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
  if (moved) {
    ctx.reordered.add(plan.live);
    for (const op of plan.ops) if (op.kind === 'keep' && op.node) ctx.changed.push(op.node);
  }
}

function structural(ctx: Ctx, el: SrcEl, live: Element): Done | null {
  const app = ctx.app;
  let next: Source;
  try {
    next = parseSource(ctx.text);
  } catch {
    return null;
  }
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
  const pl: Planner = { liveOf: new Map(), drops: [], places: [], caretHost: app.caretHost(), reload: false };
  for (const [l, s] of ctx.pairing.elements) pl.liveOf.set(s, l);
  if (live.closest(DRAWN) && live !== live.closest(DRAWN)) return null;
  const plan = reconcile(ctx, pl, el, to, live);
  if (!plan || pl.reload) return null;
  const pool = new Map<string, Element[]>();
  const key = (bytes: string, role: string) => `${role}\n${bytes}`;
  for (const d of pl.drops) pool.set(key(d.bytes, d.role), [...(pool.get(key(d.bytes, d.role)) ?? []), d.node]);
  for (const op of pl.places) op.node = pool.get(key(op.bytes, roleIn(op.src)))?.shift() ?? null;
  const reused = new Set(pl.places.flatMap((op) => (op.node ? [op.node] : [])));
  const deck = app.deck();
  const current = app.current();
  const at = current && deck ? deck.getIndices(current) : null;
  const host = pl.caretHost;
  const caret = host ? caretOf(host, mathIn(host)) : null;
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
  if (app.pairing.problems.length > problems || renderDeck(next, app.pairing, math, app.tagEdits).text !== ctx.text) partial();
  app.typing.attach();
  focus.el?.focus({ preventScroll: true });
  restep(ctx, live);
  (window as unknown as Page).Beeson?.refreshChrome?.();
  document.querySelectorAll('tycho-viewer').forEach((v, i) => {
    if (v.getAttribute('data-still') !== String(i)) v.setAttribute('data-still', String(i));
  });
  keepSlide(app, current, at);
  const put = () => {
    if (!host?.isConnected || !caret) return;
    if (app.caretHost() === host && !ctx.hosts.includes(host)) return;
    const m = mathIn(host);
    const text = textIn(host, m);
    putCaret(host, mapOffset(caret.offset, caret.text, text), m, mapOffset(caret.anchor, caret.text, text));
  };
  put();
  if (ctx.reordered.size) app.history.prune(() => false, () => false, (el) => ctx.reordered.has(el));
  const inputs = typed;
  return done(ctx, true, () => {
    if (typed === inputs) put();
  });
}

export function keepSlide(app: App, current: Element | null, at: { h: number; v?: number } | null): void {
  const deck = app.deck();
  if (!deck) return;
  deck.sync?.();
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
