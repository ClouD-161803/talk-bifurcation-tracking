// the pictures of a session in Chrome: a name of the edit command written only into the edits of
// the page that uploaded the file, a name unique to the page while another page is in the session,
// the store of the page keyed by the new name, undo and redo after a rename, the limits of a
// picture and a video, the deadline of an upload, the save state after the picture of a failed
// upload is removed, an upload whose answer was lost sent again without a second copy, and an upload
// cut on the network sent again at a reconnect. the uploads of a page are sent through a proxy of
// the test, by which they are held, stalled, cut, or refused

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { front } from './helpers/apply.mjs';
import { C, clean, converge, open, sessionUrl, show, STATE, talk, TEXT } from './helpers/client.mjs';
import { click, press as keys } from './helpers/editor.mjs';
import { ACTION, dropFiles, edit, goOffline, goOnline, SHOWN, tab } from './helpers/offline.mjs';
import { post, raw, until } from './helpers/session.mjs';

const LIGHT = readFileSync(resolve('demo/figure-light.png'));
const DARK = readFileSync(resolve('demo/figure-dark.png'));
const FAILED = 'A picture could not be sent. Try again';
const IMG = /<img [^>]*src="(media\/[^"]+)"[^>]*>/g;
// the media/ paths of the images of each slide of text
const sources = (text) => text.split('<section').slice(1).map((s) => [...s.matchAll(IMG)].map((m) => m[1]));
// whether the image of the page with alt is shown from path and loaded
const SHOWN_ALT = (alt, path) => `(() => { const i = document.querySelector('.reveal .slides img[alt=${JSON.stringify(alt)}]'); return !!i && i.getAttribute('src') === ${JSON.stringify(path)} && i.complete && i.naturalWidth > 0; })()`;
// the number of images in the deck as the page reads it
const IMAGES = `(${TEXT}.match(/<img /g) ?? []).length`;
// the errors in the console of a page for an upload that the proxy refused, cut, or lost
const PROXIED = [/status of 50[04]/, /ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET|Failed to fetch/];

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
 * its connection is closed. With refuse it is answered 500 without being forwarded, and with lose
 * it is forwarded and answered 504 once the edit command has answered. While down is set, every
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
    await bea.waitFor(`${STATE} === ${JSON.stringify(FAILED)}`);
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

test('a picture over 16 MB is refused on the host as well, and a video of the host up to 64 MB is not', { timeout: 120_000 }, async (t) => {
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
  await ann.waitFor(`${STATE} === ${JSON.stringify(FAILED)}`, 15_000);
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
  await ann.waitFor(`${STATE} === ${JSON.stringify(FAILED)}`);
  await keys(ann, 'Mod+Z');
  await ann.waitFor(`${IMAGES} === 0`);
  await edit(ann, 0, 'p', ' typed');
  await until(() => server.read().includes('<p>First slide typed</p>'), 'the edit in index.html');
  await ann.waitFor(`${STATE} === 'Saved to index.html'`, 10_000);
  assert.equal(await ann.evaluate(ACTION), null);
  clean(ann, PROXIED);
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
    await ann.waitFor(`${STATE} === ${JSON.stringify(FAILED)}`);
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
  await ann.waitFor(`${STATE} === ${JSON.stringify(FAILED)}`);
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
