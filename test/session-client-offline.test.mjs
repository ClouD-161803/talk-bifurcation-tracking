// the client of a session in Chrome when the edit command goes away: the offline state and Try now
// across a kill and a restart, with an edit made offline that reaches index.html, a guest of the
// relay told that the host's edit command is not running, the end of a session for a guest and for
// the host, and the blocked state after an operation refused twice as invalid

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { caretAtEnd, frame, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, ops, sessionUrl, show, STATE, talk, TALK, TEXT } from './helpers/client.mjs';
import { click, type } from './helpers/editor.mjs';
import { raw, until } from './helpers/session.mjs';

const SECRET = 'the secret of the group for this test';
const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const ACTION = `(() => { const b = document.querySelector('.beeson-session-action'); return b && !b.hidden ? b.textContent : null; })()`;
// a request to an edit command that is not running fails in the console of the page, and the first
// poll after a restart is answered 404, since the token is of the edit command before
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 502/, /status of 404 .*\/\.session\/events\?/];

test('a page goes offline when the edit command stops, and Try now sends its edit to the edit command started again', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const { port } = server.edit;
  const page = await open(browser, sessionUrl(server.edit));
  await converge(server, [page]);

  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  await page.waitFor(`/^Offline\\. Reconnecting in \\d+ s$/.test(${STATE})`);
  assert.equal(await page.evaluate(ACTION), 'Try now');
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' offline');
  await page.waitFor(`${TEXT}.includes('<p>First slide offline</p>')`);
  // the reconnects after 1 and 2 s fail, and the next one waits 4 s
  await page.waitFor(`${C}.retryAt - Date.now() > 3000`, 20_000);
  await server.start(['--port', String(port)]);
  await front(page);
  await click(page, '.beeson-session-action');
  await page.waitFor(ONLINE, 2500);
  const text = await converge(server, [page]);
  assert.equal(text, TALK.replace('<p>First slide</p>', '<p>First slide offline</p>'));
  assert.equal(await page.evaluate(STATE), 'Saved to index.html');
  assert.equal(await page.evaluate(ACTION), null);
  clean(page, REFUSED);
});
