// on a phone, a touch drag of a grip of a selected paragraph resizes the paragraph and leaves the
// deck on its slide, with the navigator or the Format pane open beside the canvas (#61)

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

// a trusted drag of one finger from the point x, y by dx, dy, in eight steps
async function touchDrag(page, { x, y }, dx, dy) {
  const at = (k) => [{ x: x + (dx * k) / 8, y: y + (dy * k) / 8, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let k = 1; k <= 8; k++) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

for (const pane of ['view.navigator', 'shell.format']) {
  test(`on a phone with ${pane} open, a touch drag of the east grip of a paragraph widens it and keeps the slide (#61)`, { timeout: 120000 }, async (t) => {
    const page = await editorPage(browser, { page: { width: 390, height: 844, mobile: true } });
    t.after(() => page.close());
    await page.evaluate(`(() => { const e = window.BeesonEditor; if (!e.state(${js(pane)}).checked) e.exec(${js(pane)}); return true; })()`);
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
    // a first tap selects the paragraph as a box
    const at = await center(page, PARA);
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitFor(`window.BeesonEditor.selection().includes(document.querySelector(${js(PARA)}))`);
    await page.waitFor(`[...document.querySelectorAll(${js(GRIP)})].some((g) => g.getClientRects()[0]?.width)`);
    const grip = await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(GRIP)})].map((g) => g.getBoundingClientRect()).find((r) => r.width); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const width = await page.evaluate(`document.querySelector(${js(PARA)}).getBoundingClientRect().width`);
    await touchDrag(page, grip, 48, 24);
    await page.evaluate('new Promise((d) => setTimeout(() => d(true), 800))');
    assert.equal(await page.evaluate('Reveal.getCurrentSlide() === window.__slide'), true, 'the drag changes the slide');
    const wider = await page.evaluate(`window.__slide.querySelector(':scope > p').getBoundingClientRect().width`);
    assert.ok(wider > width + 20, `the paragraph is ${wider} px wide after the drag, and ${width} px before it`);
    assert.deepEqual(page.errors, []);
  });
}
