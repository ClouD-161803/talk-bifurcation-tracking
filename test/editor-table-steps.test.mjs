import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { byteExact, click, editorPage } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-table-rows.html';
const js = (v) => JSON.stringify(v);
const settle = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(window.BeesonEditor.status()))))');
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
const exec = async (page, id, arg) => {
  await page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg ? `, ${js(arg)}` : ''})`);
  await settle(page);
};
const ROWS = [
  '<tr><td>L1</td><td>saddle</td><td>unstable</td></tr>',
  '<tr><td>L4</td><td>center</td><td>open problem</td></tr>',
  '<tr><td>L5</td><td>complex saddle</td><td>unstable</td></tr>',
];
const stepped = (n) => ROWS.map((r, i) => (n.includes(i) ? r.replace('<tr>', `<tr class="fragment" data-fragment-index="${n.indexOf(i) + 1}">`) : r));
const body = (rows) => rows.map((r) => `      ${r}\n`).join('');
const rowNumber = (page, i) => page.evaluate(`(() => { const r = document.querySelector('.beeson-table-bars .bar.rows [data-index="${i}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

async function open(t) {
  const page = await editorPage(browser, { deck: DECK });
  t.after(() => page.close?.());
  await click(page, '.reveal section.present tbody tr:nth-child(1) td');
  await settle(page);
  return page;
}

test('Show Table Row by Row gives each body row a step of its own, as the rows of a talk are written', async (t) => {
  const page = await open(t);
  assert.equal((await state(page, 'steps.listDelivery')).label, 'Show Table Row by Row');
  await click(page, '.reveal section.present tbody tr:nth-child(1) td', { button: 'right' });
  await page.waitFor(`[...document.querySelectorAll('.beeson-edit-menu.cell .item .label')].some((l) => l.textContent === 'Show Table Row by Row')`);
  await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await exec(page, 'steps.listDelivery');
  await byteExact(page, [[body(ROWS), body(stepped([0, 1, 2]))]]);
  assert.equal((await state(page, 'edit.undo')).label, 'Undo Show Table Row by Row');
  assert.equal((await state(page, 'steps.listDelivery')).label, 'Show Table All at Once');
  await page.evaluate('window.BeesonEditor.undo()');
  await byteExact(page);
  assert.equal((await settle(page)).undo, false, 'Show Table Row by Row is more than one entry of the history');
  assert.deepEqual(page.errors, []);
});

test('rows selected by their numbers are given a step with Add as Last Step, and taken back with Show with Slide', async (t) => {
  const page = await open(t);
  await click(page, await rowNumber(page, 2));
  await click(page, await rowNumber(page, 3), { modifiers: 'Shift' });
  await settle(page);
  assert.equal((await state(page, 'steps.add')).enabled, true);
  assert.equal((await state(page, 'steps.remove')).enabled, false);
  await exec(page, 'steps.add');
  const two = ROWS.map((r, i) => (i ? r.replace('<tr>', '<tr class="fragment" data-fragment-index="1">') : r));
  await byteExact(page, [[body(ROWS), body(two)]]);
  assert.equal((await state(page, 'steps.remove')).enabled, true);
  await exec(page, 'steps.remove');
  await byteExact(page);
  assert.deepEqual(page.errors, []);
});
