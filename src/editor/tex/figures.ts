// the TikZ figures of a session in theme/editor-tex.js: a new figure from a CSV file, a .tex file,
// or a blank drawing, and the Edit Source sheet of a figure. the edit command writes each source
// into figures/ under a free name and compiles the figure once the deck holds it. a pause in
// typing in the sheet compiles the source as a preview, which is drawn on the slide in place of the
// output until Cancel, or until the compile of the source applied ends, with its output or with the
// last good output after an error

import type { FigureError } from '../../session/protocol.ts';
import type { FigureOutput } from '../../tikz.ts';
import type { FigureLink } from '../session/port.ts';
import { trapTab } from '../ui/dialog.ts';
import { injectStyle, make } from '../ui/dom.ts';
import { csvOf, fromHeader, writeFigure } from './from-data.ts';
import type { Starter, TexHost, TexSheets } from './install.ts';

const CSS = `
dialog.beeson-edit-dialog.beeson-edit-tikz { width: min(560px, calc(100vw - 32px)); margin: 88px 16px auto auto; }
dialog.beeson-edit-dialog.beeson-edit-tikz::backdrop { background: transparent; }
.beeson-edit-tikz .note:empty, .beeson-edit-tikz .errors:empty { display: none; }
.beeson-edit-tikz .note { color: var(--ed-text); }
.beeson-edit-tikz .code { display: flex; height: min(50vh, 420px); margin: 0 0 10px; border: 1px solid var(--ed-control-line, var(--ed-line)); border-radius: 6px; background: var(--ed-control); overflow: hidden; }
.beeson-edit-tikz .gutter, .beeson-edit-tikz textarea { font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace; }
.beeson-edit-tikz .gutter { flex: none; min-width: 2.5ch; padding: 8px 6px 8px 8px; overflow: hidden; color: var(--ed-muted); text-align: right; user-select: none; }
.beeson-edit-tikz .gutter .error { color: var(--ed-guide); font-weight: 700; }
.beeson-edit-tikz textarea { flex: 1; min-width: 0; margin: 0; padding: 8px; border: 0; resize: none; background: none; color: var(--ed-text); white-space: pre; overflow: auto; }
.beeson-edit-tikz .errors { margin: 0 0 10px; padding: 0; list-style: none; max-height: 7.5em; color: var(--ed-text); }
.beeson-edit-tikz .errors li { cursor: pointer; }
.beeson-edit-tikz .hint { margin-right: auto; align-self: center; color: var(--ed-muted); font-size: 11px; }
@media (max-width: 640px) {
  dialog.beeson-edit-dialog.beeson-edit-tikz { width: calc(100vw - 16px); max-height: calc(100vh - 16px); margin: 8px auto auto; padding: 14px; }
  .beeson-edit-tikz .code { height: 45vh; }
  .beeson-edit-tikz .hint { display: none; }
}
`;

// a small drawing in the colors of styles/beeson-tikz.sty, with sizes left to the style
const BLANK = `\\begin{tikzpicture}
\\draw[line] (0,0) rectangle (4,3);
\\draw[accent, ->] (0.5,0.5) .. controls (1.5,2.8) and (2.5,0.2) .. (3.5,2.5);
\\fill[blue] (3.5,2.5) circle (2pt);
\\node[ink, above] at (2,3) {A TikZ figure};
\\end{tikzpicture}
`;
// the pause in typing after which the source is compiled as a preview, in ms
const PAUSE = 1000;
// the box of a new figure, which Insert puts on the slide in this size
const NEW_BOX = { width: 800, height: 600 };

type Answer = { status: number; value: Record<string, unknown> | null };
type Preview = { figure?: FigureOutput; errors?: FigureError[]; superseded?: true };

/** The answer of the route figures/route of the edit command to body with the token of the page. */
export async function post(link: FigureLink, route: string, body: object): Promise<Answer> {
  const r = await fetch(new URL(`.session/figures/${route}`, location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: link.token(), ...body }) });
  return { status: r.status, value: await r.json().catch(() => null) };
}

// the error of an answer that is not OK, as a sentence of a note
export const failure = (a: Answer): Error => {
  const text = typeof a.value?.error === 'string' ? a.value.error : `the edit command answered ${a.status}`;
  return new Error(text[0].toUpperCase() + text.slice(1));
};

/** The text of figures/name.tex as the edit command serves it, or null without one. */
export async function sourceOf(name: string): Promise<string | null> {
  const r = await fetch(new URL(`figures/${name}.tex`, location.href), { cache: 'no-store' });
  return r.ok ? r.text() : null;
}

// the line of an error, e.g. "Line 6: " for the source and "preamble.tex, line 3: " for another file
export function errorLine(name: string, e: FigureError): string {
  const own = !e.file || e.file === `figures/${name}.tex`;
  const at = e.line === null ? (own ? '' : e.file) : own ? `Line ${e.line}` : `${e.file}, line ${e.line}`;
  return `${at ? `${at}: ` : ''}${e.message}`;
}

const figuresApi = (): { preview?(name: string, output: FigureOutput | null): void } => window.Beeson?.figures ?? {};

export function figures(host: TexHost): Pick<TexSheets, 'newFigure' | 'editSource'> {
  const app = host.app;
  injectStyle('tikz', CSS);
  const note = (e: unknown): void => {
    app.note = { text: e instanceof Error ? e.message : String(e), warn: true };
    app.report();
  };

  const dialog = make('dialog', 'beeson-edit-dialog beeson-edit-tikz') as HTMLDialogElement;
  dialog.setAttribute('aria-modal', 'true');
  const heading = make('h3');
  heading.id = 'beeson-edit-tikz-title';
  dialog.setAttribute('aria-labelledby', heading.id);
  const said = make('p', 'note');
  said.setAttribute('aria-live', 'polite');
  const code = make('div', 'code');
  const gutter = make('div', 'gutter');
  gutter.setAttribute('aria-hidden', 'true');
  const field = make('textarea');
  field.spellcheck = false;
  field.setAttribute('autocapitalize', 'off');
  field.setAttribute('autocomplete', 'off');
  code.append(gutter, field);
  const errors = make('ul', 'errors');
  errors.setAttribute('aria-live', 'polite');
  const row = make('div', 'row');
  const hint = make('span', 'hint', `${app.platform === 'mac' ? '⌘↩' : 'Ctrl+Enter'} to apply, Esc to cancel`);
  const theirsButton = make('button', '', 'Use Their Text');
  const cancelButton = make('button', '', 'Cancel');
  const applyButton = make('button', 'primary', 'Apply');
  for (const b of [theirsButton, cancelButton, applyButton]) b.type = 'button';
  row.append(hint, theirsButton, cancelButton, applyButton);
  dialog.append(heading, said, code, errors, row);
  dialog.hidden = true;
  document.body.append(dialog);

  // the figure being edited, or null for a new figure of Blank, which Insert writes and puts on the
  // slide, and the text that the sheet opened with. theirs is the text of another person after a
  // refused apply
  let at: { el: HTMLElement | null; name: string; base: string | null } | null = null;
  let theirs: string | null | undefined;
  let back: HTMLElement | null = null;
  let timer = 0;
  // the count of the previews asked for, by which an answer to an older one is passed over, and
  // the source of the preview drawn
  let asked = 0;
  let drawn: string | null = null;
  let marked = new Set<number>();

  const lines = (): void => {
    const n = field.value.split('\n').length;
    if (gutter.childElementCount !== n || marked.size) {
      gutter.replaceChildren(...Array.from({ length: n }, (_, i) => make('div', marked.has(i + 1) ? 'error' : '', String(i + 1))));
    }
    gutter.scrollTop = field.scrollTop;
  };
  const showErrors = (list: FigureError[]): void => {
    const name = at?.name ?? '';
    marked = new Set(list.filter((e) => e.line !== null && (!e.file || e.file === `figures/${name}.tex`)).map((e) => e.line!));
    errors.replaceChildren(...list.map((e) => {
      const li = make('li', '', errorLine(name, e));
      if (e.line !== null && marked.has(e.line)) li.addEventListener('click', () => selectLine(e.line!));
      return li;
    }));
    gutter.replaceChildren();
    lines();
  };
  const selectLine = (n: number): void => {
    const all = field.value.split('\n');
    const start = all.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
    field.focus();
    field.setSelectionRange(start, start + (all[n - 1]?.length ?? 0));
    field.scrollTop = Math.max(0, (n - 3) * 18);
    lines();
  };
  // the box of the style, which the edit command compiles the output in
  const px = (v: string): number | null => Number(/^([\d.]+)px$/.exec(v.trim())?.[1] ?? NaN) || null;
  const boxOf = (el: HTMLElement) => ({ width: px(el.style.width), height: px(el.style.height) });
  // the previews kept after Apply, by the time of the last compile of their figure then. each is
  // taken off once the figure is compiled again with errors. a new output takes it off itself
  const kept = new Map<string, number | undefined>();
  let listening = false;
  const settle = (s: { compiling: string | null; compiled: Record<string, number>; errors: Record<string, FigureError[]> }): void => {
    for (const [name, was] of kept) {
      if (s.compiling === name || s.compiled[name] === was) continue;
      kept.delete(name);
      if (s.errors[name]?.length) figuresApi().preview?.(name, null);
    }
  };

  async function preview(): Promise<void> {
    const link = host.link();
    if (!at || !link) return;
    const n = ++asked;
    const source = field.value;
    const answer = await post(link, 'preview', { name: at.name, source, box: at.el ? boxOf(at.el) : NEW_BOX }).catch((e: unknown) => ({ status: 0, value: { error: String(e) } }));
    if (n !== asked || !at) return;
    if (answer.status !== 200) return void (said.textContent = failure(answer).message);
    const v = (answer.value ?? {}) as Preview;
    if (v.superseded) return;
    said.textContent = '';
    showErrors(v.errors ?? []);
    // a new figure is not on the slide yet, hence its preview lists its errors alone
    if (!v.figure || !at.el) return;
    drawn = source;
    figuresApi().preview?.(at.name, v.figure);
  }

  const close = (): void => {
    clearTimeout(timer);
    asked++;
    at = null;
    if (!dialog.open) return;
    dialog.close();
    dialog.hidden = true;
    if (back?.isConnected) back.focus({ preventScroll: true });
    back = null;
  };
  // the output drawn again
  const cancel = (): void => {
    if (at?.el) figuresApi().preview?.(at.name, null);
    close();
  };
  async function apply(): Promise<void> {
    const link = host.link();
    if (!at || !link) return;
    const opened = at;
    const source = field.value;
    clearTimeout(timer);
    applyButton.disabled = true;
    try {
      if (!opened.el) {
        // a new figure is written under a free name and put on the slide
        const made = await post(link, 'source', { stem: opened.name, source, base: null });
        const name = made.value?.name;
        if (at !== opened) return;
        if (made.status !== 200 || typeof name !== 'string') return void (said.textContent = failure(made).message);
        close();
        return void (await host.place(name));
      }
      const answer = await post(link, 'source', { name: opened.name, source, base: theirs === undefined ? opened.base : theirs });
      if (at !== opened) return;
      if (answer.status === 409) {
        theirs = typeof answer.value?.text === 'string' ? answer.value.text : null;
        said.textContent = `Someone else changed figures/${opened.name}.tex since this sheet opened. Use their text, or apply yours over it.`;
        theirsButton.hidden = false;
        return;
      }
      if (answer.status !== 200) return void (said.textContent = failure(answer).message);
      // the preview of this text is kept until its compile ends, which a text on disk already does not start
      if (drawn !== source || source === (theirs === undefined ? opened.base : theirs)) figuresApi().preview?.(opened.name, null);
      else {
        kept.set(opened.name, link.state()?.compiled[opened.name]);
        if (!listening) link.on(settle);
        listening = true;
      }
      close();
    } catch (e) {
      said.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      applyButton.disabled = false;
    }
  }

  field.addEventListener('input', () => {
    lines();
    clearTimeout(timer);
    timer = window.setTimeout(() => void preview(), PAUSE);
  });
  field.addEventListener('scroll', () => (gutter.scrollTop = field.scrollTop));
  theirsButton.addEventListener('click', () => {
    field.value = theirs ?? '';
    theirsButton.hidden = true;
    said.textContent = '';
    field.dispatchEvent(new Event('input'));
    field.focus();
  });
  cancelButton.addEventListener('click', cancel);
  applyButton.addEventListener('click', () => void apply());
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    cancel();
  });
  dialog.addEventListener('keydown', (ev) => {
    const mod = app.platform === 'mac' ? ev.metaKey : ev.ctrlKey;
    if (ev.key === 'Escape') cancel();
    else if (ev.key === 'Enter' && mod) void apply();
    else if (ev.key === 'Tab' && ev.target !== field) trapTab(dialog, ev);
    else {
      // the keys that press a button are kept from the key handler of reveal.js
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target instanceof HTMLButtonElement) ev.stopPropagation();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
  });

  // the sheet on the figure el, or on text for a new figure of Blank
  async function editSource(el: HTMLElement | null, text: string | null = null): Promise<void> {
    const name = el ? (el.dataset.figure ?? '') : 'figure';
    if (!/^[\w-]+$/.test(name)) return note('This TikZ figure does not have a name in data-figure');
    if (el) text = await sourceOf(name);
    clearTimeout(timer);
    asked++;
    at = { el, name, base: text };
    theirs = undefined;
    drawn = null;
    heading.textContent = el ? `${name}.tex` : 'New TikZ Figure';
    field.setAttribute('aria-label', `figures/${name}.tex`);
    field.value = text ?? '';
    said.textContent = '';
    theirsButton.hidden = true;
    applyButton.textContent = el ? 'Apply' : 'Insert';
    showErrors(el ? (host.link()?.state()?.errors[name] ?? []) : []);
    if (!dialog.open) {
      back = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      dialog.hidden = false;
      dialog.showModal();
    }
    field.focus({ preventScroll: true });
    field.setSelectionRange(0, 0);
    lines();
  }

  return {
    editSource: (el) => void editSource(el).catch(note),
    async newFigure(from: Starter, file: File | null) {
      const link = host.link();
      if (!link) return;
      try {
        // a blank drawing is written and put on the slide at Insert
        if (from === 'blank') return await editSource(null, BLANK);
        if (!file) return;
        let stem = file.name.replace(/\.tex$/i, '');
        let source = await file.text();
        if (from === 'data') {
          const { text, columns } = csvOf(file.name, source);
          const data = await post(link, 'data', { stem: file.name, text });
          const path = data.value?.path;
          if (data.status !== 200 || typeof path !== 'string') throw failure(data);
          // the figure is named after the CSV file as the edit command wrote it
          stem = path.slice('figures/'.length, -'.csv'.length);
          source = writeFigure(fromHeader(path, columns));
        }
        const made = await post(link, 'source', { stem, source, base: null });
        const name = made.value?.name;
        if (made.status !== 200 || typeof name !== 'string') throw failure(made);
        await host.place(name);
      } catch (e) {
        note(e);
      }
    },
  };
}
