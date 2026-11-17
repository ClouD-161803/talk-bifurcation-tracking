// the source of a TikZ figure that Insert > TikZ Figure > From Data writes from the header of a CSV
// file: a pgfplots axis with one curve per column after the first, which is x. each curve is a part
// of the figure, in a color of styles/beeson-tikz.sty, with its label at its end, in a legend, or
// without one. the TikZ Figure pane reads a source of this shape into its fields and writes it
// again from them. a source is read only when it is written back as the same text, hence an edit by
// hand that the fields would lose turns them off. bundled into theme/editor-tex.js

export type Kind = 'line' | 'points' | 'both';
export type Curve = { part: string; column: string; kind: Kind; color: string; label: string };
export type Axis = { label: string; min: string; max: string; log: boolean };
export type Labels = 'curves' | 'legend' | 'none';
export type DataFigure = { data: string; x: string; curves: Curve[]; axes: { x: Axis; y: Axis }; labels: Labels };

export const MARK = '% From Data: the TikZ Figure pane of the editor reads and writes this source while it keeps this shape';
// the colors of the style, data1 to data8 first, which new curves take in turn
export const COLORS = ['data1', 'data2', 'data3', 'data4', 'data5', 'data6', 'data7', 'data8', 'accent', 'violet', 'blue', 'red', 'ink', 'subtle', 'muted'];
const KINDS: Record<Kind, string> = { line: 'mark=none', points: 'only marks, mark=*', both: 'mark=*' };

/** The names of the columns in the first line of a CSV file that is not empty. */
export function headerOf(csv: string): string[] {
  const line = csv.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  return line.split(',').map((name) => name.trim().replace(/^"(.*)"$/, '$1').trim());
}

// a label of TeX text for the name of a column
const texText = (name: string): string => name.replace(/[\\{}$&#^_%~]/g, (c) => (c === '\\' ? '\\textbackslash{}' : c === '^' || c === '~' ? `\\${c}{}` : `\\${c}`));

/** A part name for column that none of taken has, i.e. its letters, digits, - and _. */
export function partFor(column: string, taken: string[]): string {
  const stem = column.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'curve';
  let part = stem;
  for (let i = 2; taken.includes(part); i++) part = `${stem}-${i}`;
  return part;
}

/** A new curve of column after the curves of figure, in the next color. */
export function curveFor(figure: DataFigure, column: string): Curve {
  return { part: partFor(column, figure.curves.map((c) => c.part)), column, kind: 'line', color: COLORS[figure.curves.length % 8], label: texText(column) };
}

/** The figure of data, a path from the talk folder, with a curve for each column after the first. */
export function fromHeader(data: string, columns: string[]): DataFigure {
  const [x = 'x', ...ys] = columns;
  const figure: DataFigure = { data, x, curves: [], axes: { x: { label: texText(x), min: '', max: '', log: false }, y: { label: '', min: '', max: '', log: false } }, labels: 'curves' };
  for (const column of ys) figure.curves.push(curveFor(figure, column));
  return figure;
}

const line = (text: string): string => text.replace(/\s*\r?\n\s*/g, ' ');

/** The source of figure. */
export function writeFigure(f: DataFigure): string {
  const out = [MARK, '\\begin{tikzpicture}', '\\begin{axis}[', '  clip mode=individual,'];
  for (const key of ['x', 'y'] as const) {
    const a = f.axes[key];
    out.push(`  ${key}label={${line(a.label)}},`);
    if (a.min) out.push(`  ${key}min=${line(a.min)},`);
    if (a.max) out.push(`  ${key}max=${line(a.max)},`);
    if (a.log) out.push(`  ${key}mode=log,`);
  }
  out.push(']');
  for (const c of f.curves) {
    const label = line(c.label);
    out.push(`\\addplot+[part=${c.part}, ${c.color}, ${KINDS[c.kind]}] table[x={${f.x}}, y={${c.column}}, col sep=comma] {${f.data}}${f.labels === 'curves' ? ` node[pos=1, anchor=west] {${label}}` : ''};`);
    if (f.labels === 'legend') out.push(`\\addlegendentry{${label}}`);
  }
  out.push('\\end{axis}', '\\end{tikzpicture}', '');
  return out.join('\n');
}

const PLOT = /^\\addplot\+\[part=([\w-]+), (\w+), (mark=none|only marks, mark=\*|mark=\*)\] table\[x=\{(.*?)\}, y=\{(.*?)\}, col sep=comma\] \{([^{}]*)\}(?: node\[pos=1, anchor=west\] \{(.*)\})?;$/;

/** The figure of a source of the shape that writeFigure writes, or null for another source. */
export function readFigure(source: string): DataFigure | null {
  const lines = source.split('\n');
  if (lines[0] !== MARK) return null;
  const f: DataFigure = { data: '', x: '', curves: [], axes: { x: { label: '', min: '', max: '', log: false }, y: { label: '', min: '', max: '', log: false } }, labels: 'none' };
  for (const text of lines) {
    const option = /^ {2}([xy])(label|min|max|mode)=(.*),$/.exec(text);
    if (option) {
      const a = f.axes[option[1] as 'x' | 'y'];
      if (option[2] === 'label') a.label = /^\{(.*)\}$/.exec(option[3])?.[1] ?? '';
      else if (option[2] === 'mode') a.log = option[3] === 'log';
      else a[option[2] as 'min' | 'max'] = option[3];
      continue;
    }
    const legend = /^\\addlegendentry\{(.*)\}$/.exec(text);
    if (legend && f.curves.length) {
      f.labels = 'legend';
      f.curves[f.curves.length - 1].label = legend[1];
      continue;
    }
    const plot = PLOT.exec(text);
    if (!plot) continue;
    const [, part, color, marks, x, column, data, label] = plot;
    f.x = x;
    f.data = data;
    if (label !== undefined) f.labels = 'curves';
    f.curves.push({ part, column, color, kind: (Object.keys(KINDS) as Kind[]).find((k) => KINDS[k] === marks)!, label: label ?? column });
  }
  return writeFigure(f) === source ? f : null;
}
