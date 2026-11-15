// the step of a paste from another deck that names the macros of its origin that this deck lacks
// or defines otherwise, in a dialog with the lines of theme/macros.js that define them as the first
// deck does. the dialog is not waited for, hence the entry of the history of the paste is closed
// while it is open. a later paste of lines that a dialog of this page showed adds a sentence to
// the note of the paste in place of the dialog. the editor neither writes theme/macros.js nor
// expands a macro in the pasted text

import type { App } from '../app.ts';
import { display } from '../keymap.ts';
import { deckMacros } from '../math.ts';
import { listed } from '../media/carry.ts';
import { Dialog } from '../ui/dialog.ts';
import { injectStyle, make, touchOnly } from '../ui/dom.ts';
import type { Arrival, OriginMacro } from './origin.ts';

const CSS = `
dialog.paste-macros pre { margin: 0 0 12px; padding: 8px 10px; max-height: 40vh; overflow: auto; border: 1px solid var(--sheet-line); border-radius: 6px; font: 12px/1.45 ui-monospace, Menlo, monospace; user-select: text; -webkit-user-select: text; }
dialog.paste-macros p.hint { margin: 0 0 12px; color: var(--ed-text); }
`;

// a text as a string of JavaScript in single quotes
const quoted = (t: string): string => `'${t.replace(/[\\']/g, (c) => `\\${c}`).replace(/[\n\r\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;
// a macro as an entry of window.beesonMacros
const line = (m: OriginMacro): string => {
  const body = quoted(m.body);
  return `${m.name}: ${m.args ? `[${body}, ${m.args}${m.default === undefined ? '' : `, ${quoted(m.default)}`}]` : body},`;
};

// a macro off this deck: its line, its name, and whether this deck lacks it
type Off = { line: string; name: string; lacking: boolean };
const shown = new Set<string>();
let sheet: { dialog: Dialog; pre: HTMLElement; hint: HTMLElement; offs: Off[] } | null = null;

// the lines are written inside the click, which grants the write in every browser. where it is
// refused or missing, the lines are selected for a copy by hand, with the key named except on a
// phone
function copy(app: App): void {
  const { dialog, pre, hint } = sheet!;
  const refused = () => {
    const key = touchOnly() ? '' : `, e.g. with ${display('Mod+C', app.platform)}`;
    hint.textContent = `The browser did not let the editor write the clipboard. Select the lines and copy them${key}.`;
    hint.hidden = false;
    getSelection()?.selectAllChildren(pre);
  };
  if (!navigator.clipboard?.writeText) return refused();
  navigator.clipboard.writeText(pre.textContent ?? '').then(() => void (dialog.buttons.get('copy')!.textContent = 'Copied'), refused);
}

// the dialog with offs, added to those of a dialog still open from an earlier paste
function show(app: App, offs: Off[]): void {
  if (!sheet) {
    injectStyle('paste-macros', CSS);
    const pre = make('pre');
    const hint = make('p', 'hint');
    const body = make('div');
    body.append(pre, hint);
    const dialog = new Dialog({
      title: 'Define the macros of the paste',
      text: '',
      body,
      buttons: [
        { label: 'Copy', value: 'copy', primary: true },
        { label: 'Done', value: 'done' },
      ],
      className: 'paste-macros',
      stay: ['copy'],
      onButton: (v) => v === 'copy' && copy(app),
    });
    sheet = { dialog, pre, hint, offs: [] };
  }
  const { dialog, pre, hint } = sheet;
  const all = new Map([...(dialog.shown ? sheet.offs : []), ...offs].map((o) => [o.line, o]));
  sheet.offs = [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
  const names = (lacking: boolean) => sheet!.offs.filter((o) => o.lacking === lacking).map((o) => o.name);
  const red = names(true).length ? `the formulas that use ${listed(names(true))} are drawn in red` : '';
  const own = names(false).length ? `the formulas that use ${listed(names(false))} are drawn with the definition of this deck` : '';
  dialog.text.textContent = `Paste the lines below into theme/macros.js of this deck, inside the braces of window.beesonMacros, and open the deck again. Until then, ${[red, own].filter(Boolean).join(', and ')}.`;
  pre.textContent = sheet.offs.map((o) => o.line).join('\n');
  hint.hidden = true;
  dialog.buttons.get('copy')!.textContent = 'Copy';
  void dialog.open('copy');
}

export function nameMacros(app: App, arrival: Arrival): void {
  const own = new Map(deckMacros().map((m) => [m.name, m]));
  const offs = arrival.origin.macros
    .filter((m) => own.get(m.name)?.body !== m.body || own.get(m.name)?.args !== m.args || own.get(m.name)?.default !== m.default)
    .map((m) => ({ line: line(m), name: `\\${m.name}`, lacking: !own.has(m.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!offs.length) return;
  if (offs.every((o) => shown.has(o.line))) {
    arrival.notes.push(`${listed(offs.map((o) => o.name))} ${offs.length > 1 ? 'are' : 'is'} still not defined in this deck as in the deck they were copied from.`);
    return;
  }
  for (const o of offs) shown.add(o.line);
  show(app, offs);
}
