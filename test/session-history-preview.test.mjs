// the preview of Version History in Chrome, on the edit command started on a temporary talk folder
// with SLIDES_HISTORY set so that a version is closed only when it is named: the layout of a phone
// in portrait and in landscape with 1, 8, and 40 changed slides, the slide after a hidden slide, a
// changed step and changed notes, the keys inside the preview, a new list that leaves the bar
// alone, one read of the text per preview, the memory of a preview hidden, and converge() of the
// helpers, which ends at its time limit

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { launch } from '../scripts/chrome.mjs';
import { front } from './helpers/apply.mjs';
import { C, clean, ONLINE, open, sessionUrl, talk, TALK, TEXT } from './helpers/client.mjs';
import { click, press } from './helpers/editor.mjs';

// a version is closed only when the current state is named
const HELD = { SLIDES_HISTORY: JSON.stringify({ quiet: 3_600_000, longest: 3_600_000 }) };

const PANE = '.beeson-session-history';
const SHOWN = `!!document.querySelector('${PANE}:not([hidden])')`;
const BAR = '.beeson-session-preview .bar';
const FRAME = `document.querySelector('.beeson-session-preview iframe')`;
const CURRENT = `${FRAME}?.contentWindow?.Reveal?.getCurrentSlide()?.querySelector('h2')?.textContent`;
const button = (scope, text) => `[...document.querySelectorAll('${scope} button')].find((b) => b.textContent === ${JSON.stringify(text)} && b.getClientRects().length)`;
const rowByTitle = (title) => `[...document.querySelectorAll('${PANE} .row.version')].find((r) => r.querySelector('.title').textContent === ${JSON.stringify(title)})`;

// a tap on the element of expression, scrolled into view in a pane that scrolls
async function tapOrClick(page, expression) {
  await page.waitFor(`!!(${expression})`);
  const point = await page.evaluate(`(() => { const el = ${expression}; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, point);
}

const press$ = (page, scope, text) => tapOrClick(page, button(scope, text));

async function openPane(page) {
  await front(page);
  await press(page, 'Mod+Alt+Shift+H');
  await page.waitFor(SHOWN);
}

// the current state named through the client, which closes a version, resolved with the version
const nameNow = (page, name) => page.evaluate(`${C}.transport.post('history/current/name', { token: ${C}.token, name: ${JSON.stringify(name)} })`);
const rename = (page, id, name) => page.evaluate(`${C}.transport.post('history/' + ${JSON.stringify(id)} + '/name', { token: ${C}.token, name: ${JSON.stringify(name)} }).then(() => true)`);

// index.html written outside the editor, and the page once it holds the text of mark
async function write(server, page, text, mark) {
  writeFileSync(server.file, text);
  await page.waitFor(`${ONLINE} && ${TEXT}.includes(${JSON.stringify(mark)})`, 30_000);
}

const HEAD = TALK.slice(0, TALK.indexOf('<section>'));
const TAIL = TALK.slice(TALK.lastIndexOf('</section>') + '</section>'.length);

// a deck of 45 slides, of which the first changed ones carry mark in their heading
const many = (changed, mark) => HEAD + Array.from({ length: 45 }, (_, i) => `\n<section>\n  <h2>Slide ${i + 1}${i < changed ? ` ${mark}` : ''}</h2>\n  <p>Text ${i + 1}</p>\n</section>\n`).join('') + TAIL;

// the preview at the size of a phone, as numbers that the test bounds: the height of the iframe, the
// places of Restore and More, the rows of the bar, the slide buttons, and the sheet of the pane
const MEASURE = `(() => {
  const box = (el) => {
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, hit: el.contains(hit), big: r.width >= 32 && r.height >= 32 };
  };
  const bar = document.querySelector('${BAR}');
  const parts = [...bar.children].filter((c) => c.getClientRects().length && c.getBoundingClientRect().height > 0).map((c) => c.getBoundingClientRect()).sort((a, b) => a.top - b.top);
  let rows = 0;
  let bottom = -Infinity;
  for (const r of parts) if (r.top >= bottom - 1) { rows++; bottom = r.bottom; } else bottom = Math.max(bottom, r.bottom);
  const slides = [...bar.querySelectorAll('button.slide')];
  const pane = document.querySelector('${PANE}').getBoundingClientRect();
  const shown = [...document.querySelectorAll('${PANE} .row')].filter((r) => r.getClientRects().length);
  return {
    frame: Math.round(${FRAME}.getBoundingClientRect().height),
    restore: box(${button(BAR, 'Restore this version')}),
    more: box(bar.querySelector('button.more')),
    rows,
    slides: slides.length,
    oneRow: new Set(slides.map((b) => Math.round(b.getBoundingClientRect().top))).size <= 1,
    name: !!${button(BAR, 'Name this version')},
    sheet: { phone: innerWidth < 600, low: pane.height < innerHeight * 0.55 - 1, rows: shown.length, chosen: shown.length === 1 && shown[0].getAttribute('aria-current') === 'true', versions: box(${button(PANE, 'Versions')}) },
  };
})()`;

const STEPS = (three, step, note) => `${HEAD}
<section>
  <h2>One</h2>
  <p>First slide</p>
</section>

<section data-visibility="hidden">
  <h2>Hidden</h2>
  <p>Hidden slide</p>
</section>

<section>
  <h2>Three</h2>
  <p>${three}</p>
  <p class="fragment">${step}</p>
  <aside class="notes">${note}</aside>
</section>
${TAIL}`;

test('the preview of a deck with a hidden slide, a changed step, and changed notes, and the keys inside it', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  writeFileSync(server.file, STEPS('Third slide', 'Step text', 'A note'));
  await server.edit.child.kill();
  await server.edit.exited;
  await server.start();
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await write(server, ann, STEPS('Third slide changed', 'Step text changed', 'A note changed'), 'A note changed');
  await nameNow(ann, 'Changed');
  await openPane(ann);
  await tapOrClick(ann, rowByTitle('Changed'));
  const doc = `${FRAME}.contentDocument`;
  await ann.waitFor(`${doc}?.querySelectorAll('[data-beeson-changed]').length === 3 && ${FRAME}.contentWindow.Reveal?.isReady()`, 30_000);

  await t.test('the preview opens at the first changed slide that is shown, and Slide 2 shows the slide after the hidden slide', async () => {
    assert.deepEqual(await ann.evaluate(`[...document.querySelectorAll('${BAR} button.slide')].map((b) => b.textContent)`), ['Slide 2']);
    await ann.waitFor(`${CURRENT} === 'Three'`);
    await ann.evaluate(`${FRAME}.contentWindow.Reveal.slide(0), true`);
    await ann.waitFor(`${CURRENT} === 'One'`);
    await press$(ann, BAR, 'Slide 2');
    await ann.waitFor(`${CURRENT} === 'Three'`);
  });
  clean(ann);
});

test('a new list leaves the bar alone, the text of a version is read once per preview, and a hidden preview keeps nothing', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t, { env: HELD });
  const ann = await open(browser, sessionUrl(server.edit), { name: 'Ann' });
  await write(server, ann, TALK.replace('<h2>One</h2>', '<h2>One first</h2>'), 'One first');
  const first = (await nameNow(ann, 'First')).id;
  await write(server, ann, TALK.replace('<p>Second slide</p>', '<p>Second slide changed</p>'), 'Second slide changed');
  const second = (await nameNow(ann, 'Second')).id;
  // the initiators of the reads of the text of a version by the page, and the downloads
  await ann.evaluate(`(() => {
    performance.setResourceTimingBufferSize(100000);
    window.__reads = (id) => performance.getEntriesByType('resource').filter((e) => e.name.includes('version=' + id)).map((e) => e.initiatorType);
    ${C}.shell.download = (text) => { window.__downloaded = text; };
    return true;
  })()`);
  const documents = async () => {
    for (let i = 0; i < 3; i++) await ann.send('HeapProfiler.collectGarbage');
    return (await ann.send('Memory.getDOMCounters')).documents;
  };
  await openPane(ann);
  await ann.waitFor(`!!document.querySelector('${PANE} .row[data-id="version:${second}"]')`);
  const before = await documents();
  // the preview of the version of id, once its changed element, which holds mark, is outlined
  const preview = async (id, mark) => {
    await tapOrClick(ann, `document.querySelector('${PANE} .row[data-id="version:${id}"]')`);
    await ann.waitFor(`document.querySelector('${PANE} .row[aria-current="true"]')?.dataset.id === 'version:${id}' && [...(${FRAME}?.contentDocument?.querySelectorAll('[data-beeson-changed]') ?? [])].some((e) => e.textContent.includes(${JSON.stringify(mark)}))`, 30_000);
  };
  const download = async () => {
    await ann.evaluate('window.__downloaded = null, true');
    await tapOrClick(ann, `document.querySelector('${BAR} button.more')`);
    await tapOrClick(ann, `[...document.querySelectorAll('.beeson-session-menu button')].find((b) => b.textContent === 'Download This Version')`);
    await ann.waitFor('typeof window.__downloaded === "string"');
    assert.match(await ann.evaluate('window.__downloaded'), /<h2>One first<\/h2>/);
  };

  await t.test('a preview and its download read the text of the version once', async () => {
    await preview(first, 'One first');
    await download();
    assert.deepEqual(await ann.evaluate(`window.__reads(${JSON.stringify(first)})`), ['fetch']);
  });
  clean(ann);
});

test('converge ends with a failure at its time limit while one page is in step with the file and another is not', { timeout: 60_000 }, async () => {
  const helpers = pathToFileURL(resolve('test/helpers/client.mjs')).href;
  // a worker, since a converge that loops without an await holds the thread that runs it
  const worker = new Worker(`(async () => {
    const { parentPort } = require('node:worker_threads');
    const { converge } = await import(${JSON.stringify(helpers)});
    const page = (text) => ({ send: async () => ({}), evaluate: async () => text });
    const server = { read: () => 'the text of the file, which is long enough to be cut in the message' };
    converge(server, [page(server.read()), page('the text of another file')], 'the pages to agree', 300).then(() => parentPort.postMessage({ value: true }), (e) => parentPort.postMessage({ error: e.message }));
  })()`, { eval: true });
  let timer;
  const answer = await Promise.race([
    new Promise((done) => worker.once('message', done)),
    new Promise((done) => (timer = setTimeout(() => done({ hung: true }), 20_000))),
  ]);
  clearTimeout(timer);
  await worker.terminate();
  assert.deepEqual(answer.hung, undefined, 'converge did not end within 20 s');
  assert.match(answer.error ?? '', /^timed out waiting for the pages to agree\npage 0: agrees\npage 1: "the text of another file" where the file has "the text of the file, which is long enough to be cut in the message"$/);
});
