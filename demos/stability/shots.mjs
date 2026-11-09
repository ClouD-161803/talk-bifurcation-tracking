// Renders each step of the bifurcation slide of the talk, the slide with the plot of the block
// id="stability", with headless Chrome into demos/stability/shots/, as <theme>-step-<s>.png.
//
//   node demos/stability/shots.mjs [--deck index.html] [--theme dark]
//
// At each step the plot is paused and drawn at the last frame of its tab, so that each PNG is the
// same on every run, and the run fails on any page error.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { deckSettled, deckUrl, launch } from '../../scripts/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { values: options } = parseArgs({
  options: { deck: { type: 'string', default: join(here, '..', '..', 'index.html') }, theme: { type: 'string', default: 'dark' } },
});
const out = join(here, 'shots');
mkdirSync(out, { recursive: true });

const browser = await launch();
const page = await browser.newPage();
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const plot = `Beeson.plots.find((p) => Reveal.getCurrentSlide().contains(p.el))`;

try {
  await page.goto(deckUrl(resolve(options.deck), `theme=${options.theme}`));
  await page.waitFor(deckSettled, 60000);
  await page.evaluate(`Reveal.configure({ transition: 'none', controls: false })`);
  const slide = `document.querySelector('[data-plot="stability"]')?.closest('section')`;
  if (!(await page.evaluate(`!!${slide}`))) throw new Error(`${options.deck} does not have a slide with the plot of the block id="stability"`);
  const { h, v } = await page.evaluate(`Reveal.getIndices(${slide})`);
  const steps = await page.evaluate(`new Set([...${slide}.querySelectorAll('.fragment')].map((f) => f.dataset.fragmentIndex)).size`);
  for (let s = 0; s <= steps; s++) {
    await page.evaluate(`Reveal.slide(${h}, ${v ?? 0}, ${s - 1})`);
    await wait(1500);
    await page.evaluate(`(() => { const p = ${plot}; p.pause(); p.u = p.frames - 1; p.draw(); return true; })()`);
    await wait(300);
    const name = `${options.theme}-step-${s}.png`;
    writeFileSync(join(out, name), await page.screenshot());
    console.log(name);
  }
  if (page.errors.length) {
    console.error(page.errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
