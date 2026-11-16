// the pictures of a session in Chrome: a name of the edit command written only into the edits of
// the page that uploaded the file, a name unique to the page while another page is in the session,
// the store of the page keyed by the new name, undo and redo after a rename, the limits of a
// picture and a video, the deadline of an upload, the save state after the picture of a failed
// upload is removed, an upload that the session refuses given up, an upload whose answer was lost
// sent again without a second copy, and an upload cut on the network sent again at a reconnect.
// the uploads of a page are sent through a proxy of the test, by which they are held, stalled, cut,
// or refused

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { front } from './helpers/apply.mjs';
import { C, clean, converge, open, sessionUrl, show, STATE, talk, TEXT } from './helpers/client.mjs';
import { click, press as keys } from './helpers/editor.mjs';
import { NET } from './helpers/net.mjs';
import { ACTION, dropFiles, edit, goOffline, goOnline, SHOWN, tab } from './helpers/offline.mjs';
import { post, raw, until } from './helpers/session.mjs';

const LIGHT = readFileSync(resolve('demo/figure-light.png'));
const DARK = readFileSync(resolve('demo/figure-dark.png'));
const FAILED = (path) => `Could not send ${path}. Try again`;
const IMG = /<img [^>]*src="(media\/[^"]+)"[^>]*>/g;
// the media/ paths of the images of each slide of text
const sources = (text) => text.split('<section').slice(1).map((s) => [...s.matchAll(IMG)].map((m) => m[1]));
// whether the image of the page with alt is shown from path and loaded
const SHOWN_ALT = (alt, path) => `(() => { const i = document.querySelector('.reveal .slides img[alt=${JSON.stringify(alt)}]'); return !!i && i.getAttribute('src') === ${JSON.stringify(path)} && i.complete && i.naturalWidth > 0; })()`;
// the number of images in the deck as the page reads it
const IMAGES = `(${TEXT}.match(/<img /g) ?? []).length`;
// the errors in the console of a page for an upload that the proxy refused, cut, or lost
const PROXIED = [/status of 50[04]/, /ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET|Failed to fetch/];
// the number of elements of the page that show the whole of text where a person sees it: the element
// is inside the window and does not cut the text at its end, and every line of the text is inside
// each box that clips it. a line is as tall as the letters of its font, which in most fonts is
// taller than a line of height 1. with scroll, an element that scrolls vertically shows the part
// of text that a scroll of it reaches
const SEEN = (text, scroll = false) => `[...document.body.querySelectorAll('*')].filter((el) => {
  const has = (e) => e.textContent.includes(${JSON.stringify(text)});
  if (!has(el) || [...el.children].some(has) || getComputedStyle(el).visibility !== 'visible') return false;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight || el.scrollWidth > el.clientWidth) return false;
  const scrolls = ${scroll} && getComputedStyle(el).overflowY === 'auto';
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines = scrolls ? [r] : [...range.getClientRects()];
  for (let p = scrolls ? el.parentElement : el; p; p = p.parentElement) {
    if (getComputedStyle(p).overflow === 'visible') continue;
    const q = p.getBoundingClientRect();
    if (lines.some((l) => l.left < q.left - 1 || l.right > q.right + 1 || l.top < q.top - 1 || l.bottom > q.bottom + 1)) return false;
  }
  return true;
}).length`;
const BAR = `document.querySelector('.beeson-edit-titlebar').getBoundingClientRect().height`;
const TITLE = `document.querySelector('.beeson-edit-titlebar .doc .state').textContent`;

/** A file of bytes at name in a new folder dir of the talk folder, for a drop. */
function file(server, dir, name, bytes) {
  mkdirSync(join(server.root, dir), { recursive: true });
  const path = join(server.root, dir, name);
  writeFileSync(path, bytes);
  return path;
}

/** A file put into media/ of the talk by hand, which the deck does not name. */
function leftover(server, name, bytes) {
  mkdirSync(join(server.talk, 'media'), { recursive: true });
  writeFileSync(join(server.talk, 'media', name), bytes);
}

const disk = (server, path) => readFileSync(join(server.talk, path));
const media = (server) => readdirSync(join(server.talk, 'media')).sort();

/** Writes index.html with html added after the paragraph of slide Two, as another program would. */
function writeOutside(server, html) {
  const text = server.read();
  assert.ok(text.includes('<p>Second slide</p>'));
  writeFileSync(server.file, text.replace('<p>Second slide</p>', `<p>Second slide</p>\n  ${html}`));
}

/**
 * A proxy of the test in front of the edit command, and the address of the editor through it. Each
 * PUT of media/ is handled by the next mode given to next(), and is passed on once none is left.
 * With hold it is forwarded at release(), with stall it is read and never answered, and with cut
 * its connection is closed. With refuse it is answered 500 without being forwarded, with large it
 * is answered 413 as the relay answers a body over its limit, and with lose it is forwarded and
 * answered 504 once the edit command has answered. While down is set, every
 * PUT is cut, since Chrome sends a PUT again once when its connection is closed.
 */
async function proxy(t, edit) {
  const modes = [];
  const held = [];
  const p = {
    puts: 0,
    down: false,
    held,
    url: '',
    next: (...m) => modes.push(...m),
    release: () => held.splice(0).forEach((go) => go()),
  };
  const forward = (req, body) =>
    new Promise((done) => {
      const up = httpRequest({ host: '127.0.0.1', port: edit.port, method: req.method, path: req.url, agent: false, headers: { ...req.headers, host: `127.0.0.1:${edit.port}` } }, (r) => {
        const parts = [];
        r.on('data', (c) => parts.push(c));
        r.on('end', () => done({ status: r.statusCode, headers: r.headers, body: Buffer.concat(parts) }));
      });
      up.on('error', () => done({ status: 502, headers: {}, body: Buffer.alloc(0) }));
      up.end(body);
    });
  const answer = (res, { status, headers, body }) => {
    const out = { ...headers, 'content-length': body.length };
    delete out['transfer-encoding'];
    delete out.connection;
    res.writeHead(status, out).end(body);
  };
  const json = (status, error) => ({ status, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ error })) });
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      const upload = req.method === 'PUT' && req.url.includes('/.session/media/');
      const mode = !upload ? 'pass' : p.down ? 'cut' : (modes.shift() ?? 'pass');
      if (upload) p.puts++;
      if (mode === 'stall') return;
      if (mode === 'cut') return req.socket.destroy();
      if (mode === 'refuse') return answer(res, json(500, 'the proxy refused the upload'));
      if (mode === 'large') return answer(res, { status: 413, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: Buffer.from('the body is larger than the limit of the relay') });
      if (mode === 'hold') await new Promise((go) => held.push(go));
      const got = await forward(req, body);
      if (res.destroyed) return;
      answer(res, mode === 'lose' ? json(504, 'the proxy lost the answer') : got);
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((done) => server.close(done));
  });
  p.url = sessionUrl(edit).replace(`:${edit.port}/`, `:${server.address().port}/`);
  return p;
}

test('a name that the edit command gives is written only into the edits of the page that uploaded the file', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());

  await t.test('while another page is in the session, the picture of each page keeps its own file', async (t) => {
    const server = await talk(t);
    const p = await proxy(t, server.edit);
    const ann = await tab(browser, p.url);
    const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
    await converge(server, [ann, ben]);
    // the upload of Ann is held while Ben drops a picture of the same name
    p.next('hold');
    await show(ann, 'One');
    await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
    await until(() => p.held.length, 'the upload of Ann to be held');
    await show(ben, 'Two');
    await dropFiles(ben, [file(server, 'b', 'plot.png', DARK)]);
    await until(() => sources(server.read())[1].length, 'the picture of Ben in index.html');
    await front(ann);
    await ann.waitFor(`${IMAGES} === 2`);
    // on the page of Ann, the image of Ben is not shown from the file of Ann
    assert.doesNotMatch(await ann.evaluate(`document.querySelectorAll('.reveal .slides > section')[1].querySelector('img').getAttribute('src')`), /^blob:/);
    p.release();
    const [one, two] = sources(await converge(server, [ann, ben]));
    assert.equal(one.length, 1);
    assert.equal(two.length, 1);
    assert.match(one[0], /^media\/plot-[0-9a-z]{4}\.png$/);
    assert.match(two[0], /^media\/plot-[0-9a-z]{4}\.png$/);
    assert.ok(disk(server, one[0]).equals(LIGHT), `${one[0]} is the picture of Ann`);
    assert.ok(disk(server, two[0]).equals(DARK), `${two[0]} is the picture of Ben`);
    // Ben shows his picture from its object URL, and Ann from the file in media/
    await show(ann, 'Two');
    await ann.waitFor(SHOWN(two[0]));
    clean(ann);
    clean(ben);
    await ann.close();
    await ben.close();
  });

  await t.test('an image that the authority holds keeps the name of the file in media/', async (t) => {
    const server = await talk(t);
    leftover(server, 'plot.png', DARK);
    const p = await proxy(t, server.edit);
    const ann = await tab(browser, p.url);
    p.next('hold');
    await show(ann, 'One');
    await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
    await until(() => p.held.length, 'the upload of Ann to be held');
    writeOutside(server, '<img src="media/plot.png" alt="folder">');
    await ann.waitFor(`${TEXT}.includes('alt="folder"')`);
    p.release();
    const text = await converge(server, [ann]);
    assert.match(text, /<img src="media\/plot\.png" alt="folder">/);
    assert.deepEqual(sources(text)[0], ['media/plot-2.png']);
    assert.ok(disk(server, 'media/plot-2.png').equals(LIGHT));
    assert.ok(disk(server, 'media/plot.png').equals(DARK));
    await show(ann, 'Two');
    await ann.waitFor(SHOWN_ALT('folder', 'media/plot.png'));
    clean(ann);
    await ann.close();
  });
});

test('the names that the edit command gives to the files of one drop are written in one pass', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  leftover(server, 'plot.png', 'another file');
  const ann = await tab(browser, sessionUrl(server.edit));
  const which = (path) => (disk(server, path).equals(LIGHT) ? 'light' : disk(server, path).equals(DARK) ? 'dark' : 'other');

  await t.test('plot.png and plot-2.png beside a file plot.png in media/', async () => {
    await show(ann, 'One');
    await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT), file(server, 'b', 'plot-2.png', DARK)]);
    await ann.waitFor(`${IMAGES} === 2`);
    const [one] = sources(await converge(server, [ann]));
    assert.equal(new Set(one).size, 2, `each image names a file of its own: ${one}`);
    assert.deepEqual(one.map(which).sort(), ['dark', 'light']);
    assert.equal(readFileSync(join(server.talk, 'media/plot.png'), 'utf8'), 'another file');
  });

  await t.test('fig.1.png and fig-1.png, whose names the edit command cleans to one', async () => {
    await show(ann, 'Two');
    await dropFiles(ann, [file(server, 'c', 'fig.1.png', LIGHT), file(server, 'c', 'fig-1.png', DARK)]);
    await ann.waitFor(`${IMAGES} === 4`);
    const [, two] = sources(await converge(server, [ann]));
    // the files are named by the page as by the edit command, hence nothing is renamed
    assert.deepEqual(two, ['media/fig-1.png', 'media/fig-1-2.png']);
    assert.deepEqual(two.map(which), ['light', 'dark']);
  });

  await t.test('plot.png and plot-2.png beside a file plot.png in media/, when the second upload fails', async (t) => {
    const server = await talk(t);
    leftover(server, 'plot.png', 'another file');
    const p = await proxy(t, server.edit);
    const bea = await tab(browser, p.url);
    const which = (path) => (disk(server, path).equals(LIGHT) ? 'light' : disk(server, path).equals(DARK) ? 'dark' : 'other');
    p.next('pass', 'refuse');
    await show(bea, 'One');
    await dropFiles(bea, [file(server, 'a', 'plot.png', LIGHT), file(server, 'b', 'plot-2.png', DARK)]);
    // the second file is given another name by the rename of the first
    await bea.waitFor(`/^Could not send media\\/plot\\S*\\.png\\. Try again$/.test(${STATE})`);
    await click(bea, '.beeson-session-action');
    const [one] = sources(await converge(server, [bea]));
    assert.equal(new Set(one).size, 2, `each image names a file of its own: ${one}`);
    assert.deepEqual(one.map(which).sort(), ['dark', 'light']);
    clean(bea, PROXIED);
    await bea.close();
  });

  clean(ann);
});

test('after a rename, the page shows the file in media/ for an image of another page that names the first name', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  leftover(server, 'photo.png', DARK);
  const ann = await tab(browser, sessionUrl(server.edit));
  await show(ann, 'One');
  await dropFiles(ann, [file(server, 'a', 'photo.png', LIGHT)]);
  await ann.waitFor(`${IMAGES} === 1`);
  assert.deepEqual(sources(await converge(server, [ann]))[0], ['media/photo-2.png']);
  writeOutside(server, '<img src="media/photo.png" alt="folder">');
  await ann.waitFor(`${TEXT}.includes('alt="folder"')`);
  await show(ann, 'Two');
  await ann.waitFor(SHOWN_ALT('folder', 'media/photo.png'), 15_000);
  clean(ann);
});

test('undo and redo of a picture that the edit command renamed', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  leftover(server, 'plot.png', DARK);
  const ann = await tab(browser, sessionUrl(server.edit));
  await show(ann, 'One');
  await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
  await ann.waitFor(`${IMAGES} === 1`);
  assert.deepEqual(sources(await converge(server, [ann]))[0], ['media/plot-2.png']);
  await keys(ann, 'Mod+Z');
  await until(() => !server.read().includes('<img'), 'the undo of the drop in index.html', 15_000);
  await converge(server, [ann]);
  await keys(ann, 'Mod+Shift+Z');
  await until(() => server.read().includes('<img'), 'the redo of the drop in index.html', 15_000);
  assert.deepEqual(sources(await converge(server, [ann]))[0], ['media/plot-2.png']);
  assert.deepEqual(media(server), ['plot-2.png', 'plot.png']);
  clean(ann);
});

test('a picture over 16 MB is refused on the host as well, a video of the host up to 64 MB is not, and a file of another kind is refused by its extension', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const ann = await tab(browser, sessionUrl(server.edit));
  assert.equal(await ann.evaluate(`${C}.host`), true);
  const refuse = (name, type, mb) => ann.evaluate(`${C}.shell.media.refuse(new File([new Uint8Array(${mb} * 1024 * 1024)], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }))`);
  assert.equal(await refuse('big.png', 'image/png', 17), 'big.png is larger than 16 MB, the largest file that can be sent to the others');
  assert.equal(await refuse('big.png', 'image/png', 15), null);
  assert.equal(await refuse('big.mp4', 'video/mp4', 17), null);
  assert.equal(await refuse('big.mp4', 'video/mp4', 65), 'big.mp4 is larger than 64 MB, the largest file that can be sent to the others');
  assert.equal(await refuse('IMG_2041.heic', 'image/heic', 1), 'IMG_2041.heic cannot be sent to the others, since a session does not take .heic files. Save it as a PNG or a JPEG.');
  assert.equal(await refuse('clip.MKV', 'video/x-matroska', 1), 'clip.MKV cannot be sent to the others, since a session does not take .mkv files. Save it as an MP4 or a WebM.');
  // a paste of slides gives a file the type that the edit command serves it with
  assert.equal(await refuse('clip.mkv', 'application/octet-stream', 1), 'clip.mkv cannot be sent to the others, since a session does not take .mkv files. Save a picture as a PNG or a JPEG, and a video as an MP4 or a WebM.');
  assert.equal(await refuse('scan', '', 1), 'scan cannot be sent to the others, since a session does not take files without an extension. Save a picture as a PNG or a JPEG, and a video as an MP4 or a WebM.');
  clean(ann);
});

const PDF = resolve('test/pages/figure.pdf');
// figure.pdf as a file made in the page, for a command that takes its files as an argument
const PDF_FILE = `new File([Uint8Array.from(atob(${JSON.stringify(readFileSync(PDF).toString('base64'))}), (c) => c.charCodeAt(0))], 'figure.pdf', { type: 'application/pdf' })`;
// the first bytes of a PNG
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NO_PDF = 'figure.pdf cannot be sent to the others, since a session does not take .pdf files. Add a PDF figure in the editor without a session.';
// the middle of the image of selector that is drawn
const middle = (page, selector) =>
  page.evaluate(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width > 0).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
// the answer of the command id run with arg, an expression of the page: taken, or the reason of its refusal
const run = (page, id, arg) => page.evaluate(`${C}.app.commands.run(${JSON.stringify(id)}, ${arg}).then(() => 'taken', (e) => e.message)`);

test('a PDF that is dropped, or chosen with Replace…, is refused in a session with its reason, and the picture is kept', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const ann = await tab(browser, sessionUrl(server.edit));
  await show(ann, 'Two');
  await dropFiles(ann, [PDF]);
  await ann.waitFor(`(${C}.app.note?.text ?? '') === ${JSON.stringify(NO_PDF)}`).catch(async () => assert.fail(`the reason of the drop reads ${await ann.evaluate(`${C}.app.note?.text ?? null`)}`));
  assert.equal(await ann.evaluate(IMAGES), 0);
  await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
  await ann.waitFor(`${IMAGES} === 1`);
  const before = await converge(server, [ann]);
  await click(ann, await middle(ann, '.reveal .slides img'));
  assert.equal(await ann.evaluate(`${C}.app.commands.enabled('media.replace')`), true);
  assert.equal(await run(ann, 'media.replace', `{ files: [${PDF_FILE}] }`), NO_PDF);
  assert.equal(await converge(server, [ann]), before);
  assert.deepEqual(media(server), ['plot.png']);
  clean(ann);
});

test('the page and Match the Mode of a PDF figure of the deck are changed in a session, and the other page shows the new renders from media/', { timeout: 780_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  leftover(server, 'figure.pdf', readFileSync(PDF));
  leftover(server, 'figure-dark.png', DARK);
  leftover(server, 'figure-light.png', LIGHT);
  writeOutside(server, '<img class="for-dark" src="media/figure-dark.png" data-pdf="media/figure.pdf" alt="A plot">\n  <img class="for-light" src="media/figure-light.png" data-pdf="media/figure.pdf" alt="A plot">');
  const ann = await tab(browser, sessionUrl(server.edit));
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  await show(ann, 'Two');
  await show(ben, 'Two');
  await front(ann);
  await click(ann, await middle(ann, '.reveal .slides img[data-pdf]'));
  assert.equal(await ann.evaluate(`${C}.app.commands.enabled('media.pdfPage')`), true);
  assert.equal(await run(ann, 'media.pdfPage', '{ page: 2 }'), 'taken');
  await until(() => server.read().includes('data-page="2"'), 'page 2 in index.html', 30_000);
  const text = await converge(server, [ann, ben]);
  const renders = sources(text)[1];
  assert.equal(renders.length, 2, text);
  // while Ben is in the session, a new file is named uniquely to the page of Ann
  for (const [i, mode] of ['dark', 'light'].entries()) {
    assert.match(renders[i], new RegExp(`^media/figure-page-2-${mode}(-[0-9a-z]{4})?\\.png$`));
    assert.ok(disk(server, renders[i]).subarray(0, 8).equals(PNG), `${renders[i]} is a PNG`);
  }
  for (const written of ['data-pdf="media/figure.pdf"', 'data-page="2"']) assert.equal(text.split(written).length - 1, 2, text);
  // the deck is shown in the dark mode
  await ben.waitFor(SHOWN(renders[0]), 15_000);
  assert.doesNotMatch(await ben.evaluate(`document.querySelector('.reveal .slides img.for-dark').src`), /^blob:/);

  // without Match the Mode, the figure is one render in the colors of the PDF. the page of Ann is
  // brought to the front, since a page behind another does not draw
  await front(ann);
  assert.equal(await run(ann, 'media.matchMode', 'undefined'), 'taken');
  await until(() => sources(server.read())[1].length === 1, 'one render in index.html', 30_000);
  const [own] = sources(await converge(server, [ann, ben]))[1];
  assert.match(own, /^media\/figure-page-2(-[0-9a-z]{4})?\.png$/);
  assert.ok(disk(server, own).subarray(0, 4).equals(PNG.subarray(0, 4)), `${own} is a PNG`);
  await ben.waitFor(SHOWN(own), 15_000);
  // and with it again, a pair
  await front(ann);
  assert.equal(await run(ann, 'media.matchMode', 'undefined'), 'taken');
  await until(() => sources(server.read())[1].length === 2, 'a pair of renders in index.html', 30_000);
  const pair = sources(await converge(server, [ann, ben]))[1];
  assert.match(pair.join(' '), /^media\/figure-page-2-(dark|light)[^ ]*\.png media\/figure-page-2-(dark|light)[^ ]*\.png$/);
  await ben.waitFor(`document.querySelectorAll('.reveal .slides img[data-pdf="media/figure.pdf"][data-page="2"]').length === 2`);
  clean(ann);
  clean(ben);
});

// a PDF of one page of 1920 by 1080 pt that shows noise of 3840 by 2160 px without compression,
// hence a file of 25 MB whose render in the colors of the PDF is a PNG over 16 MB
function noisePdf() {
  const [w, h] = [3840, 2160];
  const pixels = randomBytes(w * h * 3);
  const content = 'q 1920 0 0 1080 0 0 cm /Im0 Do Q';
  const objects = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1920 1080] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'],
    [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`, pixels, '\nendstream'],
    [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  let length = parts[0].length;
  const offsets = objects.map((o, i) => {
    const at = length;
    for (const part of [`${i + 1} 0 obj\n`, ...o, '\nendobj\n']) {
      const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
      parts.push(bytes);
      length += bytes.length;
    }
    return at;
  });
  const xref = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(parts);
}

// a talk whose slide Two holds a PDF figure of pdf in both modes
async function figureTalk(t, pdf) {
  const server = await talk(t);
  leftover(server, 'figure.pdf', pdf);
  leftover(server, 'figure-dark.png', DARK);
  leftover(server, 'figure-light.png', LIGHT);
  writeOutside(server, '<img class="for-dark" src="media/figure-dark.png" data-pdf="media/figure.pdf" alt="A plot">\n  <img class="for-light" src="media/figure-light.png" data-pdf="media/figure.pdf" alt="A plot">');
  return server;
}

test('a render of a PDF figure over 16 MB is refused in a session with its reason, and the deck and media/ are kept', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await figureTalk(t, noisePdf());
  const ann = await tab(browser, sessionUrl(server.edit));
  const before = await converge(server, [ann]);
  const files = media(server);
  await show(ann, 'Two');
  await click(ann, await middle(ann, '.reveal .slides img[data-pdf]'));
  // without Match the Mode, the figure is one render of the noise in the colors of the PDF
  const answer = await run(ann, 'media.matchMode', 'undefined');
  assert.match(answer, /^figure\.png is larger than 16 MB/, answer);
  assert.equal(await converge(server, [ann]), before);
  assert.deepEqual(media(server), files);
  clean(ann);
});

// the paths of the files in the store of media of a page
const STORED = `[...${C}.shell.media.byPath.keys()].sort()`;

for (const refused of ['dark', 'light']) {
  test(`every render of a PDF figure is checked in a session before the deck is changed, and the reason of a refused one is given, here of the ${refused} render`, { timeout: 300_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await figureTalk(t, readFileSync(PDF));
    const ann = await tab(browser, sessionUrl(server.edit));
    const before = await converge(server, [ann]);
    const files = media(server);
    await show(ann, 'Two');
    await click(ann, await middle(ann, '.reveal .slides img[data-pdf]'));
    const stored = await ann.evaluate(STORED);
    await ann.evaluate(`${C}.shell.media.refuse = (file) => (file.name.endsWith(${JSON.stringify(`-${refused}.png`)}) ? 'refused by the test' : null), true`);
    assert.equal(await run(ann, 'media.pdfPage', '{ page: 2 }'), 'refused by the test');
    assert.deepEqual(await ann.evaluate(STORED), stored);
    assert.equal(await converge(server, [ann]), before);
    assert.deepEqual(media(server), files);
    clean(ann);
  });
}

test('a guest who changes Match the Mode of a PDF figure whose PDF is over 16 MB is told of the limit of the relay, and the deck is kept', { timeout: 360_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await figureTalk(t, noisePdf());
  const { url } = await relayed(t, server);
  const ann = await tab(browser, sessionUrl(server.edit));
  const gus = await open(browser, `${url}index.html?edit&session`, { name: 'Gus' });
  const before = await converge(server, [ann, gus]);
  await show(gus, 'Two');
  await click(gus, await middle(gus, '.reveal .slides img[data-pdf]'));
  assert.equal(await run(gus, 'media.matchMode', 'undefined'), 'media/figure.pdf cannot be read on this page, since it is larger than 16 MB, the limit of the relay of the session');
  assert.equal(await converge(server, [ann, gus]), before);
  clean(ann);
  clean(gus, [/status of 413 .*media\/figure\.pdf$/]);
});

// a page behind the relay without a session is answered 413 by the edit command as well
for (const how of ['left the session', 'edits another deck of the talk folder']) {
  test(`a guest who ${how} and changes Match the Mode of a PDF figure whose PDF is over 16 MB is told of the limit of the relay`, { timeout: 360_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await figureTalk(t, noisePdf());
    writeFileSync(join(server.talk, 'other.html'), server.read());
    const { url } = await relayed(t, server);
    const gus = await open(browser, `${url}${how.startsWith('left') ? 'index' : 'other'}.html?edit&session`, { name: 'Gus', wait: false });
    if (how.startsWith('left')) {
      await converge(server, [gus]);
      await gus.evaluate(`${C}.leave(), true`);
      await gus.waitFor(`${C}.connection === 'ended'`);
    } else {
      await gus.waitFor(`/not the deck of the session/.test(document.querySelector('dialog[open]')?.textContent ?? '')`);
      await gus.evaluate(`document.querySelector('dialog[open] button').click(), true`);
    }
    await show(gus, 'Two');
    await gus.waitFor(`[...document.querySelectorAll('.reveal .slides img[data-pdf]')].some((e) => e.getBoundingClientRect().width > 0)`);
    await click(gus, await middle(gus, '.reveal .slides img[data-pdf]'));
    const answer = await gus.evaluate(`window.BeesonEditor.exec('media.matchMode').then(() => 'taken', (e) => e.message)`);
    assert.equal(answer, 'media/figure.pdf cannot be read on this page, since it is larger than 16 MB, the limit of the relay of the session');
  });
}

test('the reason why a dropped file is not added is shown in full on a phone of 390 px and on a screen of 1280 px, and once in the title of a screen of 1440 px', { timeout: 360_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  // a TIFF, since a browser knows its type on every system. a HEIC is without a type on a Windows
  // that does not know it, and the editor then answers that it is not an image or a video
  const tiff = file(server, 'a', 'scan.tiff', Buffer.alloc(16));
  const big = file(server, 'a', 'big.png', Buffer.alloc(17 * 1024 * 1024));
  for (const [name, width, height, mobile] of [['Ann', 390, 844, true], ['Ben', 1280, 800, false], ['Cy', 1440, 900, false]]) {
    const page = await open(browser, sessionUrl(server.edit), { name, width, height, mobile });
    await show(page, 'Two');
    for (const [path, start] of [[tiff, 'scan.tiff cannot be sent'], [big, 'big.png is larger than 16 MB']]) {
      await dropFiles(page, [path]);
      await page.waitFor(`(${C}.app.note?.text ?? '').startsWith(${JSON.stringify(start)})`);
      const reason = await page.evaluate(`${C}.app.note.text`);
      await page.waitFor(`${SEEN(reason)} > 0`).catch(async () => assert.fail(`the reason is not seen in full at ${width} px: ${reason}. the save state reads ${await page.evaluate(STATE)}`));
      if (width === 1440) {
        const title = await page.evaluate(TITLE);
        assert.equal(title.split(reason).length - 1, 1, title);
        assert.doesNotMatch(title, /\.\./);
        // the save state draws the reason only while the title leaves out its state, which the
        // wider letters of Linux may need at 1440 px
        assert.equal(await page.evaluate(`document.querySelector('.beeson-session-state .name').getClientRects().length > 0`), await page.evaluate(`document.querySelector('.beeson-edit-titlebar .doc').classList.contains('tight')`));
      }
      assert.equal(await page.evaluate(IMAGES), 0);
    }
    assert.ok(!(await converge(server, [page])).includes('<img'));
    clean(page);
    await page.close();
  }
});

test('the reason why a dropped file is not added is no longer shown after the next edit, and the title bar has its height again', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann', width: 390, height: 844, mobile: true });
  await show(ann, 'Two');
  const bar = await ann.evaluate(BAR);
  await dropFiles(ann, [file(server, 'a', 'IMG_2041.heic', Buffer.alloc(16))]);
  await ann.waitFor(`(${C}.app.note?.text ?? '').startsWith('IMG_2041.heic')`);
  const reason = await ann.evaluate(`${C}.app.note.text`);
  await ann.waitFor(`${STATE} === ${JSON.stringify(reason)}`);
  await edit(ann, 1, 'p', ' typed');
  await ann.waitFor(`${C}.app.note === null && ${SEEN(reason)} === 0`);
  assert.notEqual(await ann.evaluate(STATE), reason);
  await ann.waitFor(`${BAR} === ${bar}`);
  assert.match(await converge(server, [ann]), /<p>Second slide typed<\/p>/);
  clean(ann);
});

test('the save state in the narrow title bar of a phone is on a line as tall as its letters', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann', width: 390, height: 844, mobile: true });
  await show(ann, 'Two');
  await ann.waitFor(`${STATE} === 'Saved to index.html'`);
  assert.ok(await ann.evaluate(`document.querySelector('.beeson-edit-titlebar').classList.contains('narrow')`));
  assert.equal(await ann.evaluate(SEEN('Saved to index.html')), 1);
  clean(ann);
});

test('a warning of the editor is shown in full at every width of the window, from 900 px up to the widths at which the title has room for it', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben', width: 900, height: 800 });
  await show(ben, 'Two');
  const reason = 'scan.tiff cannot be sent to the others, since a session does not take .tiff files. Save it as a PNG or a JPEG.';
  await ben.evaluate(`(${C}.app.note = { text: ${JSON.stringify(reason)}, warn: true }, ${C}.app.report(), true)`);
  // the width at which the title takes the warning from the save state depends on the font of the
  // system, hence every width is tried until the title has shown the warning at 40 widths in a row
  const cut = [];
  let roomy = 0;
  for (let width = 900; width <= 2600 && roomy < 40; width++) {
    await ben.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
    await ben.waitFor(`innerWidth === ${width}`);
    // the title is fitted in the frame of the resize, which is over after two animation frames
    const [seen, tight] = await ben.evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done([${SEEN(reason)}, document.querySelector('.beeson-edit-titlebar .doc').classList.contains('tight')]))))`);
    if (!seen) cut.push(width);
    roomy = tight ? 0 : roomy + 1;
  }
  assert.equal(roomy, 40, 'the title did not have room for the warning up to 2600 px');
  assert.deepEqual(cut, [], 'the widths at which the warning is cut');
  clean(ben);
});

test('a long reason in a narrow title bar scrolls inside its line, and the current slide stays inside the window of a phone of 320 px', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const ann = await open(browser, sessionUrl(server.edit), { width: 320, height: 700, mobile: true });
  await show(ann, 'Two');
  // the note of a paste of a slide that names 12 files that a session does not take
  const names = ['IMG_2041.heic', 'pic.tiff', 'saved.jfif', 'anim.apng', 'song.ogg', 'clip.mkv', 'doc.pdf', 'data.json', 'a.b.heic', 'PHOTO.HEIC', 'photo.', 'scan'];
  const note = names.map((n) => `figs/${n} was not copied: ${n} cannot be sent to the others, since a session does not take this file. Save a picture as a PNG or a JPEG, and a video as an MP4 or a WebM.`).join(' ');
  await ann.evaluate(`(${C}.app.note = { text: ${JSON.stringify(note)}, warn: true }, ${C}.app.report(), true)`);
  const NAME = `document.querySelector('.beeson-session-state .name')`;
  await ann.waitFor(`${NAME}.textContent === ${JSON.stringify(note)}`);
  const inside = await ann.evaluate(`(() => {
    const r = Reveal.getCurrentSlide().getBoundingClientRect();
    return r.height > 0 && r.top >= document.querySelector('.beeson-edit-titlebar').getBoundingClientRect().bottom && r.bottom <= innerHeight;
  })()`);
  assert.ok(inside, `the current slide is not inside the window under a title bar of ${await ann.evaluate(BAR)} px`);
  // the last word is inside the line and the window once a touch scrolls the line
  const LAST = `(() => {
    const el = ${NAME};
    const range = document.createRange();
    range.setStart(el.firstChild, el.firstChild.length - 'WebM.'.length);
    range.setEnd(el.firstChild, el.firstChild.length);
    const w = range.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return w.height > 0 && w.top >= r.top - 1 && w.bottom <= r.bottom + 1 && w.bottom <= innerHeight;
  })()`;
  assert.equal(await ann.evaluate(LAST), false);
  // a finger drags from the last line of the box up to its first line, again and again. the touch
  // events are sent one by one, as in the other tests of a touch, since a synthesized scroll
  // gesture did not move the line in the Chrome of the Linux and Windows runners
  const box = await ann.evaluate(`(() => { const r = ${NAME}.getBoundingClientRect(); return { x: r.left + r.width / 2, top: r.top + 6, bottom: r.bottom - 6 }; })()`);
  const touch = (type, y) => ann.send('Input.dispatchTouchEvent', { type, touchPoints: y === undefined ? [] : [{ x: box.x, y }] });
  await ann.evaluate(`(() => {
    window.__touches = {};
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) addEventListener(type, (ev) => { const k = type + (${NAME}.contains(ev.target) ? ' in the line' : ' outside'); window.__touches[k] = (window.__touches[k] ?? 0) + 1; }, { capture: true, passive: true });
  })()`);
  // what a failure needs to be read without the page: the box, what the finger hits, and the events
  const STUCK = `JSON.stringify((() => {
    const el = ${NAME};
    const cs = getComputedStyle(el);
    const hit = document.elementFromPoint(${box.x}, ${box.bottom});
    return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: cs.overflowY, maxHeight: cs.maxHeight, hit: hit ? hit.tagName + '.' + hit.className : null, touches: window.__touches };
  })())`;
  for (let drags = 0; !(await ann.evaluate(LAST)); drags++) {
    assert.ok(drags < 60, `the last word is not reached after 60 drags of the line: ${await ann.evaluate(STUCK)}`);
    const top = await ann.evaluate(`${NAME}.scrollTop`);
    await touch('touchStart', box.bottom);
    for (let i = 1; i <= 8; i++) await touch('touchMove', box.bottom + ((box.top - box.bottom) * i) / 8);
    await touch('touchEnd');
    await ann.waitFor(`${NAME}.scrollTop > ${top}`, 10_000).catch(async () => assert.fail(`a drag of a finger does not scroll the line: ${await ann.evaluate(STUCK)}`));
  }
  clean(ann);
});

test('an upload that stalls fails at its deadline, and Try again sends the picture and the edits after it', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const p = await proxy(t, server.edit);
  // the deadline shortened from 30 s to 1 s, to which 1 s per MB is added
  const ann = await tab(browser, `${p.url}&session-upload-wait=1000`);
  const before = server.read();
  p.next('stall');
  await show(ann, 'One');
  await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
  await edit(ann, 1, 'p', ' typed');
  await ann.waitFor(`${STATE} === ${JSON.stringify(FAILED('media/plot.png'))}`, 15_000);
  assert.equal(await ann.evaluate(ACTION), 'Try again');
  assert.equal(server.read(), before);
  await click(ann, '.beeson-session-action');
  const text = await converge(server, [ann]);
  assert.match(text, /<p>Second slide typed<\/p>/);
  assert.deepEqual(sources(text)[0], ['media/plot.png']);
  assert.equal(p.puts, 2);
  assert.equal(await ann.evaluate(STATE), 'Saved to index.html');
  clean(ann, PROXIED);
});

test('the save state of a failed upload is cleared once the deck no longer names the picture', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const p = await proxy(t, server.edit);
  const ann = await tab(browser, p.url);
  p.next('refuse');
  await show(ann, 'One');
  await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
  await ann.waitFor(`${STATE} === ${JSON.stringify(FAILED('media/plot.png'))}`);
  await keys(ann, 'Mod+Z');
  await ann.waitFor(`${IMAGES} === 0`);
  await edit(ann, 0, 'p', ' typed');
  await until(() => server.read().includes('<p>First slide typed</p>'), 'the edit in index.html');
  await ann.waitFor(`${STATE} === 'Saved to index.html'`, 10_000);
  assert.equal(await ann.evaluate(ACTION), null);
  clean(ann, PROXIED);
});

// the line of a file given up, which a guest cannot add to the talk folder of the host
const LOST = {
  host: 'media/plot.png is not in the talk folder, since the body is larger than the limit of the relay. Delete it from the deck, or add the file to media/ by hand and load the page again.',
  guest: 'media/plot.png is not in the talk folder, since the body is larger than the limit of the relay. Delete it from the deck, or ask the host to add the file to media/, then load the page again.',
};
const SECRET = 'a secret of the relay of the tests';

// the relay that the edit command of server shares the session through, with the port and the
// address of its session as edit of proxy() takes them, through which the page is a guest
async function relayed(t, server) {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const shared = await post(server.edit.port, `${server.edit.base}.session/share`, { relay: relay.url, secret: SECRET });
  assert.equal(shared.status, 200, shared.text);
  return { port: Number(new URL(relay.url).port), url: `${relay.url}/${server.edit.key}/` };
}

for (const who of ['host', 'guest']) {
  test(`an upload that the session refuses although the page of a ${who} did not is given up and named in the save state, and the later edits of the page reach index.html`, { timeout: 120_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    const p = await proxy(t, who === 'host' ? server.edit : await relayed(t, server));
    const ann = await tab(browser, p.url);
    assert.equal(await ann.evaluate(`${C}.host`), who === 'host');
    p.next('large');
    await show(ann, 'One');
    await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
    await ann.waitFor(`${STATE} === ${JSON.stringify(LOST[who])}`, 10_000);
    assert.equal(await ann.evaluate(ACTION), null);
    await edit(ann, 1, 'p', ' typed');
    const text = await converge(server, [ann]);
    assert.match(text, /<p>Second slide typed<\/p>/);
    assert.deepEqual(sources(text)[0], ['media/plot.png']);
    assert.equal(p.puts, 1);
    assert.equal(await ann.evaluate(STATE), LOST[who]);
    // the save state is cleared once the deck no longer names the picture
    await keys(ann, 'Mod+Z');
    await keys(ann, 'Mod+Z');
    await ann.waitFor(`${IMAGES} === 0`);
    await edit(ann, 0, 'p', ' typed');
    await until(() => server.read().includes('<p>First slide typed</p>'), 'the edit in index.html');
    await ann.waitFor(`${STATE} === ${JSON.stringify(who === 'host' ? 'Saved to index.html' : 'Saved')}`, 10_000);
    clean(ann, [/status of 413/]);
  });
}

test('the reason why a dropped file is not added follows the line of a file given up, in the save state of a phone of 390 px and in the title of a screen of 1440 px', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  for (const [width, height, mobile] of [[390, 844, true], [1440, 900, false]]) {
    const server = await talk(t);
    const p = await proxy(t, server.edit);
    const ann = await open(browser, p.url, { width, height, mobile });
    p.next('large');
    await show(ann, 'One');
    await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
    await ann.waitFor(`${STATE} === ${JSON.stringify(LOST.host)}`, 10_000);
    await dropFiles(ann, [file(server, 'b', 'IMG_2041.heic', Buffer.alloc(16))]);
    await ann.waitFor(`(${C}.app.note?.text ?? '').startsWith('IMG_2041.heic')`);
    const reason = await ann.evaluate(`${C}.app.note.text`);
    if (mobile) {
      await ann.waitFor(`${SEEN(LOST.host, true)} > 0 && ${SEEN(reason, true)} > 0`).catch(async () => assert.fail(`the line and the reason are not both read at ${width} px. the save state reads ${await ann.evaluate(STATE)}`));
    } else {
      // the title leaves out the final full stop of a part that another part follows
      await ann.waitFor(`${TITLE}.includes('IMG_2041.heic')`);
      const title = await ann.evaluate(TITLE);
      for (const part of [LOST.host, reason]) assert.equal(title.split(part.replace(/\.$/, '')).length - 1, 1, title);
      assert.doesNotMatch(title, /\.\./);
    }
    assert.equal(await ann.evaluate(ACTION), null);
    clean(ann, [/status of 413/]);
    await ann.close();
  }
});

test('the save state of an upload given up is cleared once another page deletes the picture, without an edit of the page', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const p = await proxy(t, server.edit);
  const ann = await tab(browser, p.url);
  p.next('large');
  await show(ann, 'One');
  await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
  await ann.waitFor(`${STATE}?.startsWith('media/plot.png ')`, 10_000);
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ann, ben]);
  await show(ben, 'One');
  await ben.evaluate(`(() => {
    const img = document.querySelector('.reveal .slides img');
    ${C}.app.selection.set('elements', [img.closest('figure') ?? img]);
    ${C}.app.commands.run('element.delete');
  })()`);
  const text = await converge(server, [ann, ben]);
  assert.doesNotMatch(text, /<img /);
  await front(ann);
  await ann.waitFor(`${STATE} === 'Saved to index.html'`, 10_000);
  clean(ann, [/status of 413/]);
  // the file given up is not in media/, which the page of Ben loads until the deletion
  clean(ben, [/status of 404 .*media\/plot\.png$/]);
});

test('an upload whose answer was lost after the write is sent again without a second copy in media/', { timeout: 120_000 }, async (t) => {
  await t.test('the page', async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    const p = await proxy(t, server.edit);
    const ann = await tab(browser, p.url);
    p.next('lose');
    await show(ann, 'One');
    await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
    await ann.waitFor(`${STATE} === ${JSON.stringify(FAILED('media/plot.png'))}`);
    assert.deepEqual(media(server), ['plot.png']);
    await click(ann, '.beeson-session-action');
    const text = await converge(server, [ann]);
    assert.deepEqual(sources(text)[0], ['media/plot.png']);
    assert.deepEqual(media(server), ['plot.png']);
    assert.equal(p.puts, 2);
    clean(ann, PROXIED);
  });

  await t.test('the edit command', async (t) => {
    const server = await talk(t);
    const { port, base } = server.edit;
    const { token } = (await post(port, `${base}.session/hello`, { name: 'Ann' })).json();
    const sha = (body) => createHash('sha256').update(body).digest('hex');
    const put = (name, body, hash) => raw(port, 'PUT', `${base}.session/media/${name}?token=${token}`, { body, headers: hash ? { 'x-content-sha256': hash } : {} });
    assert.deepEqual((await put('x.png', 'one', sha('one'))).json(), { path: 'media/x.png' });
    // the same bytes under the name, or under a numbered name of it, are answered without a write
    assert.deepEqual((await put('x.png', 'one', sha('one'))).json(), { path: 'media/x.png' });
    assert.deepEqual((await put('x.png', 'two', sha('two'))).json(), { path: 'media/x-2.png' });
    assert.deepEqual((await put('x.png', 'two', sha('two'))).json(), { path: 'media/x-2.png' });
    assert.deepEqual((await put('X.PNG', 'two', sha('two').toUpperCase())).json(), { path: 'media/x-2.png' });
    // without the header, a new name is given as before
    assert.deepEqual((await put('x.png', 'one')).json(), { path: 'media/x-3.png' });
    // a hash that is not the one of the body is refused
    assert.equal((await put('x.png', 'three', sha('one'))).status, 400);
    assert.deepEqual(media(server), ['x-2.png', 'x-3.png', 'x.png']);
  });
});

test('an upload cut on the network is sent again once the page is online again, without Try again', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const p = await proxy(t, server.edit);
  const ann = await tab(browser, p.url);
  p.down = true;
  await show(ann, 'One');
  await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
  await ann.waitFor(`${STATE} === ${JSON.stringify(FAILED('media/plot.png'))}`);
  p.down = false;
  await goOffline(ann);
  await ann.waitFor(`${C}.connection === 'offline'`);
  await goOnline(ann);
  // the page is online again once a poll is answered, which a page that joins makes happen at once
  await post(server.edit.port, `${server.edit.base}.session/hello`, { name: 'Ben' });
  const text = await converge(server, [ann]);
  assert.deepEqual(sources(text)[0], ['media/plot.png']);
  assert.ok(disk(server, 'media/plot.png').equals(LIGHT));
  assert.equal(await ann.evaluate(STATE), 'Saved to index.html');
  clean(ann, PROXIED);
});

test('an upload refused by an edit command that started again, before the hello of the page, is sent again without Try again', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const port = server.edit.port;
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann', script: NET });
  await converge(server, [ann]);
  // every hello of Ann is held, hence her upload reaches the new edit command before her hello
  await ann.evaluate(`(__net.rule('/.session/hello', 'hold'), true)`);
  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  await ann.waitFor(`${C}.connection === 'offline'`);
  await server.start(['--port', String(port)]);
  await show(ann, 'One');
  await dropFiles(ann, [file(server, 'a', 'plot.png', LIGHT)]);
  await ann.waitFor(`__net.count('/.session/media/', 'PUT', 404) === 1`);
  await ann.evaluate(`(__net.clear(), __net.release('/.session/hello'), ${C}.tryNow(), true)`);
  const text = await converge(server, [ann]);
  assert.deepEqual(sources(text)[0], ['media/plot.png']);
  assert.equal(await ann.evaluate(`__net.count('/.session/media/', 'PUT')`), 2);
  // people.json is written at most once a second, hence a killed edit command may not know Ann
  // after its start. her hello without a name is then answered 400, and sent again with her name
  clean(ann, [/status of 404/, /status of 400 .*\/\.session\/hello$/, /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/]);
});
