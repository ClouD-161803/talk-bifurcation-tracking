// Renders the preview of the stability demo with headless Chrome into shots/: one PNG per step of
// slides 11 to 13, and one per tab of the plot of slide 12, each at the last frame of its tab.
//
//   node demos/stability/shots.mjs              the steps and the tabs, as shots/slide-N-step-S.png and shots/tab-T.png
//   node demos/stability/shots.mjs --tabs NAME  only the tabs, as shots/compare/NAME-T.png
//
// A plot that plays at a step is paused and drawn at the last frame of its tab, so that each PNG
// is the same on every run.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deckSettled, deckUrl, launch } from '../../scripts/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const at = process.argv.indexOf('--tabs');
const prefix = at >= 0 ? process.argv[at + 1] : null;
const out = prefix ? join(here, 'shots', 'compare') : join(here, 'shots');
mkdirSync(out, { recursive: true });

const browser = await launch();
const page = await browser.newPage();
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// moves to step s of slide h, i.e. with the first s fragments shown, and lets the fragments fade in
async function go(h, s) {
  await page.evaluate(`Reveal.slide(${h}, 0, ${s - 1})`);
  await wait(900);
}

// pauses each plot of the current slide at the last frame of its tab, with played set only a plot
// whose step with data-plot-play is shown
const last = (played = false) => `(() => {
  for (const p of Beeson.plots.filter((p) => Reveal.getCurrentSlide().contains(p.el))) {
    if (${played} && !p.el.closest('section').querySelector('.fragment.visible[data-plot-play]')) continue;
    p.pause();
    p.u = p.frames - 1;
    p.draw();
  }
  return true;
})()`;

async function shot(name) {
  writeFileSync(join(out, `${name}.png`), await page.screenshot());
  console.log(`${prefix ? 'compare/' : ''}${name}.png`);
}

try {
  await page.goto(deckUrl(join(here, 'preview', 'index.html')));
  await page.waitFor(deckSettled, 60000);
  await page.evaluate(`Reveal.configure({ transition: 'none', controls: false })`);
  if (!prefix) {
    for (const [h, slide] of [[0, 11], [1, 12], [2, 13]]) {
      const steps = await page.evaluate(`Reveal.getSlides()[${h}].querySelectorAll('.fragment').length`);
      for (let s = 0; s <= steps; s++) {
        await go(h, s);
        await page.evaluate(last(true));
        await wait(300);
        await shot(`slide-${slide}-step-${s}`);
      }
    }
  }
  // the tabs, on slide 12 with every step shown
  await go(1, 5);
  const names = await page.evaluate(`Beeson.plots.find((p) => Reveal.getCurrentSlide().contains(p.el)).plot.tabs.map((t) => t.name)`);
  for (const [i, name] of names.entries()) {
    await page.evaluate(`Beeson.plots.find((p) => Reveal.getCurrentSlide().contains(p.el)).setTab(${i})`);
    await page.evaluate(last());
    await wait(500);
    await shot(prefix ? `${prefix}-${name}` : `tab-${name}`);
  }
  if (page.errors.length) {
    console.error(page.errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
