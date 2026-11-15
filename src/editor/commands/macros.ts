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
import { injectStyle, make } from '../ui/dom.ts';
import type { Arrival, OriginMacro } from './origin.ts';

const CSS = `
dialog.paste-macros pre { margin: 0 0 12px; padding: 8px 10px; max-height: 40vh; overflow: auto; border: 1px solid var(--sheet-line); border-radius: 6px; font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace; color: var(--ed-text); user-select: text; -webkit-user-select: text; }
dialog.paste-macros p.hint { margin: 0 0 12px; color: var(--ed-text); }
`;

// a macro as an entry of window.beesonMacros, its body a string of JavaScript in single quotes
const line = (m: OriginMacro): string => {
  const body = `'${m.body.replace(/[\\']/g, (c) => `\\${c}`).replace(/\n/g, '\\n')}'`;
  return `${m.name}: ${m.args ? `[${body}, ${m.args}]` : body},`;
};

const shown = new Set<string>();
let sheet: { dialog: Dialog; pre: HTMLElement; hint: HTMLElement } | null = null;

// the lines are written inside the click, which grants the write in every browser. where it is
// refused or missing, the lines are selected for a copy by hand
function copy(app: App): void {
  const { dialog, pre, hint } = sheet!;
  const refused = () => {
    hint.textContent = `The browser did not let the editor write the clipboard. Select the lines and press ${display('Mod+C', app.platform)}.`;
    hint.hidden = false;
    getSelection()?.selectAllChildren(pre);
  };
  if (!navigator.clipboard?.writeText) return refused();
  navigator.clipboard.writeText(pre.textContent ?? '').then(() => void (dialog.buttons.get('copy')!.textContent = 'Copied'), refused);
}

function show(app: App, lacking: string[], other: string[], lines: string[]): void {
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
    sheet = { dialog, pre, hint };
  }
  const { dialog, pre, hint } = sheet;
  const red = lacking.length ? `the formulas that use ${listed(lacking)} are drawn in red` : '';
  const own = other.length ? `the formulas that use ${listed(other)} are drawn with the definition of this deck` : '';
  dialog.text.textContent = `Paste the lines below into theme/macros.js of this deck, inside the braces of window.beesonMacros, and open the deck again to define the macros of the formulas that you pasted as the deck they were copied from does. Until then, ${[red, own].filter(Boolean).join(', and ')}.`;
  pre.textContent = lines.join('\n');
  hint.hidden = true;
  dialog.buttons.get('copy')!.textContent = 'Copy';
  void dialog.open('copy');
}

export function nameMacros(app: App, arrival: Arrival): void {
  const own = new Map(deckMacros().map((m) => [m.name, m]));
  const off = arrival.origin.macros.filter((m) => own.get(m.name)?.body !== m.body || own.get(m.name)?.args !== m.args).sort((a, b) => a.name.localeCompare(b.name));
  if (!off.length) return;
  const lines = off.map(line);
  const names = off.map((m) => `\\${m.name}`);
  if (lines.every((l) => shown.has(l))) {
    arrival.notes.push(`${listed(names)} ${off.length > 1 ? 'are' : 'is'} still not defined in this deck as in the deck they were copied from.`);
    return;
  }
  for (const l of lines) shown.add(l);
  show(app, off.filter((m) => !own.has(m.name)).map((m) => `\\${m.name}`), off.filter((m) => own.has(m.name)).map((m) => `\\${m.name}`), lines);
}
