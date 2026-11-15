// a short message beside an element, e.g. why a text element cannot be edited now, hidden after
// SHOWN ms. one bubble is shown at a time, and a new one takes the place of the last

import { make, style } from './dom.ts';

const SHOWN = 4000;

const CSS = `
.beeson-bubble { position: fixed; z-index: 1000; box-sizing: border-box; max-width: min(320px, calc(100vw - 32px)); padding: 8px 12px; border-radius: 8px; background: var(--ed-panel, #2c2c2e); color: var(--ed-text, #f5f5f7); border: 1px solid var(--ed-line, rgba(255, 255, 255, 0.16)); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28); font: 13px/1.35 system-ui, sans-serif; pointer-events: none; }
`;

let shown: { el: HTMLElement; timer: number } | null = null;

export function bubble(near: Element | null, text: string | (string | Node)[]): void {
  style('bubble', CSS);
  if (shown) {
    clearTimeout(shown.timer);
    shown.el.remove();
  }
  const el = make('div', 'beeson-bubble');
  el.append(...(typeof text === 'string' ? [text] : text));
  el.setAttribute('role', 'status');
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
