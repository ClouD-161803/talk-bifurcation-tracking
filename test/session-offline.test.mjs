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

test('two tabs of one browser keep their copies apart, and a new page takes over only the copy of a tab that is gone', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  const b = await tab(browser, url);
  await converge(server, [a, b]);

  await goOffline(a);
  await goOffline(b);
  await edit(a, 0, 'p', ' in tab A');
  await edit(b, 1, 'p', ' in tab B');
  const idA = await copied(a, 'First slide in tab A');
  const idB = await copied(b, 'Second slide in tab B');
  const kept = await rows(a);
  assert.equal(kept.length, 2);
  assert.ok(!kept.find((r) => r.id === idA).mine.includes('in tab B'), 'the copy of tab A holds the edit of tab B');
  assert.ok(!kept.find((r) => r.id === idB).mine.includes('in tab A'), 'the copy of tab B holds the edit of tab A');

  // both tabs are open, hence a new page sends neither copy
  const c = await tab(browser, url);
  assert.equal(await converge(server, [c]), TALK);
  assert.deepEqual((await rows(c)).map((r) => r.id).sort(), [idA, idB].sort());

  await a.close();
  await released(c, idA);
  const d = await tab(browser, url);
  assert.equal(await converge(server, [c, d]), TALK.replace('<p>First slide</p>', '<p>First slide in tab A</p>'));
  await d.waitFor(`(${ROWS}).then((r) => r.length === 1 && r[0].id === ${JSON.stringify(idB)})`);

  await goOnline(b);
  const text = await converge(server, [b, c, d]);
  assert.equal(text, TALK.replace('<p>First slide</p>', '<p>First slide in tab A</p>').replace('<p>Second slide</p>', '<p>Second slide in tab B</p>'));
  assert.equal(await b.evaluate(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`), false);
  assert.deepEqual(await rows(d), []);
  for (const page of [b, c, d]) clean(page);
});

test('a page without IndexedDB edits offline, says that its changes cannot be kept, and sends them once online', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  // as in a private window of a browser that refuses IndexedDB
  const script = `IDBFactory.prototype.open = function () { throw new DOMException('The operation is insecure.', 'SecurityError'); };`;
  const page = await tab(browser, sessionUrl(server.edit), { script });
  await converge(server, [page]);
  await goOffline(page);
  await edit(page, 0, 'p', ' kept in memory');
  await page.waitFor(`${STATE} === 'Offline. Keep this page open, since your changes cannot be kept in this browser'`);
  assert.equal(await page.evaluate(ACTION), 'Try now');
  await goOnline(page);
  assert.equal(await converge(server, [page]), TALK.replace('<p>First slide</p>', '<p>First slide kept in memory</p>'));
  assert.equal(await page.evaluate(STATE), 'Saved to index.html');
  clean(page);
});

// Ann edits two texts offline, and Ben replaces the same word of one of them and changes another
// text meanwhile. Ann comes back after more than 5 s, and the dialog of the conflicts lists the text
// that both changed
async function conflicted(t, browser) {
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const ann = await tab(browser, url);
  const ben = await open(browser, url, { name: 'Ben' });
  await converge(server, [ann, ben]);
  await goOffline(ann);
  await show(ann, 'One');
  await select(ann, el(0, 'p'), 0, 5);
  await type(ann, 'Opening');
  await edit(ann, 1, 'li', ' by Ann');
  await show(ben, 'One');
  await select(ben, el(0, 'p'), 0, 5);
  await type(ben, 'Initial');
  await edit(ben, 1, 'p', ' by Ben');
  await until(() => server.read().includes('Second slide by Ben'), 'the edits of Ben to reach the file');
  await ann.waitFor(`Date.now() - window.__offAt > 5500`, 15_000);
  await goOnline(ann);
  await front(ann);
  await ann.waitFor(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`);
  assert.deepEqual(await ann.evaluate(CONFLICTS), {
    title: 'Others changed texts that you edited offline',
    items: ['Slide 1: “Opening slide”'],
    buttons: ['Download my version', 'Keep theirs', 'Keep mine'],
  });
  // the deck keeps the version of Ann while the dialog is open, also after Esc
  await ann.evaluate(`document.querySelector('dialog.beeson-session-conflicts[open]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  assert.ok(await ann.evaluate(`!!document.querySelector('dialog.beeson-session-conflicts[open]') && ${TEXT}.includes('<p>Opening slide</p>')`));
  return { server, ann, ben };
}

const BOTH = TALK.replace('<p>Second slide</p>', '<p>Second slide by Ben</p>').replace('<li>Alpha</li>', '<li>Alpha by Ann</li>');

test('the dialog of the conflicts at a reconnect keeps either version, and every edit that does not conflict', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());

  await t.test('Keep mine sends the version of Ann', async (t) => {
    const { server, ann, ben } = await conflicted(t, browser);
    await press(ann, 'Keep mine');
    assert.equal(await converge(server, [ann, ben]), BOTH.replace('<p>First slide</p>', '<p>Opening slide</p>'));
    clean(ann);
    clean(ben);
    await ann.close();
    await ben.close();
  });

  await t.test('Keep theirs keeps the version of Ben', async (t) => {
    const { server, ann, ben } = await conflicted(t, browser);
    await press(ann, 'Keep theirs');
    assert.equal(await converge(server, [ann, ben]), BOTH.replace('<p>First slide</p>', '<p>Initial slide</p>'));
    clean(ann);
    clean(ben);
    await ann.close();
    await ben.close();
  });

  await t.test('Download my version downloads the deck of Ann and keeps the dialog open', async (t) => {
    const { server, ann, ben } = await conflicted(t, browser);
    const before = await ann.evaluate(TEXT);
    await press(ann, 'Download my version');
    const [file] = await downloads(ann);
    assert.equal(file.name, 'index.html');
    assert.equal(file.text, before);
    assert.ok(file.text.includes('<p>Opening slide</p>') && file.text.includes('<li>Alpha by Ann</li>'));
    assert.ok(await ann.evaluate(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`));
    await press(ann, 'Keep theirs');
    assert.equal(await converge(server, [ann, ben]), BOTH.replace('<p>First slide</p>', '<p>Initial slide</p>'));
    clean(ann);
    clean(ben);
    await ann.close();
    await ben.close();
  });
});

// an image of the page whose src is path, loaded, or null
const SHOWN = (path) => `[...document.querySelectorAll('.reveal .slides img')].some((i) => i.getAttribute('src') === ${JSON.stringify(path)} && i.complete && i.naturalWidth > 0)`;

test('a picture dropped by one page is uploaded into media/ before the operation that names it, and the other page shows it', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const ann = await tab(browser, url);
  const ben = await open(browser, url, { name: 'Ben' });
  await converge(server, [ann, ben]);
  const bytes = readFileSync(IMAGE);

  await t.test('the picture is in media/ and on the page of Ben', async () => {
    await show(ann, 'One');
    await dropFiles(ann, [IMAGE]);
    const text = await converge(server, [ann, ben]);
    assert.match(text, /src="media\/figure-light\.png"/);
    assert.ok(readFileSync(join(server.talk, 'media/figure-light.png')).equals(bytes));
    await front(ben);
    await show(ben, 'One');
    await ben.waitFor(SHOWN('media/figure-light.png'));
  });

  await t.test('a name that is taken in media/ is written into the deck as the name that the edit command gives', async () => {
    // a file of the same name put into media/ by hand, which the deck does not name
    mkdirSync(join(server.talk, 'media'), { recursive: true });
    writeFileSync(join(server.talk, 'media/figure-light-2.png'), 'another file');
    await show(ann, 'Two');
    await dropFiles(ann, [IMAGE]);
    const text = await converge(server, [ann, ben]);
    // the editor names the new file figure-light-2.png, since the deck names figure-light.png
    assert.match(text, /src="media\/figure-light-2-2\.png"/);
    assert.doesNotMatch(text, /media\/figure-light-2\.png/);
    assert.equal(readFileSync(join(server.talk, 'media/figure-light-2.png'), 'utf8'), 'another file');
    assert.ok(readFileSync(join(server.talk, 'media/figure-light-2-2.png')).equals(bytes));
    await front(ben);
    await show(ben, 'Two');
    await ben.waitFor(SHOWN('media/figure-light-2-2.png'));
  });

  await t.test('a failed upload keeps the operation, and Try again sends it', async () => {
    const before = server.read();
    await front(ann);
    await ann.evaluate('window.__failMedia = true');
    await show(ann, 'One');
    await dropFiles(ann, [IMAGE]);
    await ann.waitFor(`${STATE} === 'A picture could not be sent. Try again'`);
    assert.equal(await ann.evaluate(ACTION), 'Try again');
    assert.equal(server.read(), before);
    await ann.evaluate('window.__failMedia = false');
    await click(ann, '.beeson-session-action');
    const text = await converge(server, [ann, ben]);
    assert.equal(text.match(/<img /g)?.length, 3);
    assert.equal(await ann.evaluate(STATE), 'Saved to index.html');
  });

  await t.test('a picture over the limit is refused at the drop, with the limit in the message', async () => {
    const big = join(server.root, 'big.png');
    writeFileSync(big, '');
    truncateSync(big, 65 * 1024 * 1024);
    const before = await ann.evaluate(TEXT);
    await front(ann);
    await dropFiles(ann, [big]);
    await ann.waitFor(`/^big\\.png is larger than 64 MB/.test(${C}.app.note?.text ?? '')`);
    assert.equal(await ann.evaluate(TEXT), before);
    assert.equal(await converge(server, [ann, ben]), before);
  });

  clean(ann);
  clean(ben);
});

// a page of the origin of the edit command without the editor, which reads the locks of a page
// after it is closed and plants copies in IndexedDB
async function probeOf(browser, server) {
  const probe = await browser.newPage({ width: 640, height: 480 });
  await probe.goto(`${server.edit.url}index.html`);
  return probe;
}

test('the save state says that an edit made offline is kept only once a copy holds it, and a crash of the page then keeps it', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  const probe = await probeOf(browser, server);
  await converge(server, [a]);
  await goOffline(a);
  await edit(a, 0, 'p', ' before a crash');
  await a.waitFor(`${STATE} === 'Offline. Changes on slide 1 are kept in this browser'`);
  const kept = await rows(a);
  assert.equal(kept.length, 1, 'a copy is in IndexedDB once the save state says that the changes are kept');
  assert.ok(kept[0].mine.includes('<p>First slide before a crash</p>'));
  // a crash runs no listener of pagehide
  a.send('Page.crash').catch(() => {});
  await released(probe, kept[0].id);
  const again = await tab(browser, url);
  assert.equal(await converge(server, [again]), TALK.replace('<p>First slide</p>', '<p>First slide before a crash</p>'));
  clean(again);
});

test('an edit typed after a load that takes over a copy, before hello is answered, is kept with the copy and reaches index.html', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  // the requests under .session/ fail from the load on while sessionStorage says so
  const a = await tab(browser, url, { script: `if (sessionStorage.getItem('__offline')) window.__offline = true;` });
  await converge(server, [a]);
  await a.evaluate(`sessionStorage.setItem('__offline', '1')`);
  await goOffline(a);
  await edit(a, 0, 'p', ' TOKH1');
  await copied(a, 'TOKH1');
  await a.evaluate('window.__old = true');
  await a.send('Page.reload');
  await a.waitFor(`!window.__old && window.BeesonSession?.client?.()?.connection === 'offline'`);
  await edit(a, 1, 'p', ' TOKH2');
  await a.waitFor(`(${ROWS}).then((rows) => rows.length === 1 && rows[0].mine.includes('<p>First slide TOKH1</p>') && rows[0].mine.includes('<p>Second slide TOKH2</p>'))`);
  await a.waitFor(`${STATE} === 'Offline. Changes on slides 1 and 2 are kept in this browser'`);
  await a.evaluate(`sessionStorage.removeItem('__offline')`);
  await goOnline(a);
  assert.equal(await converge(server, [a]), TALK.replace('<p>First slide</p>', '<p>First slide TOKH1</p>').replace('<p>Second slide</p>', '<p>Second slide TOKH2</p>'));
  clean(a);
});
