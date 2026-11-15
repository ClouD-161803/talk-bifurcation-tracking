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

test('an edit made offline in a page that is closed reaches index.html at the next join, with its version in the log', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  const ben = await open(browser, url, { name: 'Ben' });
  await converge(server, [a, ben]);

  await goOffline(a);
  await edit(a, 0, 'p', ' offline');
  const id = await copied(a, '<p>First slide offline</p>');
  // the log of the edit command goes on meanwhile
  await edit(ben, 1, 'p', ' by Ben');
  await until(() => server.read().includes('Second slide by Ben'), 'the edit of Ben to reach the file');
  await a.close();
  await released(ben, id);

  const again = await tab(browser, url);
  const text = await converge(server, [again, ben]);
  assert.equal(text, TALK.replace('<p>First slide</p>', '<p>First slide offline</p>').replace('<p>Second slide</p>', '<p>Second slide by Ben</p>'));
  await again.waitFor(`${STATE} === 'Sent your changes on slide 1 from before the page was closed'`);
  await again.waitFor(`(${ROWS}).then((r) => r.length === 0)`);
  assert.equal(await again.evaluate(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`), false);
  clean(again);
  clean(ben);
});

test('an edit made offline in a page that is closed reaches index.html after a restart of the edit command, i.e. a new log', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const { port } = server.edit;
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  // a page of the same origin, which reads the locks after the page of the copy is closed
  const probe = await browser.newPage({ width: 640, height: 480 });
  await probe.goto(`${server.edit.url}index.html`);
  await converge(server, [a]);

  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  await a.waitFor(`${C}.connection === 'offline'`);
  await edit(a, 1, 'li', ' and Gamma');
  const id = await copied(a, '<li>Alpha and Gamma</li>');
  await a.waitFor(`${STATE} === 'Offline. Changes on slide 2 are kept in this browser'`);
  await a.close();
  await released(probe, id);
  await server.start(['--port', String(port)]);

  const again = await tab(browser, url);
  const text = await converge(server, [again]);
  assert.equal(text, TALK.replace('<li>Alpha</li>', '<li>Alpha and Gamma</li>'));
  await again.waitFor(`${STATE} === 'Sent your changes on slide 2 from before the page was closed'`);
  assert.deepEqual(await rows(again), []);
  clean(again, REFUSED);
});
