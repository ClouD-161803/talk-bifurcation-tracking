import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { B, FIRST_B, POINTER, QUERY, openDeck, render, selectRow, status } from './helpers/cross-deck.mjs';

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

  await page.evaluate(`window.BeesonEditor.exec('slide.copy')`);
  await page.evaluate(`window.BeesonEditor.exec('slide.paste')`);
  const out = await render(page);
  assert.equal(out.split(`<h2>${FIRST_B}</h2>`).length, 3, 'the copied slide was not pasted');
});

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

test('with touch alone, e.g. on a phone, a refused read asks to choose Paste again', async (t) => {
  const page = await openDeck(browser, `${server.origin}/${B}?${QUERY}`, B);
  t.after(() => page.close());
  await page.evaluate(REFUSE);
  await page.evaluate(POINTER('touch'));
  await selectRow(page, FIRST_B);
  await page.evaluate(`window.BeesonEditor.exec('slide.paste')`);
  assert.equal((await status(page)).message, 'The browser did not let the editor read the clipboard. Choose Paste again and allow it when the browser asks');
});

test('without a pointer, e.g. with a keyboard alone, a refused read says how to paste with the key', async (t) => {
  const page = await openDeck(browser, `${server.origin}/${B}?${QUERY}`, B);
  t.after(() => page.close());
  await page.evaluate(REFUSE);
  await page.evaluate(POINTER('none'));
  await selectRow(page, FIRST_B);
  await page.evaluate(`window.BeesonEditor.exec('slide.paste')`);
  assert.equal((await status(page)).message, 'The browser did not let the editor read the clipboard. Press Ctrl+V to paste');
});
