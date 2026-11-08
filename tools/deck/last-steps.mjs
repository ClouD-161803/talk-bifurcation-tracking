// screenshots of each slide of a deck at its last fragment, with the browser helper of the template.
//   node last-steps.mjs <deck> <out folder> <theme>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deckSettled, deckUrl, launch } from '/Users/claudiovestini/git/talks/bifurcation-tracking/scripts/chrome.mjs';

const [deck, out, theme = 'dark'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await launch();
try {
  const page = await browser.newPage();
  await page.goto(deckUrl(deck, `theme=${theme}&still`));
  await page.waitFor(deckSettled);
  const total = await page.evaluate('Reveal.getTotalSlides()');
  for (let n = 0; n < total; n++) {
    await page.evaluate(`Reveal.slide(${n}, 0, 1000)`);
    await new Promise((done) => setTimeout(done, 1500));
    const name = `${theme}-${String(n + 1).padStart(2, '0')}.png`;
    writeFileSync(join(out, name), await page.screenshot());
  }
  console.log(`${total} slides at their last step in ${out}`);
} finally {
  await browser.close();
}
