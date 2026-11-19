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

// the selection of the person in the paragraph of expression, as the offsets of its anchor and its
// focus in the text of the paragraph, or null when an end is outside it
const selectionIn = (expression) => `(() => {
  const p = ${expression};
  const sel = getSelection();
  if (!p || !sel.rangeCount || !p.contains(sel.anchorNode) || !p.contains(sel.focusNode)) return null;
  const at = (node, offset) => { const r = document.createRange(); r.selectNodeContents(p); r.setEnd(node, offset); return r.toString().length; };
  return { anchor: at(sel.anchorNode, sel.anchorOffset), focus: at(sel.focusNode, sel.focusOffset) };
})()`;
// the word complete of the paragraph selected from anchor to focus
const selectComplete = (b, backward) => b.evaluate(`(() => {
  const p = ${P1};
  p.focus();
  const t = p.firstChild;
  const s = t.data.indexOf('complete'), e = s + 'complete'.length;
  if (${backward}) getSelection().setBaseAndExtent(t, e, t, s);
  else getSelection().setBaseAndExtent(t, s, t, e);
  return document.activeElement === p ? [s, e] : null;
})()`);

for (const backward of [false, true]) {
  test(`a ${backward ? 'backward' : 'forward'} selection keeps its characters and its direction through a tag put before it`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    const [s, e] = await selectComplete(b, backward);
    const text = once(b.source, 'Design the complete', '<b>Hi</b> Design the complete');
    assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
    const d = '<b>Hi</b> '.length - '<b></b>'.length;
    assert.deepEqual(await b.evaluate(selectionIn(P1)), backward ? { anchor: e + d, focus: s + d } : { anchor: s + d, focus: e + d });
    assert.equal(await b.evaluate(`getSelection().toString()`), 'complete');
    assert.equal(await b.evaluate(`${E}.render()`), text);
    assert.deepEqual(b.errors, []);
  });
}

// a selection in a paragraph moved to a slide that is not shown is parked with its focus alone, see
// the tests of a parked caret above
test('a selection keeps both ends when another person moves its paragraph to the end of its slide', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  const [s, e] = await selectComplete(b, true);
  const notes = '  <aside class="notes">A new element is faded in';
  const text = once(once(b.source, LINE, ''), notes, LINE + notes);
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal(await b.evaluate(`${P1}.nextElementSibling?.matches('aside.notes')`), true, 'the paragraph is moved to the end of the slide');
  assert.deepEqual(await b.evaluate(selectionIn(P1)), { anchor: e, focus: s });
  assert.equal(await b.evaluate(`${E}.render()`), text);
  assert.deepEqual(b.errors, []);
});

// the calls of MathJax.typesetPromise from now on, in window.__typesets
const countTypesets = (b) => b.evaluate(`(() => {
  const mj = window.MathJax;
  mj.__counted ??= mj.typesetPromise.bind(mj);
  window.__typesets = 0;
  mj.typesetPromise = (els) => (window.__typesets++, mj.__counted(els));
  return true;
})()`);
// the text node of the paragraph that holds needle, kept in window.__node
const keepNode = (b, needle) => b.evaluate(`(() => {
  window.__node = [...${P1}.childNodes].find((n) => n.nodeType === 3 && n.data.includes(${JSON.stringify(needle)})) ?? null;
  return !!window.__node;
})()`);

test('a character typed away from a literal dollar or backslash of its text keeps the text node, and a dollar typed is set as content', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  const literal = once(b.source, 'Direct the viewer', 'Direct $5 at C:\\temp the viewer');
  assert.equal((await applyOn(b, literal)).reload, false);
  assert.ok(await keepNode(b, 'attention.'), 'a text node holds the end of the paragraph');
  await countTypesets(b);
  const away = once(literal, 'viewer\'s attention.</p>', 'viewer\'s attention.X</p>');
  assert.deepEqual(await applyOn(b, away), { reload: false, changed: ['p'] });
  assert.deepEqual(await b.evaluate(`({ same: window.__node.isConnected && window.__node.data.endsWith('attention.X'), typesets: window.__typesets })`), { same: true, typesets: 0 }, 'the character is written into the text node');
  assert.equal(await b.evaluate(`${E}.render()`), away);
  // a dollar typed may begin a formula, and the content of the paragraph is set
  const dollar = once(away, 'attention.X</p>', 'attention.X$</p>');
  assert.deepEqual(await applyOn(b, dollar), { reload: false, changed: ['p'] });
  assert.equal(await b.evaluate('window.__typesets'), 1, 'the paragraph is typeset again');
  assert.equal(await b.evaluate(`${E}.render()`), dollar);
  assert.deepEqual(b.errors, []);
});

test('on a clean page, a character typed by another person in a paragraph with a formula does not look up the formulas of the whole deck', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Equations are first class');
  await b.evaluate(`(() => {
    const d = window.MathJax.startup.document;
    const items = d.getMathItemsWithin.bind(d);
    window.__whole = 0;
    d.getMathItemsWithin = (nodes) => (nodes.includes(document.body) && window.__whole++, items(nodes));
    return true;
  })()`);
  let text = b.source;
  for (const [from, to] of [['potential.</p>', 'potential.!</p>'], ['potential.!</p>', 'potential.!?</p>']]) {
    text = once(text, `is the effective ${from}`, `is the effective ${to}`);
    assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  }
  assert.equal(await b.evaluate('window.__whole'), 0, 'the formulas are looked up in the paragraph alone');
  assert.equal(await b.evaluate(`${E}.render()`), text);
  assert.deepEqual(b.errors, []);
});

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

// the caret of the person put after the first count characters of the text of P1
const caretAfter = (b, count) => b.evaluate(`(() => {
  const p = ${P1};
  p.focus();
  getSelection().collapse(p.firstChild, ${count});
  return document.activeElement === p;
})()`);
const CHANGES = [
  ['on both sides of it', (text) => once(text, LINE, LINE.replace('Design', 'BDesign').replace('attention.', 'attention.C')), 'BDesignA the', 'C</p>'],
  // a caret that went after such letters would follow the caret of the other person, and the letters
  // of the two would then alternate
  ['at it, which leaves it before the letters of the other person', (text) => once(text, LINE, LINE.replace('Design', 'DesignX')), 'DesignAX the', 'attention.</p>'],
];
for (const [label, change, typed, end] of CHANGES) {
  test(`a caret stays at its characters through one apply that changes its text node ${label}`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    assert.ok(await caretAfter(b, 'Design'.length));
    const text = change(b.source);
    assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
    await type(b, 'A');
    const line = (await b.evaluate(`${E}.render()`)).split('\n').find((l) => l.includes('the complete slide first'));
    assert.ok(line.includes(typed) && line.endsWith(end), `the key of the person is at its caret in ${line}`);
    assert.deepEqual(b.errors, []);
  });
}

test('a selection inside its text node keeps its characters through one apply that changes the node on both sides of it', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  assert.ok(await selectComplete(b, false));
  const text = once(b.source, LINE, LINE.replace('Design', 'BDesign').replace('attention.', 'attention.C'));
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  assert.equal(await b.evaluate(`getSelection().toString()`), 'complete');
  assert.equal(await b.evaluate(`${E}.render()`), text);
  assert.deepEqual(b.errors, []);
});

// complete is replaced by whole while the caret is after comp. replaceData would put the caret at
// the start of a run of changed letters, and the tag of the second change sends the apply through
// mapOffset
const WORDS = [
  ['in its text node', (text) => once(text, LINE, LINE.replace('complete', 'whole'))],
  ['with a tag put into its paragraph', (text) => once(text, LINE, LINE.replace('complete', 'whole').replace('attention.', '<strong>attention.</strong>'))],
  // complete to entire is read as compl taken out before the e that both share and ire put in after it
  ['with letters that both words share', (text) => once(text, LINE, LINE.replace('complete', 'entire').replace('attention.', '<strong>attention.</strong>')), 'entire'],
];
for (const [label, change, word = 'whole'] of WORDS) {
  test(`a caret inside a word that another person replaces ${label} goes to the end of the new word`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    assert.ok(await caretAfter(b, 'Design the comp'.length));
    assert.equal((await applyOn(b, change(b.source))).reload, false);
    await type(b, 'A');
    const line = (await b.evaluate(`${E}.render()`)).split('\n').find((l) => l.includes('slide first, then'));
    assert.ok(line.includes(`the ${word}A slide`), `the key of the person is after the new word in ${line}`);
    assert.deepEqual(b.errors, []);
  });
}
