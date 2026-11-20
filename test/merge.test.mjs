// the merge of the edits of the page with a file changed since it was read: the changes of the
// file turn the text that was read into the file, edits and changes in different places are both
// kept, an overlap is a conflict settled by prefer, and another file is not merged. the merge of a
// session keeps two insertions at one point as the authority does, and gives the text of the
// authority for pairs of edits of two people in one paragraph. revert() makes the change of an
// entry of typing again over the edits of other people

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, changes, charEdits, clash, edits, merge, mergeEdits, moves, revert } from '../src/editor/merge.ts';
import { apply as applyPatches, conflict, diff, mergePatches, mergeTexts, shift } from '../src/session/patch.ts';
import { tokenize } from '../src/editor/tokens.ts';

// the merge of a session of the edits ours and all of base, where ours wins at a conflict and all
// comes first at a tie
const session = (base, ours, all, twice = false) => mergeTexts(base, apply(base, all), apply(base, ours), !twice);

const base = ['<section>', '  <h2>One</h2>', '  <p>First slide</p>', '</section>', '<section>', '  <h2>Two</h2>', '  <p>Second slide</p>', '</section>', ''].join('\n');
const at = (text, s) => {
  const i = text.indexOf(s);
  assert.ok(i >= 0 && text.indexOf(s, i + 1) < 0, `${s} is not unique`);
  return i;
};
// an edit of base that replaces old with text
const edit = (old, text) => ({ start: at(base, old), end: at(base, old) + old.length, text });

test('the changes of a file turn base into it, each narrowed to the characters that differ', () => {
  const theirs = base.replace('Second slide', 'Second slide, longer').replace('<h2>One', '<h2>Uno').replace('</section>\n<section>', '</section>\n<section class="new">\n</section>\n<section>');
  const hunks = changes(base, theirs);
  assert.equal(apply(base, hunks), theirs);
  assert.deepEqual(hunks.find((h) => h.text === 'Uno'), { start: at(base, 'One'), end: at(base, 'One') + 3, text: 'Uno' });
  assert.deepEqual(changes(base, base), []);
  // CRLF, a last line without a newline, and a deleted line
  const crlf = base.replace(/\n/g, '\r\n');
  const cut = crlf.replace('  <p>First slide</p>\r\n', '').replace(/\r\n$/, '');
  assert.equal(apply(crlf, changes(crlf, cut)), cut);
});

test('an edit of the page and a change of the file on other slides are both kept', () => {
  const theirs = base.replace('Second slide', 'Second slide, by an agent');
  const ours = [edit('First slide', 'First slide, by hand')];
  const result = merge(base, ours, theirs, 'theirs');
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.text, base.replace('First slide', 'First slide, by hand').replace('Second slide', 'Second slide, by an agent'));
});

test('two texts of one line are merged, since each change is narrowed to its characters', () => {
  const line = '<tr><td>a</td><td>b</td></tr>\n';
  const file = `<table>\n${line}</table>\n`;
  const theirs = file.replace('<td>a</td>', '<td>A</td>');
  const ours = [{ start: file.indexOf('>b<') + 1, end: file.indexOf('>b<') + 2, text: 'B' }];
  const result = merge(file, ours, theirs, 'theirs');
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.text, file.replace('>a<', '>A<').replace('>b<', '>B<'));
});

test('an edit of the text that the file changed too is a conflict, settled by prefer', () => {
  const theirs = base.replace('<h2>Two</h2>', '<h2>Two, by an agent</h2>').replace('First slide', 'First slide, by an agent');
  const ours = [edit('Two', 'Two, by hand'), edit('Second slide', 'Second slide, by hand')];
  const kept = merge(base, ours, theirs, 'ours');
  assert.deepEqual(kept.conflicts, [ours[0]]);
  assert.equal(kept.text, base.replace('Two', 'Two, by hand').replace('Second slide', 'Second slide, by hand').replace('First slide', 'First slide, by an agent'));
  const dropped = merge(base, ours, theirs, 'theirs');
  assert.deepEqual(dropped.conflicts, [ours[0]]);
  assert.equal(dropped.text, theirs.replace('Second slide', 'Second slide, by hand'));
});

test('an insertion of the file where the page replaced a text is a conflict, and an equal change is taken once', () => {
  const p = '  <p>First slide</p>\n';
  const theirs = base.replace(p, `${p}  <p>Inserted</p>\n`);
  const ours = [{ start: at(base, p) + p.length, end: at(base, p) + p.length, text: '  <aside class="notes">Notes</aside>\n' }];
  assert.equal(merge(base, ours, theirs, 'theirs').conflicts.length, 1);
  const same = base.replace('Two', 'Deux');
  assert.deepEqual(merge(base, [edit('Two', 'Deux')], same, 'theirs'), { text: same, conflicts: [] });
});

test('an empty file or another deck is not merged', () => {
  assert.equal(merge(base, [edit('Two', 'Deux')], '', 'theirs'), null);
  const other = Array.from({ length: 40 }, (_, i) => `<section><h2>Other ${i}</h2></section>\n`).join('');
  assert.equal(changes(base, other), null);
});

test('the changes of random edits of a deck turn it into the edited deck', () => {
  let seed = 7;
  const random = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const deck = Array.from({ length: 300 }, (_, i) => `  <p>Line ${i % 37} of the deck</p>\n`).join('');
  for (let round = 0; round < 200; round++) {
    const lines = deck.split('\n');
    for (let k = 1 + random(8); k > 0; k--) {
      const i = random(lines.length);
      const what = random(3);
      if (what === 0) lines.splice(i, 1);
      else if (what === 1) lines.splice(i, 0, `  <p>Inserted ${round}</p>`);
      else lines[i] = lines[i].replace('deck', `deck, edited ${round}`);
    }
    const theirs = lines.join('\n');
    assert.equal(apply(deck, changes(deck, theirs)), theirs);
  }
});

test('revert gives the target when now is the text of the entry, as for a single person', () => {
  assert.equal(revert('Plan the slide. One.', 'Plan the slide.', 'Plan the slide. One.'), 'Plan the slide.');
  assert.equal(revert('Plan the slide.', 'Plan the slide. One.', 'Plan the slide.'), 'Plan the slide. One.');
  assert.equal(revert('Plan', 'Plan', 'Plan'), 'Plan');
});

test('revert keeps an insertion of another person on each side of the span, and moves the span by the one on its left', () => {
  // the person typed "complete ", and another person typed "Now " and "first, "
  const after = 'Design the complete slide, then break it up.';
  const before = 'Design the slide, then break it up.';
  const now = 'Now design the complete slide first, then break it up.';
  assert.equal(revert(after, before, now), 'Now design the slide first, then break it up.');
  assert.equal(revert(after, before, `Look: ${after.replace('slide,', 'slide first,')}`), 'Look: Design the slide first, then break it up.');
});

test('revert removes the letters of the person and keeps the same letter typed next to them by another person', () => {
  // the person typed "aa", and another person typed "a" before the space
  assert.equal(revert('Xa aaY', 'Xa Y', 'Xaa aaY'), 'Xaa Y');
  // the person typed "ab", and another person typed "a" on its left, which the diff of the two
  // texts places between "a" and "b", inside the span of the person
  assert.equal(revert('XabY', 'XY', 'XaabY'), 'XaY');
  // the span of the person is either " and" or "and ", and the two give different texts
  assert.equal(revert('Plan the and slide.', 'Plan the slide.', 'Plan the aand slide.'), null);
});

test('revert finds the span of the person with each &nbsp; read as a space, and keeps an insertion of another person after a space that the browser rewrote', () => {
  // the person typed "ab cd" after the space that follows the code element, which Chrome then wrote as &nbsp;
  const before = 'X <code>x+1</code> slide';
  const after = 'X <code>x+1</code>&nbsp;ab cdslide';
  assert.equal(revert(after, before, 'X <code>x+1</code>&nbsp;qab cdslide'), 'X <code>x+1</code>&nbsp;qslide');
  assert.equal(revert(after, before, 'X <code>x+1</code> qab cdslide'), 'X <code>x+1</code> qslide');
  assert.equal(revert(before, after, 'X <code>x+1</code> qslide'), 'X <code>x+1</code> qab cdslide', 'the redo puts the text of the person back after the insertion on its left');
});

test('revert removes a word typed with a leading space before a space, and refuses rather than moves a space when another person typed at an end of it', () => {
  // the person typed " big" after "Hello", which the two texts also give as "big " after "Hello "
  const before = '<p>Hello world</p>';
  const after = '<p>Hello big world</p>';
  const typed = (q) => revert(after, before, `${after.slice(0, q)}X${after.slice(q)}`);
  assert.equal(typed(after.indexOf(' big')), '<p>HelloX world</p>');
  assert.equal(typed(after.indexOf('world')), '<p>Hello Xworld</p>');
  assert.equal(typed(after.indexOf('</p>')), '<p>Hello worldX</p>');
  // X after the space of the person and X after big are not told apart by the texts
  assert.equal(typed(after.indexOf('big')), null);
  assert.equal(typed(after.indexOf(' world')), null);
  assert.equal(typed(after.indexOf('ig')), null);
});

test('revert refuses when an insertion of another person beside the span can be read as the letters of the person', () => {
  // the person typed "go", and another person typed "go " before it, whose "go" the texts also
  // give as the letters of the person
  assert.equal(revert('<p>Second goslide</p>', '<p>Second slide</p>', '<p>Second go goslide</p>'), null);
  assert.equal(revert('ba', 'a', 'b ba'), null);
  // the person typed "low " before grows, and another person typed " low energy" before it. the
  // texts also give the letters of the person inside " low energy", with "energylow " typed after
  // them. slides() does not refuse it, since " low energy" does not start with the l of low
  assert.equal(revert('low grows quickly', 'grows quickly', ' low energylow grows quickly'), null);
});

test('revert refuses when an edit of another person at an end of the span can be read on the other side of it', () => {
  // the person typed "this", and another person removed an s after it, which the texts also give
  // as the s of the person
  assert.equal(revert('Second thisslide', 'Second slide', 'Second thislide'), null);
  // the person typed "big ", and another person typed " new" after big, which the texts also give
  // as "new " after the space of the person
  assert.equal(revert('Second big slide', 'Second slide', 'Second big new slide'), null);
  // the person typed "aa", and another person typed "a" after it or inside it
  assert.equal(revert('Xa aaY', 'Xa Y', 'Xa aaaY'), null);
});

test('revert gives null for an insertion inside the span that is not beside it, a removal across the span, and too many edits of others', () => {
  assert.equal(revert('Xabc Y', 'X Y', 'XabZc Y'), null, 'an insertion of another person inside the typing');
  assert.equal(revert('X abc Y', 'X  Y', 'X aY'), null, 'a removal across the end of the span');
  assert.equal(revert('X abc Y', 'X  Y', 'Y'), null, 'a removal of the whole span');
  const after = `${'ab'.repeat(600)}Q`;
  assert.equal(revert(after, 'ab'.repeat(600), `${'acb'.repeat(600)}Q`), null, 'six hundred insertions of another person');
  // a long insertion of another person is one edit
  assert.equal(revert(after, 'ab'.repeat(600), `${'z'.repeat(5000)}${after}`), `${'z'.repeat(5000)}${'ab'.repeat(600)}`);
});

test('revert in the direction of a redo puts the text of the person back after an insertion of another person on its left', () => {
  assert.equal(revert('The slide.', 'The complete slide.', 'Look: The slide.'), 'Look: The complete slide.');
  assert.equal(revert('The slide.', 'The complete slide.', 'The slide. More.'), 'The complete slide. More.');
  assert.equal(revert('The slide.', 'The complete slide.', 'The side.'), 'The complete side.');
  assert.equal(revert('The slide.', 'The complete slide.', 'Thlide.'), null, 'a removal across the point of the insertion');
});

test('with apart, two insertions at one point are both kept with theirs first, and an insertion strictly inside a replaced word goes after the new word', () => {
  const base = 'The slide.';
  const ins = (at, text) => ({ start: at, end: at, text });
  const at = base.indexOf('slide');
  assert.equal(session(base, [ins(at, 'ours ')], [ins(at, 'theirs ')]), 'The theirs ours slide.');
  // an insertion at the end and at the start of a range that the other side replaces
  const range = { start: at, end: at + 5, text: 'deck' };
  assert.equal(session(base, [ins(at + 5, '!')], [range]), 'The deck!.');
  assert.equal(session(base, [ins(at, 'new ')], [range]), 'The new deck.');
  const inside = ins(at + 2, 'X');
  assert.equal(session(base, [inside], [range]), 'The deckX.');
  assert.equal(session(base, [range], [inside]), 'The deckX.');
  // without apart, an insertion at one point or at an end of a range is a conflict, as before
  assert.deepEqual(mergeEdits(base, [ins(at, 'ours ')], [ins(at, 'theirs ')], 'ours'), { text: 'The ours slide.', conflicts: [ins(at, 'ours ')] });
  assert.deepEqual(mergeEdits(base, [ins(at + 5, '!')], [range], 'theirs'), { text: 'The deck.', conflicts: [ins(at + 5, '!')] });
});

test('with apart, the edits of each letter keep the keys of two others on both sides of an unread key of the person, which one edit of the line diff drops', () => {
  const from = '<section>\n  <p>one two three</p>\n</section>\n';
  const seen = from.replace('two', 'twoA');
  const text = from.replace('one', 'oneB').replace('three', 'threeC');
  const want = '<section>\n  <p>oneB twoA threeC</p>\n</section>\n';
  assert.equal(edits(from, text).length, 1, 'the line diff gives one edit from B to C');
  assert.equal(mergeTexts(from, text, seen), want);
});

test('with apart, the merge of the page gives the text of the authority, which applies the patches in the order of their arrival', () => {
  let seed = 38;
  const random = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  // an operation of base, i.e. sorted patches that neither overlap nor touch, with texts of letters
  // that the other side does not use, so that no two patches are equal
  const operation = (base, letters, near) => {
    const out = [];
    let at = 0;
    for (let k = 1 + random(3); k > 0 && at <= base.length; k--) {
      const start = near.length && random(2) ? Math.max(at, near[random(near.length)]) : at + random(Math.max(1, base.length - at + 1));
      if (start > base.length) break;
      const end = Math.min(base.length, start + (random(2) ? 0 : random(4)));
      out.push({ start, end, text: Array.from({ length: random(3) + (end === start ? 1 : 0) }, () => letters[random(letters.length)]).join('') });
      at = end + 1;
    }
    return out;
  };
  let cases = 0;
  for (let round = 0; round < 3000; round++) {
    const base = Array.from({ length: 4 + random(12) }, () => 'xyz'[random(3)]).join('');
    const theirs = operation(base, 'AB', []);
    // the patches of ours start at the points and the ends of the patches of theirs as often as not
    const ours = operation(base, 'cd', theirs.flatMap((p) => [p.start, p.end]));
    for (const o of ours) for (const h of theirs) assert.equal(clash(o, h), conflict(o, h), `clash and conflict of ${JSON.stringify(o)} and ${JSON.stringify(h)}`);
    // the authority gets the patches that a page sends, i.e. the diff of its text
    const t = diff(base, applyPatches(base, theirs)), o = diff(base, applyPatches(base, ours));
    const moved = shift(o, t, true);
    if (!moved) continue;
    cases += 1;
    const authority = applyPatches(applyPatches(base, t), moved);
    assert.equal(session(base, ours, theirs), authority, `base ${JSON.stringify(base)}, ours ${JSON.stringify(ours)}, theirs ${JSON.stringify(theirs)}`);
  }
  assert.ok(cases > 1000, `${cases} pairs of operations that the authority accepts`);
});

test('a change within one line gives the edit of the line diff, more than half removed gives null, and a change across lines is left to the line diff', () => {
  let seed = 11;
  const random = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const deck = Array.from({ length: 60 }, (_, i) => `  <p>Line ${i % 7} of a slide, with a word</p>\n`).join('');
  for (let round = 0; round < 300; round++) {
    const at = random(deck.length);
    const end = Math.min(deck.length, at + random(6));
    const text = Array.from({ length: random(4) }, () => 'aeiow '[random(6)]).join('');
    if (deck.slice(at, end).includes('\n')) continue;
    const theirs = deck.slice(0, at) + text + deck.slice(end);
    const fast = changes(deck, theirs);
    assert.equal(apply(deck, fast), theirs);
    assert.ok(fast.length <= 1, `one edit for a change within one line, at ${at}`);
    // a new first line puts a newline into the part that differs, and the line diff then gives the
    // same edit for a change of another line
    if (at <= deck.indexOf('\n')) continue;
    const lines = changes(deck, `  <p>A new line</p>\n${theirs}`);
    assert.deepEqual(lines.slice(1), fast, `the edit of the line diff at ${at}`);
  }
  assert.equal(changes('  <p>A paragraph of one line</p>\n', '  <p>A</p>\n'), null);
  const two = changes(deck, deck.replace('Line 1 of', 'Line one of').replace('Line 5 of', 'Line five of'));
  assert.deepEqual(two.map((e) => e.text), ['one', 'five']);
});

// pairs of edits of two people in one paragraph: the paragraph before, the unread edit of the
// person, and the edit of the others that arrives first. the merge of an apply in a session, as
// turn() of session.ts makes it, gives the text that the authority makes of the two operations, or
// else, where the authority refuses the second, the text that the replica of its page merges
const PAIRS = [
  ['<p>Second slide</p>', '<p>Second Zslide</p>', '<p>Second <strong>slide</strong></p>'],
  ['<p>Second slide</p>', '<p>Second Zslide</p>', '<p>Second <em>slide</em></p>'],
  ['<p>Second slide</p>', '<p>Second slideZ</p>', '<p>Second <em>slide</em></p>'],
  ['<p>Second slide</p>', '<p>Second slZide</p>', '<p>Second <a href="https://x.org">slide</a></p>'],
  ['<p>Second strong slide</p>', '<p>Second Zstrong slide</p>', '<p>Second <strong>strong</strong> slide</p>'],
  ['<p>Second me slide</p>', '<p>Second mZe slide</p>', '<p>Second <em>me</em> slide</p>'],
  ['<p>Second em slide</p>', '<p>Second Zem slide</p>', '<p>Second <em>em</em> slide</p>'],
  ['<p>Second em slide</p>', '<p>Second emZ slide</p>', '<p>Second <em>em</em> slide</p>'],
  ['<p>Second slide</p>', '<p>Second <strong>slide</strong></p>', '<p>Second <em>slide</em></p>'],
  ['<p>Second slide</p>', '<p>Second <strong>slide</strong></p>', '<p>Second <strong>slide</strong></p>'],
  ['<p>Second <em>em</em></p>', '<p>Second em</p>', '<p>Second <em>eZm</em></p>'],
  ['<p>Second slide</p>', '<p>Second&amp; slide</p>', '<p>SecondZ slide</p>'],
  ['<p>Second cat</p>', '<p>Second c&amp;t</p>', '<p>Second caZt</p>'],
  ['<p>Second slide</p>', '<p>Second s&lt;ide</p>', '<p>Second slZide</p>'],
  ['<p>Second cat</p>', '<p>Second ca&lt;</p>', '<p>Second catZ</p>'],
  ['<p>Second slide</p>', '<p>Second &nbsp;slide</p>', '<p>Second sZlide</p>'],
  ['<p>Second \u{1F600} slide</p>', '<p>Second \u{1F600}\u{1F601} slide</p>', '<p>Second \u{1F600}\u{1F602} slide</p>'],
  ['<p>Second \u{1F600} slide</p>', '<p>Second \u{1F601} slide</p>', '<p>Second \u{1F600}Z slide</p>'],
  ['<p>Second \u{1F600} slide</p>', '<p>Second \u{1F601} slide</p>', '<p>Second \u{1F602} slide</p>'],
  ['<p>Second slide</p>', '<p>Second slid\u00e9</p>', '<p>Second slideZ</p>'],
  ['<p>Second slide</p>', '<p>Second</p><p> slide</p>', '<p>Second</p><p> slide</p>'],
  ['<p>Second slide</p>', '<p>Se</p>', '<p>Second slZide</p>'],
  ['<p>Second slide</p>', '<p>Second deck</p>', '<p>Second page</p>'],
  ['<p>Second slide</p>', '<p>Second side</p>', '<p>Second slice</p>'],
  ['<p>Second it</p>', '<p>Second <strong>it</strong></p>', '<p>Second Zit</p>'],
  ['<p>Second it</p>', '<p>Second Zit</p>', '<p>Second <em>it</em></p>'],
  ['<p>Second i x</p>', '<p>Second iZ x</p>', '<p>Second <em>i</em> x</p>'],
  ['<p>Second a x</p>', '<p>Second Za x</p>', '<p>Second <a href="u">a</a> x</p>'],
  ['<p>Second s x</p>', '<p>Second sZ x</p>', '<p>Second <strong>s</strong> x</p>'],
  ['<p>Second co x</p>', '<p>Second cZo x</p>', '<p>Second <code>co</code> x</p>'],
];

test('the merge of an apply in a session gives the text of the authority for pairs of edits of two people in one paragraph', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  for (const [p0, ps, pt] of PAIRS) {
    const f = wrap(p0), s = wrap(ps), t = wrap(pt);
    const page = mergeTexts(f, t, s);
    const moved = shift(diff(f, s), diff(f, t), true);
    const authority = moved ? applyPatches(t, moved) : applyPatches(f, mergePatches(diff(f, t), diff(f, s), 'ours', f).patches);
    assert.equal(page, authority, `${ps} over ${pt}`);
  }
});

// the text with a key K after the tenth letter of its paragraph
const keyed = (text) => text.replace(/(<p>|^)([^<]{10})/, '$1$2K');
const PROSE = 'The spacecraft leaves the halo orbit near the second Lagrange point and follows the stable manifold toward the Moon. ';
const PARA = 'A low energy transfer from the Earth to the Moon uses the manifolds of the halo orbits of L1 and L2. '.repeat(3).slice(0, 300);

test('the merge of an apply in a session keeps a long paste of one person and a key of a third person around an unread key of the person', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const rep = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
  const words = (n) => Array.from({ length: n }, (_, i) => `w${i % 97}`).join(' ') + ' ';
  // the paragraph, the offset of the unread key A of the person, and the paste of another person at
  // its start, which arrives with the key C of a third person at its end
  const CASES = [
    ['Second slide', 6, rep('x', 499)],
    ['Second slide', 6, rep('x', 501)],
    ['Second slide', 6, rep('x', 5000)],
    ['Second slide', 6, rep('abc ', 600)],
    ['Second slide', 6, words(249)],
    ['Second slide', 6, words(251)],
    ['Second slide', 6, words(400)],
    ['Secondslide', 6, rep('x', 600)],
    ['今天我们讨论轨道', 4, rep('天地玄黄宇宙洪荒', 499)],
    ['今天我们讨论轨道', 4, rep('天地玄黄宇宙洪荒', 600)],
    ['今日は軌道について話します', 6, rep('いろはにほへと', 600)],
    ['今天 我们 讨论 轨道', 5, rep('天地玄黄宇宙洪荒', 600)],
    // the largest paste into a paragraph of 300 characters below the cap of anchored()
    [PARA, 150, rep(PROSE, 3194)],
    // pastes over this cap, around the paragraph whole
    [PARA, 150, rep(PROSE, 4000)],
    [rep(PARA, 1000), 500, rep(PROSE, 1000)],
    // the paste starts with the first word of the paragraph and holds its next letter o long before
    // the longest run "orbit is stable"
    ['The orbit is stable', 13, rep(PROSE, 1200)],
  ];
  const lost = CASES.filter(([para, at, paste]) => {
    const f = wrap(`<p>${para}</p>`);
    const s = wrap(`<p>${para.slice(0, at)}A${para.slice(at)}</p>`);
    const t = wrap(`<p>${paste}${para}C</p>`);
    return mergeTexts(f, t, s) !== wrap(`<p>${paste}${para.slice(0, at)}A${para.slice(at)}C</p>`);
  });
  assert.deepEqual(lost.map(([para, , paste]) => `${paste.slice(0, 8)}… of ${paste.length} into ${para}`), []);
});

test('the merge of an apply in a session keeps a long deletion of one person before the paragraph and one of a third person after it around an unread key of the person', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const rep = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
  const para = rep(PARA, 1000), before = rep(PROSE, 1100), after = rep('Another sentence that a third person deletes. ', 1100);
  const f = wrap(`<p>${before}${para}${after}</p>`), t = wrap(`<p>${para}</p>`);
  const s = wrap(`<p>${before}${para.slice(0, 500)}A${para.slice(500)}${after}</p>`), want = wrap(`<p>${para.slice(0, 500)}A${para.slice(500)}</p>`);
  assert.equal(mergeTexts(f, t, s), want);
  assert.equal(mergeTexts(f, s, t), want);
});

// the longest runs in common of the paragraph and the new text are "econd " of the paste and
// " slide", and after the first of them the parts differ in more than 500 units
test('the merge of an apply in a session keeps a paste of prose over the first word and a key of a third person around an unread key of the person in the next word', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const paste = PROSE.repeat(6).slice(0, 600);
  const f = wrap('<p>Second slide</p>'), s = wrap('<p>Second slAide</p>'), t = wrap(`<p>${paste} slideC</p>`);
  assert.equal(mergeTexts(f, t, s), wrap(`<p>${paste} slAideC</p>`));
});

test('the merge of an apply in a session keeps a long paste and a phrase of a third person that replaces the last word around an unread key of the person', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const phrase = ' leaves the orbit of the halo near the Moon on the stable manifold of the halo orbit at L2 for good';
  const paste = PROSE.repeat(11).slice(0, 1200);
  const f = wrap('<p>Second slide</p>'), s = wrap('<p>SecAond slide</p>'), t = wrap(`<p>${paste}Second${phrase}</p>`);
  assert.equal(mergeTexts(f, t, s), wrap(`<p>${paste}SecAond${phrase}</p>`));
});

// the paste leaves few cells to the parts after the run in common, and the part around the key
// differs in more than 50 units
test('the merge of an apply in a session keeps a long paste and two phrases of a third person replaced on both sides of an unread key of the person', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const rep = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
  const paste = rep(PROSE, 3194), rest = PARA.slice('A low energy transfer from the Earth to the Moon uses the manifolds of'.length);
  const f = wrap(`<p>${PARA}</p>`), s = wrap(`<p>${PARA.replace(' to ', ' tAo ')}</p>`);
  const t = wrap(`<p>${paste}A low energy the spacecraft on the stable manifold to the unstable manifold${rest}</p>`);
  assert.equal(mergeTexts(f, t, s), wrap(`<p>${paste}A low energy the spacecraft on the stable manifold tAo the unstable manifold${rest}</p>`));
});

test('the merge of a paste far over the cells of the search for a run in common and a key of another person costs no more than a paste at the cap', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const rep = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
  const cost = (n) => {
    const f = wrap(`<p>${PARA}</p>`), t = wrap(`<p>${rep(PROSE, n)}${PARA}C</p>`), s = keyed(f);
    mergeTexts(f, t, s);
    const times = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      mergeTexts(f, t, s);
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b)[3];
  };
  // one letter of the paste differs from the paragraph, so that the search of the paragraph in the
  // paste does not find it, and the paste fills the cells of the search for a run in common
  const cap = () => {
    const f = wrap(`<p>${PARA}</p>`), t = wrap(`<p>${rep(PROSE, 3_194)}${PARA.replace('Earth', 'earth')}C</p>`), s = keyed(f);
    mergeTexts(f, t, s);
    const times = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      mergeTexts(f, t, s);
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b)[3];
  };
  let ratio = Infinity;
  for (let i = 0; i < 3 && ratio >= 4; i++) ratio = cost(55_000) / cap();
  assert.ok(ratio < 4, `a paste of 55,000 characters costs ${ratio.toFixed(1)} times one of 3,194 at the cap`);
});

// the diff reads the deletion of 'le stab' in 'unstable stable' as a deletion of 'stable ', which
// holds the insertion two letters after it
test('the merge of an apply in a session keeps an insertion of another person two letters after an unread deletion of the person whose letters repeat after it', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  const f = wrap('toward unstable stable point'), s = wrap('toward unstable point'), t = wrap('toward unstable stablexyz point');
  assert.equal(mergeTexts(f, t, s), wrap('toward unstablexyz point'));
  assert.equal(mergeTexts(f, s, t), wrap('toward unstablexyz point'));
});

// each deletion of the person holds an insertion X of another person. it is moved over letters
// that repeat to the left or to the right of X, unless the letters differ or the move would hold
// another edit. X is otherwise put at the end of the deletion, and two deletions that overlap stay a
// conflict
test('the merge of an apply in a session moves a deletion off an insertion of another person to a side where the letters repeat and no other edit is held, and otherwise puts the insertion at the end of the deletion', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  for (const [p, mine, others, want, unread] of [
    ['go go go', [[0, 3, '']], [[1, 1, 'X']], 'gXo go'],
    ['go gut', [[0, 3, '']], [[1, 1, 'X']], 'gXut'],
    ['go go go', [[5, 8, '']], [[7, 7, 'X']], 'go gXo'],
    ['go go go', [[5, 8, '']], [[6, 6, 'X']], 'go Xgo'],
    ['go go go', [[0, 3, '']], [[0, 0, 'X'], [1, 1, 'Y']], 'XgYo go'],
    ['go go go', [[3, 6, '']], [[2, 2, 'Y'], [4, 4, 'X']], 'goY gXo'],
    ['xo go', [[2, 5, '']], [[3, 3, 'X']], 'xoX'],
    ['go go go', [[0, 3, '']], [[1, 1, 'X'], [2, 2, 'Y']], 'gXoY go'],
    ['go go go', [[0, 3, ''], [4, 4, 'Z']], [[2, 2, 'X']], 'gZoX go'],
    ['go go go', [[5, 8, ' to']], [[7, 7, 'X']], 'go go tXo'],
    ['go go go', [[5, 8, '']], [[7, 8, '']], 'go go', 'go go g'],
  ]) {
    const f = wrap(p), at = f.indexOf(p);
    const edits = (list) => list.map(([start, end, text]) => ({ start: at + start, end: at + end, text }));
    assert.equal(session(f, edits(mine), edits(others), true), wrap(want), `${p} ${JSON.stringify(mine)}`);
    assert.equal(session(f, edits(others), edits(mine), true), wrap(unread ?? want), `${p} ${JSON.stringify(mine)} unread`);
  }
});

// the letters that repeat at the ends of each deletion are the ; of a reference before it, the >
// of the start tag before it, or the &a of a reference after it. a literal & or > is kept as the
// file has it, e.g. one written by an agent
test('the merge of an apply in a session does not move a deletion off an insertion of another person into a tag or a character reference, and puts the insertion at the end of the deletion', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  for (const [p0, ps, pt, want] of [
    ['for i &lt;n; i++', 'for i &lt; i++', 'for i &lt;nm; i++', 'for i &lt;m i++'],
    ['R&amp;D; costs', 'R&amp; costs', 'R&amp;DX; costs', 'R&amp;X costs'],
    ['Oui&nbsp;x; non', 'Oui&nbsp; non', 'Oui&nbsp;xy; non', 'Oui&nbsp;y non'],
    ['x> y', ' y', 'xX> y', 'X y'],
  ]) {
    const f = wrap(p0), s = wrap(ps), t = wrap(pt);
    assert.equal(mergeTexts(f, t, s), wrap(want), `${pt} over ${ps}`);
    assert.equal(mergeTexts(f, s, t), wrap(want), `${pt} over ${ps} unread`);
  }
});

// the other person also deletes a letter of the word, which clashes with the deletion of the page
test('the merge of an apply in a session keeps a paste, a word, or an Enter of another person right beside a word that the page deleted', () => {
  const page = (from, seen, text) => mergeTexts(from, text, seen);
  assert.equal(page('<p>Second item</p>', '<p>Second </p>', '<p>Second brand new iem</p>'), '<p>Second brand new </p>');
  assert.equal(page('<p>Second item here</p>', '<p>Second  here</p>', '<p>Second iem, brand new here</p>'), '<p>Second , brand new here</p>');
  assert.equal(page('<p>Second item</p>', '<p>Second </p>', '<p>Second iem</p><p></p>'), '<p>Second </p><p></p>');
});

test('the merge of an apply in a session keeps the edits of letters of one word by two people that do not clash', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  const f = wrap('Second slide');
  assert.equal(mergeTexts(f, wrap('Second slice'), wrap('Second side')), wrap('Second sice'));
  // and so does the merge of a file
  const g = wrap('First slide here'), l = g.indexOf('slide') + 1;
  const page = [{ start: l, end: l + 1, text: 'L' }], file = [{ start: l, end: l + 1, text: 'X' }, { start: l + 3, end: l + 4, text: 'E' }];
  assert.equal(mergeEdits(g, page, file, 'ours').text, wrap('First sLidE here'));
});

test('the merge of an apply in a session keeps whole the word of one of two people who type over the same letters of a word, in both orders', () => {
  const wrap = (p) => `<section>\n  <p>${p}</p>\n</section>\n`;
  const f = wrap('a slide b');
  for (const [theirs, ours] of [['a deck b', 'a slime b'], ['a slime b', 'a deck b'], ['a deck b', 'a sXde b'], ['a sXde b', 'a deck b']]) {
    assert.equal(mergeTexts(f, wrap(theirs), wrap(ours)), wrap(ours), `${ours} over ${theirs}`);
  }
});

test('the merge of an apply in a session keeps the tags balanced when one person takes a format off a word and another types in it with the format off, with the text of the person who wins, in both orders', () => {
  const wrap = (p) => `<section>\n  <p>${p}</p>\n</section>\n`;
  for (const [open, close] of [['<em>', '</em>'], ['<a href="https://x.org/">', '</a>']]) {
    const f = wrap(`a ${open}word${close} b`), off = wrap('a word b'), typed = wrap(`a ${open}wo${close}X${open}rd${close} b`);
    assert.equal(mergeTexts(f, off, typed), typed, `${typed} over ${off}`);
    assert.equal(mergeTexts(f, typed, off), off, `${off} over ${typed}`);
  }
});

// a paragraph of words, some in italic or bold, and the edits of one person on words of it: letters
// typed over, a key, a format taken off or put on, a key typed with the format off, or a word removed
function wordRound(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n), pick = (list) => list[int(list.length)];
  const letters = () => Array.from({ length: 1 + int(3) }, () => pick(['X', 'Y', 'q', 'z'])).join('');
  const words = Array.from({ length: 4 + int(3) }, () => {
    const tag = next() < 0.4 ? pick(['em', 'strong']) : '';
    return { pre: tag && `<${tag}>`, text: pick(['orbit', 'moon', 'halo', 'data', 'method', 'slide']), post: tag && `</${tag}>` };
  });
  const render = (list) => list.map((w) => w.pre + w.text + w.post).filter(Boolean).join(' ');
  const person = () => {
    const out = words.map((w) => ({ ...w }));
    for (const at of new Set(Array.from({ length: 1 + int(2) }, () => int(out.length)))) {
      const w = out[at], n = w.text.length, i = int(n), kind = pick(['over', 'key', 'off', 'on', 'plain', 'delete']);
      if (kind === 'over') w.text = w.text.slice(0, i) + letters() + w.text.slice(i + 1 + int(n - i));
      else if (kind === 'key') w.text = w.text.slice(0, i) + letters()[0] + w.text.slice(i);
      else if (kind === 'off') w.pre = w.post = '';
      else if (kind === 'on' && !w.pre) [w.pre, w.post] = ['<em>', '</em>'];
      else if (kind === 'plain' && w.pre && i > 0) w.text = w.text.slice(0, i) + w.post + letters() + w.pre + w.text.slice(i);
      else if (kind === 'delete') w.pre = w.text = w.post = '';
    }
    return render(out);
  };
  return [render(words), person(), person()];
}

// whether each end tag of text closes the last element left open, and none is left open
function balanced(text) {
  const open = [];
  for (const t of tokenize(text)) {
    if (t.type === 'start') open.push(t.name);
    else if (t.type === 'end' && open.pop() !== t.name) return false;
  }
  return !open.length;
}

test('random edits of two people in the words of one paragraph, with formats put on and taken off, merge into balanced tags in both orders', () => {
  const wrap = (p) => `<section>\n  <p>${p}</p>\n</section>\n`;
  const failed = [];
  for (let seed = 1; seed <= 2000; seed++) {
    const [base, one, two] = wordRound(seed).map(wrap);
    for (const [theirs, ours] of [[one, two], [two, one]]) {
      const merged = mergeTexts(base, theirs, ours);
      if (!balanced(merged)) failed.push(`seed ${seed}: ${merged.split('\n')[1].trim()}`);
    }
  }
  assert.deepEqual(failed.slice(0, 5), [], `${failed.length} merges failed`);
});

// x interleaves 40 distinct letters with U, and y the same letters with V, followed by 500 V. each
// part between two runs in common has sides of over 500 units that charEdits() cannot diff
test('the merge of a chain of parts that the Myers algorithm cannot diff and a key of another person costs no more than a paste at the cap', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const rep = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
  const median = (f, t) => {
    const s = keyed(f);
    mergeTexts(f, t, s);
    const times = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      mergeTexts(f, t, s);
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b)[3];
  };
  const letters = Array.from({ length: 40 }, (_, i) => String.fromCharCode(0x4e00 + i));
  const chain = () => median(wrap(`<p>${letters.join('U')}U</p>`), wrap(`<p>${letters.join('V')}V${'V'.repeat(500)}</p>`));
  // one letter of the paste differs from the paragraph, so that the search of the paragraph in the
  // paste does not find it, and the paste fills the cells of anchored()
  const cap = () => median(wrap(`<p>${PARA}</p>`), wrap(`<p>${rep(PROSE, 3_194)}${PARA.replace('Earth', 'earth')}C</p>`));
  let ratio = Infinity;
  for (let i = 0; i < 3 && ratio >= 4; i++) ratio = chain() / cap();
  assert.ok(ratio < 4, `the chain costs ${ratio.toFixed(1)} times a paste of 3,194 characters`);
});

// a paste of a run of a is broken by a b at each end, so that neither side holds the other
test('the merge of a paste into a paragraph of 32,000 units of a short period and a key of another person costs no more than a paste at the cap', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  const rep = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
  const median = (f, t) => {
    const s = keyed(f);
    mergeTexts(f, t, s);
    const times = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      mergeTexts(f, t, s);
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b)[3];
  };
  const cap = () => median(wrap(PARA), wrap(`${rep(PROSE, 3_194)}${PARA.replace('Earth', 'earth')}C`));
  const m = 32_000;
  for (const [unit, q] of [['a', `b${'a'.repeat(m - 2)}b`], ['- ', rep(' -', m)], ['&nbsp;', rep('nbsp;&', m)]]) {
    const p = rep(unit, m);
    const a = wrap(p), b = wrap('Z' + p.slice(0, m / 2) + q + p.slice(m / 2) + 'Y');
    let ratio = Infinity, ms = 0;
    for (let i = 0; i < 3 && ratio >= 4; i++) {
      ms = median(a, b);
      ratio = ms / cap();
    }
    assert.ok(ratio < 4, `${JSON.stringify(unit)}: ${ms.toFixed(1)} ms, ${ratio.toFixed(1)} times a paste of 3,194 characters`);
  }
});

// the paste conflicts with the key, hence mergePatches() reads the patch of the paste finer, and
// checks whether it keeps the letters that it replaces
test('mergePatches() of a paste into a paragraph of 32,000 units of a short period and a key of another person costs no more than a paste at the cap of anchored()', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  const rep = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
  const median = (f) => {
    f();
    const times = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      f();
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b)[3];
  };
  const cap = () => median(() => mergeTexts(wrap(PARA), wrap(`${rep(PROSE, 3_194)}${PARA.replace('Earth', 'earth')}C`), keyed(wrap(PARA))));
  const m = 32_000;
  for (const [unit, q] of [['a', `b${'a'.repeat(m - 2)}b`], ['- ', rep(' -', m)]]) {
    const p = rep(unit, m);
    const a = wrap(p), b = wrap('Z' + p.slice(0, m / 2) + q + p.slice(m / 2) + 'Y'), c = wrap(p.slice(0, 10) + 'K' + p.slice(10));
    const theirs = diff(a, b), ours = diff(a, c);
    let ratio = Infinity, ms = 0;
    for (let i = 0; i < 3 && ratio >= 4; i++) {
      ms = median(() => mergePatches(theirs, ours, 'ours', a));
      ratio = ms / cap();
    }
    assert.ok(ratio < 4, `${JSON.stringify(unit)}: ${ms.toFixed(1)} ms, ${ratio.toFixed(1)} times a paste of 3,194 characters`);
  }
});

// the paragraph starts with a run of a, and the paste ends with one more a, hence the search of the
// paragraph in the new text matches one unit early first
test('the merge of a paste above the cells of the search for a run in common, which ends with the letter of a run at the start of the paragraph, keeps the paste as an insertion before a key of another person', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  const rep = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
  const p = 'a'.repeat(40) + 'b ' + rep(PROSE, 2400);
  const a = wrap(p), b = wrap(rep(PROSE.toUpperCase(), 700) + 'a' + p + 'Y');
  assert.equal(mergeTexts(a, b, keyed(a)), wrap(rep(PROSE.toUpperCase(), 700) + 'a' + keyed(p) + 'Y'));
});

test('with twice, the same letter typed at one point by two people is kept twice, and the same replacement of a word by two people once', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const twice = (p0, ps, pt) => {
    const f = wrap(p0), s = wrap(ps), t = wrap(pt);
    return mergeTexts(f, t, s);
  };
  assert.equal(twice('<p>Second slide</p>', '<p>Seconde slide</p>', '<p>Seconde slide</p>'), wrap('<p>Secondee slide</p>'));
  // the diff turns slide into deck as a removal of sli and an insertion of ck, which are one change
  assert.equal(twice('<p>Second slide</p>', '<p>Second deck</p>', '<p>Second deck</p>'), wrap('<p>Second deck</p>'));
  assert.equal(twice('<p>Second teh slide</p>', '<p>Second the slide</p>', '<p>Second the slide</p>'), wrap('<p>Second the slide</p>'));
  // two equal insertions, of which the first is not a removal
  assert.equal(twice('<p>Second slide</p>', '<p>(Second slide)</p>', '<p>(Second slide)</p>'), wrap('<p>(Second slide)</p>'));
});

// fine() reads the removal of a format as the start tag with the first letter replaced by this
// letter, which clashes with a deletion of the letter
test('the merge of an apply in a session takes a format off a word or changes it, and deletes the first letter of the word that another person deleted, as the replica does', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  for (const [p0, off, cut, want] of [
    ['the <em>moon</em> here', 'the moon here', 'the <em>oon</em> here', 'the oon here'],
    ['orbit &amp; <strong>table</strong> slide loop', 'orbit &amp; table slide loop', 'orbit &amp; <strong>able</strong> slide loop', 'orbit &amp; able slide loop'],
    ['see <a href="https://x.org/">table</a> here', 'see table here', 'see <a href="https://x.org/">able</a> here', 'see able here'],
    ['the <em>moon</em> here', 'the <strong>moon</strong> here', 'the <em>oon</em> here', 'the <strong>oon</strong> here'],
  ]) {
    const f = wrap(p0), s = wrap(off), t = wrap(cut);
    assert.equal(mergeTexts(f, t, s), wrap(want), `${off} over ${cut}`);
    assert.equal(mergeTexts(f, s, t), wrap(want), `${cut} over ${off}`);
    assert.equal(applyPatches(f, mergePatches(diff(f, t), diff(f, s), 'ours', f).patches), wrap(want), `replica ${cut} over ${off}`);
  }
});

test('the merge of an apply in a session keeps a key of another person inside a word whose bold the person removes', () => {
  // the authority takes the removal of both tags as one patch over the word, which drops the key
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const f = wrap('<p>Second <strong>slide</strong></p>'), s = wrap('<p>Second slide</p>');
  for (const [pt, want] of [['<p>Second <strong>sliZde</strong></p>', '<p>Second sliZde</p>'], ['<p>Second <strong>slideZ</strong></p>', '<p>Second slideZ</p>']]) {
    assert.equal(mergeTexts(f, wrap(pt), s), wrap(want));
  }
});

test('the merge of an apply in a session keeps a format that one person puts around a word and the plain edits of another person inside the word, in both orders', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const f = wrap('<p>Second slide</p>');
  // the unread edit of the person is the format and the edit of the other comes with the apply, and
  // the other way around
  const both = (formatted, typed) => {
    const s = wrap(`<p>Second ${formatted}</p>`), t = wrap(`<p>Second ${typed}</p>`);
    return [mergeTexts(f, t, s), mergeTexts(f, s, t)];
  };
  for (const [open, close] of [['<em>', '</em>'], ['<a href="https://example.org">', '</a>'], ['<strong><em>', '</em></strong>']]) {
    const formatted = `${open}slide${close}`;
    for (const [typed, want] of [
      // a key inside the word, two keys, a removed letter, a character reference, and other letters
      ['slZide', `${open}slZide${close}`],
      ['sZlidYe', `${open}sZlidYe${close}`],
      ['slid', `${open}slid${close}`],
      ['sl&amp;ide', `${open}sl&amp;ide${close}`],
      ['XY', `${open}XY${close}`],
      // a key at the start of the word goes before the new element, and one at its end after it
      ['Zslide', `Z${formatted}`],
      ['slideZ', `${formatted}Z`],
    ]) {
      const kept = wrap(`<p>Second ${want}</p>`);
      assert.deepEqual(both(formatted, typed), [kept, kept], `${formatted} and ${typed}`);
    }
  }
  // a word that the other person removed, and a format of the other person inside the word, are
  // not plain edits inside it, hence the edit of the person is kept alone
  for (const other of ['', 's<strong>li</strong>de', '<strong>slide</strong>']) {
    assert.deepEqual(both('<em>slide</em>', other), [wrap('<p>Second <em>slide</em></p>'), wrap(`<p>Second ${other}</p>`)], `<em>slide</em> and ${other}`);
  }
});

test('the merge of an apply in a session keeps a format with keys of its own side in or beside its word, the removal of a format, and the keys of another person inside the word', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>Second ${p}</p>\n</section>\n`;
  const merged = (before, mine, others) => {
    const f = wrap(before);
    return mergeTexts(f, wrap(others), wrap(mine));
  };
  // the unread key Z of the page, and a format of the others with a key of theirs in the word,
  // after it, or before it
  for (const [others, want] of [
    ['<em>sYlide</em>', '<em>sYlZide</em>'],
    ['<em>slYide</em>', '<em>slYZide</em>'],
    ['<em>slide</em>s', '<em>slZide</em>s'],
    ['<em>slides</em>', '<em>slZides</em>'],
    ['<a href="https://example.org">slide</a>C', '<a href="https://example.org">slZide</a>C'],
    ['Q<strong>slide</strong>', 'Q<strong>slZide</strong>'],
  ]) {
    assert.equal(merged('slide', 'slZide', others), wrap(want), others);
    assert.equal(merged('slide', others, 'slZide'), wrap(want.replace('YZ', 'ZY')), `${others} unread`);
  }
  // the removal of a format and a key of another person inside its word
  assert.equal(merged('<em>slide</em>', 'slide', '<em>slZide</em>'), wrap('slZide'));
  assert.equal(merged('<em>slide</em>', '<em>slZide</em>', 'slide'), wrap('slZide'));
  // a word in italic typed over, and a key of another person at the start of the word
  for (const [typed, want] of [['XY', 'ZXY'], ['deck', 'Zdeck']]) {
    assert.equal(merged('<em>slide</em>', typed, '<em>Zslide</em>'), wrap(want), typed);
    assert.equal(merged('<em>slide</em>', '<em>Zslide</em>', typed), wrap(want), `${typed} unread`);
  }
  // a link with > in its address put around a run that holds a tag, and a key of another person in the run
  const link = '<a href="https://x.org/?q=a>b">';
  assert.equal(merged('s<strong>li</strong>de', `${link}s<strong>li</strong>de</a>`, 'sZ<strong>li</strong>de'), wrap(`${link}sZ<strong>li</strong>de</a>`));
  assert.equal(merged('s<strong>li</strong>de', 'sZ<strong>li</strong>de', `${link}s<strong>li</strong>de</a>`), wrap(`${link}sZ<strong>li</strong>de</a>`));
  // a removal that crosses the start or the end of the word stays a conflict, which the page wins
  const here = (p) => `<section>\n  <p>${p}</p>\n</section>\n`;
  for (const other of ['Secondlide here', 'Second slidhere']) {
    const f = here('Second slide here'), em = here('Second <em>slide</em> here');
    assert.equal(mergeTexts(f, here(other), em), em, other);
    assert.equal(mergeTexts(f, em, here(other)), here(other), `${other} unread`);
  }
});

test('a vertical stack moved before three slides is the move of the stack, and a key in one of these slides merges with it without a conflict', () => {
  const top = (n) => `<section>\n  <h2>Top ${n}</h2>\n  <p>Words of top ${n}</p>\n  <p>More of top ${n}</p>\n  <p>End of top ${n}</p>\n</section>\n`;
  const inner = (n) => `  <section>\n    <h2>Inner ${n}</h2>\n    <p>Words of inner ${n}</p>\n    <p>End of inner ${n}</p>\n  </section>\n`;
  const stack = `<section>\n${inner(1)}${inner(2)}</section>\n`;
  const deck = top(1) + top(2) + top(3) + stack, moved = stack + top(1) + top(2) + top(3);
  const found = changes(deck, moved);
  assert.equal(apply(deck, found), moved);
  assert.ok(found.every((e) => !deck.slice(e.start, e.end).includes('Top')), 'a slide that the stack passes is read as moved');
  const typed = deck.replace('More of top 2', 'More of top 2 by Bob');
  for (const prefer of ['ours', 'theirs']) assert.deepEqual(merge(deck, changes(deck, typed), moved, prefer), { text: moved.replace('More of top 2', 'More of top 2 by Bob'), conflicts: [] }, prefer);
});

test('keys of another person on both sides of an unread key are kept when the received text also moves a letter, a word, a paragraph, or a slide', () => {
  const from = ['<section>', '  <h2>Cats</h2>', '  <p>one two three</p>', '  <p>Spacer</p>', '  <p>The cats sleep</p>', '  <p>Spacer two</p>', '  <p>A dog barks</p>', '</section>', ''].join('\n');
  const seen = from.replace('two three', 'twoA three');
  const keys = from.replace('one', 'oneB').replace('three', 'threeC');
  for (const [how, text] of [['a letter', keys.replace('cats', 'cat').replace('dog barks', 'dogs barks')], ['a word', keys.replace('The cats sleep', 'The cats').replace('A dog barks', 'A dog barks sleep')], ['a paragraph', keys.replace('  <p>Spacer two</p>\n', '').replace('</section>', '  <p>Spacer two</p>\n</section>')]]) {
    assert.equal(mergeTexts(from, text, seen), text.replace('two three', 'twoA three'), how);
  }
  const mice = '<section>\n  <h2>Mice</h2>\n  <p>Squeak</p>\n</section>\n', dogs = mice.replace('Mice', 'Dogs').replace('Squeak', 'Barks');
  const moved = keys + dogs + mice;
  assert.equal(mergeTexts(from + mice + dogs, moved, seen + mice + dogs), moved.replace('two three', 'twoA three'), 'a slide');
});

test('a move is the removal of whole lines and the insertion of their text, also in another order, and gives way only to an edit of someone else inside it', () => {
  const doc = ['<p>A one</p>', '<p>B two</p>', '<p>C three</p>', '<li></li>', '<section>', '<h2>S</h2>', '</section>', '<section>', '<h2>S</h2>', '</section>', ''].join('\n');
  const cut = (s, i = 0) => ({ start: doc.indexOf(s, i), end: doc.indexOf(s, i) + s.length, text: '' });
  const put = (text) => ({ start: doc.length, end: doc.length, text });
  const key = (s) => ({ start: doc.indexOf(s) + 4, end: doc.indexOf(s) + 4, text: 'x' });
  const hit = (a, b) => a.start < b.end && b.start < a.end;
  const of = (list, others) => moves(doc, list, others, hit).map((e) => list.indexOf(e)).sort((x, y) => y - x);
  const a = '<p>A one</p>\n', b = '<p>B two</p>\n', s = '<section>\n<h2>S</h2>\n</section>\n';
  assert.deepEqual(of([cut(a), put(a)], [key(a)]), [1, 0], 'a paragraph moved to the end');
  assert.deepEqual(of([cut(a), put(a)], [key('<p>C')]), [], 'a key outside the moved paragraph');
  assert.deepEqual(of([cut(a), put(a), key('<p>C')], [key(a)]), [1, 0], 'a move with another change');
  assert.deepEqual(of([cut(a.slice(3)), put(a.slice(3))], [key(a)]), [], 'a removal from the middle of a line');
  assert.deepEqual(of([cut(a.slice(0, -1)), put(a.slice(0, -1))], [key(a)]), [], 'a removal without its line break');
  assert.deepEqual(of([cut(a), { start: doc.indexOf('<p>C'), end: doc.indexOf('<p>C') + 3, text: a }], [key(a)]), [], 'a replacement with the text of the removal');
  assert.deepEqual(of([cut('<li></li>\n'), put('<li></li>\n')], [{ start: doc.indexOf('<li>') + 4, end: doc.indexOf('<li>') + 4, text: 'x' }]), [], 'a line without text');
  assert.deepEqual(of([cut(a), cut(b), put(b + a)], [key(a)]), [2, 1, 0], 'two removals inserted in the other order');
  assert.deepEqual(of([cut(s), cut(s, doc.indexOf(s) + 1), put(s)], [{ start: doc.lastIndexOf('<h2>S') + 4, end: doc.lastIndexOf('<h2>S') + 4, text: 'x' }]), [], 'one of two equal slides');
  const dos = '<p>A one</p>\r\n<p>B two</p>\r\n<p>C three</p>\r\n';
  const two = [{ start: 0, end: 14, text: '' }, { start: 28, end: 44, text: '' }, { start: 44, end: 44, text: '<p>A one</p>\r\n<p>C three</p>\r\n' }];
  assert.equal(moves(dos, two, [{ start: 4, end: 4, text: 'x' }], hit).length, 3, 'two paragraphs in a text with CRLF line ends');
});

test('outside a session, a key in a paragraph that the file moves is a conflict, hence the page keeps its key and the file its move', () => {
  const theirs = base.replace('  <p>First slide</p>\n', '').replace('  <p>Second slide</p>\n', '  <p>Second slide</p>\n  <p>First slide</p>\n');
  const merged = merge(base, [edit('First', 'My first')], theirs, 'ours');
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.text, theirs.replace('<h2>One</h2>\n', '<h2>One</h2>\n  <p>My first slide</p>\n'));
});

test('the merge of an apply in a session keeps the item or paragraph after one that two people delete when one of them also moves a paragraph to the next slide, in both orders', () => {
  const deck = (...slides) => slides.map((s) => `<section>\n  <h2>${s[0]}</h2>\n${s.slice(1).map((l) => `  ${l}\n`).join('')}</section>\n`).join('');
  const unread = (from, mine, others) => mergeTexts(from, others, mine);
  const lists = ['<li></li>', '<li>Same</li>'].map((next) => [next, ['One', '<ul>', '  <li>Method</li>', '  <li>Same words</li>', `  ${next}`, '</ul>', '<p>Para</p>'], '    <li>Same words</li>\n']);
  for (const [next, one, cut] of [...lists, ['<p>Same words 2</p>', ['One', '<p>Method</p>', '<p>Same words</p>', '<p>Same words 2</p>', '<p>Para</p>'], '  <p>Same words</p>\n']]) {
    const from = deck(one, ['Two', '<p>Last</p>']);
    const gone = from.replace(cut, '');
    const alice = gone.replace('  <p>Para</p>\n', '').replace('  <p>Last</p>\n', '  <p>Last</p>\n  <p>Para</p>\n');
    const bob = gone.replace('Last', 'Last!');
    for (const [how, text] of [['the edits of Alice unread', unread(from, alice, bob)], ['the edits of Bob unread', unread(from, bob, alice)]]) {
      assert.ok(text.includes(`  ${next}\n`), `${next}, ${how}: the next element is kept`);
      for (const h of ['One', 'Two']) assert.ok(text.includes(`<h2>${h}</h2>`), `${next}, ${how}: the slide ${h} is kept`);
    }
    const text = unread(from, alice, bob);
    assert.ok(text.includes('Last!') && text.includes('<p>Para</p>'), `${next}: the key of Bob and the paragraph of Alice are kept`);
  }
});

test('in the merge of the editor, a swap of two list items that differ in one character keeps a key at the end of one item in this item, in both orders', () => {
  const from = '<section>\n  <h2>Two</h2>\n  <ul>\n    <li>Beta 1</li>\n    <li>Beta 2</li>\n  </ul>\n</section>\n';
  const moved = from.replace('    <li>Beta 1</li>\n    <li>Beta 2</li>\n', '    <li>Beta 2</li>\n    <li>Beta 1</li>\n');
  const typed = from.replace('Beta 1', 'Beta 1 by Ana');
  for (const [ours, all] of [[typed, moved], [moved, typed]]) assert.ok(mergeTexts(from, all, ours, true).includes('<li>Beta 1 by Ana</li>'));
});

test('in the merge of the editor, a paragraph moved together with a long paste on another slide is in the deck once around an unread key in it', () => {
  const one = '<section>\n  <h2>One</h2>\n  <p>First slide</p>\n</section>\n';
  const two = '<section>\n  <h2>Two</h2>\n  <p>Second slide</p>\n  <ul>\n    <li>Alpha</li>\n  </ul>\n</section>\n';
  const from = `${one}\n${two}`;
  const long = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ');
  const moved = `${one.replace('</section>', `  <p>${long}</p>\n</section>`)}\n${two.replace('  <p>Second slide</p>\n', '').replace('</ul>\n', '</ul>\n  <p>Second slide</p>\n')}`;
  const text = mergeTexts(from, moved, from.replace('Second slide', 'Second slide by Ana'), true);
  assert.equal(text.split('Second slide').length - 1, 1);
  assert.equal(text.split('word89').length - 1, 1);
});

test('changes() gives a slide moved past another as the removal and the insertion of the whole slide, and the plain line diff when the slide that moved is also changed', () => {
  const s = (h, ...ps) => `<section>\n  <h2>${h}</h2>\n${ps.map((p) => `  ${p}\n`).join('')}</section>\n`;
  const a = s('A', '<p>Alpha</p>'), b = s('B', '<p>Beta</p>'), c = s('C', '<p>Gamma</p>');
  for (const [base, theirs] of [[a + b + c, b + a + c], [a + b + c, c + a + b]]) {
    const found = changes(base, theirs);
    assert.equal(apply(base, found), theirs);
    const cut = found.find((e) => !e.text), put = found.find((e) => e.start === e.end);
    assert.ok(cut && put, 'a removal and an insertion');
    assert.equal(base.slice(cut.start, cut.end), put.text, 'the removed text is inserted');
    assert.match(put.text, /^<section>[^]*<\/section>\n$/, 'the text is a whole slide');
  }
  // the mover changes slide Two, hence markMoved() marks slide One, whose hunks are not a move
  const one = s('One', '<p>First</p>', '<ul>', '  <li>Item</li>', '  <li></li>', '</ul>'), two = s('Two', '<p>Second</p>');
  const three = s('Three', '<ul>', '  <li>Last item</li>', '</ul>', '<p>Third</p>'), four = s('Four', '<p>Fourth</p>');
  const base = one + two + three + four, theirs = two.replace('Second', 'Second by Bob') + three + one + four;
  assert.deepEqual(changes(base, theirs), changes(base, theirs, true));
  assert.equal(apply(base, changes(base, theirs)), theirs);
});

// two and three people who type at once at one point, at points next to each other, and in a word
// that one of them types over, merged in every order of arrival
test('the merge of texts keeps every key of two or three people who type at once at one point, next to each other, or in a word that one of them replaces', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  const base = wrap('Second slide');
  const orders = (n) => (n === 2 ? [[0, 1], [1, 0]] : [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]);
  for (const [texts, wants] of [
    [['SecondA slide', 'SecondB slide'], ['SecondAB slide', 'SecondBA slide']],
    [['SecondA slide', 'Second Bslide'], ['SecondA Bslide']],
    [['SecondA slide', 'SecondB slide', 'Second Cslide'], ['SecondAB Cslide', 'SecondBA Cslide']],
    [['Second deck', 'Second slXide'], ['Second deckX']],
    [['Second slate', 'Second sliQde'], ['Second slateQ']],
    [['Second deck', 'Second slXide', 'Second slidYe'], ['Second deckXY', 'Second deckYX']],
    [['Second deck', 'Second slXide', 'SecondZ slide'], ['SecondZ deckX']],
  ]) {
    for (const order of orders(texts.length)) {
      // each text reaches the merge of the others in this order, and is the page of its person
      let text = wrap(texts[order[0]]);
      for (const i of order.slice(1)) text = mergeTexts(base, text, wrap(texts[i]));
      assert.ok(wants.map(wrap).includes(text), `${texts.join(', ')} in the order ${order.join('')}: ${text}`);
    }
  }
});

// one person puts a word in at once at the end of a paragraph while another types a word there key by
// key. each page reads the word put in after a space as one that starts with the space, and the
// authority puts a key that goes on with a word before a word that starts with a space at one point
test('a word put in at once and a word typed key by key at one point each stay whole with the space before it', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  <p>${p}</p>\n</section>\n`;
  // the page of the person who typed the space reads the word of the other after the space
  assert.deepEqual(diff(wrap('Second slide '), wrap('Second slide A0a ')), [{ start: wrap('Second slide').indexOf('</p>'), end: wrap('Second slide').indexOf('</p>'), text: ' A0a' }]);
  // a word put in before another word keeps the space after it, as it was typed
  assert.deepEqual(diff(wrap('First slide'), wrap('First great slide')), [{ start: wrap('First slide').indexOf('slide'), end: wrap('First slide').indexOf('slide'), text: 'great ' }]);
  for (const [theirs, ours] of [['Second slide A0a ', 'Second slide B0b'], ['Second slide B0b', 'Second slide A0a ']]) {
    assert.equal(mergeTexts(wrap('Second slide '), wrap(theirs), wrap(ours)), wrap('Second slide A0a B0b'));
  }
  // a key after a sign that ends a sentence is not the rest of a word and goes after the word of the other
  for (const [theirs, ours, want] of [['attention. See more.', 'attention.QQQ', 'attention. See more.QQQ'], ['attention. R', 'attention.q', 'attention. Rq']]) {
    assert.equal(mergeTexts(wrap('attention.'), wrap(theirs), wrap(ours)), wrap(want));
  }
  // the authority puts the key of the person after the space before the word of the other there
  const at = wrap('Second slide ').indexOf('</p>');
  for (const first of [true, false]) {
    assert.deepEqual(shift([{ start: at, end: at, text: 'B' }], [{ start: at, end: at, text: ' A0a' }], first), [{ start: at, end: at, text: 'B' }]);
    assert.deepEqual(shift([{ start: at, end: at, text: ' A0a' }], [{ start: at, end: at, text: 'B' }], first), [{ start: at + 1, end: at + 1, text: ' A0a' }]);
  }
});

test('mergePatches() ends on patches that conflict at the start of a text that starts with a line break', () => {
  const base = '\nab\n';
  const { patches } = mergePatches([{ start: 0, end: 2, text: 'X' }], [{ start: 1, end: 1, text: 'Y' }], 'ours', base);
  // the key in the word that the other side types over goes to the end of the new word
  assert.equal(applyPatches(base, patches), 'XbY\n');
});

test('a key typed into the first of two equal paragraphs is an edit of this paragraph, hence a key of another person in it stays in it', () => {
  const base = '<section>\n  <p>Same words</p>\n  <p>Same words</p>\n</section>\n<section>\n  <p>Other</p>\n</section>\n';
  const one = (t) => base.replace('Same words', t);
  const theirs = one('Sak12 me words').replace('Other', 'Other k21');
  assert.deepEqual(diff(base, theirs).map((p) => p.text), ['k12 ', ' k21']);
  assert.equal(mergeTexts(base, theirs, one('Samek00 words')), one('Sak12 mek00 words').replace('Other', 'Other k21'));
});

test('a key in a heading and the removal of the paragraph under it, which another person removes too, are both kept', () => {
  const base = '<section>\n  <h2>R&amp;D 2</h2>\n  <p>Halo 22</p>\n  <p>Intro 21</p>\n</section>\n';
  const gone = base.replace('  <p>Halo 22</p>\n', ''), keyed = gone.replace('D 2', 'D k11 2');
  assert.equal(mergeTexts(base, keyed, gone), keyed);
  assert.equal(mergeTexts(base, gone, keyed), keyed);
});

test('a paragraph moved to the slide before, with a key of a third person in the heading above it and a key of the person in it, keeps both keys and the move', () => {
  const s = (h, p) => `<section>\n  <h2>${h}</h2>\n${p.map((t) => `  <p>${t}</p>\n`).join('')}</section>\n`;
  const base = s('Method 1', ['Data 11']) + s('Method 2', ['Data 21']);
  const others = s('Method 1', ['Data 11', 'Data 21']) + s('Method k20 2', []);
  assert.equal(mergeTexts(base, others, base.replace('Data 21', 'k01Data 21')), others.replace('Data 21', 'k01Data 21'));
});

test('a list of empty items moved to another slide is moved once with the key that another person types into one of its items, in both orders and at the authority', () => {
  const ul = (k = '') => `  <ul>\n    <li></li>\n    <li>${k}</li>\n  </ul>\n`;
  const base = `<section>\n  <h2>One</h2>\n${ul()}  <p>Last</p>\n</section>\n<section>\n  <h2>Two</h2>\n</section>\n`;
  const moved = (k) => `<section>\n  <h2>One</h2>\n  <p>Last</p>\n</section>\n<section>\n  <h2>Two</h2>\n${ul(k)}</section>\n`;
  const keyed = base.replace(ul(), ul('k10'));
  assert.equal(mergeTexts(base, moved(''), keyed), moved('k10'));
  assert.equal(mergeTexts(base, keyed, moved('')), moved('k10'));
  for (const [first, second] of [[moved(''), keyed], [keyed, moved('')]]) {
    const one = diff(base, first), two = diff(base, second);
    assert.equal(applyPatches(base, mergePatches(one, two, 'ours', base).patches), moved('k10'));
  }
});

test('two lists next to each other that two people remove at once are both removed, in both orders and at the authority', () => {
  const ul = (t) => `  <ul>\n    <li>${t}</li>\n  </ul>\n`;
  const base = `<section>\n  <h2>Three</h2>\n${ul('Thank you')}${ul('Orbit')}  <p>Last</p>\n</section>\n`;
  const one = base.replace(ul('Thank you'), ''), two = base.replace(ul('Orbit'), ''), want = one.replace(ul('Orbit'), '');
  assert.equal(mergeTexts(base, one, two), want);
  assert.equal(mergeTexts(base, two, one), want);
  for (const [a, b] of [[one, two], [two, one]]) assert.equal(applyPatches(base, mergePatches(diff(base, a), diff(base, b), 'ours', base).patches), want);
});

test('a paragraph that two people move into one slide, which one of them also moves to the end, is in the deck once, in both orders and at the authority', () => {
  const T = '  <p>Thank you 12</p>\n', O = '  <p>Orbit 13</p>\n', A = '  <p>Added k20</p>\n';
  const first = (mid) => `<section>\n  <h2>Halo 1</h2>\n${mid}</section>\n`;
  const second = (inner) => `<section>\n  <h2>Halo 2</h2>\n${inner}  <p>Halo 21</p>\n</section>\n`;
  const third = '<section>\n  <h2>Intro 3</h2>\n  <p>Same words</p>\n</section>\n';
  const base = first(O + T) + second('') + third, one = first(O) + second(T) + third, two = first(A) + third + second(T);
  assert.equal(mergeTexts(base, two, one), two);
  assert.equal(mergeTexts(base, one, two), two);
  for (const [a, b] of [[one, two], [two, one]]) assert.equal(applyPatches(base, mergePatches(diff(base, a), diff(base, b), 'ours', base).patches), two);
});

test('a paragraph removed from a slide that another person moves is not moved into a copy of another slide that holds its words, in both orders', () => {
  const s = (h, ps) => `<section>\n  <h2>${h}</h2>\n${ps.map((p) => `  ${p}\n`).join('')}</section>\n`;
  const two = (p = []) => s('Same words 2', ['<ul>', '  <li>Halo 23</li>', '</ul>', '<p>Moon 21</p>', ...p]);
  const base = s('Moon 1', ['<p>Same words</p>']) + two() + '\n';
  const one = s('Moon 1', []) + two(['<p>Added k02</p>']) + '\n' + two(), other = two() + s('Moon 1', ['<p>Added k11</p>', '<p>Same words</p>']) + '\n';
  const want = s('Moon 1', ['<p>Added k11</p>']) + two(['<p>Added k02</p>']) + '\n' + two();
  assert.equal(mergeTexts(base, one, other), want);
  assert.equal(mergeTexts(base, other, one), want);
});

test('a slide that one person moves without a paragraph that another person edits stays in place with the edit and the key of the mover, in both orders', () => {
  const s = (h, p) => `<section>\n  <h2>${h}</h2>\n${p}</section>\n`, two = s('Moon 2', '  <p>Same words</p>\n');
  const base = s('Thank you 1', '  <p>Intro 11</p>\n') + two, moved = two + s('Thank you 1 k01', ''), edited = base.replace('Intro', 'Into');
  const want = s('Thank you 1 k01', '  <p>Into 11</p>\n') + two;
  assert.equal(mergeTexts(base, moved, edited), want);
  assert.equal(mergeTexts(base, edited, moved), s('Thank you 1 k01', '') + two);
});

test('a slide moved before two slides, one of them with a key, is the removal and the insertion of this slide whole', () => {
  const s = (h, ps) => `<section>\n  <h2>${h}</h2>\n${ps.map((p) => `  ${p}\n`).join('')}</section>\n`;
  const [a, b, c, d] = [s('Halo 1', ['<p>Same words</p>']), s('Data 2', ['<p>Same words</p>', '<ul>', '  <li>Halo 22</li>', '</ul>']), s('Halo 3', ['<p>Same words</p>', '<p>Intro 31</p>', '<p>Moon 32</p>', '<p>Orbit 33</p>']), s('Halo 4', ['<p>Orbit</p>'])];
  const base = a + b + c + d, moved = c + a + b.replace('Halo 22', 'Halo 22 k21') + d.replace('Orbit', 'Orbit k20');
  assert.deepEqual(changes(base, moved).filter((e) => e.end > e.start || e.text.includes('\n')).map((e) => [base.slice(e.start, e.end), e.text]), [['', c], [c, '']]);
  const keyed = base.replace('Intro 31', 'Intro 31 k30');
  for (const [x, y] of [[moved, keyed], [keyed, moved]]) assert.equal(mergeTexts(base, x, y), moved.replace('Intro 31', 'Intro 31 k30'));
});

test('the removal of a long paragraph that holds most of the text, next to a letter removed in the heading above it, is two patches of whole lines and of the letter', () => {
  const base = `<section>\n  <h2>Halo 2</h2>\n  <p>Data 23</p>\n  <p>Orbit 22 ${'orbit x &lt; y R&amp;D halo '.repeat(80)}</p>\n  <ul>\n    <li>Moon 21</li>\n  </ul>\n</section>\n`;
  const gone = '<section>\n  <h2>Halo </h2>\n  <ul>\n    <li>Moon 21</li>\n  </ul>\n</section>\n';
  const at = base.indexOf('2</h2>'), from = base.indexOf('  <p>Data'), to = base.indexOf('  <ul>');
  assert.deepEqual(diff(base, gone), [{ start: at, end: at + 1, text: '' }, { start: from, end: to, text: '' }]);
});

test('a paragraph that one person removes while another types a character reference at its end and removes the paragraph after it gives whole lines, in both orders', () => {
  const x = '    <p>Moon 42</p>\n    <p>Orbit 41</p>\n  </section>\n', base = `<section>\n  <h2>Halo 4</h2>\n${x}`;
  const typed = base.replace('Moon 42', 'Moon 42 R&D &amp; k20').replace('    <p>Orbit 41</p>\n', ''), gone = base.replace('    <p>Moon 42</p>\n', '');
  assert.equal(mergeTexts(base, typed, gone), gone.replace('    <p>Orbit 41</p>\n', ''));
  assert.equal(mergeTexts(base, gone, typed), typed);
});

test('a slide or a vertical stack moved past another and edited is the removal and the insertion of it whole, and keeps a key of another person in it, in both orders', () => {
  const inner = (h, ls) => `  <section>\n    <h2>${h}</h2>\n${ls.map((l) => `    ${l}\n`).join('')}  </section>\n`;
  const flat = (h, ls) => `<section>\n  <h2>${h}</h2>\n${ls.map((l) => `  ${l}\n`).join('')}</section>\n`;
  const stack = (h, ls, g, ms) => `<section>\n${inner(h, ls)}${inner(g, ms)}</section>\n`;
  const one = flat('Orbit 1', ['<p>Intro 12</p>']);
  for (const kind of [flat, stack]) {
    const two = kind('Thank you 2', ['<p>Same words</p>', '<ul>', '  <li>Method 21</li>', '</ul>'], 'Data 3', ['<p>Moon 31</p>']);
    const three = (k = '', l = '') => kind(`Thank you 4${k}`, ['<ul>', `  <li>Intro 43${l}</li>`, '  <li>Orbit 41</li>', '</ul>'], 'Thank you 5', ['<p>Moon 52</p>']);
    const base = one + two + three(), moved = one + three(' k02') + two, keyed = base.replace('Intro 43', 'Intro 43 k10');
    assert.deepEqual(changes(base, moved).map((e) => [base.slice(e.start, e.end), e.text]), [['', three(' k02')], [three(), '']]);
    for (const [x, y] of [[moved, keyed], [keyed, moved]]) assert.equal(mergeTexts(base, x, y), one + three(' k02', ' k10') + two);
  }
});

test('a list put at the start of a paragraph that another person removes from a slide they move and type in goes with the slide on lines of its own, in both orders', () => {
  const s = (h, ls) => `<section>\n  <h2>${h}</h2>\n${ls.map((l) => `  ${l}\n`).join('')}</section>\n`;
  const ul = '  <ul>\n    <li>Intro 22</li>\n  </ul>\n';
  const one = s('Orbit 1', ['<p>Moon 11</p>']), two = s('Data 2', ['<p>Halo 21</p>', ul.trim()]).replace(`  ${ul.trim()}\n`, ul);
  const four = (k = '', p = ['<p>Thank you 41</p>']) => s('Intro 4', [`<p>Same words${k}</p>`, ...p]);
  const base = one + two + four(), moved = four(' R&D &amp; k11', []) + one + two, put = one + s('Data 2', ['<p>Halo 21</p>']) + four().replace('  <p>Thank', `${ul}  <p>Thank`);
  for (const [x, y] of [[moved, put], [put, moved]]) {
    const text = mergeTexts(base, x, y);
    assert.ok(text.split('\n').every((l) => /^\s*(<\/?(section|ul)>|<(h2|p|li)>[^<>]*<\/\3>)?$/.test(l)), text);
    assert.ok(text.includes(ul), text);
  }
});

test('a key typed in a list item that another person removes from a slide they move and type in is not put inside another line, in both orders', () => {
  const s = (h, ls) => `<section>\n  <h2>${h}</h2>\n${ls.map((l) => `  ${l}\n`).join('')}</section>\n`;
  const list = ['<ul>', '  <li>Method 33</li>', '  <li>Data 32</li>', '</ul>'];
  const one = (li, add = [], more = []) => s('Method 1', [...add, '<ul>', ...li, '</ul>', ...more, '<p>Same words 12</p>', '<ul>', '  <li>Thank you 13</li>', '  <li>Moon 11</li>', '</ul>']);
  const two = (more = list) => s('Orbit 2', ['<p>Halo 21</p>']) + s('Method 3', ['<p>Halo 32</p>', ...more]);
  const base = one(['  <li>Data 11</li>']) + two(), moved = two() + one([], ['<p>Added k10</p>']);
  const keyed = one([`  <li>Data 11 ${'R&amp;D x &lt; y halo orbit '.repeat(20)}k02</li>`], [], list) + two([]);
  for (const [x, y] of [[moved, keyed], [keyed, moved]]) {
    const text = mergeTexts(base, x, y);
    assert.ok(text.split('\n').every((l) => /^\s*(<\/?(section|ul)>|<(h2|p|li)>[^<>]*<\/\3>)?$/.test(l)), text);
  }
});

test('a slide moved up past a slide as long as it and a slide that the mover types in is the removal and the insertion of the slide moved', () => {
  const s = (h, ls) => `<section>\n  <h2>${h}</h2>\n${ls.map((l) => `  ${l}\n`).join('')}</section>\n`;
  const one = s('Method 1', ['<p>Same words 11</p>']), two = s('Same words 2', []), four = s('Intro 4 k00', []), five = s('Same words 5', ['<p>Same words</p>']);
  const three = (p) => s('Halo 3', [`<p>${p}</p>`]);
  const base = one + two + three('Halo 31') + four + five, moved = one + four + two + three('Halo 31 k20') + five;
  const found = changes(base, moved).map((e) => [base.slice(e.start, e.end), e.text]);
  assert.ok(found.some(([cut, put]) => cut === four && !put) && found.some(([cut, put]) => !cut && put === four), JSON.stringify(found));
  assert.ok(found.every(([cut, put]) => !`${cut}${put}`.includes('Halo 3<')), JSON.stringify(found));
});

test('a slide moved past a slide as long as it, after a slide that the mover types in, is the removal and the insertion of the slide moved', () => {
  const s = (h, ls) => `<section>\n  <h2>${h}</h2>\n${ls.map((l) => `  ${l}\n`).join('')}</section>\n`;
  const one = s('Moon 1', ['<p>Same words</p>', '<p>Method 22</p>']), three = s('Halo 3', ['<p>Same words</p>', '<p>Orbit 31</p>']);
  const two = (li, p) => s('Orbit 2', ['<ul>', '  <li>Intro 22</li>', `  <li>${li}</li>`, '</ul>', ...p]), four = s('Thank you 4', ['<ul>', '  <li></li>', '  <li>Orbit 42</li>', '</ul>']);
  const base = one + two('Orbit 21', ['<p>Thank you 21</p>']) + '\n' + three + four, moved = two('Orbit21', []) + '\n' + three + '\n' + one + four;
  const found = changes(base, moved).map((e) => [base.slice(e.start, e.end), e.text]);
  assert.ok(found.some(([cut, put]) => cut === one && !put) && found.some(([cut, put]) => !cut && put.includes(one)), JSON.stringify(found));
  assert.ok(found.every(([cut, put]) => !`${cut}${put}`.includes('Halo 3')), JSON.stringify(found));
});

test('a list that two people move into the slide before, also one of them with a list of the next slide and a typo in a heading, keeps each end tag on the element opened last, in both orders', () => {
  const s = (h, ls) => `<section>\n  <h2>${h}</h2>\n${ls.map((l) => `  ${l}\n`).join('')}</section>\n`;
  const ul = ['<ul>', '  <li>Method 22</li>', '</ul>'], three = ['<ul>', '  <li></li>', '</ul>'];
  const base = s('One', ['<p>Same words 11</p>']) + s('Intro 2', ul) + s('Method 3', [...three, '<p>Intro 31</p>']);
  const one = s('One', ['<p>Same words 11</p>', ...ul]) + s('Intro 2', []) + s('Method 3', [...three, '<p>Intro 31</p>']);
  const two = s('One', ['<p>Same words 11</p>', ...ul, ...three]) + s('Into 2', []) + s('Method 3', ['<p>Intro 31</p>']);
  const nested = (text) => {
    const open = [];
    return !text.match(/<\/?(section|ul)>/g).some((t) => (t[1] === '/' ? open.pop() !== t.slice(2, -1) : !open.push(t.slice(1, -1)))) && !open.length;
  };
  for (const [x, y] of [[one, one], [one, two], [two, one]]) {
    const text = mergeTexts(base, x, y);
    assert.ok(nested(text), text);
  }
});
