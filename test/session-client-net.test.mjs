import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, open, sessionUrl, show, SIGTERM_TELLS_THE_PAGES, STATE, talk, TALK, TEXT } from './helpers/client.mjs';
import { ANSWERS, NET } from './helpers/net.mjs';
import { ROWS } from './helpers/offline.mjs';
import { click, press, type, typeKeys } from './helpers/editor.mjs';
import { raw, until } from './helpers/session.mjs';

const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;
const INERT = `document.querySelector('.reveal .slides').inert`;
const DIALOG = `document.querySelector('dialog.beeson-edit-dialog[open]')`;
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_SOCKET_NOT_CONNECTED/, /status of 502/, /status of 404 .*\/\.session\/events\?/];
const OFFLINE = `__net.clear() && __net.rule('/.session/', 'cut') && __net.cut('/.session/') && __net.drop('/.session/')`;
const paragraph = (text) => /<h2>One<\/h2>\n  <p>([^<]*)<\/p>/.exec(text)?.[1];
const COPIES = `new Promise((done) => {
  const r = indexedDB.open('beeson-session', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('copies', { keyPath: 'id' }).createIndex('key', 'key');
  r.onsuccess = () => {
    const get = r.result.transaction('copies').objectStore('copies').index('key').getAll(location.origin + location.pathname);
    get.onsuccess = () => done(get.result.length);
  };
})`;

async function waiting(t, edit = ' slow', script = '') {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n${script}` });
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
  await until(() => paragraph(server.read()) === shown, 'index.html to hold the letters shown at the unload', 10_000).catch((e) => {
    throw new Error(`${e.message}: ${paragraph(server.read())} where the page showed ${shown}`);
  });
  assert.equal(await page.evaluate(`${el(0, 'p')}.textContent`), shown);
  assert.equal(await page.evaluate(COPIES), 0);
  assert.equal(await page.evaluate(STATE), 'Saved to index.html');
  clean(page);
});

const SLOW_DELETE = `if (!sessionStorage.getItem('__slow')) {
  sessionStorage.setItem('__slow', '1');
  const d = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function (k) {
    const end = Date.now() + 300;
    const spin = () => (Date.now() < end ? (this.count().onsuccess = spin) : d.call(this, k));
    spin();
  };
}`;

test('a page that must load again while offline reconnects first, and loads again once its edit is acknowledged', { timeout: 120_000 }, async (t) => {
  const { server, page } = await waiting(t, ' slow', SLOW_DELETE);
  await page.evaluate(OFFLINE);
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

test('a session that ends while a page waits to load again shows its dialog, with the edit in the copy', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const { server, page } = await waiting(t);
  server.edit.child.kill('SIGTERM');
  await server.edit.exited;
  server.edit = null;
  await page.waitFor(`${DIALOG}?.querySelector('h3').textContent === 'The session has ended'`);
  assert.deepEqual(await page.evaluate(`({ text: ${DIALOG}.querySelector('p').textContent, inert: ${INERT}, loads: Number(sessionStorage.getItem('__loads')) })`), {
    text: 'Your changes up to now are in index.html. Your changes on slide 1 were not saved to index.html.',
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
  await page.waitFor(`__net.count(${JSON.stringify(VERSION)}) === 2`);
  assert.deepEqual(await page.evaluate(`({ client: window.BeesonSession.client(), dialog: ${DIALOG}?.querySelector('h3').textContent })`), { client: null, dialog: NOT_RUNNING });
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

const blocking = (urls) => async (page) => {
  await page.send('Network.enable', {});
  await page.send('Network.setBlockedURLs', { urls });
};
const failure = (page) => page.evaluate(`({ dialogs: document.querySelectorAll('dialog.beeson-edit-dialog[open]').length, text: ${DIALOG}.querySelector('p').textContent, buttons: [...${DIALOG}.querySelectorAll('.row button')].map((b) => b.textContent) })`);
const STARTED = `${DIALOG}?.querySelector('h3').textContent === 'The session could not start'`;

test('a page whose theme/editor-session.js does not load says so once, and Load again joins', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { ready: false, before: blocking(['*/theme/editor-session.js']) });
  await page.waitFor(STARTED);
  assert.deepEqual(await failure(page), { dialogs: 1, text: 'theme/editor-session.js could not be loaded. Load the page again to join the session.', buttons: ['Load again'] });
  await blocking([])(page);
  await page.evaluate(`${button('Load again')}.click()`).catch((e) => {
    if (!/Inspected target navigated or closed/.test(e.message)) throw e;
  });
  await until(async () => (await loads(page).catch(() => 0)) > 1, 'the page to load again');
  await page.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
  clean(page, [/ERR_BLOCKED_BY_CLIENT/]);
});

test('a page whose theme/session.js does not load either, or whose theme/editor-session.js throws, shows one dialog that names the file', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const both = await open(browser, sessionUrl(server.edit), { ready: false, before: blocking(['*/theme/session.js', '*/theme/editor-session.js']) });
  await both.waitFor(STARTED);
  assert.deepEqual(await failure(both), { dialogs: 1, text: 'theme/session.js and theme/editor-session.js could not be loaded. Load the page again to join the session.', buttons: ['Load again'] });
  clean(both, [/ERR_BLOCKED_BY_CLIENT/]);
  const throwing = `Object.defineProperty(window, 'BeesonEditorSession', { configurable: true, get: () => () => { throw new Error('a broken engine'); }, set() {} });`;
  const broken = await open(browser, sessionUrl(server.edit), { ready: false, script: throwing });
  await broken.waitFor(STARTED);
  assert.deepEqual(await failure(broken), { dialogs: 1, text: 'theme/editor-session.js could not be loaded. Load the page again to join the session.', buttons: ['Load again'] });
  assert.ok(broken.errors.some((e) => /a broken engine/.test(e)), `the error of the engine is not reported: ${JSON.stringify(broken.errors)}`);
  clean(broken, [/a broken engine/]);
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
  const listenersOf = async (p) => (await p.send('Runtime.evaluate', { expression: `getEventListeners(window).beforeunload?.length ?? 0`, includeCommandLineAPI: true, returnByValue: true })).result.value;
  const asksOf = (p) => p.evaluate(`(() => { const ev = new Event('beforeunload', { cancelable: true }); dispatchEvent(ev); return ev.defaultPrevented; })()`);

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
  await page.waitFor(`__net.held.length === 1`);
  assert.equal(await asks(), true);
  if (SIGTERM_TELLS_THE_PAGES) {
    server.edit.child.kill('SIGTERM');
    await server.edit.exited;
    server.edit = null;
    await page.waitFor(`${C}.connection === 'ended'`);
    assert.equal(await listeners(), idle);
  }
  clean(page, REFUSED);
});

const ASKED = (part) => `(${ROWS}).then((rows) => ({ asking: ${C}.asking, copied: rows.some((r) => r.mine.includes(${JSON.stringify(part)})) }))`;

async function reload(page) {
  let accepted = false;
  const accept = setInterval(() => page.send('Page.handleJavaScriptDialog', { accept: true }).then(() => (accepted = true), () => {}), 100);
  accept.unref();
  const count = await loads(page);
  await page.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(page).catch(() => 0)) > count, 'the page to load again', 30_000);
  clearInterval(accept);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await page.waitFor(ONLINE);
  return accepted;
}

test('a page asks before it unloads until the copy in this browser holds its newest edit, which a reload right after the edit thus does not lose without a prompt', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'Two');
  await caretAtEnd(page, el(1, 'p'));
  await press(page, 'Enter');
  await typeKeys(page, 'Inserted');
  await page.waitFor(`__net.held.length > 0 && ${TEXT}.includes('Inserted')`);
  const before = await page.evaluate(ASKED('Inserted'));
  assert.ok(before.asking || before.copied, `the page asks while its copy does not hold the edit: ${JSON.stringify(before)}`);
  const accepted = await reload(page);
  const kept = accepted || (await until(() => server.read().includes('Inserted') || null, 'the edit to reach index.html', 10_000).catch(() => false));
  assert.ok(kept,`the edit is in index.html after the reload, or the page asked before it left: ${JSON.stringify(before)}`);
});

test('a page whose copy holds its edit does not ask before a reload, and its edit reaches index.html', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'Two');
  await caretAtEnd(page, el(1, 'p'));
  await press(page, 'Enter');
  await typeKeys(page, 'Inserted');
  await page.waitFor(`(${ASKED('Inserted')}).then((x) => x.copied && !x.asking)`, 10_000);
  assert.equal(await reload(page), false, 'the page did not ask');
  await until(() => server.read().includes('Inserted') || null, 'the edit to reach index.html', 10_000);
});

const LACKS = (part) => `(${ROWS}).then((rows) => rows.length > 0 && !rows.some((r) => r.mine.includes(${JSON.stringify(part)})))`;

test('a page asks before it unloads after an Undo of an edit that the edit command may hold, also once its copy holds the Undo', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'late') && __net.rule('/.session/events', 'cut') && __net.drop('/.session/events')`);
  await page.waitFor(`/^Offline/.test(${STATE})`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Zed');
  await until(() => paragraph(server.read()) === 'First slide Zed' || null, 'the edit in index.html', 15_000);
  await page.waitFor(`(${ASKED(' Zed')}).then((x) => x.copied)`);
  await press(page, 'Mod+Z');
  await page.waitFor(`!${TEXT}.includes('Zed')`);
  const undone = await page.evaluate(ASKED(' Zed'));
  assert.ok(undone.asking || !undone.copied, `the page asks while its copy holds the undone edit: ${JSON.stringify(undone)}`);
  await page.waitFor(LACKS(' Zed'));
  assert.equal(await page.evaluate(`${C}.asking`), true, 'the page asks once its copy holds the Undo');
  assert.equal(await reload(page), true, 'the page asked before it left');
});

const REDO = process.platform === 'darwin' ? 'Mod+Shift+Z' : 'Mod+Y';
const AT_REDO = `(${C}.on('settled', () => ${C}.snapshot().mine.includes(' Zed') && setTimeout(() => (window.__asking ??= ${C}.asking))), true)`;

const SLOW_OPEN = `{
  const opened = IDBFactory.prototype.open;
  let first = true;
  IDBFactory.prototype.open = function (name, ...rest) {
    const r = opened.call(this, name, ...rest);
    if (name !== 'beeson-session' || !first) return r;
    first = false;
    let onsuccess = null;
    Object.defineProperty(r, 'onsuccess', { configurable: true, get: () => onsuccess, set: (fn) => (onsuccess = fn) });
    r.addEventListener('success', (e) => window.setTimeout(() => onsuccess?.call(r, e), 4000));
    return r;
  };
}`;

async function undone(t) {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n${SLOW_OPEN}` });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE})`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Zed');
  await page.waitFor(`(${ASKED(' Zed')}).then((x) => x.copied && !x.asking)`);
  await press(page, 'Mod+Z');
  await page.waitFor(`!${TEXT}.includes('Zed')`);
  await page.waitFor(LACKS(' Zed'));
  return page;
}

test('a page asks before it unloads after a Redo that follows an offline Undo, until its copy holds the Redo', { timeout: 240_000 }, async (t) => {
  const page = await undone(t);
  await page.evaluate(AT_REDO);
  await press(page, REDO);
  await page.waitFor('window.__asking !== undefined');
  assert.equal(await page.evaluate('window.__asking'), true, 'the page asks once it read the Redo');
});

test('a page asks before it unloads after a Redo that follows an offline Undo, once IndexedDB fails', { timeout: 240_000 }, async (t) => {
  const page = await undone(t);
  await page.evaluate(`IDBObjectStore.prototype.put = function () { throw new DOMException('The quota was exceeded.', 'QuotaExceededError'); }; true`);
  await press(page, REDO);
  await page.waitFor(`${C}.snapshot().mine.includes(' Zed') && /cannot be kept/.test(${STATE})`);
  assert.deepEqual(await page.evaluate(ASKED(' Zed')), { asking: true, copied: false });
});

const LATE_WRITES = `{
  const put = IDBObjectStore.prototype.put;
  const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
  const held = [];
  window.__ended = 0;
  window.__release = () => (held.splice(0).forEach((go) => go()), true);
  Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
    configurable: true,
    get() { return complete.get.call(this); },
    set(fn) {
      const write = fn && this.mode === 'readwrite' && this.objectStoreNames.contains('copies');
      const hold = write && (window.__hold || window.__holdAll);
      if (hold) window.__hold = false;
      complete.set.call(this, hold ? (ev) => held.push(() => fn.call(this, ev)) : write ? (ev) => (fn.call(this, ev), window.__ended++) : fn);
    },
  });
  IDBObjectStore.prototype.put = function (...args) {
    const r = put.apply(this, args);
    if (window.__fail) {
      window.__release();
      this.transaction.abort();
    }
    return r;
  };
}`;

test('a page asks before it unloads after an Undo while its copy holds the undone edit, from a write that ended while the next one failed', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n${LATE_WRITES}` });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE})`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Zed');
  await page.waitFor(`(${ASKED(' Zed')}).then((x) => x.copied && !x.asking)`);
  await page.evaluate('window.__hold = true');
  await caretAtEnd(page, el(0, 'h2'));
  await type(page, ' Two');
  await page.waitFor(`(${ASKED(' Two')}).then((x) => x.copied)`);
  await page.evaluate('window.__fail = true');
  await press(page, 'Mod+Z');
  await page.waitFor(`!${TEXT}.includes('One Two') && /cannot be kept/.test(${STATE})`);
  const after = await page.evaluate(ASKED(' Two'));
  assert.ok(after.asking || !after.copied, `the page asks while its copy holds the undone edit: ${JSON.stringify(after)}`);
});

test('a page asks before it unloads after a Redo that follows an offline Undo, also when the write of the edit ends after the write of the Undo', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n${LATE_WRITES}` });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE})`);
  await page.evaluate('window.__hold = true');
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Zed');
  await page.waitFor(`(${ASKED(' Zed')}).then((x) => x.copied)`);
  const ended = await page.evaluate('window.__ended');
  await press(page, 'Mod+Z');
  await page.waitFor(`window.__ended > ${ended} && (${LACKS(' Zed')})`);
  await page.evaluate('window.__release()');
  await page.evaluate(AT_REDO);
  await press(page, REDO);
  await page.waitFor('window.__asking !== undefined');
  assert.equal(await page.evaluate('window.__asking'), true, 'the page asks once it read the Redo');
});

test('a page asks before it unloads after an Undo and a Redo of an acknowledged edit, also when its copy with the edit was written after the acknowledgment', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n${LATE_WRITES}` });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold') && (window.__hold = true)`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Zed');
  await page.waitFor(`(${ASKED(' Zed')}).then((x) => x.copied)`);
  await page.evaluate(`__net.clear() && __net.release('/.session/op')`);
  await page.waitFor(`${C}.acked() && (${ROWS}).then((rows) => rows.length === 0)`);
  await page.evaluate(`__net.rule('/.session/op', 'hold') && window.__release() && (window.__hold = true)`);
  await press(page, 'Mod+Z');
  await page.waitFor(`!${C}.snapshot().mine.includes('Zed')`);
  await page.evaluate(AT_REDO);
  await press(page, REDO);
  await page.waitFor('window.__asking !== undefined');
  assert.equal(await page.evaluate('window.__asking'), true, 'the page asks once it read the Redo');
});

test('an edit of another person does not make a page ask before it unloads while its copy holds the edit of the page', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Mine');
  await page.waitFor(`(${ASKED(' Mine')}).then((x) => x.copied && !x.asking)`);
  await page.evaluate(`window.__asked = []; window.__clock = setInterval(() => ${C}.asking && window.__asked.push(Math.round(performance.now())), 10); true`);
  writeFileSync(server.file, server.read().replace('<p>Second slide</p>', '<p>Second slide Remote</p>'));
  await page.waitFor(`${TEXT}.includes('Remote')`);
  await page.waitFor(`(${ASKED('Remote')}).then((x) => x.copied)`);
  assert.deepEqual(await page.evaluate('clearInterval(window.__clock), window.__asked'), []);
});

test('an edit of another person does not stop a page from asking before it unloads while its copy lacks the newest edit of the page', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Mine');
  await page.waitFor(`(${ASKED(' Mine')}).then((x) => x.copied && !x.asking)`);
  await page.evaluate(`(() => {
    const fetched = window.fetch;
    const released = new Promise((done) => (window.__again = () => (done(), true)));
    window.fetch = function (input, init) {
      const answer = fetched.call(this, input, init);
      if (!String(input instanceof Request ? input.url : input).includes('/.session/events')) return answer;
      return answer.then(async (r) => {
        if (!(await r.clone().text()).includes('Again')) return r;
        window.__held = true;
        await released;
        return r;
      });
    };
    return true;
  })()`);
  writeFileSync(server.file, server.read().replace('<p>Second slide</p>', '<p>Second slide Remote</p>'));
  await page.waitFor(`${TEXT}.includes('Remote')`);
  await page.waitFor(`(${ASKED('Remote')}).then((x) => x.copied)`);
  writeFileSync(server.file, server.read().replace('<p>Second slide Remote</p>', '<p>Second slide Remote Again</p>'));
  await page.waitFor('window.__held === true');
  await page.evaluate(`IDBObjectStore.prototype.put = function () { throw new DOMException('The quota was exceeded.', 'QuotaExceededError'); }; true`);
  await type(page, ' More');
  await page.evaluate(`(${C}.on('settled', () => ${C}.snapshot().mine.includes('Again') && setTimeout(() => (window.__asking ??= ${C}.asking))), window.__again())`);
  await page.waitFor(`window.__asking !== undefined && ${TEXT}.includes('Again')`);
  assert.deepEqual(await page.evaluate(`(${ASKED(' More')}).then((x) => ({ ...x, asking: window.__asking }))`), { asking: true, copied: false });
});

test('an edit of another person does not make a page that waits to load again ask before it unloads while its copy holds the edit of the page', { timeout: 240_000 }, async (t) => {
  const { server, page } = await waiting(t);
  await page.waitFor(`(${ASKED(' slow')}).then((x) => x.copied && !x.asking)`);
  await page.evaluate(`window.__asked = []; window.__clock = setInterval(() => ${C}.asking && window.__asked.push(Math.round(performance.now())), 10); true`);
  writeFileSync(server.file, server.read().replace('<p>Second slide</p>', '<p>Second slide Remote</p>'));
  await page.waitFor(`${C}.snapshot().mine.includes('Remote')`);
  await page.waitFor(`(${ASKED('Remote')}).then((x) => x.copied)`);
  assert.deepEqual(await page.evaluate('clearInterval(window.__clock), window.__asked'), []);
});

test('a page asks before it unloads from the moment that it is told of an edit, also while its copy holds an earlier edit', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Mine');
  await page.waitFor(`(${ASKED(' Mine')}).then((x) => x.copied && !x.asking)`);
  await page.evaluate(`window.__told = new Promise((done) => { const off = ${C}.port.onChange(() => { off(); done({ asking: ${C}.asking, read: ${C}.snapshot().mine.includes('Q0q') }); }); }); true`);
  await type(page, ' Q0q');
  assert.deepEqual(await page.evaluate('window.__told'), { asking: true, read: false });
});

test('a page that waits for the answer of its hello asks before it unloads from the moment of an edit until its copy holds the edit, and not after', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n__net.rule('/.session/', 'cut');`, wait: false });
  await page.waitFor(`window.BeesonSession?.client?.()?.connection === 'offline'`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Early');
  await page.waitFor(`(${ASKED(' Early')}).then((x) => x.copied && !x.asking)`);
  await page.evaluate(`window.__told = new Promise((done) => { const off = ${C}.port.onChange(() => { off(); done(${C}.asking); }); }); true`);
  await type(page, ' More');
  assert.equal(await page.evaluate('window.__told'), true, 'the page asks from the moment of the edit');
  await page.waitFor(`(${ASKED(' More')}).then((x) => x.copied && !x.asking)`);
});

const SLOW_RESTORE = `{
  window.__holdRestore = sessionStorage.getItem('__loads') === '1';
  const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
  let held = null;
  window.__restored = () => (held?.(), true);
  Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
    configurable: true,
    get() { return complete.get.call(this); },
    set(fn) {
      const hold = fn && window.__holdRestore && this.objectStoreNames.contains('copies');
      if (hold) window.__holdRestore = !(window.__restoreHeld = true);
      complete.set.call(this, hold ? (ev) => (held = () => fn.call(this, ev)) : fn);
    },
  });
}`;
const TOLD = `window.__told = new Promise((done) => { const off = ${C}.port.onChange(() => { off(); done({ asking: ${C}.asking, hellos: __net.count('/.session/hello') }); }); }); true`;

test('a page asks before it unloads for an edit typed while it reads its copies, until its copy holds the edit', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n__net.rule('/.session/', 'cut');\n${SLOW_RESTORE}`, wait: false });
  await page.waitFor('window.__restoreHeld === true');
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await page.evaluate(TOLD);
  await type(page, ' Early');
  assert.deepEqual(await page.evaluate('window.__told'), { asking: true, hellos: 0 });
  await page.evaluate('window.__restored()');
  await page.waitFor(`(${ASKED(' Early')}).then((x) => x.copied && !x.asking)`);
});

test('a page asks before it unloads for an edit typed while IndexedDB does not answer, also once its copy cannot be kept', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const silent = `{
    const query = LockManager.prototype.query;
    LockManager.prototype.query = function () { return new Promise((done) => window.setTimeout(done, 2000)).then(() => query.call(this)); };
    const opened = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...rest) { return name === 'beeson-session' ? {} : opened.call(this, name, ...rest); };
    const later = window.setTimeout;
    window.setTimeout = function (fn, ...rest) {
      if (!String(fn).includes('IndexedDB did not answer')) return later.call(this, fn, ...rest);
      window.__openWait = () => (fn(), true);
      return 0;
    };
  }`;
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n__net.rule('/.session/', 'cut');\n${silent}`, wait: false });
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await page.evaluate(TOLD);
  await type(page, ' Early');
  assert.deepEqual(await page.evaluate('window.__told'), { asking: true, hellos: 0 });
  await page.waitFor(`typeof window.__openWait === 'function'`);
  await page.evaluate('window.__openWait()');
  await page.waitFor(`/cannot be kept/.test(${STATE}) && ${C}.connection === 'offline'`);
  assert.equal(await page.evaluate(`${C}.asking`), true, 'the page asks while its copy cannot be kept');
});

const HELD = `{
  const fetched = window.fetch;
  let again = () => {};
  const events = new Promise((done) => (again = done));
  const ops = [];
  window.__opsHeld = 0;
  window.__again = () => (again(), true);
  window.__opGo = () => (ops.splice(0).forEach((go) => go()), true);
  window.fetch = function (input, init) {
    const url = String(input instanceof Request ? input.url : input);
    const answer = fetched.call(this, input, init);
    if (url.includes('/.session/op')) {
      if (!window.__holdOp) return answer;
      return answer.then((r) => new Promise((done) => (window.__opsHeld++, ops.push(() => done(r)))));
    }
    if (!url.includes('/.session/events')) return answer;
    return answer.then(async (r) => {
      if (!window.__holdText || !(await r.clone().text()).includes(window.__holdText)) return r;
      window.__eventsHeld = true;
      await events;
      return r;
    });
  };
}`;

test('a page asks before it unloads after a Redo of an Undo that the edit command applied, until its copy holds the Redo', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${LATE_WRITES}\n${HELD}` });
  await converge(server, [page]);
  const n = Number((await page.evaluate(`${C}.snapshot().v`)).split('.')[1]);
  await page.evaluate(`window.__holdText = 'Zed'; window.__holdOp = true; true`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Zed');
  await page.waitFor(`window.__opsHeld === 1 && window.__eventsHeld === true && (${ASKED(' Zed')}).then((x) => x.copied && !x.asking)`);
  await page.evaluate('window.__holdAll = true');
  await press(page, 'Mod+Z');
  await page.waitFor(`!${C}.snapshot().mine.includes('Zed')`);
  await page.evaluate('window.__again(), window.__opGo()');
  await page.waitFor(`window.__opsHeld === 2 && ${C}.snapshot().v.endsWith('.${n + 2}')`);
  await page.evaluate(AT_REDO);
  await press(page, REDO);
  await page.waitFor('window.__asking !== undefined');
  assert.equal(await page.evaluate('window.__asking'), true, 'the page asks while its copy holds the edit at the version before the Undo');
  await page.evaluate('(window.__holdAll = false, window.__release())');
  await page.waitFor(`(${ASKED(' Zed')}).then((x) => x.copied && !x.asking)`);
});

test('a page asks before it unloads once its copy is deleted under it and cannot be written again, until its edit is acknowledged', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE})`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Zed');
  await page.waitFor(`(${ASKED(' Zed')}).then((x) => x.copied && !x.asking)`);
  await page.send('Storage.clearDataForOrigin', { origin: await page.evaluate('location.origin'), storageTypes: 'indexeddb' });
  await page.evaluate(`IDBObjectStore.prototype.put = function () { throw new DOMException('The quota was exceeded.', 'QuotaExceededError'); }; true`);
  await page.waitFor(`/cannot be kept/.test(${STATE})`, 30_000);
  assert.deepEqual(await page.evaluate(ASKED(' Zed')), { asking: true, copied: false });
  await page.evaluate(`__net.clear() && (${C}.tryNow(), true)`);
  await page.waitFor(`${C}.acked() && !${C}.asking`);
  await until(() => paragraph(server.read()) === 'First slide Zed' || null, 'the edit in index.html', 15_000);
});

test('a page whose copy is deleted with the data of the site writes its copy again, and then does not ask before it unloads', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE})`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Zed');
  await page.waitFor(`(${ASKED(' Zed')}).then((x) => x.copied && !x.asking)`);
  await page.send('Storage.clearDataForOrigin', { origin: await page.evaluate('location.origin'), storageTypes: 'indexeddb' });
  await type(page, ' More');
  await page.waitFor(`(${ROWS}).then((rows) => !!rows && rows.some((r) => r.mine.includes(' More')) && !${C}.asking)`, 30_000);
});

const PUTS = `{
  const put = IDBObjectStore.prototype.put;
  const now = Date.now;
  const every = window.setInterval;
  window.__puts = 0;
  window.__ticks = 0;
  window.__skew = 0;
  window.setInterval = (fn, ms, ...rest) => every(ms === 1000 ? () => { window.__ticks += 1; fn(); } : fn, ms, ...rest);
  Date.now = () => now() + window.__skew;
  IDBObjectStore.prototype.put = function (...args) {
    window.__puts += 1;
    return put.apply(this, args);
  };
}`;

test('a page offline whose copy does not change does not write it again at the heartbeat', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n${PUTS}` });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE})`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Zed');
  await page.waitFor(`(${ASKED(' Zed')}).then((x) => x.copied && !x.asking)`);
  const puts = await page.evaluate('window.__puts');
  for (let i = 0; i < 3; i++) {
    const ticks = await page.evaluate('(window.__skew += 11_000, window.__ticks)');
    await page.waitFor(`window.__ticks >= ${ticks + 2}`);
  }
  assert.equal(await page.evaluate('window.__puts') - puts, 0, 'the copy is not written again');
  assert.deepEqual(await page.evaluate(ASKED(' Zed')), { asking: false, copied: true });
});

const FAIL_ONCE = `{
  const put = IDBObjectStore.prototype.put;
  const now = Date.now;
  Date.now = () => Math.min(now(), window.__stop ?? Infinity);
  IDBObjectStore.prototype.put = function (...args) {
    if (!window.__failPut) return put.apply(this, args);
    window.__failPut = false;
    window.__stop = now() + 5000;
    throw new DOMException('The quota was exceeded.', 'QuotaExceededError');
  };
}`;

test('a page whose write of its copy failed once writes it again before the heartbeat, and then does not ask before it unloads', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: `${NET}\n${FAIL_ONCE}` });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'hold')`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' Mine');
  await page.waitFor(`(${ASKED(' Mine')}).then((x) => x.copied && !x.asking)`);
  await page.evaluate('(window.__failPut = true)');
  await type(page, ' More');
  await page.waitFor(`window.__stop !== undefined && ${C}.asking`);
  await page.waitFor(`(${ASKED(' More')}).then((x) => x.copied && !x.asking)`);
});

const UNLOAD = `{
  const add = window.addEventListener;
  const remove = window.removeEventListener;
  const added = new Map();
  window.__unload = [];
  window.addEventListener = function (type, fn, options) {
    if (type === 'beforeunload') added.set(fn, performance.now());
    return add.call(this, type, fn, options);
  };
  window.removeEventListener = function (type, fn, options) {
    if (type === 'beforeunload' && added.has(fn)) {
      window.__unload.push(performance.now() - added.get(fn));
      added.delete(fn);
    }
    return remove.call(this, type, fn, options);
  };
}`;

test('a page whose edits are acknowledged at once does not ask before it unloads once its edit is acknowledged', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: UNLOAD });
  await converge(server, [page]);
  const listenersOf = async () => (await page.send('Runtime.evaluate', { expression: `getEventListeners(window).beforeunload?.length ?? 0`, includeCommandLineAPI: true, returnByValue: true })).result.value;
  const idle = await listenersOf();
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, 'x');
  await converge(server, [page]);
  assert.deepEqual({ asking: await page.evaluate(`${C}.asking`), listeners: await listenersOf() }, { asking: false, listeners: idle });
  t.diagnostic(`the listener of beforeunload was on the page for ${JSON.stringify(await page.evaluate('window.__unload.map(Math.round)'))} ms`);
  assert.equal(await reload(page), false, 'the page did not ask');
});

test('the operations of the answer that ends the session are taken before its dialog, which then holds every acknowledged edit', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben', script: NET });
  await converge(server, [ann, ben]);
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
  server.edit.child.kill('SIGTERM');
  await ann.waitFor(`${C}.connection === 'ended'`);
  await ben.evaluate(`__net.clear() && __net.release('/.session/events')`);
  await front(ben);
  await ben.waitFor(`${DIALOG}?.querySelector('h3').textContent === 'The session has ended'`);
    assert.equal(await server.edit.exited, 0);
  server.edit = null;
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
  const from = await page.evaluate(`(__net.rule('/.session/events', 'answer', { status: 404, body: '{"error":"the page is not in the session"}' }), Date.now())`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
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
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ann', script: NET, wait: false });
  await b.waitFor(`${DIALOG}?.querySelector('h3')?.textContent.includes('has joined this deck before')`);
  await b.evaluate(`${button('Yes, continue')}.click()`);
  await b.waitFor(ONLINE);
  assert.equal(await b.evaluate(`${C}.person`), await a.evaluate(`${C}.person`));
  await converge(server, [a, b]);
  const own = (page) => page.evaluate(`({ name: ${C}.name, known: ${C}.known.find((p) => p.person === ${C}.person).name, stored: localStorage.getItem('beeson-session-name') })`);
  const named = (name) => `${C}.name === '${name}' && localStorage.getItem('beeson-session-name') === '${name}'`;
  assert.equal(await a.evaluate(`window.BeesonSession.rename(${C}, 'Ann Smith')`), 'renamed');
  await b.waitFor(named('Ann Smith'));
  const hellos = await b.evaluate(`(__net.rule('/.session/events', 'answer', { status: 404, body: '{"error":"the page is not in the session"}', times: 1 }), __net.rule('/.session/hello', 'hold', { times: 1 }), __net.count('/.session/hello'))`);
  await front(a);
  await show(a, 'One');
  await caretAtEnd(a, el(0, 'p'));
  await type(a, ' x');
  await b.waitFor(`__net.held.some((h) => h.url.includes('/.session/hello'))`);
  assert.equal(await a.evaluate(`window.BeesonSession.rename(${C}, 'Ann Jones')`), 'renamed');
  await b.evaluate(`__net.release('/.session/hello')`);
  await b.waitFor(`__net.count('/.session/hello') === ${hellos + 1} && ${ONLINE} && !${C}.joining`);
  assert.deepEqual(await own(b), { name: 'Ann Jones', known: 'Ann Jones', stored: 'Ann Jones' });
  await converge(server, [a, b]);
  assert.deepEqual(await own(a), { name: 'Ann Jones', known: 'Ann Jones', stored: 'Ann Jones' });
  clean(a);
  clean(b);
});

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
  for (const page of [a, b]) assert.deepEqual(await page.evaluate(`[${el(0, 'p')}.textContent, ${el(1, 'p')}.textContent]`), ['First slide held', 'Second slide by Ann']);
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
  await page.evaluate(`__net.rule('/.session/hello', 'edit', { edit: ({ v, ...rest }) => rest, times: 1 }) && __net.rule('/.session/events', 'cut') && __net.drop('/.session/events')`);
  await page.waitFor(`/^Offline/.test(${STATE}) && ${C}.retryAt !== null`);
  const HELLOS = `[__net.count('/.session/hello'), __net.count('/.session/hello', 'POST', 200)]`;
  const [sent, answered] = await page.evaluate(HELLOS);
  await page.evaluate(`${C}.tryNow(), new Promise((done) => setTimeout(done))`);
  assert.equal((await page.evaluate(HELLOS))[0], sent, 'a hello is sent while the operation is unanswered');
  await page.evaluate(`__net.release('/.session/op')`);
  await page.waitFor(`__net.count('/.session/hello', 'POST', 200) > ${answered}`);
  await page.evaluate(`__net.clear()`);
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
  await show(b, 'One');
  await caretAtEnd(b, el(0, 'p'));
  await b.waitFor(`__net.count('/.session/hello', 'POST', 200) === ${hellos + 1} && __net.count('/.session/presence', 'POST', 200) > ${presences} && ${ONLINE} && !${C}.joining`, 20_000);
  assert.equal(await b.evaluate(`${TEXT}.includes('<p>Second slide by Ann again</p>')`), true);
  await b.evaluate(`__net.release('/.session/events')`);
  await a.evaluate(`(${C}.tryNow(), true)`);
  await a.waitFor(ONLINE, 20_000);
  await type(a, ' now');
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
  clean(page);
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
  clean(a);
  clean(b);
});

test('a seventh page of a session in one browser comes online, and an edit of the first page reaches all seven, while the polls of the others are held', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: { SLIDES_POLL_HOLD_MS: '40000' } });
  const pages = [];
  for (let i = 0; i < 6; i++) pages.push(await open(browser, sessionUrl(server.edit), { name: `P${i}` }));
  await converge(server, pages);
  const start = Date.now();
  const seventh = await open(browser, sessionUrl(server.edit), { name: 'Seventh', ready: false });
  await seventh.waitFor(ONLINE, Math.max(0, 20_000 - (Date.now() - start)));
  pages.push(seventh);
  await show(pages[0], 'One');
  await caretAtEnd(pages[0], el(0, 'p'));
  await type(pages[0], ' seven');
  await converge(server, pages);
  assert.match(paragraph(server.read()), / seven$/);
  for (const page of pages) clean(page);
});

test('a second outage starts the reconnect again at 1 s', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(OFFLINE);
  await page.waitFor(`/^Offline/.test(${STATE}) && ${C}.retryAt !== null`);
  for (const delay of [2, 4, 8]) {
    await page.evaluate(`(${C}.tryNow(), true)`);
    await page.waitFor(`${C}.retryAt !== null && ${C}.retryAt - Date.now() > ${(delay - 1) * 1000}`);
  }
  await page.evaluate(`__net.clear() && (${C}.tryNow(), true)`);
  await page.waitFor(ONLINE, 10_000);
  await page.evaluate(`window.__first = null, ${C}.on('state', () => (window.__first ??= ${C}.retryAt === null ? null : [${C}.retryAt - Date.now(), ${STATE}])), ${OFFLINE}`);
  await page.waitFor(`!!window.__first`);
  const [delay, state] = await page.evaluate(`window.__first`);
  assert.ok(delay <= 1000, `the first wait of the second outage is ${delay} ms`);
  assert.equal(state, 'Offline. Reconnecting in 1 s');
  clean(page, REFUSED);
});

test('an operation answered 503 is sent again at the reconnect, and reaches index.html without blocking the page', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: NET });
  await converge(server, [page]);
  await page.evaluate(`__net.rule('/.session/op', 'answer', { status: 503, body: '{"error":"the edit command is stopping"}', times: 2 })`);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' again');
  for (const n of [1, 2]) {
    await page.waitFor(`__net.count('/.session/op') >= ${n} && (${C}.retryAt !== null || ${C}.blocked)`);
    assert.equal(await page.evaluate(`${C}.blocked`), false);
    await page.evaluate(`(${C}.tryNow(), true)`);
  }
  assert.equal(await converge(server, [page]), TALK.replace('<p>First slide</p>', '<p>First slide again</p>'));
  assert.equal(await page.evaluate(`${C}.blocked`), false);
  clean(page);
});

test('a hello that the edit command refuses opens the join dialog with its message, and the name typed then joins', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const refuse = `__net.rule('/.session/hello', 'answer', { status: 400, body: '{"error":"the name is empty"}', times: 1 });`;
  const page = await open(browser, sessionUrl(server.edit), { name: 'Ann', wait: false, script: `${NET}\n${refuse}` });
  await page.waitFor(`document.querySelector('dialog.beeson-session-join')?.open`);
  assert.equal(await page.evaluate(`document.querySelector('dialog.beeson-session-join .error').textContent`), 'the name is empty');
  const field = `document.querySelector('dialog.beeson-session-join input')`;
  assert.equal(await page.evaluate(`${field}.value`), 'Ann');
  await page.evaluate(`(${field}.value = '', ${field}.dispatchEvent(new Event('input')), ${field}.focus(), true)`);
  await type(page, 'Ada');
  await press(page, 'Enter');
  await page.waitFor(ONLINE);
  assert.deepEqual(await page.evaluate(`[${C}.name, !!document.querySelector('dialog.beeson-session-join[open]'), __net.count('/.session/hello')]`), ['Ada', false, 2]);
  await converge(server, [page]);
  clean(page);
});

test('a page that does not read as its text after an apply loads again, and sends nothing of the deck it read', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const b = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [a, b]);
  await b.evaluate(`(${el(1, 'p')}.firstChild.data = 'Broken', true)`);
  await show(a, 'One');
  await caretAtEnd(a, el(0, 'p'));
  await type(a, ' by Ann');
  await until(async () => (await loads(b).catch(() => 0)) === 2, 'page b to load again');
  await b.waitFor(`document.readyState === 'complete' && ${ONLINE}`);
  const text = await converge(server, [a, b]);
  assert.equal(text, TALK.replace('<p>First slide</p>', '<p>First slide by Ann</p>'));
  assert.deepEqual(await b.evaluate(`[${el(0, 'p')}.textContent, ${el(1, 'p')}.textContent]`), ['First slide by Ann', 'Second slide']);
  assert.equal(await loads(b), 2);
  clean(a);
  clean(b);
});

test('the answer of a poll that arrives after Leave Session is not taken', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben', script: `${NET}\n${ANSWERS}` });
  await converge(server, [ann, ben]);
  await ben.evaluate(`__net.rule('/.session/events', 'late')`);
  await show(ann, 'Two');
  await caretAtEnd(ann, el(1, 'p'));
  await type(ann, ' first');
  await until(() => server.read().includes('<p>Second slide first</p>'), 'the edit of Ann to reach index.html');
  await type(ann, ' second');
  await ben.waitFor(`__net.held.length === 1`);
  await ben.evaluate(`(() => {
    const client = ${C};
    client.leave();
    window.__events = [];
    for (const name of ['people', 'presence', 'known', 'ops']) client.on(name, () => window.__events.push(name));
    window.__before = window.__answers;
    return __net.release('/.session/events');
  })()`);
  await ben.waitFor(`window.__answers > window.__before`);
  assert.deepEqual(await ben.evaluate(`window.__events`), [], 'the client took an answer after Leave Session');
  clean(ann);
  clean(ben);
});
