// the offline path of the client of a session in Chrome: the slides of the edits that wait, named
// in the save state and in the dialog of the end, the copy of the edits in IndexedDB that a page
// opened again sends, with the version in the log and after a restart of the edit command, two
// tabs that keep their copies apart, IndexedDB blocked, the dialog of the conflicts at a reconnect
// with each of its buttons, and the pictures uploaded into media/ before the operation that names
// them. the regression tests at the end cover the save state before the first copy, edits typed
// before hello is answered, two copies that conflict, a copy of an earlier session, the dialog of
// the conflicts at a join, after a removed slide, and after a close by the browser, the parse of
// the deck for this dialog, and the pictures of a copy

import assert from 'node:assert/strict';
import { readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, ONLINE, open, sessionUrl, show, STATE, talk, TALK, TEXT } from './helpers/client.mjs';
import { click, type } from './helpers/editor.mjs';
import { ACTION, CONFLICTS, copied, downloads, dropFiles, edit, el, goOffline, goOnline, press, released, ROWS, rows, SHOWN, tab } from './helpers/offline.mjs';
import { post, raw, until } from './helpers/session.mjs';

const SECRET = 'the secret of the group for this test';
const IMAGE = resolve('demo/figure-light.png');
// a request to an edit command that is not running fails in the console of the page, the first
// poll after a restart is answered 404, since the token is of the edit command before, and a
// request after End session through the relay is answered 410
const REFUSED = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 502/, /status of 410/, /status of 404 .*\/\.session\/events\?/];

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

test('the save state names the slides of the edits that wait, and the dialog of the end names those that did not reach the host', { timeout: 120_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, idleMs: 3000, pullMs: 1000, guestMs: 5000 });
  t.after(() => relay.close());
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  // a poll without news is answered after 1 s, before the relay of this test gives up after 5 s
  const server = await talk(t, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET, SLIDES_POLL_HOLD_MS: '1000' } });
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

test('a picture dropped by one page is uploaded into media/ before the operation that names it, and the other page shows it', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const ann = await tab(browser, url);
  const ben = await open(browser, url, { name: 'Ben' });
  await converge(server, [ann, ben]);
  const bytes = readFileSync(IMAGE);

  // while Ben is in the session, the page of Ann names a new file uniquely to itself
  const UNIQUE = /src="(media\/figure-light-[0-9a-z]{4}\.png)"/g;
  let first;

  await t.test('the picture is in media/ and on the page of Ben', async () => {
    await show(ann, 'One');
    await dropFiles(ann, [IMAGE]);
    const text = await converge(server, [ann, ben]);
    first = [...text.matchAll(UNIQUE)].map((m) => m[1]);
    assert.equal(first.length, 1);
    assert.ok(readFileSync(join(server.talk, first[0])).equals(bytes));
    await front(ben);
    await show(ben, 'One');
    await ben.waitFor(SHOWN(first[0]));
  });

  await t.test('a second drop of the same file is named apart from the first', async () => {
    await show(ann, 'Two');
    await dropFiles(ann, [IMAGE]);
    const text = await converge(server, [ann, ben]);
    const second = [...text.matchAll(UNIQUE)].map((m) => m[1]).filter((path) => path !== first[0]);
    assert.equal(second.length, 1);
    assert.ok(readFileSync(join(server.talk, second[0])).equals(bytes));
    await front(ben);
    await show(ben, 'Two');
    await ben.waitFor(SHOWN(second[0]));
  });

  await t.test('a failed upload keeps the operation, and Try again sends it', async () => {
    const before = server.read();
    await front(ann);
    await ann.evaluate('window.__failMedia = true');
    await show(ann, 'One');
    await dropFiles(ann, [IMAGE]);
    // the name of the file is unique to the page while another page is in the session
    await ann.waitFor(`/^Could not send media\\/figure-light-[0-9a-z]{4}\\.png\\. Try again$/.test(${STATE})`);
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
    truncateSync(big, 17 * 1024 * 1024);
    const before = await ann.evaluate(TEXT);
    await front(ann);
    await dropFiles(ann, [big]);
    await ann.waitFor(`/^big\\.png is larger than 16 MB/.test(${C}.app.note?.text ?? '')`);
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

test('a word typed after a load that takes over a copy, before hello is answered, at the end of the paragraph that the copy ends with a word keeps both words', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url, { script: `if (sessionStorage.getItem('__offline')) window.__offline = true;` });
  await converge(server, [a]);
  await a.evaluate(`sessionStorage.setItem('__offline', '1')`);
  await goOffline(a);
  await edit(a, 0, 'p', ' TOKH1');
  await copied(a, 'TOKH1');
  await a.evaluate('window.__old = true');
  await a.send('Page.reload');
  await a.waitFor(`!window.__old && window.BeesonSession?.client?.()?.connection === 'offline'`);
  // the page shows the deck without the copy until its hello is answered
  await edit(a, 0, 'p', ' TOKH2');
  await a.waitFor(`(${ROWS}).then((rows) => rows.length === 1 && rows[0].mine.includes('<p>First slide TOKH1 TOKH2</p>'))`);
  await a.evaluate(`sessionStorage.removeItem('__offline')`);
  await goOnline(a);
  assert.equal(await converge(server, [a]), TALK.replace('<p>First slide</p>', '<p>First slide TOKH1 TOKH2</p>'));
  clean(a);
});

test('the copies of two closed tabs that changed the same text are both sent, the second after the first with the dialog of the conflicts', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  const b = await tab(browser, url);
  const probe = await probeOf(browser, server);
  await converge(server, [a, b]);
  await goOffline(a);
  await goOffline(b);
  await show(a, 'One');
  await select(a, el(0, 'p'), 0, 5);
  await type(a, 'TOKTA');
  await edit(a, 1, 'li', ' by A');
  await show(b, 'One');
  await select(b, el(0, 'p'), 0, 5);
  await type(b, 'TOKTB');
  await edit(b, 1, 'p', ' by B');
  const idA = await copied(a, '<li>Alpha by A</li>');
  const idB = await copied(b, '<p>Second slide by B</p>');
  await a.close();
  await released(probe, idA);
  await b.close();
  await released(probe, idB);

  const c = await tab(browser, url);
  const first = await until(() => (server.read().includes('<p>TOKTA slide</p>') ? 'TOKTA' : server.read().includes('<p>TOKTB slide</p>') ? 'TOKTB' : null), 'the copy of one tab to reach the file');
  const second = first === 'TOKTA' ? 'TOKTB' : 'TOKTA';
  await front(c);
  await c.waitFor(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`);
  assert.deepEqual((await c.evaluate(CONFLICTS)).items, [`Slide 1: “${second} slide”`]);
  await press(c, 'Keep mine');
  const text = await converge(server, [c]);
  assert.equal(text, TALK.replace('<p>First slide</p>', `<p>${second} slide</p>`).replace('<li>Alpha</li>', '<li>Alpha by A</li>').replace('<p>Second slide</p>', '<p>Second slide by B</p>'));
  await c.waitFor(`${STATE} === 'Sent your changes on slides 1 and 2 from before the page was closed'`);
  await c.waitFor(`(${ROWS}).then((r) => r.length === 0)`);
  clean(c);
});

// the copy of the tab closed first is sent at the join, since it is the older one, and the other
// copy is merged into it with the dialog of the conflicts
for (const older of ['key', 'move']) {
  for (const choice of ['Keep mine', 'Keep theirs']) {
    test(`a slide moved in one closed tab and typed in by the other is in the deck once after ${choice}, when the copy with the ${older} is the older one`, { timeout: 360_000 }, async (t) => {
      const browser = await launch({ offline: false });
      t.after(() => browser.close());
      const server = await talk(t);
      writeFileSync(server.file, server.read().replace('</ul>\n</section>\n', '</ul>\n</section>\n\n<section>\n  <h2>Three</h2>\n  <p>Third slide</p>\n</section>\n'));
      await until(() => server.read().includes('Third slide'), 'the third slide');
      const url = sessionUrl(server.edit);
      const a = await tab(browser, url);
      const b = await tab(browser, url);
      const probe = await probeOf(browser, server);
      await converge(server, [a, b]);
      await goOffline(a);
      await goOffline(b);
      const key = async () => {
        await edit(a, 0, 'p', ' by A');
        const id = await copied(a, 'First slide by A');
        await a.close();
        await released(probe, id);
      };
      const move = async () => {
        await front(b);
        await b.evaluate(`${C}.app.commands.run('slide.moveTo', { slides: [${el(0, 'h2')}.parentElement], gap: 3 })`);
        await b.waitFor(`(${ROWS}).then((rows) => rows.some((r) => r.mine.indexOf('<h2>One') > r.mine.indexOf('<h2>Three')))`);
        const id = (await rows(b)).find((r) => r.mine.indexOf('<h2>One') > r.mine.indexOf('<h2>Three')).id;
        await b.close();
        await released(probe, id);
      };
      for (const step of older === 'key' ? [key, move] : [move, key]) await step();

      const c = await tab(browser, url);
      await front(c);
      await c.waitFor(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`);
      await press(c, choice);
      const text = await converge(server, [c]);
      const slides = text.slice(text.indexOf('<div class="slides">'));
      const typed = (older === 'key') === (choice === 'Keep theirs');
      assert.deepEqual([...slides.matchAll(/<h2>(\w+)<\/h2>/g)].map((m) => m[1]), typed ? ['One', 'Two', 'Three'] : ['Two', 'Three', 'One'], 'the order of the slides');
      assert.equal(slides.split('First slide').length - 1, 1, 'the paragraph of slide One is in the deck once');
      assert.equal(slides.includes('First slide by A'), typed, 'the key is in the deck with the copy that wins');
      clean(c);
    });
  }
}

// the copies of the origin of a page in IndexedDB, as { id, key }
const ALL = `new Promise((done) => {
  const r = indexedDB.open('beeson-session', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('copies', { keyPath: 'id' }).createIndex('key', 'key');
  r.onsuccess = () => {
    const q = r.result.transaction('copies').objectStore('copies').getAll();
    q.onsuccess = () => {
      r.result.close();
      done(q.result.map((x) => ({ id: x.id, key: x.key })));
    };
  };
})`;

// a copy of a page that is gone put into IndexedDB, under the address of the page of the editor
// unless row gives a key. row is the source of an object
const plant = (page, row) =>
  page.evaluate(`new Promise((done, fail) => {
    const r = indexedDB.open('beeson-session', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('copies', { keyPath: 'id' }).createIndex('key', 'key');
    r.onerror = () => fail(r.error);
    r.onsuccess = () => {
      const t = r.result.transaction('copies', 'readwrite');
      t.objectStore('copies').put({ key: location.origin + location.pathname, files: [], ...${row} });
      t.oncomplete = () => (r.result.close(), done(true));
      t.onerror = () => fail(t.error);
    };
  })`);

test('the next page retires the tokens of the closed pages of the copies that it takes over at its join and merges after it, leaves a copy of a page closed after its join, and merges such a copy of an older client', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const call = async (route, body) => (await post(server.edit.port, `${server.edit.base}.session/${route}`, body)).json();
  // three closed pages, whose operations may still be on their way
  const [a, b, d] = [await call('hello', { name: 'Xa' }), await call('hello', { name: 'Xb' }), await call('hello', { name: 'Xd' })];
  const probe = await probeOf(browser, server);
  const now = Date.now();
  const row = (id, from, to, beat, token) => JSON.stringify({ id, base: TALK, v: a.v, mine: TALK.replace(from, to), beat, made: beat, tokens: [token] });
  await plant(probe, row('a', 'First slide', 'TOKTA slide', now - 2, a.token));
  await plant(probe, row('b', 'First slide', 'TOKTB slide', now - 1, b.token));
  const c = await tab(browser, sessionUrl(server.edit), { script: 'window.__blockOps = true' });
  await plant(probe, row('d', '<li>Beta</li>', '<li>Beta by D</li>', now, d.token));
  // an older client does not keep its token in the record
  await plant(probe, JSON.stringify({ id: 'e', base: TALK, v: a.v, mine: TALK.replace('<li>Alpha</li>', '<li>Alpha by E</li>'), beat: now, made: now }));
  await c.evaluate(`(window.__blockOps = false, ${C}.tryNow(), true)`);
  await front(c);
  await c.waitFor(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`);
  await press(c, 'Keep mine');
  const text = await converge(server, [c]);
  assert.ok(text.includes('<p>TOKTB slide</p>') && !text.includes('by D'), 'the copy of the page closed after the join is left for the next join');
  assert.ok(text.includes('<li>Alpha by E</li>'), 'the copy of the older client is merged');
  await probe.waitFor(`(${ROWS}).then((r) => r.map((x) => x.id).join() === 'd')`);
  const late = async (page) => (await call('op', { token: page.token, seq: 1, base: page.v, patches: [{ start: 0, end: 0, text: '<!-- late -->' }] })).reason ?? 'ok';
  assert.deepEqual([await late(a), await late(b)], ['unknown', 'unknown']);
  clean(c, REFUSED);
});

const EARLIER = `(() => {
  const d = document.querySelector('dialog.beeson-session-earlier[open]');
  return d && { title: d.querySelector('h3').textContent, text: d.querySelector('p').textContent, buttons: [...d.querySelectorAll('.row button')].map((b) => b.textContent) };
})()`;
const pressEarlier = (page, label) => page.evaluate(`[...document.querySelectorAll('dialog.beeson-session-earlier[open] .row button')].find((b) => b.textContent === ${JSON.stringify(label)}).click()`);
const DAY = 86_400_000;

test('a copy of an earlier session is added to a deck that changed since only when the person says so, and a copy older than 30 days is deleted', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const probe = await probeOf(browser, server);
  // the deck of the earlier session, whose first slide index.html no longer has
  const base = TALK.replace('<p>First slide</p>', '<p>Earlier first slide</p>');
  const mine = base.replace('<li>Beta</li>', '<li>Beta TOKOLD</li>');
  const row = (id, beat, extra = '') => `{ id: ${JSON.stringify(id)}, base: ${JSON.stringify(base)}, v: 'earlier.3', mine: ${JSON.stringify(mine)}, beat: ${beat}${extra} }`;
  const picture = `, files: [{ path: 'media/earlier.png', blob: new Blob(['png'], { type: 'image/png' }) }]`;

  await t.test('Download my version keeps the dialog open, and Add my changes adds them', async () => {
    const beat = Date.now() - 2 * DAY;
    await plant(probe, row('earlier-add', beat));
    const page = await tab(browser, url, { wait: false });
    await page.waitFor(`!!document.querySelector('dialog.beeson-session-earlier[open]')`);
    const day = await page.evaluate(`new Date(${beat}).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })`);
    assert.deepEqual(await page.evaluate(EARLIER), {
      title: 'Changes from an earlier session',
      text: `This browser kept your changes on slide 2 from ${day}, which were not sent. The deck has changed since then.`,
      buttons: ['Download my version', 'Discard them', 'Add my changes'],
    });
    await pressEarlier(page, 'Download my version');
    const [file] = await downloads(page);
    assert.equal(file.text, mine);
    assert.ok(await page.evaluate(`!!document.querySelector('dialog.beeson-session-earlier[open]')`));
    await pressEarlier(page, 'Add my changes');
    assert.equal(await converge(server, [page]), TALK.replace('<li>Beta</li>', '<li>Beta TOKOLD</li>'));
    await page.waitFor(`(${ROWS}).then((r) => r.length === 0)`);
    clean(page);
    await page.close();
  });

  await t.test('Discard them deletes the copy with its pictures', async () => {
    const before = server.read();
    await plant(probe, row('earlier-discard', Date.now() - 2 * DAY, picture));
    const page = await tab(browser, url, { wait: false });
    await page.waitFor(`!!document.querySelector('dialog.beeson-session-earlier[open]')`);
    await pressEarlier(page, 'Discard them');
    await page.waitFor(ONLINE);
    assert.equal(await converge(server, [page]), before);
    assert.deepEqual(await rows(page), []);
    assert.equal(await page.evaluate(`${C}.shell.media.get('media/earlier.png')`), null);
    clean(page);
    await page.close();
  });

  await t.test('a copy older than 30 days is deleted at a join without a dialog, also one of another address of the origin', async () => {
    const before = server.read();
    await plant(probe, row('earlier-old', Date.now() - 31 * DAY, picture));
    await plant(probe, `{ ...${row('elsewhere-old', Date.now() - 31 * DAY)}, key: location.origin + '/another/index.html' }`);
    await plant(probe, `{ ...${row('elsewhere-new', Date.now() - 2 * DAY)}, key: location.origin + '/another/index.html' }`);
    const page = await tab(browser, url);
    assert.equal(await converge(server, [page]), before);
    assert.equal(await page.evaluate(`!!document.querySelector('dialog.beeson-session-earlier[open]')`), false);
    assert.deepEqual(await page.evaluate(ALL), [{ id: 'elsewhere-new', key: await probe.evaluate(`location.origin + '/another/index.html'`) }]);
    assert.equal(await page.evaluate(`${C}.shell.media.get('media/earlier.png')`), null);
    clean(page);
    await page.close();
  });
});

test('the dialog of the conflicts at a join that takes over a copy downloads the version of the person', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  const ben = await open(browser, url, { name: 'Ben' });
  await converge(server, [a, ben]);
  await goOffline(a);
  await show(a, 'One');
  await select(a, el(0, 'p'), 0, 5);
  await type(a, 'TOKA');
  const id = await copied(a, '<p>TOKA slide</p>');
  await a.close();
  await released(ben, id);
  await show(ben, 'One');
  await select(ben, el(0, 'p'), 0, 5);
  await type(ben, 'TOKB');
  await until(() => server.read().includes('<p>TOKB slide</p>'), 'the edit of Ben to reach the file');

  const again = await tab(browser, url, { wait: false });
  await front(again);
  await again.waitFor(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`);
  assert.deepEqual((await again.evaluate(CONFLICTS)).items, ['Slide 1: “TOKA slide”']);
  await press(again, 'Download my version');
  const [file] = await downloads(again);
  assert.ok(file.text.includes('<p>TOKA slide</p>'), 'the download holds the version of the person');
  assert.ok(await again.evaluate(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`));
  await press(again, 'Keep theirs');
  assert.equal(await converge(server, [again, ben]), TALK.replace('<p>First slide</p>', '<p>TOKB slide</p>'));
  clean(again);
  clean(ben);
});

test('the dialog of the conflicts names a slide that the person removed offline by its text before the removal', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const ann = await tab(browser, url);
  const ben = await open(browser, url, { name: 'Ben' });
  await converge(server, [ann, ben]);
  await goOffline(ann);
  await show(ann, 'One');
  await ann.evaluate(`(${C}.app.selection.clear(), ${C}.app.commands.run('slide.delete'), true)`);
  await ann.waitFor(`document.querySelectorAll('.reveal .slides > section').length === 1`);
  await show(ann, 'Two');
  await caretAtEnd(ann, el(0, 'p'));
  await type(ann, ' by Ann');
  await edit(ben, 0, 'p', ' by Ben');
  await until(() => server.read().includes('<p>First slide by Ben</p>'), 'the edit of Ben to reach the file');
  await ann.waitFor(`Date.now() - window.__offAt > 5500`, 15_000);
  await goOnline(ann);
  await front(ann);
  await ann.waitFor(`!!document.querySelector('dialog.beeson-session-conflicts[open]')`);
  assert.deepEqual((await ann.evaluate(CONFLICTS)).items, ['Slide 1 (removed by you): “One First slide”']);
  await press(ann, 'Keep theirs');
  assert.equal(await converge(server, [ann, ben]), TALK.replace('<p>First slide</p>', '<p>First slide by Ben</p>').replace('<p>Second slide</p>', '<p>Second slide by Ann</p>'));
  clean(ann);
  clean(ben);
});

test('a dialog of the conflicts that the browser closes keeps the version of the person, and later edits are sent', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const { server, ann, ben } = await conflicted(t, browser);
  // as Chrome on Android closes a dialog at a second back gesture, with a cancel event that cannot be canceled
  await ann.evaluate(`(document.querySelector('dialog.beeson-session-conflicts[open]').close(), true)`);
  assert.equal(await converge(server, [ann, ben]), BOTH.replace('<p>First slide</p>', '<p>Opening slide</p>'));
  // the text of the list, since Ben holds the paragraph that he edited last
  await edit(ann, 1, 'li', ' later');
  assert.equal(await converge(server, [ann, ben]), BOTH.replace('<p>First slide</p>', '<p>Opening slide</p>').replace('<li>Alpha by Ann</li>', '<li>Alpha by Ann later</li>'));
  clean(ann);
  clean(ben);
});

test('the slide of each text of the dialog of the conflicts is found with one parse of the deck', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit));
  await page.evaluate(`(window.__deck = ${JSON.stringify(readFileSync(resolve('test-deck.html'), 'utf8'))}, true)`);
  // a call on a new text parses it, and the same call on the same text again is measured against
  // it. a parser that is warm is measured, by a call on another text first
  const measure = () =>
    page.evaluate(`(() => {
      const at = (text, i) => ${C}.shell.slidesAt(text, [{ start: 1000 * i, end: 1000 * i + 10, text: '' }]);
      at(window.__deck + ' ', 0);
      let t = performance.now();
      at(window.__deck, 0);
      const first = performance.now() - t;
      t = performance.now();
      for (let i = 1; i <= 8; i++) at(window.__deck, i);
      return { first, again: (performance.now() - t) / 8 };
    })()`);
  let m = await measure();
  for (let i = 0; i < 2 && !(m.again < m.first / 4); i++) m = await measure();
  assert.ok(m.again < m.first / 4, `a call on the same text takes ${m.again} ms, against ${m.first} ms for the parse`);
  clean(page);
});

// the paths of the files of the copies of the address of a page in IndexedDB
const FILES = `new Promise((done) => {
  const r = indexedDB.open('beeson-session', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('copies', { keyPath: 'id' }).createIndex('key', 'key');
  r.onsuccess = () => {
    const q = r.result.transaction('copies').objectStore('copies').getAll();
    q.onsuccess = () => {
      r.result.close();
      done(q.result.filter((x) => x.key === location.origin + location.pathname).flatMap((x) => (x.files ?? []).map((f) => f.path)));
    };
  };
})`;

test('a picture dropped offline is kept with the copy, and the next join uploads it into media/', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const url = sessionUrl(server.edit);
  const a = await tab(browser, url);
  const probe = await probeOf(browser, server);
  await converge(server, [a]);
  await goOffline(a);
  await show(a, 'One');
  await dropFiles(a, [IMAGE]);
  await a.waitFor(`(${FILES}).then((paths) => paths.includes('media/figure-light.png'))`);
  const [{ id }] = await rows(a);
  await a.close();
  await released(probe, id);
  const again = await tab(browser, url);
  const text = await converge(server, [again]);
  assert.match(text, /src="media\/figure-light\.png"/);
  assert.ok(readFileSync(join(server.talk, 'media/figure-light.png')).equals(readFileSync(IMAGE)));
  clean(again);
});

test('a guest offline while the host ends the session is shown the end once online, with the slides of the edits that did not reach the host', { timeout: 120_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET } });
  const { port, key } = server.edit;
  await until(async () => (await fetch(`${relay.url}/${key}/index.html`)).status === 200, 'the edit command to register with the relay');
  const host = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const guest = await tab(browser, `${relay.url}/${key}/index.html?edit&session`, { name: 'Lea' });
  await converge(server, [host, guest]);

  await goOffline(guest);
  await guest.waitFor(`${C}.connection === 'offline'`);
  await edit(guest, 0, 'h2', ' offline');
  await guest.waitFor(`${STATE} === 'Offline. Changes on slide 1 are kept in this browser'`);
  assert.equal((await raw(port, 'DELETE', `/${key}/.session/share`)).status, 200);
  await goOnline(guest);
  await front(guest);
  await guest.waitFor(`document.querySelector('dialog.beeson-edit-dialog[open] h3')?.textContent === 'Ann ended the session'`);
  assert.equal(await guest.evaluate(`document.querySelector('dialog.beeson-edit-dialog[open] p').textContent`), "Your changes up to now are in Ann's deck. Your changes on slide 1 did not reach Ann.");
  assert.equal(await guest.evaluate(`${C}.connection`), 'ended');
  assert.equal(await host.evaluate(`${C}.connection`), 'online');
  assert.equal(server.read(), TALK);
  clean(host);
  clean(guest, REFUSED);
});

// Ctrl+C in the terminal of the host reaches the same handler as SIGTERM. the relay kept a record
// of the end only after End session, hence a guest who missed the end read that the edit command
// of the host is not running, at every reconnect
test('a guest offline while the host stops the edit command is shown the end once online', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET } });
  const { key } = server.edit;
  await until(async () => (await fetch(`${relay.url}/${key}/index.html`)).status === 200, 'the edit command to register with the relay');
  const host = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const guest = await tab(browser, `${relay.url}/${key}/index.html?edit&session`, { name: 'Lea' });
  await converge(server, [host, guest]);

  await goOffline(guest);
  await guest.waitFor(`${C}.connection === 'offline'`);
  server.edit.child.kill('SIGTERM');
  await server.edit.exited;
  server.edit = null;
  await goOnline(guest);
  await front(guest);
  await guest.waitFor(`${C}.connection === 'ended' || ${C}.connection === 'no-host'`, 20_000);
  assert.equal(await guest.evaluate(`document.querySelector('dialog.beeson-edit-dialog[open] h3')?.textContent ?? ${STATE}`), 'Ann ended the session');
  assert.equal(await guest.evaluate(`document.querySelector('dialog.beeson-edit-dialog[open] p').textContent`), "Your changes up to now are in Ann's deck.");
  clean(host, REFUSED);
  clean(guest, REFUSED);
});

test('the end of the session closes the dialog of the conflicts, keeps the version of the person, and names the slides that did not reach the host', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const { server, ann, ben } = await conflicted(t, browser);
  server.edit.child.kill('SIGTERM');
  await server.edit.exited;
  server.edit = null;
  await ann.waitFor(`${C}.connection === 'ended'`);
  await ann.waitFor(`!document.querySelector('dialog.beeson-session-conflicts')`);
  assert.equal(await ann.evaluate(`document.querySelector('dialog.beeson-edit-dialog[open] p').textContent`), 'Your changes up to now are in index.html. Your changes on slides 1 and 2 did not reach index.html.');
  assert.equal(await ann.evaluate(`${el(0, 'p')}.textContent`), 'Opening slide');
  clean(ann);
  clean(ben);
});
