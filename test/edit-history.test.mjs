// the version history of the edit command: the rule of closing a version, the file
// .session/history.jsonl read again after a restart, cut by a crash, or unreadable, a change of
// index.html while the command was not running, the slides and the marks of a version, a name, a
// restore, the preview of a version, the rewrite of the file past its size limit, and the texts set
// aside. the module is driven directly where this is exact enough, and the edit command is started
// as a child process for the requests

import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
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
    const { authority, history } = open(sessionDir(t), DECK, { quiet: 400, longest: 60_000 });
    let closedAt = null;
    history.onChange(() => (closedAt ??= Date.now()));
    replace(authority, 'One', 'Uno', ANN);
    const first = Date.now();
    // a second operation within the quiet time moves the close
    await until(() => Date.now() - first >= 50, 'a pause shorter than the quiet time');
    replace(authority, 'Two', 'Deux', ANN);
    const last = Date.now();
    assert.equal(closedAt, null);
    await until(() => history.list().versions.length === 1, 'the version to be closed');
    assert.ok(closedAt - last >= 400, `closed ${closedAt - last} ms after the last operation`);
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
    assert.equal(history.list().versions.length, 2, 'the operation after the close begins the next version');
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
  const again = open(dir, authority.text);
  assert.deepEqual(again.logged, []);
  const listed = again.history.list();
  assert.deepEqual(listed.versions.map((v) => v.id), [...texts.keys()].reverse());
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
  assert.deepEqual(again.history.list().versions.map((v) => v.id), [v1.id]);
  assert.equal(readFileSync(file, 'utf8'), whole);
  replace(again.authority, 'Two', 'Deux', BO);
  const v2 = again.history.close();
  again.history.stopSync();
  const third = open(dir, again.authority.text);
  assert.deepEqual(third.history.list().versions.map((v) => v.id), [v2.id, v1.id]);
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
      assert.deepEqual(history.list().versions, []);
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
  assert.equal(again.history.list().versions.length, 9);
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
