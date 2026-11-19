import { RAW_TEXT, type Range } from './tokens.ts';
import { VOID, contentRange, elementRange, isFragmentRoot, lastEnd, rawRange, type Piece, type Source, type SrcComment, type SrcEl, type SrcNode, type SrcText } from './source.ts';
import type { MathInfo, MathLookup } from './math.ts';
import { mergeEdit, renderTag, stateOf, type TagEdit } from './tags.ts';
import { fragmentIndex } from './shown-steps.ts';
import { indentAt, placeLead, spaceOf, unitsOf, type Child, type Unit } from './model/units.ts';
import { textStyle } from './model/templates.ts';

export type LivePiece = { kind: 'text'; text: string; node: Text } | ({ kind: 'math'; node: Element } & MathInfo);

export type Item =
  | { kind: 'text'; text: string; pieces: LivePiece[] }
  | { kind: 'element'; el: Element }
  | { kind: 'comment'; node: Comment };

export function virtualChildren(el: Element, math: MathLookup): Item[] {
  const items: Item[] = [];
  let pending: LivePiece[] | null = null;
  const flush = () => {
    if (!pending) return;
    const text = pending.map((p) => (p.kind === 'text' ? p.text : p.open + p.tex + p.close)).join('');
    if (text !== '') items.push({ kind: 'text', text, pieces: pending });
    pending = null;
  };
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      (pending ??= []).push({ kind: 'text', text: (node as Text).data, node: node as Text });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as Element;
      const info = e.localName === 'mjx-container' ? math(e) : null;
      if (info) (pending ??= []).push({ kind: 'math', node: e, ...info });
      else {
        flush();
        items.push({ kind: 'element', el: e });
      }
    } else if (node.nodeType === Node.COMMENT_NODE) {
      flush();
      items.push({ kind: 'comment', node: node as Comment });
    }
  }
  flush();
  return items;
}

const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'dt', 'dd', 'figcaption', 'caption', 'blockquote', 'pre', 'aside', 'summary', 'label']);
const INLINE_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'img', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']);

export function isTextElement(s: SrcEl): boolean {
  const own = s.children.some((c) => c.kind === 'text' && /\S/.test(c.decoded));
  if (TEXT_TAGS.has(s.tag)) return own || !s.children.some((c) => c.kind === 'element' && c.tag === 'div' && !isTextElement(c));
  if (s.tag !== 'div' && s.tag !== 'span') return false;
  return own && s.children.every((c) => c.kind !== 'element' || INLINE_TAGS.has(c.tag));
}

const sameTag = (el: Element, s: SrcEl) => el.localName.toLowerCase() === s.tag.toLowerCase();
const shown = (live: string, src: string) => (src.includes('\u00a0') ? live : live.replace(/\u00a0/g, ' '));
const short = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s).replace(/\n/g, '\\n');

export type TextElement = { src: SrcEl; live: Element; slide: Element | null };
export type Problem = { slide: Element | null; tag: string; reason: string };
export type Pairing = {
  texts: TextElement[];
  byLive: Map<Element, TextElement>;
  elements: Map<Element, SrcEl>;
  inner: Map<Element, SrcEl>;
  sections: { src: SrcEl; live: Element }[];
  problems: Problem[];
  root: Element | null;
};

export function pair(source: Source, liveSlides: Element, math: MathLookup): Pairing {
  const out: Pairing = { texts: [], byLive: new Map(), elements: new Map(), inner: new Map(), sections: [], problems: [], root: liveSlides };
  out.elements.set(liveSlides, source.slides);
  pairChildren(source.slides, liveSlides, null, math, out);
  return out;
}

function textElementsWithin(s: SrcEl): SrcEl[] {
  if (isTextElement(s)) return [s];
  return s.children.flatMap((c) => (c.kind === 'element' ? textElementsWithin(c) : []));
}

const generated = (el: Element) => el.hasAttribute('data-generated');

function pairChildren(src: SrcEl, live: Element, slide: Element | null, math: MathLookup, out: Pairing): void {
  const items = virtualChildren(live, math);
  let j = 0;
  for (const s of src.children) {
    if (s.kind !== 'element') continue;
    let k = j;
    while (k < items.length && !(items[k].kind === 'element' && sameTag((items[k] as { el: Element }).el, s) && !generated((items[k] as { el: Element }).el))) k++;
    if (k === items.length) {
      for (const b of textElementsWithin(s)) out.problems.push({ slide, tag: b.tag, reason: 'it is not on the page' });
      continue;
    }
    j = k + 1;
    pairElement(s, (items[k] as { el: Element }).el, slide, math, out);
  }
}

export function pairElement(s: SrcEl, el: Element, slide: Element | null, math: MathLookup, out: Pairing): void {
  out.elements.set(el, s);
  const here = s.tag === 'section' ? el : slide;
  if (s.tag === 'section') out.sections.push({ src: s, live: el });
  if (isTextElement(s)) {
    const reason = verify(s, el, math, out.inner);
    if (reason) out.problems.push({ slide: here, tag: s.tag, reason });
    else {
      const textEl = { src: s, live: el, slide: here };
      out.texts.push(textEl);
      out.byLive.set(el, textEl);
    }
  } else pairChildren(s, el, here, math, out);
}

function verify(s: SrcEl, el: Element, math: MathLookup, inner?: Map<Element, SrcEl>): string | null {
  const items = virtualChildren(el, math);
  const kids = s.children;
  if (!kids.length && EMPTIED.has(s.tag.toLowerCase()) && items.length === 1 && items[0].kind === 'element' && items[0].el.localName === 'br') return null;
  if (items.length !== kids.length) return `the ${s.tag} has ${kids.length} parts in the file and ${items.length} on the page`;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i], it = items[i];
    if (k.kind === 'element') {
      if (it.kind !== 'element' || !sameTag(it.el, k)) return `a ${k.tag} of the file is not on the page`;
      const reason = verify(k, it.el, math, inner);
      if (reason) return reason;
      inner?.set(it.el, k);
    } else if (k.kind === 'text') {
      if (it.kind !== 'text') return `the text "${short(k.decoded)}" is not on the page`;
      if (shown(it.text, k.decoded) !== k.decoded) return `the text "${short(k.decoded)}" reads "${short(it.text)}" on the page`;
      k.pieces = piecesOf(it.pieces);
    } else if (it.kind !== 'comment') return 'a comment of the file is not on the page';
  }
  return null;
}

function piecesOf(live: LivePiece[]): Piece[] {
  let d = 0;
  return live.map((p): Piece => {
    if (p.kind === 'text') {
      const piece: Piece = { kind: 'text', dec: { start: d, end: d + p.text.length } };
      d += p.text.length;
      return piece;
    }
    const length = p.open.length + p.tex.length + p.close.length;
    const piece: Piece = { kind: 'math', dec: { start: d, end: d + length }, inner: { start: d + p.open.length, end: d + p.open.length + p.tex.length } };
    d += length;
    return piece;
  });
}

export function innerRange(s: SrcEl): Range | null {
  if (!s.open) return null;
  const start = s.open.end;
  const end = s.close ? s.close.start : Math.max(start, lastEnd(s));
  return { start, end };
}

export function escape(source: Source, text: string, keepNbsp: boolean): string {
  let s = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = keepNbsp ? s.replace(/ /g, '&nbsp;') : s.replace(/ /g, ' ');
  return source.crlf ? s.replace(/\n/g, '\r\n') : s;
}

function serializeNew(source: Source, el: Element, math: MathLookup): string {
  const tag = el.localName;
  const attrs = [...el.attributes]
    .filter((a) => !isRuntimeAttr(el, a.name))
    .map((a) => ({ name: a.name, value: a.name === 'data-fragment-index' ? (fragmentIndex(el) ?? a.value) : a.name === 'class' ? [...el.classList].filter((c) => !isRuntimeClass(c)).join(' ') : a.value }))
    .filter((a) => a.name !== 'class' || a.value)
    .map((a) => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`))
    .join('');
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${serializeNewChildren(source, el, math)}</${tag}>`;
}

export function serializeNewChildren(source: Source, el: Element, math: MathLookup): string {
  return virtualChildren(el, math)
    .map((it) => (it.kind === 'text' ? escape(source, it.text, false) : it.kind === 'element' ? serializeNew(source, it.el, math) : `<!--${it.node.data}-->`))
    .join('');
}

function serializeText(source: Source, s: SrcText, it: Item & { kind: 'text' }): string {
  const text = source.text;
  if (shown(it.text, s.decoded) === s.decoded) return text.slice(s.range.start, s.range.end);
  const keepNbsp = s.decoded.includes('\u00a0');
  const lead = text.slice(s.range.start, s.range.start + s.lead);
  const live = it.pieces;
  if (s.pieces && s.pieces.length === live.length && s.pieces.every((p, i) => p.kind === live[i].kind)) {
    const parts = s.pieces.map((p, i) => {
      const lp = live[i];
      const r = rawRange(s, p.dec);
      if (p.kind === 'text' || lp.kind !== 'math') {
        const old = s.decoded.slice(p.dec.start, p.dec.end);
        const now = lp.kind === 'text' ? lp.text : lp.open + lp.tex + lp.close;
        return shown(now, old) === old ? text.slice(r.start, r.end) : escape(source, now, keepNbsp);
      }
      const inner = rawRange(s, p.inner);
      const old = s.decoded.slice(p.inner.start, p.inner.end);
      const tex = shown(lp.tex, old) === old ? text.slice(inner.start, inner.end) : escape(source, lp.tex, keepNbsp);
      return text.slice(r.start, inner.start) + tex + text.slice(inner.end, r.end);
    });
    return lead + parts.join('');
  }
  return lead + escape(source, it.text, keepNbsp);
}

function serializeChildren(source: Source, s: SrcEl, el: Element, math: MathLookup, tags: Map<Element, TagEdit>): string {
  const text = source.text;
  const items = virtualChildren(el, math);
  const kids = s.children;
  let c = 0;
  const parts: string[] = [];
  for (const it of items) {
    if (it.kind === 'element') {
      let k = c;
      while (k < kids.length && !(kids[k].kind === 'element' && sameTag(it.el, kids[k] as SrcEl))) k++;
      if (k < kids.length) {
        c = k + 1;
        parts.push(serializeElement(source, kids[k] as SrcEl, it.el, math, tags));
      } else parts.push(serializeNew(source, it.el, math));
      continue;
    }
    let k = c;
    while (k < kids.length && kids[k].kind !== it.kind && kids[k].kind !== 'element') k++;
    const hit = k < kids.length && kids[k].kind === it.kind ? kids[k] : null;
    if (hit) c = k + 1;
    if (it.kind === 'text') parts.push(hit ? serializeText(source, hit as SrcText, it) : escape(source, it.text, false));
    else parts.push(hit ? text.slice((hit as SrcComment).range.start, (hit as SrcComment).range.end) : `<!--${it.node.data}-->`);
  }
  return parts.join('');
}

const RUNTIME_PREFIX = /^(beeson-|plot-)/;
export const RUNTIME_CLASSES = new Set(['visible', 'current-fragment', 'present', 'past', 'future', 'disabled', 'enabled', 'stack', 'hl-target', 'hl-accent', 'hl-violet', 'hl-blue', 'hl-red']);
export const isRuntimeClass = (c: string): boolean => RUNTIME_PREFIX.test(c) || RUNTIME_CLASSES.has(c);
const RUNTIME_ATTRS: Record<string, string[]> = { p: ['data-head', 'data-style', 'data-missing'], cite: ['data-n', 'data-missing'] };
const numbered = (el: Element): boolean => el.localName === 'cite' || el.matches('p.theorem');
export const isRuntimeAttr = (el: Element, name: string): boolean => numbered(el) && RUNTIME_ATTRS[el.localName].includes(name);
export function stripRuntime(root: ParentNode): void {
  for (const el of root.querySelectorAll('cite, p.theorem')) for (const name of RUNTIME_ATTRS[el.localName]) el.removeAttribute(name);
}
const LIVE_STYLE = ['translate', 'rotate', 'width', 'font-size', 'text-align'];
const LIVE_ATTRS = ['alt', 'src', 'poster', 'href', 'muted', 'loop', 'colspan', 'rowspan', 'data-key'];

let probe: HTMLElement | null = null;

function liveEdit(s: SrcEl, el: Element): TagEdit {
  const file = stateOf(s.attrs);
  const edit: TagEdit = {};
  const live = [...el.classList].filter((c) => !isRuntimeClass(c));
  const classes: Record<string, boolean> = {};
  for (const c of live) if (!file.classes.includes(c)) classes[c] = true;
  for (const c of file.classes) if (!live.includes(c)) classes[c] = false;
  if (Object.keys(classes).length) edit.classes = classes;
  const style = (el as HTMLElement).style;
  if (style) {
    probe ??= document.createElement('div');
    probe.setAttribute('style', file.attrs.style ?? '');
    const decls: Record<string, string | null> = {};
    for (const name of LIVE_STYLE) {
      const now = style.getPropertyValue(name);
      if (now !== probe.style.getPropertyValue(name)) decls[name] = now || null;
    }
    if (Object.keys(decls).length) edit.style = decls;
  }
  const attrs: Record<string, string | null> = {};
  for (const name of LIVE_ATTRS) {
    const now = el.getAttribute(name);
    if (now !== (file.attrs[name] ?? null)) attrs[name] = now;
  }
  if (Object.keys(attrs).length) edit.attrs = attrs;
  return edit;
}

function serializeElement(source: Source, s: SrcEl, el: Element, math: MathLookup, tags: Map<Element, TagEdit>): string {
  const text = source.text;
  let open = s.open ? text.slice(s.open.start, s.open.end) : '';
  if (s.open) open = renderTag(text, s.open, s.attrs, mergeEdit(liveEdit(s, el), tags.get(el) ?? {})) ?? open;
  const close = s.close ? text.slice(s.close.start, s.close.end) : '';
  if (VOID.has(s.tag)) return open;
  if (RAW_TEXT.has(s.tag)) {
    const inner = innerRange(s);
    return open + (inner ? text.slice(inner.start, inner.end) : '') + close;
  }
  return open + contentOf(source, s, el, math, tags) + close;
}

const EMPTIED = new Set(['li', 'p']);
const BREAKS = /^(?:\s*<br\s*\/?>)+\s*$/i;
function contentOf(source: Source, s: SrcEl, el: Element, math: MathLookup, tags: Map<Element, TagEdit>): string {
  const out = serializeChildren(source, s, el, math, tags);
  if (!EMPTIED.has(s.tag.toLowerCase()) || !BREAKS.test(out)) return out;
  const r = contentRange(s);
  return r && BREAKS.test(s.source.text.slice(r.start, r.end)) ? out : '';
}

export function renderTextElement(source: Source, textEl: TextElement, math: MathLookup, tags: Map<Element, TagEdit> = new Map()): string {
  return contentOf(source, textEl.src, textEl.live, math, tags);
}

export type Edit = { start: number; end: number; text: string };
export type Rendered = { text: string; edits: Edit[]; changed: TextElement[]; warnings: string[]; places: number[] };

export const detached = new WeakSet<Element>();

export const leadsBack = new WeakMap<Element, { parent: Element; lead: string }>();

type Kid = { child: Child; node: SrcNode };

function kidsOf(s: SrcEl): Kid[] {
  const out: Kid[] = [];
  for (const c of s.children) {
    const range = c.kind === 'element' ? elementRange(c) : c.range;
    if (range) out.push({ child: { kind: c.kind, start: range.start, end: range.end }, node: c });
  }
  return out;
}

export function unitsWithin(s: SrcEl): { units: (Unit & { el: SrcEl })[]; tail: Range } | null {
  const range = contentRange(s);
  if (!range) return null;
  const kids = kidsOf(s);
  const { units, tail } = unitsOf(s.source.text, kids.map((k) => k.child), range);
  return { units: units.map((u) => ({ ...u, el: kids[u.child].node as SrcEl })), tail };
}

export function unitOf(s: SrcEl): Unit | null {
  if (!s.parent) return null;
  return unitsWithin(s.parent)?.units.find((u) => u.el === s) ?? null;
}

export function childSpace(s: SrcEl, eol: string, step: string): string {
  const first = unitsWithin(s)?.units[0];
  if (!first) return eol + (s.open ? indentAt(s.source.text, s.open.start) : '') + step;
  const text = s.source.text;
  let start = first.lead.start;
  if (!s.open && start === first.range.start) while (start > 0 && /[ \t\r\n\f]/.test(text[start - 1])) start--;
  return spaceOf(text.slice(start, first.range.start));
}

class Renderer {
  readonly edits: Edit[] = [];
  readonly changed: TextElement[] = [];
  readonly warnings: string[] = [];
  readonly places: number[] = [];
  private readonly liveOf = new Map<SrcEl, Element>();
  private readonly eol: string;
  private step: string | null = null;
  private readonly source: Source;
  private readonly pairing: Pairing;
  private readonly math: MathLookup;
  private readonly tags: Map<Element, TagEdit>;

  constructor(source: Source, pairing: Pairing, math: MathLookup, tags: Map<Element, TagEdit>) {
    this.source = source;
    this.pairing = pairing;
    this.math = math;
    this.tags = tags;
    for (const [el, s] of pairing.elements) this.liveOf.set(s, el);
    this.eol = source.crlf ? '\r\n' : '\n';
  }

  element(s: SrcEl, live: Element | undefined, at = -1): string {
    const text = s.source.text;
    const range = elementRange(s);
    if (!range) return '';
    if (!live) return text.slice(range.start, range.end);
    const open = this.open(s, live);
    const close = s.close ? text.slice(s.close.start, s.close.end) : '';
    const inner = contentRange(s);
    const verbatim = inner ? text.slice(inner.start, inner.end) : '';
    if (VOID.has(s.tag)) return open;
    if (RAW_TEXT.has(s.tag)) return open + verbatim + close;
    const textEl = this.pairing.byLive.get(live);
    if (textEl?.src === s) {
      const content = contentOf(s.source, s, live, this.math, this.tags);
      if (content !== verbatim) {
        this.edits.push({ start: inner?.start ?? range.start, end: inner?.end ?? range.start, text: content });
        this.changed.push(textEl);
      }
      return open + content + close;
    }
    if (isTextElement(s)) return open + verbatim + close;
    return open + this.content(s, live, at < 0 ? -1 : at + open.length) + close;
  }

  private open(s: SrcEl, live: Element): string {
    if (!s.open) return '';
    const raw = s.source.text.slice(s.open.start, s.open.end);
    const edit = this.tags.get(live);
    const tag = edit ? renderTag(s.source.text, s.open, s.attrs, edit) : null;
    if (tag === null) return raw;
    this.edits.push({ start: s.open.start, end: s.open.end, text: tag });
    return tag;
  }

  private dropped(s: SrcEl, node: Element): boolean {
    if (detached.has(node) || node.parentNode) return true;
    return this.pairing.byLive.get(node)?.src === s;
  }

  private indent(s: SrcEl): string {
    return s.open ? indentAt(s.source.text, s.open.start) : '';
  }

  private stepOf(): string {
    return (this.step ??= textStyle(this.source.text).step);
  }

  private space(s: SrcEl): string {
    return childSpace(s, this.eol, this.stepOf());
  }

  private content(s: SrcEl, live: Element, at: number): string {
    const text = s.source.text;
    const within = unitsWithin(s);
    const units = within?.units ?? [];
    const own = new Map(units.map((u) => [u.el, u]));
    const kept = new Map<SrcEl | null, (Unit & { el: SrcEl })[]>();
    const afterDropped = new Set<SrcEl>();
    let anchor: SrcEl | null = null;
    let changed = false;
    let gap = false;
    for (const u of units) {
      const node = this.liveOf.get(u.el);
      const drop = !!node && node.parentElement !== live && this.dropped(u.el, node);
      if (gap && !drop) afterDropped.add(u.el);
      gap = drop;
      if (node?.parentElement === live) anchor = u.el;
      else if (drop) changed = true;
      else kept.set(anchor, [...(kept.get(anchor) ?? []), u]);
    }
    const parts: string[] = [];
    let length = 0;
    const bare = !s.open;
    const put = (lead: string, body: (start: number) => string, place = false) => {
      if (bare) lead = parts.length ? lead || this.space(s) : lead.slice(spaceOf(lead).length);
      const start = at < 0 ? -1 : at + length + lead.length;
      if (place && start >= 0) this.places.push(start);
      const rest = body(start);
      parts.push(lead + rest);
      length += lead.length + rest.length;
    };
    const keep = (key: SrcEl | null) => {
      for (const u of kept.get(key) ?? []) put(text.slice(u.lead.start, u.range.start), () => text.slice(u.range.start, u.end), afterDropped.has(u.el));
    };
    keep(null);
    const notes: Element[] = [];
    let order = -1;
    for (const c of live.children) {
      const m = this.pairing.elements.get(c);
      if (!m) {
        if (s.tag === 'section' && c.matches('aside.notes') && !generated(c)) notes.push(c);
        continue;
      }
      const u = own.get(m);
      if (u) {
        if (units.indexOf(u) < order) changed = true;
        order = units.indexOf(u);
        put(text.slice(u.lead.start, u.range.start), (start) => this.element(m, c, start) + text.slice(u.range.end, u.end), afterDropped.has(u.el));
        keep(m);
        continue;
      }
      const home = unitOf(m);
      if (!home) continue;
      changed = true;
      const mt = m.source.text;
      const lead = mt.slice(home.lead.start, home.range.start);
      const inPlace = isFragmentRoot(m) && m.source.fragment?.home === live;
      const back = leadsBack.get(c);
      put(back?.parent === live ? back.lead : inPlace ? lead : placeLead(lead, this.space(s), this.eol), (start) => this.element(m, c, start) + mt.slice(home.range.end, home.end), true);
    }
    let tail = within ? text.slice(within.tail.start, within.tail.end) : '';
    if (!units.length && !tail && parts.length) tail = this.eol + this.indent(s);
    let out = parts.join('') + tail;
    for (const aside of notes) {
      const inner = serializeNewChildren(this.source, aside, this.math);
      if (!inner.trim()) continue;
      if (!s.close) {
        this.warnings.push('the notes of a slide without an end tag are not saved');
        continue;
      }
      out += `  <aside class="notes">${inner}</aside>${this.eol}`;
      changed = true;
    }
    const range = contentRange(s);
    if (changed && range) this.edits.push({ ...range, text: out });
    return out;
  }
}

export function renderDeck(source: Source, pairing: Pairing, math: MathLookup, tags: Map<Element, TagEdit> = new Map()): Rendered {
  const r = new Renderer(source, pairing, math, tags);
  const range = elementRange(source.slides);
  let text = source.text;
  if (range && pairing.root) text = text.slice(0, range.start) + r.element(source.slides, pairing.root, range.start) + text.slice(range.end);
  return { text, edits: r.edits, changed: r.changed, warnings: r.warnings, places: r.places };
}

export function renderUnit(pairing: Pairing, math: MathLookup, tags: Map<Element, TagEdit>, el: Element, source: Source): { lead: string; body: string; trail: string } | null {
  const s = pairing.elements.get(el);
  if (!s) return null;
  const u = unitOf(s);
  const text = s.source.text;
  const body = new Renderer(source, pairing, math, tags).element(s, el);
  if (!u) return { lead: '', body, trail: '' };
  return { lead: text.slice(u.lead.start, u.range.start), body, trail: text.slice(u.range.end, u.end) };
}
