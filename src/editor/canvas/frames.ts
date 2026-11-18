// the hover and selection frames, the eight resize handles, the rotate handle, the handle of a
// text element, the readout at the pointer, the guides and the marks of equal gaps and sizes, and the
// marquee, in one layer over the canvas
// clipped to the canvas cell of the stage, so that a handle at the edge of the slide is drawn on
// the pasteboard and none is drawn over the bars at a zoom. the frames are drawn in screen pixels
// from the live boxes of the elements, and the guides from slide pixels by the live scale. the frame
// and the handles of a rotated element are turned with it, and a locked element is framed dimmed
// without grips. left of each frame, a padlock locks and unlocks its element

import type { App } from '../app.ts';
import { HOST } from '../app.ts';
import { injectStyle } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { groupOf, lockEls, membersOf } from '../commands/order.ts';
import { scopeOf } from '../model/groups.ts';
import { apartOf, turnersOf } from './drag.ts';
import type { Box, Guide, Handle, Spacing } from './snap.ts';
import { BY_ITSELF, CONTAINER, RESIZABLE, captionsOf, objectsOf, figureFrame, frameOf, frameRect, isTextSized, movableOf, orientedBox, pictureOf, scaleAt, sizedOf, toScreen, turnable as turns } from './hit.ts';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
// the resize cursors from the direction of the grip e on, by eighths of a turn clockwise
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

// what the drag and the keys show, besides the selection: the element under the pointer, the
// elements being moved, the guides and gaps of a snap, the readout, the marquee in screen pixels,
// the frame of a group at the start of its turn with the angle it is turned by, the angle guide of a
// turn held at a multiple of 45 degrees, through its center on the screen and reach px past it, and
// the grip or rotate handle held. the rotate handle is drawn alone in its gesture, and a grip with
// the frame and the other grips, which follow the resized box
export const view: {
  hover: Element | null;
  moving: Element[] | null;
  resizing: boolean;
  guides: Guide[];
  spacing: Spacing[];
  readout: { text: string; x: number; y: number; at: 'pointer' | 'frame' } | null;
  marquee: Box | null;
  turn: { box: Box; deg: number } | null;
  spoke: { x: number; y: number; deg: number; reach: number } | null;
  held: HTMLElement | null;
} = { hover: null, moving: null, resizing: false, guides: [], spacing: [], readout: null, marquee: null, turn: null, spoke: null, held: null };

// the readouts of a place and a size in slide px, labeled as in Keynote
export const xy = (x: number, y: number) => `x: ${Math.round(x)} px  y: ${Math.round(y)} px`;
export const wh = (w: number, h: number) => `w: ${Math.round(w)} px  h: ${Math.round(h)} px`;

const CSS = `
.beeson-overlay { position: fixed; inset: 0; z-index: 51; pointer-events: none; }
.beeson-frame { position: fixed; pointer-events: none; box-sizing: border-box; border: 1px solid var(--ed-muted, var(--subtle, #bbb)); opacity: 0.3; }
.beeson-frame:where(.selected, .union, .entered, .caret) { border: 1px solid #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(0, 0, 0, 0.55); opacity: 1; }
.beeson-frame.entered { border-style: dashed; }
.beeson-overlay [hidden] { display: none !important; }
.beeson-grip { position: fixed; width: 9px; height: 9px; margin: -5.5px 0 0 -5.5px; border-radius: 50%; border: 1px solid #444; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25); pointer-events: auto; touch-action: none; }
.beeson-frame.locked { opacity: 0.45; }
.beeson-grip.square { border-radius: 0; }
.beeson-rotor { position: fixed; width: 14px; height: 14px; margin: -7px 0 0 -7px; box-sizing: border-box; border-radius: 50%; border: 1px solid #444; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25); color: #444; font: 600 10px/12px system-ui, sans-serif; text-align: center; cursor: grab; user-select: none; pointer-events: auto; touch-action: none; }
.beeson-rotor-stem { position: fixed; width: 1px; height: 11px; margin-left: -0.5px; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55); transform-origin: 50% 0; }
html.beeson-rotating, html.beeson-rotating * { cursor: grabbing !important; user-select: none !important; }
.beeson-grip[data-handle=nw], .beeson-grip[data-handle=se] { cursor: nwse-resize; }
.beeson-grip[data-handle=ne], .beeson-grip[data-handle=sw] { cursor: nesw-resize; }
.beeson-grip[data-handle=n], .beeson-grip[data-handle=s] { cursor: ns-resize; }
.beeson-grip[data-handle=e], .beeson-grip[data-handle=w] { cursor: ew-resize; }
.beeson-handle, .beeson-lock { position: fixed; width: 22px; height: 22px; box-sizing: border-box; border-radius: 6px; border: 1px solid var(--ed-line, var(--line, #555)); background: var(--ed-panel, var(--bg, #000)); color: var(--ed-text, var(--text, #eee)); font: 14px/20px system-ui, sans-serif; text-align: center; cursor: move; user-select: none; pointer-events: auto; }
.beeson-handle:hover, .beeson-handle:focus-visible, .beeson-lock:hover, .beeson-lock:focus-visible { border-color: var(--ed-text, var(--text, #eee)); outline: none; }
.beeson-lock { display: grid; place-items: center; cursor: default; touch-action: manipulation; }
.beeson-lock.closed { background: var(--ed-text, var(--text, #eee)); color: var(--ed-panel, var(--bg, #000)); }
.beeson-guide { position: fixed; background: var(--ed-guide, #e8590c); }
.beeson-guide.v { width: 1px; }
.beeson-guide.h { height: 1px; }
.beeson-guide.spoke { width: 1px; margin-left: -0.5px; }
.beeson-gap { position: fixed; color: var(--ed-guide, #e8590c); }
.beeson-gap.h { margin-top: -3.5px; }
.beeson-gap.v { margin-left: -3.5px; }
.beeson-gap svg { display: block; overflow: visible; }
.beeson-offset { position: fixed; height: 22px; padding: 0 7px; box-sizing: border-box; border-radius: 5px; background: var(--ed-guide, #e8590c); color: #fff; font: 600 12px/22px system-ui, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
.beeson-offset.frame { transform: translateX(-100%); }
.beeson-marquee { position: fixed; box-sizing: border-box; border: 1px solid var(--ed-select, #7048e8); background: color-mix(in srgb, var(--ed-select, #7048e8) 12%, transparent); }
html.beeson-editing .reveal .beeson-movable:focus-visible { outline: 2px solid var(--ed-select, #7048e8); outline-offset: 6px; }
html.beeson-dragging, html.beeson-dragging * { cursor: move !important; user-select: none !important; }
html.beeson-band, html.beeson-band .reveal * { cursor: move; }
html.beeson-editing .reveal .slides section img, html.beeson-editing .reveal .slides section video, html.beeson-editing .reveal .slides section .figure-box, html.beeson-editing .reveal .slides section .plate, html.beeson-editing .reveal .slides section .qr, html.beeson-editing .reveal .slides section .shape { cursor: move; }
html.beeson-editing .reveal .slides section .shape { pointer-events: auto; }
html.beeson-editing .reveal .slides section [data-locked]:is(img, video, .figure-box, .plate, .qr, .shape), html.beeson-editing .reveal .slides section [data-locked] :is(img, video, .qr) { cursor: default; }
html.beeson-playing :is(.beeson-overlay, .beeson-line-layer, .beeson-table-bars, .beeson-guides, .beeson-backdrop-cuts, .beeson-attach-target) { visibility: hidden !important; }
html.beeson-playing .reveal .slides, html.beeson-playing .reveal .slides * { caret-color: transparent !important; }
html.beeson-playing .reveal .beeson-movable:focus-visible { outline: none; }
`;

// the previews that play, by kind. while one plays, the frames, grips, and handles of the
// selection, the outline under the pointer, the ends of a line, the guides, the band of the rulers,
// and the caret are not drawn, as Keynote and PowerPoint hide them during a preview, and they are
// drawn again at its end. stop ends the preview of its kind
const previews = new Map<string, () => void>();
export const previewPlays = (): boolean => previews.size > 0;
export const stopPreviews = (): void => { for (const stop of [...previews.values()]) stop(); };
export function setPreview(app: App, kind: string, on: boolean, stop: () => void = () => {}): void {
  const was = previewPlays();
  if (on) previews.set(kind, stop);
  else previews.delete(kind);
  if (was === previewPlays()) return;
  document.documentElement.classList.toggle('beeson-playing', previewPlays());
  app.invalidate('selection');
}

// a click listener that does nothing. chrome moves a touch to the nearest element that responds to a
// click within the area of the finger, e.g. the paragraph under a grip, and a grip or the rotate
// handle with this listener keeps the touch
const tappable = (d: HTMLElement): void => d.addEventListener('click', () => {});

const div = (className: string, parent: HTMLElement): HTMLDivElement => {
  const d = document.createElement('div');
  d.className = className;
  d.hidden = true;
  parent.append(d);
  return d;
};

const place = (d: HTMLElement, b: Box) => {
  d.hidden = false;
  Object.assign(d.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
};

// the members of a group, its frame without the inset around a caption, and its angle
export type FramedGroup = { els: Element[]; reach: Box; deg: number };

const grow = (b: Box, by: number): Box => ({ left: b.left - by, top: b.top - by, width: b.width + 2 * by, height: b.height + 2 * by });

// the px that the frame of el stands off the box of orientOf: a figure and a backdrop are framed at
// their edges, where their handles are, and a text element 6 px outside its text
export const growOf = (el: Element): number => (el.matches(RESIZABLE) || el.matches(CONTAINER) || el.matches('.backdrop') ? 0 : 6);

// the angle of el in degrees, from its computed rotate
const angleOf = (el: Element): number => parseFloat(getComputedStyle(el).rotate) || 0;

// the frame of a group, its readout in a resize, and W, H, X, and Y of the Arrange pane for it, at
// the union of the frames of its members
export function groupReach(els: Element[]): Box {
  const seen = els.map(frameRect);
  const left = Math.min(...seen.map((b) => b.left)), top = Math.min(...seen.map((b) => b.top));
  return { left, top, width: Math.max(...seen.map((b) => b.left + b.width)) - left, height: Math.max(...seen.map((b) => b.top + b.height)) - top };
}

// a figure with a caption is framed INSET px outside, clear of the text of its caption, as a text element
// of text is framed outside its text and the frame of a text box in Keynote stands off its text
// (K58). the fields, the snap, and the gestures keep the box of the figure
const INSET = 8;

// the box of el on the screen without its rotation, about the center of the box seen, and the
// angle that it is turned by. a figure that holds a picture is framed at the picture, where its
// grips resize it, and over its caption, which is turned with the figure as one object. a picture
// turned by itself in a figure with a caption is framed upright around both
export function orientOf(el: Element, scale: number): { box: Box; deg: number } {
  if (captionsOf(el).length) {
    const whole = figureFrame(el);
    return { box: grow(whole.deg ? whole.box : frameRect(el), INSET), deg: whole.deg };
  }
  const pic = pictureOf(el);
  const deg = angleOf(el) + (pic === el ? 0 : angleOf(pic)) + (el.matches(RESIZABLE) && el.parentElement?.closest(CONTAINER) ? angleOf(el.parentElement.closest(CONTAINER) as Element) : 0);
  return deg ? { box: orientedBox(pic, scale, deg), deg } : { box: frameRect(el), deg: 0 };
}

// the point x, y turned by deg about the center of box
export function turned(box: Box, deg: number, x: number, y: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const a = (deg * Math.PI) / 180;
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  return { x: cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), y: cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a) };
}

// the frame of a group on the screen turned by deg, the angle of its first member, as Keynote
// turns the frame of a group, without its rotation about its center. each member is taken in the
// axes of the frame at its angle to the group, about its center turned back, with the upright
// caption of a picture turned by itself carried with it, hence a turn changes the angle of the
// frame and not its size, as a turn of one element does (K79, P71)
export function groupFrame(els: Element[], deg: number): Box {
  if (!deg) return groupReach(els);
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const back = (x: number, y: number) => ({ x: x * cos + y * sin, y: y * cos - x * sin });
  const points = els.flatMap((el) => {
    const pic = pictureOf(el), d = angleOf(el) + (pic === el ? 0 : angleOf(pic));
    const whole = captionsOf(el).length ? figureFrame(el) : null;
    const b = whole?.deg ? whole.box : orientedBox(pic, scaleAt(el), d);
    const at = back(b.left + b.width / 2, b.top + b.height / 2);
    // the box of the picture at its angle to the group, and each caption at its place to the
    // picture, or the frame of a figure turned as one object at its angle to the group
    const boxes = whole?.deg ? [{ x: at.x, y: at.y, w: b.width, h: b.height, d: whole.deg - deg }] : [{ x: at.x, y: at.y, w: b.width, h: b.height, d: d - deg }, ...captionsOf(el).map((r) => ({ x: at.x + r.left + r.width / 2 - (b.left + b.width / 2), y: at.y + r.top + r.height / 2 - (b.top + b.height / 2), w: r.width, h: r.height, d: 0 }))];
    return boxes.flatMap(({ x, y, w, h, d }) => {
      const c = { left: x - w / 2, top: y - h / 2, width: w, height: h };
      return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => turned(c, d, c.left + u * w, c.top + v * h));
    });
  });
  const left = Math.min(...points.map((p) => p.x)), top = Math.min(...points.map((p) => p.y));
  const width = Math.max(...points.map((p) => p.x)) - left, height = Math.max(...points.map((p) => p.y)) - top;
  const cx = left + width / 2, cy = top + height / 2;
  return { left: cx * cos - cy * sin - width / 2, top: cx * sin + cy * cos - height / 2, width, height };
}

// the distance of the center of the rotate handle above the top edge of a frame, and its radius,
// in screen px, about those of the rotate handle of PowerPoint. where the handle would cover the
// text of a text element above, e.g. a heading over a paragraph, its stem is cut down to SHORT
const ROTOR = 18;
const SHORT = 11;
const KNOB = 7;
// the text of the text elements whose lines a rotate handle is kept off where it can be
const WORDS = 'h1, h2, h3, p, li, dt, dd, div.math, .caption, figcaption, td, th, pre, blockquote';
// the handle of a text element is drawn this far left of the frame, clear of its grips, in screen px
const HANDLE = 22;
const HANDLE_GAP = 10;
// the bar of the row numbers of a table with its gap, in commands/table.ts, which the handle of a
// table is drawn left of
const ROW_BAR = 24;
// the distance between the rows of the column of buttons left of a frame: the handle, the padlock,
// and the group button
const ROW = 23;

// the overlay of the editor. the handle of a text element and the resize handles are its only parts that
// take the pointer
export class Frames {
  readonly layer: HTMLDivElement;
  // the dashed frame of the element under the pointer or being edited
  readonly hoverFrame: HTMLDivElement;
  // the handle of the text element under the pointer, being edited, or selected, by which it is dragged
  readonly handle: HTMLDivElement;
  // the grips of the first selected element, and a set more for each other selected element
  readonly grips: Record<Handle, HTMLDivElement>;
  private readonly gripSets: Record<Handle, HTMLDivElement>[] = [];
  // the element of each set of grips, as last drawn, and the group that a set resizes
  private members: (Element | null)[] = [];
  private groups: (FramedGroup | null)[] = [];
  // the rotate handle of the one selected element, on a stem above the middle of its top edge
  readonly rotor: HTMLDivElement;
  private readonly stem: HTMLDivElement;
  private readonly spoke: HTMLDivElement;
  private readonly frames: HTMLDivElement[] = [];
  // the one frame of a selected group, and the frame of each group of a selection with other objects
  private readonly union: HTMLDivElement;
  private readonly unions: HTMLDivElement[] = [];
  // the group that a click entered, drawn dashed around its members
  private readonly entered: HTMLDivElement;
  // the frame of a text with the caret that no other frame holds, e.g. a cell of a table
  private readonly caret: HTMLDivElement;
  // the distance of the rotate handle above the frame, kept while it is dragged
  private rotorAt = ROTOR;
  // the box of a selected group on the screen, as last drawn, which its one set of grips resizes,
  // without its rotation about its center, and the angle that it is turned by
  private group: Box | null = null;
  private reach: Box | null = null;
  private groupDeg = 0;
  private readonly guides: HTMLDivElement[] = [];
  private readonly gaps: HTMLDivElement[] = [];
  readonly readout: HTMLDivElement;
  private readonly marquee: HTMLDivElement;
  // the padlock of each frame of the selection, with the elements that it locks, and the box of the
  // column of buttons of each framed element, which the hover keeps to on its way there
  private readonly locks: HTMLDivElement[] = [];
  private lockTargets: Element[][] = [];
  private columns = new Map<Element, Box>();
  private readonly app: App;

  constructor(app: App) {
    injectStyle('frames', CSS);
    this.app = app;
    this.layer = document.createElement('div');
    this.layer.className = 'beeson-overlay';
    this.hoverFrame = div('beeson-frame', this.layer);
    this.frames.push(div('beeson-frame selected', this.layer));
    this.union = div('beeson-frame union group', this.layer);
    this.entered = div('beeson-frame entered', this.layer);
    this.caret = div('beeson-frame caret', this.layer);
    // the first guide on each axis is always there, at the line snapped to
    this.guides.push(div('beeson-guide v', this.layer), div('beeson-guide h', this.layer));
    this.marquee = div('beeson-marquee', this.layer);
    this.grips = this.gripSet();
    this.stem = div('beeson-rotor-stem', this.layer);
    this.rotor = div('beeson-rotor', this.layer);
    tappable(this.rotor);
    this.rotor.textContent = '↻';
    this.rotor.title = 'Drag to rotate, held at multiples of 45°, with Shift in steps of 15°';
    this.spoke = div('beeson-guide spoke', this.layer);
    this.handle = div('beeson-handle', this.layer);
    this.handle.textContent = '⠿';
    this.handle.title = 'Drag to move, double-click to put back, arrow keys nudge';
    this.handle.tabIndex = 0;
    this.handle.setAttribute('role', 'button');
    this.handle.setAttribute('aria-label', 'Move the text element: the arrow keys nudge it, Enter puts it back');
    this.readout = div('beeson-offset', this.layer);
  }

  // a button of the column left of a frame, pressed with a click, a tap, Enter, or Space. a press on
  // it does not reach the canvas, and it does not take the focus from a text
  private button(className: string, act: () => void): HTMLDivElement {
    const b = div(className, this.layer);
    b.tabIndex = 0;
    b.setAttribute('role', 'button');
    b.addEventListener('pointerdown', (ev) => ev.preventDefault());
    b.addEventListener('click', act);
    b.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      act();
    });
    return b;
  }

  private padlock(): HTMLDivElement {
    const n = this.locks.length;
    const b = this.button('beeson-lock', () => {
      const els = this.lockTargets[n];
      if (!els?.length) return;
      lockEls(this.app, els, !els.every((el) => el.hasAttribute('data-locked'))).catch((e) => this.app.fail(e));
    });
    this.locks.push(b);
    return b;
  }

  // the box of the column of buttons of el, while el is framed
  columnOf(el: Element): Box | null {
    return this.columns.get(el) ?? null;
  }

  private gripSet(): Record<Handle, HTMLDivElement> {
    const n = this.gripSets.length;
    const set = Object.fromEntries(HANDLES.map((h) => {
      const g = div('beeson-grip', this.layer);
      tappable(g);
      // square on a Mac, as in PowerPoint and Keynote for the Mac, and round as in PowerPoint for Windows
      g.classList.toggle('square', this.app.platform === 'mac');
      g.dataset.handle = h;
      g.dataset.member = String(n);
      return [h, g];
    })) as Record<Handle, HTMLDivElement>;
    this.gripSets.push(set);
    return set;
  }

  // the frame of a group without the inset that it is drawn with around a caption
  groupBox(): Box | null {
    return this.reach;
  }

  groupTurn(): number {
    return this.groupDeg;
  }

  // the members of the group that grip resizes, its frame without the inset, and its angle
  groupAt(grip: Element): FramedGroup | null {
    return this.groups[Number((grip as HTMLElement).dataset.member)] ?? null;
  }

  // the selected element that grip resizes
  memberOf(grip: Element): Element | null {
    return this.members[Number((grip as HTMLElement).dataset.member)] ?? null;
  }

  // the element that the handle of a text element is shown at: the one dragged, under the pointer, or
  // being edited, else the one selected
  current(): Element | null {
    const active = document.activeElement instanceof Element ? document.activeElement : null;
    const editing = active?.closest(HOST) ?? null;
    return view.moving?.[0] ?? view.hover ?? movableOf(this.app, editing) ?? this.app.selection.only();
  }

  // the resize handles of a selected element, drawn on each element of a multiple selection as in
  // Keynote and PowerPoint: live on an image, a video, a QR code, a viewer, a figure that holds one
  // of them, and a text element, whose grips set its width, none on another figure, and 'locked' on a
  // locked element, whose grips are not drawn
  gripsOf(el: Element | null): 'live' | 'locked' | null {
    if (!el || !(this.app.selection.elements().includes(el) || el === this.caretElement())) return null;
    if (el.hasAttribute('data-locked')) return 'locked';
    return sizedOf(el).length || el.matches('.backdrop') ? 'live' : null;
  }

  // whether the selected el is dragged by the handle, i.e. a text element, also while it is locked
  // and the handle is hidden, so that its padlock keeps its row through a lock
  private handles(el: Element): boolean {
    return !(el.matches(BY_ITSELF) && !el.matches('tycho-viewer')) && !((sizedOf(el).length || el.matches('.backdrop')) && !isTextSized(el));
  }

  // the text element of the caret while nothing is selected as an object, framed with its grips as a text
  // box being typed into is in Keynote and PowerPoint
  caretElement(): Element | null {
    if (this.app.selection.elements().length) return null;
    const active = document.activeElement instanceof Element ? document.activeElement : null;
    const el = movableOf(this.app, active?.closest(HOST) ?? null);
    return el && sizedOf(el).length ? el : null;
  }

  draw(): void {
    const app = this.app;
    const v = app.stage?.viewport;
    if (v) this.layer.style.clipPath = `inset(${v.top}px ${innerWidth - v.right}px ${innerHeight - v.bottom}px ${v.left}px)`;
    if (view.hover && !view.hover.isConnected) view.hover = null;
    const selected = app.selection.elements().filter((el) => el.isConnected);
    // a shape keeps its frame while the caret is in its words, as in Keynote
    const words = document.activeElement?.closest('.reveal .slides section .shape [contenteditable="true"]')?.closest('.shape');
    if (!selected.length && words) selected.push(words);
    const caret = selected.length ? null : this.caretElement();
    if (caret) selected.push(caret);
    const scale = frameOf(app).scale;
    const orients = selected.map((el) => {
      const o = orientOf(el, scale);
      return { ...o, box: grow(o.box, growOf(el)) };
    });
    const boxes = orients.map((o) => o.box);
    while (this.frames.length < boxes.length) this.frames.push(div('beeson-frame selected', this.layer));
    this.frames.forEach((f, i) => {
      if (!boxes[i]) {
        f.hidden = true;
        return;
      }
      place(f, boxes[i]);
      f.style.rotate = orients[i].deg ? `${orients[i].deg}deg` : '';
      f.classList.toggle('locked', objectsOf(app, [selected[i]]).every((el) => el.hasAttribute('data-locked')));
    });
    // a whole group is drawn as one element, with one frame around its members, as in Keynote and
    // PowerPoint. in another multiple selection, each member is drawn with its own frame and grips,
    // without a frame around all of them, as in both apps
    const id = selected.length > 1 ? groupOf(selected[0]) : null;
    const grouped = !!id && selected.every((el) => groupOf(el) === id);
    this.group = this.reach = null;
    this.groupDeg = 0;
    // a group being turned is framed at its frame at the start of the turn, turned with it, and
    // another group at its frame turned by the angle of its first member, as the field Angle gives it
    const turn = grouped ? view.turn : null;
    if (boxes.length > 1 && grouped) {
      this.groupDeg = turn ? turn.deg : (turnersOf(app, selected)?.[0].angle ?? 0);
      this.reach = turn?.box ?? groupFrame(selected, this.groupDeg);
      this.group = selected.some((el) => captionsOf(el).length) ? grow(this.reach, INSET) : this.reach;
      place(this.union, this.group);
      this.union.classList.toggle('locked', selected.some((el) => el.hasAttribute('data-locked')));
      this.union.style.rotate = this.groupDeg ? `${this.groupDeg}deg` : '';
      for (const f of this.frames) f.hidden = true;
    } else this.union.hidden = true;
    // a group selected with other objects is drawn as one frame too, with its grips, in place of
    // the frames of its members, as each selected object keeps its handles in Keynote and PowerPoint
    const drawn = new Map<Element, FramedGroup & { box: Box }>();
    if (!this.group && boxes.length > 1) {
      const ids = new Map<string, Element[]>();
      for (const el of selected) {
        const g = groupOf(el);
        if (g) ids.set(g, [...(ids.get(g) ?? []), el]);
      }
      for (const els of ids.values()) {
        if (els.length < 2) continue;
        const deg = turnersOf(app, els)?.[0].angle ?? 0;
        const reach = groupFrame(els, deg);
        const o = { box: els.some((el) => captionsOf(el).length) ? grow(reach, INSET) : reach, deg, reach, els };
        for (const el of els) drawn.set(el, o);
      }
    }
    const shown = [...new Set(drawn.values())];
    while (this.unions.length < shown.length) this.unions.push(div('beeson-frame union group', this.layer));
    this.unions.forEach((u, n) => {
      if (!shown[n]) {
        u.hidden = true;
        return;
      }
      place(u, shown[n].box);
      u.classList.toggle('locked', shown[n].els.some((el) => el.hasAttribute('data-locked')));
      u.style.rotate = shown[n].deg ? `${shown[n].deg}deg` : '';
    });
    selected.forEach((el, i) => {
      if (drawn.has(el)) this.frames[i].hidden = true;
    });
    const held = view.moving ? view.held : null;
    const turning = !!held && held === this.rotor;
    if (turning) for (const f of [...this.frames, this.union, ...this.unions]) f.hidden = true;
    const scope = scopeOf();
    const inside = scope.length && selected.length ? membersOf(app, scope[scope.length - 1]).filter((el) => el.getClientRects().length) : [];
    this.entered.hidden = !inside.length;
    if (inside.length) place(this.entered, groupFrame(inside, 0));
    const host = app.hostOf(document.activeElement);
    const typed = host?.closest('.reveal .slides') && !selected.some((el) => el.contains(host)) ? host : null;
    this.caret.hidden = !typed;
    if (typed) place(this.caret, grow(typed.getBoundingClientRect(), 6));

    const only = app.selection.only();
    // a set of grips for each element with grips, and one for each group, at its frame
    const gripped: { el: Element; grips: 'live' | 'locked'; box: Box; deg: number; group: FramedGroup | null }[] = [];
    const lockOf = (els: Element[]) => (els.some((el) => el.hasAttribute('data-locked')) ? 'locked' as const : 'live' as const);
    const still = !turn && !(view.moving && !view.resizing);
    if (still && this.group) gripped.push({ el: selected[0], grips: lockOf(selected), box: this.group, deg: this.groupDeg, group: { els: selected, reach: this.reach as Box, deg: this.groupDeg } });
    else if (still) selected.forEach((el, i) => {
      const o = drawn.get(el);
      const grips = o ? (o.els[0] === el ? lockOf(o.els) : null) : this.gripsOf(el);
      if (grips) gripped.push({ el, grips, box: o ? o.box : boxes[i], deg: o ? o.deg : orients[i].deg, group: o ?? null });
    });
    while (this.gripSets.length < gripped.length) this.gripSet();
    this.members = this.gripSets.map((_, n) => gripped[n]?.el ?? null);
    this.groups = this.gripSets.map((_, n) => gripped[n]?.group ?? null);
    this.gripSets.forEach((set, n) => {
      const m = gripped[n];
      // a text element keeps the height of its wrapped text
      const level = !!m && !m.group && isTextSized(m.el);
      for (const h of HANDLES) {
        const g = set[h];
        if (m?.group) g.dataset.group = '1';
        else delete g.dataset.group;
        if (!m || (level && (h === 'n' || h === 's'))) {
          g.hidden = true;
          continue;
        }
        const b = m.box, deg = m.deg;
        const at = turned(b, deg, h.includes('w') ? b.left : h.includes('e') ? b.left + b.width : b.left + b.width / 2, h.includes('n') ? b.top : h.includes('s') ? b.top + b.height : b.top + b.height / 2);
        g.hidden = turning || m.grips === 'locked';
        // the cursor of a grip on a turned frame points along its turned direction, to the nearest
        // eighth of a turn, while it is not held
        const cursor = deg ? CURSORS[Math.round((((HANDLES.indexOf(h) * 45 + 225 + deg) % 360) + 360) % 360 / 45) % 4] : '';
        Object.assign(g.style, { left: `${at.x}px`, top: `${at.y}px`, ...(held ? {} : { cursor }) });
      }
    });
    // the rotate handle, also while it is dragged, on one element that is turned, i.e. not locked
    // and not a table or a range of its cells, on a group whose every member is turned, or on the
    // first frame of a multiple selection of such elements outside any group
    const rotating = document.documentElement.classList.contains('beeson-rotating');
    const turnGroup = !!this.group && (!!turn || !!turnersOf(app, selected));
    const apart = !this.group && boxes.length > 1 && !!apartOf(app, selected);
    const turnable = (turnGroup || apart || (!!only && boxes.length === 1 && turns(only as Element) && !only.matches('.backdrop'))) && (!view.moving || rotating);
    this.rotor.hidden = !turnable || (!!held && held !== this.rotor);
    this.stem.hidden = !turnable || !!held;
    if (turnable) {
      const first = drawn.get(selected[0]) ?? orients[0];
      const b = turnGroup ? (this.group as Box) : first.box, deg = turnGroup ? this.groupDeg : first.deg;
      const cx = b.left + b.width / 2;
      // above the middle of the top edge of the frame, as in PowerPoint, on a stem cut short where
      // the full stem would put the handle over the text of another text element. the handle is drawn over
      // the slide, hence it is pressed also where it covers a text
      const knobAt = (d: number) => turned(b, deg, cx, b.top - d);
      if (!rotating) {
        const lines = this.linesBesides(turnGroup || apart ? selected : [only as Element]);
        const free = (d: number) => {
          const k = knobAt(d);
          return !lines.some((r) => k.x + KNOB > r.left && k.x - KNOB < r.right && k.y + KNOB > r.top && k.y - KNOB < r.bottom);
        };
        let d = ROTOR;
        while (d > SHORT && !free(d)) d--;
        this.rotorAt = free(d) ? d : ROTOR;
      }
      const knob = knobAt(this.rotorAt);
      Object.assign(this.rotor.style, { left: `${knob.x}px`, top: `${knob.y}px` });
      // the stem runs up from the edge of the frame to the handle, turned with the frame
      const edge = turned(b, deg, cx, b.top);
      Object.assign(this.stem.style, { left: `${edge.x}px`, top: `${edge.y}px`, height: `${this.rotorAt - KNOB}px`, rotate: `${deg + 180}deg` });
    }

    // a padlock for each frame, i.e. for each selected element and each whole group, in a column
    // left of the upper left corner of the frame, under the handle of a text element. it is not
    // drawn in a drag, a resize, or a turn
    const columns: { els: Element[]; at: Box; handled: boolean }[] = [];
    const bounds = (els: Element[]) => {
      const rs = els.map((el) => el.getBoundingClientRect());
      const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top));
      return { left, top, width: Math.max(...rs.map((r) => r.right)) - left, height: Math.max(...rs.map((r) => r.bottom)) - top };
    };
    if (!view.moving && !turn) {
      if (this.group) columns.push({ els: selected, at: bounds(selected), handled: false });
      else {
        for (const o of shown) columns.push({ els: o.els, at: bounds(o.els), handled: false });
        for (const el of selected) if (!drawn.has(el)) columns.push({ els: [el], at: bounds([el]), handled: this.handles(el) });
      }
    }
    while (this.locks.length < columns.length) this.padlock();
    this.lockTargets = columns.map((f) => objectsOf(app, f.els));
    this.columns = new Map();
    const buttons: Box[] = [];
    this.locks.forEach((b, n) => {
      const f = columns[n];
      b.hidden = !f;
      if (!f) return;
      const closed = this.lockTargets[n].every((el) => el.hasAttribute('data-locked'));
      if (b.dataset.closed !== String(closed)) {
        b.dataset.closed = String(closed);
        b.classList.toggle('closed', closed);
        b.title = closed ? 'Unlock' : 'Lock';
        b.setAttribute('aria-label', b.title);
        b.replaceChildren(icon(closed ? 'lock' : 'unlock', 16));
      }
      const bar = f.els.length === 1 && f.els[0].localName === 'table' ? ROW_BAR : 0;
      const at = { left: f.at.left - 6 - HANDLE_GAP - HANDLE - bar, top: f.at.top - 6 + (f.handled ? ROW : 0), width: HANDLE, height: HANDLE };
      Object.assign(b.style, { left: `${at.left}px`, top: `${at.top}px` });
      buttons.push(at);
      const column = { left: at.left, top: f.at.top - 6, width: HANDLE, height: at.top + HANDLE - (f.at.top - 6) };
      for (const el of f.els) this.columns.set(el, column);
    });

    // the canvas is given room for every grip, the rotate handle, and the buttons past the slide,
    // kept through a gesture so that the slide does not move under the pointer
    if (!view.moving && app.stage) {
      const points = gripped.flatMap((m) => [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => turned(m.box, m.deg, m.box.left + u * m.box.width, m.box.top + v * m.box.height)));
      for (const b of buttons) points.push({ x: b.left, y: b.top }, { x: b.left + b.width, y: b.top + b.height });
      if (!this.rotor.hidden) points.push({ x: parseFloat(this.rotor.style.left), y: parseFloat(this.rotor.style.top) });
      const inSlide = points.map((p) => app.stage.toSlide(p));
      app.stage.setReach(inSlide.length ? { left: Math.min(...inSlide.map((p) => p.x)), top: Math.min(...inSlide.map((p) => p.y)), right: Math.max(...inSlide.map((p) => p.x)), bottom: Math.max(...inSlide.map((p) => p.y)) } : null);
    }
    const hot = this.current();
    const framed = hot && selected.includes(hot);
    this.hoverFrame.hidden = !hot || !!framed || !!view.moving;
    if (hot && !framed && !view.moving) place(this.hoverFrame, grow(frameRect(hot), 6));
    // a figure is dragged by itself, as in Keynote, and a viewer, which a drag turns, and a text
    // text element, whose text a press edits, by its handle. a locked element does not have a handle
    this.handle.hidden = !hot || hot.hasAttribute('data-locked') || (hot.matches(BY_ITSELF) && !hot.matches('tycho-viewer')) || (!!this.gripsOf(hot) && !isTextSized(hot));
    if (!this.handle.hidden && hot) {
      // left of the frame, 6 px outside the text, at its top edge, clear of the grips at its corners
      const r = hot.getBoundingClientRect();
      const bar = hot.localName === 'table' ? ROW_BAR : 0;
      Object.assign(this.handle.style, { left: `${r.left - 6 - HANDLE_GAP - HANDLE - bar}px`, top: `${r.top - 6}px` });
    }
    this.drawGuides();
    // the angle guide runs along the turned vertical axis, as the stem of the rotate handle
    const spoke = view.spoke;
    this.spoke.hidden = !spoke;
    if (spoke) Object.assign(this.spoke.style, { left: `${spoke.x}px`, top: `${spoke.y - spoke.reach}px`, height: `${2 * spoke.reach}px`, rotate: `${spoke.deg}deg` });
    if (view.marquee) place(this.marquee, view.marquee);
    else this.marquee.hidden = true;
    const out = view.readout;
    this.readout.hidden = !out;
    if (out) {
      this.readout.textContent = out.text;
      this.readout.classList.toggle('frame', out.at === 'frame');
      Object.assign(this.readout.style, { left: `${out.x}px`, top: `${out.y}px` });
      // the readout is kept inside the visible canvas, clear of the rulers and the panes. at the
      // pointer it is turned to the other side of the pointer where it would cross an edge
      const v = this.app.stage.viewport, r = this.readout.getBoundingClientRect();
      const pointer = out.at === 'pointer';
      let dx = pointer && r.right > v.right ? -(r.width + 28) : 0, dy = pointer && r.bottom > v.bottom ? -(r.height + 36) : 0;
      dx += Math.max(v.left - (r.left + dx), Math.min(0, v.right - (r.right + dx)));
      dy += Math.max(v.top - (r.top + dy), Math.min(0, v.bottom - (r.bottom + dy)));
      if (dx || dy) Object.assign(this.readout.style, { left: `${out.x + dx}px`, top: `${out.y + dy}px` });
    }
  }

  // the boxes of the lines of text of the text elements of the current slide outside els, on the screen
  private linesBesides(els: Element[]): DOMRect[] {
    const slide = this.app.current();
    if (!slide) return [];
    const out: DOMRect[] = [];
    const range = document.createRange();
    for (const textEl of slide.querySelectorAll(WORDS)) {
      if (els.some((el) => el.contains(textEl) || textEl.contains(el)) || textEl.closest('aside.notes')) continue;
      range.selectNodeContents(textEl);
      for (const r of range.getClientRects()) if (r.width && r.height) out.push(r);
    }
    return out;
  }

  private drawGuides(): void {
    const f = frameOf(this.app);
    const lines = { v: view.guides.filter((g) => g.axis === 'x'), h: view.guides.filter((g) => g.axis === 'y') };
    const used = { v: 0, h: 0 };
    const take = (cls: 'v' | 'h') => {
      const pool = this.guides.filter((d) => d.classList.contains(cls));
      const d = pool[used[cls]++] ?? div(`beeson-guide ${cls}`, this.layer);
      if (!this.guides.includes(d)) this.guides.push(d);
      return d;
    };
    for (const g of lines.v) place(take('v'), { ...toScreen(f, { left: g.at, top: g.from, width: 0, height: g.to - g.from }), width: 1 });
    for (const g of lines.h) place(take('h'), { ...toScreen(f, { left: g.from, top: g.at, width: g.to - g.from, height: 0 }), height: 1 });
    for (const cls of ['v', 'h'] as const) this.guides.filter((d) => d.classList.contains(cls)).slice(used[cls]).forEach((d) => (d.hidden = true));
    let n = 0;
    for (const s of view.spacing) {
      for (const gap of s.gaps) {
        const d = this.gaps[n] ?? div('beeson-gap', this.layer);
        if (!this.gaps.includes(d)) this.gaps.push(d);
        n++;
        d.className = `beeson-gap ${s.axis === 'x' ? 'h' : 'v'}`;
        const b = s.axis === 'x' ? toScreen(f, { left: gap.from, top: gap.at, width: gap.to - gap.from, height: 0 }) : toScreen(f, { left: gap.at, top: gap.from, width: 0, height: gap.to - gap.from });
        place(d, s.axis === 'x' ? { ...b, height: 7 } : { ...b, width: 7 });
        // a double arrow between the two edges, as PowerPoint marks equal gaps
        const len = Math.round(s.axis === 'x' ? b.width : b.height);
        const key = `${s.axis}${len}`;
        if (d.dataset.mark !== key) {
          d.dataset.mark = key;
          const h = Math.round(Math.min(6, len / 3) * 10) / 10;
          const pt = (u: number, v: number) => (s.axis === 'x' ? `${u},${v}` : `${v},${u}`);
          const [w, ht] = s.axis === 'x' ? [len, 7] : [7, len];
          d.innerHTML = `<svg width="${w}" height="${ht}" aria-hidden="true"><path d="M${pt(0, 3.5)}L${pt(len, 3.5)}" stroke="currentColor"/><path d="M${pt(0, 3.5)}L${pt(h, 0.5)}L${pt(h, 6.5)}ZM${pt(len, 3.5)}L${pt(len - h, 0.5)}L${pt(len - h, 6.5)}Z" fill="currentColor"/></svg>`;
        }
      }
    }
    this.gaps.slice(n).forEach((d) => (d.hidden = true));
  }
}

let installed: Frames | null = null;

// the overlay, which canvas/drag.ts draws into
export function overlay(): Frames {
  if (!installed) throw new Error('the frames are not installed');
  return installed;
}

export function install(app: App): void {
  const frames = new Frames(app);
  installed = frames;
  document.body.append(frames.layer);
  app.selection.listen(() => {
    if (!view.moving) view.readout = null;
    frames.draw();
  });
  app.onRefresh(['content', 'selection', 'slide', 'structure', 'layout'], () => frames.draw());
  app.listen('resize', () => frames.draw());
}
