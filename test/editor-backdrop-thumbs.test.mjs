// the thumbnail of a slide with a backdrop in the navigator of the editor (issue #69). the backdrop is drawn in the
// thumbnail of a slide that reveal.js has not laid out yet, from a built-in drawing and from a file, with its
// labels, as it is drawn once the slide was shown. after a flip of the mode, it is drawn in the new mode, also
// where the navigator or the picture of the slide was hidden at the flip. the copy of such a slide beside a hovered row draws the backdrop as well

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
// the last slide of test-deck.html, at which a page is opened so that its first slides are not laid out
const LAST = readFileSync('test-deck.html', 'utf8').match(/<section[\s>]/g).length - 1;

// the share of the pixels of canvas that are drawn, and their mean lightness from 0 to 1
const INK = `((canvas) => {
  if (!canvas?.width || !canvas.height) return { drawn: 0, light: 0 };
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let drawn = 0;
  let light = 0;
  for (let j = 0; j < data.length; j += 4) {
    if (!data[j + 3]) continue;
    drawn++;
    light += (data[j] + data[j + 1] + data[j + 2]) / 3 / 255;
  }
  return { drawn: drawn / (data.length / 4), light: drawn ? light / drawn : 0 };
})`;

// the backdrop of slide i and its picture in the thumbnail: whether the canvas of the slide was sized by a draw,
// the ink of the picture, and the labels placed in the thumbnail
const state = (i) => `(() => {
  const el = ${SLIDES}[${i}].querySelector('.backdrop');
  const pic = document.querySelectorAll('.beeson-edit-nav .row .pic')[${i}]?.shadowRoot?.querySelector('.beeson-thumb .backdrop');
  return {
    sized: el.querySelector('canvas.orbits-base').hasAttribute('width'),
    ...${INK}(pic?.querySelector('canvas.orbits-base')),
    labels: [...(pic?.querySelectorAll('.label') ?? [])].filter((l) => l.style.left).length,
  };
})()`;

// the slides of test-deck.html with a backdrop of a file, with a built-in backdrop with labels, and the last slide
const found = `(() => {
  const slides = ${SLIDES};
  return {
    file: slides.findIndex((s) => s.querySelector('.backdrop[data-trajectories]')),
    labeled: slides.findIndex((s) => s.querySelector('.backdrop[data-backdrop] .label')),
    last: slides.length - 1,
  };
})()`;

// the times the thumbnail of slide i was drawn
const draws = (i) => `Number(document.querySelectorAll('.beeson-edit-nav .row .pic')[${i}]?.dataset.drawn ?? 0)`;

// true once the picture of slide i is drawn, false after a minute without it
const drawn = (page, i) => page.waitFor(`${state(i)}.drawn > 0`, 60000).then(() => true, () => false);

test('the thumbnail of a slide that was never shown draws its backdrop and its labels, as after the slide was shown', { timeout: 600000 }, async (t) => {
  const page = await editorPage(browser, { query: `edit&still&theme=dark#/${LAST}`, clear: true });
  t.after(() => page.close().catch(() => {}));
  const at = await page.evaluate(found);
  assert.ok(at.file >= 0 && at.labeled >= 0, `the slides with a backdrop are not found, ${JSON.stringify(at)}`);
  assert.equal(await page.evaluate('Reveal.getIndices().h'), at.last, 'the deck is not opened at its last slide');
  for (const i of [at.file, at.labeled]) {
    assert.equal((await page.evaluate(state(i))).sized, false, `the backdrop of slide ${i} is drawn on its slide, and the case is not checked`);
    assert.ok(await drawn(page, i), `the backdrop of slide ${i}, which was never shown, is blank in its thumbnail`);
  }
  const labels = await page.evaluate(`${SLIDES}[${at.labeled}].querySelectorAll('.backdrop .label').length`);
  await page.waitFor(`${state(at.labeled)}.labels === ${labels}`, 60000);
  // each drawing fills its thumbnail as it does once its slide was shown, i.e. the trajectories of a file are drawn too
  for (const i of [at.file, at.labeled]) {
    await page.waitFor(`${state(i)}.drawn > 0`, 60000);
    const far = await page.evaluate(state(i));
    const before = await page.evaluate(draws(i));
    await page.evaluate(`(() => { Reveal.slide(${i}); return true; })()`);
    // the thumbnail is drawn again from the backdrop of the slide, once this backdrop is drawn
    await page.waitFor(`${state(i)}.sized && ${draws(i)} > ${before}`, 60000);
    const shown = await page.evaluate(state(i));
    await page.evaluate(`(() => { Reveal.slide(${at.last}); return true; })()`);
    assert.ok(shown.drawn > 0, `the backdrop of slide ${i} is blank in its thumbnail once the slide was shown`);
    assert.ok(far.drawn > 0.5 * shown.drawn, `the thumbnail of slide ${i} draws ${far.drawn} of its pixels before the slide was shown, and ${shown.drawn} after`);
  }
  assert.deepEqual(page.errors, []);
});

test('after a flip of the mode, the backdrop of a thumbnail is drawn in the new mode, on a slide that was shown and on a slide that was not', { timeout: 600000 }, async (t) => {
  const page = await editorPage(browser, { query: 'edit&still&theme=dark', clear: true });
  t.after(() => page.close().catch(() => {}));
  const at = await page.evaluate(found);
  assert.ok(at.labeled > 0, 'the slide with a labeled backdrop is not found');
  // the labeled backdrop is near the first slide and was drawn at the start, and the last slide is far from it
  assert.equal((await page.evaluate(state(at.labeled))).sized, true, 'the backdrop near the first slide is not drawn on its slide, and the case is not checked');
  assert.equal((await page.evaluate(state(at.last))).sized, false, 'the backdrop of the last slide is drawn on its slide, and the case is not checked');
  const dark = {};
  for (const i of [at.labeled, at.last]) {
    assert.ok(await drawn(page, i), `the backdrop of slide ${i} is blank in its thumbnail`);
    dark[i] = (await page.evaluate(state(i))).light;
  }
  await page.evaluate(`(() => { window.BeesonEditor.exec('view.slideDark'); return true; })()`);
  await page.waitFor(`document.documentElement.dataset.theme === 'light'`, 60000);
  for (const i of [at.labeled, at.last]) {
    const flipped = await page.waitFor(`(() => { const s = ${state(i)}; return s.drawn > 0 && s.light < ${dark[i]} - 0.05; })()`, 60000).then(() => true, () => false);
    const now = await page.evaluate(state(i));
    assert.ok(flipped, `the backdrop of slide ${i} keeps the colors of the dark mode in its thumbnail, with a lightness of ${now.light} after ${dark[i]}`);
  }
  assert.deepEqual(page.errors, []);
});

test('a thumbnail that is due while the navigator is hidden draws its backdrop once the navigator is shown again', { timeout: 300000 }, async (t) => {
  const page = await editorPage(browser, { query: 'edit&still&theme=dark', clear: true });
  t.after(() => page.close().catch(() => {}));
  const at = await page.evaluate(found);
  assert.equal((await page.evaluate(state(at.last))).sized, false, 'the backdrop of the last slide is drawn on its slide, and the case is not checked');
  assert.ok(await drawn(page, at.last), `the backdrop of slide ${at.last} is blank in its thumbnail`);
  const dark = (await page.evaluate(state(at.last))).light;
  const shown = `document.querySelector('.beeson-edit-nav').getClientRects().length > 0`;
  await page.evaluate(`(() => { window.BeesonEditor.exec('view.navigator'); return true; })()`);
  await page.waitFor(`!(${shown})`, 60000);
  await page.evaluate(`(() => { window.BeesonEditor.exec('view.slideDark'); return true; })()`);
  await page.waitFor(`document.documentElement.dataset.theme === 'light'`, 60000);
  // the time in which every thumbnail is due and the page is idle
  await new Promise((done) => setTimeout(done, 3000));
  await page.evaluate(`(() => { window.BeesonEditor.exec('view.navigator'); return true; })()`);
  await page.waitFor(shown, 60000);
  const flipped = await page.waitFor(`(() => { const s = ${state(at.last)}; return s.drawn > 0 && s.light < ${dark} - 0.05; })()`, 20000).then(() => true, () => false);
  const now = await page.evaluate(state(at.last));
  assert.ok(flipped, `the thumbnail of slide ${at.last} draws ${now.drawn} of the pixels of its backdrop, with a lightness of ${now.light} after ${dark}, once the navigator is shown again`);
  assert.deepEqual(page.errors, []);
});

test('a thumbnail that is due while its slide is hidden in the show draws its backdrop once the slide is shown in the list again', { timeout: 300000 }, async (t) => {
  const page = await editorPage(browser, { query: 'edit&still&theme=dark', clear: true });
  t.after(() => page.close().catch(() => {}));
  const at = await page.evaluate(found);
  assert.ok(await drawn(page, at.last), `the backdrop of slide ${at.last} is blank in its thumbnail`);
  const dark = (await page.evaluate(state(at.last))).light;
  // the picture of a hidden slide is not shown in its row
  const shown = `document.querySelectorAll('.beeson-edit-nav .row .pic')[${at.last}].getClientRects().length > 0`;
  const run = (id) => page.evaluate(`(() => { window.BeesonEditor.exec('${id}'); return true; })()`);
  await run('slide.selectAll');
  await run('slide.hide');
  await page.waitFor(`!(${shown})`, 60000);
  await run('view.slideDark');
  await page.waitFor(`document.documentElement.dataset.theme === 'light'`, 60000);
  await new Promise((done) => setTimeout(done, 3000));
  await run('slide.hide');
  await page.waitFor(shown, 60000);
  const flipped = await page.waitFor(`(() => { const s = ${state(at.last)}; return s.drawn > 0 && s.light < ${dark} - 0.05; })()`, 20000).then(() => true, () => false);
  const now = await page.evaluate(state(at.last));
  assert.equal(now.sized, false, 'the backdrop of the last slide is drawn on its slide, and the case is not checked');
  assert.ok(flipped, `the thumbnail of slide ${at.last} draws ${now.drawn} of the pixels of its backdrop, with a lightness of ${now.light} after ${dark}, once the slide is shown in the list again`);
  assert.deepEqual(page.errors, []);
});

test('the backdrop of a slide that was never shown fills its box in a tile of the slide sorter, whose styles are loaded after the tile is made', { timeout: 300000 }, async (t) => {
  const page = await editorPage(browser, { query: 'edit&still&theme=dark', clear: true });
  t.after(() => page.close().catch(() => {}));
  // the box of the backdrop in the tile of slide i and the buffer of its canvas in device px, and the ink of the canvas
  const tile = (i) => `(() => {
    const el = document.querySelectorAll('.beeson-edit-sorter .tile .pic')[${i}]?.shadowRoot?.querySelector('.beeson-thumb .backdrop');
    const canvas = el?.querySelector('canvas.orbits-base');
    if (!canvas) return null;
    const r = el.getBoundingClientRect();
    return { box: [Math.round(r.width * devicePixelRatio), Math.round(r.height * devicePixelRatio)], buffer: [canvas.width, canvas.height], ...${INK}(canvas) };
  })()`;
  const far = await page.evaluate(`${SLIDES}.map((s, i) => (s.querySelector('.backdrop > canvas.orbits-base:not([width])') ? i : -1)).filter((i) => i >= 0)`);
  assert.ok(far.length > 0, 'every backdrop is drawn on its slide, and the case is not checked');
  await page.evaluate(`(() => { window.BeesonEditor.exec('view.lightTable'); return true; })()`);
  for (const i of far) {
    const filled = `(() => { const s = ${tile(i)}; return !!s && s.drawn > 0 && Math.abs(s.buffer[0] - s.box[0]) <= 1 && Math.abs(s.buffer[1] - s.box[1]) <= 1; })()`;
    const ok = await page.waitFor(filled, 20000).then(() => true, () => false);
    assert.ok(ok, `the backdrop of slide ${i} is drawn as ${JSON.stringify(await page.evaluate(tile(i)))} in its tile`);
  }
  assert.deepEqual(page.errors, []);
});

test('the copy of a slide that was never shown, beside its hovered row, draws its backdrop', { timeout: 300000 }, async (t) => {
  const page = await editorPage(browser, { query: 'edit&still&theme=dark', clear: true });
  t.after(() => page.close().catch(() => {}));
  const at = await page.evaluate(found);
  assert.equal((await page.evaluate(state(at.last))).sized, false, 'the backdrop of the last slide is drawn on its slide, and the case is not checked');
  // the list is scrolled so that its lower edge cuts the thumbnail of the last slide, which is then copied at a hover
  const cut = await page.evaluate(`(() => {
    const list = document.querySelector('.beeson-edit-nav .rows');
    const edge = list.getBoundingClientRect().bottom;
    const frame = [...list.querySelectorAll('.row .frame')].at(-1);
    list.scrollTop = list.scrollHeight;
    const r = frame.getBoundingClientRect();
    list.scrollTop -= edge - (r.top + r.height / 2);
    const now = frame.getBoundingClientRect();
    return now.top < edge - 20 && now.bottom > edge ? { x: now.left + now.width / 2, y: (now.top + edge) / 2 } : null;
  })()`);
  assert.ok(cut, 'the thumbnail of the last slide is not cut by the lower edge of the list');
  const ink = `${INK}(document.querySelector('.beeson-edit-peek:not([hidden]) .backdrop canvas.orbits-base'))`;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 600 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cut.x, y: cut.y });
  await page.waitFor(`!!document.querySelector('.beeson-edit-peek:not([hidden]) .backdrop')`, 60000);
  const drawn = await page.waitFor(`${ink}.drawn > 0`, 20000).then(() => true, () => false);
  assert.ok(drawn, 'the backdrop of the last slide, which was never shown, is blank in the copy beside its row');
  assert.deepEqual(page.errors, []);
});
