// the frames of the selection of #184. a selected element, a selected group, the text element of
// the caret, and an entered group are framed with a white line in a dark halo, which is seen on dark
// and light slides, and the grips are white in a gray ring. the hover frame is a faint solid line

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { center, click, editorPage } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-184-frames.html';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

const settle = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');

async function load(t, theme = 'dark') {
  const page = await editorPage(browser, { deck: DECK, query: `edit&still&theme=${theme}&edit-platform=mac`, page: { width: 1600, height: 1000 }, clear: true });
  t.after(() => page.close().catch(() => {}));
  await settle(page);
  return page;
}

const at = (page, selector) => center(page, `.reveal section.present ${selector}`);
const move = (page, { x, y }) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
async function pick(page, selector, modifiers = '') {
  await click(page, await at(page, selector), { modifiers });
  await settle(page);
}
async function clear(page) {
  await page.evaluate(`window.BeesonEditor.exec('selection.clear').then(() => true)`);
  await settle(page);
}

// the look of each shown part of the overlay matched by selector
const looks = (page, selector) => page.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].filter((d) => !d.hidden && d.getClientRects().length).map((d) => {
  const s = getComputedStyle(d);
  return { width: s.borderTopWidth, style: s.borderTopStyle, color: s.borderTopColor, shadow: s.boxShadow, opacity: s.opacity, background: s.backgroundColor, size: d.getBoundingClientRect().width };
})`);

const WHITE = 'rgb(255, 255, 255)';
const HALO = 'rgba(0, 0, 0, 0.55)';
const RING = 'rgb(68, 68, 68)';

function assertWhite(frames, what, style = 'solid') {
  assert.ok(frames.length > 0, `${what} is not framed`);
  for (const f of frames) {
    assert.equal(f.width, '1px', `${what}: the width of the frame`);
    assert.equal(f.style, style, `${what}: the style of the frame`);
    assert.equal(f.color, WHITE, `${what}: the color of the frame`);
    assert.equal(f.shadow.split(HALO).length, 3, `${what}: the halo outside and inside the frame, ${f.shadow}`);
    assert.match(f.shadow, /inset/, `${what}: the halo inside the frame`);
    assert.equal(f.opacity, '1', `${what}: the opacity of the frame`);
  }
}

function assertGrips(grips, what) {
  assert.ok(grips.length > 0, `${what} does not have grips`);
  for (const g of grips) {
    assert.equal(g.width, '1px', `${what}: the ring of a grip`);
    assert.equal(g.color, RING, `${what}: the color of the ring of a grip`);
    assert.equal(g.background, WHITE, `${what}: the fill of a grip`);
    assert.equal(Math.round(g.size), 12, `${what}: the size of a grip`);
  }
}

for (const theme of ['dark', 'light']) {
  test(`the selection is framed in white with a dark halo on a ${theme} slide`, async (t) => {
    const page = await load(t, theme);
    await pick(page, 'p.plain');
    await pick(page, '.shape.loose', 'Shift');
    assertWhite(await looks(page, '.beeson-overlay .beeson-frame.selected'), 'a text element and a shape');
    assertGrips(await looks(page, '.beeson-overlay .beeson-grip'), 'a text element and a shape');
    const rotor = await looks(page, '.beeson-overlay .beeson-rotor');
    assert.equal(rotor.length, 1, 'the rotate handle is not shown');
    assert.equal(rotor[0].color, RING, 'the ring of the rotate handle');
    assert.equal(rotor[0].width, '1px', 'the width of the ring of the rotate handle');

    await clear(page);
    await pick(page, '.shape.m1');
    assertWhite(await looks(page, '.beeson-overlay .beeson-frame.union'), 'a group');
    await pick(page, '.shape.m1');
    assertWhite(await looks(page, '.beeson-overlay .beeson-frame.entered'), 'an entered group', 'dashed');
    assertWhite(await looks(page, '.beeson-overlay .beeson-frame.selected'), 'a member of an entered group');

    await clear(page);
    await pick(page, 'svg.line');
    const ends = await looks(page, '.beeson-line-end');
    assert.ok(ends.length > 0, 'the ends of the line are not shown');
    for (const e of ends) assert.equal(e.color, RING, 'the ring of an end of a line');
    assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
  });
}

test('the text with the caret has one white frame, and the hover frame is a faint solid line', async (t) => {
  const page = await load(t);
  await pick(page, 'p.plain');
  await pick(page, 'p.plain');
  assert.equal(await page.evaluate(`document.activeElement.matches('p.plain')`), true, 'the paragraph does not have the caret');
  const outline = await page.evaluate(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle === 'none' || /rgba\\(.*, 0\\)|transparent/.test(s.outlineColor); })()`);
  assert.equal(outline, true, 'the text with the caret has an outline besides its frame');
  assertWhite(await looks(page, '.beeson-overlay .beeson-frame.selected'), 'the text with the caret');

  await move(page, await at(page, '.shape.loose'));
  await settle(page);
  const hover = await looks(page, '.beeson-overlay .beeson-frame:not(.selected, .union, .entered)');
  assert.equal(hover.length, 1, 'the hover frame is not shown');
  assert.equal(hover[0].style, 'solid', 'the style of the hover frame');
  assert.equal(hover[0].width, '1px', 'the width of the hover frame');
  assert.equal(hover[0].opacity, '0.3', 'the opacity of the hover frame');

  // the hover outline of a text is a faint solid line as well
  await move(page, await at(page, 'p.held'));
  await settle(page);
  const hovered = await page.evaluate(`getComputedStyle(document.querySelector('.reveal section.present p.held')).outlineStyle`);
  assert.equal(hovered, 'solid', 'the hover outline of a text');

  // the handle is highlighted in the color of the text of the editor
  await clear(page);
  await move(page, await at(page, 'p.plain'));
  await settle(page);
  const handle = await page.evaluate(`(() => { const r = document.querySelector('.beeson-overlay .beeson-handle:not([hidden])').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await move(page, handle);
  await settle(page);
  const colors = await page.evaluate(`(() => { const h = document.querySelector('.beeson-overlay .beeson-handle:not([hidden])'); return { border: getComputedStyle(h).borderTopColor, text: getComputedStyle(h).color }; })()`);
  assert.equal(colors.border, colors.text, 'the border of the handle under the pointer');
  assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
});
