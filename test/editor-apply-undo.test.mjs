// the history of the person on the page of an apply of the synchronous editor, see
// src/editor/session/apply.ts and src/editor/history.ts: an entry whose undo or redo would write
// over a change of another person, or take it off the page, is dropped by the apply

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { click, press, typeKeys } from './helpers/editor.mjs';
import { E, applyOn, caretAtEnd, frame, sessionPage, showSlide } from './helpers/apply.mjs';
import { freshDeck } from './helpers/fresh.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `${JSON.stringify(from.slice(0, 60))} is once in the text`);
  return text.replace(from, to);
};
const sectionsOf = (text) => [...text.matchAll(/^<section[\s\S]*?^<\/section>/gm)].map((m) => m[0]);
const slideWith = (text, heading) => sectionsOf(text).find((s) => s.includes(`<h2>${heading}`) || s.includes(`<h1>${heading}`));
// text with the slide of heading moved before the slide of other
const moveSlide = (text, heading, other) => {
  const s = slideWith(text, heading);
  const without = text.replace(`${s}\n`, '');
  return once(without, slideWith(without, other), `${s}\n${slideWith(without, other)}`);
};
const status = (page) => page.evaluate(`${E}.status()`);
const sessionText = (page) => page.evaluate(`${E}.session.text()`);
const SLIDE = (heading) => `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h1, h2')?.textContent.startsWith(${JSON.stringify(heading)}))`;
const ITEM = (start) => `[...document.querySelectorAll('.reveal li')].find((li) => li.textContent.startsWith(${JSON.stringify(start)}))`;

test('a move of the person and its redo are dropped when another person moves the same element', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  await b.evaluate(`${E}.doc.move(${SLIDE('Code boxes')}, document.querySelector('.reveal .slides'), ${SLIDE('Show your steps')})`);
  await b.waitFor(`${E}.status().undo`);
  assert.equal((await applyOn(b, moveSlide(await sessionText(b), 'Code boxes', 'Thank you'))).reload, false);
  assert.equal((await status(b)).undo, false, 'the move of a slide is dropped');

  // the item moved by the person is the one that the apply keeps in place, while the item before it
  // is moved
  await b.evaluate(`(() => { const last = ${ITEM('When exporting')}; return ${E}.doc.move(last, last.parentElement, ${ITEM('Each step')}); })()`);
  await b.waitFor(`${E}.status().undo`);
  const text = await sessionText(b);
  const [first, second] = [/<li[^>]*>When exporting.*?<\/li>/, /<li[^>]*>Each step.*?<\/li>/].map((r) => text.match(r)[0]);
  assert.ok(text.indexOf(first) < text.indexOf(second), 'the person moved the last item first');
  assert.equal((await applyOn(b, text.replace(first, '\0').replace(second, first).replace('\0', second))).reload, false);
  assert.equal((await status(b)).undo, false, 'the move of an item is dropped');

  await b.evaluate(`${E}.doc.move(${SLIDE('Embedding videos')}, document.querySelector('.reveal .slides'), ${SLIDE('Chapter one')})`);
  await b.waitFor(`${E}.status().undo`);
  await b.evaluate(`${E}.undo()`);
  await b.waitFor(`${E}.status().redo`);
  assert.equal((await applyOn(b, moveSlide(await sessionText(b), 'Embedding videos', 'Thank you'))).reload, false);
  assert.equal((await status(b)).redo, false, 'the redo of the move is dropped');
  assert.deepEqual(b.errors, []);
});

test('an insert or a duplicate of the person, and the redo of a removal, are dropped when another person changes inside them', async (t) => {
  const b = await sessionPage(browser);
  t.after(() => b.close());
  const NEW = '<section>\n  <h2>New slide</h2>\n  <p>Words of the person.</p>\n</section>';
  await b.evaluate(`${E}.doc.insert(${JSON.stringify(NEW)}, document.querySelector('.reveal .slides'), ${SLIDE('Thank you')})`);
  await b.waitFor(`${E}.status().undo`);
  assert.equal((await applyOn(b, once(await sessionText(b), 'Words of the person.', 'Words of the person. And a sentence of the other.'))).reload, false);
  assert.equal((await status(b)).undo, false, 'the insert of a slide is dropped');

  await b.evaluate(`${E}.doc.duplicate(${ITEM('Each step')}.parentElement)`);
  await b.waitFor(`${E}.status().undo`);
  let text = await sessionText(b);
  const at = text.lastIndexOf('Two elements with the same index');
  text = `${text.slice(0, at)}Two elements of the other${text.slice(at + 'Two elements'.length)}`;
  assert.equal((await applyOn(b, text)).reload, false);
  assert.equal((await status(b)).undo, false, 'the duplicate of a list is dropped');

  await b.evaluate(`${E}.doc.remove(${ITEM('Dark and light mode')}.parentElement)`);
  await b.waitFor(`${E}.status().undo`);
  await b.evaluate(`${E}.undo()`);
  await b.waitFor(`${E}.status().redo`);
  assert.equal((await applyOn(b, once(await sessionText(b), 'You might have noticed a toggle', 'You may have noticed a toggle'))).reload, false);
  assert.equal((await status(b)).redo, false, 'the redo of the removal of a list is dropped');
  assert.deepEqual(b.errors, []);
});
