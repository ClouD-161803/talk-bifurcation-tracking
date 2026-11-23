import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function check(t, page) {
  const out = mkdtempSync(join(tmpdir(), 'beeson-check-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  return new Promise((done) => {
    const child = spawn(process.execPath, ['scripts/check.mjs', '--deck', `test/pages/${page}`, '--out', out]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('close', (status) => done({ status, stdout, stderr }));
  });
}

const failed = (run, where) => run.stderr.split('\n').filter((line) => line.trim().startsWith(where));
const allowed = (run, where) => run.stdout.split('\n').filter((line) => line.startsWith(`allowed with data-allow: ${where}`));

test('the check fails on speaker notes of more than 40 words, unless the slide allows notes', { timeout: 300000 }, async (t) => {
  const run = await check(t, 'check-notes.html');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(failed(run, 'slide 1 (#/0/0)').join('\n'), /the speaker notes have 41 words, over 40: keep only what the speaker needs and the slide does not show/);
  assert.deepEqual(failed(run, 'slide 2 (#/1/0)'), []);
  assert.deepEqual(failed(run, 'slide 3 (#/2/0)'), []);
  assert.match(allowed(run, 'slide 3 (#/2/0)').join('\n'), /the speaker notes have 60 words/);
  assert.match(run.stdout, /^slide 3 \(#\/2\/0\) allows notes with data-allow$/m);
  assert.match(failed(run, 'slide 4 (#/3/0)').join('\n'), /data-allow names jump, which the check does not know: write notes, heading, copy, move, outside/);
});

test('the check fails on a heading away from its place on most slides of the layout, unless the slide allows heading', { timeout: 300000 }, async (t) => {
  const run = await check(t, 'check-headings.html');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  for (const theme of ['dark', 'light']) {
    assert.match(failed(run, `${theme}-05.png (#/4/0)`).join('\n'), /the heading is 30 px lower than on most slides of the layout content, whose heading is 120 px from the left and 120 px from the top/);
    assert.match(failed(run, `${theme}-06.png (#/5/0)`).join('\n'), /the heading is 6 px more to the right than on most slides of the layout content/);
    for (const n of ['01', '02', '03', '04', '07', '08', '09']) assert.deepEqual(failed(run, `${theme}-${n}.png`), [], `${theme}-${n}.png`);
    assert.match(allowed(run, `${theme}-08.png (#/7/0)`).join('\n'), /the heading is 30 px lower/);
  }
});

test('the check fails on a sentence or a formula copied in place at a step, unless the slide allows copy', { timeout: 300000 }, async (t) => {
  const run = await check(t, 'check-copies.html');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const copied = failed(run, 'slide 1 (#/0/0)');
  assert.equal(copied.length, 2, copied.join('\n'));
  assert.match(copied[0], /at step 2, a copy of "One sentence written twice\." is shown as this one is hidden: write it once, keep it shown, and change only what changes/);
  assert.match(copied[1], /at step 2, a copy of "x = y" is shown as this one is hidden/);
  assert.deepEqual(failed(run, 'slide 2 (#/1/0)'), []);
  assert.deepEqual(failed(run, 'slide 3 (#/2/0)'), []);
  assert.match(allowed(run, 'slide 3 (#/2/0)').join('\n'), /at step 2, a copy of "A sentence written twice\."/);
});

test('the check fails on an element moved at a step without a move in its markup, unless the slide allows move', { timeout: 300000 }, async (t) => {
  const run = await check(t, 'check-moves.html');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const moved = failed(run, 'slide 1 (#/0/0)');
  assert.equal(moved.length, 1, moved.join('\n'));
  assert.match(moved[0], /at step 1, "A line pushed down\." is placed \d+ px lower than at the step before: keep it at one place at every step/);
  assert.deepEqual(failed(run, 'slide 2 (#/1/0)'), []);
  assert.deepEqual(failed(run, 'slide 3 (#/2/0)'), []);
  assert.match(allowed(run, 'slide 3 (#/2/0)').join('\n'), /at step 1, "A line pushed down on purpose\." is placed \d+ px lower/);
});

test('the check fails on text off the slide at the last step of its slide, unless the slide allows outside', { timeout: 300000 }, async (t) => {
  const run = await check(t, 'check-outside.html');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const outside = failed(run, 'slide 1 (#/0/0)');
  assert.equal(outside.length, 1, outside.join('\n'));
  assert.match(outside[0], /at the last step, "A line below the slide\." runs \d+ px off the slide: shorten it, or move it into the 1920 by 1080 px of the slide/);
  assert.deepEqual(failed(run, 'slide 2 (#/1/0)'), []);
  assert.deepEqual(failed(run, 'slide 3 (#/2/0)'), []);
  assert.match(allowed(run, 'slide 3 (#/2/0)').join('\n'), /at the last step, "A line below the slide on purpose\." runs \d+ px off the slide/);
});
