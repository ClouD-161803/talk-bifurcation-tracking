// the caret goes past an inline formula at the end of a text, with
// End, the right arrow, and a click behind the formula, and words typed there are written after
// the formula. the same holds mirrored at the start of a text, with Home and the left arrow. the
// caret was held before a formula at the end, since a formula is not editable and a text does not
// have a place after it

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { click, editorPage, press, typeKeys } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-formula-ends.html';
const END = String.raw`The angle is the true anomaly \(\theta\)</p>`;
const START = String.raw`<p style="width: 900px">\(\theta\) is the true anomaly</p>`;

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const js = (v) => JSON.stringify(v);
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const para = (i) => `document.querySelectorAll('.reveal section.present > p')[${i}]`;

async function load(t, platform) {
  const page = await editorPage(browser, { deck: DECK, query: `edit&still&edit-platform=${platform}`, page: { width: 1600, height: 1000 } });
  t.after(() => page.close().catch(() => {}));
  await page.waitFor(`${para(0)}.querySelector('mjx-container') && ${para(1)}.querySelector('mjx-container')`);
  return page;
}

// a click on the words of paragraph i, left of its formula at the end or right of it at the start
async function clickWords(page, i) {
  const at = await page.evaluate(`(() => { const r = ${para(i)}.getBoundingClientRect(); const m = ${para(i)}.querySelector('mjx-container').getBoundingClientRect(); return { x: ${i ? 'm.right + 60' : 'r.left + 60'}, y: m.top + m.height / 2 }; })()`);
  await click(page, at);
  await page.waitFor(`document.activeElement === ${para(i)} && getSelection().isCollapsed`);
}

// the text typed and the paragraph saved with it
async function typed(page, text, i, html) {
  await typeKeys(page, text);
  await page.waitFor(`${para(i)}.textContent.includes(${js(text)})`);
  const saved = await render(page);
  assert.ok(saved.includes(html), `the paragraph is not saved as ${html}: ${saved.match(/<p style="width: 900px">.*<\/p>/g)}`);
}

for (const platform of ['mac', 'other']) {
  test(`End puts the caret after a formula at the end of a text (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickWords(page, 0);
    await press(page, 'End');
    await typed(page, 'x', 0, END.replace('</p>', 'x</p>'));
  });

  test(`the right arrow moves the caret over a formula at the end of a text (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickWords(page, 0);
    await press(page, 'End');
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowRight');
    await typed(page, 'x', 0, END.replace('</p>', 'x</p>'));
  });

  test(`a click behind a formula at the end of a text puts the caret after it (${platform})`, async (t) => {
    const page = await load(t, platform);
    const at = await page.evaluate(`(() => { const m = ${para(0)}.querySelector('mjx-container').getBoundingClientRect(); return { x: m.right + 40, y: m.top + m.height / 2 }; })()`);
    await click(page, at);
    await page.waitFor(`document.activeElement === ${para(0)} && getSelection().isCollapsed`);
    await typed(page, 'x', 0, END.replace('</p>', 'x</p>'));
  });

  // Firefox puts the caret inside the formula at End and at a click behind it, where typing is lost
  test(`a caret inside a formula at the end of a text, as Firefox puts it, is moved after the formula (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickWords(page, 0);
    await page.evaluate(`(() => { const u = ${para(0)}.querySelector('mjx-container svg *:last-child'); getSelection().collapse(u, 0); return true; })()`);
    await page.waitFor(`!getSelection().focusNode.parentElement?.closest('mjx-container') && !getSelection().focusNode.closest?.('mjx-container')`);
    await typed(page, 'x', 0, END.replace('</p>', 'x</p>'));
  });

  test(`Home puts the caret before a formula at the start of a text (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickWords(page, 1);
    await press(page, 'Home');
    await typed(page, 'y', 1, START.replace('\\(', 'y\\('));
  });

  test(`the left arrow moves the caret over a formula at the start of a text (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickWords(page, 1);
    await press(page, 'Home');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowLeft');
    await typed(page, 'y', 1, START.replace('\\(', 'y\\('));
  });
}
