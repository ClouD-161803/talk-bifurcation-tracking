// the TikZ Figure pane of the Format tab in theme/editor-tex.js: the file of a figure with Edit
// Source… and the state of its compile, and for a source of From Data the fields of its data,
// curves, axes, and labels. a change of a field writes the source again as Apply does, over the
// text that the pane read. a source that starts as From Data but lost its shape shows the fields
// turned off with a note, and a source of another shape shows the file alone

import { make, injectStyle } from '../ui/dom.ts';
import { errorLine, failure, post, sourceOf } from './figures.ts';
import { COLORS, curveFor, fromHeader, headerOf, MARK, readFigure, writeFigure, type DataFigure, type Kind, type Labels } from './from-data.ts';
import type { TexHost } from './install.ts';

const CSS = `
.beeson-edit-inspector .ed-tikz.first > .ed-sec:first-child { border-top: 0; padding-top: 6px; }
.beeson-edit-inspector .ed-tikz fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.beeson-edit-inspector .ed-tikz fieldset:disabled { opacity: 0.45; }
.beeson-edit-inspector .ed-tikz .ed-row > :is(select, input, .ed-btn, .path, .name) { flex: 1; min-width: 0; }
.beeson-edit-inspector .ed-tikz input[type="text"] { height: 24px; box-sizing: border-box; padding: 0 7px; border: 0; border-radius: 6px; background: var(--ed-control); box-shadow: inset 0 0 0 1px var(--ed-control-line); color: var(--ed-text); font: 12px/1 var(--ed-font); }
.beeson-edit-inspector .ed-tikz :is(.path, .name) { padding-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px/1.3 ui-monospace, Menlo, Consolas, monospace; color: var(--ed-text); }
.beeson-edit-inspector .ed-tikz .curve { display: flex; flex-direction: column; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--ed-line); }
.beeson-edit-inspector .ed-tikz .curve h6 { margin: 0; font: 600 11px/1.3 var(--ed-font); color: var(--ed-muted); }
.beeson-edit-inspector .ed-tikz .ed-row > .ed-check { flex: 1; }
`;

const KINDS: [Kind, string][] = [['line', 'Line'], ['points', 'Points'], ['both', 'Line and Points']];
const LABELS: [Labels, string][] = [['curves', 'At the Curves'], ['legend', 'Legend'], ['none', 'None']];
// the name of a tone of the style, e.g. Data 3 for data3
const toneName = (c: string): string => c.replace(/^data(\d)$/, 'Data $1').replace(/^\w/, (l) => l.toUpperCase());
const time = (t: number): string => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The text of path, a file of the talk folder that the edit command serves, or null. */
async function textOf(path: string): Promise<string | null> {
  const r = await fetch(new URL(path, location.href), { cache: 'no-store' }).catch(() => null);
  return r?.ok ? r.text() : null;
}

/** Fills el with the pane of the TikZ figure figure, and returns its sync. */
export function figurePane(host: TexHost, el: HTMLElement, figure: HTMLElement): () => void {
  injectStyle('tikz-pane', CSS);
  const app = host.app;
  const name = figure.dataset.figure ?? '';

  const sec = (title: string, ...parts: Node[]): HTMLElement => {
    const s = make('div', 'ed-sec');
    s.append(make('h5', '', title), ...parts);
    return s;
  };
  const row = (label: string | null, ...parts: Node[]): HTMLElement => {
    const r = make('div', 'ed-row');
    if (label) r.append(make('span', 'ed-label', label));
    r.append(...parts);
    return r;
  };
  const button = (text: string, run: () => unknown, aria?: string): HTMLButtonElement => {
    const b = make('button', 'ed-btn', text);
    b.type = 'button';
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', () => void run());
    return b;
  };
  const choice = <T extends string>(aria: string, options: [T, string][], value: T, set: (v: T) => void): HTMLSelectElement => {
    const s = make('select', 'beeson-edit-select');
    s.setAttribute('aria-label', aria);
    for (const [v, text] of options) s.append(new Option(text, v, false, v === value));
    if (!options.some(([v]) => v === value)) s.append(new Option(value, value, false, true));
    s.addEventListener('change', () => set(s.value as T));
    return s;
  };
  const text = (aria: string, value: string, set: (v: string) => void): HTMLInputElement => {
    const i = make('input');
    i.type = 'text';
    i.value = value;
    i.spellcheck = false;
    i.setAttribute('aria-label', aria);
    i.addEventListener('change', () => set(i.value));
    return i;
  };

  // the file of the figure and the state of its compile
  const state = make('div', 'ed-note');
  const edit = button('Edit Source…', () => app.commands.run('format.tikzSource'));
  const said = make('div', 'ed-note warn');
  const body = make('div');
  el.replaceChildren(sec('File', row('Name', make('span', 'name', `${name}.tex`)), row(null, edit), state, said), body);
  const say = (t: string): void => {
    said.textContent = t;
    said.hidden = !t;
  };
  say('');

  // the source as the pane read it, undefined before it is read, its figure of From Data, the last
  // such figure, and the columns of its CSV file
  let base: string | null | undefined;
  let shape: DataFigure | null = null;
  let last: DataFigure | null = null;
  let columns: string[] = [];
  let seen: string | null = null;
  let writing: Promise<void> = Promise.resolve();

  const write = (): Promise<void> =>
    (writing = writing.then(async () => {
      const link = host.link();
      if (!link || !shape) return;
      const source = writeFigure(shape);
      if (source === base) return;
      const answer = await post(link, 'source', { name, source, base: base ?? null });
      if (answer.status === 409) {
        say(`Someone else changed figures/${name}.tex, hence the fields show their text`);
        base = undefined;
        return void (await refresh());
      }
      if (answer.status !== 200) return say(failure(answer).message);
      say('');
      base = source;
    }).catch((e: unknown) => say(e instanceof Error ? e.message : String(e))));
  // a change of a field, written at once, and drawn again when it changes the fields
  const change = (fn: (f: DataFigure) => void, redraw = false): void => {
    if (!shape) return;
    fn(shape);
    if (redraw) draw(true);
    void write();
  };

  async function replace(file: File): Promise<void> {
    const link = host.link();
    if (!link || !shape) return;
    const csv = await file.text();
    const answer = await post(link, 'data', { stem: file.name, text: csv });
    const path = answer.value?.path;
    if (answer.status !== 200 || typeof path !== 'string') return say(failure(answer).message);
    columns = headerOf(csv);
    const was = shape;
    change(() => (shape = { ...fromHeader(path, columns), axes: was.axes, labels: was.labels }), true);
  }

  function draw(marked: boolean): void {
    if (!marked) return body.replaceChildren();
    const f = shape ?? last ?? fromHeader('', []);
    const fields = make('fieldset');
    fields.disabled = !shape;
    const picker = make('input');
    picker.type = 'file';
    picker.accept = '.csv,text/csv';
    picker.hidden = true;
    picker.setAttribute('aria-label', 'Replace the data');
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (file) void replace(file).catch((e: unknown) => say(String(e)));
    });
    const options = (c: string): [string, string][] => [...new Set([...columns.slice(1), c])].map((v) => [v, v]);
    const curves = f.curves.map((c, i) => {
      const block = make('div', 'curve');
      const n = i + 1;
      block.append(
        make('h6', '', `Curve ${n}`),
        row('Column', choice(`Column of curve ${n}`, options(c.column), c.column, (v) => change((g) => (g.curves[i].column = v)))),
        row('Kind', choice(`Kind of curve ${n}`, KINDS, c.kind, (v) => change((g) => (g.curves[i].kind = v)))),
        row('Color', choice(`Color of curve ${n}`, COLORS.map((t) => [t, toneName(t)] as [string, string]), c.color, (v) => change((g) => (g.curves[i].color = v)))),
        row('Label', text(`Label of curve ${n}`, c.label, (v) => change((g) => (g.curves[i].label = v)))),
      );
      // a figure keeps one curve, which holds the path of its data
      const remove = button('Delete Curve', () => change((g) => g.curves.splice(i, 1), true), `Delete curve ${n}`);
      remove.disabled = f.curves.length < 2;
      block.append(row(null, remove));
      return block;
    });
    const add = button('Add Curve', () => change((g) => g.curves.push(curveFor(g, columns.slice(1).find((c) => !g.curves.some((k) => k.column === c)) ?? columns[1] ?? g.curves[0]?.column ?? 'y')), true));
    const axis = (key: 'x' | 'y') => {
      const a = f.axes[key];
      const log = make('input');
      log.type = 'checkbox';
      log.checked = a.log;
      log.setAttribute('aria-label', `Logarithmic ${key} axis`);
      log.addEventListener('change', () => change((g) => (g.axes[key].log = log.checked)));
      const check = make('label', 'ed-check');
      check.append(log, 'Logarithmic');
      return sec(`${key.toUpperCase()} Axis`,
        row('Label', text(`Label of the ${key} axis`, a.label, (v) => change((g) => (g.axes[key].label = v)))),
        row('Min', text(`Min of the ${key} axis`, a.min, (v) => change((g) => (g.axes[key].min = v.trim())))),
        row('Max', text(`Max of the ${key} axis`, a.max, (v) => change((g) => (g.axes[key].max = v.trim())))),
        row(null, check));
    };
    const seg = make('div', 'ed-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Labels');
    for (const [v, t] of LABELS) {
      const b = make('button', '', t);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(f.labels === v));
      b.addEventListener('click', () => change((g) => (g.labels = v), true));
      seg.append(b);
    }
    fields.append(
      sec('Data', row(null, make('span', 'path', f.data)), row(null, button('Replace…', () => picker.click()), picker)),
      sec('Curves', ...curves, row(null, add)),
      axis('x'),
      axis('y'),
      sec('Labels', row(null, seg)),
    );
    const off = make('div', 'ed-sec');
    off.append(make('div', 'ed-note', 'The source is no longer in the shape that From Data writes, hence these fields are off. Edit it with Edit Source…'));
    body.replaceChildren(...(shape ? [] : [off]), fields);
  }

  async function refresh(): Promise<void> {
    const source = await sourceOf(name).catch(() => null);
    if (source === base) return;
    base = source;
    shape = source === null ? null : readFigure(source);
    if (shape) {
      last = shape;
      columns = headerOf((await textOf(shape.data)) ?? '');
      if (!columns.length) columns = [shape.x, ...shape.curves.map((c) => c.column)];
    }
    draw(!!source?.startsWith(`${MARK}\n`));
  }

  return () => {
    const link = host.link();
    const s = link?.state() ?? null;
    edit.disabled = !app.commands.enabled('format.tikzSource');
    let t: string;
    let warn = false;
    if (!link || !s) t = 'TikZ figures are compiled by the edit command, started with Edit.command, Edit.cmd, or Edit.sh next to the deck, or with npm run edit';
    else if (s.compiler === 'missing') [t, warn] = ['TeX with latex and dvisvgm is not found on the computer of the host', true];
    else if (s.compiling === name) t = 'Compiling…';
    else if (s.errors[name]?.length) [t, warn] = [errorLine(name, s.errors[name][0]), true];
    else if (!s.outputs[name]) [t, warn] = ['Not compiled', true];
    else t = s.compiled[name] ? `Compiled at ${time(s.compiled[name])}` : 'Compiled';
    state.textContent = t;
    state.classList.toggle('warn', warn);
    // the source is read again once the figure is compiled again, e.g. after Edit Source
    const now = s ? JSON.stringify([s.outputs[name], s.compiled[name], s.errors[name]?.length]) : '';
    if (link && now !== seen) {
      seen = now;
      void refresh();
    }
  };
}
