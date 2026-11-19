import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compileFigure, findTools } from '../scripts/figures.mjs';
import { csvOf, fromHeader, headerOf, readFigure, writeFigure } from '../src/editor/tex/from-data.ts';

const tools = findTools();
const WITHOUT_TEX = !tools.latex || !tools.dvisvgm ? 'latex and dvisvgm are not installed, as on the test runners of CI' : false;

const DECAY = `% From Data: the TikZ Figure pane of the editor reads and writes this source while it keeps this shape
\\begin{tikzpicture}
\\begin{axis}[
  clip mode=individual,
  xlabel={t},
  ylabel={},
]
\\addplot+[part=x, data1, mark=none] table[x index=0, y index=1, col sep=comma, header=false, skip first n=1] {figures/decay.csv} node[pos=1, anchor=west] {x};
\\addplot+[part=y-pos, data2, mark=none] table[x index=0, y index=2, col sep=comma, header=false, skip first n=1] {figures/decay.csv} node[pos=1, anchor=west] {y pos};
\\end{axis}
\\end{tikzpicture}
`;

test('From Data writes one curve per column after the first, each a part with a label at its end in a color of the style', () => {
  assert.deepEqual(headerOf('\uFEFFt, x,"y pos"\r\n0,1,2\r\n'), ['t', 'x', 'y pos']);
  assert.deepEqual(headerOf('\n\nt,x\n'), ['t', 'x']);
  assert.deepEqual(headerOf('t,"a,b", "say ""hi""" ,y\n'), ['t', 'a,b', 'say "hi"', 'y']);
  const figure = fromHeader('figures/decay.csv', ['t', 'x', 'y pos']);
  assert.equal(writeFigure(figure), DECAY);
  assert.deepEqual(figure.curves.map((c) => [c.part, c.column, c.color, c.kind, c.label]), [['x', 1, 'data1', 'line', 'x'], ['y-pos', 2, 'data2', 'line', 'y pos']]);
  const odd = fromHeader('figures/odd.csv', ['time_s', 'a_b', 'A B', 'a-b', '%']);
  assert.deepEqual(odd.curves.map((c) => [c.part, c.label]), [['a_b', 'a\\_b'], ['a-b', 'A B'], ['a-b-2', 'a-b'], ['curve', '\\%']]);
  assert.equal(odd.x, 0);
  assert.equal(odd.axes.x.label, 'time\\_s');
  assert.equal(fromHeader('figures/many.csv', Array.from({ length: 10 }, (_, i) => `c${i}`)).curves.at(-1).color, 'data1');
});

test('a source of From Data is read and written again as the same text, with every field of the TikZ Figure pane', () => {
  assert.deepEqual(readFigure(DECAY), fromHeader('figures/decay.csv', ['t', 'x', 'y pos']));
  const figure = fromHeader('figures/decay.csv', ['t', 'x', 'y']);
  const variants = [
    figure,
    { ...figure, labels: 'legend' },
    { ...figure, labels: 'none' },
    { ...figure, curves: [] },
    { ...figure, axes: { x: { label: '$t$ in s', min: '0', max: '10', log: false }, y: { label: 'amplitude, in {m}', min: '1e-3', max: '', log: true } } },
    { ...figure, curves: [{ ...figure.curves[0], kind: 'points', color: 'accent', label: '$x(t)$' }, { ...figure.curves[1], kind: 'both', color: 'muted', column: 0 }] },
  ];
  for (const variant of variants) {
    const text = writeFigure(variant);
    const read = readFigure(text);
    assert.ok(read, text);
    assert.equal(writeFigure(read), text);
    if (variant.curves.length) assert.deepEqual(read, variant.labels === 'none' ? { ...variant, curves: variant.curves.map((c) => ({ ...c, label: '' })) } : variant);
  }
  assert.equal(readFigure(writeFigure({ ...figure, axes: { ...figure.axes, x: { ...figure.axes.x, label: 'two\nlines' } } })).axes.x.label, 'two lines');
});

test('a source that From Data would not write is not read', () => {
  const edits = [
    DECAY.replace('% From Data', '% from data'),
    DECAY.replace('\\end{axis}', '\\draw (0,0) -- (1,1);\n\\end{axis}'),
    DECAY.replace('mark=none] table[x index=0, y index=1', 'mark=none, thick] table[x index=0, y index=1'),
    DECAY.replace('figures/decay.csv} node[pos=1, anchor=west] {y pos}', 'figures/other.csv} node[pos=1, anchor=west] {y pos}'),
    DECAY.replace('  ylabel={},\n', '  ylabel={},\n  grid=major,\n'),
    DECAY.replace('table[x index=0, y index=1', 'table[x index=1, y index=1'),
    DECAY.replace(/\n$/, ''),
    '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n',
  ];
  for (const text of edits) assert.equal(readFigure(text), null, text);
});

test('a source of From Data compiles, with each curve a part', { skip: WITHOUT_TEX }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'slides from-data-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'figures'));
  writeFileSync(join(dir, 'figures', 'decay.csv'), 't,x,y pos\n0,1,0\n1,0.5,0.2\n2,0.25,0.3\n3,0.12,0.35\n');
  const figure = fromHeader('figures/decay.csv', ['t', 'x', 'y pos']);
  for (const variant of [figure, { ...figure, labels: 'legend', axes: { ...figure.axes, y: { label: 'amplitude', min: '0.01', max: '2', log: true } }, curves: figure.curves.map((c) => ({ ...c, kind: 'both' })) }]) {
    const out = await compileFigure({ dir, name: 'decay', source: writeFigure(variant), box: { width: 600, height: 400 } });
    assert.equal(out.errors, undefined, JSON.stringify(out.errors));
    assert.deepEqual(out.figure.parts, ['x', 'y-pos']);
  }
});

test('a CSV file is written from its first line that is not blank, and a { in this line that is not closed is refused', () => {
  assert.deepEqual(csvOf('a.csv', '﻿\n \r\nt,x\n0,1\n'), { text: 't,x\n0,1\n', columns: ['t', 'x'] });
  assert.deepEqual(csvOf('a.csv', 't,{x},}\n0,1,2\n').columns, ['t', '{x}', '}']);
  for (const text of ['t,{x,y\n0,1,2\n', 't,}{,y\n0,1,2\n']) assert.throws(() => csvOf('a.csv', text), { message: 'From Data cannot read a.csv, since TeX reads the { in its first line as the start of a group. Take it out of the names of the columns, or close it with a }' });
  assert.throws(() => csvOf('a.csv', '\n\n'), { message: 'a.csv is empty' });
});

test('a source of From Data compiles whatever the names in the header of its CSV file', { skip: WITHOUT_TEX, timeout: 300000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'slides from-data-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'figures'));
  const headers = ['t,%,y', 't,#,y', 't,\\x,y_1', 't,"a,b",y', ',a,b', 't,^~$&,}', '\n\nt,x,y'];
  for (const [i, header] of headers.entries()) {
    const { text, columns } = csvOf(`d${i}.csv`, `${header}\n0,1,2\n1,2,3\n`);
    writeFileSync(join(dir, 'figures', `d${i}.csv`), text);
    const source = writeFigure(fromHeader(`figures/d${i}.csv`, columns));
    const out = await compileFigure({ dir, name: `d${i}`, source, box: { width: 600, height: 400 } });
    assert.equal(out.errors, undefined, `${header}: ${JSON.stringify(out.errors)}\n${source}`);
    assert.equal(out.figure.parts.length, 2, header);
  }
});
