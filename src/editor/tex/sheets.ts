// the Preamble and Bibliography sheets of the File menu, built into theme/editor-tex.js and loaded
// by tex/install.ts at their first use. a sheet edits preamble.tex or references.bib next to the
// deck with a live effect on the open deck, and a save writes the changed sources and tex.js, with
// the text that npm run tex writes. the files are read over http, from the folder of the deck in
// Chrome and Edge, or from the files chosen with a file input elsewhere. the list of the
// bibliography of tex/cite.ts reads the same files through the store

import { readBibtex, type Bibliography, type Entry } from '../../bibtex.ts';
import { readPreamble, type MacroDef, type Preamble, type Resolve, type Skipped } from '../../preamble.ts';
import { matches, referenceOf, referenceParts } from '../../reference.ts';
import { texOf, texScript, type Tex } from '../../texfile.ts';
import type { App } from '../app.ts';
import type { Entry as Step } from '../history.ts';
import { trapTab } from '../ui/dialog.ts';
import { injectStyle, make } from '../ui/dom.ts';
import { citations, type Store } from './cite.ts';
import type { TexHost, TexSheets, Which } from './install.ts';

const CSS = `
dialog.beeson-edit-dialog.beeson-edit-tex { width: min(920px, calc(100vw - 32px)); }
.beeson-edit-tex .note:empty, .beeson-edit-tex .pick[hidden] { display: none; }
.beeson-edit-tex .pick { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 12px; }
.beeson-edit-tex .body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; height: min(60vh, 520px); margin-bottom: 12px; }
.beeson-edit-tex .body > * { min-height: 0; overflow: auto; }
.beeson-edit-tex .side { display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.beeson-edit-tex textarea { box-sizing: border-box; width: 100%; height: 100%; resize: none; padding: 8px; font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace; border: 1px solid var(--ed-control-line, var(--ed-line)); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); }
.beeson-edit-tex .side textarea { flex: 1; min-height: 120px; }
.beeson-edit-tex input[type="search"] { font: inherit; padding: 4px 8px; border: 1px solid var(--ed-control-line, var(--ed-line)); border-radius: 6px; background: var(--ed-control); color: var(--ed-text); }
.beeson-edit-tex h4 { margin: 12px 0 4px; font: 600 12px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ed-muted); }
.beeson-edit-tex h4:first-child { margin-top: 0; }
.beeson-edit-tex .defs > div { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; padding: 3px 0; border-bottom: 1px solid var(--ed-menu-line); }
.beeson-edit-tex .defs span { color: var(--ed-muted); }
.beeson-edit-tex .defs .sample { margin-left: auto; color: var(--ed-text); }
.beeson-edit-tex .entries { flex: 1; min-height: 0; overflow: auto; }
.beeson-edit-tex .entries button { display: block; width: 100%; padding: 5px 8px; border: 0; border-radius: 5px; background: none; color: var(--ed-text); font: inherit; text-align: left; }
.beeson-edit-tex .entries button.on { background: var(--ed-select); color: var(--ed-on-select); }
.beeson-edit-tex .entries code { margin-left: 6px; color: inherit; opacity: 0.7; }
.beeson-edit-tex .entries .skipped { padding: 5px 8px; color: var(--ed-muted); }
.beeson-edit-tex p.preview { margin: 0; min-height: 1.45em; color: var(--ed-text); }
@media (max-width: 640px) {
  .beeson-edit-tex .body { grid-template-columns: minmax(0, 1fr); height: auto; }
  .beeson-edit-tex .body > *, .beeson-edit-tex .side { overflow: visible; }
  .beeson-edit-tex textarea, .beeson-edit-tex .side textarea { height: 40vh; flex: none; }
  .beeson-edit-tex .entries { max-height: 40vh; }
}
`;

const SOURCE: Record<Which, string> = { preamble: 'preamble.tex', bibliography: 'references.bib' };
const LABEL: Record<Which, string> = { preamble: 'Edit Preamble', bibliography: 'Edit Bibliography' };
// as in TeX and in npm run tex, a file is looked up next to the preamble, and \input adds .tex to
// a name without an extension
const NAMES: Record<'input' | 'package' | 'class', (name: string) => string[]> = {
  input: (name) => (/\.[A-Za-z]+$/.test(name) ? [name] : [`${name}.tex`, name]),
  package: (name) => [`${name}.sty`],
  class: (name) => [`${name}.cls`],
};
// the inputs of one source less than this apart, in ms, are one entry of the history, as typing is
const PAUSE = 1000;
// MathJax reads a formula again from this state, i.e. before it is compiled
const COMPILED = 20;

type Reader = (name: string) => Promise<string | null>;
type State = { text: string; start: number; end: number };
type MathMap = { remove(name: string): void };
type MathJaxTex = {
  tex2svgPromise?(tex: string, options?: { display?: boolean }): Promise<Element>;
  startup?: {
    promise: Promise<unknown>;
    document?: {
      inputJax: { parseOptions?: { handlers: { retrieve(name: string): MathMap | null } } }[];
      getMathItemsWithin(nodes: Element[]): { math: string; typesetRoot?: Element; rerender(document: unknown, start: number): void }[];
    };
  };
};

const listed = (names: string[]): string => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// the text of a file over http, null when the server does not have it
const fetched: Reader = async (name) => {
  const response = await fetch(new URL(name, location.href), { cache: 'no-store' });
  if (response.ok) return await response.text();
  if (response.status === 404) return null;
  throw new Error(`${name} answered ${response.status}`);
};

function inFolder(folder: FileSystemDirectoryHandle): Reader {
  return async (name) => {
    try {
      const parts = name.split('/');
      let dir = folder;
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      return await (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).text();
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError')) return null;
      throw error;
    }
  };
}

// a file chosen with the file input, by its name. a file that is not chosen is not read, since a
// browser does not tell whether it is next to the deck, apart from a package or a class, which is
// taken as one of the TeX installation, e.g. physics.sty
function chosenFiles(files: Map<string, File>): Reader {
  return async (name) => {
    const file = files.get(name) ?? files.get(name.slice(name.lastIndexOf('/') + 1));
    if (!file && /\.(sty|cls)$/.test(name)) return null;
    if (!file) throw new Error(`${name} is not chosen`);
    return await file.text();
  };
}

// the TeX that defines a macro or an environment of the preamble at run time
function newcommand(name: string, def: MacroDef): string {
  const [body, args = 0, preset] = Array.isArray(def) ? def : [def];
  return `\\newcommand{\\${name}}${args ? `[${args}]` : ''}${preset === undefined ? '' : `[${preset}]`}{${body}}`;
}
function newenvironment(name: string, [begin, end, args = 0, preset]: Tex['environments'][string]): string {
  return `\\newenvironment{${name}}${args ? `[${args}]` : ''}${preset === undefined ? '' : `[${preset}]`}{${begin}}{${end}}`;
}

function sheets(host: TexHost): TexSheets {
  const app: App = host.app;
  const start = host.start;
  injectStyle('tex', CSS);

  // the files next to the deck by name: the text, null for a file that is not there, and undefined
  // for a file that could not be read
  const files = new Map<string, string | null | undefined>();
  let reader: Reader | null = null;
  let loading: Promise<void> | null = null;
  let loaded = false;
  const text: Record<Which, string> = { preamble: '', bibliography: '' };
  const saved: Record<Which, string> = { preamble: '', bibliography: '' };
  // the tex.js next to the deck, as it was read or last written
  let known: string | null = null;
  let preamble: Preamble = readPreamble('');
  // the files that the preamble follows and that are not read
  let unreadFollowed: string[] = [];
  let bib: Bibliography = readBibtex('');
  // the entry of the bibliography in its sheet, from start up to end in its text
  let range = { start: -1, end: -1 };

  const read = async (name: string): Promise<string | null | undefined> => {
    if (!files.has(name)) {
      let found: string | null | undefined;
      try {
        found = await reader!(name);
      } catch {
        found = undefined;
      }
      files.set(name, found);
    }
    return files.get(name);
  };
  const unreadSource = (which: Which): boolean => files.has(SOURCE[which]) && files.get(SOURCE[which]) === undefined;

  // the preamble read with the files that it follows, and the files that are not read yet
  function scan(): { preamble: Preamble; wanted: string[]; unread: string[] } {
    const wanted = new Set<string>();
    const unread = new Set<string>();
    const resolve: Resolve = (name, kind) => {
      for (const file of NAMES[kind](name.replace(/^\.\//, ''))) {
        if (!files.has(file)) {
          wanted.add(file);
          return null;
        }
        const found = files.get(file);
        if (found === undefined) {
          unread.add(file);
          return null;
        }
        if (found !== null) return { file, text: found };
      }
      return null;
    };
    return { preamble: readPreamble(text.preamble, { file: SOURCE.preamble, resolve }), wanted: [...wanted], unread: [...unread] };
  }

  async function follow(): Promise<void> {
    for (;;) {
      const s = scan();
      if (!s.wanted.length) {
        preamble = s.preamble;
        unreadFollowed = s.unread;
        return;
      }
      await Promise.all(s.wanted.map(read));
    }
  }

  const deckText = (): string => {
    try {
      return app.files.render();
    } catch {
      return app.saved ?? '';
    }
  };
  const unreadNames = (followed: string[]): string[] => [...(['preamble', 'bibliography'] as Which[]).filter(unreadSource).map((w) => SOURCE[w]), ...followed];

  async function load(): Promise<void> {
    const [p, b, t] = await Promise.all([SOURCE.preamble, SOURCE.bibliography, 'tex.js'].map(read));
    text.preamble = saved.preamble = p ?? '';
    text.bibliography = saved.bibliography = b ?? '';
    await follow();
    bib = readBibtex(text.bibliography);
    if (typeof t === 'string') known = t;
    else if (start) known = texScript(start);
    else if (!unreadNames(unreadFollowed).length) known = texScript(texOf(preamble, bib, deckText()).tex);
    loaded = true;
  }

  // the sheet, one dialog for both sources
  const dialog = make('dialog', 'beeson-edit-dialog beeson-edit-tex') as HTMLDialogElement;
  dialog.setAttribute('aria-modal', 'true');
  const heading = make('h3');
  heading.id = 'beeson-edit-tex-title';
  dialog.setAttribute('aria-labelledby', heading.id);
  const note = make('p', 'note');
  const pick = make('label', 'pick');
  const input = make('input');
  input.type = 'file';
  input.multiple = true;
  pick.append('Files of the Deck', input);
  pick.hidden = true;
  const body = make('div', 'body');
  const source = make('textarea');
  source.spellcheck = false;
  source.setAttribute('aria-label', SOURCE.preamble);
  const defs = make('div', 'defs');
  const search = make('input');
  search.type = 'search';
  search.placeholder = 'Author, year, title, or key';
  search.setAttribute('aria-label', 'Search');
  const entries = make('div', 'entries');
  const slice = make('textarea');
  slice.spellcheck = false;
  slice.placeholder = 'Choose an entry';
  slice.setAttribute('aria-label', 'BibTeX of the entry');
  const preview = make('p', 'preview');
  preview.setAttribute('aria-live', 'polite');
  const left = make('div', 'side');
  left.append(search, entries);
  const right = make('div', 'side');
  right.append(slice, preview);
  const row = make('div', 'row');
  const done = make('button', 'primary', 'Done');
  done.type = 'button';
  row.append(done);
  dialog.append(heading, note, pick, body, row);
  dialog.hidden = true;
  document.body.append(dialog);

  let shown: Which = 'preamble';
  let back: HTMLElement | null = null;
  const close = (): void => {
    if (!dialog.open) return;
    dialog.close();
    dialog.hidden = true;
    if (back?.isConnected) back.focus({ preventScroll: true });
    back = null;
  };
  done.addEventListener('click', close);
  // the cancel of the file input bubbles up to the sheet, which stays open
  dialog.addEventListener('cancel', (ev) => {
    if (ev.target !== dialog) return;
    ev.preventDefault();
    close();
  });
  // Esc closes the sheet, and the keys of the history undo the edits of the sources with the other
  // edits of the deck, since the region of a dialog does not take them
  dialog.addEventListener('keydown', (ev) => {
    const mod = app.platform === 'mac' ? ev.metaKey || ev.ctrlKey : ev.ctrlKey;
    const key = ev.key.toLowerCase();
    if (ev.key === 'Escape') close();
    else if (ev.key === 'Tab') trapTab(dialog, ev);
    else if (mod && !ev.altKey && key === 'z') void (ev.shiftKey ? app.history.redo() : app.history.undo());
    else if (mod && !ev.altKey && key === 'y' && app.platform !== 'mac') void app.history.redo();
    else {
      // the keys that press a button are kept from the key handler of reveal.js
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target instanceof HTMLButtonElement) ev.stopPropagation();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
  });

  // the store, read once with the reader of the page. a deck opened from a file is read from its
  // folder in Chrome and Edge, and from the files chosen with the input elsewhere
  // the files chosen with the input, which can be chosen again to add a file that is not read
  const picked = new Map<string, File>();
  let choosing = false;
  async function more(list: FileList): Promise<void> {
    for (const file of list) picked.set(file.name, file);
    for (const [name, found] of [...files]) if (typeof found !== 'string' && (picked.has(name) || picked.has(name.slice(name.lastIndexOf('/') + 1)))) files.delete(name);
    if (!loaded) return;
    for (const which of ['preamble', 'bibliography'] as Which[]) {
      if (files.has(SOURCE[which])) continue;
      text[which] = saved[which] = (await read(SOURCE[which])) ?? '';
    }
    if (!files.has('tex.js')) {
      const found = await read('tex.js');
      if (typeof found === 'string') known = found;
    }
    await update();
  }
  function choose(): Promise<Reader> {
    if (/^https?:$/.test(location.protocol)) return Promise.resolve(fetched);
    const chosen = new Promise<Reader>((resolve) => {
      input.onchange = () => {
        if (!input.files?.length) return;
        const first = !picked.size;
        void more(input.files).then(() => first && resolve(chosenFiles(picked)));
        input.value = '';
      };
    });
    const ask = (reason = ''): Promise<Reader> => {
      choosing = true;
      note.textContent = `${reason}Choose the folder of the deck, i.e. choose ${SOURCE.preamble}, ${SOURCE.bibliography}, tex.js, and the files that the preamble inputs, since a browser reads the files next to a deck opened from a file only after you choose them.`;
      pick.hidden = false;
      input.focus();
      return chosen;
    };
    const handle = app.handle;
    if (!handle || !('showDirectoryPicker' in window) || !window.showDirectoryPicker) return ask();
    return host.folder(handle, `${SOURCE.preamble} and ${SOURCE.bibliography}`).then(inFolder, (error: unknown) => ask(`${error instanceof Error ? error.message : String(error)}. `));
  }
  const ensure = (): Promise<void> =>
    (loading ??= choose().then((r) => {
      reader = r;
      return load();
    }));

  // the deck drawn with the sources as they are now: tex.js in window.beesonTex, the macros and the
  // environments in MathJax, the theorems numbered, and the references drawn
  let queue: Promise<unknown> = Promise.resolve();
  const has = { macros: { ...start?.macros }, environments: { ...start?.environments }, packages: new Set(start?.packages ?? []) };
  const mathjax = (): MathJaxTex | null => {
    const mj = (window as unknown as { MathJax?: MathJaxTex }).MathJax;
    return mj?.tex2svgPromise && mj.startup?.document ? mj : null;
  };
  const refresh = (): void => (window as unknown as { Beeson?: { refreshChrome?(): void } }).Beeson?.refreshChrome?.();

  // the definitions that differ from those of MathJax are given to it, and the formulas that use
  // them are typeset again. a macro taken out of the preamble is taken out of the maps of MathJax
  function define(tex: Tex): Promise<unknown> {
    return (queue = queue.then(async () => {
      const mj = mathjax();
      if (!mj) return;
      await mj.startup!.promise;
      const doc = mj.startup!.document!;
      const maps = (names: string[]) => names.map((name) => doc.inputJax.find((jax) => jax.parseOptions)?.parseOptions?.handlers.retrieve(name)).filter((m): m is MathMap => !!m);
      const steps: string[] = [];
      const touched: string[] = [];
      let errors = false;
      for (const p of tex.packages) {
        if (has.packages.has(p)) continue;
        has.packages.add(p);
        steps.push(`\\require{${p}}`);
        errors = true;
      }
      for (const [name, def] of Object.entries(tex.macros)) {
        if (same(def, has.macros[name])) continue;
        has.macros[name] = def;
        steps.push(newcommand(name, def));
        touched.push(`\\${name}`);
      }
      for (const name of Object.keys(has.macros)) {
        if (name in tex.macros) continue;
        delete has.macros[name];
        for (const map of maps(['new-Command', 'configmacros-map'])) map.remove(name);
        touched.push(`\\${name}`);
      }
      for (const [name, def] of Object.entries(tex.environments)) {
        if (same(def, has.environments[name])) continue;
        has.environments[name] = def;
        steps.push(newenvironment(name, def));
        touched.push(`{${name}}`);
      }
      for (const name of Object.keys(has.environments)) {
        if (name in tex.environments) continue;
        delete has.environments[name];
        for (const map of maps(['new-Environment', 'configmacros-env-map'])) map.remove(name);
        touched.push(`{${name}}`);
      }
      if (!steps.length && !touched.length) return;
      for (const step of steps) await mj.tex2svgPromise!(step).catch(() => null);
      const uses = (math: string) => touched.some((name) => {
        const at = math.indexOf(name);
        return at >= 0 && !/[A-Za-z]/.test(math[at + name.length] ?? '');
      });
      for (const item of doc.getMathItemsWithin([document.body])) {
        if (!uses(item.math) && !(errors && item.typesetRoot?.querySelector('[data-mjx-error], [fill="red"]'))) continue;
        try {
          item.rerender(doc, COMPILED);
        } catch {
          // a formula that MathJax cannot typeset again keeps its former drawing
        }
      }
      app.invalidate('content');
    }).catch(() => null));
  }

  // the sample of a macro, typeset once for each definition
  const samples = new Map<string, Promise<Element | null>>();
  function sample(name: string, def: MacroDef): Promise<Element | null> {
    const key = `${name} ${JSON.stringify(def)}`;
    let found = samples.get(key);
    if (!found) {
      const args = Array.isArray(def) ? def[1] : 0;
      found = (queue = queue.then(async () => {
        const node = await mathjax()?.tex2svgPromise?.(`\\${name}${'{x}'.repeat(args)}`, { display: false });
        return node && !node.querySelector('[data-mjx-error]') ? node.querySelector('svg') : null;
      }).catch(() => null)) as Promise<Element | null>;
      samples.set(key, found);
    }
    return found;
  }

  function live(): void {
    const { tex } = texOf(preamble, bib, deckText());
    (window as unknown as { beesonTex?: Tex }).beesonTex = tex;
    refresh();
    void define(tex);
  }

  // the lists of the sheets
  const line = (attrs: Record<string, string>, ...parts: (string | Node)[]): HTMLElement => {
    const div = make('div');
    for (const [name, value] of Object.entries(attrs)) div.setAttribute(name, value);
    parts.forEach((part, k) => div.append(...(k ? [' ', part] : [part])));
    return div;
  };
  const code = (t: string) => make('code', '', t);
  const span = (t: string) => make('span', '', t);
  const section = (title: string, rows: HTMLElement[]): HTMLElement[] => (rows.length ? [make('h4', '', title), ...rows] : []);
  const skippedLine = (s: Skipped) => line({ class: 'skipped' }, code(`${s.file}:${s.line}`), code(s.text), span(s.reason));
  const kindText = (name: string, counter: string | null) => (counter === null ? 'unnumbered' : counter === name ? 'numbered' : `numbered with ${counter}`);

  function fillDefs(): void {
    const unread = unreadNames(unreadFollowed);
    defs.replaceChildren(
      ...section('Macros', Object.entries(preamble.macros).map(([name, def]) => {
        const shown = make('span', 'sample');
        shown.setAttribute('aria-hidden', 'true');
        void sample(name, def).then((svg) => svg && shown.append(svg.cloneNode(true)));
        return line({ 'data-macro': name }, code(`\\${name}`), span(plural(Array.isArray(def) ? def[1] : 0, 'argument')), shown);
      })),
      ...section('Environments', Object.entries(preamble.environments).map(([name, def]) => line({ 'data-environment': name }, code(name), span(plural(def[2] ?? 0, 'argument'))))),
      ...section('Kinds of Theorem', Object.entries(preamble.theorems).map(([name, kind]) => line({ 'data-kind': name }, code(name), span(`${kind.title}, ${kind.style}, ${kindText(name, kind.counter)}`)))),
      ...section('Skipped Lines', preamble.skipped.map(skippedLine)),
      ...section('Unread Files', unread.map((name) => line({ 'data-unread': name }, code(name), span('is not read, hence tex.js is not written')))),
    );
  }

  function showPreview(): void {
    if (range.start < 0) {
      preview.textContent = '';
      return;
    }
    const one = readBibtex(slice.value);
    const entry = one.entries[0];
    if (!entry) {
      preview.textContent = one.skipped[0]?.reason ?? 'This text is not an entry of BibTeX';
      return;
    }
    const [before, italic, after] = referenceParts(referenceOf(entry));
    preview.replaceChildren(before, ...(italic ? [make('em', '', italic)] : []), after);
  }

  function fillEntries(): void {
    const query = search.value.trim();
    entries.replaceChildren(
      ...bib.entries.filter((e) => !query || matches(e, query)).map((e: Entry) => {
        const button = make('button');
        button.type = 'button';
        button.dataset.key = e.key;
        button.classList.toggle('on', e.start === range.start);
        const [before, italic, after] = referenceParts(referenceOf(e));
        button.append(before, ...(italic ? [make('em', '', italic)] : []), after, ' ', code(e.key));
        button.addEventListener('click', () => {
          range = { start: e.start, end: e.end };
          typing = null;
          fillSlice();
          fillEntries();
          slice.focus();
        });
        return button;
      }),
      ...bib.skipped.map((s) => line({ class: 'skipped' }, code(`${SOURCE.bibliography}:${s.line}`), span(s.reason))),
    );
  }

  function fillSlice(): void {
    const value = range.start < 0 ? '' : text.bibliography.slice(range.start, range.end);
    if (slice.value !== value) slice.value = value;
    slice.readOnly = range.start < 0 || unreadSource('bibliography');
    showPreview();
  }

  function fill(): void {
    if (!dialog.open) return;
    if (shown === 'preamble') {
      if (source.value !== text.preamble) source.value = text.preamble;
      source.readOnly = !loaded || unreadSource('preamble');
      fillDefs();
    } else {
      fillEntries();
      fillSlice();
    }
    if (loaded) {
      const unread = unreadNames(unreadFollowed);
      pick.hidden = !(choosing && unread.length);
      note.textContent = [
        start ? '' : `${app.handle?.name ?? 'This deck'} does not load tex.js, hence put <script src="tex.js"></script> before the script of theme/mathjax-config.js.`,
        unread.length ? `tex.js is not written while ${listed(unread)} ${unread.length > 1 ? 'are' : 'is'} not read${choosing ? ', hence choose them too' : ''}.` : '',
      ].filter(Boolean).join(' ');
    }
  }

  // the lists, the live effect, and the files that the preamble follows, after a change
  let timer = 0;
  let version = 0;
  async function update(): Promise<void> {
    window.clearTimeout(timer);
    const v = ++version;
    await follow();
    if (v !== version) return;
    bib = readBibtex(text.bibliography);
    live();
    fill();
  }
  const soon = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void update(), 150);
  };

  // an edit of a source is one entry of the history, and the inputs of one source less than PAUSE
  // apart are one entry, as the typing into a text element is
  let typing: { which: Which; at: number; entry: Step; after: State } | null = null;
  const stateOf = (which: Which): State => ({ text: text[which], ...(which === 'bibliography' ? range : { start: -1, end: -1 }) });
  function put(which: Which, state: State): void {
    typing = null;
    text[which] = state.text;
    if (which === 'bibliography') range = { start: state.start, end: state.end };
    if (shown === which) {
      if (which === 'preamble') source.value = state.text;
      else fillSlice();
    }
    app.markDirty();
    void update();
  }
  function edited(which: Which, next: State): void {
    const before = stateOf(which);
    text[which] = next.text;
    if (which === 'bibliography') range = { start: next.start, end: next.end };
    const at = Date.now();
    if (typing && typing.which === which && app.history.last === typing.entry && at - typing.at < PAUSE && typing.after.start === next.start) {
      typing.after = next;
      typing.at = at;
    } else {
      const t: { which: Which; at: number; entry: Step; after: State } = { which, at, after: next, entry: { label: LABEL[which], undo: () => put(which, before), redo: () => put(which, t.after) } };
      typing = t;
      app.history.push(t.entry);
    }
    app.markDirty();
    soon();
  }
  source.addEventListener('input', () => edited('preamble', { text: source.value, start: -1, end: -1 }));
  slice.addEventListener('input', () => {
    if (range.start < 0) return;
    edited('bibliography', { text: text.bibliography.slice(0, range.start) + slice.value + text.bibliography.slice(range.end), start: range.start, end: range.start + slice.value.length });
    showPreview();
  });
  search.addEventListener('input', fillEntries);

  // the files to save for the text of the deck: the changed sources, and tex.js when it differs
  // from the one next to the deck. tex.js is not written while a file of the preamble is not read
  function pending(deck: string): { out: [string, string][]; why: string } {
    const out: [string, string][] = [];
    for (const which of ['preamble', 'bibliography'] as Which[]) if (text[which] !== saved[which] && !unreadSource(which)) out.push([SOURCE[which], text[which]]);
    const s = scan();
    const unread = unreadNames([...s.unread, ...s.wanted]);
    if (unread.length) return { out, why: out.length ? `tex.js was not written, since ${listed(unread)} ${unread.length > 1 ? 'are' : 'is'} not read` : '' };
    const script = texScript(texOf(s.preamble, readBibtex(text.bibliography), deck).tex);
    if (script !== known) out.push(['tex.js', script]);
    return { out, why: '' };
  }
  function wrote(out: [string, string][]): void {
    for (const [name, value] of out) {
      files.set(name, value);
      if (name === 'tex.js') known = value;
      for (const which of ['preamble', 'bibliography'] as Which[]) if (SOURCE[which] === name) saved[which] = value;
    }
  }
  const sentence = (parts: string[]): string => parts.filter(Boolean).join('. ');

  // the store as the list of the bibliography reads it. an entry pasted into the list is added to
  // references.bib at once, so that its reference is drawn before the sheet reads the text again
  const picker = (): boolean => !!app.handle && 'showDirectoryPicker' in window && !!window.showDirectoryPicker;
  const store: Store = {
    app,
    loaded: () => loaded,
    entries: () => bib.entries,
    ensure: () =>
      ensure().catch((error: unknown) => {
        loading = null;
        throw error;
      }),
    local: () => !/^https?:$/.test(location.protocol),
    chooseLabel: () => (picker() ? 'Choose Folder…' : 'Choose Files…'),
    choose() {
      const read = store.ensure();
      if (!picker()) input.click();
      return read;
    },
    add(sources) {
      const before = stateOf('bibliography');
      const now = text.bibliography;
      const after = { text: `${now}${now && !now.endsWith('\n') ? '\n' : ''}${sources.map((t) => `\n${t}\n`).join('')}`, start: -1, end: -1 };
      put('bibliography', after);
      bib = readBibtex(text.bibliography);
      app.history.push({ label: 'Insert Citation', undo: () => put('bibliography', before), redo: () => put('bibliography', after) });
    },
  };

  return {
    async open(which) {
      shown = which;
      typing = null;
      heading.textContent = which === 'preamble' ? 'Preamble' : 'Bibliography';
      body.replaceChildren(...(which === 'preamble' ? [source, defs] : [left, right]));
      if (!dialog.open) {
        back = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        dialog.hidden = false;
        dialog.showModal();
      }
      done.focus({ preventScroll: true });
      if (!loaded) {
        source.readOnly = slice.readOnly = true;
        dialog.setAttribute('aria-busy', 'true');
        try {
          await ensure();
        } catch (error) {
          loading = null;
          note.textContent = error instanceof Error ? error.message : String(error);
        } finally {
          dialog.removeAttribute('aria-busy');
        }
      }
      fill();
      if (dialog.open && shown === which) (which === 'preamble' ? source : search).focus({ preventScroll: true });
    },
    async write(deck, handle) {
      if (!loaded) return '';
      await follow();
      const { out, why } = pending(deck);
      if (out.length) {
        const folder = await host.folder(handle, listed(out.map(([name]) => name)));
        for (const [name, value] of out) {
          const writable = await (await folder.getFileHandle(name, { create: true })).createWritable();
          await writable.write(value);
          await writable.close();
        }
        wrote(out);
      }
      return sentence([out.length ? `${listed(out.map(([name]) => name))} written` : '', why]);
    },
    download(deck) {
      if (!loaded) return '';
      const { out, why } = pending(deck);
      for (const [name, value] of out) {
        const url = URL.createObjectURL(new Blob([value], { type: 'text/plain' }));
        const a = make('a');
        a.href = url;
        a.download = name;
        (document.querySelector('dialog[open]') ?? document.body).append(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      wrote(out);
      return sentence([out.length ? `Put ${listed(out.map(([name]) => name))} next to it` : '', why]);
    },
    dirty: () => loaded && (text.preamble !== saved.preamble || text.bibliography !== saved.bibliography),
    ...citations(store),
  };
}

window.BeesonTexSheets = sheets;
