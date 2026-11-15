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
