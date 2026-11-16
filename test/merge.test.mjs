// the merge of the edits of the page with a file changed since it was read: the changes of the
// file turn the text that was read into the file, edits and changes in different places are both
// kept, an overlap is a conflict settled by prefer, and another file is not merged. the merge of a
// session keeps two insertions at one point as the authority does, and gives the text of the
// authority for pairs of edits of two people in one paragraph. revert() makes the change of an
// entry of typing again over the edits of other people

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, changes, charEdits, clash, edits, fine, merge, mergeEdits, revert } from '../src/editor/merge.ts';
import { apply as applyPatches, conflict, diff, mergePatches, shift } from '../src/session/patch.ts';

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

test('with apart, two insertions at one point are both kept with theirs first, and an insertion strictly inside a replaced range is still a conflict', () => {
  const base = 'The slide.';
  const ins = (at, text) => ({ start: at, end: at, text });
  const at = base.indexOf('slide');
  const kept = mergeEdits(base, [ins(at, 'ours ')], [ins(at, 'theirs ')], 'ours', true);
  assert.deepEqual(kept, { text: 'The theirs ours slide.', conflicts: [] });
  // an insertion at the end and at the start of a range that the other side replaces
  const range = { start: at, end: at + 5, text: 'deck' };
  assert.deepEqual(mergeEdits(base, [ins(at + 5, '!')], [range], 'ours', true), { text: 'The deck!.', conflicts: [] });
  assert.deepEqual(mergeEdits(base, [ins(at, 'new ')], [range], 'theirs', true), { text: 'The new deck.', conflicts: [] });
  const inside = ins(at + 2, 'X');
  assert.deepEqual(mergeEdits(base, [inside], [range], 'ours', true), { text: 'The slXide.', conflicts: [inside] });
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
  assert.equal(mergeEdits(from, edits(from, seen), edits(from, text), 'ours', true).text, from.replace('two', 'twoA'));
  assert.equal(mergeEdits(from, charEdits(from, seen, 500), charEdits(from, text, 500), 'ours', true).text, want);
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
    const moved = shift(ours, theirs, true);
    if (!moved) continue;
    cases += 1;
    const authority = applyPatches(applyPatches(base, theirs), moved);
    const page = mergeEdits(base, ours, theirs, 'ours', true);
    assert.deepEqual(page, { text: authority, conflicts: [] }, `base ${JSON.stringify(base)}, ours ${JSON.stringify(ours)}, theirs ${JSON.stringify(theirs)}`);
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
// turn() of session.ts makes it, gives the text that the authority makes of the two operations
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
    const page = mergeEdits(f, fine(f, s), fine(f, t), 'ours', true, true).text;
    const moved = shift(diff(f, s), diff(f, t), true);
    const authority = moved ? applyPatches(t, moved) : applyPatches(f, mergePatches(diff(f, t), diff(f, s), 'ours').patches);
    assert.equal(page, authority, `${ps} over ${pt}`);
  }
});

const PROSE = 'The spacecraft leaves the halo orbit near the second Lagrange point and follows the stable manifold toward the Moon. ';

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
  ];
  const lost = CASES.filter(([para, at, paste]) => {
    const f = wrap(`<p>${para}</p>`);
    const s = wrap(`<p>${para.slice(0, at)}A${para.slice(at)}</p>`);
    const t = wrap(`<p>${paste}${para}C</p>`);
    return mergeEdits(f, fine(f, s), fine(f, t), 'ours', true, true).text !== wrap(`<p>${paste}${para.slice(0, at)}A${para.slice(at)}C</p>`);
  });
  assert.deepEqual(lost.map(([para, , paste]) => `${paste.slice(0, 8)}… of ${paste.length} into ${para}`), []);
});

// the longest runs in common of the paragraph and the new text are "econd " of the paste and
// " slide", and after the first of them the parts differ in more than 500 units
test('the merge of an apply in a session keeps a paste of prose over the first word and a key of a third person around an unread key of the person in the next word', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const paste = PROSE.repeat(6).slice(0, 600);
  const f = wrap('<p>Second slide</p>'), s = wrap('<p>Second slAide</p>'), t = wrap(`<p>${paste} slideC</p>`);
  assert.equal(mergeEdits(f, fine(f, s), fine(f, t), 'ours', true, true).text, wrap(`<p>${paste} slAideC</p>`));
});

test('with twice, the same letter typed at one point by two people is kept twice, and the same replacement of a word by two people once', () => {
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const twice = (p0, ps, pt) => {
    const f = wrap(p0), s = wrap(ps), t = wrap(pt);
    return mergeEdits(f, fine(f, s), fine(f, t), 'ours', true, true).text;
  };
  assert.equal(twice('<p>Second slide</p>', '<p>Seconde slide</p>', '<p>Seconde slide</p>'), wrap('<p>Secondee slide</p>'));
  // the diff turns slide into deck as a removal of sli and an insertion of ck, which are one change
  assert.equal(twice('<p>Second slide</p>', '<p>Second deck</p>', '<p>Second deck</p>'), wrap('<p>Second deck</p>'));
  assert.equal(twice('<p>Second teh slide</p>', '<p>Second the slide</p>', '<p>Second the slide</p>'), wrap('<p>Second the slide</p>'));
});

test('the merge of an apply in a session keeps a key of another person inside a word whose bold the person removes', () => {
  // the authority takes the removal of both tags as one patch over the word, which drops the key
  const wrap = (p) => `<section>\n  <h2>Two</h2>\n  ${p}\n</section>\n`;
  const f = wrap('<p>Second <strong>slide</strong></p>'), s = wrap('<p>Second slide</p>');
  for (const [pt, want] of [['<p>Second <strong>sliZde</strong></p>', '<p>Second sliZde</p>'], ['<p>Second <strong>slideZ</strong></p>', '<p>Second slideZ</p>']]) {
    assert.equal(mergeEdits(f, fine(f, s), fine(f, wrap(pt)), 'ours', true, true).text, wrap(want));
  }
});
