// a toast: a short message above the status bar for SHOWN ms, read out by a screen reader, with an
// optional button. one toast is shown at a time, and the others wait in a queue. the region is kept
// in the page between toasts, since a screen reader reads a change of a region that it knows

import { make, style } from './dom.ts';

const CSS = `
.beeson-session-toast { position: fixed; left: 50%; bottom: 40px; z-index: 2147483000; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; box-sizing: border-box; max-width: calc(100vw - 32px); padding: 8px 8px 8px 14px; border: 1px solid var(--ed-menu-line); border-radius: 8px; background: var(--ed-menu); color: var(--ed-text); font: 13px/1.35 var(--ed-font, system-ui, sans-serif); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.beeson-session-toast:empty { display: none; }
.beeson-session-toast > span { min-width: 0; overflow-wrap: anywhere; }
.beeson-session-toast button { flex: none; min-height: 32px; padding: 0 12px; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); font: inherit; }
.beeson-session-toast button:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
`;

export const SHOWN = 6000;

export type ToastButton = { label: string; run(): void };

const queue: { line: (string | Node)[]; button?: ToastButton }[] = [];
let region: HTMLElement | null = null;
let timer = 0;

// text is a string, or a line of strings and nodes, e.g. with a name in a bdi element
export function toast(text: string | (string | Node)[], button?: ToastButton): void {
  queue.push({ line: typeof text === 'string' ? [text] : text, button });
  if (!timer) next();
}

function next(): void {
  clearTimeout(timer);
  timer = 0;
  if (!region) {
    style('toast', CSS);
    region = make('div', 'beeson-session-toast');
    region.setAttribute('role', 'status');
    document.body.append(region);
  }
  const shown = queue.shift();
  if (!shown) {
    region.replaceChildren();
    return;
  }
  const span = make('span');
  span.append(...shown.line);
  const parts: Node[] = [span];
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
  region.replaceChildren(...parts);
  timer = window.setTimeout(next, SHOWN);
}
