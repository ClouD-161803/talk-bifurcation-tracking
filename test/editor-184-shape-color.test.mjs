// issue #184: a text color chosen while a shape is selected as a box is written as the tone of the
// shape, as with Shape Color, and the words of the shape are drawn in the color they had. with
// words of the shape selected, the color is written on the words and the tone of the shape is
// kept. with a shape and a paragraph selected, the tone is written on the shape as a shape tone
// and on the paragraph as a span. each change is one entry of the history, and the file is
// compared byte for byte after the change, its undo, and its redo

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-r20-2.html';
const PANEL = '#beeson-edit-panel-format';
const GOAL = '<div class="shape rounded tone-accent weight-6" style="width: 400px; height: 160px; translate: 120px 260px"><p>Goal</p></div>';
const CARD = '<div class="shape rounded" style="width: 500px; height: 300px; translate: 1100px 400px; rotate: 30deg"><p>Card</p></div>';
const BESIDE = '<p>A paragraph beside a card.</p>';

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

async function shapePage(n) {
  const page = await browser.newPage();
  await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=other`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(DECK, 'utf8');
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
  assert.deepEqual(status.problems, []);
  await page.evaluate(`Reveal.slide(${n})`);
  await frames(page);
  if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
  await frames(page);
  return page;
}

const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const screen = (page, x, y) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  return { x: r.left + ${x} * k, y: r.top + ${y} * k };
})()`);
const tab = (page, name) => page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === ${JSON.stringify(name)})?.click()`);
const swatch = (page, id) => page.evaluate(`document.querySelector('${PANEL} [data-command="${id}"]')?.getAttribute('aria-pressed') ?? null`);
// the computed color of the words of each shape of the current slide
const colors = (page) => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('.shape p')].map((p) => getComputedStyle(p.querySelector('span') ?? p).color)`);
const shapeColor = (page) => page.evaluate(`getComputedStyle(Reveal.getCurrentSlide().querySelector('.shape')).color`);

// the file after the edit, after its undo, and after its redo, each compared byte for byte with
// the deck changed by edits, and by earlier before the edit
async function oneEntry(page, edits, earlier = []) {
  await byteExact(page, edits);
  await page.evaluate('window.BeesonEditor.undo()');
  await frames(page);
  await byteExact(page, earlier);
  await page.evaluate('window.BeesonEditor.redo()');
  await frames(page);
  await byteExact(page, edits);
}

test('a text color chosen with a shape selected as a box colors the shape and not its words', async () => {
  const page = await shapePage(1);
  await click(page, await screen(page, 140, 280));
  assert.equal(await page.evaluate(`window.BeesonEditor.selection().map((el) => [...el.classList].filter((c) => !c.startsWith('beeson-')).join(' ')).join()`), 'shape rounded tone-accent weight-6');
  const words = await colors(page);
  // Format > Text Color runs the same commands as the swatches of the Text pane
  await exec(page, 'text.tone.blue');
  await frames(page);
  // the tone class is written last, as Shape Color writes it
  const blue = [[GOAL, GOAL.replace('tone-accent weight-6', 'weight-6 tone-blue')]];
  await oneEntry(page, blue);
  assert.deepEqual(await colors(page), words);
  assert.equal((await state(page, 'text.tone.blue')).checked, true);
  assert.equal((await state(page, 'shape.tone.blue')).checked, true);
  await tab(page, 'Text');
  await frames(page);
  assert.equal(await swatch(page, 'text.tone.blue'), 'true');
  assert.equal(await swatch(page, 'text.tone.accent'), 'false');
  await click(page, `${PANEL} [data-command="text.tone.text"]`);
  await frames(page);
  await oneEntry(page, [[GOAL, GOAL.replace(' tone-accent', '')]], blue);
  assert.deepEqual(await colors(page), words);
  assert.equal(await swatch(page, 'text.tone.text'), 'true');
  // the shape tones do not have a Subtle
  assert.equal((await state(page, 'text.tone.subtle')).enabled, false);
  await page.close();
});

test('a text color chosen with words of a shape selected colors the words and not the shape', async () => {
  const page = await shapePage(1);
  await click(page, await screen(page, 140, 280));
  const tone = await shapeColor(page);
  await click(page, await screen(page, 320, 340), { count: 2 });
  await frames(page);
  assert.equal(await page.evaluate('getSelection().toString().trim()'), 'Goal');
  await exec(page, 'text.tone.red');
  await frames(page);
  await oneEntry(page, [[GOAL, GOAL.replace('<p>Goal</p>', '<p><span class="tone-red">Goal</span></p>')]]);
  assert.equal(await shapeColor(page), tone);
  await page.close();
});

test('a text color chosen with a shape and a paragraph selected colors the shape as a shape and the paragraph as words', async () => {
  const page = await shapePage(3);
  const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
  await click(page, p);
  await click(page, await screen(page, 1180, 470), { modifiers: 'Shift' });
  assert.equal(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName).sort().join()`), 'div,p');
  const card = (await colors(page))[0];
  await exec(page, 'text.tone.violet');
  await frames(page);
  await oneEntry(page, [
    [BESIDE, '<p><span class="tone-violet">A paragraph beside a card.</span></p>'],
    [CARD, CARD.replace('shape rounded', 'shape rounded tone-violet')],
  ]);
  assert.equal((await colors(page))[0], card);
  assert.equal((await state(page, 'text.tone.violet')).checked, true);
  await page.close();
});
