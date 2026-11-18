// the relay: an edit command registered with a local relay serves a guest that loads index.html
// and sends an operation through it. a wrong secret, an unknown key, and a body over the limit are
// refused, and a session without pulls is dropped. the timeouts are lowered by the options of
// startRelay, so that the test does not wait 90 s

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer, get } from 'node:http';
import { connect } from 'node:net';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { startRelay } from '../scripts/relay.mjs';
import { DECK, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const SECRET = 'the secret of the group for this test';

test('a guest edits a deck through the relay', { timeout: 120_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, idleMs: 5000, pullMs: 1000, guestMs: 5000, bodyBytes: 1024 * 1024 });
  t.after(() => relay.close());
  assert.equal(await (await fetch(`${relay.url}/`)).text(), 'relay');

  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET, XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const guest = (path, init) => fetch(`${relay.url}/${edit.key}/${path}`, init);
  await until(async () => (await guest('index.html')).status === 200, 'the edit command to register with the relay');

  await t.test('the guest loads index.html, says hello, and sends an operation', async () => {
    // a navigation is sent raw, since fetch sets Sec-Fetch-Mode itself
    const navigate = { 'sec-fetch-mode': 'navigate' };
    const page = await raw(relay.port, 'GET', `/${edit.key}/index.html?edit&session`, { headers: navigate });
    assert.equal(page.status, 302);
    const location = page.headers.location;
    assert.match(location, /^index\.html\?edit&session&v=/);
    const loaded = await raw(relay.port, 'GET', `/${edit.key}/${location}`, { headers: navigate });
    assert.equal(loaded.status, 200);
    assert.equal(loaded.text, DECK);
    const json = { 'content-type': 'application/json' };
    const hello = await (await guest('.session/hello', { method: 'POST', headers: json, body: JSON.stringify({ name: 'Guest' }) })).json();
    assert.equal(hello.host, false);
    const at = DECK.indexOf('First slide');
    const op = { token: hello.token, seq: 1, base: hello.v, patches: [{ start: at, end: at + 5, text: 'Opening' }] };
    const answer = await (await guest('.session/op', { method: 'POST', headers: json, body: JSON.stringify(op) })).json();
    assert.equal(answer.ok, true);
    await until(() => readFileSync(join(talk, 'index.html'), 'utf8').includes('Opening slide'), 'the operation of the guest to be written');
    assert.equal((await guest('.session/share')).status, 403);
  });

  await t.test('a wrong secret, an unknown key, and a body over the limit are refused', async () => {
    const wrong = await fetch(`${relay.url}/host/${'k'.repeat(22)}`, { method: 'POST', headers: { authorization: 'Bearer not the secret of the group' } });
    assert.equal(wrong.status, 401);
    const pull = await fetch(`${relay.url}/host/${edit.key}/pull`, { method: 'POST', headers: { authorization: `Bearer ${SECRET}`, 'x-relay-token': 'a guess' } });
    assert.equal(pull.status, 401);
    assert.equal((await fetch(`${relay.url}/${'u'.repeat(22)}/index.html`)).status, 502);
    assert.equal((await fetch(`${relay.url}/short/index.html`)).status, 404);
    const big = await guest('media/big.png', { method: 'PUT', body: Buffer.alloc(1024 * 1024 + 1) });
    assert.equal(big.status, 413);
  });

  await t.test('a session without pulls is dropped', async () => {
    const key = 'd'.repeat(22);
    const registered = await fetch(`${relay.url}/host/${key}`, { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } });
    assert.equal(registered.status, 200);
    assert.equal(typeof (await registered.json()).token, 'string');
    const count = relay.sessions();
    await until(() => relay.sessions() === count - 1, 'the session without pulls to be dropped');
    assert.equal((await fetch(`${relay.url}/${key}/index.html`)).status, 502);
    // the edit command, which pulls, is still registered
    assert.equal((await guest('index.html')).status, 200);
  });
});

// a talk with scenes of TyCHO written into index.html takes over 20 MB, which is more than a guest
// may upload. the relay has its limits as it is started
test('a guest loads and edits a deck of 24 MB through the relay', { timeout: 180_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, idleMs: 5000, pullMs: 1000 });
  t.after(() => relay.close());
  const MB = 1024 * 1024;
  const deck = DECK.replace('</body>', `<script type="application/json">"${'A'.repeat(24 * MB)}"</script>\n</body>`);
  const { root, talk, config } = talkFolder(t, deck);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET, XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const guest = (path, init) => fetch(`${relay.url}/${edit.key}/${path}`, init);
  // a file that the talk folder does not have is answered by the edit command, not by the relay
  await until(async () => (await guest('none.txt')).status === 404, 'the edit command to register with the relay');

  const navigate = { 'sec-fetch-mode': 'navigate' };
  const page = await raw(relay.port, 'GET', `/${edit.key}/index.html?edit&session`, { headers: navigate });
  assert.equal(page.status, 302);
  const loaded = await raw(relay.port, 'GET', `/${edit.key}/${page.headers.location}`, { headers: navigate });
  assert.equal(loaded.status, 200, loaded.text.slice(0, 80));
  assert.ok(loaded.text === deck, `the guest reads ${loaded.text.length} characters of ${deck.length}`);

  const json = { 'content-type': 'application/json' };
  const hello = await (await guest('.session/hello', { method: 'POST', headers: json, body: JSON.stringify({ name: 'Guest' }) })).json();
  const at = deck.indexOf('First slide');
  const op = { token: hello.token, seq: 1, base: hello.v, patches: [{ start: at, end: at + 5, text: 'Opening' }] };
  assert.equal((await (await guest('.session/op', { method: 'POST', headers: json, body: JSON.stringify(op) })).json()).ok, true);
  await until(() => readFileSync(join(talk, 'index.html'), 'utf8').includes('Opening slide'), 'the operation of the guest to be written');
  assert.equal(relay.held(), 0, 'the relay holds no body once the guest has read the deck');

  // the upload of a guest keeps its limit of 16 MB
  const big = await guest('media/big.png', { method: 'PUT', body: Buffer.alloc(16 * MB + 1) });
  assert.equal(big.status, 413);
});

test('the relay refuses to start without a secret of 16 or more characters', () => {
  const env = { ...process.env, SLIDES_RELAY_SECRET: 'short' };
  const run = spawnSync(process.execPath, [resolve('scripts/relay.mjs'), '--port', '0'], { env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /SLIDES_RELAY_SECRET/);
});

test('the relay reads its secret from --secret-file, and refuses one under 16 characters', { timeout: 60_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'slides relay-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const relay = resolve('scripts/relay.mjs');
  const { SLIDES_RELAY_SECRET, ...env } = process.env;
  const short = join(dir, 'short');
  writeFileSync(short, 'fifteen chars..\n');
  for (const file of [short, join(dir, 'missing')]) {
    const run = spawnSync(process.execPath, [relay, '--port', '0', '--secret-file', file], { env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(run.status, 1, file);
    assert.match(run.stderr, /secret/, file);
  }
  const good = join(dir, 'secret');
  writeFileSync(good, `${SECRET}\n`);
  const child = spawn(process.execPath, [relay, '--port', '0', '--host', '127.0.0.1', '--secret-file', good], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let out = '';
  child.stdout.on('data', (c) => (out += c));
  const port = Number((await until(() => /port (\d+)/.exec(out), 'the relay to listen'))[1]);
  // the secret of the file, without its newline, registers a session
  const registered = await fetch(`http://127.0.0.1:${port}/host/${'k'.repeat(22)}`, { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } });
  assert.equal(registered.status, 200);
});

test('a second registration of the key of a live session is refused', { timeout: 120_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, guestMs: 5000 });
  t.after(() => relay.close());
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { SLIDES_RELAY_SECRET: SECRET, XDG_CONFIG_HOME: config, APPDATA: config };
  const first = await startEdit(talk, { args: ['--relay', relay.url], env });
  t.after(() => stopEdit(first));
  const guest = () => fetch(`${relay.url}/${first.key}/index.html`);
  await until(async () => (await guest()).status === 200, 'the first edit command to register');

  const taken = await fetch(`${relay.url}/host/${first.key}`, { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } });
  assert.equal(taken.status, 409);

  // a copy of the talk folder keeps .session/key, and its edit command is told that the key is taken
  const copy = join(root, 'copy');
  cpSync(talk, copy, { recursive: true });
  writeFileSync(join(copy, 'index.html'), DECK.replace('One', 'Copy'));
  const second = await startEdit(copy, { args: ['--relay', relay.url], env });
  t.after(() => stopEdit(second));
  assert.equal(second.key, first.key);
  await until(() => second.stderr.includes('already shared from another edit command'), 'the second edit command to be refused');
  for (let i = 0; i < 6; i++) assert.equal(await (await guest()).text(), DECK);
});

// the names and values of the headers of an answer, as they came on the wire
const rawHeaders = (url) =>
  new Promise((done, fail) => {
    get(url, (res) => {
      res.resume();
      const pairs = [];
      for (let i = 0; i < res.rawHeaders.length; i += 2) pairs.push([res.rawHeaders[i].toLowerCase(), res.rawHeaders[i + 1]]);
      done(pairs);
    }).on('error', fail);
  });

test('an answer through the relay carries one Content-Type and one Cache-Control', { timeout: 60_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(talk, 'plot.png'), 'png');
  const edit = await startEdit(talk, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET, XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  await until(async () => (await fetch(`${relay.url}/${edit.key}/index.html`)).status === 200, 'the edit command to register');
  for (const [path, type, cache] of [['index.html', 'text/html; charset=utf-8', 'no-store'], ['plot.png', 'image/png', 'no-cache']]) {
    const headers = await rawHeaders(`${relay.url}/${edit.key}/${path}`);
    assert.deepEqual(headers.filter(([k]) => k === 'content-type').map(([, v]) => v), [type], path);
    assert.deepEqual(headers.filter(([k]) => k === 'cache-control').map(([, v]) => v), [cache], path);
  }
});

test('the relay does not forward Service-Worker-Allowed or Set-Cookie', { timeout: 60_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const key = 'h'.repeat(22);
  const auth = { authorization: `Bearer ${SECRET}` };
  const { token } = await (await fetch(`${relay.url}/host/${key}`, { method: 'POST', headers: auth })).json();
  const host = { ...auth, 'x-relay-token': token };
  const pulled = fetch(`${relay.url}/host/${key}/pull`, { method: 'POST', headers: host }).then((r) => r.json());
  const answered = rawHeaders(`${relay.url}/${key}/index.html`);
  const [item] = await pulled;
  const forwarded = { 'content-type': 'text/html', 'service-worker-allowed': '/', 'set-cookie': 'a=1', 'clear-site-data': '"storage"', 'x-session-version': 'e.1' };
  const push = await fetch(`${relay.url}/host/${key}/push/${item.id}`, { method: 'POST', headers: { ...host, 'x-relay-status': '200', 'x-relay-headers': JSON.stringify(forwarded) }, body: 'deck' });
  assert.equal(push.status, 204);
  const names = (await answered).map(([k]) => k);
  assert.ok(names.includes('x-session-version'));
  for (const name of ['service-worker-allowed', 'set-cookie', 'clear-site-data']) assert.ok(!names.includes(name), name);
});

test('the relay holds the bodies of slow uploads and slow readers within its memory cap', { timeout: 60_000 }, async (t) => {
  // one session may take the whole cap here, so that the cap itself is tested
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, memoryBytes: 24 * 1024 * 1024, bodyBytes: 16 * 1024 * 1024, sessionShare: 1 });
  t.after(() => relay.close());
  const key = 'm'.repeat(22);
  const auth = { authorization: `Bearer ${SECRET}` };
  const { token } = await (await fetch(`${relay.url}/host/${key}`, { method: 'POST', headers: auth })).json();
  const host = { ...auth, 'x-relay-token': token };
  const sockets = [];
  t.after(() => sockets.forEach((s) => s.destroy()));
  // a socket that sends head and then the given chunks, and keeps what comes back
  const open = (head, ...chunks) => {
    const socket = connect(relay.port, '127.0.0.1');
    sockets.push(socket);
    socket.got = '';
    socket.on('data', (d) => (socket.got += d.toString('latin1')));
    socket.on('error', () => {});
    socket.write(head);
    for (const c of chunks) socket.write(c);
    return socket;
  };
  const chunk = (n) => `${n.toString(16)}\r\n${'x'.repeat(n)}\r\n`;
  const MB = 1024 * 1024;

  await t.test('a chunked upload counts against the cap while it is read', async () => {
    const head = `PUT /${key}/media/a.png HTTP/1.1\r\nHost: relay\r\nTransfer-Encoding: chunked\r\n\r\n`;
    const first = open(head, chunk(13 * MB));
    await until(() => relay.held() >= 13 * MB, 'the relay to count the body that it reads');
    const second = open(head, chunk(13 * MB), '0\r\n\r\n');
    await until(() => second.got.startsWith('HTTP/1.1 503'), 'the second upload to be refused');
    assert.equal(relay.held(), 13 * MB, 'the relay holds the first upload alone');
    first.destroy();
    await until(() => relay.held() === 0, 'the place of the closed upload to be given back');
  });

  await t.test('an answer is counted until the guest has read it', async () => {
    const guest = open(`GET /${key}/big.mp4 HTTP/1.1\r\nHost: relay\r\n\r\n`);
    guest.pause();
    const [item] = await (await fetch(`${relay.url}/host/${key}/pull`, { method: 'POST', headers: host })).json();
    const push = await fetch(`${relay.url}/host/${key}/push/${item.id}`, { method: 'POST', headers: { ...host, 'x-relay-status': '200', 'x-relay-headers': '{}' }, body: Buffer.alloc(15 * MB) });
    assert.equal(push.status, 204);
    assert.ok(relay.held() >= 15 * MB, `the relay holds ${relay.held()} bytes for a guest that does not read`);
    const other = await fetch(`${relay.url}/${key}/media/b.png`, { method: 'PUT', body: Buffer.alloc(10 * MB) });
    assert.equal(other.status, 503);
    guest.destroy();
    await until(() => relay.held() === 0, 'the answer to be given back at the close');
  });
});

test('a slow upload through the relay is not cut by the timeout of the answer', { timeout: 60_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, guestMs: 1500 });
  t.after(() => relay.close());
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET, XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  await until(async () => (await fetch(`${relay.url}/${edit.key}/index.html`)).status === 200, 'the edit command to register');
  const hello = await (await fetch(`${relay.url}/${edit.key}/.session/hello`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Guest' }) })).json();
  const socket = connect(relay.port, '127.0.0.1');
  t.after(() => socket.destroy());
  let got = '';
  socket.on('data', (d) => (got += d));
  socket.write(`PUT /${edit.key}/.session/media/slow.png?token=${hello.token} HTTP/1.1\r\nHost: relay\r\nContent-Length: 6000\r\nConnection: close\r\n\r\n`);
  // the body is sent over 2.5 s, longer than guestMs, as on a slow uplink
  for (let i = 0; i < 6; i++) {
    socket.write('x'.repeat(1000));
    if (i < 5) await new Promise((done) => setTimeout(done, 500));
  }
  await until(() => got.includes('\r\n\r\n') && got, 'the answer to the upload');
  assert.match(got, /^HTTP\/1\.1 200/, got);
  assert.match(got, /"path":"media\/slow\.png"/);
});

test('an answer that the relay refuses is pushed again after a registration, or logged', { timeout: 60_000 }, async (t) => {
  // a fake relay that hands out one request per id in ids, and answers the pushes of an id in turn
  const ids = ['a1', 'b2'];
  const pushAnswers = { a1: [401, 204], b2: [500] };
  const pushes = [];
  let registrations = 0;
  const fake = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const token = req.headers['x-relay-token'];
      if (/^\/host\/[^/]+$/.test(req.url) && req.method === 'POST') {
        registrations++;
        return res.end(JSON.stringify({ token: `t${registrations}` }));
      }
      if (req.url.endsWith('/pull')) {
        const id = ids.shift();
        if (!id) return setTimeout(() => res.end('[]'), 200);
        const key = req.url.split('/')[2];
        return res.end(JSON.stringify([{ id, method: 'GET', path: `/${key}/index.html`, query: '', headers: {}, body: '' }]));
      }
      if (req.url.includes('/push/')) {
        const id = req.url.split('/').pop();
        const status = pushAnswers[id]?.shift() ?? 204;
        pushes.push({ id, token, status, body: Buffer.concat(chunks).toString() });
        res.statusCode = status;
        return res.end();
      }
      res.end();
    });
  });
  await new Promise((done) => fake.listen(0, '127.0.0.1', done));
  t.after(() => fake.close());
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { args: ['--relay', `http://127.0.0.1:${fake.address().port}`], env: { SLIDES_RELAY_SECRET: SECRET, XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  await until(() => pushes.length >= 3, 'three pushes');
  const a1 = pushes.filter((p) => p.id === 'a1');
  assert.deepEqual(a1.map((p) => p.token), ['t1', 't2'], 'the answer refused with 401 is pushed again with the token of a new registration');
  assert.match(a1[1].body, /First slide/);
  assert.equal(pushes.filter((p) => p.id === 'b2').length, 1, 'an answer refused otherwise is pushed once');
  await until(() => /500/.test(edit.stderr), 'the refused push to be logged');
});

const MB = 1024 * 1024;

// a host of key that registers with the relay, pulls, and pushes by itself, in place of an edit
// command
async function fakeHost(relay, key) {
  const auth = { authorization: `Bearer ${SECRET}` };
  const { token } = await (await fetch(`${relay.url}/host/${key}`, { method: 'POST', headers: auth })).json();
  const headers = { ...auth, 'x-relay-token': token };
  const queue = [];
  return {
    token,
    // the next n requests of guests, pulled until they have come
    async next(n = 1) {
      while (queue.length < n) queue.push(...(await (await fetch(`${relay.url}/host/${key}/pull`, { method: 'POST', headers })).json()));
      return queue.splice(0, n);
    },
    push: async (id, body, status = 200) => (await fetch(`${relay.url}/host/${key}/push/${id}`, { method: 'POST', headers: { ...headers, 'x-relay-status': String(status), 'x-relay-headers': '{}' }, body })).status,
    // a push of length bytes on a raw socket, which writes sent bytes at once and the others at rest()
    partial(id, length, sent) {
      const socket = connect(relay.port, '127.0.0.1');
      socket.got = '';
      socket.on('data', (d) => (socket.got += d.toString('latin1')));
      socket.on('error', () => {});
      socket.write(`POST /host/${key}/push/${id} HTTP/1.1\r\nHost: relay\r\nAuthorization: Bearer ${SECRET}\r\nx-relay-token: ${token}\r\nx-relay-status: 200\r\nx-relay-headers: {}\r\nContent-Length: ${length}\r\n\r\n`);
      socket.write(Buffer.alloc(sent));
      socket.rest = () => socket.write(Buffer.alloc(length - sent));
      return socket;
    },
  };
}

// a raw socket of a guest that sends head and chunks, and keeps what comes back in got
function rawGuest(t, relay, head, ...chunks) {
  const socket = connect(relay.port, '127.0.0.1');
  t.after(() => socket.destroy());
  socket.got = '';
  socket.on('data', (d) => (socket.got += d.toString('latin1')));
  socket.on('error', () => {});
  socket.write(head);
  for (const c of chunks) socket.write(c);
  return socket;
}

const hex = (n) => `${n.toString(16)}\r\n${'x'.repeat(n)}\r\n`;
const status = (socket) => Number(/^HTTP\/1\.1 (\d+)/.exec(socket.got)?.[1] ?? 0);

test('a push that is cut off gives its place in the memory of the relay back', { timeout: 60_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const key = 'c'.repeat(22);
  const host = await fakeHost(relay, key);
  rawGuest(t, relay, `GET /${key}/clip.mp4 HTTP/1.1\r\nHost: relay\r\n\r\n`);
  const [item] = await host.next();
  const push = host.partial(item.id, 4 * MB, 3 * MB);
  t.after(() => push.destroy());
  await until(() => relay.held() >= 3 * MB, 'the relay to hold the push that it reads');
  push.destroy();
  await until(() => relay.held() === 0, 'the place of the cut push to be given back', 5000);
});

test('one session cannot fill the memory of the relay, and small answers pass when large ones fill it', { timeout: 60_000 }, async (t) => {
  // a session may hold a quarter of memoryBytes, i.e. 8 MB, and 4 MB are kept for small answers
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, memoryBytes: 32 * MB });
  t.after(() => relay.close());
  const keys = ['a', 'b', 'c', 'd', 'e'].map((c) => c.repeat(22));
  const hosts = await Promise.all(keys.map((key) => fakeHost(relay, key)));
  // an upload that is never finished, as from a slow phone or a guest that stopped
  const upload = (key, size) => rawGuest(t, relay, `PUT /${key}/media/v.mp4 HTTP/1.1\r\nHost: relay\r\nTransfer-Encoding: chunked\r\n\r\n`, hex(size));

  upload(keys[0], 7 * MB);
  upload(keys[0], MB);
  await until(() => relay.held() === 8 * MB, 'the relay to hold the uploads of the first session');
  const second = rawGuest(t, relay, `PUT /${keys[0]}/media/w.mp4 HTTP/1.1\r\nHost: relay\r\nTransfer-Encoding: chunked\r\n\r\n`, hex(7 * MB), '0\r\n\r\n');
  await until(() => status(second), 'the second upload of the session to be answered');
  assert.equal(status(second), 503, 'a session holds a quarter of the memory at most');
  assert.equal(relay.held(), 8 * MB);
  const own = raw(relay.port, 'GET', `/${keys[0]}/index.html`, { host: 'relay' });
  const [item] = await hosts[0].next();
  assert.equal(await hosts[0].push(item.id, 'deck'), 204, 'a small answer passes in a session that holds its share');
  assert.equal((await own).text, 'deck');

  for (const [key, size] of [[keys[1], 7 * MB], [keys[2], 7 * MB], [keys[3], 6 * MB]]) upload(key, size);
  await until(() => relay.held() === 28 * MB, 'the relay to hold the uploads of three more sessions');
  const [big, small] = [rawGuest(t, relay, `GET /${keys[4]}/clip.mp4 HTTP/1.1\r\nHost: relay\r\n\r\n`), rawGuest(t, relay, `GET /${keys[4]}/index.html HTTP/1.1\r\nHost: relay\r\n\r\n`)];
  const items = await hosts[4].next(2);
  const id = (path) => items.find((item) => item.path.endsWith(path)).id;
  assert.equal(await hosts[4].push(id('clip.mp4'), Buffer.alloc(MB)), 503, 'a large answer does not take the place kept for small ones');
  assert.equal(await hosts[4].push(id('index.html'), 'deck'), 204, 'a small answer passes when large ones fill the cap');
  await until(() => status(small) && status(big), 'the guests to be answered');
  assert.equal(status(small), 200);
  assert.match(small.got, /\r\n\r\ndeck$/);
});

test('a push that the relay refuses is answered to the guest at once, and pushes at once do not refuse each other', { timeout: 120_000 }, async (t) => {
  await t.test('a refused push answers the guest with 503 rather than a 504 after guestMs', async () => {
    const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, memoryBytes: MB, guestMs: 20_000 });
    t.after(() => relay.close());
    const key = 'r'.repeat(22);
    const host = await fakeHost(relay, key);
    const guest = raw(relay.port, 'GET', `/${key}/clip.mp4`, { host: 'relay' });
    const [item] = await host.next();
    assert.equal(await host.push(item.id, Buffer.alloc(2 * MB)), 503);
    const answer = await guest;
    assert.equal(answer.status, 503);
    assert.equal(answer.headers['retry-after'], '1');
  });

  await t.test('a push holds its whole length from its start, so that the push that started first goes through', async () => {
    const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, memoryBytes: 64 * MB });
    t.after(() => relay.close());
    const key = 's'.repeat(22);
    const host = await fakeHost(relay, key);
    const guests = [raw(relay.port, 'GET', `/${key}/a.mp4`, { host: 'relay' }), raw(relay.port, 'GET', `/${key}/b.mp4`, { host: 'relay' })];
    const [a, b] = await host.next(2);
    // two answers of 9 MB, which together pass the share of 16 MB of the session
    const first = host.partial(a.id, 9 * MB, MB);
    t.after(() => first.destroy());
    await until(() => relay.held() >= MB, 'the relay to hold the first push');
    assert.equal(await host.push(b.id, Buffer.alloc(9 * MB)), 503, 'the push that started second is refused');
    first.rest();
    await until(() => status(first), 'the first push to be answered');
    assert.equal(status(first), 204, first.got);
    const answers = await Promise.all(guests);
    assert.deepEqual(answers.map((r) => r.status).sort(), [200, 503]);
  });
});

test('a registration without the token is refused right after the pulls of the session were answered', { timeout: 60_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const key = 't'.repeat(22);
  const host = await fakeHost(relay, key);
  const register = () => fetch(`${relay.url}/host/${key}`, { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }).then((r) => r.status);
  const guest = raw(relay.port, 'GET', `/${key}/index.html`, { host: 'relay' });
  // the pull is answered at once with the request of the guest, and no other pull waits
  const [item] = await host.next();
  assert.equal(await register(), 409, 'a registration between two pulls takes the session');
  assert.equal(await host.push(item.id, 'deck'), 204, 'the host keeps its token');
  assert.equal((await guest).text, 'deck');
  // an edit command that died stops pulling, and a new start gets the key once answeredMs passed
  await until(async () => (await register()) === 200, 'a registration after the end of the pulls');
});

test('a page of a session that is not registered says that the host is not running', { timeout: 60_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const key = 'k'.repeat(22);
  const accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  const page = await raw(relay.port, 'GET', `/${key}/index.html?edit&session`, { headers: { accept } });
  assert.equal(page.status, 502);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.ok(page.text.includes("The host's edit command is not running. This link works again once the host starts it."), page.text);
  assert.doesNotMatch(page.text, /<script/i);
  // the requests of the client keep the plain text, which the transport reads as the message
  const plain = 'no edit command is registered for this session';
  for (const [method, path, headers] of [
    ['GET', `/${key}/.session/events?token=t&since=v`, { accept: '*/*' }],
    ['GET', `/${key}/index.html`, { accept: '*/*' }],
    ['POST', `/${key}/.session/hello`, { accept, 'content-type': 'application/json' }],
  ]) {
    const answer = await raw(relay.port, method, path, { headers, body: method === 'POST' ? '{}' : undefined });
    assert.deepEqual({ status: answer.status, type: answer.headers['content-type'], text: answer.text }, { status: 502, type: 'text/plain; charset=utf-8', text: plain }, `${method} ${path}`);
  }
});

test('a session ended with a record answers the requests of its guests under .session/ with 410 and the record', { timeout: 60_000 }, async (t) => {
  const record = JSON.stringify({ ended: { by: 'Ann' } });
  const end = (key, token, body = record) => fetch(`${relay.url}/host/${key}`, { method: 'DELETE', headers: { authorization: `Bearer ${SECRET}`, 'x-relay-token': token, 'content-type': 'application/json' }, body }).then((r) => r.status);
  const guest = (key, path = '.session/events?token=t&since=v') => raw(relay.port, 'GET', `/${key}/${path}`, { host: 'relay' });
  const key = (c) => c.repeat(22);
  let relay = await startRelay({ host: '127.0.0.1', secret: SECRET, endedSessions: 2 });
  t.after(() => relay.close());

  await t.test('the record is answered under .session/, and every other path gets 502', async () => {
    const host = await fakeHost(relay, key('a'));
    assert.equal(await end(key('a'), host.token), 200);
    const events = await guest(key('a'));
    assert.deepEqual({ status: events.status, type: events.headers['content-type'], text: events.text }, { status: 410, type: 'application/json', text: record });
    const hello = await raw(relay.port, 'POST', `/${key('a')}/.session/hello`, { host: 'relay', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(hello.status, 410);
    assert.equal((await guest(key('a'), 'index.html')).status, 502);
  });

  await t.test('a new registration of the key deletes the kept end', async () => {
    const host = await fakeHost(relay, key('a'));
    const waiting = guest(key('a'));
    const [item] = await host.next();
    assert.equal(item.path, `/${key('a')}/.session/events`);
    assert.equal(await host.push(item.id, '{"v":"x"}'), 204);
    assert.equal((await waiting).status, 200);
    assert.equal(await end(key('a'), host.token), 200);
  });

  await t.test('the relay keeps the newest ends up to its limit', async () => {
    for (const c of ['b', 'c']) assert.equal(await end(key(c), (await fakeHost(relay, key(c))).token), 200);
    assert.equal((await guest(key('a'))).status, 502, 'the oldest end is not kept');
    assert.equal((await guest(key('b'))).status, 410);
    assert.equal((await guest(key('c'))).status, 410);
  });

  await t.test('a record over the limit is refused, and the session ends without it', async () => {
    const host = await fakeHost(relay, key('d'));
    assert.equal(await end(key('d'), host.token, JSON.stringify({ ended: { by: 'x'.repeat(1024) } })), 413);
    assert.equal((await guest(key('d'))).status, 502);
    assert.equal(relay.sessions(), 0);
  });

  await t.test('an end is kept for endedMs', async () => {
    await relay.close();
    relay = await startRelay({ host: '127.0.0.1', secret: SECRET, endedMs: 200 });
    assert.equal(await end(key('e'), (await fakeHost(relay, key('e'))).token), 200);
    await until(async () => (await guest(key('e'))).status === 502, 'the end to be forgotten after endedMs');
  });
});

test('the relay refuses a session over its limit of sessions, and a request over the limit of waiting requests of a session', { timeout: 60_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, sessions: 2, waiting: 2 });
  t.after(() => relay.close());
  const key = 'f'.repeat(22);
  const host = await fakeHost(relay, key);
  await fakeHost(relay, 'g'.repeat(22));
  const third = await fetch(`${relay.url}/host/${'h'.repeat(22)}`, { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } });
  assert.deepEqual({ status: third.status, text: await third.text() }, { status: 503, text: 'the relay holds too many sessions' });
  // two requests of guests that the host pulled and does not answer yet
  const guest = () => raw(relay.port, 'GET', `/${key}/index.html`, { host: 'relay' });
  const waiting = [guest(), guest()];
  const items = await host.next(2);
  const over = await guest();
  assert.deepEqual({ status: over.status, text: over.text }, { status: 503, text: 'the session has too many waiting requests' });
  for (const item of items) assert.equal(await host.push(item.id, 'deck'), 204);
  assert.deepEqual((await Promise.all(waiting)).map((a) => a.text), ['deck', 'deck']);
});
