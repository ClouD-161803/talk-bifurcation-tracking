// Paste of the slide menu, i.e. of the menu of a thumbnail and of Edit in the navigator, where the
// browser refuses the read of the clipboard. in a deck where nothing was copied, e.g. the deck that
// slides from another deck are pasted into, it says how to paste with the key, as Edit > Paste on
// the canvas does. a slide copied in the same page is pasted from the page. a page without a
// clipboard to read is told the same by both commands, and without a fine pointer, where a key is
// not likely, the message asks to choose Paste again

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { B, FIRST_B, QUERY, openDeck, render, selectRow, status } from './helpers/cross-deck.mjs';

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

const REFUSE = `(() => { navigator.clipboard.readText = () => Promise.reject(new DOMException('Read permission denied.', 'NotAllowedError')); navigator.clipboard.writeText = async () => {}; return true; })()`;

test('Paste of the slide menu with a refused read says how to paste with the key', async (t) => {
  const page = await openDeck(browser, `${server.origin}/${B}?${QUERY}`, B);
  t.after(() => page.close());
  await page.evaluate(REFUSE);
  await selectRow(page, FIRST_B);
  await page.evaluate(`window.BeesonEditor.exec('slide.paste')`);
  assert.equal((await status(page)).message, 'The browser did not let the editor read the clipboard. Press Ctrl+V to paste');
  assert.equal(await render(page), page.source);

  // a slide copied in this page is still pasted from the page
  await page.evaluate(`window.BeesonEditor.exec('slide.copy')`);
  await page.evaluate(`window.BeesonEditor.exec('slide.paste')`);
  const out = await render(page);
  assert.equal(out.split(`<h2>${FIRST_B}</h2>`).length, 3, 'the copied slide was not pasted');
});

// a page without navigator.clipboard, e.g. over http from another machine, which is not a secure
// context
const NO_CLIPBOARD = `(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); return true; })()`;

for (const command of ['slide.paste', 'edit.paste']) {
  test(`${command} in a page without a clipboard to read says how to paste with the key`, async (t) => {
    const page = await openDeck(browser, `${server.origin}/${B}?${QUERY}`, B);
    t.after(() => page.close());
    await page.evaluate(NO_CLIPBOARD);
    await selectRow(page, FIRST_B);
    await page.evaluate(`(async () => { document.activeElement?.blur(); await window.BeesonEditor.exec('${command}'); return true; })()`);
    assert.equal((await status(page)).message, 'The browser did not let the editor read the clipboard. Press Ctrl+V to paste');
  });
}

test('without a fine pointer, e.g. on a phone, a refused read asks to choose Paste again', async (t) => {
  const page = await openDeck(browser, `${server.origin}/${B}?${QUERY}`, B);
  t.after(() => page.close());
  await page.evaluate(REFUSE);
  await page.evaluate(`(() => { const real = window.matchMedia.bind(window); window.matchMedia = (q) => (/pointer/.test(q) ? { matches: false, media: q, addEventListener() {}, removeEventListener() {} } : real(q)); return true; })()`);
  await selectRow(page, FIRST_B);
  await page.evaluate(`window.BeesonEditor.exec('slide.paste')`);
  assert.equal((await status(page)).message, 'The browser did not let the editor read the clipboard. Choose Paste again and allow it when the browser asks');
});
