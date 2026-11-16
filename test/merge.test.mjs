// the merge of the edits of the page with a file changed since it was read: the changes of the
// file turn the text that was read into the file, edits and changes in different places are both
// kept, an overlap is a conflict settled by prefer, and another file is not merged. the merge of a
// session keeps two insertions at one point as the authority does, and revert() makes the change
// of an entry of typing again over the edits of other people

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, changes, charEdits, clash, edits, merge, mergeEdits, revert } from '../src/editor/merge.ts';
import { apply as applyPatches, conflict, shift } from '../src/session/patch.ts';

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
  // the person typed "aa", and another person typed "a" next to it
  assert.equal(revert('Xa aaY', 'Xa Y', 'Xa aaaY'), 'Xa aY');
  assert.equal(revert('Xa aaY', 'Xa Y', 'Xaa aaY'), 'Xaa Y');
  // the person typed "ab", and another person typed "a" on its left, which the diff of the two
  // texts places between "a" and "b", inside the span of the person
  assert.equal(revert('XabY', 'XY', 'XaabY'), 'XaY');
  assert.equal(revert('Plan the and slide.', 'Plan the slide.', 'Plan the aand slide.'), 'Plan the aslide.');
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
