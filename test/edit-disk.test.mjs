// the writes of index.html by the edit command, with Disk driven directly on a temporary file or
// the edit command started as a child process: the timing of the writes, a stop while a write is
// in flight, a change of the file by another program while the edit command writes or stops, a
// change written in two steps, the bases of a change of an agent that worked for a long time, a
// write that keeps failing, and a file that is a symbolic link

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Authority, Disk } from '../theme/edit.mjs';
import { DECK, until } from './helpers/session.mjs';

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
