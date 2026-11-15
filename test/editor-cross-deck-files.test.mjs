// the files of slides and elements pasted from the editor of deck A into the editor of deck B, both
// on one local server. each file named by a relative src, poster, or data-trajectories is read from
// deck A and kept as new media of deck B under a free name, apart from a file that deck B has at the
// same path with the same bytes. the paste with its files is one entry of the history, and a save
// writes the files into media/. a paste inside one deck keeps its paths

import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { A, B, BACKDROP, DIR, FILES, FIRST_B, QUERY, SAVE_INTO, copyFigure, copySlide, errors, openDeck, pasteElements, pasteSlides, pasted, render, sectionOf, status, withMacrosOfA } from './helpers/cross-deck.mjs';

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

const size = (path) => statSync(`${DIR}/a/${path}`).size;
const deck = async (file) => {
  const page = await openDeck(browser, `${server.origin}/${file}?${QUERY}`, file);
  return file === B ? withMacrosOfA(page) : page;
};

// deck B names media/orbit.png, and has media/clip.png on the disk without naming it, hence both
// names are taken. it has figs/shared.png with the bytes of deck A, and figs/orbit.png with others
const CARRIED = (text) => text.replace('src="figs/orbit.png"', 'src="media/orbit-2.png"').replace('src="figs/clip.mp4"', 'src="media/clip.mp4"').replace('poster="figs/clip.png"', 'poster="media/clip-2.png"');

// the images and videos under the slide headed title on deck B, once each is loaded or failed
async function loaded(page, title) {
  const media = `[...[...document.querySelectorAll('.reveal .slides > section')].find((x) => x.querySelector('h2')?.textContent.trim() === ${JSON.stringify(title)})?.querySelectorAll('img, video') ?? []]`;
  await page.waitFor(`${media}.length > 0 && ${media}.every((m) => (m.localName === 'img' ? m.complete : m.readyState >= 1 || m.error))`, 20000);
  return page.evaluate(`${media}.map((m) => [m.getAttribute('src').slice(0, 5), m.localName === 'img' ? m.naturalWidth > 0 : m.readyState >= 1])`);
}

test('slides pasted from another deck carry their files into media, in one entry of the history', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const b = await deck(B);
  t.after(() => b.close());
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  const section = CARRIED(sectionOf(a.source, FILES));
  const first = sectionOf(b.source, FIRST_B);
  const edited = b.source.replace(first, `${first}\n    ${section}`);
  assert.equal(await render(b), edited);
  // the new files are shown from object URLs, and the shared figure from the disk of deck B
  assert.deepEqual(await loaded(b, FILES), [['blob:', true], ['blob:', true], ['figs/', true]]);
  assert.match(await b.evaluate(`document.querySelector('video[poster^="blob:"]')?.poster ?? ''`), /^blob:/);
  // the paste and its files are one entry of the history
  await b.evaluate('window.BeesonEditor.undo()');
  assert.equal(await render(b), b.source);
  assert.equal((await status(b)).undo, false);
  await b.evaluate('window.BeesonEditor.redo()');
  assert.equal(await render(b), edited);
  const saved = await b.evaluate(SAVE_INTO('files'));
  assert.equal(saved.text, edited);
  assert.deepEqual(saved.files, { 'orbit-2.png': size('figs/orbit.png'), 'clip.mp4': size('figs/clip.mp4'), 'clip-2.png': size('figs/clip.png') });
  assert.deepEqual(errors(a), []);
  assert.deepEqual(errors(b), []);
});

test('a figure pasted alone from another deck carries its file', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copyFigure(a, FILES, 'img[src$="orbit.png"]');
  const b = await deck(B);
  t.after(() => b.close());
  await pasteElements(b, FIRST_B, text);
  await pasted(b);
  const pastedFirst = sectionOf(await render(b), FIRST_B);
  assert.match(pastedFirst, /<figure class="figure-box"[^>]*>\s*<img src="media\/orbit-2\.png" alt="An orbit of deck A">/);
  assert.deepEqual(await loaded(b, FIRST_B), [['blob:', true]]);
  const saved = await b.evaluate(SAVE_INTO('figure'));
  assert.deepEqual(saved.files, { 'orbit-2.png': size('figs/orbit.png') });
  assert.deepEqual(errors(b), []);
});

test('a backdrop pasted from another deck carries its trajectory file and says when it is drawn', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, BACKDROP);
  const b = await deck(B);
  t.after(() => b.close());
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  assert.equal(sectionOf(await render(b), BACKDROP), sectionOf(a.source, BACKDROP).replace('data-trajectories="data/path.js"', 'data-trajectories="media/path.js"'));
  assert.match((await status(b)).message, /media\/path\.js is drawn once the deck is saved and opened again/);
  const saved = await b.evaluate(SAVE_INTO('backdrop'));
  assert.deepEqual(saved.files, { 'path.js': size('data/path.js') });
});

test('slides pasted in the deck they were copied from keep their paths', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  await pasteSlides(a, FILES, text);
  await pasted(a);
  const out = await render(a);
  assert.equal(out.split('src="figs/orbit.png"').length, 3, 'the pasted slide does not name figs/orbit.png');
  assert.ok(!out.includes('media/'), 'a file of the deck was copied into media');
  assert.deepEqual(errors(a), []);
});

test('a file whose path has a malformed escape is carried under a safe name', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = (await copySlide(a, FILES)).replace('src="figs/shared.png"', 'src="figs/100%.png"');
  const b = await deck(B);
  t.after(() => b.close());
  // the test server does not answer a path that it cannot decode, hence the page answers it, with
  // a file in deck A and none in deck B
  await b.evaluate(`(() => { const f = window.fetch; window.fetch = (u, o) => (/\\/figs\\/100%/.test(String(u)) ? Promise.resolve(String(u).includes('/a/') ? new Response('png') : new Response('', { status: 404 })) : f(u, o)); return true; })()`);
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  assert.equal(sectionOf(await render(b), FILES), CARRIED(sectionOf(a.source, FILES)).replace('src="figs/shared.png"', 'src="media/100.png"'));
});

test('a second paste of the same slide names the files that the first paste carried', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  const text = await copySlide(a, FILES);
  const b = await deck(B);
  t.after(() => b.close());
  for (let i = 0; i < 2; i++) {
    await pasteSlides(b, FIRST_B, text);
    await pasted(b);
  }
  const out = await render(b);
  // the second paste is given a fresh id for its paragraph, hence only its files are compared
  const named = CARRIED(sectionOf(a.source, FILES)).match(/(src|poster)="media\/[^"]*"/g).join(' ');
  assert.equal(out.match(/(src|poster)="media\/[^"]*"/g).join(' '), `${named} ${named} src="media/orbit.png"`);
  const saved = await b.evaluate(SAVE_INTO('twice'));
  assert.deepEqual(saved.files, { 'orbit-2.png': size('figs/orbit.png'), 'clip.mp4': size('figs/clip.mp4'), 'clip-2.png': size('figs/clip.png') });
});

test('a file that the first deck has not saved yet is listed as not copied', async (t) => {
  const a = await deck(A);
  t.after(() => a.close());
  // a picture added in deck A and not saved is named under media/, which its server does not have
  const text = (await copySlide(a, FILES)).replace('src="figs/shared.png"', 'src="media/unsaved.png"');
  const b = await deck(B);
  t.after(() => b.close());
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  assert.equal(sectionOf(await render(b), FILES), CARRIED(sectionOf(a.source, FILES)).replace('src="figs/shared.png"', 'src="media/unsaved.png"'));
  assert.ok((await status(b)).message.endsWith('media/unsaved.png was not copied from the folder a.'));
});

test('a deck at the root of a server is named by its address in the note', async (t) => {
  const root = await serve(`${DIR}/b/media`);
  t.after(() => root.close());
  const a = await deck(A);
  t.after(() => a.close());
  const text = (await copySlide(a, FILES)).replace(/("deck":")[^"]*"/, `$1${root.origin}/index.html"`);
  const b = await deck(B);
  t.after(() => b.close());
  // the browser refuses the read from another port, and the dialog is not shown without a picker
  await b.evaluate(`(() => { window.showDirectoryPicker = undefined; const m = window.matchMedia; window.matchMedia = (q) => (q === '(any-pointer: fine)' ? { matches: false, media: q } : m.call(window, q)); return true; })()`);
  await pasteSlides(b, FIRST_B, text);
  await pasted(b);
  assert.ok((await status(b)).message.endsWith(`figs/orbit.png, figs/clip.mp4, figs/clip.png, and figs/shared.png were not copied from ${root.origin}/index.html, since this browser cannot open a folder.`), (await status(b)).message);
});
