// Save and present in a browser whose save is a download, e.g. Firefox, forced in Chrome by taking
// the file pickers away. the copy is put into the downloads, and the file at the address of the
// page is still the one that was opened, hence the show plays the saved text, at the address of the
// deck so that theme/ and the figures are found. the copy is downloaded when the show in place ends,
// so that a save dialog of the browser is not opened over the show. Present without changes, Present
// from Start, and the show in a tab of Presenter View play the saved text as well
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click } from './helpers/editor.mjs';

const DECK = 'test/pages/layers.html';
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

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

// the editor on the deck served over HTTP, where the show of the file at the address of the page
// can be read by the test
async function open(t) {
  const page = await browser.newPage();
  t.after(() => page.close().catch(() => {}));
  const url = `${server.origin}/${DECK}?edit&still`;
  await page.goto(url);
  await page.evaluate('localStorage.clear()');
  await page.goto(url);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(readFileSync(DECK, 'utf8'))})`)).problems, []);
  return page;
}
const SHOW = `document.querySelector('.beeson-edit-show iframe')?.contentWindow`;
const showReady = `(() => { try { return !!${SHOW}?.Reveal?.isReady(); } catch { return false; } })()`;
const shownLead = `${SHOW}.document.getElementById('old-lead').textContent`;

// the pickers are taken away, and each download is recorded with whether a show was up at it
const DOWNLOADS = `{
  window.showOpenFilePicker = undefined;
  window.showSaveFilePicker = undefined;
  window.__downloads = [];
  URL.createObjectURL = (blob) => { window.__blob = blob; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function () { window.__downloads.push({ name: this.download, during: !!document.querySelector('.beeson-edit-show') }); };
}`;

// text is typed at the end of the lead-in of the first slide, as one entry of the history
const typeLead = (page, text) => page.evaluate(`(() => {
  const p = document.getElementById('old-lead');
  p.focus();
  const r = document.createRange();
  r.selectNodeContents(p);
  r.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  document.execCommand('insertText', false, ${JSON.stringify(text)});
})()`);

const choose = (page, label) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-dialog.ask button')].find((b) => b.textContent === ${JSON.stringify(label)}).click()`);
const endShow = async (page) => {
  await page.evaluate(`(window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })), true)`);
  await page.waitFor(`!document.querySelector('.beeson-edit-show')`);
};

test('Save and present with a save that is a download plays the saved text and downloads it after the show', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await page.evaluate(DOWNLOADS);
  await typeLead(page, ' Saved');
  assert.equal((await page.evaluate('window.BeesonEditor.status()')).dirty, true);

  await page.evaluate(`(window.BeesonEditor.exec('file.present'), true)`);
  await page.waitFor(`!document.querySelector('.beeson-edit-dialog.ask').hidden`);
  await choose(page, 'Save and present');
  await page.waitFor(showReady, 30000);
  assert.equal(await page.evaluate(shownLead), 'The old lead-in. Saved', 'the show plays the file as it was before the save');
  assert.deepEqual(await page.evaluate('window.__downloads'), [], 'the copy is downloaded while the show is up');
  // the show is at the address of the deck, with the parameters of a show played by the editor
  const where = await page.evaluate(`(() => { const l = ${SHOW}.location; return { page: l.href.split(/[?#]/)[0], search: l.search }; })()`);
  assert.equal(where.page, await page.evaluate(`location.href.split(/[?#]/)[0]`));
  assert.match(where.search, /^\?still&from-editor$/);
  assert.equal(await page.evaluate(`${SHOW}.getComputedStyle(${SHOW}.document.querySelector('.reveal')).position`), 'relative', 'theme/beeson.css is not loaded in the show');

  await endShow(page);
  await page.waitFor(`window.__downloads.length === 1`);
  assert.deepEqual(await page.evaluate('window.__downloads'), [{ name: 'layers.html', during: false }]);
  assert.match(await page.evaluate('window.__blob.text()'), /<p id="old-lead">The old lead-in\. Saved<\/p>/);
  assert.equal((await page.evaluate('window.BeesonEditor.status()')).dirty, false);

  // Present without changes plays the saved text, from the slide shown
  await page.evaluate('Reveal.slide(1)');
  await page.evaluate(`(window.BeesonEditor.exec('file.present'), true)`);
  await page.waitFor(showReady, 30000);
  assert.equal(await page.evaluate(`${SHOW}.Reveal.getIndices().h`), 1);
  assert.equal(await page.evaluate(shownLead), 'The old lead-in. Saved');
  // the hash that reveal.js writes keeps the parameters of the show
  assert.match(await page.evaluate(`${SHOW}.location.href`), /layers\.html\?still&from-editor#\/1$/);
  await endShow(page);

  // Present from Start as well
  await page.evaluate(`(window.BeesonEditor.exec('file.presentStart'), true)`);
  await page.waitFor(showReady, 30000);
  assert.equal(await page.evaluate(`${SHOW}.Reveal.getIndices().h`), 0);
  assert.equal(await page.evaluate(shownLead), 'The old lead-in. Saved');
  await endShow(page);
  assert.deepEqual(errors(page), []);
});

test('the show in a tab of Presenter View after a save that is a download plays the saved text', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await page.evaluate(DOWNLOADS);
  await page.evaluate(`{ const open = window.open; window.open = (...a) => (window.__tab = open.apply(window, a)); }`);
  await typeLead(page, ' Saved');
  await page.evaluate(`(window.BeesonEditor.exec('play.presenter'), true)`);
  await page.waitFor(`!document.querySelector('.beeson-edit-dialog.ask').hidden`);
  // a trusted click, since the browser opens a tab only at a gesture of the user
  const button = `[...document.querySelectorAll('.beeson-edit-dialog.ask button')].find((b) => b.textContent === 'Save and present')`;
  await click(page, await page.evaluate(`(() => { const r = ${button}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
  await page.waitFor(`(() => { try { return !!window.__tab?.Reveal?.isReady(); } catch { return false; } })()`, 30000);
  assert.equal(await page.evaluate(`window.__tab.document.getElementById('old-lead').textContent`), 'The old lead-in. Saved');
  assert.deepEqual(await page.evaluate('window.__downloads.map((d) => d.name)'), ['layers.html']);
  await page.evaluate('window.__tab.close()');
  assert.deepEqual(errors(page), []);
});
