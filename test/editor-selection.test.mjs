// the selection on the canvas, driven with trusted input: a click on the border of a block or on a
// figure selects it, Shift and the command modifier add and remove, a marquee and Select All select
// several elements, Esc, Return, and Tab move between the states, a drag of several elements and a
// resize by a handle are one entry of the history each, and a press on the chrome keeps the
// selection

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { byteExact, center, click, clickText, drag, editorPage, press, saveAndReopen, selectFigure, type } from './helpers/editor.mjs';
import { serve } from '../scripts/webdriver.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// the slide of the demo deck with a paragraph and a figure in a figure box
async function figureSlide(page) {
  await page.evaluate(`(() => { const img = document.querySelector('.reveal .slides section .figure-box > img'); Reveal.slide(Reveal.getIndices(img.closest('section')).h); })()`);
  await sleep(200);
}

// the boxes of the solid frames shown, in CSS pixels of the viewport
const shownFrames = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-frame.selected')].filter((f) => !f.hidden && f.getBoundingClientRect().width).map((f) => { const r = f.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })`);
// the box of the first shown element matched by selector. a figure that holds a picture is framed at
// the picture, i.e. at the image or video fitted into it with object-fit contain, and also at its
// caption while the figure itself is selected
const boxOf = (page, selector) => page.evaluate(`(() => {
  let el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width);
  const caps = el.matches('figure, .figure-box, .plate') && window.BeesonEditor.selection().includes(el) ? [...el.querySelectorAll(':scope > figcaption, :scope > .caption')].map((c) => c.getBoundingClientRect()).filter((c) => c.width) : [];
  const out = (b) => ({ left: Math.min(b.left, ...caps.map((c) => c.left)), top: Math.min(b.top, ...caps.map((c) => c.top)), right: Math.max(b.right, ...caps.map((c) => c.right)), bottom: Math.max(b.bottom, ...caps.map((c) => c.bottom)) });
  const pic = el.matches('figure, .figure-box, .plate') ? [...el.querySelectorAll(':scope > img, :scope > video')].find((m) => m.getBoundingClientRect().width) : null;
  el = pic ?? el;
  const r = el.getBoundingClientRect();
  const [w, h] = el instanceof HTMLImageElement ? [el.naturalWidth, el.naturalHeight] : el instanceof HTMLVideoElement ? [el.videoWidth, el.videoHeight] : [0, 0];
  const fit = getComputedStyle(el).objectFit;
  if (!w || !h || (fit !== 'contain' && fit !== 'scale-down')) return out({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const s = Math.min(r.width / w, r.height / h, fit === 'scale-down' ? 1 : Infinity);
  const [px, py] = getComputedStyle(el).objectPosition.split(/\\s+/).map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
  const left = r.left + (r.width - w * s) * px, top = r.top + (r.height - h * s) * py;
  return out({ left, top, right: left + w * s, bottom: top + h * s });
})()`);
// whether frame is drawn around box, 0 to 8 px outside it
const around = (frame, box) => ['left', 'top'].every((k) => box[k] - frame[k] >= -1 && box[k] - frame[k] <= 9) && ['right', 'bottom'].every((k) => frame[k] - box[k] >= -1 && frame[k] - box[k] <= 9);

test('a click on a button of the status bar keeps the selected figure', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  await figureSlide(page);
  await clickText(page, '.reveal section.present .figure-box > img');
  const figureBox = await boxOf(page, '.reveal section.present .figure-box');
  assert.ok((await shownFrames(page)).some((f) => around(f, figureBox)), 'the figure is not selected by a click');
  const steps = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-bottom button')].find((b) => b.textContent === 'Steps'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await clickText(page, steps);
  // the pane of the steps narrows the slide, hence the figure is measured again
  await sleep(100);
  const after = await boxOf(page, '.reveal section.present .figure-box');
  assert.ok((await shownFrames(page)).some((f) => around(f, after)), 'the selection is cleared by a click on Steps');
  assert.deepEqual(page.errors, []);
});

test('during a drag of a figure, the solid frame is on the figure and not on the block selected before', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  await figureSlide(page);
  // the paragraph is selected as a block, by a click into it and Esc
  await page.evaluate(`document.querySelector('.reveal section.present p').focus()`);
  await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
  const p = await boxOf(page, '.reveal section.present p');
  assert.ok((await shownFrames(page)).some((f) => around(f, p)), 'the paragraph is not selected');
  await drag(page, '.reveal section.present .figure-box > img', { dx: 40, dy: 30, modifiers: 'Alt', hold: true });
  const figureBox = await boxOf(page, '.reveal section.present .figure-box');
  const frames = await shownFrames(page);
  assert.equal(frames.some((f) => around(f, p)), false, 'the frame is left on the paragraph during the drag');
  assert.ok(frames.some((f) => around(f, figureBox)), 'the dragged figure does not have a frame');
  assert.deepEqual(page.errors, []);
});

const P = '.reveal section.present > p';
const FIGURE_BOX = '.reveal section.present .figure-box';
const IMG = '.reveal section.present .figure-box > img';
// the selectors whose element has a solid frame, among those given
async function framed(page, selectors) {
  const frames = await shownFrames(page);
  const out = [];
  for (const s of selectors) {
    const box = await boxOf(page, s);
    if (frames.some((f) => around(f, box))) out.push(s);
  }
  return out;
}
const caretIn = (page, selector) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const s = getSelection(); return document.activeElement === el && !!s.rangeCount && el.contains(s.anchorNode); })()`);
// a point in the empty margin left of the paragraph, in CSS pixels of the viewport
const margin = async (page) => {
  const p = await boxOf(page, P);
  return { x: p.left - 60, y: p.top + 4 };
};

for (const platform of ['mac', 'other']) {
  const query = `edit&still&edit-platform=${platform}`;

  test(`${platform}: a click on the border of a paragraph selects it without a caret, and a click into it puts the caret there`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await editorPage(browser, { query });
    await figureSlide(page);
    const p = await boxOf(page, P);
    await clickText(page, { x: p.right + 3, y: (p.top + p.bottom) / 2 });
    assert.deepEqual(await framed(page, [P]), [P], 'the paragraph is not selected by a click on its border');
    assert.equal(await caretIn(page, P), false, 'a click on the border puts a caret into the paragraph');
    await clickText(page, P);
    assert.equal(await caretIn(page, P), true, 'a click into the paragraph does not put the caret there');
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: Shift-click adds an element and removes it again, and a marquee selects the elements it touches`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await editorPage(browser, { query });
    await figureSlide(page);
    const p = await boxOf(page, P);
    await clickText(page, { x: p.right + 3, y: (p.top + p.bottom) / 2 });
    await click(page, IMG, { modifiers: 'Shift' });
    assert.deepEqual(await framed(page, [P, FIGURE_BOX]), [P, FIGURE_BOX], 'Shift-click does not add the figure');
    await click(page, IMG, { modifiers: 'Shift' });
    assert.deepEqual(await framed(page, [P, FIGURE_BOX]), [P], 'a second Shift-click does not remove the figure');
    await click(page, IMG, { modifiers: 'Mod' });
    assert.deepEqual(await framed(page, [P, FIGURE_BOX]), [P, FIGURE_BOX], 'the command modifier does not add the figure');
    // a marquee from the margin to the list touches the paragraph and the list, not the heading
    await clickText(page, await margin(page));
    assert.equal((await shownFrames(page)).length, 0, 'a click on an empty point keeps the selection');
    const ul = await boxOf(page, '.reveal section.present > ul');
    const from = await margin(page);
    await drag(page, from, { dx: p.left + 40 - from.x, dy: ul.top + 10 - from.y });
    assert.deepEqual(await framed(page, ['.reveal section.present > h2', P, '.reveal section.present > ul', FIGURE_BOX]), [P, '.reveal section.present > ul']);
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: Select All selects every movable element of the slide, and Esc goes from a text to its block to nothing`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await editorPage(browser, { query });
    await figureSlide(page);
    const all = ['h2', 'p', 'ul', '.figure-box'].map((s) => `.reveal section.present > ${s}`);
    await clickText(page, await margin(page));
    await press(page, 'Mod+A');
    assert.deepEqual(await framed(page, all), all, `${platform === 'mac' ? '⌘A' : 'Ctrl+A'} does not select every element`);
    await clickText(page, P);
    assert.equal(await caretIn(page, P), true);
    await press(page, 'Escape');
    assert.equal(await caretIn(page, P), false, 'Esc does not leave the text');
    assert.deepEqual(await framed(page, all), [P], 'Esc does not select the block of the text');
    await press(page, 'Escape');
    assert.equal((await shownFrames(page)).length, 0, 'a second Esc does not clear the selection');
    assert.deepEqual(page.errors, []);
  });
}

test('Return enters the text of a selected block, Tab walks the elements, and a click on a toolbar button keeps the selection', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  await figureSlide(page);
  const [h2, p, ul] = ['h2', 'p', 'ul'].map((s) => `.reveal section.present > ${s}`);
  await clickText(page, await margin(page));
  await press(page, 'Tab');
  assert.deepEqual(await framed(page, [h2, p, ul]), [h2], 'Tab does not select the first element');
  await press(page, 'Tab');
  assert.deepEqual(await framed(page, [h2, p, ul]), [p], 'Tab does not select the next element');
  await press(page, 'Shift+Tab');
  assert.deepEqual(await framed(page, [h2, p, ul]), [h2], 'Shift+Tab does not select the element before');
  await press(page, 'Tab');
  const autosave = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-header button')].find((b) => b.textContent === 'Autosave').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await clickText(page, autosave);
  assert.deepEqual(await framed(page, [h2, p, ul]), [p], 'a click on Autosave clears the selection');
  await press(page, 'Enter');
  assert.equal(await caretIn(page, p), true, 'Return does not put the caret into the paragraph');
  assert.deepEqual(page.errors, []);
});

// the translate of the elements, in slide pixels, as written in their style
const translates = (page, selectors) => page.evaluate(`${JSON.stringify(selectors)}.map((s) => [...document.querySelectorAll(s)].find((el) => el.getBoundingClientRect().width).style.translate)`);

test('a drag of two elements writes two translate declarations, undone as one entry', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  // Alt is the free modifier of a drag on Windows and Linux, and the copy modifier on a Mac
  const page = await editorPage(browser, { query: 'edit&still&edit-platform=other' });
  await figureSlide(page);
  const p = await boxOf(page, P);
  // the figure, selected apart from its image, and the paragraph added by its band
  await selectFigure(page, IMG);
  await click(page, { x: p.right + 3, y: (p.top + p.bottom) / 2 }, { modifiers: 'Shift' });
  await drag(page, IMG, { dx: -30, dy: 40, modifiers: 'Alt' });
  const [tp, tz] = await translates(page, [P, FIGURE_BOX]);
  assert.match(tp, /^-?\d+px \d+px$/);
  assert.equal(tp, tz, 'the two elements are not moved by the same offset');
  const text = await page.evaluate('window.BeesonEditor.render()');
  assert.ok(text.includes(`<p style="translate: ${tp}">Export`), 'the translate of the paragraph is not written');
  assert.ok(text.includes(`<figure class="figure-box" style="translate: ${tz}">`), 'the translate of the figure is not written');
  await page.evaluate('window.BeesonEditor.undo()');
  assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source, 'one undo does not undo the drag of both');
  assert.deepEqual(page.errors, []);
});

const QR = '.reveal section.present .qr';
const layouts = (browser, options = {}) => editorPage(browser, { deck: 'test/pages/editor-layouts.html', ...options });

for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 800 }]) {
  test(`${size.width}×${size.height}: a corner drag of an image keeps its aspect and writes width, and the readout shows the size`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await editorPage(browser, { page: size });
    await figureSlide(page);
    await clickText(page, IMG);
    await clickText(page, IMG);
    const img = await boxOf(page, '.reveal section.present .figure-box > img');
    const before = await page.evaluate(`(() => { const img = [...document.querySelectorAll(${JSON.stringify(IMG)})].find((el) => el.getBoundingClientRect().width); return img.naturalWidth / img.naturalHeight; })()`);
    await drag(page, '.beeson-grip[data-handle="se"]', { dx: -80, dy: -10, modifiers: 'Meta', hold: true });
    const readout = await page.evaluate(`(() => { const o = document.querySelector('.beeson-offset'); return o && !o.hidden && getComputedStyle(o).display !== 'none' ? o.textContent : null; })()`);
    assert.match(readout ?? '', /^w: \d+ px {2}h: \d+ px$/, 'the readout does not show the width and height');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 0, y: 0, button: 'left', clickCount: 1 });
    const width = await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(IMG)})].find((el) => el.getBoundingClientRect().width).style.width`);
    assert.match(width, /^\d+px$/, 'the width is not written');
    const after = await boxOf(page, '.beeson-frame.selected:not([hidden])');
    const ratio = (after.right - after.left) / (after.bottom - after.top);
    assert.ok(Math.abs(ratio - before) / before < 0.03, `the aspect ${ratio} is not kept at ${before}`);
    assert.ok(after.right - after.left < img.right - img.left, 'the image is not made smaller');
    assert.deepEqual(page.errors, []);
  });

  test(`${size.width}×${size.height}: a drag of the left handle of a QR code writes width and translate, undone together`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await layouts(browser, { page: size });
    // the closing slide, whose QR code theme/beeson.css places in the lower right corner
    await page.evaluate('Reveal.slide(15)');
    await sleep(200);
    await clickText(page, QR);
    const before = await boxOf(page, QR);
    await drag(page, '.beeson-grip[data-handle="w"]', { dx: -40, modifiers: 'Meta' });
    const [style, box] = [await page.evaluate(`document.querySelector(${JSON.stringify(QR)}).getAttribute('style')`), await boxOf(page, QR)];
    assert.match(style ?? '', /width: \d+px/, 'the width is not written');
    // the code is placed from the right and the bottom, hence its middle is kept by a translate down
    assert.match(style ?? '', /translate: 0px [1-9]\d*px/, 'the translate is not written');
    assert.ok(Math.abs(box.right - before.right) < 2, 'the right edge does not stay');
    assert.ok(box.left < before.left - 30, 'the left edge does not follow the handle');
    await page.evaluate('window.BeesonEditor.undo()');
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(QR)}).getAttribute('style') ?? ''`), '', 'one undo does not undo the width and the translate');
    assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
    assert.deepEqual(page.errors, []);
  });

  for (const platform of ['mac', 'other']) {
    test(`${size.width}×${size.height}, ${platform}: a drag snaps the left edge to x = 1200, and not with the free modifier`, async (t) => {
      const browser = await launch();
      t.after(() => browser.close());
      const page = await editorPage(browser, { query: `edit&still&edit-platform=${platform}`, page: size });
      await figureSlide(page);
      const scale = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); return s.getBoundingClientRect().width / s.offsetWidth; })()`);
      const p = await boxOf(page, P);
      const left = (await page.evaluate(`document.querySelector(${JSON.stringify(P)}).offsetLeft`));
      // the left edge is dragged to 3 slide px right of the guide at 1200, by the frame above the
      // grip e of the selected paragraph
      const dx = (1203 - left) * scale;
      const at = { x: p.right + 3, y: p.top + (p.bottom - p.top) / 5 };
      await drag(page, at, { dx });
      const snapped = await translates(page, [P]);
      assert.equal(parseFloat(snapped[0]) + left, 1200, `the left edge is not snapped to 1200: ${snapped[0]}`);
      await page.evaluate('window.BeesonEditor.undo()');
      await drag(page, at, { dx, modifiers: platform === 'mac' ? 'Meta' : 'Alt' });
      const free = await translates(page, [P]);
      assert.ok(Math.abs(parseFloat(free[0]) + left - 1203) <= 1, `the free drag is snapped: ${free[0]}`);
      assert.deepEqual(page.errors, []);
    });
  }
}

test('the width of a resized QR code is written into the file', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await layouts(browser);
  await clickText(page, QR);
  await drag(page, '.beeson-grip[data-handle="nw"]', { dx: -40, dy: -40, modifiers: 'Meta' });
  const width = await page.evaluate(`document.querySelector(${JSON.stringify(QR)}).style.width`);
  assert.ok((await page.evaluate('window.BeesonEditor.render()')).includes(`width: ${width}`));
});

// regression tests of R17.5 on both platforms. a group selected with other objects keeps the grips
// of its frame, which resize it as they do with the group alone (N24). a Shift-click on a figure
// while the caret is in a text selects the block of the caret with the figure (N26). every grip of
// a turned figure at the edge of the slide can be pressed at the Fit zoom (requirement 1a, N1)
describe('grips of a group selected with others', () => {
  const DECK = 'test-deck.html';
  // the index of the figures slide in index.html
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const PLATFORMS = ['mac', 'other'];

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

  const js = (v) => JSON.stringify(v);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const names = (page) => page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)');

  const PANEL = '#beeson-edit-panel-format';
  async function typeField(page, id, value) {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === 'Arrange')?.click()`);
    await frames(page);
    await page.evaluate(`(() => { const i = document.querySelector('#beeson-edit-num-${id}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
    await frames(page);
  }

  async function load(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${FIGURES})`);
    await frames(page);
    return page;
  }

  // a point inside the first line of a block of the current slide, in CSS px
  const blockAt = (page, selector) => page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; })()`);

  // the shown grips, each with its handle, whether it is a grip of a group, and its center in CSS px
  const grips = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-grip')].filter((g) => !g.hidden && g.getClientRects().length).map((g) => { const r = g.getBoundingClientRect(); return { handle: g.dataset.handle, group: !!g.dataset.group, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })`);

  async function groupOnFigures(page, platform) {
    await clickText(page, IMG);
    await click(page, await blockAt(page, ':scope > p'), { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    await frames(page);
  }

  // a drag of the grip g by dx, dy in CSS px in eight steps, released
  async function dragGrip(page, g, dx, dy) {
    await mouse(page, 'mouseMoved', g.x, g.y);
    await mouse(page, 'mousePressed', g.x, g.y, { button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 8; i++) await mouse(page, 'mouseMoved', g.x + (dx * i) / 8, g.y + (dy * i) / 8, { button: 'left', buttons: 1 });
    await frames(page);
    await mouse(page, 'mouseReleased', g.x + dx, g.y + dy, { button: 'left', clickCount: 1 });
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    // N24: the group of the figure and the paragraph, Shift-clicked with the heading, was drawn as a
    // frame without grips, while the heading kept its own
    test(`a group selected with another object keeps the eight grips of its frame (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupOnFigures(page, platform);
      const alone = (await grips(page)).filter((g) => g.group);
      assert.equal(alone.length, 8, `the grips of the group alone are ${js(alone)}`);
      await click(page, await blockAt(page, ':scope > h2'), { modifiers: 'Shift' });
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 3);
      const all = await grips(page);
      const group = all.filter((g) => g.group);
      assert.equal(group.length, 8, `the grips of the group with the heading are ${js(all)}`);
      for (const g of group) {
        const was = alone.find((a) => a.handle === g.handle);
        assert.ok(Math.hypot(g.x - was.x, g.y - was.y) < 1.5, `the grip ${g.handle} is at ${js(g)}, and at ${js(was)} with the group alone`);
      }
      assert.ok(all.some((g) => !g.group), `the heading lost its grips: ${js(all)}`);
      assert.deepEqual(errors(page), []);
    });

    test(`a grip of a group selected with another object resizes the group as with the group alone (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupOnFigures(page, platform);
      const grouped = await render(page);
      const se = (await grips(page)).find((g) => g.group && g.handle === 'se');
      await dragGrip(page, se, -80, -60);
      const alone = await render(page);
      assert.notEqual(alone, grouped, 'the grip of the group alone did not resize it');
      await undo(page);
      assert.equal(await render(page), grouped);
      await click(page, await blockAt(page, ':scope > h2'), { modifiers: 'Shift' });
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 3);
      const h2 = await page.evaluate(`Reveal.getCurrentSlide().querySelector(':scope > h2').outerHTML`);
      const g = (await grips(page)).find((x) => x.group && x.handle === 'se');
      assert.ok(g, 'the group selected with the heading does not have a grip se');
      await dragGrip(page, g, -80, -60);
      const edited = await render(page);
      assert.equal(edited, alone, 'the group selected with the heading was resized otherwise than alone');
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelector(':scope > h2').outerHTML`), h2, 'the heading was changed');
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 3, 'the selection was changed by the resize');
      await undo(page);
      assert.equal(await render(page), grouped);
      await redo(page);
      assert.equal(await render(page), edited);
      const { text } = await saveAndReopen(page, `r17-5-group-grip-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(errors(page), []);
    });

    // N26: with the caret in the heading, a Shift-click on the figure selected the figure alone
    for (const modifiers of ['Shift', 'Mod']) {
      test(`a ${modifiers}-click on a figure with the caret in a text selects the block of the caret with the figure (${platform})`, async (t) => {
        const page = await load(t, platform);
        await clickText(page, await blockAt(page, ':scope > h2'));
        await frames(page);
        assert.equal(await page.evaluate(`document.activeElement === Reveal.getCurrentSlide().querySelector(':scope > h2')`), true, 'the caret is not in the heading');
        await clickText(page, IMG, { modifiers });
        await frames(page);
        assert.deepEqual((await names(page)).sort(), ['figure', 'h2'], 'the heading is not selected with the figure');
        assert.equal(await page.evaluate(`!!window.getSelection().rangeCount && Reveal.getCurrentSlide().querySelector(':scope > h2').contains(window.getSelection().anchorNode)`), false, 'the caret is left in the heading');
        assert.equal(await render(page), page.source);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`a Shift-click on the text of the caret selects its block alone (${platform})`, async (t) => {
      const page = await load(t, platform);
      const at = await blockAt(page, ':scope > h2');
      await clickText(page, at);
      await click(page, at, { modifiers: 'Shift' });
      await frames(page);
      assert.deepEqual(await names(page), ['h2']);
      assert.deepEqual(errors(page), []);
    });

    // requirement 1a and N1: at 30 degrees the grip ne of the figure was drawn under the inspector,
    // past the edge of the canvas, which did not scroll at Fit
    test(`every grip of a figure turned by 30 degrees can be pressed at the Fit zoom (${platform})`, async (t) => {
      const page = await load(t, platform);
      const slideBox = () => page.evaluate(`(() => { const r = document.querySelector('.reveal .slides').getBoundingClientRect(); return [r.left, r.top, r.width]; })()`);
      const rest = await slideBox();
      await clickText(page, IMG);
      await typeField(page, 'angle', 30);
      assert.deepEqual(await slideBox(), rest, 'the slide moved when the canvas was given room for the grips');
      assert.equal(await page.evaluate('window.BeesonEditorShell.stage.zoom'), null, 'the zoom is not Fit');
      const first = await grips(page);
      assert.equal(first.length, 8);
      const covered = await page.evaluate(`(() => { const v = window.BeesonEditorShell.stage.viewport; return ${js(first)}.filter((g) => g.x > v.right || g.x < v.left || g.y > v.bottom || g.y < v.top).map((g) => g.handle); })()`);
      assert.ok(covered.length > 0, 'every grip lies inside the canvas, hence the case of N1 is not set up');
      // each grip is brought into the canvas by a scroll of the canvas, as a trackpad scrolls it,
      // and must then be the element under its center
      for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        await page.evaluate(`(() => {
        const el = window.BeesonEditorShell.stage.el;
        const g = document.querySelector('.beeson-grip[data-handle=${handle}]:not([hidden])');
        const v = window.BeesonEditorShell.stage.viewport;
        const r = g.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        el.scrollLeft += x > v.right - 12 ? x - v.right + 24 : x < v.left + 12 ? x - v.left - 24 : 0;
        el.scrollTop += y > v.bottom - 12 ? y - v.bottom + 24 : y < v.top + 12 ? y - v.top - 24 : 0;
      })()`);
        await frames(page);
        const hit = await page.evaluate(`(() => {
        const g = document.querySelector('.beeson-grip[data-handle=${handle}]:not([hidden])');
        const r = g.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        return { x, y, top: document.elementFromPoint(x, y) === g, under: document.elementFromPoint(x, y)?.className };
      })()`);
        assert.ok(hit.top, `the grip ${handle} at ${js(hit)} cannot be pressed`);
      }
      // a drag of the grip ne, which was under the inspector, resizes the figure
      const ne = (await grips(page)).find((g) => g.handle === 'ne');
      const last = await render(page);
      await dragGrip(page, ne, -30, 20);
      assert.notEqual(await render(page), last, 'the grip ne did not resize the figure');
      await undo(page);
      assert.equal(await render(page), last);
      // with the selection cleared, the room is taken off and the slide is drawn at Fit again
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection()'), []);
      assert.deepEqual(await slideBox(), rest, 'the slide is not drawn at Fit after the selection is cleared');
      assert.equal(await page.evaluate('(() => { const el = window.BeesonEditorShell.stage.el; return el.scrollWidth - el.clientWidth; })()'), 0);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of #184 with trusted input. the cursor over a text element is the move cursor
// wherever a press selects or drags it as a box, and the I-beam only where a press puts the caret,
// also right after a click under a pointer that is not moved. the handle of a table at the right
// of a list stays at the table while the pointer crosses the list on its way to the handle
describe('the move cursor and the I-beam', () => {
  const DECK = 'test/pages/editor-184.html';

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

  const js = (v) => JSON.stringify(v);
  const settle = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');

  async function load(t, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=mac`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(DECK, 'utf8'))})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await page.waitFor(`Reveal.getIndices().h === ${slide}`);
    await settle(page);
    return page;
  }

  const move = (page, { x, y }) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  const cursorAt = (page, { x, y }) => page.evaluate(`getComputedStyle(document.elementFromPoint(${x}, ${y})).cursor`);
  // the cursor at the point p after a click there, read without a pointer move
  async function clicked(page, p) {
    await click(page, p);
    await settle(page);
    return cursorAt(page, p);
  }
  // a point in the words of the first element of the current slide matched by selector
  const words = (page, selector) => center(page, `.reveal section.present ${selector}`);
  // a click on an empty point of the slide, which takes the caret out and clears the selection
  async function clear(page) {
    await click(page, await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 30 }; })()`));
    await settle(page);
    assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 0, 'the selection is not cleared');
  }

  test('the cursor over a text element is the move cursor where a press selects or drags it as a box', async (t) => {
    const page = await load(t, 0);
    const plain = await words(page, 'p.plain');
    await move(page, plain);
    await settle(page);
    assert.equal(await cursorAt(page, plain), 'move', 'a paragraph that is not selected');
    assert.equal(await clicked(page, plain), 'move', 'a paragraph selected by a click, which a press drags');
    assert.equal(await clicked(page, plain), 'text', 'the paragraph with the caret');

    const first = await words(page, 'ul.items li:first-child');
    const second = await words(page, 'ul.items li:last-child');
    await move(page, first);
    await settle(page);
    assert.equal(await cursorAt(page, first), 'move', 'a list that is not selected, while another text has the caret');
    assert.equal(await clicked(page, first), 'move', 'a list selected by a click');
    assert.equal(await clicked(page, first), 'text', 'the item with the caret');
    await move(page, second);
    await settle(page);
    assert.equal(await cursorAt(page, second), 'text', 'another item of the list with the caret');
    await move(page, plain);
    await settle(page);
    assert.equal(await cursorAt(page, plain), 'move', 'another paragraph while a list has the caret');

    const cell = await words(page, 'td');
    await move(page, cell);
    await settle(page);
    assert.equal(await cursorAt(page, cell), 'text', 'a cell, which takes the caret at the first click');

    await clear(page);
    const held = await words(page, 'p.held');
    await move(page, held);
    await settle(page);
    assert.equal(await cursorAt(page, held), 'default', 'a locked paragraph that is not selected');
    assert.equal(await clicked(page, held), 'text', 'the words of a selected locked paragraph');

    await clear(page);
    const member = await words(page, 'p.member');
    await move(page, member);
    await settle(page);
    assert.equal(await cursorAt(page, member), 'move', 'a member of a group that is not selected');
    assert.equal(await clicked(page, member), 'move', 'a member of the selected group');
    assert.equal(await clicked(page, member), 'move', 'the member selected inside its group');
    assert.equal(await clicked(page, member), 'text', 'the member with the caret');

    await clear(page);
    const shape = await words(page, '.shape p');
    await move(page, shape);
    await settle(page);
    assert.equal(await cursorAt(page, shape), 'move', 'the words of a shape that is not selected');
    assert.equal(await clicked(page, shape), 'move', 'the words of the selected shape');
    assert.equal(await clicked(page, shape), 'text', 'the words of the shape with the caret');
    assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
  });

  // the center of the handle, or null where the handle is hidden
  const handle = (page) => page.evaluate(`(() => { const h = document.querySelector('.beeson-overlay .beeson-handle'); if (h.hidden) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);

  // the pointer moved in steps from a cell of the table to the handle, with the handle read at each step
  async function toHandle(page) {
    const from = await words(page, 'td');
    await move(page, from);
    await settle(page);
    const to = await handle(page);
    assert.ok(to, 'the table does not show its handle');
    const table = await page.evaluate(`Reveal.getCurrentSlide().querySelector('table').getBoundingClientRect().left`);
    assert.ok(to.x < table, 'the handle is not left of the table');
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
      await move(page, p);
      await settle(page);
      assert.deepEqual(await handle(page), to, `the handle moved away at step ${i} of the way, at ${js(p)}`);
    }
    return to;
  }

  test('the handle of a table stays reachable over a list on the way to it', async (t) => {
    const page = await load(t, 1);
    const ul = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector('ul').getBoundingClientRect(); return { left: r.left, right: r.right }; })()`);
    const table = await page.evaluate(`Reveal.getCurrentSlide().querySelector('table').getBoundingClientRect().left`);
    assert.ok(ul.right > table, 'the list does not reach under the left of the table');
    const to = await toHandle(page);
    assert.ok(to.x > ul.left + 30, 'the handle is not over the list');
    // a few pixels left of the handle, the list under the pointer is hovered
    await move(page, { x: to.x - 25, y: to.y });
    await settle(page);
    assert.notDeepEqual(await handle(page), to, 'the list left of the handle is not hovered');

    // the same with the caret in a cell of the table
    await click(page, await words(page, 'td'));
    await settle(page);
    assert.equal(await page.evaluate(`!!document.activeElement.closest('td')`), true, 'the cell does not take the caret');
    await toHandle(page);
    assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
  });
});

// regression tests of R45, two defects found by the last review of the editor. on a Mac, a press
// with Ctrl is a secondary click, which opens the context menu and does not move the element under
// it at a slip of the pointer. an undo asked for while a change is still made, e.g. while a dropped
// picture is sized, takes this change, and not the entry before it
describe('a Ctrl press on a Mac, undo mid-drop', () => {
  const DECK = 'test/pages/editor-r8-5.html';
  // the slide of the deck with one image in a figure box
  const FIGURE_BOX_ONE = 1;
  const IMG = '.reveal section.present img';

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

  const js = (v) => JSON.stringify(v);
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

  async function load(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(DECK, 'utf8'))})`)).problems, []);
    await page.evaluate(`Reveal.slide(${FIGURE_BOX_ONE})`);
    await frames(page);
    return page;
  }

  test('on a Mac, a press with Ctrl and a slip of the pointer on a figure does not move it', async (t) => {
    const page = await load(t, 'mac');
    const source = await render(page);
    const label = await undoLabel(page);
    // the slip is away from the menu, which Chrome on a Mac opens at the press, to the lower right
    await drag(page, IMG, { dx: -6, dy: -4, steps: 3, modifiers: 'Ctrl' });
    await frames(page);
    await press(page, 'Escape');
    await frames(page);
    assert.equal(await undoLabel(page), label, 'the press is an entry of the history');
    assert.equal(await render(page), source, 'the figure is moved');
    assert.deepEqual(errors(page), []);
  });

  test('an undo asked for while a dropped picture is added takes the picture, and not the entry before it', async (t) => {
    const page = await load(t, 'mac');
    await click(page, IMG);
    await frames(page);
    await exec(page, 'arrange.lock');
    await frames(page);
    const locked = await render(page);
    assert.match(locked, /data-locked/);
    // an undo at the first turn in which the picture is in the text of the deck
    await page.evaluate(`(() => {
    window.__undone = new Promise((done) => {
      const look = () => (window.BeesonEditor.render().includes('media/clip-dark.png') ? done(Promise.resolve(window.BeesonEditor.undo()).then(() => true)) : setTimeout(look, 0));
      look();
    });
    return true;
  })()`);
    const at = await page.evaluate(`(() => { const r = document.querySelector(${js(IMG)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const data = { items: [], files: [resolve('demo/clip-dark.png')], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await page.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
    await page.evaluate('window.__undone');
    await frames(page);
    assert.equal(await render(page), locked, 'the undo does not give the file from before the drop');
    await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
    await frames(page);
    const again = await render(page);
    assert.ok(again.includes('media/clip-dark.png') && again.includes('data-locked'), 'a redo does not add the picture again');
    assert.deepEqual(errors(page), []);
  });
});

// the frames of the selection of #184. a selected element, a selected group, the text element of
// the caret, and an entered group are framed with a white line in a dark halo, which is seen on dark
// and light slides, and the grips are white in a gray ring. the hover frame is a faint solid line
describe('frames of the selection on dark and light', () => {
  const DECK = 'test/pages/editor-184-frames.html';

  let browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  const settle = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');

  async function load(t, theme = 'dark') {
    const page = await editorPage(browser, { deck: DECK, query: `edit&still&theme=${theme}&edit-platform=mac`, page: { width: 1600, height: 1000 }, clear: true });
    t.after(() => page.close().catch(() => {}));
    await settle(page);
    return page;
  }

  const at = (page, selector) => center(page, `.reveal section.present ${selector}`);
  const move = (page, { x, y }) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  async function pick(page, selector, modifiers = '') {
    await click(page, await at(page, selector), { modifiers });
    await settle(page);
  }
  async function clear(page) {
    await page.evaluate(`window.BeesonEditor.exec('selection.clear').then(() => true)`);
    await settle(page);
  }

  // the look of each shown part of the overlay matched by selector
  const looks = (page, selector) => page.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].filter((d) => !d.hidden && d.getClientRects().length).map((d) => {
  const s = getComputedStyle(d);
  return { width: s.borderTopWidth, style: s.borderTopStyle, color: s.borderTopColor, shadow: s.boxShadow, opacity: s.opacity, background: s.backgroundColor, size: d.getBoundingClientRect().width };
})`);

  const WHITE = 'rgb(255, 255, 255)';
  const HALO = 'rgba(0, 0, 0, 0.55)';
  const RING = 'rgb(68, 68, 68)';

  function assertWhite(frames, what, style = 'solid') {
    assert.ok(frames.length > 0, `${what} is not framed`);
    for (const f of frames) {
      assert.equal(f.width, '1px', `${what}: the width of the frame`);
      assert.equal(f.style, style, `${what}: the style of the frame`);
      assert.equal(f.color, WHITE, `${what}: the color of the frame`);
      assert.equal(f.shadow.split(HALO).length, 3, `${what}: the halo outside and inside the frame, ${f.shadow}`);
      assert.match(f.shadow, /inset/, `${what}: the halo inside the frame`);
      assert.equal(f.opacity, '1', `${what}: the opacity of the frame`);
    }
  }

  function assertGrips(grips, what) {
    assert.ok(grips.length > 0, `${what} does not have grips`);
    for (const g of grips) {
      assert.equal(g.width, '1px', `${what}: the ring of a grip`);
      assert.equal(g.color, RING, `${what}: the color of the ring of a grip`);
      assert.equal(g.background, WHITE, `${what}: the fill of a grip`);
      assert.equal(Math.round(g.size), 11, `${what}: the size of a grip`);
    }
  }

  for (const theme of ['dark', 'light']) {
    test(`the selection is framed in white with a dark halo on a ${theme} slide`, async (t) => {
      const page = await load(t, theme);
      await pick(page, 'p.plain');
      await pick(page, '.shape.loose', 'Shift');
      assertWhite(await looks(page, '.beeson-overlay .beeson-frame.selected'), 'a text element and a shape');
      assertGrips(await looks(page, '.beeson-overlay .beeson-grip'), 'a text element and a shape');
      const rotor = await looks(page, '.beeson-overlay .beeson-rotor');
      assert.equal(rotor.length, 1, 'the rotate handle is not shown');
      assert.equal(rotor[0].color, RING, 'the ring of the rotate handle');
      assert.equal(rotor[0].width, '1px', 'the width of the ring of the rotate handle');

      await clear(page);
      await pick(page, '.shape.m1');
      assertWhite(await looks(page, '.beeson-overlay .beeson-frame.union'), 'a group');
      await pick(page, '.shape.m1');
      // the white dashes of an entered group are drawn over a dark band, which shows between them
      const entered = await page.evaluate(`[...document.querySelectorAll('.beeson-overlay .beeson-frame.entered')].filter((d) => !d.hidden).map((d) => { const s = getComputedStyle(d); return [s.borderTopWidth, s.borderTopColor, s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset, s.opacity]; })`);
      assert.deepEqual(entered, [['3px', HALO, 'dashed', '1px', WHITE, '-2px', '1']], 'the frame of an entered group');
      assertWhite(await looks(page, '.beeson-overlay .beeson-frame.selected'), 'a member of an entered group');

      await clear(page);
      await pick(page, 'svg.line');
      const ends = await looks(page, '.beeson-line-end');
      assert.ok(ends.length > 0, 'the ends of the line are not shown');
      for (const e of ends) assert.equal(e.color, RING, 'the ring of an end of a line');
      assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
    });
  }

  test('the text with the caret has one white frame, and the hover frame is a faint solid line', async (t) => {
    const page = await load(t);
    await pick(page, 'p.plain');
    await pick(page, 'p.plain');
    assert.equal(await page.evaluate(`document.activeElement.matches('p.plain')`), true, 'the paragraph does not have the caret');
    const outline = await page.evaluate(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle === 'none' || /rgba\\(.*, 0\\)|transparent/.test(s.outlineColor); })()`);
    assert.equal(outline, true, 'the text with the caret has an outline besides its frame');
    assertWhite(await looks(page, '.beeson-overlay .beeson-frame.selected'), 'the text with the caret');

    await move(page, await at(page, '.shape.loose'));
    await settle(page);
    const hover = await looks(page, '.beeson-overlay .beeson-frame:not(.selected, .union, .entered)');
    assert.equal(hover.length, 1, 'the hover frame is not shown');
    assert.equal(hover[0].style, 'solid', 'the style of the hover frame');
    assert.equal(hover[0].width, '1px', 'the width of the hover frame');
    assert.equal(hover[0].opacity, '0.3', 'the opacity of the hover frame');

    // the hover outline of a text is a faint solid line as well
    await move(page, await at(page, 'p.held'));
    await settle(page);
    const hovered = await page.evaluate(`getComputedStyle(document.querySelector('.reveal section.present p.held')).outlineStyle`);
    assert.equal(hovered, 'solid', 'the hover outline of a text');

    // the handle is highlighted in the color of the text of the editor
    await clear(page);
    await move(page, await at(page, 'p.plain'));
    await settle(page);
    const handle = await page.evaluate(`(() => { const r = document.querySelector('.beeson-overlay .beeson-handle:not([hidden])').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await move(page, handle);
    await settle(page);
    const colors = await page.evaluate(`(() => { const h = document.querySelector('.beeson-overlay .beeson-handle:not([hidden])'); return { border: getComputedStyle(h).borderTopColor, text: getComputedStyle(h).color }; })()`);
    assert.equal(colors.border, colors.text, 'the border of the handle under the pointer');
    assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
  });

  // the padlocks of the selection, each with its label, its place, whether it is drawn closed, and
  // its center
  const padlocks = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-overlay .beeson-lock')].filter((d) => !d.hidden).map((d) => {
  const r = d.getBoundingClientRect(), s = getComputedStyle(d);
  return { label: d.getAttribute('aria-label'), title: d.title, left: r.left, top: r.top, width: r.width, closed: s.backgroundColor === s.borderTopColor || s.backgroundColor === getComputedStyle(document.querySelector('.beeson-overlay .beeson-handle')).color, x: r.left + r.width / 2, y: r.top + r.height / 2 };
})`);
  const box = (page, selector) => page.evaluate(`(() => { const r = document.querySelector('.reveal section.present ${selector}').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })()`);
  const locked = (page, selector) => page.evaluate(`[...document.querySelectorAll('.reveal section.present ${selector}')].map((el) => el.hasAttribute('data-locked'))`);
  const selection = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.classList[0] === 'shape' ? [...el.classList].slice(0, 3).join(' ') : el.classList[0] ?? el.localName)`);
  const shownGrips = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-overlay .beeson-grip')].filter((g) => !g.hidden).length`);
  const undo = async (page) => { await page.evaluate('window.BeesonEditor.undo()'); await settle(page); };
  const redo = async (page) => { await page.evaluate('window.BeesonEditor.redo()'); await settle(page); };

  test('a padlock left of each frame locks and unlocks its element, as one entry of the history', async (t) => {
    const page = await load(t);
    await pick(page, 'p.plain');
    let locks = await padlocks(page);
    assert.equal(locks.length, 1, 'a selected paragraph does not have one padlock');
    assert.equal(locks[0].label, 'Lock');
    assert.equal(locks[0].title, 'Lock');
    assert.equal(locks[0].closed, false, 'the padlock of an element that is not locked is drawn closed');
    assert.equal(Math.round(locks[0].width), 22, 'the size of the padlock');
    // in the column of the handle, a row under it
    const p = await box(page, 'p.plain');
    assert.ok(Math.abs(locks[0].left - (p.left - 6 - 10 - 22)) <= 1, `the padlock is not in the column of the handle: ${locks[0].left} for a paragraph at ${p.left}`);
    assert.ok(Math.abs(locks[0].top - (p.top - 6 + 23)) <= 1, `the padlock is not a row under the handle: ${locks[0].top} for a paragraph at ${p.top}`);

    await click(page, locks[0]);
    await settle(page);
    assert.deepEqual(await locked(page, 'p.plain'), [true], 'the padlock does not lock the paragraph');
    assert.deepEqual(await selection(page), ['plain'], 'the selection is not kept');
    locks = await padlocks(page);
    assert.equal(locks.length, 1);
    assert.equal(locks[0].label, 'Unlock');
    assert.equal(locks[0].closed, true, 'the padlock of a locked element is drawn open');
    assert.equal(await shownGrips(page), 0, 'a locked element has grips');
    assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-grip.locked').length`), 0, 'the crosses of a locked element are drawn');
    const frame = await looks(page, '.beeson-overlay .beeson-frame.selected');
    assert.equal(frame[0].opacity, '0.45', 'the opacity of the frame of a locked element');
    await undo(page);
    await byteExact(page);
    await redo(page);
    assert.deepEqual(await locked(page, 'p.plain'), [true], 'a redo does not lock the paragraph again');
    await click(page, (await padlocks(page))[0]);
    await settle(page);
    assert.deepEqual(await locked(page, 'p.plain'), [false], 'the padlock does not unlock the paragraph');
    await undo(page);
    await undo(page);
    await byteExact(page);

    // the keys press the padlock as they press the handle
    await clear(page);
    await pick(page, 'p.plain');
    await page.evaluate(`document.querySelector('.beeson-overlay .beeson-lock:not([hidden])').focus()`);
    await press(page, 'Enter');
    await settle(page);
    assert.deepEqual(await locked(page, 'p.plain'), [true], 'Enter on the padlock does not lock the paragraph');
    await page.evaluate(`document.querySelector('.beeson-overlay .beeson-lock:not([hidden])').focus()`);
    await press(page, 'Space');
    await settle(page);
    assert.deepEqual(await locked(page, 'p.plain'), [false], 'Space on the padlock does not unlock the paragraph');
    await undo(page);
    await undo(page);
    await byteExact(page);

    // the text element with the caret has a padlock as well
    await clear(page);
    await pick(page, 'p.plain');
    await pick(page, 'p.plain');
    assert.equal(await page.evaluate(`document.activeElement.matches('p.plain')`), true, 'the paragraph does not have the caret');
    assert.equal((await padlocks(page)).length, 1, 'the text element of the caret does not have a padlock');
    assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
  });

  test('a group has one padlock, and each frame of a multiple selection has its own', async (t) => {
    const page = await load(t);
    await pick(page, '.shape.m1');
    let locks = await padlocks(page);
    assert.equal(locks.length, 1, 'a selected group does not have one padlock');
    const m1 = await box(page, '.shape.m1');
    assert.ok(Math.abs(locks[0].top - (m1.top - 6)) <= 1, 'the padlock of a group is not at the top of its frame');
    await click(page, locks[0]);
    await settle(page);
    assert.deepEqual(await locked(page, '.shape[data-group]'), [true, true, true], 'the padlock does not lock the group');
    assert.equal((await selection(page)).length, 3, 'the group is not kept selected');
    assert.equal((await padlocks(page))[0].label, 'Unlock');
    await undo(page);
    await byteExact(page);

    await clear(page);
    await pick(page, 'p.plain');
    await pick(page, '.shape.loose', 'Shift');
    locks = await padlocks(page);
    assert.equal(locks.length, 2, 'a text element and a shape do not have a padlock each');
    await click(page, locks[1]);
    await settle(page);
    assert.deepEqual([...(await locked(page, 'p.plain')), ...(await locked(page, '.shape.loose'))], [false, true], 'a padlock of a multiple selection locks another element than its own');
    assert.equal((await selection(page)).length, 2, 'the selection is not kept');
    await undo(page);
    await byteExact(page);

    // the padlocks are hidden in a drag
    await clear(page);
    await pick(page, '.shape.loose');
    assert.equal((await padlocks(page)).length, 1);
    await drag(page, await at(page, '.shape.loose'), { dx: 60, dy: 30, hold: true });
    assert.equal((await padlocks(page)).length, 0, 'a padlock is shown during a drag');
    const end = await at(page, '.shape.loose');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', clickCount: 1 });
    await settle(page);
    assert.equal((await padlocks(page)).length, 1, 'the padlock is not shown again after the drag');
    assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
  });

  test('on a phone, a tap on the padlock locks the selected element', { timeout: 120000 }, async (t) => {
    const page = await editorPage(browser, { deck: DECK, query: 'edit&still', page: { width: 390, height: 844, mobile: true }, clear: true });
    t.after(() => page.close().catch(() => {}));
    await page.evaluate('new Promise((d) => setTimeout(() => d(true), 500))');
    const tap = async (p) => {
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await tap(await at(page, '.shape.loose'));
    await page.waitFor(`window.BeesonEditor.selection().some((el) => el.matches('.shape.loose'))`);
    await page.waitFor(`[...document.querySelectorAll('.beeson-overlay .beeson-lock')].some((d) => !d.hidden)`);
    // a second tap within the time of a double tap would be a double tap
    await page.evaluate('new Promise((d) => setTimeout(() => d(true), 600))');
    await tap((await padlocks(page))[0]);
    await page.waitFor(`document.querySelector('.reveal section.present .shape.loose').hasAttribute('data-locked')`);
    assert.deepEqual(await selection(page), ['shape rounded loose'], 'the selection is not kept');
    assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
  });

  // the group button of the selection, with its label, whether it is drawn filled, its place, and its
  // center, or null where it is not drawn
  const grouping = (page) => page.evaluate(`(() => {
  const d = [...document.querySelectorAll('.beeson-overlay .beeson-grouping')].find((d) => !d.hidden);
  if (!d) return null;
  const r = d.getBoundingClientRect();
  return { label: d.getAttribute('aria-label'), title: d.title, filled: d.classList.contains('filled'), left: r.left, top: r.top, x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
  const groupsOf = (page, selector) => page.evaluate(`[...document.querySelectorAll('.reveal section.present ${selector}')].map((el) => el.getAttribute('data-group'))`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  async function press1(page, button) {
    await click(page, button);
    await settle(page);
  }

  test('the group button ungroups a selected group, and groups two elements or two groups', async (t) => {
    const page = await load(t);
    await pick(page, '.shape.m1');
    let b = await grouping(page);
    assert.ok(b, 'a selected group does not have a group button');
    assert.deepEqual([b.label, b.title, b.filled], ['Ungroup', 'Ungroup', true]);
    const lock = (await padlocks(page))[0];
    assert.ok(Math.abs(b.left - lock.left) <= 1 && Math.abs(b.top - (lock.top + 23)) <= 1, 'the group button is not under the padlock');
    await press1(page, b);
    assert.deepEqual(await groupsOf(page, '.shape.m1, .shape.m2, .shape.m3'), [null, null, null], 'the group is not taken apart');
    assert.equal((await selection(page)).length, 3, 'the former members are not selected');
    b = await grouping(page);
    assert.deepEqual([b?.label, b?.filled], ['Group', false], 'the former members are not offered Group');
    await undo(page);
    await byteExact(page);
    await redo(page);
    assert.deepEqual(await groupsOf(page, '.shape.m1'), [null], 'a redo does not ungroup');
    await undo(page);
    await byteExact(page);

    // two elements
    await clear(page);
    await pick(page, 'p.plain');
    await pick(page, '.shape.loose', 'Shift');
    b = await grouping(page);
    assert.deepEqual([b?.label, b?.filled], ['Group', false], 'two elements are not offered Group');
    const p = await box(page, 'p.plain'), loose = await box(page, '.shape.loose');
    assert.ok(Math.abs(b.left - (Math.min(p.left, loose.left) - 6 - 10 - 22)) <= 1, 'the group button is not in the column of the selection');
    assert.ok(Math.abs(b.top - (Math.min(p.top, loose.top) - 6 - 23)) <= 1, 'the group button is not a row above the selection');
    await press1(page, b);
    const [one, two] = [...(await groupsOf(page, 'p.plain')), ...(await groupsOf(page, '.shape.loose'))];
    assert.ok(one && one === two, 'the two elements are not grouped');
    assert.equal((await grouping(page))?.label, 'Ungroup', 'the new group is not offered Ungroup');
    await undo(page);
    await byteExact(page);

    // two groups
    await clear(page);
    await pick(page, '.shape.m1');
    await pick(page, 'p.pair', 'Shift');
    assert.equal((await grouping(page))?.label, 'Group', 'two groups are not offered Group');
    // one element by itself has no group button
    await clear(page);
    await pick(page, 'p.plain');
    assert.equal(await grouping(page), null, 'one element has a group button');
    assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
  });

  test('the group button adds elements to a group, and takes members out of an entered group', async (t) => {
    const page = await load(t);
    await pick(page, '.shape.m1');
    await pick(page, '.shape.loose', 'Shift');
    let b = await grouping(page);
    assert.deepEqual([b?.label, b?.filled], ['Add to Group', false], 'a group and an element are not offered Add to Group');
    await press1(page, b);
    assert.deepEqual(await groupsOf(page, '.shape.loose'), ['g1'], 'the element is not added to the group');
    assert.equal((await selection(page)).length, 4, 'the whole group is not selected');
    assert.equal((await grouping(page))?.label, 'Ungroup');
    await undo(page);
    await byteExact(page);
    await redo(page);
    assert.deepEqual(await groupsOf(page, '.shape.loose'), ['g1'], 'a redo does not add the element');
    await undo(page);
    await byteExact(page);

    // a member taken out of its entered group stays selected, outside the group
    await clear(page);
    await pick(page, '.shape.m1');
    await pick(page, '.shape.m1');
    b = await grouping(page);
    assert.deepEqual([b?.label, b?.filled], ['Take out of Group', true], 'a member of an entered group is not offered Take out of Group');
    const lock = (await padlocks(page))[0];
    assert.ok(Math.abs(b.left - lock.left) <= 1 && Math.abs(b.top - (lock.top + 23)) <= 1, 'the group button is not under the padlock');
    await press1(page, b);
    assert.deepEqual(await groupsOf(page, '.shape.m1, .shape.m2, .shape.m3'), [null, 'g1', 'g1'], 'the member is not taken out of the group');
    assert.deepEqual(await selection(page), ['shape ellipse m1'], 'the member is not kept selected');
    assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-overlay .beeson-frame.entered')].some((d) => !d.hidden)`), false, 'the group is not left');
    await undo(page);
    await byteExact(page);

    // a group left with one member is dissolved, in the same entry
    await clear(page);
    await pick(page, 'p.pair');
    await pick(page, 'p.pair');
    assert.equal((await grouping(page))?.label, 'Take out of Group');
    await press1(page, await grouping(page));
    assert.deepEqual(await groupsOf(page, 'p.pair'), [null, null], 'the group of one member is not dissolved');
    await undo(page);
    await byteExact(page);
    await redo(page);
    assert.deepEqual(await groupsOf(page, 'p.pair'), [null, null], 'a redo does not dissolve the group');
    await undo(page);
    await byteExact(page);
    assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
  });

  for (const id of ['element.delete', 'edit.cut']) {
    test(`a group left with one member by ${id} is dissolved, in the same entry of the history`, async (t) => {
      const page = await load(t);
      await pick(page, 'p.pair');
      await pick(page, 'p.pair');
      assert.equal((await selection(page)).length, 1, 'one member of the group is not selected');
      await page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}).then(() => true)`);
      await settle(page);
      assert.deepEqual(await groupsOf(page, 'p.pair'), [null], `the group of one member is not dissolved after ${id}`);
      assert.match(await render(page), /<p class="pair" style="width: 500px">A second paired paragraph<\/p>/);
      await undo(page);
      await byteExact(page);

      // a group of three left with two members is kept
      await clear(page);
      await pick(page, '.shape.m1');
      await pick(page, '.shape.m1');
      await page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}).then(() => true)`);
      await settle(page);
      assert.deepEqual(await groupsOf(page, '.shape[data-group], .shape.m2, .shape.m3'), ['g1', 'g1'], 'a group of two members is dissolved');
      await undo(page);
      await byteExact(page);
      assert.deepEqual(page.errors.filter((e) => !e.includes('favicon.ico')), []);
    });
  }
});

// the work of R20.7 on both platforms: nested groups, a selection inside a group, Select All with
// the lines of a slide, Regroup, the Object List as a tree of groups, the turns by 90 degrees, and
// the arrange items of the context menu with the bracket keys of Windows. each edit of the file is
// checked byte for byte, after an undo and a redo, and after a save and an open
describe('nested groups, Regroup, and the group tree', () => {
  const DECK = 'test/pages/editor-r20-7.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const PLATFORMS = ['mac', 'other'];
  const OBJECTS = '.beeson-edit-objects';
  const ROW = `${OBJECTS} .row`;
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };
  const GROUP_KEY = { mac: 'Mod+Alt+G', other: 'Mod+G' };
  const UNGROUP_KEY = { mac: 'Mod+Alt+Shift+G', other: 'Mod+Shift+G' };
  const REGROUP_KEY = { mac: 'Mod+Alt+J', other: 'Mod+Shift+J' };

  const A = 'section.present img[alt="A first figure"]';
  const B = 'section.present img[alt="A second figure"]';
  const C = 'section.present img[alt="A third figure"]';
  const FIG_A = '<figure class="figure-box" data-group="g1">';
  const FIG_B = '<figure class="figure-box" data-group="g1" style="translate: -300px 100px">';
  const PARA = '<p>A paragraph beside the figures</p>';
  // the first slide with the figures A and B in g1 inside g2, and the paragraph in g2
  const NESTED = SOURCE.replace(FIG_A, '<figure class="figure-box" data-group="g2 g1">')
    .replace(FIG_B, '<figure class="figure-box" data-group="g2 g1" style="translate: -300px 100px">')
    .replace(PARA, '<p data-group="g2">A paragraph beside the figures</p>');

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

  const js = (v) => JSON.stringify(v);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const near = (a, b, by = 2) => Math.abs(a - b) <= by;
  // the selected elements, each as its tag with the alt text of its image, sorted
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName + (el.querySelector('img') ? ':' + el.querySelector('img').alt : '')).sort()`);
  // the upper left corner in slide px of the element of selector
  const boxOf = (page, selector) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides').getBoundingClientRect(), k = s.width / 1920;
  const r = document.querySelector(${js(selector)}).getBoundingClientRect();
  return { left: (r.left - s.left) / k, top: (r.top - s.top) / k };
})()`);
  const shownFrames = (page, selector) => page.evaluate(`[...document.querySelectorAll(${js(selector)})].filter((f) => !f.hidden && f.getBoundingClientRect().width > 0).length`);

  async function load(t, platform, text = SOURCE, n = 0) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear(); true');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // text opened again in the editor of page at slide n, e.g. the source after a save and an open,
  // after which the history is empty
  async function reopen(page, text, n) {
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    page.source = text;
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
  }

  // the text is changed from before by an entry named label, one undo gives before and one redo
  // the edit byte for byte, and the saved text is opened again as it was
  async function checkEdit(page, label, before, name) {
    const edited = await render(page);
    assert.notEqual(edited, before, `${label} did not change the text`);
    assert.equal((await state(page, 'edit.undo')).label, `Undo ${label}`);
    await undo(page);
    assert.equal(await render(page), before);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
    return edited;
  }

  // a click with Shift on the paragraph of the current slide
  async function shiftParagraph(page) {
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
  }

  // the figures A and B in g1 inside g2 with the paragraph, made by Group as in NESTED, with the
  // rendered text as the source of the page
  async function nest(page, platform) {
    await clickText(page, A);
    await shiftParagraph(page);
    await press(page, GROUP_KEY[platform]);
    await frames(page);
    page.source = await render(page);
    assert.equal(page.source, NESTED);
    await empty(page);
  }

  // the three figures of the first slide made one group without nesting
  async function three(page, platform) {
    await clickText(page, A);
    await press(page, UNGROUP_KEY[platform]);
    await empty(page);
    await clickText(page, A);
    await click(page, B, { modifiers: 'Shift' });
    await click(page, C, { modifiers: 'Shift' });
    await press(page, GROUP_KEY[platform]);
    await frames(page);
    page.source = await render(page);
    assert.equal(page.source.match(/data-group="g2"/g)?.length, 3);
    await empty(page);
  }

  // a copy event and a paste event of what it put on a clipboard of the page, as the browser sends
  // them for the keys of the system, since the clipboard of the system is shared with the other tests
  const copyPaste = (page) =>
    page.evaluate(`(() => {
    const data = new DataTransfer();
    const at = () => document.activeElement ?? document.body;
    at().dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    const back = new DataTransfer();
    for (const type of data.types) back.setData(type, data.getData(type));
    at().dispatchEvent(new ClipboardEvent('paste', { clipboardData: back, bubbles: true, cancelable: true }));
  })()`);

  // a click at the lower left of the slide, where nothing is drawn
  async function empty(page) {
    const at = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().getBoundingClientRect(); return { x: r.left + 30, y: r.bottom - 30 }; })()`);
    await clickText(page, at);
  }

  // Ctrl with ] or [, and Shift with shift, as Chrome sends the key on a US layout. press() of the
  // helpers does not know the brackets
  async function bracket(page, right, shift) {
    const key = right ? (shift ? '}' : ']') : shift ? '{' : '[';
    const base = { key, code: right ? 'BracketRight' : 'BracketLeft', windowsVirtualKeyCode: right ? 221 : 219, modifiers: 2 | (shift ? 8 : 0) };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await frames(page);
  }

  const menuRows = (page, level = 0) => page.evaluate(`[...([...document.querySelectorAll('.beeson-edit-menu')][${level}]?.querySelectorAll('.item') ?? [])].map((i) => i.querySelector('.label')?.textContent ?? '')`);
  async function hover(page, label, level = 0) {
    const at = await page.evaluate(`(() => { const i = [...[...document.querySelectorAll('.beeson-edit-menu')][${level}].querySelectorAll('.item')].find((x) => x.querySelector('.label').textContent === ${js(label)}); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await sleep(350);
  }
  // the rows of the Object List as their level and kind, e.g. '2 Group'
  const rows = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].map((r) => r.getAttribute('aria-level') + ' ' + r.querySelector('.name').textContent.split(':')[0])`);
  // the values of data-group in the text that are not on the originals of NESTED, in their order
  const copiedLists = async (page) => (await render(page)).match(/data-group="[^"]*"/g).filter((v) => v !== 'data-group="g2"' && v !== 'data-group="g2 g1"');

  for (const platform of PLATFORMS) {
    test(`Group of a group and a paragraph nests the group, Ungroup gives it back, and Regroup puts it together again (${platform})`, async (t) => {
      const page = await load(t, platform);
      assert.equal((await state(page, 'arrange.regroup')).enabled, false, 'Regroup is offered with nothing ungrouped');
      await clickText(page, A);
      await shiftParagraph(page);
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure', 'p']);
      await press(page, GROUP_KEY[platform]);
      await frames(page);
      assert.equal(await render(page), NESTED);
      await checkEdit(page, 'Group', SOURCE, `r20-7-group-${platform}.html`);

      await clickText(page, A);
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure', 'p']);
      await press(page, UNGROUP_KEY[platform]);
      await frames(page);
      assert.equal(await render(page), SOURCE, 'Ungroup of the outer group does not give back the inner group');
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure', 'p']);
      assert.equal(await shownFrames(page, '.beeson-frame.union.group'), 1, 'the inner group is not framed as one object');

      await empty(page);
      assert.equal((await state(page, 'arrange.regroup')).enabled, true);
      await press(page, REGROUP_KEY[platform]);
      await frames(page);
      assert.equal(await render(page), NESTED);
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure', 'p']);
      await checkEdit(page, 'Regroup', SOURCE, `r20-7-regroup-${platform}.html`);
      assert.equal((await state(page, 'arrange.regroup')).enabled, false, 'Regroup is offered on a group that is whole');
      assert.deepEqual(errors(page), []);
    });

    test(`a click enters a nested group one level at a time, and Esc goes up again (${platform})`, async (t) => {
      const page = await load(t, platform);
      await nest(page, platform);
      await clickText(page, A);
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure', 'p']);
      assert.equal(await shownFrames(page, '.beeson-frame.entered'), 0);
      await clickText(page, A);
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure'], 'the second click does not select the inner group');
      assert.equal(await shownFrames(page, '.beeson-frame.entered'), 1, 'the entered group is not drawn');
      await clickText(page, A);
      assert.deepEqual(await selected(page), ['figure:A first figure'], 'the third click does not select the member');
      await press(page, 'Escape');
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure']);
      await press(page, 'Escape');
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure', 'p']);
      assert.equal(await shownFrames(page, '.beeson-frame.entered'), 0);
      await press(page, 'Escape');
      assert.deepEqual(await selected(page), []);
      assert.equal(await render(page), NESTED);
      assert.deepEqual(errors(page), []);
    });

    test(`a Shift-click inside an entered group selects two of its three members, which Align Left aligns to each other (${platform})`, async (t) => {
      const page = await load(t, platform);
      await three(page, platform);
      const a0 = await boxOf(page, A), b0 = await boxOf(page, B), c0 = await boxOf(page, C);
      await clickText(page, A);
      await clickText(page, A);
      assert.deepEqual(await selected(page), ['figure:A first figure']);
      await click(page, B, { modifiers: 'Shift' });
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure'], 'the Shift-click selects the whole group');
      assert.equal(await shownFrames(page, '.beeson-frame.union.group'), 0, 'two members are framed as a group');
      await exec(page, 'arrange.alignTo.selection');
      await exec(page, 'arrange.align.left');
      await frames(page);
      const a = await boxOf(page, A), b = await boxOf(page, B), c = await boxOf(page, C);
      assert.ok(near(a.left, b0.left) && near(b.left, b0.left), `A and B are not at the left of their union: ${js({ a0, b0, a, b })}`);
      assert.ok(near(c.left, c0.left) && near(c.top, c0.top), 'the third member moved');
      assert.ok(near(a.top, a0.top) && near(b.top, b0.top));
      await checkEdit(page, 'Align Left', page.source, `r20-7-align-left-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });

    test(`a drag, Bring to Front, and Delete act on a member selected inside a nested group alone (${platform})`, async (t) => {
      const page = await load(t, platform);
      await nest(page, platform);
      const before = page.source;
      const b0 = await boxOf(page, B), c0 = await boxOf(page, C);
      await clickText(page, A);
      await clickText(page, A);
      await clickText(page, A);
      assert.deepEqual(await selected(page), ['figure:A first figure']);
      await drag(page, A, { dx: 40, dy: 30 });
      await frames(page);
      const dragged = await render(page);
      assert.notEqual(dragged, before, 'the drag does not move the member');
      const b = await boxOf(page, B), c = await boxOf(page, C);
      assert.ok(near(b.left, b0.left) && near(b.top, b0.top) && near(c.left, c0.left) && near(c.top, c0.top), 'the drag moves the other members');
      assert.deepEqual(await selected(page), ['figure:A first figure']);
      await undo(page);
      assert.equal(await render(page), before);

      // an undo keeps the member selected, and a click on it would select its picture
      assert.deepEqual(await selected(page), ['figure:A first figure']);
      await press(page, platform === 'mac' ? 'Mod+Shift+F' : 'Mod+Shift+ArrowUp');
      await frames(page);
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Bring to Front');
      const front = await render(page);
      assert.ok(front.indexOf('A second figure') < front.indexOf('A third figure') && front.indexOf('A third figure') < front.indexOf('A first figure'), front);
      assert.equal(front.match(/data-group="g2 g1"/g)?.length, 2, front);
      await undo(page);
      assert.equal(await render(page), before);

      assert.deepEqual(await selected(page), ['figure:A first figure']);
      await press(page, 'Backspace');
      await frames(page);
      const deleted = await render(page);
      assert.doesNotMatch(deleted, /A first figure/);
      // g1 is left with one member, and its name is taken off this member in the same entry
      assert.match(deleted, /<figure class="figure-box" data-group="g2" style="translate: -300px 100px">/);
      assert.match(deleted, /A third figure/);
      await undo(page);
      assert.equal(await render(page), before);
      assert.deepEqual(errors(page), []);
    });

    test(`in a group of two, Align Top aligns the members selected inside it to each other (${platform})`, async (t) => {
      const page = await load(t, platform);
      const a0 = await boxOf(page, A), b0 = await boxOf(page, B);
      await clickText(page, A);
      await clickText(page, A);
      await click(page, B, { modifiers: 'Shift' });
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure']);
      await exec(page, 'arrange.alignTo.selection');
      await exec(page, 'arrange.align.top');
      await frames(page);
      const a = await boxOf(page, A), b = await boxOf(page, B);
      assert.ok(near(a.top, a0.top) && near(b.top, a0.top), `A and B are not at the top of their union: ${js({ a0, b0, a, b })}`);
      assert.ok(near(a.left, a0.left) && near(b.left, b0.left));
      // a Shift-click on a selected member takes it off alone, and a click outside leaves the group
      await click(page, B, { modifiers: 'Shift' });
      assert.deepEqual(await selected(page), ['figure:A first figure']);
      await clickText(page, C);
      await clickText(page, A);
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure']);
      await checkEdit(page, 'Align Top', SOURCE, `r20-7-align-top-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });

    test(`Select All selects the lines of the slide, which Group, a drag, Delete, and Copy then take with the rest (${platform})`, async (t) => {
      const page = await load(t, platform, SOURCE, 2);
      await empty(page);
      await press(page, 'Mod+A');
      await frames(page);
      assert.deepEqual(await selected(page), ['figure:A figure at the arrow', 'h2', 'p', 'svg']);
      await press(page, GROUP_KEY[platform]);
      await frames(page);
      const grouped = await render(page);
      assert.equal((grouped.match(/data-group="g2"/g) ?? []).length, 4, 'the line is left out of the group');
      assert.match(grouped, /<svg class="line" width="300" height="1" style="translate: 600px 700px" data-group="g2">/);
      await checkEdit(page, 'Group', SOURCE, `r20-7-all-group-${platform}.html`);
      await reopen(page, SOURCE, 2);

      await empty(page);
      await press(page, 'Mod+A');
      const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
      await drag(page, p, { dx: 40, dy: 30 });
      await frames(page);
      assert.doesNotMatch(await render(page), /style="translate: 600px 700px"/, 'the drag left the line in place');
      await undo(page);
      assert.equal(await render(page), SOURCE);

      await empty(page);
      await press(page, 'Mod+A');
      await copyPaste(page);
      await frames(page);
      assert.equal((await render(page)).match(/<svg class="line"/g)?.length, 2, 'Copy and Paste leave the line out');
      await undo(page);
      assert.equal(await render(page), SOURCE);

      await empty(page);
      await press(page, 'Mod+A');
      await press(page, 'Backspace');
      await frames(page);
      assert.doesNotMatch(await render(page), /<svg class="line"/, 'Delete leaves the line');
      await undo(page);
      assert.equal(await render(page), SOURCE);
      assert.deepEqual(errors(page), []);
    });

    test(`Duplicate, Paste, and a copy by a drag give a nested group fresh names at every level (${platform})`, async (t) => {
      const page = await load(t, platform);
      await nest(page, platform);
      // the copies of the paragraph, A, and B, in this order: one outer name on all three, and one
      // inner name on A and B, each new
      const check = (lists, what) => {
        assert.equal(lists.length, 3, `${what}: ${lists}`);
        const [p, a, b] = lists.map((l) => l.slice(12, -1).split(' '));
        assert.equal(p.length, 1, `${what}: ${lists}`);
        assert.deepEqual(a, b, `${what}: ${lists}`);
        assert.equal(a.length, 2, `${what}: ${lists}`);
        assert.equal(a[0], p[0], `${what}: ${lists}`);
        assert.ok(!['g1', 'g2'].includes(a[0]) && !['g1', 'g2'].includes(a[1]) && a[0] !== a[1], `${what}: ${lists}`);
      };
      await clickText(page, A);
      await press(page, 'Mod+D');
      await frames(page);
      check(await copiedLists(page), 'Duplicate');
      await undo(page);
      assert.equal(await render(page), NESTED);
      // the undo selects the group again, and a click on it would enter it
      await empty(page);
      await clickText(page, A);
      await copyPaste(page);
      await frames(page);
      check(await copiedLists(page), 'Paste');
      await undo(page);
      assert.equal(await render(page), NESTED);
      await empty(page);
      await clickText(page, A);
      await drag(page, A, { dx: -40, dy: 200, modifiers: platform === 'mac' ? 'Alt' : 'Ctrl' });
      await frames(page);
      check(await copiedLists(page), 'a copy by a drag');
      assert.deepEqual(errors(page), []);
    });

    test(`the Object List shows a group inside a group as a row under its row, which folds (${platform})`, async (t) => {
      const page = await load(t, platform);
      await nest(page, platform);
      await press(page, LIST_KEY[platform]);
      await frames(page);
      const all = await rows(page);
      assert.deepEqual(all.filter((r) => !r.startsWith('1 ') || r === '1 Group'), ['1 Group', '2 Group', '3 Figure', '3 Figure', '2 Text'], `the rows: ${all}`);
      const inner = all.indexOf('2 Group');
      assert.equal(await page.evaluate(`!!document.querySelectorAll(${js(ROW)})[${inner}].querySelector('.twist svg')`), true, 'the inner group row does not have a chevron');
      await clickText(page, `${ROW}:nth-child(${inner + 1})`);
      assert.deepEqual(await selected(page), ['figure:A first figure', 'figure:A second figure']);
      await clickText(page, `${ROW}:nth-child(${inner + 1}) .twist`);
      assert.equal((await rows(page)).filter((r) => r.startsWith('3 ')).length, 0, 'the folded group shows its members');
      assert.equal(await render(page), NESTED);
      // the folded inner group is dragged as one row behind the paragraph, and its members keep their
      // order and their lists
      const box = (i) => page.evaluate(`(() => { const b = document.querySelectorAll(${js(ROW)})[${i}].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, bottom: b.bottom }; })()`);
      const folded = await rows(page);
      const from = await box(folded.indexOf('2 Group')), under = await box(folded.indexOf('2 Text'));
      await drag(page, from, { dy: under.bottom + 4 - from.y, steps: 8 });
      await frames(page);
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Reorder');
      const moved = await rows(page);
      assert.ok(moved.indexOf('2 Text') < moved.indexOf('2 Group'), `the rows after the drag: ${moved}`);
      const reordered = await render(page);
      assert.equal(reordered.match(/data-group="g2 g1"/g)?.length, 2, reordered);
      assert.ok(reordered.indexOf('A first figure') < reordered.indexOf('A second figure'), reordered);
      assert.deepEqual(errors(page), []);
    });

    test(`Rotate Right 90° and Rotate Left 90° turn a figure by a quarter turn as one entry each (${platform})`, async (t) => {
      const page = await load(t, platform, SOURCE, 1);
      await clickText(page, 'section.present img[alt="A turned figure"]');
      await exec(page, 'arrange.rotateRight');
      await frames(page);
      assert.equal(await render(page), SOURCE.replace('style="width: 200px; rotate: 30deg"', 'style="width: 200px; rotate: 120deg"'));
      await checkEdit(page, 'Rotate Right 90°', SOURCE, `r20-7-right-${platform}.html`);
      await reopen(page, SOURCE, 1);
      await clickText(page, 'section.present img[alt="A straight figure"]');
      await exec(page, 'arrange.rotateLeft');
      await frames(page);
      assert.match(await render(page), /<img style="width: 200px; rotate: 270deg" src="..\/..\/demo\/figure-dark.png" alt="A straight figure">/);
      await checkEdit(page, 'Rotate Left 90°', SOURCE, `r20-7-left-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });

    test(`the menu of an element holds the layer items, the turns, and the submenus Group, Align, and Distribute (${platform})`, async (t) => {
      const page = await load(t, platform, SOURCE, 1);
      await clickText(page, 'section.present img[alt="A turned figure"]');
      await click(page, 'section.present img[alt="A turned figure"]', { button: 'right' });
      await sleep(100);
      const labels = await menuRows(page);
      const at = (label) => {
        const i = labels.indexOf(label);
        assert.ok(i >= 0, `${label} is not in the menu: ${labels.join(', ')}`);
        return i;
      };
      assert.ok(at('Bring to Front') < at('Bring Forward') && at('Bring Forward') < at('Send Backward') && at('Send Backward') < at('Send to Back'), labels.join(', '));
      at('Rotate Left 90°');
      at('Rotate Right 90°');
      // on one figure, none of Group, Ungroup, and Regroup can run, hence their submenu is dimmed
      const dimmed = (label) => page.evaluate(`[...document.querySelector('.beeson-edit-menu').querySelectorAll('.item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)})?.getAttribute('aria-disabled')`);
      assert.equal(await dimmed('Group'), 'true', 'the submenu Group is offered on one figure');
      await page.evaluate('window.BeesonEditorShell.closeMenus()');
      await click(page, 'section.present img[alt="A straight figure"]', { modifiers: 'Shift' });
      await click(page, 'section.present img[alt="A turned figure"]', { button: 'right' });
      await sleep(100);
      assert.notEqual(await dimmed('Group'), 'true', 'the submenu Group is dimmed on two figures');
      await hover(page, 'Group');
      assert.deepEqual(await menuRows(page, 1), ['Group', 'Ungroup', 'Regroup']);
      await hover(page, 'Align');
      assert.deepEqual((await menuRows(page, 1)).slice(0, 6), ['Align Left', 'Align Center', 'Align Right', 'Align Top', 'Align Middle', 'Align Bottom']);
      // two figures are not distributed, hence the submenu opens once a third element is selected
      assert.equal(await dimmed('Distribute'), 'true', 'the submenu Distribute is offered on two figures');
      await page.evaluate('window.BeesonEditorShell.closeMenus()');
      await click(page, 'section.present > h2', { modifiers: 'Shift' });
      assert.equal((await selected(page)).length, 3);
      await click(page, 'section.present img[alt="A turned figure"]', { button: 'right' });
      await sleep(100);
      await hover(page, 'Distribute');
      assert.ok((await menuRows(page, 1)).includes('Distribute Horizontally'));
      await page.evaluate('window.BeesonEditorShell.closeMenus()');
      assert.deepEqual(errors(page), []);
    });
  }

  test('on Windows and Linux, Ctrl with ] or [ orders the selection on the canvas and still indents a list item (other)', async (t) => {
    const page = await load(t, 'other', SOURCE, 1);
    await clickText(page, 'section.present img[alt="A turned figure"]');
    for (const [shift, label] of [[false, 'Bring Forward'], [true, 'Bring to Front']]) {
      await bracket(page, true, shift);
      assert.equal((await state(page, 'edit.undo')).label, `Undo ${label}`);
      await undo(page);
      assert.equal(await render(page), SOURCE);
    }
    await clickText(page, 'section.present img[alt="A straight figure"]');
    for (const [shift, label] of [[false, 'Send Backward'], [true, 'Send to Back']]) {
      await bracket(page, false, shift);
      assert.equal((await state(page, 'edit.undo')).label, `Undo ${label}`);
      await undo(page);
      assert.equal(await render(page), SOURCE);
    }
    await empty(page);
    const two = await page.evaluate(`(() => { const r = [...Reveal.getCurrentSlide().querySelectorAll('li')][1].getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; })()`);
    await clickText(page, two);
    await bracket(page, true, false);
    assert.equal((await state(page, 'edit.undo')).label, 'Undo Increase Indent Level', 'Ctrl+] in a list item does not indent it');
    assert.deepEqual(errors(page), []);
  });
});

// regression tests of R21.3 on both platforms with trusted input. a group that holds a line is
// turned as one entry, and the tab keeps answering (V11, V19). Regroup of an inner group gives back
// the lists that Ungroup took (V12). a layer command does not put an element under a backdrop
// (V20). a copy of a selection inside an entered group is one group (V13), and a change of the
// kind of a turned line keeps its ends on the slide (V6)
describe('turns, Regroup, and layers of inner groups', () => {
  const DECK = 'test/pages/editor-r21-3.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const [LINED, LEVELS, BACKDROP, ENTERED] = [0, 1, 2, 3];
  const PLATFORMS = ['mac', 'other'];
  const GROUP = { mac: 'Mod+Alt+G', other: 'Mod+G' };
  const REGROUP = { mac: 'Mod+Alt+J', other: 'Mod+Shift+J' };
  const S = '.reveal section.present';

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

  const js = (v) => JSON.stringify(v);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg ? `, ${js(arg)}` : ''})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const sel = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName + '[' + (e.getAttribute('data-group') ?? '') + ']')`);
  // the classes of the selected elements in the file, without those of the editor
  const classes = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => [...e.classList].filter((c) => !c.startsWith('beeson-')).join(' ')).join()`);

  // the promise p, or a failure once ms pass, so that a frozen tab fails its test and does not hang
  // the run
  function bounded(p, what, ms = 8000) {
    let timer;
    const late = new Promise((_, fail) => (timer = setTimeout(() => fail(new Error(`${what} did not answer within ${ms} ms`)), ms)));
    return Promise.race([p, late]).finally(() => clearTimeout(timer));
  }

  // the deck opened with the editor at slide n
  async function load(t, platform, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = SOURCE;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the point at the fractions u and v of the box of the element of selector on the current slide
  const at = (page, selector, u = 0.5, v = 0.5) =>
    page.evaluate(`(() => { const r = document.querySelector(${js(`${S} ${selector}`)}).getBoundingClientRect(); return { x: r.left + ${u} * r.width, y: r.top + ${v} * r.height }; })()`);

  // the turn of run, each step bounded, after which the tab answers, the line is turned, and one undo
  // gives the text before
  async function turnsOnce(page, what, run) {
    const before = await render(page);
    await bounded(run(), what);
    await bounded(frames(page), `a frame after ${what}`);
    assert.equal(await bounded(page.evaluate('1 + 1'), `the page after ${what}`), 2);
    const edited = await render(page);
    assert.notEqual(edited, before, `${what} did not change the text`);
    assert.match(edited, /<svg class="line"[^>]*style="[^"]*rotate: /, `${what} did not turn the line`);
    await bounded(undo(page), `the undo of ${what}`);
    assert.equal(await render(page), before, `one undo does not give the text before ${what}`);
    await bounded(redo(page), `the redo of ${what}`);
    assert.equal(await render(page), edited);
    await bounded(undo(page), `the undo of ${what}`);
    await bounded(frames(page), `a frame after the undo of ${what}`);
  }

  // a drag of the shown rotate handle by deg degrees about the center of the frame of the selection
  async function dragRotor(page, deg) {
    const o = await page.evaluate(`(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const shown = (el) => !el.hidden && el.getClientRects().length > 0;
    return { c: mid([...document.querySelectorAll('.beeson-frame.union, .beeson-frame.selected')].find(shown)), r: mid([...document.querySelectorAll('.beeson-rotor')].find(shown)) };
  })()`);
    const radius = Math.hypot(o.r.x - o.c.x, o.r.y - o.c.y), from = Math.atan2(o.r.y - o.c.y, o.r.x - o.c.x);
    await mouse(page, 'mouseMoved', o.r.x, o.r.y);
    await mouse(page, 'mousePressed', o.r.x, o.r.y, { button: 'left', buttons: 1, clickCount: 1 });
    let to = o.r;
    for (let i = 1; i <= 10; i++) {
      const a = from + ((deg * Math.PI) / 180) * (i / 10);
      to = { x: o.c.x + radius * Math.cos(a), y: o.c.y + radius * Math.sin(a) };
      await mouse(page, 'mouseMoved', to.x, to.y, { button: 'left', buttons: 1 });
    }
    await frames(page);
    await mouse(page, 'mouseReleased', to.x, to.y, { button: 'left', buttons: 0, clickCount: 1 });
  }

  // value typed into the field id of the Arrange pane
  async function typeField(page, id, value) {
    await page.evaluate(`[...document.querySelectorAll('#beeson-edit-panel-format .ed-tabs button')].find((b) => b.textContent === 'Arrange')?.click()`);
    await frames(page);
    await page.evaluate(`(() => { const i = document.querySelector('#beeson-edit-num-${id}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
  }

  for (const platform of PLATFORMS) {
    test(`V11: a group of a figure and a line is turned by Rotate Right, Rotate Left, the field, and the handle as one entry (${platform})`, async (t) => {
      const page = await load(t, platform, LINED);
      await click(page, `${S} figure img`);
      assert.deepEqual(await sel(page), ['figure[g6]', 'svg[g6]']);
      await turnsOnce(page, 'Rotate Right 90°', () => exec(page, 'arrange.rotateRight'));
      await turnsOnce(page, 'Rotate Left 90°', () => exec(page, 'arrange.rotateLeft'));
      await turnsOnce(page, 'the field Rotation', () => typeField(page, 'angle', 90));
      await turnsOnce(page, 'the rotate handle', () => dragRotor(page, 45));
      assert.deepEqual(errors(page), []);
    });

    test(`V19: Select All, Group, and Rotate Right 90° turn a slide with a line as one entry (${platform})`, async (t) => {
      const page = await load(t, platform, LINED);
      await click(page, `${S} figure img`);
      await press(page, 'Mod+A');
      await press(page, GROUP[platform]);
      await frames(page);
      const listed = await sel(page);
      assert.equal(listed.length, 4);
      assert.equal(new Set(listed.map((s) => s.replace(/^\w+\[(\w+).*$/, '$1'))).size, 1, 'Group did not make one group');
      await turnsOnce(page, 'Rotate Right 90°', () => exec(page, 'arrange.rotateRight'));
      assert.deepEqual(errors(page), []);
    });

    // the lists of the four shapes of the slide of three levels
    const lists = (page) => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('.shape')].map((e) => e.getAttribute('data-group'))`);
    for (const [clicks, way] of [[2, 'exec'], [2, 'key'], [3, 'exec']]) {
      test(`V12: Regroup by ${way} after Ungroup of the group selected by ${clicks} clicks gives back the lists byte for byte (${platform})`, async (t) => {
        const page = await load(t, platform, LEVELS);
        const P = await at(page, '.shape.tone-accent');
        for (let i = 0; i < clicks; i++) {
          await click(page, P);
          await frames(page);
        }
        assert.equal((await sel(page)).length, clicks === 2 ? 3 : 2);
        await exec(page, 'arrange.ungroup');
        assert.deepEqual(await lists(page), clicks === 2 ? ['g5 g3', 'g5 g3', 'g5', 'g5'] : ['g5 g4', 'g5 g4', 'g5 g4', 'g5']);
        const ungrouped = await render(page);
        if (way === 'key') await press(page, REGROUP[platform]);
        else await exec(page, 'arrange.regroup');
        await frames(page);
        assert.deepEqual(await lists(page), ['g5 g4 g3', 'g5 g4 g3', 'g5 g4', 'g5']);
        assert.equal(await render(page), SOURCE);
        await undo(page);
        assert.equal(await render(page), ungrouped);
        await redo(page);
        assert.equal(await render(page), SOURCE);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`V20: Send to Back puts a shape just over the backdrop, where a click selects it (${platform})`, async (t) => {
      const page = await load(t, platform, BACKDROP);
      const late = '.shape.rounded';
      // the right of the shape, which the blue shape does not cover
      const alone = await at(page, late, 0.85, 0.5);
      await click(page, alone);
      assert.equal(await classes(page), 'shape rounded tone-accent');
      assert.equal((await state(page, 'arrange.order.back')).enabled, true);
      await exec(page, 'arrange.order.back');
      await frames(page);
      const edited = await render(page);
      assert.doesNotMatch(edited, /z-index: -/);
      // the shape is drawn under the blue shape and over the backdrop
      const hit = (p) => page.evaluate(`document.elementFromPoint(${p.x}, ${p.y})?.closest('.shape, .backdrop')?.classList.value.replace(/ beeson-[\\w-]+/g, '') ?? null`);
      assert.equal(await hit(alone), 'shape rounded tone-accent');
      assert.equal(await hit(await at(page, late, 0.1, 0.5)), 'shape tone-blue');
      assert.equal((await state(page, 'arrange.order.back')).enabled, false);
      assert.equal((await state(page, 'arrange.order.backward')).enabled, false);
      await click(page, `${S} h2`);
      await click(page, alone);
      assert.equal(await classes(page), 'shape rounded tone-accent');
      await drag(page, alone, { dx: -50, dy: 0 });
      await frames(page);
      assert.match(await render(page), /data-cx="0\.97"/);
      await undo(page);
      await undo(page);
      assert.equal(await render(page), SOURCE);
      assert.deepEqual(errors(page), []);
    });

    test(`V20: Send Backward and Send to Back do not pass the backdrop (${platform})`, async (t) => {
      const page = await load(t, platform, BACKDROP);
      await click(page, await at(page, '.shape.tone-blue', 0.2, 0.5));
      assert.equal(await classes(page), 'shape tone-blue');
      assert.equal((await state(page, 'arrange.order.backward')).enabled, false);
      assert.equal((await state(page, 'arrange.order.back')).enabled, false);
      await exec(page, 'arrange.order.backward');
      await exec(page, 'arrange.order.back');
      assert.equal(await render(page), SOURCE);
    });

    // the lists of the shapes of the slide of the entered group, each copy after its original
    const copied = (page) => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll(':scope > .shape')].map((e) => e.getAttribute('data-group'))`);
    for (const how of ['Duplicate', 'Copy and Paste', 'a copy by a drag']) {
      test(`V13: ${how} of an inner group inside an entered group is one group that one Ungroup takes apart (${platform})`, async (t) => {
        const page = await load(t, platform, ENTERED);
        const A = await at(page, '.shape.tone-accent');
        await click(page, A);
        await click(page, A);
        await frames(page);
        assert.deepEqual(await sel(page), ['div[g2 g1]', 'div[g2 g1]']);
        if (how === 'Duplicate') await exec(page, 'edit.duplicate');
        else if (how === 'Copy and Paste') {
          await exec(page, 'edit.copy');
          await exec(page, 'edit.paste');
        } else await drag(page, A, { dx: -40, dy: 200, modifiers: platform === 'mac' ? 'Alt' : 'Ctrl' });
        await frames(page);
        const copies = (await copied(page)).filter((g) => g !== 'g2 g1');
        assert.equal(copies.length, 2, `${how} did not make two copies`);
        assert.match(copies[0] ?? '', /^g\d+$/, `the copies of ${how} are not one group of one level`);
        assert.equal(copies[0], copies[1]);
        assert.ok(!['g1', 'g2'].includes(copies[0]));
        await exec(page, 'arrange.ungroup');
        assert.deepEqual((await copied(page)).filter((g) => g !== 'g2 g1'), [null, null]);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`V13: Duplicate of a member selected by itself inside its groups gives a copy outside every group (${platform})`, async (t) => {
      const page = await load(t, platform, ENTERED);
      const A = await at(page, '.shape.tone-accent');
      for (let i = 0; i < 3; i++) {
        await click(page, A);
        await frames(page);
      }
      assert.deepEqual(await sel(page), ['div[g2 g1]']);
      await exec(page, 'edit.duplicate');
      assert.deepEqual(await copied(page), ['g2 g1', null, 'g2 g1']);
    });

    test(`V6: a change of kind of a turned line keeps its ends on the slide (${platform})`, async (t) => {
      const page = await load(t, platform, LINED);
      await exec(page, 'insert.arrow', { from: { x: 300, y: 600 }, to: { x: 1100, y: 600 } });
      await frames(page);
      assert.deepEqual(await sel(page), ['svg[]']);
      await exec(page, 'arrange.setRotation', { deg: 30 });
      await frames(page);
      // the ends of the stroke of the selected line on the screen
      const ends = () => page.evaluate(`(() => {
      const s = window.BeesonEditor.selection()[0].querySelector(':scope > line, :scope > path'), m = s.getScreenCTM();
      return [s.getPointAtLength(0), s.getPointAtLength(s.getTotalLength())].map((p) => new DOMPoint(p.x, p.y).matrixTransform(m)).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
    })()`);
      const was = await ends();
      const turned = await render(page);
      for (const kind of ['curve', 'elbow', 'straight', 'elbow', 'curve']) {
        await exec(page, `line.kind.${kind}`);
        await frames(page);
        for (const [i, p] of (await ends()).entries()) {
          assert.ok(Math.hypot(p[0] - was[i][0], p[1] - was[i][1]) < 1.5, `the end ${i} of the ${kind} is at ${p}, not at ${was[i]}`);
        }
      }
      for (let i = 0; i < 5; i++) await undo(page);
      assert.equal(await render(page), turned);
      assert.deepEqual(errors(page), []);
    });
  }
});
