// the zip of the talk folder that a page of a session downloads. its entries are compared with the
// files that the edit command serves and with index.html as the session has it. the modes, the
// wrapped trajectory files, and the routes of POST, GET, and DELETE are tested as well, with the
// limits directly and through a local relay, and the answers of the edit command while a zip is built

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { start } from '../theme/edit.mjs';
import { post, raw, talkFolder } from './helpers/session.mjs';
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
