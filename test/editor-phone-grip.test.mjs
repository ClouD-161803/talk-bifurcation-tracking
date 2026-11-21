import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { center, editorPage } from './helpers/editor.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const PARA = '.reveal section.present > p';
const GRIP = '.beeson-grip[data-handle="e"]';
const js = (v) => JSON.stringify(v);

async function touchDrag(page, { x, y }, dx, dy) {
  const at = (k) => [{ x: x + (dx * k) / 8, y: y + (dy * k) / 8, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let k = 1; k <= 8; k++) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function selected(t, pane) {
  const page = await editorPage(browser, { page: { width: 390, height: 844, mobile: true } });
  t.after(() => page.close());
  if (pane) await page.evaluate(`(() => { const e = window.BeesonEditor; if (!e.state(${js(pane)}).checked) e.exec(${js(pane)}); return true; })()`);
  await page.evaluate('new Promise((d) => setTimeout(() => d(true), 500))');
  await page.evaluate(`(() => {
    const s = [...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector(':scope > p'));
    const { h, v } = Reveal.getIndices(s);
    Reveal.slide(h, v);
    window.__slide = s;
    return true;
  })()`);
  await page.waitFor('Reveal.getCurrentSlide() === window.__slide');
  await page.evaluate('new Promise((d) => setTimeout(() => d(true), 500))');
  const at = await center(page, PARA);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitFor(`window.BeesonEditor.selection().includes(document.querySelector(${js(PARA)}))`);
  await page.waitFor(`[...document.querySelectorAll(${js(GRIP)})].some((g) => g.getClientRects()[0]?.width)`);
  const grip = await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(GRIP)})].map((g) => g.getBoundingClientRect()).find((r) => r.width); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  return { page, grip };
}

for (const pane of ['view.navigator', 'shell.format']) {
  test(`on a phone with ${pane} open, a touch drag of the east grip of a paragraph widens it and keeps the slide (#61)`, { timeout: 120000 }, async (t) => {
    const { page, grip } = await selected(t, pane);
    const width = await page.evaluate(`document.querySelector(${js(PARA)}).getBoundingClientRect().width`);
    await touchDrag(page, grip, 48, 24);
    await page.evaluate('new Promise((d) => setTimeout(() => d(true), 800))');
    assert.equal(await page.evaluate('Reveal.getCurrentSlide() === window.__slide'), true, 'the drag changes the slide');
    const wider = await page.evaluate(`window.__slide.querySelector(':scope > p').getBoundingClientRect().width`);
    assert.ok(wider > width + 20, `the paragraph is ${wider} px wide after the drag, and ${width} px before it`);
    assert.deepEqual(page.errors, []);
  });
}

test('on a phone, a tap on a grip of a selected paragraph puts the caret into it and keeps its width (#61)', { timeout: 120000 }, async (t) => {
  const { page, grip } = await selected(t, null);
  const width = await page.evaluate(`document.querySelector(${js(PARA)}).getBoundingClientRect().width`);
  await page.evaluate('new Promise((d) => setTimeout(() => d(true), 600))');
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...grip, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitFor(`(() => { const p = document.querySelector(${js(PARA)}); return document.activeElement === p && p.contains(getSelection().focusNode); })()`);
  assert.equal(await page.evaluate(`document.querySelector(${js(PARA)}).getBoundingClientRect().width`), width);
  assert.deepEqual(page.errors, []);
});
