// a short message beside an element, e.g. why a text element cannot be edited now, hidden after
// SHOWN ms. one bubble is shown at a time, and a new one takes the place of the last

import { make, style } from './dom.ts';

const SHOWN = 4000;

const CSS = `
.beeson-bubble { position: fixed; z-index: 1000; box-sizing: border-box; max-width: min(320px, calc(100vw - 32px)); padding: 8px 12px; border-radius: 8px; background: var(--ed-panel, #2c2c2e); color: var(--ed-text, #f5f5f7); border: 1px solid var(--ed-line, rgba(255, 255, 255, 0.16)); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28); font: 13px/1.35 system-ui, sans-serif; pointer-events: none; }
.beeson-bubble-said { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

let shown: { el: HTMLElement; timer: number } | null = null;
let said: HTMLElement | null = null;

// the hidden status region that a screen reader reads each bubble from, made once before the first
// bubble, since a region added together with its text is not read by every screen reader
export function ready(): HTMLElement {
  style('bubble', CSS);
  if (!said?.isConnected) {
    said = make('div', 'beeson-bubble-said');
    said.setAttribute('role', 'status');
    document.body.append(said);
  }
  return said;
}

export function bubble(near: Element | null, text: string | (string | Node)[]): void {
  const region = ready();
  const parts = typeof text === 'string' ? [text] : text;
  const plain = parts.map((p) => (typeof p === 'string' ? p : p.textContent)).join('');
  // a repeated text is changed by a space, so that it is read again
  region.textContent = region.textContent === plain ? `${plain}\u00a0` : plain;
  if (shown) {
    clearTimeout(shown.timer);
    shown.el.remove();
  }
  const el = make('div', 'beeson-bubble');
  el.append(...parts);
  document.body.append(el);
  // under near, or over it when the window has no room below, and inside the window
  const r = near?.isConnected ? near.getBoundingClientRect() : null;
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = r ? r.left : (innerWidth - w) / 2;
  let y = r ? r.bottom + 8 : 72;
  if (r && y + h > innerHeight - 8) y = r.top - h - 8;
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  y = Math.max(8, Math.min(y, innerHeight - h - 8));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  const timer = window.setTimeout(() => {
    el.remove();
    if (shown?.el === el) shown = null;
  }, SHOWN);
  shown = { el, timer };
}
