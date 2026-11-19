import { make, style } from './dom.ts';

const CSS = `
.beeson-session-toast { position: fixed; left: 50%; bottom: 40px; z-index: 2147483000; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; box-sizing: border-box; width: max-content; max-width: calc(100vw - 32px); padding: 8px 8px 8px 14px; border: 1px solid var(--ed-menu-line); border-radius: 8px; background: var(--ed-menu); color: var(--ed-text); font: 13px/1.35 var(--ed-font, system-ui, sans-serif); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.beeson-session-toast:empty { width: 1px; height: 1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); box-shadow: none; pointer-events: none; }
.beeson-session-toast > span { min-width: 0; overflow-wrap: anywhere; }
.beeson-session-toast button { flex: none; min-height: 32px; padding: 0 12px; border: 1px solid var(--ed-control-line); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); font: inherit; }
.beeson-session-toast button.close { display: inline-flex; align-items: center; justify-content: center; width: 32px; margin-left: -8px; padding: 0; border-color: transparent; background: transparent; color: var(--ed-muted); }
.beeson-session-toast button:focus-visible { outline: 2px solid var(--ed-focus); outline-offset: 1px; }
`;

export const SHOWN = 6000;

export const timing = { shown: SHOWN };

export type ToastButton = { label: string; run(): void };

export type ToastKind = { key: string; many(n: number): { text: string; button?: ToastButton } };

export type ToastText = string | (string | Node)[];

const MAX = 3;

const queue: { text: ToastText; button?: ToastButton; kind?: ToastKind; n: number }[] = [];
let region: HTMLElement | null = null;
let timer = 0;
let showing = false;
let waiting = false;
let left = 0;
let since = 0;
let over = false;
let inside = false;
let before: HTMLElement | null = null;

export function toast(text: ToastText, button?: ToastButton, kind?: ToastKind): void {
  const same = kind && queue.length >= MAX ? queue.filter((q) => q.kind?.key === kind.key) : [];
  if (kind && same.length) {
    const n = same.reduce((sum, q) => sum + q.n, 1);
    for (const q of same) queue.splice(queue.indexOf(q), 1);
    queue.push({ ...kind.many(n), kind, n });
  } else queue.push({ text, button, kind, n: 1 });
  if (!showing && !waiting) next();
}

export function mountToasts(): HTMLElement {
  if (region) return region;
  style('toast', CSS);
  const box = (region = make('div', 'beeson-session-toast'));
  box.setAttribute('role', 'status');
  box.addEventListener('pointerenter', () => {
    over = true;
    pause();
  });
  box.addEventListener('pointerleave', () => {
    over = false;
    run();
  });
  box.addEventListener('focusin', (ev) => {
    if (!inside && ev.relatedTarget instanceof HTMLElement && !box.contains(ev.relatedTarget)) before = ev.relatedTarget;
    inside = true;
    pause();
  });
  box.addEventListener('focusout', (ev) => {
    inside = ev.relatedTarget instanceof Node && box.contains(ev.relatedTarget);
    run();
  });
  document.body.append(box);
  return box;
}

function pause(): void {
  if (!timer) return;
  clearTimeout(timer);
  timer = 0;
  left = Math.max(0, left - (performance.now() - since));
}

function run(): void {
  if (timer || !showing || over || inside) return;
  since = performance.now();
  timer = window.setTimeout(next, left);
}

const CLOSE = 'M4 4l8 8M12 4l-8 8';

function next(): void {
  clearTimeout(timer);
  timer = 0;
  if (!region) {
    mountToasts();
    showing = true;
    timer = window.setTimeout(next, 0);
    return;
  }
  const box = region;
  const modal = queue.length ? document.querySelector('dialog:modal') : null;
  if (modal) {
    showing = false;
    waiting = true;
    box.replaceChildren();
    modal.addEventListener('close', () => {
      waiting = false;
      next();
    }, { once: true });
    return;
  }
  const shown = queue.shift();
  showing = !!shown;
  left = timing.shown;
  if (!shown) {
    box.replaceChildren();
    over = inside = false;
    return;
  }
  const text = make('span');
  text.append(...(typeof shown.text === 'string' ? [shown.text] : shown.text));
  const parts: Node[] = [text];
  if (shown.button) {
    const { label, run: act } = shown.button;
    const b = make('button', '', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      next();
      act();
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
  close.addEventListener('click', () => {
    const back = before;
    next();
    if (!box.contains(document.activeElement) && back?.isConnected) back.focus();
  });
  parts.push(close);
  box.replaceChildren(...parts);
  inside = box.contains(document.activeElement);
  over = box.matches(':hover');
  run();
}
