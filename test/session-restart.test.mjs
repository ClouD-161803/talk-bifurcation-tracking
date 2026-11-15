// a restart of the edit command while a page holds an operation that was applied but whose answer
// it did not get: the edit command keeps in .session/applied.json the seq of the last operation of
// each client id in index.html, a hello with the old client id gets it, and the page then neither
// repeats its operation nor reverts what another page did to it

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, ONLINE, open, sessionUrl, show, talk, TALK, TEXT } from './helpers/client.mjs';
import { press, type } from './helpers/editor.mjs';
import { DECK, post, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
// a request to an edit command that is not running fails in the console of the page, and so does
// the first request after a restart, since the token is of the edit command before. an operation
// or a hello that reaches the edit command while it stops is answered 503
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 404 .*\/\.session\/events\?/, /status of 503 .*\/\.session\/(op|hello)$/];

test('a hello with the old client id gets the seq of its last operation in index.html after a kill', { timeout: 60_000 }, async (t) => {
  const folder = talkFolder(t, DECK);
  t.after(() => rmSync(folder.root, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config };
  let edit = await startEdit(folder.talk, { env });
  t.after(() => stopEdit(edit));
  const file = join(folder.talk, 'index.html');
  const table = join(folder.talk, '.session', 'applied.json');
  const hello = await (await post(edit.port, `${edit.base}.session/hello`, { name: 'Ann' })).json();
  const at = DECK.indexOf('First slide') + 'First slide'.length;
  for (const [seq, word] of [[1, ' one'], [2, ' two']]) {
    const answer = await (await post(edit.port, `${edit.base}.session/op`, { token: hello.token, seq, base: `${hello.v.split('.')[0]}.${seq - 1}`, patches: [{ start: at + (seq - 1) * 4, end: at + (seq - 1) * 4, text: word }] })).json();
    assert.equal(answer.ok, true);
  }
  await until(() => readFileSync(file, 'utf8').includes('First slide one two'), 'the operations to reach index.html');
  await until(() => existsSync(table) && JSON.parse(readFileSync(table, 'utf8')).some(([client, seq]) => client === hello.client && seq === 2), 'the table of applied operations');
  edit.child.kill('SIGKILL');
  await edit.exited;

  edit = await startEdit(folder.talk, { env });
  const again = await (await post(edit.port, `${edit.base}.session/hello`, { name: 'Ann', person: hello.person, token: hello.token, was: hello.client })).json();
  assert.notEqual(again.client, hello.client, 'a token of the edit command before is not known');
  assert.equal(again.applied, 2);
  assert.ok(again.text.includes('First slide one two'));
  const other = await (await post(edit.port, `${edit.base}.session/hello`, { name: 'Ben', was: 'neverseenclientid' })).json();
  assert.equal('applied' in other, false);
  const plain = await (await post(edit.port, `${edit.base}.session/hello`, { name: 'Cy' })).json();
  assert.equal('applied' in plain, false);
});

test('a page whose applied operation lost its answer, and that missed the end of the session, repeats nothing and reverts nothing after a restart', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const { port } = server.edit;
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);

  // the requests of Ann reach the edit command, and their answers are lost. the poll held before
  // is answered at the next news, here a third person who joins, and the polls after it are lost.
  // the state of Ann does not reach the edit command at all. it would be sent only when the caret
  // of Ann is in the paragraph before the first lost poll, and the paragraph, which Ben changes
  // below, would then be locked on the page of Ben
  await ann.evaluate(`(() => {
    const fetched = window.fetch;
    window.__polls = 0;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      if (window.__lose && url.includes('/.session/presence')) return Promise.reject(new TypeError('the request was lost'));
      const sent = fetched.call(this, input, init);
      if (!window.__lose || !/\\/\\.session\\/(op|events)/.test(url)) return sent;
      if (url.includes('/.session/events')) window.__polls++;
      return sent.then(() => { throw new TypeError('the answer was lost'); }, () => { throw new TypeError('the answer was lost'); });
    };
    window.__lose = true;
    return true;
  })()`);
  await post(port, `${server.edit.base}.session/hello`, { name: 'Cy' });
  await ann.waitFor('window.__polls > 0');
  await show(ann, 'One');
  await caretAtEnd(ann, el(0, 'p'));
  await type(ann, ' brave');
  await until(() => server.read().includes('<p>First slide brave</p>'), 'the operation of Ann to reach index.html');
  // Ann goes on typing while her operation waits for its answer
  await show(ann, 'Two');
  await caretAtEnd(ann, el(1, 'p'));
  await type(ann, ' later');
  await ann.waitFor(`${TEXT}.includes('<p>Second slide later</p>')`);

  // Ben sees the word of Ann and changes it
  await front(ben);
  await ben.waitFor(`${TEXT}.includes('<p>First slide brave</p>')`);
  await show(ben, 'One');
  await caretAtEnd(ben, el(0, 'p'));
  for (let i = 0; i < 'brave'.length; i++) await press(ben, 'Backspace');
  await type(ben, 'bold');
  await until(() => server.read().includes('<p>First slide bold</p>'), 'the edit of Ben to reach index.html');

  // the stop answers the polls with ended, which Ann does not get, and Ben's session ends
  server.edit.child.kill('SIGTERM');
  await server.edit.exited;
  await server.start(['--port', String(port)]);
  await ann.evaluate(`window.__lose = false; ${C}.tryNow(); true`);
  await ann.waitFor(ONLINE, 20_000);
  const text = await converge(server, [ann]);
  assert.equal(text, TALK.replace('<p>First slide</p>', '<p>First slide bold</p>').replace('<p>Second slide</p>', '<p>Second slide later</p>'));
  // the state of Ann that waited is sent first after the restart, with the token of the edit command before
  clean(ann, [...REFUSED, /the answer was lost/, /status of 404 .*\/\.session\/presence/]);
});
