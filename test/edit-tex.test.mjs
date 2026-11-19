// tests of the writer of tex.js in the edit command, on copies of test/pages/tex-sheets. the polls
// are called by the tests, with a stable time of 0 ms, hence a change is taken at the second poll

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs, { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deckTex } from '../scripts/tex.mjs';
import { deriveTex, TexWriter } from '../theme/edit.mjs';
import { until } from './helpers/session.mjs';

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

// a mode set by chmod refuses neither a read nor a write on Windows or to root
const noChmod = process.platform === 'win32' || process.getuid?.() === 0 ? 'chmod does not refuse a read or a write on Windows or to root' : false;

// a writer on the folder f, with the changes it counted, the lines it logged, and the failed writes
// it reported
function writer(f, html = DECK, options = {}) {
  const seen = { changes: 0, log: [], errors: [] };
  const w = new TexWriter(f.dir, html, { stable: 0, log: (m) => seen.log.push(m), onChange: () => seen.changes++, onWriteError: (m) => seen.errors.push(m), ...options });
  return { w, seen };
}

// the reads of name in the folder f by the edit command, i.e. its derivations of tex.js for a
// source, counted through the live bindings of node:fs until the end of the test
function reads(t, f, name) {
  const read = fs.readFileSync;
  const file = join(f.dir, name);
  const count = { n: 0 };
  fs.readFileSync = function (path, ...rest) {
    if (path === file) count.n++;
    return read.call(this, path, ...rest);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.readFileSync = read;
    syncBuiltinESMExports();
  });
  return count;
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
  // a references.bib that cannot be read, with the signature that it had, which a derivation would log
  const lines = seen.log.length;
  if (!noChmod) chmodSync(join(f.dir, 'references.bib'), 0o000);
  w.written(CITED.replace('Citations', 'The citations'));
  await w.idle();
  if (!noChmod) {
    chmodSync(join(f.dir, 'references.bib'), 0o644);
    assert.deepEqual(seen.log.slice(lines), [], 'a write of index.html that cites the same papers does not derive tex.js');
  }
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

test('a touch of preamble.tex or of references.bib that leaves its text as it is is not counted, and a paper added to references.bib is counted although tex.js keeps its text', async (t) => {
  const f = folder(t);
  const { w, seen } = writer(f);
  await twoPolls(w);
  const later = new Date(Date.now() + 5000);
  for (const name of ['preamble.tex', 'references.bib']) {
    utimesSync(join(f.dir, name), later, later);
    await twoPolls(w);
    assert.equal(seen.changes, 0, `a touch of ${name} is counted`);
  }
  const tex = f.read('tex.js');
  f.write('references.bib', `${f.read('references.bib')}\n@article{conley1968,\n  author = {Conley, Charles},\n  title = {Low energy transit orbits},\n  year = {1968},\n}\n`);
  await twoPolls(w);
  assert.equal(seen.changes, 1);
  assert.equal(f.read('tex.js'), tex);
});

test('a source that cannot be read is reported once for each change, and tex.js is not written', async (t) => {
  const f = folder(t, ['references.bib', 'tex.js']);
  mkdirSync(join(f.dir, 'preamble.tex'));
  const before = f.read('tex.js');
  const { w, seen } = writer(f);
  // the reason is logged at the start as well
  w.written(CITED);
  await twoPolls(w);
  assert.equal(seen.log.length, 2);
  assert.match(seen.log[1], /^tex\.js is not written, since preamble\.tex is not read: /);
  w.written(DECK);
  await twoPolls(w);
  assert.equal(seen.log.length, 3);
  assert.equal(f.read('tex.js'), before);
  assert.equal(seen.changes, 0);
});

test('a write of tex.js that fails is logged and reported once, and is tried again at the next polls until it succeeds', async (t) => {
  const f = folder(t);
  // each poll is a retry
  const { w, seen } = writer(f, DECK, { retry: 0 });
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
  const failed = () => seen.log.filter((line) => line.startsWith('could not write'));
  assert.equal(failed().length, 1, seen.log.join('\n'));
  assert.match(failed()[0], /^could not write .*tex\.js: /);
  assert.equal(seen.changes, changes);
  rmSync(join(f.dir, 'tex.js'), { recursive: true });
  await twoPolls(w);
  assert.equal(f.read('tex.js'), deckTex(join(f.dir, 'index.html')).text, 'tex.js is written once the write can succeed');
  assert.equal(seen.errors.length, 2);
  assert.match(seen.errors[0], /tex\.js/);
  assert.equal(seen.errors[1], null);
  assert.equal(seen.changes, changes + 1);
  assert.equal(failed().length, 1);
});

test('a write of tex.js that fails is derived again only once its retry is due, and is written at the first retry after the cause is gone', async (t) => {
  const f = folder(t);
  // the first retry is due 2 s after the failure
  const { w, seen } = writer(f, DECK, { retry: 2000 });
  rmSync(join(f.dir, 'tex.js'));
  mkdirSync(join(f.dir, 'tex.js'));
  const derived = reads(t, f, 'preamble.tex');
  f.write('index.html', CITED);
  w.written(CITED);
  await w.idle();
  assert.equal(derived.n, 1);
  assert.equal(seen.errors.length, 1);
  for (let i = 0; i < 10; i++) {
    w.poll();
    await w.idle();
  }
  assert.equal(derived.n, 1, 'a poll before the retry is due does not derive tex.js again');
  rmSync(join(f.dir, 'tex.js'), { recursive: true });
  await until(async () => {
    w.poll();
    await w.idle();
    return existsSync(join(f.dir, 'tex.js'));
  }, 'the retry of the write of tex.js', 30_000);
  assert.equal(derived.n, 2);
  assert.equal(f.read('tex.js'), deckTex(join(f.dir, 'index.html')).text);
  assert.deepEqual(seen.errors.slice(1), [null]);
});

test('a source saved while tex.js cannot be written is derived once, and again at once only at a new change of a source', async (t) => {
  // a folder in place of tex.js, and a talk folder that cannot be written
  const causes = [['a folder at tex.js', (f) => (rmSync(join(f.dir, 'tex.js')), mkdirSync(join(f.dir, 'tex.js'))), () => {}]];
  if (!noChmod) causes.push(['a talk folder of mode 555', (f) => chmodSync(f.dir, 0o555), (f) => chmodSync(f.dir, 0o755)]);
  for (const [cause, fail, undo] of causes)
    await t.test(cause, async (t) => {
      const f = folder(t);
      // a retry is not due during the test
      const { w, seen } = writer(f, DECK, { retry: 600_000 });
      const preamble = f.read('preamble.tex');
      const derived = reads(t, f, 'preamble.tex');
      const polls = async () => {
        for (let i = 0; i < 12; i++) {
          w.poll();
          await w.idle();
        }
      };
      fail(f);
      // the mode is set back before the folder is removed
      try {
        f.write('preamble.tex', `${preamble}\\newcommand{\\Q}{\\mathbb{Q}}\n`);
        await polls();
        assert.equal(seen.errors.length, 1);
        assert.equal(derived.n, 1, 'a poll before the retry is due does not derive tex.js again');
        f.write('preamble.tex', `${preamble}\\newcommand{\\Q}{\\mathbb{Q}}\n\\newcommand{\\R}{\\mathbb{R}}\n`);
        await polls();
        assert.equal(derived.n, 2, 'a new change of a source is derived at once');
      } finally {
        undo(f);
      }
    });
});

test('a citation while tex.js cannot be written is derived once over later writes of other words, and a new citation is derived at once', async (t) => {
  const f = folder(t);
  const { w, seen } = writer(f, DECK, { retry: 600_000 });
  rmSync(join(f.dir, 'tex.js'));
  mkdirSync(join(f.dir, 'tex.js'));
  const derived = reads(t, f, 'preamble.tex');
  w.written(CITED);
  await w.idle();
  for (let i = 0; i < 10; i++) {
    w.written(CITED.replace('Citations', `Citations ${i}`));
    await w.idle();
    w.poll();
    await w.idle();
  }
  assert.equal(seen.errors.length, 1);
  assert.equal(derived.n, 1, 'a write of other words before the retry is due does not derive tex.js again');
  w.written(CITED.replace('low-energy transfer<cite', 'low-energy transfer<cite data-key="nobody2020"></cite><cite'));
  await w.idle();
  assert.equal(derived.n, 2, 'a new citation is derived at once');
});

test('the skipped lines of preamble.tex are logged at the start of the writer, and nothing is logged at its start without a skipped line or without preamble.tex', async (t) => {
  const f = folder(t);
  assert.match(f.read('preamble.tex'), /^\\usepackage\{tikz\}$/m);
  const printed = execFileSync(process.execPath, ['scripts/tex.mjs', join(f.dir, 'index.html')], { encoding: 'utf8' }).split('\n').filter((line) => line.startsWith('preamble.tex:'));
  assert.equal(printed.length, 1, printed.join('\n'));
  const { w, seen } = writer(f);
  assert.deepEqual(seen.log, printed);
  await twoPolls(w);
  assert.deepEqual(seen.log, printed, 'the same lines are not logged again');
  const clean = folder(t);
  clean.write('preamble.tex', clean.read('preamble.tex').replace('\\usepackage{tikz}\n', ''));
  assert.deepEqual(writer(clean).seen.log, []);
  assert.deepEqual(writer(folder(t, ['references.bib', 'tex.js'])).seen.log, []);
});

test('the reason why tex.js is not written is logged at the start of the writer while a file that preamble.tex inputs cannot be read', { skip: noChmod }, async (t) => {
  const f = folder(t);
  chmodSync(join(f.dir, 'defs.tex'), 0o000);
  const { w, seen } = writer(f);
  assert.equal(seen.log.length, 1, seen.log.join('\n'));
  assert.match(seen.log[0], /^tex\.js is not written, since defs\.tex is not read: /);
  await twoPolls(w);
  assert.equal(seen.log.length, 1, 'the reason is not logged again without a change');
});

test('a write of index.html while preamble.tex is being saved does not write tex.js without its macros, and tex.js is written once preamble.tex is stable', async (t) => {
  const f = folder(t);
  const { w, seen } = writer(f);
  // an editor that deletes preamble.tex and writes it again
  const preamble = f.read('preamble.tex');
  rmSync(join(f.dir, 'preamble.tex'));
  f.write('index.html', CITED);
  w.written(CITED);
  await w.idle();
  assert.ok(f.read('tex.js').includes('"half"'), 'tex.js keeps the macros of preamble.tex');
  assert.equal(seen.changes, 0);
  f.write('preamble.tex', preamble);
  await twoPolls(w);
  assert.equal(f.read('tex.js'), deckTex(join(f.dir, 'index.html')).text);
  assert.ok(f.read('tex.js').includes('"szebehely1967"'));
  assert.equal(seen.changes, 1);
});

test('the skipped lines of the sources and the cited keys without an entry are logged as npm run tex prints them, and only when they differ from those logged last', async (t) => {
  const html = DECK.replace('low-energy transfer</p>', 'low-energy transfer<cite data-key="nobody2020"></cite></p>');
  const change = (f) => {
    f.write('preamble.tex', `${f.read('preamble.tex')}\\newcommand{\\Z}{\\mathbb{Z}\n`);
    f.write('references.bib', `${f.read('references.bib')}\n@article{broken, title = {unclosed\n`);
    f.write('index.html', html);
  };
  const npm = folder(t);
  change(npm);
  const printed = execFileSync(process.execPath, ['scripts/tex.mjs', join(npm.dir, 'index.html')], { encoding: 'utf8' }).split('\n').slice(1).filter((line) => /^(preamble\.tex|references\.bib|index\.html):/.test(line));
  assert.equal(printed.length, 4, printed.join('\n'));
  const f = folder(t);
  const { w, seen } = writer(f);
  // the skipped line of the preamble before the change, logged at the start
  const start = seen.log.length;
  change(f);
  w.written(html);
  await twoPolls(w);
  assert.deepEqual(seen.log.slice(start), printed);
  f.write('defs.tex', `${f.read('defs.tex')}\\newcommand{\\R}{\\mathbb{R}}\n`);
  await twoPolls(w);
  assert.ok(f.read('tex.js').includes('"R"'));
  assert.deepEqual(seen.log.slice(start), printed);
});

// the edit command on a copy of test/pages/tex-sheets, with hello() for a page of the host, and
// save() for a save of a source by the page of token
async function sourceSession(t) {
  const { talkFolder, startEdit, stopEdit, post, raw } = await import('./helpers/session.mjs');
  const { root, talk, config } = talkFolder(t, DECK);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of SOURCES) cpSync(join(DIR, name), join(talk, name));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const hello = async (name) => (await post(edit.port, api('hello'), { name })).json();
  const save = (token, name, base, text) => raw(edit.port, 'PUT', api(`source/${name}`), { body: { token, base, text }, headers: { 'content-type': 'application/json' } });
  return { root, talk, config, edit, api, hello, save, post, read: (name) => readFileSync(join(talk, name), 'utf8'), write: (name, text) => writeFileSync(join(talk, name), text) };
}

test('a save of preamble.tex or references.bib is written over the text that the page read, and a save on an older text is refused with the newer text', { timeout: 60_000 }, async (t) => {
  const s = await sourceSession(t);
  const [ann, ben] = [await s.hello('Ann'), await s.hello('Ben')];
  const preamble = s.read('preamble.tex');
  const mine = `${preamble}\\newcommand{\\Q}{\\mathbb{Q}}\n`;
  const first = await s.save(ann.token, 'preamble.tex', preamble, mine);
  assert.equal(first.status, 200, first.text);
  assert.equal(s.read('preamble.tex'), mine);
  assert.deepEqual(readdirSync(s.talk).filter((name) => name.startsWith('.preamble')), [], 'no temporary file is left');
  await until(() => s.read('tex.js').includes('"Q"'), 'the macro Q in tex.js');
  const theirs = `${preamble}\\newcommand{\\R}{\\mathbb{R}}\n`;
  const stale = await s.save(ben.token, 'preamble.tex', preamble, theirs);
  assert.equal(stale.status, 409);
  assert.equal(stale.json().text, mine);
  assert.equal(s.read('preamble.tex'), mine);
  // a change on disk is a newer text as well, and the byte-order mark of the file is kept
  s.write('references.bib', `\ufeff${s.read('references.bib')}`);
  const bib = s.read('references.bib').slice(1);
  const added = `${bib}\n@book{szebehely1968, author = {Szebehely, Victor}, title = {Orbits}, year = {1968}}\n`;
  const old = await s.save(ann.token, 'references.bib', bib.replace('koon2000', 'koon2001'), added);
  assert.equal(old.status, 409);
  assert.equal(old.json().text, bib);
  assert.equal((await s.save(ann.token, 'references.bib', bib, added)).status, 200);
  assert.equal(s.read('references.bib'), `\ufeff${added}`);
  // a source that is missing from the folder is read as empty
  rmSync(join(s.talk, 'preamble.tex'));
  assert.equal((await s.save(ben.token, 'preamble.tex', '', theirs)).status, 200);
  assert.equal(s.read('preamble.tex'), theirs);
  assert.equal((await s.save('not a token', 'preamble.tex', theirs, mine)).status, 404);
  assert.equal(s.read('preamble.tex'), theirs);
});

test('a guest saves preamble.tex and references.bib through the relay as the host does, and the edit command takes no other file from a page', { timeout: 60_000 }, async (t) => {
  const { startRelay } = await import('../scripts/relay.mjs');
  const s = await sourceSession(t);
  const secret = 'a secret of the group, long enough';
  const relay = await startRelay({ host: '127.0.0.1', secret });
  t.after(() => relay.close());
  const ann = await s.hello('Ann');
  assert.equal((await s.post(s.edit.port, s.api('share'), { relay: relay.url, secret })).status, 200);
  const guest = async (method, route, body) => {
    const r = await fetch(`${relay.url}${s.api(route)}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const ben = (await guest('POST', 'hello', { name: 'Ben' })).json;
  assert.equal(ben.host, false);
  const read = await fetch(`${relay.url}${s.edit.base}references.bib`);
  assert.equal(read.status, 200);
  const bib = await read.text();
  const added = `${bib}\n@book{szebehely1968, author = {Szebehely, Victor}, title = {Orbits}, year = {1968}}\n`;
  const saved = await guest('PUT', 'source/references.bib', { token: ben.token, base: bib, text: added });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(s.read('references.bib'), added);
  const stale = await guest('PUT', 'source/references.bib', { token: ben.token, base: bib, text: `${bib}% mine\n` });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.text, added);
  const before = Object.fromEntries(['index.html', 'tex.js', 'defs.tex', 'mymath.sty'].map((name) => [name, s.read(name)]));
  for (const name of ['index.html', 'tex.js', 'defs.tex', 'mymath.sty', 'other.bib', 'figures%2Forbit.tex', '..%2Fpreamble.tex', '.session%2Fkey']) {
    for (const [who, send] of [['the host', (body) => s.save(ann.token, name, body.base, body.text).then((r) => ({ status: r.status }))], ['a guest', (body) => guest('PUT', `source/${name}`, { token: ben.token, ...body })]]) {
      const refused = await send({ base: '', text: 'x' });
      assert.equal(refused.status, 404, `${name} from ${who}`);
    }
  }
  assert.deepEqual(Object.fromEntries(Object.keys(before).map((name) => [name, s.read(name)])), before);
  assert.equal(existsSync(join(s.talk, 'other.bib')), false);
  assert.equal(existsSync(join(s.root, 'preamble.tex')), false);
  // a preamble saved by a guest may input only files of the talk folder, since the macros of any
  // other file of the host would be written into tex.js, which every page reads
  const preamble = s.read('preamble.tex');
  for (const line of ['\\input{../secret}', '\\input{/etc/hosts}', '\\usepackage{.session/key}', '\\input{a/../../b}']) {
    const refused = await guest('PUT', 'source/preamble.tex', { token: ben.token, base: preamble, text: `${preamble}${line}\n` });
    assert.equal(refused.status, 403, line);
  }
  assert.equal(s.read('preamble.tex'), preamble);
  assert.equal((await guest('PUT', 'source/preamble.tex', { token: ben.token, base: preamble, text: `${preamble}\\input{defs}\n` })).status, 200);
  assert.equal((await s.save(ann.token, 'preamble.tex', `${preamble}\\input{defs}\n`, `${preamble}\\input{../shared/macros}\n`)).status, 200, 'the host inputs any file');
});
