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
    assert.deepEqual(r.items[0], { anchor: null, slide: null, removed: { text: '<h2>Alpha</h2>' } });
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
  assert.deepEqual(r.items[1], { anchor: null, slide: null, removed: { text: BETA[1] } });
  reads(after, r.items[2].anchor, '<section>\n  <h2>Gamma');
  reads(after, r.items[3].anchor, '<p>The cost');
  reads(after, r.items[3].slide, '<section>\n  <h2>Gamma');
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
