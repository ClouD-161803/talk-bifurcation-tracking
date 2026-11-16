// what theme/session.js reads of the editor to draw the presence of other people: the elements at
// offsets of the source, the boxes of elements and carets in fractions of the slide, the selection of
// this page, and the element under the pointer. theme/session.js may not import a stateful module
// of the editor, hence it reaches these functions through its Handover, filled in load.ts

import type { App } from '../app.ts';
import { growOf, orientOf, view } from '../canvas/frames.ts';
import { frameOf, holdsSeveral, mediaIn } from '../canvas/hit.ts';
import { mathIn, type MathLookup } from '../math.ts';
import { caretOf, pointIn, textIn } from './caret.ts';

// a box in fractions of the width and the height of the slide, unturned about its center, the
// angle deg that it is turned by in degrees, and the px grow that the frame of frames.ts stands
// off it
export type Shape = { x: number; y: number; w: number; h: number; deg: number; grow: number };

export type Caret = { el: Element; at: number; from: number; pre: string; post: string };

// the characters on each side of a caret that are sent with it
const NEAR = 12;

export type PresenceHooks = {
  // the text that offsetOf of the port refers to, i.e. of the last open or apply
  source(): string | null;
  // the element whose start tag is at each offset of source(), or null
  elementsAt(offsets: number[]): (Element | null)[];
  // the shapes of els and of the caret bars, read in one pass of layout. at and from are the focus
  // and the anchor in the text of the text element el, in which each formula counts as its TeX and
  // each <br> as one character, and pre and post are the text on each side of at when it was read,
  // by which at is found after edits
  shapes(els: Element[], carets: Caret[]): { els: (Shape | null)[]; carets: (Shape | null)[] };
  // the selection of this page in host, or null when its focus is not in host
  selectionIn(host: Element): Omit<Caret, 'el'> | null;
  // the element under the pointer, which frames.ts draws the hover frame on
  hovered(): Element | null;
  // the object one level inside container under target, as a second click selects it, when
  // container holds several objects, e.g. a figure of a plate, or null
  childIn(container: Element, target: Element): Element | null;
};

export function hooks(app: App): PresenceHooks {
  return {
    source: () => app.source?.text ?? null,
    elementsAt(offsets) {
      const at = new Map<number, Element>();
      const pairing = app.pairing;
      if (pairing) for (const map of [pairing.elements, pairing.inner]) for (const [live, s] of map) if (s.source === app.source && s.open && live.isConnected) at.set(s.open.start, live);
      return offsets.map((o) => at.get(o) ?? null);
    },
    shapes(els, carets) {
      const slides = app.slides() as HTMLElement | null;
      const W = slides?.offsetWidth ?? 0, H = slides?.offsetHeight ?? 0;
      if (!slides || !W || !H) return { els: els.map(() => null), carets: carets.map(() => null) };
      const f = frameOf(app);
      const shape = (b: { left: number; top: number; width: number; height: number }, deg: number, grow: number): Shape => ({
        x: (b.left - f.left) / f.scale / W,
        y: (b.top - f.top) / f.scale / H,
        w: b.width / f.scale / W,
        h: b.height / f.scale / H,
        deg,
        grow,
      });
      return {
        els: els.map((el) => {
          if (!el.isConnected) return null;
          const o = orientOf(el, f.scale);
          return o.box.width || o.box.height ? shape(o.box, o.deg, growOf(el)) : null;
        }),
        carets: carets.map(({ el, at, pre, post }) => {
          if (!el.isConnected) return null;
          const math = mathIn(el);
          const focus = locate(textIn(el, math, true), at, pre, post);
          const r = caretRect(el, focus, math);
          return r ? shape({ left: r.left, top: r.top, width: 0, height: r.height }, 0, 0) : null;
        }),
      };
    },
    selectionIn(host) {
      const c = caretOf(host, mathIn(host), true);
      return c && { at: c.offset, from: c.anchor, pre: c.text.slice(Math.max(0, c.offset - NEAR), c.offset), post: c.text.slice(c.offset, c.offset + NEAR) };
    },
    hovered: () => view.hover,
    childIn: (container, target) => (holdsSeveral(container) ? mediaIn(container, target) : null),
  };
}

// the offset in text of a caret read at at with pre before it and post after it: at while they
// surround it, else the nearest place between pre and post, before post, or after pre, else at
// within the text
function locate(text: string, at: number, pre: string, post: string): number {
  if (at >= pre.length && at <= text.length && text.startsWith(pre, at - pre.length) && text.startsWith(post, at)) return at;
  for (const [needle, shift] of [[pre + post, pre.length], [post, 0], [pre, pre.length]] as const) {
    let best = -1;
    if (needle) for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) if (best < 0 || Math.abs(i + shift - at) < Math.abs(best - at)) best = i + shift;
    if (best >= 0) return best;
  }
  return Math.max(0, Math.min(at, text.length));
}

// the box of a collapsed range at offset into the text of host, as selectionIn counts it, put after
// a formula that offset falls inside, as putCaret of caret.ts puts the caret. an empty line has no
// box, and the first line of host stands in for it
function caretRect(host: Element, offset: number, math: MathLookup): DOMRect | null {
  const range = document.createRange();
  range.setStart(...pointIn(host, offset, math, true));
  const rects = range.getClientRects();
  if (rects.length) return rects[rects.length - 1];
  const box = host.getBoundingClientRect();
  if (!box.width && !box.height) return null;
  const line = parseFloat(getComputedStyle(host).lineHeight) || box.height;
  return new DOMRect(box.left, box.top, 0, Math.min(line, box.height || line));
}
