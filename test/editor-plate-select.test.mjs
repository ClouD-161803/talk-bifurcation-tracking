// the figures of a plate that holds several of them, e.g. the two videos of a plate of the class row:
// the first click selects the plate, a second click on one of them selects it by itself, one level
// down, and it is then dragged, resized, and nudged by itself, with its offset in its own style,
// while Esc selects the plate again. a figure of one picture with its caption is still one object

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { click, drag, editorPage, press } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-plate-select.html';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const render = (page) => page.evaluate('window.BeesonEditor.render()');
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
// the selected elements, each by its tag and id
const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName + (e.id ? '#' + e.id : ''))`);
// the selection, once it is expected or after 5 s, asserted to be expected
async function selects(page, expected, message) {
  await page.waitFor(`JSON.stringify(window.BeesonEditor.selection().map((e) => e.localName + (e.id ? '#' + e.id : ''))) === ${JSON.stringify(JSON.stringify(expected))}`, 5000).catch(() => {});
  assert.deepEqual(await selected(page), expected, message);
}
// the start tag of the element with id in the text
const tagOf = (text, id) => text.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? '';
const plateTag = (text, slide) => text.split('<section').slice(1)[slide].match(/<div class="plate[^"]*"[^>]*>/)?.[0] ?? '';

async function load(t, slide) {
  const page = await editorPage(browser, { deck: DECK, page: { width: 1600, height: 1000 } });
  t.after(() => page.close().catch(() => {}));
  await page.evaluate(`Reveal.slide(${slide})`);
  await page.waitFor(`Reveal.getIndices().h === ${slide}`);
  await frames(page);
  return page;
}

// two clicks on the element of selector, the second after the time of a double click, which
// select the outer and then the inner element
async function secondClick(page, selector, outer, inner) {
  await click(page, selector);
  await selects(page, outer, 'the first click');
  await sleep(600);
  await click(page, selector);
  await selects(page, inner, 'the second click');
}

test('a video of a plate row, selected by a second click, is dragged by itself', async (t) => {
  const page = await load(t, 0);
  await secondClick(page, 'section.present #left', ['div'], ['video#left']);
  await drag(page, 'section.present #left', { dx: 60, dy: 30 });
  await frames(page);
  const text = await render(page);
  assert.match(tagOf(text, 'left'), /style="translate: \d+px \d+px"/, `the video is not moved: ${tagOf(text, 'left')}`);
  assert.doesNotMatch(plateTag(text, 0), /style=/, `the plate is moved: ${plateTag(text, 0)}`);
  assert.doesNotMatch(tagOf(text, 'right'), /style=/, 'the other video is moved');
  assert.deepEqual(page.errors, []);
});

test('a video of a plate row, selected by a second click, is resized by itself', async (t) => {
  const page = await load(t, 0);
  await secondClick(page, 'section.present #left', ['div'], ['video#left']);
  const before = await page.evaluate(`document.querySelector('section.present #left').getBoundingClientRect().width`);
  const grip = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-grip[data-handle="se"]')].find((g) => g.getClientRects().length && !g.hidden); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  assert.ok(grip, 'the selected video has no grip');
  await drag(page, grip, { dx: -60, dy: -40 });
  await frames(page);
  const text = await render(page);
  assert.match(tagOf(text, 'left'), /width: \d+px/, `the video is not resized: ${tagOf(text, 'left')}`);
  const now = await page.evaluate(`document.querySelector('section.present #left').getBoundingClientRect().width`);
  assert.ok(now < before - 20, `the video is ${now} px wide after the resize, and ${before} px before`);
  assert.doesNotMatch(tagOf(text, 'right'), /style=/, 'the other video is resized or moved');
  assert.deepEqual(page.errors, []);
});

test('a figure of a plate of two figures is selected by a second click, dragged by itself, and Esc selects the plate', async (t) => {
  const page = await load(t, 1);
  await secondClick(page, 'section.present #first img', ['div'], ['figure#first']);
  await drag(page, 'section.present #first img', { dx: 50, dy: 20 });
  await frames(page);
  const text = await render(page);
  assert.match(tagOf(text, 'first'), /style="translate: \d+px \d+px"/, `the figure is not moved: ${tagOf(text, 'first')}`);
  assert.doesNotMatch(plateTag(text, 1), /style=/, `the plate is moved: ${plateTag(text, 1)}`);
  await press(page, 'Escape');
  await selects(page, ['div'], 'Esc selects the plate around the figure');
  assert.deepEqual(page.errors, []);
});

test('a picture of a figure of one picture, selected by a second click, still moves the figure with its caption', async (t) => {
  const page = await load(t, 2);
  await secondClick(page, 'section.present #one img', ['figure#one'], ['img']);
  await drag(page, 'section.present #one img', { dx: 40, dy: 20 });
  await frames(page);
  const text = await render(page);
  assert.match(tagOf(text, 'one'), /style="translate: \d+px \d+px"/, `the figure is not moved with its picture: ${tagOf(text, 'one')}`);
  assert.doesNotMatch(text.match(/<img src="..\/..\/demo\/figure-light.png" alt="The one figure"[^>]*>/)?.[0] ?? '', /style=/, 'the picture is moved out of its figure');
  assert.deepEqual(page.errors, []);
});
