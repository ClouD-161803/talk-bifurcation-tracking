// what theme/session.js reads of the editor to draw the presence of other people: the elements at
// offsets of the source, the boxes of elements and carets in fractions of the slide, the caret of
// this page, and the element under the pointer. theme/session.js may not import a stateful module
// of the editor, hence it reaches these functions through its Handover, filled in load.ts

import type { App } from '../app.ts';
import { growOf, orientOf, view } from '../canvas/frames.ts';
import { frameOf } from '../canvas/hit.ts';
import { mathLookup, type MathLookup } from '../math.ts';

// a box in fractions of the width and the height of the slide, unturned about its center, the
// angle deg that it is turned by in degrees, and the px grow that the frame of frames.ts stands
// off it
export type Shape = { x: number; y: number; w: number; h: number; deg: number; grow: number };

export type PresenceHooks = {
  // the text that offsetOf of the port refers to, i.e. of the last open or apply
  source(): string | null;
  // the element whose start tag is at each offset of source(), or null
  elementsAt(offsets: number[]): (Element | null)[];
  // the shapes of els and of the caret bars, read in one pass of layout. at is an offset into the
  // text of the text element el, in which each formula counts as its TeX and each <br> as one
  // character
  shapes(els: Element[], carets: { el: Element; at: number }[]): { els: (Shape | null)[]; carets: (Shape | null)[] };
  // the offset of the caret of this page in host, or null when the caret is not in host
  caretIn(host: Element): number | null;
  // the element under the pointer, which frames.ts draws the hover frame on
  hovered(): Element | null;
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
      const math = carets.length ? mathLookup() : null;
      return {
        els: els.map((el) => {
          if (!el.isConnected) return null;
          const o = orientOf(el, f.scale);
          return o.box.width || o.box.height ? shape(o.box, o.deg, growOf(el)) : null;
        }),
        carets: carets.map(({ el, at }) => {
          const r = el.isConnected ? caretRect(el, at, math!) : null;
          return r ? shape({ left: r.left, top: r.top, width: 0, height: r.height }, 0, 0) : null;
        }),
      };
    },
    caretIn: (host) => caretAt(host, mathLookup()),
    hovered: () => view.hover,
  };
}

// the offset of the caret of this page into the text of host, or null when it is not in host. a
// formula counts as its TeX, as in caret.ts, and a <br> as one character, unlike in caret.ts,
// since the start of a line after it is another place than the end of the line before
function caretAt(host: Element, math: MathLookup): number | null {
  const sel = getSelection();
  const node = sel?.rangeCount ? sel.focusNode : null;
  if (!node || !host.contains(node)) return null;
  const at = sel!.focusOffset;
  let count = 0;
  let offset = -1;
  const visit = (n: Node): void => {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n === node) offset = count + at;
      count += (n as Text).length;
      return;
    }
    if (!(n instanceof Element)) return;
    if (n.localName === 'br') {
      count++;
      return;
    }
    const info = n.localName === 'mjx-container' ? math(n) : null;
    if (info) {
      count += info.open.length + info.tex.length + info.close.length;
      if (n.contains(node)) offset = count;
      return;
    }
    n.childNodes.forEach((c, i) => {
      if (n === node && i === at) offset = count;
      visit(c);
    });
    if (n === node && at >= n.childNodes.length) offset = count;
  };
  visit(host);
  return offset < 0 ? null : offset;
}

// the box of a collapsed range at offset into the text of host, as caretAt counts it, put after a
// formula that offset falls inside, as putCaret of caret.ts puts the caret. an empty line has no
// box, and the first line of host stands in for it
function caretRect(host: Element, offset: number, math: MathLookup): DOMRect | null {
  let left = Math.max(0, offset);
  let spot: [Node, number] | null = null;
  const visit = (n: Node): boolean => {
    if (n.nodeType === Node.TEXT_NODE) {
      const length = (n as Text).length;
      if (left <= length) {
        spot = [n, left];
        return true;
      }
      left -= length;
      return false;
    }
    if (!(n instanceof Element)) return false;
    if (n.localName === 'br') {
      if (left === 0) {
        spot = [n.parentNode!, [...n.parentNode!.childNodes].indexOf(n)];
        return true;
      }
      left--;
      return false;
    }
    const info = n.localName === 'mjx-container' ? math(n) : null;
    if (info) {
      const length = info.open.length + info.tex.length + info.close.length;
      if (left < length) {
        spot = [n.parentNode!, [...n.parentNode!.childNodes].indexOf(n) + 1];
        return true;
      }
      left -= length;
      return false;
    }
    for (const c of n.childNodes) if (visit(c)) return true;
    return false;
  };
  visit(host);
  const range = document.createRange();
  if (spot) range.setStart(spot[0], spot[1]);
  else {
    range.selectNodeContents(host);
    range.collapse(false);
  }
  const rects = range.getClientRects();
  if (rects.length) return rects[rects.length - 1];
  const box = host.getBoundingClientRect();
  if (!box.width && !box.height) return null;
  const line = parseFloat(getComputedStyle(host).lineHeight) || box.height;
  return new DOMRect(box.left, box.top, 0, Math.min(line, box.height || line));
}
