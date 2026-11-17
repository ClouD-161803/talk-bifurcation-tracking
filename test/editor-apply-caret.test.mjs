// the caret of the person through an apply of the synchronous editor, see
// src/editor/session/session.ts. a caret that the person moves while the formulas of an apply are
// typeset is left where the person put it, and a caret whose paragraph another person moves to a
// slide that is not shown stays in the paragraph: the person stays on the slide, and the first key
// that types shows the slide of the paragraph and goes into it. a selection is kept through a run
// between two code elements that becomes a space

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { press, type, typeKeys } from './helpers/editor.mjs';
import { E, applyOn, caretAtEnd, sessionPage, showSlide } from './helpers/apply.mjs';
import { closeGate, openGate } from './helpers/gate.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const P1 = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('the complete slide'))`;
const H2 = `[...document.querySelectorAll('.reveal h2')].find((h) => h.textContent.startsWith('Show your steps'))`;
const LINE = '  <p>Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.</p>\n';
const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `${from} is once in the text`);
  return text.replace(from, to);
};

// the text with the slide whose heading starts with heading put again after it
function duplicated(text, heading) {
  const from = text.lastIndexOf('<section', text.indexOf(`<h2>${heading}`));
  const to = text.indexOf('</section>', from) + '</section>\n'.length;
  assert.ok(from > 0 && to > from, `the slide ${heading} is in the text`);
  return text.slice(0, to) + text.slice(from, to) + text.slice(to);
}

const MOVED = [
  ['a slide with formulas placed by the apply', (text) => duplicated(text, 'Equations are first class')],
  ['a tag put into the text of the caret', (text) => once(text, 'Design the complete', 'Design <strong>Hi</strong> the complete')],
];

for (const [label, change] of MOVED) {
  test(`a caret moved by the person while the formulas of an apply are typeset stays where the person put it, after ${label}`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    assert.equal(await b.evaluate(`(() => {
      const p = ${P1};
      p.focus();
      getSelection().collapse(p.firstChild, 6);
      return document.activeElement === p;
    })()`), true);
    await closeGate(b);
    await b.evaluate(`(() => {
      window.__result = null;
      ${E}.apply(${JSON.stringify(change(b.source))}).then((r) => (window.__result = r.reload));
      return true;
    })()`);
    await b.waitFor('window.__held > 0');
    // the person puts the caret into the heading of the slide while the typeset waits
    assert.equal(await b.evaluate(`(() => {
      const h = ${H2};
      h.focus();
      getSelection().collapse(h.firstChild, 4);
      return document.activeElement === h;
    })()`), true);
    await openGate(b);
    await b.waitFor('window.__result !== null');
    assert.equal(await b.evaluate('window.__result'), false);
    assert.deepEqual(await b.evaluate(`(() => {
      const h = ${H2};
      const sel = getSelection();
      return { active: document.activeElement === h, node: sel.focusNode === h.firstChild, offset: sel.focusOffset };
    })()`), { active: true, node: true, offset: 4 });
    assert.deepEqual(b.errors, []);
  });
}

test('a caret whose paragraph is moved to another slide stays in it, and the person stays on the slide until a key types into the paragraph', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const text = once(once(b.source, LINE, ''), '  <h2>Code boxes, you guessed it...</h2>\n', '  <h2>Code boxes, you guessed it...</h2>\n' + LINE);
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  assert.equal(await b.evaluate('Reveal.getCurrentSlide() === window.__shown'), true, 'the person stays on the slide');
  // a key of a command leaves the person on the slide
  await press(b, 'Mod+C');
  assert.equal(await b.evaluate('Reveal.getCurrentSlide() === window.__shown'), true, 'the person stays on the slide after a key that does not type');
  await typeKeys(b, 'Xyz');
  await b.waitFor(`${P1}.textContent.endsWith('attention.Xyz')`);
  assert.equal(await b.evaluate(`${E}.render()`), once(text, 'viewer\'s attention.</p>', 'viewer\'s attention.Xyz</p>'));
  assert.deepEqual(await b.evaluate(`({ shown: Reveal.getCurrentSlide().contains(${P1}), active: document.activeElement === ${P1} })`), { shown: true, active: true }, 'the slide of the paragraph is shown, with the caret in it');
  assert.deepEqual(b.errors, []);
});

test('a caret whose paragraph is moved to another slide is let go once the person clicks', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const text = once(once(b.source, LINE, ''), '  <h2>Code boxes, you guessed it...</h2>\n', '  <h2>Code boxes, you guessed it...</h2>\n' + LINE);
  assert.equal((await applyOn(b, text)).reload, false);
  // a press on the slide is a new choice of the person, after which the keys do not type
  await b.evaluate(`document.querySelector('.reveal').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await typeKeys(b, 'Xyz');
  assert.equal(await b.evaluate('Reveal.getCurrentSlide() === window.__shown'), true, 'the person stays on the slide');
  assert.equal(await b.evaluate(`${E}.render()`), text);
  assert.deepEqual(b.errors, []);
});

// the text with the paragraph of the caret moved under the heading of the slide of code boxes,
// which is not shown
const moveP1 = (text) => once(once(text, LINE, ''), '  <h2>Code boxes, you guessed it...</h2>\n', '  <h2>Code boxes, you guessed it...</h2>\n' + LINE);

// the caret at the end of the paragraph, parked by an apply that moves the paragraph, which returns
// this text
async function parkP1(b) {
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const text = moveP1(b.source);
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal(await b.evaluate('Reveal.getCurrentSlide() === window.__shown'), true, 'the person stays on the slide');
  return text;
}

test('a character typed with Option after a caret is parked goes into its paragraph', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await parkP1(b);
  // Option+L of a German layout of a Mac types @
  const base = { key: '@', code: 'KeyL', windowsVirtualKeyCode: 76, modifiers: 1 };
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '@', unmodifiedText: 'l' });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await typeKeys(b, 'x');
  await b.waitFor(`${P1}.textContent.endsWith('x')`);
  assert.equal(await b.evaluate(`${P1}.textContent.slice(-12)`), 'attention.@x');
  assert.deepEqual(b.errors, []);
});

test('the input of a keyboard of a phone, whose key is Unidentified, goes into a parked caret', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  const text = await parkP1(b);
  const base = { key: 'Unidentified', code: '', windowsVirtualKeyCode: 229, modifiers: 0 };
  await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  assert.equal(await b.evaluate('Reveal.getCurrentSlide() === window.__shown'), true, 'a key that does not type leaves the person on the slide');
  // the keyboard inserts its text, which a beforeinput of the focused element announces
  await b.evaluate(`document.activeElement.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'x' }))`);
  assert.deepEqual(await b.evaluate(`({ shown: Reveal.getCurrentSlide().contains(${P1}), active: document.activeElement === ${P1} })`), { shown: true, active: true }, 'the slide of the paragraph is shown, with the caret in it');
  await type(b, 'x');
  await b.waitFor(`${P1}.textContent.endsWith('x')`);
  assert.equal(await b.evaluate(`${E}.render()`), once(text, 'viewer\'s attention.</p>', 'viewer\'s attention.x</p>'));
  assert.deepEqual(b.errors, []);
});

const AGAIN = [
  ['a tag put into its text', (text) => once(text, 'Design the complete', 'Design the <strong>complete</strong>')],
  ['a character put at its start', (text) => once(text, 'Design the complete', 'QDesign the complete')],
];

for (const [label, change] of AGAIN) {
  test(`a parked caret at the end of its paragraph stays at the end after an apply of ${label}`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    const second = change(await parkP1(b));
    assert.equal((await applyOn(b, second)).reload, false);
    await typeKeys(b, 'Xyz');
    await b.waitFor(`${P1}.textContent.includes('Xyz')`);
    const want = once(second, 'viewer\'s attention.</p>', 'viewer\'s attention.Xyz</p>');
    const got = await b.evaluate(`${E}.render()`);
    const line = (text) => text.split('\n').find((l) => l.includes('slide first'));
    assert.equal(line(got), line(want), 'the keys go to the end of the paragraph');
    assert.equal(got, want);
    assert.deepEqual(b.errors, []);
  });
}

const SAME = [
  ['a formula put at the end of its text', (text) => once(text, 'viewer\'s attention.</p>', 'viewer\'s attention. \\(x\\)</p>')],
  ['a slide with formulas placed after it', (text) => duplicated(text, 'Equations are first class')],
];

for (const [label, change] of SAME) {
  test(`a caret that the person moves inside the same text while the formulas of an apply are typeset stays there, after ${label}`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    assert.equal(await b.evaluate(`(() => {
      const p = ${P1};
      p.focus();
      getSelection().collapse(p.firstChild, 6);
      return document.activeElement === p;
    })()`), true);
    await closeGate(b);
    await b.evaluate(`(() => {
      window.__result = null;
      ${E}.apply(${JSON.stringify(change(b.source))}).then((r) => (window.__result = r.reload));
      return true;
    })()`);
    await b.waitFor('window.__held > 0');
    // a press in the same text, as a click there, puts the caret at its character 3
    await b.evaluate(`(() => {
      window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      getSelection().collapse(${P1}.firstChild, 3);
      return true;
    })()`);
    await openGate(b);
    await b.waitFor('window.__result !== null');
    assert.equal(await b.evaluate('window.__result'), false);
    assert.deepEqual(await b.evaluate(`(() => {
      const sel = getSelection();
      return { node: sel.focusNode === ${P1}.firstChild, offset: sel.focusOffset };
    })()`), { node: true, offset: 3 });
    assert.deepEqual(b.errors, []);
  });
}

// a blank run inside a p or an li cannot end the text element, see isTextElement(), hence it is set
// in place, as any other run
test('a run between two code elements that becomes a space keeps the selection of the person and both code elements', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  const LI = `[...document.querySelectorAll('.reveal li')].find((li) => li.textContent.startsWith('Each step is'))`;
  const chosen = await b.evaluate(`(() => {
    const li = ${LI};
    li.focus();
    const r = document.createRange();
    r.setStart(li.lastChild, 2);
    r.setEnd(li.lastChild, 6);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    window.__codes = [...li.querySelectorAll('code')];
    return getSelection().toString();
  })()`);
  assert.equal(chosen, 'f ap');
  const text = once(b.source, '</code>, with a <code>data-fragment-index', '</code> <code>data-fragment-index');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal(await b.evaluate(`${E}.render()`), text);
  assert.equal(await b.evaluate('getSelection().toString()'), 'f ap', 'the selection is kept');
  assert.deepEqual(await b.evaluate(`window.__codes.map((c) => c.isConnected && ${LI}.contains(c))`), [true, true], 'the code elements are kept');
  assert.deepEqual(b.errors, []);
});
