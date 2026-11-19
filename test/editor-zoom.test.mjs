// the zoom of the canvas and the pane of the notes: the slide at a zoom past Fit, scrolled by the
// wheel and zoomed by a pinch, the keys of View > Zoom on both platforms, the same slide px written
// by a drag and a resize at every zoom, Zoom to Selection, the frames clipped to the canvas, and
// the notes typed in their pane, with the zoom of their text and the divider of the pane

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, drag, editorPage, press, saveAndReopen, selectFigure, type } from './helpers/editor.mjs';

const PLATFORMS = ['mac', 'other'];
const FIG = '.reveal section.present .figure-box > img';

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

// the editor on the demo deck served over HTTP, so that a save is written into the origin private
// file system, in a window of 1600 by 1000
async function open(t, platform, width = 1600) {
  const page = await browser.newPage({ width, height: 1000 });
  t.after(() => page.close());
  await page.goto(`${server.origin}/test-deck.html?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  // the storage of an earlier test, e.g. the zoom of the notes, is cleared and the page loaded again
  await page.evaluate('localStorage.clear()');
  await page.goto(`${server.origin}/test-deck.html?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync('test-deck.html', 'utf8');
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
  assert.deepEqual(status.problems, []);
  return page;
}

const frames = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
const stage = (page) => page.evaluate(`(() => { const s = window.BeesonEditorShell.stage; return { zoom: s.zoom, scale: s.scale, fit: s.fitScale(), viewport: s.viewport.toJSON(), left: s.el.scrollLeft, top: s.el.scrollTop }; })()`);
const setZoom = async (page, z) => { await page.evaluate(`window.BeesonEditorShell.stage.setZoom(${z})`); await frames(page); };

// the box of the first shown element matched by a selector, in CSS px of the viewport
const rectOf = (page, selector) => page.evaluate(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => e.getBoundingClientRect()).find((r) => r.width && r.height); return r && r.toJSON(); })()`);

async function figureSlide(page) {
  await page.evaluate(`Reveal.slide(Reveal.getIndices(document.querySelector('.reveal .slides section .figure-box > img').closest('section')).h)`);
  await frames(page);
}

// the canvas scrolled so that a point of the viewport comes to the center of the cell
async function centerOn(page, at) {
  await page.evaluate(`(() => { const s = window.BeesonEditorShell.stage; const v = s.viewport; s.el.scrollLeft += ${at.x} - (v.left + v.width / 2); s.el.scrollTop += ${at.y} - (v.top + v.height / 2); })()`);
  await frames(page);
}

// a trusted press of a key string with a symbol or a digit typed with Alt, which press() of the
// helpers does not know: the key is the character a keyboard of the United States sends
const SYMBOLS = { '=': ['=', 'Equal', 187], '+': ['+', 'Equal', 187], '-': ['-', 'Minus', 189] };
async function pressKey(page, keys) {
  const names = keys.split('+');
  const name = names.pop() || '+';
  if (!SYMBOLS[name] && !(names.includes('Alt') && /^[0-9]$/.test(name))) return press(page, keys);
  const mac = (await page.evaluate(`new URLSearchParams(location.search).get('edit-platform')`)) === 'mac';
  const bits = names.reduce((b, m) => b | ({ Alt: 1, Ctrl: 2, Meta: 4, Shift: 8, Mod: mac ? 4 : 2 }[m] ?? 0), 0);
  // Option+0 types a masculine ordinal on a Mac, and the command is matched by the code of the key
  const [key, code, keyCode] = SYMBOLS[name] ?? [mac ? 'º' : name, `Digit${name}`, name.charCodeAt(0)];
  const base = { key, code, windowsVirtualKeyCode: keyCode, modifiers: bits };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// whether the last keydown was taken by the editor, i.e. the browser does not act on it
async function watchKeys(page) {
  // a listener in the capture phase of the window runs first, hence it reads the event after the
  // dispatch, since the editor stops its propagation
  await page.evaluate(`window.addEventListener('keydown', (ev) => { window.__taken = undefined; setTimeout(() => { window.__taken = ev.defaultPrevented; }); }, true)`);
}

const wheel = (page, at, { dx = 0, dy = 0, modifiers = 0 } = {}) => page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: dx, deltaY: dy, modifiers });

test('at 200 percent the slide is 3840 px wide, and the wheel scrolls it down and sideways', async (t) => {
  const page = await open(t, 'other');
  await figureSlide(page);
  await setZoom(page, 2);
  const slides = await rectOf(page, '.reveal .slides');
  assert.equal(Math.round(slides.width), 3840);
  assert.equal(Math.round(slides.height), 2160);
  const s0 = await stage(page);
  const at = { x: s0.viewport.left + s0.viewport.width / 2, y: s0.viewport.top + s0.viewport.height / 2 };
  await wheel(page, at, { dy: 300 });
  await frames(page);
  const s1 = await stage(page);
  assert.ok(s1.top - s0.top > 100, `the wheel scrolled the canvas from ${s0.top} to ${s1.top}`);
  assert.equal(s1.zoom, 2);
  // Shift and the wheel scroll sideways, as on Windows and Linux
  await wheel(page, at, { dy: 300, modifiers: 8 });
  await frames(page);
  const s2 = await stage(page);
  assert.ok(s2.left - s1.left > 100, `Shift and the wheel scrolled the canvas from ${s1.left} to ${s2.left}`);
  assert.deepEqual(page.errors, []);
});

test('a pinch of the trackpad zooms the canvas about the pointer', async (t) => {
  const page = await open(t, 'mac');
  // the canvas is made as wide as the window without the inspector, so that the zoom past Fit
  // scrolls the canvas in both directions
  await page.evaluate(`window.BeesonEditor.exec('shell.format')`);
  await figureSlide(page);
  const img = await rectOf(page, FIG);
  const at = { x: img.left + img.width / 3, y: img.top + img.height / 3 };
  const under = () => page.evaluate(`window.BeesonEditorShell.stage.toSlide(${JSON.stringify(at)})`);
  const before = await under();
  // Chrome and Firefox send a pinch as a wheel with Ctrl
  for (let i = 0; i < 4; i++) await wheel(page, at, { dy: -40, modifiers: 2 });
  await frames(page);
  const s = await stage(page);
  assert.ok(s.zoom > s.fit * 1.5, `the pinch zoomed to ${s.zoom} from ${s.fit}`);
  const now = await under();
  assert.ok(Math.abs(now.x - before.x) < 1 && Math.abs(now.y - before.y) < 1, `the point under the pointer moved from ${JSON.stringify(before)} to ${JSON.stringify(now)}`);
  assert.deepEqual(page.errors, []);
});

for (const platform of PLATFORMS) {
  test(`the keys of View > Zoom on the platform ${platform}`, async (t) => {
    const page = await open(t, platform);
    await figureSlide(page);
    await watchKeys(page);
    const zoomAfter = async (keys) => { await pressKey(page, keys); await frames(page); return (await stage(page)).zoom; };
    const fit = (await stage(page)).fit;
    const zin = await zoomAfter('Mod+=');
    assert.ok(zin > fit, `Mod+= zoomed to ${zin} from ${fit}`);
    assert.equal(await page.evaluate('window.__taken'), true, 'the browser zoomed the page as well');
    assert.equal(await zoomAfter('Mod+-'), [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3].filter((z) => z < zin).pop());
    assert.equal(await page.evaluate('window.__taken'), true);
    assert.equal(await zoomAfter('Mod+0'), 1);
    assert.equal(await page.evaluate('window.__taken'), true);
    assert.equal(await zoomAfter('Shift+1'), null);
    assert.equal(await zoomAfter('Shift+0'), 1);
    if (platform === 'mac') {
      assert.equal(await zoomAfter('Mod+Alt+0'), null);
      assert.equal(await page.evaluate('window.__taken'), true);
    }
    // Zoom to Selection, by Shift+2 everywhere and by Cmd+Shift+0 on a Mac, wants a selection
    await setZoom(page, null);
    assert.equal(await zoomAfter('Shift+2'), null);
    await clickText(page, FIG);
    const keys = platform === 'mac' ? ['Shift+2', 'Mod+Shift+0'] : ['Shift+2'];
    for (const k of keys) {
      await setZoom(page, null);
      assert.ok((await zoomAfter(k)) > fit, `${k} did not zoom to the selection`);
    }
    // the zoom keys of the canvas are taken while a text is edited, and not by a field
    await setZoom(page, null);
    await clickText(page, '.reveal section.present h2');
    assert.equal(await page.evaluate(`document.activeElement.matches('.reveal section.present h2')`), true);
    assert.ok((await zoomAfter('Mod+=')) > fit);
    assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
    assert.deepEqual(page.errors, []);
  });
}

test('Zoom to Selection fills the cell with the selected figure and centers it', async (t) => {
  const page = await open(t, 'other');
  await figureSlide(page);
  await clickText(page, FIG);
  await page.evaluate(`window.BeesonEditor.exec('zoom.selection')`);
  await frames(page);
  const s = await stage(page);
  // the frame of the figure, i.e. its picture with its caption
  const img = await rectOf(page, '.beeson-frame.selected');
  const v = s.viewport;
  // the figure is centered as far as the canvas scrolls: it is at the right edge of the slide, hence
  // the canvas is scrolled to its right end
  const end = await page.evaluate(`(() => { const c = window.BeesonEditorShell.stage.el; return Math.abs(c.scrollLeft - (c.scrollWidth - c.clientWidth)) < 1; })()`);
  assert.ok(end || Math.abs(img.left + img.width / 2 - (v.left + v.width / 2)) < 2, JSON.stringify({ img, v }));
  assert.ok(img.left >= v.left && img.right <= v.right, JSON.stringify({ img, v }));
  assert.ok(Math.abs(img.top + img.height / 2 - (v.top + v.height / 2)) < 2, JSON.stringify({ img, v }));
  // the figure is taller than wide, hence it fills the height of the cell within the margin
  assert.ok(img.height <= v.height && img.height > v.height - 100, `the figure is ${img.height} px high in a cell of ${v.height}`);
  assert.deepEqual(page.errors, []);
});

test('the frames and handles are clipped to the canvas at a zoom', async (t) => {
  const page = await open(t, 'other');
  await figureSlide(page);
  await setZoom(page, 2);
  await centerOn(page, await (async () => { const r = await rectOf(page, FIG); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })());
  await clickText(page, FIG);
  await frames(page);
  const look = await page.evaluate(`(() => {
    const v = window.BeesonEditorShell.stage.viewport;
    return { clip: getComputedStyle(document.querySelector('.beeson-overlay')).clipPath, want: 'inset(' + [v.top, innerWidth - v.right, innerHeight - v.bottom, v.left].map((n) => n + 'px').join(' ') + ')' };
  })()`);
  assert.equal(look.clip, look.want);
  // the frame of the figure runs past the cell at 200 percent, and the handle under the cell is
  // not hit, since the point is on the status bar
  const frame = await rectOf(page, '.beeson-frame.selected');
  const s = await stage(page);
  assert.ok(frame.bottom > s.viewport.bottom, 'the figure does not run past the cell');
  assert.deepEqual(page.errors, []);
});

for (const platform of PLATFORMS) {
  test(`a drag and a resize of a figure write the same slide px at 50, 100, and 200 percent as at Fit, on the platform ${platform}`, async (t) => {
    // in a window of 1800 px, the ends of the drag to the center of the slide at 200 percent are
    // over 100 px inside the cell. In one of 1600 px they were in the band of 24 px at its edges,
    // where the canvas is scrolled while a drag is held, by an amount that depends on the timing
    const page = await open(t, platform, 1800);
    await figureSlide(page);
    // what the file gets: the text rendered by the editor, cut to the lines that differ from the deck
    const lines = page.source.split('\n');
    const figureBox = async () => (await page.evaluate('window.BeesonEditor.render()')).split('\n').filter((l, i) => l !== lines[i]).join('\n');
    const undo = async () => { await press(page, 'Mod+Z'); await frames(page); };
    // nothing is selected before the figure is selected for each drag, since a click on a selected
    // figure selects its image
    const clear = async () => {
      for (let i = 0; i < 3 && !(await page.evaluate(`document.querySelector('.beeson-frame.selected').hidden`)); i++) await press(page, 'Escape');
      assert.equal(await page.evaluate(`document.querySelector('.beeson-frame.selected').hidden`), true, 'the selection is not cleared');
    };
    // the figure is scrolled to the center of the cell, so that the drag stays in the window
    const ready = async (z) => {
      await setZoom(page, z);
      const r = await rectOf(page, FIG);
      if (z !== null) await centerOn(page, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      await clear();
      // a click on the image selects it apart from its caption, and Esc selects the figure
      await selectFigure(page, FIG);
      return (await stage(page)).scale;
    };
    const free = platform === 'mac' ? 'Meta' : 'Alt';
    const results = {};
    for (const z of [null, 0.5, 1, 2]) {
      // a free move by 60 by 40 slide px, with Cmd on a Mac and Alt elsewhere, hence no snap
      let s = await ready(z);
      await drag(page, FIG, { dx: 60 * s, dy: 40 * s, modifiers: free });
      await frames(page);
      const moved = await figureBox();
      await undo();
      await byteExact(page);
      // a move that leaves the center of the figure 3 slide px right of the center of the slide,
      // where it snaps at every zoom, since 3 slide px are under 8 screen px up to 200 percent
      await setZoom(page, z);
      const off = await page.evaluate(`(() => { const s = window.BeesonEditorShell.stage; const r = [...document.querySelectorAll(${JSON.stringify(FIG)})].map((e) => e.getBoundingClientRect()).find((r) => r.width); return s.toSlide({ x: r.left + r.width / 2, y: 0 }).x - 960; })()`);
      // the canvas is scrolled to the middle of the way, so that both ends are in the window
      if (z !== null) {
        const r = await rectOf(page, FIG);
        await centerOn(page, { x: r.left + r.width / 2 - ((off - 3) * z) / 2, y: r.top + r.height / 2 });
      }
      await clear();
      await selectFigure(page, FIG);
      s = (await stage(page)).scale;
      await drag(page, FIG, { dx: -(off - 3) * s, dy: 0 });
      await frames(page);
      const snapped = await figureBox();
      const center = await page.evaluate(`(() => { const s = window.BeesonEditorShell.stage; const r = [...document.querySelectorAll(${JSON.stringify(FIG)})].map((e) => e.getBoundingClientRect()).find((r) => r.width); return s.toSlide({ x: r.left + r.width / 2, y: 0 }).x; })()`);
      assert.ok(Math.abs(center - 960) < 1, `at ${z}: the center of the figure is at ${center}, not snapped to 960`);
      await undo();
      await byteExact(page);
      // a free resize of the lower right corner of the image by 80 by 80 slide px, with the image
      // selected by a click on the selected figure
      s = await ready(z);
      await clickText(page, FIG);
      await clickText(page, FIG);
      const grip = () => page.evaluate(`(() => { const r = document.querySelector('.beeson-grip[data-handle=se]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      // the corner is off the window at 200 percent until the canvas is scrolled to it
      if (z !== null) await centerOn(page, await grip());
      const se = await grip();
      await drag(page, se, { dx: 80 * s, dy: 80 * s, modifiers: free });
      await frames(page);
      const resized = await figureBox();
      await undo();
      await byteExact(page);
      results[z] = { moved, snapped, resized };
    }
    assert.match(results.null.moved, /<figure class="figure-box" style="translate: 60px 40px">/);
    assert.match(results.null.snapped, /<figure class="figure-box" style="translate: -?\d+px( -?\d+px)?">/);
    assert.match(results.null.resized, /width: \d+px/);
    for (const z of [0.5, 1, 2]) assert.deepEqual(results[z], results.null, `at ${z} the file got ${JSON.stringify(results[z])}, at Fit ${JSON.stringify(results.null)}`);
    assert.deepEqual(page.errors, []);
  });
}

for (const platform of PLATFORMS) {
  test(`text typed into the notes pane is written into the aside, undone, redone, and saved, on the platform ${platform}`, async (t) => {
    const page = await open(t, platform);
    await page.evaluate(`window.BeesonEditor.exec('view.notes')`);
    await frames(page);
    // the notes are laid over the pane, in the font of the chrome
    const look = await page.evaluate(`(() => {
      const a = document.querySelector('.reveal section.present > aside.notes');
      const r = a.getBoundingClientRect(), p = document.querySelector('.beeson-edit-pane').getBoundingClientRect();
      return { focused: document.activeElement === a, over: Math.abs(r.left - p.left) < 1 && Math.abs(r.top - p.top) < 1 && Math.abs(r.width - p.width) < 1 && Math.abs(r.height - p.height) < 1, font: getComputedStyle(a).fontFamily === getComputedStyle(document.querySelector('.beeson-edit-bottom')).fontFamily };
    })()`);
    assert.deepEqual(look, { focused: true, over: true, font: true });
    // the caret at the end of the notes, then trusted typing
    const end = await page.evaluate(`(() => { const a = document.activeElement; const r = document.createRange(); r.selectNodeContents(a); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return a.textContent.slice(-12); })()`);
    await type(page, ' Typed in the pane.');
    await frames(page);
    const edit = [`${end}</aside>`, `${end} Typed in the pane.</aside>`];
    await byteExact(page, [edit]);
    await press(page, 'Mod+Z');
    await frames(page);
    await byteExact(page);
    await press(page, platform === 'mac' ? 'Mod+Shift+Z' : 'Mod+Y');
    await frames(page);
    await byteExact(page, [edit]);
    const { text, status } = await saveAndReopen(page, `notes-${platform}.html`);
    assert.equal(text, page.source.replace(edit[0], edit[1]));
    assert.deepEqual(status.problems, []);
    assert.deepEqual(page.errors, []);
  });
}

for (const platform of PLATFORMS) {
  test(`the text of the notes is zoomed by its keys and buttons, apart from the canvas, on the platform ${platform}`, async (t) => {
    const page = await open(t, platform);
    await page.evaluate(`window.BeesonEditor.exec('view.notes')`);
    await frames(page);
    await watchKeys(page);
    const size = () => page.evaluate(`parseFloat(getComputedStyle(document.querySelector('.reveal section.present > aside.notes')).fontSize) * window.BeesonEditorShell.stage.scale`);
    const value = () => page.evaluate(`document.querySelector('.beeson-edit-notes-zoom .value').textContent`);
    assert.ok(Math.abs((await size()) - 13) < 0.1, `the notes are set at ${await size()} px`);
    await pressKey(page, 'Mod+=');
    await frames(page);
    assert.ok(Math.abs((await size()) - 16.25) < 0.1, `the notes are set at ${await size()} px`);
    assert.equal(await value(), '125%');
    assert.equal(await page.evaluate('window.__taken'), true);
    assert.equal((await stage(page)).zoom, null, 'the canvas was zoomed with the notes');
    assert.equal(await page.evaluate(`document.activeElement.matches('aside.notes')`), true);
    await pressKey(page, 'Mod+=');
    await pressKey(page, 'Mod+-');
    await frames(page);
    assert.equal(await value(), '125%');
    await pressKey(page, 'Mod+0');
    await frames(page);
    assert.equal(await value(), '100%');
    // the buttons keep the caret in the notes
    await click(page, '.beeson-edit-notes-zoom button.big');
    await frames(page);
    assert.equal(await value(), '125%');
    assert.equal(await page.evaluate(`document.activeElement.matches('aside.notes')`), true);
    await click(page, '.beeson-edit-notes-zoom button:not(.big)');
    await click(page, '.beeson-edit-notes-zoom button:not(.big)');
    await frames(page);
    assert.equal(await value(), '75%');
    // the zoom of the text is kept for the next session, and nothing is written into the file
    assert.equal(await page.evaluate(`localStorage.getItem('beeson-notes-zoom')`), '0.75');
    assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
    assert.deepEqual(page.errors, []);
  });
}

test('the divider of the notes is dragged to set the height of the pane, and dragged down to hide it', async (t) => {
  const page = await open(t, 'other');
  await page.evaluate(`window.BeesonEditor.exec('view.notes')`);
  await frames(page);
  const pane = () => page.evaluate('window.BeesonEditor.status().pane');
  const shown = () => page.evaluate(`document.documentElement.classList.contains('beeson-notes')`);
  const h0 = await pane();
  await drag(page, '.beeson-edit-resize', { dy: -120 });
  await frames(page);
  assert.equal(await pane(), h0 + 120);
  // the aside follows the pane
  const fits = await page.evaluate(`(() => { const r = document.querySelector('.reveal section.present > aside.notes').getBoundingClientRect(), p = document.querySelector('.beeson-edit-pane').getBoundingClientRect(); return Math.abs(r.top - p.top) < 1 && Math.abs(r.height - p.height) < 1; })()`);
  assert.equal(fits, true);
  // the arrow keys move the divider by 20 px
  await page.evaluate(`document.querySelector('.beeson-edit-resize').focus()`);
  await press(page, 'ArrowUp');
  assert.equal(await pane(), h0 + 140);
  await press(page, 'ArrowDown');
  assert.equal(await pane(), h0 + 120);
  // a drag down past the bottom hides the notes and keeps the height of the pane
  await drag(page, '.beeson-edit-resize', { dy: h0 + 120 });
  await frames(page);
  assert.equal(await shown(), false);
  assert.equal(await pane(), h0 + 120);
  assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
  assert.deepEqual(page.errors, []);
});

// the lag of the zoom slider of the status bar: a drag of its thumb across 30 steps, each timed
// from the dispatch of its pointer event to the frame painted after it, on the title slide and on
// a slide with a backdrop and three blocks selected, and the zoom, the scroll, the frames of the
// selection, the rulers, the guides, and the percentage after the drag, which equal those of the
// same zooms set one by one through the stage and those of the base. a pinch sent as a wheel with
// Ctrl is timed in the same way, and laid out by reveal.js after it
describe('the lag of the zoom slider', () => {
  const PLATFORMS = ['mac', 'other'];
  const STEPS = 30;
  // the bounds of a step in ms, i.e. a median under 0.6 of a frame and a slowest step under 2.4
  // frames on the title slide, and under one frame and 3.6 frames with the selection. the base
  // takes 20 to 30 ms at the median and 29 to 36 ms at the slowest step on the title slide, and 33
  // to 52 ms and 52 to 62 ms with the selection, on a Mac with other tests running. a fluent drag
  // takes under half of each bound, and its slowest steps are the two or three at which reveal.js
  // is laid out again, once the zoom has doubled
  const BOUNDS = { title: { median: 10, slowest: 40 }, selected: { median: 16, slowest: 60 } };
  // as in perf.test.mjs, the timing of a shared runner of GitHub does not stand for a laptop
  const TIMED = { skip: process.env.CI ? 'the timing of a shared runner does not stand for a laptop' : false };

  let browser;
  before(async () => {
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
  });

  async function open(t, platform) {
    const page = await editorPage(browser, { query: `edit&still&edit-platform=${platform}`, page: { width: 1600, height: 1000 } });
    t.after(() => page.close());
    return page;
  }

  const frames = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
  const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });

  // the time of each pointer move from its dispatch to the frame painted after it, which a message
  // posted from the frame callback is received after. the time from the creation of the event would
  // add the wait for the next frame, which Chrome dispatches a move at
  const PROBE = `(() => {
  const p = window.probe = { times: [], wait: null };
  const timed = () => {
    const t0 = performance.now();
    p.wait = new Promise((done) => requestAnimationFrame(() => {
      const c = new MessageChannel();
      c.port1.onmessage = () => done(p.times.push(performance.now() - t0));
      c.port2.postMessage(0);
    }));
  };
  addEventListener('pointermove', timed, true);
  addEventListener('wheel', timed, true);
  return true;
})()`;

  // slide 3 of the demo deck, with its backdrop, its heading, its paragraph, and its list selected
  // with Shift-clicks, the rulers on, and two guides
  async function loaded(page) {
    await page.evaluate(`(async () => {
    Reveal.slide(2);
    document.querySelector('.reveal section.present').setAttribute('data-guides', 'x480 y270');
    // the setting is kept in the storage of the browser from an earlier test, and the guides are shown with the rulers
    if (!window.BeesonEditor.state('view.rulers').checked) await window.BeesonEditor.exec('view.rulers');
  })()`);
    await frames(page);
    const points = await page.evaluate(`[...document.querySelectorAll('.reveal section.present > h2, .reveal section.present > p, .reveal section.present > ul')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + 10, y: r.top + Math.min(r.height / 2, 20) }; })`);
    for (const [i, p] of points.entries()) {
      await mouse(page, 'mouseMoved', p.x, p.y);
      await mouse(page, 'mousePressed', p.x, p.y, { button: 'left', buttons: 1, clickCount: 1, modifiers: i ? 8 : 0 });
      await mouse(page, 'mouseReleased', p.x, p.y, { button: 'left', clickCount: 1, modifiers: i ? 8 : 0 });
    }
    await frames(page);
    assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 3);
  }

  // a drag of the thumb from the left end of the slider to its right end in STEPS moves, each sent
  // after the frame of the move before. returns the time of each move, and the zoom after the press
  // and after each move
  async function dragSlider(page) {
    await page.evaluate(PROBE);
    const r = await page.evaluate(`document.querySelector('.beeson-edit-bottom .zoom .slider').getBoundingClientRect().toJSON()`);
    const y = r.top + r.height / 2;
    const x0 = r.left + 8;
    const x1 = r.right - 8;
    await mouse(page, 'mouseMoved', x0, y);
    await mouse(page, 'mousePressed', x0, y, { button: 'left', buttons: 1, clickCount: 1 });
    await frames(page);
    await page.evaluate('window.probe.times = []');
    const zooms = [await page.evaluate('window.BeesonEditorShell.stage.zoom')];
    for (let i = 1; i <= STEPS; i++) {
      await page.evaluate('window.probe.wait = null');
      await mouse(page, 'mouseMoved', x0 + ((x1 - x0) * i) / STEPS, y, { button: 'left', buttons: 1 });
      await page.evaluate('window.probe.wait');
      zooms.push(await page.evaluate('window.BeesonEditorShell.stage.zoom'));
    }
    await mouse(page, 'mouseReleased', x1, y, { button: 'left', clickCount: 1 });
    await frames(page);
    return { times: await page.evaluate('window.probe.times'), zooms };
  }

  // a pinch of a trackpad as Chrome sends it, a wheel with Ctrl, in STEPS events at the center of the
  // canvas, half of them in and half out, each sent after the frame of the one before
  async function pinchWheel(page) {
    await page.evaluate(PROBE);
    const v = await page.evaluate('window.BeesonEditorShell.stage.viewport.toJSON()');
    const x = v.left + v.width / 2;
    const y = v.top + v.height / 2;
    await mouse(page, 'mouseMoved', x, y);
    await frames(page);
    await page.evaluate('window.probe.times = []');
    for (let i = 1; i <= STEPS; i++) {
      await page.evaluate('window.probe.wait = null');
      await mouse(page, 'mouseWheel', x, y, { deltaX: 0, deltaY: i <= STEPS / 2 ? -30 : 10, modifiers: 2 });
      await page.evaluate('window.probe.wait');
    }
    return page.evaluate('window.probe.times');
  }

  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

  // the state that a user sees of the zoom: the zoom, the scroll of the canvas, the slide, the frames
  // and the handles of the selection, the rulers, the guides, the percentage, and the thumb
  const STATE = `(() => {
  const s = window.BeesonEditorShell.stage;
  const box = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100).join(' '); };
  const shown = (sel) => [...document.querySelectorAll(sel)].filter((e) => !e.hidden && e.getClientRects().length).map(box);
  return {
    zoom: s.zoom,
    scroll: [s.el.scrollLeft, s.el.scrollTop],
    slide: box(document.querySelector('.reveal .slides')),
    frames: shown('.beeson-overlay *'),
    rulers: [...document.querySelectorAll('canvas.beeson-ruler')].map((c) => c.toDataURL()),
    guides: shown('.beeson-hand-guide'),
    percent: document.querySelector('.beeson-edit-bottom .zoom .percent').textContent,
    thumb: document.querySelector('.beeson-edit-bottom .zoom input').value,
  };
})()`;

  for (const platform of PLATFORMS) {
    for (const [where, bound] of [['the title slide', BOUNDS.title], ['a slide with a backdrop and three blocks selected', BOUNDS.selected]]) {
      test(`a drag of the zoom slider on ${where} paints each of its ${STEPS} steps within the bounds (${platform})`, TIMED, async (t) => {
        const page = await open(t, platform);
        if (where !== 'the title slide') await loaded(page);
        const { times } = await dragSlider(page);
        assert.equal(times.length, STEPS);
        const m = median(times);
        const slowest = Math.max(...times);
        const text = `the steps take ${times.map((v) => v.toFixed(1)).join(', ')} ms`;
        t.diagnostic(`median ${m.toFixed(1)} ms, slowest ${slowest.toFixed(1)} ms: ${times.map((v) => v.toFixed(0)).join(' ')}`);
        assert.ok(m < bound.median, `the median step takes ${m.toFixed(1)} ms, over ${bound.median} ms. ${text}`);
        assert.ok(slowest < bound.slowest, `the slowest step takes ${slowest.toFixed(1)} ms, over ${bound.slowest} ms. ${text}`);
      });
    }

    test(`after a drag of the zoom slider, the canvas is drawn as the same zooms set through the stage draw it (${platform})`, async (t) => {
      const dragged = await open(t, platform);
      await loaded(dragged);
      const { zooms } = await dragSlider(dragged);
      assert.ok(zooms[STEPS] > 3, `the drag ends at the zoom ${zooms[STEPS]}`);
      const set = await open(t, platform);
      await loaded(set);
      for (const z of zooms) {
        await set.evaluate(`window.BeesonEditorShell.stage.setZoom(${z})`);
        await frames(set);
      }
      // the thumb of the slider is not moved by a zoom while the slider has the focus
      await set.evaluate(`document.querySelector('.beeson-edit-bottom .zoom input').focus()`);
      await frames(set);
      const want = await set.evaluate(STATE);
      const got = await dragged.evaluate(STATE);
      assert.ok(got.frames.length > 0, 'the selection is not framed');
      assert.equal(got.guides.length, 2);
      assert.deepEqual({ ...got, thumb: null }, { ...want, thumb: null });
      // the zoom, the scroll, the slide, and the guides of the base in a window of 1600 by 1000
      assert.deepEqual({ zoom: got.zoom, scroll: got.scroll, slide: got.slide, guides: got.guides, percent: got.percent, thumb: got.thumb }, {
        zoom: 3.86, scroll: [3188, 1677], slide: '-2937.6 -1545.9 7411.2 4168.8', guides: ['-1084.8 99 1 873', '218 -503.69 1094 1'], percent: '386%', thumb: '991',
      });
    });

    test(`a pinch as a wheel with Ctrl on a slide with a backdrop and three blocks selected paints each of its ${STEPS} steps within the bounds, and is laid out after it (${platform})`, TIMED, async (t) => {
      const page = await open(t, platform);
      await loaded(page);
      const times = await pinchWheel(page);
      // reveal.js is laid out at the zoom once the pinch has ended
      await page.evaluate('new Promise((done) => setTimeout(done, 400))');
      await frames(page);
      const got = await page.evaluate(STATE);
      assert.equal(await page.evaluate('Reveal.getScale()'), got.zoom);
      // the zoom, the scroll, the slide, and the guides in a window of 1600 by 1000. the pinch is held
      // at the zoom of 4 and then zoomed out by exp(-0.75), to 1.889, which is floored once to 1.88
      assert.deepEqual({ zoom: got.zoom, scroll: got.scroll, slide: got.slide, guides: got.guides, percent: got.percent }, {
        zoom: 1.88, scroll: [1290, 610], slide: '-1039.8 -478.7 3609.6 2030.4', guides: ['-137.39 99 1 873', '218 28.89 1094 1'], percent: '188%',
      });
      assert.ok(got.frames.length > 0, 'the selection is not framed');
      assert.equal(times.length, STEPS);
      const m = median(times);
      const slowest = Math.max(...times);
      const text = `the steps take ${times.map((v) => v.toFixed(1)).join(', ')} ms`;
      t.diagnostic(`median ${m.toFixed(1)} ms, slowest ${slowest.toFixed(1)} ms: ${times.map((v) => v.toFixed(0)).join(' ')}`);
      assert.ok(m < BOUNDS.selected.median, `the median step takes ${m.toFixed(1)} ms, over ${BOUNDS.selected.median} ms. ${text}`);
      assert.ok(slowest < BOUNDS.selected.slowest, `the slowest step takes ${slowest.toFixed(1)} ms, over ${BOUNDS.selected.slowest} ms. ${text}`);
    });
  }
});

// the zoom of a pinch: a slow pinch of a trackpad, i.e. wheels with Ctrl and small deltas, which
// zooms by the product of its steps as a fast one does, and a wheel with Ctrl during the drag of a
// figure, which keeps the point grabbed under the pointer
describe('a slow pinch and zoom during a drag', () => {
  const PLATFORMS = ['mac', 'other'];

  let browser;
  before(async () => {
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
  });

  async function open(t, platform, slide) {
    const page = await editorPage(browser, { query: `edit&still&edit-platform=${platform}`, page: { width: 1600, height: 1000 }, clear: true });
    t.after(() => page.close());
    await page.evaluate(`Reveal.slide(${slide})`);
    await frames(page);
    await wait(page, 150);
    return page;
  }

  const frames = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
  const wait = (page, ms) => page.evaluate(`new Promise((done) => setTimeout(() => done(true), ${ms}))`);
  const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const zoomOf = (page) => page.evaluate('[window.BeesonEditorShell.stage.zoom, window.BeesonEditorShell.stage.scale]');

  // 40 wheels with Ctrl at the center of the canvas, as Chrome sends a slow pinch, each in a frame of
  // its own, and the zoom 400 ms after the last one, once the pinch is laid out
  async function pinch(page, delta) {
    const v = await page.evaluate('window.BeesonEditorShell.stage.viewport.toJSON()');
    const x = v.left + v.width / 2;
    const y = v.top + v.height / 2;
    await mouse(page, 'mouseMoved', x, y);
    for (let k = 0; k < 40; k++) {
      await mouse(page, 'mouseWheel', x, y, { deltaX: 0, deltaY: delta, modifiers: 2 });
      await frames(page);
    }
    await wait(page, 400);
    await frames(page);
    return zoomOf(page);
  }

  for (const platform of PLATFORMS) {
    for (const delta of [-2, -3, 2, -6]) {
      test(`a slow pinch with wheels of ${delta} zooms by the product of its steps (${platform})`, async (t) => {
        const page = await open(t, platform, 2);
        const [fit, scale] = await zoomOf(page);
        assert.equal(fit, null);
        const ideal = scale * Math.exp((-delta * 40) / 200);
        const [zoom, now] = await pinch(page, delta);
        assert.notEqual(zoom, null, `the pinch left the zoom at Fit, ${scale}, instead of about ${ideal.toFixed(2)}`);
        // the zoom is a hundredth, floored once at the end of each frame
        assert.ok(Math.abs(zoom - ideal) <= 0.02, `the zoom is ${zoom} instead of about ${ideal.toFixed(2)}`);
        assert.equal(now, zoom);
      });
    }

    test(`a wheel with Ctrl during the drag of a figure keeps the point grabbed under the pointer (${platform})`, async (t) => {
      const page = await open(t, platform, 4);
      const IMG = '.reveal section.present figure.figure-box img.for-dark';
      const box = `(() => { const r = document.querySelector('${IMG}').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, scale: window.BeesonEditorShell.stage.scale }; })()`;
      const figure = `document.querySelector('${IMG}').closest('figure')`;
      await click(page, IMG);
      await frames(page);
      const b0 = await page.evaluate(box);
      const px = b0.left + b0.width / 2;
      const py = b0.top + 40;
      // grab is the offset of the pointer from the left edge of the picture, in slide px
      const grab = (px - b0.left) / b0.scale;
      await mouse(page, 'mouseMoved', px, py);
      await mouse(page, 'mousePressed', px, py, { button: 'left', buttons: 1, clickCount: 1 });
      for (let k = 1; k <= 5; k++) {
        await mouse(page, 'mouseMoved', px - 10 * k, py, { button: 'left', buttons: 1 });
        await frames(page);
      }
      await mouse(page, 'mouseWheel', px - 50, py, { deltaX: 0, deltaY: -40, modifiers: 2, buttons: 1 });
      await frames(page);
      await wait(page, 300);
      // a pointer sends a move at the same point after a zoom
      await mouse(page, 'mouseMoved', px - 50, py, { button: 'left', buttons: 1 });
      await frames(page);
      const b1 = await page.evaluate(box);
      assert.ok(b1.scale > b0.scale + 0.05, `the wheel did not zoom in, at ${b1.scale}`);
      const at = px - 50 - grab * b1.scale;
      assert.ok(Math.abs(b1.left - at) <= 3, `the picture is at ${b1.left.toFixed(1)} px after the zoom instead of ${at.toFixed(1)}`);
      for (let k = 6; k <= 10; k++) {
        await mouse(page, 'mouseMoved', px - 10 * k, py, { button: 'left', buttons: 1 });
        await frames(page);
      }
      await mouse(page, 'mouseReleased', px - 100, py, { button: 'left', clickCount: 1 });
      await frames(page);
      await wait(page, 400);
      const b2 = await page.evaluate(box);
      const end = px - 100 - grab * b2.scale;
      assert.ok(Math.abs(b2.left - end) <= 3, `the picture is at ${b2.left.toFixed(1)} px at the release instead of ${end.toFixed(1)}`);
      // 50 px to the left at the scale of the press, and 50 px more at the scale of the zoom
      const x = Number(/translate:\s*(-?[\d.]+)px/.exec(await page.evaluate(`${figure}.getAttribute('style')`))?.[1]);
      const want = -50 / b0.scale - 50 / b1.scale;
      assert.ok(Math.abs(x - want) <= 4, `the translate is ${x} px instead of about ${want.toFixed(0)}`);
      await page.evaluate('window.BeesonEditor.exec("edit.undo")');
      await byteExact(page);
      await page.evaluate('window.BeesonEditor.exec("edit.redo")');
      assert.match(await page.evaluate(`${figure}.getAttribute('style')`), new RegExp(`translate: ${x}px`));
    });
  }
});

// regression tests of R19.4 on both platforms. at Fit, the slide stays at its place while the room
// past it shrinks after a drop, an undo, or a click on the picture (D8). a grip of an object
// selected with a group scales the group as one about its frame (D9)
describe('the slide kept in place at Fit', () => {
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
  const near = (a, b, d) => Math.abs(a - b) <= d;
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });

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

  // the upper left corner of the slide in CSS px
  const slideAt = (page) => page.evaluate(`(() => { const r = document.querySelector('.reveal .slides').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
  const blockAt = (page, selector) => page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 }; })()`);
  const rectOf = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);

  for (const platform of PLATFORMS) {
    // the modifier that turns the snap off in a drag
    const free = platform === 'mac' ? 'Mod' : 'Alt';

    // D8: with the figure past the left edge of the slide, each drop 40 px to the right moved the
    // slide 40 px to the right, since the room left of it shrank twice
    test(`at Fit the slide stays at its place while the room left of it shrinks after a drop and an undo (${platform})`, async (t) => {
      const page = await load(t, platform);
      const rest = await slideAt(page);
      await click(page, IMG);
      await typeField(page, 'x', -300);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await slideAt(page), rest, 'the slide moved when the figure was put past its left edge');
      for (let n = 1; n <= 3; n++) {
        const at = await rectOf(page, IMG);
        await drag(page, { x: at.left + at.width / 2, y: at.top + at.height / 2 }, { dx: 40, modifiers: free });
        await frames(page);
        const now = await slideAt(page);
        assert.ok(near(now.x, rest.x, 0.5) && near(now.y, rest.y, 0.5), `after drop ${n} the slide is at ${js(now)}, and at ${js(rest)} at Fit`);
      }
      await undo(page);
      await frames(page);
      const now = await slideAt(page);
      assert.ok(near(now.x, rest.x, 0.5) && near(now.y, rest.y, 0.5), `after the undo the slide is at ${js(now)}, and at ${js(rest)} at Fit`);
      assert.deepEqual(errors(page), []);
    });

    test(`at Fit the slide stays at its place when the picture of a figure past its edge is selected (${platform})`, async (t) => {
      const page = await load(t, platform);
      const rest = await slideAt(page);
      await click(page, IMG);
      await typeField(page, 'x', -200);
      await press(page, 'Escape');
      await frames(page);
      await click(page, IMG);
      await frames(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['img']);
      const now = await slideAt(page);
      assert.ok(near(now.x, rest.x, 0.5) && near(now.y, rest.y, 0.5), `with the picture selected the slide is at ${js(now)}, and at ${js(rest)} at Fit`);
      await press(page, 'Escape');
      await frames(page);
      const then = await slideAt(page);
      assert.ok(near(then.x, rest.x, 0.5) && near(then.y, rest.y, 0.5), `after Esc the slide is at ${js(then)}, and at ${js(rest)} at Fit`);
      assert.deepEqual(errors(page), []);
    });

    // D9: a grip of the heading selected with the group of the paragraph and the figure resized each
    // member about its own anchor, and the figure moved against the paragraph
    for (const [handle, dx] of [['e', -80], ['w', 80]]) {
      test(`the grip ${handle} of an object selected with a group scales the group as one about its frame (${platform})`, async (t) => {
        const page = await load(t, platform);
        await click(page, IMG);
        await click(page, await blockAt(page, ':scope > p'), { modifiers: 'Shift' });
        await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
        await frames(page);
        const grouped = await render(page);
        await click(page, await blockAt(page, ':scope > h2'), { modifiers: 'Shift' });
        await frames(page);
        assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 3);
        const P = 'section.present > p';
        const measure = async () => ({ p: await rectOf(page, P), img: await rectOf(page, IMG) });
        const was = await measure();
        const g = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-grip[data-handle=${handle}]')].find((x) => !x.hidden && !x.dataset.group); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await mouse(page, 'mouseMoved', g.x, g.y);
        await mouse(page, 'mousePressed', g.x, g.y, { button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 8; i++) await mouse(page, 'mouseMoved', g.x + (dx * i) / 8, g.y, { button: 'left', buttons: 1 });
        await frames(page);
        await mouse(page, 'mouseReleased', g.x + dx, g.y, { button: 'left', clickCount: 1 });
        await frames(page);
        const now = await measure();
        const k = now.img.width / was.img.width;
        assert.ok(k < 0.98, `the group was not scaled: ${js({ was, now })}`);
        assert.ok(near(now.p.width / was.p.width, k, 0.02), `the paragraph is scaled by ${now.p.width / was.p.width} and the figure by ${k}`);
        // the center of the picture keeps its place to the upper left corner of the paragraph, scaled by k
        const dx0 = was.img.left + was.img.width / 2 - was.p.left, dy0 = was.img.top + was.img.height / 2 - was.p.top;
        const dx1 = now.img.left + now.img.width / 2 - now.p.left, dy1 = now.img.top + now.img.height / 2 - now.p.top;
        assert.ok(near(dx1, dx0 * k, 3) && near(dy1, dy0 * k, 3), `the picture to the paragraph is ${js([dx1, dy1])}, and ${js([dx0 * k, dy0 * k])} scaled by ${k}`);
        const edited = await render(page);
        assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 3);
        await undo(page);
        assert.equal(await render(page), grouped);
        await redo(page);
        assert.equal(await render(page), edited);
        const { text } = await saveAndReopen(page, `r19-4-group-follow-${handle}-${platform}.html`);
        assert.equal(text, edited);
        assert.deepEqual(errors(page), []);
      });
    }
  }
});
