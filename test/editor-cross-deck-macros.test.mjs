// the macros and the theme of slides pasted from the editor of deck A into the editor of deck B,
// both on one local server. after the paste, a dialog names each macro of the origin that deck B
// lacks or defines otherwise, as the line of a preamble that defines it, with a button that copies
// the lines. the lines define the macros on the open deck once they are in the Preamble sheet. the
// entry of the history of the paste is closed while the dialog is open, and a later paste of the
// same macros adds a sentence to the note in place of the dialog. a theme of another version adds
// one sentence to the note of the paste

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { A, B, BACKDROP, FILES, FIRST_B, QUERY, copySlide, errors, openDeck, pasteSlides, pasted, render, status } from './helpers/cross-deck.mjs';
import { center, click, type } from './helpers/editor.mjs';

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
const SHOWN = `!!document.querySelector('${DIALOG}:not([hidden])')`;
const read = (page) => page.evaluate(`(() => { const d = document.querySelector('${DIALOG}'); return { text: d.querySelector('p').textContent, lines: d.querySelector('pre').textContent, hint: d.querySelector('.hint')?.hidden === false ? d.querySelector('.hint').textContent : '' }; })()`);

// the macros of deck B, which defines half as deck A does, orb with another body, and not dash
const OWN = String.raw`({ half: '\\tfrac{1}{2}', orb: ['\\mathcal{O}_{#1}', 1] })`;
const ALL = String.raw`({ half: '\\tfrac{1}{2}', orb: ['\\mathcal{O}_{\\half #1}', 1], dash: '\\text{a--b}' })`;
const define = (page, macros) => page.evaluate(`(() => { window.beesonTex = { macros: ${macros} }; if (window.MathJax?.config?.tex) MathJax.config.tex.macros = window.beesonTex.macros; return true; })()`);
const LINES = String.raw`\newcommand{\dash}{\text{a--b}}
\renewcommand{\orb}[1]{\mathcal{O}_{\half #1}}`;

test('a paste names the macros that this deck lacks or defines otherwise, and copies their lines', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const b = await deck(B);
  t.after(() => b.close());
  await define(b, OWN);
  await b.evaluate(`navigator.clipboard.writeText = async (t) => { window.__written = t; }; true`);
  await pasteSlides(b, FIRST_B, text);
  await b.waitFor(SHOWN, 30000);
  // the paste is over, and its entry of the history closed, while the dialog waits
  await pasted(b, 5000);
  const shown = await read(b);
  assert.equal(shown.lines, LINES);
  assert.match(shown.text, /^Choose File > Preamble… and paste the lines below at the end of the preamble of this deck\./);
  assert.match(shown.text, /drawn in red/);
  assert.match(shown.text, /\\orb.*definition of this deck/);
  assert.ok(!shown.text.includes('\\half'), 'half is defined the same in both decks');
  await click(b, await center(b, `${DIALOG} button.primary`));
  await b.waitFor('window.__written !== undefined', 5000);
  assert.equal(await b.evaluate('window.__written'), LINES);
  assert.equal(await b.evaluate(SHOWN), true, 'Copy closed the dialog');
  await b.evaluate(`document.querySelector('${DIALOG}').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await b.waitFor(`!${SHOWN}`, 5000);
  const once = await render(b);
  await b.evaluate('window.BeesonEditor.undo()');
  assert.equal(await render(b), b.source);
  await b.evaluate('window.BeesonEditor.redo()');
  assert.equal(await render(b), once);

  // a second paste of the same macros says so in the note, without the dialog
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  assert.equal(await b.evaluate(SHOWN), false);
  assert.match((await status(b)).message, /\\dash and \\orb are still not defined in this deck as in the deck they were copied from/);
  assert.deepEqual(errors(b), []);
});

test('a refused write of the clipboard tells how to copy the lines by hand', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const b = await deck(B);
  t.after(() => b.close());
  await b.evaluate(`navigator.clipboard.writeText = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError')); true`);
  await pasteSlides(b, FIRST_B, text);
  await b.waitFor(SHOWN, 30000);
  assert.equal((await read(b)).hint, '');
  await click(b, await center(b, `${DIALOG} button.primary`));
  await b.waitFor(`document.querySelector('${DIALOG} .hint')?.hidden === false`, 5000);
  assert.match((await read(b)).hint, /did not let the editor write the clipboard\. Select the lines and copy them, e\.g\. with Ctrl\+C\./);
  // deck B lacks all three macros
  assert.equal((await read(b)).lines.split('\n').length, 3);
});

test('a paste whose macros this deck defines the same opens no dialog', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const b = await deck(B);
  t.after(() => b.close());
  await define(b, ALL);
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  assert.equal(await b.evaluate(`!!document.querySelector('${DIALOG}')`), false);
  // the same theme adds nothing to the note
  assert.doesNotMatch((await status(b)).message ?? '', /version/);
});

test('a theme of another version is named in the note of the paste with the sentences of its files', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, BACKDROP);
  const b = await deck(B);
  t.after(() => b.close());
  const version = await b.evaluate('Beeson.version');
  await pasteSlides(b, FIRST_B, text.replace(/"version":"[^"]*"/, '"version":"0.0.1"'));
  await pasted(b);
  const { message } = await status(b);
  assert.match(message, /media\/path\.js is drawn once the deck is saved and opened again\./);
  assert.ok(message.includes(`theme version 0.0.1, and this deck version ${version}, hence what you pasted may be drawn differently.`), message);
});

test('a macro with an optional argument is listed with its default, also when only the default differs', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  await define(a, String.raw`({ orb: ['\\mathcal{O}_{#1}', 1, 'k'], half: '\\tfrac{1}{2}', dash: '\\text{a--b}' })`);
  const text = await copySlide(a, FILES);
  const b = await deck(B);
  t.after(() => b.close());
  await define(b, String.raw`({ orb: ['\\mathcal{O}_{#1}', 1, 'j'], half: '\\tfrac{1}{2}', dash: '\\text{a--b}' })`);
  await pasteSlides(b, FIRST_B, text);
  await b.waitFor(SHOWN, 30000);
  await pasted(b);
  const shown = await read(b);
  assert.equal(shown.lines, String.raw`\renewcommand{\orb}[1][k]{\mathcal{O}_{#1}}`);
  assert.match(shown.text, /\\orb are drawn with the definition of this deck/);
});

// the deck of test/editor-tex-sheets.test.mjs, which has a preamble.tex. it defines half with
// another body than deck A, and neither orb nor dash
const TEX = 'test/pages/tex-sheets/index.html';
const SHEET = 'dialog.beeson-edit-tex[open]';
const RED = `!![...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent.trim() === ${JSON.stringify(FILES)})?.querySelector('[fill="red"], [data-mjx-error]')`;

test('the lines of the dialog, put at the end of the Preamble sheet, define the macros of the paste on the open deck', { timeout: 120000 }, async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const b = await deck(TEX);
  t.after(() => b.close());
  await pasteSlides(b, 'Macros', text);
  await b.waitFor(SHOWN, 30000);
  await pasted(b);
  const { lines } = await read(b);
  assert.equal(lines, String.raw`\newcommand{\dash}{\text{a--b}}
\renewcommand{\half}{\tfrac{1}{2}}
\newcommand{\orb}[1]{\mathcal{O}_{\half #1}}`);
  await b.waitFor(RED, 10000);
  await b.evaluate(`document.querySelector('${DIALOG}').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await b.waitFor(`!${SHOWN}`, 5000);

  await b.evaluate(`Promise.resolve(window.BeesonEditor.exec('file.preamble')).then(() => true)`);
  await b.waitFor(`!!document.querySelector('${SHEET}:not([aria-busy])')`, 30000);
  await b.evaluate(`(() => { const s = document.querySelector('${SHEET} textarea'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); return true; })()`);
  await type(b, `${lines}\n`);
  await b.waitFor(`!${RED}`, 30000);
  // the three macros are read by the reader of the preamble, the second definition of half included
  const row = (name) => b.evaluate(`document.querySelector('${SHEET} [data-macro="${name}"]')?.textContent.replace(/\\s+/g, ' ').trim() ?? null`);
  assert.equal(await row('dash'), '\\dash 0 arguments');
  assert.equal(await row('orb'), '\\orb 1 argument');
  assert.deepEqual(await b.evaluate('[window.beesonTex.macros.half, window.beesonTex.macros.orb]'), ['\\tfrac{1}{2}', ['\\mathcal{O}_{\\half #1}', 1]]);
  assert.deepEqual(await b.evaluate(`[...document.querySelectorAll('${SHEET} .skipped')].map((r) => r.textContent).filter((r) => /dash|half|orb/.test(r))`), []);
});
