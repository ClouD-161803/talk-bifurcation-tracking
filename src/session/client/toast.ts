// a toast: a short message above the status bar for SHOWN ms, read out by a screen reader, with an
// optional button and a button Close. one toast is shown at a time, and the others wait in a queue.
// the region is kept in the page between toasts, since a screen reader reads a change of a region
// that it knows. a toast waits for the close of a modal dialog, which makes the region inert, and
// its time starts then

import { make, style } from './dom.ts';

const CSS = `
.beeson-session-toast { position: fixed; left: 50%; bottom: 40px; z-index: 2147483000; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; box-sizing: border-box; max-width: calc(100vw - 32px); padding: 8px 8px 8px 14px; border: 1px solid var(--ed-menu-line); border-radius: 8px; background: var(--ed-menu); color: var(--ed-text); font: 13px/1.35 var(--ed-font, system-ui, sans-serif); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.beeson-session-toast:empty { display: none; }
.beeson-session-toast > span { min-width: 0; overflow-wrap: anywhere; }
.beeson-session-toast button { flex: none; min-height: 32px; padding: 0 12px; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); font: inherit; }
.beeson-session-toast button.close { display: inline-flex; align-items: center; justify-content: center; width: 32px; margin-left: -8px; padding: 0; border-color: transparent; background: transparent; color: var(--ed-muted); }
.beeson-session-toast button:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
`;

export const SHOWN = 6000;

// the time in ms that a toast is shown, which a test may set
export const timing = { shown: SHOWN };

export type ToastButton = { label: string; run(): void };

// toasts of one key that wait while MAX toasts already wait are joined into the toast of many(n),
// e.g. 4 new comments
export type ToastKind = { key: string; many(n: number): { text: string; button?: ToastButton } };

// a string, or a line of strings and nodes, e.g. with a name in a bdi element
export type ToastText = string | (string | Node)[];

const MAX = 3;

const queue: { text: ToastText; button?: ToastButton; kind?: ToastKind; n: number }[] = [];
let region: HTMLElement | null = null;
let timer = 0;
let waiting = false;

export function toast(text: ToastText, button?: ToastButton, kind?: ToastKind): void {
  const same = kind && queue.length >= MAX ? queue.filter((q) => q.kind?.key === kind.key) : [];
  if (kind && same.length) {
    const n = same.reduce((sum, q) => sum + q.n, 1);
    for (const q of same) queue.splice(queue.indexOf(q), 1);
    queue.push({ ...kind.many(n), kind, n });
  } else queue.push({ text, button, kind, n: 1 });
  if (!timer && !waiting) next();
}

// the empty region put in the page, ahead of its first toast
export function mountToasts(): void {
  if (region) return;
  style('toast', CSS);
  region = make('div', 'beeson-session-toast');
  region.setAttribute('role', 'status');
  document.body.append(region);
}

const CLOSE = 'M4 4l8 8M12 4l-8 8';

function next(): void {
  clearTimeout(timer);
  timer = 0;
  if (!region) {
    // a region made with its text is not read out, hence the text follows a task later
    mountToasts();
    timer = window.setTimeout(next, 0);
    return;
  }
  const modal = queue.length ? document.querySelector('dialog:modal') : null;
  if (modal) {
    waiting = true;
    region.replaceChildren();
    modal.addEventListener('close', () => {
      waiting = false;
      next();
    }, { once: true });
    return;
  }
  const shown = queue.shift();
  if (!shown) {
    region.replaceChildren();
    return;
  }
  const text = make('span');
  text.append(...(typeof shown.text === 'string' ? [shown.text] : shown.text));
  const parts: Node[] = [text];
  if (shown.button) {
    const { label, run } = shown.button;
    const b = make('button', '', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      next();
      run();
    });
    parts.push(b);
  }
  const close = make('button', 'close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.title = 'Close';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CLOSE);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  close.append(svg);
  close.addEventListener('click', () => next());
  parts.push(close);
  region.replaceChildren(...parts);
  timer = window.setTimeout(next, timing.shown);
}
