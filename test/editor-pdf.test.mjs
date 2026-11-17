// the PDF figures of the editor. a PDF is inserted into an empty figure box as a render for each
// mode, in the tones of the mode. another page and Match the Mode are rendered again from the PDF,
// and an image is replaced with a PDF. each edit is checked byte for byte after an undo and a redo, and the
// saved renders carry the hash that npm run check reads. the PDF of test/pages/figure.pdf has a
// white page 1 with a black line across its middle, and a blue box on a transparent page 2

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { hashOf, renderHash, tonesOf } from '../src/pdffigure.ts';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { click, editorPage } from './helpers/editor.mjs';

const LAYOUTS = 'test/pages/editor-layouts.html';
const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
const TONES = tonesOf(readFileSync('theme/beeson.css', 'utf8'));
const PDF = resolve('test/pages/figure.pdf');
const PDF_BYTES = new Uint8Array(readFileSync(PDF));
const PAIR = '<img class="for-dark" src="../../demo/figure-dark.png" alt="A figure, dark version">';

let browser;
let server;
before(async () => {
  browser = await launch({ offline: false });
  server = await serve('.');
});
after(async () => {
  await browser?.close();
  server?.close();
  rmSync(DECK, { force: true });
});

const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
const slideWith = (text) => readFileSync(LAYOUTS, 'utf8').split('<section').slice(1).findIndex((s) => s.includes(text));

async function load() {
  const page = await browser.newPage();
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=mac`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(LAYOUTS, 'utf8');
  const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
  assert.deepEqual(s.problems, []);
  if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
  return page;
}

async function choose(page, paths) {
  await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
  const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
  await page.send('DOM.setFileInputFiles', { files: paths, objectId: result.objectId });
}

const centerOf = (page, selector) =>
  page.evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width > 0); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

const waitText = (page, text) => page.waitFor(`window.BeesonEditor.render().includes(${JSON.stringify(text)})`, 30000);

async function undoRedo(page, before, after) {
  await undo(page);
  assert.equal(await render(page), before);
  await redo(page);
  assert.equal(await render(page), after);
}

function inScope(page, text) {
  const now = textProblems(text, THEME);
  for (const p of textProblems(page.source, THEME)) now.splice(now.indexOf(p), 1);
  assert.deepEqual(now, []);
}

// the bytes of the shown file of each image of the current slide with data-pdf, by its class
const RENDERS = `(async () => {
  const out = {};
  for (const img of document.querySelectorAll('.reveal section.present img[data-pdf]')) {
    const bytes = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
    out[img.className || 'none'] = { bytes: [...bytes], width: img.naturalWidth, height: img.naturalHeight };
  }
  return out;
})()`;

// the color of the pixel of a render at the fractions x and y of its size, as #rrggbb and alpha
async function pixel(page, bytes, x, y) {
  return page.evaluate(`(async () => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(${JSON.stringify(bytes)})], { type: 'image/png' }));
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const [r, g, b, a] = ctx.getImageData(Math.floor(${x} * bitmap.width), Math.floor(${y} * bitmap.height), 1, 1).data;
    return { hex: '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''), a };
  })()`);
}

test('a PDF inserted into an empty figure box is a render for each mode, in the tones of the mode', async () => {
  const page = await load();
  await exec(page, 'slide.new.split');
  await frames(page);
  const before = await render(page);
  assert.equal(before.split('<div class="figure-box"></div>').length, 2);
  const chosen = exec(page, 'insert.file');
  await choose(page, [PDF]);
  await chosen;
  await waitText(page, 'data-pdf="media/figure.pdf"');
  const text = await render(page);
  assert.match(text, /<div class="figure-box">\s*<img class="for-dark" src="media\/figure-dark\.png" data-pdf="media\/figure\.pdf">\s*<img class="for-light" src="media\/figure-light\.png" data-pdf="media\/figure\.pdf">\s*<\/div>/);
  assert.equal(text.replace(/<div class="figure-box">[\s\S]*?<\/div>/g, ''), before.replace(/<div class="figure-box">[\s\S]*?<\/div>/g, ''));
  await undoRedo(page, before, text);
  inScope(page, text);

  const renders = await page.evaluate(RENDERS);
  assert.deepEqual(Object.keys(renders).sort(), ['for-dark', 'for-light']);
  for (const [cls, mode] of [['for-dark', 'dark'], ['for-light', 'light']]) {
    const { bytes, width, height } = renders[cls];
    // page 1 is 400 by 200 pt, fitted into 3840 by 2160 px
    assert.deepEqual([width, height], [3840, 1920]);
    assert.equal(hashOf(new Uint8Array(bytes)), renderHash(PDF_BYTES, 1, mode, TONES[mode]));
    // the white of the page is the background of the mode, and the black line its text
    assert.deepEqual(await pixel(page, bytes, 0.02, 0.05), { hex: TONES[mode].bg, a: 255 });
    assert.deepEqual(await pixel(page, bytes, 0.5, 0.5), { hex: TONES[mode].text, a: 255 });
  }
  assert.deepEqual(errors(page), []);
  await page.close();
});

test('the page of a PDF figure and Match the Mode render the PDF again', async () => {
  const page = await load();
  await exec(page, 'slide.new.split');
  await frames(page);
  const chosen = exec(page, 'insert.file');
  await choose(page, [PDF]);
  await chosen;
  await waitText(page, 'data-pdf="media/figure.pdf"');
  await frames(page);
  await click(page, await centerOf(page, '.reveal section.present img[data-pdf]'));
  await frames(page);
  const pair = await render(page);

  // page 2 of the PDF, drawn on a transparent page
  await exec(page, 'media.pdfPage', { page: 2 });
  await waitText(page, 'data-page="2"');
  const second = await render(page);
  assert.match(second, /<img class="for-dark" src="media\/figure-page-2-dark\.png" data-pdf="media\/figure\.pdf" data-page="2">\s*<img class="for-light" src="media\/figure-page-2-light\.png" data-pdf="media\/figure\.pdf" data-page="2">/);
  await undoRedo(page, pair, second);
  const renders = await page.evaluate(RENDERS);
  assert.equal((await pixel(page, renders['for-dark'].bytes, 0.02, 0.05)).a, 0);
  // the box of page 2 is blue, a hue that is kept in the dark mode
  const blue = (await pixel(page, renders['for-light'].bytes, 0.5, 0.5)).hex;
  assert.ok(parseInt(blue.slice(5, 7), 16) > parseInt(blue.slice(1, 3), 16), blue);

  // a page past the last one is refused, and the text is kept
  await assert.rejects(exec(page, 'media.pdfPage', { page: 3 }), /the PDF has 2 pages/);
  assert.equal(await render(page), second);

  // Match the Mode off: one image in the colors of the PDF, shown in both modes
  assert.equal((await state(page, 'media.matchMode')).checked, true);
  await exec(page, 'media.matchMode');
  await page.waitFor(`!window.BeesonEditor.render().includes('for-light" src="media/figure-page-2')`, 30000);
  const own = await render(page);
  assert.match(own, /<div class="figure-box">\s*<img src="media\/figure-page-2\.png" data-pdf="media\/figure\.pdf" data-page="2">\s*<\/div>/);
  await undoRedo(page, second, own);
  const single = await page.evaluate(RENDERS);
  assert.deepEqual(Object.keys(single), ['none']);
  assert.equal(hashOf(new Uint8Array(single.none.bytes)), renderHash(PDF_BYTES, 2, null, null));
  // in the colors of the PDF, a transparent page is white, as in a PDF viewer
  assert.deepEqual(await pixel(page, single.none.bytes, 0.02, 0.05), { hex: '#ffffff', a: 255 });
  assert.equal((await state(page, 'media.matchMode')).checked, false);

  // and on again: a render for each mode
  await exec(page, 'media.matchMode');
  await waitText(page, 'class="for-light"');
  assert.match(await render(page), /<img class="for-dark" src="media\/figure-page-2-dark-2\.png" data-pdf="media\/figure\.pdf" data-page="2">\s*<img class="for-light" src="media\/figure-page-2-light-2\.png" data-pdf="media\/figure\.pdf" data-page="2">/);
  inScope(page, await render(page));
  assert.deepEqual(errors(page), []);
  await page.close();
});

// a deck of pictures with a step, written next to test/pages/figure.pdf, for the edits of a
// picture that the layouts deck does not have
const DECK = 'test/pages/pdf-figures.tmp.html';
const STEP = '<img class="fragment fade-up" src="../../demo/figure-light.png" style="width: 600px; rotate: 5deg" data-fragment-index="2" alt="A plot">';
const VIDEOS = '<video class="for-dark fragment" src="../../demo/clip-dark.mp4" muted loop data-autoplay></video>\n  <video class="for-light fragment" src="../../demo/clip-light.mp4" muted loop data-autoplay></video>';
const WRITTEN = '<img class="for-dark" src="../../demo/figure-dark.png" data-pdf="figure.pdf" alt="A plot">\n  <img class="for-light" src="../../demo/figure-light.png" data-pdf="figure.pdf" alt="A plot">';
function writeDeck() {
  const layouts = readFileSync(LAYOUTS, 'utf8');
  const head = layouts.slice(0, layouts.indexOf('<div class="slides">') + '<div class="slides">'.length);
  const tail = layouts.slice(layouts.lastIndexOf('</div>\n</div>'));
  const slide = (title, body) => `<section>\n  <h2>${title}</h2>\n  <figure class="figure-box">\n  ${body}\n  </figure>\n</section>\n`;
  writeFileSync(DECK, `${head}\n${slide('A step', STEP)}${slide('A video pair', VIDEOS)}${slide('A PDF figure', WRITTEN)}${tail}`);
}

async function deckPage(title) {
  const page = await browser.newPage();
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=mac`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(DECK, 'utf8');
  assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`)).problems, []);
  if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
  await showSlide(page, title);
  return page;
}

const showSlide = async (page, title) => {
  await page.evaluate(`(() => { const s = [...document.querySelectorAll('.reveal .slides > section')].find((e) => e.querySelector('h2')?.textContent === ${JSON.stringify(title)}); Reveal.slide(Reveal.getIndices(s).h); })()`);
  await frames(page);
};

// the tag of each picture of the current slide, by its mode
const tagsOf = (text, title) => {
  const slide = text.split('<section').find((s) => s.includes(`<h2>${title}</h2>`));
  return slide.match(/<(img|video)\b[^>]*>/g);
};

test('a picture with a step replaced with a PDF is a pair whose new image keeps the step, the place, and the alt', async () => {
  writeDeck();
  const page = await deckPage('A step');
  try {
    await click(page, await centerOf(page, '.reveal section.present figure img'));
    await frames(page);
    const replaced = exec(page, 'media.replace');
    await choose(page, [PDF]);
    await replaced;
    await waitText(page, 'class="for-light');
    const tags = tagsOf(await render(page), 'A step');
    assert.equal(tags.length, 2, tags.join('\n'));
    for (const [tag, mode] of [[tags[0], 'dark'], [tags[1], 'light']]) {
      assert.match(tag, new RegExp(`class="[^"]*\\bfor-${mode}\\b`), tag);
      for (const part of [/\bfragment\b/, /\bfade-up\b/, /data-fragment-index="2"/, /width: 600px/, /rotate: 5deg/, /alt="A plot"/, /data-pdf="media\/figure\.pdf"/]) assert.match(tag, part, tag);
    }
    inScope(page, await render(page));
    assert.deepEqual(errors(page), []);
  } finally {
    await page.close();
  }
});

test('a video of a pair replaced with a PDF is a pair of renders that keeps the step, and the other video is taken off', async () => {
  writeDeck();
  const page = await deckPage('A video pair');
  try {
    await click(page, await centerOf(page, '.reveal section.present figure video'));
    await frames(page);
    const replaced = exec(page, 'media.replace');
    await choose(page, [PDF]);
    await replaced;
    await waitText(page, 'data-pdf="media/figure.pdf"');
    const tags = tagsOf(await render(page), 'A video pair');
    assert.equal(tags.length, 2, tags.join('\n'));
    assert.match(tags[0], /^<img class="for-dark fragment" src="media\/figure-dark\.png" data-pdf="media\/figure\.pdf">$/);
    assert.match(tags[1], /^<img class="for-light fragment" src="media\/figure-light\.png" data-pdf="media\/figure\.pdf">$/);
    assert.deepEqual(errors(page), []);
  } finally {
    await page.close();
  }
});

test('in a deck opened from a file, the PDF of a figure is chosen once and read again for the next render', async () => {
  writeDeck();
  const page = await editorPage(browser, { deck: DECK, query: 'edit&still&edit-platform=mac', page: { width: 1440, height: 900 }, clear: true });
  try {
    assert.equal(await page.evaluate('location.protocol'), 'file:');
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await showSlide(page, 'A PDF figure');
    await click(page, await centerOf(page, '.reveal section.present figure img'));
    await frames(page);
    const ASK = 'dialog.beeson-edit-dialog.beeson-poster-ask[open]';
    const second = exec(page, 'media.pdfPage', { page: 2 });
    await page.waitFor(`!!document.querySelector(${JSON.stringify(ASK)})`, 10000);
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
    await click(page, `${ASK} button.primary`);
    await choose(page, [PDF]);
    await second;
    await waitText(page, 'data-page="2"');
    const first = exec(page, 'media.pdfPage', { page: 1 });
    await page.waitFor(`!window.BeesonEditor.render().includes('data-page="2"') || !!document.querySelector(${JSON.stringify(ASK)})`, 30000);
    assert.equal(await page.evaluate(`!!document.querySelector(${JSON.stringify(ASK)})`), false);
    await first;
    assert.match(await render(page), /<img class="for-dark" src="media\/figure-dark\.png" data-pdf="figure\.pdf" alt="A plot">/);
    assert.deepEqual(errors(page), []);
  } finally {
    await page.close();
  }
});

test('an image of a pair replaced with a PDF is a PDF figure, with the alt of each image kept', async () => {
  const page = await load();
  await page.evaluate(`Reveal.slide(${slideWith('<figure class="figure-box fragment"')})`);
  await frames(page);
  await click(page, await centerOf(page, '.reveal section.present figure.figure-box > img'));
  await frames(page);
  const replaced = exec(page, 'media.replace');
  await choose(page, [PDF]);
  await replaced;
  await waitText(page, 'data-pdf="media/figure.pdf"');
  const text = await render(page);
  const dark = PAIR.replace('src="../../demo/figure-dark.png"', 'src="media/figure-dark.png"').replace('>', ' data-pdf="media/figure.pdf">');
  const light = '<img class="for-light" src="media/figure-light.png" alt="A figure, light version" data-pdf="media/figure.pdf">';
  assert.equal(text, page.source.replace(PAIR, dark).replace('<img class="for-light" src="../../demo/figure-light.png" alt="A figure, light version">', light));
  await undoRedo(page, page.source, text);
  inScope(page, text);
  assert.deepEqual(errors(page), []);
  await page.close();
});
