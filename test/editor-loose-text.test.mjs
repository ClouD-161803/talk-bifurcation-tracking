import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { byteExact, click, editorPage, type } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-loose-text.html';
const js = (v) => JSON.stringify(v);

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

async function open(t) {
  const page = await editorPage(browser, { deck: DECK, query: 'edit&still&edit-platform=other' });
  t.after(() => page.close().catch(() => {}));
  await page.waitFor(`!!document.querySelector('#formula mjx-container')`);
  return page;
}

const caretIn = (page, selector) => page.evaluate(`(() => { const el = document.querySelector(${js(selector)}); const s = getSelection(); return !!el && document.activeElement === el && !!s.rangeCount && el.contains(s.anchorNode); })()`);
const onWords = (page, selector, fx) => page.evaluate(`(() => {
  const r = document.createRange();
  r.selectNodeContents(document.querySelector(${js(selector)}));
  const b = r.getClientRects()[0];
  return { x: b.left + b.width * ${fx}, y: b.top + b.height / 2 };
})()`);

test('a click on a span of text in a div puts the caret in it, and the typed letter is written into the file', async (t) => {
  const page = await open(t);
  await click(page, await onWords(page, '#name', 0.99));
  assert.equal(await caretIn(page, '#name'), true, 'a click on the span does not put the caret in');
  await type(page, 's');
  await byteExact(page, [['>Vector field<', '>Vector fields<']]);
  assert.deepEqual(page.errors, []);
});

test('a click in the TeX of an open formula of a span in a div moves the caret in the TeX', async (t) => {
  const page = await open(t);
  await click(page, '#formula mjx-container');
  await page.waitFor(`document.activeElement?.id === 'formula' && !document.querySelector('#formula mjx-container')`);
  await click(page, await onWords(page, '#formula', 0.5));
  assert.equal(await caretIn(page, '#formula'), true, 'a click in the TeX takes the caret out of the formula');
  assert.equal(await page.evaluate('getSelection().isCollapsed'), true, 'a click in the TeX does not put a caret');
  assert.deepEqual(page.errors, []);
});
