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
