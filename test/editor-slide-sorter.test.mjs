// slide Sorter: its close, its sections moved and renamed, the thumbnail menu, Select All Slides,
// New Slide and Delete with the keys kept on the tiles, and the Add Slide popover

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, drag, press, saveAndReopen, selectFigure, type } from './helpers/editor.mjs';
import { lineText } from '../src/editor/commands/line.ts';

// regression tests of R12.3 on both platforms with trusted input: the close of the light table, the
// print key, the Zoom dialog, the menus of the grips and of the tiles, the keys printed beside the
// menu items, Select All in the thumbnail menu, and the focus after an undo in the light table
describe('the close and keys of Slide Sorter', () => {
  const DECK = 'test-deck.html';
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
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg ? `, ${js(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

  // the editor on slide n of the deck in a window of 1600 by 1000, with the storage of the browser
  // cleared
  async function load(t, platform, { n = 0 } = {}) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.send('Page.bringToFront');
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear(); true');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the center of the item of an open menu whose label is label, or null
  const itemAt = (page, label) =>
    page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)});
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);

  // a trusted click on the title of a menu of the menu bar, then on its item label
  async function choose(page, bar, label) {
    const i = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].findIndex((b) => b.textContent === ${js(bar)})`);
    assert.ok(i >= 0, `the menu bar does not have ${bar}`);
    await click(page, `.beeson-edit-menubar [role=menuitem]:nth-child(${i + 1})`);
    const at = await itemAt(page, label);
    assert.ok(at, `the ${bar} menu does not have ${label}`);
    await clickText(page, at);
  }

  // what is hit in the middle of the first shown element of selector: an element of the light table,
  // or an element inside selector
  const hit = (page, selector) =>
    page.evaluate(`(() => {
    const r = [...document.querySelectorAll(${js(selector)})].map((el) => el.getBoundingClientRect()).find((r) => r.width && r.height);
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60));
    return { sorter: !!el?.closest('.beeson-edit-sorter'), inside: !!el?.closest(${js(selector)}) };
  })()`);

  async function openTable(page) {
    await choose(page, 'View', 'Slide Sorter');
    await sleep(200);
    assert.equal((await state(page, 'view.lightTable')).checked, true);
    assert.equal((await hit(page, '.beeson-edit-nav')).sorter, true);
  }

  async function closed(page, how) {
    await sleep(200);
    assert.equal((await state(page, 'view.lightTable')).checked, false, how);
    assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.beeson-edit-sorter')).display`), 'none', how);
    assert.deepEqual(await hit(page, '.beeson-edit-nav'), { sorter: false, inside: true }, how);
    assert.deepEqual(await hit(page, '.beeson-edit-canvas'), { sorter: false, inside: true }, how);
  }

  // menus-keys-1: the light table is closed by Done, Esc, the menu, and a double click on a tile, and
  // the navigator and the canvas are hit again after each
  for (const platform of PLATFORMS) {
    test(`the light table closes by Done, Esc, the menu, and a double click (${platform})`, async (t) => {
      const page = await load(t, platform);
      await openTable(page);
      await click(page, '.beeson-edit-sorter .bar .done');
      await closed(page, 'Done');
      await openTable(page);
      await press(page, 'Escape');
      await closed(page, 'Esc');
      await openTable(page);
      await choose(page, 'View', 'Slide Sorter');
      await closed(page, 'menu');
      await openTable(page);
      await click(page, '.beeson-edit-sorter .tile:nth-of-type(3) .pic', { count: 2 });
      await closed(page, 'double click');
      assert.deepEqual(errors(page), []);
    });
  }

  // the labels and the keys of the menu of the menu bar named bar, opened by a trusted click and
  // closed again
  async function readMenu(page, bar) {
    const i = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].findIndex((b) => b.textContent === ${js(bar)})`);
    await click(page, `.beeson-edit-menubar [role=menuitem]:nth-child(${i + 1})`);
    const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => ({ label: i.querySelector('.label')?.textContent, keys: i.querySelector('.keys')?.textContent ?? '', enabled: i.getAttribute('aria-disabled') !== 'true' }))`);
    await page.evaluate('window.BeesonEditorShell.closeMenus(); true');
    return items;
  }

  // a listener of the page after the one of the editor, which records whether each keydown of P was
  // prevented, and a window.open that records the address it is given
  const SPY = `(() => {
  window.__keys = [];
  window.__opened = [];
  window.addEventListener('keydown', (ev) => { if (ev.key === 'p' || ev.key === 'P') window.__keys.push(ev.defaultPrevented); }, true);
  window.open = (url) => { window.__opened.push(String(url)); return null; };
  return true;
})()`;

  // menus-keys-2: File > Print… is the last item of the File menu with Mod+P, which the editor takes
  // from the browser and which opens the print view of the deck, after a question while edits are
  // unsaved
  for (const platform of PLATFORMS) {
    test(`Mod+P and File > Print… open the print view of the deck (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 4 });
      await page.evaluate(SPY);
      const file = await readMenu(page, 'File');
      assert.deepEqual(file.at(-1), { label: 'Print…', keys: platform === 'mac' ? '⌘P' : 'Ctrl+P', enabled: true });
      await clickText(page, { x: 700, y: 200 });
      await press(page, 'Mod+P');
      await sleep(300);
      assert.deepEqual(await page.evaluate('window.__keys'), [true], 'the key is left to the browser');
      const opened = await page.evaluate('window.__opened');
      assert.equal(opened.length, 1);
      assert.match(opened[0], /[?&]print-pdf/);
      assert.doesNotMatch(opened[0], /[?&]edit(&|$)/);
      await choose(page, 'File', 'Print…');
      await sleep(300);
      assert.equal((await page.evaluate('window.__opened')).length, 2);
      // with an unsaved edit, the user is asked first, and Cancel prints nothing
      await exec(page, 'slide.hide');
      await press(page, 'Mod+P');
      await page.waitFor(`[...document.querySelectorAll('dialog[open] button')].some((b) => b.textContent === 'Save and print')`);
      const buttons = await page.evaluate(`[...document.querySelectorAll('dialog[open] button')].map((b) => b.textContent)`);
      assert.deepEqual(buttons.slice(-3), ['Save and print', 'Print the saved file', 'Cancel']);
      await press(page, 'Escape');
      await sleep(200);
      assert.equal((await page.evaluate('window.__opened')).length, 2);
      assert.deepEqual(errors(page), []);
    });
  }

  // navigator-slides-canvas-2: the Percent field of the Zoom dialog opens with its value selected, so
  // that a typed value replaces it
  for (const platform of PLATFORMS) {
    test(`a value typed into the Zoom dialog replaces the value shown (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, '.beeson-edit-bottom .percent');
      await sleep(100);
      const at = await itemAt(page, 'Zoom…');
      assert.ok(at, 'the zoom menu of the status bar does not have Zoom…');
      await clickText(page, at);
      await page.waitFor(`document.activeElement?.name === 'percent'`);
      assert.match(await page.evaluate('document.activeElement.value'), /^\d+$/);
      for (const key of ['1', '4', '0']) await press(page, key);
      assert.equal(await page.evaluate('document.activeElement.value'), '140');
      await press(page, 'Enter');
      await sleep(200);
      assert.equal(await page.evaluate('Math.round(window.BeesonEditorShell.stage.zoom * 100)'), 140);
      assert.deepEqual(errors(page), []);
    });
  }

  // the keys printed beside the items of labels in the menu bar of bar
  async function keysIn(page, bar, labels) {
    const items = await readMenu(page, bar);
    return Object.fromEntries(labels.map((l) => [l, items.find((i) => i.label === l)?.keys]));
  }

  // menus-keys-5: a key is printed beside its item in every focus, as in Keynote and PowerPoint,
  // where the key of an item is fixed. with a figure selected on the canvas, Mod+D and Delete run
  // Edit > Duplicate and Edit > Delete, and in the navigator Edit > Duplicate and Edit > Delete hand
  // their runs to Duplicate Slide and Delete Slide. Duplicate Slide and Delete Slide print the keys
  // of the two items of the Edit menu only where the keys run them, i.e. in the navigator
  for (const platform of PLATFORMS) {
    test(`a key is printed beside its item in every focus, and Duplicate Slide and Delete Slide print a key only where it runs them (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 4 });
      const mac = platform === 'mac';
      const dup = mac ? '⌘D' : 'Ctrl+D';
      const del = mac ? '⌫' : 'Delete';
      await clickText(page, '.reveal .slides > section.present img');
      assert.deepEqual(await keysIn(page, 'Slide', ['Duplicate Slide', 'Delete Slide']), { 'Duplicate Slide': '', 'Delete Slide': '' });
      assert.deepEqual(await keysIn(page, 'Edit', ['Duplicate', 'Delete']), { Duplicate: dup, Delete: del });
      await press(page, 'Mod+D');
      await sleep(200);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal .slides > section.present figure').length`), 2, 'Mod+D did not duplicate the figure');
      await click(page, '.beeson-edit-nav .row:nth-child(5)');
      await sleep(100);
      assert.deepEqual(await keysIn(page, 'Slide', ['Duplicate Slide', 'Delete Slide']), { 'Duplicate Slide': dup, 'Delete Slide': del });
      assert.deepEqual(await keysIn(page, 'Edit', ['Duplicate', 'Delete']), { Duplicate: dup, Delete: del });
      assert.deepEqual(errors(page), []);
    });
  }

  // the context menus open, by their class, with whether the top one is hit at its center
  const menus = (page) =>
    page.evaluate(`(() => {
    const all = [...document.querySelectorAll('.beeson-edit-menu')];
    const top = all.at(-1);
    const r = top?.getBoundingClientRect();
    return { classes: all.map((m) => m.className), hit: !!r && !!document.elementFromPoint(r.left + r.width / 2, r.top + 12)?.closest('.beeson-edit-menu') };
  })()`);

  // the centers of the shown grips and of the rotate handle of the selection
  const grips = (page) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-grip, .beeson-rotor')].map((g) => ({ g, r: g.getBoundingClientRect() })).filter(({ g, r }) => r.width && getComputedStyle(g).pointerEvents !== 'none' && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === g).map(({ g, r }) => ({ name: g.dataset.handle ?? 'rotor', x: r.left + r.width / 2, y: r.top + r.height / 2 }))`);

  // menus-keys-3: a right-click on a grip or on the rotate handle of a selected object opens its
  // element menu, and the object stays selected
  for (const platform of PLATFORMS) {
    test(`a right-click on a grip or the rotate handle opens the menu of the object (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 4 });
      for (const pick of ['figure', 'paragraph']) {
        if (pick === 'figure') await clickText(page, '.reveal .slides > section.present img');
        else {
          await clickText(page, '.reveal .slides > section.present p');
          await press(page, 'Escape');
        }
        await sleep(100);
        const before = await page.evaluate(`window.BeesonEditor.selection().map((el) => el.tagName)`);
        assert.equal(before.length, 1, pick);
        const points = await grips(page);
        assert.ok(points.some((p) => p.name === 'rotor') && points.length >= 3, `${pick}: ${JSON.stringify(points)}`);
        for (const p of [points.find((q) => q.name === 'rotor'), points.find((q) => q.name !== 'rotor')]) {
          await click(page, p, { button: 'right' });
          await sleep(100);
          const m = await menus(page);
          assert.equal(m.classes.length, 1, `${pick} ${p.name}: no menu`);
          assert.match(m.classes[0], /\bcontext element\b/, `${pick} ${p.name}`);
          assert.equal(m.hit, true);
          await press(page, 'Escape');
          await sleep(50);
          assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.tagName)`), before, `${pick} ${p.name}: the selection changed`);
          assert.equal((await grips(page)).length, points.length, `${pick} ${p.name}: the grips are gone`);
        }
        await press(page, 'Escape');
      }
      assert.deepEqual(errors(page), []);
    });
  }

  // menus-keys-4: a right-click, Shift+F10, or the Menu key on a tile of the light table opens the
  // thumbnail menu of its slide over the light table
  for (const platform of PLATFORMS) {
    test(`a right-click, Shift+F10, or the Menu key on a tile opens the thumbnail menu (${platform})`, async (t) => {
      const page = await load(t, platform);
      await openTable(page);
      const tile = '.beeson-edit-sorter .tile:nth-of-type(4) .pic';
      await click(page, tile, { button: 'right' });
      await sleep(100);
      let m = await menus(page);
      assert.equal(m.classes.length, 1, 'a right-click opened no menu');
      assert.match(m.classes[0], /\bcontext slide\b/);
      assert.equal(m.hit, true, 'the menu is under the light table');
      const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item .label')].map((l) => l.textContent)`);
      assert.ok(items.includes('Duplicate Slide') && items.includes('Hide Slide'), items.join(', '));
      await press(page, 'Escape');
      await sleep(100);
      assert.equal((await menus(page)).classes.length, 0);
      assert.equal((await state(page, 'view.lightTable')).checked, true, 'Esc on the menu closed the light table');
      await click(page, '.beeson-edit-sorter .tile:nth-of-type(2) .pic');
      await press(page, 'Shift+F10');
      await sleep(100);
      m = await menus(page);
      assert.equal(m.classes.length, 1, 'Shift+F10 opened no menu');
      assert.match(m.classes[0], /\bcontext slide\b/);
      await press(page, 'Escape');
      await sleep(100);
      await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ContextMenu', code: 'ContextMenu', windowsVirtualKeyCode: 93 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ContextMenu', code: 'ContextMenu', windowsVirtualKeyCode: 93 });
      await sleep(100);
      m = await menus(page);
      assert.equal(m.classes.length, 1, 'the Menu key opened no menu');
      assert.deepEqual(errors(page), []);
    });
  }

  // menus-keys-6: the thumbnail menu has Select All Slides after Paste, with Mod+A, and it selects
  // every slide
  for (const platform of PLATFORMS) {
    test(`the thumbnail menu has Select All Slides after Paste (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, '.beeson-edit-nav .row:nth-child(3)', { button: 'right' });
      await sleep(100);
      const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => ({ label: i.querySelector('.label').textContent, keys: i.querySelector('.keys').textContent }))`);
      const at = items.findIndex((i) => i.label === 'Select All Slides');
      assert.ok(at > 0, items.map((i) => i.label).join(', '));
      assert.equal(items[at - 1].label, 'Paste');
      assert.equal(items[at].keys, platform === 'mac' ? '⌘A' : 'Ctrl+A');
      await click(page, await itemAt(page, 'Select All Slides'));
      await sleep(100);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-nav .row')].map((r) => r.getAttribute('aria-selected'))`);
      assert.ok(rows.length > 5);
      assert.deepEqual(rows, rows.map(() => 'true'));
      assert.deepEqual(errors(page), []);
    });
  }

  // the center of the tile of the slide of index i in the light table
  const tileAt = (page, i) =>
    page.evaluate(`(() => {
    const r = document.querySelectorAll('.beeson-edit-sorter .tile .pic')[${i}].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  })()`);

  // the index of the focused tile, or -1 when the focus is elsewhere, and the indices of the
  // selected tiles
  const tiles = (page) =>
    page.evaluate(`(() => {
    const all = [...document.querySelectorAll('.beeson-edit-sorter .tile')];
    return { focus: all.indexOf(document.activeElement), selected: all.flatMap((t, i) => (t.getAttribute('aria-selected') === 'true' ? [i] : [])) };
  })()`);

  // navigator-slides-canvas-3: after an undo in the light table, the focus is on the tile of the
  // restored slide, from which the arrow keys move
  for (const platform of PLATFORMS) {
    test(`an undo in the light table leaves the focus on the restored slide (${platform})`, async (t) => {
      const page = await load(t, platform);
      await openTable(page);
      await clickText(page, await tileAt(page, 3));
      await press(page, 'Backspace');
      await sleep(200);
      await press(page, 'Mod+Z');
      await sleep(300);
      assert.deepEqual(await tiles(page), { focus: 3, selected: [3] }, 'after an undo of Delete');
      await press(page, 'ArrowRight');
      await sleep(100);
      assert.deepEqual(await tiles(page), { focus: 4, selected: [4] });
      const from = await tileAt(page, 2);
      const to = await tileAt(page, 4);
      await drag(page, from, { dx: to.x + to.w / 4 - from.x, dy: to.y - from.y });
      await sleep(300);
      assert.notDeepEqual(await page.evaluate('window.BeesonEditor.render()'), page.source, 'the drag did not move the slide');
      await press(page, 'Mod+Z');
      await sleep(300);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
      // the selection from before the drag is restored, with the focus on its tile
      assert.deepEqual(await tiles(page), { focus: 4, selected: [4] }, 'after an undo of a drag');
      await press(page, 'ArrowRight');
      await sleep(100);
      assert.deepEqual(await tiles(page), { focus: 5, selected: [5] });
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R14.3 on both platforms with trusted input: New Slide in the Light Table
// keeps the focus on the tile of the new slide, and Select All and Delete of the Edit menu act on
// the slides while a tile or a row of the navigator has the focus, with the keys that run them there
describe('New Slide, Select All, and Delete on tiles', () => {
  const DECK = 'test-deck.html';
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
  const settle = (page) => page.evaluate('new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), 150))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const MOD_A = { mac: '⌘A', other: 'Ctrl+A' };

  async function load(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await settle(page);
    return page;
  }

  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const tile = (page, i) => rect(page, `document.querySelectorAll('.beeson-edit-sorter .tile .pic')[${i}]`);
  const row = (page, i) => rect(page, `document.querySelectorAll('.beeson-edit-nav .row')[${i}]`);
  const item = (page, label) => rect(page, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.textContent === ${js(label)})`);
  const itemState = (page, label) => page.evaluate(`(() => { const i = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.textContent === ${js(label)}); return i ? { keys: i.querySelector('.keys')?.textContent ?? '', disabled: i.getAttribute('aria-disabled') === 'true' } : null; })()`);
  const closeMenus = async (page) => { await page.evaluate('window.BeesonEditorShell?.closeMenus?.(); true'); await settle(page); };

  async function openBar(page, bar) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)})`));
    await settle(page);
  }

  const tiles = (page) => page.evaluate(`(() => {
  const all = [...document.querySelectorAll('.beeson-edit-sorter .tile')];
  const a = document.activeElement;
  const r = a.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { n: all.length, focus: all.indexOf(a), covered: !!top && !a.contains(top), selected: all.flatMap((t, i) => (t.getAttribute('aria-selected') === 'true' ? [i] : [])) };
})()`);
  const rows = (page) => page.evaluate(`(() => { const all = [...document.querySelectorAll('.beeson-edit-nav .row')]; return { n: all.length, selected: all.flatMap((r, i) => (r.getAttribute('aria-selected') === 'true' ? [i] : [])) }; })()`);

  async function lightTable(page) {
    await page.evaluate(`BeesonEditor.exec('view.lightTable')`);
    await settle(page);
    await click(page, await tile(page, 3));
    await settle(page);
  }

  for (const platform of PLATFORMS) {
    for (const how of ['key', 'menu']) {
      test(`New Slide by its ${how} in the Light Table keeps the focus on the tile of the new slide (${platform})`, async (t) => {
        const page = await load(t, platform);
        await lightTable(page);
        const n = (await tiles(page)).n;
        if (how === 'key') await press(page, 'Ctrl+M');
        else {
          await click(page, await tile(page, 3), { button: 'right' });
          await settle(page);
          await click(page, await item(page, 'New Slide'));
        }
        await settle(page);
        const s = await tiles(page);
        assert.deepEqual(s, { n: n + 1, focus: 4, covered: false, selected: [4] });
        const added = await render(page);
        assert.notEqual(added, page.source);
        await press(page, 'q');
        await settle(page);
        assert.equal(await render(page), added, 'a typed letter does not go into a hidden slide');
        await press(page, 'ArrowRight');
        await settle(page);
        assert.equal((await tiles(page)).focus, 5);
        await undo(page);
        await settle(page);
        assert.equal(await render(page), page.source);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`Select All Slides and Edit > Select All with a tile focused in the Light Table (${platform})`, async (t) => {
      const page = await load(t, platform);
      await lightTable(page);
      const n = (await tiles(page)).n;
      await click(page, await tile(page, 3), { button: 'right' });
      await settle(page);
      assert.deepEqual(await itemState(page, 'Select All Slides'), { keys: MOD_A[platform], disabled: false });
      await closeMenus(page);
      await click(page, await tile(page, 3));
      await settle(page);
      await openBar(page, 'Edit');
      assert.deepEqual(await itemState(page, 'Select All'), { keys: MOD_A[platform], disabled: false });
      await click(page, await item(page, 'Select All'));
      await settle(page);
      assert.deepEqual((await tiles(page)).selected, [...Array(n).keys()]);
      await click(page, await tile(page, 2));
      await settle(page);
      await press(page, 'Mod+A');
      await settle(page);
      assert.deepEqual((await tiles(page)).selected, [...Array(n).keys()]);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`Edit > Select All and Edit > Delete with a row of the navigator focused (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, await row(page, 4));
      await settle(page);
      const n = (await rows(page)).n;
      await openBar(page, 'Edit');
      assert.deepEqual(await itemState(page, 'Select All'), { keys: MOD_A[platform], disabled: false });
      assert.deepEqual(await itemState(page, 'Delete'), { keys: platform === 'mac' ? '⌫' : 'Delete', disabled: false });
      await click(page, await item(page, 'Select All'));
      await settle(page);
      assert.deepEqual((await rows(page)).selected, [...Array(n).keys()]);
      await click(page, await row(page, 4));
      await settle(page);
      await openBar(page, 'Edit');
      await click(page, await item(page, 'Delete'));
      await settle(page);
      const s = await rows(page);
      assert.equal(s.n, n - 1);
      assert.deepEqual(s.selected, [4]);
      const sections = (text) => text.split('<section').length;
      assert.equal(sections(await render(page)), sections(page.source) - 1);
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }

  // a figure selected on the canvas stays selected while the caret is in a field of a pane, where
  // Delete and Select All of the Edit menu act on the text of the field
  for (const platform of PLATFORMS) {
    for (const [what, field] of [
      ['the Description field of the Format pane', () => `document.querySelector('#beeson-edit-panel-format textarea[name="alt"]')`],
    ]) {
      test(`Edit > Delete and Edit > Select All with the caret in ${what} act on its text, and not on the figure selected on the canvas (${platform})`, async (t) => {
        const page = await load(t, platform);
        const n = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('figure.figure-box'))`);
        await page.evaluate(`Reveal.slide(${n})`);
        await settle(page);
        const at = field(n);
        const figure = () => rect(page, `[...document.querySelectorAll('.reveal section.present figure.figure-box img')].find((i) => i.getClientRects().length)`);
        const figures = (text) => text.split('<figure').length;
        const textOf = () => page.evaluate(`(() => { const f = ${at}; return 'value' in f ? f.value : f.textContent; })()`);
        const choose = async (label) => {
          await openBar(page, 'Edit');
          const state = await itemState(page, label);
          await click(page, await item(page, label));
          await settle(page);
          await closeMenus(page);
          return state;
        };
        await click(page, await figure());
        await settle(page);
        await click(page, await rect(page, at));
        await settle(page);
        assert.ok(await page.evaluate(`document.activeElement === ${at}`), `the caret is not in ${what}`);
        const text = await textOf();
        assert.ok(text.length > 3, `${what} does not have a text`);
        // at a caret, Delete is dimmed, as in a text of the slide
        const caret = await choose('Delete');
        assert.equal(figures(await render(page)), figures(page.source), `Edit > Delete at a caret in ${what} deleted the figure`);
        assert.equal(caret.disabled, true, `Edit > Delete is not dimmed at a caret in ${what}`);
        await choose('Select All');
        const selected = await page.evaluate(`(() => { const f = ${at}; return document.activeElement === f && ('value' in f ? f.value.slice(f.selectionStart, f.selectionEnd) : getSelection().toString()); })()`);
        assert.equal(selected, text, `Edit > Select All does not select the text of ${what}`);
        const range = await choose('Delete');
        assert.equal(range.disabled, false, `Edit > Delete is dimmed on a selected text in ${what}`);
        assert.equal(await textOf(), '', `Edit > Delete does not delete the selected text of ${what}`);
        assert.equal(figures(await render(page)), figures(page.source), `Edit > Delete on a selected text in ${what} deleted the figure`);
        // a paste is plain text in the field
        await page.evaluate(`Promise.resolve(window.BeesonEditor.exec('edit.paste', 'One\\n two')).then(() => true)`);
        await settle(page);
        assert.equal(await textOf(), 'One\n two', `Paste does not put the text into ${what}`);
        assert.equal(figures(await render(page)), figures(page.source), `Paste with the caret in ${what} changed the figures of the slide`);
        // a press on the figure takes the focus out of the text, and Delete acts on the figure again
        await click(page, await figure(), { button: 'right' });
        await settle(page);
        assert.equal((await itemState(page, 'Delete'))?.disabled, false, 'Delete is dimmed in the menu of the figure');
        await click(page, await item(page, 'Delete'));
        await settle(page);
        assert.equal(figures(await render(page)), figures(page.source) - 1, 'Delete in the menu of the figure does not delete it');
        assert.deepEqual(errors(page), []);
      });
    }
  }
});

// tests of R7.7 on both platforms with trusted input: a section of the light table moved by a drag
// of its head and renamed by a double click on its name, the tiles of the Add Slide popover in three
// columns as in the Add a Slide popover of Keynote, Distribute of one element across the slide and
// of two with Align to Slide, and an arrowhead at the start of a line alone. after each edit the
// text is checked byte for byte, after an undo and a redo, and after a save and an open
describe('Slide Sorter sections and the Add Slide popover', () => {
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const PANEL = '#beeson-edit-panel-format';
  const SORTER = '.beeson-edit-sorter';
  const FIGURE = '<figure class="figure-box fragment" data-fragment-index="2">';
  const LEAD = '<p>The lead-in of a display</p>';
  const P = '.reveal section.present > p';
  const FIGURE_BOX = '.reveal section.present .figure-box';
  const SELECTED = '.beeson-overlay > .beeson-frame.selected:not([hidden])';
  const IMG = '.reveal section.present .figure-box > img:not([hidden])';
  const MATH = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => m[0].includes('<h2>Math, an ordered list, and a zone</h2>'));

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
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const rect = (page, selector) => page.evaluate(`(() => { const e = [...document.querySelectorAll(${js(selector)})].find((e) => e.getBoundingClientRect().width); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  // the editor on slide n of a deck served over HTTP, with the Format tab shown
  async function load(t, platform, { deck = LAYOUTS, n = 0 } = {}) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // roundTrip checks the edited text, the text before byte for byte after an undo, the edited text
  // after a redo, and an open of the saved text without problems
  let saves = 0;
  async function roundTrip(page, edited) {
    assert.equal(await render(page), edited);
    await undo(page);
    await byteExact(page);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r7-7-${++saves}.html`);
    assert.equal(text, edited);
    page.source = text;
  }

  // a click on the tab or the button of the inspector whose text or title is name
  async function tap(page, name) {
    const at = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('${PANEL} button')].find((b) => b.textContent.trim() === ${js(name)} || b.title === ${js(name)} || b.getAttribute('aria-label') === ${js(name)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the inspector does not have a button ${name}`);
    await click(page, at);
    await frames(page);
  }

  // the center of the item labeled label of the open menus, or null
  const itemAt = (page, label) => page.evaluate(`(() => {
  const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)});
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  // the source with its sections put into the order of a list of their indices, each section moved
  // with the white space and the comments before it
  function reordered(source, order) {
    const units = [...source.matchAll(/\s*(?:<!--[\s\S]*?-->\s*)*<section[\s\S]*?<\/section>/g)];
    const start = units[0].index;
    const end = units.at(-1).index + units.at(-1)[0].length;
    return source.slice(0, start) + order.map((i) => units[i][0]).join('') + source.slice(end);
  }

  const heads = (page) => page.evaluate(`[...document.querySelectorAll('${SORTER} .head')].map((h) => h.querySelector('.name').textContent + ' ' + h.querySelector('.n').textContent)`);
  const headOf = (name) => `[...document.querySelectorAll('${SORTER} .head')].find((h) => h.querySelector('.name').textContent === ${js(name)})`;
  const nameAt = (page, name) => page.evaluate(`(() => { const r = ${headOf(name)}.querySelector('.name').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top }; })()`);
  const picked = (page) => page.evaluate(`[...document.querySelectorAll('${SORTER} .tile[aria-selected="true"]')].map((t) => Number(t.querySelector('.no').textContent))`);
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);

  for (const platform of PLATFORMS) {
    test(`a drag of a section head in the light table moves the section slide with its slides as one entry (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: DECK, n: 4 });
      await exec(page, 'view.lightTable');
      await frames(page);
      assert.deepEqual(await heads(page), ['Opening 1 slide', 'Chapter one 5 slides', 'Chapter two 7 slides']);
      // a click on a head selects the slides of its section, as in PowerPoint
      await click(page, await nameAt(page, 'Chapter one'));
      await frames(page);
      assert.deepEqual(await picked(page), [2, 3, 4, 5, 6]);
      assert.equal(await page.evaluate(`${headOf('Chapter one')}.classList.contains('picked')`), true);
      // the head of Chapter two is dragged above the head of Chapter one, with a line across the light
      // table where it is dropped
      const from = await nameAt(page, 'Chapter two');
      const to = await nameAt(page, 'Chapter one');
      await drag(page, from, { dy: to.y - from.y - 6, hold: true });
      const line = await rect(page, `${SORTER} .drop.across`);
      assert.ok(line && line.width > 600 && line.top < to.top, `the drop line is at ${js(line)}`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x, y: to.y - 6, button: 'left', clickCount: 1 });
      await page.waitFor(`document.querySelectorAll('.reveal .slides > section')[1].querySelector('h2')?.textContent === 'Chapter two'`);
      await frames(page);
      // the closing slide moves with Chapter two, hence Chapter one follows it as the appendix
      assert.deepEqual(await heads(page), ['Opening 1 slide', 'Chapter two 7 slides', 'Appendix 5 slides']);
      assert.deepEqual(await picked(page), [2, 3, 4, 5, 6, 7, 8]);
      assert.equal(await undoLabel(page), 'Undo Move Section');
      await roundTrip(page, reordered(page.source, [0, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5]));
      // a drop where the section already is leaves the file and the history alone
      await frames(page);
      const before = await undoLabel(page);
      const again = await nameAt(page, 'Chapter two');
      await drag(page, again, { dy: 8 });
      await frames(page);
      await byteExact(page);
      assert.equal(await undoLabel(page), before);
      assert.deepEqual(errors(page), []);
    });

    test(`a double click on the name of a section head renames its section slide, and Esc keeps the name (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: DECK, n: 4 });
      await exec(page, 'view.lightTable');
      await frames(page);
      await click(page, await nameAt(page, 'Chapter one'), { count: 2 });
      await frames(page);
      const field = `${SORTER} input.rename`;
      assert.equal(await page.evaluate(`document.activeElement === document.querySelector('${field}')`), true, 'the field of the name does not have the focus');
      assert.equal(await page.evaluate(`document.querySelector('${field}').value`), 'Chapter one');
      // Esc drops the typed name and keeps the light table open
      await type(page, 'Nothing');
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector('${field}')`), null);
      assert.equal(await page.evaluate(`document.querySelector('${SORTER}').hidden`), false, 'Esc in the field closed the light table');
      await byteExact(page);
      // Return writes the typed name into the heading of the section slide
      await click(page, await nameAt(page, 'Chapter one'), { count: 2 });
      await frames(page);
      await type(page, 'Part one');
      await press(page, 'Enter');
      await page.waitFor(`document.querySelectorAll('.reveal .slides > section')[1].querySelector('h2').textContent === 'Part one'`);
      await frames(page);
      assert.deepEqual(await heads(page), ['Opening 1 slide', 'Part one 5 slides', 'Chapter two 7 slides']);
      assert.equal(await undoLabel(page), 'Undo Rename Section');
      await byteExact(page, [['<h2>Chapter one</h2>', '<h2>Part one</h2>']]);
      await roundTrip(page, await render(page));
      assert.deepEqual(errors(page), []);
    });

    test(`the Add Slide popover draws its tiles 120 px wide in three columns, as in Keynote (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: DECK, n: 4 });
      await click(page, '.beeson-edit-top [data-command="slide.gallery"]');
      await frames(page);
      const tiles = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-gallery .tile')].map((t) => { const r = t.getBoundingClientRect(), p = t.querySelector('.pic').getBoundingClientRect(); return { layout: t.dataset.layout, left: Math.round(r.left), top: Math.round(r.top), width: r.width, pic: p.width, ratio: p.width / p.height }; })`);
      assert.equal(tiles.length, 9);
      for (const tile of tiles) {
        assert.equal(tile.width, 120, `the tile of ${tile.layout} is ${tile.width} px wide`);
        assert.equal(tile.pic, 112);
        assert.ok(Math.abs(tile.ratio - 16 / 9) < 0.02);
      }
      assert.equal(new Set(tiles.map((t) => t.left)).size, 3, 'the tiles are not in three columns');
      assert.deepEqual(tiles.slice(0, 3).map((t) => t.top), [tiles[0].top, tiles[0].top, tiles[0].top]);
      assert.ok(tiles[3].top > tiles[0].top && tiles[3].left === tiles[0].left);
      const box = await rect(page, '.beeson-edit-gallery');
      assert.ok(box.right <= 1600 && box.bottom <= 1000 && box.width < 420, `the popover is ${js(box)}`);
      // ArrowDown moves the focus one row down, i.e. by three tiles, and Space adds a slide of it
      assert.equal(await page.evaluate(`document.activeElement.dataset.layout`), 'content');
      await press(page, 'ArrowDown');
      assert.equal(await page.evaluate(`document.activeElement.dataset.layout`), 'figure');
      await press(page, 'ArrowUp');
      await press(page, 'ArrowUp');
      assert.equal(await page.evaluate(`document.activeElement.dataset.layout`), 'title');
      await press(page, 'ArrowDown');
      await press(page, 'ArrowDown');
      assert.equal(await page.evaluate(`document.activeElement.dataset.layout`), 'split');
      await press(page, 'Space');
      await page.waitFor(`document.querySelectorAll('.reveal .slides > section').length === 14`);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal .slides > section')[5].matches('.split')`), true);
      await roundTrip(page, await render(page));
      assert.deepEqual(errors(page), []);
    });

    test(`Distribute centers one element on the slide, with Align to Selection dimmed for it (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await selectFigure(page, IMG);
      await frames(page);
      assert.equal((await state(page, 'arrange.distribute.horizontal')).enabled, true);
      assert.equal((await state(page, 'arrange.distribute.vertical')).enabled, true);
      assert.equal((await state(page, 'arrange.alignTo.selection')).enabled, false);
      assert.equal((await state(page, 'arrange.alignTo.slide')).checked, true);
      // a figure has the Image pane with its tabs, and Distribute is in the tab Arrange
      await tap(page, 'Arrange');
      await tap(page, 'Horizontally');
      const text = await render(page);
      const dx = Number(text.match(/<figure class="figure-box fragment" data-fragment-index="2" style="translate: (-?\d+)px 0px">/)?.[1]);
      assert.ok(dx < 0, `the offset of the figure is ${dx}`);
      await byteExact(page, [[FIGURE, `${FIGURE.slice(0, -1)} style="translate: ${dx}px 0px">`]]);
      const slide = await rect(page, '.reveal .slides');
      // the frame of the figure, i.e. its picture with its caption, is centered
      const frame = await rect(page, SELECTED);
      assert.ok(Math.abs(frame.x - slide.x) <= 1.5, `the figure is centered at ${frame.x}, and the slide at ${slide.x}`);
      await roundTrip(page, text);
      // the open of the saved text clears the selection
      await selectFigure(page, IMG);
      await tap(page, 'Arrange');
      await tap(page, 'Vertically');
      const both = await render(page);
      const dy = Number(both.match(/data-fragment-index="2" style="translate: -?\d+px (-?\d+)px">/)?.[1]);
      assert.ok(Number.isFinite(dy) && dy !== 0, `the vertical offset of the figure is ${dy}`);
      const framed = await rect(page, SELECTED);
      assert.ok(Math.abs(framed.y - slide.y) <= 1.5, `the figure is centered at ${framed.y}, and the slide at ${slide.y}`);
      await roundTrip(page, both);
      assert.deepEqual(errors(page), []);
    });

    test(`Distribute is dimmed for two elements with Align to Slide and with Align to Selection (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      const p = await rect(page, P);
      await selectFigure(page, IMG);
      await click(page, { x: p.right + 3, y: p.y }, { modifiers: 'Shift' });
      await frames(page);
      assert.equal((await state(page, 'arrange.alignTo.selection')).enabled, true);
      for (const ref of ['Slide', 'Selection']) {
        await tap(page, ref);
        assert.equal((await state(page, 'arrange.distribute.horizontal')).enabled, false, `two elements are distributed with Align to ${ref}`);
      }
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`Arrowhead at Start in the Line pane and in Format > Line writes marker-start alone (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await exec(page, 'insert.line', { from: { x: 300, y: 500 }, to: { x: 800, y: 500 } });
      await frames(page);
      const plain = lineText({ x1: 300, y1: 500, x2: 800, y2: 500 }, { id: 'line-1' });
      const start = lineText({ x1: 300, y1: 500, x2: 800, y2: 500 }, { id: 'line-1', heads: 'start' });
      const end = lineText({ x1: 300, y1: 500, x2: 800, y2: 500 }, { id: 'line-1', heads: 'end' });
      assert.ok(start.includes('<line x1="0" y1="0" x2="500" y2="0" marker-start="url(#line-1)"></line>'));
      page.source = await render(page);
      assert.ok(page.source.includes(plain));
      await tap(page, 'Arrowhead at Start');
      await byteExact(page, [[plain, start]]);
      assert.equal((await state(page, 'line.heads.start')).checked, true);
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} [data-command="line.heads.start"]').getAttribute('aria-pressed')`), 'true');
      // the grip of each end is drawn on its end, the tip of the head at the start
      const grips = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('.beeson-line-end')].filter((g) => !g.hidden).map((g) => { const r = g.getBoundingClientRect(); return [g.dataset.end, r.left + r.width / 2]; }))`);
      const ends = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'), r = s.getBoundingClientRect(), k = r.width / s.offsetWidth; return [r.left + 300 * k, r.left + 800 * k]; })()`);
      assert.ok(Math.abs(grips[1] - ends[0]) <= 1, `the grip of the start is at ${grips[1]}, and the start at ${ends[0]}`);
      assert.ok(Math.abs(grips[2] - ends[1]) <= 1, `the grip of the end is at ${grips[2]}, and the end at ${ends[1]}`);
      await roundTrip(page, await render(page));
      // Format > Line > Arrowhead at Start, from an arrowhead at the end, on the line selected again
      // after the open of the saved text
      const near = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'), r = s.getBoundingClientRect(), k = r.width / s.offsetWidth; return { x: r.left + 550 * k, y: r.top + 500 * k + 3 }; })()`);
      await click(page, near);
      await frames(page);
      await exec(page, 'line.heads.end');
      await frames(page);
      page.source = await render(page);
      assert.ok(page.source.includes(end));
      await click(page, await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === 'Format').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
      await frames(page);
      const sub = await itemAt(page, 'Line');
      assert.ok(sub, 'Format does not have the submenu Line');
      await click(page, sub);
      await frames(page);
      const item = await itemAt(page, 'Arrowhead at Start');
      assert.ok(item, 'Format > Line does not list Arrowhead at Start');
      await click(page, item);
      await frames(page);
      await byteExact(page, [[end, start]]);
      await roundTrip(page, await render(page));
      assert.deepEqual(errors(page), []);
    });
  }
});
