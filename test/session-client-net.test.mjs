// the client of a session in Chrome against a network that holds, cuts, or refuses its requests:
// the reload after a change of the head, the end of a session, the reconnect, the rejoin, the
// acknowledgment of Save, and the bookkeeping of a poll, with the requests ruled by NET of net.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, sessionUrl, show, STATE, talk, TALK, TEXT } from './helpers/client.mjs';
import { NET } from './helpers/net.mjs';
import { ROWS } from './helpers/offline.mjs';
import { click, press, type } from './helpers/editor.mjs';
import { raw, until } from './helpers/session.mjs';

const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const INERT = `document.querySelector('.reveal .slides').inert`;
const DIALOG = `document.querySelector('dialog.beeson-edit-dialog[open]')`;
// a request to an edit command that is not running fails in the console of the page
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 502/, /status of 404 .*\/\.session\/events\?/];
// every request of the page under .session/ fails, also a request held and the long poll in flight
const OFFLINE = `__net.clear() && __net.rule('/.session/', 'cut') && __net.cut('/.session/') && __net.drop('/.session/')`;
// the paragraph of slide One in index.html
const paragraph = (text) => /<h2>One<\/h2>\n  <p>([^<]*)<\/p>/.exec(text)?.[1];
// the records of copy.ts in IndexedDB for the address of the page
const COPIES = `new Promise((done) => {
  const r = indexedDB.open('beeson-session', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('copies', { keyPath: 'id' }).createIndex('key', 'key');
  r.onsuccess = () => {
    const get = r.result.transaction('copies').objectStore('copies').index('key').getAll(location.origin + location.pathname);
    get.onsuccess = () => done(get.result.length);
  };
})`;

// a page whose operation is held in flight with an edit of slide One, and then a change of the head
// of index.html, which the page must load again for
async function waiting(t, edit = ' slow') {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, edit);
  await page.waitFor(`__net.held.length === 1`);
  writeFileSync(server.file, server.read().replace('<title>A session</title>', '<title>A session, renamed</title>'));
  await page.waitFor(`${INERT} && ${STATE} === 'Saving…'`);
  return { browser, server, page };
}

test('converge fails with the text of each page when a page agrees with the file and another does not', { timeout: 30_000 }, () => {
  // a loop that does not end blocks the event loop of node, hence the call runs in a child process
  const script = `
    import { converge } from './test/helpers/client.mjs';
    const page = (text) => ({ send: async () => ({}), evaluate: async () => text });
    converge({ read: () => 'abc' }, [page('abc'), page('abd')], 'the pages to agree', 300).then(
      () => console.log('resolved'),
      (e) => console.log(e.message),
    );
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.signal, null, 'converge did not fail within 10 s');
  assert.equal(run.stdout.trim(), 'timed out waiting for the pages to agree\npage 0: agrees\npage 1: "abd" where the file has "abc"');
});

test('letters typed while a page waits to load again after a change of the head reach index.html', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [page]);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  // a letter every 20 ms, and the paragraph as the deck reads at the unload of the page
  await page.evaluate(`(() => {
    const p = ${el(0, 'p')};
    let n = 0;
    window.__typing = setInterval(() => document.execCommand('insertText', false, 'abcdefghijklmnopqrstuvwxyz'[n++ % 26]), 20);
    addEventListener('pagehide', () => sessionStorage.setItem('__shown', p.textContent));
    return true;
  })()`);
  await page.waitFor(`${el(0, 'p')}.textContent.length > 'First slide'.length + 10`);
  writeFileSync(server.file, server.read().replace('<title>A session</title>', '<title>A session, renamed</title>'));
  await until(async () => (await loads(page).catch(() => 0)) > 1, 'the page to load again');
  await page.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
  const shown = await page.evaluate(`sessionStorage.getItem('__shown')`);
  assert.ok(shown.length > 'First slide'.length + 10, shown);
  // the edit command writes index.html up to 1 s after an operation
  await until(() => paragraph(server.read()) === shown, 'index.html to hold the letters shown at the unload', 10_000).catch((e) => {
    throw new Error(`${e.message}: ${paragraph(server.read())} where the page showed ${shown}`);
  });
  assert.equal(await page.evaluate(`${el(0, 'p')}.textContent`), shown);
  assert.equal(await page.evaluate(COPIES), 0);
  assert.equal(await page.evaluate(STATE), 'Saved to index.html');
  clean(page);
});

test('a page that must load again while offline reconnects first, and loads again once its edit is acknowledged', { timeout: 120_000 }, async (t) => {
  const { server, page } = await waiting(t);
  await page.evaluate(OFFLINE);
  // the reconnects after 1 and 2 s fail, and the next one waits 4 s
  await page.waitFor(`/^Offline/.test(${STATE}) && ${C}.retryAt - Date.now() > 3000`, 20_000);
  assert.equal(await loads(page), 1);
  assert.equal(await page.evaluate(INERT), true);
  assert.equal(await page.evaluate(`${C}.acked()`), false);
  await page.evaluate(`__net.clear()`);
  await front(page);
  await click(page, '.beeson-session-action').catch((e) => {
    if (!/Inspected target navigated or closed/.test(e.message)) throw e;
  });
  await until(async () => (await loads(page).catch(() => 0)) > 1, 'the page to load again');
  await page.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
  const text = await converge(server, [page]);
  assert.equal(text, TALK.replace('<p>First slide</p>', '<p>First slide slow</p>').replace('<title>A session</title>', '<title>A session, renamed</title>'));
  assert.equal(await page.evaluate(COPIES), 0);
  assert.equal(await loads(page), 2);
  clean(page, REFUSED);
});

test('a session that ends while a page waits to load again shows its dialog, with the edit in the copy', { timeout: 120_000 }, async (t) => {
  const { server, page } = await waiting(t);
  server.edit.child.kill('SIGTERM');
  await server.edit.exited;
  server.edit = null;
  await page.waitFor(`${DIALOG}?.querySelector('h3').textContent === 'The session has ended'`);
  assert.deepEqual(await page.evaluate(`({ text: ${DIALOG}.querySelector('p').textContent, inert: ${INERT}, loads: Number(sessionStorage.getItem('__loads')) })`), {
    text: 'Your changes up to now are in index.html. Your changes on slide 1 did not reach index.html.',
    inert: false,
    loads: 1,
  });
  await page.evaluate(`(${C}.shell.download = (text) => (window.__copy = text), true)`);
  await page.evaluate(`[...${DIALOG}.querySelectorAll('.row button')].find((b) => b.textContent === 'Download a copy').click()`);
  const copy = await page.evaluate('window.__copy');
  assert.ok(copy.includes('<p>First slide slow</p>') && copy.includes('<title>A session, renamed</title>'), copy);
  clean(page, REFUSED);
});

test('a page that is blocked while it waits to load again offers the copy and Load again', { timeout: 120_000 }, async (t) => {
  const { server, page } = await waiting(t);
  await page.evaluate(`window.__corrupt = true; __net.clear(); __net.release('/.session/op')`);
  await page.waitFor(`${DIALOG}?.querySelector('h3').textContent === 'Your changes cannot be sent'`);
  assert.deepEqual(await page.evaluate(`[...${DIALOG}.querySelectorAll('.row button')].map((b) => b.textContent)`), ['Download a copy', 'Load again']);
  assert.equal(await loads(page), 1);
  await page.evaluate(`(${C}.shell.download = (text) => (window.__copy = text), true)`);
  await page.evaluate(`[...${DIALOG}.querySelectorAll('.row button')].find((b) => b.textContent === 'Download a copy').click()`);
  const copy = await page.evaluate('window.__copy');
  assert.ok(copy.includes('<p>First slide slow</p>') && copy.includes('<title>A session, renamed</title>'), copy);
  assert.equal(await page.evaluate(`!!${DIALOG}`), true);
  await page.evaluate(`window.__corrupt = false`);
  await page.evaluate(`[...${DIALOG}.querySelectorAll('.row button')].find((b) => b.textContent === 'Load again').click()`).catch((e) => {
    if (!/Inspected target navigated or closed/.test(e.message)) throw e;
  });
  await until(async () => (await loads(page).catch(() => 0)) > 1, 'the page to load again');
  await page.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
  assert.ok(server.read().includes('<title>A session, renamed</title>'));
  clean(page, [/status of 400/]);
});

// the fetch of start() is the one request of the page for its own address with session
const VERSION = 'index.html?edit&session';
const NOT_RUNNING = "The host's edit command is not running";
const button = (label) => `[...${DIALOG}.querySelectorAll('.row button')].find((b) => b.textContent === ${JSON.stringify(label)})`;

test('a page whose fetch of its version fails or is answered 502 says that the host is not running, and joins once an answer comes', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const relayed = `__net.rule(${JSON.stringify(VERSION)}, 'answer', { status: 502, body: 'no edit command is registered for this session', type: 'text/plain' })`;
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n${relayed};`, ready: false });
  await page.waitFor(`${DIALOG}?.querySelector('h3').textContent === ${JSON.stringify(NOT_RUNNING)}`);
  assert.deepEqual(await page.evaluate(`({ text: ${DIALOG}.querySelector('p').textContent, buttons: [...${DIALOG}.querySelectorAll('.row button')].map((b) => b.textContent) })`), {
    text: 'This link works again once the host starts it.',
    buttons: ['Try now'],
  });
  // the fetch is sent again after 1 s, and the deck is not opened without the session meanwhile
  await page.waitFor(`__net.count(${JSON.stringify(VERSION)}) === 2`);
  assert.deepEqual(await page.evaluate(`({ client: window.BeesonSession.client(), dialog: ${DIALOG}?.querySelector('h3').textContent })`), { client: null, dialog: NOT_RUNNING });
  // a fetch that throws keeps the dialog, and the next answer closes it
  await page.evaluate(`__net.clear() && __net.rule(${JSON.stringify(VERSION)}, 'cut', { times: 1 }) && (${button('Try now')}.click(), true)`);
  await page.waitFor(`__net.count(${JSON.stringify(VERSION)}) === 3`);
  assert.equal(await page.evaluate(`${DIALOG}?.querySelector('h3').textContent`), NOT_RUNNING);
  await page.evaluate(`${button('Try now')}.click()`);
  await page.waitFor(ONLINE);
  assert.equal(await page.evaluate(`!!${DIALOG}`), false);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' joined');
  assert.equal(await converge(server, [page]), TALK.replace('<p>First slide</p>', '<p>First slide joined</p>'));
  clean(page, [/status of 502/, /Failed to fetch/]);
});

test('a page whose fetch of its version is answered 404 offers Load again, and one answered 200 without a version is edited without a session', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  // the rule holds for the first load only
  const first = `sessionStorage.getItem('__loads') === '1' && __net.rule(${JSON.stringify(VERSION)}, 'answer', { status: 404, body: 'not found', type: 'text/plain' })`;
  const refused = await open(browser, sessionUrl(server.edit), { script: `${NET}\n${first};`, ready: false });
  await refused.waitFor(`${DIALOG}?.querySelector('h3').textContent === 'This page cannot join the session'`);
  assert.deepEqual(await refused.evaluate(`({ text: ${DIALOG}.querySelector('p').textContent, buttons: [...${DIALOG}.querySelectorAll('.row button')].map((b) => b.textContent), client: window.BeesonSession.client() })`), {
    text: 'The edit command answered 404. Load the page again, or open the address that the host shared.',
    buttons: ['Load again'],
    client: null,
  });
  await refused.evaluate(`${button('Load again')}.click()`).catch((e) => {
    if (!/Inspected target navigated or closed/.test(e.message)) throw e;
  });
  await until(async () => (await loads(refused).catch(() => 0)) > 1, 'the page to load again');
  await refused.waitFor(ONLINE);

  const plain = await open(browser, sessionUrl(server.edit), { script: `${NET}\n__net.rule(${JSON.stringify(VERSION)}, 'answer', { status: 200, body: ${JSON.stringify(TALK)}, type: 'text/html', times: 1 });`, ready: false });
  await plain.waitFor(`${DIALOG}?.querySelector('h3').textContent === 'This page is not served by an edit command'`);
  assert.equal(await plain.evaluate(`window.BeesonSession.client()`), null);
  clean(refused, [/status of 404/]);
  clean(plain);
});

test('a page whose theme/session.js does not load says so, and Load again joins', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const block = (urls) => async (page) => {
    await page.send('Network.enable', {});
    await page.send('Network.setBlockedURLs', { urls });
  };
  const page = await open(browser, sessionUrl(server.edit), { ready: false, before: block(['*/theme/session.js']) });
  await page.waitFor(`${DIALOG}?.querySelector('h3').textContent === 'The session could not start'`);
  assert.deepEqual(await page.evaluate(`({ text: ${DIALOG}.querySelector('p').textContent, buttons: [...${DIALOG}.querySelectorAll('.row button')].map((b) => b.textContent), session: typeof window.BeesonSession })`), {
    text: 'theme/session.js could not be loaded. Load the page again to join the session.',
    buttons: ['Load again'],
    session: 'undefined',
  });
  await block([])(page);
  await page.evaluate(`${button('Load again')}.click()`).catch((e) => {
    if (!/Inspected target navigated or closed/.test(e.message)) throw e;
  });
  await until(async () => (await loads(page).catch(() => 0)) > 1, 'the page to load again');
  await page.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
  clean(page, [/ERR_BLOCKED_BY_CLIENT/]);
});

test('a page is online as soon as a request after an outage succeeds, while the edit command holds its poll', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE}) && ${C}.retryAt !== null`);
  await page.evaluate(`__net.clear() && (${C}.tryNow(), true)`);
  // the edit command holds a poll without news for 25 s
  await page.waitFor(`${ONLINE} && ${STATE} === 'Saved to index.html'`, 10_000);
  assert.equal(await page.evaluate(`document.querySelector('.beeson-session-action').hidden`), true);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' back');
  assert.equal(await converge(server, [page]), TALK.replace('<p>First slide</p>', '<p>First slide back</p>'));
  clean(page, REFUSED);
});

test('a page asks before it unloads only while this browser cannot keep an edit that is not acknowledged, and keeps no listener otherwise', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  // a listener of beforeunload keeps a page out of the back-forward cache of Firefox
  const listenersOf = async (p) => (await p.send('Runtime.evaluate', { expression: `getEventListeners(window).beforeunload?.length ?? 0`, includeCommandLineAPI: true, returnByValue: true })).result.value;
  const asksOf = (p) => p.evaluate(`(() => { const ev = new Event('beforeunload', { cancelable: true }); dispatchEvent(ev); return ev.defaultPrevented; })()`);

  // with IndexedDB the copy of the page keeps the edit for the next visit, hence the page does not ask
  const keeping = await open(browser, sessionUrl(server.edit), { name: 'Ben', script: NET });
  await converge(server, [keeping]);
  const before = await listenersOf(keeping);
  await keeping.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(keeping, 'Two');
  await caretAtEnd(keeping, el(1, 'p'));
  await type(keeping, ' kept');
  await keeping.waitFor(`__net.held.length === 1`);
  await keeping.waitFor(`(${ROWS}).then((rows) => rows.some((r) => r.mine.includes('<p>Second slide kept</p>')))`);
  assert.deepEqual({ asks: await asksOf(keeping), listeners: await listenersOf(keeping) }, { asks: false, listeners: before });
  await keeping.evaluate(`__net.clear() && __net.release('/.session/op')`);
  await converge(server, [keeping]);
  await keeping.close();

  // without IndexedDB the edit is only on the page
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\nIDBFactory.prototype.open = function () { throw new DOMException('The operation is insecure.', 'SecurityError'); };` });
  await converge(server, [page]);
  const listeners = () => listenersOf(page);
  const asks = () => asksOf(page);
  const idle = await listeners();
  assert.equal(await asks(), false);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' held');
  await page.waitFor(`__net.held.length === 1`);
  assert.deepEqual({ asks: await asks(), listeners: await listeners() }, { asks: true, listeners: idle + 1 });
  await page.evaluate(`__net.clear() && __net.release('/.session/op')`);
  await converge(server, [page]);
  assert.deepEqual({ asks: await asks(), listeners: await listeners() }, { asks: false, listeners: idle });
  await page.evaluate(OFFLINE);
  await type(page, ' offline');
  await page.waitFor(`/^Offline/.test(${STATE})`);
  assert.equal(await asks(), true);
  await page.evaluate(`__net.clear() && __net.rule('/.session/op', 'hold') && (${C}.tryNow(), true)`);
  // the page is online again only with the answer of the operation or of a poll
  await page.waitFor(`__net.held.length === 1`);
  assert.equal(await asks(), true);
  // after the end, the check of files.ts asks for the changes of the deck
  server.edit.child.kill('SIGTERM');
  await server.edit.exited;
  server.edit = null;
  await page.waitFor(`${C}.connection === 'ended'`);
  assert.equal(await listeners(), idle);
  clean(page, REFUSED);
});

test('the operations of the answer that ends the session are taken before its dialog, which then holds every acknowledged edit', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben', script: NET });
  await converge(server, [ann, ben]);
  // the poll of Ben in flight is answered by an edit of Ann, and his next one is held in the page
  await ben.evaluate(`__net.rule('/.session/events', 'hold')`);
  await show(ann, 'Two');
  await caretAtEnd(ann, el(1, 'p'));
  await type(ann, ' first');
  await ben.waitFor(`__net.held.length === 1`);
  await show(ben, 'One');
  await caretAtEnd(ben, el(0, 'p'));
  await type(ben, ' last');
  await until(() => server.read().includes('<p>First slide last</p>'), 'the edit of Ben to reach index.html');
  await ben.waitFor(`!${C}.sending`);
  await front(ann);
  await type(ann, ' by Ann');
  await until(() => server.read().includes('<p>Second slide first by Ann</p>'), 'the edit of Ann to reach index.html');
  // the edit command answers every poll with ended for at least 200 ms after it answered the poll of Ann
  server.edit.child.kill('SIGTERM');
  await ann.waitFor(`${C}.connection === 'ended'`);
  await ben.evaluate(`__net.clear() && __net.release('/.session/events')`);
  await server.edit.exited;
  server.edit = null;
  await front(ben);
  await ben.waitFor(`${DIALOG}?.querySelector('h3').textContent === 'The session has ended'`);
  assert.equal(await ben.evaluate(`${DIALOG}.querySelector('p').textContent`), 'Your changes up to now are in index.html.');
  await ben.evaluate(`(${C}.shell.download = (text) => (window.__copy = text), true)`);
  await ben.evaluate(`${button('Download a copy')}.click()`);
  const copy = await ben.evaluate('window.__copy');
  assert.ok(copy.includes('<p>First slide last</p>') && copy.includes('<p>Second slide first by Ann</p>'), copy);
  clean(ann, REFUSED);
  clean(ben, REFUSED);
});

test('a page whose poll is refused again right after each hello waits longer before each next hello', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  // as for a page evicted by the ninth page of its person: every poll is answered 404
  const from = await page.evaluate(`(__net.rule('/.session/events', 'answer', { status: 404, body: '{"error":"the page is not in the session"}' }), Date.now())`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  // the edit answers the poll in flight, and the next one is refused
  await type(page, ' x');
  const hellos = `__net.log.filter((l) => l.url.includes('/.session/hello') && l.at >= ${from}).map((l) => l.at)`;
  await page.waitFor(`${hellos}.length >= 3`, 15_000);
  const at = await page.evaluate(hellos);
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.ok(gaps[0] >= 900 && gaps[1] >= 1800, `the gaps between the hellos are ${gaps.join(', ')} ms`);
  clean(page);
});

test('a rejoin of a second page of a person keeps the name that another page of the person changed', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  // b is another browser, which takes over the person of Ann
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ann', script: NET, wait: false });
  await b.waitFor(`${DIALOG}?.querySelector('h3')?.textContent.includes('has joined this deck before')`);
  await b.evaluate(`${button('Yes, continue')}.click()`);
  await b.waitFor(ONLINE);
  assert.equal(await b.evaluate(`${C}.person`), await a.evaluate(`${C}.person`));
  await converge(server, [a, b]);
  // the next poll of b is refused, as after a sleep of its tab, and b says hello again
  const hellos = await b.evaluate(`(__net.rule('/.session/events', 'answer', { status: 404, body: '{"error":"the page is not in the session"}', times: 1 }), __net.count('/.session/hello'))`);
  assert.equal(await a.evaluate(`window.BeesonSession.rename(${C}, 'Ann Smith')`), 'renamed');
  await b.waitFor(`__net.count('/.session/hello') === ${hellos + 1} && ${ONLINE} && !${C}.joining`);
  const own = (page) => page.evaluate(`({ name: ${C}.name, known: ${C}.known.find((p) => p.person === ${C}.person).name, stored: localStorage.getItem('beeson-session-name') })`);
  assert.deepEqual(await own(b), { name: 'Ann Smith', known: 'Ann Smith', stored: 'Ann Smith' });
  await converge(server, [a, b]);
  assert.deepEqual(await own(a), { name: 'Ann Smith', known: 'Ann Smith', stored: 'Ann Smith' });
  clean(a);
  clean(b);
});

// whether the center of each element of selector is in the window and reaches the element
const REACHED = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.offsetParent).map((e) => {
  const r = e.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  return { name: e.textContent.trim() || e.getAttribute('aria-label'), ok: x >= 0 && x <= innerWidth && e.contains(document.elementFromPoint(x, y)) };
}).filter((e) => !e.ok).map((e) => e.name)`;

test('on a phone, the menus and the controls of the session are reached while offline, and a tap on the save state reconnects', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { width: 390, height: 844, mobile: true, script: NET });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE}) && ${C}.retryAt !== null`);
  const controls = '.beeson-edit-menubar [role=menuitem], .beeson-edit-titlebar .right button';
  assert.deepEqual(await page.evaluate(REACHED(controls)), []);
  await page.evaluate(`__net.clear()`);
  await click(page, '.beeson-session-state');
  await page.waitFor(`${ONLINE} && ${STATE} === 'Saved to index.html'`, 10_000);
  assert.deepEqual(await page.evaluate(REACHED(controls)), []);
  // the blocked state, with Load again
  await page.evaluate('window.__corrupt = true');
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' refused');
  await page.waitFor(`${C}.blocked`);
  assert.deepEqual(await page.evaluate(REACHED(controls)), []);
  clean(page, [...REFUSED, /status of 400/]);
});

test('on a phone, the save state shows its text, so that Saving… and Saved differ', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { width: 390, height: 844, mobile: true, script: NET });
  await converge(server, [page]);
  // the text of the save state, when all of it is in view
  const shown = `(() => {
    const n = document.querySelector('.beeson-session-state .name');
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.right <= innerWidth && n.scrollWidth <= n.clientWidth && getComputedStyle(n).visibility === 'visible' ? n.textContent : null;
  })()`;
  assert.equal(await page.evaluate(shown), 'Saved to index.html');
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' slow');
  await page.waitFor(`${STATE} === 'Saving…'`);
  assert.equal(await page.evaluate(shown), 'Saving…');
  await page.evaluate(`__net.clear() && __net.release('/.session/op')`);
  await converge(server, [page]);
  clean(page);
});

test('two pages resync after a restart of the edit command, one with an operation in flight and one that typed during the outage', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const { port } = server.edit;
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben', script: NET });
  await converge(server, [a, b]);
  // the operation of b is held in the page until the edit command is started again
  await b.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(b, 'One');
  await caretAtEnd(b, el(0, 'p'));
  await type(b, ' held');
  await b.waitFor(`__net.held.length === 1`);
  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  await a.waitFor(`/^Offline/.test(${STATE})`);
  await show(a, 'Two');
  await caretAtEnd(a, el(1, 'p'));
  await type(a, ' by Ann');
  await a.waitFor(`${TEXT}.includes('<p>Second slide by Ann</p>')`);
  await server.start(['--port', String(port)]);
  await b.evaluate(`__net.clear() && __net.release('/.session/op')`);
  for (const page of [a, b]) await page.evaluate(`(${C}.tryNow(), true)`);
  const text = await converge(server, [a, b], 'the pages and index.html to agree after the restart', 40_000);
  assert.equal(text, TALK.replace('<p>First slide</p>', '<p>First slide held</p>').replace('<p>Second slide</p>', '<p>Second slide by Ann</p>'));
  // the decks themselves, and not only their texts, read as the merged text
  for (const page of [a, b]) assert.deepEqual(await page.evaluate(`[${el(0, 'p')}.textContent, ${el(1, 'p')}.textContent]`), ['First slide held', 'Second slide by Ann']);
  // a presence with the token of the edit command before is refused, and so is a hello without a
  // name from a person whom the edit command lost with the kill, which the page sends again with it
  const restarted = [...REFUSED, /status of 404 .*\/\.session\/presence/, /status of 400 .*\/\.session\/hello/];
  clean(a, restarted);
  clean(b, restarted);
});

test('a reconnect while an operation is unanswered waits for its answer, and a hello with the whole text does not type the edit twice', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' held');
  await page.waitFor(`__net.held.length === 1`);
  // the hello of the reconnect gets the whole text, as when the log no longer reaches since
  await page.evaluate(`__net.rule('/.session/hello', 'edit', { edit: ({ v, ...rest }) => rest, times: 1 }) && __net.drop('/.session/events')`);
  await page.waitFor(`/^Offline/.test(${STATE}) && ${C}.retryAt !== null`);
  const hellos = await page.evaluate(`__net.count('/.session/hello')`);
  await page.evaluate(`${C}.tryNow(), new Promise((done) => setTimeout(done))`);
  // a hello sent before the answer of the operation is answered before the edit command applies it
  await page.waitFor(`__net.count('/.session/hello') === ${hellos} || ${ONLINE}`);
  await page.evaluate(`__net.release('/.session/op')`);
  assert.equal(await converge(server, [page]), TALK.replace('<p>First slide</p>', '<p>First slide held</p>'));
  assert.equal(await page.evaluate(el(0, 'p') + '.textContent'), 'First slide held');
  clean(page, REFUSED);
});

test('the answer of a poll that the edit command gave before its restart is dropped once the page said hello again', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const { port } = server.edit;
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben', script: NET });
  await converge(server, [a, b]);
  // the answer of the next poll of b is held, which a change of a, or of its caret, answers
  await b.evaluate(`__net.rule('/.session/events', 'late', { times: 1 })`);
  await show(a, 'Two');
  await caretAtEnd(a, el(1, 'p'));
  await type(a, ' by Ann');
  await type(a, ' again');
  await b.waitFor(`__net.held.length === 1`);
  await converge(server, [a]);
  const [hellos, presences] = await b.evaluate(`['/.session/hello', '/.session/presence'].map((part) => __net.count(part, 'POST', 200))`);
  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  await server.start(['--port', String(port)]);
  // the presence of b is refused for its token from before the restart, and b says hello again
  await show(b, 'One');
  await caretAtEnd(b, el(0, 'p'));
  await b.waitFor(`__net.count('/.session/hello', 'POST', 200) === ${hellos + 1} && __net.count('/.session/presence', 'POST', 200) > ${presences} && ${ONLINE} && !${C}.joining`, 20_000);
  assert.equal(await b.evaluate(`${TEXT}.includes('<p>Second slide by Ann again</p>')`), true);
  await b.evaluate(`__net.release('/.session/events')`);
  await a.evaluate(`(${C}.tryNow(), true)`);
  await a.waitFor(ONLINE, 20_000);
  await type(a, ' now');
  // b takes the change of a only by a poll after its hello, or by another hello
  await b.waitFor(`${TEXT}.includes('<p>Second slide by Ann again now</p>')`, 20_000);
  assert.equal(await b.evaluate(`__net.count('/.session/hello', 'POST', 200)`), hellos + 1);
  assert.equal(await converge(server, [a, b]), TALK.replace('<p>Second slide</p>', '<p>Second slide by Ann again now</p>'));
  const restarted = [...REFUSED, /status of 404 .*\/\.session\/presence/, /status of 400 .*\/\.session\/hello/];
  clean(a, restarted);
  clean(b, restarted);
});

const SAVED = `window.__saved = false, window.BeesonEditor.save().then(() => (window.__saved = true)), true`;

test('Save and Saving… wait for the answer and the broadcast of every operation, also of an edit undone while it is in flight', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' saved');
  await page.waitFor(`__net.held.length === 1 && ${STATE} === 'Saving…'`);
  await page.evaluate(SAVED);
  await page.waitFor(`__net.count('/.session/presence', 'POST', 200) > 0`);
  assert.equal(await page.evaluate(`window.__saved`), false);
  await page.evaluate(`__net.release('/.session/op')`);
  await page.waitFor(`window.__saved && ${STATE} === 'Saved to index.html'`);
  const saved = TALK.replace('<p>First slide</p>', '<p>First slide saved</p>');
  assert.equal(await converge(server, [page]), saved);
  // the deck reads as the text of the edit command while the operation of the edit is in flight,
  // hence the operation that undoes it waits for its broadcast, and so does Save
  await type(page, ' undone');
  await page.waitFor(`__net.held.length === 1`);
  for (let i = 0; i < ' undone'.length; i++) await press(page, 'Backspace');
  await page.waitFor(`${TEXT}.includes('<p>First slide saved</p>')`);
  await page.evaluate(SAVED);
  await page.evaluate(`__net.release('/.session/op')`);
  await page.waitFor(`__net.held.length === 1 && __net.count('/.session/op') === 3 && ${STATE} === 'Saving…'`);
  assert.equal(await page.evaluate(`window.__saved`), false);
  await page.evaluate(`__net.clear() && __net.release('/.session/op')`);
  await page.waitFor(`window.__saved`);
  assert.equal(await converge(server, [page]), saved);
  clean(page, REFUSED);
});

const LAST_POLL = `__net.log.filter((l) => l.url.includes('/.session/events')).at(-1)`;

test('an idle page polls from the version of the last answer, hence the edit command holds its poll after a burst of operations', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben', script: NET });
  await converge(server, [a, b]);
  await show(a, 'Two');
  await caretAtEnd(a, el(1, 'p'));
  for (const word of [' one', ' two', ' three']) {
    await type(a, word);
    await a.waitFor(`${C}.acked()`);
  }
  await converge(server, [a, b]);
  const v = (await raw(server.edit.port, 'GET', `${new URL(server.edit.url).pathname}index.html?edit&session`)).headers['x-session-version'];
  assert.match(v, /\.[1-9]\d*$/);
  await b.waitFor(`((l) => l.url.endsWith('since=' + ${JSON.stringify(v)}) && l.status === null)(${LAST_POLL})`);
  clean(a, REFUSED);
  clean(b, REFUSED);
});

test('a second outage starts the reconnect again at 1 s', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE}) && ${C}.retryAt !== null`);
  // each Try now that fails doubles the wait
  for (const delay of [2, 4, 8]) {
    await page.evaluate(`(${C}.tryNow(), true)`);
    await page.waitFor(`${C}.retryAt !== null && ${C}.retryAt - Date.now() > ${(delay - 1) * 1000}`);
  }
  await page.evaluate(`__net.clear() && (${C}.tryNow(), true)`);
  await page.waitFor(ONLINE, 10_000);
  await page.evaluate(`window.__first = null, ${OFFLINE}`);
  await page.waitFor(`${C}.retryAt !== null && !!(window.__first ??= [${C}.retryAt - Date.now(), ${STATE}])`);
  const [delay, state] = await page.evaluate(`window.__first`);
  assert.ok(delay <= 1000, `the first wait of the second outage is ${delay} ms`);
  assert.equal(state, 'Offline. Reconnecting in 1 s');
  clean(page, REFUSED);
});
