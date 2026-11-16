// the slides of two texts paired as one slide, as the version history and the threads of comments
// pair them: a slide whose start and end are edited in one version while its middle is kept is
// changed and not removed, and a slide replaced by another of other text is removed

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { moveAnchors, startTagAt } from '../src/session/anchor.ts';
import { diff } from '../src/session/patch.ts';
import { pairs, slideChanges, slidesOf } from '../src/session/slides.ts';

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
// the pairs of the slides of two texts, as [i, j]
const texts = (text) => slidesOf(text).map((s) => text.slice(s.start, s.end));
const paired = (before, after) => pairs(texts(before), texts(after), true).map((p) => [p.i, p.j]);

const INTRO = slide('Introduction', '<p>Transfers between libration point orbits cost little fuel.</p>');
const P1 = '<p>We shoot from the halo orbit along its unstable manifold toward the target.</p>';
const P2 = '<p>Each arc is corrected by a differential corrector until it meets the stable manifold.</p>';
const P3 = '<p>The cost of a transfer is the sum of the two impulses at its ends.</p>';
const NOTES = '<aside class="notes">Say that the corrector converges in a few steps.</aside>';
const METHOD = slide('Method', P1, P2, P3, NOTES);
const RESULTS = slide('Results', '<p>The transfer costs a third less than a direct one of the same duration.</p>');
const QUESTIONS = slide('Questions?');
const LONG = '<p>Where the manifolds do not meet, a short arc of the restricted problem joins them, found by a continuation in the energy from a transfer that is known, and the whole path is then corrected in the ephemeris model of the Sun, the Earth, and the Moon.</p>';
const LIST = ['<ul>', '<li>Find the halo orbit of the given energy.</li>', '<li>Grow its unstable manifold up to the section.</li>', '<li>Grow the stable manifold of the target orbit.</li>', '<li>Join the two manifolds with a short arc.</li>', '<li>Correct the whole path in the full model.</li>', '</ul>'];

// a slide whose start and end are edited in one version, while its middle is kept
const EDITS = {
  'the heading and the notes': [METHOD, slide('Our approach', P1, P2, P3, '<aside class="notes">Pause before the figure.</aside>')],
  'the heading and the last paragraph': [METHOD, slide('Our approach', P1, P2, '<p>A transfer costs less than a direct one.</p>', NOTES)],
  'the first and the last item of a list': [LIST, ['<ul>', '<li>Pick a halo orbit.</li>', ...LIST.slice(2, 5), '<li>Refine it.</li>', '</ul>']],
  'the heading, with a paragraph added in the middle': [METHOD, slide('Our approach', P1, P2, '<p>The corrector is a Newton method on the free times.</p>', P3, NOTES)],
  'the heading, with a long paragraph added after the last one': [METHOD, slide('Our approach', P1, P2, P3, LONG, NOTES)],
};

test('a slide whose start and end are edited in one version is changed and not removed', async (t) => {
  for (const [name, [x, y]] of Object.entries(EDITS)) {
    await t.test(name, () => {
      const one = deck(INTRO, x, RESULTS, QUESTIONS);
      const two = deck(INTRO, y, RESULTS, QUESTIONS);
      assert.deepEqual(paired(one, two), [[0, 0], [1, 1], [2, 2], [3, 3]]);
      assert.deepEqual(changes(one, two), { slides: [2] });
      // the other way, an added paragraph is an element removed from a slide that stays
      assert.deepEqual(changes(two, one).slides, [2]);
      assert.deepEqual(changes(two, one).removed?.slides ?? [], []);
    });
  }
});

test('a short slide whose start and end are edited in one version is changed and not removed', async (t) => {
  await t.test('its heading, paragraph, and notes each gain a word', () => {
    // slides as the versions of the bar of the preview of a version write them
    const noted = (k, heading = '', text = '', note = '') => [`<h2>Slide ${k}${heading}</h2>`, `<p>Text ${k}${text}</p>`, `<aside class="notes">Note ${k}${note}</aside>`];
    const one = deck(noted(1), noted(2, ' v4 v3 v2 v1 v0', ' v4', ' v3 v1'), noted(3), noted(4));
    const two = deck(noted(1), noted(2, ' v5 v4 v3 v2 v1 v0', ' v5 v4', ' v5 v3 v1'), noted(3), noted(4));
    assert.deepEqual(paired(one, two), [[0, 0], [1, 1], [2, 2], [3, 3]]);
    assert.deepEqual(changes(one, two), { slides: [2] });
  });
  await t.test('its heading and notes, with a long paragraph added before its paragraph', () => {
    // the stretch of the short slide is found after the reads of the long paragraph
    const one = deck(INTRO, slide('Results', '<p>The transfer costs a third less.</p>', '<aside class="notes">Slow down here.</aside>'));
    const two = deck(INTRO, slide('Findings', LONG, '<p>The transfer costs a third less.</p>', '<aside class="notes">Slow down.</aside>'));
    assert.deepEqual(paired(one, two), [[0, 0], [1, 1]]);
    assert.deepEqual(changes(one, two), { slides: [2] });
  });
  await t.test('its heading taken off and notes added, where its kept text starts with a word of one letter', () => {
    // the middle of the slide is the word A, which starts the text of the slide after the edit
    const kept = '<p>A third less fuel is spent on the halo orbit.</p>';
    const one = deck(INTRO, slide('The cost of the transfer between two orbits', kept));
    const two = deck(INTRO, [kept, '<aside class="notes">Point at the figure, and then wait for questions from the room.</aside>']);
    assert.deepEqual(paired(one, two), [[0, 0], [1, 1]]);
    // the heading is removed, and the slide is not
    assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [], elements: 1 } });
  });
});

test('a slide whose start and end are edited is removed when it keeps less than half of its text in whole words', async (t) => {
  // each slide keeps half of its text when the word that grew is counted as kept
  await t.test('a word that grew at the end of the kept text', () => {
    const one = deck(INTRO, slide('Results', '<p>A third less fuel on the halo orbit</p>', '<aside class="notes">Wait for questions.</aside>'));
    const two = deck(INTRO, slide('Method', '<p>A third less fuel on the halo orbits</p>', '<aside class="notes">Point at the figure.</aside>'));
    assert.deepEqual(paired(one, two), [[0, 0]]);
    assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [2], elements: 0 } });
  });
  await t.test('a word that grew at the start of the kept text', () => {
    const one = deck(INTRO, slide('Our results', '<p>We start the corrector from the halo orbit.</p>', '<aside class="notes">Look at the room.</aside>'));
    const two = deck(INTRO, slide('Results', '<p>We restart the corrector from the halo orbit.</p>', '<aside class="notes">Point at the figure.</aside>'));
    assert.deepEqual(paired(one, two), [[0, 0]]);
    assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [2], elements: 0 } });
  });
});

test('a slide whose start and end are edited in a version that removes a neighbor is changed, and the neighbor alone is removed', async (t) => {
  for (const [name, [x, y]] of Object.entries(EDITS)) {
    await t.test(`${name}, the next slide removed`, () => {
      const one = deck(INTRO, x, RESULTS, QUESTIONS);
      const two = deck(INTRO, y, QUESTIONS);
      assert.deepEqual(paired(one, two), [[0, 0], [1, 1], [3, 2]]);
      assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [3], elements: 0 } });
    });
    await t.test(`${name}, the slide before removed`, () => {
      const one = deck(INTRO, RESULTS, x, QUESTIONS);
      const two = deck(INTRO, y, QUESTIONS);
      assert.deepEqual(paired(one, two), [[0, 0], [2, 1], [3, 2]]);
      assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [2], elements: 0 } });
    });
  }
});

test('a slide replaced by another is removed, and slides moved or edited in place are not', async (t) => {
  const BETA = slide('Beta', '<p>Two impulses place the spacecraft on the stable manifold of the target.</p>');
  await t.test('a slide removed while a slide of other text is added at its place', () => {
    const summary = slide('Summary', '<p>Manifolds lower the cost of the transfer by a third, at a longer flight.</p>');
    const one = deck(INTRO, BETA, RESULTS);
    const two = deck(INTRO, summary, RESULTS);
    assert.deepEqual(paired(one, two), [[0, 0], [2, 2]]);
    assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [2], elements: 0 } });
  });
  await t.test('a slide replaced by one that shares less than half of the shorter text', () => {
    const other = slide('Gamma', '<p>The spacecraft leaves the halo orbit on a fast arc toward the Moon.</p>');
    const one = deck(INTRO, BETA, RESULTS);
    const two = deck(INTRO, other, RESULTS);
    assert.deepEqual(paired(one, two), [[0, 0], [2, 2]]);
    assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [2], elements: 0 } });
    assert.deepEqual(changes(two, one), { slides: [2], removed: { slides: [2], elements: 0 } });
  });
  await t.test('two slides of one picture each, both replaced', () => {
    const one = deck(INTRO, ['<img src="halo.png">'], ['<img src="manifold.png">'], QUESTIONS);
    const two = deck(INTRO, ['<img src="orbit.png">'], ['<img src="arc.png">'], QUESTIONS);
    assert.deepEqual(paired(one, two), [[0, 0], [1, 1], [2, 2], [3, 3]]);
    assert.deepEqual(changes(one, two), { slides: [2, 3] });
  });
  await t.test('a short slide replaced by one that shares one word with it', () => {
    const one = deck(INTRO, slide('Summary', '<p>arc continuation</p>'), RESULTS);
    const two = deck(INTRO, slide('Dynamics', '<p>The continuation of the family meets a fold.</p>'), RESULTS);
    assert.deepEqual(paired(one, two), [[0, 0], [2, 2]]);
    assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [2], elements: 0 } });
    assert.deepEqual(changes(two, one), { slides: [2], removed: { slides: [2], elements: 0 } });
  });
  await t.test('a slide of a short heading replaced by one that holds the two short words of its middle', () => {
    const one = deck(INTRO, slide('End of the talk'), QUESTIONS);
    const two = deck(INTRO, slide('Results', '<p>The transfer costs a third less than a direct one of the same duration.</p>'), QUESTIONS);
    assert.deepEqual(paired(one, two), [[0, 0], [2, 2]]);
    assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [2], elements: 0 } });
  });
  await t.test('a slide of a short heading and a picture replaced by one that shares two short words with it', () => {
    const one = deck(INTRO, slide('Shape of the orbit', '<img src="media/shape.png">'), QUESTIONS);
    const two = deck(INTRO, slide('Goal of the talk', '<img src="media/goal.png">'), QUESTIONS);
    assert.deepEqual(paired(one, two), [[0, 0], [2, 2]]);
    assert.deepEqual(changes(one, two), { slides: [2], removed: { slides: [2], elements: 0 } });
  });
  await t.test('a slide moved past others', () => {
    const one = deck(INTRO, METHOD, RESULTS, BETA, QUESTIONS);
    const two = deck(METHOD, RESULTS, BETA, INTRO, QUESTIONS);
    assert.equal(changes(one, two).removed, undefined);
    assert.equal(changes(two, one).removed, undefined);
  });
  await t.test('an empty heading that is filled', () => {
    const one = deck(INTRO, ['<h2></h2>', '<p></p>'], RESULTS, QUESTIONS);
    const two = deck(INTRO, slide('Results', '<p>Lower cost by a third.</p>'), RESULTS, QUESTIONS);
    assert.deepEqual(changes(one, two), { slides: [2] });
    assert.deepEqual(changes(two, one), { slides: [2] });
  });
});

// a comment on the first element whose start tag begins with open, with the start tag of its slide
function onElement(text, open) {
  const at = text.indexOf(open);
  assert.ok(at >= 0, `${open} is in the text`);
  const s = slidesOf(text).find((x) => x.start <= at && at < x.end);
  return { anchor: startTagAt(text, at), slide: { start: s.start, end: s.open, tag: 'section' } };
}

test('a slide whose start and end are edited in an operation that edits another slide keeps its threads', async (t) => {
  for (const [name, [x, y]] of Object.entries(EDITS)) {
    await t.test(name, () => {
      const results = slide('Results', '<p>The transfer costs a fourth less than a direct one of the same duration.</p>');
      const before = deck(INTRO, x, RESULTS, QUESTIONS);
      const after = deck(INTRO, y, results, QUESTIONS);
      // an element in the middle of the slide, which every edit keeps
      const kept = x === LIST ? LIST[3] : P2;
      const it = onElement(before, kept);
      const [moved] = moveAnchors(before, diff(before, after), after, [it]).items;
      assert.equal(moved.removed, undefined, JSON.stringify(moved));
      assert.ok(after.slice(moved.anchor.start).startsWith(kept), JSON.stringify(moved));
      assert.equal(moved.slide.start, slidesOf(after)[1].start);
    });
  }
});

// a slide of a picture, with a credit that every such slide repeats between its heading and notes
const picture = (name, note) => [`<h2>${name}</h2>`, `<img src="media/${name.toLowerCase()}.jpg">`, '<p class="caption">Image credit: NASA/JPL-Caltech/SETI Institute</p>', `<aside class="notes">${note}</aside>`];
const OCEAN = slide('Ocean worlds', '<p>Three moons hold water under their ice.</p>');
const EUROPA = picture('Europa', 'Mention the ice shell.');
const TITAN = picture('Titan', 'Lakes of methane.');
const ENCELADUS = picture('Enceladus', 'Plumes at the south pole.');

// the headings of the slides on which the threads of the slide of name and of its heading are
// after the operation from before to after, null for a thread taken off its slide
function threadsOf(before, after, name) {
  const s = slidesOf(before).find((x) => before.slice(x.start, x.end).includes(`<h2>${name}`));
  const tag = { start: s.start, end: s.open, tag: 'section' };
  const items = [{ anchor: tag, slide: tag }, { anchor: startTagAt(before, before.indexOf(`<h2>${name}`)), slide: tag }];
  return moveAnchors(before, diff(before, after), after, items).items.map((it) => it.slide && /<h2>([^<]*)/.exec(after.slice(it.slide.start))[1]);
}

test('the threads of a slide are not handed to another slide that repeats the text of its middle', async (t) => {
  await t.test('a slide deleted and another added at its place, in an operation that edits another slide', () => {
    const before = deck(OCEAN, EUROPA, TITAN, QUESTIONS);
    const after = deck(slide('Ocean worlds', '<p>Four moons hold water under their ice.</p>'), ENCELADUS, TITAN, QUESTIONS);
    assert.deepEqual(threadsOf(before, after, 'Europa'), [null, null]);
  });
  await t.test('a slide deleted and another added at the end of the deck, as a Restore of the version before does it', () => {
    const before = deck(OCEAN, TITAN, QUESTIONS, ENCELADUS);
    const after = deck(OCEAN, EUROPA, TITAN, QUESTIONS);
    assert.deepEqual(threadsOf(before, after, 'Enceladus'), [null, null]);
  });
});

// the fastest of five runs of f, in ms
function fastest(f) {
  let best = Infinity;
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    f();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

test('slides replaced by slides of other text are paired in about the time that a pairing by the start and the end takes', { timeout: 120_000 }, () => {
  const text = (k) => `<section>\n  <h2>Slide ${k} of the talk</h2>\n  <p>Paragraph ${(k * 7919) % 10007} reads ${(k * 104729).toString(36)} and ${(k * 15485863).toString(36)}.</p>\n</section>`;
  const a = Array.from({ length: 400 }, (_, k) => text(k));
  const b = Array.from({ length: 399 }, (_, k) => text(400 + k));
  for (let attempt = 1; ; attempt++) {
    const half = fastest(() => pairs(a, b, true));
    const ends = fastest(() => pairs(a, b, false));
    if (half < 1.5 * ends) break;
    assert.ok(attempt < 3, `${half.toFixed(1)} ms with half against ${ends.toFixed(1)} ms without`);
  }
});

test('a long slide of one repeated word, edited at the start and the end, is paired in a time linear in its length', { timeout: 120_000 }, () => {
  const other = '<section>\n  <h2>Other</h2>\n</section>';
  const run = (k) => {
    const a = [other, `<section>\n  <p>A ${'0 '.repeat(k)}B</p>\n</section>`];
    const b = [`${other}\n`, `<section>\n  <p>C ${'0 '.repeat(k)}D</p>\n</section>`];
    return fastest(() => assert.equal(pairs(a, b, true).length, 2));
  };
  for (let attempt = 1; ; attempt++) {
    const small = run(10_000);
    const large = run(40_000);
    if (large < 8 * small) break;
    assert.ok(attempt < 3, `${large.toFixed(1)} ms for 4 times the length against ${small.toFixed(1)} ms`);
  }
});

test('a long slide replaced at its place by a slide without the letter at its middle is paired in a time linear in its length', { timeout: 120_000 }, () => {
  const other = '<section>\n  <h2>Other</h2>\n</section>';
  const run = (k) => {
    const a = [other, `<section>\n  <p>${'a'.repeat(k)}</p>\n</section>`];
    const b = [`${other}\n`, `<section>\n  <p>${'b'.repeat(2 * k)}</p>\n</section>`];
    return fastest(() => assert.equal(pairs(a, b, true).length, 1));
  };
  for (let attempt = 1; ; attempt++) {
    const small = run(10_000);
    const large = run(40_000);
    if (large < 8 * small) break;
    assert.ok(attempt < 3, `${large.toFixed(1)} ms for 4 times the length against ${small.toFixed(1)} ms`);
  }
});

test('a slide whose long run without spaces is replaced, e.g. the data of a plot, is paired in a time linear in its length', { timeout: 120_000 }, () => {
  const other = '<section>\n  <h2>Other</h2>\n</section>';
  // the points of a plot as JSON.stringify writes them
  const data = (k, seed) => JSON.stringify(Array.from({ length: k }, (_, i) => [i, ((i * 7919 + seed) % 10007) / 10007]));
  const plot = (k, seed) => `<section>\n  <h2>Results</h2>\n  <script type="application/json">${data(k, seed)}</script>\n</section>`;
  const run = (k) => {
    const a = [other, plot(k, 1)];
    const b = [`${other}\n`, plot(k, 4001)];
    return fastest(() => pairs(a, b, true));
  };
  for (let attempt = 1; ; attempt++) {
    const small = run(2_000);
    const large = run(8_000);
    if (large < 8 * small) break;
    assert.ok(attempt < 3, `${large.toFixed(1)} ms for 4 times the length against ${small.toFixed(1)} ms`);
  }
});
