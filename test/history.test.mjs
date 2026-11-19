// the history of the editor without a page: an undo or a redo asked for while another one runs is
// queued, never dropped, and the changes made in a transaction are one entry with its label

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { History } from '../src/editor/history.ts';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function history() {
  return new History({ snapshot: () => '', restore: async () => {}, onChange: () => {} });
}

// an entry whose undo and redo take ms, as a formula that is typeset again
function slow(log, name, ms = 50) {
  return {
    label: name,
    undo: async () => {
      await sleep(ms);
      log.push(`undo ${name}`);
    },
    redo: async () => {
      await sleep(ms);
      log.push(`redo ${name}`);
    },
  };
}

test('an undo asked for while an undo runs is queued, not dropped', async () => {
  const h = history();
  const log = [];
  h.push(slow(log, 'a'));
  h.push(slow(log, 'b'));
  const first = h.undo();
  await sleep(10);
  const second = h.undo();
  await Promise.all([first, second]);
  assert.deepEqual(log, ['undo b', 'undo a']);
  assert.equal(h.canUndo, false);
  await Promise.all([h.redo(), h.redo()]);
  assert.deepEqual(log, ['undo b', 'undo a', 'redo a', 'redo b']);
  assert.equal(h.canRedo, false);
  assert.equal(h.canUndo, true);
});

// an entry that sets one key of state, and sets it back at an undo
function change(state, key, value, label = key) {
  const before = state[key];
  state[key] = value;
  return { label, undo: () => void (state[key] = before), redo: () => void (state[key] = value) };
}

test('the changes of a transaction are one entry with its label, undone in reverse order', async () => {
  const h = history();
  const state = { a: 0 };
  await h.transact('Two changes', () => {
    h.push(change(state, 'a', 1));
    h.push(change(state, 'a', 2));
  });
  assert.equal(h.undoLabel, 'Two changes');
  await h.undo();
  assert.deepEqual(state, { a: 0 });
  assert.equal(h.canUndo, false);
  assert.equal(h.redoLabel, 'Two changes');
  await h.redo();
  assert.deepEqual(state, { a: 2 });
});

test('a transaction inside another one is part of it, and one without a change is not an entry', async () => {
  const h = history();
  const state = { a: 0, b: 0 };
  await h.transact('Outer', async () => {
    h.push(change(state, 'a', 1));
    await h.transact('Inner', () => h.push(change(state, 'b', 1)));
  });
  await h.transact('Nothing', () => {});
  assert.equal(h.undoLabel, 'Outer');
  await h.undo();
  assert.deepEqual(state, { a: 0, b: 0 });
  assert.equal(h.canUndo, false);
});

test('the changes made before an error in a transaction are recorded, and the error is passed on', async () => {
  const h = history();
  const state = { a: 0 };
  await assert.rejects(
    h.transact('Failed', () => {
      h.push(change(state, 'a', 1));
      throw new Error('broken');
    }),
    /broken/,
  );
  assert.equal(h.undoLabel, 'Failed');
  await h.undo();
  assert.deepEqual(state, { a: 0 });
});

// the typing of a text element over the changes of other people, with a text element as an object
// whose content is its text. the undo of an entry of typing reads the focus of the page
globalThis.document ??= { activeElement: null };

function texts() {
  const changes = { count: 0 };
  const h = new History({ snapshot: (el) => el.content, restore: async (el, content) => void (el.content = content), onChange: () => changes.count++ });
  return { h, changes };
}

const textEl = (content) => ({ content, isConnected: true, closest: () => null, matches: () => false });

// the keys of one entry of typing, which turn the content of el into content
function typeInto(h, el, content) {
  h.beforeTyping(el);
  el.content = content;
  h.afterTyping(el);
}

test('an entry of typing is kept when another person writes into its text element, and its undo and redo change only the typing', async () => {
  const { h } = texts();
  const el = textEl('Plan the slide.');
  h.track(el);
  typeInto(h, el, 'Plan the complete slide.');
  h.break();
  el.content = 'Now: Plan the complete slide.';
  h.prune((x) => x === el, undefined, undefined, [el]);
  h.carry(el);
  assert.equal(h.undoLabel, 'typing');
  await h.undo();
  assert.equal(el.content, 'Now: Plan the slide.');
  el.content = 'Now: Plan the slide first.';
  await h.redo();
  assert.equal(el.content, 'Now: Plan the complete slide first.');
});

test('a change of the text element by another person drops every other entry that names it, and the typing when it is not in texts', async () => {
  const { h } = texts();
  const el = textEl('Plan the slide.');
  const other = textEl('Then the steps.');
  h.track(el);
  typeInto(h, el, 'Plan the complete slide.');
  h.push({ label: 'tag', undo: () => {}, redo: () => {}, els: [el] });
  h.push({ label: 'move', undo: () => {}, redo: () => {}, els: [other], touches: [el] });
  h.push({ label: 'delete', undo: () => {}, redo: () => {}, els: [other], detaches: [other] });
  h.prune((x) => x === el, (root) => root === other, undefined, [el]);
  assert.equal(h.undoLabel, 'typing');
  await h.undo();
  assert.equal(h.canUndo, false);
  assert.equal(el.content, 'Plan the slide.');
  await h.redo();
  typeInto(h, el, 'Plan the complete slide first.');
  h.prune((x) => x === el, undefined, undefined, [other]);
  assert.equal(h.canUndo, false, 'the entries of a text element outside texts are dropped');
  typeInto(h, el, 'Plan the complete slide first, then.');
  await h.undo();
  assert.equal(el.content, 'Plan the complete slide first.', 'the typing after the prune is a new entry');
});

test('the typing in progress goes on over an insertion of another person, and its undo keeps the insertion', async () => {
  const { h } = texts();
  const el = textEl('Plan the slide.');
  h.track(el);
  typeInto(h, el, 'Plan the c slide.');
  el.content = 'Now: Plan the c slide.';
  h.prune((x) => x === el, undefined, undefined, [el]);
  h.carry(el);
  typeInto(h, el, 'Now: Plan the complete slide.');
  assert.equal(h.undoLabel, 'typing');
  await h.undo();
  assert.equal(el.content, 'Now: Plan the slide.');
  assert.equal(h.canUndo, false, 'the typing before and after the insertion is one entry');
});

test('the typing in progress ends when another person removes letters of it, and the keys after are a new entry', async () => {
  const { h } = texts();
  const el = textEl('X Y');
  h.track(el);
  typeInto(h, el, 'X abc Y');
  el.content = 'X aZ';
  h.prune((x) => x === el, undefined, undefined, [el]);
  h.carry(el);
  typeInto(h, el, 'X aZ!');
  await h.undo();
  assert.equal(el.content, 'X aZ');
  assert.equal(h.canUndo, true, 'the entry of the typing before the removal is kept until its undo');
});

test('an entry of typing whose carry was refused is not undone from its old texts, which would take a letter of another person', async () => {
  const { h } = texts();
  const state = { a: 0 };
  h.push(change(state, 'a', 1));
  const el = textEl('rho');
  h.track(el);
  typeInto(h, el, 'xaarho');
  // another person types an a after the x, which the texts also give inside the span of the person
  el.content = 'xaaarho';
  h.prune((x) => x === el, undefined, undefined, [el]);
  h.carry(el);
  // and then removes the last a of the person, after which the text reads as after the typing
  el.content = 'xaarho';
  h.prune((x) => x === el, undefined, undefined, [el]);
  h.carry(el);
  await h.undo();
  assert.equal(el.content, 'xaarho', 'the a of the other person is kept');
  assert.deepEqual(state, { a: 1 }, 'the entry before it is kept');
  assert.equal(h.undoLabel, 'a');
});

test('an entry of typing that has ended is refused, as one in progress is, when another person removed its letters and typed them again', async () => {
  const { h } = texts();
  const told = [];
  h.refused = (entry, way) => told.push([entry.label, way]);
  const el = textEl('Second slide');
  const other = textEl('Alpha');
  h.track(el);
  h.track(other);
  typeInto(h, el, 'Second slide to');
  typeInto(h, other, 'Alphax');
  for (const content of ['Second slide t', 'Second slide ', 'Second slide t', 'Second slide to']) {
    el.content = content;
    h.prune((x) => x === el, undefined, undefined, [el]);
    h.carry(el);
  }
  await h.undo();
  assert.equal(other.content, 'Alpha');
  await h.undo();
  assert.equal(el.content, 'Second slide to', 'the word typed by the other person is kept');
  assert.deepEqual(told, [['typing', 'undo']]);
});

// each content of contents written into el by another person, as the session applies it
function edit(h, el, ...contents) {
  for (const content of contents) {
    el.content = content;
    h.prune((x) => x === el, undefined, undefined, [el]);
    h.carry(el);
  }
}

test('an undo of an earlier entry of typing in a text element is refused when another person removed its letters and typed them again', async () => {
  const { h } = texts();
  const told = [];
  h.refused = (entry, way) => told.push(way);
  const el = textEl('the dog runs');
  h.track(el);
  typeInto(h, el, 'the dogs runs');
  h.break();
  typeInto(h, el, 'the dogs runs fast');
  h.break();
  // the other person selects dogs and types cats over it, key by key
  edit(h, el, 'the c runs fast', 'the ca runs fast', 'the cat runs fast', 'the cats runs fast');
  await h.undo();
  assert.equal(el.content, 'the cats runs');
  await h.undo();
  assert.equal(el.content, 'the cats runs', 'the s of the other person is kept');
  assert.deepEqual(told, ['undo']);
});

test('an undo of an entry of typing under an undone one is refused when another person removed its letters and typed them again', async () => {
  const { h } = texts();
  const told = [];
  h.refused = (entry, way) => told.push(way);
  const el = textEl('a dog');
  h.track(el);
  typeInto(h, el, 'a big dog');
  h.break();
  typeInto(h, el, 'a big dog now');
  h.break();
  await h.undo();
  await h.undo();
  await h.redo();
  assert.equal(el.content, 'a big dog');
  // the other person selects all and types over it
  edit(h, el, '', 'a big cat');
  await h.undo();
  assert.equal(el.content, 'a big cat', 'the words of the other person are kept');
  assert.deepEqual(told, ['undo']);
});

// the check of each entry reads the text without the entries after it, whose letters beside its
// own would make its place read two ways
test('an undo of an entry of typing is not refused for the same letters typed right after it in later entries, after a change of another person', async () => {
  const { h } = texts();
  const told = [];
  h.refused = (entry, way) => told.push(way);
  const el = textEl('x');
  h.track(el);
  for (const content of ['x dog', 'x dog dog', 'x dog dog dog']) {
    typeInto(h, el, content);
    h.break();
  }
  edit(h, el, 'Zx dog dog dog');
  for (let i = 0; i < 3; i++) await h.undo();
  assert.equal(el.content, 'Zx');
  assert.deepEqual(told, []);
});

// a change of another person checks at most eight entries below the latest one, since a page
// receives a change for each of his keys
test('an undo of an entry of typing more than eight entries below the latest one of its text element is refused after a change of another person', async () => {
  const { h } = texts();
  const told = [];
  h.refused = (entry, way) => told.push(way);
  const el = textEl('a');
  h.track(el);
  for (let i = 1; i <= 10; i++) {
    typeInto(h, el, `${el.content} w${i}`);
    h.break();
  }
  edit(h, el, `Z${el.content}`);
  for (let i = 0; i < 9; i++) await h.undo();
  assert.equal(el.content, 'Za w1');
  assert.deepEqual(told, []);
  await h.undo();
  assert.equal(el.content, 'Za w1');
  assert.deepEqual(told, ['undo']);
});

test('an entry of typing refused at a change of another person is not one of the eight entries that a later change checks', async () => {
  const { h } = texts();
  const told = [];
  h.refused = (entry, way) => told.push(way);
  const el = textEl('a');
  h.track(el);
  for (let i = 1; i <= 9; i++) {
    typeInto(h, el, `${el.content} w${i}`);
    h.break();
  }
  // the other person removes the w of w5, whose entry is then refused
  edit(h, el, el.content.replace('w5', '5'));
  typeInto(h, el, `${el.content} w10`);
  h.break();
  edit(h, el, `Z${el.content}`);
  for (let i = 0; i < 10; i++) await h.undo();
  assert.equal(el.content, 'Za 5');
  assert.deepEqual(told, ['undo']);
});

// Ana types zz and then zx and x, and the other person removes letters around them. the second
// entry is refused, and its letters stay in the text as letters of others
test('an undo of an entry of typing under a refused one reads the letters of the refused one as letters of another person', async () => {
  const { h } = texts();
  const told = [];
  h.refused = (entry, way) => told.push(way);
  const el = textEl('zaayz');
  h.track(el);
  typeInto(h, el, 'zaazzyz');
  h.break();
  edit(h, el, 'zzaazzyz', 'zzazzyz');
  typeInto(h, el, 'zzxzazzyz');
  edit(h, el, 'zzxzazzxyyyz');
  typeInto(h, el, 'zzxxzazzxyyyz');
  h.break();
  edit(h, el, 'zzxxzzxyyyz', 'zzxxzzxyyz');
  await h.undo();
  assert.equal(el.content, 'zzxxzzxyyz');
  await h.undo();
  assert.equal(el.content, 'zzxxxyyz');
  assert.deepEqual(told, ['undo']);
});

// Ana types x, y, and z, and the other person types over the letters of the text before. the
// second redo of Ana is refused, and the entry under it reads the y of the other person as hers
test('undos and redos of two entries of typing, one of them refused, keep the letters of another person', async () => {
  const { h } = texts();
  const el = textEl('cbbcec');
  h.track(el);
  typeInto(h, el, 'cybbcec');
  h.break();
  typeInto(h, el, 'cyzzzybbcec');
  h.break();
  edit(h, el, 'cyzzzyycec');
  await h.undo();
  edit(h, el, 'cyyzec', 'cyzec');
  await h.undo();
  edit(h, el, 'cc');
  await h.redo();
  edit(h, el, 'c', 'xyc');
  await h.redo();
  edit(h, el, 'xyz');
  await h.undo();
  assert.equal(el.content, 'xyz', 'the y of the other person is kept');
});

test('the typing in progress in one text element goes on when a change of another person ends the typing of another text element', async () => {
  const { h } = texts();
  const el = textEl('X Y');
  const other = textEl('Alpha');
  h.track(el);
  h.track(other);
  typeInto(h, el, 'X abc Y');
  typeInto(h, other, 'Alphax');
  el.content = 'X aZ';
  h.prune((x) => x === el, undefined, undefined, [el]);
  h.carry(el);
  typeInto(h, other, 'Alphaxy');
  await h.undo();
  assert.equal(other.content, 'Alpha', 'the keys before and after the change are one entry');
});

test('a change of another person after a key that changed nothing is kept at the undo of the typing that goes on', async () => {
  const { h } = texts();
  const el = textEl('X Y');
  h.track(el);
  typeInto(h, el, 'X Y');
  el.content = 'Q X Y';
  h.prune((x) => x === el, undefined, undefined, [el]);
  h.carry(el);
  typeInto(h, el, 'Q X aY');
  await h.undo();
  assert.equal(el.content, 'Q X Y');
});

test('typing that ended inside a transaction is undone with the transaction after a change of another person', async () => {
  const { h } = texts();
  const el = textEl('X Y');
  h.track(el);
  await h.transact('Two', () => {
    typeInto(h, el, 'X abc Y');
    h.break();
    el.content = 'X aZ';
    h.carry(el);
  });
  await h.undo();
  assert.equal(el.content, 'X Y');
  assert.equal(h.redoLabel, 'Two');
});

// a diff of the text before the redo against the text now may read a letter removed on one side of
// the place of the typing and the same letter typed on its other side, or the other way round. the
// redo is made where the two readings give one place, and refused where they give two
test('a redo of typing after another person typed a letter on one side of its place and removed one on the other side is placed right, or refused where its place reads two ways', async () => {
  for (const c of [
    { before: 'see', at: 2, typed: 'XYZ', first: 'seXYZde', undone: 'sede', keys: ['sdede', 'sdee'], redone: null },
    { before: 'aaa', at: 2, typed: 'xxx', first: 'aaxxxRa', undone: 'aaRa', keys: ['aRaRa', 'aRaa'], redone: null },
    { before: 'see', at: 2, typed: 'XYZ', first: null, undone: 'see', keys: ['sdee'], redone: 'sdeXYZe' },
    { before: 'sede', at: 2, typed: 'XYZ', first: null, undone: 'sede', keys: ['sdede', 'sdee'], redone: null },
  ]) {
    const { h } = texts();
    const told = [];
    h.refused = (entry, way) => told.push(way);
    const el = textEl(c.before);
    h.track(el);
    typeInto(h, el, c.before.slice(0, c.at) + c.typed + c.before.slice(c.at));
    h.break();
    if (c.first) edit(h, el, c.first);
    await h.undo();
    assert.equal(el.content, c.undone);
    edit(h, el, ...c.keys);
    await h.redo();
    assert.equal(el.content, c.redone ?? c.keys.at(-1), c.before);
    assert.deepEqual(told, c.redone ? [] : ['redo'], c.before);
  }
});

test('an undo of typing empties the text element when another person removed every letter around the typing', async () => {
  const { h } = texts();
  const el = textEl('AB');
  h.track(el);
  typeInto(h, el, 'AXB');
  h.break();
  el.content = 'X';
  h.prune((x) => x === el, undefined, undefined, [el]);
  h.carry(el);
  await h.undo();
  assert.equal(el.content, '');
});

// the contents that write() sets after each step in a session, from which the next step starts
test('an undo after a redo puts back a word before the letters that another person typed right after it while it was undone', async () => {
  const { h } = texts();
  const el = textEl('ab');
  h.track(el);
  // Ana deletes the b
  typeInto(h, el, 'a');
  h.break();
  await h.undo();
  assert.equal(el.content, 'ab');
  // Ben types a space at the end and aa after the b, while the entry of Ana is undone
  for (const content of ['ab ', 'abaa ']) {
    el.content = content;
    h.prune((x) => x === el, undefined, undefined, [el]);
    h.carry(el);
  }
  await h.redo();
  assert.equal(el.content, 'aaa ', 'the redo deletes the b of Ana alone');
  await h.undo();
  assert.equal(el.content, 'abaa ', 'the undo puts the b back where it was');
});

test('an undo drops an entry of typing that cannot be undone, tells refused of it, and keeps the entry before it for the next undo', async () => {
  const { h, changes } = texts();
  const told = [];
  h.refused = (entry, way) => told.push([entry.label, way]);
  const state = { a: 0 };
  h.push(change(state, 'a', 1));
  const el = textEl('X Y');
  h.track(el);
  typeInto(h, el, 'X abc Y');
  el.content = 'X aZ';
  h.prune((x) => x === el, undefined, undefined, [el]);
  const before = changes.count;
  await h.undo();
  assert.equal(el.content, 'X aZ', 'the text element is not changed');
  assert.deepEqual(state, { a: 1 }, 'the entry before it is kept');
  assert.equal(h.undoLabel, 'a');
  assert.equal(h.canRedo, false, 'the dropped entry is not redone');
  assert.deepEqual(told, [['typing', 'undo']]);
  assert.equal(changes.count, before + 1, 'onChange is called for the dropped entry');
  await h.undo();
  assert.deepEqual(state, { a: 0 });
  assert.deepEqual(told, [['typing', 'undo']], 'an undo that is made does not tell refused');
});

test('a redo drops an entry of typing that cannot be redone, tells refused of it, and keeps the entry after it for the next redo', async () => {
  const { h } = texts();
  const told = [];
  h.refused = (entry, way) => told.push([entry.label, way]);
  const el = textEl('X Y');
  h.track(el);
  typeInto(h, el, 'X abc Y');
  const state = { a: 0 };
  h.push(change(state, 'a', 1));
  await h.undo();
  await h.undo();
  assert.equal(el.content, 'X Y');
  // another person replaces the text around the point of the typing
  el.content = 'Z';
  await h.redo();
  assert.equal(el.content, 'Z', 'the text element is not changed');
  assert.deepEqual(told, [['typing', 'redo']]);
  assert.equal(h.redoLabel, 'a');
  assert.equal(h.canUndo, false, 'the dropped entry is not undone');
  await h.redo();
  assert.deepEqual(state, { a: 1 });
});

// ' one' ends with the letter that ends "slide", and ' two' does not
for (const word of [' two', ' one']) {
  test(`a redo of "${word}" right after its undo puts it back before an insertion of another person after the typing had ended`, async () => {
    const { h } = texts();
    const el = textEl('Second slide');
    h.track(el);
    typeInto(h, el, `Second slide${word}`);
    h.break();
    el.content = `Second slide${word}XY`;
    h.prune((x) => x === el, undefined, undefined, [el]);
    h.carry(el);
    await h.undo();
    assert.equal(el.content, 'Second slideXY');
    await h.redo();
    assert.equal(el.content, `Second slide${word}XY`);
    assert.equal(h.undoLabel, 'typing');
    // a step after a change of another person goes from the text that the step before wrote
    el.content = `QSecond slide${word}XY`;
    await h.undo();
    assert.equal(el.content, 'QSecond slideXY');
    await h.redo();
    assert.equal(el.content, `QSecond slide${word}XY`);
  });
}

test('an error of an undo other than a refusal is passed on, and the entry before it is not undone', async () => {
  const { h } = texts();
  const state = { a: 0 };
  h.push(change(state, 'a', 1));
  h.push({ label: 'broken', undo: () => { throw new Error('broken'); }, redo: () => {} });
  await assert.rejects(h.undo(), /broken/);
  assert.deepEqual(state, { a: 1 });
  assert.equal(h.undoLabel, 'a');
});

test('typing inside a transaction is undone with the transaction over the changes of others', async () => {
  const { h } = texts();
  const el = textEl('X Y');
  h.track(el);
  await h.transact('Two', () => typeInto(h, el, 'X abc Y'));
  el.content = 'X aZ';
  await h.undo();
  assert.equal(el.content, 'X Y');
});

test('a retract of an entry of typing that cannot be undone takes it out of the history as it is', async () => {
  const { h } = texts();
  const el = textEl('X Y');
  h.track(el);
  typeInto(h, el, 'X abc Y');
  el.content = 'X aZ';
  h.prune((x) => x === el, undefined, undefined, [el]);
  await h.retract(h.last);
  assert.equal(el.content, 'X aZ');
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
});

// outside a session, a text element is changed only by its person and by the editor. a change that
// the history was not told of, e.g. the closing brace that the list of citations takes out of a
// typed \cite{key}, is then not an edit of another person
test('outside a session, an undo and a redo of typing write the old text over a change that the history was not told of', async () => {
  const h = new History({ snapshot: (el) => el.content, restore: async (el, content) => void (el.content = content), onChange: () => {}, alone: () => true });
  const el = textEl('Cited words');
  h.track(el);
  typeInto(h, el, 'Cited words \\cite{gomez2004}');
  h.break();
  el.content = 'Cited words \\cite{gomez2004';
  await h.undo();
  assert.equal(el.content, 'Cited words');
  assert.equal(h.redoLabel, 'typing', 'the entry is not dropped');
  el.content = 'Cited';
  await h.redo();
  assert.equal(el.content, 'Cited words \\cite{gomez2004}');
  assert.equal(h.undoLabel, 'typing');
});

test('a wait for the history to settle during an amend sets no timer, and ends with the amend', async () => {
  const h = history();
  const log = [];
  await h.transact('a', () => h.push(slow(log, 'x', 0)));
  const entry = h.last;
  let end;
  const amend = h.amend(entry, () => new Promise((done) => (end = done)));
  const set = globalThis.setTimeout;
  let timers = 0;
  globalThis.setTimeout = (...args) => (timers++, set(...args));
  let settled = false;
  const wait = h.settle().then(() => (settled = true));
  try {
    await new Promise((done) => setImmediate(done));
    assert.equal(settled, false);
    end();
    await Promise.all([amend, wait]);
  } finally {
    globalThis.setTimeout = set;
  }
  assert.equal(settled, true);
  assert.equal(timers, 0);
});
