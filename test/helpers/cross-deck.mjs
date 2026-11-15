// helpers of the tests of a copy in the editor of one deck and a paste into the editor of another,
// on the two decks of test/pages/cross-deck/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deckSettled } from '../../scripts/chrome.mjs';
import { click, selectFigure } from './editor.mjs';

export const DIR = 'test/pages/cross-deck';
export const A = `${DIR}/a/index.html`;
export const B = `${DIR}/b/index.html`;
export const QUERY = 'edit&still&edit-platform=other';
export const MARK = '<!--beeson-->';
export const FILES = 'A slide with the files of deck A';
export const BACKDROP = 'A slide with the backdrop of deck A';
export const FIRST_B = 'The first slide of deck B';

const js = JSON.stringify;

// the storage of the origin emptied: the drafts, the files kept for them, and the private file system
const CLEAR = `(async () => {
  localStorage.clear();
  await new Promise((done) => { const r = indexedDB.deleteDatabase('beeson-media'); r.onsuccess = r.onerror = r.onblocked = () => done(); });
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
  return true;
})()`;

// the editor on the deck at url, whose file is file, with every block paired
export async function openDeck(browser, url, file) {
  const page = await browser.newPage({ width: 1600, height: 1000 });
  await page.goto(url);
  await page.evaluate(CLEAR);
  await page.goto(url);
  await page.waitFor(deckSettled, 60000);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)', 60000);
  const source = readFileSync(file, 'utf8');
  const state = await page.evaluate(`window.BeesonEditor.open(${js(source)})`);
  assert.deepEqual(state.problems, [], `the blocks of ${file} are not all paired`);
  page.source = source;
  return page;
}

export const render = (page) => page.evaluate('window.BeesonEditor.render()');
export const status = (page) => page.evaluate('window.BeesonEditor.status()');

const indexOf = (title) => `[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('h2')?.textContent.trim() === ${js(title)})`;

// the slide headed title shown and selected in the navigator, by a click on its row
export async function selectRow(page, title) {
  const i = await page.evaluate(indexOf(title));
  assert.ok(i >= 0, `the slide ${title} is not found`);
  const at = await page.evaluate(`(() => { const r = document.querySelectorAll('.beeson-edit-nav .row')[${i}]; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await click(page, at);
  await page.waitFor(`document.activeElement?.closest('.beeson-edit-nav') && Reveal.getIndices().h === ${i}`, 10000);
  return i;
}

// the text that Copy of the slide headed title puts on the clipboard
export async function copySlide(page, title) {
  await selectRow(page, title);
  return page.evaluate(`(async () => { const d = new DataTransfer(); await window.BeesonEditor.exec('slide.copy', d); return d.getData('text/plain'); })()`);
}

// the text that Copy of the figure of the image matched by image, on the slide headed title, puts
// on the clipboard
export async function copyFigure(page, title, image) {
  await selectRow(page, title);
  await selectFigure(page, `.reveal section.present ${image}`);
  await page.waitFor(`window.BeesonEditor.state('edit.copy').enabled`, 10000);
  return page.evaluate(`(async () => { const d = new DataTransfer(); await window.BeesonEditor.exec('edit.copy', d); return d.getData('text/plain'); })()`);
}

// slides pasted after the slide headed title, or elements pasted on it. the end of the paste is
// not waited for here, since a dialog may be shown before it, and pasted() waits for it
export async function pasteSlides(page, title, text) {
  await selectRow(page, title);
  await page.evaluate(`(() => { window.__pasted = false; Promise.resolve(window.BeesonEditor.exec('slide.paste', ${js(text)})).then(() => { window.__pasted = true; }, (e) => { window.__pasted = String(e); }); return true; })()`);
}

export async function pasteElements(page, title, text) {
  await selectRow(page, title);
  await page.evaluate(`(() => { document.activeElement?.blur(); window.__pasted = false; Promise.resolve(window.BeesonEditor.exec('edit.paste', ${js(text)})).then(() => { window.__pasted = true; }, (e) => { window.__pasted = String(e); }); return true; })()`);
}

export async function pasted(page, timeout = 30000) {
  await page.waitFor('window.__pasted !== false', timeout);
  assert.equal(await page.evaluate('window.__pasted'), true);
}

// the section of text headed title
export function sectionOf(text, title) {
  const h = text.indexOf(`<h2>${title}</h2>`);
  assert.ok(h >= 0, `the slide ${title} is not in the text`);
  return text.slice(text.lastIndexOf('<section', h), text.indexOf('</section>', h) + '</section>'.length);
}

// a save into a folder of the private file system, which the stub of showDirectoryPicker gives as
// the folder that the person chooses. it returns the saved text and the size of each file of media/
export const SAVE_INTO = (folder) => `(async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(${js(folder)}, { create: true });
  const deck = await dir.getFileHandle('deck.html', { create: true });
  window.showDirectoryPicker = async () => dir;
  window.BeesonEditor.attach(deck);
  await window.BeesonEditor.save();
  const files = {};
  try {
    const media = await dir.getDirectoryHandle('media');
    for await (const [name, h] of media.entries()) files[name] = (await h.getFile()).size;
  } catch {}
  return { text: await (await deck.getFile()).text(), files };
})()`;

// the decks do not have a favicon, which a browser asks a server for. a paste into deck B asks it
// for each path of a pasted file and for each path under media/ that it would take, and a path
// that deck B does not have is answered with 404. from another port, its first read of deck A is
// refused by the browser
export const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico') && !/status of 404 .*\/cross-deck\/b\//.test(e) && !(/blocked by CORS policy|net::ERR_FAILED/.test(e) && e.includes('/cross-deck/a/')));
