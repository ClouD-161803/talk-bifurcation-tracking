// the writes of index.html by the edit command, with Disk driven directly on a temporary file or
// the edit command started as a child process: the timing of the writes, a stop while a write is
// in flight, a change of the file by another program while the edit command writes or stops, a
// change written in two steps, the bases of a change of an agent that worked for a long time, a
// write that keeps failing, and a file that is a symbolic link

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Authority, Disk } from '../theme/edit.mjs';
import { DECK } from './helpers/session.mjs';

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
