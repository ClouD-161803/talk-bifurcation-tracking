// a tycho viewer is resized in the editor as a picture is (issue #39): its grips at the top and the bottom are
// shown, a corner keeps the aspect of its box while Constrain Proportions is on, a grip at a side changes one
// dimension while it is off, and its width and its height are written into its style, which its scene is laid out
// into. the Arrange pane writes both as well, and the text written is opened again without a problem

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { byteExact, click, drag, editorPage } from './helpers/editor.mjs';

const VIEWER = '.reveal section.present tycho-viewer';
const TAG = '<tycho-viewer theme="dark" kiosk class="figure-box">';

// the box of the first shown element of a selector, and of the canvas of the viewer, in slide px
const boxes = `(() => {
  const v = document.querySelector(${JSON.stringify(VIEWER)});
  const s = document.querySelector('.reveal .slides').getBoundingClientRect();
  const k = s.width / 1920;
  const b = (r) => ({ x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k });
  const c = v.shadowRoot.querySelector('canvas');
  return { viewer: b(v.getBoundingClientRect()), canvas: c ? b(c.getBoundingClientRect()) : null };
})()`;

// the editor on the slide of test-deck.html with its tycho viewer, the viewer selected by a click on the band just
// outside its left border, since a drag inside it turns its scene
async function viewerSelected(browser, { constrain = null } = {}) {
  const page = await editorPage(browser, { clear: true });
  if (constrain) await page.evaluate(`(() => { localStorage.setItem('beeson-edit-constrain-viewer', '${constrain}'); return true; })()`);
  const n = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('tycho-viewer'))`);
  assert.ok(n >= 0, 'the slide with a tycho viewer is not found');
  await page.evaluate(`(() => { Reveal.slide(${n}, 0); return true; })()`);
  await page.waitFor(`(() => { const v = document.querySelector(${JSON.stringify(VIEWER)}); return !!v && (v.state ?? null) !== null && !!v.shadowRoot.querySelector('canvas'); })()`, 60000);
  const at = await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(VIEWER)}).getBoundingClientRect(); return { x: r.left - 3, y: r.top + r.height / 2 }; })()`);
  await click(page, at);
  await page.waitFor(`window.BeesonEditor.selection().some((el) => el.localName === 'tycho-viewer')`);
  return page;
}

const grips = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-grip')].filter((g) => !g.hidden).map((g) => g.dataset.handle).sort().join(' ')`);
const styleOf = (page) => page.evaluate(`document.querySelector(${JSON.stringify(VIEWER)}).getAttribute('style') ?? ''`);
const px = (style, name) => Number(new RegExp(`(?:^|;\\s*)${name}: (\\d+)px`).exec(style)?.[1]);

test('a corner of a tycho viewer resizes its box at its aspect, with its width and its height written, and its scene follows', { timeout: 180000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await viewerSelected(browser);
  assert.equal(await grips(page), 'e n ne nw s se sw w', 'the grips at the top and the bottom of the viewer are not shown');
  const before = await page.evaluate(boxes);
  await drag(page, '.beeson-grip[data-handle="se"]', { dx: 60, dy: 60 });
  await page.waitFor(`(() => { const b = ${boxes}; return !!b.canvas && Math.abs(b.canvas.w - b.viewer.w) < 1 && Math.abs(b.canvas.h - b.viewer.h) < 1 && b.viewer.h > ${before.viewer.h + 20}; })()`, 60000);
  const after = await page.evaluate(boxes);
  const style = await styleOf(page);
  const [w, h] = [px(style, 'width'), px(style, 'height')];
  assert.ok(w > before.viewer.w + 20 && h > before.viewer.h + 20, `the box is not larger in both dimensions: ${style}`);
  const ratio = (w / h) / (before.viewer.w / before.viewer.h);
  assert.ok(Math.abs(ratio - 1) < 0.01, `the aspect of the box is not kept: ${style}`);
  assert.ok(Math.abs(after.viewer.w - w) < 1 && Math.abs(after.viewer.h - h) < 1, `the viewer is not drawn at the size written: ${JSON.stringify(after.viewer)}`);
  await byteExact(page, [[TAG, `<tycho-viewer theme="dark" kiosk class="figure-box" style="width: ${w}px; height: ${h}px">`]]);
  // the text written is opened again without a problem, i.e. a height on a viewer is in the scope rule
  const text = await page.evaluate('window.BeesonEditor.render()');
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(text)})`);
  assert.deepEqual(status.problems, []);
  assert.deepEqual(page.errors, []);
});

test('a grip at a side of a tycho viewer changes one dimension while Constrain Proportions is off, and one undo takes it back', { timeout: 180000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await viewerSelected(browser, { constrain: 'off' });
  const before = await page.evaluate(boxes);
  await drag(page, '.beeson-grip[data-handle="s"]', { dy: 60 });
  await page.waitFor(`/height: \\d+px/.test(document.querySelector(${JSON.stringify(VIEWER)}).getAttribute('style') ?? '')`);
  const style = await styleOf(page);
  assert.ok(Math.abs(px(style, 'width') - before.viewer.w) < 1, `the width is changed: ${style}`);
  assert.ok(px(style, 'height') > before.viewer.h + 20, `the height is not larger: ${style}`);
  await page.evaluate('window.BeesonEditor.undo()');
  // the runtime of tycho writes the colors of its theme into the style of the viewer, hence the size alone is read
  assert.doesNotMatch(await styleOf(page), /(^|;\s*)(width|height):/, 'one undo does not take the size off');
  await byteExact(page);
  assert.deepEqual(page.errors, []);
});

test('the Height field of the Arrange pane resizes a tycho viewer at its aspect, with its width and its height written', { timeout: 180000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await viewerSelected(browser);
  const before = await page.evaluate(boxes);
  assert.equal(await page.evaluate(`window.BeesonEditor.state('arrange.constrainProportions').enabled`), true, 'Constrain Proportions is not offered for a viewer');
  await page.evaluate(`(() => { window.BeesonEditor.exec('arrange.setSize', { h: 900 }); return true; })()`);
  const style = await styleOf(page);
  assert.equal(px(style, 'height'), 900, `the height is not written as typed: ${style}`);
  assert.ok(Math.abs(px(style, 'width') - (900 * before.viewer.w) / before.viewer.h) <= 1, `the width does not follow the aspect: ${style}`);
  assert.deepEqual(page.errors, []);
});
