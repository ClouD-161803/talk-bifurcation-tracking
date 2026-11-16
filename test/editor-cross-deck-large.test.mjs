// a file of this deck at a path that a carried file would take is read only when its length is
// the length of the carried file, which the header Content-Length gives before the body. a server
// holds the body of a large media/clip.png of deck B until the page closes the request

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { A, B, FILES, FIRST_B, QUERY, copySlide, openDeck, pasteSlides, pasted, render, sectionOf, withMacrosOfA } from './helpers/cross-deck.mjs';

const LARGE = 20 * 1024 * 1024;
let browser;
let inner;
let server;
let asked = false;
let closed = false;
// records in the page every read of the body of the answer for media/clip.png of deck B. a page that
// reads the body and gives up on a timer of its own closes the request as well
const READS = `(() => {
  window.__reads = [];
  const ours = (r) => !!r.url && new URL(r.url).pathname.endsWith('/cross-deck/b/media/clip.png');
  const streams = new WeakSet();
  const body = Object.getOwnPropertyDescriptor(Response.prototype, 'body');
  Object.defineProperty(Response.prototype, 'body', { ...body, get() { const s = body.get.call(this); if (s && ours(this)) streams.add(s); return s; } });
  for (const name of ['arrayBuffer', 'blob', 'bytes', 'formData', 'json', 'text']) {
    const read = Response.prototype[name];
    if (read) Response.prototype[name] = function (...rest) { if (ours(this)) window.__reads.push(name); return read.apply(this, rest); };
  }
  for (const name of ['getReader', 'pipeThrough', 'pipeTo', 'tee', 'values', Symbol.asyncIterator]) {
    const read = ReadableStream.prototype[name];
    if (read) ReadableStream.prototype[name] = function (...rest) { if (streams.has(this)) window.__reads.push(String(name)); return read.apply(this, rest); };
  }
})()`;
before(async () => {
  browser = await launch({ offline: false });
  inner = await serve('.');
  const outer = createServer(async (request, response) => {
    if (request.url.split('?')[0].endsWith('/cross-deck/b/media/clip.png')) {
      // the bytes that pass before the page reads the header depend on the speed of the page and on
      // the buffers of the system, hence no byte of the body is sent
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': LARGE });
      response.flushHeaders();
      asked = true;
      return void response.on('close', () => (closed = true));
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
  asked = closed = false;
  await b.evaluate(READS);
  await pasteSlides(b, FIRST_B, text);
  // a page that waits for the body does not close the request
  for (const end = Date.now() + 60000; !closed; await sleep(50)) assert.ok(Date.now() < end, asked ? 'the request of media/clip.png of deck B is not closed by the page within 60 s, before its body' : 'the page does not ask for media/clip.png of deck B within 60 s');
  await pasted(b, 60000);
  assert.deepEqual(await b.evaluate('window.__reads'), [], 'the body of media/clip.png of deck B is read');
  assert.match(sectionOf(await render(b), FILES), /poster="media\/clip-2\.png"/);
});
