// screenshots of every step of one slide, with the browser helper of the template.
//   node steps.mjs <deck> <out folder> <theme> <slide index from 0>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deckSettled, deckUrl, launch } from '/Users/claudiovestini/git/talks/bifurcation-tracking/scripts/chrome.mjs';

const [deck, out, theme = 'dark', slide = '0'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await launch();
try {
  const page = await browser.newPage();
  await page.goto(deckUrl(deck, `theme=${theme}&still`));
  await page.waitFor(deckSettled);
  await page.evaluate(`Reveal.slide(${slide}, 0, 1000)`);
  const last = await page.evaluate('Reveal.getIndices().f ?? -1');
  for (let f = -1; f <= last; f++) {
    await page.evaluate(`Reveal.slide(${slide}, 0, ${f})`);
    await new Promise((done) => setTimeout(done, 1200));
    writeFileSync(join(out, `${theme}-s${slide}-f${String(f + 1).padStart(2, '0')}.png`), await page.screenshot());
  }
  console.log(`${last + 2} steps of slide ${slide} in ${out}`);
} finally {
  await browser.close();
}
