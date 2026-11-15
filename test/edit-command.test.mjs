// the edit command, started as a child process on a temporary talk folder: hello, an operation,
// the long poll of events, a refusal for a conflict, the atomic and debounced write of index.html,
// a change of the file by another program merged as an operation of the author file, the version
// of a page, media uploads, a byte-order mark, and the refusal of every request that does not
// come from this computer with the key or that reaches out of the talk folder

import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import { startRelay } from '../scripts/relay.mjs';
import { DECK, post, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const text = (file) => readFileSync(file, 'utf8');

test('the edit command serves a session and writes every edit into index.html', { timeout: 300_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(talk, 'media'));
  writeFileSync(join(talk, 'media', 'plot.png'), 'png');
  writeFileSync(join(talk, '.env'), 'SECRET=1');
  mkdirSync(join(talk, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(talk, 'node_modules', 'x', 'index.js'), 'x');
  mkdirSync(join(root, 'outside'));
  writeFileSync(join(root, 'outside', 'secret.txt'), 'secret');
  if (process.platform !== 'win32') symlinkSync(join(root, 'outside'), join(talk, 'outside'));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const { port, base } = edit;
  const file = join(talk, 'index.html');
  const api = (route) => `${base}.session/${route}`;

  const hello = (await post(port, api('hello'), { name: 'Ann' })).json();
  assert.equal(hello.host, true);
  assert.equal(hello.color, 0);
  assert.equal(hello.text, DECK);
  assert.match(hello.v, /^[A-Za-z0-9_-]+\.0$/);
  const epoch = hello.v.split('.')[0];
  assert.deepEqual(hello.people.map((p) => p.name), ['Ann']);
  const bo = (await post(port, api('hello'), { name: 'Bo' })).json();
  assert.equal(bo.color, 1);

  await t.test('an operation is applied and given to a poll of events', async () => {
    const at = DECK.indexOf('One');
    const answer = (await post(port, api('op'), { client: hello.client, seq: 1, base: hello.v, patches: [{ start: at, end: at + 3, text: 'Uno' }] })).json();
    assert.deepEqual(answer, { ok: true, v: `${epoch}.1` });
    const events = (await raw(port, 'GET', `${api('events')}?client=${hello.client}&since=${hello.v}`)).json();
    assert.equal(events.ops.length, 1);
    assert.equal(events.ops[0].author, 'Ann');
    assert.deepEqual(events.people.map((p) => p.name).sort(), ['Ann', 'Bo']);
  });

  await t.test('a long poll is answered when an operation of another person arrives', async () => {
    const waiting = raw(port, 'GET', `${api('events')}?client=${hello.client}&since=${epoch}.1`);
    const at = DECK.indexOf('Two');
    const answer = (await post(port, api('op'), { client: bo.client, seq: 1, base: `${epoch}.1`, patches: [{ start: at, end: at + 3, text: 'Deux' }] })).json();
    assert.equal(answer.ok, true);
    const events = (await waiting).json();
    assert.deepEqual(events.ops.map((op) => op.author), ['Bo']);
    assert.equal(events.v, `${epoch}.2`);
  });

  await t.test('an operation that conflicts with an earlier one of its base is refused whole', async () => {
    const at = DECK.indexOf('First');
    const first = (await post(port, api('op'), { client: hello.client, seq: 2, base: `${epoch}.2`, patches: [{ start: at, end: at + 5, text: 'Primo' }] })).json();
    assert.equal(first.ok, true);
    const second = (await post(port, api('op'), { client: bo.client, seq: 2, base: `${epoch}.2`, patches: [{ start: 0, end: 0, text: '<!-- a -->' }, { start: at + 1, end: at + 2, text: 'X' }] })).json();
    assert.deepEqual(second, { ok: false, reason: 'conflict', v: `${epoch}.3` });
    const repeated = (await post(port, api('op'), { client: bo.client, seq: 2, base: `${epoch}.2`, patches: [] })).json();
    assert.deepEqual(repeated, second);
    assert.equal((await post(port, api('op'), { client: 'nobody-here', seq: 1, base: `${epoch}.3`, patches: [] })).json().reason, 'unknown');
  });

  const current = async () => (await raw(port, 'GET', `${base}index.html`)).text;

  await t.test('index.html is written atomically with the text of the authority', async () => {
    const expected = await current();
    assert.ok(expected.includes('Uno') && expected.includes('Deux') && expected.includes('Primo') && !expected.includes('<!-- a -->'));
    await until(() => text(file) === expected, 'the file to hold the text of the authority');
    assert.deepEqual(readdirSync(talk).filter((n) => n.endsWith('.tmp')), []);
  });

  await t.test('the file is written at the latest 1 s after the first unwritten operation while edits go on', async () => {
    const hi = (await post(port, api('hello'), { name: 'Cy' })).json();
    let v = hi.v;
    let seq = 0;
    const started = Date.now();
    let writtenAt = null;
    const at = (await current()).indexOf('</body>');
    while (Date.now() - started < 3000) {
      const answer = (await post(port, api('op'), { client: hi.client, seq: ++seq, base: v, patches: [{ start: at, end: at, text: `<i>${seq}</i>` }] })).json();
      assert.equal(answer.ok, true);
      v = answer.v;
      if (writtenAt === null && text(file).includes('<i>1</i>')) writtenAt = Date.now() - started;
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(writtenAt !== null && writtenAt < 2500, `the file was written ${writtenAt} ms after the first operation`);
    await until(async () => text(file) === (await current()), 'the last operations to be written');
  });

  await t.test('a change of the file by another program reaches a poll as an operation of the author file', async () => {
    const v = (await post(port, api('hello'), { name: 'Ann', client: hello.client })).json().v;
    await until(async () => text(file) === (await current()), 'the file to be written');
    writeFileSync(file, text(file).replace('</body>', '<section>\n  <h2>Three</h2>\n</section>\n</body>'));
    const ops = await until(async () => {
      const events = (await raw(port, 'GET', `${api('events')}?client=${hello.client}&since=${v}`)).json();
      return events.ops.some((op) => op.author === 'file') && events.ops;
    }, 'an operation of the file');
    assert.ok(ops.find((op) => op.author === 'file').patches.some((p) => p.text.includes('Three')));
    assert.ok((await current()).includes('<h2>Three</h2>'));
  });

  await t.test('an agent that writes a file read before an operation keeps the operation', async () => {
    await until(async () => text(file) === (await current()), 'the file to be written');
    const read = text(file);
    const v = (await post(port, api('hello'), { name: 'Bo', client: bo.client })).json().v;
    const at = (await current()).indexOf('Second slide');
    const answer = (await post(port, api('op'), { client: bo.client, seq: 10, base: v, patches: [{ start: at, end: at + 6, text: 'Seconda' }] })).json();
    assert.equal(answer.ok, true);
    await until(() => text(file).includes('Seconda slide'), 'the operation to be written');
    // the agent writes back the whole file it read before the operation, with its own edit
    writeFileSync(file, read.replace('<h2>Uno</h2>', '<h2>Uno, by the agent</h2>'));
    await until(async () => {
      const now = await current();
      return now.includes('Uno, by the agent') && now.includes('Seconda slide') && text(file) === now;
    }, 'the edit of the agent and the operation to be in the file');
  });

  await t.test('a page and the text that the editor reads are of one version', async () => {
    const v = (await post(port, api('hello'), { name: 'Ann', client: hello.client })).json().v;
    const n = Number(v.split('.')[1]);
    const nav = await raw(port, 'GET', `${base}index.html?edit&session`, { headers: { 'sec-fetch-mode': 'navigate' } });
    assert.equal(nav.status, 302);
    assert.equal(nav.headers.location, `index.html?edit&session&v=${encodeURIComponent(v)}`);
    const old = await raw(port, 'GET', `${base}index.html?edit&session&v=${epoch}.0`, { headers: { accept: 'text/html' } });
    assert.equal(old.status, 302, 'a navigation to an older version is sent to the current one');
    const fetched = await raw(port, 'GET', `${base}index.html?edit&session&v=${epoch}.0`, { headers: { 'sec-fetch-mode': 'cors' } });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.text, DECK);
    assert.equal(fetched.headers['x-session-version'], `${epoch}.0`);
    assert.equal(fetched.headers['cache-control'], 'no-store');
    assert.equal((await raw(port, 'GET', `${base}index.html?edit&session&v=other.0`, { headers: { 'sec-fetch-mode': 'cors' } })).status, 409);
    const back = (await post(port, api('hello'), { name: 'Ann', client: hello.client, v: `${epoch}.0` })).json();
    assert.equal(back.text, undefined);
    assert.equal(back.ops.length, n);
    assert.equal((await post(port, api('hello'), { name: 'Ann', client: hello.client, v: `other.0` })).json().text, await current());
  });

  await t.test('a media upload is given a clean name, a free name, and a capped size', async () => {
    const put = (name, body, headers) => raw(port, 'PUT', api(`media/${name}`), { body, headers });
    assert.deepEqual((await put('My%20Plot%20(1).PNG', 'a')).json(), { path: 'media/my-plot-1.png' });
    assert.deepEqual((await put('My%20Plot%20(1).PNG', 'b')).json(), { path: 'media/my-plot-1-2.png' });
    assert.deepEqual((await put('plot.png', 'c')).json(), { path: 'media/plot-2.png' });
    assert.deepEqual((await put('..%2F..%2Fescape.png', 'd')).json(), { path: 'media/escape.png' });
    assert.equal(text(join(talk, 'media', 'my-plot-1-2.png')), 'b');
    assert.equal((await put('run.exe', 'e')).status, 415);
    assert.equal((await put('index.html', 'f')).status, 415);
    // a body over 64 MB is refused from its Content-Length, before it is sent
    const status = await new Promise((done, fail) => {
      const req = httpRequest({ host: '127.0.0.1', port, method: 'PUT', path: api('media/big.mp4'), headers: { 'content-length': 64 * 1024 * 1024 + 1 } }, (res) => {
        res.resume();
        done(res.statusCode);
        req.destroy();
      });
      req.on('error', (e) => (e.code === 'ECONNRESET' || e.code === 'EPIPE' ? null : fail(e)));
      req.flushHeaders();
    });
    assert.equal(status, 413);
    assert.equal(readdirSync(join(talk, 'media')).includes('big.mp4'), false);
  });

  await t.test('a request without the key, from another host, or out of the folder is refused', async () => {
    assert.equal((await raw(port, 'GET', '/index.html')).status, 404);
    assert.equal((await raw(port, 'GET', '/AAAAAAAAAAAAAAAAAAAAAA/index.html')).status, 404);
    assert.equal((await raw(port, 'GET', `${base}index.html`, { host: `evil.example:${port}` })).status, 403);
    assert.equal((await raw(port, 'GET', `${base}index.html`, { host: `localhost:${port}` })).status, 200);
    assert.equal((await raw(port, 'GET', `${base}media/plot.png`)).text, 'png');
    for (const path of ['../index.html', 'media/../../outside/secret.txt', '%2e%2e/%2e%2e/outside/secret.txt', '%2E%2E%2Foutside%2Fsecret.txt', 'media%2F..%2F..%2Foutside', '%E0%A4%A', '.env', '.session/key', 'node_modules/x/index.js', 'media/plot.png%00.txt']) {
      assert.equal((await raw(port, 'GET', `${base}${path}`)).status, 404, path);
    }
    if (process.platform !== 'win32') assert.equal((await raw(port, 'GET', `${base}outside/secret.txt`)).status, 404, 'a symlink that leaves the folder');
    assert.equal((await raw(port, 'POST', api('hello'), { body: '{"name":"x"}', headers: { 'content-type': 'text/plain' } })).status, 415);
    const page = await raw(port, 'GET', `${base}index.html`, { headers: { origin: 'http://evil.example' } });
    assert.equal(page.headers['access-control-allow-origin'], undefined);
  });

  await t.test('a range of a file is answered, and an unchanged file gets 304', async () => {
    writeFileSync(join(talk, 'media', 'clip.mp4'), Buffer.from('0123456789'));
    const part = await raw(port, 'GET', `${base}media/clip.mp4`, { headers: { range: 'bytes=2-5' } });
    assert.equal(part.status, 206);
    assert.equal(part.text, '2345');
    assert.equal(part.headers['content-range'], 'bytes 2-5/10');
    assert.equal(part.headers['content-type'], 'video/mp4');
    const etag = part.headers.etag;
    assert.equal((await raw(port, 'GET', `${base}media/clip.mp4`, { headers: { 'if-none-match': etag } })).status, 304);
    assert.equal((await raw(port, 'GET', `${base}media/clip.mp4`, { headers: { range: 'bytes=20-' } })).status, 416);
  });

  await t.test('share is refused for a request through the relay', async () => {
    const secret = 'a secret of the group, long enough';
    const relay = await startRelay({ host: '127.0.0.1', secret });
    t.after(() => relay.close());
    assert.equal((await raw(port, 'GET', api('share'))).json().link, null);
    const shared = (await post(port, api('share'), { relay: relay.url, secret })).json();
    assert.equal(shared.link, `${relay.url}${base}index.html?edit&session`);
    const saved = JSON.parse(readFileSync(join(config, 'beeson-slides', 'relay.json'), 'utf8'));
    assert.deepEqual(saved, { relay: relay.url, secret });
    const through = await fetch(`${relay.url}${api('share')}`);
    assert.equal(through.status, 403);
    const guest = await (await fetch(`${relay.url}${api('hello')}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Guest"}' })).json();
    assert.equal(guest.host, false);
    assert.deepEqual((await raw(port, 'DELETE', api('share'))).json(), { link: null });
    assert.equal((await fetch(`${relay.url}${base}index.html`)).status, 502);
  });

  if (process.platform !== 'win32') {
    await t.test('a stop answers the waiting polls with ended and writes the last operation', async () => {
      const v = (await post(port, api('hello'), { name: 'Ann', client: hello.client })).json().v;
      const waiting = raw(port, 'GET', `${api('events')}?client=${hello.client}&since=${v}`);
      await until(async () => text(file) === (await current()), 'the file to be written');
      const answer = (await post(port, api('op'), { client: hello.client, seq: 50, base: v, patches: [{ start: 0, end: 0, text: '<!-- last -->\n' }] })).json();
      assert.equal(answer.ok, true);
      // the poll may be answered with the operation before the stop, and is then made again
      let events = (await waiting).json();
      const again = events.ended ? null : raw(port, 'GET', `${api('events')}?client=${hello.client}&since=${events.v}`);
      edit.child.kill('SIGTERM');
      if (again) events = (await again).json();
      assert.equal(events.ended, true);
      assert.equal(await edit.exited, 0);
      assert.ok(text(file).startsWith('<!-- last -->\n'));
    });
  }
});

test('a byte-order mark is kept in the file and left out of the text', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(DECK)]));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const hello = (await post(edit.port, `${edit.base}.session/hello`, { name: 'Ann' })).json();
  assert.equal(hello.text, DECK);
  const answer = (await post(edit.port, `${edit.base}.session/op`, { client: hello.client, seq: 1, base: hello.v, patches: [{ start: 0, end: 15, text: '<!DOCTYPE html>' }] })).json();
  assert.equal(answer.ok, true);
  const file = join(talk, 'index.html');
  await until(() => readFileSync(file).subarray(3).toString('utf8').startsWith('<!DOCTYPE html>'), 'the file to be written');
  const bytes = readFileSync(file);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(bytes.subarray(3).toString('utf8'), DECK.replace('<!doctype html>', '<!DOCTYPE html>'));
});

test('the edit command refuses to start on an index.html that is not valid UTF-8', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t, Buffer.concat([Buffer.from('<p>caf'), Buffer.from([0xe9]), Buffer.from('</p>\n')]));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const failed = await startEdit(talk).then(
    () => null,
    (e) => e,
  );
  assert.ok(failed, 'the edit command started');
  assert.match(failed.message, /exited with 1: index\.html is not valid UTF-8/);
});
