// the frame of a figure around its shown picture and its caption, as used by the fields, Align,
// Distribute, the snap, and the resize grips, also for a turned figure, and a plot handled as an
// opaque figure

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { byteExact, center, click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';

// regression tests of R8.7 on both platforms and in both modes, with trusted input. the box of a
// figure is its frame, i.e. its shown picture with the caption that it holds, as the frame with its
// grips is drawn, in the X and Y fields, the readouts, Align, Distribute, the snap, Zoom to
// Selection, a group, and Size and Position…. the figures are a pair of images and one image, in a
// figure box of a content slide and in the plate of a figure slide. after each command the file is
// checked byte for byte after an undo and the edit again after a redo
describe('the figure frame in fields, Align, and snap', () => {
  const PLATFORMS = ['mac', 'other'];
  const MODES = ['dark', 'light'];
  const DECK = 'test/pages/editor-r8-5.html';
  const FIGURE_BOX_PAIR = 0, FIGURE_BOX_ONE = 1, PLATE_PAIR = 2, PLATE_ONE = 3;
  const FIGURES = [FIGURE_BOX_PAIR, FIGURE_BOX_ONE, PLATE_PAIR, PLATE_ONE];
  const NAMES = ['a pair in a zone', 'one image in a zone', 'a pair in a plate', 'one image in a plate'];
  const IMG = '.reveal section.present img';
  const HEADING = '.reveal section.present > h2';
  const FRAME = '.beeson-overlay > .beeson-frame.selected';
  const PANEL = '#beeson-edit-panel-format';
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const SOURCE = readFileSync(DECK, 'utf8');
  const SLIDE = { width: 1920, height: 1080 };

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
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const near = (a, b, by = 1) => Math.abs(a - b) <= by;
  const show = (b) => `${Math.round(b.left)}, ${Math.round(b.top)}, ${Math.round(b.width)} × ${Math.round(b.height)}`;

  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => [el.localName, ...[...el.classList].filter((c) => /^(figure-box|plate|caption|for-dark|for-light)$/.test(c))].join('.'))`);

  // the upper left corner of the slide on the screen, and the screen px per slide px in k
  const SCALE = `(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); return { left: r.left, top: r.top, k: r.width / s.offsetWidth }; })()`;
  const scaleOf = (page) => page.evaluate(SCALE);

  // the box of the first shown element of selector, or of the frame of the selected element el, in slide px
  // the frame of a figure with a caption, or of a group that holds one, is drawn CAPTIONED px outside
  // it, and measured without them
  const CAPTIONED = 8;
  const inset = (el) => `(${el}.querySelector(':scope > figcaption, :scope > .caption') ? ${CAPTIONED} : 0)`;
  const boxIn = (page, selector) => page.evaluate(`(() => {
  const f = ${SCALE};
  const sel = window.BeesonEditor.selection();
  const d = ${js(selector)} === ${js(FRAME)} && sel.length === 1 ? ${inset('sel[0]')} : ${js(selector)}.endsWith('.union') ? Math.max(0, ...sel.map((e) => ${inset('e')})) : 0;
  const r = [...document.querySelectorAll(${js(selector)})].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect()).find((r) => r.width);
  return r ? { left: (r.left + d - f.left) / f.k, top: (r.top + d - f.top) / f.k, width: (r.width - 2 * d) / f.k, height: (r.height - 2 * d) / f.k } : null;
})()`);
  const frameOfFigure = (page) => page.evaluate(`(() => {
  const f = ${SCALE};
  const sel = window.BeesonEditor.selection(), i = sel.findIndex((el) => el.matches('figure, .plate')), d = ${inset('sel[i]')};
  const r = [...document.querySelectorAll(${js(FRAME)})][i].getBoundingClientRect();
  return { left: (r.left + d - f.left) / f.k, top: (r.top + d - f.top) / f.k, width: (r.width - 2 * d) / f.k, height: (r.height - 2 * d) / f.k };
})()`);
  const right = (b) => b.left + b.width;
  const bottom = (b) => b.top + b.height;
  const cx = (b) => b.left + b.width / 2;
  const cy = (b) => b.top + b.height / 2;
  const toScreen = (f, x, y) => ({ x: f.left + x * f.k, y: f.top + y * f.k });

  async function load(t, platform, mode, n, deck = DECK) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    // without this, headless Chrome cancels the file chooser, and the cancel races the file of choose
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    if ((await page.evaluate('Beeson.theme.get()')) !== mode) await page.evaluate('Beeson.theme.toggle()');
    page.source = deck === DECK ? SOURCE : readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    page.figure = n === PLATE_PAIR || n === PLATE_ONE ? 'div.plate' : 'figure.figure-box';
    return page;
  }

  // the figure selected by a click on its picture
  async function pick(page) {
    await page.evaluate('document.activeElement instanceof HTMLElement && document.activeElement.blur()');
    for (let i = 0; i < 3 && (await selected(page)).length; i++) await exec(page, 'selection.clear');
    await frames(page);
    await clickText(page, IMG);
    await frames(page);
    assert.deepEqual(await selected(page), [page.figure], 'the figure is not selected by a click on its picture');
  }

  // the edit is in the scope rule wherever the text before it is
  function inScope(edited, source) {
    const now = textProblems(edited, THEME);
    for (const p of textProblems(source, THEME)) {
      const i = now.indexOf(p);
      if (i >= 0) now.splice(i, 1);
    }
    assert.deepEqual(now, [], 'the edit writes outside the scope rule');
  }

  // the edit, the file byte for byte after an undo, the edit again after a redo, and the file again
  // after a second undo, from which the next command starts
  async function roundTrip(page, edited) {
    assert.notEqual(edited, page.source, 'the command does not change the file');
    inScope(edited, page.source);
    await undo(page);
    await frames(page);
    await byteExact(page);
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited, 'a redo does not write the edit again');
    await undo(page);
    await frames(page);
    await byteExact(page);
  }

  const showTab = async (page, name) => {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === ${js(name)})?.click()`);
    await frames(page);
  };
  async function fieldValue(page, id) {
    await showTab(page, 'Arrange');
    return Number(await page.evaluate(`document.querySelector('#beeson-edit-num-${id}')?.value`));
  }
  async function typeField(page, id, value) {
    await showTab(page, 'Arrange');
    const input = `#beeson-edit-num-${id}`;
    assert.equal(await page.evaluate(`!!document.querySelector('${input}') && !document.querySelector('${input}').disabled`), true, `the field ${id} is not enabled`);
    await page.evaluate(`(() => { const i = document.querySelector('${input}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
    await frames(page);
  }

  // the edge or center of box b that Align puts at that of the box ref, by the side aligned to
  const ALIGNED = {
    left: (b, ref) => [b.left, ref.left],
    center: (b, ref) => [cx(b), cx(ref)],
    right: (b, ref) => [right(b), right(ref)],
    top: (b, ref) => [b.top, ref.top],
    middle: (b, ref) => [cy(b), cy(ref)],
    bottom: (b, ref) => [bottom(b), bottom(ref)],
  };
  const WHOLE = { left: 0, top: 0, width: SLIDE.width, height: SLIDE.height };

  // the readout of the frames, next to the pointer or the frame
  const readout = (page) => page.evaluate(`(() => { const r = document.querySelector('.beeson-overlay > .beeson-offset'); return r && !r.hidden ? r.textContent : null; })()`);

  // whether a vertical guide is drawn at x, in slide px
  const guideAt = (page, f, x) => page.evaluate(`[...document.querySelectorAll('.beeson-overlay > .beeson-guide.v')].some((g) => !g.hidden && Math.abs(g.getBoundingClientRect().left - ${f.left + x * f.k}) < 1.5)`);

  // a point on the text of the heading on the screen
  const headingPoint = (page) => page.evaluate(`(() => { const r = document.querySelector(${js(HEADING)}).getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);

  const release = (page, x, y, modifiers = 0) => page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, modifiers });

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`the X and Y fields, Size and Position…, Align, and Distribute take the frame of a figure, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of FIGURES) {
          const page = await load(t, platform, mode, n);
          const where = `${NAMES[n]} on ${platform} in ${mode} mode`;
          await pick(page);
          const frame = await boxIn(page, FRAME);
          assert.equal(await fieldValue(page, 'x'), Math.round(frame.left), `X of ${where}, whose frame is at ${show(frame)}`);
          assert.equal(await fieldValue(page, 'y'), Math.round(frame.top), `Y of ${where}, whose frame is at ${show(frame)}`);
          await exec(page, 'arrange.sizeAndPosition');
          await frames(page);
          assert.equal(await fieldValue(page, 'x'), Math.round(frame.left), `X after Size and Position… of ${where}`);

          for (const side of Object.keys(ALIGNED)) {
            await exec(page, `arrange.align.${side}`);
            await frames(page);
            const now = await boxIn(page, FRAME);
            const [at, to] = ALIGNED[side](now, WHOLE);
            assert.ok(near(at, to), `Align ${side} of ${where} puts its frame at ${show(now)}`);
            assert.deepEqual(await selected(page), [page.figure], `Align ${side} of ${where} changes the selection`);
            const edited = await render(page);
            // a frame at the edge already is not moved
            if (edited !== page.source) await roundTrip(page, edited);
            const back = await boxIn(page, FRAME);
            assert.ok(near(back.left, frame.left) && near(back.top, frame.top), `an undo of Align ${side} of ${where} leaves the frame at ${show(back)}`);
          }
          for (const axis of ['horizontal', 'vertical']) {
            await exec(page, `arrange.distribute.${axis}`);
            await frames(page);
            const now = await boxIn(page, FRAME);
            const [at, to] = axis === 'horizontal' ? [cx(now), SLIDE.width / 2] : [cy(now), SLIDE.height / 2];
            assert.ok(near(at, to), `Distribute ${axis} of ${where} puts its frame at ${show(now)}`);
            await roundTrip(page, await render(page));
          }
          await typeField(page, 'x', 100);
          await typeField(page, 'y', 140);
          const typed = await boxIn(page, FRAME);
          assert.ok(near(typed.left, 100) && near(typed.top, 140), `a typed X and Y of ${where} put its frame at ${show(typed)}`);
          assert.equal(await fieldValue(page, 'x'), 100);
          assert.equal(await fieldValue(page, 'y'), 140);
          // the two fields are two entries of the history
          const edited = await render(page);
          await undo(page);
          await frames(page);
          await roundTrip(page, await render(page));
          await redo(page);
          await redo(page);
          await frames(page);
          assert.equal(await render(page), edited);
          assert.deepEqual(errors(page), []);
          // closed before the next page, which would offer its unsaved edits on a dialog
          await page.close();
        }
      });

      test(`Align and Distribute of a figure with other elements take its frame, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of FIGURES) {
          const page = await load(t, platform, mode, n);
          const where = `${NAMES[n]} on ${platform} in ${mode} mode`;
          await pick(page);
          const frame = await boxIn(page, FRAME);
          const h = await boxIn(page, HEADING);
          await click(page, await headingPoint(page), { modifiers: 'Shift' });
          await frames(page);
          assert.deepEqual((await selected(page)).sort(), [page.figure, 'h2'].sort());
          await exec(page, 'arrange.alignTo.selection');
          for (const side of ['right', 'bottom']) {
            const ref = { left: 0, top: 0, width: Math.max(right(h), right(frame)), height: Math.max(bottom(h), bottom(frame)) };
            await exec(page, `arrange.align.${side}`);
            await frames(page);
            const now = await frameOfFigure(page);
            const heading = await boxIn(page, HEADING);
            const [at, to] = ALIGNED[side](now, ref);
            assert.ok(near(at, to), `Align ${side} of ${where} with the heading puts its frame at ${show(now)}, and not at ${Math.round(to)}`);
            assert.ok(near(ALIGNED[side](heading, ref)[0], to), `Align ${side} of ${where} with the heading puts the heading at ${show(heading)}`);
            await roundTrip(page, await render(page));
          }
          if (n === FIGURE_BOX_PAIR || n === FIGURE_BOX_ONE) {
            // the heading, a paragraph, and the figure distributed with the first and the last of
            // them in the order of their tops kept in place, and each kept in the span of the three
            await click(page, '.reveal section.present > p', { modifiers: 'Shift' });
            await frames(page);
            assert.equal((await selected(page)).length, 3);
            const p = await boxIn(page, '.reveal section.present > p');
            const span = [Math.min(h.top, p.top, frame.top), Math.max(bottom(h), bottom(p), bottom(frame))];
            const outer = [h, p, frame].map((b, i) => ({ b, i })).sort((a, b) => a.b.top - b.b.top || a.b.height - b.b.height);
            await exec(page, 'arrange.distribute.vertical');
            await frames(page);
            const boxes = [await boxIn(page, HEADING), await boxIn(page, '.reveal section.present > p'), await frameOfFigure(page)];
            for (const { b, i } of [outer[0], outer[2]]) assert.ok(near(boxes[i].top, b.top), `Distribute Vertically of ${where} moves an outer element from ${show(b)} to ${show(boxes[i])}`);
            for (const b of boxes) assert.ok(b.top >= span[0] - 1 && bottom(b) <= span[1] + 1, `Distribute Vertically of ${where} puts an element at ${show(b)}, outside ${span.map(Math.round).join(' to ')}`);
            await roundTrip(page, await render(page));
          }
          assert.deepEqual(errors(page), []);
          // closed before the next page, which would offer its unsaved edits on a dialog
          await page.close();
        }
      });

      test(`the readouts of a drag and a nudge, Zoom to Selection, and a group take the frame of a figure, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of FIGURES) {
          const page = await load(t, platform, mode, n);
          const where = `${NAMES[n]} on ${platform} in ${mode} mode`;
          await pick(page);
          const frame = await boxIn(page, FRAME);
          const f = await scaleOf(page);

          await press(page, 'ArrowRight');
          await frames(page);
          const nudged = await boxIn(page, FRAME);
          assert.equal(await readout(page), `x: ${Math.round(nudged.left)} px  y: ${Math.round(nudged.top)} px`, `the readout of a nudge of ${where}, whose frame is at ${show(nudged)}`);
          await roundTrip(page, await render(page));

          // a drag without the snap, with ⌘ on a Mac and Alt elsewhere
          const at = toScreen(f, cx(frame), cy(frame));
          const d = { x: 41, y: 27 };
          const free = platform === 'mac' ? 'Meta' : 'Alt';
          await drag(page, at, { dx: d.x * f.k, dy: d.y * f.k, hold: true, modifiers: free });
          const shown = await readout(page);
          await release(page, at.x + d.x * f.k, at.y + d.y * f.k, platform === 'mac' ? 4 : 1);
          await frames(page);
          assert.equal(shown, `x: ${Math.round(frame.left + d.x)} px  y: ${Math.round(frame.top + d.y)} px`, `the readout of a drag of ${where} from its frame at ${show(frame)}`);
          await roundTrip(page, await render(page));

          await exec(page, 'zoom.selection');
          await frames(page);
          const off = await page.evaluate(`(() => {
          const v = window.BeesonEditorShell.stage.viewport;
          const r = document.querySelector(${js(FRAME)}).getBoundingClientRect();
          return { x: r.left + r.width / 2 - (v.left + v.width / 2), y: r.top + r.height / 2 - (v.top + v.height / 2) };
        })()`);
          assert.ok(Math.abs(off.x) < 2 && Math.abs(off.y) < 2, `Zoom to Selection leaves the frame of ${where} off the center of the canvas by ${Math.round(off.x)}, ${Math.round(off.y)}`);
          await page.evaluate('window.BeesonEditorShell.stage.setZoom(null)');
          await frames(page);

          const h = await boxIn(page, HEADING);
          await click(page, await headingPoint(page), { modifiers: 'Shift' });
          await exec(page, 'arrange.group');
          await frames(page);
          const union = { left: Math.min(h.left, frame.left), top: Math.min(h.top, frame.top), right: Math.max(right(h), right(frame)), bottom: Math.max(bottom(h), bottom(frame)) };
          const drawn = await boxIn(page, '.beeson-overlay > .beeson-frame.union');
          assert.ok(near(drawn.left, union.left) && near(drawn.top, union.top) && near(right(drawn), union.right) && near(bottom(drawn), union.bottom), `the frame of a group of ${where} is at ${show(drawn)}`);
          assert.equal(await fieldValue(page, 'x'), Math.round(union.left), `X of a group of ${where}`);
          assert.equal(await fieldValue(page, 'y'), Math.round(union.top), `Y of a group of ${where}`);
          assert.deepEqual(errors(page), []);
          // closed before the next page, which would offer its unsaved edits on a dialog
          await page.close();
        }
      });

      test(`a drag snaps the frame of a figure, and another element to it, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of FIGURES) {
          const page = await load(t, platform, mode, n);
          const where = `${NAMES[n]} on ${platform} in ${mode} mode`;
          await pick(page);
          const frame = await boxIn(page, FRAME);
          const f = await scaleOf(page);

          // the center of the frame dragged to 2 px right of the center of the slide, nearer than any other line
          const at = toScreen(f, cx(frame), cy(frame));
          const dx = SLIDE.width / 2 + 2 - cx(frame);
          await drag(page, at, { dx: dx * f.k, dy: 0, hold: true });
          const guide = await guideAt(page, f, SLIDE.width / 2);
          const all = await page.evaluate(`[...document.querySelectorAll('.beeson-overlay > .beeson-guide')].filter((g) => !g.hidden).map((g) => { const r = g.getBoundingClientRect(); return g.classList.contains('v') ? 'x ' + Math.round((r.left - ${f.left}) / ${f.k}) : 'y ' + Math.round((r.top - ${f.top}) / ${f.k}); }).join(', ')`);
          await release(page, at.x + dx * f.k, at.y);
          await frames(page);
          const now = await boxIn(page, FRAME);
          assert.ok(near(cx(now), SLIDE.width / 2, 0.6), `a drag of ${where} to the center of the slide puts the center of its frame at ${Math.round(cx(now))}, with the guides ${all}`);
          assert.ok(guide, `a drag of ${where} to the center of the slide draws no guide at its center`);
          await roundTrip(page, await render(page));

          // the heading selected as a block and dragged by its handle to 2 px right of the center
          // of the frame
          const h = await boxIn(page, HEADING);
          await clickText(page, await headingPoint(page));
          await press(page, 'Escape');
          await frames(page);
          assert.deepEqual(await selected(page), ['h2'], 'Esc in the heading does not select it');
          const from = await page.evaluate(`(() => { const r = document.querySelector('.beeson-handle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          const hx = cx(frame) + 2 - cx(h);
          await drag(page, from, { dx: hx * f.k, dy: 0, hold: true });
          const line = await guideAt(page, f, cx(frame));
          await release(page, from.x + hx * f.k, from.y);
          await frames(page);
          const moved = await boxIn(page, HEADING);
          assert.ok(near(cx(moved), cx(frame), 0.6), `a drag of the heading to the center of the frame of ${where} at ${Math.round(cx(frame))} puts its center at ${Math.round(cx(moved))}`);
          assert.ok(line, `a drag of the heading to the center of the frame of ${where} draws no guide there`);
          await roundTrip(page, await render(page));
          assert.deepEqual(errors(page), []);
          // closed before the next page, which would offer its unsaved edits on a dialog
          await page.close();
        }
      });
    }
  }

  // the items of the open context menu, each with its text and whether it is dimmed
  const menuItems = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].filter((i) => i.getClientRects().length).map((i) => ({ text: i.textContent.trim().replace(/\\s+/g, ' '), off: i.classList.contains('disabled') || i.getAttribute('aria-disabled') === 'true' }))`);
  const KIND_ITEMS = ['Replace Image…', 'Edit Alt Text…', 'Edit Mask'];

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`the context menu of a locked figure shows Replace Image…, Edit Alt Text…, and Edit Mask dimmed, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of FIGURES) {
          const page = await load(t, platform, mode, n);
          const where = `${NAMES[n]} on ${platform} in ${mode} mode`;
          await pick(page);
          await click(page, IMG, { button: 'right' });
          await frames(page);
          const open = await menuItems(page);
          for (const name of KIND_ITEMS) assert.equal(open.find((i) => i.text.startsWith(name))?.off, false, `${name} is not live in the menu of ${where}`);
          await press(page, 'Escape');
          await exec(page, 'arrange.lock');
          await frames(page);
          const locked = await render(page);
          await click(page, IMG, { button: 'right' });
          await frames(page);
          const items = await menuItems(page);
          for (const name of KIND_ITEMS) assert.equal(items.find((i) => i.text.startsWith(name))?.off, true, `${name} is not shown dimmed in the menu of ${where} once it is locked, among ${items.map((i) => i.text).join(', ')}`);
          await press(page, 'Escape');
          await frames(page);
          await roundTrip(page, locked);
          assert.deepEqual(errors(page), []);
          await page.close();
        }
      });
    }
  }

  const STEPPED = 5;
  const ADD = 'Add as Last Step';

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`a figure whose images are a step is not offered Add as Last Step, and one that is not a step is, on ${platform} in ${mode} mode`, async (t) => {
        const page = await load(t, platform, mode, STEPPED);
        page.figure = 'figure.figure-box';
        await pick(page);
        assert.equal((await state(page, 'steps.add')).enabled, false, 'Add as Last Step is enabled on a figure whose images are a step');
        await click(page, IMG, { button: 'right' });
        await frames(page);
        const item = (await menuItems(page)).find((i) => i.text.startsWith(ADD));
        assert.ok(!item || item.off, `the menu of a figure whose images are a step offers ${ADD}`);
        await press(page, 'Escape');
        await page.close();

        // a figure without a step takes it on its tag
        const other = await load(t, platform, mode, FIGURE_BOX_ONE);
        await pick(other);
        assert.equal((await state(other, 'steps.add')).enabled, true, `${ADD} is dimmed on a figure without a step`);
        await exec(other, 'steps.add');
        await frames(other);
        const edited = await render(other);
        assert.equal(edited, SOURCE.replace('<figure class="figure-box">\n        <img src="../../demo/figure-light.png" alt="A figure in both modes">', '<figure class="figure-box fragment" data-fragment-index="1">\n        <img src="../../demo/figure-light.png" alt="A figure in both modes">'));
        assert.equal((await state(other, 'steps.add')).enabled, false, `${ADD} is enabled on a figure that it made a step`);
        await roundTrip(other, edited);
        assert.deepEqual(errors(other), []);
      });
    }
  }

  for (const platform of PLATFORMS) {
    test(`Show with Slide on a figure whose images are a step takes the step off both images, on ${platform}`, async (t) => {
      for (const mode of MODES) {
        const page = await load(t, platform, mode, STEPPED);
        page.figure = 'figure.figure-box';
        await pick(page);
        assert.equal((await state(page, 'steps.remove')).enabled, true, 'Show with Slide is dimmed on a figure whose images are a step');
        await exec(page, 'steps.remove');
        await frames(page);
        const edited = await render(page);
        const tags = [...edited.matchAll(/<img class="for-(dark|light)[^"]*" [^>]*data-id="curves"[^>]*>/g)].map((m) => m[0]);
        assert.equal(tags.length, 2);
        for (const tag of tags) assert.ok(!/fragment/.test(tag), `Show with Slide leaves the step on ${tag}`);
        assert.equal((await state(page, 'steps.add')).enabled, true, `${ADD} is dimmed once the figure is not a step`);
        await roundTrip(page, edited);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }

  // a trusted press of the command modifier with a letter, sent with the editing command that the
  // browser makes of it. Chrome on a Mac turns ⌘X into Cut in its Edit menu, and Chrome on Windows
  // and Linux turns Ctrl+X into Cut in the page, and over the DevTools protocol a key without its
  // command is not turned into one on a Mac
  async function pressEdit(page, platform, letter, command) {
    const base = { key: letter, code: `Key${letter.toUpperCase()}`, windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0), modifiers: platform === 'mac' ? 4 : 2 };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [command] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await page.evaluate('new Promise((d) => setTimeout(d, 100))');
    await frames(page);
  }

  const EMPTY = 4;
  const count = (text, part) => text.split(part).length - 1;

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`Cut, Copy, and Paste of a figure by their keys, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, PLATE_ONE]) {
          const page = await load(t, platform, mode, n);
          const where = `${NAMES[n]} on ${platform} in ${mode} mode`;
          await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
          await pick(page);
          const caption = n === FIGURE_BOX_PAIR ? 'A caption under the pair.' : 'A caption of the one image in a plate.';
          const img = n === FIGURE_BOX_PAIR ? '<img class="for-dark"' : '<img src="../../demo/figure-light.png" alt="A plate in both modes">';

          await pressEdit(page, platform, 'x', 'cut');
          const cut = await render(page);
          assert.equal(count(slideOf(cut, n), img), 0, `the key of Cut leaves ${where}`);
          assert.deepEqual(await selected(page), [], `the key of Cut leaves ${where} selected`);
          await undo(page);
          await frames(page);
          await byteExact(page);
          assert.deepEqual(await selected(page), [page.figure], `an undo of a Cut of ${where} does not select it again`);
          await redo(page);
          await frames(page);
          assert.equal(await render(page), cut);
          await undo(page);
          await frames(page);

          await pressEdit(page, platform, 'c', 'copy');
          await byteExact(page);
          await page.evaluate(`Reveal.slide(${EMPTY})`);
          await frames(page);
          await exec(page, 'selection.clear');
          await pressEdit(page, platform, 'v', 'paste');
          const pasted = await render(page);
          assert.equal(count(slideOf(pasted, EMPTY), img), 1, `the keys of Copy and Paste do not put ${where} on another slide`);
          assert.equal(count(slideOf(pasted, EMPTY), caption), n === FIGURE_BOX_PAIR ? 1 : 0, `the keys of Copy and Paste of ${where} do not bring the caption that it holds`);
          // a plate pasted onto a content slide is made a figure box
          assert.deepEqual(await selected(page), [n === FIGURE_BOX_PAIR ? 'figure.figure-box' : 'div.figure-box'], `the figure pasted from ${where} is not selected`);
          await roundTrip(page, pasted);
          assert.deepEqual(errors(page), []);
          await page.close();
        }
      });
    }
  }

  // the text of slide n
  function slideOf(text, n) {
    const at = [...text.matchAll(/<section[ >]/g)][n].index;
    return text.slice(at, text.indexOf('</section>', at));
  }

  // the file chosen for an insert of a picture, given to the file chooser of the page
  async function choose(page, id, file) {
    const chosen = exec(page, id);
    await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
    const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
    await page.send('DOM.setFileInputFiles', { files: [resolve(file)], objectId: result.objectId });
    await chosen;
  }

  // each insert whose kind the placeholder of an empty slot offers, as its name, its run, and the
  // start of the tag of its element in the file
  const SLOTTED = [
    ['Insert > Table', (page) => exec(page, 'insert.table', { rows: 3, columns: 3 }), 'table', '<table'],
    ['Insert > QR Code', (page) => exec(page, 'insert.qr'), '.qr', '<div class="qr"'],
    ['Insert > Image', (page) => choose(page, 'insert.image', 'demo/figure-light.png'), 'img', '<img'],
    ['Insert > Video', (page) => choose(page, 'insert.video', 'demo/clip-dark.mp4'), 'video', '<video'],
  ];
  const SLOT_OF = { figure: '.plate', split: '.figure-box' };
  const TAG_OF = { figure: '<div class="plate">', split: '<div class="figure-box">' };
  const holders = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present > :is(.figure-box, .plate)')].map((s) => !!s.querySelector(':scope > .beeson-placeholder'))`);
  const holds = (page, slot, el) => page.evaluate(`[...document.querySelectorAll('.reveal section.present > ${slot}')].map((s) => !!s.querySelector(':scope > ${el}'))`);
  const settle = async (page) => {
    await page.evaluate('new Promise((d) => setTimeout(d, 300))');
    await frames(page);
  };

  // gap 5 of R8.7: Insert > Table and Insert > QR Code put their element over the empty slot of a
  // new figure or split slide, with the placeholder of the slot drawn through it. each insert that
  // the placeholder offers fills the slot, as the icon of its kind does, and the placeholder is gone
  for (const platform of PLATFORMS) {
    for (const layout of ['figure', 'split']) {
      test(`every insert of a kind of the placeholder fills the empty slot of a new ${layout} slide, on ${platform}`, async (t) => {
        const page = await load(t, platform, 'dark', 0);
        const slot = SLOT_OF[layout];
        for (const [what, run, el, tag] of SLOTTED) {
          await exec(page, `slide.new.${layout}`);
          await frames(page);
          // the caret of the new slide is in its title, and the second Esc leaves its block
          await press(page, 'Escape');
          await press(page, 'Escape');
          await frames(page);
          const n = await page.evaluate('Reveal.getIndices().h');
          const before = await render(page);
          assert.deepEqual(await holders(page), [true], `the new ${layout} slide does not show the placeholder of its slot`);
          await run(page);
          await settle(page);
          const edited = await render(page);
          assert.deepEqual(await holds(page, slot, el), [true], `${what} does not put its element into the ${slot} of a new ${layout} slide`);
          assert.ok(new RegExp(`${TAG_OF[layout]}\\s*${tag}`).test(slideOf(edited, n)), `${what} does not write its element into the ${slot} of the file:\n${slideOf(edited, n)}`);
          assert.deepEqual(await holders(page), [false], `${what} leaves the placeholder of the ${slot} of a new ${layout} slide`);
          inScope(edited, before);
          await undo(page);
          await settle(page);
          assert.equal(await render(page), before, `an undo of ${what} does not give the file back`);
          assert.deepEqual(await holders(page), [true], `an undo of ${what} does not show the placeholder again`);
          await redo(page);
          await settle(page);
          assert.equal(await render(page), edited, `a redo of ${what} does not write it again`);
          assert.deepEqual(await holds(page, slot, el), [true], `a redo of ${what} does not put its element into the ${slot}`);
          assert.deepEqual(await holders(page), [false], `a redo of ${what} shows the placeholder again`);
        }
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // on a slide with two empty slots, an insert fills the first, and the icon of a slot fills its slot
  const TWO = 'test/pages/editor-two-slots.html';
  for (const platform of PLATFORMS) {
    test(`an insert fills the first of two empty slots and an icon fills its own, on ${platform}`, async (t) => {
      const page = await load(t, platform, 'dark', 0, TWO);
      const runs = [
        ...SLOTTED.map(([what, run, el, tag]) => [what, run, el, tag, [true, false]]),
        ['the QR icon of the second slot', (page) => clickText(page, '.reveal section.present > .figure-box:last-of-type .beeson-placeholder button[data-insert="qr"]'), '.qr', '<div class="qr"', [false, true]],
      ];
      for (const [what, run, el, tag, into] of runs) {
        await exec(page, 'selection.clear');
        await frames(page);
        assert.deepEqual(await holders(page), [true, true]);
        await run(page);
        await settle(page);
        const edited = await render(page);
        assert.deepEqual(await holds(page, '.figure-box', el), into, `${what} does not fill the slot ${into.indexOf(true) + 1} of two`);
        assert.deepEqual(await holders(page), into.map((x) => !x), `${what} does not take off the placeholder of the slot it fills only`);
        const figureBoxes = [...slideOf(edited, 0).matchAll(/<div class="figure-box"[^>]*>([\s\S]*?)<\/div>\n/g)].map((m) => m[1].trimStart().startsWith(tag));
        assert.deepEqual(figureBoxes, into, `${what} does not write its element into the slot ${into.indexOf(true) + 1} of the file:\n${slideOf(edited, 0)}`);
        inScope(edited, page.source);
        await undo(page);
        await settle(page);
        await byteExact(page);
        await redo(page);
        await settle(page);
        assert.equal(await render(page), edited, `a redo of ${what} does not write it again`);
        await undo(page);
        await settle(page);
        await byteExact(page);
      }
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R9.1 on both platforms and in both modes, with trusted input. a resize of a
// figure by each of its grips draws the frame around the picture and its caption at their new size,
// with the grip at the pointer, the side across from it in place, and the caption under the picture
// by the layout. a turned figure with its caption is framed turned with both, a turned group keeps
// its frame turned with its grips on it, and its W and H fields scale it, and a turn of a group turns
// the image of each mode. after each edit the file is checked byte for byte after an undo and the
// edit again after a redo, and a saved text is opened again without problems
describe('a figure resized by each of its grips', () => {
  const PLATFORMS = ['mac', 'other'];
  const MODES = ['dark', 'light'];
  const DECK = 'test/pages/editor-r8-5.html';
  const GROUP_DECK = 'test/pages/editor-r9-1.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const QR = '.reveal section.present > .qr';
  const FIGURE_BOX_PAIR = 0, FIGURE_BOX_ONE = 1, PLATE_PAIR = 2, PLATE_ONE = 3;
  const FIGURES = [FIGURE_BOX_PAIR, FIGURE_BOX_ONE, PLATE_PAIR, PLATE_ONE];
  const NAMES = ['a pair in a zone', 'one image in a zone', 'a pair in a plate', 'one image in a plate'];
  const PAIRS = [FIGURE_BOX_PAIR, PLATE_PAIR];
  const IMG = '.reveal section.present img';
  const FRAME = '.beeson-overlay > .beeson-frame.selected';
  const UNION = '.beeson-overlay > .beeson-frame.union';
  const PANEL = '#beeson-edit-panel-format';
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  // the side of the frame that each grip moves on each axis, -1 at the left or top
  const SIGN = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
  // the modifier that turns the snap off, held in every drag so that the pointer alone sets the size
  const FREE = { mac: 'Meta', other: 'Alt' };
  // the gap of the theme between a picture and its caption in a figure box, in slide px
  const GAP = 16;
  // the screen px by which the frame of a figure with a caption stands outside it, clear of the text
  // of its caption, as the frame of a text box in Keynote stands off its text (K58)
  const INSET = 8;
  const TOL = 1.5;
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));

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
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const near = (a, b, by = TOL) => Math.abs(a - b) <= by;
  const show = (b) => (b ? `${Math.round(b.left)}, ${Math.round(b.top)}, ${Math.round(b.width)} × ${Math.round(b.height)}` : 'nothing');
  const right = (b) => b.left + b.width;
  const bottom = (b) => b.top + b.height;
  const cx = (b) => b.left + b.width / 2;
  const cy = (b) => b.top + b.height / 2;
  const sameBox = (a, b, by = TOL) => !!a && !!b && near(a.left, b.left, by) && near(a.top, b.top, by) && near(right(a), right(b), by) && near(bottom(a), bottom(b), by);
  const union = (...boxes) => {
    const left = Math.min(...boxes.map((b) => b.left)), top = Math.min(...boxes.map((b) => b.top));
    return { left, top, width: Math.max(...boxes.map(right)) - left, height: Math.max(...boxes.map(bottom)) - top };
  };
  const reach = (points) => union(...points.map((p) => ({ left: p.x, top: p.y, width: 0, height: 0 })));
  const grow = (b, by) => ({ left: b.left - by, top: b.top - by, width: b.width + 2 * by, height: b.height + 2 * by });
  // the frame drawn around the box pic of a picture and the caption of now
  const framed = (pic, now) => (now.cap ? grow(union(pic, now.cap), INSET) : pic);
  // the point x, y turned by deg about the center of box
  const turned = (box, deg, x, y) => {
    const a = (deg * Math.PI) / 180, c = { x: cx(box), y: cy(box) };
    return { x: c.x + (x - c.x) * Math.cos(a) - (y - c.y) * Math.sin(a), y: c.y + (x - c.x) * Math.sin(a) + (y - c.y) * Math.cos(a) };
  };
  // the place of grip h on box turned by deg
  const gripOn = (box, deg, h) => {
    const [sx, sy] = SIGN[h];
    return turned(box, deg, sx < 0 ? box.left : sx > 0 ? right(box) : cx(box), sy < 0 ? box.top : sy > 0 ? bottom(box) : cy(box));
  };

  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => [el.localName, ...[...el.classList].filter((c) => /^(figure-box|plate|caption|for-dark|for-light)$/.test(c))].join('.'))`);

  // what is drawn, in screen px: the scale of the slide, the corners of the picture of each shown
  // image, fitted by object-fit and turned by its rotate, the box of the image without its rotate,
  // the caption that a figure box holds with the angle of the figure box, the frame of the selection with its
  // size without its rotate, the frame of a group with its angle, and the grips
  const LOOK = `(() => {
  const s = document.querySelector('.reveal .slides');
  const k = s.getBoundingClientRect().width / s.offsetWidth;
  const rect = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; };
  const shown = (sel) => [...document.querySelectorAll(sel)].filter((e) => !e.hidden && e.getBoundingClientRect().width);
  const angle = (e) => parseFloat(getComputedStyle(e).rotate) || 0;
  const pictures = shown(${js(IMG)}).map((img) => {
    const b = img.getBoundingClientRect(), st = getComputedStyle(img);
    const w0 = img.offsetWidth * k, h0 = img.offsetHeight * k;
    let w = w0, h = h0, dx = 0, dy = 0;
    if (st.objectFit === 'contain') {
      const q = Math.min(w0 / img.naturalWidth, h0 / img.naturalHeight);
      w = img.naturalWidth * q;
      h = img.naturalHeight * q;
      const [px, py] = st.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
      dx = (w0 - w) * px + w / 2 - w0 / 2;
      dy = (h0 - h) * py + h / 2 - h0 / 2;
    }
    const a = angle(img) * Math.PI / 180, c = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const x = dx + sx * w / 2, y = dy + sy * h / 2;
      return { x: c.x + x * Math.cos(a) - y * Math.sin(a), y: c.y + x * Math.sin(a) + y * Math.cos(a) };
    });
    return { corners, deg: angle(img), width: w, height: h, layout: { left: c.x - w0 / 2, top: c.y - h0 / 2, width: w0, height: h0 } };
  });
  const cap = document.querySelector('.reveal section.present .figure-box > figcaption, .reveal section.present .figure-box > .caption');
  const text = cap && document.createRange();
  text?.selectNodeContents(cap);
  const frame = shown(${js(FRAME)})[0] ?? null;
  const u = shown(${js(UNION)})[0] ?? null;
  const grips = Object.fromEntries(shown('.beeson-grip').map((g) => { const q = g.getBoundingClientRect(); return [g.dataset.handle, { x: q.left + q.width / 2, y: q.top + q.height / 2 }]; }));
  return {
    k, origin: rect(s), pictures, cap: rect(cap), capDeg: cap ? angle(cap) : 0, text: text ? rect(text) : null,
    frame: rect(frame), frameDeg: frame ? angle(frame) : 0, frameSize: frame ? { width: frame.offsetWidth, height: frame.offsetHeight } : null, figDeg: cap ? angle(cap.parentElement) : 0,
    group: u ? { left: parseFloat(u.style.left), top: parseFloat(u.style.top), width: parseFloat(u.style.width), height: parseFloat(u.style.height) } : null,
    groupDeg: u ? angle(u) : 0,
    grips,
  };
})()`;
  async function look(page) {
    const out = await page.evaluate(LOOK);
    // the box of the first picture, upright around its corners
    out.pic = out.pictures.length ? reach(out.pictures[0].corners) : null;
    return out;
  }

  async function load(t, platform, mode, n, deck = DECK) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    if ((await page.evaluate('Beeson.theme.get()')) !== mode) await page.evaluate('Beeson.theme.toggle()');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    page.figure = n === PLATE_PAIR || n === PLATE_ONE ? 'div.plate' : 'figure.figure-box';
    return page;
  }

  // the figure selected by a click on its picture, or the picture by a second click
  async function pick(page, from) {
    await page.evaluate('document.activeElement instanceof HTMLElement && document.activeElement.blur()');
    for (let i = 0; i < 3 && (await selected(page)).length; i++) await exec(page, 'selection.clear');
    await frames(page);
    await click(page, IMG);
    await frames(page);
    if (from === 'picture') {
      await click(page, IMG);
      await frames(page);
      assert.match((await selected(page)).join(), /^img(\.for-(dark|light))?$/, 'the picture is not selected by a second click on it');
    } else assert.deepEqual(await selected(page), [page.figure], 'the figure is not selected by a click on its picture');
  }

  // the edit is in the scope rule wherever the text before it is
  function inScope(edited, source) {
    const now = textProblems(edited, THEME);
    for (const p of textProblems(source, THEME)) {
      const i = now.indexOf(p);
      if (i >= 0) now.splice(i, 1);
    }
    assert.deepEqual(now, [], 'the edit writes outside the scope rule');
  }

  // the edit, the file byte for byte after an undo, the edit again after a redo, and the file again
  // after a second undo, from which the next edit starts
  async function roundTrip(page, edited) {
    assert.notEqual(edited, page.source, 'the edit does not change the file');
    inScope(edited, page.source);
    await undo(page);
    await frames(page);
    await byteExact(page);
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited, 'a redo does not write the edit again');
    await undo(page);
    await frames(page);
    await byteExact(page);
  }

  // the last edit made again, saved, and the saved text opened again without problems
  async function saved(page, edited, name) {
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
  }

  // the lines of the file that an edit changes, trimmed
  function changedLines(source, edited) {
    const a = source.split('\n'), b = edited.split('\n');
    assert.equal(b.length, a.length, 'the edit adds or removes a line');
    return b.filter((l, i) => l !== a[i]).map((l) => l.trim());
  }

  const showTab = async (page, name) => {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === ${js(name)})?.click()`);
    await frames(page);
  };
  async function fieldValue(page, id) {
    await showTab(page, 'Arrange');
    return Number(await page.evaluate(`document.querySelector('#beeson-edit-num-${id}')?.value`));
  }
  const fieldEnabled = async (page, id) => {
    await showTab(page, 'Arrange');
    return page.evaluate(`(() => { const i = document.querySelector('#beeson-edit-num-${id}'); return !!i && !i.disabled; })()`);
  };
  async function typeField(page, id, value) {
    assert.equal(await fieldEnabled(page, id), true, `the field ${id} is not enabled`);
    await page.evaluate(`(() => { const i = document.querySelector('#beeson-edit-num-${id}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
    await frames(page);
  }

  const release = (page, at) => page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });

  // the side or corner of box b across from grip h, or the center of b on an axis that h does not move
  const anchorOf = (b, h) => {
    const [sx, sy] = SIGN[h];
    return { x: sx > 0 ? b.left : sx < 0 ? right(b) : cx(b), y: sy > 0 ? b.top : sy < 0 ? bottom(b) : cy(b) };
  };

  // grip h at the pointer ptr: on the axis that an edge grip moves, and for a corner grip at the
  // corner nearest to the pointer that keeps the aspect a of the picture, i.e. with the offset from
  // the grip to the pointer at a right angle to the diagonal of a box of aspect a
  function atPointer(g, ptr, h, a, where) {
    const [sx, sy] = SIGN[h];
    assert.ok(g, `${where}: the grip ${h} is not drawn`);
    if (!sy) assert.ok(near(g.x, ptr.x), `${where}: the grip ${h} is at x ${g.x.toFixed(1)}, and the pointer at ${ptr.x.toFixed(1)}`);
    else if (!sx) assert.ok(near(g.y, ptr.y), `${where}: the grip ${h} is at y ${g.y.toFixed(1)}, and the pointer at ${ptr.y.toFixed(1)}`);
    else {
      const u = [sx, sy / a], n = Math.hypot(...u);
      const along = ((ptr.x - g.x) * u[0] + (ptr.y - g.y) * u[1]) / n;
      assert.ok(Math.abs(along) <= TOL, `${where}: the grip ${h} at ${g.x.toFixed(1)}, ${g.y.toFixed(1)} is ${along.toFixed(1)} px along its diagonal from the pointer at ${ptr.x.toFixed(1)}, ${ptr.y.toFixed(1)}`);
    }
  }

  // the caption of a figure box under the box of the shown image, as wide as it, at the gap of the theme
  function captionUnder(now, where) {
    if (!now.cap) return;
    const lay = now.pictures[0].layout;
    assert.ok(near(now.cap.top, bottom(lay) + GAP * now.k) && near(now.cap.left, lay.left) && near(now.cap.width, lay.width), `${where}: the caption is at ${show(now.cap)}, not under the picture at ${show(lay)}`);
    assert.equal(now.capDeg, 0, `${where}: the caption is turned`);
  }

  // in a drag held by grip h, the frame and all of its grips are drawn on box, the frame that the
  // release draws, and they follow the resized box
  function gripHeld(now, h, box, where) {
    assert.ok(sameBox(now.frame, box), `${where}: the frame is at ${show(now.frame)}, not around ${show(box)}`);
    assert.ok(Object.keys(now.grips).length > 1 && h in now.grips, `${where}: the grips ${js(Object.keys(now.grips))} are drawn`);
    const want = gripOn(box, 0, h), g = now.grips[h];
    assert.ok(near(g.x, want.x) && near(g.y, want.y), `${where}: the grip ${h} is at ${js(g)}, not on the frame ${show(box)} at ${js(want)}`);
  }

  // the box of the picture and its caption of a resize by grip h from the figure or from the picture,
  // with the frame and the grips drawn in the drag and after it
  function resized(now, rest, h, ptr, from, where, held = false) {
    const box = from === 'figure' ? framed(now.pic, now) : now.pic;
    if (held) gripHeld(now, h, box, where);
    else assert.ok(sameBox(now.frame, box), `${where}: the frame is at ${show(now.frame)}, not around ${show(box)}`);
    captionUnder(now, where);
    const a = anchorOf(box, h), a0 = anchorOf(rest.frame, h);
    assert.ok(near(a.x, a0.x) && near(a.y, a0.y), `${where}: the side across from the grip ${h} moves from ${show(rest.frame)} to ${show(box)}`);
    atPointer(now.grips[h], ptr, h, now.pic.width / now.pic.height, where);
  }

  // what the overlay draws: the frames of the selection and of a group, the grips, the rotate handle
  // and its stem, and the readout
  const OVERLAY = `(() => {
  const v = (e) => !e.closest('[hidden]') && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const n = (s) => [...document.querySelectorAll(s)].filter(v).length;
  return { frames: n('.beeson-frame.selected') + n('.beeson-frame.union'), grips: [...document.querySelectorAll('.beeson-grip')].filter(v).map((g) => g.dataset.handle), rotor: n('.beeson-rotor'), stem: n('.beeson-rotor-stem'), readout: [...document.querySelectorAll('.beeson-offset')].filter(v).map((e) => e.textContent) };
})()`;
  const overlay = (page) => page.evaluate(OVERLAY);
  const centerOf = (page, sel) => page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(sel)})].find((e) => !e.hidden && e.getBoundingClientRect().width).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  // the pointer offset of a drag of grip h inward, in screen px
  const inward = (h, by = 40) => ({ dx: -SIGN[h][0] * by, dy: -SIGN[h][1] * by });

  // the group of two pairs, selected by a click on a member
  async function pickGroup(t, platform, mode) {
    const page = await load(t, platform, mode, 0, GROUP_DECK);
    page.figure = 'figure.figure-box';
    await click(page, IMG);
    await frames(page);
    assert.deepEqual(await selected(page), ['figure.figure-box', 'figure.figure-box'], 'a click on a member does not select the group');
    return page;
  }

  // a drag of the rotate handle of the group with the frame box that turns it by deg, held at the
  // point that it ends at, which is returned
  async function turnGroup(page, box, deg) {
    assert.ok(box, 'the frame of the group is not drawn');
    const rotor = await page.evaluate(`(() => { const r = document.querySelector('.beeson-rotor').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const to = turned(box, deg, rotor.x, rotor.y);
    await drag(page, rotor, { dx: to.x - rotor.x, dy: to.y - rotor.y, hold: true });
    return to;
  }

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      for (const n of FIGURES) {
        test(`each grip resizes ${NAMES[n]} from the figure and from the picture, with the frame around the picture and its caption at the pointer, on ${platform} in ${mode} mode`, async (t) => {
          const page = await load(t, platform, mode, n);
          let last = null;
          for (const from of ['figure', 'picture']) {
            for (const h of HANDLES) {
              const where = `the grip ${h} of ${NAMES[n]} from the ${from} on ${platform} in ${mode} mode`;
              await pick(page, from);
              const rest = await look(page);
              assert.ok(rest.frame, `${where}: the frame is not drawn`);
              const g = rest.grips[h];
              assert.ok(g, `${where}: the grip is not drawn`);
              const { dx, dy } = inward(h);
              const ptr = { x: g.x + dx, y: g.y + dy };
              await drag(page, g, { dx, dy, modifiers: FREE[platform], hold: true });
              resized(await look(page), rest, h, ptr, from, `${where}, in the drag`, true);
              await release(page, ptr);
              await frames(page);
              resized(await look(page), rest, h, ptr, from, `${where}, after the drag`);
              const edited = await render(page);
              const lines = changedLines(page.source, edited);
              for (const l of lines) assert.match(l, /^<(figure class="figure-box"|div class="plate"|img )/, `${where}: the resize writes ${l}`);
              const widths = lines.filter((l) => l.startsWith('<img')).map((l) => / style="width: (\d+)px"/.exec(l)?.[1]);
              assert.equal(widths.length, PAIRS.includes(n) ? 2 : 1, `${where}: the resize writes ${js(lines)}`);
              assert.ok(widths.every((w) => w && w === widths[0]), `${where}: the images are given the widths ${js(widths)}`);
              await roundTrip(page, edited);
              last = edited;
            }
          }
          await saved(page, last, `r9-1-resize-${n}.html`);
        });
      }

      test(`the frame of a figure and its grips stand off the text of its caption, while X and Y read the box of the figure, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, FIGURE_BOX_ONE]) {
          const where = `${NAMES[n]} on ${platform} in ${mode} mode`;
          const page = await load(t, platform, mode, n);
          await pick(page, 'figure');
          for (const stage of ['selected', 'nudged']) {
            const at = `${where}, ${stage}`;
            const now = await look(page);
            const t0 = now.text;
            assert.ok(t0 && t0.width > 0, `${at}: the caption has no text`);
            assert.ok(sameBox(now.frame, framed(now.pic, now)), `${at}: the frame is at ${show(now.frame)}, not ${INSET} px outside the picture and the caption at ${show(union(now.pic, now.cap))}`);
            // the line of the frame, 2 px wide, and each grip, 12 px wide with its shadow of 1 px,
            // are clear of the text of the caption
            const inner = grow(now.frame, -2);
            assert.ok(inner.left < t0.left && inner.top < t0.top && right(inner) > right(t0) && bottom(inner) > bottom(t0), `${at}: the frame at ${show(now.frame)} runs on the text of the caption at ${show(t0)}`);
            for (const [h, g] of Object.entries(now.grips)) {
              const box = { left: g.x - 7, top: g.y - 7, width: 14, height: 14 };
              const over = box.left < right(t0) && right(box) > t0.left && box.top < bottom(t0) && bottom(box) > t0.top;
              assert.ok(!over, `${at}: the grip ${h} at ${js(g)} is on the text of the caption at ${show(t0)}`);
            }
            // X and Y give the corner of the picture and its caption, without the inset of the frame
            const fig = union(now.pic, now.cap);
            const x = (fig.left - now.origin.left) / now.k, y = (fig.top - now.origin.top) / now.k;
            assert.ok(near(await fieldValue(page, 'x'), x, 1) && near(await fieldValue(page, 'y'), y, 1), `${at}: X and Y read ${await fieldValue(page, 'x')}, ${await fieldValue(page, 'y')}, not the corner ${Math.round(x)}, ${Math.round(y)} of the figure`);
            if (stage === 'nudged') break;
            await page.evaluate('document.activeElement instanceof HTMLElement && document.activeElement.blur()');
            await press(page, 'ArrowRight');
            await frames(page);
            const edited = await render(page);
            await roundTrip(page, edited);
            await redo(page);
            await frames(page);
          }
          // the draft of an edited page left open may reach the storage after the next load clears it,
          // and its dialog then makes the page inert
          await page.close();
        }
      });

      test(`a turned figure is framed turned with its picture and its caption, with its grips at the corners, and resized by them, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, FIGURE_BOX_ONE]) {
          const where = `${NAMES[n]} turned by 30° on ${platform} in ${mode} mode`;
          const page = await load(t, platform, mode, n);
          await pick(page, 'figure');
          const upright = await look(page);
          await exec(page, 'arrange.setRotation', { deg: 30 });
          await frames(page);
          page.source = await render(page);
          const rest = await look(page);
          // the figure is turned as one object with its caption, about the center of its frame, and
          // the frame is turned with it at the size of the upright frame
          assert.ok(rest.figDeg === 30 && rest.pictures[0].deg === 0 && rest.capDeg === 0, `${where}: the figure is turned by ${rest.figDeg}°, its picture by ${rest.pictures[0].deg}°`);
          const q = turned(upright.frame, 30, cx(upright.cap), cy(upright.cap));
          assert.ok(near(cx(rest.cap), q.x) && near(cy(rest.cap), q.y), `${where}: the caption at ${show(rest.cap)} is not carried with the picture to ${js(q)}`);
          assert.equal(rest.frameDeg, 30, `${where}: the frame is turned by ${rest.frameDeg}°`);
          assert.ok(near(rest.frameSize.width, upright.frame.width) && near(rest.frameSize.height, upright.frame.height), `${where}: the frame is ${js(rest.frameSize)}, not the size of the upright frame ${show(upright.frame)}`);
          for (const h of HANDLES) {
            const want = gripOn(upright.frame, 30, h), g = rest.grips[h];
            assert.ok(g && near(g.x, want.x) && near(g.y, want.y), `${where}: the grip ${h} is at ${js(g)}, not at ${js(want)}`);
          }
          // a corner grip dragged inward along the turned diagonal scales the figure, which stays
          // turned, with the corner across from the grip in place
          const d = inward('se'), a = Math.PI / 6, dx = d.dx * Math.cos(a) - d.dy * Math.sin(a), dy = d.dx * Math.sin(a) + d.dy * Math.cos(a);
          const g = rest.grips.se, ptr = { x: g.x + dx, y: g.y + dy };
          await drag(page, g, { dx, dy, modifiers: FREE[platform], hold: true });
          for (const stage of ['in the drag', 'after the drag']) {
            if (stage === 'after the drag') {
              await release(page, ptr);
              await frames(page);
            }
            const now = await look(page);
            const at = `${where}, a drag of the grip se ${stage}`;
            assert.ok(now.figDeg === 30 && now.pictures[0].deg === 0, `${at}: the figure is not turned`);
            assert.ok(now.pictures[0].width < rest.pictures[0].width - 20, `${at}: the picture is ${now.pictures[0].width} px wide, from ${rest.pictures[0].width} px`);
            // the frame is drawn turned with every grip in the drag too, and follows the resize
            assert.equal(now.frameDeg, 30, `${at}: the frame is turned by ${now.frameDeg}°`);
            assert.deepEqual(Object.keys(now.grips).sort(), [...HANDLES].sort(), `${at}: the grips ${js(Object.keys(now.grips))} are drawn`);
            assert.ok(near(now.grips.nw.x, rest.grips.nw.x) && near(now.grips.nw.y, rest.grips.nw.y), `${at}: the corner across from the grip moves from ${js(rest.grips.nw)} to ${js(now.grips.nw)}`);
          }
          const edited = await render(page);
          for (const l of changedLines(page.source, edited)) assert.match(l, /^<(figure class="figure-box"|img )/, `${where}: the resize writes ${l}`);
          await roundTrip(page, edited);
          await saved(page, edited, `r9-1-turned-${n}.html`);
          // the draft of an edited page left open may reach the storage after the next load clears it,
          // and its dialog then makes the page inert
          await page.close();
        }
      });

      test(`a turned group keeps its frame turned with its grips on it, and its W and H fields scale it, on ${platform} in ${mode} mode`, async (t) => {
        const where = `a group of two pairs on ${platform} in ${mode} mode`;
        const page = await pickGroup(t, platform, mode);
        const rest = await look(page);

        // W and H are typed fields that scale the group about its upper left corner, as one entry of
        // the history each, and with Constrain Proportions off a typed W stretches the pictures
        assert.equal(await fieldEnabled(page, 'width'), true, `${where}: the field W is dimmed`);
        assert.equal(await fieldEnabled(page, 'height'), true, `${where}: the field H is dimmed`);
        const w0 = await fieldValue(page, 'width'), h0 = await fieldValue(page, 'height');
        const x0 = await fieldValue(page, 'x'), y0 = await fieldValue(page, 'y');
        const typed = async (id, value, want) => {
          await typeField(page, id, value);
          const got = { width: await fieldValue(page, 'width'), height: await fieldValue(page, 'height'), x: await fieldValue(page, 'x'), y: await fieldValue(page, 'y') };
          for (const [k, v] of Object.entries(want)) assert.ok(near(got[k], v, 1), `${where}: a typed ${id} of ${value} gives ${js(got)}, not ${js(want)}`);
          const edited = await render(page);
          for (const l of changedLines(page.source, edited)) assert.match(l, /^<(figure class="figure-box"|img )/, `${where}: a typed ${id} writes ${l}`);
          await roundTrip(page, edited);
          return edited;
        };
        const w1 = Math.round(w0 * 0.8), h1 = Math.round(h0 * 0.8);
        await typed('width', w1, { width: w1, height: h0 * 0.8, x: x0, y: y0 });
        await typed('height', h1, { width: w0 * 0.8, height: h1, x: x0, y: y0 });
        await exec(page, 'arrange.constrainProportions');
        assert.equal((await state(page, 'arrange.constrainProportions')).checked, false, `${where}: Constrain Proportions is not turned off`);
        const stretched = await typed('width', w1, { width: w1, height: h0, x: x0, y: y0 });
        assert.match(stretched, /style="width: \d+px; height: \d+px"/, `${where}: a typed W with Constrain Proportions off does not stretch the pictures`);
        await exec(page, 'arrange.constrainProportions');

        // after a turn by the rotate handle, the frame of the group stays turned by the angle of its
        // first member, around every member, with the grips on it, and W and H give its size
        const to = await turnGroup(page, rest.group, 30);
        await release(page, to);
        await frames(page);
        const now = await look(page);
        const at = `${where} after a turn by 30°`;
        assert.ok(now.pictures.every((p) => p.deg === 30), `${at}: the pictures are turned by ${js(now.pictures.map((p) => p.deg))}`);
        assert.ok(now.group, `${at}: the frame of the group is not drawn`);
        assert.ok(near(now.groupDeg, 30, 0.5), `${at}: the frame of the group is turned by ${now.groupDeg}°`);
        const tight = reach(now.pictures.flatMap((p) => p.corners).map((c) => turned(now.group, -30, c.x, c.y)));
        assert.ok(sameBox(tight, now.group), `${at}: the frame of the group, at ${show(now.group)} turned, is not around its members at ${show(tight)}`);
        for (const h of HANDLES) {
          const want = gripOn(now.group, 30, h), g = now.grips[h];
          assert.ok(g && near(g.x, want.x) && near(g.y, want.y), `${at}: the grip ${h} is at ${js(g)}, not at ${js(want)}`);
        }
        assert.ok(near(await fieldValue(page, 'width'), now.group.width / now.k, 1) && near(await fieldValue(page, 'height'), now.group.height / now.k, 1), `${at}: W and H are not the size of the turned frame`);
        const turnedText = await render(page);
        const shown = changedLines(page.source, turnedText).filter((l) => l.startsWith(`<img class="for-${mode}"`));
        assert.equal(shown.length, 2, `${where}: the turn writes ${js(shown)}`);
        for (const l of shown) assert.match(l, /rotate: 30deg/, `${where}: the turn writes ${l}`);
        await roundTrip(page, turnedText);
        await redo(page);
        await frames(page);
        page.source = turnedText;

        // a typed W scales the turned group with the upper left corner of its frame without its
        // rotation kept, i.e. its X and Y, as for a turned figure
        const before = await look(page);
        const corner = { x: await fieldValue(page, 'x'), y: await fieldValue(page, 'y') };
        const w2 = Math.round((before.group.width / before.k) * 0.8);
        await typeField(page, 'width', w2);
        const after = await look(page);
        const moved = { x: await fieldValue(page, 'x'), y: await fieldValue(page, 'y') };
        assert.ok(near(after.groupDeg, 30, 0.5), `${where}: a typed W turns the frame of the group to ${after.groupDeg}°`);
        assert.ok(near(moved.x, corner.x, 1) && near(moved.y, corner.y, 1), `${where}: a typed W moves the turned group from X and Y ${js(corner)} to ${js(moved)}`);
        assert.ok(near(await fieldValue(page, 'width'), w2, 1), `${where}: a typed W of ${w2} gives ${await fieldValue(page, 'width')}`);
        const edited = await render(page);
        await roundTrip(page, edited);
        await saved(page, edited, 'r9-1-group.html');
      });

      test(`while the rotate handle is held, it is drawn alone, and while a grip is held, the frame and the grips are drawn without the rotate handle, for an element and a group, on ${platform} in ${mode} mode`, async (t) => {
        for (const kind of ['QR code', 'group']) {
          const where = `a ${kind} on ${platform} in ${mode} mode`;
          const page = kind === 'group' ? await pickGroup(t, platform, mode) : await load(t, platform, mode, 0, LAYOUTS);
          if (kind !== 'group') {
            await click(page, QR);
            await frames(page);
            assert.deepEqual(await selected(page), ['div'], `${where}: a click does not select the QR code`);
          }
          const all = await overlay(page);
          assert.ok(all.frames === 1 && all.grips.length === 8 && all.rotor === 1, `${where}: the selection draws ${js(all)}`);
          // a resize by the grip se, held, and a turn by the rotate handle, held, each released and
          // checked in the file
          for (const handle of ['se', 'rotor']) {
            const from = await centerOf(page, handle === 'rotor' ? '.beeson-rotor' : '.beeson-grip[data-handle="se"]');
            const by = handle === 'rotor' ? { dx: 90, dy: 20 } : { dx: -40, dy: -40 };
            await drag(page, from, { ...by, modifiers: handle === 'rotor' ? undefined : FREE[platform], hold: true });
            await frames(page);
            const held = await overlay(page);
            const want = handle === 'rotor' ? { frames: 0, grips: [], rotor: 1, stem: 0 } : { frames: 1, grips: HANDLES, rotor: 0, stem: 0 };
            assert.deepEqual({ frames: held.frames, grips: held.grips, rotor: held.rotor, stem: held.stem }, want, `${where}: the held ${handle === 'rotor' ? 'rotate handle' : 'grip se'} draws ${js(held)}`);
            await release(page, { x: from.x + by.dx, y: from.y + by.dy });
            await frames(page);
            const after = await overlay(page);
            assert.ok(after.frames === 1 && after.grips.length === 8 && after.rotor === 1, `${where}: after the release, the selection draws ${js(after)}`);
            const edited = await render(page);
            await roundTrip(page, edited);
            await redo(page);
            await frames(page);
            page.source = edited;
          }
        }
      });

      test(`the readouts of a move, a nudge, a resize, and a turn give labels and units, for an element, a line, and a group, on ${platform} in ${mode} mode`, async (t) => {
        // as Keynote reads 'x: 530 pt  y: 100 pt' and 'w: 744 pt  h: 762 pt' (K63, K77), in slide px
        const XY = /^x: -?\d+ px {2}y: -?\d+ px$/, WH = /^w: \d+ px {2}h: \d+ px$/, DEG = /^\d+°$/;
        const readout = async (page) => (await overlay(page)).readout.join('|');
        // a drag held from the point from by the offset by, read and released, then checked in the file
        const held = async (page, from, by, want, what, modifiers) => {
          await drag(page, from, { ...by, modifiers, hold: true });
          await frames(page);
          assert.match(await readout(page), want, `${what} reads ${js(await readout(page))}`);
          await release(page, { x: from.x + by.dx, y: from.y + by.dy });
          await frames(page);
          const edited = await render(page);
          await roundTrip(page, edited);
          await redo(page);
          await frames(page);
          page.source = edited;
        };
        const where = `on ${platform} in ${mode} mode`;
        let page = await load(t, platform, mode, 0, LAYOUTS);
        await click(page, QR);
        await frames(page);
        await held(page, await centerOf(page, QR), { dx: -60, dy: 40 }, XY, `the move of a QR code ${where}`, FREE[platform]);
        await held(page, await centerOf(page, '.beeson-grip[data-handle="se"]'), { dx: -30, dy: -30 }, WH, `the resize of a QR code ${where}`, FREE[platform]);
        await held(page, await centerOf(page, '.beeson-rotor'), { dx: 90, dy: 20 }, DEG, `the turn of a QR code ${where}`);
        await press(page, 'ArrowRight');
        await frames(page);
        assert.match(await readout(page), XY, `the nudge of a QR code ${where} reads ${js(await readout(page))}`);
        // a line drawn on the slide, selected by a press next to it, and moved
        await exec(page, 'insert.line', { from: { x: 300, y: 700 }, to: { x: 800, y: 700 } });
        await exec(page, 'selection.clear');
        await frames(page);
        page.source = await render(page);
        const on = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'), r = s.getBoundingClientRect(), k = r.width / s.offsetWidth; return { x: r.left + 550 * k, y: r.top + 700 * k + 3 }; })()`);
        await click(page, on);
        await frames(page);
        await held(page, on, { dx: 40, dy: -50 }, XY, `the move of a line ${where}`, FREE[platform]);
        // a group, resized by its grip se
        page = await pickGroup(t, platform, mode);
        await held(page, await centerOf(page, '.beeson-grip[data-group="1"][data-handle="se"]'), { dx: -40, dy: -30 }, WH, `the resize of a group ${where}`, FREE[platform]);
      });

      test(`a drag held at the edge of a zoomed canvas scrolls it, with the element or line under the pointer, on ${platform} in ${mode} mode`, async (t) => {
        const where = `on ${platform} in ${mode} mode`;
        // the closing slide, whose QR code theme/beeson.css places in the lower right corner
        const page = await load(t, platform, mode, 15, LAYOUTS);
        await exec(page, 'insert.line', { from: { x: 300, y: 700 }, to: { x: 800, y: 700 } });
        await exec(page, 'selection.clear');
        page.source = await render(page);
        await exec(page, 'zoom.actual');
        await frames(page);
        const canvas = () => page.evaluate(`(() => { const c = document.querySelector('.beeson-edit-canvas'), v = window.BeesonEditorShell.stage.viewport; return { x: c.scrollLeft, y: c.scrollTop, zoomed: c.classList.contains('zoomed'), left: v.left, top: v.top, height: v.height }; })()`);
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        // the point of the slide in slide px on the screen, with the canvas scrolled to put it at 300 px
        // right of the left edge of the canvas and in the middle of its height
        const reveal = (x, y) => page.evaluate(`(() => {
        const c = document.querySelector('.beeson-edit-canvas'), v = window.BeesonEditorShell.stage.viewport;
        const at = () => window.BeesonEditorShell.stage.toScreen({ x: ${x}, y: ${y} });
        c.scrollLeft += at().x - v.left - 300;
        c.scrollTop += at().y - v.top - v.height / 2;
        window.BeesonEditorShell.stage.place();
        return at();
      })()`);
        for (const kind of ['QR code', 'line']) {
          const what = `a ${kind} ${where}`;
          // the center of the QR code, and the middle of the line, 3 px under it
          const q = await page.evaluate(`(() => { const r = document.querySelector(${js(QR)}).getBoundingClientRect(); return window.BeesonEditorShell.stage.toSlide({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`);
          const at = kind === 'line' ? await reveal(550, 700) : await reveal(q.x, q.y);
          if (kind === 'line') at.y += 3;
          await frames(page);
          await click(page, at);
          await frames(page);
          const item = kind === 'line' ? `.reveal section.present svg.line` : QR;
          const centerAt = () => page.evaluate(`(() => { const r = document.querySelector(${js(item)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          const c0 = await centerAt();
          const before = await canvas();
          assert.ok(before.zoomed, `${what}: the canvas is not zoomed at Actual Size`);
          // the drag to 4 px from the left edge of the canvas, held there for a second with small moves
          const edge = before.left + 4;
          await drag(page, at, { dx: edge - at.x, dy: 0, modifiers: FREE[platform], hold: true });
          for (let i = 0; i < 10; i++) {
            await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: edge - (i % 2), y: at.y, buttons: 1, button: 'left', modifiers: platform === 'mac' ? 4 : 1 });
            await wait(100);
          }
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: edge, y: at.y, buttons: 1, button: 'left', modifiers: platform === 'mac' ? 4 : 1 });
          await frames(page);
          const held = await canvas();
          assert.ok(held.x < before.x - 50, `${what}: the canvas is scrolled from ${before.x} to ${held.x} while the drag is held at its left edge`);
          // the element stays at the pointer while the slide scrolls under it
          const c1 = await centerAt();
          assert.ok(near(c1.x - c0.x, edge - at.x, 2) && near(c1.y, c0.y, 2), `${what}: the center moves from ${js(c0)} to ${js(c1)}, and the pointer by ${Math.round(edge - at.x)}`);
          await release(page, { x: edge, y: at.y });
          await frames(page);
          const scrolled = (await canvas()).x;
          await frames(page);
          assert.equal((await canvas()).x, scrolled, `${what}: the canvas is still scrolled after the release`);
          const edited = await render(page);
          await roundTrip(page, edited);
          await redo(page);
          await frames(page);
          page.source = edited;
        }
      });

      test(`a turn of a group with a pair turns the image of each mode, in the drag and after it, on ${platform} in ${mode} mode`, async (t) => {
        const where = `a group of two pairs on ${platform} in ${mode} mode`;
        const page = await pickGroup(t, platform, mode);
        const rest = await look(page);
        const to = await turnGroup(page, rest.group, 30);
        const turning = await look(page);
        assert.ok(turning.pictures.every((p) => p.deg === 30), `${where}: the pictures are turned by ${js(turning.pictures.map((p) => p.deg))} in the drag`);
        await page.evaluate('Beeson.theme.toggle()');
        await frames(page);
        const flipped = await look(page);
        assert.ok(flipped.pictures.every((p) => p.deg === 30), `${where}: after a flip of the mode in the drag, the pictures are turned by ${js(flipped.pictures.map((p) => p.deg))}`);
        await release(page, to);
        await frames(page);
        for (const flip of [false, true]) {
          if (flip) {
            await page.evaluate('Beeson.theme.toggle()');
            await frames(page);
          }
          const now = await look(page);
          assert.ok(now.pictures.every((p) => p.deg === 30), `${where} after the turn${flip ? ' and a flip of the mode' : ''}: the pictures are turned by ${js(now.pictures.map((p) => p.deg))}`);
        }
        const edited = await render(page);
        const imgs = changedLines(page.source, edited).filter((l) => l.startsWith('<img'));
        assert.equal(imgs.length, 4, `${where}: the turn writes ${js(imgs)}`);
        for (const l of imgs) assert.match(l, /rotate: 30deg/, `${where}: the turn writes ${l}`);
        await roundTrip(page, edited);
        await saved(page, edited, 'r9-1-group-turn.html');
      });
    }
  }
});

// tests of R20.1 on both platforms with trusted input: the plot features cut from the editor. a
// div.plot of a deck is an opaque figure, which is selected, moved, duplicated, deleted, locked,
// and given a step as other figures are. its JSON script is not written by the editor
describe('a plot handled as an opaque figure', () => {
  const PLATFORMS = ['mac', 'other'];
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATE_SLIDE = 8;
  const FIGURE_BOX_SLIDE = 12;
  const SLIDE = '.reveal .slides > section.present';
  const PLATE = '<div class="plot plate" data-plot="plate-plot">';
  const FIGURE_BOX = '<div class="plot figure-box" data-plot="figure-box-plot">';
  const BLOCK = '<script type="application/json" id="figure-box-plot">';
  const STEP = '<span class="fragment" data-fragment-index="2" data-plot-show="right"></span>';
  const IDS = ['plot.editData', 'plot.setData', 'plot.addRow', 'plot.deleteRow', 'plot.addSeries', 'plot.deleteSeries', 'plot.moveSeriesLeft', 'plot.moveSeriesRight', 'plot.moveSeries', 'plot.addTab', 'plot.deleteTab', 'plot.pasteCells', 'plot.clearCells', 'plot.title', 'plot.range', 'plot.scale', 'plot.unit', 'plot.axes', 'plot.tone', 'insert.plot', 'plot.closeData'];

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
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const title = (page) => page.evaluate(`document.querySelector('.beeson-edit-menubar .state, .beeson-edit-header .state')?.textContent ?? null`);
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const menuLabels = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].filter((i) => i.getClientRects().length).map((i) => i.querySelector('.label')?.firstChild?.textContent ?? '')`);
  const selected = (page, sel) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.matches(${js(sel)}))`);
  let saves = 0;

  async function load(t, platform, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(LAYOUTS, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  // the labels of the menu bar's menu named bar, opened by a trusted click and closed again
  async function openMenu(page, bar) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)})`));
    await wait(page, 200);
    const labels = await menuLabels(page);
    await press(page, 'Escape');
    await wait(page, 100);
    return labels;
  }

  // the last edit undone to the file before and redone, and the edited file returned
  async function roundTrip(page, before) {
    const edited = await render(page);
    assert.notEqual(edited, before, 'the action does not change the file');
    await undo(page);
    await wait(page, 100);
    assert.equal(await render(page), before, 'the undo does not give the file back byte for byte');
    await redo(page);
    await wait(page, 100);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    return edited;
  }

  function sources(dir) {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
    });
  }

  test('the editor is built without the plot commands, the Plot Data window, and the plot modules', () => {
    const bundle = readFileSync('theme/editor.js', 'utf8');
    assert.deepEqual(bundle.match(/id:\s*"(plot\.[A-Za-z]+|insert\.plot)"/g) ?? [], [], 'a plot command is in the bundle');
    assert.ok(!bundle.includes('beeson-plotdata'), 'the style of the Plot Data window is in the bundle');
    for (const path of ['src/editor/commands/plot.ts', 'src/editor/plotdata.ts', 'src/editor/inspector/plot.ts']) assert.ok(!existsSync(path), `${path} is still there`);
    for (const path of sources('src/editor')) assert.doesNotMatch(readFileSync(path, 'utf8'), /from '[./]+(plotdata|commands\/plot|inspector\/plot|plot)\.ts'/, `${path} imports a plot module`);
  });

  for (const platform of PLATFORMS) {
    test(`a plot is not inserted or edited by a command, a menu, the toolbar, or Mod+Shift+D (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURE_BOX_SLIDE);
      for (const id of IDS) await assert.rejects(state(page, id), /there is no command/, `${id} is still a command`);
      assert.equal(await page.evaluate(`!!document.querySelector('[data-command="insert.plot"]')`), false, 'the toolbar has the button Plot');
      assert.ok(!(await openMenu(page, 'Insert')).includes('Plot'), 'the Insert menu has Plot');
      assert.ok(!(await openMenu(page, 'Format')).includes('Plot'), 'the Format menu has the submenu Plot');
      await click(page, `${SLIDE} .plot`);
      await wait(page);
      await press(page, 'Mod+Shift+D');
      await wait(page);
      assert.equal(await page.evaluate(`!!document.querySelector('.beeson-plotdata')`), false, 'Mod+Shift+D opens the Plot Data window');
      assert.equal((await state(page, 'edit.undo')).enabled, false, 'Mod+Shift+D adds a history entry');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`a plot in a zone is an opaque figure, moved, duplicated, and deleted with its block kept (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURE_BOX_SLIDE);
      const source = page.source;
      await click(page, `${SLIDE} .plot`);
      await wait(page);
      assert.deepEqual(await selected(page, 'div.plot.figure-box'), [true]);
      assert.equal(await page.evaluate(`document.querySelector('#beeson-edit-panel-format .ed-panes').dataset.pane`), 'arrange');
      assert.equal(await page.evaluate(`!!document.querySelector('#beeson-edit-panel-format .ed-tabs')`), false, 'the Format tab of a plot has more panes than Arrange');
      await click(page, `${SLIDE} .plot`, { button: 'right' });
      await wait(page, 150);
      const labels = await menuLabels(page);
      assert.ok(labels.includes('Bring to Front'), `the menu of a plot does not have the arrange items: ${labels.join(', ')}`);
      assert.ok(!labels.some((l) => /Plot/.test(l)), `the menu of a plot has a plot item: ${labels.join(', ')}`);
      await press(page, 'Escape');
      await wait(page, 100);
      // a drag writes translate into the tag of the div.plot alone
      await drag(page, await center(page, `${SLIDE} .plot`), { dx: -120, dy: 40 });
      await wait(page);
      const moved = await render(page);
      const tag = moved.match(/<div class="plot figure-box" data-plot="figure-box-plot" style="translate: -?\d+px -?\d+px">/);
      assert.ok(tag, 'the drag does not write translate into the tag of the plot');
      await byteExact(page, [[FIGURE_BOX, tag[0]]]);
      await roundTrip(page, source);
      await undo(page);
      await wait(page, 100);
      await byteExact(page);
      // Mod+D copies the div.plot alone, and the copy names the same block
      await click(page, `${SLIDE} .plot`);
      await press(page, 'Mod+D');
      await wait(page);
      const copied = await render(page);
      assert.equal(copied.split('data-plot="figure-box-plot"').length, 3, 'Mod+D does not copy the plot once');
      assert.equal(copied.split(BLOCK).length, 2, 'Mod+D copies the JSON script');
      assert.equal(await page.evaluate(`document.querySelectorAll('${SLIDE} .plot .plot-body').length`), 2, 'the copy is not drawn from the block');
      await roundTrip(page, source);
      // a delete of the copy gives the file back
      await press(page, platform === 'mac' ? 'Backspace' : 'Delete');
      await wait(page);
      assert.equal(await render(page), source, 'the delete of the copy does not give the file back');
      await undo(page);
      await wait(page, 100);
      assert.equal(await render(page), copied);
      await undo(page);
      await wait(page, 100);
      await byteExact(page);
      // a delete of the plot keeps its JSON script and its step span in the file
      await click(page, `${SLIDE} .plot`);
      await press(page, platform === 'mac' ? 'Backspace' : 'Delete');
      await wait(page);
      const deleted = await render(page);
      assert.ok(!deleted.includes(FIGURE_BOX), 'the plot is not deleted');
      assert.ok(deleted.includes(BLOCK) && deleted.includes(STEP), 'the delete takes the JSON script or the step span');
      await roundTrip(page, source);
      const { text } = await saveAndReopen(page, `r20-1-${++saves}.html`);
      assert.equal(text, deleted);
      assert.deepEqual(errors(page), []);
    });

    test(`a plot over a text is reported as a plot, and its row of the Object List reads Plot (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURE_BOX_SLIDE);
      await click(page, `${SLIDE} .plot`);
      await wait(page);
      const p = await page.evaluate(`(() => { const r = document.querySelector('${SLIDE} > p').getBoundingClientRect(), s = document.querySelector('${SLIDE}').getBoundingClientRect(), k = 1920 / s.width; return { x: Math.round((r.left - s.left) * k), y: Math.round((r.top - s.top) * k) }; })()`);
      await exec(page, 'arrange.setPosition', p);
      await wait(page);
      // the report is made after a change of the layout, and not after a move by the user
      await exec(page, 'slide.layout.wide');
      await wait(page, 400);
      assert.match(await title(page), /1 text is under a plot\b/);
      await exec(page, 'view.objects');
      await wait(page);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-objects .row')].map((r) => r.querySelector('.name').textContent)`);
      assert.ok(rows.includes('Plot'), `the Object List does not name the plot: ${rows.join(', ')}`);
      assert.deepEqual(errors(page), []);
    });

    test(`a plot in a plate is locked and given a step as other figures are (${platform})`, async (t) => {
      const page = await load(t, platform, PLATE_SLIDE);
      const source = page.source;
      await click(page, `${SLIDE} .plot`);
      await wait(page);
      assert.deepEqual(await selected(page, 'div.plot.plate'), [true]);
      await exec(page, 'arrange.lock');
      await wait(page);
      const locked = await render(page);
      assert.equal(locked, source.replace(PLATE, '<div class="plot plate" data-plot="plate-plot" data-locked>'));
      await exec(page, 'arrange.setPosition', { x: 300, y: 200 });
      await wait(page);
      assert.equal(await render(page), locked, 'a locked plot is moved');
      await exec(page, 'arrange.unlock');
      await wait(page);
      assert.equal(await render(page), source);
      await exec(page, 'steps.add');
      await wait(page);
      const stepped = await render(page);
      // the plot becomes the third step, after the two step spans of the plot, which are numbered
      await byteExact(page, [[PLATE, '<div class="plot plate fragment" data-plot="plate-plot" data-fragment-index="3">'],
        ['<span class="fragment" data-plot-show="right">', '<span class="fragment" data-plot-show="right" data-fragment-index="1">'],
        ['<span class="fragment" data-plot-tab="two">', '<span class="fragment" data-plot-tab="two" data-fragment-index="2">']]);
      await exec(page, 'view.steps');
      await wait(page);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-side .rows .row .meta')].map((r) => r.textContent)`);
      assert.ok(rows.some((r) => /^Plot(?! step)/.test(r)), `the Steps pane does not name the plot: ${rows.join(', ')}`);
      await roundTrip(page, source);
      const { text } = await saveAndReopen(page, `r20-1-${++saves}.html`);
      assert.equal(text, stepped);
      assert.deepEqual(errors(page), []);
    });
  }
});
