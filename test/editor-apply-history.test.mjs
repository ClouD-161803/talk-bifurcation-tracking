import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { typeKeys } from './helpers/editor.mjs';
import { E, applied, applyOn, caretAtEnd, sessionPage, showSlide } from './helpers/apply.mjs';
import { freshDeck } from './helpers/fresh.mjs';
import { closeGate, openGate } from './helpers/gate.mjs';

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
const H2 = `[...document.querySelectorAll('.reveal h2')].find((h) => h.textContent.startsWith('Show your steps'))`;
const status = (page) => page.evaluate(`${E}.status()`);
const sessionText = (page) => page.evaluate(`${E}.session.text()`);
const render = (page) => page.evaluate(`${E}.render()`);
const beforeCaret = (page) => page.evaluate(`(() => {
  const p = ${P1};
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed || !p.contains(sel.focusNode) || document.activeElement !== p) return null;
  const r = document.createRange();
  r.setStart(p, 0);
  r.setEnd(sel.focusNode, sel.focusOffset);
  return r.toString();
})()`);

test('an entry of typing is kept when an apply changes its text element or another, and its undo keeps the change of the apply', async (t) => {
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
  assert.equal((await status(b)).undo, true, 'the typing in the paragraph of the apply is kept');
  await b.evaluate(`${E}.undo()`);
  text = once(text, 'viewer\'s attention. One.</p>', 'viewer\'s attention.</p>');
  assert.equal(await render(b), text, 'the undo takes the typing and keeps the change of the apply');
  await caretAtEnd(b, P1);
  await typeKeys(b, ' Two.');
  await b.waitFor(`${E}.status().undo`);
  await b.evaluate(`${E}.undo()`);
  assert.equal(await b.evaluate(`${E}.render()`), text);
  const kept = await sessionText(b);
  await b.evaluate(`${E}.doc.remove(${P2})`);
  await b.waitFor(`${E}.status().undo`);
  text = once(await sessionText(b), 'Thank you', 'Thanks');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal((await status(b)).undo, true, 'the removal of an element on another slide is kept');
  await b.evaluate(`${E}.undo()`);
  assert.equal(await b.evaluate(`!!${P2}`), true, 'the undo puts the paragraph back');
  assert.equal(await b.evaluate(`${E}.render()`), once(kept, 'Thank you', 'Thanks'));
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

const AFTER_DESIGN = `(() => { const p = ${P1}; p.focus(); getSelection().collapse(p.firstChild, 'Design the'.length); return true; })()`;

test('the keys of one entry typed between applies on both sides of them are undone in one step, which keeps every change of the applies', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await b.evaluate(AFTER_DESIGN);
  await typeKeys(b, ' whole');
  await b.waitFor(`${E}.status().undo`);
  const typed = (await sessionText(b)).replace('Design the whole', 'Now design the whole');
  assert.equal(await b.evaluate(`${E}.apply(${JSON.stringify(typed)}).then((r) => (document.execCommand('insertText', false, ' new'), r.reload))`), false);
  const more = (await sessionText(b)).replace('slide first,', 'slide at first,');
  assert.equal(await b.evaluate(`${E}.apply(${JSON.stringify(more)}).then((r) => (document.execCommand('insertText', false, ' big'), r.reload))`), false);
  const text = await sessionText(b);
  assert.ok(text.includes('<p>Now design the whole new big complete slide at first,'), 'the keys and the applies');
  await b.evaluate(`${E}.undo()`);
  assert.equal(await render(b), once(text, 'the whole new big complete', 'the complete'), 'one undo takes every key');
  assert.equal((await status(b)).undo, false, 'the keys are one entry');
  await b.evaluate(`${E}.redo()`);
  assert.equal(await render(b), text);
  assert.deepEqual(b.errors, []);
});

test('an undo of an entry of typing whose letters another person took away is refused and changes nothing, and the next undo takes the entry before it', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, H2);
  await typeKeys(b, '!');
  await b.waitFor(`${E}.status().undo`);
  await caretAtEnd(b, P1);
  await typeKeys(b, ' One.');
  await b.waitFor(`${E}.render().includes('attention. One.')`);
  const text = once(await sessionText(b), 'viewer\'s attention. One.</p>', 'viewer\'s</p>');
  assert.equal((await applyOn(b, text)).reload, false);
  await b.evaluate(`${E}.undo()`);
  assert.equal(await render(b), text, 'the refused undo changes nothing');
  await b.evaluate(`${E}.undo()`);
  assert.equal(await render(b), once(text, 'one at a time!</h2>', 'one at a time</h2>'), 'the deletion is kept and the heading undone');
  const s = await status(b);
  assert.equal(s.undo, false);
  assert.equal(s.redo, true);
  await b.evaluate(`${E}.redo()`);
  assert.equal(await render(b), text);
  assert.equal((await status(b)).redo, false, 'the skipped entry is not redone');
  assert.deepEqual(b.errors, []);
});

test('an entry of typing is kept when another person makes a word before it bold, and its undo takes only the typing', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await typeKeys(b, ' One.');
  await b.waitFor(`${E}.render().includes('attention. One.')`);
  const text = once(await sessionText(b), '<p>Design the', '<p><b>Design</b> the');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal(await b.evaluate(`!!${P1}.querySelector('b')`), true, 'the content of the paragraph is set');
  assert.equal((await status(b)).undo, true, 'the typing is kept');
  await b.evaluate(`${E}.undo()`);
  assert.equal(await render(b), once(text, 'viewer\'s attention. One.</p>', 'viewer\'s attention.</p>'));
  assert.deepEqual(b.errors, []);
});

test('an entry of the document model that set the content of a text element is dropped when another person writes into it', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await b.evaluate(`(${E}.doc.setContent(${P1}, 'Set the complete slide.'), true)`);
  await b.waitFor(`${E}.status().undo && !${E}.doc.busy`);
  const text = once(await sessionText(b), 'Set the complete slide.', 'Set the complete slide now.');
  assert.equal((await applyOn(b, text)).reload, false);
  await applied(b, text, 'the entry dropped');
  assert.deepEqual(b.errors, []);
});

test('the undo and the redo of typing by one person give the text before and after it in a text element with a formula and in one with a link', async (t) => {
  const deck = once(readFileSync('test-deck.html', 'utf8'), '<p>Design the complete slide first,', '<p>Design the <a href="https://example.org/steps">complete slide</a> first,');
  const b = await sessionPage(browser, { deck: freshDeck(t, deck), text: deck });
  t.after(() => b.close());
  const FORMULA = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('is the effective potential.'))`;
  for (const [label, heading, host] of [['a formula', 'Equations are first class', FORMULA], ['a link', 'Show your steps', P1]]) {
    await showSlide(b, heading);
    assert.equal(await b.evaluate(`!!${host}.querySelector('${label === 'a link' ? 'a' : 'mjx-container'}')`), true, `the text element has ${label}`);
    await caretAtEnd(b, host);
    const before = await render(b);
    await typeKeys(b, ' Typed');
    await b.waitFor(`${E}.render().includes(' Typed</p>')`);
    const typed = await render(b);
    await b.evaluate(`${E}.undo()`);
    assert.equal(await render(b), before, `${label}: the undo`);
    await b.evaluate(`${E}.redo()`);
    assert.equal(await render(b), typed, `${label}: the redo`);
    await b.evaluate(`${E}.undo()`);
  }
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
  text = once(text, '<p>Now design the', '<p><b>Now</b> design the');
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  await applied(b, text, 'a tag before the caret');
  assert.equal(await beforeCaret(b), 'Now design the');
  text = once(text, 'first, then break', 'first, then <i>break</i>');
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  assert.equal(await beforeCaret(b), 'Now design the');
  await b.evaluate(`window.__p = ${P1}`);
  text = once(text, 'Thank you', 'Thanks');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal(await b.evaluate(`${P1} === window.__p`), true);
  assert.equal(await beforeCaret(b), 'Now design the');
  assert.deepEqual(b.errors, []);
});

test('a selection and the caret stay at their characters when one apply changes a formatted paragraph before and after them', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  let text = once(b.source, 'the complete slide first', 'the <em>complete</em> slide first');
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  await applied(b, text, 'the tag');
  await b.evaluate(`(() => {
    const p = ${P1};
    p.focus();
    getSelection().setBaseAndExtent(p.lastChild, ' '.length, p.lastChild, ' sli'.length);
    return true;
  })()`);
  const selected = () => b.evaluate(`(() => {
    const sel = getSelection();
    if (!sel.rangeCount || !${P1}.contains(sel.focusNode)) return null;
    const r = document.createRange();
    r.setStart(${P1}, 0);
    r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    return [r.toString(), sel.toString()];
  })()`);
  assert.deepEqual(await selected(), ['Design the complete ', 'sli']);
  text = once(once(text, '<p>Design the', '<p>BDesign the'), "viewer's attention.</p>", "viewer's attention.C</p>");
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  await applied(b, text, 'a change on both sides of a selection');
  assert.deepEqual(await selected(), ['BDesign the complete ', 'sli']);
  await b.evaluate(`(getSelection().collapseToEnd(), true)`);
  assert.equal(await beforeCaret(b), 'BDesign the complete sli');
  text = once(once(text, '<p>BDesign the', '<p>BBDesign the'), "viewer's attention.C</p>", "viewer's attention.CC</p>");
  assert.deepEqual(await applyOn(b, text), { reload: false, changed: ['p'] });
  assert.equal(await beforeCaret(b), 'BBDesign the complete sli');
  await b.evaluate(`((window.__p = ${P1}), true)`);
  await typeKeys(b, 'A');
  assert.equal(await b.evaluate(`window.__p.textContent`), "BBDesign the complete sliAde first, then break it up into steps. Direct the viewer's attention.CC");
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

test('an apply into a text with an open composition resolves at once and leaves the text until its end, and an apply into another text is applied at once', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))`);
  const into = once(b.source, 'Design the complete', 'Plan the complete');
  assert.equal((await applyOn(b, into)).reload, false);
  assert.equal(await b.evaluate(`${E}.render()`), b.source, 'the composing text is left as it is');
  assert.equal(await b.evaluate(`${E}.session.text()`), into, 'the text read holds the change');
  await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))`);
  await applied(b, into, 'after the composition');
  await caretAtEnd(b, P1);
  await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))`);
  const elsewhere = once(into, 'Copy-paste the code', 'Paste the code');
  assert.equal((await applyOn(b, elsewhere)).reload, false);
  await applied(b, elsewhere, 'during a composition in another text');
  await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))`);
  assert.deepEqual(b.errors, []);
});

const sectionsOf = (text) => [...text.matchAll(/^<section[\s\S]*?^<\/section>/gm)].map((m) => m[0]);
const farMove = (text) => {
  const closing = sectionsOf(text).find((s) => s.startsWith('<section class="closing">'));
  const first = sectionsOf(text).find((s) => s.startsWith('<section class="section">'));
  assert.ok(closing && first, 'the closing slide and a section slide are in the text');
  return text.replace(`${closing}\n`, '').replace(first, `${closing}\n${first}`);
};
const SLIDE = (heading) => `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h1, h2')?.textContent.startsWith(${JSON.stringify(heading)}))`;

const KINDS = {
  delete: async (b) => b.evaluate(`${E}.doc.remove(${P2})`),
  insert: async (b) => b.evaluate(`${E}.doc.insert('<p>An inserted paragraph.</p>', ${P2}.parentElement, ${P2}.nextElementSibling).then(() => true)`),
  'new slide': async (b) => {
    await showSlide(b, 'Code boxes');
    await b.evaluate(`${E}.exec('slide.new')`);
  },
  bigger: async (b) => {
    await showSlide(b, 'Code boxes');
    await caretAtEnd(b, P2);
    await b.evaluate(`${E}.exec('text.bigger')`);
  },
  move: async (b) => b.evaluate(`(() => { const s = ${SLIDE('Embedding videos')}; return ${E}.doc.move(s, s.parentElement, ${SLIDE('Code boxes')}).then(() => true); })()`),
};

async function entry(t, kind) {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  const before = await sessionText(b);
  await KINDS[kind](b);
  await b.waitFor(`${E}.status().undo && !${E}.doc.busy`);
  const made = await sessionText(b);
  assert.notEqual(made, before, `${kind}: the entry changed the text`);
  return { b, before, made };
}

for (const kind of ['delete', 'insert', 'bigger']) {
  test(`the entry of ${kind} on a slide is kept through a move of a slide far away`, async (t) => {
    const { b, made } = await entry(t, kind);
    assert.equal((await applyOn(b, farMove(made))).reload, false);
    assert.equal((await status(b)).undo, true, 'the entry is kept');
    assert.deepEqual(b.errors, []);
  });
}

test('the entry of New Slide is kept through a move of a slide far away, while its slide is in the deck', async (t) => {
  const { b, before, made } = await entry(t, 'new slide');
  let text = farMove(made);
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal((await status(b)).undo, true, 'the entry is kept');
  const added = sectionsOf(text).find((s) => !sectionsOf(before).includes(s));
  assert.ok(added, 'the new slide is in the text');
  text = text.replace(`${added}\n`, '');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal((await status(b)).undo, false, 'the entry is dropped with its slide');
  assert.deepEqual(b.errors, []);
});

test('the entry of a move of a slide is dropped when the order of the slides changes, and kept through a change of text', async (t) => {
  const { b, made } = await entry(t, 'move');
  let text = once(made, 'Thank you', 'Thanks');
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal((await status(b)).undo, true, 'the entry is kept through a change of text');
  text = farMove(text);
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal((await status(b)).undo, false, 'the entry is dropped');
  assert.deepEqual(b.errors, []);
});

test('the undo of an entry kept through a move of a slide far away gives the text before the entry, with the move', async (t) => {
  for (const kind of ['delete', 'insert', 'bigger', 'new slide']) {
    const { b, before, made } = await entry(t, kind);
    assert.equal((await applyOn(b, farMove(made))).reload, false, `${kind}: the reload of the apply`);
    assert.equal((await status(b)).undo, true, `${kind}: the entry is kept`);
    await b.evaluate(`${E}.undo()`);
    await b.waitFor(`!${E}.status().undo && !${E}.doc.busy`);
    const got = await b.evaluate(`${E}.render()`);
    const want = farMove(before);
    let i = 0;
    while (got[i] === want[i] && i < got.length) i++;
    assert.ok(got === want, `${kind}: after the undo the page renders as\n${JSON.stringify(got.slice(i - 80, i + 120))}\nwhere the text is\n${JSON.stringify(want.slice(i - 80, i + 120))}`);
    assert.deepEqual(b.errors, [], kind);
  }
});

const typedDuringTypeset = [
  ['a formula put into its text element', (s) => once(s, 'Design the complete', 'Design \\(x\\) the complete')],
  ['its text element changed by a structural apply that places a slide with a formula', (s) => once(once(s, 'viewer\'s attention.</p>', 'viewer\'s attention!</p>'), '<section>\n  <h2>Equations are first class', '<section>\n  <h2>A formula</h2>\n  <p>\\(x^2\\)</p>\n</section>\n\n<section>\n  <h2>Equations are first class')],
];
for (const [label, change] of typedDuringTypeset) {
  test(`text inserted without a key while the formulas of an apply are typeset keeps the caret after it, with ${label}`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    await b.evaluate(`(() => { const p = ${P1}; p.focus(); getSelection().collapse(p.firstChild, 'Design'.length); return true; })()`);
    await closeGate(b);
    await b.evaluate(`(() => {
      window.__result = null;
      ${E}.apply(${JSON.stringify(change(b.source))}).then((r) => (window.__result = r.reload));
      return true;
    })()`);
    await b.waitFor('window.__held > 0');
    await b.evaluate(`document.execCommand('insertText', false, 'Spoken')`);
    await openGate(b);
    await b.waitFor('window.__result !== null');
    assert.equal(await b.evaluate('window.__result'), false, 'the reload of the apply');
    await b.evaluate(`document.execCommand('insertText', false, 'Z')`);
    const text = await b.evaluate(`${E}.render()`);
    assert.ok(text.includes('DesignSpokenZ'), JSON.stringify(text.slice(text.indexOf('Spoken') - 30, text.indexOf('Spoken') + 40)));
    assert.deepEqual(b.errors, []);
  });
}
