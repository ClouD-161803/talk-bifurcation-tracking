export type Kind = 'line' | 'points' | 'both';
export type Curve = { part: string; column: number; kind: Kind; color: string; label: string };
export type Axis = { label: string; min: string; max: string; log: boolean };
export type Labels = 'curves' | 'legend' | 'none';
export type DataFigure = { data: string; x: number; curves: Curve[]; axes: { x: Axis; y: Axis }; labels: Labels };

export const MARK = '% From Data: the TikZ Figure pane of the editor reads and writes this source while it keeps this shape';
export const COLORS = ['data1', 'data2', 'data3', 'data4', 'data5', 'data6', 'data7', 'data8', 'accent', 'violet', 'blue', 'red', 'ink', 'subtle', 'muted'];
const KINDS: Record<Kind, string> = { line: 'mark=none', points: 'only marks, mark=*', both: 'mark=*' };

export function headerOf(csv: string): string[] {
  const line = csv.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  const names = [''];
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && quoted && line[i + 1] === '"') names[names.length - 1] += line[i++];
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) names.push('');
    else names[names.length - 1] += c;
  }
  return names.map((name) => name.trim());
}

export function csvOf(name: string, csv: string): { text: string; columns: string[] } {
  const text = csv.replace(/^﻿?(?:[ \t]*\r?\n)*/, '');
  const head = text.split(/\r?\n/, 1)[0];
  if (!head.trim()) throw new Error(`${name} is empty`);
  let open = 0;
  for (const c of head) open = c === '{' ? open + 1 : c === '}' ? Math.max(0, open - 1) : open;
  if (open) throw new Error(`From Data cannot read ${name}, since TeX reads the { in its first line as the start of a group. Take it out of the names of the columns, or close it with a }`);
  return { text, columns: headerOf(text) };
}

export const texText = (name: string): string => name.replace(/[\\{}$&#^_%~]/g, (c) => (c === '\\' ? '\\textbackslash{}' : c === '^' || c === '~' ? `\\${c}{}` : `\\${c}`));

export function partFor(column: string, taken: string[]): string {
  const stem = column.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'curve';
  let part = stem;
  for (let i = 2; taken.includes(part); i++) part = `${stem}-${i}`;
  return part;
}

export function curveFor(figure: DataFigure, column: number, name: string): Curve {
  return { part: partFor(name, figure.curves.map((c) => c.part)), column, kind: 'line', color: COLORS[figure.curves.length % 8], label: texText(name) };
}

export function fromHeader(data: string, columns: string[]): DataFigure {
  const figure: DataFigure = { data, x: 0, curves: [], axes: { x: { label: texText(columns[0] ?? ''), min: '', max: '', log: false }, y: { label: '', min: '', max: '', log: false } }, labels: 'curves' };
  columns.slice(1).forEach((name, i) => figure.curves.push(curveFor(figure, i + 1, name)));
  return figure;
}

const line = (text: string): string => text.replace(/\s*\r?\n\s*/g, ' ');

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
    out.push(`\\addplot+[part=${c.part}, ${c.color}, ${KINDS[c.kind]}] table[x index=${f.x}, y index=${c.column}, col sep=comma, header=false, skip first n=1] {${f.data}}${f.labels === 'curves' ? ` node[pos=1, anchor=west] {${label}}` : ''};`);
    if (f.labels === 'legend') out.push(`\\addlegendentry{${label}}`);
  }
  out.push('\\end{axis}', '\\end{tikzpicture}', '');
  return out.join('\n');
}

const PLOT = /^\\addplot\+\[part=([\w-]+), (\w+), (mark=none|only marks, mark=\*|mark=\*)\] table\[x index=(\d+), y index=(\d+), col sep=comma, header=false, skip first n=1\] \{([^{}]*)\}(?: node\[pos=1, anchor=west\] \{(.*)\})?;$/;

export function readFigure(source: string): DataFigure | null {
  const lines = source.split('\n');
  if (lines[0] !== MARK) return null;
  const f: DataFigure = { data: '', x: 0, curves: [], axes: { x: { label: '', min: '', max: '', log: false }, y: { label: '', min: '', max: '', log: false } }, labels: 'none' };
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
    f.x = Number(x);
    f.data = data;
    if (label !== undefined) f.labels = 'curves';
    f.curves.push({ part, column: Number(column), color, kind: (Object.keys(KINDS) as Kind[]).find((k) => KINDS[k] === marks)!, label: label ?? '' });
  }
  return writeFigure(f) === source ? f : null;
}
