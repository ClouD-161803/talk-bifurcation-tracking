// the zip of the talk folder that a page of a session downloads. its entries are compared with the
// files that the edit command serves and with index.html as the session has it. the modes, the
// wrapped trajectory files, and the routes of POST, GET, and DELETE are tested as well, with the
// limits directly and through a local relay, and the answers of the edit command while a zip is built

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { start } from '../theme/edit.mjs';
import { DECK, post, raw, talkFolder, within } from './helpers/session.mjs';
import { entries, unzipTo } from './helpers/zip.mjs';

const MB = 1024 * 1024;
const PIECE = 2 * MB;
const SECRET = 'the secret of the group for this test';
const unix = process.platform !== 'win32';
const BUSY = 'The edit command is busy with other downloads of the talk folder. Try again in a minute.';

// a second copy of the edit command, whose limit of a zip is 3 MB, for the tests that hold or change
// a read of a file in this process. the limit is read when the copy is loaded
process.env.SLIDES_ZIP_MAX_BYTES = String(3 * MB);
const small = await import('../theme/edit.mjs?limit=3MB');
delete process.env.SLIDES_ZIP_MAX_BYTES;

const api = (key, route) => `/${key}/.session/${route}`;
const urlOf = (path) => path.map(encodeURIComponent).join('/');

function put(talk, path, bytes) {
  const file = join(talk, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return file;
}

// an edit command in this process, stopped before its folder is removed
async function inProcess(t, root, talk, command = start) {
  const running = await command({ folder: talk, port: 0, log: () => {} });
  t.after(async () => {
    await running.close();
    rmSync(root, { recursive: true, force: true });
  });
  return running;
}

// the token of a new page, which polls the events until the session ends or the page leaves, as a
// page of a session does. the edit command drops a page that has not polled 5 s after its hello
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

// the answer waits for the zip, at most for timeout
const makeZip = (port, key, token, timeout) => raw(port, 'POST', `${api(key, 'zip')}?token=${token}`, { body: '', timeout });
const pieceOf = (port, key, token, id, at) => raw(port, 'GET', `${api(key, `zip/${id}`)}?token=${token}&at=${at}`);
const dropZip = (port, key, token, id) => raw(port, 'DELETE', `${api(key, `zip/${id}`)}?token=${token}`);

// the zip of the page of token, asked for piece by piece as the session client does
async function download(port, key, token, timeout) {
  const made = await makeZip(port, key, token, timeout);
  assert.equal(made.status, 200, made.text);
  const { id, size, name } = made.json();
  const pieces = [];
  for (let at = 0; at < size; ) {
    const piece = await pieceOf(port, key, token, id, at);
    assert.equal(piece.status, 200, piece.text);
    assert.equal(piece.headers['content-type'], 'application/zip');
    assert.equal(piece.body.length, Math.min(PIECE, size - at), `the piece at ${at}`);
    pieces.push(piece.body);
    at += piece.body.length;
  }
  const zip = Buffer.concat(pieces);
  assert.equal(zip.length, size);
  return { id, size, name, zip };
}

// the files below the talk folder, with every link followed, as segments
function filesBelow(talk, dir = []) {
  const out = [];
  for (const name of readdirSync(join(talk, ...dir))) {
    const path = [...dir, name];
    let info;
    try {
      info = statSync(join(talk, ...path));
    } catch {
      continue;
    }
    if (info.isDirectory()) out.push(...filesBelow(talk, path));
    else if (info.isFile()) out.push(path);
  }
  return out;
}

const byName = (zip, top = 'talk') => new Map(entries(zip).map((e) => [e.name.slice(top.length + 1), e]));

test('the zip holds every file that the edit command serves, with its bytes and its mode, and nothing else', { timeout: 120_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  put(talk, 'notes.txt', 'a line of the notes of the talk\n'.repeat(200));
  put(talk, 'empty.txt', '');
  put(talk, 'media/photo.png', randomBytes(64 * 1024));
  put(talk, 'media/plot.json', JSON.stringify({ x: [1, 2, 3] }));
  put(talk, 'a b/é ü.txt', 'a name with a space and letters that are not ASCII');
  put(talk, 'sub/deep/deeper/x.css', 'p { color: red; }');
  put(talk, 'sub/check/a.png', randomBytes(100));
  put(talk, 'sub/slides.pdf', '%PDF-1.4 kept below the top');
  put(talk, 'sub/node_modules/y.js', 'y');
  put(talk, 'media/Node_Modules/z.js', 'z');
  put(talk, 'node_modules/x/index.js', 'x');
  put(talk, '.env', 'SECRET=1');
  put(talk, '.git/config', 'token');
  put(talk, 'check/a.png', randomBytes(100));
  put(talk, 'slides.pdf', '%PDF-1.4');
  put(talk, 'slides.pptx', 'pptx');
  put(talk, 'Edit.command', '#!/bin/sh\n');
  put(talk, 'Edit.sh', '#!/bin/sh\n');
  if (unix) {
    chmodSync(put(talk, 'tool', '#!/bin/sh\n'), 0o755);
    put(talk, 'trail.', 'a name with a trailing dot');
    put(talk, 'space ', 'a name with a trailing space');
  }
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const token = await hello(t, port, key, 'Ann');
  const { zip, name } = await download(port, key, token);
  assert.equal(name, 'talk.zip');

  const list = entries(zip);
  assert.ok(list.every((e) => e.name.startsWith('talk/')), 'every entry is below one top folder');
  assert.equal(list[0].name, 'talk/index.html');
  const rest = list.slice(1).map((e) => e.name);
  assert.deepEqual(rest, [...rest].sort(), 'the entries after index.html are sorted by name');
  const got = byName(zip);
  assert.equal(got.get('notes.txt').method, 8);
  assert.equal(got.get('media/photo.png').method, 0);
  assert.equal(got.get('empty.txt').bytes.length, 0);

  // every file that GET answers is in the zip with the same bytes, and every entry is answered. the
  // outputs of npm run check, pdf, and pptx are served but left out of the zip
  const outputs = ['check/a.png', 'slides.pdf', 'slides.pptx'];
  const served = new Map();
  for (const path of filesBelow(talk)) {
    if (path.join('/') === 'index.html') continue;
    if (outputs.includes(path.join('/'))) {
      assert.equal((await raw(port, 'GET', `/${key}/${urlOf(path)}`)).status, 200, path.join('/'));
      continue;
    }
    const answer = await raw(port, 'GET', `/${key}/${urlOf(path)}`);
    if (answer.status === 200) served.set(path.join('/'), answer.body);
  }
  assert.deepEqual([...got.keys()].filter((n) => n !== 'index.html').sort(), [...served.keys()].sort());
  for (const [n, bytes] of served) assert.ok(got.get(n).bytes.equals(bytes), n);

  const left = ['.env', '.git/config', 'node_modules/x/index.js', 'sub/node_modules/y.js', 'media/Node_Modules/z.js', 'check/a.png', 'slides.pdf', 'slides.pptx'];
  if (unix) left.push('trail.', 'space ');
  for (const n of left) assert.equal(got.has(n), false, n);
  assert.ok(![...got.keys()].some((n) => n.startsWith('.session/')), 'nothing of .session/');
  for (const n of ['sub/check/a.png', 'sub/slides.pdf', 'a b/é ü.txt', 'sub/deep/deeper/x.css']) assert.ok(got.has(n), n);

  for (const e of list) assert.equal(e.madeBy, 3, `${e.name} is made by Unix`);
  const runs = ['Edit.command', 'Edit.sh', ...(unix ? ['tool'] : [])];
  for (const [n, e] of got) assert.equal(e.mode, runs.includes(n) ? 0o755 : 0o644, n);

  const file = join(root, 'talk.zip');
  writeFileSync(file, zip);
  try {
    assert.match(execFileSync('unzip', ['-tq', file], { encoding: 'utf8' }), /No errors detected/);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const out = join(root, 'unzipped');
  unzipTo(file, zip, out);
  assert.equal(readFileSync(join(out, 'talk', 'notes.txt'), 'utf8'), got.get('notes.txt').bytes.toString('utf8'));
  assert.ok(readFileSync(join(out, 'talk', 'a b', 'é ü.txt')).equals(got.get('a b/é ü.txt').bytes));
  if (unix) assert.equal(statSync(join(out, 'talk', 'Edit.command')).mode & 0o111, 0o111, 'Edit.command is run after the unzip');
});

test('links are followed inside the talk folder only, and a link to its own folder does not hold up the zip', { skip: !unix, timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  put(talk, 'sub/a.txt', 'a');
  put(talk, 'notes.txt', 'notes');
  put(root, 'outside/secret.txt', 'secret');
  symlinkSync(join(root, 'outside', 'secret.txt'), join(talk, 'secret.txt'));
  symlinkSync(join(root, 'outside'), join(talk, 'outdir'));
  symlinkSync(join(talk, 'sub'), join(talk, 'alias'));
  symlinkSync(join(talk, 'notes.txt'), join(talk, 'link.txt'));
  symlinkSync(join(talk, 'sub'), join(talk, 'sub', 'self'));
  symlinkSync(talk, join(talk, 'sub', 'up'));
  // links inside the talk folder stand for short names of Windows, e.g. GIT~1
  put(talk, '.git/config', 'token');
  put(talk, 'node_modules/x/index.js', 'x');
  symlinkSync(join(talk, '.git'), join(talk, 'GIT~1'));
  symlinkSync(join(talk, 'node_modules'), join(talk, 'NODE_M~1'));
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const token = await hello(t, port, key, 'Ann');
  const made = await within(makeZip(port, key, token), 30_000, 'the zip of a folder with a loop of links');
  assert.equal(made.status, 200, made.text);
  const { zip } = await download(port, key, token);
  const got = byName(zip);
  assert.deepEqual([...got.keys()], ['index.html', 'alias/a.txt', 'link.txt', 'notes.txt', 'sub/a.txt']);
  for (const n of ['alias/a.txt', 'link.txt', 'sub/a.txt']) assert.ok(got.get(n).bytes.equals((await raw(port, 'GET', `/${key}/${n}`)).body), n);
});

test('the top folder of the zip is named after the talk folder without the characters that Windows refuses', { skip: !unix, timeout: 60_000 }, async (t) => {
  const { root } = talkFolder(t);
  const talk = join(root, 'Talk: draft?.');
  put(talk, 'index.html', DECK);
  const running = await inProcess(t, root, talk);
  const token = await hello(t, running.port, running.key, 'Ann');
  const { zip, name } = await download(running.port, running.key, token);
  assert.equal(name, 'Talk- draft-.zip');
  assert.equal(entries(zip)[0].name, 'Talk- draft-/index.html');
});

test('a talk folder named after a device of Windows, with a long name, or with a character that Windows or Chrome does not take in a name, gives a zip and a top folder that both take', { skip: !unix, timeout: 180_000 }, async (t) => {
  const names = [
    ['aux', 'aux-'],
    ['COM1.talk', 'COM1-.talk'],
    ['auxiliary', 'auxiliary'],
    // the digits that Windows reserves as well, and a device name with spaces before the dot
    ['LPT\u00b9', 'LPT\u00b9-'],
    ['com\u00b3.x', 'com\u00b3-.x'],
    ['con .txt', 'con- .txt'],
    // Extract All of Windows names a folder after the zip around the top folder, and a path of
    // Windows holds 259 characters, hence the name is cut to 64, without a dot or a space at its end
    ['x'.repeat(100), 'x'.repeat(64)],
    [`${'y'.repeat(63)}. a long name`, 'y'.repeat(63)],
    // Windows counts a path in the units of UTF-16, of which an emoji has two, and an emoji is not cut
    ['\u{1f600}'.repeat(40), '\u{1f600}'.repeat(32)],
    [`${'z'.repeat(63)}\u{1f600}`, 'z'.repeat(63)],
    ['CONIN$', 'CONIN$-'],
    ['conout$.x', 'conout$-.x'],
    ['clock$', 'clock$-'],
    // the - of a device counts in the 64, and a name that is cut to a device is one
    [`COM1.${'a'.repeat(59)}`, `COM1-.${'a'.repeat(58)}`],
    [`con${' '.repeat(59)}.x`, 'con-'],
    [`aux${' '.repeat(61)}x`, 'aux-'],
    // a dot, a space, or a ~ at the start, the last of which Chrome replaces in the name of a
    // download, and a name of which nothing is left
    ['.talk', 'talk'],
    [' talk', 'talk'],
    ['~talk', 'talk'],
    ['...', 'talk'],
    // a decomposed name is composed, on every system
    ['cafe\u0301', 'caf\u00e9'],
    // the control and the format characters, which Chrome replaces as well: DEL, NEL, the override of
    // the direction, and the joiner
    ['a\u007fb\u0085c', 'a-b-c'],
    ['talk\u202egpj.exe', 'talk-gpj.exe'],
    ['ta\u200dlk', 'ta-lk'],
  ];
  for (const [folder, name] of names) {
    const { root } = talkFolder(t);
    const talk = join(root, 'devices', folder);
    put(talk, 'index.html', DECK);
    const running = await inProcess(t, root, talk);
    const token = await hello(t, running.port, running.key, 'Ann');
    const got = await download(running.port, running.key, token);
    assert.equal(got.name, `${name}.zip`);
    assert.equal(entries(got.zip)[0].name, `${name}/index.html`);
  }
});

test('on macOS, a name that is stored decomposed is zipped composed, as a deck writes it', { skip: process.platform !== 'darwin', timeout: 60_000 }, async (t) => {
  const { root } = talkFolder(t);
  const [composed, decomposed] = ['\u00e9', 'e\u0301'].map((e) => `caf${e}`);
  assert.notEqual(composed, decomposed);
  const talk = join(root, `${decomposed} talk`);
  put(talk, 'index.html', DECK.replace('</body>', `<section><div data-trajectories="${decomposed}/o.json"></div></section>\n</body>`));
  put(talk, `media/${decomposed}.png`, 'png');
  put(talk, `${decomposed}/o.json`, '[]');
  put(talk, `${decomposed}/o.json.js`, 'taken');
  assert.ok(readdirSync(join(talk, 'media')).includes(`${decomposed}.png`), 'the file system keeps the decomposed name');
  const running = await inProcess(t, root, talk);
  const token = await hello(t, running.port, running.key, 'Ann');
  const { zip, name } = await download(running.port, running.key, token);
  assert.equal(name, `${composed} talk.zip`);
  const got = byName(zip, `${composed} talk`);
  // the wrapped file keeps the name that the deck writes, with a number, since its name is taken
  assert.deepEqual([...got.keys()], ['index.html', `${composed}/o.json`, `${composed}/o.json.js`, `${decomposed}/o.json-2.js`, `media/${composed}.png`].sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a < b ? -1 : 1)));
  assert.ok(got.get('index.html').bytes.toString('utf8').includes(`data-trajectories="${decomposed}/o.json-2.js"`));
});

test('an entry has the time of its file to 2 s, and a time outside the years of a zip is written as the nearest one', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  const at = (file, date) => utimesSync(put(talk, file, file), date, date);
  at('now.txt', new Date(2026, 4, 17, 13, 45, 31));
  at('early.txt', new Date(1975, 0, 1, 12));
  at('late.txt', new Date(2200, 5, 15, 10, 20, 30));
  const running = await inProcess(t, root, talk);
  const token = await hello(t, running.port, running.key, 'Ann');
  const got = byName((await download(running.port, running.key, token)).zip);
  assert.deepEqual(got.get('now.txt').modified, new Date(2026, 4, 17, 13, 45, 30));
  assert.deepEqual(got.get('early.txt').modified, new Date(1980, 0, 1));
  assert.deepEqual(got.get('late.txt').modified, new Date(2107, 5, 15, 10, 20, 30));
});
