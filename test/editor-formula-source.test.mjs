// the TeX of an inline formula is shown in its text, between its delimiters, while the caret is in
// it, as in Obsidian. a click on the formula shows the TeX selected, hence Delete takes off the
// formula alone. the arrows walk the caret through the TeX and past it, and the formula is typeset
// again once the caret has left it. a selection across a formula draws the formula selected. a
// click on a formula opened its sheet, Delete then took nothing off, and the formula was not drawn
// in a selection across it

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { click, clickText, editorPage, press, typeKeys } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-formula-source.html';
const TEX = String.raw`\(\theta + \omega\)`;
const LINE = String.raw`<p style="width: 900px">The angle \(\theta + \omega\) is the argument</p>`;

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
const P = para(0);
const shown = `(!${P}.querySelector('mjx-container') && ${P}.textContent.includes(${js(TEX)}))`;
const typeset = `(!!${P}.querySelector('mjx-container') && !${P}.textContent.includes('\\\\('))`;
const line = (saved) => saved.match(/<p style="width: 900px">The angle.*<\/p>/)?.[0];

async function load(t) {
  const page = await editorPage(browser, { deck: DECK, query: 'edit&still&edit-platform=mac', page: { width: 1600, height: 1000 } });
  t.after(() => page.close().catch(() => {}));
  await page.waitFor(`${P}.querySelector('mjx-container') && ${para(1)}.querySelector('mjx-container')`);
  return page;
}

const formulaAt = (page) => page.evaluate(`(() => { const r = ${P}.querySelector('mjx-container').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

// the caret in the words of the first paragraph, left of its formula, then at the start
async function caretAtStart(page) {
  const at = await page.evaluate(`(() => { const r = ${P}.getBoundingClientRect(); const m = ${P}.querySelector('mjx-container').getBoundingClientRect(); return { x: r.left + 40, y: m.top + m.height / 2 }; })()`);
  await clickText(page, at);
  await page.waitFor(`document.activeElement === ${P} && getSelection().isCollapsed`);
  await press(page, 'Home');
}

test('a click on an inline formula shows its TeX selected in the text', async (t) => {
  const page = await load(t);
  await click(page, await formulaAt(page));
  await page.waitFor(`${shown} && document.activeElement === ${P} && getSelection().toString() === ${js(TEX)}`);
  assert.equal(await page.evaluate(`!!document.querySelector('.beeson-math')`), false, 'the sheet of the formula is opened by the click');
  // the TeX shown is the text of the file, hence the deck is saved as it was
  assert.equal(line(await render(page)), LINE);
});

test('Delete of the toolbar after a click on an inline formula takes off the formula alone', async (t) => {
  const page = await load(t);
  await click(page, await formulaAt(page));
  await page.waitFor(`${shown} && getSelection().toString() === ${js(TEX)}`);
  await click(page, '.beeson-edit-top [data-command="element.delete"]');
  await page.waitFor(`!${P}.textContent.includes('theta') && !${P}.querySelector('mjx-container')`);
  const saved = line(await render(page));
  assert.match(saved, /^<p style="width: 900px">The angle \s?is the argument<\/p>$/, `the paragraph is saved as ${saved}`);
  assert.ok((await render(page)).includes(String.raw`The anomaly is \(\nu\)`), 'the other formula is not kept');
});

test('Backspace after a click on an inline formula takes off the formula alone', async (t) => {
  const page = await load(t);
  await click(page, await formulaAt(page));
  await page.waitFor(`${shown} && getSelection().toString() === ${js(TEX)}`);
  await press(page, 'Backspace');
  await page.waitFor(`!${P}.textContent.includes('theta') && !${P}.querySelector('mjx-container')`);
  assert.match(line(await render(page)), /^<p style="width: 900px">The angle \s?is the argument<\/p>$/);
});

for (const [way, key] of [['right', 'ArrowRight'], ['left', 'ArrowLeft']]) {
  test(`the ${way} arrow walks the caret through the TeX of a formula and past it`, async (t) => {
    const page = await load(t);
    await caretAtStart(page);
    if (key === 'ArrowLeft') await press(page, 'End');
    let seen = false;
    let presses = 0;
    // the caret goes into the TeX, through each of its characters, and out of it
    for (; presses < 60; presses++) {
      await press(page, key);
      const [isShown, isTypeset] = await page.evaluate(`[${shown}, ${typeset}]`);
      if (isShown) seen = true;
      else if (seen && isTypeset) break;
    }
    assert.ok(seen, 'the TeX of the formula is not shown while the caret is in it');
    // a delimiter is one step
    assert.ok(presses >= TEX.length - 4, `the caret left the TeX after ${presses} presses`);
    await page.waitFor(`${typeset} && document.activeElement === ${P} && getSelection().isCollapsed`);
    await typeKeys(page, 'x');
    await page.waitFor(`${P}.textContent.includes('x')`);
    const saved = line(await render(page));
    if (key === 'ArrowRight') assert.match(saved, /\\omega\\\) x?is/, `the x is not typed after the formula: ${saved}`);
    else assert.match(saved, /anglex? ?\\\(\\theta/, `the x is not typed before the formula: ${saved}`);
  });
}

test('the TeX typed into a shown formula is typeset once the caret leaves it, and an undo gives it back', async (t) => {
  const page = await load(t);
  await click(page, await formulaAt(page));
  await page.waitFor(`${shown} && getSelection().toString() === ${js(TEX)}`);
  // the caret before the closing delimiter, which the caret steps over at once
  await press(page, 'ArrowRight');
  await press(page, 'ArrowLeft');
  await typeKeys(page, 'x');
  await page.waitFor(`${P}.textContent.includes('\\\\omegax\\\\)')`);
  await press(page, 'End');
  await page.waitFor(typeset);
  assert.equal(line(await render(page)), LINE.replace('\\omega', '\\omegax'));
  await press(page, 'Mod+Z');
  await page.waitFor(`!${P}.textContent.includes('omegax') && !(window.BeesonEditor.render()).includes('omegax')`);
  assert.equal(line(await render(page)), LINE);
});

test('a selection across an inline formula draws the formula selected', async (t) => {
  const page = await load(t);
  await caretAtStart(page);
  const transparent = `getComputedStyle(${P}.querySelector('mjx-container')).backgroundColor`;
  const plain = await page.evaluate(transparent);
  for (let i = 0; i < 'The angle '.length + 1; i++) await press(page, 'Shift+ArrowRight');
  await page.waitFor(`!getSelection().isCollapsed && getSelection().containsNode(${P}.querySelector('mjx-container'))`);
  await page.waitFor(`${transparent} !== ${js(plain)}`);
  // the formula is not shown as TeX in a selection that only crosses it
  assert.equal(await page.evaluate(typeset), true);
  await press(page, 'ArrowRight');
  await page.waitFor(`getSelection().isCollapsed && ${transparent} === ${js(plain)}`);
});

test('a sign \\( in code after a formula does not keep the TeX of the formula shown', async (t) => {
  const page = await load(t);
  const C = para(2);
  const formula = await page.evaluate(`(() => { const r = ${C}.querySelector('mjx-container').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, formula);
  await page.waitFor(`!${C}.querySelector('mjx-container') && getSelection().toString() === '\\\\(M\\\\)'`);
  // the caret at the end of the text, past the sign in code, is not in the TeX
  await press(page, 'End');
  await page.waitFor(`!!${C}.querySelector('mjx-container') && getSelection().isCollapsed`);
  assert.ok((await render(page)).includes(String.raw`The mean anomaly \(M\) is typed after <code>\(</code> in TeX`));
});
