import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { startRelay } from '../scripts/relay.mjs';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';
import { start } from '../theme/edit.mjs';
import { FILED } from '../src/backdrop-files.ts';
import { post, raw, startEdit, talkFolder, until } from './helpers/session.mjs';

const MB = 1024 * 1024;
const SECRET = 'the secret of the group for this test';
const EXTRA = [
  '<section>',
  '  <h2>Backdrops of data and a TikZ figure</h2>',
  '  <div class="backdrop" data-backdrop="poincare" data-system="sun-earth-l1"></div>',
  '  <div class="tikz" data-figure="cr3bp" style="width: 604px; height: 396px"></div>',
  '</section>',
  '<section>',
  '  <h2>Tori</h2>',
  '  <div class="backdrop" data-backdrop="tori"></div>',
  '</section>',
].join('\n');

const api = (key, route) => `/${key}/.session/${route}`;

function put(talk, path, bytes) {
  const file = join(talk, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return file;
}

function testTalk(t) {
  const deck = readFileSync('test-deck.html', 'utf8').replace('<div class="slides">', `<div class="slides">\n${EXTRA}`);
  const folder = talkFolder(t, deck);
  t.after(() => rmSync(folder.root, { recursive: true, force: true }));
  for (const name of ['theme', 'brand', 'demo', 'figures', 'tex.js']) cpSync(resolve(name), join(folder.talk, name), { recursive: true });
  return folder;
}

async function hello(t, port, key, name) {
  const answer = await post(port, api(key, 'hello'), { name });
  assert.equal(answer.status, 200, answer.text);
  const { token, v } = answer.json();
  const polls = (async () => {
    for (let since = v; ; ) {
      const events = await raw(port, 'GET', `${api(key, 'events')}?token=${token}&since=${since}`).catch(() => null);
      if (events?.status !== 200 || events.json().ended) return;
      since = events.json().v ?? since;
    }
  })();
  t.after(() => polls);
  return token;
}

async function download(port, key, token) {
  const made = await raw(port, 'POST', `${api(key, 'single')}?token=${token}`, { body: '' });
  assert.equal(made.status, 200, made.text);
  const { id, size, name, missing } = made.json();
  const pieces = [];
  for (let at = 0; at < size; ) {
    const piece = await raw(port, 'GET', `${api(key, `single/${id}`)}?token=${token}&at=${at}`);
    assert.equal(piece.status, 200, piece.text);
    assert.equal(piece.body.length, Math.min(2 * MB, size - at), `the piece at ${at}`);
    pieces.push(piece.body);
    at += piece.body.length;
  }
  assert.equal((await raw(port, 'DELETE', `${api(key, `single/${id}`)}?token=${token}`)).status, 200);
  return { name, missing, bytes: Buffer.concat(pieces) };
}

const drawn = `(() => {
  const slide = Reveal.getCurrentSlide();
  const shown = (el) => !el.closest('.fragment:not(.visible)') && getComputedStyle(el).visibility !== 'hidden';
  const painted = (canvas) => {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    if (!copy.width || !copy.height) return false;
    const g = copy.getContext('2d');
    g.drawImage(canvas, 0, 0);
    const data = g.getImageData(0, 0, copy.width, copy.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
    return false;
  };
  return JSON.stringify({
    at: Reveal.getIndices(),
    text: slide.innerText,
    pictures: [...slide.querySelectorAll('img')].filter(shown).map((i) => [i.getAttribute('src')?.startsWith('data:') ? 'data' : 'file', i.complete && i.naturalWidth > 0, i.naturalWidth, i.naturalHeight]).map(([, ...rest]) => rest),
    videos: [...slide.querySelectorAll('video')].map((v) => [v.readyState >= 2, v.videoWidth, v.videoHeight]),
    formulas: [...slide.querySelectorAll('mjx-container svg')].map((s) => s.querySelectorAll('use, path').length),
    figures: [...slide.querySelectorAll('.tikz')].map((f) => f.querySelectorAll('svg path').length),
    backdrops: [...slide.querySelectorAll('.backdrop canvas')].map(painted),
    viewers: [...slide.querySelectorAll('tycho-viewer canvas')].length,
    fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + f.style + f.weight).sort(),
  });
})()`;

test('the single web page of a talk, opened alone from a file without a network, draws every step of the deck in both modes', { timeout: 900_000 }, async (t) => {
  const { root, talk } = testTalk(t);
  const running = await start({ folder: talk, port: 0, log: () => {} });
  t.after(() => running.close());
  const host = await hello(t, running.port, running.key, 'Host');
  const { name, missing, bytes } = await download(running.port, running.key, host);
  assert.equal(name, 'talk.html');
  assert.deepEqual(missing, []);
  const alone = join(root, 'alone');
  mkdirSync(alone);
  const single = join(alone, name);
  writeFileSync(single, bytes);

  const browser = await launch({ timeout: 240_000 });
  t.after(() => browser.close());
  for (const theme of ['dark', 'light']) {
    const pages = [];
    for (const file of [join(talk, 'index.html'), single]) {
      const page = await browser.newPage();
      await page.goto(deckUrl(file, `?still&theme=${theme}`));
      await page.waitFor('window.Reveal?.isReady?.()', 240_000);
      pages.push(page);
    }
    for (let step = 0; ; step++) {
      const states = [];
      for (const page of pages) {
        await page.send('Page.bringToFront', {});
        await page.evaluate(deckSettled);
        await page.waitFor("[...Reveal.getCurrentSlide().querySelectorAll('video')].every((v) => v.readyState >= 2)", 60_000);
        states.push(JSON.parse(await page.evaluate(drawn)));
      }
      assert.deepEqual(states[1], states[0], `step ${step} in the ${theme} mode`);
      if (await pages[0].evaluate('Reveal.isLastSlide() && !Reveal.availableFragments().next')) break;
      for (const page of pages) await page.evaluate('Reveal.next()');
    }
    assert.ok(await pages[1].evaluate('Object.keys(window.beesonFiles).length > 0'));
    assert.deepEqual(await pages[1].evaluate(`[...document.querySelectorAll('video')].map((v) => v.getAttribute('src').slice(0, 5))`), ['blob:', 'blob:', 'blob:', 'blob:'], 'a video of over 8 MB of text is played from a blob, which Safari takes beyond 50 MB');
    assert.deepEqual(pages[1].errors, []);
    for (const page of pages) await page.close();
  }
});

test('the single web page names the files of the deck that are not in the talk folder or are over 384 MB, and holds none of the editor', { timeout: 120_000 }, async (t) => {
  const deck = ['<!doctype html>', '<html>', '<head>', '<link rel="stylesheet" href="style.css">', '</head>', '<body>', '<section>', '  <img src="here.png">', '  <img src="gone.png">', '  <video src="gone.mp4"></video>', '  <video src="huge.mp4"></video>', '  <a href="elsewhere.html">a link</a>', '</section>', '</body>', '</html>', ''].join('\n');
  const { root, talk } = talkFolder(t, deck);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const png = randomBytes(1000);
  put(talk, 'here.png', png);
  put(talk, 'style.css', 'body { background: url("brand/gone.png") } h2 { background: url(\'here.png\') }');
  put(talk, 'huge.mp4', '');
  truncateSync(join(talk, 'huge.mp4'), 384 * MB + 1);
  const running = await start({ folder: talk, port: 0, log: () => {} });
  t.after(() => running.close());
  const host = await hello(t, running.port, running.key, 'Host');
  const { missing, bytes } = await download(running.port, running.key, host);
  assert.deepEqual(missing, ['style.css: brand/gone.png', 'img gone.png', 'video gone.mp4', 'video huge.mp4 (over 384 MB)']);
  const html = bytes.toString('utf8');
  assert.ok(html.includes(`<img src="data:image/png;base64,${png.toString('base64')}">`));
  const css = Buffer.from(html.match(/href="data:text\/css;base64,([^"]*)"/)[1], 'base64').toString('utf8');
  assert.equal(css, `body { background: url("brand/gone.png") } h2 { background: url("data:image/png;base64,${png.toString('base64')}") }`);
  assert.ok(html.includes('<a href="elsewhere.html">'));
  assert.ok(html.includes('<video src="huge.mp4">'));
  assert.ok(bytes.length < MB);
  assert.ok(html.indexOf('<script>window.beesonFiles = {};</script>') === html.indexOf('<head>') + '<head>'.length);
  assert.doesNotMatch(html, /editor\.js|session\.js/);
});

test('a file that is written again after its single web page was made, with the same size, is named in the answer to a piece', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t, '<!doctype html>\n<body><img src="a.png"></body>\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = put(talk, 'a.png', randomBytes(3 * MB));
  const running = await start({ folder: talk, port: 0, log: () => {} });
  t.after(() => running.close());
  const host = await hello(t, running.port, running.key, 'Host');
  const made = await raw(running.port, 'POST', `${api(running.key, 'single')}?token=${host}`, { body: '' });
  const { id } = made.json();
  writeFileSync(file, randomBytes(3 * MB));
  const later = new Date(statSync(file).mtimeMs + 10_000);
  utimesSync(file, later, later);
  const piece = await raw(running.port, 'GET', `${api(running.key, `single/${id}`)}?token=${host}&at=0`);
  assert.equal(piece.status, 409);
  assert.equal(piece.json().error, 'The file a.png changed while the single web page was downloaded. Try again.');
});

test('through the relay, a guest gets the single web page of the host, with a video over 64 MB', { timeout: 300_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, idleMs: 5000, pullMs: 1000 });
  t.after(() => relay.close());
  const { root, talk, config } = talkFolder(t, '<!doctype html>\n<html><head></head><body><video src="media/clip.mp4"></video><img src="media/photo.png"></body></html>\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  truncateSync(put(talk, 'media/clip.mp4', ''), 65 * MB + 1);
  const photo = randomBytes(5 * MB + 2);
  put(talk, 'media/photo.png', photo);
  const edit = await startEdit(talk, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET, XDG_CONFIG_HOME: config, APPDATA: config } });
  const { key } = edit;
  await until(async () => (await raw(relay.port, 'GET', `/${key}/index.html`)).status === 200, 'the edit command to register with the relay');
  const guest = await hello(t, relay.port, key, 'Guest');
  const relayed = await download(relay.port, key, guest);
  const host = await hello(t, edit.port, key, 'Host');
  const local = await download(edit.port, key, host);
  assert.ok(relayed.bytes.equals(local.bytes), 'the guest and the host get the same bytes');
  const html = local.bytes.toString('latin1');
  const video = Buffer.from(html.match(/src="data:video\/mp4;base64,([^"]*)"/)[1], 'base64');
  assert.equal(video.length, 65 * MB + 1);
  assert.ok(video.every((b) => b === 0));
  assert.ok(Buffer.from(html.match(/src="data:image\/png;base64,([^"]*)"/)[1], 'base64').equals(photo));
  await until(() => relay.held() === 0, 'the relay to hold nothing');
});

test('a single web page of a video larger than 64 MB holds under 1 MB in memory', { timeout: 120_000 }, async (t) => {
  const { root, talk } = talkFolder(t, '<!doctype html>\n<html><head></head><body><video src="media/clip.mp4"></video></body></html>\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  truncateSync(put(talk, 'media/clip.mp4', ''), 65 * MB);
  const running = await start({ folder: talk, port: 0, log: () => {} });
  t.after(() => running.close());
  const token = await hello(t, running.port, running.key, 'Host');
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc');
  const held = () => {
    gc();
    gc();
    return process.memoryUsage().arrayBuffers;
  };
  const before = held();
  const made = await raw(running.port, 'POST', `${api(running.key, 'single')}?token=${token}`, { body: '' });
  assert.equal(made.status, 200, made.text);
  const grown = held() - before;
  assert.ok(grown < MB, `the single web page holds ${(grown / MB).toFixed(2)} MB`);
});

test('the single web page of a deck with each built-in backdrop of a data file, opened from a file without a network, draws it, and holds no data of a backdrop that the deck does not use', { timeout: 300_000 }, async (t) => {
  const lines = readFileSync('test-deck.html', 'utf8').split('\n');
  const open = lines.findIndex((l) => l === '<div class="slides">');
  const close = lines.findIndex((l, i) => i > open && l === '</div>');
  const slides = FILED.map((name) => `<section>\n  <h2>${name}</h2>\n  <div class="backdrop" data-backdrop="${name}"></div>\n</section>`);
  const { root, talk } = talkFolder(t, [...lines.slice(0, open + 1), ...slides, ...lines.slice(close)].join('\n'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['theme', 'brand', 'tex.js']) cpSync(resolve(name), join(talk, name), { recursive: true });
  const running = await start({ folder: talk, port: 0, log: () => {} });
  t.after(() => running.close());
  const host = await hello(t, running.port, running.key, 'Host');
  const { name, missing, bytes } = await download(running.port, running.key, host);
  assert.deepEqual(missing, []);
  const single = join(root, name);
  writeFileSync(single, bytes);

  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(deckUrl(single, '?still'));
  await page.waitFor('window.Reveal?.isReady?.()', 120_000);
  assert.deepEqual(JSON.parse(await page.evaluate('JSON.stringify(Object.keys(window.beesonFiles).filter((k) => k.startsWith("theme/backdrops/")).sort())')), FILED.map((n) => `theme/backdrops/${n}.js`).sort());
  for (const [i, backdrop] of FILED.entries()) {
    await page.evaluate(`Reveal.slide(${i}), true`);
    await page.evaluate(deckSettled);
    const state = JSON.parse(await page.evaluate(drawn));
    assert.equal(state.text.trim(), backdrop);
    assert.equal(state.backdrops[0], true, `the ${backdrop} backdrop is drawn`);
  }
  assert.deepEqual(page.errors, []);
});
