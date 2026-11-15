// the offline path of the client of a session in Chrome: the slides of the edits that wait, named
// in the save state and in the dialog of the end, the copy of the edits in IndexedDB that a page
// opened again sends, with the version in the log and after a restart of the edit command, two
// tabs that keep their copies apart, IndexedDB blocked, the dialog of the conflicts at a reconnect
// with each of its buttons, and the pictures uploaded into media/ before the operation that names
// them

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, ONLINE, open, sessionUrl, show, STATE, talk, TALK, TEXT } from './helpers/client.mjs';
import { click, type } from './helpers/editor.mjs';
import { CONFLICTS, copied, downloads, dropFiles, goOffline, goOnline, press, released, ROWS, rows, tab } from './helpers/offline.mjs';
import { raw, until } from './helpers/session.mjs';

const SECRET = 'the secret of the group for this test';
const IMAGE = resolve('demo/figure-light.png');
const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const ACTION = `(() => { const b = document.querySelector('.beeson-session-action'); return b && !b.hidden ? b.textContent : null; })()`;
// a request to an edit command that is not running fails in the console of the page, and the first
// poll after a restart is answered 404, since the token is of the edit command before
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 502/, /status of 404 .*\/\.session\/events\?/];

// the characters from to to of the first text node of the text element of expression selected
async function select(page, expression, from, to) {
  const ok = await page.evaluate(`(() => {
    const host = ${expression};
    host.focus();
    const r = document.createRange();
    r.setStart(host.firstChild, ${from});
    r.setEnd(host.firstChild, ${to});
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return document.activeElement === host;
  })()`);
  assert.ok(ok, `the text of ${expression} is selected`);
}

async function edit(page, slide, selector, text) {
  await show(page, slide === 0 ? 'One' : 'Two');
  await caretAtEnd(page, el(slide, selector));
  await type(page, text);
}

test('the save state names the slides of the edits that wait, and the dialog of the end names those that did not reach the host', { timeout: 120_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, idleMs: 600, pullMs: 1000, guestMs: 5000 });
  t.after(() => relay.close());
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET } });
  const { port, key } = server.edit;
  await until(async () => (await fetch(`${relay.url}/${key}/index.html`)).status === 200, 'the edit command to register with the relay');
  const host = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const guest = await tab(browser, `${relay.url}/${key}/index.html?edit&session`, { name: 'Ben' });
  await converge(server, [host, guest]);

  await guest.evaluate('window.__blockOps = true');
  await edit(guest, 1, 'p', ' by Ben');
  await guest.waitFor(`${STATE} === 'Offline. Changes on slide 2 are kept in this browser'`);
  assert.equal(await guest.evaluate(ACTION), 'Try now');
  await edit(guest, 0, 'p', ' too');
  await guest.waitFor(`${STATE} === 'Offline. Changes on slides 1 and 2 are kept in this browser'`);

  assert.equal((await raw(port, 'DELETE', `/${key}/.session/share`)).status, 200);
  await front(guest);
  await guest.waitFor(`document.querySelector('dialog.beeson-edit-dialog[open] h3')?.textContent === 'Ann ended the session'`);
  assert.equal(await guest.evaluate(`document.querySelector('dialog.beeson-edit-dialog[open] p').textContent`), "Your changes up to now are in Ann's deck. Your changes on slides 1 and 2 did not reach Ann.");
  assert.equal(server.read(), TALK);
  clean(host);
  clean(guest, REFUSED);
});
