// the time of an apply of a change of one character, see src/editor/session/apply.ts. the apply
// changes only the text element of the character, hence on test-deck.html, with 13 slides, it
// costs at most three times the same apply on a deck of three slides, and at most half of an open
// of the same text, which parses the file and pairs it with the page. each time is the median of
// 21 applies, with the CPU of Chrome at full speed and throttled six times

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { E, front } from './helpers/apply.mjs';
import { editorPage } from './helpers/editor.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

// the medians in ms of an apply that changes the first character of word, and of an open
const measure = (page, word) => page.evaluate(`(async () => {
  const base = ${JSON.stringify(page.source)};
  const at = base.indexOf(${JSON.stringify(word)});
  const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const apply = [];
  for (let i = 0; i < 21; i++) {
    const text = base.slice(0, at) + 'abcdefghijk'[i % 11] + base.slice(at + 1);
    const t0 = performance.now();
    const r = await ${E}.apply(text);
    apply.push(performance.now() - t0);
    if (r.reload) return null;
  }
  const open = [];
  for (let i = 0; i < 5; i++) {
    const text = ${E}.render();
    const t0 = performance.now();
    ${E}.open(text, false);
    open.push(performance.now() - t0);
  }
  return { apply: median(apply), open: median(open) };
})()`);

const DECKS = [
  ['test-deck.html', undefined, 'Direct the viewer'],
  ['a deck of three slides', 'test/pages/editor-hidden.html', 'The first slide'],
];

for (const rate of [1, 6]) {
  test(`an apply of one character costs a small part of an open, and grows little with the deck, with the CPU throttled ${rate} times`, { timeout: 300000 }, async (t) => {
    // the pages are opened one after the other, since a page behind does not draw frames
    const pages = [];
    t.after(() => Promise.all(pages.map((p) => p.close())));
    for (const [, deck] of DECKS) pages.push(await editorPage(browser, deck ? { deck } : {}));
    let found = '';
    for (let round = 1; round <= 3; round++) {
      const times = [];
      for (const [i, page] of pages.entries()) {
        await front(page);
        await page.send('Emulation.setCPUThrottlingRate', { rate });
        try {
          times.push(await measure(page, DECKS[i][2]));
        } finally {
          await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        }
        assert.ok(times[i], `${DECKS[i][0]}: the apply did not need a reload`);
      }
      const [deck, small] = times;
      found = `${deck.apply.toFixed(1)} ms on test-deck.html against ${small.apply.toFixed(1)} ms on a deck of three slides, and an open of test-deck.html in ${deck.open.toFixed(1)} ms`;
      t.diagnostic(`round ${round}: an apply in ${found}`);
      if (deck.apply <= 3 * Math.max(small.apply, 0.1) && deck.apply <= deck.open / 2) return;
    }
    assert.fail(`an apply in ${found}, in each of three rounds`);
  });
}
