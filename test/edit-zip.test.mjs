import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs, { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, truncateSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import fsp from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { startRelay } from '../scripts/relay.mjs';
import { start } from '../theme/edit.mjs';
import { DECK, post, raw, startEdit, talkFolder, until, within } from './helpers/session.mjs';
import { entries, unzipTo } from './helpers/zip.mjs';

const MB = 1024 * 1024;
const PIECE = 2 * MB;
const SECRET = 'the secret of the group for this test';
const unix = process.platform !== 'win32';
const BUSY = 'The edit command is busy with other downloads of the talk folder. Try again in a minute.';

process.env.SLIDES_ZIP_MAX_BYTES = String(3 * MB);
process.env.SLIDES_ZIP_HELD_BYTES = String(3 * MB);
const small = await import('../theme/edit.mjs?limit=3MB');
delete process.env.SLIDES_ZIP_MAX_BYTES;
delete process.env.SLIDES_ZIP_HELD_BYTES;
const text = (bytes) => randomBytes(Math.ceil((bytes * 3) / 4)).toString('base64').slice(0, bytes);

const api = (key, route) => `/${key}/.session/${route}`;
const urlOf = (path) => path.map(encodeURIComponent).join('/');

function put(talk, path, bytes) {
  const file = join(talk, ...path.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return file;
}

async function inProcess(t, root, talk, command = start) {
  const running = await command({ folder: talk, port: 0, log: () => {} });
  t.after(async () => {
    await running.close();
    rmSync(root, { recursive: true, force: true });
  });
  return running;
}

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

const makeZip = (port, key, token, timeout) => raw(port, 'POST', `${api(key, 'zip')}?token=${token}`, { body: '', timeout });
const pieceOf = (port, key, token, id, at) => raw(port, 'GET', `${api(key, `zip/${id}`)}?token=${token}&at=${at}`);
const dropZip = (port, key, token, id) => raw(port, 'DELETE', `${api(key, `zip/${id}`)}?token=${token}`);

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
    ['aux', 'aux-', 'a device of Windows'],
    ['COM1.talk', 'COM1-.talk', 'a device of Windows with an extension'],
    ['auxiliary', 'auxiliary', 'a name that only begins with a device'],
    ['LPT\u00b9', 'LPT\u00b9-', 'a digit that Windows reserves for a device as well'],
    ['com\u00b3.x', 'com\u00b3-.x', 'a digit that Windows reserves for a device as well'],
    ['con .txt', 'con- .txt', 'a device with spaces before the dot'],
    ['x'.repeat(100), 'x'.repeat(64), 'a long name, cut to 64 since the zip is unzipped by Extract All of Windows into a folder of its name, in a path of at most 259 characters'],
    [`${'y'.repeat(63)}. a long name`, 'y'.repeat(63), 'a cut name that would end with a dot or a space'],
    ['\u{1f600}'.repeat(40), '\u{1f600}'.repeat(32), 'a path of Windows counted in UTF-16 code units, two for an emoji'],
    [`${'z'.repeat(63)}\u{1f600}`, 'z'.repeat(63), 'an emoji that is not cut in half'],
    ['CONIN$', 'CONIN$-', 'a device of Windows'],
    ['conout$.x', 'conout$-.x', 'a device of Windows'],
    ['clock$', 'clock$-', 'a device of Windows'],
    [`COM1.${'a'.repeat(59)}`, `COM1-.${'a'.repeat(58)}`, 'the - after a device, which counts in the 64 characters'],
    [`con${' '.repeat(59)}.x`, 'con-', 'a name cut to a device'],
    [`aux${' '.repeat(61)}x`, 'aux-', 'a name cut to a device'],
    ['.talk', 'talk', 'a dot at the start'],
    [' talk', 'talk', 'a space at the start'],
    ['~talk', 'talk', 'a ~ at the start, which Chrome replaces in the name of a download'],
    ['...', 'talk', 'a name of which nothing is left'],
    ['cafe\u0301', 'caf\u00e9', 'a decomposed name, which is composed on every system'],
    ['a\u007fb\u0085c', 'a-b-c', 'control characters, which Chrome replaces'],
    ['talk\u202egpj.exe', 'talk-gpj.exe', 'a format character, which Chrome replaces'],
    ['ta\u200dlk', 'ta-lk', 'a joiner, which Chrome replaces'],
  ];
  for (const [folder, name, why] of names) {
    const { root } = talkFolder(t);
    const talk = join(root, 'devices', folder);
    put(talk, 'index.html', DECK);
    const running = await inProcess(t, root, talk);
    const token = await hello(t, running.port, running.key, 'Ann');
    const got = await download(running.port, running.key, token);
    assert.equal(got.name, `${name}.zip`, why);
    assert.equal(entries(got.zip)[0].name, `${name}/index.html`, why);
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
  assert.deepEqual([...got.keys()], ['index.html', `${composed}/o.json`, `${composed}/o.json.js`, `${decomposed}/o.json-2.js`, `media/${composed}.png`].sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a < b ? -1 : 1)));
  assert.ok(got.get('index.html').bytes.toString('utf8').includes(`data-trajectories="${decomposed}/o.json-2.js"`));
});

test('an entry has the time of its file to 2 s, and a time outside the years of a zip is written as the nearest one', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  const at = (file, date) => utimesSync(put(talk, file, file), date, date);
  at('now.txt', new Date(2026, 4, 17, 13, 45, 31));
  at('early.txt', new Date(1975, 0, 1, 12));
  put(talk, 'late.txt', 'late.txt');
  const wrappedByNodeOnWindows = new Date(2200, 5, 15, 10, 20, 30);
  const { stat, lstat } = fsp;
  for (const [name, real] of [['stat', stat], ['lstat', lstat]]) {
    fsp[name] = async (file, ...rest) => {
      const info = await real(file, ...rest);
      if (String(file).endsWith('late.txt')) info.mtime = wrappedByNodeOnWindows;
      return info;
    };
  }
  syncBuiltinESMExports();
  t.after(() => {
    Object.assign(fsp, { stat, lstat });
    syncBuiltinESMExports();
  });
  const running = await inProcess(t, root, talk);
  const token = await hello(t, running.port, running.key, 'Ann');
  const got = byName((await download(running.port, running.key, token)).zip);
  assert.deepEqual(got.get('now.txt').modified, new Date(2026, 4, 17, 13, 45, 30));
  assert.deepEqual(got.get('early.txt').modified, new Date(1980, 0, 1));
  assert.deepEqual(got.get('late.txt').modified, new Date(2107, 5, 15, 10, 20, 30));
});

test('index.html of the zip is the text of the session before it is written, with the byte order mark of the file', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t, `﻿${DECK}`);
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const ann = (await post(port, api(key, 'hello'), { name: 'Ann' })).json();
  const { renameSync } = fs;
  let held = true;
  let refused = 0;
  fs.renameSync = (from, to) => {
    if (held && to.endsWith(join('talk', 'index.html'))) {
      refused++;
      throw Object.assign(new Error('EROFS: read-only file system, rename'), { code: 'EROFS' });
    }
    return renameSync(from, to);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.renameSync = renameSync;
    syncBuiltinESMExports();
  });

  const at = DECK.indexOf('First slide');
  const op = (await post(port, api(key, 'op'), { token: ann.token, seq: 1, base: ann.v, patches: [{ start: at, end: at + 5, text: 'Opening' }] })).json();
  assert.equal(op.ok, true);
  await until(() => refused > 0, 'a write of the operation to fail');
  const { zip } = await download(port, key, ann.token);
  const index = entries(zip)[0].bytes;
  assert.deepEqual([...index.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(index.toString('utf8'), `﻿${running.authority.text}`);
  assert.ok(index.toString('utf8').includes('Opening slide'));
  assert.ok(index.equals((await raw(port, 'GET', `/${key}/index.html`)).body));
  assert.equal(readFileSync(join(talk, 'index.html'), 'utf8').includes('Opening slide'), false, 'the file on disk is not written yet');
  held = false;
  await until(() => readFileSync(join(talk, 'index.html'), 'utf8').includes('Opening slide'), 'the operation to be written');
});

test('tex.js of the zip is the one of the text of the session, before the edit command has written it', { timeout: 60_000 }, async (t) => {
  const cite = (key) => `<section><p>A paper <cite data-key="${key}"></cite></p></section>\n`;
  const { root, talk } = talkFolder(t, DECK.replace('</body>', `${cite('ann2020')}</body>`));
  const entry = (key, title, year) => `@article{${key},\n  author = {Ann Author},\n  title = {${title}},\n  journal = {Journal of Tests},\n  year = {${year}}\n}\n`;
  put(talk, 'references.bib', `${entry('ann2020', 'The first paper', 2020)}\n${entry('bo2021', 'The second paper', 2021)}`);
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const ann = (await post(port, api(key, 'hello'), { name: 'Ann' })).json();
  const before = byName((await download(port, key, ann.token)).zip).get('tex.js')?.bytes.toString('utf8');
  assert.ok(before?.includes('The first paper') && !before.includes('The second paper'), before);
  assert.equal(existsSync(join(talk, 'tex.js')), false);

  const { renameSync } = fs;
  let held = true;
  let refused = 0;
  fs.renameSync = (from, to) => {
    if (held && to.endsWith(join('talk', 'index.html'))) {
      refused++;
      throw Object.assign(new Error('EROFS: read-only file system, rename'), { code: 'EROFS' });
    }
    return renameSync(from, to);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs.renameSync = renameSync;
    syncBuiltinESMExports();
  });
  const at = running.authority.text.indexOf('</body>');
  const op = (await post(port, api(key, 'op'), { token: ann.token, seq: 1, base: ann.v, patches: [{ start: at, end: at, text: cite('bo2021') }] })).json();
  assert.equal(op.ok, true);
  await until(() => refused > 0, 'a write of the operation to fail');
  const got = byName((await download(port, key, ann.token)).zip);
  assert.ok(got.get('index.html').bytes.toString('utf8').includes('data-key="bo2021"'));
  const tex = got.get('tex.js').bytes.toString('utf8');
  assert.ok(tex.includes('The first paper') && tex.includes('The second paper'), tex);
  assert.equal(existsSync(join(talk, 'tex.js')), false, 'tex.js is not written yet');
  held = false;
  await until(() => existsSync(join(talk, 'tex.js')), 'tex.js to be written');
  assert.equal(readFileSync(join(talk, 'tex.js'), 'utf8'), tex);
});

test('a tex.js that the talk folder holds under a name in another case, or with a long s that the disk of a Mac reads as an s, is zipped as tex.js on a disk that does not tell the cases apart', { timeout: 60_000 }, async (t) => {
  for (const name of ['Tex.js', 'tex.j\u017f']) {
    const { root, talk } = talkFolder(t, DECK.replace('</body>', '<section><p>A paper <cite data-key="ann2020"></cite></p></section>\n</body>'));
    put(talk, 'references.bib', '@article{ann2020,\n  author = {Ann Author},\n  title = {The first paper},\n  journal = {Journal of Tests},\n  year = {2020}\n}\n');
    put(talk, name, 'stale');
    const blind = existsSync(join(talk, 'tex.js'));
    const running = await inProcess(t, root, talk);
    const token = await hello(t, running.port, running.key, 'Ann');
    const got = byName((await download(running.port, running.key, token)).zip);
    assert.ok(got.get('tex.js')?.bytes.toString('utf8').includes('The first paper'), `tex.js is the one of the session next to ${name}`);
    if (blind) assert.equal(got.has(name), false, name);
    else assert.equal(got.get(name)?.bytes.toString('utf8'), 'stale', name);
  }
});

test('a Tex.js of a talk folder without sources is zipped as tex.js as well on a disk that does not tell the cases apart, with its bytes', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  put(talk, 'Tex.js', 'written by npm run tex');
  const blind = existsSync(join(talk, 'tex.js'));
  const running = await inProcess(t, root, talk);
  const token = await hello(t, running.port, running.key, 'Ann');
  const got = byName((await download(running.port, running.key, token)).zip);
  assert.deepEqual([...got.keys()], ['index.html', blind ? 'tex.js' : 'Tex.js']);
  assert.equal([...got.values()][1].bytes.toString('utf8'), 'written by npm run tex');
});

test('a talk folder with a folder named tex.js gives a zip without a file of this name, which is unzipped', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t, DECK.replace('</body>', '<section><p>A paper <cite data-key="ann2020"></cite></p></section>\n</body>'));
  put(talk, 'references.bib', '@article{ann2020,\n  author = {Ann Author},\n  title = {The first paper},\n  journal = {Journal of Tests},\n  year = {2020}\n}\n');
  put(talk, 'tex.js/notes.txt', 'notes');
  const running = await inProcess(t, root, talk);
  const token = await hello(t, running.port, running.key, 'Ann');
  const { zip } = await download(running.port, running.key, token);
  assert.deepEqual([...byName(zip).keys()], ['index.html', 'references.bib', 'tex.js/notes.txt']);
  const file = join(root, 'talk.zip');
  writeFileSync(file, zip);
  unzipTo(file, zip, join(root, 'unzipped'));
  assert.equal(readFileSync(join(root, 'unzipped', 'talk', 'tex.js', 'notes.txt'), 'utf8'), 'notes');
});

test('on a disk that tells the cases apart, a Tex.js is kept next to the tex.js of the session, also when tex.js is a link out of the talk folder', { skip: !unix, timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t, DECK.replace('</body>', '<section><p>A paper <cite data-key="ann2020"></cite></p></section>\n</body>'));
  put(talk, 'references.bib', '@article{ann2020,\n  author = {Ann Author},\n  title = {The first paper},\n  journal = {Journal of Tests},\n  year = {2020}\n}\n');
  put(talk, 'Tex.js', 'a file of the talk');
  if (existsSync(join(talk, 'tex.js'))) return t.skip('the disk does not tell the cases apart');
  put(root, 'outside.js', 'outside');
  symlinkSync(join(root, 'outside.js'), join(talk, 'tex.js'));
  const running = await inProcess(t, root, talk);
  const token = await hello(t, running.port, running.key, 'Ann');
  const got = byName((await download(running.port, running.key, token)).zip);
  assert.deepEqual([...got.keys()], ['index.html', 'Tex.js', 'references.bib', 'tex.js']);
  assert.equal(got.get('Tex.js').bytes.toString('utf8'), 'a file of the talk');
  assert.ok(got.get('tex.js').bytes.toString('utf8').includes('The first paper'), 'tex.js is the one of the session');
});

test('a JSON file named by data-trajectories is wrapped into a script file next to it, and index.html names the script file', { timeout: 60_000 }, async (t) => {
  const pairs = [
    ['<div data-trajectories="orbits/a.json"></div>', '<div data-trajectories="orbits/a.json.js"></div>'],
    ["<div data-trajectories='orbits/b.json'></div>", "<div data-trajectories='orbits/b.json.js'></div>"],
    ['<div data-trajectories=orbits/c.json></div>', '<div data-trajectories=orbits/c.json.js></div>'],
    ['<div data-trajectories="orbits/d%20e.json"></div>', '<div data-trajectories="orbits/d%20e.json.js"></div>'],
    ['<div data-trajectories="orbits/a.json"></div>', '<div data-trajectories="orbits/a.json.js"></div>'],
    ['<div data-trajectories="orbits/q.json?v=2"></div>', '<div data-trajectories="orbits/q.json.js?v=2"></div>'],
    ['<div data-trajectories="orbits/h.json#t"></div>', '<div data-trajectories="orbits/h.json.js#t"></div>'],
    ['<div data-trajectories="orbits/f&amp;g.json"></div>', '<div data-trajectories="orbits/f&amp;g.json.js"></div>'],
    ['<div data-trajectories="orbits/r.json?v=2&amp;t=3"></div>', '<div data-trajectories="orbits/r.json.js?v=2&amp;t=3"></div>'],
    ['<div data-trajectories="orbits/s.json?v=2&t=3"></div>', '<div data-trajectories="orbits/s.json.js?v=2&t=3"></div>'],
    ['<div data-trajectories="orbits/u.json&#63;v=2"></div>', '<div data-trajectories="orbits/u.json.js&#63;v=2"></div>'],
    ['<div data-trajectories="orbits/w.json&#x23;x.js"></div>', '<div data-trajectories="orbits/w.json.js&#x23;x.js"></div>'],
    ['<div data-trajectories="orbits/js.js"></div>'],
    ['<div data-trajectories="orbits/missing.json"></div>'],
    ['<div data-trajectories="../outside.json"></div>'],
    ['<div data-trajectories="orbits/../../outside.json"></div>'],
    ['<div data-trajectories="https://example.com/orbits/a.json"></div>'],
    ['<div data-trajectories="/t/orbits/a.json"></div>'],
    ['<div data-trajectories="http:orbits/a.json"></div>'],
    ['<div data-trajectories="//talk.invalid/t/orbits/a.json"></div>'],
    ['<div data-trajectories="orbits/k.json"></div>', '<div data-trajectories="orbits/k.json-2.js"></div>'],
    ['<div data-trajectories="orbits/Case.json"></div>', '<div data-trajectories="orbits/Case.json-2.js"></div>'],
    ['<div data-trajectories="orbits/dir.json"></div>', '<div data-trajectories="orbits/dir.json-2.js"></div>'],
    ['<div data-trajectories="orbits/STRASSE.json"></div>', '<div data-trajectories="orbits/STRASSE.json-2.js"></div>'],
    ['<div data-trajectories="orbits/\u0390.json"></div>', '<div data-trajectories="orbits/\u0390.json-2.js"></div>'],
    ['<div data-trajectories="orbits/\u1fb7.json"></div>', '<div data-trajectories="orbits/\u1fb7.json-2.js"></div>'],
    ['<div data-trajectories="orbits/\u00e9.json"></div>', '<div data-trajectories="orbits/\u00e9.json-2.js"></div>'],
    ['<!-- <div data-trajectories="orbits/m1.json"></div> -->'],
    [`<script>const s = '<div data-trajectories="orbits/m2.json"></div>';</script>`],
    ['<pre>&lt;div data-trajectories="orbits/m3.json"&gt;&lt;/div&gt;</pre>'],
    ...(unix ? [['<div data-trajectories="orbits/out.json"></div>']] : []),
  ];
  const deckOf = (i) => DECK.replace('</body>', `<section>\n${pairs.map((p) => p[i] ?? p[0]).join('\n')}\n</section>\n</body>`);
  const { root, talk } = talkFolder(t, deckOf(0));
  const json = (n) => JSON.stringify({ trajectories: [{ name: n }] });
  const wrapped = ['a', 'b', 'c', 'd e', 'q', 'h', 'f&g', 'r', 's', 'u', 'w'];
  for (const n of [...wrapped, 'k', 'Case', 'dir', 'STRASSE', '\u0390', '\u1fb7', '\u00e9', 'm1', 'm2', 'm3']) put(talk, `orbits/${n}.json`, json(n));
  put(talk, 'orbits/dir.json.js/a.txt', 'a file in a folder');
  put(talk, 'orbits/Stra\u00dfe.json.js', 'a script with a sharp s');
  put(talk, 'orbits/\u03aa\u0301.json.js', 'a script with an iota');
  put(talk, 'orbits/\u1fbc\u0342.json.js', 'a script with an iota below');
  put(talk, 'orbits/e.json.js', 'a script without the accent');
  put(talk, 'orbits/case.json.js', 'another script of the talk folder');
  put(talk, 'orbits/js.js', 'Beeson.trajectories({});\n');
  put(talk, 'orbits/k.json.js', 'a script of the talk folder');
  put(root, 'outside.json', json('outside'));
  if (unix) symlinkSync(join(root, 'outside.json'), join(talk, 'orbits', 'out.json'));
  const running = await inProcess(t, root, talk);
  const token = await hello(t, running.port, running.key, 'Ann');
  const got = byName((await download(running.port, running.key, token)).zip);

  assert.equal(got.get('index.html').bytes.toString('utf8'), deckOf(1), 'a path ends at the first ? or #, also after an & or at a character reference, and a path from the root of the address or with a scheme is not of the talk folder');
  for (const n of wrapped) {
    const original = readFileSync(join(talk, 'orbits', `${n}.json`));
    assert.ok(got.get(`orbits/${n}.json`).bytes.equals(original), `orbits/${n}.json is kept`);
    assert.equal(got.get(`orbits/${n}.json.js`)?.bytes.toString('utf8'), `Beeson.trajectories(${original});\n`, `orbits/${n}.json.js`);
    assert.equal(got.get(`orbits/${n}.json.js`).mode, 0o644);
  }
  assert.equal(got.get('orbits/k.json.js').bytes.toString('utf8'), 'a script of the talk folder', 'a script of the talk folder is not written over');
  assert.equal(got.get('orbits/k.json-2.js')?.bytes.toString('utf8'), `Beeson.trajectories(${readFileSync(join(talk, 'orbits', 'k.json'))});\n`);
  assert.equal(got.get('orbits/case.json.js').bytes.toString('utf8'), 'another script of the talk folder', 'nor is the script of the same name on a disk that does not tell the cases apart');
  assert.equal(got.get('orbits/Case.json-2.js')?.bytes.toString('utf8'), `Beeson.trajectories(${readFileSync(join(talk, 'orbits', 'Case.json'))});\n`);
  assert.equal(got.has('orbits/Case.json.js'), false);
  assert.equal(got.get('orbits/dir.json-2.js')?.bytes.toString('utf8'), `Beeson.trajectories(${readFileSync(join(talk, 'orbits', 'dir.json'))});\n`);
  assert.equal(got.get('orbits/dir.json.js/a.txt').bytes.toString('utf8'), 'a file in a folder', 'nor is the name of a folder taken');
  assert.equal(got.has('orbits/dir.json.js'), false);
  assert.equal(got.get('orbits/Stra\u00dfe.json.js').bytes.toString('utf8'), 'a script with a sharp s', 'nor is the script that the disk of a Mac takes for STRASSE.json.js');
  assert.equal(got.get('orbits/STRASSE.json-2.js')?.bytes.toString('utf8'), `Beeson.trajectories(${readFileSync(join(talk, 'orbits', 'STRASSE.json'))});\n`);
  assert.equal(got.has('orbits/STRASSE.json.js'), false);
  assert.equal(got.get('orbits/\u03aa\u0301.json.js').bytes.toString('utf8'), 'a script with an iota', 'nor is the script named after the capital of an iota with a dialytika and a tonos, which is three characters');
  assert.equal(got.get('orbits/\u0390.json-2.js')?.bytes.toString('utf8'), `Beeson.trajectories(${readFileSync(join(talk, 'orbits', '\u0390.json'))});\n`);
  assert.equal(got.has('orbits/\u0390.json.js'), false);
  assert.equal(got.get('orbits/\u1fbc\u0342.json.js').bytes.toString('utf8'), 'a script with an iota below', 'nor is the script that the disk of a Mac takes for the same name with the two accents of the alpha in the other order');
  assert.equal(got.get('orbits/\u1fb7.json-2.js')?.bytes.toString('utf8'), `Beeson.trajectories(${readFileSync(join(talk, 'orbits', '\u1fb7.json'))});\n`);
  assert.equal(got.has('orbits/\u1fb7.json.js'), false);
  assert.equal(got.get('orbits/e.json.js').bytes.toString('utf8'), 'a script without the accent', 'nor is a script whose name differs only in its accents, since an exFAT disk of a Mac takes two such names for one next to a Hangul vowel');
  assert.equal(got.get('orbits/\u00e9.json-2.js')?.bytes.toString('utf8'), `Beeson.trajectories(${readFileSync(join(talk, 'orbits', '\u00e9.json'))});\n`);
  assert.equal(got.has('orbits/\u00e9.json.js'), false);
  for (const n of ['orbits/js.js.js', 'orbits/missing.json.js', 'outside.json.js', 'orbits/m1.json.js', 'orbits/m2.json.js', 'orbits/m3.json.js', 'orbits/out.json.js', 'orbits/out.json']) assert.equal(got.has(n), false, n);
});

test('a path of data-trajectories is read from the base element of the deck, and a deck whose base leaves the talk folder is not changed', { timeout: 60_000 }, async (t) => {
  const json = JSON.stringify({ trajectories: [] });
  const based = (href, path) => DECK.replace('<body>', `<head><base href="${href}"></head>\n<body>`).replace('</body>', `<section><div data-trajectories="${path}"></div></section>\n</body>`);
  const inside = based('orbits/', 'w.json#x.js');
  const outside = based('https://example.com/talk/', 'w.json');
  for (const [deck, text, file] of [
    [inside, inside.replace('w.json#x.js', 'w.json.js#x.js'), 'orbits/w.json.js'],
    [outside, outside, null],
  ]) {
    const { root, talk } = talkFolder(t, deck);
    put(talk, 'w.json', json);
    put(talk, 'orbits/w.json', json);
    const running = await inProcess(t, root, talk);
    const token = await hello(t, running.port, running.key, 'Ann');
    const got = byName((await download(running.port, running.key, token)).zip);
    assert.equal(got.get('index.html').bytes.toString('utf8'), text);
    assert.deepEqual([...got.keys()].filter((n) => n.endsWith('.json.js')), file ? [file] : []);
    if (file) assert.equal(got.get(file).bytes.toString('utf8'), `Beeson.trajectories(${json});\n`);
  }
});

test('a page downloads its zip in pieces, which a second request, a DELETE, or another page does not reach', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  put(talk, 'media/big.png', randomBytes(5 * MB));
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const ann = await hello(t, port, key, 'Ann');
  const bo = await hello(t, port, key, 'Bo');
  const cy = await hello(t, port, key, 'Cy');
  assert.equal((await post(port, api(key, 'bye'), { token: cy })).status, 200);
  for (const token of ['', 'n'.repeat(22), cy]) {
    const refused = await makeZip(port, key, token);
    assert.equal(refused.status, 404, token);
    assert.deepEqual(refused.json(), { error: 'say hello first' });
  }
  assert.equal((await raw(port, 'GET', `${api(key, 'zip')}?token=${ann}`)).status, 405);

  const first = await download(port, key, ann);
  assert.ok(first.size > 2 * PIECE, 'the zip is asked for in three pieces');
  assert.equal(entries(first.zip).length, 2);
  assert.ok((await raw(port, 'GET', `${api(key, `zip/${first.id}`)}?token=${ann}`)).body.equals(first.zip.subarray(0, PIECE)), 'a piece without at starts at 0');
  for (const at of [PIECE - 5, first.size - 10]) assert.ok((await pieceOf(port, key, ann, first.id, at)).body.equals(first.zip.subarray(at, at + PIECE)), `the piece at ${at}`);
  for (const at of [first.size, -1, 1.5, 'x']) assert.equal((await pieceOf(port, key, ann, first.id, at)).status, 416, `at=${at}`);
  const other = await pieceOf(port, key, bo, first.id, 0);
  assert.equal(other.status, 404);
  assert.deepEqual(other.json(), { error: 'the zip is not kept any more' });
  assert.equal((await raw(port, 'PUT', `${api(key, `zip/${first.id}`)}?token=${ann}`, { body: '' })).status, 405);

  const second = await makeZip(port, key, ann);
  assert.equal(second.status, 200);
  const { id } = second.json();
  assert.notEqual(id, first.id);
  assert.equal((await pieceOf(port, key, ann, first.id, 0)).status, 404, 'the first zip is dropped');
  assert.equal((await pieceOf(port, key, ann, id, 0)).status, 200);
  const dropped = await dropZip(port, key, ann, id);
  assert.equal(dropped.status, 200);
  assert.deepEqual(dropped.json(), {});
  assert.equal((await pieceOf(port, key, ann, id, 0)).status, 404);
});

test('a zip that is kept holds about its bytes in memory, also the zip of a folder of many small files', { timeout: 120_000 }, async (t) => {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc');
  const { root, talk } = talkFolder(t);
  const files = 3000;
  for (let i = 0; i < files; i++) put(talk, `data/${i % 30}/orbit-${i}.txt`, `${JSON.stringify({ name: `orbit ${i}`, states: Array(40).fill([1, 0, 0, 0, 1, 0]) })}\n`);
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const token = await hello(t, port, key, 'Ann');
  const held = () => {
    gc();
    gc();
    return process.memoryUsage().arrayBuffers;
  };
  const NODE_26_POOL_SIZE = 64 * 1024;
  const { poolSize } = Buffer;
  Buffer.poolSize = NODE_26_POOL_SIZE;
  t.after(() => (Buffer.poolSize = poolSize));
  const before = held();
  const made = await makeZip(port, key, token);
  assert.equal(made.status, 200, made.text);
  const { id, size } = made.json();
  const grown = held() - before;
  assert.ok(grown < 2 * size + MB, `a zip of ${(size / MB).toFixed(1)} MB holds ${(grown / MB).toFixed(1)} MB`);
  const pieces = [];
  for (let at = 0; at < size; at += PIECE) pieces.push((await pieceOf(port, key, token, id, at)).body);
  const got = byName(Buffer.concat(pieces));
  assert.equal(got.size, files + 1);
  assert.equal(got.get('data/7/orbit-2977.txt').bytes.toString('utf8'), readFileSync(join(talk, 'data', '7', 'orbit-2977.txt'), 'utf8'));
  assert.equal((await dropZip(port, key, token, id)).status, 200);
});

test('a zip of a video larger than 64 MB holds under 1 MB in memory, and its pieces are read from the disk', { timeout: 120_000 }, async (t) => {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc');
  const { root, talk } = talkFolder(t);
  const clip = put(talk, 'media/clip.mp4', '');
  truncateSync(clip, 65 * MB);
  writeFileSync(clip, 'the first bytes of the clip', { flag: 'r+' });
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const token = await hello(t, port, key, 'Ann');
  const held = () => {
    gc();
    gc();
    return process.memoryUsage().arrayBuffers;
  };
  const before = held();
  const made = await makeZip(port, key, token);
  assert.equal(made.status, 200, made.text);
  const { id, size } = made.json();
  assert.ok(size > 65 * MB, `a zip of ${size} bytes`);
  const grown = held() - before;
  assert.ok(grown < MB, `the zip holds ${(grown / MB).toFixed(2)} MB`);
  const pieces = [];
  for (let at = 0; at < size; at += PIECE) pieces.push((await pieceOf(port, key, token, id, at)).body);
  const got = byName(Buffer.concat(pieces)).get('media/clip.mp4');
  assert.equal(got.method, 0);
  assert.ok(got.bytes.equals(readFileSync(clip)));
  assert.equal((await dropZip(port, key, token, id)).status, 200);
});

test('a file that changes after its zip was made is named in the answer to a piece, and the zip is dropped', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  const clip = put(talk, 'media/clip.mp4', randomBytes(5 * MB));
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const token = await hello(t, port, key, 'Ann');
  const { id, size } = (await makeZip(port, key, token)).json();
  truncateSync(clip, 4 * MB);
  let answer;
  for (let at = 0; at < size && answer?.status !== 409; at += PIECE) answer = await pieceOf(port, key, token, id, at);
  assert.equal(answer.status, 409);
  assert.deepEqual(answer.json(), { error: 'The file media/clip.mp4 changed while the talk folder was downloaded. Try again.' });
  assert.equal((await pieceOf(port, key, token, id, 0)).status, 404);
  const again = await download(port, key, token);
  assert.equal(byName(again.zip).get('media/clip.mp4').bytes.length, 4 * MB);
});

test('a file that is written again with the same size during the download is named in the answer to a piece', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  const clip = put(talk, 'media/clip.mp4', randomBytes(5 * MB));
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const token = await hello(t, port, key, 'Ann');
  const { id, size } = (await makeZip(port, key, token)).json();
  assert.equal((await pieceOf(port, key, token, id, 0)).status, 200);
  writeFileSync(clip, randomBytes(5 * MB));
  const later = new Date(statSync(clip).mtimeMs + 10_000);
  utimesSync(clip, later, later);
  let answer;
  for (let at = PIECE; at < size && answer?.status !== 409; at += PIECE) answer = await pieceOf(port, key, token, id, at);
  assert.equal(answer.status, 409);
  assert.deepEqual(answer.json(), { error: 'The file media/clip.mp4 changed while the talk folder was downloaded. Try again.' });
});

test('a zip is dropped once its page has not asked for a piece during SLIDES_ZIP_KEPT_MS, and after a quarter of this time when no piece was asked for', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const kept = 8000;
  const edit = await startEdit(talk, { env: { SLIDES_ZIP_KEPT_MS: String(kept), XDG_CONFIG_HOME: config, APPDATA: config } });
  const token = await hello(t, edit.port, edit.key, 'Ann');
  const unasked = (await makeZip(edit.port, edit.key, token)).json();
  await new Promise((done) => setTimeout(done, kept / 2));
  assert.equal((await pieceOf(edit.port, edit.key, token, unasked.id, 0)).status, 404, 'a zip without a piece asked for is dropped');
  const made = await makeZip(edit.port, edit.key, token);
  const { id, size } = made.json();
  const asked = Date.now();
  while (Date.now() - asked < 1.5 * kept) {
    assert.equal((await pieceOf(edit.port, edit.key, token, id, 0)).status, 200, `${Date.now() - asked} ms after the first piece`);
    await new Promise((done) => setTimeout(done, kept / 10));
  }
  await until(async () => (await pieceOf(edit.port, edit.key, token, id, size)).status === 404, 'the zip to be dropped');
});

test('a folder over the limit is refused with its size, and the bytes that the zips kept hold at one time are capped', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  put(talk, 'notes.txt', text(2 * MB));
  const edit = await startEdit(talk, { env: { SLIDES_ZIP_MAX_BYTES: String(3 * MB), SLIDES_ZIP_HELD_BYTES: String(3 * MB), XDG_CONFIG_HOME: config, APPDATA: config } });
  const { port, key } = edit;
  const ann = await hello(t, port, key, 'Ann');
  const bo = await hello(t, port, key, 'Bo');
  const first = (await makeZip(port, key, ann)).json();
  const busy = await makeZip(port, key, bo);
  assert.equal(busy.status, 503);
  assert.deepEqual(busy.json(), { error: BUSY });
  assert.equal((await pieceOf(port, key, ann, first.id, 0)).status, 200, 'the zip of the first page is kept');
  assert.equal((await dropZip(port, key, ann, first.id)).status, 200);
  const later = await makeZip(port, key, bo);
  assert.equal(later.status, 200, later.text);
  assert.equal((await dropZip(port, key, bo, later.json().id)).status, 200);

  put(talk, 'media/extra.png', randomBytes(1.5 * MB));
  const bytes = 3.5 * MB + Buffer.byteLength(DECK);
  const size = (Math.ceil((bytes / MB) * 10) / 10).toFixed(1);
  assert.equal(size, '3.6');
  const over = await makeZip(port, key, ann);
  assert.equal(over.status, 413);
  assert.deepEqual(over.json(), { error: `The talk folder is ${size} MB, over the limit of 3 MB for a download.` });
});

test('a page alone downloads a talk folder whose files are at the limit, although its zip is over the cap of the zips kept', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const most = 3 * MB - Buffer.byteLength(DECK);
  put(talk, 'media/a.png', randomBytes(most));
  const edit = await startEdit(talk, { env: { SLIDES_ZIP_MAX_BYTES: String(3 * MB), XDG_CONFIG_HOME: config, APPDATA: config } });
  const { port, key } = edit;
  const ann = await hello(t, port, key, 'Ann');
  const first = await download(port, key, ann);
  assert.ok(first.size > 3 * MB, `a zip of ${first.size} bytes`);
  assert.equal(byName(first.zip).get('media/a.png').bytes.length, most);
  assert.equal((await download(port, key, ann)).size, first.size);

  put(talk, 'media/a.png', randomBytes(most + 1));
  const over = await makeZip(port, key, ann);
  assert.equal(over.status, 413);
  assert.deepEqual(over.json(), { error: 'The talk folder is 3.1 MB, over the limit of 3 MB for a download.' });
});

test('pages that ask at one time do not each build a zip: the room of a zip is taken before its files are read', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  put(talk, 'notes/a.txt', text(2 * MB));
  const { readFile } = fsp;
  let reads = 0;
  let release;
  const gate = new Promise((done) => (release = done));
  fsp.readFile = async (file, ...rest) => {
    if (String(file).endsWith('a.txt')) {
      reads++;
      await gate;
    }
    return readFile(file, ...rest);
  };
  syncBuiltinESMExports();
  t.after(() => {
    release();
    fsp.readFile = readFile;
    syncBuiltinESMExports();
  });
  const { port, key } = await inProcess(t, root, talk, small.start);
  const ann = await hello(t, port, key, 'Ann');
  const bo = await hello(t, port, key, 'Bo');
  const first = makeZip(port, key, ann);
  await until(() => reads === 1, 'the first zip to read notes/a.txt');
  const busy = await within(makeZip(port, key, bo), 10_000, 'the answer to the second page while the first zip is built');
  assert.equal(busy.status, 503);
  assert.deepEqual(busy.json(), { error: BUSY });
  assert.equal(reads, 1, 'the files are not read for the second page');
  release();
  const made = await first;
  assert.equal(made.status, 200, made.text);
  assert.equal((await makeZip(port, key, bo)).status, 503, 'the zip of the first page is kept');
  assert.equal((await dropZip(port, key, ann, made.json().id)).status, 200);
  const later = await makeZip(port, key, bo);
  assert.equal(later.status, 200, later.text);
});

test('a page whose zip is built while the edit command stops is told so, and not that the edit command is busy', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  put(talk, 'notes/a.txt', text(MB));
  const { readFile } = fsp;
  let reads = 0;
  let release;
  const gate = new Promise((done) => (release = done));
  fsp.readFile = async (file, ...rest) => {
    if (String(file).endsWith('a.txt')) {
      reads++;
      await gate;
    }
    return readFile(file, ...rest);
  };
  syncBuiltinESMExports();
  t.after(() => {
    release();
    fsp.readFile = readFile;
    syncBuiltinESMExports();
  });
  const running = await inProcess(t, root, talk);
  const token = await hello(t, running.port, running.key, 'Ann');
  const made = makeZip(running.port, running.key, token);
  await until(() => reads === 1, 'the zip to read notes/a.txt');
  const closing = running.close();
  release();
  const answer = await within(made, 10_000, 'the answer to the page');
  assert.equal(answer.status, 503);
  assert.deepEqual(answer.json(), { error: 'the edit command is stopping' });
  await closing;
});

test('a text file that grows after it was listed counts against the limit with the bytes that are read', { timeout: 60_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  put(talk, 'notes/a.txt', text(MB));
  const { readFile } = fsp;
  let grown = 0;
  fsp.readFile = async (file, ...rest) => {
    const bytes = await readFile(file, ...rest);
    return String(file).endsWith('a.txt') ? Buffer.concat([bytes, Buffer.alloc(grown)]) : bytes;
  };
  syncBuiltinESMExports();
  t.after(() => {
    fsp.readFile = readFile;
    syncBuiltinESMExports();
  });
  const { port, key } = await inProcess(t, root, talk, small.start);
  const token = await hello(t, port, key, 'Ann');
  grown = MB;
  const got = byName((await download(port, key, token)).zip);
  assert.equal(got.get('notes/a.txt').bytes.length, 2 * MB, 'a file that grew below the limit is zipped as it was read');
  grown = 2.5 * MB;
  const over = await makeZip(port, key, token);
  assert.equal(over.status, 413);
  const size = (Math.ceil(((3.5 * MB + Buffer.byteLength(DECK)) / MB) * 10) / 10).toFixed(1);
  assert.deepEqual(over.json(), { error: `The talk folder is ${size} MB, over the limit of 3 MB for a download.` });
});

test('a JSON file that is wrapped for the zip counts once against the limit', { timeout: 60_000 }, async (t) => {
  const { root, talk, config } = talkFolder(t, DECK.replace('</body>', '<section><div data-trajectories="orbits/o.json"></div></section>\n</body>'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const json = `[${'1,'.repeat(MB)}1]`;
  put(talk, 'orbits/o.json', json);
  const edit = await startEdit(talk, { env: { SLIDES_ZIP_MAX_BYTES: String(3 * MB), XDG_CONFIG_HOME: config, APPDATA: config } });
  const token = await hello(t, edit.port, edit.key, 'Ann');
  const got = byName((await download(edit.port, edit.key, token)).zip);
  assert.equal(got.get('orbits/o.json').bytes.length, json.length);
  assert.equal(got.get('orbits/o.json.js')?.bytes.toString('utf8'), `Beeson.trajectories(${json});\n`);

  put(talk, 'media/extra.png', randomBytes(1.5 * MB));
  const size = (Math.ceil(((json.length + 1.5 * MB + Buffer.byteLength(readFileSync(join(talk, 'index.html')))) / MB) * 10) / 10).toFixed(1);
  const over = await makeZip(edit.port, edit.key, token);
  assert.equal(over.status, 413);
  assert.deepEqual(over.json(), { error: `The talk folder is ${size} MB, over the limit of 3 MB for a download.` });
});

test('through the relay, a folder over 64 MB is downloaded, and a download gives the zip of a direct download', { timeout: 300_000 }, async (t) => {
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET, idleMs: 5000, pullMs: 1000 });
  t.after(() => relay.close());
  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const big = put(talk, 'big.bin', '');
  truncateSync(big, 65 * MB);
  const edit = await startEdit(talk, { args: ['--relay', relay.url], env: { SLIDES_RELAY_SECRET: SECRET, XDG_CONFIG_HOME: config, APPDATA: config } });
  const { key } = edit;
  await until(async () => (await raw(relay.port, 'GET', `/${key}/index.html`)).status === 200, 'the edit command to register with the relay');
  const guest = await hello(t, relay.port, key, 'Guest');

  const large = await download(relay.port, key, guest);
  assert.ok(large.size > 65 * MB, `a zip of ${large.size} bytes`);
  const bigEntry = byName(large.zip).get('big.bin');
  assert.equal(bigEntry.bytes.length, 65 * MB);
  assert.ok(bigEntry.bytes.every((b) => b === 0));
  assert.equal((await dropZip(relay.port, key, guest, large.id)).status, 200);

  unlinkSync(big);
  put(talk, 'media/photo.png', randomBytes(5 * MB));
  put(talk, 'notes.txt', 'notes\n'.repeat(1000));
  put(talk, 'Edit.command', '#!/bin/sh\n');
  const relayed = await download(relay.port, key, guest);
  const host = await hello(t, edit.port, key, 'Host');
  const local = await download(edit.port, key, host);
  const shape = (zip) => entries(zip).map(({ name, bytes, method, mode }) => ({ name, bytes: bytes.toString('base64'), method, mode }));
  assert.deepEqual(shape(relayed.zip), shape(local.zip));
  assert.equal((await dropZip(relay.port, key, guest, relayed.id)).status, 200);
  assert.equal((await dropZip(edit.port, key, host, local.id)).status, 200);
  await until(() => relay.held() === 0, 'the relay to hold nothing');
});

test('a folder of more files than a zip holds is refused', { skip: !unix && '65,535 files take minutes on Windows', timeout: 900_000 }, async (t) => {
  const FILES_A_ZIP_HOLDS = 65_535;
  const { root, talk } = talkFolder(t);
  for (let n = 0; n < FILES_A_ZIP_HOLDS - 1; n++) {
    if (n % 256 === 0) mkdirSync(join(talk, String(n >> 8)));
    writeFileSync(join(talk, String(n >> 8), String(n & 255)), '');
  }
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const token = await hello(t, port, key, 'Ann');
  const calls = ['lstat', 'stat', 'realpath', 'readdir', 'readFile'];
  const real = Object.fromEntries(calls.map((name) => [name, fsp[name]]));
  const asOnABusyDisk = () => new Promise((done) => setTimeout(done, 1));
  for (const name of calls) fsp[name] = async (...rest) => (await asOnABusyDisk(), real[name](...rest));
  syncBuiltinESMExports();
  t.after(() => {
    Object.assign(fsp, real);
    syncBuiltinESMExports();
  });
  const { zip } = await download(port, key, token, 240_000);
  assert.equal(entries(zip).length, FILES_A_ZIP_HOLDS);
  put(talk, 'one more.txt', '');
  const over = await makeZip(port, key, token, 240_000);
  assert.equal(over.status, 413);
  assert.deepEqual(over.json(), { error: 'The zip of the talk folder would hold more than 65,535 files, the most that a zip holds.' });
});

test('the edit command answers a page while it builds a zip', { timeout: 120_000 }, async (t) => {
  const { root, talk } = talkFolder(t);
  put(talk, 'big.txt', text(12 * MB));
  const { readFile } = fsp;
  let reading = false;
  fsp.readFile = (file, ...rest) => {
    if (String(file).endsWith('big.txt')) reading = true;
    return readFile(file, ...rest);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fsp.readFile = readFile;
    syncBuiltinESMExports();
  });
  const running = await inProcess(t, root, talk);
  const { port, key } = running;
  const token = await hello(t, port, key, 'Ann');
  const order = [];
  const zipping = makeZip(port, key, token).then((answer) => (order.push('zip'), answer));
  await until(() => reading, 'the zip to read big.txt');
  const page = await raw(port, 'GET', `/${key}/index.html`);
  order.push('index.html');
  assert.equal(page.status, 200);
  assert.equal((await zipping).status, 200);
  assert.deepEqual(order, ['index.html', 'zip']);
});
