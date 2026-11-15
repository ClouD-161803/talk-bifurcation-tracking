// a file of this deck at a path that a carried file would take is read only when its length is
// the length of the carried file, which the header Content-Length gives before the body. a server
// that sends a large media/clip.png of deck B counts the bytes that it sent

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { A, B, FILES, FIRST_B, QUERY, copySlide, openDeck, pasteSlides, pasted, render, sectionOf, withMacrosOfA } from './helpers/cross-deck.mjs';

const LARGE = 20 * 1024 * 1024;
const CHUNK = Buffer.alloc(64 * 1024);
let browser;
let inner;
let server;
let sent = 0;
before(async () => {
  browser = await launch({ offline: false });
  inner = await serve('.');
  const outer = createServer(async (request, response) => {
    if (request.url.split('?')[0].endsWith('/cross-deck/b/media/clip.png')) {
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': LARGE });
      let left = LARGE;
      const more = () => {
        while (left > 0 && !response.destroyed) {
          left -= CHUNK.length;
          sent += CHUNK.length;
          if (!response.write(CHUNK)) return void response.once('drain', more);
        }
        if (left <= 0) response.end();
      };
      return more();
    }
    const r = await fetch(`${inner.origin}${request.url}`, { headers: request.headers.range ? { range: request.headers.range } : {} });
    response.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !/^(connection|keep-alive|transfer-encoding)$/.test(k))));
    response.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((done) => outer.listen(0, '127.0.0.1', done));
  server = { origin: `http://127.0.0.1:${outer.address().port}`, close: () => (outer.close(), outer.closeAllConnections()) };
});
after(async () => {
  await browser?.close();
  server?.close();
  inner?.close();
});

test('a file of this deck of another length than a carried file is not downloaded to compare them', async (t) => {
  const a = await openDeck(browser, `${server.origin}/${A}?${QUERY}`, A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const b = await withMacrosOfA(await openDeck(browser, `${server.origin}/${B}?${QUERY}`, B));
  t.after(() => b.close());
  sent = 0;
  await pasteSlides(b, FIRST_B, text);
  await pasted(b, 60000);
  assert.match(sectionOf(await render(b), FILES), /poster="media\/clip-2\.png"/);
  assert.ok(sent < LARGE / 4, `${sent} bytes of ${LARGE} were sent for media/clip.png of deck B`);
});
