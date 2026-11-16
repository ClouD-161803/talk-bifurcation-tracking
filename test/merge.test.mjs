// the merge of the edits of the page with a file changed since it was read: the changes of the
// file turn the text that was read into the file, edits and changes in different places are both
// kept, an overlap is a conflict settled by prefer, and another file is not merged

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, changes, merge, moves } from '../src/editor/merge.ts';

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

test('a move is the removal of whole lines and the insertion of their text in the same order, and gives way only to an edit of someone else inside it', () => {
  const doc = ['<p>A one</p>', '<p>B two</p>', '<p>C three</p>', '<li></li>', '<section>', '<h2>S</h2>', '</section>', '<section>', '<h2>S</h2>', '</section>', ''].join('\n');
  const cut = (s, i = 0) => ({ start: doc.indexOf(s, i), end: doc.indexOf(s, i) + s.length, text: '' });
  const put = (text) => ({ start: doc.length, end: doc.length, text });
  const key = (s) => ({ start: doc.indexOf(s) + 4, end: doc.indexOf(s) + 4, text: 'x' });
  const hit = (a, b) => a.start < b.end && b.start < a.end;
  const of = (list, others) => moves(doc, list, others, hit).map((e) => list.indexOf(e));
  const a = '<p>A one</p>\n', b = '<p>B two</p>\n', s = '<section>\n<h2>S</h2>\n</section>\n';
  assert.deepEqual(of([cut(a), put(a)], [key(a)]), [1, 0], 'a paragraph moved to the end');
  assert.deepEqual(of([cut(a), put(a)], [key('<p>C')]), [], 'a key outside the moved paragraph');
  assert.deepEqual(of([cut(a), put(a), key('<p>C')], [key(a)]), [], 'a move with another change');
  assert.deepEqual(of([cut(a.slice(3)), put(a.slice(3))], [key(a)]), [], 'a removal from the middle of a line');
  assert.deepEqual(of([cut(a.slice(0, -1)), put(a.slice(0, -1))], [key(a)]), [], 'a removal without its line break');
  assert.deepEqual(of([cut(a), { start: doc.indexOf('<p>C'), end: doc.indexOf('<p>C') + 3, text: a }], [key(a)]), [], 'a replacement with the text of the removal');
  assert.deepEqual(of([cut('<li></li>\n'), put('<li></li>\n')], [{ start: doc.indexOf('<li>') + 4, end: doc.indexOf('<li>') + 4, text: 'x' }]), [], 'a line without text');
  assert.deepEqual(of([cut(a), cut(b), put(b + a)], [key(a)]), [], 'two removals inserted in the other order');
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
