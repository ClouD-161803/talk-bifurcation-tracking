// the few element helpers of the client, which may not import ui/dom.ts of the editor

export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

// css added once to the head, as style#beeson-session-<id>
export function style(id: string, css: string): void {
  const key = `beeson-session-${id}`;
  if (document.getElementById(key)) return;
  const el = make('style');
  el.id = key;
  el.textContent = css;
  document.head.append(el);
}

// the class of a dialog of the client that fits a phone, also with its keyboard open. the height of
// the visual viewport, which the keyboard shrinks, is kept in --beeson-session-vh, and the dialog
// scrolls inside below it. sheet() returns the class, for the className of a dialog
const SHEET = `
dialog.beeson-edit-dialog.beeson-session-sheet { max-height: calc(var(--beeson-session-vh, 100vh) - 104px); overflow-x: hidden; overscroll-behavior: contain; }
@media (max-width: 599px), (max-height: 599px) {
  dialog.beeson-edit-dialog.beeson-session-sheet { width: calc(100vw - 24px); margin-top: 12px; padding: 16px; max-height: calc(var(--beeson-session-vh, 100vh) - 24px); }
}
`;

export function sheet(): string {
  if (!document.getElementById('beeson-session-sheet')) {
    style('sheet', SHEET);
    const vv = window.visualViewport;
    const follow = () => document.documentElement.style.setProperty('--beeson-session-vh', `${Math.round(vv?.height ?? innerHeight)}px`);
    follow();
    (vv ?? window).addEventListener('resize', follow);
  }
  return 'beeson-session-sheet';
}
