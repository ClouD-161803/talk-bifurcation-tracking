// two and three people who type in one paragraph of a session in Chrome, on the edit command
// started on a temporary talk folder: a word that an input method composes reaches the others only
// once it is committed, and the keys, deletions, and pastes of the others during the composition,
// at its caret or around it, are kept with the word at its point. the keys of two people that come
// in one answer on both sides of an unread key of the person are kept with it, also after a long
// paste, the same letter typed by both is kept twice, and the same replacement made by both is kept
// once. an unread key stays whole beside a key of another person, and goes before an element that
// another person puts around the word after it. a key inside a word stays inside the element that
// another person puts around this word, whichever of the two the edit command hears first. two
// people who take turns at one point each keep a run of their own. an undo next to a space that the
// browser writes as &nbsp; removes only the typing of the person, and an undo of a word whose
// trailing space another browser took away is refused. the keys of the person before a composition
// that starts while the history is busy are kept

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, STATE, TEXT, converge, loads, show } from './helpers/client.mjs';
import { press, typeKeys } from './helpers/editor.mjs';
import { NET } from './helpers/net.mjs';
import { BUBBLE, el, leave, select, session, unbubble } from './helpers/presence.mjs';
import { until } from './helpers/session.mjs';

const p = el(1, 'p');
const para = (text) => text.match(/<p>[^\n]*<\/p>/g)[1];
const loose = (text) => text.replaceAll('&nbsp;', ' ');
const STEPS = ['n', 'ni', 'nih', 'niha', 'nihao'];

// the caret of a page put into the paragraph, at offset of its first text node
const caretAt = (page, offset) => page.evaluate(`(() => { const q = ${p}; q.focus(); getSelection().collapse(q.firstChild, ${offset}); return document.activeElement === q; })()`);
// every text that the paragraph of a page shows from now on, in window.__shown
const record = (page) => page.evaluate(`(() => {
  const q = ${p};
  window.__shown = [q.textContent];
  new MutationObserver(() => window.__shown.push(q.textContent)).observe(q, { characterData: true, childList: true, subtree: true });
  return true;
})()`);
const shown = (page) => page.evaluate('window.__shown');

// the paragraph read without the keys of others, which must be the paragraph before the composition
const without = (text, keys) => [...text].filter((c) => !keys.includes(c)).join('');

/**
 * Ana composes nihao at the offset 6 of the paragraph and commits 你好, while each other page types
 * its key at each step. index.html and the text that Ana reads take every key before the next step,
 * and the state line of Ana says that her deck is saved, since nothing waits for the composition.
 * The paragraph of index.html at each step is returned in files, and each text that the page of
 * another person showed before the commit in views.
 */
async function compose(server, ana, others) {
  const typed = others.map(() => '');
  const files = [];
  for (const s of STEPS) {
    await ana.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
    for (const [i, { page, keys }] of others.entries()) {
      const key = keys[typed[i].length % keys.length];
      await typeKeys(page, key);
      typed[i] += key;
    }
    const count = typed.join('').length;
    files.push(await until(async () => {
      const text = server.read();
      const got = para(text);
      return [...got].filter((c) => 'yz'.includes(c)).length === count && (await ana.evaluate(TEXT)) === text && (await ana.evaluate(STATE)) === 'Saved to index.html' ? got : null;
    }, `the ${count} keys of the others in index.html and in the text that Ana reads, and Saved on her page, with ${s} composed`));
  }
  const views = [];
  for (const { page } of others) views.push(...(await shown(page)));
  await ana.send('Input.insertText', { text: '你好' });
  return { typed, files, views };
}

// index.html and the pages of the others did not hold the composing word before its commit
function unseen({ files, views }) {
  for (const file of files) assert.equal(without(file, 'yz'), '<p>Second slide</p>', 'index.html does not hold the composing word');
  for (const text of views) assert.equal(without(text, 'yz'), 'Second slide', 'the page of another person does not show the composing word');
}

test('a word composed with an input method reaches the others once it is committed, and the keys that another person types at its caret during the composition are kept', { timeout: 300_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  await record(ben);
  const done = await compose(server, ana, [{ page: ben, keys: 'yz' }]);
  const [keys] = done.typed;
  const text = para(await converge(server, pages));
  assert.equal([...text].filter((c) => 'yz'.includes(c)).join(''), keys, `every key of Ben is in ${text}`);
  assert.equal(text.split('你好').length, 2, `the committed word is once in ${text}`);
  unseen(done);
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('a word composed with an input method between the keys of two other people, one before it and one after it, keeps every key of both', { timeout: 360_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben', 'Cleo']);
  const [ana, ben, cleo] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 0));
  assert.ok(await caretAt(cleo, 'Second slide'.length));
  await record(ben);
  await record(cleo);
  const done = await compose(server, ana, [{ page: ben, keys: 'y' }, { page: cleo, keys: 'z' }]);
  const text = para(await converge(server, pages));
  assert.equal(text, '<p>yyyyySecond你好 slidezzzzz</p>');
  unseen(done);
  assert.deepEqual([ana.errors, ben.errors, cleo.errors], [[], [], []]);
});

test('the letters of two people who take turns at one point each stay in a run of their own', { timeout: 270_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  // each turn is read by both pages before the next one, hence no key meets an unread key
  for (const [page, keys] of [[ben, 'ab'], [ana, 'yz'], [ben, 'c'], [ana, 'w']]) {
    await typeKeys(page, keys);
    await converge(server, pages);
  }
  assert.equal(para(server.read()), '<p>Secondyzwabc slide</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('the keys of two other people that come in one answer on both sides of an unread key of the person are kept with it', { timeout: 300_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben', 'Cleo'], { pages: [{ script: NET }] });
  const [ana, ben, cleo] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 6));
  // a key of Ana typed after the client read the deck and before the apply of both keys reads it
  await ana.evaluate(`(() => {
    const port = window.BeesonEditor.session;
    const apply = port.apply;
    window.__armed = true;
    port.apply = function (text) {
      if (window.__armed && text.includes('BSecond slideC')) {
        window.__armed = false;
        document.execCommand('insertText', false, 'A');
      }
      return apply.call(this, text);
    };
    return true;
  })()`);
  // the poll of Ana is held, hence both keys come in its next answer
  await ana.evaluate(`__net.rule('/.session/events', 'hold') && __net.drop('/.session/events')`);
  await until(() => ana.evaluate('__net.held.length > 0'), 'a held poll of Ana');
  assert.ok(await caretAt(ben, 0));
  await typeKeys(ben, 'B');
  await caretAtEnd(cleo, p);
  await typeKeys(cleo, 'C');
  await until(() => para(server.read()) === '<p>BSecond slideC</p>', 'both keys in index.html');
  await ana.evaluate(`__net.clear() && __net.release('/.session/events')`);
  await until(() => ana.evaluate('window.__armed === false'), 'the key of Ana at the apply');
  const text = await converge(server, pages);
  assert.equal(para(text), '<p>BSecondA slideC</p>');
  assert.deepEqual([ana.errors, ben.errors, cleo.errors], [[], [], []]);
});

// the selection of a page put on the offsets a to b of the first text node of the paragraph
const selectIn = (page, a, b) => page.evaluate(`(() => { const q = ${p}; q.focus(); getSelection().setBaseAndExtent(q.firstChild, ${a}, q.firstChild, ${b}); return document.activeElement === q; })()`);

/**
 * Ana types key at her selection a to b inside the apply whose text holds marker, i.e. after her
 * client read the deck, while her poll is held until the change of the others is in index.html, so
 * that all of it comes in one answer. Ana then types more at her caret. Returns the paragraph that
 * the pages and index.html agree on.
 */
async function race(t, { names = ['Ana', 'Ben'], edits = [], ana: [a, b, key], marker, ben, more = '' }) {
  const { server, pages } = await session(t, names, { edits, pages: [{ script: NET }] });
  const [ana, ...others] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await selectIn(ana, a, b));
  await ana.evaluate(`(() => {
    const port = window.BeesonEditor.session;
    const apply = port.apply;
    window.__armed = true;
    port.apply = function (text) {
      if (window.__armed && text.includes(${JSON.stringify(marker)})) {
        window.__armed = false;
        document.execCommand('insertText', false, ${JSON.stringify(key)});
      }
      return apply.call(this, text);
    };
    return true;
  })()`);
  await ana.evaluate(`__net.rule('/.session/events', 'hold') && __net.drop('/.session/events')`);
  await until(() => ana.evaluate('__net.held.length > 0'), 'a held poll of Ana');
  await ben(...others);
  await until(() => para(server.read()).includes(marker), 'the change of the others in index.html');
  await ana.evaluate(`__net.clear() && __net.release('/.session/events')`);
  await until(() => ana.evaluate('window.__armed === false'), 'the key of Ana at the apply');
  let text = para(await converge(server, pages));
  if (more) {
    await front(ana);
    await typeKeys(ana, more);
    text = para(await converge(server, pages));
  }
  assert.deepEqual(pages.map((page) => page.errors), pages.map(() => []));
  return text;
}

// the history of page settled after a command of it
const run = async (page, id) => {
  await front(page);
  await page.evaluate(`${C}.app.commands.run(${JSON.stringify(id)})`);
  await page.evaluate(`${C}.app.history.idle().then(() => true)`);
};

test('an undo of typing next to a space that the browser rewrote as &nbsp; removes only the typing of the person, and the undo of the other person removes only theirs', { timeout: 270_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>Second slide</p>', '  <p>Second <code>x+1</code> slide</p>']] });
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  // both carets after the space that follows the code element
  const after = (page) => page.evaluate(`(() => { const q = ${p}; q.focus(); getSelection().collapse(q.lastChild, 1); return document.activeElement === q; })()`);
  assert.ok(await after(ana));
  await typeKeys(ana, 'ab cd');
  await converge(server, pages);
  assert.match(await ana.evaluate(`${p}.innerHTML`), /<\/code>&nbsp;ab cdslide$/, 'Chrome writes the space before the typing of Ana as &nbsp;');
  assert.ok(await after(ben));
  await typeKeys(ben, 'q');
  let text = await converge(server, pages);
  assert.equal(loose(para(text)), '<p>Second <code>x+1</code> qab cdslide</p>');
  await run(ana, 'edit.undo');
  text = await converge(server, pages);
  assert.equal(loose(para(text)), '<p>Second <code>x+1</code> qslide</p>', 'the undo of Ana removes her typing alone');
  await run(ben, 'edit.undo');
  text = await converge(server, pages);
  assert.equal(loose(para(text)), '<p>Second <code>x+1</code> slide</p>', 'the undo of Ben removes his typing alone');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('an undo of a word whose trailing space the browser of another person took away is refused, and keeps the letters of the other person', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' foo ');
  await converge(server, pages);
  await caretAtEnd(ben, p);
  await typeKeys(ben, 'bar');
  let text = await converge(server, pages);
  assert.equal(para(text), '<p>Second slide foobar</p>', 'Chrome of Ben takes away the trailing space of Ana');
  assert.equal(await ana.evaluate(`${C}.app.history.undoLabel`), 'typing');
  await run(ana, 'edit.undo');
  text = await converge(server, pages);
  assert.equal(para(text), '<p>Second slide foobar</p>');
  assert.equal(await ana.evaluate(`${C}.app.history.undoLabel`), null, 'the refused entry is dropped');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

const NOT_UNDONE = 'Your typing cannot be undone without changing the letters of another person.';
const NOT_REDONE = 'Your typing cannot be redone without changing the letters of another person.';
// the bubble of a page with its text and its box, and whether it is under or over the paragraph,
// at its left
const BUBBLE_AT = `(() => {
  const b = document.querySelector('.beeson-bubble');
  if (!b) return null;
  const r = b.getBoundingClientRect(), q = ${p}.getBoundingClientRect();
  return { text: b.textContent, top: r.top, center: r.left + r.width / 2, middle: innerWidth / 2, beside: Math.abs(r.left - Math.max(8, q.left)) < 2 && (r.top >= q.bottom || r.bottom <= q.top) };
})()`;
const STYLE = (expression) => `${expression}.getAttribute('style') ?? ''`;

test('an undo of typing that cannot be undone keeps the change before it and says why beside the text element, and the next undo takes this change', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ul = el(1, 'ul');
  await select(ana, ul);
  await run(ana, 'arrange.nudge.right.far');
  assert.match(await ana.evaluate(STYLE(ul)), /translate: 10px/);
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' foo ');
  await converge(server, pages);
  await caretAtEnd(ben, p);
  await typeKeys(ben, 'bar');
  let text = await converge(server, pages);
  assert.equal(para(text), '<p>Second slide foobar</p>', 'Chrome of Ben takes away the trailing space of Ana');
  await run(ana, 'edit.undo');
  const shown = await ana.evaluate(BUBBLE_AT);
  assert.equal(shown?.text, NOT_UNDONE);
  assert.ok(shown.beside, `the bubble is beside the paragraph, at ${JSON.stringify(shown)}`);
  assert.equal(await ana.evaluate(`${p}.innerHTML`), 'Second slide foobar');
  assert.match(await ana.evaluate(STYLE(ul)), /translate: 10px/, 'the nudge before the typing is kept');
  await unbubble(ana);
  await run(ana, 'edit.undo');
  assert.doesNotMatch(await ana.evaluate(STYLE(ul)), /translate/, 'the next undo takes the nudge');
  assert.equal(await ana.evaluate(BUBBLE), null, 'an undo that is made shows no bubble');
  text = await converge(server, pages);
  assert.equal(para(text), '<p>Second slide foobar</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('a redo of typing that cannot be redone says why at the top of the window, with the number of the slide, when its text element is on another slide', { timeout: 270_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' one');
  await converge(server, pages);
  await run(ana, 'edit.undo');
  assert.equal(await ana.evaluate(BUBBLE), null, 'an undo that is made shows no bubble');
  let text = await converge(server, pages);
  assert.equal(para(text), '<p>Second slide</p>');
  // the letters of Ben right after the point of the typing, which the redo cannot tell apart from
  // the e of slide
  await caretAtEnd(ben, p);
  await typeKeys(ben, 'XY');
  await converge(server, pages);
  await show(ana, 'One');
  await run(ana, 'edit.redo');
  const shown = await ana.evaluate(BUBBLE_AT);
  assert.equal(shown?.text, NOT_REDONE.replace('typing', 'typing on slide 2'));
  assert.ok(Math.abs(shown.center - shown.middle) < 2 && shown.top < 100, `the bubble is at the top of the window, at ${JSON.stringify(shown)}`);
  assert.equal(await ana.evaluate(`${C}.app.history.redoLabel`), null, 'the refused entry is dropped');
  text = await converge(server, pages);
  assert.equal(para(text), '<p>Second slideXY</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

// Mod+Z pressed on page until its history is empty, with the label of each undo
async function undoAll(page) {
  const labels = [];
  for (let label = await page.evaluate(`${C}.app.history.undoLabel`); label !== null && labels.length < 12; label = await page.evaluate(`${C}.app.history.undoLabel`)) {
    labels.push(label);
    await front(page);
    await press(page, 'Mod+Z');
    await page.evaluate(`${C}.app.history.idle().then(() => true)`);
  }
  return labels;
}

for (const [what, keys, made] of [
  ['a smart dash', ' it -- is', 'it — is'],
  ['smart quotes', ' say "hi"', 'say “hi”'],
  ['two smart quotes and a smart dash in one word', ' "a--b"', '“a—b”'],
  ['a span of Markdown', ' **bold** x', '<strong>bold</strong>'],
  ['a smart link', ' https://example.org x', '<a href="https://example.org">'],
]) {
  test(`${what} typed in a session, then a key of another person in the same paragraph, is taken out by the undos of the person`, { timeout: 240_000 }, async (t) => {
    const { server, pages } = await session(t, ['Ana', 'Ben']);
    const [ana, ben] = pages;
    for (const page of pages) await show(page, 'Two');
    for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await caretAtEnd(ana, p);
    await typeKeys(ana, keys);
    assert.ok(para(await converge(server, pages)).includes(made), 'the editor made the substitution');
    assert.ok(await caretAt(ben, 0));
    await typeKeys(ben, 'Q');
    await converge(server, pages);
    const labels = await undoAll(ana);
    const text = await converge(server, pages);
    assert.equal(para(text), '<p>QSecond slide</p>', `the paragraph after the undos ${JSON.stringify(labels)}`);
    assert.deepEqual([ana.errors, ben.errors], [[], []]);
  });
}

// ' one' ends with the letter that ends "slide", and ' two' does not
for (const word of [' two', ' one']) {
  test(`a redo of "${word}" right after its undo puts it back before the keys that another person typed right after it once the typing had ended`, { timeout: 270_000 }, async (t) => {
    const { server, pages } = await session(t, ['Ana', 'Ben']);
    const [ana, ben] = pages;
    for (const page of pages) await show(page, 'Two');
    for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await caretAtEnd(ana, p);
    await typeKeys(ana, word);
    // Ana types in the heading, hence her typing in the paragraph ends
    await caretAtEnd(ana, el(1, 'h2'));
    await typeKeys(ana, ' x');
    await converge(server, pages);
    await caretAtEnd(ben, p);
    await typeKeys(ben, 'XY');
    await converge(server, pages);
    await run(ana, 'edit.undo');
    await run(ana, 'edit.undo');
    assert.equal(para(await converge(server, pages)), '<p>Second slideXY</p>');
    await run(ana, 'edit.redo');
    assert.equal(para(await converge(server, pages)), `<p>Second slide${word}XY</p>`);
    assert.equal(await ana.evaluate(`${C}.app.history.undoLabel`), 'typing');
    assert.deepEqual([ana.errors, ben.errors], [[], []]);
  });
}

test('an undo of typing followed by typing in another text element keeps a word that another person removed and typed again', { timeout: 300_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' to');
  await caretAtEnd(ana, el(1, 'li'));
  await typeKeys(ana, 'x');
  await converge(server, pages);
  await caretAtEnd(ben, p);
  await press(ben, 'Backspace');
  await press(ben, 'Backspace');
  await converge(server, pages);
  await typeKeys(ben, 'to');
  assert.equal(para(await converge(server, pages)), '<p>Second slide to</p>');
  await run(ana, 'edit.undo');
  assert.match(await converge(server, pages), /<li>Alpha<\/li>/);
  await run(ana, 'edit.undo');
  assert.equal(para(await converge(server, pages)), '<p>Second slide to</p>', 'the word typed by Ben is kept');
  assert.equal(await ana.evaluate(BUBBLE), NOT_UNDONE);
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

const NOTES = el(1, 'aside.notes');
const ASIDE = '<aside class="notes">Notes of two<br>x</aside>';
const aside = (text) => text.match(/<aside class="notes">.*?<\/aside>/s)?.[0] ?? null;
const notesAt = (page, node) => page.evaluate(`(() => { const q = ${NOTES}; q.focus(); getSelection().collapse(q.${node}, 0); return document.activeElement === q; })()`);

for (const other of [false, true]) {
  test(`a dash item typed at the start of a line of the speaker notes is taken back by the undos of the person${other ? ' after another person typed at the start of the notes' : ''}, and given back by the redos`, { timeout: 450_000 }, async (t) => {
    const { server, pages } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>Second slide</p>', `  <p>Second slide</p>\n  ${ASIDE}`]] });
    const [ana, ben] = pages;
    for (const page of pages) {
      await show(page, 'Two');
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      if (!(await page.evaluate(`${C}.app.notes.shown()`))) await page.evaluate(`${C}.app.commands.run('view.notes')`);
    }
    await leave(ben);
    assert.ok(await notesAt(ana, 'lastChild'));
    await typeKeys(ana, '- one ');
    await ana.waitFor(`${NOTES}.innerHTML === 'Notes of two<ul><li>one x</li></ul>'`);
    await converge(server, pages);
    const q = other ? 'Q' : '';
    if (other) {
      await leave(ana);
      assert.ok(await notesAt(ben, 'firstChild'));
      await typeKeys(ben, 'Q');
      await ben.waitFor(`${NOTES}.innerHTML.startsWith('QNotes')`);
      await converge(server, pages);
      await leave(ben);
    }
    const steps = [];
    for (let label = await ana.evaluate(`${C}.app.history.undoLabel`); label !== null && steps.length < 8; label = await ana.evaluate(`${C}.app.history.undoLabel`)) {
      await run(ana, 'edit.undo');
      steps.push([label, aside(await converge(server, pages))]);
    }
    assert.equal(aside(server.read()), ASIDE.replace('Notes', `${q}Notes`), `the notes after the undos ${JSON.stringify(steps)}`);
    assert.deepEqual(steps.map(([label]) => label), ['typing', 'Arrows', 'typing']);
    for (const [i, [label, notes]] of steps.entries()) assert.notEqual(notes, steps[i - 1]?.[1], `undo ${i + 1} (${label}) changed the notes: ${JSON.stringify(steps)}`);
    for (let i = 0; i < steps.length; i++) await run(ana, 'edit.redo');
    assert.equal(aside(await converge(server, pages)), `<aside class="notes">${q}Notes of two<ul><li>one x</li></ul></aside>`);
    assert.deepEqual([ana.errors, ben.errors], [[], []]);
  });
}

test('an undo of typing in the speaker notes that cannot be undone says why at the top of the window while the notes are hidden', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>Second slide</p>', `  <p>Second slide</p>\n  ${ASIDE}`]] });
  const [ana, ben] = pages;
  for (const page of pages) {
    await show(page, 'Two');
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    if (!(await page.evaluate(`${C}.app.notes.shown()`))) await page.evaluate(`${C}.app.commands.run('view.notes')`);
  }
  // the trailing space of Ana, which Chrome of Ben takes away, as in the test of the paragraph above
  await caretAtEnd(ana, NOTES);
  await typeKeys(ana, ' foo ');
  await converge(server, pages);
  await caretAtEnd(ben, NOTES);
  await typeKeys(ben, 'bar');
  assert.equal(aside(await converge(server, pages)), ASIDE.replace('x<', 'x foobar<'));
  await leave(ben);
  await ana.evaluate(`${C}.app.commands.run('view.notes')`);
  assert.equal(await ana.evaluate(`${NOTES}.getClientRects().length`), 0, 'the notes are hidden');
  await run(ana, 'edit.undo');
  const shown = await ana.evaluate(BUBBLE_AT);
  assert.equal(shown?.text, NOT_UNDONE);
  assert.ok(Math.abs(shown.center - shown.middle) < 2 && shown.top < 100, `the bubble is at the top of the window, at ${JSON.stringify(shown)}`);
  assert.equal(aside(await converge(server, pages)), ASIDE.replace('x<', 'x foobar<'));
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

// Ben makes the word slide bold or italic with a command
const format = (id) => async (page) => {
  assert.ok(await selectIn(page, 7, 12));
  await run(page, id);
};

test('an unread less-than sign that replaces a letter stays one character reference beside the key of another person after the letter', { timeout: 300_000 }, async (t) => {
  const text = await race(t, {
    ana: [8, 9, '<'],
    marker: 'slZide',
    ben: async (page) => {
      assert.ok(await selectIn(page, 9, 9));
      await typeKeys(page, 'Z');
    },
  });
  assert.equal(text, '<p>Second s&lt;Zide</p>');
});

test('an unread ampersand that replaces a letter stays one character reference beside the key of another person after the letter', { timeout: 300_000 }, async (t) => {
  const text = await race(t, {
    edits: [['  <p>Second slide</p>', '  <p>Second cat</p>']],
    ana: [8, 9, '&'],
    marker: 'caZt',
    ben: async (page) => {
      assert.ok(await selectIn(page, 9, 9));
      await typeKeys(page, 'Z');
    },
  });
  assert.equal(text, '<p>Second c&amp;Zt</p>');
});

test('an unread key at the start of a word that another person makes italic goes before the new element', { timeout: 300_000 }, async (t) => {
  const text = await race(t, { ana: [7, 7, 'Z'], marker: '<em>slide</em>', ben: format('text.italic') });
  assert.equal(text, '<p>Second Z<em>slide</em></p>');
});

// a link is put around the selected characters as one inline element, as bold and italic are
const LINK = '<a href="https://example.org">';
const link = async (page) => {
  assert.ok(await selectIn(page, 7, 12));
  await front(page);
  await page.evaluate(`${C}.app.commands.run('text.link', { href: 'https://example.org' })`);
  await page.evaluate(`${C}.app.history.idle().then(() => true)`);
};

// the formats that Ben puts around the word slide, each with its start tag and its end tag
const FORMATS = [
  ['italic', format('text.italic'), '<em>', '</em>'],
  ['a link', link, LINK, '</a>'],
];

test('an unread key at the start of a word that another person links goes before the link', { timeout: 300_000 }, async (t) => {
  const text = await race(t, { ana: [7, 7, 'Z'], marker: `${LINK}slide</a>`, ben: link });
  assert.equal(text, `<p>Second Z${LINK}slide</a></p>`);
});

test('an unread key inside a word that another person makes italic or links stays inside the new element, and so does the next key of the person', { timeout: 570_000 }, async (t) => {
  for (const [name, act, open, close] of FORMATS) {
    await t.test(name, async (t) => {
      const text = await race(t, { ana: [9, 9, 'Z'], marker: `${open}slide${close}`, ben: act, more: 'Y' });
      assert.equal(text, `<p>Second ${open}slZYide${close}</p>`);
    });
  }
});

/**
 * Ben makes a change that reaches index.html while the poll of Ana is held, and Ana makes hers
 * before her page hears of it. The authority thus refuses the operation of Ana, and her page merges
 * the two. Ana then types more at her caret. Returns the paragraph that the pages and index.html
 * agree on.
 */
async function unheard(t, { ben, file, ana, mine, more = '' }) {
  const { server, pages } = await session(t, ['Ana', 'Ben'], { pages: [{ script: NET }] });
  const [first] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await first.evaluate(`__net.rule('/.session/events', 'hold') && __net.drop('/.session/events')`);
  await until(() => first.evaluate('__net.held.length > 0'), 'a held poll of Ana');
  await ben(pages[1]);
  await until(() => para(server.read()) === `<p>Second ${file}</p>`, 'the change of Ben in index.html');
  await ana(first);
  await until(() => first.evaluate(`${C}.snapshot().mine.includes(${JSON.stringify(`<p>Second ${mine}</p>`)})`), 'the change of Ana in the text of her client');
  await first.evaluate(`__net.clear() && __net.release('/.session/events')`);
  let text = para(await converge(server, pages));
  if (more) {
    await front(first);
    await typeKeys(first, more);
    text = para(await converge(server, pages));
  }
  assert.deepEqual(pages.map((page) => page.errors), pages.map(() => []));
  return text;
}

// a key typed inside the word slide
const inside = async (page) => {
  assert.ok(await selectIn(page, 9, 9));
  await typeKeys(page, 'Z');
};

test('a key inside a word and a format around this word, each made before its page hears of the other, are both kept', { timeout: 1110_000 }, async (t) => {
  for (const [name, act, open, close] of FORMATS) {
    await t.test(`the key of Ben, then ${name} of Ana`, async (t) => {
      const text = await unheard(t, { ben: inside, file: 'slZide', ana: act, mine: `${open}slide${close}` });
      assert.equal(text, `<p>Second ${open}slZide${close}</p>`);
    });
    await t.test(`${name} of Ben, then the key of Ana and one more`, async (t) => {
      const text = await unheard(t, { ben: act, file: `${open}slide${close}`, ana: inside, mine: 'slZide', more: 'Y' });
      assert.equal(text, `<p>Second ${open}slZYide${close}</p>`);
    });
  }
});

test('a word composed at the start of a word that another person makes bold during the composition goes before the new element', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben']);
  const [ana, ben] = pages;
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  assert.ok(await caretAt(ana, 7));
  for (const s of ['n', 'ni']) await ana.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
  await format('text.bold')(ben);
  await until(() => para(server.read()).includes('<strong>'), 'the bold of Ben in index.html');
  await until(async () => (await ana.evaluate(TEXT)).includes('<strong>'), 'the bold of Ben in the text that Ana reads');
  await ana.send('Input.imeSetComposition', { text: 'nih', selectionStart: 3, selectionEnd: 3 });
  await ana.send('Input.insertText', { text: '你好' });
  const text = para(await converge(server, pages));
  assert.equal(text, '<p>Second 你好<strong>slide</strong></p>');
  assert.deepEqual([await loads(ana), ana.errors, ben.errors], [1, [], []], 'the page of Ana is not loaded again');
});

const prose = 'The spacecraft leaves the halo orbit near the second Lagrange point and follows the stable manifold toward the Moon. ';
for (const [what, paste, words, at, over = 0] of [
  ['more than 500 characters', 'x'.repeat(600), 'Second slide', 6],
  ['1,200 characters of English prose', prose.repeat(11).slice(0, 1200), 'Second slide', 6],
  ['600 Chinese characters', '天地玄黄宇宙洪荒日月盈昃辰宿列张'.repeat(40).slice(0, 600), '今天我们讨论轨道', 4],
  ['600 characters of English prose over the first word', prose.repeat(6).slice(0, 600), 'Second slide', 9, 6],
]) {
  test(`a paste of ${what} and a key of a third person on the other side of an unread key of the person are kept with it`, { timeout: 300_000 }, async (t) => {
    const text = await race(t, {
      names: ['Ana', 'Ben', 'Cleo'],
      edits: words === 'Second slide' ? [] : [['  <p>Second slide</p>', `  <p>${words}</p>`]],
      ana: [at, at, 'A'],
      marker: `${words.slice(over)}C`,
      ben: async (ben, cleo) => {
        assert.ok(await selectIn(ben, 0, over));
        await ben.evaluate(`document.execCommand('insertText', false, ${JSON.stringify(paste)})`);
        await caretAtEnd(cleo, p);
        await typeKeys(cleo, 'C');
      },
    });
    assert.equal(text, `<p>${paste}${words.slice(over, at)}A${words.slice(at)}C</p>`);
  });
}

test('the same letter typed at one point by another person and as an unread key of the person is kept twice', { timeout: 300_000 }, async (t) => {
  const text = await race(t, {
    ana: [6, 6, 'e'],
    marker: 'Seconde',
    ben: async (ben) => {
      assert.ok(await caretAt(ben, 6));
      await typeKeys(ben, 'e');
    },
  });
  assert.equal(text, '<p>Secondee slide</p>');
});

// the diff of each page gives the change as a removal and an insertion, e.g. of sli and ck for
// slide into deck, which are one change of each person
for (const [words, a, b, word, want] of [
  ['Second slide', 7, 12, 'deck', 'Second deck'],
  ['Second teh slide', 7, 10, 'the', 'Second the slide'],
]) {
  test(`the same replacement of ${words.slice(a, b)} by ${word} made by another person and as an unread change of the person is kept once`, { timeout: 300_000 }, async (t) => {
    const text = await race(t, {
      edits: words === 'Second slide' ? [] : [['  <p>Second slide</p>', `  <p>${words}</p>`]],
      ana: [a, b, word],
      marker: want,
      ben: async (ben) => {
        assert.ok(await selectIn(ben, a, b));
        await ben.evaluate(`document.execCommand('insertText', false, ${JSON.stringify(word)})`);
      },
    });
    assert.equal(text, `<p>${want}</p>`);
  });
}

// two pages in the paragraph, with the focus of each emulated, so that both hold a caret at once
async function pair(t) {
  const s = await session(t, ['Ana', 'Ben']);
  for (const page of s.pages) await show(page, 'Two');
  for (const page of s.pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return s;
}

// Ana composes each step, and act(i) runs on the page of Ben after step i. when act returns true,
// the step waits until index.html changes and Ana reads it
async function stepped(server, ana, steps, act) {
  for (const [i, s] of steps.entries()) {
    await ana.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
    const was = server.read();
    if (await act(i)) await until(async () => server.read() !== was && (await ana.evaluate(TEXT)) === server.read(), `the edit of Ben with ${s} composed`);
  }
}

test('a key of another person at the caret of a composition that equals the first letter of the reading is kept, at each step', { timeout: 270_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  await stepped(server, ana, ['n', 'ni', 'nih'], async () => (await typeKeys(ben, 'n'), true));
  await ana.send('Input.insertText', { text: '你好' });
  assert.equal(para(await converge(server, pages)), '<p>Secondnnn你好 slide</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('two keys of another person at the caret of a composition, the first of which equals the reading, are kept', { timeout: 270_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  await stepped(server, ana, ['n', 'ni', 'nih'], async (i) => (i === 0 ? (await typeKeys(ben, 'nx'), true) : false));
  await ana.send('Input.insertText', { text: '你好' });
  assert.equal(para(await converge(server, pages)), '<p>Secondnx你好 slide</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('a letter that another person deletes before the caret of a composition whose reading starts with it stays deleted', { timeout: 270_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 6));
  await stepped(server, ana, ['d', 'da', 'dao'], async (i) => (i === 1 ? (await press(ben, 'Backspace'), true) : false));
  await ana.send('Input.insertText', { text: '到' });
  assert.equal(para(await converge(server, pages)), '<p>Secon到 slide</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('a sentence that another person pastes over the paragraph around the caret of a composition is kept whole, with the committed word once', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  await ana.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
  assert.ok(await ben.evaluate(`(() => { const q = ${p}; q.focus(); getSelection().selectAllChildren(q); return document.activeElement === q; })()`));
  await ben.send('Input.insertText', { text: 'Secret plan' });
  await until(async () => para(server.read()) === '<p>Secret plan</p>' && (await ana.evaluate(TEXT)) === server.read(), 'the sentence of Ben in index.html and in the text that Ana reads');
  await ana.send('Input.insertText', { text: '你好' });
  assert.equal(para(await converge(server, pages)), '<p>Secret你好 plan</p>');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

test('a key typed right before a composition that starts while an apply waits reaches index.html before the commit', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await caretAt(ana, 6));
  assert.ok(await caretAt(ben, 0));
  // the key x of Ana and the start of her composition come while the apply of the key of Ben waits
  await ana.evaluate(`(() => {
    const port = window.BeesonEditor.session;
    const apply = port.apply;
    window.__armed = true;
    port.apply = function (text) {
      const r = apply.call(this, text);
      if (window.__armed && text.includes('BSecond')) {
        window.__armed = false;
        document.execCommand('insertText', false, 'x');
        ${p}.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      }
      return r;
    };
    return true;
  })()`);
  await typeKeys(ben, 'B');
  await until(() => ana.evaluate('window.__armed === false'), 'the key of Ana at the apply');
  await until(() => para(server.read()) === '<p>BSecondx slide</p>', 'the key of Ana in index.html during the composition');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

const first = (text) => text.match(/<p>[^\n]*<\/p>/g)[0];

// Ana types MN in the paragraph of slide One, which her client reads, and starts a composition in
// the paragraph of slide Two while a transaction of her history is open, as an undo with a TeX
// restore, a paste of a picture, or an inline formula keeps one open. the test ends the transaction
// during the composition
for (const between of [false, true]) {
  test(`the keys of the person before a composition that starts while the history is busy stay in index.html${between ? ', also with a key of another person during the composition' : ''}`, { timeout: 300_000 }, async (t) => {
    const { server, pages } = await pair(t);
    const [ana, ben] = pages;
    await show(ana, 'One');
    await caretAtEnd(ana, el(0, 'p'));
    await typeKeys(ana, 'MN');
    await until(async () => first(server.read()) === '<p>First slideMN</p>' && (await ana.evaluate(`${C}.acked()`)), 'MN in index.html');
    await show(ana, 'Two');
    assert.ok(await caretAt(ana, 6));
    await ana.evaluate(`(() => { ${C}.app.history.transact('Wait', () => new Promise((end) => (window.__end = end))); return true; })()`);
    await ana.send('Input.imeSetComposition', { text: 'K', selectionStart: 1, selectionEnd: 1 });
    await ana.evaluate(`(window.__end(), ${C}.app.history.settle().then(() => true))`);
    await ana.send('Input.imeSetComposition', { text: 'KJ', selectionStart: 2, selectionEnd: 2 });
    if (between) {
      await caretAtEnd(ben, el(1, 'h2'));
      await typeKeys(ben, 'Z');
      await until(async () => (await ana.evaluate(TEXT)).includes('TwoZ'), 'the key of Ben in the text that Ana reads');
    }
    await until(async () => (await ana.evaluate(`${C}.acked()`)) && (await ana.evaluate(TEXT)) === server.read(), 'the text that Ana reads during the composition in index.html');
    assert.equal(first(server.read()), '<p>First slideMN</p>', 'index.html keeps MN during the composition');
    await ana.send('Input.insertText', { text: '你好' });
    const text = await converge(server, pages);
    assert.equal(`${first(text)} ${para(text)}`, '<p>First slideMN</p> <p>Second你好 slide</p>');
    assert.deepEqual([ana.errors, ben.errors], [[], []]);
  });
}

// a transaction of the history of a page, open until the test calls window.__end, as an undo with a
// TeX restore, a paste of a picture, or an inline formula keeps one open
const HOLD = `${C}.app.history.transact('Wait', () => new Promise((end) => (window.__end = end)))`;
const RELEASE = `(window.__end(), ${C}.app.history.settle().then(() => true))`;
const slideOf = (text, i) => text.match(/<section>[^]*?<\/section>/g)[i];
const REMOVE_LIST = `${C}.app.doc.remove(${el(1, 'ul')})`;

// Ana composes ni at the caret of Ben, who types y, which her page holds back. her history is busy
// from the end of this composition until the next one has started, and Ben types Z at the start or
// at the end of the paragraph during the next one. with removal, the transaction also removes the
// list of the slide
for (const [z, removal] of [[null], ['start'], ['end'], ['start', true]]) {
  test(`a key of another person that a composition held back is kept when the next composition starts while the history is busy${z ? `, also with a key at the ${z} of the paragraph during it` : ''}${removal ? ' and a removal of another element of the slide in the transaction' : ''}`, { timeout: 300_000 }, async (t) => {
    const { server, pages } = await pair(t);
    const [ana, ben] = pages;
    await front(ana);
    assert.ok(await caretAt(ana, 6));
    assert.ok(await caretAt(ben, 6));
    await ana.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
    await typeKeys(ben, 'y');
    await until(async () => para(server.read()) === '<p>Secondy slide</p>' && (await ana.evaluate(TEXT)) === server.read(), 'the key of Ben in index.html and in the text that Ana reads');
    assert.ok(await ana.evaluate(`(window.addEventListener('compositionend', () => { ${HOLD}; ${removal ? REMOVE_LIST : ''} }, { capture: true, once: true }), true)`));
    await ana.send('Input.insertText', { text: '你好' });
    await ana.send('Input.imeSetComposition', { text: 'K', selectionStart: 1, selectionEnd: 1 });
    await ana.evaluate(RELEASE);
    await ana.send('Input.imeSetComposition', { text: 'KJ', selectionStart: 2, selectionEnd: 2 });
    if (z) {
      if (z === 'start') assert.ok(await caretAt(ben, 0));
      else await caretAtEnd(ben, p);
      await typeKeys(ben, 'Z');
      await until(async () => para(await ana.evaluate(TEXT)).includes('Z'), 'the key Z of Ben in the text that Ana reads');
    }
    await ana.send('Input.insertText', { text: '世界' });
    const text = await converge(server, pages);
    assert.equal(para(text), { start: '<p>ZSecondy你好世界 slide</p>', end: '<p>Secondy你好世界 slideZ</p>' }[z] ?? '<p>Secondy你好世界 slide</p>');
    assert.equal(slideOf(text, 1).includes('<ul>'), !removal);
    assert.deepEqual([ana.errors, ben.errors], [[], []]);
  });
}

const title = (text) => text.match(/<h2>[^\n]*<\/h2>/g)[1];
const h2 = el(1, 'h2');
// scripts that type MN at the end of the text element of an expression, or delete the letters MN
// at the end of the heading of slide Two, which the client reads at its next turn
const INSERT = (host) => `{ const h = ${host}; h.focus(); const r = document.createRange(); r.selectNodeContents(h); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('insertText', false, 'MN'); }`;
const DELETE = `{ const h = ${h2}; h.focus(); getSelection().setBaseAndExtent(h.firstChild, 3, h.firstChild, 5); document.execCommand('delete'); }`;

// MN typed by Ana at the end of the heading of slide Two, read by her client and in index.html,
// and in typedMNapplied also a key of Ben at the end of the paragraph, which her page applies
async function typedMN(server, [ana]) {
  await front(ana);
  await caretAtEnd(ana, h2);
  await typeKeys(ana, 'MN');
  await until(async () => title(server.read()) === '<h2>TwoMN</h2>' && (await ana.evaluate(`${C}.acked()`)), 'MN in index.html');
  await ana.evaluate(`${C}.app.history.break()`);
}
async function typedMNapplied(server, pages) {
  await typedMN(server, pages);
  await front(pages[1]);
  await caretAtEnd(pages[1], p);
  await typeKeys(pages[1], 'q');
  await converge(server, pages);
}

/**
 * Ana runs the script edit inside the transaction when inside is set, and right before it
 * otherwise, and starts a composition at the offset 6 of the paragraph, or of the text element of
 * the expression into, while the transaction is open. The test ends the transaction during the
 * composition. With at, Ben types Z at this offset of the paragraph during the composition.
 * Returns the text of index.html during the composition, and once Ana has committed 你好.
 */
async function busy(t, { prepare, edit, inside = true, at = null, into = p }) {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  await prepare?.(server, pages);
  await front(ana);
  assert.ok(await ana.evaluate(`(async () => {
    ${inside ? `${HOLD}; ${edit}` : `${edit}; ${HOLD}`};
    const q = ${into}; q.focus(); getSelection().collapse(q.firstChild, ${into === p ? 6 : 'q.firstChild.length'});
    return document.activeElement === q;
  })()`));
  await ana.send('Input.imeSetComposition', { text: 'K', selectionStart: 1, selectionEnd: 1 });
  await ana.evaluate(RELEASE);
  await ana.send('Input.imeSetComposition', { text: 'KJ', selectionStart: 2, selectionEnd: 2 });
  if (at !== null) {
    // Ben is not brought to the front, since the page of Ana would then be hidden, which ends her
    // composition
    assert.ok(await caretAt(ben, at));
    await typeKeys(ben, 'Z');
    await until(async () => para(await ana.evaluate(TEXT)).includes('Z'), 'the key of Ben in the text that Ana reads');
  }
  await until(async () => (await ana.evaluate(`${C}.acked()`)) && (await ana.evaluate(TEXT)) === server.read(), 'the text that Ana reads during the composition in index.html');
  const during = server.read();
  await ana.send('Input.insertText', { text: '你好' });
  const end = await converge(server, pages);
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
  return { during, end };
}

for (const [what, options, want] of [
  ['an insertion in another text element inside the transaction', { edit: INSERT(h2), at: 0 }, ['<h2>TwoMN</h2>', '<p>ZSecond你好 slide</p>']],
  ['an insertion in another text element inside the transaction', { edit: INSERT(h2) }, ['<h2>TwoMN</h2>', '<p>Second你好 slide</p>']],
  ['a deletion in another text element inside the transaction', { prepare: typedMN, edit: DELETE, at: 0 }, ['<h2>Two</h2>', '<p>ZSecond你好 slide</p>']],
  ['a deletion inside the transaction of letters that an apply wrote into the source', { prepare: typedMNapplied, edit: DELETE, at: 0 }, ['<h2>Two</h2>', '<p>ZSecond你好 slideq</p>']],
  ['an insertion in another text element right before the transaction', { edit: INSERT(h2), inside: false, at: 0 }, ['<h2>TwoMN</h2>', '<p>ZSecond你好 slide</p>']],
  ['an insertion in another text element right before the transaction', { edit: INSERT(h2), inside: false }, ['<h2>TwoMN</h2>', '<p>Second你好 slide</p>']],
  ['an insertion at the end of the composing paragraph inside the transaction', { edit: INSERT(p), at: 9 }, ['<h2>Two</h2>', '<p>Second你好 slZideMN</p>']],
]) {
  test(`${what}, which the client has not read when a composition starts while the history is busy, is kept${options.at === undefined ? '' : ', also with a key of another person between it and the composition'}`, { timeout: 300_000 }, async (t) => {
    const { end } = await busy(t, options);
    assert.deepEqual([title(end), para(end)], want);
  });
}

// the edits of the person that the client has not read are read at its first turn once the history
// is quiet, and are not held back with the composing word. in a slide with a removal, the edits of
// its texts are inside the edit of the slide
for (const [what, edit, slide, want] of [
  ['an insertion in another text element', INSERT(h2), 1, '<section>\n  <h2>TwoMN</h2>\n  <p>Second slide</p>\n  <ul>\n    <li>Alpha</li>\n    <li>Beta</li>\n  </ul>\n</section>'],
  ['an insertion in the composing paragraph', INSERT(p), 1, '<section>\n  <h2>TwoMN</h2>\n  <p>Second slideMN</p>\n  <ul>\n    <li>Alpha</li>\n    <li>Beta</li>\n  </ul>\n</section>'.replace('TwoMN', 'Two')],
  ['an insertion in another text element and a removal of another element of the composing slide', `${INSERT(h2)}; await ${REMOVE_LIST}`, 1, '<section>\n  <h2>TwoMN</h2>\n  <p>Second slide</p>\n</section>'],
  ['a change of the heading of another slide and a removal of the paragraph of this slide', `${el(0, 'h2')}.textContent = 'OneMN'; await ${C}.app.doc.remove(${el(0, 'p')})`, 0, '<section>\n  <h2>OneMN</h2>\n</section>'],
]) {
  test(`${what}, which the client has not read when a composition starts while the history is busy, ${what.includes(' and a ') ? 'reach' : 'reaches'} index.html during the composition`, { timeout: 300_000 }, async (t) => {
    assert.equal(slideOf((await busy(t, { edit })).during, slide), want);
  });
}

// the element is not in the source when the client reads rest, hence the client reads the deck
// through during the composition
test('a composition in a text element that the document model inserted while the history is busy keeps the element, the composing word, and a key of another person', { timeout: 300_000 }, async (t) => {
  const ul = el(1, 'ul');
  const { during, end } = await busy(t, { edit: `window.__new = (await ${C}.app.doc.insert('<p>New</p>', ${ul}.parentElement, ${ul}))[0]`, into: 'window.__new', at: 0 });
  assert.ok(slideOf(during, 1).includes('<p>New'));
  assert.deepEqual([para(end), slideOf(end, 1).match(/<p>New[^<]*<\/p>/)?.[0]], ['<p>ZSecond slide</p>', '<p>New你好</p>']);
});

// the content of the paragraph, with the reading K or KJ, is also in the heading after the removal,
// hence twice in the text of the slide, and the client reads the deck through during the composition
test('a composition in a text element whose content is twice in its slide after a removal while the history is busy keeps both edits and the composing word', { timeout: 300_000 }, async (t) => {
  const { end } = await busy(t, { edit: `${h2}.textContent = 'SecondKJ slide SecondK slide'; await ${REMOVE_LIST}` });
  assert.deepEqual([title(end), para(end), slideOf(end, 1).includes('<ul>')], ['<h2>SecondKJ slide SecondK slide</h2>', '<p>Second你好 slide</p>', false]);
});

// the content of an empty paragraph is written by an insertion at its start, which rest takes once
test('a composition in an empty paragraph that starts while the history is busy keeps the paragraph whole in index.html', { timeout: 300_000 }, async (t) => {
  const { server, pages } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>Second slide</p>', '  <p>Second slide</p>\n  <p></p>']] });
  for (const page of pages) await show(page, 'Two');
  for (const page of pages) await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const [ana, ben] = pages;
  await front(ana);
  assert.ok(await ana.evaluate(`(() => {
    const q = ${el(1, 'p:nth-of-type(2)')};
    ${HOLD};
    q.focus(); getSelection().collapse(q, 0);
    return document.activeElement === q;
  })()`));
  await ana.send('Input.imeSetComposition', { text: 'K', selectionStart: 1, selectionEnd: 1 });
  await ana.evaluate(RELEASE);
  await ana.send('Input.imeSetComposition', { text: 'KJ', selectionStart: 2, selectionEnd: 2 });
  await until(async () => (await ana.evaluate(`${C}.acked()`)) && (await ana.evaluate(TEXT)) === server.read(), 'the text that Ana reads during the composition in index.html');
  assert.equal(slideOf(server.read(), 1), `<section>\n  <h2>Two</h2>\n  <p>Second slide</p>\n  <p></p>\n  <ul>\n    <li>Alpha</li>\n    <li>Beta</li>\n  </ul>\n</section>`);
  await ana.send('Input.insertText', { text: '你好' });
  assert.ok(slideOf(await converge(server, pages), 1).includes('\n  <p>你好</p>\n'));
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});

const heading = (text) => text.match(/<h2>[^\n]*<\/h2>/g)[0];

// the transaction writes OneX into the heading of slide One, waits until the test ends it, and
// writes OneXY. the page of Ben records each text of this heading
test('a composition that starts during a transaction that changed the deck in part does not hand the half transaction to the others', { timeout: 240_000 }, async (t) => {
  const { server, pages } = await pair(t);
  const [ana, ben] = pages;
  assert.ok(await ben.evaluate(`(() => {
    const h = ${el(0, 'h2')};
    window.__seen = [];
    new MutationObserver(() => window.__seen.push(h.textContent)).observe(h, { subtree: true, childList: true, characterData: true });
    return true;
  })()`));
  assert.ok(await caretAt(ana, 6));
  await ana.evaluate(`(() => {
    const h = ${el(0, 'h2')};
    const step = (text) => {
      const was = h.textContent;
      h.textContent = text;
      ${C}.app.history.push({ label: 'set', undo: () => void (h.textContent = was), redo: () => void (h.textContent = text) });
    };
    ${C}.app.history.transact('Wait', async () => {
      step('OneX');
      await new Promise((end) => (window.__end = end));
      step('OneXY');
    });
    return true;
  })()`);
  await ana.send('Input.imeSetComposition', { text: 'K', selectionStart: 1, selectionEnd: 1 });
  await ana.evaluate(RELEASE);
  await ana.send('Input.imeSetComposition', { text: 'KJ', selectionStart: 2, selectionEnd: 2 });
  await until(async () => (await ana.evaluate(`${C}.acked()`)) && (await ana.evaluate(TEXT)) === server.read(), 'the text that Ana reads during the composition in index.html');
  await ana.send('Input.insertText', { text: '你好' });
  assert.equal(heading(await converge(server, pages)), '<h2>OneXY</h2>');
  const seen = await ben.evaluate('window.__seen');
  assert.deepEqual([seen.includes('OneX'), seen.includes('OneXY')], [false, true], 'the page of Ben shows OneXY and never the half transaction');
  assert.deepEqual([ana.errors, ben.errors], [[], []]);
});
