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
