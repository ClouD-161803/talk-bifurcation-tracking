// File > Preamble… and File > Bibliography…, the sheets of preamble.tex and references.bib, and the
// save of the two sources and of tex.js next to the deck. the sheets, the list of the citations,
// and the readers of TeX are built into theme/editor-tex.js, which is loaded at their first use,
// since editor.js is loaded at each edit and is kept under its budget. a save writes these files
// only once they are read. the triggers of the list stay here: \cite{ typed in a text, Insert >
// Citation… with its key, and a click on the number of a citation, which the Format pane shows

import type { App } from '../app.ts';
import { addCompanion } from '../file/files.ts';
import { showFormat } from '../inspector/inspector.ts';
import type { Control } from '../inspector/controls.ts';
import { deckFolder } from '../media/save.ts';
import { make } from '../ui/dom.ts';
import { citedKeys, texScript, type Tex } from '../../texfile.ts';

export type Which = 'preamble' | 'bibliography';
// where the list of the bibliography puts the chosen papers: in place of the \cite{ typed before
// the caret of host, at range in host, or into cite, in place of its paper at index or added to it
export type CiteTarget = { host: Element; typed?: boolean; range?: Range; cite?: HTMLElement; index?: number; anchor?: Element };
// the service of theme/editor-tex.js. write and download save the changed sources and tex.js for
// the text of the deck, as a companion of file/files.ts does. cite opens the list of the
// bibliography, key takes a key of the open list, and pane fills el with the papers of cite
export type TexSheets = {
  open(which: Which): Promise<void>;
  // whether the sources are read, and their read without a question, false where it needs one
  loaded(): boolean;
  prepare(): Promise<boolean>;
  write(text: string, deck: FileSystemFileHandle): Promise<string>;
  download(text: string): string;
  dirty(): boolean;
  cite(target: CiteTarget): void;
  key(ev: KeyboardEvent): boolean;
  pane(el: HTMLElement, cite: HTMLElement): void;
};
// what editor.js gives theme/editor-tex.js: the app, the folder of the deck shared with the media
// files, and the tex.js of the deck as the page loaded it
export type TexHost = { app: App; folder: typeof deckFolder; start: Tex | null };

declare global {
  interface Window {
    BeesonTexSheets?: (host: TexHost) => TexSheets;
  }
}

// read while editor.js runs, since the script of the page is not current after that
const SELF = (document.currentScript as HTMLScriptElement | null)?.src ?? '';

let sheets: TexSheets | null = null;
let loading: Promise<TexSheets> | null = null;
let load: () => Promise<TexSheets> = () => Promise.reject(new Error('the sheets are not installed'));

// the citation chosen by a click on its number, while the range of its text is around it
let picked: HTMLElement | null = null;
export const citationOf = (app: App): HTMLElement | null => (picked?.isConnected && app.selection.kind === 'text' && app.selection.items[0]?.contains(picked) ? picked : null);

// the Citation pane of the Format tab, filled by theme/editor-tex.js
export function citationPane(app: App): Control[] {
  const el = make('div', 'ed-sec');
  const sync = () => {
    const cite = citationOf(app);
    if (cite) void load().then((s) => s.pane(el, cite), (e) => app.fail(e));
  };
  sync();
  return [{ el, sync }];
}

// the text of a slide with the caret, which a citation can be put into
function citeHost(app: App): HTMLElement | null {
  const host = app.selection.kind === 'text' ? app.selection.items[0] : null;
  return host instanceof HTMLElement && app.current()?.contains(host) && !host.closest('div.math, pre, aside.notes') ? host : null;
}

export function install(app: App): void {
  const tex = (window as { beesonTex?: Tex }).beesonTex;
  const start: Tex | null = tex ? JSON.parse(JSON.stringify(tex)) : null;
  load = (): Promise<TexSheets> =>
    (loading ??= new Promise<TexSheets>((done, fail) => {
      const script = document.createElement('script');
      script.src = SELF ? new URL('editor-tex.js', SELF).href : 'theme/editor-tex.js';
      script.onload = () => {
        if (window.BeesonTexSheets) return done((sheets = window.BeesonTexSheets({ app, folder: deckFolder, start })));
        loading = null;
        fail(new Error('theme/editor-tex.js did not start'));
      };
      script.onerror = () => {
        loading = null;
        fail(new Error('theme/editor-tex.js is not found next to theme/editor.js'));
      };
      document.head.append(script);
    }));
  const cite = (target: CiteTarget) => load().then((s) => s.cite(target), (e) => app.fail(e));
  // the tex.js of a deck whose citations changed while the sources are not read: the references of
  // tex.js that the deck still cites, or the keys that only references.bib has
  // the citations taken out of the deck or added to it since it was opened, or since tex.js was
  // last written, as the references of tex.js without the papers taken out, or as the keys that
  // only references.bib has. a deck that cites other papers than its tex.js, e.g. a deck that
  // shares the tex.js of another, keeps those references
  let opened: string[] | null = null;
  const own = [...document.scripts].some((s) => s.src === new URL('tex.js', location.href).href);
  const uncited = (text: string): { script: string; keys: string[]; references: Tex['references'] } | { missing: string[] } | null => {
    if (!own) return null;
    const keys = citedKeys(text);
    const before = (opened ??= citedKeys(app.saved ?? text));
    const known = start?.references ?? {};
    const missing = keys.filter((key) => !before.includes(key) && !Object.hasOwn(known, key));
    if (missing.length || !start) return missing.length ? { missing } : null;
    const references = Object.fromEntries(Object.entries(known).filter(([key]) => keys.includes(key) || !before.includes(key)));
    if (Object.keys(references).length === Object.keys(known).length) {
      opened = keys;
      return null;
    }
    return { script: texScript({ macros: start.macros, environments: start.environments, packages: start.packages, theorems: start.theorems, references }), keys, references };
  };
  const unread = (missing: string[]) => `tex.js was not written, since references.bib is not read for ${missing.join(', ')}: choose File > Bibliography… and save again`;
  addCompanion({
    write: async (text, deck) => {
      if (sheets?.loaded()) return sheets.write(text, deck);
      const c = uncited(text);
      if (!c) return '';
      if ('missing' in c) {
        const s = await load();
        return (await s.prepare()) ? s.write(text, deck) : unread(c.missing);
      }
      const folder = await deckFolder(deck, 'tex.js');
      // a tex.js written since the page read it, e.g. by npm run tex, is written again from the sources
      const now = await folder.getFileHandle('tex.js').then((h) => h.getFile()).then((f) => f.text(), () => null);
      if (now !== null && now !== texScript(start!)) {
        const s = await load();
        return (await s.prepare()) ? s.write(text, deck) : 'tex.js was not written, since it was changed next to the deck and its sources are not read';
      }
      const writable = await (await folder.getFileHandle('tex.js', { create: true })).createWritable();
      await writable.write(c.script);
      await writable.close();
      start!.references = c.references;
      opened = c.keys;
      return 'tex.js written';
    },
    download: (text) => {
      if (sheets?.loaded()) return sheets.download(text);
      const c = uncited(text);
      if (!c) return '';
      if ('missing' in c) return unread(c.missing);
      const url = URL.createObjectURL(new Blob([c.script], { type: 'text/plain' }));
      const a = make('a');
      a.href = url;
      a.download = 'tex.js';
      (document.querySelector('dialog[open]') ?? document.body).append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      start!.references = c.references;
      opened = c.keys;
      return 'Put tex.js next to it';
    },
    dirty: () => sheets?.dirty() ?? false,
  });
  // the run ends once the sheet is shown, since a sheet of a deck opened from a file waits for the
  // folder of the deck to be chosen
  const open = (which: Which) => load().then((s) => void s.open(which).catch((e) => app.fail(e)));
  app.commands.define({ id: 'file.preamble', label: 'Preamble…', menu: { bar: 'File', group: 'tex', order: 35 }, run: () => open('preamble') });
  app.commands.define({ id: 'file.bibliography', label: 'Bibliography…', menu: { bar: 'File', group: 'tex', order: 36 }, run: () => open('bibliography') });
  app.commands.define({
    id: 'insert.citation',
    label: 'Citation…',
    keys: { mac: ['Ctrl+Mod+C'], other: ['Alt+Shift+C'] },
    in: ['text'],
    menu: { bar: 'Insert', group: 'element', order: 22.9 },
    enabled: (a) => !!citeHost(a) && a.region() !== 'dialog',
    run: (a) => {
      const host = citeHost(a);
      const s = getSelection();
      const range = s?.rangeCount && host?.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0).cloneRange() : null;
      if (host) void cite({ host, range: range ?? undefined });
    },
  });

  // the keys of the open list are taken before those of the editor, hence this install is run
  // before installKeys of commands.ts
  window.addEventListener('keydown', (ev) => {
    if (!sheets?.key(ev)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }, true);
  // \cite{ typed in a text opens the list, apart from the TeX of a formula being typed
  document.addEventListener('input', (ev) => {
    const s = getSelection();
    const n = s?.anchorNode;
    const host = (ev as InputEvent).inputType === 'insertText' ? citeHost(app) : null;
    if (!host || !host.contains(ev.target as Node) || !s?.isCollapsed || !(n instanceof Text) || n.parentElement?.closest('code, mjx-container')) return;
    const before = n.data.slice(0, s.anchorOffset);
    if (before.endsWith('\\cite{') && before.lastIndexOf('\\(') <= before.lastIndexOf('\\)')) void cite({ host, typed: true });
  });
  // a click on the number of a citation selects the citation as the range of its text
  document.addEventListener('click', (ev) => {
    const el = ev.target instanceof HTMLElement && ev.target.matches('cite[data-key]') ? ev.target : null;
    const host = el && app.hostOf(el);
    if (!el || !(host instanceof HTMLElement) || !app.current()?.contains(host) || host.closest('aside.notes') || ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    host.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNode(el);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    picked = el;
    showFormat(app, 'citation');
    app.invalidate('selection');
  });
  // the citation is let go once the range of a text of the slides is moved off it
  document.addEventListener('selectionchange', () => {
    const r = picked && getSelection()?.rangeCount ? getSelection()!.getRangeAt(0) : null;
    if (!r || !document.querySelector('.reveal .slides')?.contains(r.startContainer)) return;
    const at = [...(picked!.parentNode?.childNodes ?? [])].indexOf(picked!);
    if (r.startContainer === picked!.parentNode && r.startOffset === at && r.endContainer === r.startContainer && r.endOffset === at + 1) return;
    picked = null;
    app.invalidate('selection');
  });
}
