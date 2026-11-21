import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, saveAndReopen } from './helpers/editor.mjs';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const DARK = '<img class="for-dark" src="../../demo/figure-dark.png" alt="A figure, dark version">';
const IMG = 'section.present figure.figure-box img.for-dark';

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

const render = (page) => page.evaluate('window.BeesonEditor.render()');
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const typeset = (page) => page.evaluate('window.MathJax.startup.promise.then(() => true)');

const heads = (page) => page.evaluate(`(() => {
  const read = (el) => {
    const copy = el.cloneNode(true);
    for (const m of copy.querySelectorAll('mjx-container')) m.replaceWith('[math]');
    return copy.textContent.trim();
  };
  const run = Reveal.getCurrentSlide().querySelector(':scope > .run[data-generated]');
  const item = document.querySelector('section.section ul.outline li');
  return { run: read(run), outline: read(item) };
})()`);
const TYPESET = { run: 'Content [math]', outline: 'Content [math]' };

async function settle(page) {
  await frames(page);
  await typeset(page);
  await frames(page);
}

async function open(t, platform) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(LAYOUTS, 'utf8');
  const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
  assert.deepEqual(s.problems, []);
  await page.evaluate('Reveal.slide(3)');
  await settle(page);
  return page;
}

for (const platform of PLATFORMS) {
  test(`the running head keeps its typeset title after an edit of a tag, its undo, and its redo (${platform})`, async (t) => {
    const page = await open(t, platform);
    assert.deepEqual(await heads(page), TYPESET);
    await click(page, 'section.present p');
    await click(page, IMG);
    await click(page, IMG);
    await page.evaluate(`window.BeesonEditor.exec('figure.whiteFigure')`);
    await settle(page);
    const edited = await render(page);
    assert.equal(edited, page.source.replace(DARK, () => DARK.replace('class="for-dark"', 'class="for-dark white-figure"')));
    assert.deepEqual(await heads(page), TYPESET);
    await page.evaluate('window.BeesonEditor.undo()');
    await settle(page);
    assert.equal(await render(page), page.source);
    assert.deepEqual(await heads(page), TYPESET);
    await page.evaluate('window.BeesonEditor.redo()');
    await settle(page);
    assert.equal(await render(page), edited);
    assert.deepEqual(await heads(page), TYPESET);
    const { text } = await saveAndReopen(page);
    assert.equal(text, edited);
    assert.deepEqual(await heads(page), TYPESET);
    assert.deepEqual(page.errors, []);
  });
}
