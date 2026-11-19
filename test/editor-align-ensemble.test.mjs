import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-align-ensemble.html';
const PLATFORMS = ['mac', 'other'];

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

async function load(platform) {
  const page = await browser.newPage();
  await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(DECK, 'utf8');
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
  assert.deepEqual(status.problems, []);
  await frames(page);
  return page;
}

const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');

const screen = (page, x, y) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  return { x: r.left + ${x} * k, y: r.top + ${y} * k };
})()`);

const places = (page) => page.evaluate(`Object.fromEntries([...Reveal.getCurrentSlide().querySelectorAll('.shape')].map((el) => [el.textContent.trim(), el.style.translate]))`);

async function select(page, ...at) {
  await clickText(page, await screen(page, ...at[0]));
  for (const p of at.slice(1)) await click(page, await screen(page, ...p), { modifiers: 'Shift' });
  await frames(page);
  assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), at.length);
}

const [A, B, C, L] = [[600, 400], [1100, 400], [1600, 800], [200, 800]];
const SOURCE = { A: '400px 300px', B: '900px 300px', C: '1500px 700px', L: '100px 700px' };

for (const platform of PLATFORMS) {
  test(`Align Center of two rectangles side by side centers them on the slide as a pair, as one entry (${platform})`, async () => {
    const page = await load(platform);
    await select(page, A, B);
    assert.equal((await state(page, 'arrange.alignTo.slide')).checked, true, 'Align to Slide is not the default');
    await exec(page, 'arrange.align.center');
    await frames(page);
    assert.deepEqual(await places(page), { ...SOURCE, A: '510px 300px', B: '1010px 300px' });
    assert.equal((await state(page, 'edit.undo')).label, 'Undo Align Center');
    await undo(page);
    await byteExact(page);
    await exec(page, 'arrange.align.bottom');
    await frames(page);
    assert.deepEqual(await places(page), { ...SOURCE, A: '400px 880px', B: '900px 880px' });
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test(`Align to Selection aligns the objects to each other (${platform})`, async () => {
    const page = await load(platform);
    await select(page, A, B);
    await exec(page, 'arrange.alignTo.selection');
    assert.equal((await state(page, 'arrange.alignTo.selection')).checked, true);
    await exec(page, 'arrange.align.center');
    await frames(page);
    assert.deepEqual(await places(page), { ...SOURCE, A: '650px 300px', B: '650px 300px' });
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test(`a locked element is not moved by Align Left, and its box is left out of the box of the ensemble (${platform})`, async () => {
    const page = await load(platform);
    await select(page, A, B, L);
    const on = (await state(page, 'arrange.align.left')).enabled;
    await exec(page, 'arrange.align.left');
    await frames(page);
    assert.deepEqual(await places(page), on ? { ...SOURCE, A: '0px 300px', B: '500px 300px' } : SOURCE);
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test(`Distribute is dimmed for two objects and spaces three within the selection with either switch (${platform})`, async () => {
    const page = await load(platform);
    await select(page, A, B);
    for (const ref of ['slide', 'selection', 'slide']) {
      await exec(page, `arrange.alignTo.${ref}`);
      for (const k of ['horizontal', 'vertical', 'evenly']) assert.equal((await state(page, `arrange.distribute.${k}`)).enabled, false, `Distribute ${k} of two objects with Align to ${ref}`);
    }
    await click(page, await screen(page, ...C), { modifiers: 'Shift' });
    await frames(page);
    await exec(page, 'arrange.distribute.horizontal');
    await frames(page);
    assert.deepEqual(await places(page), { ...SOURCE, B: '950px 300px' });
    assert.deepEqual(page.errors, []);
    await page.close();
  });
}
