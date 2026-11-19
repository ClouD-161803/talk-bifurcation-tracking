import { Orbits } from './orbits.ts';

export type Theme = 'dark' | 'light';

const KEY = 'beeson-theme';
const root = document.documentElement;
let pinned = false;
let button: HTMLButtonElement | null = null;
let flip: unknown = null;
let undo: (() => void) | null = null;

const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light';

export function get(): Theme {
  return root.dataset.theme === 'light' ? 'light' : 'dark';
}

function apply(theme: Theme): void {
  root.dataset.theme = theme;
  if (button) button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  document.dispatchEvent(new CustomEvent('beeson:theme', { detail: { theme } }));
}

function store(theme: Theme): void {
  if (pinned) return;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
  }
}

function ghosts(x: number, y: number): { lift: () => void; undo: () => void } | null {
  const deck = document.querySelector<HTMLElement>('.reveal');
  const live = [...document.querySelectorAll<HTMLElement>('.backdrop')].map((el) => Orbits.of(el)).filter((o) => o?.tracing) as Orbits[];
  if (!deck || !live.length || !CSS.supports('view-transition-class', 'a') || !CSS.supports('selector(:active-view-transition)')) return null;
  const box = deck.getBoundingClientRect();
  root.style.setProperty('--flip-deck-x', `${x - box.left}px`);
  root.style.setProperty('--flip-deck-y', `${y - box.top}px`);
  deck.style.setProperty('view-transition-name', 'flip-deck');
  const canvases = live.flatMap((o) => o.canvases);
  canvases.forEach((c, k) => {
    c.style.setProperty('view-transition-name', `flip-art-${k}`);
    c.style.setProperty('view-transition-class', 'flip-art');
  });
  const unname = () => {
    for (const c of canvases) { c.style.removeProperty('view-transition-name'); c.style.removeProperty('view-transition-class'); }
  };
  const layer = document.createElement('div');
  layer.className = 'flip-ghost';
  Object.assign(layer.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  return {
    lift() {
      for (const o of live) o.ghost(layer, box);
      document.body.append(layer);
      unname();
    },
    undo() {
      unname();
      deck.style.removeProperty('view-transition-name');
      for (const o of live) o.unghost();
      layer.remove();
    },
  };
}

export function set(theme: Theme, at?: { x: number; y: number }): void {
  if (!isTheme(theme) || theme === get()) return;
  store(theme);
  const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
  if (!doc.startViewTransition || Orbits.reduced()) { apply(theme); return; }
  undo?.();
  undo = null;
  const b = button?.getBoundingClientRect();
  const x = at?.x ?? (b ? b.left + b.width / 2 : innerWidth), y = at?.y ?? (b ? b.top + b.height / 2 : 0);
  root.style.setProperty('--flip-x', `${x}px`);
  root.style.setProperty('--flip-y', `${y}px`);
  root.style.setProperty('--flip-r', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
  root.classList.toggle('to-dark', theme === 'dark');
  root.classList.toggle('to-light', theme === 'light');
  const layers = ghosts(x, y);
  undo = layers?.undo ?? null;
  const tr = doc.startViewTransition(() => { layers?.lift(); apply(theme); });
  flip = tr;
  tr.finished.finally(() => {
    if (flip !== tr) return;
    root.classList.remove('to-dark', 'to-light');
    undo?.();
    undo = null;
  }).catch(() => {});
}

export function toggle(at?: { x: number; y: number }): void {
  set(get() === 'dark' ? 'light' : 'dark', at);
}

export function initTheme(): void {
  const asked = new URLSearchParams(location.search).get('theme');
  let theme: Theme = 'dark';
  if (isTheme(asked)) { theme = asked; pinned = true; }
  else {
    try {
      const saved = localStorage.getItem(KEY);
      if (isTheme(saved)) theme = saved;
    } catch {
    }
  }
  root.dataset.theme = theme;
}

export function initSwitcher(): void {
  const deck = document.querySelector('.reveal');
  if (!deck || button) return;
  button = document.createElement('button');
  button.className = 'theme-switch';
  button.type = 'button';
  button.setAttribute('aria-label', get() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  button.addEventListener('click', (ev) => {
    toggle(ev.detail > 0 ? { x: ev.clientX, y: ev.clientY } : undefined);
    button?.blur();
  });
  deck.append(button);
}

export function forDeck(ev: KeyboardEvent): boolean {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return false;
  const target = (ev.target instanceof Element ? ev.target : null) ?? document.activeElement;
  return !target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], tycho-viewer');
}
