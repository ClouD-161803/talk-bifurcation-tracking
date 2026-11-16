// the client of a session in Chrome when its page goes away right after an edit: a page closed
// without the question, as Safari on an iPhone and Chrome on Android close a tab, and a page hidden
// and frozen, as a phone suspends it in the app switcher. a proxy in front of the edit command holds
// the operations until Chrome has cancelled the requests of a closed page, which it does not do to
// a request sent with keepalive

import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, open, ops, sessionUrl, show, talk, TALK } from './helpers/client.mjs';
import { type } from './helpers/editor.mjs';
import { el, tab } from './helpers/offline.mjs';
import { until } from './helpers/session.mjs';

/**
 * A proxy on 127.0.0.1 in front of the edit command edit, whose url serves the deck of the session.
 * While hold() is on, each operation waits until release(), and is sent on only when the browser
 * still waits for its answer. A request whose path ends in /canary or /filler waits until the
 * browser cancels it, and parked.canary and parked.filler are their records, with gone set once
 * the browser cancelled it. held holds the operations that wait, and sent the bodies of the
 * operations sent on.
 */
async function proxy(t, edit) {
  const net = { parked: {}, held: [], sent: [], holding: false, url: '' };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const r = { body: body.toString('utf8'), gone: false };
      res.on('close', () => (r.gone = !res.writableEnded));
      r.go = () => {
        if (req.url.includes('/.session/op')) net.sent.push(r.body);
        const out = request({ host: '127.0.0.1', port: edit.port, method: req.method, path: req.url, agent: false, headers: { ...req.headers, host: `127.0.0.1:${edit.port}` } }, (answer) => {
          res.writeHead(answer.statusCode, answer.headers);
          answer.pipe(res);
        });
        out.on('error', () => res.destroy());
        res.on('close', () => out.destroy());
        out.end(body);
      };
      const parked = /\/(canary|filler)$/.exec(req.url);
      if (parked) net.parked[parked[1]] = r;
      else if (net.holding && req.url.includes('/.session/op')) net.held.push(r);
      else r.go();
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((done) => server.close(done));
  });
  net.url = `http://127.0.0.1:${server.address().port}${edit.base}index.html?edit&session`;
  net.hold = () => (net.holding = true);
  net.release = () => {
    net.holding = false;
    for (const r of net.held.splice(0)) if (!r.gone) r.go();
  };
  return net;
}

// a request of the page that the proxy holds until Chrome cancels it, i.e. until the page is torn down
async function canary(page, net) {
  await page.evaluate(`void fetch('canary').catch(() => {}), true`);
  await until(() => net.parked.canary, 'the proxy to hold the canary');
}

// the page draws no frame and runs no timer from now on, as in the last frame before a phone
// suspends it, hence a key is read only when the page is hidden or closed
async function still(page) {
  await page.evaluate('(window.requestAnimationFrame = () => 0), true');
  await page.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
}

// the requests of the closed page are cancelled, and the operations that Chrome still sends go on
async function closed(page, net) {
  await page.close();
  await until(() => net.parked.canary.gone, 'Chrome to cancel the requests of the closed page');
  net.release();
}

test('a word typed right before the page is closed without the question reaches index.html once', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const net = await proxy(t, server.edit);
  const page = await tab(browser, net.url);
  await converge(server, [page]);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  net.hold();
  await canary(page, net);
  await still(page);
  await type(page, ' closed');
  await closed(page, net);
  const want = TALK.replace('<p>First slide</p>', '<p>First slide closed</p>');
  await until(() => server.read() === want, 'the word to reach index.html');
  assert.equal(net.sent.filter((b) => b.includes('closed')).length, 1);
  // the next page of the browser takes over the copy of the closed page, which may hold the word too
  const next = await tab(browser, net.url);
  assert.equal(await converge(server, [next]), want);
  clean(next);
});

test('a word typed right before the page is hidden and frozen reaches index.html', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const net = await proxy(t, server.edit);
  const page = await open(browser, net.url);
  await converge(server, [page]);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  net.hold();
  await canary(page, net);
  await still(page);
  await type(page, ' hidden');
  // Chrome hides the page before it freezes it
  await page.send('Page.setWebLifecycleState', { state: 'frozen' });
  await until(() => net.held.some((r) => r.body.includes('hidden')), 'the frozen page to have sent the word');
  await closed(page, net);
  await until(() => server.read() === TALK.replace('<p>First slide</p>', '<p>First slide hidden</p>'), 'the word to reach index.html');
});

// a script for open() that records in window.__kept whether each operation was sent with keepalive,
// and the size of its body in bytes
const KEPT = `{
  const fetched = window.fetch;
  window.__kept = [];
  window.fetch = function (input, init) {
    if (String(input).includes('/.session/op')) window.__kept.push({ keepalive: !!init.keepalive, bytes: new Blob([init.body]).size });
    return fetched.call(this, input, init);
  };
}`;

test('an operation is sent with keepalive only under 60,000 bytes in UTF-8, and a larger paste reaches index.html in one request', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit), { script: KEPT });
  await converge(server, [page]);
  // operations of a token that the edit command does not know, which it answers without a change.
  // an é is one character and two bytes
  const sent = await page.evaluate(`(async () => {
    window.__kept = [];
    for (const n of [59999, 60000]) {
      const post = { token: 'none', seq: 1, base: '0', patches: [{ start: 0, end: 0, text: '' }] };
      const more = n - new Blob([JSON.stringify(post)]).size;
      post.patches[0].text = 'é'.repeat(more >> 1) + 'e'.repeat(more & 1);
      await ${C}.transport.op(post);
    }
    return window.__kept.splice(0);
  })()`);
  assert.deepEqual(sent, [{ keepalive: true, bytes: 59999 }, { keepalive: false, bytes: 60000 }]);

  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  const before = await ops(page);
  const paste = ` ${'é'.repeat(35_000)}`;
  await type(page, paste);
  await until(() => server.read() === TALK.replace('<p>First slide</p>', `<p>First slide${paste}</p>`), 'the paste to reach index.html');
  assert.equal((await ops(page)) - before, 1);
  assert.deepEqual(await page.evaluate('window.__kept.map((k) => k.keepalive)'), [false]);
  clean(page);
});

test('an operation that the browser refuses with keepalive is sent again without it, and once only', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const net = await proxy(t, server.edit);
  const page = await open(browser, net.url);
  await converge(server, [page]);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  // a body with keepalive in flight that leaves less than an operation of the 64 KiB that the
  // browsers allow
  await page.evaluate(`void fetch('filler', { method: 'POST', body: 'x'.repeat(65500), keepalive: true }).catch(() => {}), true`);
  await until(() => net.parked.filler, 'the proxy to hold the filler');
  const before = await ops(page);
  await type(page, ' refused');
  await until(() => server.read() === TALK.replace('<p>First slide</p>', '<p>First slide refused</p>'), 'the word to reach index.html');
  assert.equal((await ops(page)) - before, 2);
  assert.equal(net.sent.filter((b) => b.includes('refused')).length, 1);
  clean(page);
});

test('a page that is hidden without a key that it has not read does not read the deck', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit));
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' read');
  await converge(server, [page]);
  // a read renders the whole deck after an edit, which is slow on a slow machine
  await page.evaluate(`(() => {
    const port = ${C}.port;
    const text = port.text.bind(port);
    window.__reads = 0;
    port.text = () => (window.__reads++, text());
    return true;
  })()`);
  const other = await browser.newPage({ width: 1280, height: 800 });
  await front(other);
  await page.waitFor('document.hidden');
  assert.equal(await page.evaluate('window.__reads'), 0);
  clean(page);
});
