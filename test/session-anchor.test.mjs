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
  assert.deepEqual(r.items[2], { anchor: null, slide: null, removed: { text: '<p>Two</p>', slide: '<section>\n  <h2>Beta</h2>\n  <p>Two</p>\n</section>' } });
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

test('a thread of a removed slide is attached again only inside a re-insertion of the whole slide', () => {
  const v0 = deck(['<h2>Alpha</h2>', '<p>One</p>'], ['<h2>Beta</h2>', '<p></p>', '<p>Gone</p>']);
  const items = [onElement(v0, '<p></p>'), onElement(v0, '<p>Gone')];
  const v1 = v0.replace('  <p>Gone</p>\n', '');
  const v2 = v1.replace('<section>\n  <h2>Beta</h2>\n  <p></p>\n</section>\n', '');
  const r2 = move(v1, v2, move(v0, v1, items).items);
  assert.ok(r2.items.every((it) => it.anchor === null && it.removed), JSON.stringify(r2.items));
  // an empty paragraph added to another slide
  const added = v2.replace('<p>One</p>', '<p>One</p>\n  <p></p>');
  assert.deepEqual(move(v2, added, r2.items).items, r2.items);
  // the undo of the removal of the slide, and then of the paragraph
  const [empty, gone] = move(v2, v1, r2.items).items;
  reads(v1, empty.anchor, '<p></p>');
  reads(v1, empty.slide, '<section>\n  <h2>Beta');
  reads(v1, gone.anchor, '<section>\n  <h2>Beta');
  assert.deepEqual([gone.slide, gone.removed], [gone.anchor, { text: '<p>Gone</p>' }]);
  assert.deepEqual(move(v1, v0, [empty, gone]).items, items);
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

// the start tag at the k-th place where open begins
const nth = (text, open, k) => {
  let at = -1;
  for (let i = 0; i <= k; i++) at = text.indexOf(open, at + 1);
  assert.ok(at >= 0, `${open} is in the text ${k + 1} times`);
  return at;
};
const fellBack = (text, item, slide, removed) => {
  reads(text, item.anchor, slide);
  assert.deepEqual(item.slide, item.anchor);
  assert.deepEqual(item.removed, { text: removed });
};

test('an element removed before a sibling that starts the same way falls back, although the diff keeps its start tag', async (t) => {
  const cases = [
    ['inline code', '<p>Press <code>e</code> to edit and <code>s</code> for notes.</p>', '<code>e</code> to edit and ', '<code>'],
    ['a list on one line', '<ul><li>Draft the intro</li><li>Derive the bound</li></ul>', '<li>Draft the intro</li>', '<li>'],
    ['items that differ in one character', '<ul><li>Step 1</li><li>Step 2</li></ul>', '<li>Step 1</li>', '<li>'],
    ['bold text before longer bold text', '<p>Press <b>bold</b> and <b>bolder</b> now</p>', '<b>bold</b> and ', '<b>'],
  ];
  for (const [name, line, cut, open] of cases) {
    await t.test(name, () => {
      const before = deck(['<h2>Alpha</h2>', line]);
      const after = before.replace(cut, '');
      const at = before.indexOf(open);
      assert.ok(!diff(before, after).some((p) => p.start <= at && at < p.end), 'the diff keeps the start tag');
      const [item] = move(before, after, [onElement(before, open)]).items;
      const removed = cut.slice(0, cut.indexOf('>', cut.indexOf('</')) + 1);
      fellBack(after, item, '<section>\n  <h2>Alpha', removed);
    });
  }

  await t.test('a slide of a deck written on one line', () => {
    const before = '<!doctype html><body><section><h2>Alpha</h2><p>One</p></section><section><h2>Beta</h2><p>Two</p></section></body>';
    const after = before.replace('<section><h2>Alpha</h2><p>One</p></section>', '');
    const r = move(before, after, [onElement(before, '<h2>Alpha'), onSlide(before, 'Alpha'), onElement(before, '<h2>Beta')]);
    assert.deepEqual(r.items[0], { anchor: null, slide: null, removed: { text: '<h2>Alpha</h2>', slide: '<section><h2>Alpha</h2><p>One</p></section>' } });
    assert.deepEqual(r.items[1], { anchor: null, slide: null, removed: { text: '<section><h2>Alpha</h2><p>One</p></section>' } });
    reads(after, r.items[2].anchor, '<h2>Beta');
  });
});

test('an element wrapped in a new element of the same start tag keeps its thread', () => {
  const before = deck(['<h2>Alpha</h2>', '<div class="group">', '  <p>Inner</p>', '</div>']);
  const after = before.replace('<div class="group">\n    <p>Inner</p>\n  </div>', '<div class="group">\n    <div class="group">\n      <p>Inner</p>\n    </div>\n  </div>');
  const [item] = move(before, after, [onElement(before, '<div class="group">')]).items;
  reads(after, item.anchor, '<div class="group">\n      <p>Inner');
  assert.equal(item.removed, undefined);
});

test('a removed element is attached again only by a re-insertion into its slide', () => {
  const logo = '<img class="logo" src="brand/logo.svg">';
  const v0 = deck(['<h2>Alpha</h2>', logo, '<p>First.</p>'], ['<h2>Beta</h2>', '<p>Second.</p>'], ['<h2>Gamma</h2>', logo, '<p>Third.</p>']);
  const v1 = v0.replace(`  ${logo}\n  <p>First.`, '  <p>First.');
  const fell = move(v0, v1, [onElement(v0, logo)]).items;
  fellBack(v1, fell[0], '<section>\n  <h2>Alpha', logo);
  // the slide that holds an equal element moved to the front
  const moved = deck(['<h2>Gamma</h2>', logo, '<p>Third.</p>'], ['<h2>Alpha</h2>', '<p>First.</p>'], ['<h2>Beta</h2>', '<p>Second.</p>']);
  fellBack(moved, move(v1, moved, fell).items[0], '<section>\n  <h2>Alpha', logo);
  // a copy pasted onto another slide
  const pasted = v1.replace('  <p>Second.', `  ${logo}\n  <p>Second.`);
  fellBack(pasted, move(v1, pasted, fell).items[0], '<section>\n  <h2>Alpha', logo);
  // the undo
  const [back] = move(v1, v0, fell).items;
  assert.deepEqual(back, onElement(v0, logo));
});

test('an element edited while a copy of its old text is pasted in the same operation keeps its thread', () => {
  const before = deck(['<h2>Alpha</h2>', '<ul>', '  <li>Derive the bound</li>', '  <li>Check the limit</li>', '</ul>']);
  const after = before.replace('<li>Derive the bound</li>', '<li>Derive the upper bound</li>').replace('<li>Check the limit</li>', '<li>Check the limit</li>\n    <li>Derive the bound</li>');
  assert.equal(diff(before, after).length, 2, 'the diff inserts the word and the copy');
  const [item] = move(before, after, [onElement(before, '<li>Derive')]).items;
  reads(after, item.anchor, '<li>Derive the upper bound</li>');
  assert.equal(item.removed, undefined);
});

test('an element keeps its thread through typing inside it, a change of its start tag, and a move of it or of its slide', async (t) => {
  const before = deck(['<h2>Alpha</h2>', '<p>Hello</p>', '<p>World</p>', '<p>Last</p>'], ['<h2>Beta</h2>', '<p>Two</p>']);
  const cases = {
    'its whole text replaced': [before.replace('Hello', 'G'), '<p>G</p>'],
    'the next paragraph joined to it': [before.replace('Hello</p>\n  <p>World', 'HelloWorld'), '<p>HelloWorld</p>'],
    'a selection from its middle into the next paragraph deleted': [before.replace('llo</p>\n  <p>Wo', ''), '<p>Herld</p>'],
    'its start tag changed while typing inside it': [before.replace('<p>Hello', '<p class="wide">Hello there'), '<p class="wide">Hello there</p>'],
    'a move after its next sibling': [before.replace('  <p>Hello</p>\n  <p>World</p>', '  <p>World</p>\n  <p>Hello</p>'), '<p>Hello</p>'],
    'a move of its slide to the end': [deck(['<h2>Beta</h2>', '<p>Two</p>'], ['<h2>Alpha</h2>', '<p>Hello</p>', '<p>World</p>', '<p>Last</p>']), '<p>Hello</p>'],
  };
  for (const [name, [after, what]] of Object.entries(cases)) {
    await t.test(name, () => {
      const [item] = move(before, after, [onElement(before, '<p>Hello')]).items;
      reads(after, item.anchor, what);
      reads(after, item.slide, '<section>\n  <h2>Alpha');
      assert.equal(item.removed, undefined);
    });
  }
});

const ALPHA = ['<h2>Alpha</h2>', '<p>The transfer leaves the halo orbit along its unstable manifold.</p>'];
const BETA = ['<h2>Beta</h2>', '<p>Two impulses place the spacecraft on the stable manifold of the target.</p>'];
const GAMMA = ['<h2>Gamma</h2>', '<p>The cost is compared with a direct transfer of the same duration.</p>'];

test('a slide removed while another is added in one operation hands its threads to the deck', () => {
  const before = deck(ALPHA, BETA, GAMMA);
  const after = deck(ALPHA, GAMMA, ['<h2>Summary</h2>', '<p>Manifolds lower the cost of the transfer by a third, at a longer flight.</p>']);
  const r = move(before, after, [onSlide(before, 'Beta'), onElement(before, '<p>Two'), onSlide(before, 'Gamma'), onElement(before, '<p>The cost')]);
  assert.deepEqual(r.items[0], { anchor: null, slide: null, removed: { text: `<section>\n  ${BETA.join('\n  ')}\n</section>` } });
  assert.deepEqual(r.items[1], { anchor: null, slide: null, removed: { text: BETA[1], slide: `<section>\n  ${BETA.join('\n  ')}\n</section>` } });
  reads(after, r.items[2].anchor, '<section>\n  <h2>Gamma');
  reads(after, r.items[3].anchor, '<p>The cost');
  reads(after, r.items[3].slide, '<section>\n  <h2>Gamma');
});

test('a short slide removed while others are added or edited in one operation hands its threads to the deck', async (t) => {
  const gone = (before, inside) => {
    const s = slideAround(before, before.indexOf(inside));
    return { anchor: null, slide: null, removed: { text: before.slice(s.start, before.indexOf('</section>', s.start) + 10) } };
  };
  await t.test('a slide of a layout added at the end', () => {
    const title = ['<h2>Title</h2>', '<p>by Ana</p>'];
    const method = ['<h2>Method</h2>', '<p>More text here</p>'];
    const before = deck(title, ['<h2>Remove me</h2>', '<p>Some text</p>'], method, ['<h2>Questions?</h2>']);
    const after = deck(title, method, ['<h2>Questions?</h2>'], ['<h2></h2>', '<p></p>']);
    const r = move(before, after, [onElement(before, '<h2>Remove me'), onSlide(before, 'Remove me')]);
    assert.deepEqual(r.items[0], { anchor: null, slide: null, removed: { text: '<h2>Remove me</h2>', slide: gone(before, 'Remove me').removed.text } });
    assert.deepEqual(r.items[1], gone(before, 'Remove me'));
  });
  const cases = {
    'slides of one line': [
      [['<h2>One</h2>'], ['<p class="x">Remove me</p>'], ['<p>Gamma</p>'], ['<h2>End</h2>']],
      [['<h2>One</h2>'], ['<p>Gamma, edited</p>'], ['<p>New slide</p>'], ['<h2>End</h2>']],
      '<p>Gamma, edited</p>',
    ],
    'slides with a title': [
      [['<h2>One</h2>', '<p>a</p>'], ['<h2>Results</h2>', '<p>Remove me</p>'], ['<h2>Method</h2>', '<p>Gamma</p>'], ['<h2>End</h2>']],
      [['<h2>One</h2>', '<p>a</p>'], ['<h2>Method</h2>', '<p>Gamma and more</p>'], ['<h2>Outlook</h2>', '<p>New</p>'], ['<h2>End</h2>']],
      '<p>Gamma and more</p>',
    ],
  };
  for (const [name, [a, b, edited]] of Object.entries(cases)) {
    await t.test(`${name}, the next one edited and a new one added after it`, () => {
      const before = deck(...a);
      const after = deck(...b);
      const removedTag = before.lastIndexOf('<', before.indexOf('Remove me') - 1);
      const items = [{ anchor: startTagAt(before, removedTag), slide: slideAround(before, removedTag) }, onSlide(before, 'Remove me'), onSlide(before, 'Gamma'), onElement(before, '<p>Gamma')];
      const r = move(before, after, items);
      assert.equal(r.items[0].anchor, null);
      assert.ok(r.items[0].removed?.text.includes('Remove me'), JSON.stringify(r.items[0]));
      assert.deepEqual(r.items[1], gone(before, 'Remove me'));
      const slide = slideAround(after, after.indexOf(edited));
      assert.deepEqual(r.items[2], { anchor: slide, slide });
      reads(after, r.items[3].anchor, edited);
      assert.deepEqual(r.items[3].slide, slide);
      assert.equal(r.items[3].removed, undefined);
    });
  }
  await t.test('slides without text, one removed and an attribute of the next one changed', () => {
    const before = deck(['<h2>One</h2>'], ['<img src="figures/a.png">'], ['<img src="figures/b.png">'], ['<h2>End</h2>']);
    const after = deck(['<h2>One</h2>'], ['<img class="wide" src="figures/b.png">'], ['<h2>End</h2>']);
    const r = move(before, after, [onSlide(before, 'a.png'), onSlide(before, 'b.png')]);
    assert.deepEqual(r.items[0], gone(before, 'a.png'));
    const slide = slideAround(after, after.indexOf('b.png'));
    assert.deepEqual(r.items[1], { anchor: slide, slide });
  });
  await t.test('a slide without text removed while a slide of a layout is added', () => {
    const before = deck(['<h2>One</h2>'], ['<img src="figures/a.png">'], ['<h2>End</h2>']);
    const after = deck(['<h2>One</h2>'], ['<h2>End</h2>'], ['<h2></h2>', '<p></p>']);
    assert.deepEqual(move(before, after, [onSlide(before, 'a.png')]).items[0], gone(before, 'a.png'));
  });
});

test('a slide edited in place in an operation that edits another slide keeps its threads when its heading is kept or it was empty', async (t) => {
  const MOT = ['<h2>Motivation</h2>', '<p>Transfers cost fuel.</p>'];
  const FIG = ['<img src="figures/orbit.png">'];
  const RES = ['<h2>Results</h2>', '<p>Lower cost by a third.</p>'];
  const OUT = ['<h2>Outlook</h2>', '<p>Next we try NRHOs.</p>'];
  const OUT2 = ['<h2>Outlook</h2>', '<p>Next we try NRHOs and DROs.</p>'];
  const Q = ['<h2>Questions?</h2>'];
  const kept = (after, r, inside, ...elements) => {
    const slide = slideAround(after, after.indexOf(inside));
    assert.ok(slide, `${inside} is on a slide`);
    assert.deepEqual(r.items[0], { anchor: slide, slide });
    elements.forEach((what, k) => {
      reads(after, r.items[k + 1].anchor, what);
      assert.deepEqual(r.items[k + 1].slide, slide);
      assert.equal(r.items[k + 1].removed, undefined);
    });
  };
  await t.test('the sentence of a short slide rewritten under its heading', () => {
    const before = deck(MOT, RES, OUT, Q);
    const after = deck(MOT, ['<h2>Results</h2>', '<p>Fuel use drops sharply.</p>'], OUT2, Q);
    const r = move(before, after, [onSlide(before, 'Results'), onElement(before, '<h2>Results'), onElement(before, '<p>Lower')]);
    kept(after, r, 'Fuel use', '<h2>Results</h2>', '<p>Fuel use drops sharply.</p>');
  });
  await t.test('an empty slide of a layout filled', () => {
    const before = deck(MOT, ['<h2></h2>', '<p></p>'], OUT, Q);
    const after = deck(MOT, RES, OUT2, Q);
    const r = move(before, after, [onSlide(before, '<h2></h2>'), onElement(before, '<h2></h2>')]);
    kept(after, r, 'Lower cost', '<h2>Results</h2>');
  });
  await t.test('every word of a slide rewritten, its heading too, which removes it', () => {
    const before = deck(MOT, FIG, RES, OUT, Q);
    const after = deck(MOT, FIG, ['<h2>Findings</h2>', '<p>Fuel use drops sharply.</p>'], OUT2, Q);
    const items = [onSlide(before, 'Results'), onElement(before, '<h2>Results'), onElement(before, '<p>Lower'), onSlide(before, 'Outlook'), onElement(before, '<p>Next')];
    const r = move(before, after, items);
    const whole = `<section>\n  ${RES.join('\n  ')}\n</section>`;
    assert.deepEqual(r.items[0], { anchor: null, slide: null, removed: { text: whole } });
    assert.deepEqual(r.items[1], { anchor: null, slide: null, removed: { text: RES[0], slide: whole } });
    assert.deepEqual(r.items[2], { anchor: null, slide: null, removed: { text: RES[1], slide: whole } });
    const outlook = slideAround(after, after.indexOf('Outlook'));
    assert.deepEqual(r.items[3], { anchor: outlook, slide: outlook });
    reads(after, r.items[4].anchor, OUT2[1]);
    assert.deepEqual(r.items[4].slide, outlook);
  });
});

test('of two slides of equal text, the one that the operation removes loses its threads', async (t) => {
  const Q = ['<h2>Questions?</h2>'];
  const before = deck(['<h2>Alpha</h2>'], Q, ['<h2>Beta</h2>'], Q);
  const q = (k) => {
    const s = slideAround(before, nth(before, '<h2>Questions?', k));
    return { anchor: s, slide: s };
  };
  const items = [q(0), q(1), onSlide(before, 'Beta')];
  const gone = { anchor: null, slide: null, removed: { text: '<section>\n  <h2>Questions?</h2>\n</section>' } };
  await t.test('the first removed', () => {
    const after = deck(['<h2>Alpha</h2>'], ['<h2>Beta</h2>'], Q);
    const r = move(before, after, items);
    assert.deepEqual(r.items[0], gone);
    reads(after, r.items[1].anchor, '<section>\n  <h2>Questions?');
    assert.equal(r.items[1].removed, undefined);
    reads(after, r.items[2].anchor, '<section>\n  <h2>Beta');
  });
  await t.test('the second removed', () => {
    const after = deck(['<h2>Alpha</h2>'], Q, ['<h2>Beta</h2>']);
    const r = move(before, after, items);
    reads(after, r.items[0].anchor, '<section>\n  <h2>Questions?');
    assert.equal(r.items[0].removed, undefined);
    assert.deepEqual(r.items[1], gone);
    reads(after, r.items[2].anchor, '<section>\n  <h2>Beta');
  });
  await t.test('the first moved after the slide between them', () => {
    const after = deck(['<h2>Alpha</h2>'], ['<h2>Beta</h2>'], Q, Q);
    const r = move(before, after, items);
    reads(after, r.items[0].anchor, '<section>\n  <h2>Questions?');
    reads(after, r.items[1].anchor, '<section>\n  <h2>Questions?');
    assert.notEqual(r.items[0].anchor.start, r.items[1].anchor.start);
    reads(after, r.items[2].anchor, '<section>\n  <h2>Beta');
    assert.ok(r.items.every((it) => it.removed === undefined));
  });
});

test('a slide rewritten by typing keeps its threads, since each operation is small', () => {
  let text = deck(ALPHA, BETA, GAMMA);
  let items = [onSlide(text, 'Beta'), onElement(text, '<p>Two')];
  const steps = [
    (x) => x.replace('<h2>Beta</h2>', '<h2>Results</h2>'),
    (x) => x.replace('Two impulses place', 'A single burn puts'),
    (x) => x.replace('<section>\n  <h2>Results', '<section class="wide">\n  <h2>Results'),
    (x) => x.replace('the spacecraft on the stable manifold of the target.', 'us on a ballistic capture'),
    (x) => x.replace('ballistic capture', 'ballistic capture at the Moon, in eleven days of flight'),
  ];
  for (const step of steps) {
    const after = step(text);
    assert.notEqual(after, text);
    ({ items } = move(text, after, items));
    text = after;
  }
  reads(text, items[0].anchor, '<section class="wide">\n  <h2>Results');
  reads(text, items[1].anchor, '<p>A single burn puts us on a ballistic capture');
  reads(text, items[1].slide, '<section class="wide">');
  assert.ok(items.every((it) => it.removed === undefined));
});

test('an element taken from its place and inserted at two places is followed to the nearest', () => {
  const before = deck(['<h2>Alpha</h2>', `<p>${'A long first paragraph. '.repeat(4)}</p>`, '<p>Moved</p>', '<p>Two</p>', '<p>Three</p>']);
  const line = '  <p>Moved</p>\n';
  const first = before.indexOf('  <p>A long');
  const from = before.indexOf(line);
  const last = before.indexOf('  <p>Three');
  const patches = [
    { start: first, end: first, text: line },
    { start: from, end: from + line.length, text: '' },
    { start: last, end: last, text: line },
  ];
  let after = before;
  for (const p of [...patches].reverse()) after = after.slice(0, p.start) + p.text + after.slice(p.end);
  const [item] = moveAnchors(before, patches, after, [onElement(before, '<p>Moved')]).items;
  assert.equal(item.anchor.start, nth(after, '<p>Moved', 1));
});

test('an inserting operation takes about as long with threads of removed elements as with threads on elements', () => {
  const slide = (k) => [`<h2>Slide ${k}</h2>`, ...Array.from({ length: 6 }, (_, i) => `<p style="left: ${i}px">Paragraph ${i} of slide ${k}, on the unstable manifold of the halo orbit.</p>`)];
  const before = deck(...Array.from({ length: 300 }, (_, k) => slide(k)));
  const slides = slidesOf(before);
  const at = before.indexOf('<p style="left: 3px">Paragraph 3 of slide 150,');
  const patches = [{ start: at, end: at, text: '<p>New</p>\n  ' }];
  const after = before.slice(0, at) + patches[0].text + before.slice(at);
  const live = [];
  const removed = [];
  for (let k = 0; k < 2000; k++) {
    const s = slides[(k * 7) % slides.length];
    const tag = { start: s.start, end: s.open, tag: 'section' };
    live.push(onElement(before.slice(0, s.end), `<p style="left: ${k % 6}px">Paragraph ${k % 6} of slide ${(k * 7) % slides.length},`));
    removed.push({ anchor: tag, slide: tag, removed: { text: `<p>Removed paragraph ${k}, which held a long text of its own about the transfer.</p>` } });
  }
  const median = (items) => {
    const times = [];
    for (let run = 0; run < 7; run++) {
      const t0 = process.hrtime.bigint();
      moveAnchors(before, patches, after, items, slides);
      times.push(Number(process.hrtime.bigint() - t0));
    }
    return times.sort((x, y) => x - y)[3];
  };
  // measured again before the test fails, since another process may take the processor for a while
  let ratio = Infinity;
  for (let attempt = 0; attempt < 3 && ratio > 3; attempt++) ratio = median(removed) / median(live);
  assert.ok(ratio <= 3, `the threads of removed elements took ${ratio.toFixed(1)} times as long`);
});

const INTRO = ['<h2>Introduction</h2>', '<p>Why transfers matter.</p>'];
const INTRO2 = ['<h2>Introduction</h2>', '<p>Why transfers matter so much.</p>'];
const MOTIVATION = ['<h2>Motivation</h2>', '<p>Transfers cost fuel.</p>'];
const RESULTS = ['<h2>Results</h2>', '<p>Lower cost by a third.</p>'];
const RESULTS2 = ['<h2>Results</h2>', '<p>Fuel use drops sharply.</p>'];
const OUTLOOK = ['<h2>Outlook</h2>', '<p>Next we try NRHOs.</p>'];
const OUTLOOK2 = ['<h2>Outlook</h2>', '<p>Next we try NRHOs and DROs.</p>'];
const METHOD = ['<h2>Method</h2>', '<p>We use a shooting method.</p>'];
const QUESTIONS = ['<h2>Questions?</h2>'];

test('a slide edited in place keeps its threads next to slides inserted, removed, moved, or edited in place in the same operation', async (t) => {
  const BACKDROP = '<div class="backdrop" data-backdrop="orbits"></div>';
  // the items are the thread of the slide that holds inside, then those of its elements in order.
  // an element given by its text keeps its thread, and one given as null stays on the slide
  const stays = (after, r, inside, ...elements) => {
    const slide = slideAround(after, after.indexOf(inside));
    assert.ok(slide, `${inside} is on a slide`);
    assert.deepEqual(r.items[0], { anchor: slide, slide });
    elements.forEach((what, k) => {
      const it = r.items[k + 1];
      assert.deepEqual(it.slide, slide, JSON.stringify(it));
      if (what) {
        reads(after, it.anchor, what);
        assert.equal(it.removed, undefined);
      } else assert.ok(it.anchor && it.anchor.start >= slide.start, JSON.stringify(it));
    });
  };
  const cases = {
    'two neighbors rewritten under their headings, and another slide edited': [
      deck(INTRO, MOTIVATION, RESULTS, OUTLOOK, QUESTIONS),
      deck(INTRO2, ['<h2>Motivation</h2>', '<p>Fuel is expensive.</p>'], RESULTS2, OUTLOOK, QUESTIONS),
    ],
    'a new slide inserted after it': [deck(INTRO, MOTIVATION, RESULTS, OUTLOOK, QUESTIONS), deck(INTRO, MOTIVATION, RESULTS2, METHOD, OUTLOOK, QUESTIONS)],
    'a new slide inserted before it': [deck(INTRO, MOTIVATION, RESULTS, OUTLOOK, QUESTIONS), deck(INTRO, MOTIVATION, METHOD, RESULTS2, OUTLOOK, QUESTIONS)],
    'the slide after it removed': [deck(INTRO, MOTIVATION, RESULTS, OUTLOOK, QUESTIONS), deck(INTRO, MOTIVATION, RESULTS2, QUESTIONS)],
    'another slide moved to the front': [deck(INTRO, MOTIVATION, RESULTS, OUTLOOK, QUESTIONS), deck(OUTLOOK, INTRO, MOTIVATION, RESULTS2, QUESTIONS)],
  };
  for (const [name, [before, after]] of Object.entries(cases)) {
    await t.test(name, () => {
      const r = move(before, after, [onSlide(before, 'Lower cost'), onElement(before, '<h2>Results'), onElement(before, '<p>Lower')]);
      stays(after, r, 'Fuel use drops', '<h2>Results</h2>', null);
    });
  }
  await t.test('a slide of a picture first, its text rewritten, and another slide edited', () => {
    const before = deck(INTRO, MOTIVATION, ['<img src="a.png">', '<p>Lower cost by a third.</p>'], OUTLOOK, QUESTIONS);
    const after = deck(INTRO2, MOTIVATION, ['<img src="a.png">', '<p>Fuel use drops sharply.</p>'], OUTLOOK, QUESTIONS);
    const r = move(before, after, [onSlide(before, 'Lower cost'), onElement(before, '<img'), onElement(before, '<p>Lower')]);
    stays(after, r, 'Fuel use drops', '<img src="a.png">', null);
  });
  await t.test('a slide of a backdrop first, its text rewritten, and another slide edited', () => {
    const before = deck(INTRO, MOTIVATION, [BACKDROP, ...RESULTS], OUTLOOK, QUESTIONS);
    const after = deck(INTRO2, MOTIVATION, [BACKDROP, ...RESULTS2], OUTLOOK, QUESTIONS);
    const r = move(before, after, [onSlide(before, 'Lower cost'), onElement(before, '<div class="backdrop"'), onElement(before, '<h2>Results'), onElement(before, '<p>Lower')]);
    stays(after, r, 'Fuel use drops', BACKDROP, '<h2>Results</h2>', null);
  });
  await t.test('of three slides of one heading, one removed and one rewritten, the first in order keeps its threads on the rewritten slide', () => {
    const r1 = ['<h2>Results</h2>', '<p>Cost.</p>'];
    const before = deck(INTRO, r1, ['<h2>Results</h2>', '<p>Cost and time.</p>'], ['<h2>Results</h2>', '<p>Cost, time, and risk.</p>'], QUESTIONS);
    const after = deck(INTRO2, r1, ['<h2>Results</h2>', '<p>We also found a family of orbits.</p>'], QUESTIONS);
    const r = move(before, after, [onSlide(before, 'Cost and time'), onElement(before, '<p>Cost and time'), onSlide(before, 'Cost, time')]);
    const slide = slideAround(after, after.indexOf('We also found'));
    assert.deepEqual(r.items[0], { anchor: slide, slide });
    assert.deepEqual(r.items[1].slide, slide);
    assert.equal(r.items[2].anchor, null);
    assert.ok(r.items[2].removed, JSON.stringify(r.items[2]));
  });
});

test('a slide whose first element is rewritten in an operation that edits another slide is removed, although its picture is kept', () => {
  const before = deck(INTRO, MOTIVATION, ['<p>Lower cost by a third.</p>', '<img src="a.png">'], OUTLOOK, QUESTIONS);
  const after = deck(INTRO2, MOTIVATION, ['<p>Fuel use drops sharply.</p>', '<img src="a.png">'], OUTLOOK, QUESTIONS);
  const r = move(before, after, [onSlide(before, 'Lower cost'), onElement(before, '<img')]);
  assert.equal(r.items[0].anchor, null);
  assert.equal(r.items[1].anchor, null);
});
