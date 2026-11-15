// the anchors of comments moved by an operation, each rule driven by the patches of the real diff
// of two texts, as a Replica sends them: a shift, a start tag replaced, a move of an element and of
// a slide, a removed element and slide, the re-insertion of what was removed, and the check of
// anchors against a text at a start

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAnchors, diff, moveAnchors, REMOVED_MAX, slidesOf, startTagAt } from '../theme/edit.mjs';

// a deck of slides, each given as its lines
const deck = (...slides) => ['<!doctype html>', '<body>', ...slides.flatMap((lines) => ['<section>', ...lines.map((l) => `  ${l}`), '</section>']), '</body>', ''].join('\n');

const slideAround = (text, at) => {
  const s = slidesOf(text).find((x) => x.start <= at && at < x.end);
  return s ? { start: s.start, end: s.open, tag: 'section' } : null;
};
// a comment on the first element whose start tag begins with open, and one on the slide of it
const onElement = (text, open) => {
  const at = text.indexOf(open);
  assert.ok(at >= 0, `${open} is in the text`);
  return { anchor: startTagAt(text, at), slide: slideAround(text, at) };
};
const onSlide = (text, inside) => {
  const s = slideAround(text, text.indexOf(inside));
  return { anchor: s, slide: s };
};
const move = (before, after, items) => moveAnchors(before, diff(before, after), after, items);
// the text of after from an anchor on, of the length of what
const reads = (text, anchor, what) => assert.equal(anchor && text.slice(anchor.start, anchor.start + what.length), what);

test('a patch that only passes an anchor shifts it', () => {
  const before = deck(['<h2>Alpha</h2>', '<p>One</p>'], ['<h2>Beta</h2>', '<p class="x">Two</p>']);
  const items = [onElement(before, '<p class="x">'), onSlide(before, 'Beta')];
  // typing before the anchors
  const typed = before.replace('One', 'One and more');
  let r = move(before, typed, items);
  reads(typed, r.items[0].anchor, '<p class="x">Two</p>');
  reads(typed, r.items[0].slide, '<section>\n  <h2>Beta');
  reads(typed, r.items[1].anchor, '<section>\n  <h2>Beta');
  assert.deepEqual(r.changed, [false, false]);
  // a slide inserted before them, and typing inside the element of the anchor
  const grown = typed.replace('<section>', '<section>\n  <h2>New</h2>\n</section>\n<section>').replace('Two', 'Two too');
  r = move(typed, grown, r.items);
  reads(grown, r.items[0].anchor, '<p class="x">Two too</p>');
  reads(grown, r.items[1].anchor, '<section>\n  <h2>Beta');
  assert.deepEqual(r.changed, [false, false]);
  // a value of an attribute of the start tag of the anchor
  const restyled = grown.replace('class="x"', 'class="wide"');
  r = move(grown, restyled, r.items);
  assert.equal(restyled.slice(r.items[0].anchor.start, r.items[0].anchor.end), '<p class="wide">');
  assert.equal(r.items[0].removed, undefined);
});

test('a start tag replaced keeps the anchor on its element, with the range of the new tag', () => {
  const before = deck(['<h2>Alpha</h2>', '<p>One</p>', '<p>Two</p>']);
  const items = [onElement(before, '<p>Two'), onElement(before, '<h2>')];
  const after = before.replace('<p>Two', '<p style="left: 10px">Two').replace(/h2>/g, 'h3>');
  const patches = diff(before, after);
  assert.ok(patches.some((p) => before.slice(p.start, p.end) === '<p>'), 'diff replaces the whole start tag');
  const r = moveAnchors(before, patches, after, items);
  assert.equal(after.slice(r.items[0].anchor.start, r.items[0].anchor.end), '<p style="left: 10px">');
  assert.deepEqual(r.items[1].anchor, { ...startTagAt(after, after.indexOf('<h3>')), tag: 'h3' });
  assert.equal(r.items[0].removed, undefined);
  assert.equal(r.items[1].removed, undefined);
});

test('an element or a slide that moves is followed', async (t) => {
  await t.test('a paragraph moved up in its slide', () => {
    const before = deck(['<h2>Alpha</h2>', '<p>One</p>', '<p>Two</p>', '<p>Three</p>']);
    const after = before.replace('  <p>Three</p>\n', '').replace('  <p>One</p>', '  <p>Three</p>\n  <p>One</p>');
    const r = move(before, after, [onElement(before, '<p>Three'), onElement(before, '<p>One')]);
    reads(after, r.items[0].anchor, '<p>Three</p>');
    reads(after, r.items[1].anchor, '<p>One</p>');
    assert.equal(r.items[0].removed, undefined);
  });

  await t.test('a paragraph moved to another slide', () => {
    const before = deck(['<h2>Alpha</h2>', '<p>One</p>', '<p>Moved</p>'], ['<h2>Beta</h2>', '<p>Two</p>']);
    const after = before.replace('  <p>Moved</p>\n', '').replace('  <p>Two</p>', '  <p>Two</p>\n  <p>Moved</p>');
    const [moved] = move(before, after, [onElement(before, '<p>Moved')]).items;
    reads(after, moved.anchor, '<p>Moved</p>');
    reads(after, moved.slide, '<section>\n  <h2>Beta');
  });

  await t.test('a slide moved after the next one, which the line diff makes a rotation', () => {
    const before = deck(['<h2>Alpha</h2>', '<p>Uno</p>'], ['<h2>Beta</h2>', '<p>Dos</p>', '<p>Tres</p>'], ['<h2>Gamma</h2>']);
    const after = deck(['<h2>Beta</h2>', '<p>Dos</p>', '<p>Tres</p>'], ['<h2>Alpha</h2>', '<p>Uno</p>'], ['<h2>Gamma</h2>']);
    const patches = diff(before, after);
    // the start tag of the first slide stays in place, and the text of Alpha is moved after it
    const first = before.indexOf('<section>');
    assert.ok(!patches.some((p) => p.start <= first && first < p.end), 'the first start tag is kept by the diff');
    const items = [onSlide(before, 'Alpha'), onElement(before, '<p>Uno'), onSlide(before, 'Beta'), onElement(before, '<p>Tres')];
    const r = moveAnchors(before, patches, after, items);
    reads(after, r.items[0].anchor, '<section>\n  <h2>Alpha');
    reads(after, r.items[1].anchor, '<p>Uno</p>');
    reads(after, r.items[1].slide, '<section>\n  <h2>Alpha');
    reads(after, r.items[2].anchor, '<section>\n  <h2>Beta');
    reads(after, r.items[3].anchor, '<p>Tres</p>');
    reads(after, r.items[3].slide, '<section>\n  <h2>Beta');
    assert.deepEqual(r.changed, [true, true, true, true]);
    assert.ok(r.items.every((it) => it.removed === undefined));
  });

  await t.test('two elements of equal start tags swapped in a slide', () => {
    const before = deck(['<h2>Alpha</h2>', '<div>', '  <p>First</p>', '</div>', '<div>', '  <p>Second</p>', '</div>']);
    const after = before.replace('First', '#').replace('Second', 'First').replace('#', 'Second');
    // the diff changes only the texts, and leaves both start tags in place
    assert.ok(diff(before, after).every((p) => !/[<>]/.test(p.text)));
    const first = before.indexOf('<div>');
    const second = before.indexOf('<div>', first + 1);
    const r = move(before, after, [onElement(before, '<div>'), { anchor: startTagAt(before, second), slide: slideAround(before, second) }]);
    reads(after, r.items[0].anchor, '<div>\n    <p>First');
    reads(after, r.items[1].anchor, '<div>\n    <p>Second');
  });

  await t.test('typing inside an element that has an equal copy elsewhere keeps the anchor on it', () => {
    const before = deck(['<h2>Alpha</h2>', '<p>Same</p>'], ['<h2>Beta</h2>', '<p>Same</p>']);
    const after = before.replace('Same', 'Same <b>bold</b>');
    const [kept] = move(before, after, [onElement(before, '<p>Same')]).items;
    reads(after, kept.anchor, '<p>Same <b>bold</b></p>');
    reads(after, kept.slide, '<section>\n  <h2>Alpha');
  });
});

test('a removed element falls back to its slide, a removed slide to the deck, and an undo attaches them again', () => {
  const v0 = deck(['<h2>Alpha</h2>', '<p>One</p>', '<p>Gone</p>'], ['<h2>Beta</h2>', '<p>Two</p>']);
  const items = [onElement(v0, '<p>Gone'), onSlide(v0, 'Beta'), onElement(v0, '<p>Two')];
  const v1 = v0.replace('  <p>Gone</p>\n', '');
  let r = move(v0, v1, items);
  reads(v1, r.items[0].anchor, '<section>\n  <h2>Alpha');
  assert.deepEqual(r.items[0].slide, r.items[0].anchor);
  assert.deepEqual(r.items[0].removed, { text: '<p>Gone</p>' });
  assert.deepEqual(r.changed, [true, false, false]);
  const v2 = v1.replace('<section>\n  <h2>Beta</h2>\n  <p>Two</p>\n</section>\n', '');
  r = move(v1, v2, r.items);
  assert.deepEqual(r.items[1], { anchor: null, slide: null, removed: { text: '<section>\n  <h2>Beta</h2>\n  <p>Two</p>\n</section>' } });
  assert.deepEqual(r.items[2], { anchor: null, slide: null, removed: { text: '<p>Two</p>' } });
  reads(v2, r.items[0].anchor, '<section>\n  <h2>Alpha');
  assert.deepEqual(r.changed, [false, true, true]);
  // the undo of the removal of the slide, and then of the paragraph
  r = move(v2, v1, r.items);
  reads(v1, r.items[1].anchor, '<section>\n  <h2>Beta');
  assert.deepEqual(r.items[1].slide, r.items[1].anchor);
  reads(v1, r.items[2].anchor, '<p>Two</p>');
  reads(v1, r.items[2].slide, '<section>\n  <h2>Beta');
  r = move(v1, v0, r.items);
  reads(v0, r.items[0].anchor, '<p>Gone</p>');
  reads(v0, r.items[0].slide, '<section>\n  <h2>Alpha');
  assert.deepEqual(r.items, items);
  assert.deepEqual(r.changed, [true, false, false]);

  // a removed slide larger than the limit is not kept, and its re-insertion does not attach it
  const big = deck(['<h2>Big</h2>', `<p>${'x'.repeat(REMOVED_MAX)}</p>`], ['<h2>Small</h2>']);
  const withoutBig = big.replace(/<section>\n {2}<h2>Big[^]*?<\/section>\n/, '');
  r = move(big, withoutBig, [onSlide(big, 'Big')]);
  assert.deepEqual(r.items[0], { anchor: null, slide: null, removed: { text: null } });
  assert.deepEqual(move(withoutBig, big, r.items).items[0], r.items[0]);
});

test('anchors checked against a text that does not hold their start tags fall back', () => {
  const text = deck(['<h2>Alpha</h2>', '<p>One</p>']);
  const good = onElement(text, '<p>One');
  const slide = onSlide(text, 'Alpha');
  const renamed = { ...good, anchor: { ...good.anchor, tag: 'div' } };
  const off = { anchor: { start: good.anchor.start + 1, end: good.anchor.end, tag: 'p' }, slide: good.slide };
  const lost = { anchor: off.anchor, slide: { start: 3, end: 9, tag: 'section' } };
  const deckItem = { anchor: null, slide: null };
  const r = checkAnchors(text, [good, slide, renamed, off, lost, deckItem]);
  assert.deepEqual(r.changed, [false, false, true, true, true, false]);
  assert.deepEqual(r.items.slice(0, 2), [good, slide]);
  assert.deepEqual(r.items[2], { anchor: good.slide, slide: good.slide, removed: { text: null } });
  assert.deepEqual(r.items[3], r.items[2]);
  assert.deepEqual(r.items[4], { anchor: null, slide: null, removed: { text: null } });
  assert.deepEqual(r.items[5], deckItem);
});

test('a start tag is read whole, however long, and only where one begins', () => {
  const long = `<p>a</p><img src="data:image/png;base64,${'A'.repeat(5000)}" alt="x > y"><p>b</p>`;
  const img = startTagAt(long, long.indexOf('<img'));
  assert.equal(img.tag, 'img');
  assert.equal(long.slice(img.end, img.end + 3), '<p>');
  assert.equal(startTagAt(long, 1), null);
  assert.equal(startTagAt(long, long.indexOf('</p>')), null);
  assert.equal(startTagAt('<!-- x -->', 0), null);
  assert.equal(startTagAt('<p', 0), null);
  assert.equal(startTagAt(long, -1), null);
  assert.equal(startTagAt(long, 0.5), null);
});

test('the slides of the text after are those that a whole read finds, also when one slide alone is read', () => {
  const before = deck(['<h2>Alpha</h2>', '<p>One</p>'], ['<h2>Beta</h2>', '<p>Two</p>', '<p>Three</p>'], ['<h2>Gamma</h2>']);
  const at = (what) => before.indexOf(what);
  const insert = (where, text) => [{ start: where, end: where, text }];
  const cases = {
    'an element inserted': insert(at('<p>Three'), '<p>New</p>\n  '),
    'an element removed': [{ start: at('<p>Two'), end: at('<p>Three'), text: '' }],
    'an insertion at the end tag': insert(at('</section>\n<section>\n  <h2>Gamma'), '<p>Last</p>\n'),
    'a section inside a slide': insert(at('<p>Three'), '<section><p>x</p></section>'),
    'an end tag of a section': insert(at('<p>Three'), '</section>'),
    'an open HTML comment': insert(at('<p>Three'), '<!-- '),
    'an open script': insert(at('<p>Three'), '<script>'),
    'an open attribute value': insert(at('<p>Three'), '<p title="x>'),
    'a closed HTML comment': insert(at('<p>Three'), '<!-- <section> -->'),
    'two slides': [...insert(at('<p>One'), '<b>x</b>'), ...insert(at('<p>Two'), '<b>y</b>')],
    'a start tag of a slide': [{ start: at('<section>\n  <h2>Beta') + 8, end: at('<section>\n  <h2>Beta') + 8, text: ' class="title"' }],
    'a slide removed': [{ start: at('<section>\n  <h2>Beta'), end: at('<section>\n  <h2>Gamma'), text: '' }],
  };
  // the cases where the slide of the patches is read alone, and the slides before it are kept as given
  const alone = new Set(['an element inserted', 'an element removed', 'an insertion at the end tag', 'a closed HTML comment']);
  const items = [onElement(before, '<p>Three'), onElement(before, '<h2>Alpha'), onSlide(before, 'Gamma')];
  for (const [name, patches] of Object.entries(cases)) {
    let after = before;
    for (const p of [...patches].reverse()) after = after.slice(0, p.start) + p.text + after.slice(p.end);
    const given = slidesOf(before);
    const r = moveAnchors(before, patches, after, items, given);
    assert.deepEqual(r.slides, slidesOf(after), name);
    assert.equal(r.slides[0] === given[0], alone.has(name), name);
    reads(after, r.items[1].anchor, '<h2>Alpha');
  }
  // no items, no slides read
  assert.deepEqual(moveAnchors(before, cases['an element inserted'], before, [], slidesOf(before)), { items: [], changed: [], slides: null });
});

test('an element longer than every inserted text and than 4 kB is not read to its end', () => {
  const big = 'x'.repeat(REMOVED_MAX + 10);
  const before = deck(['<h2>Alpha</h2>', `<div><p>${big}</p></div>`, '<p>After</p>']);
  const items = [onElement(before, '<div>'), onElement(before, '<p>After')];
  // a paragraph inserted inside the element: the start tag of the element is kept
  const grown = before.replace('</p></div>', '</p><p>New</p></div>');
  let r = move(before, grown, items);
  reads(grown, r.items[0].anchor, '<div><p>xxx');
  reads(grown, r.items[1].anchor, '<p>After');
  assert.deepEqual(r.changed, [false, false]);
  // the element removed: it falls back to its slide without its text
  const gone = before.replace(`  <div><p>${big}</p></div>\n`, '');
  r = move(before, gone, items);
  reads(gone, r.items[0].anchor, '<section>\n  <h2>Alpha');
  assert.deepEqual(r.items[0].removed, { text: null });
  reads(gone, r.items[1].anchor, '<p>After');
});

test('random operations keep the anchors on start tags of their slides, and the slides as a whole read finds them', () => {
  // a seeded generator, so that a failure is found again
  const random = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pieces = ['<p>', '</p>', 'text ', '\n', '<section>', '</section>', '<div class="a">', '</div>', '<!--', '-->', '"', "'", '<script>', '</script>', '>', '<', '-', '<h2>x</h2>', '<section data-visibility="hidden">', '<img src="a.png">'];
  const start = deck(['<h2>One</h2>', '<p>First</p>', '<!-- a note -->'], ['<h2>Two</h2>', '<div class="a"><p>Inner</p></div>'], ['<h2>Three</h2>', '<script>let a = 1 > 0;</script>', '<p>Last</p>']).replace('<section>\n  <h2>Two', '<section>\n<section>\n  <h2>Two').replace('</div>\n</section>', '</div>\n</section>\n<section><p>Down</p></section>\n</section>');
  for (const seed of [1, 2, 3]) {
    const next = random(seed);
    const pick = (list) => list[Math.floor(next() * list.length)];
    let text = start;
    let slides = slidesOf(text);
    let items = [];
    for (let step = 0; step < 300; step++) {
      // new comments now and then, on start tags of the text and on its slides
      if (step % 50 === 0) {
        const tags = [];
        for (let i = text.indexOf('<'); i >= 0; i = text.indexOf('<', i + 1)) if (startTagAt(text, i)) tags.push(i);
        items = Array.from({ length: Math.min(8, tags.length) }, () => {
          const t = startTagAt(text, pick(tags));
          const s = slideAround(text, t.start);
          return next() < 0.3 && s ? { anchor: s, slide: s } : { anchor: t, slide: s };
        });
        items.push({ anchor: null, slide: null });
        slides = slidesOf(text);
      }
      const patches = [];
      for (let k = 0, from = 0, n = 1 + Math.floor(next() * 3); k < n && from <= text.length; k++) {
        const at = from + Math.floor(next() * Math.min(400, text.length - from + 1));
        const end = Math.min(text.length, at + (next() < 0.5 ? 0 : Math.floor(next() * 12)));
        const inserted = Array.from({ length: Math.floor(next() * 3) }, () => pick(pieces)).join('');
        if (at === end && !inserted) continue;
        patches.push({ start: at, end, text: inserted });
        from = end + 1;
      }
      if (!patches.length) continue;
      let after = text;
      for (const p of [...patches].reverse()) after = after.slice(0, p.start) + p.text + after.slice(p.end);
      const where = `seed ${seed}, step ${step}, patches ${JSON.stringify(patches)}`;
      const r = moveAnchors(text, patches, after, items, slides);
      const whole = slidesOf(after);
      assert.deepEqual(r.slides, whole, where);
      assert.deepEqual(checkAnchors(after, r.items, whole).changed, r.items.map(() => false), where);
      ({ items, slides } = r);
      text = after.length > 6000 || after.length < 200 ? start : after;
      if (text === start && after !== start) step = 49 + 50 * Math.floor(step / 50);
    }
  }
});
