import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { connect, createServer as createTcpServer } from 'node:net';
import { test } from 'node:test';
import v8 from 'node:v8';
import vm from 'node:vm';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, ONLINE, open, ops, sessionUrl, show, talk, TALK } from './helpers/client.mjs';
import { type } from './helpers/editor.mjs';
import { copied, el, released, ROWS, rows, tab } from './helpers/offline.mjs';
import { post, raw, until } from './helpers/session.mjs';
import { Transport } from '../src/session/client/transport.ts';

async function proxy(t, edit) {
  const net = { parked: {}, held: [], answers: [], sent: [], holding: null, url: '' };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const r = { url: req.url, body: body.toString('utf8'), gone: false, answered: false };
      res.on('close', () => (r.gone = !res.writableEnded));
      r.go = () => {
        if (req.url.includes('/.session/op')) net.sent.push(r.body);
        const out = request({ host: '127.0.0.1', port: edit.port, method: req.method, path: req.url, agent: false, headers: { ...req.headers, host: `127.0.0.1:${edit.port}` } }, (answer) => {
          const pass = () => {
            res.writeHead(answer.statusCode, answer.headers);
            answer.on('end', () => (r.answered = true));
            answer.pipe(res);
          };
          if (net.holding && req.url.includes('/.session/events')) net.answers.push(pass);
          else pass();
        });
        out.on('error', () => res.destroy());
        res.on('close', () => out.destroy());
        out.end(body);
      };
      const parked = /\/(canary|filler)$/.exec(req.url);
      if (parked) net.parked[parked[1]] = r;
      else if (net.holding?.(r)) net.held.push(r);
      else r.go();
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((done) => server.close(done));
  });
  net.url = `http://127.0.0.1:${server.address().port}${edit.base}index.html?edit&session`;
  net.hold = (match = (r) => r.url.includes('/.session/op')) => (net.holding = match);
  net.release = () => {
    net.holding = null;
    for (const r of net.held.splice(0)) if (!r.gone) r.go();
    for (const pass of net.answers.splice(0)) pass();
  };
  return net;
}

async function canary(page, net) {
  await page.evaluate(`void fetch('canary').catch(() => {}), true`);
  await until(() => net.parked.canary, 'the proxy to hold the canary');
}

async function still(page) {
  await page.evaluate('(window.requestAnimationFrame = () => 0), true');
  await page.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
}

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
  assert.equal(net.held.length, 0, 'the word is sent at the close');
  await closed(page, net);
  await until(() => server.read() === TALK.replace('<p>First slide</p>', '<p>First slide closed</p>'), 'the word to reach index.html');
  assert.equal(net.sent.filter((b) => b.includes('closed')).length, 1);
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
  assert.equal(net.held.length, 0, 'the word is sent at the hide');
  await page.send('Page.setWebLifecycleState', { state: 'frozen' });
  await until(() => net.held.some((r) => r.body.includes('hidden')), 'the frozen page to have sent the word');
  await closed(page, net);
  await until(() => server.read() === TALK.replace('<p>First slide</p>', '<p>First slide hidden</p>'), 'the word to reach index.html');
});

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
  const page = await open(browser, net.url, { script: KEPT });
  await converge(server, [page]);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await page.evaluate(`void fetch('filler', { method: 'POST', body: 'x'.repeat(8000), keepalive: true }).catch(() => {}), true`);
  await until(() => net.parked.filler, 'the proxy to hold the filler');
  const before = await ops(page);
  const word = ` refused${'€'.repeat(19_500)}`;
  await type(page, word);
  await until(() => server.read() === TALK.replace('<p>First slide</p>', `<p>First slide${word}</p>`), 'the word to reach index.html');
  assert.equal((await ops(page)) - before, 2);
  assert.deepEqual(await page.evaluate('window.__kept.map((k) => k.keepalive && k.bytes < 60_000)'), [true, false]);
  assert.equal(net.sent.filter((b) => b.includes('refused')).length, 1);
  clean(page);
});

function failOnce() {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push(!!init.keepalive);
    if (sent.length === 1) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ ok: true, v: '0' }));
  };
  return sent;
}
const opPost = (text) => ({ token: 't', seq: 1, base: '0', patches: [{ start: 0, end: 0, text }] });
const answered = async (transport, post) => {
  for (;;) if (await transport.op(post).then(() => true, () => false)) return;
};

function postOf(chars, bytes = chars) {
  const post = opPost('');
  post.patches[0].text = 'a'.repeat(chars - (bytes - chars) - JSON.stringify(post).length) + 'é'.repeat(bytes - chars);
  return post;
}

test('an operation is sent with keepalive under 60,000 bytes in UTF-8, and its bytes are counted only for a body of 20,000 to 59,999 characters', async (t) => {
  const fetched = globalThis.fetch;
  const Made = globalThis.Blob;
  t.after(() => ((globalThis.fetch = fetched), (globalThis.Blob = Made)));
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ chars: init.body.length, bytes: Buffer.byteLength(init.body), keepalive: !!init.keepalive });
    return new Response(JSON.stringify({ ok: true, v: '0' }));
  };
  let blobs = 0;
  globalThis.Blob = class extends Made {
    constructor(...args) {
      super(...args);
      blobs++;
    }
  };
  const transport = new Transport('http://127.0.0.1/index.html');
  for (const post of [postOf(19_999), postOf(20_000), postOf(59_999), postOf(30_100, 59_999), postOf(30_100, 60_000), postOf(60_000)]) {
    const before = blobs;
    await transport.op(post);
    sent.at(-1).counted = blobs > before;
  }
  assert.deepEqual(sent, [
    { chars: 19_999, bytes: 19_999, keepalive: true, counted: false },
    { chars: 20_000, bytes: 20_000, keepalive: true, counted: true },
    { chars: 59_999, bytes: 59_999, keepalive: true, counted: true },
    { chars: 30_100, bytes: 59_999, keepalive: true, counted: true },
    { chars: 30_100, bytes: 60_000, keepalive: false, counted: true },
    { chars: 60_000, bytes: 60_000, keepalive: false, counted: false },
  ]);
});

test('an operation after a failed and answered one is sent with keepalive again', async (t) => {
  const fetched = globalThis.fetch;
  t.after(() => (globalThis.fetch = fetched));
  const sent = failOnce();
  const transport = new Transport('http://127.0.0.1/index.html');
  await answered(transport, opPost('a'));
  await answered(transport, opPost('b'));
  assert.deepEqual(sent, [true, false, true]);
});

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

test('a large operation that failed is not kept by the transport once it is answered', async (t) => {
  const fetched = globalThis.fetch;
  t.after(() => (globalThis.fetch = fetched));
  const sent = failOnce();
  const transport = new Transport('http://127.0.0.1/index.html');
  let post = opPost('x'.repeat(3_000_000));
  const ref = new WeakRef(post);
  await answered(transport, post);
  post = null;
  for (let i = 0; i < 5 && ref.deref(); i++) {
    await new Promise((done) => setImmediate(done));
    gc();
  }
  assert.deepEqual(sent, [false, false]);
  assert.equal(ref.deref(), undefined);
});

test('a page that is hidden without a key that it has not read does not read the deck', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit));
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' read');
  await converge(server, [page]);
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

test('a page hidden right after a key reads the deck once for this key', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit));
  await converge(server, [page]);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await page.evaluate(`(() => {
    const port = ${C}.port;
    const text = port.text.bind(port);
    window.__reads = 0;
    port.text = () => (window.__reads++, text());
    return true;
  })()`);
  await still(page);
  await type(page, ' once');
  const other = await browser.newPage({ width: 1280, height: 800 });
  await front(other);
  await page.waitFor('document.hidden');
  await page.evaluate('setTimeout(() => (window.__later = true), 2000), true');
  await page.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 10_000 });
  await page.waitFor('window.__later === true');
  assert.equal(await page.evaluate('window.__reads'), 1);
});

const count = (text, word) => text.split(word).length - 1;
const served = async (server) => (await raw(server.edit.port, 'GET', `${server.edit.base}index.html`)).text;
const probeOf = async (browser, url) => {
  const probe = await browser.newPage({ width: 640, height: 480 });
  await probe.goto(url.replace(/\?.*/, ''));
  return probe;
};

for (const late of [true, false]) {
  test(`a word in the copy of a closed page reaches index.html once when the operation of the page arrives ${late ? 'after the next page has joined' : 'before the next page joins'}`, { timeout: 360_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    const net = await proxy(t, server.edit);
    const page = await tab(browser, net.url);
    const probe = await probeOf(browser, net.url);
    await converge(server, [page]);
    await show(page, 'One');
    await caretAtEnd(page, el(0, 'p'));
    net.hold();
    await canary(page, net);
    await type(page, ' both');
    await until(() => net.held.some((r) => r.body.includes('both')), 'the operation to be held');
    const id = await copied(page, ' both');
    const [op] = net.held;
    await page.close();
    await until(() => net.parked.canary.gone, 'Chrome to cancel the requests of the closed page');
    await released(probe, id);
    net.holding = null;
    if (!late) net.release();
    await until(() => late || op.answered, 'the answer of the operation of the closed page');
    const next = await tab(browser, net.url);
    await converge(server, [next]);
    net.release();
    await until(() => op.answered, 'the answer of the operation of the closed page');
    assert.equal(count(await served(server), ' both'), 1);
    assert.equal(await converge(server, [next]), TALK.replace('<p>First slide</p>', '<p>First slide both</p>'));
    clean(next);
  });
}

test('a word of a closed page whose operation is in flight reaches index.html once, also when the operation arrives after the next page has joined', { timeout: 300_000 }, async (t) => {
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
  await type(page, ' alone');
  await page.close();
  await until(() => net.parked.canary.gone, 'Chrome to cancel the requests of the closed page');
  const [op] = net.held;
  assert.ok(op?.body.includes('alone'), 'the closed page sent its operation');
  net.holding = null;
  const next = await tab(browser, net.url);
  await converge(server, [next]);
  await next.waitFor(`(${ROWS}).then((r) => r.length === 0)`);
  net.release();
  const want = TALK.replace('<p>First slide</p>', '<p>First slide alone</p>');
  await until(() => server.read() === want, 'the word to reach index.html');
  assert.equal(await converge(server, [next]), want);
  clean(next);
});

for (const how of ['is closed', 'crashes']) {
  test(`a word in the copy of a closed page reaches index.html once when the page that takes over the copy ${how} before its hello is answered`, { timeout: 420_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    const net = await proxy(t, server.edit);
    const first = await tab(browser, net.url);
    const probe = await probeOf(browser, net.url);
    await converge(server, [first]);
    await show(first, 'One');
    await caretAtEnd(first, el(0, 'p'));
    net.hold();
    await canary(first, net);
    await type(first, ' both');
    await until(() => net.held.some((r) => r.body.includes('both')), 'the operation to be held');
    const id = await copied(first, ' both');
    const [op] = net.held;
    await first.close();
    await until(() => net.parked.canary.gone, 'Chrome to cancel the requests of the closed page');
    await released(probe, id);
    net.hold((r) => r.url.includes('/.session/hello'));
    const second = await tab(browser, net.url, { wait: false });
    await until(() => net.held.some((r) => r.url.includes('/.session/hello')), 'the hello of the second page to be held');
    const kept = await until(async () => (await rows(probe)).find((r) => r.id !== id && r.mine.includes(' both'))?.id, 'the second page to keep the copy under its own record');
    if (how === 'crashes') void second.send('Page.crash').catch(() => {});
    else await second.close();
    await released(probe, kept);
    net.holding = null;
    const third = await tab(browser, net.url);
    await converge(server, [third]);
    net.release();
    if (op.gone) await post(server.edit.port, `${server.edit.base}.session/op`, op.body);
    else await until(() => op.answered, 'the answer of the operation of the first page');
    assert.equal(count(await served(server), ' both'), 1);
    assert.equal(await converge(server, [third]), TALK.replace('<p>First slide</p>', '<p>First slide both</p>'));
    clean(third);
  });
}

async function closedWithWord(browser, server, net) {
  const first = await tab(browser, net.url);
  const probe = await probeOf(browser, net.url);
  await converge(server, [first]);
  await show(first, 'One');
  await caretAtEnd(first, el(0, 'p'));
  net.hold();
  await canary(first, net);
  await type(first, ' both');
  await until(() => net.held.some((r) => r.body.includes('both')), 'the operation to be held');
  const id = await copied(first, ' both');
  const [op] = net.held;
  await first.close();
  await until(() => net.parked.canary.gone, 'Chrome to cancel the requests of the closed page');
  await released(probe, id);
  net.holding = null;
  return { probe, op, id };
}

const HOLD = `new Promise((done) => {
  const r = indexedDB.open('beeson-session', 1);
  r.onsuccess = () => {
    const s = r.result.transaction('copies', 'readwrite').objectStore('copies');
    const spin = () => { if (!window.__done) s.get('none').onsuccess = spin; };
    spin();
    done(true);
  };
})`;
const READS = `{
  const getAll = IDBObjectStore.prototype.getAll;
  window.__reads = 0;
  IDBObjectStore.prototype.getAll = function (...args) {
    window.__reads++;
    return getAll.apply(this, args);
  };
}`;

test('two pages that load at the same moment take over the copy of a closed page once, and its word reaches index.html once', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const net = await proxy(t, server.edit);
  const { probe, op } = await closedWithWord(browser, server, net);
  await probe.evaluate(HOLD);
  const pages = await Promise.all([0, 1].map(() => tab(browser, net.url, { script: READS, wait: false })));
  for (const page of pages) await page.waitFor('window.__reads > 0');
  await probe.evaluate('(window.__done = true)');
  await converge(server, pages);
  net.release();
  await until(() => op.answered, 'the answer of the operation of the closed page');
  assert.equal(count(await served(server), ' both'), 1);
  for (const page of pages) clean(page);
});

const QUERY = `{
  const query = LockManager.prototype.query;
  let go;
  const held = new Promise((done) => (go = done));
  window.__go = () => (go(), true);
  LockManager.prototype.query = function () {
    const answer = query.call(this);
    if (window.__queried) return answer;
    window.__queried = true;
    return answer.then((a) => held.then(() => a));
  };
}`;

test('a page that loads does not take over the copy of a page that opened after it read the locks', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const net = await proxy(t, server.edit);
  const late = await tab(browser, net.url, { script: QUERY, wait: false });
  await late.waitFor('window.__queried === true');
  const page = await tab(browser, net.url);
  await converge(server, [page]);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  net.hold();
  await type(page, ' live');
  await until(() => net.held.some((r) => r.body.includes('live')), 'the operation to be held');
  await copied(page, ' live');
  const [op] = net.held;
  net.holding = null;
  await late.evaluate('window.__go()');
  await late.waitFor(ONLINE);
  net.release();
  await until(() => op.answered, 'the answer of the operation of the open page');
  assert.equal(await converge(server, [page, late]), TALK.replace('<p>First slide</p>', '<p>First slide live</p>'));
  clean(page);
  clean(late);
});

test('a page takes over the copies of closed pages only while it names at most 16 tokens, and leaves the others to the next load', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const net = await proxy(t, server.edit);
  const { probe, op, id } = await closedWithWord(browser, server, net);
  await probe.evaluate(`new Promise((done, fail) => {
    const r = indexedDB.open('beeson-session', 1);
    r.onsuccess = () => {
      const t = r.result.transaction('copies', 'readwrite');
      const s = t.objectStore('copies');
      s.get(${JSON.stringify(id)}).onsuccess = (e) => {
        const a = e.target.result;
        for (let i = 10; i < 26; i++) s.put({ ...a, id: '!' + i, mine: a.base, files: [], beat: a.beat - 1000 - i, tokens: ['fake' + i + 'x'.repeat(16)] });
      };
      t.oncomplete = () => (r.result.close(), done(true));
      t.onerror = () => fail(t.error);
    };
  })`);
  const next = await tab(browser, net.url);
  await converge(server, [next]);
  net.release();
  await until(() => op.answered, 'the answer of the operation of the closed page');
  assert.equal(count(await served(server), ' both'), 1);
  await probe.waitFor(`(${ROWS}).then((r) => r.map((x) => x.id).join() === ${JSON.stringify(id)})`);
  clean(next);
});

test('a word in the copy of a closed page reaches index.html once when the page that takes over the copy crashes after its join, before its next write of the copy', { timeout: 360_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const net = await proxy(t, server.edit);
  const { probe, op } = await closedWithWord(browser, server, net);
  net.hold();
  const second = await tab(browser, net.url, { script: 'window.setInterval = () => 0;' });
  const token = await second.evaluate(`${C}.token`);
  await until(() => net.held.some((r) => r.body.includes(token) && r.body.includes('both')), 'the operation of the second page to be held');
  const opB = net.held.find((r) => r.body.includes(token));
  await second.evaluate(`new Promise((done) => {
    const r = indexedDB.open('beeson-session', 1);
    r.onsuccess = () => {
      const t = r.result.transaction('copies', 'readwrite');
      t.objectStore('copies').get('none');
      t.oncomplete = () => (r.result.close(), done(true));
    };
  })`);
  delete net.parked.canary;
  await canary(second, net);
  void second.send('Page.crash').catch(() => {});
  await until(() => net.parked.canary.gone, 'Chrome to cancel the requests of the second page');
  await released(probe, (await rows(probe)).find((r) => r.mine.includes(' both')).id);
  net.holding = null;
  const third = await tab(browser, net.url);
  await converge(server, [third]);
  net.release();
  if (opB.gone) await post(server.edit.port, `${server.edit.base}.session/op`, opB.body);
  else await until(() => opB.answered, 'the answer of the operation of the second page');
  await until(() => op.answered, 'the answer of the operation of the first page');
  assert.equal(count(await served(server), ' both'), 1);
  assert.equal(await converge(server, [third]), TALK.replace('<p>First slide</p>', '<p>First slide both</p>'));
  clean(third);
});

async function deadConnection(t, edit) {
  const net = { token: null, lost: false, resent: false, answered: false, copies: [], url: '', cut: () => {} };
  const server = createTcpServer((client) => {
    const upstream = connect(edit.port, '127.0.0.1');
    let pending = null;
    let swallowed = false;
    let late = false;
    client.on('data', (raw) => {
      const chunk = Buffer.from(raw.toString('latin1').replace(`Host: 127.0.0.1:${server.address().port}`, `Host: 127.0.0.1:${edit.port}`), 'latin1');
      if (swallowed) return;
      if (!pending && net.token && /^POST [^ ]*[.]session[/]op/.test(chunk.toString('latin1'))) pending = [];
      if (!pending) return void upstream.write(chunk);
      pending.push(chunk);
      const all = Buffer.concat(pending).toString('utf8');
      const body = all.split('\r\n\r\n')[1] ?? '';
      if (Buffer.byteLength(body) < Number(/content-length: (\d+)/i.exec(all)?.[1] ?? -1)) return;
      if (body.includes(net.token) && !net.lost) {
        swallowed = net.lost = true;
        net.cut = () => client.destroy();
      } else {
        if (body.includes(net.token)) late = net.resent = true;
        else if (body.includes(' both')) net.copies.push(body);
        for (const c of pending) upstream.write(c);
      }
      pending = null;
    });
    upstream.on('data', (chunk) => {
      if (late) net.answered = true;
      if (!client.destroyed) client.write(chunk);
    });
    client.on('close', () => upstream.destroy());
    client.on('error', () => {});
    upstream.on('error', () => swallowed || client.destroy());
    upstream.on('close', () => swallowed || client.destroy());
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise((done) => server.close(done)));
  net.url = `http://127.0.0.1:${server.address().port}${edit.base}index.html?edit&session`;
  return net;
}

for (const how of ['closed', 'loaded again']) {
  test(`a word in the copy of a page ${how} reaches index.html once when Chrome sends the operation of the page again after the next page has joined`, { timeout: 360_000 }, async (t) => {
    const browser = await launch({ offline: false });
    t.after(() => browser.close());
    const server = await talk(t);
    const net = await deadConnection(t, server.edit);
    let page = await tab(browser, net.url);
    await converge(server, [page]);
    await show(page, 'One');
    await caretAtEnd(page, el(0, 'p'));
    net.token = await page.evaluate(`${C}.token`);
    await type(page, ' both');
    await until(() => net.lost, 'the operation to be lost');
    const id = await copied(page, ' both');
    if (how === 'closed') {
      const probe = await probeOf(browser, net.url);
      await page.close();
      await released(probe, id);
      page = await tab(browser, net.url);
    } else {
      await page.evaluate('(window.__before = true)');
      await page.send('Page.reload', {});
      await page.waitFor(`!window.__before && !!window.BeesonEditor && window.BeesonEditor.ready.then(() => ${ONLINE})`, 30_000);
    }
    await converge(server, [page]);
    assert.equal(net.copies.length, 1, 'the next page sent the copy');
    net.cut();
    await until(() => net.answered, 'Chrome to send the operation again and the edit command to answer it', 60_000);
    assert.equal(count(await served(server), ' both'), 1);
    assert.equal(await converge(server, [page]), TALK.replace('<p>First slide</p>', '<p>First slide both</p>'));
  });
}

test('a page whose token is retired while it is open joins again and sends its edit once', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const page = await open(browser, sessionUrl(server.edit));
  await converge(server, [page]);
  const token = await page.evaluate(`${C}.token`);
  await post(server.edit.port, `${server.edit.base}.session/hello`, { name: 'Gus', retire: [token] });
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  await type(page, ' alive');
  assert.equal(await converge(server, [page]), TALK.replace('<p>First slide</p>', '<p>First slide alive</p>'));
  assert.notEqual(await page.evaluate(`${C}.token`), token, 'the page joined again under another token');
  clean(page, [/status of 404 .*\/\.session\/(presence|events)/]);
});

const PUTS = `{
  const put = IDBObjectStore.prototype.put;
  window.__puts = [];
  IDBObjectStore.prototype.put = function (value, key) {
    window.__puts.push(value.mine.includes(' hidden'));
    return put.call(this, value, key);
  };
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (String(key).startsWith('beeson-session-stash:')) window.__puts.push(value.includes(' hidden'));
    return set.call(this, key, value);
  };
}`;

test('a page hidden right after a key keeps this key in its copy', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const net = await proxy(t, server.edit);
  const page = await open(browser, net.url, { script: PUTS });
  await converge(server, [page]);
  await show(page, 'One');
  await caretAtEnd(page, el(0, 'p'));
  net.hold();
  await still(page);
  await type(page, ' hidden');
  const other = await browser.newPage({ width: 1280, height: 800 });
  await front(other);
  await until(() => net.held.some((r) => r.body.includes('hidden')), 'the hidden page to have sent the key');
  assert.deepEqual(await page.evaluate('window.__puts'), [true]);
});
