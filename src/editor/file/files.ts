import type { App, Files, Line } from '../app.ts';
import { parseSource } from '../source.ts';
import { pair, renderDeck, type Pairing } from '../render.ts';
import { mathLookup } from '../math.ts';
import { coverSentences } from '../overflow.ts';
import { make, store, stored } from '../ui/dom.ts';
import { Dialog, host } from '../ui/dialog.ts';
import { display } from '../keymap.ts';
import { forget, loadRecents, pageOf, recentsOfPage, remember, type Recent } from './recent.ts';
import { startShow, writeDeck } from '../show.ts';

type PickerOptions = { types?: { description: string; accept: Record<string, string[]> }[]; multiple?: boolean; suggestedName?: string };
type Pickers = {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle>;
};

const SAVE_TYPES = [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }];
const AUTOSAVE_KEY = 'beeson-autosave';
const AUTOSAVE_DELAY = 1500;

const pickers = window as unknown as Pickers;
export const canPick = (): boolean => typeof pickers.showOpenFilePicker === 'function';
export const canWrite = (): boolean => typeof pickers.showSaveFilePicker === 'function';

export const fileName = (): string => decodeURIComponent(location.pathname.split('/').pop() || '') || 'index.html';
export const folder = (): string => decodeURIComponent(location.pathname).replace(/[^/]*$/, '');
const REPLACE = (): string => `Replace ${fileName()} in ${folder()} with it, or set the browser to ask where to save each download`;
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const clock = (): string => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export type Companions = { write(text: string, deck: FileSystemFileHandle): Promise<string>; download(text: string): string; dirty?(): boolean };
const companions: Companions[] = [];
export const addCompanion = (c: Companions): void => void companions.push(c);
const notes = (list: string[]): string => list.filter(Boolean).join('. ');
const companionsDirty = (): boolean => companions.some((c) => c.dirty?.());

export function download(name: string, text: string): string {
  const note = notes(companions.map((c) => c.download(text)));
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
  const a = make('a');
  a.href = url;
  a.download = name;
  host().append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return note;
}

export async function write(to: FileSystemFileHandle, text: string): Promise<string> {
  const written: string[] = [];
  for (const c of companions) written.push(await c.write(text, to));
  const note = notes(written);
  const writable = await to.createWritable();
  await writable.write(text);
  await writable.close();
  return note;
}

export async function pickTarget(app: App): Promise<boolean> {
  if (!pickers.showSaveFilePicker) return false;
  try {
    app.handle = await pickers.showSaveFilePicker({ suggestedName: app.handle?.name ?? fileName(), types: SAVE_TYPES });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}

function pickFile(): Promise<File | null> {
  return new Promise((done) => {
    const input = make('input');
    input.type = 'file';
    input.style.display = 'none';
    const finish = (file: File | null) => {
      input.remove();
      done(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    host().append(input);
    input.click();
  });
}

const ASK = {
  open: {
    text: 'Save them into the file first, open a file without them, or go on editing.',
    save: ['Save and open…', 'Save the edits into the file, then choose a file'],
    discard: ['Open without saving', 'Put the slides back as saved, then choose a file'],
  },
  present: {
    text: 'Save them into the file first, discard them and present the saved file, or go on editing.',
    save: ['Save and present', 'Save the edits into the file, then play the show'],
    discard: ['Discard changes', 'Put the slides back as saved, then play the show'],
  },
  export: {
    text: 'The PDF is printed from the file. Save the edits into it first, export the saved file without them, or go on editing.',
    save: ['Save and export', 'Save the edits into the file, then open its print view in a new tab'],
    discard: ['Export the saved file', 'Open the print view of the deck as saved in a new tab, and keep the edits here'],
  },
  pptx: {
    text: 'The PowerPoint file is written from the file. Save the edits into it first, export the saved file without them, or go on editing.',
    save: ['Save and export', 'Save the edits into the file, then show the command that writes the PowerPoint file'],
    discard: ['Export the saved file', 'Show the command that writes the PowerPoint file of the deck as saved, and keep the edits here'],
  },
  print: {
    text: 'The slides are printed from the file. Save the edits into it first, print the saved file without them, or go on editing.',
    save: ['Save and print', 'Save the edits into the file, then open its print view in a new tab'],
    discard: ['Print the saved file', 'Open the print view of the deck as saved in a new tab, and keep the edits here'],
  },
};

export type FileActions = {
  revert(): Promise<void>;
  openRecent(r: Recent): Promise<void>;
  exportPdf(action?: 'export' | 'print'): Promise<void>;
  exportHtml(): Promise<void>;
  exportPptx(): Promise<void>;
};
let actions: FileActions | null = null;
export function fileActions(): FileActions {
  if (!actions) throw new Error('the file of the deck is not installed');
  return actions;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export function install(app: App): void {
  const fail = (e: unknown) => app.fail(e);
  const later = (action: () => unknown) => Promise.resolve().then(action).catch(fail);

  const fileDialog = new Dialog({
    title: 'Choose the file of this deck',
    text: '',
    buttons: [{ label: `Choose ${fileName()}…`, value: 'choose', primary: true }],
    dismissable: false,
    stay: ['choose', 'recent'],
    onButton: (value) => later(() => {
      const last = recentsOfPage()[0];
      return value === 'recent' && last ? openRecent(last) : openFile();
    }),
  });
  let fileDialogRecent: Recent | null = null;

  const revertDialog = new Dialog({
    title: 'Do you want to revert to the most recently saved version?',
    text: 'Your current changes will be lost.',
    buttons: [
      { label: 'Revert', title: 'Forget the edits since the last save, and show the deck as it is saved in its file', value: 'revert', primary: true },
      { label: 'Cancel', title: 'Go on editing', value: 'cancel' },
    ],
    className: 'revert',
  });

  const ask = new Dialog({ title: 'The deck has unsaved changes', text: '', buttons: [], className: 'ask' });

  const pptxCommand = make('code');
  const pptxBody = make('p');
  pptxBody.append(pptxCommand);
  const pptxDialog = new Dialog({
    title: 'Export to PowerPoint',
    text: '',
    body: pptxBody,
    buttons: [
      { label: 'Copy Command', title: 'Put the command on the clipboard', value: 'copy', primary: true },
      { label: 'Close', value: 'close' },
    ],
    className: 'pptx',
    stay: ['copy'],
    onButton: (value) => {
      if (value !== 'copy') return;
      const button = pptxDialog.buttons.get('copy');
      void navigator.clipboard.writeText(pptxCommand.textContent ?? '').then(
        () => button && (button.textContent = 'Copied'),
        () => {
          app.note = { text: 'The command could not be copied to the clipboard', warn: true };
          app.report();
        },
      );
    },
  });

  const problemsList = make('ul');
  const problemsDialog = new Dialog({
    title: 'Texts that cannot be edited',
    body: problemsList,
    buttons: [{ label: 'Close', value: 'close', primary: true }],
    className: 'problems',
    onButton: () => later(closeProblems),
  });

  let saving = false;
  let again = false;
  let overwrite = false;
  let autosaveTimer = 0;
  let downloaded = false;

  const problemText = (p: Pairing['problems'][number]): string => `slide ${app.slideNumber(p.slide) ?? '?'}, ${p.tag}: ${p.reason}`;

  async function askFirst(action: keyof typeof ASK): Promise<'save' | 'discard' | null> {
    const words = ASK[action];
    ask.text.textContent = words.text;
    ask.setButtons([
      { label: words.save[0], title: words.save[1], value: 'save', primary: true },
      { label: words.discard[0], title: words.discard[1], value: 'discard' },
      { label: 'Cancel', title: 'Go on editing', value: 'cancel' },
    ]);
    const choice = await ask.open('cancel');
    return choice === 'save' || choice === 'discard' ? choice : null;
  }

  function showProblems(): void {
    problemsList.replaceChildren(...(app.pairing?.problems ?? []).map((p) => make('li', '', problemText(p))));
    void problemsDialog.open('close');
  }

  function closeProblems(): void {
    problemsDialog.close(null);
    const which = document.querySelector<HTMLButtonElement>('.beeson-edit-header button.which');
    if (which && !which.hidden) which.focus();
  }

  function line(): Line {
    const plain = (text: string, warn = false): Line => ({ text, warn, title: '' });
    if (app.state === 'waiting') return plain('Choose the file of this deck to start editing');
    const pairing = app.pairing;
    if (!pairing) return plain(app.note?.text ?? 'Loading', app.note?.warn ?? false);
    if (!pairing.texts.length) return plain('This file is not the deck on the page', true);
    const problems = pairing.problems;
    const first = app.session ? app.session.status : app.dirty ? 'Unsaved changes' : app.note?.text ?? 'No unsaved changes';
    const parts = first ? [first] : [];
    const warn = app.note?.warn ?? false;
    if (app.note && (app.session || (app.dirty && warn))) parts.push(app.note.text);
    if (problems.length) parts.push(`${plural(problems.length, 'text')} cannot be edited`);
    const past = app.overflow - app.overFigure;
    if (past) parts.push(`${plural(past, 'text')} run${past === 1 ? 's' : ''} past the slide or into its footnote`);
    if (app.overFigure) parts.push(...coverSentences());
    if (app.autosave && !app.handle && canWrite() && !app.session) parts.push('autosave starts after the first save');
    const changed = app.follow?.line();
    if (changed) parts.push(changed);
    return { text: parts.map((p, i) => (i < parts.length - 1 ? p.replace(/\.$/, '') : p)).join('. '), warn: warn || problems.length > 0 || app.overflow > 0, title: problems.map(problemText).join('\n') };
  }

  function open(text: string, fresh = true): void {
    app.tagEdits.clear();
    if (fresh) {
      app.history.clear();
      app.move.select(null);
    }
    try {
      app.source = parseSource(text);
      app.saved = text;
      app.pairing = pair(app.source, app.slides(), mathLookup());
      app.state = 'loaded';
      app.dirty = false;
      if (!app.pairing.texts.length) app.pairing.problems.push({ slide: null, tag: 'slides', reason: 'nothing on the page was found in the file' });
    } catch (error) {
      app.source = null;
      app.saved = null;
      app.pairing = null;
      app.state = 'error';
      app.note = { text: error instanceof Error ? error.message : String(error), warn: true };
    }
    app.typing.attach();
    app.emit('open');
    app.report();
    app.invalidate();
    if (fresh) app.drafts.offer();
  }

  function render(): string {
    if (!app.source || !app.pairing) throw new Error('no file is open');
    return renderDeck(app.source, app.pairing, mathLookup(), app.tagEdits).text;
  }

  async function discardEdits(): Promise<void> {
    while (app.history.canUndo && !readsAsSaved()) await app.history.undo();
    app.history.clear();
    app.move.select(null);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.clearTimeout(autosaveTimer);
    app.drafts.drop();
    app.dirty = false;
    app.report();
  }

  async function readyToOpen(): Promise<boolean> {
    app.note = null;
    if (!app.dirty) return true;
    const choice = await askFirst('open');
    if (!choice) return false;
    if (choice === 'save') {
      await save();
      return !app.dirty;
    }
    await discardEdits();
    return true;
  }

  let kept: FileSystemFileHandle | null = null;
  const keep = (handle: FileSystemFileHandle): void => {
    kept = handle;
    void remember(handle).catch(() => {});
  };

  async function openHandle(handle: FileSystemFileHandle): Promise<void> {
    const text = await (await handle.getFile()).text();
    app.handle = handle;
    open(text);
    app.follow.read(text);
    if (app.pairing?.texts.length) keep(handle);
  }

  async function openFile(): Promise<void> {
    if (app.session || !(await readyToOpen())) return;
    if (canPick() && pickers.showOpenFilePicker) {
      let picked: FileSystemFileHandle[];
      try {
        picked = await pickers.showOpenFilePicker({ multiple: false });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        throw error;
      }
      await openHandle(picked[0]);
      return;
    }
    const file = await pickFile();
    if (!file) return;
    app.handle = null;
    open(await file.text());
  }

  async function permitted(handle: FileSystemFileHandle): Promise<boolean> {
    type Asking = { queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>; requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState> };
    const h = handle as FileSystemFileHandle & Asking;
    const mode = { mode: 'readwrite' } as const;
    if (!h.queryPermission || (await h.queryPermission(mode)) === 'granted') return true;
    return (await h.requestPermission?.(mode)) === 'granted';
  }

  async function openRecent(r: Recent): Promise<void> {
    if (app.session || !(await readyToOpen())) return;
    if (r.page !== pageOf()) {
      location.assign(r.page + location.search);
      return;
    }
    if (!(await permitted(r.handle))) {
      app.note = { text: `The browser was not allowed to open ${r.name}`, warn: true };
      app.report();
      return;
    }
    try {
      await openHandle(r.handle);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
      await forget(r.handle);
      app.note = { text: `${r.name} was moved or deleted, and it was taken off Open Recent`, warn: true };
      app.report();
    }
  }

  async function revert(): Promise<void> {
    if (!app.dirty || app.session) return;
    if ((await revertDialog.open('cancel')) !== 'revert') return;
    window.clearTimeout(autosaveTimer);
    app.drafts.drop();
    app.dirty = false;
    keepSlide(app);
    location.reload();
  }

  function deckAddress(extra: string[] = []): string {
    const params = new URLSearchParams(location.search);
    for (const name of ['edit', 'session', 'v']) params.delete(name);
    for (const name of extra) params.set(name, '');
    const query = params.toString().replace(/=(?=&|$)/g, '');
    return `${pageOf()}${query ? `?${query}` : ''}`;
  }

  async function savedFirst(action: 'present' | 'export' | 'print' | 'pptx'): Promise<boolean> {
    if (app.session) await app.session.sent();
    if (!app.dirty || app.session) return true;
    const choice = await askFirst(action);
    if (!choice) return false;
    if (choice === 'save') await save();
    return choice === 'discard' || !app.dirty;
  }

  async function exportPdf(action: 'export' | 'print' = 'export'): Promise<void> {
    if (!(await savedFirst(action))) return;
    const win = window.open(deckAddress(['print-pdf', 'still']), '_blank');
    const key = display('Mod+P', app.platform);
    const then = action === 'print' ? 'choose a printer' : 'choose Save as PDF';
    if (!win) {
      app.note = { text: `The print view could not be opened. Allow this page to open a tab, and ${action} again`, warn: true };
      app.report();
      return;
    }
    app.note = { text: `The print view of ${fileName()} is open in a new tab, with one page per step. In its print dialog, ${then}`, warn: false };
    app.report();
    if (!(await printWhenReady(win))) {
      app.note = { text: `The print view of ${fileName()} is open in a new tab, with one page per step. Press ${key} there and ${then}`, warn: false };
      app.report();
    }
  }

  async function exportPptx(): Promise<void> {
    if (!(await savedFirst('pptx'))) return;
    const name = app.handle?.name ?? fileName();
    const where = location.protocol === 'file:' && name === fileName() ? `, i.e. ${folder()}` : '';
    pptxCommand.textContent = name === 'index.html' ? 'npm run pptx' : `npm run pptx -- ${name}`;
    pptxDialog.text.textContent = `Run this command in the folder of the deck${where}. slides.pptx is then written from the saved ${name}, with one click per step.`;
    const copy = pptxDialog.buttons.get('copy');
    if (copy) copy.textContent = 'Copy Command';
    await pptxDialog.open('copy');
  }

  async function exportHtml(): Promise<void> {
    if (!app.source || !app.pairing) {
      app.note = { text: 'Choose the file of this deck first', warn: true };
      app.report();
      return;
    }
    const text = render();
    if (pickers.showSaveFilePicker) {
      let to: FileSystemFileHandle;
      try {
        to = await pickers.showSaveFilePicker({ suggestedName: fileName(), types: SAVE_TYPES });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        throw error;
      }
      const also = await write(to, text);
      app.note = { text: `Exported a copy of the deck to ${to.name} at ${clock()}${also ? `. ${also}` : ''}`, warn: false };
    } else {
      const also = download(fileName(), text);
      app.note = { text: `A copy of the deck is in your downloads${also ? `. ${also}` : ''}`, warn: false };
    }
    app.report();
  }

  async function save(): Promise<void> {
    if (app.session) return app.session.save();
    if (saving) {
      again = true;
      return;
    }
    saving = true;
    app.follow.begin();
    try {
      await doSave();
    } finally {
      saving = false;
      app.follow.end();
    }
    if (again) {
      again = false;
      if (app.dirty) await save();
    }
  }

  async function doSave(): Promise<void> {
    if (!app.source || !app.pairing) {
      app.note = { text: 'Choose the file of this deck first', warn: true };
      app.report();
      return;
    }
    if (!app.handle && canWrite() && !(await pickTarget(app))) return;
    if (app.handle && !overwrite) {
      const merged = await app.follow.merge(app.handle);
      if (merged === 'merged' || merged === 'cancelled') return;
    }
    overwrite = false;
    const rendered = renderDeck(app.source, app.pairing, mathLookup(), app.tagEdits);
    const n = rendered.edits.length;
    const edits = plural(n, 'edit');
    let text: string;
    if (app.handle) {
      const also = await write(app.handle, rendered.text);
      app.follow.written(rendered.text);
      if (app.handle !== kept) keep(app.handle);
      text = (n ? `Saved ${edits} to ${app.handle.name} at ${clock()}` : `Saved ${app.handle.name} at ${clock()}`) + (also ? `. ${also}` : '');
    } else {
      const also = download(fileName(), rendered.text);
      downloaded = true;
      text = `${n ? `Saved a copy with ${edits}` : `Saved a copy of ${fileName()}`}. ${REPLACE()}${also ? `. ${also}` : ''}`;
    }
    app.saved = rendered.text;
    app.history.break();
    const warnings = rendered.warnings.length ? `, ${rendered.warnings.join(', ')}` : '';
    app.note = { text: `${text}${warnings}`, warn: rendered.warnings.length > 0 };
    if (render() === rendered.text) {
      open(rendered.text, false);
      app.drafts.drop();
    } else {
      app.report();
      scheduleAutosave();
    }
  }

  async function saveAs(): Promise<void> {
    if (app.session) return app.session.save();
    if (!app.source || !app.pairing) {
      app.note = { text: 'Choose the file of this deck first', warn: true };
      app.report();
      return;
    }
    if (canWrite() && !(await pickTarget(app))) return;
    overwrite = canWrite();
    await save();
  }

  function readsAsSaved(): boolean {
    try {
      return app.saved !== null && render() === app.saved && !companionsDirty();
    } catch {
      return false;
    }
  }

  function cleanIfSaved(): void {
    if (!app.source || !app.pairing || app.saved === null || companionsDirty()) return;
    try {
      if (render() !== app.saved) return;
    } catch {
      return;
    }
    app.dirty = false;
    window.clearTimeout(autosaveTimer);
    app.drafts.drop();
    app.report();
  }

  function scheduleAutosave(): void {
    window.clearTimeout(autosaveTimer);
    if (!app.autosave || !app.handle || app.session) return;
    autosaveTimer = window.setTimeout(() => {
      if (app.dirty && !saving) void save().catch((e) => app.fail(e));
    }, AUTOSAVE_DELAY);
  }

  function toggleAutosave(): void {
    app.autosave = !app.autosave;
    store(AUTOSAVE_KEY, app.autosave ? '1' : '0');
    if (app.dirty) scheduleAutosave();
    app.report();
  }

  async function present(hash = '', tab = false): Promise<{ win: Window | null } | null> {
    const choice = app.session ? 'save' : app.dirty ? await askFirst('present') : 'saved';
    if (!choice) return null;
    const later = choice === 'save' && !app.session && !tab && !app.handle && !canWrite();
    const show = tab ? null : startShow(app, later ? () => void save().catch((e) => app.fail(e)) : undefined);
    if (choice === 'save' && !later) await (app.session ? app.session.sent() : save()).catch((e) => (show?.end(), Promise.reject(e)));
    if (choice === 'discard') await discardEdits();
    if (choice === 'save' && app.dirty && !later && !app.session) {
      show?.end();
      return null;
    }
    const text = later ? render() : downloaded && !app.handle ? app.saved : null;
    const url = `${deckAddress(show ? [] : ['from-editor'])}${hash}`;
    if (show) return { win: show.load(url, text) };
    const win = window.open(text === null ? url : '', '_blank');
    if (win && text !== null) writeDeck(win, url, text);
    return { win };
  }

  const files: Files = {
    open,
    render,
    save,
    saveAs,
    openFile,
    present,
    toggleAutosave,
    line,
    showProblems,
    closeProblems,
    problemsShown: () => !problemsDialog.el.hidden,
    askShown: () => !ask.el.hidden,
    cancelAsk: () => ask.close(null),
  };
  app.files = files;
  actions = { revert, openRecent, exportPdf, exportHtml, exportPptx };
  app.autosave = canWrite() && stored(AUTOSAVE_KEY) === '1';

  app.listen('report', () => {
    if (app.state !== 'waiting' || app.session) {
      fileDialog.close(null);
      return;
    }
    const where = `${fileName()} in ${folder()}, i.e. the file that is open here`;
    const last = canPick() ? recentsOfPage()[0] ?? null : null;
    const when = last ? new Date(last.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    const again = last ? ` Open ${last.name}, the file of this deck that you chose on ${when}, or choose it again.` : '';
    fileDialog.text.textContent = canWrite()
      ? `A browser writes only to a file that you have chosen. Choose ${where}, and your edits are saved into it.${again}`
      : `This browser does not write to a file by itself. Choose ${where}. A save is then a download of a copy with your edits. Set the browser to ask where to save each download, and you choose ${fileName()} in its folder and replace it.`;
    if (last !== fileDialogRecent) {
      fileDialogRecent = last;
      fileDialog.setButtons(last
        ? [
          { label: `Open ${last.name}`, title: `Open the file of this deck that you chose on ${when}`, value: 'recent', primary: true },
          { label: `Choose ${fileName()}…`, value: 'choose' },
        ]
        : [{ label: `Choose ${fileName()}…`, value: 'choose', primary: true }]);
      if (fileDialog.shown) fileDialog.buttons.get(last ? 'recent' : 'choose')?.focus({ preventScroll: true });
    }
    if (!fileDialog.shown) void fileDialog.open(last ? 'recent' : 'choose');
  });
  void loadRecents().then(() => app.report()).catch(() => {});
  app.listen('history', () => {
    if (app.dirty) cleanIfSaved();
  });
  app.listen('dirty', scheduleAutosave);
  app.listen('session', () => {
    window.clearTimeout(autosaveTimer);
    if (!app.session && app.state === 'loaded') app.markDirty();
  });
  window.addEventListener('beforeunload', (ev) => { if (app.dirty && !app.session) ev.preventDefault(); });
}

export function keepSlide(app: App): void {
  const d = app.deck();
  const current = app.current();
  if (!d || !current) return;
  const { h, v } = d.getIndices(current);
  history.replaceState(history.state, '', `${location.pathname}${location.search}${v ? `#/${h}/${v}` : h ? `#/${h}` : ''}`);
}

async function printWhenReady(win: Window): Promise<boolean> {
  type View = Window & { Reveal?: { isReady(): boolean }; MathJax?: { startup?: { promise?: Promise<unknown> } }; Beeson?: { backdrops?: { ready: Promise<unknown> }[] } };
  const view = win as View;
  const until = Date.now() + 60000;
  let loaded = false;
  while (Date.now() < until) {
    await sleep(100);
    if (win.closed) return true;
    let d: Document;
    try {
      d = view.document;
      if (!d.URL.includes('print-pdf')) continue;
    } catch {
      return false;
    }
    if (typeof view.Reveal?.isReady !== 'function' || !view.Reveal.isReady() || !d.querySelector('.pdf-page') || d.querySelector('.reveal-viewport.loading-scroll-mode')) continue;
    if (!loaded) {
      loaded = true;
      await d.fonts.ready;
      await view.MathJax?.startup?.promise;
      await Promise.all((view.Beeson?.backdrops ?? []).map((b) => b.ready));
      d.querySelectorAll<HTMLVideoElement>('video[preload="none"]').forEach((video) => {
        video.preload = 'auto';
        video.load();
      });
    }
    const videos = [...d.querySelectorAll('video')].every((v) => v.readyState >= 2 || v.error || !v.getClientRects().length);
    const viewers = [...d.querySelectorAll('tycho-viewer')].every((v) => v.shadowRoot?.querySelector('.status.error'));
    if (!videos || !viewers || ![...d.images].every((i) => i.complete)) continue;
    await new Promise((done) => view.requestAnimationFrame(() => view.requestAnimationFrame(done)));
    win.focus();
    win.print();
    return true;
  }
  return false;
}

export async function fetchSource(app: App): Promise<boolean> {
  if (location.protocol === 'file:') return false;
  try {
    const response = await fetch(location.href.split(/[?#]/)[0], { cache: 'no-store' });
    if (!response.ok) return false;
    const text = await response.text();
    app.files.open(text);
    app.follow.read(text);
    return true;
  } catch {
    return false;
  }
}
