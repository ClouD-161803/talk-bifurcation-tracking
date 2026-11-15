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
import { click, press, type } from './helpers/editor.mjs';
import { raw, until } from './helpers/session.mjs';

const SECRET = 'the secret of the group for this test';
const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const ACTION = `(() => { const b = document.querySelector('.beeson-session-action'); return b && !b.hidden ? b.textContent : null; })()`;
// a request to an edit command that is not running fails in the console of the page, the first
// poll after a restart is answered 404, since the token is of the edit command before, and a
// request after End session through the relay is answered 410
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 502/, /status of 410/, /status of 404 .*\/\.session\/events\?/];

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

test('a guest is told that the host is not running, and the end of the session by the host', { timeout: 300_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, idleMs: 3000, pullMs: 1000, guestMs: 5000 });
  t.after(() => relay.close());
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const relayed = ['--relay', relay.url];
  const server = await talk(t, { args: relayed, env: { SLIDES_RELAY_SECRET: SECRET } });
  const { port, key } = server.edit;
  const guestUrl = `${relay.url}/${key}/index.html?edit&session`;
  await until(async () => (await fetch(`${relay.url}/${key}/index.html`)).status === 200, 'the edit command to register with the relay');
  const host = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const guest = await open(browser, guestUrl, { name: 'Ben' });
  assert.deepEqual(await guest.evaluate(`({ host: ${C}.host, state: ${STATE} })`), { host: false, state: 'Saved' });
  await converge(server, [host, guest]);

  await t.test('the guest says that the host is not running while the edit command is stopped', async () => {
    server.edit.child.kill('SIGKILL');
    await server.edit.exited;
    await front(guest);
    await guest.waitFor(`${STATE} === "The host's edit command is not running"`, 20_000);
    assert.equal(await guest.evaluate(`document.querySelector('.beeson-session-state').classList.contains('warn')`), true);
    await server.start(['--port', String(port)]);
    await until(async () => (await fetch(`${relay.url}/${key}/index.html`)).status === 200, 'the edit command to register with the relay again');
    await click(guest, '.beeson-session-action');
    await guest.waitFor(ONLINE, 20_000);
    await host.evaluate(`${C}.tryNow()`);
    await host.waitFor(ONLINE, 20_000);
    await show(guest, 'Two');
    await caretAtEnd(guest, el(1, 'p'));
    await type(guest, ' by Ben');
    assert.equal(await converge(server, [host, guest]), TALK.replace('<p>Second slide</p>', '<p>Second slide by Ben</p>'));
  });

  await t.test('the guest is told that Ann ended the session, and the host goes on', async () => {
    const answer = await raw(port, 'DELETE', `/${key}/.session/share`);
    assert.equal(answer.status, 200);
    await front(guest);
    await guest.waitFor(`document.querySelector('dialog.beeson-edit-dialog[open] h3')?.textContent === 'Ann ended the session'`);
    const dialog = await guest.evaluate(`(() => {
      const d = document.querySelector('dialog.beeson-edit-dialog[open]');
      return { text: d.querySelector('p').textContent, buttons: [...d.querySelectorAll('.row button')].map((b) => b.textContent), state: !!document.querySelector('.beeson-session-state'), autosave: !document.querySelector('.beeson-edit-titlebar button.autosave').hidden };
    })()`);
    assert.deepEqual(dialog, { text: "Your changes up to now are in Ann's deck.", buttons: ['Download a copy', 'Close'], state: false, autosave: true });
    await guest.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-dialog[open] .row button')].find((b) => b.textContent === 'Close').click()`);
    assert.equal(await guest.evaluate(`!!document.querySelector('dialog.beeson-edit-dialog[open]')`), false);
    await front(host);
    await show(host, 'One');
    await caretAtEnd(host, el(0, 'p'));
    await type(host, ', still');
    await until(() => server.read().includes('<p>First slide, still</p>'), 'the edit of the host to reach the file');
    assert.equal(await host.evaluate(STATE), 'Saved to index.html');
  });

  await t.test('the host is told that the session has ended when the edit command stops', { skip: process.platform === 'win32' && 'signals' }, async () => {
    server.edit.child.kill('SIGTERM');
    await server.edit.exited;
    server.edit = null;
    await host.waitFor(`document.querySelector('dialog.beeson-edit-dialog[open] h3')?.textContent === 'The session has ended'`);
    assert.equal(await host.evaluate(`document.querySelector('dialog.beeson-edit-dialog[open] p').textContent`), 'Your changes up to now are in index.html.');
    assert.equal(await host.evaluate(`${C}.connection`), 'ended');
  });

  clean(host, REFUSED);
  // the hello without a name of the rejoin, refused when the kill lost the person of the guest, which
  // the page sends again with the name
  clean(guest, [...REFUSED, /status of 400 .*\/\.session\/hello/]);
});

test('a page whose operation is refused as invalid after a resync stops sending, and Load again loads it', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit));
  await converge(server, [page]);
  await page.evaluate('window.__corrupt = true');
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' refused');
  await page.waitFor(`${STATE} === 'Your changes cannot be sent. Load the page again.'`);
  assert.equal(await page.evaluate(ACTION), 'Load again');
  // the first refusal is followed by a resync and one more operation, and then nothing is sent. an
  // operation would be sent in the frame that reads the next edit
  assert.equal(await ops(page), 2);
  await type(page, ' again');
  await page.waitFor(`${TEXT}.includes('refused again')`);
  await frame(page);
  assert.equal(await ops(page), 2);
  assert.equal(server.read(), TALK);
  const count = await loads(page);
  await click(page, '.beeson-session-action').catch((e) => {
    if (!/Inspected target navigated or closed/.test(e.message)) throw e;
  });
  await until(async () => (await loads(page).catch(() => 0)) > count, 'the page to load again');
  await page.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
  assert.equal(await page.evaluate(STATE), 'Saved to index.html');
  assert.equal(await page.evaluate(TEXT), TALK);
  clean(page, [/status of 400/]);
});

// Present takes the full screen before the edits are sent, and a page that is offline cannot send them
test('Present on a page that is offline ends its show and says that the changes are not sent', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit));
  await converge(server, [page]);
  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  await page.waitFor(`/^Offline\\./.test(${STATE})`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' offline');
  await page.waitFor(`${TEXT}.includes('<p>First slide offline</p>')`);
  await press(page, 'Mod+Enter');
  await page.waitFor(`!!document.querySelector('body > .beeson-edit-show')`);
  await page.waitFor(`!document.querySelector('body > .beeson-edit-show')`, 10_000);
  assert.match(await page.evaluate(`document.querySelector('.beeson-edit-titlebar .state').textContent`), /Your last changes are not sent yet/);
  clean(page, REFUSED);
});
