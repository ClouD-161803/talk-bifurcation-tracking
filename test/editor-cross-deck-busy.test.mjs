// while the files of a paste from another deck are read, the page is inert behind a dialog with
// Stop, hence the entry of the history of the paste does not take an edit made meanwhile. Stop
// pastes the slides without the files not kept by then, and it is not taken before the dialog is
// drawn. a server holds the answer for the image of deck A until the test lets it go

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { A, B, BUSY, BUSY_DRAWN, FILES, FIRST_B, QUERY, copySlide, openDeck, pasteSlides, pasted, render, sectionOf, status, withMacrosOfA } from './helpers/cross-deck.mjs';
import { press } from './helpers/editor.mjs';

let browser;
let inner;
let server;
let hold = false;
let release = () => {};
before(async () => {
  browser = await launch({ offline: false });
  inner = await serve('.');
  const outer = createServer(async (request, response) => {
    if (hold && request.url.split('?')[0].endsWith('/cross-deck/a/figs/orbit.png')) await new Promise((done) => (release = done));
    const r = await fetch(`${inner.origin}${request.url}`, { headers: request.headers.range ? { range: request.headers.range } : {} });
    response.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !/^(connection|keep-alive|transfer-encoding)$/.test(k))));
    response.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((done) => outer.listen(0, '127.0.0.1', done));
  server = { origin: `http://127.0.0.1:${outer.address().port}`, close: () => (outer.close(), outer.closeAllConnections()) };
});
after(async () => {
  release();
  await browser?.close();
  server?.close();
  inner?.close();
});

const OPEN = `!!document.querySelector('${BUSY}[open]')`;
const deck = async (file) => {
  const page = await openDeck(browser, `${server.origin}/${file}?${QUERY}`, file);
  return file === B ? withMacrosOfA(page) : page;
};

// the image of deck A held by the server while the slide with the files is pasted into deck B,
// after before is run in the page of deck B. it returns once opened holds there
async function heldPaste(t, before = 'true', opened = OPEN) {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const b = await deck(B);
  t.after(() => b.close());
  await b.evaluate(before);
  hold = true;
  t.after(() => {
    hold = false;
    release();
  });
  await pasteSlides(b, FIRST_B, text);
  await b.waitFor(opened, 30000);
  return { a, b };
}

test('the page is inert behind a dialog while the files are read, and one undo takes back the paste', async (t) => {
  const { a, b } = await heldPaste(t);
  // the focus is in the dialog, which makes the region of the editor the dialog
  assert.equal(await b.evaluate(`!!document.activeElement?.closest('${BUSY}[open]')`), true);
  assert.equal(await b.evaluate(`document.querySelector('${BUSY} h3').textContent`), 'Copying the files of the paste…');
  await press(b, 'Backspace');
  await press(b, 'x');
  hold = false;
  release();
  await pasted(b);
  assert.equal(await b.evaluate(OPEN), false);
  const first = sectionOf(b.source, FIRST_B);
  const section = sectionOf(a.source, FILES).replace('src="figs/orbit.png"', 'src="media/orbit-2.png"').replace('src="figs/clip.mp4"', 'src="media/clip.mp4"').replace('poster="figs/clip.png"', 'poster="media/clip-2.png"');
  assert.equal(await render(b), b.source.replace(first, `${first}\n    ${section}`));
  await b.evaluate('window.BeesonEditor.undo()');
  assert.equal(await render(b), b.source);
});

test('Stop pastes the slide without the files not read by then, and does not ask for a folder', async (t) => {
  const { b } = await heldPaste(t);
  await b.waitFor(BUSY_DRAWN, 20000);
  await b.evaluate(`document.querySelector('${BUSY} button').click()`);
  await pasted(b);
  assert.equal(await b.evaluate(OPEN), false);
  assert.equal(await b.evaluate(`!!document.querySelector('dialog.deck-folder[open]')`), false);
  assert.match(sectionOf(await render(b), FILES), /src="figs\/orbit\.png"/);
  assert.match((await status(b)).message, /figs\/orbit\.png\b.*not copied/);
});

// Stop is clicked in the page as the dialog opens, since the dialog may be drawn before a click
// of the test arrives. with busy, the page first computes for busy ms without a frame, as a slow
// machine does, hence the dialog is still not drawn at the click
const EARLY = (busy) => `(() => {
  window.__early = 0;
  new MutationObserver(() => {
    const stop = document.querySelector('${BUSY}[open] button');
    if (!stop || window.__early) return;
    const until = performance.now() + ${busy};
    while (performance.now() < until);
    window.__early = 1;
    stop.click();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  return true;
})()`;

for (const [when, busy] of [['as the dialog opens', 0], ['after a long task without a frame', 600]]) test(`Stop pressed ${when}, before the dialog is drawn, does not stop the reads`, async (t) => {
  const { b } = await heldPaste(t, EARLY(busy), 'window.__early === 1');
  hold = false;
  release();
  await pasted(b);
  assert.match(sectionOf(await render(b), FILES), /src="media\/orbit-2\.png"/);
});

test('a fast paste ends with the dialog closed', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const b = await deck(B);
  t.after(() => b.close());
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  assert.equal(await b.evaluate(OPEN), false);
  assert.equal(await b.evaluate(`document.activeElement?.closest('dialog') ?? null`), null);
});
