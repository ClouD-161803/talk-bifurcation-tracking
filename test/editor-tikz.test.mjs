// the TikZ figures of test/pages/tikz.html in the editor, with trusted input: every part shown, a
// figure in a figure box and a bare div.tikz selected and moved by themselves as figures, the file
// written back with every byte outside the moved tag, the rows of the parts in the Steps pane, which
// make a part a step, and the width and the height of a div.tikz in the scope rule of the editor

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { tokenize } from '../src/editor/tokens.ts';
import { editProblems, textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { byteExact, center, click, drag, editorPage } from './helpers/editor.mjs';

const DECK = 'test/pages/tikz.html';
const SLIDE = '.reveal .slides > section.present';
const BOX = '<div class="figure-box tikz" data-figure="two" style="width: 600px; height: 400px">';
const BARE = '<div class="tikz" data-figure="two" style="width: 150px; height: 50px">';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const js = (v) => JSON.stringify(v);
const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const selected = (page, sel) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.matches(${js(sel)}))`);
// the errors of a page, apart from the failed load of the output of the figure named missing
const errors = (page) => page.errors.filter((e) => !e.includes('missing'));

async function open(t, slide) {
  const page = await editorPage(browser, { deck: DECK, clear: true });
  t.after(() => page.close());
  await page.evaluate(`Reveal.slide(${slide})`);
  await wait(page);
  return page;
}

test('a TikZ figure is shown with every part in the editor, moved as a figure, and written back with every byte outside its tag', { timeout: 120000 }, async (t) => {
  const page = await open(t, 1);
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${SLIDE} .tikz > svg g.tikz-later')].map((g) => g.dataset.part)`), []);
  await click(page, `${SLIDE} .tikz`);
  await wait(page);
  assert.deepEqual(await selected(page, 'div.tikz'), [true]);
  await drag(page, await center(page, `${SLIDE} .tikz`), { dx: -120, dy: 40 });
  await wait(page);
  const moved = (await render(page)).match(/<div class="figure-box tikz" data-figure="two" style="width: 600px; height: 400px; translate: -?\d+px -?\d+px">/);
  assert.ok(moved, 'the drag does not write translate into the tag of the figure');
  await byteExact(page, [[BOX, moved[0]]]);
  assert.ok(!(await render(page)).includes('<svg'), 'the SVG of the figure is written into the file');

  // a div.tikz outside a figure box is moved by itself as well
  await page.evaluate('Reveal.slide(2)');
  await wait(page);
  await click(page, `${SLIDE} div.tikz:not(.figure-box)`);
  await wait(page);
  assert.deepEqual(await selected(page, 'div.tikz:not(.figure-box)'), [true]);
  await drag(page, await center(page, `${SLIDE} div.tikz:not(.figure-box)`), { dx: 60, dy: 80 });
  await wait(page);
  const bare = (await render(page)).match(/<div class="tikz" data-figure="two" style="width: 150px; height: 50px; translate: -?\d+px -?\d+px">/);
  assert.ok(bare, 'the drag does not write translate into the tag of the bare figure');
  await byteExact(page, [[BOX, moved[0]], [BARE, bare[0]]]);
  assert.deepEqual(errors(page), []);
});

// the center of the shown grip of handle, in CSS pixels of the viewport, or null without one
const grip = (page, handle) => page.evaluate(`(() => {
  const g = [...document.querySelectorAll('.beeson-grip[data-handle="${handle}"]')].find((g) => !g.hidden && g.getClientRects().length && !g.classList.contains('locked'));
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

test('a TikZ figure is resized with its grips, which write its new box in px into its style', { timeout: 120000 }, async (t) => {
  const page = await open(t, 1);
  await click(page, `${SLIDE} .tikz`);
  await wait(page);
  const se = await grip(page, 'se');
  assert.ok(se, 'a selected TikZ figure does not have a grip at its lower right corner');
  const scale = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); return s.getBoundingClientRect().width / s.offsetWidth; })()`);
  // the box is not held at its proportions, since the next compile fits the figure to it
  await drag(page, se, { dx: 100 * scale, dy: -50 * scale });
  await wait(page);
  const resized = (await render(page)).match(/<div class="figure-box tikz" data-figure="two" style="width: (\d+)px; height: (\d+)px">/);
  assert.ok(resized, 'the resize does not write the width and the height of the figure');
  assert.ok(Math.abs(Number(resized[1]) - 700) <= 2 && Math.abs(Number(resized[2]) - 350) <= 2, resized[0]);
  await byteExact(page, [[BOX, resized[0]]]);
  // the Size fields of the Arrange pane give the box, one axis at a time
  await page.evaluate(`window.BeesonEditor.exec('arrange.setSize', { w: 640 })`);
  await page.evaluate(`window.BeesonEditor.exec('arrange.setSize', { h: 480 })`);
  await wait(page);
  assert.match(await render(page), /<div class="figure-box tikz" data-figure="two" style="width: 640px; height: 480px">/);
  assert.deepEqual(errors(page), []);
});

test('the Steps pane lists the step of a part as a row named Part with the name of the part',{ timeout: 120000 }, async (t) => {
  const page = await open(t, 1);
  await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
  await wait(page);
  const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-side .rows .row')].map((r) => ({
    step: r.dataset.step,
    text: r.querySelector('.text').textContent,
    kind: r.querySelector('.meta .kind').textContent,
  }))`);
  const parts = rows.filter((r) => r.text.startsWith('Part'));
  assert.deepEqual(parts, [{ step: '0', text: 'Part a', kind: 'Figure step' }, { step: '1', text: 'Part b', kind: 'Figure step' }]);
  assert.deepEqual(errors(page), []);
});

test('the Steps pane lists the parts of the selected figure without a step as rows Part x, and makes one a step in one change', { timeout: 120000 }, async (t) => {
  const page = await open(t, 1);
  await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
  await wait(page);
  const rows = () => page.evaluate(`[...document.querySelectorAll('.beeson-edit-side .rows .row')].map((r) => ({ step: r.dataset.step, text: r.querySelector('.text').textContent }))`);
  const text = await render(page);
  assert.ok(!(await rows()).some((r) => r.text === 'Part c'));
  await click(page, await center(page, `${SLIDE} .tikz`));
  await wait(page);
  const listed = (await rows()).filter((r) => r.text.startsWith('Part'));
  assert.deepEqual(listed, [{ step: '0', text: 'Part a' }, { step: '1', text: 'Part b' }, { step: '', text: 'Part c' }]);

  // the chip of the row opens the steps that the part can be made
  const chip = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-side .rows .row')].find((r) => r.querySelector('.text').textContent === 'Part c'); const b = r.querySelector('.chip').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await click(page, chip);
  await wait(page);
  const item = await page.evaluate(`(() => { const r = [...[...document.querySelectorAll('[role=menu]')].at(-1).querySelectorAll('[role^=menuitem]')].find((r) => r.textContent.trim() === 'New Step at End'); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  assert.ok(item, 'the menu of the chip does not have New Step at End');
  await click(page, item);
  await wait(page);
  assert.match(await render(page), /<span class="fragment" data-part="c" data-fragment-index="\d+"><\/span><\/div>/);
  assert.deepEqual((await rows()).filter((r) => r.text.startsWith('Part')), [{ step: '0', text: 'Part a' }, { step: '1', text: 'Part b' }, { step: '2', text: 'Part c' }]);
  await page.evaluate('window.BeesonEditor.exec("edit.undo")');
  await wait(page);
  assert.equal(await render(page), text);
  assert.deepEqual(errors(page), []);
});
test('the scope rule of the editor allows a width and a height in px on a div.tikz, and the attributes of a figure and of a part', () => {
  const theme = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const attrs = (html) => tokenize(html).find((x) => x.type === 'start').attrs;
  assert.deepEqual(editProblems('div', attrs('<div class="tikz" data-figure="decay">'), { style: { width: '600px', height: '480px' } }, theme), []);
  assert.deepEqual(editProblems('div', attrs('<div class="tikz" data-figure="decay">'), { style: { width: '50%' } }, theme), ['width 50% on a TikZ figure']);
  assert.deepEqual(textProblems(`${BOX}<span class="fragment" data-part="a" data-fragment-index="1"></span></div>`, theme), []);
  // a div that is not a TikZ figure keeps the rule
  assert.deepEqual(editProblems('div', attrs('<div class="figure-box">'), { style: { height: '480px' } }, theme), ['height 480px on a div']);
});
