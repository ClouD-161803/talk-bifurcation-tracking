// a small menu of the client under a button, e.g. of the save state, since the client may not
// import ui/menu.ts of the editor. Up and Down move between the items, Esc and a press outside
// close it, and the focus goes back to the button. it is a dialog shown without a backdrop, since
// the keys of the editor are then left to it

import { make, style } from './dom.ts';

const CSS = `
dialog.beeson-session-menu { position: fixed; inset: auto; margin: 0; z-index: 2147483001; min-width: 180px; max-width: calc(100vw - 16px); box-sizing: border-box; padding: 5px; border: 1px solid var(--ed-menu-line); border-radius: 8px; background: var(--ed-menu); color: var(--ed-text); font: 13px/1.3 var(--ed-font, system-ui, sans-serif); box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.beeson-session-menu button { display: block; width: 100%; min-height: 32px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; color: inherit; font: inherit; text-align: left; white-space: nowrap; }
.beeson-session-menu button:hover, .beeson-session-menu button:focus-visible { outline: none; background: var(--ed-select); color: var(--ed-on-select); }
`;

export type MenuItem = { label: string; run(): void };

let shut: (() => void) | null = null;

export function openMenu(button: HTMLElement, items: MenuItem[]): void {
  shut?.();
  style('menu', CSS);
  const menu = make('dialog', 'beeson-session-menu');
  menu.setAttribute('role', 'menu');
  const buttons = items.map(({ label, run }) => {
    const b = make('button', '', label);
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;
    b.addEventListener('click', () => {
      close();
      // the item had the focus, which goes back to the button before run() may move it on
      button.focus();
      run();
    });
    return b;
  });
  menu.append(...buttons);
  document.body.append(menu);
  menu.show();
  const r = button.getBoundingClientRect();
  const w = menu.offsetWidth;
  menu.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  menu.style.top = `${Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)}px`;
  button.setAttribute('aria-expanded', 'true');
  const onKey = (ev: KeyboardEvent) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (ev.key === 'Escape' || ev.key === 'Tab') {
      ev.preventDefault();
      ev.stopPropagation();
      close();
      button.focus();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      ev.stopPropagation();
      buttons[(i + (ev.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    }
  };
  const onDown = (ev: PointerEvent) => {
    if (!menu.contains(ev.target as Node) && ev.target !== button && !button.contains(ev.target as Node)) close();
  };
  function close(): void {
    shut = null;
    menu.remove();
    button.setAttribute('aria-expanded', 'false');
    window.removeEventListener('pointerdown', onDown, true);
  }
  shut = close;
  menu.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onDown, true);
  buttons[0]?.focus();
}

// true while a menu of the client is open, which a second press of its button closes
export function closeMenu(): boolean {
  if (!shut) return false;
  shut();
  return true;
}
