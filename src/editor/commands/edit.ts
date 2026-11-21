import type { App } from '../app.ts';
import { OUTSIDE_DIALOGS } from '../commands.ts';
import { store, stored } from '../ui/dom.ts';
import { titled } from '../history.ts';
import { entering } from '../inspector/controls.ts';
import { showFormat } from '../inspector/inspector.ts';

const IN = OUTSIDE_DIALOGS.filter((r) => r !== 'field');

const SPELLING_KEY = 'beeson-spelling';

function installSpelling(app: App): void {
  let on = stored(SPELLING_KEY) !== '0';
  const asked = new WeakSet<HTMLElement>();
  const apply = () => {
    if (on) document.documentElement.removeAttribute('spellcheck');
    else document.documentElement.setAttribute('spellcheck', 'false');
  };
  document.addEventListener('focusin', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLElement) || el.closest('.reveal')) return;
    if (!on && el.getAttribute('spellcheck') === 'true') {
      asked.add(el);
      el.spellcheck = false;
    } else if (on && asked.has(el)) el.spellcheck = true;
  }, true);
  apply();
  app.commands.define({
    id: 'edit.spelling',
    label: 'Check Spelling While Typing',
    menu: { bar: 'Edit', group: 'substitutions', order: 80, submenu: 'Spelling and Grammar' },
    checked: () => on,
    run: () => {
      on = !on;
      store(SPELLING_KEY, on ? null : '0');
      apply();
    },
  });
}

const entered = async (run: () => Promise<void>, enter: boolean) => {
  const field = document.activeElement && entering.get(document.activeElement);
  if (!field) return run();
  if (!enter) field.follow();
  const input = document.activeElement;
  if (!enter || (await field.enter()) !== false) await run();
  if (document.activeElement !== input && document.activeElement?.closest('[contenteditable="true"]')) return;
  field.follow();
};

const frame = () => new Promise((done) => requestAnimationFrame(done));

async function sizeAndPosition(app: App): Promise<void> {
  showFormat(app, 'arrange');
  for (let i = 0; i < 3; i++) {
    const panel = document.getElementById('beeson-edit-panel-format');
    const field = ['width', 'x'].map((n) => panel?.querySelector<HTMLInputElement>(`#beeson-edit-num-${n}`)).find((f) => f && !f.disabled);
    if (field) {
      field.focus();
      field.select();
      return;
    }
    await frame();
  }
}

export function install(app: App): void {
  installSpelling(app);
  const c = app.commands;
  c.define({
    id: 'edit.undo',
    label: (a) => (a.history.undoLabel ? `Undo ${titled(a.history.undoLabel.replace(/…$/, ''))}` : 'Undo'),
    keys: { mac: ['Mod+Z'], other: ['Mod+Z'] },
    in: IN,
    menu: { bar: 'Edit', group: 'history', order: 10 },
    toolbar: { group: 'history', order: 10, icon: 'undo', label: 'Undo' },
    enabled: (a) => a.history.canUndo,
    run: (a) => entered(() => a.history.undo(), true),
  });
  c.define({
    id: 'edit.redo',
    label: (a) => (a.history.redoLabel ? `Redo ${titled(a.history.redoLabel.replace(/…$/, ''))}` : 'Redo'),
    keys: { mac: ['Mod+Shift+Z', 'Mod+Y'], other: ['Mod+Y', 'Mod+Shift+Z'] },
    in: IN,
    menu: { bar: 'Edit', group: 'history', order: 11 },
    toolbar: { group: 'history', order: 11, icon: 'redo', label: 'Redo' },
    enabled: (a) => a.history.canRedo,
    run: (a) => entered(() => a.history.redo(), false),
  });
  c.define({
    id: 'arrange.sizeAndPosition',
    label: 'Size and Position…',
    context: ['element'],
    enabled: (a) => a.selection.elements().some((el) => !el.matches('.backdrop')) && a.region() !== 'dialog',
    run: (a) => sizeAndPosition(a),
  });
}
