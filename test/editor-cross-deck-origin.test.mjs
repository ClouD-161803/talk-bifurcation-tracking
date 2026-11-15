// the origin of a copy in the editor: after the mark, a copy of slides and a copy of elements name
// the address of the deck, the version of its theme, and the macros that the copied text uses, in a
// comment that a dash of a macro cannot close early. a text without the origin, as an older editor
// copies it, is pasted into another deck as before, with its paths as they were

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { A, B, FILES, FIRST_B, MARK, QUERY, copyFigure, copySlide, errors, openDeck, pasteSlides, pasted, render, sectionOf } from './helpers/cross-deck.mjs';

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

// the origin written after the mark of a text of the clipboard, or null without it
function originOf(text) {
  const m = text.match(/^<!--beeson-->\r?\n<!--beeson-origin (.*?)-->/s);
  return m ? { raw: m[1], ...JSON.parse(m[1]) } : null;
}

test('a copy of slides and a copy of elements name the deck, its theme, and the macros they use', async (t) => {
  const page = await openDeck(browser, `${server.origin}/${A}?${QUERY}`, A);
  t.after(() => page.close());
  const deck = `${server.origin}/${A}`;
  const version = await page.evaluate('Beeson.version');
  assert.ok(version);

  const slides = await copySlide(page, FILES);
  const origin = originOf(slides);
  assert.ok(origin, `the copy of the slide does not name its origin: ${slides.slice(0, 120)}`);
  assert.equal(origin.deck, deck);
  assert.equal(origin.version, version);
  // orb is used on the slide, half in the body of orb, and dash on the slide, and unused is not
  assert.deepEqual(
    [...origin.macros].sort((a, b) => a.name.localeCompare(b.name)),
    [
      { name: 'dash', body: '\\text{a--b}', args: 0 },
      { name: 'half', body: '\\tfrac{1}{2}', args: 0 },
      { name: 'orb', body: '\\mathcal{O}_{\\half #1}', args: 1 },
    ],
  );
  assert.ok(!origin.raw.includes('--'), 'the dash of a macro would close the comment of the origin');
  // the slide follows the origin, as it is written into the file
  assert.ok(slides.endsWith(sectionOf(page.source, FILES)));

  const figure = await copyFigure(page, FILES, 'img[src$="orbit.png"]');
  const fromFigure = originOf(figure);
  assert.ok(fromFigure, `the copy of the figure does not name its origin: ${figure.slice(0, 120)}`);
  assert.equal(fromFigure.deck, deck);
  assert.equal(fromFigure.version, version);
  assert.deepEqual(fromFigure.macros, []);
  assert.match(figure, /<figure class="figure-box"[^>]*>\s*<img src="figs\/orbit\.png"/);
  assert.deepEqual(errors(page), []);
});

test('a text without the origin is pasted into another deck with its paths as they were', async (t) => {
  const page = await openDeck(browser, `${server.origin}/${B}?${QUERY}`, B);
  t.after(() => page.close());
  const slide = '<section>\n      <h2>A slide copied by an older editor</h2>\n      <figure class="figure-box">\n        <img src="figs/orbit.png" alt="An orbit">\n      </figure>\n    </section>';
  await pasteSlides(page, FIRST_B, `${MARK}\n${slide}`);
  await pasted(page);
  const first = sectionOf(page.source, FIRST_B);
  assert.equal(await render(page), page.source.replace(first, `${first}\n    ${slide}`));
  // nothing was asked of deck A
  const asked = await page.evaluate(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/cross-deck/a/'))`);
  assert.deepEqual(asked, []);
  assert.deepEqual(errors(page), []);
});
