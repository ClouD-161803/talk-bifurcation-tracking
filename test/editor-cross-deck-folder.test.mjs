// the files of a paste from a deck that the page of deck B cannot read, here deck A on another
// local port. a dialog asks once for the folder of deck A, and the files are read from the chosen
// folder, through showDirectoryPicker or else an input with webkitdirectory. the folder is kept
// for the next paste from the same deck. after a cancel, a file missing from the folder, or in a
// browser without either picker, the slides are pasted and one message lists the files not copied

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { click } from './helpers/editor.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { A, B, BUSY, BUSY_DRAWN, FILES, FIRST_B, POINTER, QUERY, copyFigure, copySlide, errors, openDeck, pasteElements, pasteSlides, pasted, render, sectionOf, status, withMacrosOfA } from './helpers/cross-deck.mjs';

let browser;
let serverA;
let serverB;
before(async () => {
  browser = await launch({ offline: false });
  serverA = await serve('.');
  serverB = await serve('.');
});
after(async () => {
  await browser?.close();
  serverA?.close();
  serverB?.close();
});

const FIGS = ['figs/orbit.png', 'figs/clip.mp4', 'figs/clip.png', 'figs/shared.png'];
const DIALOG = 'dialog.beeson-edit-dialog.deck-folder';
const CARRIED = (text) => text.replace('src="figs/orbit.png"', 'src="media/orbit-2.png"').replace('src="figs/clip.mp4"', 'src="media/clip.mp4"').replace('poster="figs/clip.png"', 'poster="media/clip-2.png"');

// the copy of the slide with the files on deck A, and deck B on another port, which the browser
// does not let read the files of deck A
async function decks(t) {
  const a = await openDeck(browser, `${serverA.origin}/${A}?${QUERY}`, A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const figure = await copyFigure(a, FILES, 'img[src$="orbit.png"]');
  const b = await withMacrosOfA(await openDeck(browser, `${serverB.origin}/${B}?${QUERY}`, B));
  t.after(() => b.close());
  return { a, b, text, figure };
}

// the files of deck A, read by deck B from its own server, which serves the same disk. each file
// is given with its path in the folder a
const FOLDER_FILES = (paths) => `Promise.all(${JSON.stringify(paths)}.map(async (p) => ({ p, blob: await (await fetch('/test/pages/cross-deck/a/' + p)).blob() })))`;

// showDirectoryPicker stubbed with a folder a of the private file system that holds paths, and
// each call recorded with its options in window.__picks
const PICKER = (paths) => `(async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('a', { create: true });
  for (const { p, blob } of await ${FOLDER_FILES(paths)}) {
    let d = dir;
    const parts = p.split('/');
    for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
    const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
    await w.write(blob);
    await w.close();
  }
  window.__picks = [];
  window.showDirectoryPicker = async (options) => { window.__picks.push(options); return dir; };
  return true;
})()`;

// the dialog for the folder of deck A, its text, and a trusted click on a button of it, which
// grants the picker
async function answer(page, label) {
  await page.waitFor(`!!document.querySelector('${DIALOG}[open]')`, 20000);
  const text = await page.evaluate(`document.querySelector('${DIALOG}').textContent`);
  const at = await page.evaluate(`(() => { const r = [...document.querySelectorAll('${DIALOG} button')].find((b) => b.textContent === ${JSON.stringify(label)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, at);
  return text;
}

test('a refused read asks once for the folder of the first deck, and reads the files from it', async (t) => {
  const { a, b, text, figure } = await decks(t);
  await b.evaluate(PICKER(FIGS));
  await pasteSlides(b, FIRST_B, text);
  assert.match(await answer(b, 'Choose Folder…'), /folder a\b/);
  await pasted(b);
  const first = sectionOf(b.source, FIRST_B);
  assert.equal(await render(b), b.source.replace(first, `${first}\n    ${CARRIED(sectionOf(a.source, FILES))}`));
  assert.deepEqual(await b.evaluate('window.__picks.map((o) => o.mode)'), ['read']);
  // a picture is loaded from its blob after the paste is over
  await b.waitFor(`[...document.querySelectorAll('.reveal img[src^="blob:"]')].every((i) => i.complete && i.naturalWidth > 0)`);
  // the next paste from deck A reads the same folder without the dialog, and names the file that
  // the first paste carried
  await pasteElements(b, FIRST_B, figure);
  await pasted(b);
  assert.equal(await b.evaluate(`!!document.querySelector('${DIALOG}[open]')`), false);
  assert.equal(await b.evaluate('window.__picks.length'), 1);
  assert.match(sectionOf(await render(b), FIRST_B), /<img src="media\/orbit-2\.png" alt="An orbit of deck A">/);
  assert.deepEqual(errors(b), []);
});

test('without showDirectoryPicker, the folder is read from an input with webkitdirectory, and a missing file is listed', async (t) => {
  const { a, b, text } = await decks(t);
  // the folder a without the poster of the clip, given to the input as the browser gives a folder
  await b.evaluate(`(async () => {
    const files = (await ${FOLDER_FILES(FIGS.filter((p) => p !== 'figs/clip.png'))}).map(({ p, blob }) => {
      const f = new File([blob], p.split('/').pop());
      Object.defineProperty(f, 'webkitRelativePath', { value: 'a/' + p });
      return f;
    });
    window.showDirectoryPicker = undefined;
    window.__inputs = 0;
    HTMLInputElement.prototype.click = function () {
      if (!this.webkitdirectory) return;
      window.__inputs++;
      Object.defineProperty(this, 'files', { value: files });
      this.dispatchEvent(new Event('change'));
    };
    return true;
  })()`);
  await pasteSlides(b, FIRST_B, text);
  await answer(b, 'Choose Folder…');
  await pasted(b);
  assert.equal(await b.evaluate('window.__inputs'), 1);
  const expected = CARRIED(sectionOf(a.source, FILES)).replace('poster="media/clip-2.png"', 'poster="figs/clip.png"');
  assert.equal(sectionOf(await render(b), FILES), expected);
  assert.match((await status(b)).message, /figs\/clip\.png was not copied from the folder a\./);
});

test('a cancelled dialog pastes the slides and lists the files that were not copied', async (t) => {
  const { a, b, text } = await decks(t);
  await b.evaluate(PICKER(FIGS));
  await pasteSlides(b, FIRST_B, text);
  await answer(b, 'Paste Without Files');
  await pasted(b);
  assert.equal(sectionOf(await render(b), FILES), sectionOf(a.source, FILES));
  assert.equal(await b.evaluate('window.__picks.length'), 0);
  assert.match((await status(b)).message, /figs\/orbit\.png, figs\/clip\.mp4, figs\/clip\.png, and figs\/shared\.png were not copied from the folder a\./);
  // the undo takes the paste off in one entry
  await b.evaluate('window.BeesonEditor.undo()');
  assert.equal(await render(b), b.source);
});

test('Stop ends the wait for a folder that the picker does not give, and the files are listed', async (t) => {
  const { a, b, text } = await decks(t);
  // a picker that neither gives a folder nor is cancelled, as a browser that still lists a large one
  await b.evaluate(`(() => { window.showDirectoryPicker = () => new Promise(() => {}); return true; })()`);
  await pasteSlides(b, FIRST_B, text);
  await answer(b, 'Choose Folder…');
  await b.waitFor(BUSY_DRAWN, 20000);
  await b.evaluate(`document.querySelector('${BUSY} button').click()`);
  await pasted(b);
  assert.equal(sectionOf(await render(b), FILES), sectionOf(a.source, FILES));
  assert.match((await status(b)).message, /figs\/orbit\.png, figs\/clip\.mp4, figs\/clip\.png, and figs\/shared\.png were not copied from the folder a\./);
});

test('in a browser without a folder picker, e.g. on a phone, the dialog is skipped and the files are listed', async (t) => {
  const { a, b, text } = await decks(t);
  await b.evaluate(`window.showDirectoryPicker = undefined; true`);
  await b.evaluate(POINTER('touch'));
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  assert.equal(await b.evaluate(`!!document.querySelector('${DIALOG}[open]')`), false);
  assert.equal(sectionOf(await render(b), FILES), sectionOf(a.source, FILES));
  assert.match((await status(b)).message, /were not copied from the folder a, since this browser cannot open a folder\./);
});

test('a folder chosen after a cancelled dialog in the same page is read', async (t) => {
  const { a, b, text } = await decks(t);
  await b.evaluate(PICKER(FIGS));
  await pasteSlides(b, FIRST_B, text);
  await answer(b, 'Paste Without Files');
  await pasted(b);
  await b.evaluate('window.BeesonEditor.undo()');
  await pasteSlides(b, FIRST_B, text);
  await answer(b, 'Choose Folder…');
  await pasted(b);
  assert.equal(await b.evaluate('window.__picks.length'), 1);
  assert.equal(sectionOf(await render(b), FILES), CARRIED(sectionOf(a.source, FILES)));
});

test('a folder without any of the files is not kept, and the next paste asks again', async (t) => {
  const { b, text } = await decks(t);
  await b.evaluate(PICKER([]));
  await pasteSlides(b, FIRST_B, text);
  await answer(b, 'Choose Folder…');
  await pasted(b);
  await pasteSlides(b, FIRST_B, text);
  await answer(b, 'Paste Without Files');
  await pasted(b);
  assert.equal(await b.evaluate('window.__picks.length'), 1);
});
