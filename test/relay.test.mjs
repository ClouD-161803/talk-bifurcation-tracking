// the relay: an edit command registered with a local relay serves a guest that loads index.html
// and sends an operation through it. a wrong secret, an unknown key, and a body over the limit are
// refused, and a session without pulls is dropped. the timeouts are lowered by the options of
// startRelay, so that the test does not wait 90 s

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { get } from 'node:http';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { startRelay } from '../scripts/relay.mjs';
import { DECK, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const SECRET = 'the secret of the group for this test';

test('a guest edits a deck through the relay', { timeout: 120_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, idleMs: 600, pullMs: 1000, guestMs: 5000, bodyBytes: 1024 * 1024 });
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
    const op = { client: hello.client, seq: 1, base: hello.v, patches: [{ start: at, end: at + 5, text: 'Opening' }] };
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

test('add regression test: a second registration of the key of a live session is refused', { timeout: 120_000 }, async (t) => {
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
  await until(() => second.stderr.includes('already shared by another edit command'), 'the second edit command to be refused');
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

test('add regression test: an answer through the relay carries one Content-Type and one Cache-Control', { timeout: 60_000 }, async (t) => {
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

test('add regression test: the relay does not forward Service-Worker-Allowed or Set-Cookie', { timeout: 60_000 }, async (t) => {
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
