// tests of the watcher of the TikZ figures in the edit command, with a compiler that does not run
// TeX. the polls are called by the tests, with a stable time of 0 ms, hence a change is taken at
// the second poll

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { figureHash, figureProblems, figureScript } from '../scripts/figures.mjs';
import { FigureWatcher } from '../theme/edit.mjs';

const tag = (name, width = 600, height = 400) => `<div class="tikz" data-figure="${name}" style="width: ${width}px; height: ${height}px"></div>`;
const deck = (...tags) => `<!doctype html><html><body><div class="reveal"><div class="slides"><section>${tags.join('')}</section></div></div></body></html>`;
const DRAWING = '\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}\n';
const TOOLS = { latex: '/nonexistent/latex', dvisvgm: '/nonexistent/dvisvgm' };

// a talk folder with the files of files, removed after the test
function folder(t, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'slides figures-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'figures'));
  const write = (name, text) => writeFileSync(join(dir, name), text);
  for (const [name, text] of Object.entries(files)) write(name, text);
  const read = (name) => {
    try {
      return readFileSync(join(dir, name), 'utf8');
    } catch {
      return null;
    }
  };
  return { dir, write, read };
}

// the output of a compile of source in the box, as compileFigure gives it, with the files of the
// talk that the source names as inputs, or errors for a source that holds FAIL
function output(dir, name, source, box) {
  const inputs = [...source.matchAll(/\{(figures\/[\w-]+\.csv)\}/g)].map((m) => m[1]);
  if (source.includes('FAIL')) return { errors: [{ file: `figures/${name}.tex`, line: 1, message: 'Undefined control sequence' }], inputs };
  const figure = { hash: figureHash({ dir, source, box, inputs }), width: 10, height: 10, scale: 1, parts: 0, inputs, dark: '<svg>dark</svg>', light: '<svg>light</svg>' };
  return { figure, text: figureScript(name, figure) };
}

// a compiler that counts its compiles, and holds each one of a name in hold until it is let go
function compiler() {
  const calls = [];
  const held = new Map();
  const compile = async ({ dir, name, source, box }) => {
    calls.push({ name, source, box });
    if (held.has(name)) await held.get(name).promise;
    return output(dir, name, source, box);
  };
  const hold = (name) => {
    let release;
    const promise = new Promise((resolve) => (release = resolve));
    held.set(name, { promise });
    return () => {
      held.delete(name);
      release();
    };
  };
  return { calls, compile, hold };
}

function watcher(f, html, options = {}) {
  const c = options.compiler ?? compiler();
  const seen = { changes: 0, log: [] };
  const w = new FigureWatcher(f.dir, html, { stable: 0, tools: TOOLS, compile: c.compile, log: (m) => seen.log.push(m), onChange: () => seen.changes++, ...options });
  return { w, c, seen };
}

async function twoPolls(w) {
  for (let i = 0; i < 2; i++) {
    w.poll();
    await w.idle();
  }
}

test('at the start each missing or stale figure is compiled once and written, and a current one is not compiled', async (t) => {
  const f = folder(t, { 'figures/a.tex': DRAWING, 'figures/b.tex': DRAWING.replace('1,1', '2,2'), 'figures/c.tex': DRAWING.replace('1,1', '3,3') });
  const html = deck(tag('a'), tag('b'), tag('c'), tag('a', 100, 100));
  const box = { width: 600, height: 400 };
  f.write('figures/c.js', output(f.dir, 'c', f.read('figures/c.tex'), box).text);
  f.write('figures/b.js', output(f.dir, 'b', DRAWING, box).text);
  const { w, c, seen } = watcher(f, html);
  await w.idle();
  assert.deepEqual(c.calls.map((call) => call.name).sort(), ['a', 'b']);
  // a figure shown twice is compiled in the box of its first tag
  assert.deepEqual(c.calls.find((call) => call.name === 'a').box, box);
  for (const name of ['a', 'b']) assert.equal(f.read(`figures/${name}.js`), output(f.dir, name, f.read(`figures/${name}.tex`), box).text);
  assert.deepEqual(readdirSync(join(f.dir, 'figures')).filter((name) => name.startsWith('.')), [], 'a temporary file is left');
  const state = w.state();
  for (const name of ['a', 'b', 'c']) assert.equal(state.outputs[name], output(f.dir, name, f.read(`figures/${name}.tex`), box).figure.hash);
  assert.equal(state.uncompiled, 0);
  assert.equal(state.compiling, null);
  assert.deepEqual(state.errors, {});
  assert.deepEqual(Object.keys(state.compiled).sort(), ['a', 'b']);
  assert.ok(seen.changes > 0 && w.rev > 0);
  await twoPolls(w);
  assert.equal(c.calls.length, 2, 'a current figure is compiled again');
  await w.stop();
});

test('a change of a source, of an input, or of the preamble is compiled once it is stable', async (t) => {
  const f = folder(t, { 'figures/a.tex': '\\begin{tikzpicture}\\draw plot file {figures/a.csv};\\end{tikzpicture}\n', 'figures/a.csv': '0 0\n' });
  const { w, c } = watcher(f, deck(tag('a')));
  await w.idle();
  assert.equal(c.calls.length, 1);
  const rev = w.rev;
  for (const [file, text] of [
    ['figures/a.tex', `${f.read('figures/a.tex')}% changed\n`],
    ['figures/a.csv', '1 1\n'],
    ['preamble.tex', '\\newcommand{\\x}{x}\n'],
  ]) {
    const before = c.calls.length;
    f.write(file, text);
    w.poll();
    await w.idle();
    assert.equal(c.calls.length, before, `${file} is taken before it is stable`);
    w.poll();
    await w.idle();
    assert.equal(c.calls.length, before + 1, `a change of ${file} is not compiled`);
  }
  assert.ok(w.rev > rev);
  assert.equal(w.state().outputs.a, output(f.dir, 'a', f.read('figures/a.tex'), { width: 600, height: 400 }).figure.hash);
  await w.stop();
});

test('after a failed compile the errors are told, the last good output is kept, and the same inputs are not compiled again', async (t) => {
  const f = folder(t, { 'figures/a.tex': DRAWING });
  const { w, c, seen } = watcher(f, deck(tag('a')));
  await w.idle();
  const good = f.read('figures/a.js');
  f.write('figures/a.tex', DRAWING.replace('\\draw', '\\FAIL'));
  await twoPolls(w);
  assert.equal(c.calls.length, 2);
  assert.equal(f.read('figures/a.js'), good);
  assert.deepEqual(w.state().errors, { a: [{ file: 'figures/a.tex', line: 1, message: 'Undefined control sequence' }] });
  assert.equal(w.state().uncompiled, 1);
  assert.ok(w.state().compiled.a);
  for (let i = 0; i < 3; i++) await twoPolls(w);
  assert.equal(c.calls.length, 2, 'the same failing inputs are compiled again');
  // a change of the box is compiled again, and so is a new file of the figures folder, once
  w.written(deck(tag('a', 300, 300)));
  await w.idle();
  assert.equal(c.calls.length, 3);
  f.write('figures/new.csv', '0 0\n');
  for (let i = 0; i < 3; i++) await twoPolls(w);
  assert.equal(c.calls.length, 4);
  // a fixed source clears the errors
  f.write('figures/a.tex', DRAWING);
  await twoPolls(w);
  assert.equal(c.calls.length, 5);
  assert.deepEqual(w.state().errors, {});
  assert.equal(w.state().uncompiled, 0);
  assert.ok(seen.log.some((line) => line.includes('figures/a.tex:1: Undefined control sequence')), seen.log.join('\n'));
  await w.stop();
});

test('a figure without a source or with an invalid name is not compiled, and is counted as not compiled as npm run check counts it', async (t) => {
  const f = folder(t, { 'figures/a.tex': DRAWING, 'figures/bad name.tex': DRAWING });
  const html = deck(tag('a'), tag('lost'), tag('bad name'), '<div class="tikz"></div>');
  f.write('index.html', html);
  const { w, c } = watcher(f, html);
  await w.idle();
  assert.deepEqual(c.calls.map((call) => call.name), ['a']);
  assert.equal(w.state().uncompiled, figureProblems(join(f.dir, 'index.html')).length);
  assert.equal(w.state().uncompiled, 3);
  assert.deepEqual(Object.keys(w.state().outputs).sort(), ['a', 'lost']);
  assert.equal(w.state().outputs.lost, null);
  // a source added on disk is compiled
  f.write('figures/lost.tex', DRAWING);
  await twoPolls(w);
  assert.deepEqual(c.calls.map((call) => call.name), ['a', 'lost']);
  assert.equal(w.state().uncompiled, 2);
  await w.stop();
});

test('an output written by another program is told with its hash, and an output that is stale for it is compiled', async (t) => {
  const f = folder(t, { 'figures/a.tex': DRAWING });
  const { w, c, seen } = watcher(f, deck(tag('a')));
  await w.idle();
  const changes = seen.changes;
  const box = { width: 600, height: 400 };
  // a source and its output pulled by git, where npm run tex compiled them
  const pulled = `${DRAWING}% pulled\n`;
  f.write('figures/a.tex', pulled);
  f.write('figures/a.js', output(f.dir, 'a', pulled, box).text);
  await twoPolls(w);
  assert.equal(c.calls.length, 1);
  assert.ok(seen.changes > changes);
  assert.equal(w.state().outputs.a, output(f.dir, 'a', pulled, box).figure.hash);
  f.write('figures/a.tex', DRAWING);
  await twoPolls(w);
  assert.equal(c.calls.length, 2);
  const stale = output(f.dir, 'a', `${DRAWING}% old\n`, box);
  f.write('figures/a.js', stale.text);
  await twoPolls(w);
  assert.equal(c.calls.length, 3);
  assert.equal(w.state().outputs.a, output(f.dir, 'a', DRAWING, box).figure.hash);
  await w.stop();
});

test('a preview is compiled before the stale figures and writes nothing, and a newer preview of the same page takes the place of one that waits', async (t) => {
  const f = folder(t, { 'figures/a.tex': DRAWING, 'figures/b.tex': DRAWING });
  f.write('figures/a.js', output(f.dir, 'a', DRAWING, { width: 600, height: 400 }).text);
  f.write('figures/b.js', output(f.dir, 'b', DRAWING, { width: 600, height: 400 }).text);
  const { w, c } = watcher(f, deck(tag('a'), tag('b')));
  await w.idle();
  assert.equal(c.calls.length, 0);
  const release = c.hold('a');
  const first = w.preview('page-1', 'a', `${DRAWING}% 1\n`, { width: 100, height: 100 });
  const second = w.preview('page-1', 'a', `${DRAWING}% 2\n`, { width: 100, height: 100 });
  const other = w.preview('page-2', 'b', `${DRAWING}% other\n`, { width: 100, height: 100 });
  const third = w.preview('page-1', 'a', `${DRAWING}% 3\n`, { width: 100, height: 100 });
  // b is made stale while the first preview runs, and it waits for the previews
  f.write('figures/b.tex', `${DRAWING}% changed\n`);
  // the polls do not wait for the compile that is held
  for (let i = 0; i < 2; i++) {
    w.poll();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.deepEqual(await second, { superseded: true });
  release();
  const answers = await Promise.all([first, other, third]);
  await w.idle();
  assert.deepEqual(
    c.calls.map((call) => `${call.name}${call.source.slice(DRAWING.length).trim()}`),
    ['a% 1', 'b% other', 'a% 3', 'b% changed'],
  );
  assert.equal(answers[0].figure.hash, output(f.dir, 'a', `${DRAWING}% 1\n`, { width: 100, height: 100 }).figure.hash);
  assert.equal(answers[2].figure.hash, output(f.dir, 'a', `${DRAWING}% 3\n`, { width: 100, height: 100 }).figure.hash);
  assert.equal(f.read('figures/a.tex'), DRAWING);
  assert.equal(f.read('figures/a.js'), output(f.dir, 'a', DRAWING, { width: 600, height: 400 }).text);
  const failed = await w.preview('page-1', 'a', '\\FAIL', { width: 100, height: 100 });
  assert.deepEqual(failed, { errors: [{ file: 'figures/a.tex', line: 1, message: 'Undefined control sequence' }] });
  assert.deepEqual(w.state().errors, {}, 'a failed preview is told as an error of the figure');
  await w.stop();
});

test('without latex or dvisvgm nothing is compiled, and the state tells it', async (t) => {
  const f = folder(t, { 'figures/a.tex': DRAWING });
  const { w, c } = watcher(f, deck(tag('a')), { tools: { latex: null, dvisvgm: '/nonexistent/dvisvgm' } });
  await w.idle();
  await twoPolls(w);
  assert.equal(c.calls.length, 0);
  assert.equal(w.state().compiler, 'missing');
  assert.equal(w.state().uncompiled, 1);
  await w.stop();
});

test('a figure whose preamble changes during its compile is compiled again', async (t) => {
  // a stale output, hence the list of the files of figures/ does not change at the write
  const f = folder(t, { 'figures/a.tex': DRAWING, 'preamble.tex': 'one\n' });
  f.write('figures/a.js', output(f.dir, 'a', `${DRAWING}% old\n`, { width: 600, height: 400 }).text);
  const read = [];
  // a compile that hashes the preamble that it read at its start, as compileFigure does, while the
  // preamble is changed during the first compile
  const compile = async ({ dir, name, source, box }) => {
    const texts = { preamble: readFileSync(join(dir, 'preamble.tex'), 'utf8') };
    read.push(texts.preamble);
    if (read.length === 1) f.write('preamble.tex', 'two\n');
    const figure = { hash: figureHash({ dir, source, box, inputs: [], texts }), width: 10, height: 10, scale: 1, parts: 0, inputs: [], dark: '<svg/>', light: '<svg/>' };
    return { figure, text: figureScript(name, figure) };
  };
  const { w } = watcher(f, deck(tag('a')), { compiler: { compile } });
  await w.idle();
  await twoPolls(w);
  assert.deepEqual(read, ['one\n', 'two\n']);
  assert.equal(w.state().uncompiled, 0);
  await w.stop();
});
