// regression tests of #184 with trusted input. the cursor over a text element is the move cursor
// wherever a press selects or drags it as a box, and the I-beam only where a press puts the caret,
// also right after a click under a pointer that is not moved. the handle of a table at the right
// of a list stays at the table while the pointer crosses the list on its way to the handle

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { center, click } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-184.html';

let browser;
let server;
before(async () => {
  browser = await launch({ offline: false });
  server = await serve('.');
});
after(async () => {
  await browser?.close();
  server?.close();
});

const js = (v) => JSON.stringify(v);
const settle = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');

async function load(t, slide) {
  const page = await browser.newPage({ width: 1600, height: 1000 });
  t.after(() => page.close().catch(() => {}));
  await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=mac`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  const s = await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(DECK, 'utf8'))})`);
  assert.deepEqual(s.problems, []);
  await page.evaluate(`Reveal.slide(${slide})`);
  await page.waitFor(`Reveal.getIndices().h === ${slide}`);
  await settle(page);
  return page;
}

const move = (page, { x, y }) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const cursorAt = (page, { x, y }) => page.evaluate(`getComputedStyle(document.elementFromPoint(${x}, ${y})).cursor`);
// the cursor at the point p after a click there, read without a pointer move
async function clicked(page, p) {
  await click(page, p);
  await settle(page);
  return cursorAt(page, p);
}
// a point in the words of the first element of the current slide matched by selector
const words = (page, selector) => center(page, `.reveal section.present ${selector}`);
// a click on an empty point of the slide, which takes the caret out and clears the selection
async function clear(page) {
  await click(page, await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 30 }; })()`));
  await settle(page);
  assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 0, 'the selection is not cleared');
}

test('the cursor over a text element is the move cursor where a press selects or drags it as a box', async (t) => {
  const page = await load(t, 0);
  const plain = await words(page, 'p.plain');
  await move(page, plain);
  await settle(page);
  assert.equal(await cursorAt(page, plain), 'move', 'a paragraph that is not selected');
  assert.equal(await clicked(page, plain), 'move', 'a paragraph selected by a click, which a press drags');
  assert.equal(await clicked(page, plain), 'text', 'the paragraph with the caret');

  const first = await words(page, 'ul.items li:first-child');
  const second = await words(page, 'ul.items li:last-child');
  await move(page, first);
  await settle(page);
  assert.equal(await cursorAt(page, first), 'move', 'a list that is not selected, while another text has the caret');
  assert.equal(await clicked(page, first), 'move', 'a list selected by a click');
  assert.equal(await clicked(page, first), 'text', 'the item with the caret');
  await move(page, second);
  await settle(page);
  assert.equal(await cursorAt(page, second), 'text', 'another item of the list with the caret');
  await move(page, plain);
  await settle(page);
  assert.equal(await cursorAt(page, plain), 'move', 'another paragraph while a list has the caret');

  const cell = await words(page, 'td');
  await move(page, cell);
  await settle(page);
  assert.equal(await cursorAt(page, cell), 'text', 'a cell, which takes the caret at the first click');

  await clear(page);
  const held = await words(page, 'p.held');
  await move(page, held);
  await settle(page);
  assert.equal(await cursorAt(page, held), 'default', 'a locked paragraph that is not selected');
  assert.equal(await clicked(page, held), 'text', 'the words of a selected locked paragraph');

  await clear(page);
  const member = await words(page, 'p.member');
  await move(page, member);
  await settle(page);
  assert.equal(await cursorAt(page, member), 'move', 'a member of a group that is not selected');
  assert.equal(await clicked(page, member), 'move', 'a member of the selected group');
  assert.equal(await clicked(page, member), 'move', 'the member selected inside its group');
  assert.equal(await clicked(page, member), 'text', 'the member with the caret');

  await clear(page);
  const shape = await words(page, '.shape p');
  await move(page, shape);
  await settle(page);
  assert.equal(await cursorAt(page, shape), 'move', 'the words of a shape that is not selected');
  assert.equal(await clicked(page, shape), 'move', 'the words of the selected shape');
  assert.equal(await clicked(page, shape), 'text', 'the words of the shape with the caret');
  assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
});

// the center of the handle, or null where the handle is hidden
const handle = (page) => page.evaluate(`(() => { const h = document.querySelector('.beeson-overlay .beeson-handle'); if (h.hidden) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);

// the pointer moved in steps from a cell of the table to the handle, with the handle read at each step
async function toHandle(page) {
  const from = await words(page, 'td');
  await move(page, from);
  await settle(page);
  const to = await handle(page);
  assert.ok(to, 'the table does not show its handle');
  const table = await page.evaluate(`Reveal.getCurrentSlide().querySelector('table').getBoundingClientRect().left`);
  assert.ok(to.x < table, 'the handle is not left of the table');
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await move(page, p);
    await settle(page);
    assert.deepEqual(await handle(page), to, `the handle moved away at step ${i} of the way, at ${js(p)}`);
  }
  return to;
}

test('the handle of a table stays reachable over a list on the way to it', async (t) => {
  const page = await load(t, 1);
  const ul = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector('ul').getBoundingClientRect(); return { left: r.left, right: r.right }; })()`);
  const table = await page.evaluate(`Reveal.getCurrentSlide().querySelector('table').getBoundingClientRect().left`);
  assert.ok(ul.right > table, 'the list does not reach under the left of the table');
  const to = await toHandle(page);
  assert.ok(to.x > ul.left + 30, 'the handle is not over the list');
  // a few pixels left of the handle, the list under the pointer is hovered
  await move(page, { x: to.x - 25, y: to.y });
  await settle(page);
  assert.notDeepEqual(await handle(page), to, 'the list left of the handle is not hovered');

  // the same with the caret in a cell of the table
  await click(page, await words(page, 'td'));
  await settle(page);
  assert.equal(await page.evaluate(`!!document.activeElement.closest('td')`), true, 'the cell does not take the caret');
  await toHandle(page);
  assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
});
