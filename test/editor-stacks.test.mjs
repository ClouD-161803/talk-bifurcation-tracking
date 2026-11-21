import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { center, click, clickText, drag, editorPage, press } from './helpers/editor.mjs';

const DECK = 'test/pages/stacks.html';
const TWO = ['two-text', 'two-math'];

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

async function open(t, page) {
  const p = await editorPage(browser, { deck: DECK, page });
  t.after(() => p.close());
  return p;
}

const tabs = (page) => page.evaluate(`(() => { const box = document.querySelector('.beeson-step-tabs'); return !box || box.hidden ? null : [...box.querySelectorAll('button')].map((b) => (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + b.textContent); })()`);
const tab = (n) => `document.querySelectorAll('.beeson-step-tabs button')[${n}]`;
async function showTab(page, n) {
  await click(page, await page.evaluate(`(() => { const r = ${tab(n)}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
  await page.waitFor(`${tab(n)}?.getAttribute('aria-pressed') === 'true'`);
}
const boxes = (page, ids) => page.evaluate(`${JSON.stringify(ids)}.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })`);
const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.id || el.localName)`);

test('an edit in one tab of a stack does not move the elements of another tab', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  assert.deepEqual(await tabs(page), ['*Up to step 1', 'From step 2']);
  await showTab(page, 1);
  const before = await boxes(page, TWO);
  await showTab(page, 0);
  await page.evaluate(`window.BeesonEditor.exec('insert.text')`);
  await page.waitFor(`!!document.querySelector('.r-stack > :first-child > p.beeson-pending')`);
  await press(page, 'Escape');
  await press(page, 'Escape');
  await clickText(page, '#one-text');
  await page.waitFor(`document.getElementById('one-text').contains(document.activeElement)`);
  await press(page, 'End');
  await press(page, 'Enter');
  await press(page, 'Enter');
  await page.waitFor(`document.querySelectorAll('.r-stack > :first-child > p').length === 4`);
  await press(page, 'Escape');
  await showTab(page, 1);
  const now = await boxes(page, TWO);
  now.flat().forEach((v, i) => assert.ok(Math.abs(v - before.flat()[i]) <= 0.5, `${JSON.stringify(now)} against ${JSON.stringify(before)}`));
  assert.deepEqual(page.errors, []);
});

test('the elements of a tab that is not shown cannot be clicked, cycled to, or caught by a marquee', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  assert.deepEqual(await tabs(page), ['*Up to step 1', 'From step 2']);
  await click(page, await center(page, '#two-math'));
  for (const id of await selected(page)) assert.ok(!TWO.includes(id), id);
  await click(page, await center(page, '.present h2'));
  const seen = new Set();
  for (let n = 0; n < 6; n++) {
    await press(page, 'Tab');
    for (const id of await selected(page)) seen.add(id);
  }
  assert.deepEqual([...seen].sort(), ['h2', 'one-math', 'one-text', 'shared']);
  await press(page, 'Escape');
  const slide = await page.evaluate(`(() => { const r = document.querySelector('.reveal').getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4, w: r.width - 8, h: r.height - 8 }; })()`);
  await drag(page, { x: slide.x, y: slide.y }, { dx: slide.w, dy: slide.h });
  assert.deepEqual((await selected(page)).sort(), ['h2', 'one-math', 'one-text', 'shared']);
  assert.deepEqual(page.errors, []);
});

test('on a slide whose ranges hide elements, the hidden elements are skipped by Tab and by a marquee', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: 'test/pages/layers.html' });
  t.after(() => page.close());
  await page.evaluate('Reveal.slide(1)');
  await page.waitFor(`document.querySelectorAll('.beeson-step-tabs button').length === 4`);
  await click(page, await center(page, '.present h2'));
  const seen = new Set();
  for (let n = 0; n < 4; n++) {
    await press(page, 'Tab');
    for (const id of await selected(page)) seen.add(id);
  }
  assert.deepEqual([...seen].sort(), ['h2', 'panel-0']);
  await press(page, 'Escape');
  const slide = await page.evaluate(`(() => { const r = document.querySelector('.reveal').getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4, w: r.width - 8, h: r.height - 8 }; })()`);
  await drag(page, { x: slide.x, y: slide.y }, { dx: slide.w, dy: slide.h });
  assert.deepEqual((await selected(page)).sort(), ['h2', 'panel-0']);
  assert.deepEqual(page.errors, []);
});
