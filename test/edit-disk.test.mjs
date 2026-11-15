// the writes of index.html by the edit command, with Disk driven directly on a temporary file or
// the edit command started as a child process: the timing of the writes, a stop while a write is
// in flight, a change of the file by another program while the edit command writes or stops, a
// change written in two steps, the bases of a change of an agent that worked for a long time, a
// write that keeps failing, and a file that is a symbolic link

import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Authority, Disk } from '../theme/edit.mjs';
import { DECK, post, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// a folder with index.html holding text, an authority on the text, and a disk on the file, with
// the lines that the disk logs
function setup(t, text, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'slides disk-'));
  const file = join(dir, 'index.html');
  writeFileSync(file, text);
  const authority = new Authority(text, { epoch: 'E' });
  const lines = [];
  const disk = new Disk(file, authority, false, { log: (m) => lines.push(m), ...options });
  t.after(() => {
    disk.stopSync();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, file, authority, disk, lines };
}

// DECK padded with an HTML comment to about mb megabytes, so that a write takes long enough to be
// seen in flight
const big = (mb) => DECK.replace('</body>', `<!-- ${'x'.repeat(mb * 1024 * 1024)} -->\n</body>`);

const temporary = (dir) => readdirSync(dir).filter((n) => n.endsWith('.tmp'));

// resolves once a temporary file of the disk is in dir, i.e. while a write is in flight. the
// folder is read at every turn of the event loop, since the write lasts some milliseconds
async function inFlight(dir, timeout = 20_000) {
  const started = performance.now();
  while (temporary(dir).length === 0) {
    if (performance.now() - started > timeout) throw new Error('timed out waiting for a write in flight');
    await new Promise((done) => setImmediate(done));
  }
}

// an insertion into the text of the authority before the first occurrence of what
function insert(authority, what, text, author = 'Ann') {
  const at = authority.text.indexOf(what);
  assert.ok(at >= 0, `${what} is not in the text`);
  return authority.enter([{ start: at, end: at, text }], author);
}

test('a backward jump of the wall clock does not hold back the writes while typing goes on', { timeout: 60_000 }, async (t) => {
  const { file, authority } = setup(t, DECK);
  insert(authority, '</body>', '<i>0</i>');
  const now = Date.now;
  t.after(() => (Date.now = now));
  Date.now = () => now() - 3_600_000;
  const started = performance.now();
  let writtenAt = null;
  for (let i = 1; writtenAt === null && performance.now() - started < 3000; i++) {
    insert(authority, '</body>', `<i>${i}</i>`);
    if (readFileSync(file, 'utf8').includes('<i>0</i>')) writtenAt = performance.now() - started;
    await sleep(100);
  }
  Date.now = now;
  assert.ok(writtenAt !== null && writtenAt < 2500, `the file was written ${writtenAt} ms after the first operation`);
});

test('a stop while a write is in flight writes the newest text, and the older write does not land after it', { timeout: 60_000 }, async (t) => {
  const { dir, file, authority, disk } = setup(t, big(20));
  insert(authority, '<h2>One', 'ONE ');
  await inFlight(dir);
  insert(authority, '<h2>Two', 'TWO ');
  disk.stopSync();
  await disk.idle();
  const after = readFileSync(file, 'utf8');
  assert.ok(after.includes('ONE <h2>One'), 'the file lacks the operation written first');
  assert.ok(after.includes('TWO <h2>Two'), 'the file lacks the operation entered just before the stop');
  assert.deepEqual(temporary(dir), []);
});

test('a stop right after another program wrote the file keeps the change of this program and the last operation', { timeout: 60_000 }, async (t) => {
  const { file, authority, disk } = setup(t, DECK);
  insert(authority, '<h2>One', 'ONE ');
  writeFileSync(file, DECK.replace('<h2>Two', 'AGENT <h2>Two'));
  disk.stopSync();
  const after = readFileSync(file, 'utf8');
  assert.ok(after.includes('ONE <h2>One'), 'the file lacks the operation entered before the stop');
  assert.ok(after.includes('AGENT <h2>Two'), 'the file lacks the change of the other program');
  assert.equal(authority.text, after);
});

test('a change of the file by another program while the edit command writes it is merged, and not overwritten', { timeout: 60_000 }, async (t) => {
  const deck = big(20);
  const { dir, file, authority } = setup(t, deck);
  insert(authority, '<h2>One', 'ONE ');
  await inFlight(dir);
  writeFileSync(file, deck.replace('<h2>Two', 'AGENT <h2>Two'));
  await until(() => {
    const now = readFileSync(file, 'utf8');
    return now === authority.text && now.includes('AGENT <h2>Two') && now.includes('ONE <h2>One');
  }, 'the file and the authority to hold the operation and the change of the other program', 15_000);
});

test('a file written in two steps is taken once it is complete, and an empty file is not taken before 5 s', { timeout: 60_000 }, async (t) => {
  const { file, authority, disk, lines } = setup(t, DECK);
  disk.start();
  const edited = DECK.replace('<h2>One', 'EDITED <h2>One');
  writeFileSync(file, edited.slice(0, Math.floor(edited.length * 0.3)));
  await until(() => authority.text !== DECK || lines.some((l) => l.includes('partly written')), 'the disk to see the first step');
  writeFileSync(file, edited);
  await until(() => authority.text.includes('EDITED') && readFileSync(file, 'utf8') === authority.text, 'the second step to be merged');
  assert.equal(authority.text, edited);

  const emptied = performance.now();
  writeFileSync(file, '');
  await until(() => authority.text === '', 'the empty file to be taken', 15_000);
  const after = performance.now() - emptied;
  assert.ok(after >= 5000, `the empty file was taken ${Math.round(after)} ms after it was written`);
});

test('an agent that writes back after more than 100 writes of people keeps every edit of the people', { timeout: 120_000 }, async (t) => {
  const deck = readFileSync('test-deck.html', 'utf8');
  assert.ok(deck.includes('<body>\n') && deck.includes('</body>'), 'the test deck lacks a body');
  const { file, authority, disk } = setup(t, deck, { quiet: 5, latest: 20, poll: 20 });
  disk.start();
  const read = authority.text;
  const tokens = [];
  for (let k = 0; k < 120; k++) {
    const headings = [...authority.text.matchAll(/<h2/g)].map((m) => m.index);
    assert.ok(headings.length >= 5, 'the test deck has fewer than five headings');
    const at = headings[k % headings.length];
    tokens.push(`P${k}Q `);
    authority.enter([{ start: at, end: at, text: tokens[k] }], 'Ann');
    await until(() => readFileSync(file, 'utf8').includes(tokens[k]), `the write of ${tokens[k]}`);
  }
  writeFileSync(file, read.replace('<body>\n', '<body>\n<p>AGENT FIRST</p>\n').replace('</body>', '<p>AGENT LAST</p>\n</body>'));
  await until(() => {
    const now = readFileSync(file, 'utf8');
    return now === authority.text && now.includes('AGENT FIRST') && now.includes('AGENT LAST');
  }, 'the change of the agent to be merged');
  const after = readFileSync(file, 'utf8');
  assert.deepEqual(tokens.filter((token) => !after.includes(token)), []);
});

test('an outside write back to an earlier text keeps the newer edits of the session, and says so in a line of the log', { timeout: 60_000 }, async (t) => {
  const { file, authority, disk, lines } = setup(t, DECK, { quiet: 5, latest: 20, poll: 20 });
  disk.start();
  writeFileSync(file, DECK.replace('</body>', '<p>typo</p>\n</body>'));
  await until(() => authority.text.includes('<p>typo</p>'), 'the typo to be merged');
  writeFileSync(file, DECK);
  await until(() => lines.some((l) => l.includes('earlier text')), 'a line of the log on the earlier text');
  await until(() => readFileSync(file, 'utf8') === authority.text, 'the session text to be written back');
  assert.ok(authority.text.includes('<p>typo</p>'), 'the session lost its newer edit');
});

// a folder made read-only by chmod refuses a new file neither on Windows nor to root
const noReadOnlyFolder = process.platform === 'win32' || process.getuid?.() === 0 ? 'a read-only folder does not refuse a write on Windows or to root' : false;

test('a write that keeps failing is reported with the number of unwritten operations, and the stop of the command exits nonzero', { timeout: 120_000, skip: noReadOnlyFolder }, async (t) => {
  const reports = [];
  const { dir, file, authority, disk } = setup(t, DECK, { quiet: 5, latest: 20, onWriteError: (e) => reports.push(e) });
  try {
    chmodSync(dir, 0o555);
    insert(authority, '<h2>One', 'ONE ');
    await until(() => reports.length > 0, 'a report of the failed write');
    assert.equal(reports[0].unwritten, 1);
    assert.ok(reports[0].message.length > 0);
    chmodSync(dir, 0o755);
    await until(() => reports.at(-1) === null && readFileSync(file, 'utf8').includes('ONE '), 'a report that the write succeeded again');
    chmodSync(dir, 0o555);
    insert(authority, '<h2>Two', 'TWO ');
    assert.equal(disk.stopSync(), 1);
  } finally {
    chmodSync(dir, 0o755);
  }

  const { root, talk, config } = talkFolder(t);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const edit = await startEdit(talk, { env: { XDG_CONFIG_HOME: config, APPDATA: config } });
  const api = (route) => `${edit.base}.session/${route}`;
  try {
    const hello = (await post(edit.port, api('hello'), { name: 'Ann' })).json();
    chmodSync(talk, 0o555);
    const at = DECK.indexOf('One');
    const answer = (await post(edit.port, api('op'), { token: hello.token, seq: 1, base: hello.v, patches: [{ start: at, end: at, text: 'X' }] })).json();
    assert.equal(answer.ok, true);
    await until(() => edit.stderr.includes('could not write'), 'the failed write in the log of the command');
    await stopEdit(edit);
    assert.equal(await edit.exited, 1);
  } finally {
    chmodSync(talk, 0o755);
    await stopEdit(edit);
  }
});

test('a symbolic link index.html is written through to its target, the mode of the file is kept, and a temporary file of an earlier run is removed', { timeout: 60_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'slides disk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // a symbolic link needs a privilege on Windows, and a file there has no mode bits but read-only
  const posix = process.platform !== 'win32';
  const file = join(dir, 'index.html'), target = join(dir, 'real.html');
  // a temporary file is named after the file that it replaces, i.e. the target of the link
  const stale = join(dir, `.${posix ? 'real' : 'index'}.html.0123456789ab.tmp`), other = join(dir, 'notes.tmp');
  writeFileSync(stale, 'half a deck');
  writeFileSync(other, 'notes');
  writeFileSync(posix ? target : file, DECK);
  if (posix) {
    chmodSync(target, 0o444);
    symlinkSync('real.html', file);
  }
  const authority = new Authority(DECK, { epoch: 'E' });
  const disk = new Disk(file, authority, false, { quiet: 5, latest: 20 });
  t.after(() => disk.stopSync());
  assert.equal(existsSync(stale), false, 'the temporary file of an earlier run is still there');
  assert.equal(existsSync(other), true, 'a file that the disk did not write was removed');
  if (!posix) return;
  insert(authority, '<h2>One', 'ONE ');
  await until(() => readFileSync(target, 'utf8').includes('ONE '), 'the edit in the target of the link', 5000);
  assert.ok(lstatSync(file).isSymbolicLink(), 'index.html is no longer a symbolic link');
  assert.equal(statSync(target).mode & 0o777, 0o444);
});
