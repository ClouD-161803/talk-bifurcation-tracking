import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { editorPage } from './helpers/editor.mjs';

let browser;
before(async () => {
  browser = await launch({ timeout: 180000 });
});
after(async () => {
  await browser?.close();
});

const SLIDES = `[...document.querySelectorAll('.reveal:not(.beeson-peek) .slides > section')]`;

const INK = `((canvas) => {
  if (!canvas?.width || !canvas.height) return 0;
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let drawn = 0;
  for (let j = 3; j < data.length; j += 4) if (data[j]) drawn++;
  return drawn / (data.length / 4);
})`;

const state = (i) => `(() => {
  const slide = ${SLIDES}[${i}];
  const pic = document.querySelectorAll('.beeson-edit-nav .row .pic')[${i}]?.shadowRoot?.querySelector('.beeson-thumb .surface');
  return {
    laidOut: getComputedStyle(slide).display !== 'none',
    drawn: ${INK}(pic?.querySelector('canvas.surface-image')),
    labels: [...(pic?.querySelectorAll('.label') ?? [])].filter((l) => l.style.left).length,
  };
})()`;

const draws = (i) => `Number(document.querySelectorAll('.beeson-edit-nav .row .pic')[${i}]?.dataset.drawn ?? 0)`;

const found = `(() => {
  const slides = ${SLIDES};
  return { surfaces: slides.flatMap((s, i) => (s.querySelector('.surface') ? [i] : [])), last: slides.length - 1 };
})()`;

async function check(t, deck) {
  const last = readFileSync(deck, 'utf8').match(/<section[\s>]/g).length - 1;
  const page = await editorPage(browser, { deck, query: `edit&still&theme=dark#/${last}`, clear: true });
  t.after(() => page.close().catch(() => {}));
  const at = await page.evaluate(found);
  assert.ok(at.surfaces.length > 0, `the slides with a surface are not found in ${deck}`);
  assert.equal(await page.evaluate('Reveal.getIndices().h'), at.last, 'the deck is not opened at its last slide');
  for (const i of at.surfaces) {
    assert.equal((await page.evaluate(state(i))).laidOut, false, `slide ${i} is laid out by reveal.js, and the case is not checked`);
    const blank = await page.waitFor(`${state(i)}.drawn > 0`, 60000).then(() => false, () => true);
    assert.ok(!blank, `the surface of slide ${i}, which was never shown, is blank in its thumbnail`);
  }
  for (const i of at.surfaces) {
    const labels = await page.evaluate(`${SLIDES}[${i}].querySelectorAll('.surface .label').length`);
    await page.waitFor(`${state(i)}.labels === ${labels}`, 60000);
    const far = await page.evaluate(state(i));
    const before = await page.evaluate(draws(i));
    await page.evaluate(`(() => { Reveal.slide(${i}); return true; })()`);
    await page.waitFor(`${draws(i)} > ${before} && ${state(i)}.drawn > 0`, 60000);
    const shown = await page.evaluate(state(i));
    await page.evaluate(`(() => { Reveal.slide(${at.last}); return true; })()`);
    assert.ok(far.drawn > 0.5 * shown.drawn, `the thumbnail of slide ${i} draws ${far.drawn} of its pixels before the slide was shown, and ${shown.drawn} after`);
  }
  assert.deepEqual(page.errors, []);
}

test('the thumbnail of a slide that was never shown draws its surface and its labels, as after the slide was shown', { timeout: 600000 }, (t) => check(t, 'test-deck.html'));

test('the thumbnail of a slide that was never shown draws its strip bundle, as after the slide was shown', { timeout: 600000 }, (t) => check(t, 'test/pages/bundle-far.html'));

test('after a flip of the mode, the labels of a strip bundle on a slide that was never shown keep their places', { timeout: 300000 }, async (t) => {
  const deck = 'test/pages/bundle-far.html';
  const page = await editorPage(browser, { deck, query: 'edit&still&theme=dark#/4', clear: true });
  t.after(() => page.close().catch(() => {}));
  const labels = `[...${SLIDES}[0].querySelectorAll('.surface .label')].map((l) => [l.dataset.at, l.style.left, l.style.top])`;
  assert.equal((await page.evaluate(state(0))).laidOut, false, 'the slide of the bundle is laid out by reveal.js, and the case is not checked');
  await page.waitFor(`${state(0)}.labels === ${SLIDES}[0].querySelectorAll('.surface .label').length`, 60000);
  const placed = await page.evaluate(labels);
  assert.ok(placed.some(([at]) => at === 'Sun'), 'the label of the arrow is not found');
  const before = await page.evaluate(draws(0));
  await page.evaluate(`(() => { window.BeesonEditor.exec('view.slideDark'); return true; })()`);
  await page.waitFor(`document.documentElement.dataset.theme === 'light' && ${draws(0)} > ${before} && ${state(0)}.drawn > 0`, 60000);
  assert.deepEqual(await page.evaluate(labels), placed);
  assert.deepEqual(page.errors, []);
});
