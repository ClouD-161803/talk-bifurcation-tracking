import type { App } from '../app.ts';
import type { Entry } from '../history.ts';
import { mergeEdit, type TagEdit, type Translate } from '../tags.ts';
import { injectStyle } from '../ui/dom.ts';
import { frameOf, LINE, movablesOf, pictureTurn, strokeOf, toScreen, toSlide, turnable, unturnedRect, type Frame } from '../canvas/hit.ts';
import { parseStroke, rebend, strokeText, type Box, type Point, type Stroke } from '../canvas/stroke.ts';
import { angleOf } from '../canvas/drag.ts';
import { groupFrame } from '../canvas/frames.ts';
import { groupOf } from './groups.ts';

export type End = 'from' | 'to';
export type Attachment = { els: Element[]; fx: number; fy: number };

export const REACH = 16;
const TAKES = 'img, video, figure, .figure-box, .qr, .tikz, .shape, table, div.math, tycho-viewer';
const TEXTS = 'h1, h2, h3, p, ul, ol, dl, pre, blockquote, .caption';
const MIDDLES: [number, number][] = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];

const STYLE = `
.beeson-attach-target { position: fixed; z-index: 52; pointer-events: none; box-sizing: border-box; border: 2px solid var(--ed-select, #7048e8); border-radius: 2px; }
.beeson-attach-target[hidden] { display: none; }
.beeson-attach-target i { position: absolute; width: 7px; height: 7px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--ed-select, #7048e8); border: 1px solid #fff; }
`;

const attrOf = (end: End) => (end === 'from' ? 'data-from' : 'data-to');
const namesOf = (el: Element): string[] => el.getAttribute('data-anchor')?.split(/\s+/).filter(Boolean) ?? [];
const withName = (name: string) => `[data-anchor~="${CSS.escape(name)}"]`;
const shown = (els: Element[]) => {
  const seen = els.filter((el) => el.getClientRects().length);
  return seen.length ? seen : els;
};
const num = (v: number) => String(Math.round(v * 1000) / 1000);

export function parseEnd(v: string | null): { name: string; fx: number; fy: number } | null {
  const m = /^\s*(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/.exec(v ?? '');
  return m ? { name: m[1], fx: parseFloat(m[2]), fy: parseFloat(m[3]) } : null;
}

const slideOf = (el: Element): Element | null => el.closest('.reveal .slides section');
const translateOf = (el: Element): Translate | null => {
  const [x, y] = ((el as HTMLElement).style?.translate ?? '').split(/\s+/).map((v) => parseFloat(v));
  return Number.isFinite(x) && (x || y) ? { x, y: y || 0 } : null;
};

export const anchorsOf = (slide: Element | null, name: string): Element[] => shown([...(slide?.querySelectorAll(withName(name)) ?? [])]);

export function takesAttachment(el: Element): boolean {
  if (el.matches(`${LINE}, .backdrop, .plate, .foot`)) return false;
  return el.matches(TAKES) || (el.matches(TEXTS) && !!translateOf(el));
}

function boxOf(f: Frame, els: Element[]): { box: Box; deg: number } {
  const top = shown(els).filter((el) => !els.some((o) => o !== el && o.contains(el)));
  if (top.length === 1) return { box: toSlide(f, unturnedRect(top[0]).box), deg: pictureTurn(top[0]) };
  const deg = top.every(turnable) ? angleOf(top[0]) : 0;
  return { box: toSlide(f, groupFrame(top, deg)), deg };
}

const turn = (box: Box, deg: number, p: Point, back = false): Point => {
  if (!deg) return p;
  const a = ((back ? -deg : deg) * Math.PI) / 180;
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  return { x: cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a), y: cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a) };
};

export function placeIn(app: App, els: Element[], fx: number, fy: number): Point {
  const { box, deg } = boxOf(frameOf(app), els);
  return turn(box, deg, { x: box.left + fx * box.width, y: box.top + fy * box.height });
}

function objectsOf(app: App, skip: Element[]): Element[][] {
  const near = (a: Element, b: Element) => a === b || a.contains(b) || b.contains(a);
  const out: Element[][] = [];
  const seen = new Set<string>();
  for (const el of movablesOf(app).filter((el) => takesAttachment(el) && !skip.some((s) => near(s, el))).reverse()) {
    const id = groupOf(el);
    const members = id ? [...(app.current()?.querySelectorAll(`[data-group~="${CSS.escape(id)}"]`) ?? [])] : [];
    if (id && seen.has(id)) continue;
    if (id && members.length > 1 && !members.some((m) => skip.some((s) => near(s, m)))) {
      seen.add(id);
      out.push(members);
    } else out.push([el]);
  }
  return out;
}

export function attachmentAt(app: App, p: Point, skip: Element[] = []): { attachment: Attachment; at: Point } | null {
  const f = frameOf(app);
  let best: { els: Element[]; box: Box; deg: number; q: Point; near: { fx: number; fy: number; d: number } } | null = null;
  for (const els of objectsOf(app, skip)) {
    const { box, deg } = boxOf(f, els);
    if (box.width <= 0 || box.height <= 0) continue;
    const q = turn(box, deg, p, true);
    const mids = MIDDLES.map(([fx, fy]) => ({ fx, fy, d: Math.hypot(box.left + fx * box.width - q.x, box.top + fy * box.height - q.y) }));
    const near = mids.reduce((a, b) => (b.d < a.d ? b : a));
    const inside = q.x >= box.left - 1 && q.x <= box.left + box.width + 1 && q.y >= box.top - 1 && q.y <= box.top + box.height + 1;
    if (inside) {
      best = { els, box, deg, q, near };
      break;
    }
    if (near.d <= REACH && (!best || near.d < best.near.d)) best = { els, box, deg, q, near };
  }
  if (!best) return null;
  const { els, box, deg, q, near } = best;
  const fx = near.d <= REACH ? near.fx : Math.min(1, Math.max(0, (q.x - box.left) / box.width));
  const fy = near.d <= REACH ? near.fy : Math.min(1, Math.max(0, (q.y - box.top) / box.height));
  const g = { els, fx: Number(num(fx)), fy: Number(num(fy)) };
  return { attachment: g, at: turn(box, deg, { x: box.left + g.fx * box.width, y: box.top + g.fy * box.height }) };
}

let outline: HTMLElement | null = null;
export function showTarget(app: App, els: Element[] | null): void {
  if (!outline) {
    injectStyle('attach', STYLE);
    outline = document.createElement('div');
    outline.className = 'beeson-attach-target';
    outline.innerHTML = '<i></i><i></i><i></i><i></i>';
    document.body.append(outline);
  }
  outline.hidden = !els;
  if (!els) return;
  const f = frameOf(app);
  const { box, deg } = boxOf(f, els);
  const s = toScreen(f, box);
  Object.assign(outline.style, { left: `${s.left}px`, top: `${s.top}px`, width: `${s.width}px`, height: `${s.height}px`, rotate: deg ? `${deg}deg` : '' });
  [...outline.children].forEach((dot, i) => Object.assign((dot as HTMLElement).style, { left: `${MIDDLES[i][0] * 100}%`, top: `${MIDDLES[i][1] * 100}%` }));
}

export type Writer = (el: Element, attrs: Record<string, string | null>, translate?: Translate | null) => void;

export const recorded = (app: App): Writer => (el, attrs, translate) => app.doc.setTag(el, { attrs, ...(translate !== undefined ? { translate } : {}) }, 'attach');

function put(app: App, el: Element, edit: TagEdit): void {
  app.tagEdits.set(el, mergeEdit(app.tagEdits.get(el), edit));
  for (const [k, v] of Object.entries(edit.attrs ?? {})) {
    if (v === null) el.removeAttribute(k);
    else el.setAttribute(k, v);
  }
  if (edit.translate !== undefined) (el as HTMLElement).style.translate = edit.translate ? `${edit.translate.x}px ${edit.translate.y}px` : '';
  app.markDirty();
}

export class Patch {
  private readonly before = new Map<Element, TagEdit>();
  private after = new Map<Element, TagEdit>();
  private readonly app: App;
  constructor(app: App) {
    this.app = app;
  }
  get empty(): boolean {
    return !this.before.size;
  }
  get touched(): Element[] {
    return [...this.before.keys()];
  }
  readonly write: Writer = (el, attrs, translate) => {
    if (!this.app.pairing?.elements.get(el) && !this.app.pairing?.inner.get(el)) return;
    const was = this.before.get(el) ?? { attrs: {} };
    for (const k of Object.keys(attrs)) if (!(k in was.attrs!)) was.attrs![k] = el.getAttribute(k);
    if (translate !== undefined && was.translate === undefined) was.translate = translateOf(el);
    this.before.set(el, was);
    put(this.app, el, { attrs, ...(translate !== undefined ? { translate } : {}) });
  };
  undo(): void {
    this.after = new Map([...this.before].map(([el, b]) => [el, { attrs: Object.fromEntries(Object.keys(b.attrs ?? {}).map((k) => [k, el.getAttribute(k)])), ...(b.translate !== undefined ? { translate: translateOf(el) } : {}) }]));
    for (const [el, b] of [...this.before].reverse()) put(this.app, el, b);
  }
  redo(): void {
    for (const [el, a] of this.after) put(this.app, el, a);
  }
}

const strokeAt = (svg: Element): Stroke | null => parseStroke(strokeOf(svg), translateOf(svg) ?? { x: 0, y: 0 });

export function writeStroke(write: Writer, svg: Element, s: Stroke): void {
  const t = strokeText(s);
  const b = t.box;
  write(svg, { width: String(b.width), height: String(b.height) }, b.left || b.top ? { x: b.left, y: b.top } : null);
  const child = strokeOf(svg);
  if (child) write(child, t.attrs);
}

const linesOf = (slide: Element | null): Element[] => [...(slide?.querySelectorAll(`${LINE}[data-from], ${LINE}[data-to]`) ?? [])];

const named = (slide: Element | null, name: string): boolean =>
  linesOf(slide).some((svg) => (['from', 'to'] as End[]).some((e) => parseEnd(svg.getAttribute(attrOf(e)))?.name === name));

export function nameOf(write: Writer, els: Element[]): string {
  const slide = slideOf(els[0]);
  const own = namesOf(els[0]).find((n) => els.every((el) => namesOf(el).includes(n)) && [...(slide?.querySelectorAll(withName(n)) ?? [])].every((a) => els.includes(a)));
  if (own) return own;
  const taken = new Set([...(slide?.querySelectorAll('[data-anchor]') ?? [])].flatMap(namesOf));
  let i = 1;
  while (taken.has(`a${i}`)) i++;
  for (const el of els) write(el, { 'data-anchor': [...namesOf(el), `a${i}`].join(' ') });
  return `a${i}`;
}

function tidy(write: Writer, slide: Element | null, name: string): void {
  if (!slide || named(slide, name)) return;
  for (const el of slide.querySelectorAll(withName(name))) {
    const rest = namesOf(el).filter((n) => n !== name);
    write(el, { 'data-anchor': rest.length ? rest.join(' ') : null });
  }
}

export function setEnd(write: Writer, svg: Element, end: End, g: Attachment | null): void {
  const was = parseEnd(svg.getAttribute(attrOf(end)));
  const value = g ? `${nameOf(write, g.els)} ${num(g.fx)} ${num(g.fy)}` : null;
  if (value === svg.getAttribute(attrOf(end))) return;
  write(svg, { [attrOf(end)]: value });
  if (was) tidy(write, slideOf(svg), was.name);
}

export function attachedTo(svg: Element, end: End): Element[] {
  const g = parseEnd(svg.getAttribute(attrOf(end)));
  return g ? anchorsOf(slideOf(svg), g.name) : [];
}

export function follow(app: App, write: Writer): void {
  const slide = app.current();
  for (const svg of linesOf(slide)) {
    if (!svg.isConnected || !app.pairing?.elements.get(svg)?.open) continue;
    const s = strokeAt(svg);
    if (!s || parseFloat((svg as HTMLElement).style.rotate)) continue;
    const e = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
    for (const end of ['from', 'to'] as End[]) {
      const g = parseEnd(svg.getAttribute(attrOf(end)));
      if (!g) continue;
      const els = anchorsOf(slide, g.name);
      if (!els.length) {
        write(svg, { [attrOf(end)]: null });
        continue;
      }
      if (els.some((el) => !el.getClientRects().length)) continue;
      const p = placeIn(app, els, g.fx, g.fy);
      if (end === 'from') [e.x1, e.y1] = [Math.round(p.x), Math.round(p.y)];
      else [e.x2, e.y2] = [Math.round(p.x), Math.round(p.y)];
    }
    if (e.x1 !== s.x1 || e.y1 !== s.y1 || e.x2 !== s.x2 || e.y2 !== s.y2) writeStroke(write, svg, rebend(s, e));
  }
}

function letGo(write: Writer, moved: Element[]): void {
  for (const svg of moved) {
    if (!svg.matches(LINE)) continue;
    for (const end of ['from', 'to'] as End[]) {
      const els = attachedTo(svg, end);
      const along = els.length && els.every((el) => moved.some((m) => m === el || m.contains(el) || el.contains(m)));
      if (svg.hasAttribute(attrOf(end)) && !along) setEnd(write, svg, end, null);
    }
  }
}

let recent: Patch | null = null;

export function afterMove(app: App, moved: Element[]): Patch {
  const p = new Patch(app);
  letGo(p.write, moved);
  follow(app, p.write);
  recent = p;
  return p;
}

export function followAgain(app: App): void {
  if (recent) follow(app, recent.write);
}

export function relink(app: App, copies: Element[]): void {
  const write = recorded(app);
  const all = copies.flatMap((c) => [c, ...c.querySelectorAll('[data-anchor], svg.line')]);
  const marked = all.filter((el) => el.hasAttribute('data-anchor'));
  const names = new Set(marked.flatMap(namesOf));
  const used = new Set<string>();
  const ends: [Element, End, ReturnType<typeof parseEnd>][] = [];
  for (const svg of all.filter((el) => el.matches(LINE))) {
    for (const end of ['from', 'to'] as End[]) {
      const g = parseEnd(svg.getAttribute(attrOf(end)));
      if (!g) continue;
      if (names.has(g.name)) {
        used.add(g.name);
        ends.push([svg, end, g]);
      } else write(svg, { [attrOf(end)]: null });
    }
  }
  if (!marked.length) return;
  const slide = slideOf(copies[0]);
  const taken = new Set([...(slide?.querySelectorAll('[data-anchor]') ?? [])].filter((el) => !all.includes(el)).flatMap(namesOf));
  const to = new Map<string, string>();
  for (const n of used) {
    let m = n;
    for (let i = 1; taken.has(m); i++) m = `a${i}`;
    taken.add(m);
    to.set(n, m);
  }
  for (const el of marked) {
    const list = namesOf(el).flatMap((n) => to.get(n) ?? []);
    const m = list.length ? list.join(' ') : null;
    if (m !== el.getAttribute('data-anchor')) write(el, { 'data-anchor': m });
  }
  for (const [svg, end, g] of ends) if (g && to.get(g.name) !== g.name) write(svg, { [attrOf(end)]: `${to.get(g.name)} ${num(g.fx)} ${num(g.fy)}` });
}

export function install(app: App): void {
  const remove = app.doc.remove.bind(app.doc);
  app.doc.remove = async (el, ...rest) => {
    const slide = slideOf(el);
    const svgs = [el, ...el.querySelectorAll(LINE)].filter((l) => l.matches(LINE));
    const names = svgs.flatMap((svg) => (['from', 'to'] as End[]).flatMap((end) => parseEnd(svg.getAttribute(attrOf(end)))?.name ?? []));
    await remove(el, ...rest);
    if (slide?.isConnected) for (const n of new Set(names)) tidy(recorded(app), slide, n);
  };
  app.history.onSettle(() => {
    const p = new Patch(app);
    follow(app, p.write);
    if (!p.empty) app.history.push({ label: 'attach', undo: () => p.undo(), redo: () => p.redo(), touches: p.touched });
  });
  const typed = new WeakMap<Entry, Patch>();
  app.history.onTyped((entry) => {
    if (!linesOf(app.current()).length) return;
    let p = typed.get(entry);
    if (!p) {
      const patch = new Patch(app);
      const { undo, redo } = entry;
      entry.undo = async () => {
        await undo.call(entry);
        patch.undo();
      };
      entry.redo = async () => {
        await redo.call(entry);
        patch.redo();
      };
      Object.defineProperty(entry, 'touches', { get: () => patch.touched, configurable: true });
      typed.set(entry, (p = patch));
    }
    follow(app, p.write);
  });
}
