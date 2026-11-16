// the client of a session in Chrome when its page goes away right after an edit: a page closed
// without the question, as Safari on an iPhone and Chrome on Android close a tab, and a page hidden
// and frozen, as a phone suspends it in the app switcher. a proxy in front of the edit command holds
// the operations until Chrome has cancelled the requests of a closed page, which it does not do to
// a request sent with keepalive

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd } from './helpers/apply.mjs';
import { C, clean, converge, open, ops, sessionUrl, show, talk, TALK } from './helpers/client.mjs';
import { type } from './helpers/editor.mjs';
import { el } from './helpers/offline.mjs';
import { until } from './helpers/session.mjs';

// a script for open() that records in window.__kept whether each operation was sent with keepalive,
// and the size of its body in bytes
const KEPT = `{
  const fetched = window.fetch;
  window.__kept = [];
  window.fetch = function (input, init) {
    if (String(input).includes('/.session/op')) window.__kept.push({ keepalive: !!init.keepalive, bytes: new Blob([init.body]).size });
    return fetched.call(this, input, init);
  };
}`;

test('an operation is sent with keepalive only under 60,000 bytes in UTF-8, and a larger paste reaches index.html in one request', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: KEPT });
  await converge(server, [page]);
  // operations of a token that the edit command does not know, which it answers without a change.
  // an é is one character and two bytes
  const sent = await page.evaluate(`(async () => {
    window.__kept = [];
    for (const n of [59999, 60000]) {
      const post = { token: 'none', seq: 1, base: '0', patches: [{ start: 0, end: 0, text: '' }] };
      const more = n - new Blob([JSON.stringify(post)]).size;
      post.patches[0].text = 'é'.repeat(more >> 1) + 'e'.repeat(more & 1);
      await ${C}.transport.op(post);
    }
    return window.__kept.splice(0);
  })()`);
  assert.deepEqual(sent, [{ keepalive: true, bytes: 59999 }, { keepalive: false, bytes: 60000 }]);

  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  const before = await ops(page);
  const paste = ` ${'é'.repeat(35_000)}`;
  await type(page, paste);
  await until(() => server.read() === TALK.replace('<p>First slide</p>', `<p>First slide${paste}</p>`), 'the paste to reach index.html');
  assert.equal((await ops(page)) - before, 1);
  assert.deepEqual(await page.evaluate('window.__kept.map((k) => k.keepalive)'), [false]);
  clean(page);
});
