import assert from 'node:assert/strict';
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

const SLIDE = `[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('tycho-viewer'))`;
const VIEWER = `document.querySelectorAll('.reveal .slides > section')[${SLIDE}].querySelector('tycho-viewer')`;
const PIC = `document.querySelectorAll('.beeson-edit-nav .row .pic')[${SLIDE}]`;

const STILL = `(() => {
  const still = ${PIC}?.shadowRoot?.querySelector('.beeson-thumb .viewer-still > canvas');
  if (!still) return null;
  const { data } = still.getContext('2d').getImageData(0, 0, still.width, still.height);
  let drawn = 0;
  let light = 0;
  let hash = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]) drawn++;
    light += ((data[i] + data[i + 1] + data[i + 2]) / 3) * (data[i + 3] / 255);
    hash = (Math.imul(hash, 31) + data[i] + 7 * data[i + 1] + 13 * data[i + 2] + 17 * data[i + 3]) >>> 0;
  }
  const n = data.length / 4;
  return { drawn: drawn / n, light: light / n / 255, hash };
})()`;

const loaded = `(() => { const v = ${VIEWER}; return !!v && (v.state ?? null) !== null && !!v.shadowRoot.querySelector('canvas'); })()`;

async function open(t, mode) {
  const page = await editorPage(browser, { query: `edit&still&theme=${mode}`, clear: true });
  t.after(() => page.close().catch(() => {}));
  assert.ok((await page.evaluate(SLIDE)) > 0, 'the slide with a tycho viewer is not found');
  await page.waitFor(loaded, 60000);
  await page.evaluate(`(() => { ${PIC}.scrollIntoView({ block: 'center' }); return true; })()`);
  return page;
}

test('the thumbnail of the current slide shows a still of its tycho scene in both modes, placed as the scene, without a clone of the viewer', { timeout: 300000 }, async (t) => {
  const page = await open(t, 'dark');
  await page.evaluate(`(() => { Reveal.slide(${SLIDE}); return true; })()`);
  await page.waitFor(`(() => { const s = ${STILL}; return !!s && s.drawn > 0.5; })()`, 60000);
  const at = await page.evaluate(`(() => {
    const v = ${VIEWER};
    const k = v.getBoundingClientRect().width / v.offsetWidth;
    const from = v.getBoundingClientRect();
    const c = v.shadowRoot.querySelector('canvas').getBoundingClientRect();
    const box = ${PIC}.shadowRoot.querySelector('.beeson-thumb .viewer-still');
    const still = box.querySelector('canvas');
    return {
      viewers: document.querySelectorAll('tycho-viewer').length,
      cloned: ${PIC}.shadowRoot.querySelectorAll('tycho-viewer').length,
      viewer: [v.offsetWidth, v.offsetHeight],
      box: [box.offsetWidth, box.offsetHeight],
      canvas: [(c.left - from.left) / k, (c.top - from.top) / k, c.width / k, c.height / k],
      still: [still.offsetLeft, still.offsetTop, still.offsetWidth, still.offsetHeight],
    };
  })()`);
  assert.equal(at.viewers, 1, 'a tycho viewer is added to the page');
  assert.equal(at.cloned, 0, 'the thumbnail holds a clone of the viewer');
  assert.ok(at.box.every((x, i) => Math.abs(x - at.viewer[i]) <= 1), `the box ${JSON.stringify(at.box)} is not of the size of the viewer ${JSON.stringify(at.viewer)}`);
  assert.ok(at.still.every((x, i) => Math.abs(x - at.canvas[i]) <= 1), `the still ${JSON.stringify(at.still)} is not where the scene is drawn, ${JSON.stringify(at.canvas)}`);
  const dark = await page.evaluate(STILL);
  await page.evaluate(`(() => { window.BeesonEditor.exec('view.slideDark'); return true; })()`);
  await page.waitFor(`document.documentElement.dataset.theme === 'light'`, 60000);
  await page.waitFor(`(() => { const s = ${STILL}; return !!s && s.drawn > 0.5 && s.light > ${dark.light} + 0.3; })()`, 60000);
  assert.deepEqual(page.errors, []);
});

test('a still is drawn from a slide that is not laid out, drawn again after a seek of the scene, and the viewer draws at its own resolution once shown', { timeout: 300000 }, async (t) => {
  const page = await open(t, 'light');
  assert.equal(await page.evaluate(`${VIEWER}.offsetWidth`), 0, 'the slide with the viewer is laid out, and the case is not checked');
  await page.waitFor(`(() => { const s = ${STILL}; return !!s && s.drawn > 0.5; })()`, 60000);
  for (const at of [0.37, 0.71]) {
    const { hash } = await page.evaluate(STILL);
    await page.evaluate(`(() => { const v = ${VIEWER}; v.seek(1e9); v.seek(v.time * ${at}); return true; })()`);
    await page.waitFor(`(() => { const s = ${STILL}; return !!s && s.drawn > 0.5 && s.hash !== ${hash}; })()`, 60000);
  }
  await page.evaluate(`(() => { Reveal.slide(${SLIDE}); return true; })()`);
  const sharp = `(() => {
    const v = ${VIEWER};
    const area = v.shadowRoot.querySelector('.panel-area');
    const canvas = v.shadowRoot.querySelector('canvas');
    return area.clientWidth > 0 && Math.abs(canvas.width - area.clientWidth * Math.min(2, devicePixelRatio || 1)) <= 1;
  })()`;
  await page.waitFor(sharp, 60000);
  assert.deepEqual(page.errors, []);
});
