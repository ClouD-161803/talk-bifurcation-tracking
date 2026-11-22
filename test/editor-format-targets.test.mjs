import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { byteExact, click, editorPage } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-format-targets.html';
const js = (v) => JSON.stringify(v);

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

async function open(t, slide) {
  const page = await editorPage(browser, { deck: DECK, query: 'edit&still&edit-platform=other', page: { width: 1600, height: 1000 } });
  t.after(() => page.close().catch(() => {}));
  const index = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.id === ${js(slide)})`);
  await page.evaluate(`Reveal.slide(${index})`);
  await page.waitFor(`document.querySelector('section.present')?.id === ${js(slide)}`);
  await page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  return page;
}

const onWord = (page, selector, word) => page.evaluate(`(() => {
  const el = document.querySelector('section.present ' + ${js(selector)});
  const n = [...el.childNodes].find((c) => c.nodeType === 3 && c.data.includes(${js(word)}));
  const i = n.data.indexOf(${js(word)});
  const r = document.createRange();
  r.setStart(n, i);
  r.setEnd(n, i + 1);
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
})()`);

async function caretOn(page, selector, word) {
  const at = await onWord(page, selector, word);
  await click(page, at);
  if (!(await page.evaluate('!!document.activeElement?.isContentEditable'))) await click(page, at);
  assert.equal(await page.evaluate('!!document.activeElement?.isContentEditable'), true, `a click on ${selector} does not put the caret in`);
}

async function wordOn(page, selector, word) {
  await click(page, await onWord(page, selector, word), { count: 2 });
  assert.equal(await page.evaluate('getSelection().toString()').then((s) => s.trim().length > 0), true, `a double click on ${selector} does not select a word`);
}

const enabled = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)}).enabled`);
const exec = async (page, id) => {
  await page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
  await page.evaluate('new Promise((d) => requestAnimationFrame(() => d(true)))');
};

for (const how of ['caret', 'word']) {
  test(`with the ${how === 'caret' ? 'caret' : 'selected words'} in one cell, Center centers this cell and Align Left of the Arrange menu does not move the table`, async (t) => {
    const page = await open(t, 's-table');
    await (how === 'caret' ? caretOn : wordOn)(page, 'tr:nth-child(2) td', 'beta');
    assert.equal(await enabled(page, 'arrange.align.left'), false, 'Align Left of the Arrange menu is offered for the table around the cell');
    assert.equal(await enabled(page, 'arrange.distribute.horizontal'), false, 'Distribute Horizontally is offered for the table around the cell');
    assert.equal(await enabled(page, 'text.align.center'), true, 'Center is dimmed in a cell');
    await exec(page, 'text.align.center');
    await byteExact(page, [['<td>alpha beta</td>', '<td class="center">alpha beta</td>']]);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('text.align.center').checked`), true);
    await exec(page, 'text.align.left');
    await byteExact(page);
    assert.deepEqual(page.errors, []);
  });
}

test('Center on a cell set at the right takes off its text-align, so that the cell is drawn centered', async (t) => {
  const page = await open(t, 's-table');
  await caretOn(page, 'tr:nth-child(3) td:nth-child(2)', '2');
  await exec(page, 'text.align.center');
  await byteExact(page, [['<td style="text-align: right">2</td>', '<td class="center">2</td>']]);
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('section.present tr:nth-child(3) td:nth-child(2)')).textAlign`), 'center');
  assert.deepEqual(page.errors, []);
});

test('Center on a range of cells centers these cells and no other', async (t) => {
  const page = await open(t, 's-table');
  const cell = (selector) => page.evaluate(`(() => { const r = document.querySelector('section.present ' + ${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, await cell('tr:nth-child(2) td:nth-child(1)'));
  await click(page, await cell('tr:nth-child(3) td:nth-child(1)'), { modifiers: 'Shift' });
  await page.waitFor(`(() => { const o = document.querySelector('.beeson-table-bars .cell.range'); return !!o && !o.hidden; })()`);
  assert.equal(await enabled(page, 'arrange.align.left'), false, 'Align Left of the Arrange menu is offered for the table around the range');
  await exec(page, 'text.align.center');
  await byteExact(page, [['<td>alpha beta</td>', '<td class="center">alpha beta</td>'], ['<td>epsilon</td>', '<td class="center">epsilon</td>']]);
  assert.deepEqual(page.errors, []);
});

test('with words selected in an item of a list, Center centers the item, and Align Left of the Arrange menu does not move the list', async (t) => {
  const page = await open(t, 's-list');
  await wordOn(page, 'li:nth-child(2)', 'Second');
  assert.equal(await enabled(page, 'arrange.align.left'), false);
  await exec(page, 'text.align.center');
  await byteExact(page, [['<li>Second item words</li>', '<li class="center">Second item words</li>']]);
  assert.deepEqual(page.errors, []);
});

test('with words selected in a caption, Center centers the caption, and Align Left of the Arrange menu does not move the figure', async (t) => {
  const page = await open(t, 's-figure');
  await wordOn(page, 'figcaption', 'caption');
  assert.equal(await enabled(page, 'arrange.align.left'), false);
  await exec(page, 'text.align.center');
  await byteExact(page, [['<figcaption class="caption">', '<figcaption class="caption center">']]);
  assert.deepEqual(page.errors, []);
});

for (const [slide, word, before] of [['s-split', 'words', '<p>Column words here</p>'], ['s-stack', 'first', '<p>Stack first words</p>'], ['s-grid', 'Left', '<p>Left cell words</p>']]) {
  test(`with words selected in a paragraph of ${slide.slice(2)}, Center and Align Left of the Arrange menu change this paragraph only`, async (t) => {
    const page = await open(t, slide);
    await wordOn(page, 'p', word);
    await exec(page, 'text.align.center');
    await byteExact(page, [[before, before.replace('<p>', '<p class="center">')]]);
    await exec(page, 'arrange.align.left');
    const text = await page.evaluate('window.BeesonEditor.render()');
    assert.match(text, new RegExp(`<p class="center" style="translate: -?\\d+px 0px">${before.slice(3, -4)}</p>`), 'Align Left does not move the paragraph alone');
    assert.deepEqual(page.errors, []);
  });
}

test('a selected list is centered as one, and a selected table is moved by Align Left of the Arrange menu', async (t) => {
  const page = await open(t, 's-list');
  await click(page, await onWord(page, 'li:nth-child(2)', 'Second'));
  assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`), ['ul']);
  await exec(page, 'text.align.center');
  await byteExact(page, [['<ul>', '<ul class="center">']]);
  const table = await open(t, 's-table');
  await click(table, await table.evaluate(`(() => { const r = document.querySelector('section.present table').getBoundingClientRect(); return { x: r.left - 3, y: r.top + r.height / 2 }; })()`));
  assert.deepEqual(await table.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`), ['table']);
  await exec(table, 'arrange.align.right');
  assert.match(await table.evaluate('window.BeesonEditor.render()'), /<table style="translate: \d+px 0px">/);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(table.errors, []);
});
