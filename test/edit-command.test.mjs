// the edit command, started as a child process on a temporary talk folder: hello, an operation,
// the long poll of events, a refusal for a conflict, the atomic and debounced write of index.html,
// a change of the file by another program merged as an operation of the author file, the version
// of a page, media uploads, a byte-order mark, and the refusal of every request that does not
// come from this computer with the key or that reaches out of the talk folder

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer, request as httpRequest } from 'node:http';
import { connect, createServer as createNetServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { startRelay } from '../scripts/relay.mjs';
import { DECK, EDIT, post, raw, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

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
  // the ids of the persons, sent again at each hello as a browser does from localStorage
  const ann = { name: 'Ann', person: hello.person, client: hello.client };
  const boAgain = { name: 'Bo', person: bo.person, client: bo.client };

  await t.test('an operation is applied and given to a poll of events', async () => {
    const at = DECK.indexOf('One');
    const answer = (await post(port, api('op'), { token: hello.token, seq: 1, base: hello.v, patches: [{ start: at, end: at + 3, text: 'Uno' }] })).json();
    assert.deepEqual(answer, { ok: true, v: `${epoch}.1` });
    const events = (await raw(port, 'GET', `${api('events')}?token=${hello.token}&since=${hello.v}`)).json();
    assert.equal(events.ops.length, 1);
    assert.equal(events.ops[0].author, hello.person);
    assert.deepEqual(events.people.map((p) => p.name).sort(), ['Ann', 'Bo']);
  });

  await t.test('a long poll is answered when an operation of another person arrives', async () => {
    const waiting = raw(port, 'GET', `${api('events')}?token=${hello.token}&since=${epoch}.1`);
    const at = DECK.indexOf('Two');
    const answer = (await post(port, api('op'), { token: bo.token, seq: 1, base: `${epoch}.1`, patches: [{ start: at, end: at + 3, text: 'Deux' }] })).json();
    assert.equal(answer.ok, true);
    const events = (await waiting).json();
    assert.deepEqual(events.ops.map((op) => op.author), [bo.person]);
    assert.equal(events.v, `${epoch}.2`);
  });

  await t.test('an operation that conflicts with an earlier one of its base is refused whole', async () => {
    const at = DECK.indexOf('First');
    const first = (await post(port, api('op'), { token: hello.token, seq: 2, base: `${epoch}.2`, patches: [{ start: at, end: at + 5, text: 'Primo' }] })).json();
    assert.equal(first.ok, true);
    const request = { token: bo.token, seq: 2, base: `${epoch}.2`, patches: [{ start: 0, end: 0, text: '<!-- a -->' }, { start: at + 1, end: at + 2, text: 'X' }] };
    const second = (await post(port, api('op'), request)).json();
    assert.deepEqual(second, { ok: false, reason: 'conflict', v: `${epoch}.3` });
    const repeated = (await post(port, api('op'), request)).json();
    assert.deepEqual(repeated, second);
    assert.equal((await post(port, api('op'), { token: 'n'.repeat(22), seq: 1, base: `${epoch}.3`, patches: [] })).json().reason, 'unknown');
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
      const answer = (await post(port, api('op'), { token: hi.token, seq: ++seq, base: v, patches: [{ start: at, end: at, text: `<i>${seq}</i>` }] })).json();
      assert.equal(answer.ok, true);
      v = answer.v;
      if (writtenAt === null && text(file).includes('<i>1</i>')) writtenAt = Date.now() - started;
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(writtenAt !== null && writtenAt < 2500, `the file was written ${writtenAt} ms after the first operation`);
    await until(async () => text(file) === (await current()), 'the last operations to be written');
  });

  await t.test('a change of the file by another program reaches a poll as an operation of the author file', async () => {
    const v = (await post(port, api('hello'), ann)).json().v;
    await until(async () => text(file) === (await current()), 'the file to be written');
    writeFileSync(file, text(file).replace('</body>', '<section>\n  <h2>Three</h2>\n</section>\n</body>'));
    const ops = await until(async () => {
      const events = (await raw(port, 'GET', `${api('events')}?token=${hello.token}&since=${v}`)).json();
      return events.ops.some((op) => op.author === 'file') && events.ops;
    }, 'an operation of the file');
    assert.ok(ops.find((op) => op.author === 'file').patches.some((p) => p.text.includes('Three')));
    assert.ok((await current()).includes('<h2>Three</h2>'));
  });

  await t.test('an agent that writes a file read before an operation keeps the operation', async () => {
    await until(async () => text(file) === (await current()), 'the file to be written');
    const read = text(file);
    const v = (await post(port, api('hello'), boAgain)).json().v;
    const at = (await current()).indexOf('Second slide');
    const answer = (await post(port, api('op'), { token: bo.token, seq: 10, base: v, patches: [{ start: at, end: at + 6, text: 'Seconda' }] })).json();
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
    const v = (await post(port, api('hello'), ann)).json().v;
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
    const back = (await post(port, api('hello'), { ...ann, v: `${epoch}.0` })).json();
    assert.equal(back.text, undefined);
    assert.equal(back.ops.length, n);
    assert.equal((await post(port, api('hello'), { ...ann, v: `other.0` })).json().text, await current());
  });

  await t.test('a media upload is given a clean name, a free name, and a capped size', async () => {
    const { token } = (await post(port, api('hello'), ann)).json();
    const put = (name, body, headers) => raw(port, 'PUT', api(`media/${name}?token=${token}`), { body, headers });
    assert.deepEqual((await put('My%20Plot%20(1).PNG', 'a')).json(), { path: 'media/my-plot-1.png' });
    assert.deepEqual((await put('My%20Plot%20(1).PNG', 'b')).json(), { path: 'media/my-plot-1-2.png' });
    assert.deepEqual((await put('plot.png', 'c')).json(), { path: 'media/plot-2.png' });
    assert.deepEqual((await put('..%2F..%2Fescape.png', 'd')).json(), { path: 'media/escape.png' });
    assert.equal(text(join(talk, 'media', 'my-plot-1-2.png')), 'b');
    assert.equal((await put('run.exe', 'e')).status, 415);
    assert.equal((await put('index.html', 'f')).status, 415);
    // a body over 64 MB is refused from its Content-Length, before it is sent
    const status = await new Promise((done, fail) => {
      const req = httpRequest({ host: '127.0.0.1', port, method: 'PUT', path: api(`media/big.mp4?token=${token}`), headers: { 'content-length': 64 * 1024 * 1024 + 1 } }, (res) => {
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
      const v = (await post(port, api('hello'), ann)).json().v;
      const waiting = raw(port, 'GET', `${api('events')}?token=${hello.token}&since=${v}`);
      await until(async () => text(file) === (await current()), 'the file to be written');
      const answer = (await post(port, api('op'), { token: hello.token, seq: 50, base: v, patches: [{ start: 0, end: 0, text: '<!-- last -->\n' }] })).json();
      assert.equal(answer.ok, true);
      // the poll may be answered with the operation before the stop, and is then made again
      let events = (await waiting).json();
      const again = events.ended ? null : raw(port, 'GET', `${api('events')}?token=${hello.token}&since=${events.v}`);
      edit.child.kill('SIGTERM');
      if (again) events = (await again).json();
      assert.deepEqual(events.ended, { by: 'Ann' });
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
  const answer = (await post(edit.port, `${edit.base}.session/op`, { token: hello.token, seq: 1, base: hello.v, patches: [{ start: 0, end: 15, text: '<!DOCTYPE html>' }] })).json();
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

test('a person keeps an id, a name, and a tone, kept in .session/people.json', { timeout: 120_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: config, APPDATA: config };
  let edit = await startEdit(talk, { env });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const hello = async (body) => {
    const answer = await post(edit.port, api('hello'), body);
    assert.equal(answer.status, 200, answer.text);
    return answer.json();
  };
  const poll = (who, since) => raw(edit.port, 'GET', `${api('events')}?token=${who.token}&since=${since}`).then((r) => r.json());

  const ann = await hello({ name: '  Ann  ', person: 'short' });
  assert.match(ann.person, /^[A-Za-z0-9_-]{22,}$/, 'a malformed person id is replaced');
  assert.equal(ann.name, 'Ann');
  assert.equal(ann.color, 0);
  assert.deepEqual(ann.known, [{ person: ann.person, name: 'Ann', color: 0 }]);

  await t.test('a name held by another person is refused, unless it is claimed', async () => {
    const other = 'B'.repeat(22);
    assert.deepEqual(await hello({ name: ' aNN ', person: other }), { taken: { name: 'Ann' } });
    assert.deepEqual(await hello({ name: 'ann', person: other, token: ann.token }), { taken: { name: 'Ann' } });
    const second = await hello({ name: 'ANN', person: other, claim: true });
    assert.equal(second.person, ann.person);
    assert.equal(second.name, 'Ann');
    assert.equal(second.color, 0);
    assert.notEqual(second.client, ann.client);
    assert.deepEqual(second.people.map((p) => [p.person, p.name]), [[ann.person, 'Ann'], [ann.person, 'Ann']], 'one person with two pages is listed twice');
    assert.deepEqual(second.known.map((p) => p.person), [ann.person]);
    await post(edit.port, api('bye'), { token: second.token });
  });

  await t.test('a new person gets the tone that the fewest people present hold, and keeps it', async () => {
    const bo = await hello({ name: 'Bo' });
    const cy = await hello({ name: 'Cy' });
    const di = await hello({ name: 'Di' });
    assert.deepEqual([bo.color, cy.color, di.color], [1, 2, 3]);
    assert.equal((await hello({ name: 'Eve' })).color, 0);
    await post(edit.port, api('bye'), { token: bo.token });
    // present: Ann and Eve on tone 0, Cy on 2, and Di on 3
    assert.equal((await hello({ name: 'Flo' })).color, 1);
    await post(edit.port, api('bye'), { token: di.token });
    assert.equal((await hello({ name: 'Bo', person: bo.person })).color, 1);
    assert.equal((await hello({ name: 'Gus' })).color, 3);
  });

  await t.test('a name is collapsed and cut to 40 characters', async () => {
    const long = await hello({ name: `  Maria   del\tCarmen ${'x'.repeat(60)}` });
    assert.equal(long.name, `Maria del Carmen ${'x'.repeat(23)}`);
    assert.equal(long.name.length, 40);
    assert.equal((await post(edit.port, api('hello'), { name: '   ' })).status, 400);
  });

  await t.test('a rename reaches every page through people and known, and an operation names its person', async () => {
    const again = await hello({ name: 'Ann', person: ann.person, token: ann.token });
    const bo = await hello({ name: 'Bo', person: again.known.find((p) => p.name === 'Bo').person });
    // a first poll of Ann gets the news of the hello of Bo, and a second one waits
    const first = await poll(ann, ann.v);
    const waiting = poll(ann, first.v);
    assert.deepEqual((await post(edit.port, api('name'), { token: bo.token, name: ' ANN ' })).json(), { taken: { name: 'Ann' } });
    assert.deepEqual((await post(edit.port, api('name'), { token: bo.token, name: 'Bob  Marsh' })).json(), { name: 'Bob Marsh' });
    const events = await waiting;
    assert.ok(events.people.some((p) => p.person === bo.person && p.name === 'Bob Marsh'));
    assert.ok(events.known.some((p) => p.person === bo.person && p.name === 'Bob Marsh'));
    const at = DECK.indexOf('One');
    const op = (await post(edit.port, api('op'), { token: bo.token, seq: 1, base: events.v, patches: [{ start: at, end: at + 3, text: 'Uno' }] })).json();
    assert.equal(op.ok, true);
    const next = await poll(ann, events.v);
    assert.deepEqual(next.ops.map((o) => o.author), [bo.person]);
    assert.equal(next.known, undefined, 'known is sent only when it changed');
    assert.equal((await post(edit.port, api('name'), { token: 'n'.repeat(22), name: 'X' })).status, 404);
  });

  await t.test('people.json holds every person who joined, and survives a restart', async () => {
    const file = join(talk, '.session', 'people.json');
    const people = await until(() => {
      try {
        const list = JSON.parse(text(file));
        return list.some((p) => p.name === 'Bob Marsh') && list;
      } catch {
        return null;
      }
    }, 'people.json to hold the rename');
    assert.deepEqual(people.map((p) => p.name), ['Ann', 'Bob Marsh', 'Cy', 'Di', 'Eve', 'Flo', 'Gus', `Maria del Carmen ${'x'.repeat(23)}`]);
    for (const p of people) assert.ok(Number.isFinite(p.first) && p.last >= p.first && Object.keys(p).sort().join() === 'color,first,last,name,person');
    assert.deepEqual(readdirSync(join(talk, '.session')).filter((n) => n.endsWith('.tmp')), []);
    await stopEdit(edit);
    edit = await startEdit(talk, { env });
    const bob = people.find((p) => p.name === 'Bob Marsh');
    assert.deepEqual((await post(edit.port, `${edit.base}.session/hello`, { name: 'bob marsh' })).json(), { taken: { name: 'Bob Marsh' } });
    const back = (await post(edit.port, `${edit.base}.session/hello`, { name: 'Bob Marsh', person: bob.person })).json();
    assert.equal(back.color, bob.color);
    assert.equal(back.known.length, people.length);
  });
});

test('the end of sharing tells the guests and keeps the session of the host', { timeout: 120_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const secret = 'a secret of the group, long enough';
  const relay = await startRelay({ host: '127.0.0.1', secret });
  t.after(() => relay.close());
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const json = { 'content-type': 'application/json' };
  const guest = (route, init) => fetch(`${relay.url}${api(route)}`, init);

  const host = (await post(edit.port, api('hello'), { name: 'Ana' })).json();
  assert.equal((await post(edit.port, api('share'), { relay: relay.url, secret })).status, 200);
  const ben = await (await guest('hello', { method: 'POST', headers: json, body: JSON.stringify({ name: 'Ben' }) })).json();
  assert.equal(ben.host, false);
  const hostFirst = (await raw(edit.port, 'GET', `${api('events')}?token=${host.token}&since=${host.v}`)).json();
  const guestFirst = await (await guest(`events?token=${ben.token}&since=${ben.v}`)).json();
  const guestWaiting = guest(`events?token=${ben.token}&since=${guestFirst.v}`).then((r) => r.json());
  const hostWaiting = raw(edit.port, 'GET', `${api('events')}?token=${host.token}&since=${hostFirst.v}`).then((r) => r.json());
  await until(() => relay.pulled() === 1, 'the edit command to pull the poll of the guest');

  assert.deepEqual((await raw(edit.port, 'DELETE', api('share'))).json(), { link: null });
  assert.deepEqual((await guestWaiting).ended, { by: 'Ana' });
  const hostEvents = await hostWaiting;
  assert.equal(hostEvents.ended, undefined);
  assert.deepEqual(hostEvents.people.map((p) => p.name), ['Ana']);
  assert.equal((await fetch(`${relay.url}${edit.base}index.html`)).status, 502);

  // shared again on the saved relay, the page of the guest is told the end until it says hello
  assert.equal((await post(edit.port, api('share'), {})).status, 200);
  assert.deepEqual((await (await guest(`events?token=${ben.token}&since=${ben.v}`)).json()).ended, { by: 'Ana' });
  const again = await (await guest('hello', { method: 'POST', headers: json, body: JSON.stringify({ name: 'Ben', person: ben.person, token: ben.token }) })).json();
  assert.equal(again.person, ben.person);
  const after = await (await guest(`events?token=${ben.token}&since=${ben.v}`)).json();
  assert.equal(after.ended, undefined);

  const at = DECK.indexOf('One');
  const op = (await post(edit.port, api('op'), { token: host.token, seq: 1, base: after.v, patches: [{ start: at, end: at + 3, text: 'Uno' }] })).json();
  assert.equal(op.ok, true, 'the edit command keeps running for the host');
});

test('the address of a relay is https, or http on this computer', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const share = (relay) => post(edit.port, `${edit.base}.session/share`, { relay, secret: 'a secret of the group, long enough' });
  for (const relay of ['http://relay.example.org', 'http://192.168.1.4:8787', 'ftp://relay.example.org', 'relay.example.org', 'https://user:pw@relay.example.org']) {
    const answer = await share(relay);
    assert.equal(answer.status, 400, relay);
    assert.deepEqual(answer.json(), { link: null, error: 'the address of the relay must start with https://' }, relay);
  }
  // accepted, and not reached, since nothing listens on port 1
  for (const relay of ['https://127.0.0.1:1', 'http://127.0.0.1:1', 'http://localhost:1']) assert.equal((await share(relay)).status, 502, relay);
});

if (process.platform !== 'win32') {
  for (const signal of ['SIGINT', 'SIGHUP']) {
    test(`${signal} answers the waiting polls with ended and writes the last operation`, { timeout: 60_000 }, async (t) => {
      const { root, talk, config } = talkFolder(t);
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
      t.after(() => stopEdit(edit));
      const api = (route) => `${edit.base}.session/${route}`;
      const hello = (await post(edit.port, api('hello'), { name: 'Ana' })).json();
      const first = (await raw(edit.port, 'GET', `${api('events')}?token=${hello.token}&since=${hello.v}`)).json();
      const answer = (await post(edit.port, api('op'), { token: hello.token, seq: 1, base: first.v, patches: [{ start: 0, end: 0, text: '<!-- last -->\n' }] })).json();
      assert.equal(answer.ok, true);
      // the first poll after the operation is answered with it, and the second one waits
      const next = (await raw(edit.port, 'GET', `${api('events')}?token=${hello.token}&since=${first.v}`)).json();
      const waiting = raw(edit.port, 'GET', `${api('events')}?token=${hello.token}&since=${next.v}`);
      await until(() => edit.stderr.includes('Keep this window open'), 'the edit command to be ready');
      edit.child.kill(signal);
      assert.deepEqual((await waiting).json().ended, { by: 'Ana' });
      assert.equal(await edit.exited, 0);
      assert.ok(text(join(talk, 'index.html')).startsWith('<!-- last -->\n'));
    });
  }
}

test('add regression test: a request body aborted by the browser does not stop the edit command', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const hello = (await post(edit.port, api('hello'), { name: 'Ana' })).json();
  const answer = (await post(edit.port, api('op'), { token: hello.token, seq: 1, base: hello.v, patches: [{ start: 0, end: 0, text: '<!-- kept -->\n' }] })).json();
  assert.equal(answer.ok, true);
  for (const path of ['/x', api('media/clip.mp4')]) {
    // a body of 1000 bytes announced, 2 sent, and the connection closed, as by a closed tab
    await new Promise((done, fail) => {
      const socket = connect(edit.port, '127.0.0.1', () => {
        socket.write(`${path.endsWith('.mp4') ? 'PUT' : 'POST'} ${path} HTTP/1.1\r\nHost: 127.0.0.1:${edit.port}\r\nContent-Length: 1000\r\n\r\nab`, () => socket.destroy());
      });
      socket.on('close', done);
      socket.on('error', fail);
    });
    for (let i = 0; i < 3; i++) assert.equal((await raw(edit.port, 'GET', `${edit.base}index.html`)).status, 200);
  }
  assert.equal(edit.child.exitCode, null, edit.stderr);
  await until(() => text(join(talk, 'index.html')).startsWith('<!-- kept -->'), 'the operation to be written');
});

test('add regression test: share requests at the same time leave no relay link running after the end of sharing', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const secret = 'a secret of the group, long enough';
  const relay = await startRelay({ host: '127.0.0.1', secret, guestMs: 2000 });
  t.after(() => relay.close());
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const share = `${edit.base}.session/share`;
  const guest = () => fetch(`${relay.url}${edit.base}index.html`).then((r) => r.status);
  // a link left running registers the session again within a few round trips of the relay
  const unreachable = async () => {
    for (let i = 0; i < 40; i++) assert.equal(await guest(), 502, `guest request ${i}`);
  };

  const both = await Promise.all([post(edit.port, share, { relay: relay.url, secret }), post(edit.port, share, { relay: relay.url, secret })]);
  assert.deepEqual(both.map((r) => r.status), [200, 200]);
  assert.deepEqual((await raw(edit.port, 'DELETE', share)).json(), { link: null });
  await unreachable();

  const [shared, stopped] = await Promise.all([post(edit.port, share, { relay: relay.url, secret }), raw(edit.port, 'DELETE', share)]);
  assert.equal(shared.status, 200);
  assert.deepEqual(stopped.json(), { link: null });
  assert.deepEqual((await raw(edit.port, 'GET', share)).json(), { link: null }, 'a stop sent during a share ends it');
  await unreachable();
});

test('add regression test: the saved secret of the relay is sent only to the saved address', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const secret = 'a secret of the group, long enough';
  const relay = await startRelay({ host: '127.0.0.1', secret });
  t.after(() => relay.close());
  const seen = [];
  const other = createServer((req, res) => {
    seen.push(req.headers.authorization ?? '');
    res.writeHead(401).end();
  });
  await new Promise((done) => other.listen(0, '127.0.0.1', done));
  t.after(() => other.close());
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const share = `${edit.base}.session/share`;
  assert.equal((await post(edit.port, share, { relay: relay.url, secret })).status, 200);
  assert.deepEqual((await raw(edit.port, 'DELETE', share)).json(), { link: null });

  const moved = await post(edit.port, share, { relay: `http://127.0.0.1:${other.address().port}` });
  assert.equal(moved.status, 400);
  assert.match(moved.json().error, /secret/);
  assert.deepEqual(seen, [], 'the saved secret reached another address');
  // the saved address goes on with the saved secret
  assert.equal((await post(edit.port, share, {})).status, 200);
  assert.equal(JSON.parse(text(join(config, 'beeson-slides', 'relay.json'))).relay, relay.url);
});

test('add regression test: .session/ is ignored by git in a talk whose .gitignore does not name it', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(talk, '.gitignore'), 'node_modules/\n*.pdf\n');
  const git = (...args) => spawnSync('git', args, { cwd: talk, encoding: 'utf8' });
  const hasGit = git('init', '-q').status === 0;
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  assert.equal((await post(edit.port, `${edit.base}.session/hello`, { name: 'Ana' })).status, 200);
  assert.equal(text(join(talk, '.session', '.gitignore')), '*\n');
  if (hasGit) assert.deepEqual(git('status', '--porcelain', '-uall').stdout.split('\n').filter((l) => l.includes('.session')), []);
});

test('add regression test: a dot folder or node_modules is not served under another spelling of its path', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(talk, '.git'));
  writeFileSync(join(talk, '.git', 'config'), 'token');
  mkdirSync(join(talk, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(talk, 'node_modules', 'x', 'index.js'), 'x');
  // a link inside the talk folder stands for a short name of Windows, e.g. GIT~1
  if (process.platform !== 'win32') {
    symlinkSync(join(talk, '.git'), join(talk, 'GIT~1'));
    symlinkSync(join(talk, 'node_modules'), join(talk, 'NODE_M~1'));
  }
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const paths = ['node_modules./x/index.js', 'node_modules%20/x/index.js', '.git./config', 'index.html.', 'index.html%20'];
  if (process.platform !== 'win32') paths.push('GIT~1/config', 'NODE_M~1/x/index.js');
  for (const path of paths) assert.equal((await raw(edit.port, 'GET', `${edit.base}${path}`)).status, 404, path);
});

test('add regression test: a page that knows the client id of another page cannot act as this page', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const hello = async (body) => (await post(edit.port, api('hello'), body)).json();
  const ann = await hello({ name: 'Ann' });
  const bo = await hello({ name: 'Bo' });
  assert.match(ann.token ?? '', /^[A-Za-z0-9_-]{22,}$/, 'hello gives the page a secret token');
  assert.notEqual(ann.token, ann.client);
  // the client id of Ann is public, since every page reads it in people, presence, and operations
  const id = bo.people.find((p) => p.name === 'Ann').client;
  const as = { client: id, token: id };
  const poll = async () => (await raw(edit.port, 'GET', `${api('events')}?client=${bo.client}&token=${bo.token}&since=${bo.v}`)).json();
  assert.equal((await post(edit.port, api('presence'), { ...as, state: 'spoofed' })).status === 200, false, 'presence as Ann');
  const op = (await post(edit.port, api('op'), { ...as, seq: 1, base: bo.v, patches: [{ start: 0, end: 0, text: '<!-- spoofed -->' }] })).json();
  assert.equal(op.ok, false, 'an operation as Ann');
  assert.equal((await post(edit.port, api('name'), { ...as, name: 'Mallory' })).status === 200, false, 'a new name of Ann');
  assert.equal((await raw(edit.port, 'GET', `${api('events')}?client=${id}&token=${id}&since=${bo.v}`)).status, 404, 'the events of Ann');
  const again = await hello({ name: 'Bo', person: bo.person, ...as });
  assert.notEqual(again.client, id, 'a hello that takes the page of Ann');
  await post(edit.port, api('bye'), as);
  const events = await poll();
  const seen = events.presence.find((p) => p.client === id);
  assert.ok(seen, 'Ann is still present after a bye in her name');
  assert.equal(seen.name, 'Ann');
  assert.equal(seen.state, null);
  assert.ok(!readFileSync(join(talk, 'index.html'), 'utf8').includes('spoofed'));
});

test('add regression test: guests cannot fill the places of a session, and a page that never polls is dropped', { timeout: 120_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const secret = 'a secret of the group, long enough';
  const relay = await startRelay({ host: '127.0.0.1', secret });
  t.after(() => relay.close());
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const hello = async (body) => (await post(edit.port, api('hello'), body)).json();
  const guest = async (body) => {
    const answer = await fetch(`${relay.url}${api('hello')}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: answer.status, body: await answer.json() };
  };
  assert.equal((await post(edit.port, api('share'), { relay: relay.url, secret })).status, 200);

  await t.test('a page that never polls is dropped after a few seconds', async () => {
    const quiet = await hello({ name: 'Quinn' });
    const watcher = await hello({ name: 'Wes' });
    assert.ok(watcher.people.some((p) => p.client === quiet.client));
    await until(async () => !(await hello({ name: 'Wes', person: watcher.person, token: watcher.token })).people.some((p) => p.client === quiet.client), 'the page that never polls to be dropped', 15_000);
  });

  await t.test('one person through the relay holds a few pages at most', async () => {
    const person = 'P'.repeat(22);
    let last;
    for (let i = 0; i < 20; i++) last = await guest({ name: 'Pat', person });
    assert.equal(last.status, 200);
    const pages = last.body.people.filter((p) => p.person === person).length;
    assert.ok(pages <= 8, `Pat holds ${pages} pages`);
  });

  await t.test('the host joins after guests took every place that they may take', async () => {
    for (let i = 0; i < 64; i++) await guest({ name: `Guest ${i}`, person: `${String(i).padStart(2, '0')}${'g'.repeat(20)}` });
    const host = await post(edit.port, api('hello'), { name: 'Ana' });
    assert.equal(host.status, 200, host.text);
  });
});

test('add regression test: an operation that arrives during the stop is refused rather than lost', { timeout: 60_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const hello = (await post(edit.port, api('hello'), { name: 'Ana' })).json();
  const first = (await raw(edit.port, 'GET', `${api('events')}?token=${hello.token}&since=${hello.v}`)).json();
  const waiting = raw(edit.port, 'GET', `${api('events')}?token=${hello.token}&since=${first.v}`);
  await until(() => edit.stderr.includes('Keep this window open'), 'the edit command to be ready');
  edit.child.kill('SIGTERM');
  // the answer of ended comes after the last write of index.html has begun
  assert.ok((await waiting).json().ended);
  const late = await post(edit.port, api('op'), { token: hello.token, seq: 1, base: first.v, patches: [{ start: 0, end: 0, text: '<!-- late -->\n' }] });
  assert.equal(await edit.exited, 0);
  const kept = text(join(talk, 'index.html')).startsWith('<!-- late -->\n');
  const refused = late.status !== 200 || late.json().ok === false;
  assert.ok(kept || refused, `the late operation was answered ${late.status} ${late.text} and is not in index.html`);
});

test('add regression test: a second start in the same talk folder hands over the address of the first', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: config, APPDATA: config };
  const first = await startEdit(talk, { env });
  t.after(() => stopEdit(first));
  const second = await startEdit(talk, { env });
  t.after(() => stopEdit(second));
  assert.equal(second.port, first.port, 'the second start prints the address of the first');
  assert.equal(second.url, first.url);
  assert.equal(await second.exited, 0);
  assert.equal(first.child.exitCode, null, 'the first edit command goes on');
  // a lock left by an edit command that died does not stop a new start
  first.child.kill('SIGKILL');
  await first.exited;
  const third = await startEdit(talk, { env });
  t.after(() => stopEdit(third));
  assert.equal((await raw(third.port, 'GET', `${third.base}index.html`)).status, 200);
  assert.equal(third.child.exitCode, null);
});

const SECRET = 'a secret of the group, long enough';

test('add regression test: a Ctrl+C while a start with --relay waits for the relay keeps the acknowledged operations', { timeout: 60_000, skip: process.platform === 'win32' && 'signals' }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // a relay that takes each connection and never answers
  const sockets = [];
  const hanging = createNetServer((socket) => sockets.push(socket));
  await new Promise((done) => hanging.listen(0, '127.0.0.1', done));
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    hanging.close();
  });
  const free = createNetServer();
  await new Promise((done) => free.listen(0, '127.0.0.1', done));
  const port = free.address().port;
  await new Promise((done) => free.close(done));
  const env = { ...process.env, SLIDES_RELAY_SECRET: SECRET, XDG_CONFIG_HOME: config, APPDATA: config };
  const child = spawn(process.execPath, [EDIT, talk, '--no-open', '--port', String(port), '--relay', `http://127.0.0.1:${hanging.address().port}`], { env, stdio: 'ignore' });
  const exited = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })));
  t.after(() => child.exitCode === null && child.signalCode === null && child.kill('SIGKILL'));
  // a tab of the last run comes back on the same port and key while the relay is asked
  const key = await until(() => existsSync(join(talk, '.session', 'key')) && text(join(talk, '.session', 'key')).trim(), 'the key of the session');
  const api = (route) => `/${key}/.session/${route}`;
  const hello = await until(() => post(port, api('hello'), { name: 'Ana' }).then((r) => r.status === 200 && r.json(), () => null), 'the hello of a page');
  await until(() => sockets.length > 0, 'the edit command to ask the relay for a registration');
  const op = (await post(port, api('op'), { token: hello.token, seq: 1, base: hello.v, patches: [{ start: 0, end: 0, text: '<!-- kept -->\n' }] })).json();
  assert.equal(op.ok, true);
  child.kill('SIGINT');
  assert.equal((await exited).signal, null, 'the edit command was ended by the signal without its stop');
  assert.ok(text(join(talk, 'index.html')).startsWith('<!-- kept -->\n'), 'the acknowledged operation is in index.html');
});

test('add regression test: hellos and byes of many pages do not log out a page that is present', { timeout: 120_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const host = (await post(edit.port, api('hello'), { name: 'Ana' })).json();
  assert.equal((await raw(edit.port, 'GET', `${api('events')}?token=${host.token}&since=${host.v}`)).status, 200);
  const person = 'G'.repeat(22);
  // more pages than the table of tokens holds, as by a loop of a guest or a long session
  for (let i = 0; i < 1030; i += 10) {
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        const page = (await post(edit.port, api('hello'), { name: 'Gus', person })).json();
        await post(edit.port, api('bye'), { token: page.token });
      }),
    );
  }
  const op = (await post(edit.port, api('op'), { token: host.token, seq: 1, base: host.v, patches: [{ start: 0, end: 0, text: '<!-- a -->' }] })).json();
  assert.equal(op.ok, true, `the operation of the host was answered ${JSON.stringify(op)}`);
  assert.equal((await raw(edit.port, 'GET', `${api('events')}?token=${host.token}&since=`)).status, 200, 'the events of the host');
});

test('add regression test: a second start refuses to run while the first edit command does not answer', { timeout: 60_000, skip: process.platform === 'win32' && 'SIGSTOP' }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: config, APPDATA: config };
  const first = await startEdit(talk, { env });
  t.after(() => stopEdit(first));
  // a Ctrl+Z in the terminal of the first edit command
  first.child.kill('SIGSTOP');
  try {
    const second = await startEdit(talk, { env: { ...env, SLIDES_LOCK_TIMEOUT_MS: '300' } });
    t.after(() => stopEdit(second));
    assert.equal(second.port, first.port, 'the second start runs beside the first');
    assert.equal(await second.exited, 0);
    assert.match(second.stderr, /does not answer/);
  } finally {
    first.child.kill('SIGCONT');
  }
  assert.equal((await raw(first.port, 'GET', `${first.base}index.html`)).status, 200);
});

test('add regression test: a guest who knows the person id of the host cannot rename the host or drop its pages', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const guest = async (body) => (await fetch(`${relay.url}${api('hello')}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const host = (await post(edit.port, api('hello'), { name: 'Claudio' })).json();
  assert.equal((await raw(edit.port, 'GET', `${api('events')}?token=${host.token}&since=${host.v}`)).status, 200);
  assert.equal((await post(edit.port, api('share'), { relay: relay.url, secret: SECRET })).status, 200);

  // person ids are public, since every page reads them in people and known
  const mallory = await guest({ name: 'Mallory', person: host.person });
  assert.equal(mallory.name, 'Claudio');
  assert.deepEqual(mallory.known.map((p) => p.name), ['Claudio'], 'the host is renamed by a guest');
  for (let i = 0; i < 8; i++) await guest({ name: 'claudio', claim: true });
  assert.equal((await raw(edit.port, 'GET', `${api('events')}?token=${host.token}&since=`)).status, 200, 'the page of the host is dropped for a page of a guest');
});

test('add regression test: names that look the same as a name present, or that show nothing, are refused', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const hello = (name) => post(edit.port, `${edit.base}.session/hello`, { name });
  assert.equal((await hello('Claudio')).status, 200);
  // a zero-width space, a soft hyphen, the fullwidth forms, a right-to-left override, and a joiner
  for (const name of ['Claudio​', 'Cl­audio', 'Ｃｌａｕｄｉｏ', 'Claudio‮', '⁧Claudio', 'Clau‍dio']) {
    assert.deepEqual((await hello(name)).json(), { taken: { name: 'Claudio' } }, JSON.stringify(name));
  }
  for (const name of ['​', '‮‍', '️', '⁦ ­']) assert.equal((await hello(name)).status, 400, JSON.stringify(name));
  // a family emoji joined by zero-width joiners, an emoji with its variation selector, and names in
  // Arabic, Hebrew, and Persian, the last with a zero-width non-joiner, are kept as typed
  for (const name of ['\u{1F468}‍\u{1F469}‍\u{1F467} Ana', '❤️ Bo', 'سارا', 'דנה', 'نیک‌نام']) {
    const answer = await hello(name);
    assert.equal(answer.status, 200, JSON.stringify(name));
    assert.equal(answer.json().name, name);
  }
});

test('add regression test: a move of the sharing to another relay tells the guests of the first relay that the session ended', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => first.close());
  const second = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => second.close());
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const events = (relay, who, since) => fetch(`${relay.url}${api(`events?token=${who.token}&since=${since}`)}`).then(async (r) => (r.status === 200 ? r.json() : { status: r.status, text: await r.text() }));
  await post(edit.port, api('hello'), { name: 'Ana' });
  assert.equal((await post(edit.port, api('share'), { relay: first.url, secret: SECRET })).status, 200);
  const ben = await (await fetch(`${first.url}${api('hello')}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ben' }) })).json();
  const seen = await events(first, ben, ben.v);
  const waiting = events(first, ben, seen.v);
  await until(() => first.pulled() === 1, 'the edit command to pull the poll of the guest');
  assert.equal((await post(edit.port, api('share'), { relay: second.url, secret: SECRET })).status, 200);
  assert.deepEqual((await waiting).ended, { by: 'Ana' }, 'the waiting poll of the guest');
  assert.deepEqual((await events(second, ben, seen.v)).ended, { by: 'Ana' }, 'a poll of the guest through the new relay');
});

test('add regression test: a write of index.html that keeps failing is told to the pages, and the text is kept at the stop', { timeout: 120_000, skip: (process.platform === 'win32' || process.getuid?.() === 0) && 'a folder without write permission' }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  const writable = () => chmodSync(talk, 0o755);
  t.after(() => {
    writable();
    rmSync(root, { recursive: true, force: true });
  });
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const host = (await post(edit.port, api('hello'), { name: 'Ana' })).json();
  let since = host.v;
  // the next answer of events whose writeError is matched by test
  const told = (test, what) =>
    until(async () => {
      const answer = (await raw(edit.port, 'GET', `${api('events')}?token=${host.token}&since=${since}`)).json();
      since = answer.v;
      return answer.writeError !== undefined && test(answer.writeError) && answer;
    }, what, 60_000);
  const op = async (seq, text) => {
    const answer = (await post(edit.port, api('op'), { token: host.token, seq, base: since, patches: [{ start: 0, end: 0, text }] })).json();
    assert.equal(answer.ok, true);
  };

  chmodSync(talk, 0o555);
  await op(1, '<!-- one -->\n');
  const failed = await told((e) => e !== null, 'the pages to be told that index.html is not written');
  assert.equal(failed.writeError.unwritten, 1);
  assert.match(failed.writeError.message, /EACCES|EPERM/);
  writable();
  await told((e) => e === null, 'the pages to be told that index.html is written again');
  assert.ok(text(join(talk, 'index.html')).startsWith('<!-- one -->\n'));

  chmodSync(talk, 0o555);
  await op(2, '<!-- two -->\n');
  await told((e) => e !== null, 'the pages to be told again');
  edit.child.kill('SIGTERM');
  assert.equal(await edit.exited, 1);
  assert.ok(!text(join(talk, 'index.html')).startsWith('<!-- two -->'));
  const kept = readdirSync(join(talk, '.session')).filter((n) => /^unwritten-.*\.html$/.test(n));
  assert.equal(kept.length, 1, 'the text of the session is kept beside index.html');
  assert.ok(edit.stderr.includes(join(talk, '.session', kept[0])), edit.stderr);
  assert.ok(text(join(talk, '.session', kept[0])).startsWith('<!-- two -->\n<!-- one -->\n'));
});

test('add regression test: a media upload needs the token of a page that is present', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  t.after(() => stopEdit(edit));
  const api = (route) => `${edit.base}.session/${route}`;
  const put = (query) => raw(edit.port, 'PUT', api(`media/plot.png${query}`), { body: 'png' });
  const ana = (await post(edit.port, api('hello'), { name: 'Ana' })).json();
  const ben = (await post(edit.port, api('hello'), { name: 'Ben' })).json();
  await post(edit.port, api('bye'), { token: ben.token });
  for (const [query, what] of [['', 'without a token'], [`?token=${'n'.repeat(22)}`, 'with an unknown token'], [`?token=${ben.token}`, 'with the token of a page that left']]) {
    const answer = await put(query);
    assert.equal(answer.status, 404, what);
    assert.deepEqual(answer.json(), { error: 'say hello first' }, what);
  }
  assert.equal(existsSync(join(talk, 'media')) && readdirSync(join(talk, 'media')).length, false, 'a refused upload is written');
  assert.deepEqual((await put(`?token=${ana.token}`)).json(), { path: 'media/plot.png' });
});
