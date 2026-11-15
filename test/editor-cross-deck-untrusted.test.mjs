// a paste of a text whose origin was written by another page, which any page can put on the
// clipboard. a macro whose name, arguments, or body would not be read as such in theme/macros.js
// is not listed, an origin whose deck is not a string with an address of http, https, or file is
// pasted as a text without origin, and an entry of the macros that is not a macro is skipped

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { A, B, BACKDROP, FILES, FIRST_B, QUERY, copySlide, openDeck, pasteSlides, pasted, render, sectionOf, status, withOrigin } from './helpers/cross-deck.mjs';

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

const deck = (file) => openDeck(browser, `${server.origin}/${file}?${QUERY}`, file);
const DIALOG = 'dialog.beeson-edit-dialog.paste-macros';

test('a crafted name or number of arguments is not listed, and a line break is escaped', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = withOrigin(await copySlide(a, FILES), (o) => ({
    ...o,
    macros: [
      { name: "a: '', b: globalThis.pwned=1, c", body: 'x', args: 0 },
      { name: 'evil', body: 'x', args: '1], globalThis.pwned=1, [' },
      { name: 'cr', body: 'a\rb\u2028c', args: 0 },
      { name: 'dash', body: '\\text{a--b}', args: 0 },
    ],
  }));
  const b = await deck(B);
  t.after(() => b.close());
  await pasteSlides(b, FIRST_B, text);
  await b.waitFor(`!!document.querySelector('${DIALOG}:not([hidden])')`, 30000);
  await pasted(b);
  const lines = await b.evaluate(`document.querySelector('${DIALOG} pre').textContent`);
  assert.equal(lines, String.raw`cr: 'a\u000db\u2028c',` + '\n' + String.raw`dash: '\\text{a--b}',`);
});

for (const [what, other] of [['an address of http, https, or file', () => 'javascript:alert(1)'], ['a string', (o) => [o.deck]]]) test(`an origin whose deck is not ${what} is pasted as a text without origin`, async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = withOrigin(await copySlide(a, FILES), (o) => ({ ...o, deck: other(o) }));
  const b = await deck(B);
  t.after(() => b.close());
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  const first = sectionOf(b.source, FIRST_B);
  assert.equal(await render(b), b.source.replace(first, `${first}\n    ${sectionOf(a.source, FILES)}`));
  const asked = await b.evaluate(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/cross-deck/a/'))`);
  assert.deepEqual(asked, []);
  assert.equal(await b.evaluate(`!!document.querySelector('${DIALOG}')`), false);
});

test('an entry of the macros that is not a macro is skipped, and the note of the files is shown', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = withOrigin(await copySlide(a, BACKDROP), (o) => ({ ...o, macros: [null, { name: 'num', body: 7, args: 0 }] }));
  const b = await deck(B);
  t.after(() => b.close());
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  assert.match((await status(b)).message, /media\/path\.js is drawn once the deck is saved and opened again\./);
  assert.equal(await b.evaluate(`!!document.querySelector('${DIALOG}')`), false);
});
