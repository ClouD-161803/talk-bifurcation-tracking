import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs, { appendFileSync, chmodSync, closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { Worker } from 'node:worker_threads';
import { Authority, History, diff, slideChanges, slidesOf } from '../theme/edit.mjs';
import { longRun } from './helpers/long-run.mjs';
import { DECK, post, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const ANN = 'AnnAnnAnnAnnAnnAnnAnn1';
const BO = 'BoBoBoBoBoBoBoBoBoBoBo';

function sessionDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'slides history-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const enterText = (authority, text, author) => authority.enter(diff(authority.text, text), author);
const replace = (authority, from, to, author) => enterText(authority, authority.text.replace(from, to), author);

function open(dir, text, options = {}) {
  const authority = new Authority(text);
  const logged = [];
  const history = new History(dir, authority, { quiet: 3_600_000, longest: 3_600_000, log: (m) => logged.push(m), ...options });
  return { authority, history, logged };
}

test('a version is closed after a quiet time, and at the latest after the longest time', { timeout: 60_000 }, async (t) => {
  await t.test('after the quiet time since the last operation', async () => {
    const { authority, history } = open(sessionDir(t), DECK, { quiet: 2_000, longest: 60_000 });
    let closedAt = null;
    history.onChange(() => (closedAt ??= performance.now()));
    replace(authority, 'One', 'Uno', ANN);
    const first = performance.now();
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
    assert.deepEqual(['Title', 'Alpha', 'Hidden', 'Beta', 'Thanks', 'Appendix<'].map(numberOf), [1, 2, 3, 4, 5, 6]);
    assert.equal(numberOf('Down one'), 3, 'reveal.js counts the hidden slide and each vertical slide, and leaves out the title slide');
    assert.equal(numberOf('Down two'), 4, 'reveal.js counts each vertical slide');
    assert.equal(numberOf('Appendix down'), 6, 'reveal.js leaves the closing slide and the appendix uncounted');
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
    replace(authority, '<h2>One</h2>', '<h2>One</h2>\n  <p>Inserted by Bo</p>', BO);
    replace(authority, 'Second slide', 'Second slide, typed by Ann', ANN);
    replace(authority, 'typed by Ann', 'typed by Bo', BO);
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
  const step = (i) => {
    replace(authority, /<p>[^<]*<\/p>\n<\/section>\n<\/body>/, `<p>${String.fromCharCode(97 + i).repeat(1000)}</p>\n</section>\n</body>`, ANN);
    const v = history.close();
    texts.push([v.id, authority.text]);
    clock += 1000;
  };
  for (let i = 0; i < 6; i++) step(i);
  history.name(texts[3][0], 'Kept');
  clock = Date.now() - 2 * day;
  for (let i = 6; i < 9; i++) step(i);
  history.stopSync();
  const file = join(dir, 'history.jsonl');
  const size = statSync(file).size;
  const again = open(dir, authority.text, { maxBytes: size + 100, now: () => clock });
  assert.equal(again.history.list().versions.length, 10);
  replace(again.authority, 'First slide', 'First slide, later', BO);
  const last = again.history.close();
  texts.push([last.id, again.authority.text]);
  assert.ok(statSync(file).size < size, 'the file is smaller after the rewrite');
  const kept = [texts[3], ...texts.slice(6)];
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
  const op = async (page, seq, from, to) => {
    const r = await raw(edit.port, 'GET', `${edit.base}index.html`);
    const at = r.text.indexOf(from);
    assert.ok(at >= 0, `${from} is in the deck`);
    const base = r.headers['x-session-version'];
    return (await post(edit.port, api('op'), { token: page.token, seq, base, patches: [{ start: at, end: at + from.length, text: to }] })).json();
  };
  const events = async (page, since) => (await raw(edit.port, 'GET', `${api('events')}?token=${page.token}&since=${since}`)).json();
  const closed = (page, n) => until(async () => { const { versions } = await list(page); return versions.length === n && versions[0]; }, `${n} versions`);
  return { ...folder, edit, api, hello, list, current, op, events, closed, file: join(folder.talk, 'index.html') };
}

test('a version is named, and a name is taken off', { timeout: 120_000 }, async (t) => {
  const s = await session(t, { quiet: 3_600_000, longest: 3_600_000 });
  const ann = await s.hello('Ann');
  const name = (id, value, token = ann.token) => post(s.edit.port, s.api(`history/${id}/name`), { token, name: value });
  const base = (await name('current', '  First   draft ')).json();
  assert.equal(base.name, 'First draft');
  assert.deepEqual(base.authors, []);
  const first = await s.op(ann, 1, 'One', 'Uno');
  assert.equal(first.ok, true);
  const v = (await name('current', 'Second')).json();
  assert.deepEqual(v.authors, [ann.person]);
  assert.deepEqual(v.slides, [1]);
  assert.equal(typeof (await s.events(ann, first.v)).history, 'number');
  const waiting = s.events(ann, first.v);
  assert.equal((await name(base.id, '')).status, 200);
  assert.equal(typeof (await waiting).history, 'number', 'a waiting poll is told that the list changed');
  const listed = await s.list(ann);
  assert.deepEqual(listed.versions.map((x) => [x.id, x.name]), [[v.id, 'Second'], [base.id, undefined]]);
  assert.equal((await name(v.id, 'x'.repeat(81))).status, 400);
  assert.equal((await name(v.id, 'é'.repeat(80))).status, 200);
  assert.equal((await name(v.id, '😀'.repeat(80))).status, 200, 'an emoji counts as one character, not as its two UTF-16 code units');
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
  assert.ok(growth < 16, `the heap grew by ${growth.toFixed(1)} MB`);
  history.stopSync();
});

test('an operation after a sleep of the computer, or after the wall clock went back, begins a new version', { timeout: 60_000 }, async (t) => {
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

test('a version tagged long ago is kept when the file is written anew, and the old versions around it are not', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  const day = 24 * 3600 * 1000;
  let clock = Date.now() - 100 * day;
  const { authority, history } = open(dir, DECK.replace('</body>', '<section>\n  <p>start</p>\n</section>\n</body>'), { now: () => clock });
  const texts = [];
  const step = (i) => {
    replace(authority, /<p>[^<]*<\/p>\n<\/section>\n<\/body>/, `<p>${String.fromCharCode(97 + (i % 26)).repeat(1000)}</p>\n</section>\n</body>`, ANN);
    texts.push([history.close().id, authority.text]);
    clock += 1000;
  };
  for (let i = 0; i < 6; i++) step(i);
  history.name(texts[1][0], 'Early');
  for (let i = 6; i < 40; i++) step(i);
  clock = Date.now() - 2 * day;
  for (let i = 40; i < 43; i++) step(i);
  history.stopSync();
  const file = join(dir, 'history.jsonl');
  const size = statSync(file).size;
  const again = open(dir, authority.text, { maxBytes: size + 100, now: () => clock });
  replace(again.authority, 'First slide', 'First slide, later', BO);
  const last = again.history.close();
  texts.push([last.id, again.authority.text]);
  assert.ok(statSync(file).size < size / 4, `the file of ${size} bytes is ${statSync(file).size} bytes after the rewrite`);
  const kept = [texts[1], ...texts.slice(40)];
  assert.deepEqual(again.history.list().versions.map((v) => v.id), kept.map(([id]) => id).reverse());
  again.history.stopSync();
  const third = open(dir, again.authority.text);
  assert.equal(third.history.list().versions.at(-1).name, 'Early');
  for (const [id, text] of kept) assert.equal(third.history.textOf(id), text);
});

test('the texts set aside take a bounded space in all, also from many people, the oldest removed first', { timeout: 60_000 }, (t) => {
  const dir = sessionDir(t);
  let clock = 1_000_000;
  const { history } = open(dir, DECK, { asideTotal: 1000, now: () => clock++ });
  const people = Array.from({ length: 30 }, (_, i) => `person${String(i).padStart(16, '0')}xxxxxx`);
  const ids = people.map((p) => history.setAside('x'.repeat(100), p).id);
  assert.deepEqual(history.list().aside.map((a) => a.id), ids.slice(-10).reverse());
  assert.equal(readdirSync(join(dir, 'aside')).length, 10);
  const again = open(dir, DECK, { asideTotal: 500 });
  assert.deepEqual(again.history.list().aside.map((a) => a.id), ids.slice(-5).reverse());
  assert.equal(readdirSync(join(dir, 'aside')).length, 5);
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
  const kept = [...history.checkpoints.values()];
  const bytes = kept.reduce((sum, text) => sum + 2 * text.length, 0);
  assert.ok(kept.length > 0 && bytes <= 4 * 2 * authority.text.length, `${kept.length} texts of ${bytes} bytes`);
  for (const [id, text] of texts) assert.equal(history.textOf(id), text, `the text of version ${id}`);
  history.stopSync();
});

test('the text of a version of a deck of 5 MB hundreds of versions after a kept text is rebuilt in about the time of one 10 versions after it', { timeout: 300_000 }, (t) => {
  const deck = DECK.replace('</body>', `<!-- ${'x'.repeat(5 * 1024 * 1024)} -->\n</body>`);
  const { authority, history } = open(sessionDir(t), deck, { maxBytes: 1024 * 1024 * 1024 });
  const ids = [];
  for (let i = 0; i < 800; i++) {
    const at = authority.text.indexOf('<!-- x') + 5 + ((i * 7919) % (5 * 1024 * 1024 - 8));
    authority.enter([{ start: at, end: at, text: `w${i} ` }], ANN);
    ids.push(history.close().id);
  }
  const kept = [...history.checkpoints.keys()];
  assert.ok(kept.length <= 4 && history.step >= 200, `${kept.length} texts kept, one every ${history.step} versions`);
  const timeOf = (id) => {
    const start = performance.now();
    Buffer.byteLength(history.textOf(id));
    return performance.now() - start;
  };
  const near = ids[kept.at(-2) + 10 - 1], far = ids[kept.at(-1) - 2];
  const ratio = () => Array.from({ length: 9 }, () => timeOf(far) / timeOf(near)).sort((x, y) => x - y)[4];
  let k = ratio();
  for (let tries = 1; tries < 3 && k >= 5; tries++) k = ratio();
  assert.ok(k < 5, `a version ${history.step - 1} versions after a kept text took ${k.toFixed(1)} times as long as one 10 versions after it`);
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
  assert.deepEqual([history.overwrittenAfter('earlier.0'), history.overwrittenAfter('not a version')], [false, false]);
  assert.equal(told('First-gr', 'First-Gr', BO), false, 'an operation of a person over a word of Ann');
});

test('every page is told when a change of index.html from outside replaces text that a person wrote in the session, also when it reverts the text, and not when it changes other text', { timeout: 240_000 }, async (t) => {
  const s = await session(t, { quiet: 3_600_000, longest: 3_600_000 });
  const ann = await s.hello('Ann');
  const bo = await s.hello('Bo');
  const written = (text) => until(async () => (await s.current()).includes(text), `the session to hold ${text}`);
  const onDisk = (text) => until(() => readFileSync(s.file, 'utf8').includes(text), `index.html to hold ${text}`);
  const read = await s.current();
  const uno = await s.op(ann, 1, 'One', 'Uno');
  await onDisk('Uno');
  writeFileSync(s.file, read.replace('One', 'Eins'));
  await written('Eins');
  for (const page of [ann, bo]) assert.equal((await s.events(page, uno.v)).overwritten, true);
  const { versions } = await s.list(bo);
  assert.deepEqual(versions.map((v) => v.authors), [[ann.person], []]);
  assert.ok((await raw(s.edit.port, 'GET', `${s.edit.base}index.html?version=${versions[0].id}`)).text.includes('<h2>Uno</h2>'));

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

test('an operation of a person late in a long run takes about as long as one early in it', { timeout: 300_000 }, async (t) => {
  const { run, stop } = longRun(sessionDir(t));
  t.after(stop);
  run(1000);
  let early = Math.min(run(1000), run(1000));
  run(30_000);
  let late = run(1000);
  if (late > 2 * early) {
    let fresh;
    t.after(() => fresh?.terminate());
    fresh = new Worker(new URL('./helpers/long-run.mjs', import.meta.url), { workerData: { longRun: sessionDir(t) } });
    let done = false;
    const gone = once(fresh, 'exit').then(() => assert.ok(done, 'the worker of the early operations exited'));
    const answer = () => Promise.race([once(fresh, 'message'), gone]);
    await answer();
    early = late = 0;
    for (let turn = 0; turn < 20; turn++) {
      late += run(100) / 20;
      const mean = answer();
      fresh.postMessage(100);
      early += (await mean)[0] / 20;
    }
    done = true;
    fresh.postMessage(0);
    await gone;
  }
  assert.ok(late <= 2 * early, `an operation takes ${late.toFixed(3)} ms after 33,000 operations, and ${early.toFixed(3)} ms early in a run`);
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
  replace(authority, '<h2>One</h2>', '<h2>One One</h2>', ANN);
  history.close();
  const at = authority.text.indexOf('One One');
  authority.enter([{ start: at, end: at + 4, text: '' }], BO);
  history.close();
  assert.equal(told('<h2>One', '<h2>Une'), true, 'the first letter of the word of Ann, after Bo removed the word before it');
  replace(authority, 'Second slide', 'Second', ANN);
  replace(authority, 'Second<', 'Second slide<', ANN);
  assert.equal(told('slide<', 'page<'), true, 'a word that Ann typed again');
  replace(authority, '</body>', '<p>Ann wrote this</p>\n</body>', ANN);
  replace(authority, 'Une', 'Une and a long title of a program', 'file');
  replace(authority, '<h2>Two', '<h2>Two and a long title of a program', 'file');
  replace(authority, 'Second page', 'Second page by Bo', BO);
  assert.equal(told('Ann wrote', 'A program wrote'), true, 'a word of Ann after two changes from outside in one version');
  replace(authority, '</body>', '<p>late</p>\n</body>', ANN);
  replace(authority, '<h2>Une', '<h2>Early Une', ANN);
  assert.equal(told('<p>late', '<p>Late'), true, 'the first of two words of Ann in one version');
});

function mulberry32(seed) {
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(rnd() * n);
  const word = (letters, n) => Array.from({ length: n }, () => letters[int(letters.length)]).join('');
  return { rnd, int, word };
}

function applied(cells, patches, person) {
  const out = [];
  let at = 0;
  for (const p of patches) {
    out.push(...cells.slice(at, p.start), ...[...p.text].map((ch) => ({ ch, person })));
    at = p.end;
  }
  return [...out, ...cells.slice(at)];
}

test('a change of index.html from outside is told whenever it replaces or removes a character that a person wrote, over random edits of people', { timeout: 120_000 }, (t) => {
  const { rnd, int, word } = mulberry32(38);
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

test('a change of index.html from outside is not told where it keeps the words that a person wrote between its changes, and is told where it replaces a part of one', { timeout: 60_000 }, (t) => {
  const { authority, history } = open(sessionDir(t), DECK.replace('</body>', '<section><p>The quick brown fox jumps</p></section>\n</body>'));
  const told = (from, to) => {
    const before = authority.version;
    replace(authority, from, to, 'file');
    return history.overwrittenAfter(before);
  };
  replace(authority, 'First slide', 'First', ANN);
  assert.equal(told('Two', 'Zwei'), false, 'a change after a place where Ann removed text');
  replace(authority, 'brown', 'red', ANN);
  assert.equal(told('The quick red fox jumps', 'A quick red dog jumps'), false, 'two words of a program around a word of Ann on one line');
  replace(authority, 'Second slide', 'Second big slide', ANN);
  assert.equal(told('Second big slide', '2nd big page'), false, 'a patch of the diff over a word of Ann that the program kept');
  assert.equal(told('2nd big page', '2nd bag page'), true, 'one letter of a word of Ann');
  assert.equal(told('A quick red dog', 'A quick rex dog'), true, 'the last letter of a word of Ann that a program kept before');
});

test('a change of index.html from outside that indents more than 2000 lines again is told only where it replaces text that a person wrote', { timeout: 60_000 }, (t) => {
  let deck = '<!doctype html><html><body><div class="reveal"><div class="slides">\n';
  for (let i = 0; i < 2400; i++) deck += `<section>\n  <h2>Slide ${i}</h2>\n  <p>Text ${i}</p>\n</section>\n`;
  const { authority, history } = open(sessionDir(t), `${deck}</div></div></body></html>\n`);
  const told = (text) => {
    const before = authority.version;
    enterText(authority, text, 'file');
    return history.overwrittenAfter(before);
  };
  replace(authority, '<p>Text 1200</p>', '<p>Text by Ann</p>', ANN);
  assert.equal(told(authority.text.replace(/^ {2}</gm, '    <')), false, 'an indent that keeps the text of Ann');
  assert.equal(told(authority.text.replace(/^ {4}</gm, '  <').replace('by Ann', 'by Bnn')), true, 'a letter of Ann in an indent');
});

test('a change of index.html from outside is told where it replaces text of a person after a place where another person removed text', { timeout: 60_000 }, (t) => {
  const { authority, history } = open(sessionDir(t), DECK);
  replace(authority, 'Second slide', 'Second bigger slide', ANN);
  history.close();
  replace(authority, 'bigger', 'bgger', BO);
  replace(authority, '</body>', '<p>end</p>\n</body>', BO);
  history.close();
  const before = authority.version;
  replace(authority, 'gger slide', 'ggXr slide', 'file');
  assert.equal(history.overwrittenAfter(before), true);
});

test('a change of index.html from outside takes about as long at the end of a deck that people wrote in at many places as at its start', { timeout: 120_000 }, (t) => {
  let deck = '<!doctype html><html><body><div class="reveal"><div class="slides">\n';
  for (let i = 0; i < 4800; i++) deck += `<section>\n  <h2>Slide ${i}</h2>\n  <p>Text ${i}</p>\n</section>\n`;
  const { authority, history } = open(sessionDir(t), `${deck}</div></div></body></html>\n`);
  for (const person of [ANN, BO, 'CyCyCyCyCyCyCyCyCyCyCy']) {
    for (let from = 0; from < 4800; from += 2000) {
      const patches = [];
      for (const m of authority.text.matchAll(/<p>e*Text (\d+)/g)) if (m[1] >= from && m[1] < from + 2000) patches.push({ start: m.index + 3, end: m.index + 3, text: 'e' });
      authority.enter(patches, person);
    }
    history.close();
  }
  let held = 3;
  const change = (from) => {
    const patches = [];
    for (const m of authority.text.matchAll(/<h2>Slide (\d+)/g)) if (m[1] >= from && m[1] < from + 600) patches.push({ start: m.index + 4, end: m.index + 9, text: 'Page' });
    const start = performance.now();
    authority.enter(patches, 'file');
    if (from > 0 && held-- > 0) for (const end = performance.now() + 40; performance.now() < end; );
    const ms = performance.now() - start;
    authority.enter(patches.map((p, k) => ({ start: p.start - k, end: p.end - k - 1, text: 'Slide' })), 'file');
    return ms;
  };
  let early = Infinity;
  let late = Infinity;
  for (let attempt = 0; attempt < 10 && !(late <= 3 * early); attempt++) {
    early = Math.min(early, change(0));
    late = Math.min(late, change(4200));
  }
  t.diagnostic(`${late.toFixed(1)} ms at the end, ${early.toFixed(1)} ms at the start`);
  assert.ok(late <= 3 * early, `a change at the end of the deck takes ${late.toFixed(1)} ms, and one at its start ${early.toFixed(1)} ms`);
});

test('a change of index.html from outside is told where it replaces a word of a person after she made a word of the same version bold in one operation', { timeout: 60_000 }, (t) => {
  const { authority, history } = open(sessionDir(t), DECK);
  replace(authority, 'First slide', 'First moon', ANN);
  history.close();
  replace(authority, 'First moon', 'First moon of the third body', ANN);
  const at = authority.text.indexOf('third');
  authority.enter([{ start: at, end: at, text: '<b>' }, { start: at + 5, end: at + 5, text: '</b>' }], ANN);
  history.close();
  const before = authority.version;
  replace(authority, 'First moon', 'First Mars', 'file');
  assert.equal(history.overwrittenAfter(before), true);
});

test('a change of index.html from outside is told whenever it replaces a character that a person wrote, after operations of several patches inside the text of their version', { timeout: 120_000 }, (t) => {
  const { rnd, int, word } = mulberry32(38);
  let missed = 0;
  for (let round = 0; round < 3000; round++) {
    let text = '<body>\n';
    for (let i = 0, n = 2 + int(3); i < n; i++) text += `<p>${word('ab ', 3 + int(10))}</p>\n`;
    text += '</body>\n';
    const { authority, history } = open(sessionDir(t), text);
    let cells = [...text].map((ch) => ({ ch, person: false }));
    for (let k = 0, n = 2 + int(5); k < n; k++) {
      const patches = [];
      for (let at = 0, places = 1 + int(5); places > 0 && at <= authority.text.length; places--) {
        const start = at + int(Math.min(12, authority.text.length + 1 - at));
        const end = Math.min(authority.text.length, start + (rnd() < 0.6 ? 0 : 1 + int(3)));
        patches.push({ start, end, text: rnd() < 0.2 && end > start ? '' : word('ab ', 1 + int(9)) });
        at = end + 1;
      }
      assert.equal(authority.enter(patches, rnd() < 0.5 ? ANN : BO).answer.ok, true);
      cells = applied(cells, patches, true);
      if (rnd() < 0.3) history.close();
    }
    const start = int(authority.text.length);
    const range = { start, end: Math.min(authority.text.length, start + 1 + int(3)), text: word('XYZ', 1 + int(3)) };
    const before = authority.version;
    enterText(authority, applied(cells, [range], false).map((c) => c.ch).join(''), 'file');
    if (cells.slice(range.start, range.end).some((c) => c.person) && !history.overwrittenAfter(before)) missed++;
    history.stopSync();
  }
  assert.equal(missed, 0, `${missed} changes from outside over the text of a person were not told`);
});

test('a change of index.html from outside is told by the words that it replaces next to a place where a person removed text, and inside a line of a person in which another person removed a letter', { timeout: 60_000 }, (t) => {
  const told = (steps) => {
    const { authority, history } = open(sessionDir(t), DECK.replace('First slide', 'First <b>big slide</b>'));
    const out = [];
    for (const [from, to, author] of steps) {
      const before = authority.version;
      replace(authority, from, to, author);
      if (author === 'file') out.push(history.overwrittenAfter(before));
      else history.close();
    }
    history.stopSync();
    return out;
  };
  assert.deepEqual(told([['First <b>', '<b>', ANN], ['<b>', '<b class="x">', 'file']]), [false], 'an attribute added to a tag after a word that Ann removed');
  assert.deepEqual(told([['<b>big ', '<b>', ANN], ['<b>', '<b class="x">', 'file']]), [false], 'an attribute added to a tag before a word that Ann removed');
  assert.deepEqual(told([['First <b>big slide</b>', 'one two three four', ANN], ['one', 'oe', BO], ['two three four', 'TWO three FOUR', 'file'], ['three', 'THREE', 'file']]), [true, true], 'a word of Ann after a letter that Bo removed before it');
});

test('a change of index.html from outside of text that nobody wrote takes about as long with the history as the authority takes alone', { timeout: 120_000 }, (t) => {
  let deck = '<!doctype html><html><body><div class="reveal"><div class="slides">\n';
  for (let i = 0; i < 2400; i++) deck += `<section>\n  <h2>Slide ${i}</h2>\n  <p>Text ${i}</p>\n</section>\n`;
  deck += '</div></div></body></html>\n';
  const { authority, history } = open(sessionDir(t), deck);
  t.after(() => history.stopSync());
  replace(authority, '<p>Text 2399</p>', '<p>Text by Ann</p>', ANN);
  history.close();
  const alone = new Authority(authority.text);
  const indented = authority.text.replace(/^ {2}</gm, '    <');
  const there = diff(authority.text, indented);
  const back = diff(indented, authority.text);
  const measured = [];
  const ms = (a) => {
    const start = performance.now();
    const cpu = process.cpuUsage();
    for (let i = 0; i < 10; i++) for (const patches of [there, back]) assert.equal(a.enter(patches, 'file').answer.ok, true);
    const wall = performance.now() - start;
    const used = process.cpuUsage(cpu);
    measured.push(`${a === alone ? 'alone' : 'history'} ${wall.toFixed(1)} ms, CPU ${((used.user + used.system) / 1000).toFixed(1)} ms`);
    return wall;
  };
  ms(alone);
  let [withHistory, without] = [ms(authority), ms(alone)];
  if (withHistory > 6 * without) [withHistory, without] = [Math.min(withHistory, ms(authority)), Math.max(without, ms(alone))];
  assert.ok(withHistory <= 6 * without, `a history that read every mark was 10 times as slow, and this one took ${withHistory.toFixed(1)} ms with the history, and ${without.toFixed(1)} ms for the authority alone, measured as ${measured.join('; ')}`);
});

test('a Replace All in slides that a person pasted in the same version takes about as long as in slides of an earlier version', { timeout: 300_000 }, (t) => {
  let deck = '<!doctype html><html><body><div class="reveal"><div class="slides">\n';
  for (let i = 0; deck.length < 100_000; i++) deck += `<section>\n  <h2>Old ${i}</h2>\n  <p>Text ${i}</p>\n</section>\n`;
  deck += '</div></div></body></html>\n';
  const at = deck.indexOf('</div></div>');
  let slides = '';
  for (let i = 0; slides.length < 400_000; i++) slides += `<section>\n  <h2>Slide ${i}</h2>\n  <p>The orbit of slide ${i}</p>\n</section>\n`;
  const all = [];
  for (let n = 0; n < 2000; n++) {
    const i = slides.indexOf('orbit', Math.floor((n * slides.length) / 2000));
    all.push({ start: at + i, end: at + i + 5, text: 'halo' });
  }
  assert.equal(new Set(all.map((p) => p.start)).size, 2000);
  const took = (closed) => {
    const times = [];
    for (let r = 0; r < 3; r++) {
      const { authority, history } = open(sessionDir(t), deck);
      assert.equal(authority.enter([{ start: at, end: at, text: slides }], ANN).answer.ok, true);
      if (closed) history.close();
      const start = performance.now();
      assert.equal(authority.enter(all, ANN).answer.ok, true);
      times.push(performance.now() - start);
      history.stopSync();
    }
    return times.sort((a, b) => a - b)[1];
  };
  took(true);
  let [same, earlier] = [took(false), took(true)];
  if (same > 6 * earlier) [same, earlier] = [Math.min(same, took(false)), Math.max(earlier, took(true))];
  assert.ok(same <= 6 * earlier, `${same.toFixed(1)} ms in the version of the paste, and ${earlier.toFixed(1)} ms in a later version`);
});

test('a version serves the text that each person removed at the place of the removal, and not a change made and undone', { timeout: 60_000 }, (t) => {
  const item = '    <li>Item</li>\n';
  const deck = DECK.replace('First slide', 'First slide. Ann wrote this.').replace('  <p>Second slide</p>\n', `  <p>Second slide</p>\n  <ul>\n${item}${item}  </ul>\n`);
  const { authority, history } = open(sessionDir(t), deck);
  replace(authority, ' Ann wrote this.', '', BO);
  replace(authority, 'Second slide', 'Second', ANN);
  const at = authority.text.indexOf(item);
  authority.enter([{ start: at, end: at + item.length, text: '' }], ANN);
  replace(authority, '<h2>Two', '<h2>Dos', BO);
  replace(authority, '<h2>Dos', '<h2>Two', BO);
  const v = history.close();
  const text = authority.text;
  const { removals } = history.get(v.id);
  assert.deepEqual(removals.map((r) => [r.author, r.text, text.slice(r.at - 8, r.at)]), [
    [BO, ' Ann wrote this.', 't slide.'],
    [ANN, ' slide', 'p>Second'],
    [ANN, item, '\n  <ul>\n'],
  ]);
  history.stopSync();
});

test('the text of every version is right over random operations of several patches of three people and changes from outside', { timeout: 120_000 }, (t) => {
  let seed = 7;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(rnd() * n);
  const word = (n) => Array.from({ length: n }, () => 'ab \n<>'[int(6)]).join('');
  const people = [ANN, BO, 'CyCyCyCyCyCyCyCyCyCyCy', 'file'];
  for (let round = 0; round < 300; round++) {
    const dir = sessionDir(t);
    const { authority, history } = open(dir, `<body>\n${'<p>ab ba</p>\n'.repeat(1 + int(6))}</body>\n`);
    const texts = [];
    for (let k = 0, n = 2 + int(30); k < n; k++) {
      const patches = [];
      for (let at = 0, places = 1 + int(3); places > 0 && at <= authority.text.length; places--) {
        const start = at + int(authority.text.length + 1 - at);
        const end = Math.min(authority.text.length, start + int(6));
        const ins = rnd() < 0.3 ? '' : word(1 + int(5));
        if (start !== end || ins) patches.push({ start, end, text: ins });
        at = end + 1;
      }
      if (patches.length) authority.enter(patches, people[int(4)]);
      if (rnd() < 0.2) {
        const v = history.close();
        if (v) texts.push([v.id, authority.text]);
      }
    }
    const v = history.close();
    if (v) texts.push([v.id, authority.text]);
    for (const [id, text] of texts) {
      assert.equal(history.textOf(id), text, `round ${round}`);
      for (const r of history.get(id).removals) assert.ok(r.at >= 0 && r.at <= text.length && r.text.length > 0, `round ${round}`);
    }
    history.stopSync();
    const again = open(dir, authority.text);
    for (const [id, text] of texts) assert.equal(again.history.textOf(id), text, `round ${round} after a restart`);
    again.history.stopSync();
  }
});
