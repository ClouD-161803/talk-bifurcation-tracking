import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function check(deck) {
  const out = mkdtempSync(join(tmpdir(), 'beeson-tex-check-'));
  try {
    return spawnSync(process.execPath, ['scripts/check.mjs', '--deck', deck, '--themes', 'dark', '--out', out], { encoding: 'utf8' });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

test('the check names a macro that is not defined, a key that is not in the bibliography, a kind that is not defined, and a tex.js that is not written again', { timeout: 120000 }, () => {
  const run = check('test/pages/tex-check/stale.html');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /dark-01\.png \(#\/0\/0\): macro not defined: \\foo\n/);
  assert.match(run.stderr, /dark-01\.png \(#\/0\/0\): citation of a key that is not in the bibliography: lost1999\n/);
  assert.match(run.stderr, /dark-01\.png \(#\/0\/0\): theorem of a kind that is not defined: conjecture\n/);
  assert.match(run.stderr, /tex\.js is not the one written from preamble\.tex and references\.bib: run npm run tex\n/);
  assert.doesNotMatch(run.stdout + run.stderr, /\\vb|tikz/);
});

test('the check passes on a deck whose preamble has a line that is not read', { timeout: 120000 }, () => {
  const run = check('test/pages/tex-check/fresh.html');
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /no page errors/);
});

test('the check waits for the font of a TeX package that is ready seconds after its formula, and names its error', { timeout: 120000 }, () => {
  const run = check('test/pages/tex-check/late-font.html');
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /behaviors: .*the font of mhchem is ready 3 s after its formula/);
});
