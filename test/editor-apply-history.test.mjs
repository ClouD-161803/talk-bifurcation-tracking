// the person on the page of an apply of the synchronous editor, see src/editor/session/apply.ts:
// the entries of the history that name a changed element are dropped, the caret stays at its
// character, an unsaved edit is kept, an edit made while the apply waits is merged into it, and an
// apply into a text with an open composition of an input method waits for its end

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { typeKeys } from './helpers/editor.mjs';
import { E, applied, applyOn, caretAtEnd, frame, sessionPage, showSlide } from './helpers/apply.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const P1 = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('the complete slide'))`;
const P2 = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('the code into its box'))`;
const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `${from} is once in the text`);
  return text.replace(from, to);
};
const status = (page) => page.evaluate(`${E}.status()`);
const sessionText = (page) => page.evaluate(`${E}.session.text()`);
// the text of the first paragraph before the caret, or null when the caret is not in it
const beforeCaret = (page) => page.evaluate(`(() => {
  const p = ${P1};
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed || !p.contains(sel.focusNode) || document.activeElement !== p) return null;
  const r = document.createRange();
  r.setStart(p, 0);
  r.setEnd(sel.focusNode, sel.focusOffset);
  return r.toString();
})()`);

test('an entry of the history is dropped when an apply changes its element, and kept when the apply changes another', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await typeKeys(b, ' One.');
  await b.waitFor(`${E}.status().undo`);
  let text = once(await sessionText(b), 'Copy-paste the code', 'Paste the code');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal((await status(b)).undo, true, 'the typing in another paragraph is kept');
  text = once(text, 'Design the complete', 'Plan the complete');
  assert.equal((await applyOn(b, text)).reload, false);
  await applied(b, text, 'the typing dropped');
  // the typing that follows is a new entry, whose undo gives the text of the apply
  await caretAtEnd(b, P1);
  await typeKeys(b, ' Two.');
  await b.waitFor(`${E}.status().undo`);
  await b.evaluate(`${E}.undo()`);
  assert.equal(await b.evaluate(`${E}.render()`), text);
  // a removal by the document model is kept through an apply on another slide, and its undo puts
  // the paragraph back
  const kept = await sessionText(b);
  await b.evaluate(`${E}.doc.remove(${P2})`);
  await b.waitFor(`${E}.status().undo`);
  text = once(await sessionText(b), 'Thank you', 'Thanks');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal((await status(b)).undo, true, 'the removal of an element on another slide is kept');
  await b.evaluate(`${E}.undo()`);
  assert.equal(await b.evaluate(`!!${P2}`), true, 'the undo puts the paragraph back');
  assert.equal(await b.evaluate(`${E}.render()`), once(kept, 'Thank you', 'Thanks'));
  // the entry of a typing in a paragraph that an apply takes away is dropped
  await caretAtEnd(b, P1);
  await typeKeys(b, ' Three.');
  await b.waitFor(`${E}.status().undo`);
  text = await sessionText(b);
  const start = text.lastIndexOf('\n', text.indexOf('<p>Plan the complete')) + 1;
  text = text.slice(0, start) + text.slice(text.indexOf('\n', start) + 1);
  assert.equal((await applyOn(b, text)).reload, false);
  await applied(b, text, 'the paragraph taken');
  assert.deepEqual(b.errors, []);
});

test('the caret stays at its character when its text element changes before and after it', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await b.evaluate(`(() => {
    const p = ${P1};
    p.focus();
    getSelection().collapse(p.firstChild, 'Design the'.length);
  })()`);
  assert.equal(await beforeCaret(b), 'Design the');
  let text = once(b.source, '<p>Design the', '<p>Now design the');
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  await applied(b, text, 'before the caret');
  assert.equal(await beforeCaret(b), 'Now design the');
  text = once(text, 'slide first, then', 'slide at first, then');
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  assert.equal(await beforeCaret(b), 'Now design the');
  // a tag before the caret sets the content of the paragraph, and the caret is put back
  text = once(text, '<p>Now design the', '<p><b>Now</b> design the');
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  await applied(b, text, 'a tag before the caret');
  assert.equal(await beforeCaret(b), 'Now design the');
  text = once(text, 'first, then break', 'first, then <i>break</i>');
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  assert.equal(await beforeCaret(b), 'Now design the');
  // the paragraph is not made again by a change on another slide
  await b.evaluate(`window.__p = ${P1}`);
  text = once(text, 'Thank you', 'Thanks');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal(await b.evaluate(`${P1} === window.__p`), true);
  assert.equal(await beforeCaret(b), 'Now design the');
  assert.deepEqual(b.errors, []);
});

test('an unsaved edit of the person is kept through an apply of a change elsewhere, with its entry and its caret', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await b.evaluate(`window.__p = ${P1}`);
  await caretAtEnd(b, P1);
  await typeKeys(b, ' Unsaved.');
  await b.waitFor('window.__changes > 0');
  const typed = await sessionText(b);
  assert.ok(typed.includes('viewer\'s attention. Unsaved.'));
  const text = once(typed, 'Copy-paste the code', 'Paste the code');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal(await b.evaluate(`${E}.render()`), text);
  assert.equal(await b.evaluate(`${P1} === window.__p`), true, 'the paragraph with the edit is the same node');
  assert.equal(await beforeCaret(b), 'Design the complete slide first, then break it up into steps. Direct the viewer\'s attention. Unsaved.');
  const s = await status(b);
  assert.deepEqual(s.problems, []);
  assert.equal(s.undo, true, 'the typing is kept in the history');
  await b.evaluate(`${E}.undo()`);
  assert.equal(await b.evaluate(`${E}.render()`), once(b.source, 'Copy-paste the code', 'Paste the code'));
  assert.deepEqual(b.errors, []);
});

test('an edit made while an apply waits for its turn is merged into the text of the apply', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const text = once(b.source, 'Copy-paste the code', 'Paste the code');
  // the apply is asked for, and a word is typed before its turn
  const result = await b.evaluate(`(() => {
    const done = ${E}.apply(${JSON.stringify(text)});
    document.execCommand('insertText', false, ' Typed.');
    return done.then((r) => ({ reload: r.reload }));
  })()`);
  assert.equal(result.reload, false);
  const want = once(text, 'viewer\'s attention.</p>', 'viewer\'s attention. Typed.</p>');
  assert.equal(await b.evaluate(`${E}.render()`), want);
  assert.equal(await sessionText(b), want);
  assert.deepEqual((await status(b)).problems, []);
  assert.deepEqual(b.errors, []);
});

test('an apply into a text with an open composition waits for its end, and an apply into another text does not', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))`);
  const into = once(b.source, 'Design the complete', 'Plan the complete');
  await b.evaluate(`(() => {
    window.__applied = null;
    ${E}.apply(${JSON.stringify(into)}).then((r) => (window.__applied = r.reload));
    return true;
  })()`);
  await frame(b);
  await frame(b);
  assert.equal(await b.evaluate('window.__applied'), null, 'the apply waits for the composition');
  assert.equal(await b.evaluate(`${E}.render()`), b.source);
  await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))`);
  await b.waitFor('window.__applied === false');
  await applied(b, into, 'after the composition');
  await caretAtEnd(b, P1);
  await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))`);
  const elsewhere = once(into, 'Copy-paste the code', 'Paste the code');
  assert.equal((await applyOn(b, elsewhere)).reload, false);
  await applied(b, elsewhere, 'during a composition in another text');
  await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))`);
  assert.deepEqual(b.errors, []);
});
