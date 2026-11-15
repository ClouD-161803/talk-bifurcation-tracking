// a paste from another deck on a server that answers every path with status 200, as a development
// server that falls back to index.html does. its page for a path without a file is not taken as the
// file, hence the search for a free name under media/ ends, and a missing file of the first deck is
// listed as not copied

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { A, B, FILES, FIRST_B, QUERY, copySlide, openDeck, pasteSlides, pasted, render, sectionOf, status } from './helpers/cross-deck.mjs';

let browser;
let inner;
let server;
before(async () => {
  browser = await launch({ offline: false });
  inner = await serve('.');
  // the files of the repository, and a page of HTML for every other path
  const outer = createServer(async (request, response) => {
    const r = await fetch(`${inner.origin}${request.url}`, { headers: request.headers.range ? { range: request.headers.range } : {} });
    if (r.status === 404) return void response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>A deck</title>');
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

const deck = (file) => openDeck(browser, `${server.origin}/${file}?${QUERY}`, file);
const MISSING = '<img src="figs/none.png" alt="A figure that deck A does not have">';

test('a server that answers every path does not make every name taken or every file found', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = (await copySlide(a, FILES)).replace('<aside', `${MISSING}\n      <aside`);
  const b = await deck(B);
  t.after(() => b.close());
  await pasteSlides(b, FIRST_B, text);
  await pasted(b, 30000);
  const section = sectionOf(await render(b), FILES);
  assert.match(section, /src="media\/orbit-2\.png"/);
  assert.match(section, /src="media\/clip\.mp4" poster="media\/clip-2\.png"/);
  assert.ok(section.includes(MISSING), 'the missing file was given a path under media');
  assert.match((await status(b)).message, /figs\/none\.png was not copied/);
});
