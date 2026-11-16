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
  assert.deepEqual(state, { a: 0 }, 'the entry before it is undone');
  assert.equal(h.canUndo, false);
});

test('an undo drops an entry of typing that cannot be undone, and undoes the entry before it in the same step', async () => {
  const { h, changes } = texts();
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
  assert.deepEqual(state, { a: 0 });
  assert.equal(h.canUndo, false);
  assert.equal(h.redoLabel, 'a');
  assert.ok(changes.count >= before + 2, 'onChange is called for the dropped entry and for the undo');
  await h.redo();
  assert.deepEqual(state, { a: 1 });
  assert.equal(h.canRedo, false, 'the dropped entry is not redone');
});

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
