// slides pasted from a plain deck into a page of a session, and slides copied in a session. a file
// that the session does not take is not added by the paste, which names it with the reason, and the
// later edits of the page still reach index.html. a copy in a session names its deck by a hash of
// the key of the session, also after the session ends, and a plain deck asks for the talk folder of
// the session that it was copied from. a deck whose address has session, which no edit command
// serves, names its own address, also at file://, and another page of the talk folder names its deck
// by a hash of the key, also in a subfolder and behind a relay under a path. a copy between two
// pages in one folder of a session is pasted without a question

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { C, clean, converge, open, sessionUrl, talk, TALK, TEXT } from './helpers/client.mjs';
import { A, B, BACKDROP, DIR, FILES, FIRST_B, QUERY, copySlide, openDeck, pasteSlides, pasted, render, status, withMacrosOfA } from './helpers/cross-deck.mjs';
import { click } from './helpers/editor.mjs';
import { edit } from './helpers/offline.mjs';
import { post } from './helpers/session.mjs';

const MB = 1024 * 1024;
const DIALOG = 'dialog.beeson-edit-dialog.deck-folder';
const SECRET = 'a secret of the relay of the tests';
const ORIGIN = (text) => JSON.parse(text.match(/<!--beeson-origin (.*?)-->/s)[1]);
// the text and the buttons of the dialog that is open
const DIALOG_SHOWN = `(() => { const d = document.querySelector('dialog[open]'); return { text: d.querySelector('p').textContent, buttons: [...d.querySelectorAll('button')].map((b) => b.textContent) }; })()`;
// a paste asks the edit command for each path of a pasted file, and for each path under media/ that
// it would take, which are answered with 404
const PROBED = /status of 404 .*\/(data|figs|media)\//;
const media = (server) => (existsSync(join(server.talk, 'media')) ? readdirSync(join(server.talk, 'media')).sort() : []);

/**
 * Deck A of test/pages/cross-deck copied into the talk folder at the same path, where it finds the
 * theme/ of the talk, and opened in the plain editor at the address of the edit command. change(dir)
 * runs on the copy before the page is opened.
 */
async function deckA(browser, server, change = () => {}) {
  const dir = join(server.talk, DIR, 'a');
  cpSync(resolve(DIR, 'a'), dir, { recursive: true });
  change(dir);
  return openDeck(browser, `${server.edit.url}${A}?${QUERY}`, A);
}

/** Waits for the folder dialog of a paste, clicks its button label, and returns its text. */
async function answer(page, label) {
  await page.waitFor(`!!document.querySelector('${DIALOG}[open]')`, 20000);
  const text = await page.evaluate(`document.querySelector('${DIALOG}').textContent`);
  const at = await page.evaluate(`(() => { const r = [...document.querySelectorAll('${DIALOG} button')].find((b) => b.textContent === ${JSON.stringify(label)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, at);
  return text;
}

test('a slide pasted into a session comes without the file of trajectories of its backdrop, and the later edits of the page reach index.html', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await deckA(browser, server);
  const text = await copySlide(a, BACKDROP);
  await a.close();
  const ann = await open(browser, sessionUrl(server.edit));
  await pasteSlides(ann, 'One', text);
  await pasted(ann);
  // the note of the paste is shown until the next edit
  const { message } = await status(ann);
  await edit(ann, 0, 'p', ' typed');
  const after = await converge(server, [ann]);
  assert.match(after, /<p>First slide typed<\/p>/);
  assert.match(after, /data-trajectories="data\/path\.js"/);
  assert.deepEqual(media(server), []);
  assert.ok(message.includes('data/path.js was not copied: path.js cannot be sent to the others, since a session does not take .js files. Save a picture as a PNG or a JPEG, and a video as an MP4 or a WebM.'), message);
  assert.ok(!message.includes('..'), message);
  clean(ann, [PROBED]);
});

test('a picture over the limit of a session is not added by a paste, and the later edits of the page reach index.html', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const a = await deckA(browser, server, (dir) => writeFileSync(join(dir, 'figs/orbit.png'), Buffer.alloc(17 * MB)));
  const text = await copySlide(a, FILES);
  await a.close();
  const ann = await withMacrosOfA(await open(browser, sessionUrl(server.edit)));
  await pasteSlides(ann, 'One', text);
  await pasted(ann);
  // the note of the paste is shown until the next edit
  const { message } = await status(ann);
  await edit(ann, 0, 'p', ' typed');
  const after = await converge(server, [ann]);
  assert.match(after, /<p>First slide typed<\/p>/);
  assert.match(after, /<img src="figs\/orbit\.png"/);
  assert.deepEqual(media(server), ['clip.mp4', 'clip.png', 'shared.png']);
  assert.ok(message.includes('figs/orbit.png was not copied: orbit.png is larger than 16 MB, the largest file that can be sent to the others.'), message);
  clean(ann, [PROBED]);
});

test('a copy in a session', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const stat = await serve('.');
  t.after(() => stat.close());
  const server = await talk(t);
  mkdirSync(join(server.talk, 'media'));
  writeFileSync(join(server.talk, 'media/fig.png'), readFileSync(resolve('demo/figure-light.png')));
  writeFileSync(server.file, server.read().replace('<p>First slide</p>', '<p>First slide</p>\n  <img src="media/fig.png" alt="A figure">'));
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await ann.waitFor(`${TEXT}.includes('media/fig.png')`);
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  const text = await copySlide(ann, 'One');

  await t.test('names the deck by a hash of the key of the session', async () => {
    assert.ok(!text.includes(server.edit.key), text.slice(0, 300));
    const origin = ORIGIN(text);
    assert.match(origin.deck, /^http:\/\/127\.0\.0\.1:\d+\/session-[0-9a-z]+\/index\.html$/);
    assert.equal(origin.session, true);
    // another page of the session derives the same hash from the key
    assert.equal(ORIGIN(await copySlide(ben, 'Two')).deck, origin.deck);
  });

  await t.test('is pasted by another page of the session at the same origin as a copy of the same deck', async () => {
    await pasteSlides(ben, 'Two', text);
    await pasted(ben);
    assert.equal(await ben.evaluate(`!!document.querySelector('${DIALOG}[open]')`), false);
    const after = await converge(server, [ann, ben]);
    assert.equal(after.match(/<img src="media\/fig\.png" alt="A figure">/g).length, 2);
    assert.equal((await status(ben)).message.includes('not copied'), false);
  });

  await t.test('asks a plain deck for the talk folder of the session that it was copied from, without its key', async (t) => {
    const b = await openDeck(browser, `${stat.origin}/${B}?${QUERY}`, B);
    t.after(() => b.close());
    await pasteSlides(b, FIRST_B, text);
    const asked = await answer(b, 'Paste Without Files');
    assert.ok(asked.includes('The images, videos, and backdrops that you pasted are files in the talk folder of the session that you copied from.'), asked);
    assert.ok(!asked.includes(server.edit.key), asked);
    await pasted(b);
    const { message } = await status(b);
    assert.ok(message.endsWith('media/fig.png was not copied from the talk folder of the session that you copied from.'), message);
    // deck B does not read the file from the address of the copy
    assert.equal(b.errors.filter((e) => e.includes('session-')).length, 0, b.errors.join('\n'));
  });

  clean(ann);
  clean(ben);
});

test('a page of a session names its deck by a hash of the key after the edit command stops', { timeout: 120_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const { key } = server.edit;
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  const before = ORIGIN(await copySlide(ann, 'One'));
  server.edit.child.kill('SIGTERM');
  await server.edit.exited;
  server.edit = null;
  await ann.waitFor(`${C}.connection === 'ended'`);
  await ann.evaluate(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Close').click()`);
  await ann.waitFor(`!document.querySelector('dialog[open]')`);
  const text = await copySlide(ann, 'One');
  assert.ok(!text.includes(key), text.slice(0, 300));
  assert.deepEqual(ORIGIN(text), before);
  clean(ann);
});

test('a copy from a deck whose address has session, which no edit command serves, names its own address, and a deck of the same origin copies its files without a question', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const stat = await serve('.');
  t.after(() => stat.close());
  const a = await openDeck(browser, `${stat.origin}/${A}?${QUERY}&session`, A);
  await a.waitFor(`[...document.querySelectorAll('dialog[open] h3')].some((h) => h.textContent === 'This page is not served by an edit command')`);
  assert.deepEqual(await a.evaluate(DIALOG_SHOWN), {
    text: 'The deck is edited without a session. Double-click Edit.command (macOS), Edit.cmd (Windows), or Edit.sh (Linux) in the talk folder, or run npm run edit there, and open the address that it prints.',
    buttons: ['OK'],
  });
  await a.evaluate(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'OK').click()`);
  await a.waitFor(`!document.querySelector('dialog[open]')`);
  const text = await copySlide(a, FILES);
  const origin = ORIGIN(text);
  assert.equal(origin.deck, `${stat.origin}/${A}`);
  assert.equal(origin.session, undefined);
  const b = await withMacrosOfA(await openDeck(browser, `${stat.origin}/${B}?${QUERY}`, B));
  await pasteSlides(b, FIRST_B, text);
  await b.waitFor(`!!document.querySelector('${DIALOG}[open]') || window.__pasted !== false`, 30000);
  assert.equal(await b.evaluate(`document.querySelector('${DIALOG}[open]')?.textContent ?? null`), null);
  await pasted(b);
  const { message } = await status(b);
  assert.ok(!message.includes('not copied'), message);
});

// a page of the talk folder that the session does not edit, opened with session at url, once OK of
// its dialog is clicked
async function plainPage(browser, url) {
  const page = await open(browser, url, { wait: false, ready: false });
  await page.waitFor(`!!document.querySelector('dialog[open] h3')`, 20_000);
  await page.evaluate(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'OK').click()`);
  await page.waitFor(`!document.querySelector('dialog[open]') && window.BeesonEditor && window.BeesonEditor.ready.then(() => true)`);
  return page;
}

// a paste whose end or folder dialog is waited for, which asserts that the dialog is not shown and
// that the note of the paste does not name a file that was not copied
async function pastedWithoutQuestion(page) {
  await page.waitFor(`!!document.querySelector('${DIALOG}[open]') || window.__pasted !== false`, 30_000);
  assert.equal(await page.evaluate(`document.querySelector('${DIALOG}[open]')?.textContent ?? null`), null);
  await pasted(page);
  const { message } = await status(page);
  assert.ok(!message?.includes('not copied'), message);
}

test('a copy from another page of the talk folder of a session', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  mkdirSync(join(server.talk, 'media'));
  writeFileSync(join(server.talk, 'media/fig.png'), readFileSync(resolve('demo/figure-light.png')));
  const figure = (text) => text.replace('<p>First slide</p>', '<p>First slide</p>\n  <img src="media/fig.png" alt="A figure">');
  writeFileSync(server.file, figure(server.read()));
  writeFileSync(join(server.talk, 'other.html'), figure(TALK));
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await converge(server, [ann]);
  const other = await plainPage(browser, `${server.edit.url}other.html?edit&session`);

  await t.test('is pasted into index.html of the session without a question, since each path is the same file', async () => {
    await pasteSlides(ann, 'One', await copySlide(other, 'One'));
    await pastedWithoutQuestion(ann);
    const after = await converge(server, [ann]);
    assert.equal(after.match(/<img src="media\/fig\.png" alt="A figure">/g).length, 2);
  });

  await t.test('from index.html is pasted into the other page without a question', async () => {
    await pasteSlides(other, 'Two', await copySlide(ann, 'One'));
    await pastedWithoutQuestion(other);
    assert.equal((await render(other)).match(/<img src="media\/fig\.png" alt="A figure">/g).length, 2);
  });

  await t.test('from a page in a subfolder asks for the talk folder, since each path names another file', async () => {
    mkdirSync(join(server.talk, 'old'));
    writeFileSync(join(server.talk, 'old/deck.html'), figure(TALK).replaceAll('"theme/', '"../theme/').replaceAll('"brand/', '"../brand/'));
    const old = await plainPage(browser, `${server.edit.url}old/deck.html?edit&session`);
    await pasteSlides(ann, 'Two', await copySlide(old, 'One'));
    const asked = await answer(ann, 'Paste Without Files');
    assert.ok(asked.includes('files in the talk folder of the session that you copied from'), asked);
    await pasted(ann);
  });
});

// another page of the talk folder, which the edit command serves without a session, through the
// edit command and through the relay for a guest. the key is the first folder of the address
for (const [which, path] of [['a page of the talk folder other than index.html', 'other.html'], ['a page in a subfolder of the talk folder', 'old/deck.html']])
for (const through of ['the edit command', 'the relay']) {
  test(`${which}, opened with session through ${through}, names its deck by a hash of the key`, { timeout: 120_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    mkdirSync(join(server.talk, 'old'));
    writeFileSync(join(server.talk, path), path === 'other.html' ? TALK : TALK.replaceAll('"theme/', '"../theme/').replaceAll('"brand/', '"../brand/'));
    const { key } = server.edit;
    let url = `${server.edit.url}${path}?edit&session`;
    if (through === 'the relay') {
      const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
      t.after(() => relay.close());
      const shared = await post(server.edit.port, `${server.edit.base}.session/share`, { relay: relay.url, secret: SECRET });
      assert.equal(shared.status, 200, shared.text);
      url = shared.json().link.replace('index.html', path);
      assert.ok(url.startsWith(relay.url), url);
    }
    const page = await open(browser, url, { wait: false, ready: false });
    await page.waitFor(`[...document.querySelectorAll('dialog[open] h3')].some((h) => h.textContent === 'This page is not the deck of the session')`, 20_000);
    assert.deepEqual(await page.evaluate(DIALOG_SHOWN), { text: 'A session edits index.html of the talk folder. This deck is edited without a session.', buttons: ['OK'] });
    await page.evaluate(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'OK').click()`);
    await page.waitFor(`!document.querySelector('dialog[open]') && window.BeesonEditor && window.BeesonEditor.ready.then(() => true)`);
    const text = await copySlide(page, 'One');
    assert.ok(!text.includes(key) && !text.includes(key.replaceAll('-', '\\u002d')), text.slice(0, 300));
    const origin = ORIGIN(text);
    assert.equal(origin.deck, `${new URL(url).origin}/${origin.deck.split('/')[3]}/${path}`);
    assert.match(origin.deck.split('/')[3], /^session-[0-9a-z]+$/);
    assert.equal(origin.session, true);
  });
}

// a proxy on 127.0.0.1 that serves the relay at target under /pre, as a group may mount a relay on
// its web server
async function proxy(t, target) {
  const to = new URL(target);
  const server = createServer((req, res) => {
    if (!req.url.startsWith('/pre/')) return res.writeHead(404).end();
    const forward = httpRequest({ host: to.hostname, port: to.port, method: req.method, path: req.url.slice('/pre'.length), headers: { ...req.headers, host: to.host } }, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    forward.on('error', () => res.destroy());
    req.pipe(forward);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((done) => server.close(done));
  });
  return `http://127.0.0.1:${server.address().port}/pre`;
}

test('a guest of a relay under a path names its deck by a hash of the key, and a copy between two pages in a folder whose name may be a key is pasted without a question', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const { key } = server.edit;
  const up = (text) => text.replaceAll('"theme/', '"../theme/').replaceAll('"brand/', '"../brand/');
  const figure = (text) => text.replace('<p>First slide</p>', '<p>First slide</p>\n  <img src="media/fig.png" alt="A figure">');
  // a folder whose name matches the pattern of a key
  const folder = 'drafts_of_the_talk_2026';
  assert.match(folder, /^[A-Za-z0-9_-]{22,128}$/);
  mkdirSync(join(server.talk, 'old'));
  writeFileSync(join(server.talk, 'old/deck.html'), up(TALK));
  mkdirSync(join(server.talk, folder, 'media'), { recursive: true });
  writeFileSync(join(server.talk, folder, 'media/fig.png'), readFileSync(resolve('demo/figure-light.png')));
  writeFileSync(join(server.talk, folder, 'a.html'), up(figure(TALK)));
  writeFileSync(join(server.talk, folder, 'b.html'), up(TALK));
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const shared = await post(server.edit.port, `${server.edit.base}.session/share`, { relay: await proxy(t, relay.url), secret: SECRET });
  assert.equal(shared.status, 200, shared.text);
  const link = shared.json().link;
  assert.ok(new URL(link).pathname.startsWith(`/pre/${key}/`), link);
  const keyless = (text) => !text.includes(key) && !text.includes(key.replaceAll('-', '\\u002d'));

  const guest = await open(browser, link, { name: 'Gus' });
  const text = await copySlide(guest, 'One');
  assert.ok(keyless(text), text.slice(0, 300));
  assert.match(ORIGIN(text).deck, /\/pre\/session-[0-9a-z]+\/index\.html$/);
  const old = await plainPage(browser, link.replace('index.html', 'old/deck.html'));
  const oldText = await copySlide(old, 'One');
  assert.ok(keyless(oldText), oldText.slice(0, 300));
  assert.match(ORIGIN(oldText).deck, /\/pre\/session-[0-9a-z]+\/old\/deck\.html$/);

  const a = await plainPage(browser, link.replace('index.html', `${folder}/a.html`));
  const b = await plainPage(browser, link.replace('index.html', `${folder}/b.html`));
  const copied = await copySlide(a, 'One');
  assert.ok(keyless(copied) && !copied.includes(folder), copied.slice(0, 300));
  await pasteSlides(b, 'Two', copied);
  await pastedWithoutQuestion(b);
  assert.equal((await render(b)).match(/<img src="media\/fig\.png" alt="A figure">/g).length, 1);
});

// the editor on the deck of file at file://, in a fresh browser, whose storage is empty, since
// openDeck() of cross-deck.mjs clears the storage of the origin, which file:// does not have
async function fileDeck(browser, file, query) {
  const page = await browser.newPage({ width: 1600, height: 1000 });
  await page.goto(`${pathToFileURL(resolve(file)).href}?${query}`);
  await page.waitFor(deckSettled, 60000);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)', 60000);
  const state = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(readFileSync(file, 'utf8'))})`);
  assert.deepEqual(state.problems, []);
  return page;
}

test('a copy from a deck at file:// whose address has session names its own address, and a paste of it does not name a session', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const a = await fileDeck(browser, A, `${QUERY}&session`);
  const text = await copySlide(a, FILES);
  const origin = ORIGIN(text);
  assert.equal(origin.deck, pathToFileURL(resolve(A)).href);
  assert.equal(origin.session, undefined);
  const b = await withMacrosOfA(await fileDeck(browser, B, QUERY));
  await pasteSlides(b, FIRST_B, text);
  await b.waitFor(`!!document.querySelector('${DIALOG}[open]')`, 30000);
  const asked = await b.evaluate(`document.querySelector('${DIALOG}[open]').textContent`);
  assert.ok(!asked.includes('session'), asked);
});
