// the source that Insert > TikZ Figure > From Data writes from the header of a CSV file, and that
// the TikZ Figure pane reads and writes again: one curve per column after the first, each a part
// with a label at its end. a source read and written again is the same text, and a source that the
// writer would not write is not read. a test that runs TeX is skipped without latex and dvisvgm

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compileFigure, findTools } from '../scripts/figures.mjs';
import { fromHeader, headerOf, readFigure, writeFigure } from '../src/editor/tex/from-data.ts';

const tools = findTools();
const WITHOUT_TEX = !tools.latex || !tools.dvisvgm ? 'latex and dvisvgm are not installed, as on the test runners of CI' : false;

const DECAY = `% From Data: the TikZ Figure pane of the editor reads and writes this source while it keeps this shape
\\begin{tikzpicture}
\\begin{axis}[
  clip mode=individual,
  xlabel={t},
  ylabel={},
]
\\addplot+[part=x, data1, mark=none] table[x={t}, y={x}, col sep=comma] {figures/decay.csv} node[pos=1, anchor=west] {x};
\\addplot+[part=y-pos, data2, mark=none] table[x={t}, y={y pos}, col sep=comma] {figures/decay.csv} node[pos=1, anchor=west] {y pos};
\\end{axis}
\\end{tikzpicture}
`;

test('From Data writes one curve per column after the first, each a part with a label at its end in a color of the style', () => {
  assert.deepEqual(headerOf('\uFEFFt, x,"y pos"\r\n0,1,2\r\n'), ['t', 'x', 'y pos']);
  assert.deepEqual(headerOf('\n\nt,x\n'), ['t', 'x']);
  const figure = fromHeader('figures/decay.csv', ['t', 'x', 'y pos']);
  assert.equal(writeFigure(figure), DECAY);
  assert.deepEqual(figure.curves.map((c) => [c.part, c.column, c.color, c.kind, c.label]), [['x', 'x', 'data1', 'line', 'x'], ['y-pos', 'y pos', 'data2', 'line', 'y pos']]);
  // a label is TeX, hence a special character of a column is escaped in the label alone, and two
  // columns of the same part name get two parts
  const odd = fromHeader('figures/odd.csv', ['time_s', 'a_b', 'A B', 'a-b', '%']);
  assert.deepEqual(odd.curves.map((c) => [c.part, c.label]), [['a_b', 'a\\_b'], ['a-b', 'A B'], ['a-b-2', 'a-b'], ['curve', '\\%']]);
  assert.equal(odd.x, 'time_s');
  // the colors go round data1 to data8
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
    { ...figure, curves: [{ ...figure.curves[0], kind: 'points', color: 'accent', label: '$x(t)$' }, { ...figure.curves[1], kind: 'both', color: 'muted', column: 't' }] },
  ];
  for (const variant of variants) {
    const text = writeFigure(variant);
    const read = readFigure(text);
    assert.ok(read, text);
    assert.equal(writeFigure(read), text);
    if (variant.curves.length) assert.deepEqual(read, variant.labels === 'none' ? { ...variant, curves: variant.curves.map((c) => ({ ...c, label: c.column })) } : variant);
  }
  // a label is kept on one line
  assert.equal(readFigure(writeFigure({ ...figure, axes: { ...figure.axes, x: { ...figure.axes.x, label: 'two\nlines' } } })).axes.x.label, 'two lines');
});

test('a source that From Data would not write is not read', () => {
  const edits = [
    DECAY.replace('% From Data', '% from data'),
    DECAY.replace('\\end{axis}', '\\draw (0,0) -- (1,1);\n\\end{axis}'),
    DECAY.replace('mark=none] table[x={t}, y={x}', 'mark=none, thick] table[x={t}, y={x}'),
    DECAY.replace('figures/decay.csv} node[pos=1, anchor=west] {y pos}', 'figures/other.csv} node[pos=1, anchor=west] {y pos}'),
    DECAY.replace('  ylabel={},\n', '  ylabel={},\n  grid=major,\n'),
    DECAY.replace('table[x={t}, y={x}', 'table[x={x}, y={x}'),
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
