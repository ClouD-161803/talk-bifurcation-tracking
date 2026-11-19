import type { App } from '../app.ts';
import { placeFigure } from '../commands/insert.ts';
import { addCompanion } from '../file/files.ts';
import { showFormat } from '../inspector/inspector.ts';
import type { Control } from '../inspector/controls.ts';
import { chooseFiles } from '../media/actions.ts';
import { deckFolder } from '../media/save.ts';
import { figureLink } from '../session/port.ts';
import { make } from '../ui/dom.ts';
import { themeUrl } from '../ui/script.ts';
import { citedKeys, texScript, type Tex } from '../../texfile.ts';

export type Which = 'preamble' | 'bibliography';
export type Starter = 'data' | 'file' | 'blank';
export type CiteTarget = { host: Element; typed?: boolean; range?: Range; cite?: HTMLElement; index?: number; anchor?: Element };
export type TexSheets = {
  open(which: Which): Promise<void>;
  loaded(): boolean;
  prepare(): Promise<boolean>;
  write(text: string, deck: FileSystemFileHandle): Promise<string>;
  download(text: string): string;
  dirty(): boolean;
  showing(): { which: Which; dialog: HTMLDialogElement } | null;
  redraw(): Promise<void>;
  cite(target: CiteTarget): void;
  key(ev: KeyboardEvent): boolean;
  pane(el: HTMLElement, cite: HTMLElement): void;
  newFigure(from: Starter, file: File | null): Promise<void>;
  editSource(figure: HTMLElement): void;
  figurePane(el: HTMLElement, figure: HTMLElement): () => void;
};
export type TexHost = { app: App; folder: typeof deckFolder; start: Tex | null; link: typeof figureLink; place(name: string): Promise<Element | null>; why(): string | null };

declare global {
  interface Window {
    BeesonTexSheets?: (host: TexHost) => TexSheets;
  }
}

let sheets: TexSheets | null = null;
export const shownSheet = (): ReturnType<TexSheets['showing']> => sheets?.showing() ?? null;
let loading: Promise<TexSheets> | null = null;
let load: () => Promise<TexSheets> = () => Promise.reject(new Error('the sheets are not installed'));

let picked: HTMLElement | null = null;
export const citationOf = (app: App): HTMLElement | null => (picked?.isConnected && app.selection.kind === 'text' && app.selection.items[0]?.contains(picked) ? picked : null);

export function citationPane(app: App): Control[] {
  const el = make('div', 'ed-sec');
  const sync = () => {
    const cite = citationOf(app);
    if (cite) void load().then((s) => s.pane(el, cite), (e) => app.fail(e));
  };
  sync();
  return [{ el, sync }];
}

export function tikzPane(app: App): Control[] {
  const el = make('div', 'ed-tikz');
  const figure = app.selection.elements()[0] as HTMLElement;
  let sync = (): void => {};
  void load().then((s) => {
    sync = s.figurePane(el, figure);
    sync();
  }, (e) => app.fail(e));
  return [{ el, sync: () => sync() }];
}

const ownTex = (): boolean => [...document.scripts].some((s) => s.src === new URL('tex.js', location.href).href);

export function redrawTex(app: App): Promise<void> {
  if (!ownTex()) return Promise.resolve();
  return load().then((s) => s.redraw()).catch((e) => {
    app.fail(e);
    throw e;
  });
}

function citeHost(app: App): HTMLElement | null {
  const host = app.selection.kind === 'text' ? app.selection.items[0] : null;
  return host instanceof HTMLElement && app.current()?.contains(host) && !host.closest('div.math, pre, aside.notes') ? host : null;
}

let why: (a: App) => string | null = () => null;

export function install(app: App): void {
  const tex = (window as { beesonTex?: Tex }).beesonTex;
  const start: Tex | null = tex ? JSON.parse(JSON.stringify(tex)) : null;
  load = (): Promise<TexSheets> =>
    (loading ??= new Promise<TexSheets>((done, fail) => {
      const script = document.createElement('script');
      script.src = themeUrl('editor-tex.js');
      script.onload = () => {
        if (window.BeesonTexSheets) return done((sheets = window.BeesonTexSheets({ app, folder: deckFolder, start, link: figureLink, place: (name) => placeFigure(app, name), why: () => why(app) })));
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
  let opened: string[] | null = null;
  const own = ownTex();
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

  why = (a: App): string | null =>
    !a.session ? 'TikZ figures are compiled only while the edit command runs. Start it with Edit.command, Edit.cmd, or Edit.sh next to the deck, or with npm run edit' : figureLink()?.host() === false ? 'Only the host changes a TikZ figure' : figureLink()?.state()?.compiler === 'missing' ? 'TeX with latex and dvisvgm is not found on the computer of the host' : null;
  const starters: [Starter, string, string][] = [['data', 'From Data…', '.csv,text/csv'], ['file', 'From File…', '.tex'], ['blank', 'Blank', '']];
  for (const [i, [from, label, accept]] of starters.entries())
    app.commands.define({
      id: `insert.tikz${from[0].toUpperCase()}${from.slice(1)}`,
      label,
      menu: { bar: 'Insert', group: 'element', order: 25.1 + i / 10, submenu: 'TikZ Figure' },
      toolbar: { group: 'insert', order: 24.12 + i / 100, icon: 'line-curve', split: 'Media' },
      enabled: (a) => !!a.current() && a.region() !== 'dialog',
      run: async (a, arg) => {
        const no = why(a);
        if (no) {
          a.note = { text: no, warn: true };
          return a.report();
        }
        const files = accept ? ((arg as { files?: File[] } | undefined)?.files ?? (await chooseFiles(accept))) : [];
        if (accept && !files.length) return;
        await (await load()).newFigure(from, files[0] ?? null);
      },
    });

  const figureOf = (a: App): HTMLElement | null => {
    const els = a.selection.elements();
    return els.length === 1 && els[0] instanceof HTMLElement && els[0].matches('.tikz') ? els[0] : null;
  };
  app.commands.define({
    id: 'format.tikzSource',
    label: 'Edit Source…',
    menu: { bar: 'Format', group: 'mask', order: 97 },
    enabled: (a) => !!figureOf(a) && a.region() !== 'dialog',
    run: (a) => {
      const no = why(a);
      if (no) {
        a.note = { text: no, warn: true };
        return a.report();
      }
      const figure = figureOf(a)!;
      return load().then((s) => s.editSource(figure));
    },
  });
  window.addEventListener('dblclick', (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest('.tikz') : null;
    if (!el || !app.current()?.contains(el) || el.hasAttribute('data-locked') || app.region() === 'dialog') return;
    app.selection.set('elements', [el]);
    void app.commands.run('format.tikzSource');
  }, true);

  window.addEventListener('keydown', (ev) => {
    if (!sheets?.key(ev)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }, true);
  document.addEventListener('input', (ev) => {
    const s = getSelection();
    const n = s?.anchorNode;
    const host = (ev as InputEvent).inputType === 'insertText' ? citeHost(app) : null;
    if (!host || !host.contains(ev.target as Node) || !s?.isCollapsed || !(n instanceof Text) || n.parentElement?.closest('code, mjx-container')) return;
    const before = n.data.slice(0, s.anchorOffset);
    if (before.endsWith('\\cite{') && before.lastIndexOf('\\(') <= before.lastIndexOf('\\)')) void cite({ host, typed: true });
  });
  document.addEventListener('click', (ev) => {
    const el = ev.target instanceof HTMLElement && ev.target.matches('cite[data-key]') ? ev.target : null;
    const host = el && app.hostOf(el);
    if (!el || !(host instanceof HTMLElement) || !app.current()?.contains(host) || host.closest('aside.notes') || ev.shiftKey || ev.metaKey || ev.ctrlKey || ev.defaultPrevented) return;
    host.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNode(el);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    picked = el;
    showFormat(app, 'citation');
    app.invalidate('selection');
  });
  document.addEventListener('selectionchange', () => {
    const r = picked && getSelection()?.rangeCount ? getSelection()!.getRangeAt(0) : null;
    if (!r || !document.querySelector('.reveal .slides')?.contains(r.startContainer)) return;
    const at = [...(picked!.parentNode?.childNodes ?? [])].indexOf(picked!);
    if (r.startContainer === picked!.parentNode && r.startOffset === at && r.endContainer === r.startContainer && r.endOffset === at + 1) return;
    picked = null;
    app.invalidate('selection');
  });
}
