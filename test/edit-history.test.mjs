// the version history of the edit command: the rule of closing a version, the file
// .session/history.jsonl read again after a restart, cut by a crash, or unreadable, a change of
// index.html while the command was not running, the slides and the marks of a version, a name, a
// restore, the preview of a version, the rewrite of the file past its size limit, and the texts set
// aside. the module is driven directly where this is exact enough, and the edit command is started
// as a child process for the requests

import assert from 'node:assert/strict';
import fs, { appendFileSync, chmodSync, closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { Authority, History, diff, slideChanges, slidesOf } from '../theme/edit.mjs';
import { DECK, post, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const ANN = 'AnnAnnAnnAnnAnnAnnAnn1';
const BO = 'BoBoBoBoBoBoBoBoBoBoBo';

// a .session folder in a temporary folder, removed after the test
function sessionDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'slides history-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// the deck made to read as text by one operation of author
const enterText = (authority, text, author) => authority.enter(diff(authority.text, text), author);
const replace = (authority, from, to, author) => enterText(authority, authority.text.replace(from, to), author);

// a history on a new authority of text, with versions closed only by close() unless times are given
function open(dir, text, options = {}) {
  const authority = new Authority(text);
  const logged = [];
  const history = new History(dir, authority, { quiet: 3_600_000, longest: 3_600_000, log: (m) => logged.push(m), ...options });
  return { authority, history, logged };
}

test('a version is closed after a quiet time, and at the latest after the longest time', { timeout: 60_000 }, async (t) => {
  await t.test('after the quiet time since the last operation', async () => {
    // read on the clock of the history, and with a quiet time far above the pause on a slow runner
    const { authority, history } = open(sessionDir(t), DECK, { quiet: 2_000, longest: 60_000 });
    let closedAt = null;
    history.onChange(() => (closedAt ??= performance.now()));
    replace(authority, 'One', 'Uno', ANN);
    const first = performance.now();
    // a second operation within the quiet time moves the close
    await until(() => performance.now() - first >= 50, 'a pause shorter than the quiet time');
    const last = performance.now();
    replace(authority, 'Two', 'Deux', ANN);
    assert.equal(closedAt, null);
    await until(() => history.list().versions.length === 2, 'the version to be closed');
    assert.ok(closedAt - last >= 2_000, `closed ${closedAt - last} ms after the last operation`);
    assert.equal(history.list().versions[0].slides.join(), '1,2');
    history.stopSync();
  });

  await t.test('at the latest after the longest time since the first operation, while operations go on', async () => {
    const { authority, history } = open(sessionDir(t), DECK, { quiet: 5_000, longest: 150 });
    let closedAt = null;
    history.onChange(() => (closedAt ??= Date.now()));
    const first = Date.now();
    let last = first;
    for (let i = 0; closedAt === null; i++) {
      assert.ok(Date.now() - first < 30_000, 'the version was not closed while operations went on');
      replace(authority, '</body>', `<i>${i}</i></body>`, ANN);
      last = Date.now();
      await new Promise((done) => setTimeout(done, 10));
    }
    assert.ok(closedAt - first >= 150, `closed ${closedAt - first} ms after the first operation`);
    assert.ok(closedAt - last < 5_000, 'the version was closed by the quiet time');
    replace(authority, '</body>', '<i>after</i></body>', ANN);
    history.stopSync();
    assert.equal(history.list().versions.length, 3, 'the operation after the close begins the next version');
  });
});

test('the text of every version is rebuilt from the file after a restart', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  const { authority, history } = open(dir, DECK);
  const texts = new Map();
  // more versions than are kept between two texts held in memory
  for (let i = 0; i < 130; i++) {
    const n = i % 7;
    if (n === 0) replace(authority, '</body>', `<section>\n  <h2>Added ${i}</h2>\n</section>\n</body>`, i % 2 ? ANN : BO);
    else if (n === 3) replace(authority, /<section>\n {2}<h2>Added \d+<\/h2>\n<\/section>\n/, '', ANN);
    else replace(authority, /First slide[^<]*/, `First slide ${i}`, BO);
    const v = history.close();
    texts.set(v.id, authority.text);
  }
  history.name([...texts.keys()][10], 'Draft');
  history.stopSync();
  const removed = history.list().versions.map((v) => v.removed);
  assert.ok(removed.some((r) => r?.slides.length), 'some versions remove a slide');
  const again = open(dir, authority.text);
  assert.deepEqual(again.logged, []);
  const listed = again.history.list();
  assert.deepEqual(listed.versions.map((v) => v.removed), removed);
  assert.deepEqual(listed.versions.slice(0, -1).map((v) => v.id), [...texts.keys()].reverse());
  assert.equal(again.history.textOf(listed.versions.at(-1).id), DECK);
  assert.equal(listed.versions.find((v) => v.name)?.id, [...texts.keys()][10]);
  for (const [id, text] of texts) assert.equal(again.history.textOf(id), text, `the text of version ${id}`);
  assert.deepEqual(again.history.found.patches, []);
  assert.equal(again.history.textOf('unknown'), null);
});

test('a last line cut by a crash is left out, and the file is appended to whole again', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'history.jsonl');
  const { authority, history } = open(dir, DECK);
  replace(authority, 'One', 'Uno', ANN);
  const v1 = history.close();
  const t1 = authority.text;
  history.stopSync();
  const whole = readFileSync(file, 'utf8');
  appendFileSync(file, '{"kind":"version","id":"cut","time":1,"authors":["Ann"],"patches":[{"sta');
  const again = open(dir, t1);
  const start = history.list().versions.at(-1).id;
  assert.deepEqual(again.history.list().versions.map((v) => v.id), [v1.id, start]);
  assert.equal(readFileSync(file, 'utf8'), whole);
  replace(again.authority, 'Two', 'Deux', BO);
  const v2 = again.history.close();
  again.history.stopSync();
  const third = open(dir, again.authority.text);
  assert.deepEqual(third.history.list().versions.map((v) => v.id), [v2.id, v1.id, start]);
  assert.equal(third.history.textOf(v1.id), t1);
  assert.equal(third.history.textOf(v2.id), again.authority.text);
});

test('a file that cannot be read is moved aside, and a new history begins', { timeout: 60_000 }, async (t) => {
  for (const [what, content] of [
    ['a file of another format', 'not a history\n'],
    ['a line in the middle that cannot be read', `${JSON.stringify({ kind: 'base', time: 1, text: DECK })}\nnot json\n${JSON.stringify({ kind: 'name', id: 'x', name: 'y' })}\n`],
    ['a version whose patches leave the text', `${JSON.stringify({ kind: 'base', time: 1, text: 'abc' })}\n${JSON.stringify({ kind: 'version', id: 'a', time: 2, authors: [], patches: [{ start: 2, end: 9, text: '' }], marks: [], slides: [] })}\n{"kind":"name","id":"a","name":"n"}\n`],
  ]) {
    await t.test(what, () => {
      const dir = sessionDir(t);
      writeFileSync(join(dir, 'history.jsonl'), content);
      const { history, logged } = open(dir, DECK);
      assert.equal(logged.length, 1, logged.join('\n'));
      assert.match(logged[0], /could not be read/);
      const aside = readdirSync(dir).filter((n) => n.startsWith('history-unreadable-'));
      assert.equal(aside.length, 1);
      assert.equal(readFileSync(join(dir, aside[0]), 'utf8'), content);
      assert.deepEqual(history.list().versions.map((v) => [v.start, history.textOf(v.id)]), [[true, DECK]]);
      assert.equal(history.found, null);
      assert.deepEqual(JSON.parse(readFileSync(join(dir, 'history.jsonl'), 'utf8').split('\n')[0]).text, DECK);
    });
  }
});

// a deck with a title slide, a hidden slide, a stack of two vertical slides, and a closing slide
// with an appendix after it
const STACKED = [
  '<!doctype html>',
  '<body><div class="reveal"><div class="slides">',
  '<section class="title">',
  '  <h1>Title</h1>',
  '</section>',
  '<section>',
  '  <h2>Alpha</h2>',
  '  <p>One</p>',
  '  <p>Two</p>',
  '</section>',
  '<section data-visibility="hidden">',
  '  <h2>Hidden</h2>',
  '</section>',
  '<section>',
  '  <section>',
  '    <h2>Down one</h2>',
  '  </section>',
  '  <section>',
  '    <h2>Down two</h2>',
  '  </section>',
  '</section>',
  '<section>',
  '  <h2>Beta</h2>',
  '</section>',
  '<section class="closing">',
  '  <h2>Thanks</h2>',
  '</section>',
  '<section>',
  '  <h2>Appendix</h2>',
  '</section>',
  '<section>',
  '  <section><h2>Appendix down</h2></section>',
  '</section>',
  '</div></div></body>',
  '',
].join('\n');

test('the slides of a version are numbered as the status bar numbers them', { timeout: 60_000 }, async (t) => {
  await t.test('a slide at the top by its place in the show, and a vertical slide as reveal.js counts it', () => {
    const numberOf = (heading) => slidesOf(STACKED).find((s) => STACKED.slice(s.start, s.end).includes(heading))?.number;
    // the hidden slide takes the place of the shown slide after it, and the stack is one place
    assert.deepEqual(['Title', 'Alpha', 'Hidden', 'Beta', 'Thanks', 'Appendix<'].map(numberOf), [1, 2, 3, 4, 5, 6]);
    // reveal.js counts the hidden slide and each vertical slide, and leaves out the title slide
    assert.equal(numberOf('Down one'), 3);
    assert.equal(numberOf('Down two'), 4);
    // the closing slide and the appendix are uncounted for reveal.js
    assert.equal(numberOf('Appendix down'), 6);
    assert.equal(slidesOf(STACKED).length, 9);
  });

  const { authority, history } = open(sessionDir(t), STACKED);
  const close = () => history.close();

  await t.test('a changed slide', () => {
    replace(authority, 'Down two', 'Down 2', ANN);
    close();
    const v = history.list().versions[0];
    assert.deepEqual(v.slides, [4]);
    assert.equal(v.removed, undefined);
  });

  await t.test('an added slide', () => {
    replace(authority, '<section>\n  <h2>Beta</h2>', '<section>\n  <h2>New</h2>\n</section>\n<section>\n  <h2>Beta</h2>', BO);
    close();
    const v = history.list().versions[0];
    assert.deepEqual(v.slides, [4]);
    assert.equal(v.removed, undefined);
  });

  await t.test('a removed slide, numbered in the version before', () => {
    replace(authority, '<section>\n  <h2>New</h2>\n</section>\n', '', ANN);
    close();
    assert.deepEqual(history.list().versions[0].slides, []);
    assert.deepEqual(history.list().versions[0].removed, { slides: [4], elements: 0 });
  });

  await t.test('an element removed from a slide that stays', () => {
    replace(authority, '  <p>Two</p>\n', '', ANN);
    close();
    const v = history.list().versions[0];
    assert.deepEqual(v.slides, [2]);
    assert.deepEqual(v.removed, { slides: [], elements: 1 });
  });

  await t.test('a removed vertical slide and a changed one in one version', () => {
    replace(authority, '  <section>\n    <h2>Down one</h2>\n  </section>\n', '', BO);
    replace(authority, 'Down 2', 'Down 2b', ANN);
    close();
    const v = history.list().versions[0];
    assert.deepEqual(v.slides, [3]);
    assert.deepEqual(v.removed, { slides: [3], elements: 0 });
    assert.deepEqual(history.list().versions[0].authors, [BO, ANN]);
  });

  await t.test('slideChanges on two texts', () => {
    const before = STACKED;
    const after = STACKED.replace('<p>One</p>', '<p>Uno</p>');
    const at = after.indexOf('Uno');
    assert.deepEqual(slideChanges(before, slidesOf(before), after, slidesOf(after), [{ start: at, end: at + 3 }]), { slides: [2] });
  });
});

test('the marks of a version hold who changed each range last, moved by later operations', { timeout: 60_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'slides history-'));
  try {
    const { authority, history } = open(dir, DECK.replace('</body>', '<section>\n  <h2>Three</h2>\n  <p>Kept</p>\n  <p>Removed by Ann</p>\n</section>\n</body>'));
    replace(authority, 'Two', 'Deux', ANN);
    // an operation of Bo before the mark of Ann moves it
    replace(authority, '<h2>One</h2>', '<h2>One</h2>\n  <p>Inserted by Bo</p>', BO);
    replace(authority, 'Second slide', 'Second slide, typed by Ann', ANN);
    // Bo writes over a part of what Ann typed, which splits her mark
    replace(authority, 'typed by Ann', 'typed by Bo', BO);
    // a removal leaves an empty mark
    replace(authority, '  <p>Removed by Ann</p>\n', '', ANN);
    const v = history.close();
    const text = authority.text;
    const marks = history.get(v.id).marks.map((m) => [m.author, text.slice(m.start, m.end), m.start === m.end]);
    assert.deepEqual(marks.filter(([a]) => a === BO).map(([, s]) => s.trim()), ['<p>Inserted by Bo</p>', 'Bo']);
    assert.ok(marks.some(([a, s]) => a === ANN && s === 'Deux'), JSON.stringify(marks));
    assert.ok(marks.some(([a, s]) => a === ANN && s.includes('typed by')), JSON.stringify(marks));
    assert.ok(marks.some(([a, , empty]) => a === ANN && empty), 'the removal of the paragraph leaves an empty mark');
    assert.deepEqual(v.slides, [1, 2, 3]);
    assert.deepEqual(new Set(history.get(v.id).authors), new Set([ANN, BO]));
    // a change made and undone within one version is not marked
    replace(authority, 'Deux', 'Dos', BO);
    replace(authority, 'Dos', 'Deux', BO);
    replace(authority, '<h2>One</h2>', '<h2>Uno</h2>', ANN);
    const w = history.close();
    assert.deepEqual(history.get(w.id).marks.map((m) => [m.author, authority.text.slice(m.start, m.end)]), [[ANN, 'Uno']]);
    assert.deepEqual(w.slides, [1]);
    history.stopSync();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the file is written anew past its size limit, without the old versions, and the ids are kept', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  const day = 24 * 3600 * 1000;
  let clock = Date.now() - 100 * day;
  const { authority, history } = open(dir, DECK.replace('</body>', '<section>\n  <p>start</p>\n</section>\n</body>'), { now: () => clock });
  const texts = [];
  // each version replaces the text of a paragraph, hence the base does not grow when versions are left out
  const step = (i) => {
    replace(authority, /<p>[^<]*<\/p>\n<\/section>\n<\/body>/, `<p>${String.fromCharCode(97 + i).repeat(1000)}</p>\n</section>\n</body>`, ANN);
    const v = history.close();
    texts.push([v.id, authority.text]);
    clock += 1000;
  };
  for (let i = 0; i < 6; i++) step(i);
  history.name(texts[3][0], 'Kept');
  // the versions after this jump are of the last 30 days
  clock = Date.now() - 2 * day;
  for (let i = 6; i < 9; i++) step(i);
  history.stopSync();
  const file = join(dir, 'history.jsonl');
  const size = statSync(file).size;
  const again = open(dir, authority.text, { maxBytes: size + 100, now: () => clock });
  assert.equal(again.history.list().versions.length, 10);
  // one more version passes the limit
  replace(again.authority, 'First slide', 'First slide, later', BO);
  const last = again.history.close();
  texts.push([last.id, again.authority.text]);
  assert.ok(statSync(file).size < size, 'the file is smaller after the rewrite');
  const kept = texts.slice(3);
  assert.deepEqual(again.history.list().versions.map((v) => v.id), kept.map(([id]) => id).reverse());
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8').split('\n')[0]).text, texts[2][1]);
  again.history.stopSync();
  const third = open(dir, again.authority.text);
  assert.deepEqual(third.history.list().versions.map((v) => v.id), kept.map(([id]) => id).reverse());
  assert.equal(third.history.list().versions.at(-1).name, 'Kept');
  for (const [id, text] of kept) assert.equal(third.history.textOf(id), text);
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), []);
});

test('a text set aside is kept up to its size limit, and the oldest goes past the count limit', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  let clock = 1_000_000;
  const { history } = open(dir, DECK, { asideBytes: 100, asideFiles: 3, now: () => clock++ });
  // 60 characters of two bytes each
  assert.equal(history.setAside('é'.repeat(60), ANN), null);
  const ids = ['a', 'b', 'c', 'd'].map((x) => history.setAside(x.repeat(100), BO).id);
  assert.deepEqual(history.list().aside.map((a) => a.id), ids.slice(1).reverse());
  assert.deepEqual(history.list().aside.map((a) => a.author), [BO, BO, BO]);
  assert.equal(history.asideText(ids[0]), null);
  assert.equal(history.asideText(ids[3]), 'd'.repeat(100));
  assert.equal(readdirSync(join(dir, 'aside')).length, 3);
  const again = open(dir, DECK, { asideFiles: 3 });
  assert.deepEqual(again.history.list().aside.map((a) => a.id), ids.slice(1).reverse());
  assert.equal(again.history.asideText(ids[1]), 'b'.repeat(100));
});

test('a restore of texts that differ in more than 2000 places is entered as one operation the authority takes', { timeout: 60_000 }, (t) => {
  const lines = Array.from({ length: 2100 }, (_, i) => `<p>line ${i} a</p>`);
  const before = `<body>\n${lines.join('\n')}\n</body>\n`;
  const { authority, history } = open(sessionDir(t), before);
  replace(authority, '<body>', '<body class="x">', ANN);
  const first = history.close();
  const target = authority.text;
  enterText(authority, target.replace(/ a</g, ' b<'), BO);
  history.close();
  const ops = [];
  authority.observe((op) => ops.push(op));
  history.restore(first.id, ANN);
  assert.equal(authority.text, target);
  assert.equal(ops.length, 1);
  assert.ok(ops[0].patches.length <= 2000, `${ops[0].patches.length} patches`);
});

// the history of a session through its requests
const ENV = (config, times = { quiet: 100 }) => ({ XDG_CONFIG_HOME: config, APPDATA: config, SLIDES_HISTORY: JSON.stringify(times) });

async function session(t, times) {
  const folder = talkFolder(t);
  t.after(() => rmSync(folder.root, { recursive: true, force: true }));
  const edit = await startEdit(folder.talk, { env: ENV(folder.config, times) });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const hello = async (name) => (await post(edit.port, api('hello'), { name })).json();
  const list = async (page) => (await raw(edit.port, 'GET', `${api('history')}?token=${page.token}`)).json();
  const current = async () => (await raw(edit.port, 'GET', `${edit.base}index.html`)).text;
  // an operation of page that replaces the first from in the current text by to
  const op = async (page, seq, from, to) => {
    const r = await raw(edit.port, 'GET', `${edit.base}index.html`);
    const at = r.text.indexOf(from);
    assert.ok(at >= 0, `${from} is in the deck`);
    const base = r.headers['x-session-version'];
    return (await post(edit.port, api('op'), { token: page.token, seq, base, patches: [{ start: at, end: at + from.length, text: to }] })).json();
  };
  const events = async (page, since) => (await raw(edit.port, 'GET', `${api('events')}?token=${page.token}&since=${since}`)).json();
  // the newest version once n versions are closed
  const closed = (page, n) => until(async () => { const { versions } = await list(page); return versions.length === n && versions[0]; }, `${n} versions`);
  return { ...folder, edit, api, hello, list, current, op, events, closed, file: join(folder.talk, 'index.html') };
}

test('a version is named, and a name is taken off', { timeout: 120_000 }, async (t) => {
  const s = await session(t, { quiet: 3_600_000, longest: 3_600_000 });
  const ann = await s.hello('Ann');
  const name = (id, value, token = ann.token) => post(s.edit.port, s.api(`history/${id}/name`), { token, name: value });
  // the current state of a deck without a version yet is named as a version of the base
  const base = (await name('current', '  First   draft ')).json();
  assert.equal(base.name, 'First draft');
  assert.deepEqual(base.authors, []);
  const first = await s.op(ann, 1, 'One', 'Uno');
  assert.equal(first.ok, true);
  const v = (await name('current', 'Second')).json();
  assert.deepEqual(v.authors, [ann.person]);
  assert.deepEqual(v.slides, [1]);
  // the answer that tells of the two names above, and then a poll that waits
  assert.equal(typeof (await s.events(ann, first.v)).history, 'number');
  const waiting = s.events(ann, first.v);
  assert.equal((await name(base.id, '')).status, 200);
  assert.equal(typeof (await waiting).history, 'number', 'a waiting poll is told that the list changed');
  const listed = await s.list(ann);
  assert.deepEqual(listed.versions.map((x) => [x.id, x.name]), [[v.id, 'Second'], [base.id, undefined]]);
  assert.equal((await name(v.id, 'x'.repeat(81))).status, 400);
  assert.equal((await name(v.id, 'é'.repeat(80))).status, 200);
  // the limit is in characters, of which an emoji is one and two UTF-16 code units
  assert.equal((await name(v.id, '😀'.repeat(80))).status, 200);
  assert.equal((await name(v.id, '😀'.repeat(81))).status, 400);
  assert.equal((await name(v.id, 42)).status, 400);
  assert.equal((await name('nope', 'x')).status, 404);
  assert.equal((await name('../x', 'x')).status, 404);
  assert.equal((await name(v.id, 'x', 'n'.repeat(22))).status, 404);
  assert.equal((await raw(s.edit.port, 'GET', `${s.api('history')}?token=${'n'.repeat(22)}`)).status, 404);
  assert.equal((await raw(s.edit.port, 'GET', `${s.api(`history/${v.id}`)}?token=${ann.token}`)).json().marks.length, 1);
  assert.equal((await raw(s.edit.port, 'GET', `${s.api('history/nope')}?token=${ann.token}`)).status, 404);
  assert.equal((await raw(s.edit.port, 'PUT', `${s.api('history')}?token=${ann.token}`)).status, 405);
  assert.equal((await raw(s.edit.port, 'POST', s.api(`history/${v.id}/name`), { body: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await raw(s.edit.port, 'POST', s.api(`history/${v.id}/name`), { body: '[1]', headers: { 'content-type': 'application/json' } })).status, 400);
});

test('a restore is a new version on top, which every page gets as an operation of someone else', { timeout: 120_000 }, async (t) => {
  const s = await session(t);
  const ann = await s.hello('Ann');
  const bo = await s.hello('Bo');
  assert.equal((await s.op(ann, 1, 'One', 'Uno')).ok, true);
  const v1 = await s.closed(ann, 2);
  const t1 = await s.current();
  const second = await s.op(ann, 2, 'Two', 'Deux');
  assert.equal(second.ok, true);
  const restored = (await post(s.edit.port, s.api(`history/${v1.id}/restore`), { token: ann.token })).json();
  assert.equal(await s.current(), t1);
  assert.equal(typeof restored.id, 'string');
  assert.notEqual(restored.v, second.v);
  const versions = (await s.list(bo)).versions;
  assert.equal(versions.length, 4);
  assert.equal(versions[2].id, v1.id);
  assert.equal(versions[0].id, restored.id);
  assert.equal(versions[0].restored, v1.id);
  assert.deepEqual(versions[0].authors, [ann.person]);
  assert.deepEqual(versions[0].slides, [2]);
  assert.deepEqual(versions[1].slides, [2]);
  assert.equal((await post(s.edit.port, s.api(`history/${restored.id}/restore`), { token: bo.token })).json().id, null, 'the deck already reads as the version');
  await until(() => readFileSync(s.file, 'utf8') === t1, 'index.html to hold the text of the version');
  for (const page of [bo, ann]) {
    const events = await s.events(page, second.v);
    assert.equal(events.ops.length, 1);
    assert.notEqual(events.ops[0].client, page.client, 'the restore is an operation of someone else for every page');
    assert.equal(events.ops[0].author, ann.person);
    assert.deepEqual(events.restored, { by: ann.person, id: v1.id, time: v1.time });
    assert.equal(typeof events.history, 'number');
  }
  // the restore is told once to each page
  await post(s.edit.port, s.api('presence'), { token: ann.token, state: { slide: 2 } });
  const later = await s.events(bo, restored.v);
  assert.equal(later.restored, undefined);
  assert.equal((await post(s.edit.port, s.api('history/nope/restore'), { token: ann.token })).status, 404);
  assert.equal((await post(s.edit.port, s.api(`history/${v1.id}/restore`), { token: 'n'.repeat(22) })).status, 404);
});

test('an operation in flight during a restore is applied on top, unless it conflicts with the restore', { timeout: 120_000 }, async (t) => {
  const s = await session(t);
  const ann = await s.hello('Ann');
  const bo = await s.hello('Bo');
  assert.equal((await s.op(ann, 1, 'One', 'Uno')).ok, true);
  const v1 = await s.closed(ann, 2);
  const t1 = await s.current();
  const changed = await s.op(ann, 2, 'Uno', 'Eins');
  // two operations of Bo of the version before the restore, sent after it
  const text = await s.current();
  const free = text.indexOf('Second slide'), held = text.indexOf('Eins');
  assert.equal((await post(s.edit.port, s.api(`history/${v1.id}/restore`), { token: ann.token })).status, 200);
  const onTop = (await post(s.edit.port, s.api('op'), { token: bo.token, seq: 1, base: changed.v, patches: [{ start: free, end: free + 6, text: 'Zweite' }] })).json();
  assert.equal(onTop.ok, true);
  const refused = (await post(s.edit.port, s.api('op'), { token: bo.token, seq: 2, base: changed.v, patches: [{ start: held, end: held + 4, text: 'Een' }] })).json();
  assert.deepEqual([refused.ok, refused.reason], [false, 'conflict']);
  assert.equal(await s.current(), t1.replace('Second slide', 'Zweite slide'));
  await s.closed(ann, 5);
  const [latest, restore] = (await s.list(ann)).versions;
  assert.equal(restore.restored, v1.id);
  assert.deepEqual(latest.authors, [bo.person]);
  assert.deepEqual(latest.slides, [2]);
});

test('a version and a text set aside are served for a preview, never cached', { timeout: 120_000 }, async (t) => {
  const s = await session(t, { quiet: 3_600_000, longest: 3_600_000 });
  const ann = await s.hello('Ann');
  assert.equal((await s.op(ann, 1, 'One', 'Uno')).ok, true);
  const v = (await post(s.edit.port, s.api('history/current/name'), { token: ann.token, name: 'Uno' })).json();
  const t1 = await s.current();
  assert.equal((await s.op(ann, 2, 'Uno', 'Eins')).ok, true);
  const preview = await raw(s.edit.port, 'GET', `${s.edit.base}index.html?version=${v.id}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.text, t1);
  assert.equal(preview.headers['cache-control'], 'no-store');
  assert.match(preview.headers['content-type'], /^text\/html/);
  assert.equal((await raw(s.edit.port, 'GET', `${s.edit.base}index.html?version=nope`)).status, 404);
  assert.equal((await raw(s.edit.port, 'GET', `${s.edit.base}index.html?version=${v.id}&edit`)).status, 400);
  const aside = (await post(s.edit.port, s.api('aside'), { token: ann.token, text: 'my text' })).json();
  assert.equal(aside.author, ann.person);
  assert.deepEqual((await s.list(ann)).aside, [aside]);
  assert.equal((await raw(s.edit.port, 'GET', `${s.edit.base}index.html?aside=${aside.id}`)).text, 'my text');
  assert.equal((await raw(s.edit.port, 'GET', `${s.edit.base}index.html?aside=nope`)).status, 404);
  assert.equal((await post(s.edit.port, s.api('aside'), { token: ann.token, text: 7 })).status, 400);
  assert.equal((await post(s.edit.port, s.api('aside'), { token: 'n'.repeat(22), text: 'x' })).status, 404);
  assert.equal((await post(s.edit.port, s.api('aside'), { token: ann.token, text: 'x'.repeat(8 * 1024 * 1024 + 1) })).status, 413);
});

test('a change of index.html while the edit command was not running becomes a version of the author file', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const folder = talkFolder(t);
  t.after(() => rmSync(folder.root, { recursive: true, force: true }));
  const env = ENV(folder.config, { quiet: 3_600_000, longest: 3_600_000 });
  const first = await startEdit(folder.talk, { env });
  const api = (edit, route) => `${edit.base}.session/${route}`;
  const ann = (await post(first.port, api(first, 'hello'), { name: 'Ann' })).json();
  const at = DECK.indexOf('One');
  assert.equal((await post(first.port, api(first, 'op'), { token: ann.token, seq: 1, base: ann.v, patches: [{ start: at, end: at + 3, text: 'Uno' }] })).json().ok, true);
  // the open version is closed at the stop
  await stopEdit(first);
  const file = join(folder.talk, 'index.html');
  const written = readFileSync(file, 'utf8');
  assert.ok(written.includes('Uno'));
  writeFileSync(file, written.replace('Second slide', 'Changed by an agent'));
  const second = await startEdit(folder.talk, { env });
  t.after(() => stopEdit(second));
  const bo = (await post(second.port, api(second, 'hello'), { name: 'Bo' })).json();
  const { versions } = (await raw(second.port, 'GET', `${api(second, 'history')}?token=${bo.token}`)).json();
  assert.deepEqual(versions.map((v) => v.authors), [['file'], [ann.person], []]);
  assert.deepEqual(versions.map((v) => v.slides), [[2], [1], []]);
  const detail = (await raw(second.port, 'GET', `${api(second, `history/${versions[0].id}`)}?token=${bo.token}`)).json();
  assert.ok(detail.marks.every((m) => m.author === 'file'));
  assert.equal((await raw(second.port, 'GET', `${second.base}index.html?version=${versions[1].id}`)).text, written);
  assert.ok(existsSync(join(folder.talk, '.session', 'history.jsonl')));
});

test('200 versions of a deck of 400 kB keep the changes of each version, not a copy of the deck each', { timeout: 120_000 }, (t) => {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc');
  const slides = Array.from({ length: 400 }, (_, i) => `<section>\n  <h2>Slide ${i}</h2>\n  <p>${'Words of the slide. '.repeat(48)}</p>\n</section>\n`);
  const authority = new Authority(`<!doctype html>\n<body>\n${slides.join('')}</body>\n`, { maxOps: 10 });
  const history = new History(sessionDir(t), authority, { quiet: 3_600_000, longest: 3_600_000 });
  gc();
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 200; i++) {
    const at = authority.text.indexOf('</p>', authority.text.indexOf(`<h2>Slide ${i}<`));
    authority.enter([{ start: at, end: at, text: ` <b>typed in version ${i}</b>` }], ANN);
    history.close();
  }
  gc();
  gc();
  const growth = (process.memoryUsage().heapUsed - before) / 2 ** 20;
  assert.equal(history.list().versions.length, 201);
  // a copy of the deck per version would be 80 MB
  assert.ok(growth < 16, `the heap grew by ${growth.toFixed(1)} MB`);
  history.stopSync();
});

test('an operation after a sleep of the computer, or after the wall clock went back, begins a new version', { timeout: 60_000 }, async (t) => {
  // the wall clock, and the clock of the timers, which stands while the computer sleeps
  const opened = () => {
    const c = { wall: 1_700_000_000_000, clock: 1000 };
    return { c, ...open(sessionDir(t), DECK, { quiet: 60_000, longest: 300_000, now: () => c.wall, clock: () => c.clock }) };
  };

  await t.test('a sleep of 8 hours, in which only the wall clock goes on', () => {
    const { c, authority, history } = opened();
    replace(authority, 'One', 'Uno', ANN);
    const afterAnn = authority.text;
    c.wall += 8 * 3600_000;
    c.clock += 10;
    replace(authority, 'Two', 'Deux', BO);
    history.close();
    const versions = history.list().versions.reverse().slice(1);
    assert.deepEqual(versions.map((v) => v.authors), [[ANN], [BO]]);
    assert.deepEqual(versions.map((v) => v.slides), [[1], [2]]);
    assert.equal(history.textOf(versions[0].id), afterAnn);
    history.stopSync();
  });

  await t.test('a wall clock set back an hour, after which the quiet time passes on the clock of the timers', () => {
    const { c, authority, history } = opened();
    replace(authority, 'One', 'Uno', ANN);
    c.wall -= 3600_000;
    c.clock += 60_000;
    replace(authority, 'Two', 'Deux', BO);
    history.close();
    assert.deepEqual(history.list().versions.reverse().map((v) => v.authors), [[], [ANN], [BO]]);
    history.stopSync();
  });

  await t.test('a wall clock set back, after which the clock of the timers passes the longest time in steps under the quiet time', () => {
    const { c, authority, history } = opened();
    replace(authority, '</body>', '<i>0</i></body>', ANN);
    c.wall -= 3600_000;
    for (let i = 1; i <= 10; i++) {
      c.clock += 30_000;
      replace(authority, '</body>', `<i>${i}</i></body>`, ANN);
    }
    history.close();
    const versions = history.list().versions.reverse();
    assert.equal(versions.length, 3);
    assert.ok(history.textOf(versions[1].id).includes('<i>9</i></body>'));
    history.stopSync();
  });

  await t.test('operations that go on for longer than the longest time', () => {
    const { c, authority, history } = opened();
    replace(authority, '</body>', '<i>0</i></body>', ANN);
    for (let i = 1; i <= 10; i++) {
      c.wall += 30_000;
      c.clock += 30_000;
      replace(authority, '</body>', `<i>${i}</i></body>`, ANN);
    }
    history.close();
    const versions = history.list().versions.reverse();
    assert.equal(versions.length, 3);
    assert.ok(history.textOf(versions[1].id).includes('<i>9</i></body>'));
    history.stopSync();
  });
});

test('a removal that the diff of a version places at another equal line is marked as a change of the person who made it', { timeout: 60_000 }, (t) => {
  const item = '    <li>Item</li>\n';
  const deck = DECK.replace('  <p style="left: 10px">First slide</p>\n', `  <ul>\n${item}${item}  </ul>\n`);
  const { authority, history } = open(sessionDir(t), deck);
  // Ann removes the first of the two equal items, and the diff of the version removes the second
  const at = deck.indexOf(item);
  authority.enter([{ start: at, end: at + item.length, text: '' }], ANN);
  replace(authority, 'Second slide', 'Second slide, typed', BO);
  const v = history.close();
  const marks = history.get(v.id).marks;
  assert.deepEqual(marks.filter((m) => m.start === m.end).map((m) => m.author), [ANN], JSON.stringify(marks));
  const two = authority.text.indexOf('<h2>Two');
  assert.ok(marks.filter((m) => m.author === BO).every((m) => m.start > two), JSON.stringify(marks));
  assert.deepEqual(v.slides, [1, 2]);
  history.stopSync();
});

test('large replaces in one version take time in proportion to their patches and marks', { timeout: 120_000 }, (t) => {
  // four replaces of every paragraph of n, by two people in turn, in one version. the close is not
  // timed, since its diff of n changed lines grows faster than n
  const run = (n) => {
    const head = '<body>\n';
    const authority = new Authority(`${head}${'<p>a</p>\n'.repeat(n)}</body>\n`);
    const history = new History(sessionDir(t), authority, { quiet: 3_600_000, longest: 3_600_000 });
    let ops = 0;
    for (let r = 0; r < 4; r++) {
      const patches = Array.from({ length: n }, (_, i) => ({ start: head.length + 9 * i + 3, end: head.length + 9 * i + 4, text: 'bcde'[r] }));
      const start = performance.now();
      authority.enter(patches, r % 2 ? BO : ANN);
      if (r > 0) ops += performance.now() - start;
    }
    const v = history.close();
    assert.equal(history.get(v.id).marks.length, n);
    history.stopSync();
    return ops;
  };
  const fastest = (n) => Math.min(run(n), run(n), run(n));
  for (let attempt = 1; ; attempt++) {
    const small = fastest(200);
    const large = fastest(2000);
    if (large < 30 * small) break;
    assert.ok(attempt < 3, `operations of 2000 patches ${large.toFixed(1)} ms against ${small.toFixed(1)} ms for 200`);
  }
});

test('the texts set aside are limited per person, and the text of another person is kept', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  let clock = 1_000_000;
  const { history } = open(dir, DECK, { asideFiles: 3, now: () => clock++ });
  const mine = history.setAside(`${DECK}MY LOST WORK`, ANN);
  const theirs = Array.from({ length: 5 }, () => history.setAside('x', BO).id);
  assert.equal(history.asideText(mine.id), `${DECK}MY LOST WORK`);
  assert.deepEqual(history.list().aside.map((a) => a.id), [...theirs.slice(2).reverse(), mine.id]);
  assert.equal(readdirSync(join(dir, 'aside')).length, 4);
});

test('names given again and again to one version do not grow history.jsonl without a bound', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'history.jsonl');
  const { authority, history } = open(dir, DECK);
  replace(authority, 'One', 'Uno', ANN);
  const v = history.close();
  for (let i = 0; i < 2500; i++) history.name(v.id, i % 2 ? 'a'.repeat(79) : 'b'.repeat(80));
  history.stopSync();
  const names = readFileSync(file, 'utf8').split('\n').filter((line) => line.includes('"kind":"name"'));
  assert.ok(names.length <= 1002, `${names.length} lines of a name`);
  const again = open(dir, authority.text);
  assert.deepEqual(again.history.list().versions.map((x) => [x.id, x.name]), [[v.id, 'a'.repeat(79)], [history.list().versions[1].id, undefined]]);
});

test('the text of every version is right after the file is written anew with texts kept in memory', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  const day = 24 * 3600 * 1000;
  let clock = Date.now() - 100 * day;
  const { authority, history } = open(dir, DECK, { now: () => clock });
  const texts = [];
  // more versions than are kept between two texts held in memory, the first 10 of them old
  for (let i = 0; i < 120; i++) {
    if (i === 10) clock = Date.now() - day;
    replace(authority, /First slide[^<]*/, `First slide ${i}`, i % 2 ? ANN : BO);
    texts.push([history.close().id, authority.text]);
    clock += 1000;
  }
  history.stopSync();
  const file = join(dir, 'history.jsonl');
  const again = open(dir, authority.text, { maxBytes: statSync(file).size + 100, now: () => clock });
  replace(again.authority, 'Second slide', 'Second slide, later', ANN);
  texts.push([again.history.close().id, again.authority.text]);
  const kept = texts.slice(10);
  assert.deepEqual(again.history.list().versions.map((v) => v.id), kept.map(([id]) => id).reverse());
  for (const [id, text] of kept) assert.equal(again.history.textOf(id), text, `the text of version ${id}`);
  again.history.stopSync();
});

test('an unreadable history.jsonl that another program holds open is copied aside, or else not written over', { timeout: 60_000 }, async (t) => {
  const content = 'not a history\n';
  // a rename to the aside file fails as on Windows while an antivirus holds the file open
  const real = { renameSync: fs.renameSync, copyFileSync: fs.copyFileSync };
  const busy = () => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
  const held = (copy) => {
    fs.renameSync = (from, to) => {
      if (String(to).includes('unreadable')) throw busy();
      return real.renameSync(from, to);
    };
    if (!copy) {
      fs.copyFileSync = () => {
        throw busy();
      };
    }
    syncBuiltinESMExports();
  };
  const free = () => {
    Object.assign(fs, real);
    syncBuiltinESMExports();
  };
  t.after(free);

  await t.test('a copy aside when the rename fails', () => {
    const dir = sessionDir(t);
    writeFileSync(join(dir, 'history.jsonl'), content);
    held(true);
    const { authority, history } = open(dir, DECK);
    free();
    const aside = readdirSync(dir).filter((n) => n.startsWith('history-unreadable-'));
    assert.deepEqual(aside.map((n) => readFileSync(join(dir, n), 'utf8')), [content]);
    replace(authority, 'One', 'Uno', ANN);
    history.close();
    history.stopSync();
    assert.equal(open(dir, authority.text).history.list().versions.length, 2);
  });

  await t.test('the file kept as it is when the copy fails too', () => {
    const dir = sessionDir(t);
    writeFileSync(join(dir, 'history.jsonl'), content);
    held(false);
    const { authority, history, logged } = open(dir, DECK);
    free();
    replace(authority, 'One', 'Uno', ANN);
    history.close();
    history.name('current', 'Named');
    history.stopSync();
    assert.equal(readFileSync(join(dir, 'history.jsonl'), 'utf8'), content);
    assert.ok(logged.some((m) => /not written/.test(m)), logged.join('\n'));
    assert.equal(history.list().versions.length, 2, 'the history of this run is kept in memory');
  });
});

test('a page that was dropped while two restores were made is told the later one, and a page that came after them is not told', { timeout: 180_000 }, async (t) => {
  const s = await session(t);
  const ann = await s.hello('Ann');
  const bo = await s.hello('Bo');
  assert.equal((await s.op(ann, 1, 'One', 'Uno')).ok, true);
  const v1 = await s.closed(ann, 2);
  const second = await s.op(ann, 2, 'Two', 'Deux');
  const v2 = await s.closed(ann, 3);
  // a page that does not poll after its hello is dropped, as one that was away for too long
  const dropped = (page) => until(async () => !(await s.events(ann, second.v)).presence.some((p) => p.client === page.client), `${page.client} to be dropped`, 60_000);
  await dropped(bo);
  const restore = async (v) => (await post(s.edit.port, s.api(`history/${v.id}/restore`), { token: ann.token })).json();
  await restore(v1);
  const last = await restore(v2);
  const back = await s.events(bo, bo.v);
  assert.equal(back.ops.length, 4);
  assert.deepEqual(back.restored, { by: ann.person, id: v2.id, time: v2.time });
  const cy = await s.hello('Cy');
  assert.equal(cy.v, last.v);
  await dropped(cy);
  assert.equal((await s.events(cy, cy.v)).restored, undefined);
});

test('the deck as it read when a new history began is its first version, kept through a restart', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  const { authority, history } = open(dir, DECK);
  replace(authority, 'One', 'Uno', ANN);
  history.close();
  const start = history.list().versions.at(-1);
  assert.equal(start.start, true);
  assert.deepEqual(start.authors, []);
  assert.equal(history.textOf(start.id), DECK);
  history.stopSync();
  const again = open(dir, authority.text);
  const versions = again.history.list().versions;
  assert.deepEqual(versions.filter((v) => v.start).map((v) => v.id), [start.id]);
  assert.equal(versions.length, 2);
  assert.equal(again.history.textOf(start.id), DECK);
});

test('the edits of a version that was open at a crash are listed as those of the people who made them', { timeout: 60_000 }, async (t) => {
  // a new history on the same folder without stopSync, as after a kill or a power loss, since
  // index.html is written by then
  const crashed = (dir, text) => {
    const again = open(dir, text);
    const versions = again.history.list().versions;
    const marks = again.history.get(versions[0].id).marks;
    return { versions: versions.map((v) => [v.name ?? '', v.authors]), authors: [...new Set(marks.map((m) => m.author))] };
  };

  await t.test('one person, who is the author of each changed range', () => {
    const dir = sessionDir(t);
    const { authority, history } = open(dir, DECK);
    history.name('current', 'Start');
    replace(authority, 'First slide', 'First slide, edited by Ann', ANN);
    assert.deepEqual(crashed(dir, authority.text), { versions: [['', [ANN]], ['Start', []]], authors: [ANN] });
  });

  await t.test('two people, whose ranges cannot be told apart', () => {
    const dir = sessionDir(t);
    const { authority, history } = open(dir, DECK);
    history.name('current', 'Start');
    replace(authority, 'One', 'Uno', ANN);
    replace(authority, 'Two', 'Deux', BO);
    replace(authority, 'Uno', 'Eins', ANN);
    assert.deepEqual(crashed(dir, authority.text), { versions: [['', [ANN, BO]], ['Start', []]], authors: [''] });
  });

  await t.test('after the file was written anew in the open version', () => {
    const dir = sessionDir(t);
    const { authority, history } = open(dir, DECK);
    const named = history.name('current', 'Start');
    replace(authority, 'One', 'Uno', ANN);
    // names given again and again write the file anew
    for (let i = 0; i < 1100; i++) history.name(named.id, i % 2 ? 'Start' : 'Begin');
    assert.deepEqual(crashed(dir, authority.text).versions, [['', [ANN]], ['Start', []]]);
  });

  await t.test('not of a later change from outside, once the open version ended without a change', () => {
    const dir = sessionDir(t);
    const { authority, history } = open(dir, DECK);
    replace(authority, 'One', 'Uno', ANN);
    replace(authority, 'Uno', 'One', ANN);
    history.stopSync();
    assert.deepEqual(crashed(dir, DECK.replace('Two', 'Deux')).versions[0], ['', ['file']]);
  });

  await t.test('not of a later change from outside, once a start after the crash found no change', () => {
    const dir = sessionDir(t);
    const { authority } = open(dir, DECK);
    replace(authority, 'One', 'Uno', ANN);
    // index.html was not written before the crash
    assert.deepEqual(crashed(dir, DECK).versions, [['', []]]);
    assert.deepEqual(crashed(dir, DECK.replace('Two', 'Deux')).versions[0], ['', ['file']]);
  });
});

test('a cut last line in a read-only history.jsonl is left out, and the history read is kept', { timeout: 60_000 }, async (t) => {
  const dir = sessionDir(t);
  const file = join(dir, 'history.jsonl');
  const { authority, history } = open(dir, DECK);
  replace(authority, 'One', 'Uno', ANN);
  const v1 = history.close();
  history.name(v1.id, 'Important');
  history.stopSync();
  appendFileSync(file, '{"kind":"version","id":"cut","ti');
  chmodSync(file, 0o444);
  let writable = true;
  try {
    closeSync(openSync(file, 'r+'));
  } catch {
    writable = false;
  }
  const again = open(dir, authority.text);

  await t.test('the versions are kept', { skip: writable && 'a mode of 0444 does not make a file read-only here' }, () => {
    assert.deepEqual(again.logged, []);
    assert.deepEqual(again.history.list().versions.map((v) => [v.id, v.name]).slice(0, 1), [[v1.id, 'Important']]);
    assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith('history-unreadable-')), []);
  });

  await t.test('the next version writes the file anew', { skip: (writable && 'a mode of 0444 does not make a file read-only here') || (process.platform === 'win32' && 'windows does not rename over a read-only file') }, () => {
    replace(again.authority, 'Two', 'Deux', BO);
    const v2 = again.history.close();
    again.history.stopSync();
    assert.deepEqual(again.logged, []);
    assert.deepEqual(open(dir, again.authority.text).history.list().versions.map((v) => [v.id, v.name]).slice(0, 2), [[v2.id, undefined], [v1.id, 'Important']]);
  });
});

test('a version name is kept without the characters that do not show', { timeout: 60_000 }, (t) => {
  const { authority, history } = open(sessionDir(t), DECK);
  replace(authority, 'One', 'Uno', ANN);
  const v = history.close();
  assert.equal(history.name(v.id, 'a\u0000b\u0007c\u001b[31mred').name, 'abc[31mred');
  assert.equal(history.name(v.id, '‮evil').name, 'evil');
  assert.equal(history.name(v.id, ' tab\tand\nline ').name, 'tab and line');
  assert.equal(history.name(v.id, '​'.repeat(80)).name, undefined, 'a name of hidden characters takes the name off');
  history.stopSync();
});

test('the texts kept in memory as starting points of a rebuild stay within their budget in bytes', { timeout: 60_000 }, (t) => {
  const deck = DECK.replace('</body>', `<p>${'x'.repeat(10_000)}</p>\n</body>`);
  const { authority, history } = open(sessionDir(t), deck, { checkpointBytes: 1 });
  const texts = [];
  for (let i = 0; i < 400; i++) {
    replace(authority, /First slide[^<]*/, `First slide ${i}`, ANN);
    texts.push([history.close().id, authority.text]);
  }
  // read from the private map. a budget below the deck is raised to four texts of the deck, at two
  // bytes a character
  const kept = [...history.checkpoints.values()];
  const bytes = kept.reduce((sum, text) => sum + 2 * text.length, 0);
  assert.ok(kept.length > 0 && bytes <= 4 * 2 * authority.text.length, `${kept.length} texts of ${bytes} bytes`);
  for (const [id, text] of texts) assert.equal(history.textOf(id), text, `the text of version ${id}`);
  history.stopSync();
});

test('a version that restored another is told as such after a restart', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  const { authority, history } = open(dir, DECK);
  replace(authority, 'One', 'Uno', ANN);
  const v1 = history.close();
  replace(authority, 'Two', 'Deux', BO);
  history.close();
  history.restore(v1.id, ANN);
  history.stopSync();
  const again = open(dir, authority.text);
  assert.equal(again.history.list().versions[0].restored, v1.id);
});

test('a restore that changes two slides takes in an operation in flight on a slide between them', { timeout: 60_000 }, (t) => {
  const deck = DECK.replace('</body>', '<section>\n  <h2>Three</h2>\n</section>\n</body>');
  const { authority, history } = open(sessionDir(t), deck);
  const v1 = history.name('current', 'Before');
  replace(authority, 'One', 'Uno', ANN);
  replace(authority, 'Three', 'Drei', ANN);
  history.close();
  // an operation of Bo on the second slide, sent before the restore and applied after it
  const base = authority.version;
  const at = authority.text.indexOf('Second slide');
  history.restore(v1.id, ANN);
  const { answer } = authority.submit({ client: 'bo', seq: 1, base, patches: [{ start: at, end: at + 6, text: 'Zweite' }] }, BO);
  assert.equal(answer.ok, true, JSON.stringify(answer));
  assert.equal(authority.text, deck.replace('Second slide', 'Zweite slide'));
  history.stopSync();
});

test('a change of the history while the edit command stops is refused', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const s = await session(t);
  const ann = await s.hello('Ann');
  const stopped = stopEdit(s.edit);
  // answered until the stop refuses it, and then not at all once the server is closed
  let status = null;
  for (;;) {
    const answer = await post(s.edit.port, s.api('history/current/name'), { token: ann.token, name: 'Late' }).catch(() => null);
    if (!answer) break;
    status = answer.status;
    if (status === 503) break;
  }
  assert.equal(status, 503);
  await stopped;
});

test('a change of index.html from outside is a version of its own, and the version before it holds the text of the people', { timeout: 60_000 }, (t) => {
  const { authority, history } = open(sessionDir(t), DECK);
  replace(authority, 'Two', 'Zwei', 'file');
  replace(authority, 'One', 'Uno', ANN);
  const typed = authority.text;
  replace(authority, 'Uno', 'Eins', 'file');
  replace(authority, 'Zwei', 'Zwo', 'file');
  replace(authority, 'Zwo', 'Deux', BO);
  history.stopSync();
  const { versions } = history.list();
  assert.deepEqual(versions.map((v) => v.authors), [[BO], ['file'], [ANN], ['file'], []]);
  assert.equal(history.textOf(versions[2].id), typed);
});

test('a change of index.html from outside is told as an overwrite only where it replaces text that a person wrote in the session, or writes where a person removed text', { timeout: 60_000 }, (t) => {
  const { authority, history } = open(sessionDir(t), DECK);
  // whether a page at the version before the operation is told of an overwrite
  const told = (from, to, author = 'file') => {
    const before = authority.version;
    replace(authority, from, to, author);
    return history.overwrittenAfter(before);
  };
  assert.equal(told('Two', 'Zwei'), false, 'nobody typed');
  replace(authority, 'One', 'Uno', ANN);
  assert.equal(told('Zwei', 'Zwo'), false, 'a change of another slide');
  history.name('current', 'Typed');
  assert.equal(told('Uno', 'Eins'), true, 'a word of Ann in a closed version');
  assert.equal(told('Eins', 'Ein'), false, 'a word of the file');
  replace(authority, 'First slide', 'First great slide', ANN);
  assert.equal(told('great', 'grXeat'), false, 'an insertion inside a word of Ann');
  assert.equal(told('eat slide', 'eat page'), false, 'a change that ends where a word of Ann begins');
  assert.equal(told('First gr', 'First-gr'), false, 'a change that begins where a word of Ann ends');
  replace(authority, 'Second slide', 'Second', ANN);
  assert.equal(told('Second<', 'Second slide<'), true, 'a removal of Ann taken back');
  // a page of an earlier start says hello again, and is not told
  assert.deepEqual([history.overwrittenAfter('earlier.0'), history.overwrittenAfter('not a version')], [false, false]);
  assert.equal(told('First-gr', 'First-Gr', BO), false, 'an operation of a person over a word of Ann');
});

test('every page is told when a change of index.html from outside replaces text that a person wrote in the session, also when it reverts the text, and not when it changes other text', { timeout: 120_000 }, async (t) => {
  const s = await session(t, { quiet: 3_600_000, longest: 3_600_000 });
  const ann = await s.hello('Ann');
  const bo = await s.hello('Bo');
  const written = (text) => until(async () => (await s.current()).includes(text), `the session to hold ${text}`);
  const onDisk = (text) => until(() => readFileSync(s.file, 'utf8').includes(text), `index.html to hold ${text}`);
  const read = await s.current();
  const uno = await s.op(ann, 1, 'One', 'Uno');
  await onDisk('Uno');
  // a program that read index.html before the edit of Ann writes over the same word
  writeFileSync(s.file, read.replace('One', 'Eins'));
  await written('Eins');
  for (const page of [ann, bo]) assert.equal((await s.events(page, uno.v)).overwritten, true);
  const { versions } = await s.list(bo);
  assert.deepEqual(versions.map((v) => v.authors), [[ann.person], []]);
  assert.ok((await raw(s.edit.port, 'GET', `${s.edit.base}index.html?version=${versions[0].id}`)).text.includes('<h2>Uno</h2>'));

  // a program that read index.html before the edit of Ann writes after another program, hence its
  // change is merged on the text of the other program, and the edit of Ann is reverted
  const stale = await s.current();
  const deux = await s.op(ann, 2, 'Two', 'Deux');
  await onDisk('Deux');
  writeFileSync(s.file, (await s.current()).replace('First slide', 'First slide by B'));
  await written('by B');
  const before = (await s.events(bo, deux.v)).v;
  writeFileSync(s.file, stale.replace('</body>', '<p>by A</p>\n</body>'));
  await written('by A');
  assert.ok(!(await s.current()).includes('Deux'));
  assert.equal((await s.events(bo, before)).overwritten, true);

  const last = (await s.events(bo, before)).v;
  writeFileSync(s.file, (await s.current()).replace('Second slide', 'Changed by an agent'));
  await written('Changed by an agent');
  const events = await s.events(bo, last);
  assert.equal(events.ops.length, 1);
  assert.equal(events.overwritten, undefined);
});

test('an operation of a person late in a long run takes about as long as one early in it', { timeout: 300_000 }, (t) => {
  let seed = 12345;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  const words = 'alpha beta gamma delta orbit halo moon earth transfer manifold'.split(' ');
  let deck = '<!doctype html><html><body><div class="reveal"><div class="slides">\n';
  for (let i = 0; deck.length < 200_000; i++) deck += `<section>\n  <h2>Slide ${i}</h2>\n  <p>${Array.from({ length: 30 }, () => words[Math.floor(rnd() * words.length)]).join(' ')}</p>\n</section>\n`;
  deck += '</div></div></body></html>\n';
  let now = 0;
  const { authority, history } = open(sessionDir(t), deck, { quiet: 60_000, longest: 300_000, clock: () => now, now: () => 1e12 + now });
  t.after(() => history.stopSync());
  const people = [ANN, BO, 'CyCyCyCyCyCyCyCyCyCyCy'];
  // the mean time in ms of n operations of one character at random places, one second apart
  const run = (n) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      now += 1000;
      const at = Math.floor(rnd() * (authority.text.length - 10)) + 1;
      const patch = rnd() < 0.6 ? { start: at, end: at, text: 'e' } : { start: at, end: at + 1, text: '' };
      const author = people[Math.floor(rnd() * people.length)];
      const start = performance.now();
      authority.enter([patch], author);
      sum += performance.now() - start;
    }
    return sum / n;
  };
  run(1000);
  const early = Math.min(run(1000), run(1000));
  run(30_000);
  let late = run(1000);
  if (late > 2 * early) late = Math.min(late, run(1000));
  assert.ok(late <= 2 * early, `an operation takes ${late.toFixed(3)} ms after 33,000 operations, and ${early.toFixed(3)} ms early in the run`);
});

test('a change of index.html from outside is told by the characters that people wrote, and not by a word that a person typed and removed', { timeout: 60_000 }, (t) => {
  const { authority, history } = open(sessionDir(t), DECK);
  const told = (from, to, author = 'file') => {
    const before = authority.version;
    replace(authority, from, to, author);
    return history.overwrittenAfter(before);
  };
  replace(authority, 'First slide', 'First great slide', ANN);
  replace(authority, 'First great slide', 'First slide', ANN);
  assert.equal(told('First slide', 'First Slide'), false, 'a word typed and removed in one version');
  // a removal that the diff of a later version places at the word of Ann, which stays
  replace(authority, '<h2>One</h2>', '<h2>One One</h2>', ANN);
  history.close();
  const at = authority.text.indexOf('One One');
  authority.enter([{ start: at, end: at + 4, text: '' }], BO);
  history.close();
  assert.equal(told('<h2>One', '<h2>Une'), true, 'the first letter of the word of Ann, after Bo removed the word before it');
  // a word that Ann removed and typed again in one version, which reads as before
  replace(authority, 'Second slide', 'Second', ANN);
  replace(authority, 'Second<', 'Second slide<', ANN);
  assert.equal(told('slide<', 'page<'), true, 'a word that Ann typed again');
  // a word of Ann before two changes from outside in one version, and an operation of Bo after them
  replace(authority, '</body>', '<p>Ann wrote this</p>\n</body>', ANN);
  replace(authority, 'Une', 'Une and a long title of a program', 'file');
  replace(authority, '<h2>Two', '<h2>Two and a long title of a program', 'file');
  replace(authority, 'Second page', 'Second page by Bo', BO);
  assert.equal(told('Ann wrote', 'A program wrote'), true, 'a word of Ann after two changes from outside in one version');
  // two words of Ann in one version, the second one before the first one in the deck
  replace(authority, '</body>', '<p>late</p>\n</body>', ANN);
  replace(authority, '<h2>Une', '<h2>Early Une', ANN);
  assert.equal(told('<p>late', '<p>Late'), true, 'the first of two words of Ann in one version');
});

test('a change of index.html from outside is told whenever it replaces or removes a character that a person wrote, over random edits of people', { timeout: 120_000 }, (t) => {
  // mulberry32
  let seed = 38;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(rnd() * n);
  const word = (letters, n) => Array.from({ length: n }, () => letters[int(letters.length)]).join('');
  // the text as cells of a character and whether a person wrote it, with patches applied
  const applied = (cells, patches, person) => {
    const out = [];
    let at = 0;
    for (const p of patches) {
      out.push(...cells.slice(at, p.start), ...[...p.text].map((ch) => ({ ch, person })));
      at = p.end;
    }
    return [...out, ...cells.slice(at)];
  };
  let missed = 0;
  for (let round = 0; round < 3000; round++) {
    let text = '<body>\n';
    for (let i = 0, n = 3 + int(5); i < n; i++) text += `<p>${word('ab ', 3 + int(14))}</p>\n`;
    text += '</body>\n';
    const { authority, history } = open(sessionDir(t), text);
    let cells = [...text].map((ch) => ({ ch, person: false }));
    let undo = null;
    for (let k = 0, n = 1 + int(8); k < n; k++) {
      const author = rnd() < 0.5 ? ANN : BO;
      let patches = [];
      if (undo && undo.author === author && undo.n === authority.n && rnd() < 0.3) patches = undo.patches;
      else {
        for (let at = 0, places = rnd() < 0.2 ? 2 : 1; places > 0 && at <= authority.text.length; places--) {
          const start = at + int(authority.text.length + 1 - at);
          const end = Math.min(authority.text.length, start + (rnd() < 0.5 ? 0 : 1 + int(4)));
          const ins = rnd() < 0.3 && end > start ? '' : word('ab \n', 1 + int(4));
          if (start === end && !ins) continue;
          patches.push({ start, end, text: ins });
          at = end + 1;
        }
        if (!patches.length) continue;
      }
      let delta = 0;
      const inverse = patches.map((p) => {
        const start = p.start + delta;
        delta += p.text.length - (p.end - p.start);
        return { start, end: start + p.text.length, text: authority.text.slice(p.start, p.end) };
      });
      assert.equal(authority.enter(patches, author).answer.ok, true);
      cells = applied(cells, patches, true);
      undo = { author, n: authority.n, patches: inverse };
      if (rnd() < 0.25) history.close();
    }
    // a program replaces one or two ranges with letters that the text does not hold, or removes
    // them where the removal cannot be placed at another equal text
    const now = authority.text;
    const ranges = [];
    for (let at = 0, places = rnd() < 0.4 ? 2 : 1; places > 0 && at < now.length; places--) {
      const start = at + int(now.length - at);
      const end = Math.min(now.length, start + int(6));
      const ins = rnd() < 0.3 ? '' : word('XYZ', 1 + int(3));
      const slides = !ins && ((start > 0 && now[start - 1] === now[end - 1]) || (end < now.length && now[start] === now[end]));
      if (start === end ? !ins : slides) continue;
      ranges.push({ start, end, text: ins });
      at = end + 2;
    }
    if (!ranges.length) continue;
    const wrote = ranges.some((r) => cells.slice(r.start, r.end).some((c) => c.person));
    const before = authority.version;
    enterText(authority, applied(cells, ranges, false).map((c) => c.ch).join(''), 'file');
    assert.equal(authority.text, applied(cells, ranges, false).map((c) => c.ch).join(''));
    if (wrote && !history.overwrittenAfter(before)) missed++;
    history.stopSync();
  }
  assert.equal(missed, 0, `${missed} changes from outside over the text of a person were not told`);
});
