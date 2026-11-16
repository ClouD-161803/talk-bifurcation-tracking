// tests of the writer of tex.js in the edit command, on copies of test/pages/tex-sheets. the polls
// are called by the tests, with a stable time of 0 ms, hence a change is taken at the second poll

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deckTex } from '../scripts/tex.mjs';
import { deriveTex, TexWriter } from '../theme/edit.mjs';

const DIR = 'test/pages/tex-sheets';
const SOURCES = ['preamble.tex', 'references.bib', 'tex.js', 'defs.tex', 'mymath.sty'];
const DECK = readFileSync(join(DIR, 'index.html'), 'utf8');
const CITED = DECK.replace('low-energy transfer</p>', 'low-energy transfer<cite data-key="szebehely1967"></cite></p>');

// a copy of the deck and of the files of names in a temporary folder, removed after the test
function folder(t, names = SOURCES) {
  const dir = mkdtempSync(join(tmpdir(), 'slides tex-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['index.html', ...names]) cpSync(join(DIR, name), join(dir, name));
  const read = (name) => readFileSync(join(dir, name), 'utf8');
  const at = (name) => statSync(join(dir, name)).mtimeMs;
  return { dir, read, at, write: (name, text) => writeFileSync(join(dir, name), text) };
}

// a writer on the folder f, with the changes it counted, the lines it logged, and the failed writes
// it reported
function writer(f, html = DECK) {
  const seen = { changes: 0, log: [], errors: [] };
  const w = new TexWriter(f.dir, html, { stable: 0, log: (m) => seen.log.push(m), onChange: () => seen.changes++, onWriteError: (m) => seen.errors.push(m) });
  return { w, seen };
}

// two polls, i.e. a change seen and then taken, since it did not change between them
async function twoPolls(w) {
  for (let i = 0; i < 2; i++) {
    w.poll();
    await w.idle();
  }
}

test('the text of tex.js derived by the edit command is the one of npm run tex for the same folder', (t) => {
  const f = folder(t);
  f.write('index.html', CITED);
  assert.equal(deriveTex(f.dir, CITED).text, deckTex(join(f.dir, 'index.html')).text);
  const bare = folder(t, ['references.bib']);
  assert.equal(deriveTex(bare.dir, DECK).text, deckTex(join(bare.dir, 'index.html')).text);
});

test('a start of the writer does not write tex.js, even when its text is not the one of the sources', async (t) => {
  const f = folder(t);
  f.write('tex.js', f.read('tex.js').replace('    "half": "\\\\frac{1}{2}",\n', ''));
  const before = { text: f.read('tex.js'), at: f.at('tex.js') };
  const { w, seen } = writer(f);
  await twoPolls(w);
  assert.deepEqual({ text: f.read('tex.js'), at: f.at('tex.js') }, before);
  assert.equal(seen.changes, 0);
});

test('a write of index.html that cites another paper writes tex.js, and one that cites the same papers does not', async (t) => {
  const f = folder(t);
  const { w, seen } = writer(f);
  // the edit command calls written() once index.html holds the text
  f.write('index.html', CITED);
  w.written(CITED);
  await w.idle();
  assert.ok(f.read('tex.js').includes('"szebehely1967"'));
  assert.equal(f.read('tex.js'), deckTex(join(f.dir, 'index.html')).text);
  assert.equal(seen.changes, 1);
  const at = f.at('tex.js');
  w.written(CITED.replace('Citations', 'The citations'));
  await twoPolls(w);
  assert.equal(f.at('tex.js'), at);
  assert.equal(seen.changes, 1);
});

test('a derived text that tex.js already has is not written again', async (t) => {
  const f = folder(t);
  const { w, seen } = writer(f);
  const at = f.at('tex.js');
  // a key without an entry of references.bib does not change the references of tex.js
  w.written(DECK.replace('low-energy transfer</p>', 'low-energy transfer<cite data-key="nobody2020"></cite></p>'));
  await w.idle();
  assert.equal(f.at('tex.js'), at);
  assert.equal(seen.changes, 0);
});

test('tex.js is not written in a folder without preamble.tex and references.bib', async (t) => {
  const f = folder(t, ['tex.js']);
  const before = f.read('tex.js');
  const { w, seen } = writer(f);
  w.written(CITED);
  await twoPolls(w);
  assert.equal(f.read('tex.js'), before);
  assert.equal(seen.changes, 0);
});

test('a change of preamble.tex, of a file that it inputs, or of a package that it looks up writes tex.js once it is stable', async (t) => {
  const f = folder(t);
  const { w, seen } = writer(f);
  f.write('preamble.tex', `${f.read('preamble.tex')}\\newcommand{\\Q}{\\mathbb{Q}}\n`);
  w.poll();
  await w.idle();
  assert.ok(!f.read('tex.js').includes('"Q"'), 'a change seen once is not taken yet');
  w.poll();
  await w.idle();
  assert.ok(f.read('tex.js').includes('"Q"'));
  f.write('defs.tex', `${f.read('defs.tex')}\\newcommand{\\R}{\\mathbb{R}}\n`);
  await twoPolls(w);
  assert.ok(f.read('tex.js').includes('"R"'));
  // physics.sty is looked up next to the preamble, as TeX does
  f.write('physics.sty', '\\newcommand{\\C}{\\mathbb{C}}\n');
  await twoPolls(w);
  assert.ok(f.read('tex.js').includes('"C"'));
  assert.equal(f.read('tex.js'), deckTex(join(f.dir, 'index.html')).text);
  assert.equal(seen.changes, 3);
});

test('a tex.js changed by another program is counted once it is stable, and is not written over', async (t) => {
  const f = folder(t);
  const { w, seen } = writer(f);
  const changed = f.read('tex.js').replace('  "macros": {\n', '  "macros": {\n    "Q": "\\\\mathbb{Q}",\n');
  f.write('tex.js', changed);
  w.poll();
  await w.idle();
  assert.equal(seen.changes, 0, 'a change seen once is not counted yet');
  await twoPolls(w);
  assert.equal(seen.changes, 1);
  assert.equal(f.read('tex.js'), changed);
});

test('a source that cannot be read is reported once for each change, and tex.js is not written', async (t) => {
  const f = folder(t, ['references.bib', 'tex.js']);
  mkdirSync(join(f.dir, 'preamble.tex'));
  const before = f.read('tex.js');
  const { w, seen } = writer(f);
  w.written(CITED);
  await twoPolls(w);
  assert.equal(seen.log.length, 1);
  assert.match(seen.log[0], /^tex\.js is not written, since preamble\.tex is not read: /);
  w.written(DECK);
  await twoPolls(w);
  assert.equal(seen.log.length, 2);
  assert.equal(f.read('tex.js'), before);
  assert.equal(seen.changes, 0);
});

test('a write of tex.js that fails is logged and reported once, and is tried again at the next polls until it succeeds', async (t) => {
  const f = folder(t);
  const { w, seen } = writer(f);
  // a folder in place of tex.js, which a rename does not replace on any system
  rmSync(join(f.dir, 'tex.js'));
  mkdirSync(join(f.dir, 'tex.js'));
  await twoPolls(w);
  const changes = seen.changes;
  f.write('index.html', CITED);
  w.written(CITED);
  await w.idle();
  for (let i = 0; i < 4; i++) {
    w.poll();
    await w.idle();
  }
  assert.equal(seen.log.length, 1, seen.log.join('\n'));
  assert.match(seen.log[0], /^could not write .*tex\.js: /);
  assert.equal(seen.changes, changes);
  rmSync(join(f.dir, 'tex.js'), { recursive: true });
  await twoPolls(w);
  assert.equal(f.read('tex.js'), deckTex(join(f.dir, 'index.html')).text, 'tex.js is written once the write can succeed');
  assert.equal(seen.errors.length, 2);
  assert.match(seen.errors[0], /tex\.js/);
  assert.equal(seen.errors[1], null);
  assert.equal(seen.changes, changes + 1);
  assert.equal(seen.log.length, 1);
});
