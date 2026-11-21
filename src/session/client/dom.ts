import type { Dialog, DialogOptions } from '../../editor/ui/dialog.ts';

export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export const bdi = (name: string): HTMLElement => make('bdi', '', name);

export const textOf = (line: (string | Node)[]): string => line.map((p) => (typeof p === 'string' ? p : p.textContent)).join('');

export function style(id: string, css: string): void {
  const key = `beeson-session-${id}`;
  if (document.getElementById(key)) return;
  const el = make('style');
  el.id = key;
  el.textContent = css;
  document.head.append(el);
}

const FIT = `
dialog.beeson-edit-dialog.beeson-session-fit { max-height: calc(var(--beeson-session-vh, 100vh) - 104px); overflow-x: hidden; overscroll-behavior: contain; }
@media (max-width: 599px), (max-height: 599px) {
  dialog.beeson-edit-dialog.beeson-session-fit { width: calc(100vw - 24px); margin-top: 12px; padding: 16px; max-height: calc(var(--beeson-session-vh, 100vh) - 24px); }
}
`;

export function dialogClass(): string {
  style('dialog', 'dialog.beeson-edit-dialog.beeson-session-dialog .row button { box-sizing: border-box; min-height: 32px; }');
  return 'beeson-session-dialog';
}

export const withClass = (dialog: (options: DialogOptions) => Dialog) => (options: DialogOptions): Dialog =>
  dialog({ ...options, className: options.className ? `${dialogClass()} ${options.className}` : dialogClass() });

export function fitClass(): string {
  if (!document.getElementById('beeson-session-fit')) {
    style('fit', FIT);
    const vv = window.visualViewport;
    const follow = () => document.documentElement.style.setProperty('--beeson-session-vh', `${Math.round(vv?.height ?? innerHeight)}px`);
    follow();
    (vv ?? window).addEventListener('resize', follow);
  }
  return 'beeson-session-fit';
}
