// the slides of a deck and the slides that differ between two texts, as the version history reads
// them: a moved slide is not a removed one, and a slide removed while another is added is reported
// as removed, however short the slides

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diff, slideChanges, slidesOf } from '../theme/edit.mjs';

// a deck of slides, each given as its lines
const deck = (...slides) => ['<!doctype html>', '<body>', ...slides.flatMap((lines) => ['<section>', ...lines.map((l) => `  ${l}`), '</section>']), '</body>', ''].join('\n');
const slide = (title, ...lines) => [`<h2>${title}</h2>`, ...lines];

// the ranges of after that the operation from before changed, as the marks of a version
function marksOf(before, after) {
  let delta = 0;
  return diff(before, after).map((p) => {
    const start = p.start + delta;
    delta += p.text.length - (p.end - p.start);
    return { start, end: start + p.text.length };
  });
}
const changes = (before, after) => slideChanges(before, slidesOf(before), after, slidesOf(after), marksOf(before, after));

const ALPHA = slide('Alpha', '<p>The transfer leaves the halo orbit along its unstable manifold.</p>');
const BETA = slide('Beta', '<p>Two impulses place the spacecraft on the stable manifold of the target.</p>');
const GAMMA = slide('Gamma', '<p>The cost is compared with a direct transfer of the same duration.</p>');
const DELTA = slide('Delta', '<p>A longer flight buys a lower cost, up to the period of the orbit.</p>');

test('a moved slide is changed at its new place and not removed', async (t) => {
  await t.test('the first slide moved to the end', () => {
    const r = changes(deck(ALPHA, BETA, GAMMA, DELTA), deck(BETA, GAMMA, DELTA, ALPHA));
    assert.equal(r.removed, undefined);
    assert.ok(r.slides.includes(4), JSON.stringify(r));
  });

  await t.test('two slides swapped', () => {
    const r = changes(deck(ALPHA, BETA, GAMMA, DELTA), deck(ALPHA, GAMMA, BETA, DELTA));
    assert.equal(r.removed, undefined);
    assert.ok(r.slides.length > 0 && r.slides.every((n) => n === 2 || n === 3), JSON.stringify(r));
  });

  await t.test('a large first slide moved to the end', () => {
    const big = slide('Big', ...Array.from({ length: 9 }, (_, i) => `<p>Paragraph ${i} of the large slide.</p>`));
    const r = changes(deck(big, BETA, GAMMA), deck(BETA, GAMMA, big));
    assert.equal(r.removed, undefined);
    assert.ok(r.slides.includes(3), JSON.stringify(r));
  });
});

test('a slide removed while another is added is reported as removed, and a slide edited in place is not', () => {
  const summary = slide('Summary', '<p>Manifolds lower the cost of the transfer by a third, at a longer flight.</p>');
  const before = deck(ALPHA, BETA, GAMMA);
  assert.deepEqual(changes(before, deck(ALPHA, summary, GAMMA)), { slides: [2], removed: { slides: [2], elements: 0 } });
  assert.deepEqual(changes(before, deck(ALPHA, GAMMA, summary)), { slides: [3], removed: { slides: [2], elements: 0 } });
  const edited = slide('Beta', '<p>Two impulses place the spacecraft on the stable manifold of the halo orbit.</p>');
  assert.deepEqual(changes(before, deck(ALPHA, edited, GAMMA)), { slides: [2] });
});

test('a short slide removed while the next one is edited and a new one is added is reported as removed', () => {
  const before = deck(slide('One', '<p>a</p>'), slide('Results', '<p>Remove me</p>'), slide('Method', '<p>Gamma</p>'), slide('End'));
  const after = deck(slide('One', '<p>a</p>'), slide('Method', '<p>Gamma and more</p>'), slide('Outlook', '<p>New</p>'), slide('End'));
  assert.deepEqual(changes(before, after), { slides: [2, 3], removed: { slides: [2], elements: 0 } });
});
