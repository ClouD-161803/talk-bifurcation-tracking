import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { byteExact, click, editorPage } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-table-rows.html';
const js = (v) => JSON.stringify(v);
const settle = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(window.BeesonEditor.status()))))');
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const exec = async (page, id) => {
  await page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
  await settle(page);
};
const cell = (r, c) => `.reveal section.present table tr:nth-child(${r}) > :nth-child(${c + 1})`;
const body = (r, c) => `.reveal section.present tbody tr:nth-child(${r}) > :nth-child(${c + 1})`;
const IMG = /<img src="[^"]+\.png">/;

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

const clip = (page, type) => page.evaluate(`(() => {
  const data = window.__clip ??= new DataTransfer();
  const ev = new ClipboardEvent(${js(type)}, { clipboardData: data, bubbles: true, cancelable: true });
  (document.activeElement ?? document.body).dispatchEvent(ev);
  if (${js(type)} === 'paste') window.__clip = null;
  return ev.defaultPrevented;
})()`);

async function choose(page, paths) {
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await page.evaluate(`window.__done = window.BeesonEditor.exec('insert.image').then(() => true); 0`);
  await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
  const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
  await page.send('DOM.setFileInputFiles', { files: paths, objectId: result.objectId });
  await page.waitFor('window.__done', 20000);
  await page.waitFor(`[...document.querySelectorAll('.reveal section.present td img')].every((i) => i.complete && i.naturalWidth > 0)`);
  await settle(page);
}

test('Insert Image on a selected cell puts the picture in the cell, as wide as its column, and it is copied, pasted, merged, cut, and undone with the cell', async (t) => {
  const page = await editorPage(browser, { deck: DECK });
  t.after(() => page.close?.());
  await click(page, body(1, 0));
  await settle(page);
  await choose(page, [resolve('demo/figure-light.png')]);
  let text = await render(page);
  const line = text.match(/<tr><td>L1[^\n]*/)[0];
  assert.match(line, new RegExp(`^<tr><td>L1<br>${IMG.source}</td>`));
  assert.match(text, /<th style="width: \d+px">Point<\/th>/, 'the width of the column is not written');
  assert.equal((await state(page, 'edit.undo')).label, 'Undo Insert Image');
  const fit = await page.evaluate(`(() => { const td = document.querySelector(${js(body(1, 0))}); const img = td.querySelector('img'); const s = getComputedStyle(td); return Math.abs(img.offsetWidth - (td.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight))); })()`);
  assert.ok(fit < 1.5, `the picture is not as wide as its column, off by ${fit}px`);

  assert.equal(await clip(page, 'copy'), true, 'the copy of the cell is not taken by the editor');
  await click(page, body(2, 0));
  assert.equal(await clip(page, 'paste'), true, 'the paste onto the cell is not taken by the editor');
  await settle(page);
  await page.waitFor(`document.querySelector(${js(`${body(2, 0)} img`)})?.naturalWidth > 0`, 5000);
  await settle(page);
  text = await render(page);
  assert.match(text.match(/<tr><td>[^\n]*center/)[0], IMG, 'the pasted cell has no picture');

  assert.equal(await clip(page, 'cut'), true);
  await settle(page);
  assert.equal(await page.evaluate(`!!document.querySelector(${js(body(2, 0))}).querySelector('img')`), false, 'the cut cell keeps its picture');

  await click(page, body(1, 0));
  await click(page, body(1, 1), { modifiers: 'Shift' });
  await exec(page, 'table.merge');
  text = await render(page);
  assert.match(text.match(/<tr><td colspan="2">[^\n]*/)?.[0] ?? '', IMG, 'the merged cell has no picture');

  for (let i = 0; i < 4; i++) await page.evaluate('window.BeesonEditor.undo()');
  await byteExact(page);
  assert.equal((await settle(page)).undo, false);
  assert.deepEqual(page.errors, []);
});

test('a formula in a cell is copied, pasted, cut, and undone with the cell', async (t) => {
  const page = await editorPage(browser, { deck: 'test/pages/editor-tables.html' });
  t.after(() => page.close?.());
  await page.evaluate('Reveal.slide(1)');
  await settle(page);
  const beside = await page.evaluate(`(() => { const r = document.querySelector(${js(cell(2, 1))}).getBoundingClientRect(); return { x: r.right - 6, y: r.top + 6 }; })()`);
  await click(page, beside);
  await settle(page);
  assert.equal(await clip(page, 'copy'), true, 'the copy of the cell is not taken by the editor');
  await click(page, cell(3, 1));
  assert.equal(await clip(page, 'paste'), true, 'the paste onto the cell is not taken by the editor');
  await settle(page);
  await page.waitFor(`!!document.querySelector(${js(`${cell(3, 1)} mjx-container`)})`, 5000);
  assert.match(await render(page), /<tr><td>Europa<\/td><td>\\\(0\.01215\\\)<\/td>/);
  assert.equal(await clip(page, 'cut'), true);
  await settle(page);
  assert.match(await render(page), /<tr><td>Europa<\/td><td><\/td>/);
  for (let i = 0; i < 2; i++) await page.evaluate('window.BeesonEditor.undo()');
  await byteExact(page);
  assert.deepEqual(page.errors, []);
});
