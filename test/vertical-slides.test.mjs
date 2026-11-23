import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';

const deck = 'test/pages/stack.html';

const logos = `((slide) => [slide, ...(slide.parentElement.matches('section') ? [slide.parentElement] : [])]
  .filter((section) => getComputedStyle(section, '::after').content !== 'none').length)`;

test('a vertical slide shows its heading at the place of the heading of the other slides, under one logo', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(deckUrl(deck, 'still'));
  await page.waitFor(deckSettled);
  const shown = await page.evaluate(`[[1, 0], [2, 0], [2, 1], [3, 0]].map(([h, v]) => {
    Reveal.slide(h, v);
    const slide = Reveal.getCurrentSlide();
    const frame = document.querySelector('.reveal .slides').getBoundingClientRect();
    const box = slide.querySelector('h2').getBoundingClientRect();
    return [slide.querySelector('h2').textContent, Math.round(box.left - frame.left), Math.round(box.top - frame.top), ${logos}(slide)];
  })`);
  const [, left, top] = shown[0];
  assert.deepEqual(shown, [['First', left, top, 1], ['Second', left, top, 1], ['Third', left, top, 1], ['Fourth', left, top, 1]]);
});

test('a vertical slide is printed with its heading at the place of the heading of the other slides, under one logo', { timeout: 180000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await printView(page, deckUrl(deck, 'print-pdf&still'));
  const printed = await page.evaluate(`[...document.querySelectorAll('.pdf-page')].filter((p) => p.querySelector('h2')).map((p) => {
    const box = p.querySelector('h2').getBoundingClientRect();
    const frame = p.getBoundingClientRect();
    return [p.querySelector('h2').textContent, Math.round(box.left - frame.left), Math.round(box.top - frame.top), ${logos}(p.querySelector('h2').closest('section'))];
  })`);
  const [, left, top] = printed[0];
  assert.deepEqual(printed, [['First', left, top, 1], ['Second', left, top, 1], ['Third', left, top, 1], ['Fourth', left, top, 1]]);
});
