import type { App } from '../app.ts';
import { OUTSIDE_DIALOGS } from '../commands.ts';
import { script } from '../ui/script.ts';
import type { HistoryShell } from '../../session/client/handover.ts';

let on = false;
let esc: (() => void) | null = null;

const refuse = (ev: Event) => {
  if (!on || ev.target instanceof HTMLInputElement) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
};
for (const type of ['paste', 'cut', 'drop', 'dragover']) window.addEventListener(type, refuse, true);

const FREE = ['file.history', 'file.save'];

export function historyShell(app: App): HistoryShell {
  const run = app.commands.run.bind(app.commands);
  app.commands.run = (id, arg, ev) => (on && !FREE.includes(id) ? Promise.resolve() : run(id, arg, ev));
  app.commands.intercept((ev) => {
    if (!on || ev.key !== 'Escape' || !esc || document.querySelector('dialog[open], .beeson-edit-menu')) return false;
    ev.preventDefault();
    esc();
    return true;
  });
  let opener = () => {};
  app.commands.define({
    id: 'file.history',
    label: 'Version History',
    keys: { mac: ['Mod+Alt+Shift+H'], other: ['Alt+Shift+H'] },
    in: OUTSIDE_DIALOGS,
    inText: true,
    menu: { bar: 'File', group: 'save', order: 24 },
    enabled: (a) => !!a.session,
    run: () => opener(),
  });
  const q = (s: string) => document.querySelector<HTMLElement>(s);
  return {
    inspector: q('.beeson-edit-inspector'),
    onCommand: (fn) => void (opener = fn),
    setMode(state, back) {
      on = state;
      esc = back ?? null;
      for (const el of document.querySelectorAll<HTMLElement>('.beeson-edit-top, .beeson-edit-menubar, .beeson-edit-nav, .beeson-edit-nav-edge, .beeson-edit-canvas, .reveal:not(.beeson-peek), .beeson-edit-pane, .beeson-edit-sorter, .beeson-edit-objects, .beeson-edit-inspector, .beeson-edit-bottom, .beeson-overlay, .beeson-line-layer, .beeson-table-bars')) el.inert = state;
      document.documentElement.classList.toggle('beeson-history', state);
      app.relayout();
    },
    canvas: () => (q('.beeson-edit-canvas') ?? document.body).getBoundingClientRect(),
    load: () => script('session-history.js'),
  };
}
