import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diff, slideChanges, slidesOf } from '../theme/edit.mjs';

const deck = (...slides) => ['<!doctype html>', '<body>', ...slides.flatMap((lines) => ['<section>', ...lines.map((l) => `  ${l}`), '</section>']), '</body>', ''].join('\n');
const slide = (title, ...lines) => [`<h2>${title}</h2>`, ...lines];

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

test('a slide edited in place is changed and not removed when its heading is kept or one version of it is empty', async (t) => {
  const MOT = slide('Motivation', '<p>Transfers cost fuel.</p>');
  const RES = slide('Results', '<p>Lower cost by a third.</p>');
  const OUT = slide('Outlook', '<p>Next we try NRHOs.</p>');
  const Q = slide('Questions?');
  const empty = ['<h2></h2>', '<p></p>'];
  const versions = {
    'an empty slide of a layout filled': [empty, RES],
    'only the heading of an empty slide filled': [empty, slide('Results', '<p></p>')],
    'a slide emptied': [RES, empty],
    'the sentence of a short slide rewritten under its heading': [RES, slide('Results', '<p>Fuel use drops sharply.</p>')],
  };
  for (const [name, [x, y]] of Object.entries(versions)) {
    await t.test(name, () => {
      const one = deck(MOT, x, OUT, Q);
      const two = deck(MOT, y, OUT, Q);
      assert.deepEqual(changes(one, two), { slides: [2] });
      assert.deepEqual(changes(two, one), { slides: [2] });
    });
  }
});

test('a short slide removed while the next one is edited and a new one is added is reported as removed', () => {
  const before = deck(slide('One', '<p>a</p>'), slide('Results', '<p>Remove me</p>'), slide('Method', '<p>Gamma</p>'), slide('End'));
  const after = deck(slide('One', '<p>a</p>'), slide('Method', '<p>Gamma and more</p>'), slide('Outlook', '<p>New</p>'), slide('End'));
  assert.deepEqual(changes(before, after), { slides: [2, 3], removed: { slides: [2], elements: 0 } });
});

const INTRO = slide('Introduction', '<p>Why transfers matter.</p>');
const INTRO2 = slide('Introduction', '<p>Why transfers matter so much.</p>');
const MOTIVATION = slide('Motivation', '<p>Transfers cost fuel.</p>');
const RESULTS = slide('Results', '<p>Lower cost by a third.</p>');
const RESULTS2 = slide('Results', '<p>Fuel use drops sharply.</p>');
const OUTLOOK = slide('Outlook', '<p>Next we try NRHOs.</p>');
const OUTLOOK2 = slide('Outlook', '<p>Next we try NRHOs and DROs.</p>');
const METHOD = slide('Method', '<p>We use a shooting method.</p>');
const QUESTIONS = slide('Questions?');
const removedOf = (r) => r.removed?.slides ?? [];

test('a slide edited in place next to slides inserted, removed, moved, or edited in place is not removed, either way', async (t) => {
  const BACKDROP = '<div class="backdrop" data-backdrop="orbits"></div>';
  const base = deck(INTRO, MOTIVATION, RESULTS, OUTLOOK, QUESTIONS);
  const cases = {
    'two neighbors rewritten under their headings, and another slide edited': [base, deck(INTRO2, slide('Motivation', '<p>Fuel is expensive.</p>'), RESULTS2, OUTLOOK, QUESTIONS)],
    'another slide moved to the front': [base, deck(OUTLOOK, INTRO, MOTIVATION, RESULTS2, QUESTIONS)],
    'a slide of a picture first, its text rewritten, and another slide edited': [
      deck(INTRO, MOTIVATION, ['<img src="a.png">', '<p>Lower cost by a third.</p>'], OUTLOOK, QUESTIONS),
      deck(INTRO2, MOTIVATION, ['<img src="a.png">', '<p>Fuel use drops sharply.</p>'], OUTLOOK, QUESTIONS),
    ],
    'a slide of a backdrop first, its text rewritten, and another slide edited': [deck(INTRO, MOTIVATION, [BACKDROP, ...RESULTS], OUTLOOK, QUESTIONS), deck(INTRO2, MOTIVATION, [BACKDROP, ...RESULTS2], OUTLOOK, QUESTIONS)],
    'three slides moved as a block past three others, the middle one rewritten': [
      deck(INTRO, MOTIVATION, RESULTS, OUTLOOK, slide('A'), slide('B'), slide('C')),
      deck(INTRO, slide('A'), slide('B'), slide('C'), MOTIVATION, RESULTS2, OUTLOOK),
    ],
  };
  for (const [name, [before, after]] of Object.entries(cases)) {
    await t.test(name, () => {
      assert.deepEqual(removedOf(changes(before, after)), []);
      assert.deepEqual(removedOf(changes(after, before)), []);
    });
  }
  await t.test('a new slide inserted after it', () => {
    const after = deck(INTRO, MOTIVATION, RESULTS2, METHOD, OUTLOOK, QUESTIONS);
    assert.deepEqual(changes(base, after), { slides: [3, 4] });
    assert.deepEqual(changes(after, base), { slides: [3], removed: { slides: [4], elements: 0 } });
  });
  await t.test('a new slide inserted before it', () => {
    const after = deck(INTRO, MOTIVATION, METHOD, RESULTS2, OUTLOOK, QUESTIONS);
    assert.deepEqual(changes(base, after), { slides: [3, 4] });
    assert.deepEqual(changes(after, base), { slides: [3], removed: { slides: [3], elements: 0 } });
  });
  await t.test('the slide after it removed', () => {
    const after = deck(INTRO, MOTIVATION, RESULTS2, QUESTIONS);
    assert.deepEqual(changes(base, after), { slides: [3], removed: { slides: [4], elements: 0 } });
    assert.deepEqual(changes(after, base), { slides: [3, 4] });
  });
  await t.test('of three slides of one heading, one removed and one rewritten', () => {
    const r1 = slide('Results', '<p>Cost.</p>');
    const before = deck(INTRO, r1, slide('Results', '<p>Cost and time.</p>'), slide('Results', '<p>Cost, time, and risk.</p>'), QUESTIONS);
    const after = deck(INTRO2, r1, slide('Results', '<p>We also found a family of orbits.</p>'), QUESTIONS);
    assert.deepEqual(removedOf(changes(before, after)), [4]);
    assert.deepEqual(removedOf(changes(after, before)), []);
  });
});

test('a slide replaced by another without words is removed in both directions, unless the two start with the same kind of element', async (t) => {
  await t.test('a slide of text replaced by a slide of a picture, and another slide edited', () => {
    const before = deck(INTRO, MOTIVATION, RESULTS, OUTLOOK, QUESTIONS);
    const after = deck(INTRO, MOTIVATION, ['<img src="orbit.png">'], OUTLOOK2, QUESTIONS);
    assert.deepEqual(changes(before, after), { slides: [3, 4], removed: { slides: [3], elements: 0 } });
    assert.deepEqual(changes(after, before), { slides: [3, 4], removed: { slides: [3], elements: 0 } });
  });
  await t.test('an empty slide replaced by a slide of other elements without words, and another slide edited', () => {
    const before = deck(INTRO, MOTIVATION, ['<h2></h2>'], OUTLOOK2, QUESTIONS);
    const after = deck(INTRO, MOTIVATION, ['<p></p>', '<img src="x.png">'], OUTLOOK, QUESTIONS);
    assert.deepEqual(changes(before, after), { slides: [3, 4], removed: { slides: [3], elements: 0 } });
    assert.deepEqual(changes(after, before), { slides: [3, 4], removed: { slides: [3], elements: 0 } });
  });
  await t.test('a slide of a picture that gains a caption, and another slide edited', () => {
    const before = deck(INTRO, MOTIVATION, ['<img src="orbit.png">'], OUTLOOK, QUESTIONS);
    const after = deck(INTRO, MOTIVATION, ['<img src="orbit.png">', '<p>The orbit of the probe.</p>'], OUTLOOK2, QUESTIONS);
    assert.deepEqual(removedOf(changes(before, after)), []);
    assert.deepEqual(removedOf(changes(after, before)), []);
  });
  await t.test('an empty slide that is filled with other elements under its heading, and another slide edited', () => {
    const before = deck(INTRO, MOTIVATION, ['<h2></h2>', '<p></p>'], OUTLOOK, QUESTIONS);
    const after = deck(INTRO, MOTIVATION, ['<h2>Method</h2>', '<ul><li>Shoot from the halo orbit.</li></ul>', '<img src="x.png">'], OUTLOOK2, QUESTIONS);
    assert.deepEqual(removedOf(changes(before, after)), []);
    assert.deepEqual(removedOf(changes(after, before)), []);
  });
});

test('a slide whose first element is rewritten in an operation that edits another slide is removed, although its picture is kept', () => {
  const before = deck(INTRO, MOTIVATION, ['<p>Lower cost by a third.</p>', '<img src="a.png">'], OUTLOOK, QUESTIONS);
  const after = deck(INTRO2, MOTIVATION, ['<p>Fuel use drops sharply.</p>', '<img src="a.png">'], OUTLOOK, QUESTIONS);
  assert.deepEqual(removedOf(changes(before, after)), [3]);
  assert.deepEqual(removedOf(changes(after, before)), [3]);
});
