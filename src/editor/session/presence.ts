import type { App } from '../app.ts';
import { growOf, orientOf, view } from '../canvas/frames.ts';
import { frameOf, holdsSeveral, mediaIn } from '../canvas/hit.ts';
import { mathIn, type MathLookup } from '../math.ts';
import { shownSheet } from '../tex/install.ts';
import { spanTargets } from '../text/flow.ts';
import { caretOf, pointIn, textIn } from './caret.ts';

export type Shape = { x: number; y: number; w: number; h: number; deg: number; grow: number };

export type Caret = { el: Element; at: number; from: number; pre: string; post: string };

const NEAR = 12;

export type PresenceHooks = {
  source(): string | null;
  elementsAt(offsets: number[]): (Element | null)[];
  shapes(els: Element[], carets: Caret[]): { els: (Shape | null)[]; carets: (Shape | null)[]; ranges: (Range | null)[] };
  selectionIn(host: Element): Omit<Caret, 'el'> | null;
  hovered(): Element | null;
  childIn(container: Element, target: Element): Element | null;
  spanned(): Element[];
  sheet(): { which: 'preamble' | 'bibliography'; dialog: HTMLDialogElement } | null;
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
      if (!slides || !W || !H) return { els: els.map(() => null), carets: carets.map(() => null), ranges: carets.map(() => null) };
      const f = frameOf(app);
      const shape = (b: { left: number; top: number; width: number; height: number }, deg: number, grow: number): Shape => ({
        x: (b.left - f.left) / f.scale / W,
        y: (b.top - f.top) / f.scale / H,
        w: b.width / f.scale / W,
        h: b.height / f.scale / H,
        deg,
        grow,
      });
      const ranges: (Range | null)[] = carets.map(() => null);
      return {
        els: els.map((el) => {
          if (!el.isConnected) return null;
          const o = orientOf(el, f.scale);
          return o.box.width || o.box.height ? shape(o.box, o.deg, growOf(el)) : null;
        }),
        carets: carets.map(({ el, at, from, pre, post }, i) => {
          if (!el.isConnected) return null;
          const math = mathIn(el);
          const text = textIn(el, math, true);
          const focus = locate(text, at, pre, post);
          const anchor = Math.max(0, Math.min(text.length, from + focus - at));
          if (anchor !== focus) {
            const range = document.createRange();
            range.setStart(...pointIn(el, Math.min(anchor, focus), math, true));
            range.setEnd(...pointIn(el, Math.max(anchor, focus), math, true));
            ranges[i] = range;
          }
          const r = caretRect(el, focus, math);
          return r ? shape({ left: r.left, top: r.top, width: 0, height: r.height }, 0, 0) : null;
        }),
        ranges,
      };
    },
    selectionIn(host) {
      const c = caretOf(host, mathIn(host), true);
      return c && { at: c.offset, from: c.anchor, pre: c.text.slice(Math.max(0, c.offset - NEAR), c.offset), post: c.text.slice(c.offset, c.offset + NEAR) };
    },
    hovered: () => view.hover,
    childIn: (container, target) => (holdsSeveral(container) ? mediaIn(container, target) : null),
    spanned: () => spanTargets(app).map((t) => t.host),
    sheet: shownSheet,
  };
}

function locate(text: string, at: number, pre: string, post: string): number {
  [text, pre, post] = [text, pre, post].map((s) => s.replaceAll('\u00a0', ' '));
  if (at >= pre.length && at <= text.length && text.startsWith(pre, at - pre.length) && text.startsWith(post, at)) return at;
  for (const [needle, shift] of [[pre + post, pre.length], [post, 0], [pre, pre.length]] as const) {
    let best = -1;
    if (needle) for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) if (best < 0 || Math.abs(i + shift - at) < Math.abs(best - at)) best = i + shift;
    if (best >= 0) return best;
  }
  return Math.max(0, Math.min(at, text.length));
}

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
