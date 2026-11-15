// the applies of the synchronous editor around the edits of the person, see
// src/editor/session/session.ts. the client writes the text of an apply against the text that it
// last read from the port, hence an edit of the person that the client has not read yet is kept
// through every apply and told through onChange after it: an edit typed between two queued
// applies, a box inserted, a content set, and slides duplicated while an apply waits, and an edit
// next to an apply that replaces most of the text. an open composition holds back the change of
// its own slide only, and a page that does not read as its text after an apply asks for a reload

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { click, typeKeys } from './helpers/editor.mjs';
import { E, applyOn, caretAtEnd, frame, sessionPage, showSlide } from './helpers/apply.mjs';
import { closeGate, openGate } from './helpers/gate.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const P1 = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('the complete slide'))`;
const P2 = `[...document.querySelectorAll('.reveal p')].find((p) => p.textContent.includes('the code into its box'))`;
const THANKS = `[...document.querySelectorAll('.reveal h1')].find((h) => h.textContent.startsWith('Thank you'))`;
const SECTIONS = `document.querySelectorAll('.reveal .slides > section').length`;
const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `${from} is once in the text`);
  return text.replace(from, to);
};
const render = (page) => page.evaluate(`${E}.render()`);
const sessionText = (page) => page.evaluate(`${E}.session.text()`);
const changes = (page) => page.evaluate('window.__changes');

// the apply of text started on page, whose reload flag is put in window.__results[name] once it
// resolves
const start = (page, name, text) => page.evaluate(`(() => {
  window.__results ??= {};
  window.__results[${JSON.stringify(name)}] = null;
  ${E}.apply(${JSON.stringify(text)}).then((r) => (window.__results[${JSON.stringify(name)}] = r.reload));
  return true;
})()`);
const resolved = (...names) => names.map((n) => `window.__results?.[${JSON.stringify(n)}] != null`).join(' && ');

// the row of the slide n of the navigator clicked, with the keys of modifiers held
async function row(page, n, modifiers = '') {
  const at = await page.evaluate(`(() => {
    const r = document.querySelectorAll('.beeson-edit-nav .row')[${n}];
    if (!r) return null;
    r.scrollIntoView({ block: 'nearest' });
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  assert.ok(at, `the navigator has a row ${n}`);
  await click(page, at, { modifiers });
  await frame(page);
}

test('an edit typed between two queued applies is kept through both, and told through onChange after them', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  const one = once(b.source, 'Copy-paste the code', 'Paste the code');
  const two = once(one, 'Thank you', 'Thanks');
  const told = await changes(b);
  // the client wrote two against one, the text of the apply before it
  const result = await b.evaluate(`(() => {
    const first = ${E}.apply(${JSON.stringify(one)});
    document.execCommand('insertText', false, ' Typed.');
    const second = ${E}.apply(${JSON.stringify(two)});
    return Promise.all([first, second]).then((r) => r.map((x) => x.reload));
  })()`);
  assert.deepEqual(result, [false, false]);
  const want = once(two, 'viewer\'s attention.</p>', 'viewer\'s attention. Typed.</p>');
  assert.equal(await render(b), want);
  await b.waitFor(`window.__changes > ${told}`);
  assert.equal(await sessionText(b), want);
  assert.deepEqual(b.errors, []);
});

test('a box that the document model inserts while two applies arrive is kept, with its entry of the history', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  const one = once(b.source, 'Copy-paste the code', 'Paste the code');
  const two = once(one, 'Thank you', 'Thanks');
  const told = await changes(b);
  await closeGate(b);
  await b.evaluate(`(() => {
    ${E}.doc.insert(${JSON.stringify('<p>Inserted \\(x^2\\) here.</p>')}, window.__shown);
    return true;
  })()`);
  await b.waitFor('window.__held > 0');
  await start(b, 'one', one);
  await start(b, 'two', two);
  await openGate(b);
  await b.waitFor(resolved('one', 'two'));
  assert.deepEqual(await b.evaluate('window.__results'), { one: false, two: false });
  const got = await render(b);
  for (const part of ['Inserted \\(x^2\\) here.', 'Paste the code', 'Thanks']) assert.ok(got.includes(part), `the page renders ${part}`);
  assert.equal(await b.evaluate(`[...document.querySelectorAll('.reveal p')].some((p) => p.textContent.startsWith('Inserted'))`), true, 'the box is on the page');
  const s = await b.evaluate(`${E}.status()`);
  assert.deepEqual(s.problems, []);
  assert.equal(s.undo, true, 'the insert is kept in the history');
  await b.waitFor(`window.__changes > ${told}`);
  assert.equal(await sessionText(b), got);
  assert.deepEqual(b.errors, []);
});

test('a content that the document model sets while an apply arrives is kept, and told through onChange after the apply', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  await caretAtEnd(b, P1);
  await typeKeys(b, '!');
  await b.waitFor('window.__changes > 0');
  // the client reads the text in its listener of onChange, and writes the apply against it
  const mine = await sessionText(b);
  assert.ok(mine.includes('attention.!</p>'));
  await closeGate(b);
  await b.evaluate(`(() => {
    ${E}.doc.setContent(${P1}, ${JSON.stringify('Local \\(y\\) content')});
    return true;
  })()`);
  await b.waitFor(`window.__held > 0 && ${P1} === undefined`);
  const told = await changes(b);
  await start(b, 'remote', once(mine, 'Thank you', 'Remote Thank you'));
  await openGate(b);
  await b.waitFor(resolved('remote'));
  assert.equal(await b.evaluate('window.__results.remote'), false);
  const want = once(once(mine, 'Thank you', 'Remote Thank you'), 'Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.!', 'Local \\(y\\) content');
  assert.equal(await render(b), want);
  await b.waitFor(`window.__changes > ${told}`);
  assert.equal(await sessionText(b), want);
  assert.deepEqual(b.errors, []);
});

test('slides duplicated while an apply arrives are kept, as the apply merges onto the text read before the duplicate', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Show your steps');
  const n = await b.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].indexOf(window.__shown)`);
  await row(b, n);
  await row(b, n + 1, 'Shift');
  assert.equal((await b.evaluate(`${E}.state('slide.duplicate')`)).label, 'Duplicate Slides');
  const count = await b.evaluate(SECTIONS);
  const mine = await sessionText(b);
  const told = await changes(b);
  // the first copy is done, and the duplicate waits for the typeset of the second copy, whose node
  // is on the page
  await closeGate(b, `${SECTIONS} === ${count + 2}`);
  await b.evaluate(`(() => {
    ${E}.exec('slide.duplicate');
    return true;
  })()`);
  await b.waitFor('window.__held > 0');
  await start(b, 'remote', once(mine, '<h1>Thank you</h1>', '<h1>Thank you XYZ</h1>'));
  await openGate(b);
  await b.waitFor(resolved('remote'));
  assert.equal(await b.evaluate('window.__results.remote'), false);
  assert.equal(await b.evaluate(SECTIONS), count + 2, 'both copies are on the page');
  const got = await render(b);
  assert.equal(got.split('<h2>Show your steps one at a time</h2>').length, 3, 'both copies are in the text');
  assert.ok(got.includes('<h1>Thank you XYZ</h1>'), 'the change of the other person is in the text');
  await b.waitFor(`window.__changes > ${told}`);
  assert.equal(await sessionText(b), got);
  assert.deepEqual(b.errors, []);
});

test('an edit of the person is kept when the apply removes more than half of the text', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await showSlide(b, 'Thank you');
  await caretAtEnd(b, THANKS);
  const from = b.source.indexOf('<section>\n  <h2>Show your steps');
  const to = b.source.indexOf('<section class="closing">');
  assert.ok(from > 0 && to - from > b.source.length / 2, 'the apply removes more than half of the text');
  const remote = b.source.slice(0, from) + b.source.slice(to);
  const result = await b.evaluate(`(() => {
    const done = ${E}.apply(${JSON.stringify(remote)});
    document.execCommand('insertText', false, ' Typed');
    return done.then((r) => r.reload);
  })()`);
  assert.equal(result, false);
  const want = once(remote, '<h1>Thank you</h1>', '<h1>Thank you Typed</h1>');
  assert.equal(await render(b), want);
  assert.equal(await sessionText(b), want);
  assert.deepEqual(b.errors, []);
});

const COMPOSING = [
  ['an apply into the composing text', (text) => once(text, 'Design the complete', 'Plan the complete')],
  ['an apply that puts a box on the slide of the composing text', (text) => once(text, 'viewer\'s attention.</p>\n', 'viewer\'s attention.</p>\n  <p>A box of another person.</p>\n')],
];

for (const [label, ofSlide] of COMPOSING) {
  test(`during a composition, ${label} waits for its end, while the apply after it and onChange do not`, async (t) => {
    const b = await sessionPage(browser);
    t.after(() => b.close());
    await showSlide(b, 'Show your steps');
    await caretAtEnd(b, P1);
    await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))`);
    const first = ofSlide(b.source);
    const second = once(first, '<h1>Thank you</h1>', '<h1>Thank you Y</h1>');
    const told = await changes(b);
    await start(b, 'first', first);
    await start(b, 'second', second);
    await b.evaluate(`document.execCommand('insertText', false, 'q')`);
    // the change on another slide is applied, and the typing is told, while the composition is open
    await b.waitFor(`${THANKS}.textContent === 'Thank you Y'`);
    await b.waitFor(`window.__changes > ${told}`);
    const want = once(second, 'viewer\'s attention.</p>', 'viewer\'s attention.q</p>');
    assert.equal(await sessionText(b), want, 'the text read during the composition');
    assert.equal(await b.evaluate(`${P1}.textContent`), 'Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.q', 'the composing text is left as it is');
    assert.equal(await b.evaluate(`[...document.querySelectorAll('.reveal p')].some((p) => p.textContent.startsWith('A box'))`), false, 'the slide of the composing text is left as it is');
    await b.evaluate(`${P1}.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))`);
    await b.waitFor(resolved('first', 'second'));
    assert.deepEqual(await b.evaluate('window.__results'), { first: false, second: false });
    assert.equal(await render(b), want);
    assert.equal(await sessionText(b), want);
    assert.deepEqual((await b.evaluate(`${E}.status()`)).problems, []);
    assert.deepEqual(b.errors, []);
  });
}
