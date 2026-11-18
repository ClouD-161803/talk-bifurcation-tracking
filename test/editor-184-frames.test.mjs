// the frames of the selection of #184. a selected element, a selected group, the text element of
// the caret, and an entered group are framed with a white line in a dark halo, which is seen on dark
// and light slides, and the grips are white in a gray ring. the hover frame is a faint solid line

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { byteExact, center, click, drag, editorPage, press } from './helpers/editor.mjs';

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
    assert.equal(Math.round(g.size), 11, `${what}: the size of a grip`);
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

// the padlocks of the selection, each with its label, its place, whether it is drawn closed, and
// its center
const padlocks = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-overlay .beeson-lock')].filter((d) => !d.hidden).map((d) => {
  const r = d.getBoundingClientRect(), s = getComputedStyle(d);
  return { label: d.getAttribute('aria-label'), title: d.title, left: r.left, top: r.top, width: r.width, closed: s.backgroundColor === s.borderTopColor || s.backgroundColor === getComputedStyle(document.querySelector('.beeson-overlay .beeson-handle')).color, x: r.left + r.width / 2, y: r.top + r.height / 2 };
})`);
const box = (page, selector) => page.evaluate(`(() => { const r = document.querySelector('.reveal section.present ${selector}').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })()`);
const locked = (page, selector) => page.evaluate(`[...document.querySelectorAll('.reveal section.present ${selector}')].map((el) => el.hasAttribute('data-locked'))`);
const selection = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.classList[0] === 'shape' ? [...el.classList].slice(0, 3).join(' ') : el.classList[0] ?? el.localName)`);
const shownGrips = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-overlay .beeson-grip')].filter((g) => !g.hidden).length`);
const undo = async (page) => { await page.evaluate('window.BeesonEditor.undo()'); await settle(page); };
const redo = async (page) => { await page.evaluate('window.BeesonEditor.redo()'); await settle(page); };

test('a padlock left of each frame locks and unlocks its element, as one entry of the history', async (t) => {
  const page = await load(t);
  await pick(page, 'p.plain');
  let locks = await padlocks(page);
  assert.equal(locks.length, 1, 'a selected paragraph does not have one padlock');
  assert.equal(locks[0].label, 'Lock');
  assert.equal(locks[0].title, 'Lock');
  assert.equal(locks[0].closed, false, 'the padlock of an element that is not locked is drawn closed');
  assert.equal(Math.round(locks[0].width), 22, 'the size of the padlock');
  // in the column of the handle, a row under it
  const p = await box(page, 'p.plain');
  assert.ok(Math.abs(locks[0].left - (p.left - 6 - 10 - 22)) <= 1, `the padlock is not in the column of the handle: ${locks[0].left} for a paragraph at ${p.left}`);
  assert.ok(Math.abs(locks[0].top - (p.top - 6 + 23)) <= 1, `the padlock is not a row under the handle: ${locks[0].top} for a paragraph at ${p.top}`);

  await click(page, locks[0]);
  await settle(page);
  assert.deepEqual(await locked(page, 'p.plain'), [true], 'the padlock does not lock the paragraph');
  assert.deepEqual(await selection(page), ['plain'], 'the selection is not kept');
  locks = await padlocks(page);
  assert.equal(locks.length, 1);
  assert.equal(locks[0].label, 'Unlock');
  assert.equal(locks[0].closed, true, 'the padlock of a locked element is drawn open');
  assert.equal(await shownGrips(page), 0, 'a locked element has grips');
  assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-grip.locked').length`), 0, 'the crosses of a locked element are drawn');
  const frame = await looks(page, '.beeson-overlay .beeson-frame.selected');
  assert.equal(frame[0].opacity, '0.45', 'the opacity of the frame of a locked element');
  await undo(page);
  await byteExact(page);
  await redo(page);
  assert.deepEqual(await locked(page, 'p.plain'), [true], 'a redo does not lock the paragraph again');
  await click(page, (await padlocks(page))[0]);
  await settle(page);
  assert.deepEqual(await locked(page, 'p.plain'), [false], 'the padlock does not unlock the paragraph');
  await undo(page);
  await undo(page);
  await byteExact(page);

  // the keys press the padlock as they press the handle
  await clear(page);
  await pick(page, 'p.plain');
  await page.evaluate(`document.querySelector('.beeson-overlay .beeson-lock:not([hidden])').focus()`);
  await press(page, 'Enter');
  await settle(page);
  assert.deepEqual(await locked(page, 'p.plain'), [true], 'Enter on the padlock does not lock the paragraph');
  await page.evaluate(`document.querySelector('.beeson-overlay .beeson-lock:not([hidden])').focus()`);
  await press(page, 'Space');
  await settle(page);
  assert.deepEqual(await locked(page, 'p.plain'), [false], 'Space on the padlock does not unlock the paragraph');
  await undo(page);
  await undo(page);
  await byteExact(page);

  // the text element with the caret has a padlock as well
  await clear(page);
  await pick(page, 'p.plain');
  await pick(page, 'p.plain');
  assert.equal(await page.evaluate(`document.activeElement.matches('p.plain')`), true, 'the paragraph does not have the caret');
  assert.equal((await padlocks(page)).length, 1, 'the text element of the caret does not have a padlock');
  assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
});

test('a group has one padlock, and each frame of a multiple selection has its own', async (t) => {
  const page = await load(t);
  await pick(page, '.shape.m1');
  let locks = await padlocks(page);
  assert.equal(locks.length, 1, 'a selected group does not have one padlock');
  const m1 = await box(page, '.shape.m1');
  assert.ok(Math.abs(locks[0].top - (m1.top - 6)) <= 1, 'the padlock of a group is not at the top of its frame');
  await click(page, locks[0]);
  await settle(page);
  assert.deepEqual(await locked(page, '.shape[data-group]'), [true, true, true], 'the padlock does not lock the group');
  assert.equal((await selection(page)).length, 3, 'the group is not kept selected');
  assert.equal((await padlocks(page))[0].label, 'Unlock');
  await undo(page);
  await byteExact(page);

  await clear(page);
  await pick(page, 'p.plain');
  await pick(page, '.shape.loose', 'Shift');
  locks = await padlocks(page);
  assert.equal(locks.length, 2, 'a text element and a shape do not have a padlock each');
  await click(page, locks[1]);
  await settle(page);
  assert.deepEqual([...(await locked(page, 'p.plain')), ...(await locked(page, '.shape.loose'))], [false, true], 'a padlock of a multiple selection locks another element than its own');
  assert.equal((await selection(page)).length, 2, 'the selection is not kept');
  await undo(page);
  await byteExact(page);

  // the padlocks are hidden in a drag
  await clear(page);
  await pick(page, '.shape.loose');
  assert.equal((await padlocks(page)).length, 1);
  await drag(page, await at(page, '.shape.loose'), { dx: 60, dy: 30, hold: true });
  assert.equal((await padlocks(page)).length, 0, 'a padlock is shown during a drag');
  const end = await at(page, '.shape.loose');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', clickCount: 1 });
  await settle(page);
  assert.equal((await padlocks(page)).length, 1, 'the padlock is not shown again after the drag');
  assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
});

test('on a phone, a tap on the padlock locks the selected element', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: DECK, query: 'edit&still', page: { width: 390, height: 844, mobile: true }, clear: true });
  t.after(() => page.close().catch(() => {}));
  await page.evaluate('new Promise((d) => setTimeout(() => d(true), 500))');
  const tap = async (p) => {
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await tap(await at(page, '.shape.loose'));
  await page.waitFor(`window.BeesonEditor.selection().some((el) => el.matches('.shape.loose'))`);
  await page.waitFor(`[...document.querySelectorAll('.beeson-overlay .beeson-lock')].some((d) => !d.hidden)`);
  // a second tap within the time of a double tap would be a double tap
  await page.evaluate('new Promise((d) => setTimeout(() => d(true), 600))');
  await tap((await padlocks(page))[0]);
  await page.waitFor(`document.querySelector('.reveal section.present .shape.loose').hasAttribute('data-locked')`);
  assert.deepEqual(await selection(page), ['shape rounded loose'], 'the selection is not kept');
  assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
});
