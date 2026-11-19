// the editor in a narrow window: the toolbar with More and Customize Toolbar, Slide Only and View >
// Navigator, the width of the navigator, and the inspector closed and given back

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, contrast, drag, GROUND, INK, press, saveAndReopen, type } from './helpers/editor.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';

// tests of R7.6 on both platforms with trusted input: Slide Only in the View menu and the View
// button, the tick at 100% of the zoom slider, the sheet Customize Toolbar with its layout kept for
// the deck, and the scopes of Find. the settings do not change the file, and after an edit of the
// file the text is checked byte for byte, after an undo and a redo, and after a save and an open
describe('Slide Only, Customize Toolbar, and Find scopes', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const DARK = 'alt="A figure, dark version"';
  const LIGHT = 'alt="A figure, light version"';

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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const boxOf = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; })()`);

  // the editor on the slide n of a deck served over HTTP, opened with text after change is run on the
  // page. with clear, the storage of the origin is emptied before the editor is loaded
  async function load(t, platform, { deck = LAYOUTS, n = 0, text = readFileSync(deck, 'utf8'), change = '', clear = true, size = { width: 1600, height: 1000 } } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    if (clear) await page.send('Storage.clearDataForOrigin', { origin: server.origin, storageTypes: 'local_storage' });
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    if (change) await page.evaluate(change);
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // roundTrip checks the edits in the text, then the text before byte for byte after an undo, the
  // edit after a redo, and an open of the saved edit without problems
  let saves = 0;
  async function roundTrip(page, edits) {
    await byteExact(page, edits);
    const edited = await render(page);
    await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r7-6-${++saves}.html`);
    assert.equal(text, edited);
    page.source = text;
  }

  // the labels of the items of the open menu
  const menuLabels = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => i.querySelector('.label')?.textContent ?? '')`);

  // a trusted click on the item labeled label of the open menu
  async function choose(page, label) {
    const at = await page.evaluate(`(() => {
    const items = [...document.querySelectorAll('.beeson-edit-menu .item')];
    const text = (i) => i.querySelector('.label')?.textContent ?? '';
    const item = items.find((i) => text(i) === ${js(label)}) ?? items.find((i) => text(i).startsWith(${js(label)}));
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the open menu has no item ${label}`);
    await click(page, at);
    await frames(page);
  }

  async function openBar(page, bar) {
    await click(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await frames(page);
  }

  const panes = async (page) => ({
    navigator: (await state(page, 'view.navigator')).checked,
    format: (await state(page, 'shell.format')).checked,
    steps: (await state(page, 'view.steps')).checked,
    slideOnly: (await state(page, 'view.slideOnly')).checked,
  });

  // the ids of the buttons of the toolbar, in their order
  const toolbarIds = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-top [data-command]')].map((b) => b.dataset.command)`);
  const KEY = `beeson-edit-toolbar:/${LAYOUTS}`;
  const kept = (page) => page.evaluate(`JSON.parse(localStorage.getItem(${js(KEY)}) ?? 'null')`);

  for (const platform of PLATFORMS) {
    test(`Slide Only of the View menu hides the navigator and leaves the inspector open, and the View button shows the navigator again (${platform})`, async (t) => {
      const page = await load(t, platform);
      const canvas = await boxOf(page, '.beeson-edit-canvas');
      assert.deepEqual(await panes(page), { navigator: true, format: true, steps: false, slideOnly: false });
      await openBar(page, 'View');
      const labels = await menuLabels(page);
      assert.equal(labels[labels.indexOf('Navigator') + 1], 'Slide Only');
      await choose(page, 'Slide Only');
      assert.deepEqual(await panes(page), { navigator: false, format: true, steps: false, slideOnly: true });
      const wide = await boxOf(page, '.beeson-edit-canvas');
      assert.ok(wide.w > canvas.w + 150, `the canvas is ${wide.w} px wide in Slide Only and ${canvas.w} px before`);
      // the View button of the toolbar is not pressed in Slide Only, and its main part shows the
      // navigator again
      const view = '.beeson-edit-top [data-command="toolbar.view"]';
      assert.equal(await page.evaluate(`document.querySelector(${js(view)}).getAttribute('aria-pressed')`), 'false');
      await click(page, view);
      await frames(page);
      assert.deepEqual(await panes(page), { navigator: true, format: true, steps: false, slideOnly: false });
      assert.equal(await page.evaluate(`document.querySelector(${js(view)}).getAttribute('aria-pressed')`), 'true');
      assert.equal((await boxOf(page, '.beeson-edit-canvas')).w, canvas.w);
      // the Steps tab is kept open through Slide Only
      await exec(page, 'view.steps');
      await openBar(page, 'View');
      await choose(page, 'Slide Only');
      assert.deepEqual(await panes(page), { navigator: false, format: false, steps: true, slideOnly: true });
      await openBar(page, 'View');
      await choose(page, 'Slide Only');
      assert.deepEqual(await panes(page), { navigator: true, format: false, steps: true, slideOnly: false });
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`a drag of the zoom slider near its tick at 100% snaps to 100% (${platform})`, async (t) => {
      const page = await load(t, platform);
      const slider = '.beeson-edit-bottom .slider input';
      const thumb = async () => {
        const r = await boxOf(page, slider);
        const v = Number(await page.evaluate(`document.querySelector(${js(slider)}).value`));
        return { x: r.x + 7 + ((r.w - 14) * v) / 1000, y: r.y + r.h / 2 };
      };
      const tick = await center(page, '.beeson-edit-bottom .slider .tick');
      const readout = () => page.evaluate(`document.querySelector('.beeson-edit-top [data-command="toolbar.zoom"] .readout').textContent`);
      assert.match(await readout(), /^\d+%$/);
      // a drag that ends 3 px past the tick gives 100%, with the thumb on the tick
      let from = await thumb();
      await drag(page, from, { dx: tick.x + 3 - from.x, dy: 0, steps: 12 });
      await frames(page);
      assert.equal(await readout(), '100%');
      assert.ok(Math.abs((await thumb()).x - tick.x) < 1, `the thumb is at ${(await thumb()).x} and the tick at ${tick.x}`);
      // a drag that ends 12 px past the tick does not snap
      from = await thumb();
      await drag(page, from, { dx: 12, dy: 0, steps: 6 });
      await frames(page);
      assert.ok(Number((await readout()).replace('%', '')) > 110, await readout());
      // the arrow keys move the slider past the tick
      await page.evaluate(`document.querySelector(${js(slider)}).focus()`);
      for (let i = 0; i < 3; i++) await press(page, 'ArrowLeft');
      assert.notEqual(await readout(), '100%');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`Customize Toolbar adds and removes items by drags, sets Show, keeps the layout for the deck, and the default set restores it (${platform})`, async (t) => {
      let page = await load(t, platform);
      const defaults = await toolbarIds(page);
      assert.deepEqual(defaults.slice(0, 3), ['toolbar.view', 'toolbar.zoom', 'edit.undo']);
      await openBar(page, 'View');
      const labels = await menuLabels(page);
      assert.equal(labels[labels.length - 1], 'Customize Toolbar…');
      await choose(page, 'Customize Toolbar…');
      assert.equal(await page.evaluate(`!document.querySelector('.beeson-edit-customize').hidden`), true);
      const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-customize .palette .item')].map((i) => i.dataset.item)`);
      for (const id of ['toolbar.view', 'insert.table', 'file.present', 'find.open', 'arrange.lock', 'separator', 'space']) assert.ok(items.includes(id), `the sheet has no item ${id}`);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-customize .foot .show').textContent`), 'Icon and Text');
      // a button of the toolbar does not run its command while the sheet is open
      await click(page, '.beeson-edit-top [data-command="slide.gallery"]');
      assert.equal(await render(page), page.source);

      // Find dragged from the sheet onto the left half of Redo is put before it
      const find = await center(page, '.beeson-edit-customize .item[data-item="find.open"]');
      const redo = await boxOf(page, '.beeson-edit-top [data-command="edit.redo"]');
      await drag(page, find, { dx: redo.x + 6 - find.x, dy: redo.y + redo.h / 2 - find.y, steps: 14 });
      await frames(page);
      let ids = await toolbarIds(page);
      assert.equal(ids[ids.indexOf('edit.redo') - 1], 'find.open');
      // Table dragged from the toolbar into the sheet is taken off
      const table = await center(page, '.beeson-edit-top [data-command="insert.table"]');
      await drag(page, table, { dx: 0, dy: 260, steps: 10 });
      await frames(page);
      ids = await toolbarIds(page);
      assert.ok(!ids.includes('insert.table'));
      assert.ok(ids.includes('find.open'));

      // Show Icon Only hides the labels, and the layout is kept for this deck
      await click(page, '.beeson-edit-customize .foot .show');
      await frames(page);
      assert.deepEqual(await menuLabels(page), ['Icon and Text', 'Icon Only', 'Text Only']);
      await choose(page, 'Icon Only');
      const label = () => page.evaluate(`getComputedStyle(document.querySelector('.beeson-edit-top [data-command="file.present"] .label')).display`);
      const glyph = () => page.evaluate(`getComputedStyle(document.querySelector('.beeson-edit-top [data-command="file.present"] .beeson-icon')).display`);
      assert.equal(await label(), 'none');
      let saved = await kept(page);
      assert.equal(saved.show, 'icon');
      assert.ok(saved.items.includes('find.open') && !saved.items.includes('insert.table'));
      await click(page, '.beeson-edit-customize .foot .done');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-customize').hidden`), true);
      // the new button runs its command once the sheet is closed
      await click(page, '.beeson-edit-top [data-command="find.open"]');
      await page.waitFor(`!document.querySelector('.beeson-find').hidden`);
      await press(page, 'Escape');
      assert.equal(await render(page), page.source);
      assert.equal((await page.evaluate('window.BeesonEditor.status()')).dirty, false);

      // the layout is shown again when the deck is opened again, and not on another deck
      const layout = await toolbarIds(page);
      await page.close();
      const other = await load(t, platform, { deck: 'test-deck.html', clear: false });
      assert.deepEqual((await toolbarIds(other)).slice(0, 3), ['toolbar.view', 'toolbar.zoom', 'edit.undo']);
      assert.ok(!(await toolbarIds(other)).includes('find.open'));
      await other.close();
      page = await load(t, platform, { clear: false });
      assert.deepEqual(await toolbarIds(page), layout);
      assert.equal(await label(), 'none');

      // Text Only hides the icons, and the default set dragged into the toolbar restores it
      await exec(page, 'view.customizeToolbar');
      await click(page, '.beeson-edit-customize .foot .show');
      await choose(page, 'Text Only');
      assert.equal(await glyph(), 'none');
      assert.notEqual(await label(), 'none');
      const row = await center(page, '.beeson-edit-customize .default');
      const bar = await boxOf(page, '.beeson-edit-top');
      await drag(page, row, { dx: bar.x + bar.w / 2 - row.x, dy: bar.y + bar.h / 2 - row.y, steps: 12 });
      await frames(page);
      await click(page, '.beeson-edit-customize .foot .done');
      await frames(page);
      assert.deepEqual(await toolbarIds(page), defaults);
      saved = await kept(page);
      assert.deepEqual(saved, { items: null, show: 'text' });
      // with Icon and Text and the default set, nothing is kept
      await exec(page, 'view.customizeToolbar');
      await click(page, '.beeson-edit-customize .foot .show');
      await choose(page, 'Icon and Text');
      await press(page, 'Escape');
      assert.equal(await kept(page), null);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`Customize Toolbar works from the keyboard: Return adds an item, Delete takes one off, and Esc closes the sheet (${platform})`, async (t) => {
      const page = await load(t, platform);
      const defaults = await toolbarIds(page);
      await exec(page, 'view.customizeToolbar');
      assert.equal(await page.evaluate(`document.activeElement.matches('.beeson-edit-customize .item')`), true);
      await page.evaluate(`document.querySelector('.beeson-edit-customize .item[data-item="arrange.lock"]').focus()`);
      await press(page, 'Enter');
      let ids = await toolbarIds(page);
      // an item added from the keyboard is put before the space, i.e. after Present
      assert.equal(ids[ids.indexOf('file.present') + 1], 'arrange.lock');
      await page.evaluate(`document.querySelector('.beeson-edit-top [data-command="arrange.lock"]').focus()`);
      await press(page, 'Delete');
      assert.deepEqual(await toolbarIds(page), defaults);
      await page.evaluate(`document.querySelector('.beeson-edit-top [data-command="edit.undo"]').focus()`);
      await press(page, 'Backspace');
      assert.ok(!(await toolbarIds(page)).includes('edit.undo'));
      // Return on the default set puts it back
      await page.evaluate(`document.querySelector('.beeson-edit-customize .default').focus()`);
      await press(page, 'Enter');
      assert.deepEqual(await toolbarIds(page), defaults);
      await press(page, 'Escape');
      assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-customize').hidden`), true);
      assert.equal(await kept(page), null);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`the gear menu of Find sets the scope to the slides and notes, the notes only, or the alt texts (${platform})`, async (t) => {
      const page = await load(t, platform);
      await press(page, 'Mod+F');
      await type(page, 'slide');
      const count = () => page.evaluate(`document.querySelector('.beeson-find .count').textContent`);
      const total = (c) => (c === 'Not found' ? 0 : Number(c.split(' of ')[1]));
      const all = total(await count());
      // the notes of the deck, as the panel counts them
      const notes = [...page.source.matchAll(/<aside class="notes">([\s\S]*?)<\/aside>/g)].reduce((n, m) => n + (m[1].match(/slide/gi)?.length ?? 0), 0);
      assert.ok(notes > 0 && all > notes, `${all} matches in all and ${notes} in the notes`);
      await click(page, '.beeson-find .gear');
      await frames(page);
      const labels = await menuLabels(page);
      for (const l of ['Slides and Notes', 'Notes Only', 'Alt Texts']) assert.ok(labels.includes(l), `the gear menu has no ${l}`);
      assert.ok(labels.indexOf('Alt Texts') < labels.indexOf('Search TeX of Formulas'));
      await choose(page, 'Notes Only');
      assert.equal(total(await count()), notes);
      assert.equal((await state(page, 'find.scopeNotes')).checked, true);
      assert.equal((await state(page, 'find.scopeAll')).checked, false);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-find .search input').placeholder`), 'Find in Notes');
      // the current match is in the notes, which are shown
      assert.equal(await page.evaluate(`!!getSelection().anchorNode?.parentElement?.closest('aside.notes') || [...CSS.highlights.get('beeson-find-current') ?? []].some((r) => r.startContainer.parentElement.closest('aside.notes'))`), true);

      // in the scope of the alt texts, TeX is dimmed, and the alt texts of the images are found
      await click(page, '.beeson-find .gear');
      await choose(page, 'Alt Texts');
      assert.equal((await state(page, 'find.tex')).enabled, false);
      await click(page, '.beeson-find .search .clear');
      await type(page, 'version');
      assert.equal(await count(), '1 of 2');
      assert.equal(await page.evaluate(`document.querySelector('.beeson-find .search input').placeholder`), 'Find in Alt Texts');
      // the image of the current match is selected on its slide
      const slide = await page.evaluate(`Reveal.getIndices().h`);
      assert.equal(slide, await page.evaluate(`Reveal.getIndices(document.querySelector('.reveal img[alt="A figure, dark version"]').closest('section')).h`));
      // Replace All writes the alt texts as one entry of the history
      await exec(page, 'find.replace');
      await page.evaluate(`document.querySelector('.beeson-find .replace input').focus()`);
      await type(page, 'variant');
      await click(page, '.beeson-find .actions button:first-child');
      await page.waitFor(`window.BeesonEditor.render() !== ${js(page.source)}`);
      assert.equal(await count(), '2 replaced');
      await roundTrip(page, [[DARK, 'alt="A figure, dark variant"'], [LIGHT, 'alt="A figure, light variant"']]);
      // in the scope of the slides and the notes, the alt texts are not searched
      await click(page, '.beeson-find .gear');
      await choose(page, 'Slides and Notes');
      await click(page, '.beeson-find .search .clear');
      await type(page, 'variant');
      assert.equal(await count(), 'Not found');
      assert.deepEqual(errors(page), []);
    });
  }
});

// tests of R30.1, the list of a split button that is folded into More, on both platforms with
// trusted input. in a narrow window the toolbar folds its last groups into the button More, and a
// folded split button whose arrow has a list is a submenu of More with the items of this list, as a
// folded item with a menu is in Keynote. the submenu opens at a hover or the right arrow and closes
// at the left arrow and Esc. each item of the submenu runs its command with its check mark, its key,
// and its dimmed state as in the list of the arrow
describe('a split button folded into More', () => {
  const DECK = 'test/pages/editor-r22-2.html';
  const PLATFORMS = ['mac', 'other'];
  const MORE = '.beeson-edit-top .more-groups';
  const LAYER = '.beeson-edit-play';
  // the slides of the deck
  const BACKDROP = 1, STEPS = 2;
  const TOOLBAR_KEY = `beeson-edit-toolbar:/${DECK}`;

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
  const wait = (page, ms) => page.evaluate(`new Promise((d) => setTimeout(() => d(true), ${ms}))`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const layer = (page) => page.evaluate(`!!document.querySelector('${LAYER}')`);
  const rafs = (page) => page.evaluate('Beeson.backdrops.filter((b) => b.raf).length');
  const menus = (page) => page.evaluate(`document.querySelectorAll('.beeson-edit-menu').length`);

  // the editor on the deck at slide n in a window of width px. the storage of the browser is cleared
  // before the load and then given the pairs of stored. with motion, a backdrop is traced
  async function load(t, platform, { n = 0, width = 760, stored = {}, motion = false, step = 1000 } = {}) {
    const page = await browser.newPage({ width, height: 700, motion });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit${motion ? '' : '&still'}&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate(`localStorage.clear(); for (const [k, v] of Object.entries(${js(stored)})) localStorage.setItem(k, v); true`);
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(DECK, 'utf8'))})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`if (window.BeesonEditor.preview) window.BeesonEditor.preview.step = ${step}`);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function resize(page, width) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height: 700, deviceScaleFactor: 1, mobile: false });
    await frames(page);
    await frames(page);
  }

  // the rows of the open menu k, the root first: a rule as '-', and an item with its command, label,
  // key, check mark, dimmed state, and whether it opens a submenu
  const rows = (page, k = -1) => page.evaluate(`[...[...document.querySelectorAll('.beeson-edit-menu')].at(${k}).querySelectorAll(':scope > .item, :scope > .rule')].map((i) => i.matches('.rule') ? '-' : {
  command: i.dataset.command ?? null,
  label: i.querySelector('.label').textContent.trim(),
  keys: i.querySelector('.keys').textContent,
  checked: i.getAttribute('aria-checked'),
  dimmed: i.getAttribute('aria-disabled') === 'true',
  sub: i.getAttribute('aria-haspopup') === 'menu',
})`);
  const labels = async (page, k = -1) => (await rows(page, k)).map((r) => (r === '-' ? '-' : r.label));
  // the label of the highlighted row of the open menu k
  const highlighted = (page, k = -1) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu')].at(${k}).querySelector('.item.hi .label')?.textContent.trim() ?? null`);
  // the center of the first row of the open menu k that matches the test fn
  const rowAt = (page, k, fn) => page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-menu')[${k}].querySelectorAll('.item')].find(${fn}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  // the rows of the list of the arrow of the split button of command in the toolbar
  async function arrowRows(page, command) {
    await click(page, await page.evaluate(`(() => { const r = document.querySelector('.beeson-edit-top [data-command="${command}"]').parentElement.querySelector('.more').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    await frames(page);
    const out = await rows(page, 0);
    await press(page, 'Escape');
    await frames(page);
    return out;
  }

  // a hover over the row of label of the open menu k, held until its submenu opens
  async function hover(page, label, k = -1) {
    const at = await rowAt(page, k < 0 ? `document.querySelectorAll('.beeson-edit-menu').length - 1` : k, `(i) => i.querySelector('.label').textContent.trim() === ${js(label)}`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x - 4, y: at.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await wait(page, 300);
  }

  // a trusted Return with its text, which presses the button of the focus as a keyboard does
  async function returnKey(page) {
    await press(page, 'Enter');
    await frames(page);
  }

  // the down arrow in the open menu until the row of label is highlighted
  async function downTo(page, label) {
    for (let i = 0; i < 20 && (await highlighted(page)) !== label; i++) await press(page, 'ArrowDown');
    assert.equal(await highlighted(page), label);
  }

  const glyphs = /[⌘⌥⇧⌃]/;

  for (const platform of PLATFORMS) {
    test(`More lists each folded split button with a list as a submenu with the items of its arrow, and the other folded buttons as items (${platform})`, async (t) => {
      const page = await load(t, platform, { width: 1600, n: BACKDROP });
      const SPLITS = { 'insert.shape.rounded': 'Shape', 'insert.image': 'Media', 'preview.slide': 'Preview' };
      const lists = {};
      for (const id of Object.keys(SPLITS)) lists[id] = await arrowRows(page, id);
      await resize(page, 760);
      assert.ok(await page.evaluate(`!document.querySelector('.beeson-edit-top [data-command="preview.slide"]')`), 'Preview is not folded at 760 px');
      await click(page, MORE);
      await frames(page);
      const root = await rows(page, 0);
      assert.deepEqual(root.map((r) => (r === '-' ? '-' : r.label)), ['Table', 'Text', 'Formula', 'Shape', 'Media', '-', 'Preview', 'Present', '-', 'Save']);
      for (const r of root) if (r !== '-') assert.equal(r.sub, Object.values(SPLITS).includes(r.label), `${r.label} opens a submenu: ${r.sub}`);
      for (const [id, label] of Object.entries(SPLITS)) {
        await hover(page, label, 0);
        assert.equal(await menus(page), 2, `the submenu of ${label} is not opened by a hover`);
        assert.deepEqual(await rows(page, 1), lists[id], `the submenu of ${label} is not the list of its arrow`);
      }
      const keys = Object.values(lists).flat().filter((r) => r !== '-' && r.keys).map((r) => r.keys);
      if (platform === 'other') assert.ok(keys.every((k) => !glyphs.test(k)), `a key in the form of the Mac: ${keys}`);
      await press(page, 'Escape');
      assert.deepEqual(errors(page), []);
    });

    test(`the right arrow opens the submenu of Preview in More, the left arrow and Esc close it, and Return runs Play Steps (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS, step: 5000 });
      await page.evaluate(`document.querySelector('${MORE}').focus()`);
      await returnKey(page);
      await frames(page);
      await downTo(page, 'Preview');
      await press(page, 'ArrowRight');
      await frames(page);
      assert.equal(await menus(page), 2, 'the right arrow does not open the submenu of Preview');
      assert.deepEqual(await labels(page, 1), ['Play Slide', 'Trace Backdrop', 'Play Steps', '-', 'Select Backdrop', 'Add Backdrop…']);
      assert.equal(await highlighted(page, 1), 'Play Slide', 'the first item of the submenu is not highlighted');
      await press(page, 'ArrowLeft');
      assert.equal(await menus(page), 1, 'the left arrow does not close the submenu');
      assert.equal(await highlighted(page, 0), 'Preview');
      await press(page, 'ArrowRight');
      await press(page, 'Escape');
      assert.equal(await menus(page), 1, 'Esc does not close the submenu alone');
      assert.equal(await highlighted(page, 0), 'Preview');
      await press(page, 'ArrowRight');
      await downTo(page, 'Play Steps');
      await press(page, 'Enter');
      await frames(page);
      assert.equal(await menus(page), 0);
      assert.equal(await layer(page), true, 'Play Steps does not play the steps');
      assert.deepEqual(errors(page), []);
    });

    test(`while a preview plays, the item Play Slide of the submenu of Preview reads Stop and stops it (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS, step: 5000 });
      await page.evaluate(`window.BeesonEditor.exec('preview.steps')`);
      await frames(page);
      assert.equal(await layer(page), true);
      await click(page, MORE);
      await frames(page);
      assert.equal(await layer(page), true, 'a press on More stops the preview');
      await hover(page, 'Preview', 0);
      assert.equal(await menus(page), 2, 'the submenu of Preview is not opened by a hover');
      const sub = await rows(page, 1);
      assert.deepEqual(sub.map((r) => (r === '-' ? '-' : r.label)), ['Stop', 'Trace Backdrop', 'Play Steps', '-', 'Select Backdrop', 'Add Backdrop…']);
      assert.equal(sub[0].command, 'preview.slide');
      assert.equal(sub[0].dimmed, false);
      await click(page, await rowAt(page, 1, `(i) => i.dataset.command === 'preview.slide'`));
      await frames(page);
      assert.equal(await layer(page), false, 'Stop does not stop the preview');
      // after the preview the item reads Play Slide again
      await click(page, MORE);
      await hover(page, 'Preview', 0);
      assert.equal((await labels(page, 1))[0], 'Play Slide');
      await press(page, 'Escape');
      assert.deepEqual(errors(page), []);
    });

    test(`a click on Trace Backdrop in the submenu of Preview in More traces the backdrop (${platform})`, async (t) => {
      const page = await load(t, platform, { n: BACKDROP, motion: true });
      await click(page, MORE);
      await hover(page, 'Preview', 0);
      assert.equal(await menus(page), 2, 'the submenu of Preview is not opened by a hover');
      await click(page, await rowAt(page, 1, `(i) => i.dataset.command === 'preview.backdrop'`));
      await frames(page);
      assert.ok((await rafs(page)) > 0, 'the backdrop is not traced');
      assert.deepEqual(errors(page), []);
    });

    // the group of View is the first group of the default toolbar, which is never folded, hence this
    // test puts View after the space of a customized toolbar
    test(`a folded View is a submenu of More with Navigator first, before a rule, then the items of its arrow, with the keys of the platform (${platform})`, async (t) => {
      const items = ['edit.undo', 'edit.redo', 'separator', 'slide.gallery', 'space', 'toolbar.view', 'toolbar.zoom', 'separator', 'file.save', 'separator', 'shell.format', 'view.steps'];
      const page = await load(t, platform, { width: 1600, stored: { [TOOLBAR_KEY]: js({ items, show: 'both' }) } });
      const list = await arrowRows(page, 'toolbar.view');
      await resize(page, 420);
      assert.ok(await page.evaluate(`!document.querySelector('.beeson-edit-top [data-command="toolbar.view"]')`), 'View is not folded at 420 px');
      await click(page, MORE);
      await frames(page);
      const root = await rows(page, 0);
      const view = root.find((r) => r !== '-' && r.label === 'View');
      assert.ok(view?.sub, `View is not a submenu of More: ${js(root)}`);
      assert.ok(root.every((r) => r === '-' || r.label === 'View' || !r.sub), 'a folded button without a list opens a submenu');
      await hover(page, 'View', 0);
      const sub = await rows(page, 1);
      assert.deepEqual(sub.slice(2), list, 'the submenu of View is not the list of its arrow after Navigator');
      assert.equal(sub[1], '-');
      assert.equal(sub[0].label, 'Navigator');
      assert.equal(sub[0].checked, String((await state(page, 'view.navigator')).checked));
      const grid = sub.find((r) => r !== '-' && r.command === 'view.grid');
      assert.equal(grid.keys, platform === 'mac' ? "⌘'" : "Ctrl+'");
      // the right arrow opens the submenu, and Return runs Rulers
      await press(page, 'Escape');
      assert.equal(await menus(page), 1, 'Esc does not close the submenu alone');
      await press(page, 'Escape');
      assert.equal(await menus(page), 0);
      await page.evaluate(`document.querySelector('${MORE}').focus()`);
      await returnKey(page);
      await downTo(page, 'View');
      await press(page, 'ArrowRight');
      assert.equal(await menus(page), 2);
      assert.equal(await highlighted(page, 1), 'Navigator');
      const rulers = (await state(page, 'view.rulers')).checked;
      await downTo(page, 'Rulers');
      await press(page, 'Enter');
      await frames(page);
      assert.equal((await state(page, 'view.rulers')).checked, !rulers, 'Rulers is not run from the submenu');
      // a click on Navigator shows or hides the navigator as the main part of View does
      const nav = (await state(page, 'view.navigator')).checked;
      await click(page, MORE);
      await hover(page, 'View', 0);
      await click(page, await rowAt(page, 1, `(i) => i.dataset.command === 'view.navigator'`));
      await frames(page);
      assert.equal((await state(page, 'view.navigator')).checked, !nav, 'Navigator is not run from the submenu');
      assert.deepEqual(errors(page), []);
    });
  }
});

// the work of R12.2 on both platforms with trusted input: the inspector and the shell around it.
// the Distribute row of the Arrange pane fits the inspector, the toolbar and the default set fit
// the window while Customize Toolbar is open, Slide Only hides the navigator alone, as in Keynote,
// the Language popup of the Code pane is drawn as a control of the inspector, the resize cursor is
// kept while the notes are resized past their limits, the keyboard sheet is drawn under the menu
// bar, and the insert buttons stay live while the Add Slide gallery is open
describe('the inspector and toolbar fit the window', () => {
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
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const mouse = (page, type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const rectOf = (page, selector) => page.evaluate(`(() => { const e = document.querySelector(${js(selector)}); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; })()`);

  // the editor on slide n of the demo deck served over HTTP, with the storage of the origin emptied
  async function load(t, platform, { n = 0, width = 1600, height = 1000, clear = true } = {}) {
    const page = await browser.newPage({ width, height });
    t.after(() => page.close().catch(() => {}));
    if (clear) await page.send('Storage.clearDataForOrigin', { origin: server.origin, storageTypes: 'local_storage' });
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function resize(page, width, height) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(150);
    await frames(page);
  }

  // a trusted click on the title bar of the menu bar, then on the item labeled label of its menu
  async function choose(page, bar, label) {
    await clickText(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await frames(page);
    const at = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)});
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the menu ${bar} does not have an item ${label}`);
    await clickText(page, at);
    await frames(page);
  }

  // the controls of the Format tab past the right edge of the inspector, or past the right edge of
  // the window, and the width of the panel that is scrolled sideways
  const cutControls = (page) => page.evaluate(`(() => {
  const inspector = document.querySelector('.beeson-edit-inspector').getBoundingClientRect();
  const panel = document.querySelector('.beeson-edit-inspector .panel.format');
  const edge = Math.min(inspector.right, innerWidth);
  const cut = [...panel.querySelectorAll('button, input')].filter((b) => b.getClientRects().length && b.getBoundingClientRect().right > edge + 0.5).map((b) => b.textContent.trim() || b.getAttribute('aria-label'));
  return { cut, scroll: panel.scrollWidth - panel.clientWidth };
})()`);

  async function arrangeTab(page) {
    const tab = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === 'Arrange'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    assert.ok(tab, 'the inspector does not have an Arrange tab');
    await clickText(page, tab);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    // shell-2 and media-arrange-3
    test(`every button of the Arrange pane lies inside the inspector at 1920, 1024, and 760 px, for a figure and a picture (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 4, width: 1920, height: 1080 });
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      for (const [width, height] of [[1920, 1080], [1024, 768], [760, 700]]) {
        await resize(page, width, height);
        for (const clicks of [1, 2]) {
          await press(page, 'Escape');
          await press(page, 'Escape');
          for (let i = 0; i < clicks; i++) await clickText(page, 'section.present img');
          await frames(page);
          await arrangeTab(page);
          const labels = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-inspector .panel.format .ed-btn')].map((b) => b.textContent.trim())`);
          assert.ok(labels.includes('Evenly'), `the Arrange pane does not show Evenly at ${width} px`);
          if (clicks === 2) assert.ok(labels.includes('Flip Horizontal'), `the picture is not selected at ${width} px`);
          const { cut, scroll } = await cutControls(page);
          assert.deepEqual(cut, [], `controls are cut at the right edge of the inspector at ${width} px after ${clicks} clicks`);
          assert.ok(scroll <= 0, `the Format tab scrolls ${scroll} px sideways at ${width} px after ${clicks} clicks`);
        }
      }
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    // shell-3
    test(`while Customize Toolbar is open in a narrow window, every toolbar item and the whole default set are inside the window (${platform})`, async (t) => {
      for (const width of [760, 900]) {
        const page = await load(t, platform, { width, height: 700 });
        await choose(page, 'View', 'Customize Toolbar…');
        assert.ok(await page.evaluate(`!document.querySelector('.beeson-edit-customize').hidden`), 'the sheet is not open');
        const out = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-top [data-at]')].filter((el) => { const r = el.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5 || !r.width; }).map((el) => el.dataset.command ?? el.className)`);
        assert.deepEqual(out, [], `toolbar items lie past the window at ${width} px`);
        const row = await page.evaluate(`(() => {
        const row = document.querySelector('.beeson-edit-customize .default');
        const box = row.getBoundingClientRect();
        const cut = [...row.querySelectorAll('.mini:not(.sep):not(.space)')].filter((m) => { const r = m.getBoundingClientRect(); return r.right > box.right - 0.5 || r.left < box.left; }).map((m) => m.textContent);
        return { cut, over: row.scrollWidth - row.clientWidth };
      })()`);
        assert.deepEqual(row.cut, [], `items of the default set are clipped at ${width} px`);
        assert.ok(row.over <= 0, `the default set is ${row.over} px wider than its row at ${width} px`);
        // the item at the right end is dragged off the toolbar, and Done closes the sheet
        const last = await page.evaluate(`(() => { const el = [...document.querySelectorAll('.beeson-edit-top [data-command]')].at(-1); const r = el.getBoundingClientRect(); return { id: el.dataset.command, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await mouse(page, 'mouseMoved', last.x, last.y);
        await mouse(page, 'mousePressed', last.x, last.y);
        for (let i = 1; i <= 10; i++) await mouse(page, 'mouseMoved', last.x - 20 * i, last.y + 30 * i);
        await mouse(page, 'mouseReleased', last.x - 200, last.y + 300);
        await frames(page);
        const ids = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-top [data-command]')].map((b) => b.dataset.command)`);
        assert.ok(!ids.includes(last.id), `${last.id} is not dragged off the toolbar at ${width} px`);
        await click(page, '.beeson-edit-customize .done');
        await frames(page);
        assert.equal(await render(page), page.source);
        assert.deepEqual(errors(page), []);
      }
    });

    // shell-5
    test(`View > Slide Only hides the navigator and leaves the inspector open, and View > Navigator shows the navigator again (${platform})`, async (t) => {
      const page = await load(t, platform, { width: 1440, height: 900 });
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      const panes = async () => ({
        navigator: (await state(page, 'view.navigator')).checked,
        format: (await state(page, 'shell.format')).checked,
        slideOnly: (await state(page, 'view.slideOnly')).checked,
        inspector: !!(await rectOf(page, '.beeson-edit-inspector .panel.format')),
      });
      assert.deepEqual(await panes(), { navigator: true, format: true, slideOnly: false, inspector: true });
      const canvas = await rectOf(page, '.beeson-edit-canvas');
      await choose(page, 'View', 'Slide Only');
      assert.deepEqual(await panes(), { navigator: false, format: true, slideOnly: true, inspector: true });
      assert.ok((await rectOf(page, '.beeson-edit-canvas')).width > canvas.width + 100, 'the canvas does not take the place of the navigator');
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await panes(), { navigator: true, format: true, slideOnly: false, inspector: true });
      // Slide Only chosen twice shows the navigator again, and the inspector is kept for the next page
      await choose(page, 'View', 'Slide Only');
      await choose(page, 'View', 'Slide Only');
      assert.deepEqual(await panes(), { navigator: true, format: true, slideOnly: false, inspector: true });
      assert.notEqual(await page.evaluate(`localStorage.getItem('beeson-inspector')`), '0');
      // a closed inspector stays closed through Slide Only
      await exec(page, 'shell.format');
      await choose(page, 'View', 'Slide Only');
      assert.deepEqual(await panes(), { navigator: false, format: false, slideOnly: true, inspector: false });
      await choose(page, 'View', 'Slide Only');
      assert.deepEqual(await panes(), { navigator: true, format: false, slideOnly: false, inspector: false });
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    // shell-6
    test(`the Language popup of the Code pane is drawn in the control tokens of the inspector, in light and dark mode (${platform})`, async (t) => {
      for (const scheme of ['light', 'dark']) {
        const page = await load(t, platform, { n: 5, width: 1440, height: 900 });
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
        if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
        await clickText(page, 'section.present pre code');
        await press(page, 'Escape');
        await frames(page);
        const look = await page.evaluate(`(() => {
        const b = document.querySelector('.beeson-edit-inspector .ed-lang');
        if (!b) return null;
        const probe = document.createElement('div');
        probe.style.cssText = 'background: var(--ed-control); color: var(--ed-text); font-family: var(--ed-font)';
        b.parentElement.append(probe);
        const want = getComputedStyle(probe);
        const s = getComputedStyle(b);
        const out = { background: s.backgroundColor === want.backgroundColor, color: s.color === want.color, font: s.fontFamily === want.fontFamily, round: parseFloat(s.borderTopLeftRadius) >= 4, height: Math.round(b.getBoundingClientRect().height) };
        probe.remove();
        return out;
      })()`);
        assert.ok(look, `the Code pane does not show the Language popup (${scheme})`);
        assert.deepEqual(look, { background: true, color: true, font: true, round: true, height: 24 }, `the Language popup is not drawn in the control tokens (${scheme})`);
        assert.deepEqual(errors(page), []);
      }
    });

    // shell-8
    test(`the resize cursor is kept while the notes divider is dragged past its limits (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2, width: 1440, height: 900 });
      await exec(page, 'view.notes');
      await frames(page);
      for (const to of [60, 880]) {
        const from = await center(page, '.beeson-edit-resize');
        await mouse(page, 'mouseMoved', from.x, from.y);
        await mouse(page, 'mousePressed', from.x, from.y);
        for (let i = 1; i <= 10; i++) await mouse(page, 'mouseMoved', from.x, from.y + ((to - from.y) * i) / 10);
        await frames(page);
        const cursor = await page.evaluate(`getComputedStyle(document.elementFromPoint(${from.x}, ${to})).cursor`);
        assert.equal(cursor, 'row-resize', `the cursor under the pointer at y ${to} is ${cursor}`);
        await mouse(page, 'mouseReleased', from.x, to);
        await frames(page);
        const after = await page.evaluate(`getComputedStyle(document.elementFromPoint(${from.x}, ${to})).cursor`);
        assert.notEqual(after, 'row-resize', 'the resize cursor is kept after the drag');
        if (!(await state(page, 'view.notes')).checked) await exec(page, 'view.notes');
        await frames(page);
      }
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    // menus-keys-7
    test(`the keyboard sheet is drawn under the menu bar and inside the window at every size (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2, width: 1600, height: 1000 });
      for (const [width, height] of [[1600, 1000], [1280, 800], [1366, 768], [1920, 1200], [1440, 900], [1024, 768]]) {
        await resize(page, width, height);
        await exec(page, 'help.keys');
        await frames(page);
        const sheet = await rectOf(page, 'dialog.beeson-edit-keys[open]');
        assert.ok(sheet, `the sheet is not open at ${width}x${height}`);
        const bar = await page.evaluate(`Math.max(...[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].map((b) => b.getBoundingClientRect().bottom))`);
        assert.ok(sheet.top >= bar + 4, `the sheet starts at y ${sheet.top} over the menu bar, which ends at ${bar}, at ${width}x${height}`);
        assert.ok(sheet.bottom <= height, `the sheet ends at ${sheet.bottom} past the window at ${width}x${height}`);
        if (width === 1280 || width === 1366 || width === 1600) {
          const body = await page.evaluate(`(() => { const b = document.querySelector('.beeson-edit-keys .body'); return b.scrollHeight - b.clientHeight; })()`);
          assert.ok(body <= 0, `the body of the sheet scrolls ${body} px at ${width}x${height}`);
        }
        await press(page, 'Escape');
        await frames(page);
      }
      assert.deepEqual(errors(page), []);
    });

    // feel-7
    test(`while the Add Slide gallery is open the insert buttons stay live, and one click on Table opens the table grid (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 0 });
      await click(page, '.beeson-edit-nav .row:nth-of-type(3)');
      await frames(page);
      await click(page, '.beeson-edit-top [data-command="slide.gallery"]');
      await frames(page);
      assert.ok(await page.evaluate(`!!document.querySelector('.beeson-edit-gallery[open]')`), 'the gallery is not open');
      const off = await page.evaluate(`['insert.table', 'insert.text', 'insert.formula', 'insert.shape', 'insert.media'].filter((id) => document.querySelector('.beeson-edit-top [data-command="' + id + '"]')?.disabled)`);
      assert.deepEqual(off, [], 'insert buttons are dimmed while the gallery is open');
      await click(page, '.beeson-edit-top [data-command="insert.table"]');
      await frames(page);
      assert.ok(await page.evaluate(`!document.querySelector('.beeson-edit-gallery[open]')`), 'the gallery is not closed');
      assert.ok(await page.evaluate(`!!document.querySelector('.beeson-table-picker[open]')`), 'one click on Table does not open the table grid');
      await press(page, 'Escape');
      await frames(page);
      // Escape in the gallery closes it, and the keys of the slide are not run
      await click(page, '.beeson-edit-top [data-command="slide.gallery"]');
      await frames(page);
      await press(page, 'Escape');
      await frames(page);
      assert.ok(await page.evaluate(`!document.querySelector('.beeson-edit-gallery[open]')`), 'Escape does not close the gallery');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R20.13 on both platforms, the open items O7, O5, and O9 and the new defects
// N1 and N2 of the review of round 7: Slide Layout from Figure to Content with a white figure, the
// Format pane closed by hand in a narrow window, and the toolbar and the status bar in a window
// 560 px wide
describe('the Format pane closed in a narrow window', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test-deck.html';
  // the index of the slide of index.html with the figures
  const FIGURES = 4;
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const WHITE_FIGURE = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => m[0].includes('A figure slide with a paper image'));

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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const wait = (page, ms = 150) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const urlOf = (deck, platform) => `${server.origin}/${deck}?edit&still&theme=light&edit-platform=${platform}`;

  // opens deck at its url with the storage of the browser as it is, and shows slide n
  async function open(page, deck, platform, n, text = readFileSync(deck, 'utf8')) {
    await page.goto(urlOf(deck, platform));
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    if (n !== undefined) await page.evaluate(`Reveal.slide(${n})`);
    await wait(page, 300);
  }

  async function load(t, platform, deck, n, size = { width: 1600, height: 1000 }) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await open(page, deck, platform, n);
    return page;
  }

  async function resize(page, width, height) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await wait(page, 400);
  }

  // the boxes of the drawn picture of the image, of the caption, and of the words of the caption and
  // of the heading of the slide shown, in slide px. a picture with object-fit contain is drawn
  // smaller than the box of its img
  const boxes = (page) => page.evaluate(`(() => {
  const slide = Reveal.getCurrentSlide();
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const px = (r) => ({ left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k });
  const words = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
  const img = slide.querySelector('img');
  const r = img.getBoundingClientRect();
  const cs = getComputedStyle(img);
  const contain = cs.objectFit === 'contain';
  const sc = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const w = contain ? img.naturalWidth * sc : r.width, h = contain ? img.naturalHeight * sc : r.height;
  const [ox, oy] = cs.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
  const drawn = { left: r.left + (r.width - w) * ox, top: r.top + (r.height - h) * oy, right: r.left + (r.width - w) * ox + w, bottom: r.top + (r.height - h) * oy + h };
  return { drawn: px(drawn), caption: px(slide.querySelector('.caption').getBoundingClientRect()), captionWords: px(words(slide.querySelector('.caption'))), heading: px(words(slide.querySelector('h2'))) };
})()`);

  const inside = (b) => b.left >= -1 && b.top >= -1 && b.right <= 1921 && b.bottom <= 1081;
  const apart = (a, b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;

  for (const platform of PLATFORMS) {
    // O7: the drawn image and the caption of the figure slide stay inside the slide as Content
    test(`Slide Layout from Figure to Content keeps the paper image and its caption inside the slide (${platform})`, async (t) => {
      const page = await load(t, platform, LAYOUTS, WHITE_FIGURE);
      await page.evaluate(`document.querySelector('img.white-figure').decode().then(() => true)`);
      await exec(page, 'slide.layout.content');
      await wait(page, 400);
      const b = await boxes(page);
      assert.ok(inside(b.drawn), `the drawn image runs past the slide: ${js(b.drawn)}`);
      assert.ok(inside(b.caption), `the caption runs past the slide: ${js(b.caption)}`);
      assert.ok(apart(b.drawn, b.captionWords) && apart(b.drawn, b.heading), `the image covers the words: ${js(b)}`);
      assert.doesNotMatch(await page.evaluate(`document.querySelector('.beeson-edit-menubar .state, .beeson-edit-header .state')?.textContent ?? ''`), /past the slide/);
      const text = await render(page);
      assert.deepEqual(textProblems(text, THEME), textProblems(page.source, THEME));
      await undo(page);
      assert.equal(await render(page), page.source);
      await redo(page);
      assert.equal(await render(page), text);
      assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(text)})`)).problems, []);
      await page.evaluate(`Reveal.slide(${WHITE_FIGURE})`);
      await wait(page, 300);
      assert.ok(inside((await boxes(page)).drawn), 'the drawn image runs past the slide after a reopen');
      assert.deepEqual(errors(page), []);
    });
  }

  // whether the navigator and the inspector are drawn, whether Format is checked, and the stored state
  // of the inspector
  const panes = (page) => page.evaluate(`(() => {
  const drawn = (s) => (document.querySelector(s)?.getBoundingClientRect().width ?? 0) > 0;
  return { nav: drawn('.beeson-edit-nav'), inspector: drawn('.beeson-edit-inspector'), format: window.BeesonEditor.state('shell.format').checked, stored: localStorage.getItem('beeson-inspector') };
})()`);

  for (const platform of PLATFORMS) {
    // O5 and N1: at 760 px the window is too narrow for both panes, and the navigator is drawn in
    // the room of a Format pane closed by hand, which must not be taken as a pane that gave way to it
    test(`a Format pane closed by hand at 760 px stays closed after a widen and after a reopen (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, FIGURES, { width: 760, height: 700 });
      assert.deepEqual(await panes(page), { nav: false, inspector: true, format: true, stored: '1' });
      await click(page, '.beeson-edit-top [data-command="shell.format"]');
      await wait(page, 300);
      assert.deepEqual(await panes(page), { nav: true, inspector: false, format: false, stored: '0' }, 'Format closed by hand is stored as open');
      await resize(page, 1600, 1000);
      assert.deepEqual(await panes(page), { nav: true, inspector: false, format: false, stored: '0' }, 'Format closed by hand is opened again by a widen');
      await resize(page, 760, 700);
      await open(page, DECK, platform, FIGURES);
      assert.deepEqual(await panes(page), { nav: true, inspector: false, format: false, stored: '0' }, 'Format closed by hand is opened again by a reopen');
      await resize(page, 1600, 1000);
      assert.deepEqual(await panes(page), { nav: true, inspector: false, format: false, stored: '0' }, 'Format closed by hand is opened again by a widen after a reopen');
      assert.deepEqual(errors(page).filter((e) => !e.includes('beforeunload')), []);
    });
  }

  // the buttons of the toolbar and of the status bar that are cut off by the window or by their bar,
  // and the scroll width of the body, in a window of 560 px
  const cutOff = (page) => page.evaluate(`(() => {
  const W = innerWidth;
  const cut = [];
  for (const bar of document.querySelectorAll('.beeson-edit-top, .beeson-edit-bottom')) {
    const br = bar.getBoundingClientRect();
    for (const b of bar.querySelectorAll('button')) {
      const r = b.getBoundingClientRect();
      if (!r.width || getComputedStyle(b).visibility === 'hidden') continue;
      const label = b.querySelector('.label');
      const clipped = r.left < Math.max(0, br.left) - 0.5 || r.right > Math.min(W, br.right) + 0.5;
      const truncated = label && label.scrollWidth > label.clientWidth + 0.5;
      if (clipped || truncated) cut.push((b.dataset.command ?? b.className) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    }
  }
  return { cut, scroll: document.body.scrollWidth, width: W };
})()`);

  // a choice of the Show menu of the Customize Toolbar sheet
  async function show(page, name) {
    await click(page, '.beeson-edit-customize button.show');
    await wait(page, 300);
    const at = await page.evaluate(`(() => { const e = [...document.querySelectorAll('.beeson-edit-menu [role^=menuitem]')].find((x) => x.textContent.includes(${js(name)})); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    assert.ok(at, `the Show menu does not have ${name}`);
    await click(page, at);
    await wait(page, 400);
  }

  for (const platform of PLATFORMS) {
    // O9 and N2: every button of the two bars is drawn whole in a window 560 px wide, and the page is
    // not wider than the window, with and without Customize Toolbar open
    test(`the toolbar and the status bar fit a window of 560 px, with and without Customize Toolbar (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, FIGURES, { width: 560, height: 700 });
      const fits = async (when) => {
        const m = await cutOff(page);
        assert.deepEqual(m.cut, [], `a button is cut off ${when}`);
        assert.ok(m.scroll <= m.width, `the body is ${m.scroll} px wide in a window of ${m.width} px ${when}`);
      };
      await fits('with the sheet closed');
      await page.evaluate(`window.BeesonEditor.exec('view.customizeToolbar')`);
      await wait(page, 400);
      await fits('with the sheet open');
      for (const name of ['Text Only', 'Icon Only', 'Icon and Text']) {
        await show(page, name);
        await fits(`with the sheet open and ${name}`);
      }
      await press(page, 'Escape');
      await wait(page, 300);
      await fits('after the sheet is closed with Icon and Text');
      assert.deepEqual(errors(page), []);
    });
  }
});

// the work of R14.6 on both platforms and in both appearances: the contrast of the last small texts
// of the chrome, View > Slide Only chosen twice in a narrow window, and a typed slide number that
// jumps back in the show played by Present
describe('Slide Only twice, and the last small texts', () => {
  const PLATFORMS = ['mac', 'other'];
  const SCHEMES = ['light', 'dark'];

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
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  // the editor on index.html in the appearance scheme, with the local storage cleared
  async function load(t, platform, scheme, { width = 1600, height = 1000 } = {}) {
    const page = await browser.newPage({ width, height });
    t.after(() => page.close().catch(() => {}));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await page.send('Storage.clearDataForOrigin', { origin: server.origin, storageTypes: 'local_storage' });
    await page.goto(`${server.origin}/test-deck.html?edit&still&theme=${scheme}&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync('test-deck.html', 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await frames(page);
    return page;
  }

  const below = (rows, min) => rows.filter((r) => contrast(r.fg, r.bg) < min).map((r) => `${r.what}: ${r.fg} on ${r.bg} is ${contrast(r.fg, r.bg).toFixed(2)}:1`);
  const measure = (page, selector) => page.evaluate(`(() => {
  const e = document.querySelector(${js(selector)});
  return e && e.getClientRects().length ? { what: e.textContent.trim().slice(0, 30), fg: ${INK}(e), bg: ${GROUND}(e) } : { what: ${js(selector)} + ' is not shown', fg: 'rgb(0, 0, 0)', bg: 'rgb(0, 0, 0)' };
})()`);

  // D6 to D9: the prompt and the key hint of the Insert Formula dialog, the zoom readout of the notes
  // pane at the opacity of its group, the key hint of the presenter display, and the number badges of
  // the Steps pane measured under 4.5:1
  for (const platform of PLATFORMS) {
    for (const scheme of SCHEMES) {
      test(`the last small texts of the chrome have a contrast of 4.5:1 on their ground (${platform}, ${scheme})`, async (t) => {
        const page = await load(t, platform, scheme);
        const seen = [];
        const n = await page.evaluate(`Reveal.getSlides().findIndex((s) => s.querySelector('.fragment'))`);
        assert.ok(n >= 0);
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        await exec(page, 'insert.formula');
        await page.waitFor(`!!document.querySelector('.beeson-tex .preview .empty')`);
        seen.push(await measure(page, '.beeson-tex .preview .empty'), await measure(page, '.beeson-math .hint'));
        await press(page, 'Escape');
        await frames(page);
        await exec(page, 'view.notes');
        await frames(page);
        seen.push(await measure(page, '.beeson-edit-notes-zoom .value'));
        await exec(page, 'view.notes');
        if (!(await page.evaluate(`!!document.querySelector('.beeson-badge')`))) await exec(page, 'view.steps');
        await page.waitFor(`!!document.querySelector('.beeson-badge')`);
        seen.push(await measure(page, '.beeson-badge'));
        await page.evaluate(`(() => { window.open = () => null; return true; })()`);
        await exec(page, 'play.customizePresenter');
        await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open] .hint')`);
        seen.push(await measure(page, 'dialog.beeson-edit-presenter .hint'));
        assert.equal(seen.length, 5);
        assert.deepEqual(below(seen, 4.5), []);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const shown = (page, selector) => page.evaluate(`!!document.querySelector(${js(selector)})?.getClientRects().length`);
  const panes = async (page) => ({
    navigator: await shown(page, '.beeson-edit-nav'),
    inspector: await shown(page, '.beeson-edit-inspector .panel.format'),
    format: (await state(page, 'shell.format')).checked,
    slideOnly: (await state(page, 'view.slideOnly')).checked,
  });

  // D15: in a window 800 or 700 px wide with the Format pane open, the first Slide Only showed the
  // navigator in place of the inspector, and the second hid both
  for (const platform of PLATFORMS) {
    for (const width of [800, 700]) {
      test(`View > Slide Only chosen twice in a window ${width} px wide gives back the panes before the first choice (${platform})`, async (t) => {
        const page = await load(t, platform, 'light', { width, height: 900 });
        if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
        await frames(page);
        const start = await panes(page);
        assert.deepEqual(start, { navigator: false, inspector: true, format: true, slideOnly: true });
        await exec(page, 'view.slideOnly');
        await frames(page);
        assert.notDeepEqual(await panes(page), start, 'the first Slide Only does not change the panes');
        await exec(page, 'view.slideOnly');
        await frames(page);
        assert.deepEqual(await panes(page), start);
        assert.equal(await render(page), page.source);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const SHOW = `document.querySelector('.beeson-edit-show iframe')?.contentWindow`;
  const showReady = `(() => { try { const w = ${SHOW}; return !!w?.Reveal?.isReady() && (!w.MathJax || (w.MathJax.startup?.promise?.then(() => true) ?? false)); } catch { return false; } })()`;
  const DISPLAY = 'dialog.beeson-edit-presenter[open]';
  const stepOf = (page) => page.evaluate(`(() => { const m = document.querySelector(${js(DISPLAY)}).textContent.match(/Slide (\\d+) of \\d+.*?Step (\\d+) of (\\d+)/s); return m ? m.slice(1).map(Number) : null; })()`);

  // D11: from slide 6, 3 and Return went to slide 3 with its four steps shown in the show played by
  // Present, and to slide 3 before its steps in the presenter display
  for (const platform of PLATFORMS) {
    test(`a typed slide number that jumps back lands before the steps of its slide in both shows (${platform})`, async (t) => {
      const page = await load(t, platform, 'light');
      await page.evaluate(`Reveal.slide(5)`);
      await frames(page);
      const steps = await page.evaluate(`[2, 4].map((n) => Reveal.getSlides()[n].querySelectorAll('.fragment').length)`);
      assert.ok(steps.every((n) => n > 0), js(steps));
      await page.evaluate(`(() => { window.open = () => null; return true; })()`);
      await press(page, 'Alt+Enter');
      await page.waitFor(`!!document.querySelector(${js(DISPLAY)})`, 20000);
      await sleep(300);
      for (const [typed, want] of [['3', 3], ['5', 5]]) {
        for (const key of [typed, 'Enter']) await press(page, key);
        await sleep(200);
        const at = await stepOf(page);
        assert.deepEqual(at?.slice(0, 2), [want, 0], `the presenter display at ${js(at)} after ${typed} and Return`);
      }
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector(${js(DISPLAY)})`);
      await page.evaluate(`Reveal.slide(5)`);
      await frames(page);
      await press(page, 'Mod+Enter');
      await page.waitFor(showReady, 20000);
      await sleep(300);
      for (const [typed, h] of [['3', 2], ['5', 4]]) {
        for (const key of [typed, 'Enter']) await press(page, key);
        await sleep(300);
        const at = await page.evaluate(`(() => { const w = ${SHOW}; return { h: w.Reveal.getIndices().h, shown: w.Reveal.getCurrentSlide().querySelectorAll('.fragment.visible').length }; })()`);
        assert.deepEqual(at, { h, shown: 0 }, `the show played by Present after ${typed} and Return`);
      }
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-edit-show')`);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }

  async function resize(page, width, height) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(150);
    await frames(page);
  }
  const OUTSIDE = `[...document.querySelectorAll('.beeson-edit-top [data-at]')].filter((el) => { const r = el.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5 || !r.width; }).map((el) => (el.dataset.command ?? el.className) + ' at ' + Math.round(el.getBoundingClientRect().right))`;

  // D10 and r12-2-shell-inspector n1: with Customize Toolbar open, Format and Steps lay past the right
  // edge of a window 640 px wide, and Present and Steps past a window 760 px wide in Text Only
  for (const platform of PLATFORMS) {
    test(`while Customize Toolbar is open, every toolbar item stays inside a window under 681 px and in Text Only (${platform})`, async (t) => {
      const page = await load(t, platform, 'light', { width: 1600, height: 800 });
      await exec(page, 'view.customizeToolbar');
      await page.waitFor(`!document.querySelector('.beeson-edit-customize').hidden`);
      await frames(page);
      for (const width of [640, 560]) {
        await resize(page, width, 700);
        assert.deepEqual(await page.evaluate(OUTSIDE), [], `toolbar items lie past the window at ${width} px in Icon and Text`);
      }
      await resize(page, 1600, 800);
      await click(page, '.beeson-edit-customize .foot .show');
      await page.waitFor(`[...document.querySelectorAll('.beeson-edit-menu [role=menuitemradio], .beeson-edit-menu [role=menuitem], .beeson-edit-menu [role=menuitemcheckbox]')].some((e) => e.textContent.includes('Text Only'))`);
      const at = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-menu [role^=menuitem]')].find((e) => e.textContent.includes('Text Only')).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await click(page, at);
      await frames(page);
      assert.match(await page.evaluate(`document.querySelector('.beeson-edit-customize .foot .show').textContent`), /Text Only/);
      for (const width of [900, 760, 640]) {
        await resize(page, width, 700);
        assert.deepEqual(await page.evaluate(OUTSIDE), [], `toolbar items lie past the window at ${width} px in Text Only`);
      }
      await resize(page, 1600, 800);
      assert.deepEqual(await page.evaluate(OUTSIDE), []);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-top').classList.contains('compact')`), false, 'the labels are not drawn again at 1600 px');
      await exec(page, 'view.customizeToolbar');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }
});

// the work of R13.4 on both platforms: the place of a new table on a slide without a free place
// of its size, the width of the navigator in a narrow window, and the selection of a display
// formula after its TeX is applied. each edit of the file is checked byte for byte, after an undo
// and a redo, and after a save and an open
describe('the width of the navigator when narrow', () => {
  const DECK = 'test-deck.html';
  // the slides of index.html with an equation and with a figure in a figure box
  const EQUATIONS = 3;
  const FIGURES = 4;
  const PLATFORMS = ['mac', 'other'];
  const FORMAT = '#beeson-edit-panel-format';

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
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  // the box in slide px of each shown element of selector on the current slide
  const boxes = (page, selector) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  return [...slide.querySelectorAll(${js(selector)})].filter((e) => e.getClientRects().length).map((e) => {
    const r = e.getBoundingClientRect();
    return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k };
  });
})()`);
  const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const size = (a) => (a.right - a.left) * (a.bottom - a.top);
  // the share of the area of b that a covers
  const covers = (a, b) => area(a, b) / size(b);

  // the editor on a deck served over HTTP, with the storage of the origin emptied first, and with
  // slide n shown
  async function load(t, platform, { n = 0, size: window = { width: 1600, height: 1000 } } = {}) {
    const page = await browser.newPage(window);
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the rendered text differs from before, an undo gives before and a redo the edited text byte for
  // byte, and the saved text is opened again without problems
  async function checkEdit(page, before, name) {
    const edited = await render(page);
    assert.notEqual(edited, before);
    await undo(page);
    assert.equal(await render(page), before);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
    return edited;
  }

  for (const platform of PLATFORMS) {
    // table-over-list. by R15.10, a table without a free place is put inside the margins at the
    // middle of the slide, where it may cover words, and off the figure
    test(`a new table on a slide without a free place of its size is put at the middle of the slide off the figure, and a second table off the first (${platform})`, async (t) => {
      const page = await load(t, platform, { n: FIGURES });
      const before = await render(page);
      await click(page, '.reveal section.present ul > li:last-child');
      await press(page, 'Escape');
      const [figure] = await boxes(page, ':scope > figure.figure-box');
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await frames(page);
      const [table] = await boxes(page, ':scope > table');
      assert.ok(table, 'no table was inserted');
      assert.ok(table.left >= 119 && table.top >= -1 && table.right <= 1801 && table.bottom <= 1081, `the table at ${js(table)} is not inside the margins of the slide`);
      assert.ok(Math.abs((table.top + table.bottom) / 2 - 540) <= 1, `the table at ${js(table)} is not at the middle of the slide`);
      assert.equal(area(table, figure), 0, `the table at ${js(table)} lies over the figure at ${js(figure)}`);
      await checkEdit(page, before, `r13-4-table-${platform}.html`);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await frames(page);
      const tables = await boxes(page, ':scope > table');
      assert.equal(tables.length, 2);
      assert.ok(covers(tables[1], tables[0]) < 0.5, `the second table at ${js(tables[1])} lies on the first at ${js(tables[0])}`);
      assert.deepEqual(errors(page), []);
    });

    // navigator-edge-drag. in a window 1000 px wide with the Format pane open, the navigator is
    // drawn at most 50vw less the width of the pane
    test(`a drag of the edge of the navigator past its widest drawn width stores the drawn width (${platform})`, async (t) => {
      const page = await load(t, platform, { n: FIGURES, size: { width: 1000, height: 900 } });
      await page.evaluate(`document.documentElement.classList.contains('beeson-format') || window.BeesonEditor.exec('shell.format'), true`);
      await frames(page);
      const geo = () => page.evaluate(`(() => {
      const edge = document.querySelector('.beeson-edit-nav-edge');
      const e = edge.getBoundingClientRect();
      return { nav: document.querySelector('.beeson-edit-nav').getBoundingClientRect().width, at: { x: e.left + e.width / 2, y: e.top + e.height / 2 },
        now: Number(edge.getAttribute('aria-valuenow')), css: parseFloat(document.documentElement.style.getPropertyValue('--ed-nav-w')), stored: Number(localStorage.getItem('beeson-nav-w')) };
    })()`);
      const g0 = await geo();
      await drag(page, g0.at, { dx: 120, steps: 12 });
      await frames(page);
      const g1 = await geo();
      assert.ok(g1.nav < g0.nav + 120 - 2, `the navigator in a window 1000 px wide follows the pointer to ${g1.nav} px`);
      for (const [k, v] of Object.entries({ now: g1.now, css: g1.css, stored: g1.stored })) assert.ok(Math.abs(v - g1.nav) <= 1, `the ${k} width is ${v} while ${g1.nav} px is drawn`);
      await drag(page, g1.at, { dx: -40, steps: 8 });
      await frames(page);
      const g2 = await geo();
      assert.ok(Math.abs(g2.nav - (g1.nav - 40)) <= 2, `a drag 40 px to the left took the navigator from ${g1.nav} to ${g2.nav} px`);
      assert.ok(Math.abs(g2.now - g2.nav) <= 1 && Math.abs(g2.stored - g2.nav) <= 1, `after the drag to the left, ${js(g2)}`);
      assert.deepEqual(errors(page), []);
    });

    // formula-frame
    test(`a display formula stays selected and framed after its TeX is applied in the Formula pane, and after an undo and a redo (${platform})`, async (t) => {
      const page = await load(t, platform, { n: EQUATIONS });
      await page.evaluate(`(() => { const E = window.BeesonEditor; E.state('view.steps').checked && E.exec('view.steps'); E.state('shell.format').checked || E.exec('shell.format'); return true; })()`);
      await frames(page);
      const before = await render(page);
      await click(page, await center(page, '.reveal section.present div.math mjx-container'));
      await press(page, 'Escape');
      await frames(page);
      const framed = () => page.evaluate(`(() => {
      const math = document.querySelector('.reveal section.present div.math');
      const m = math.getBoundingClientRect();
      const sel = window.BeesonEditor.selection();
      const frames = [...document.querySelectorAll('.beeson-overlay .beeson-frame.selected')].filter((f) => !f.hidden && getComputedStyle(f).display !== 'none').map((f) => f.getBoundingClientRect())
        .filter((r) => r.width > 0 && Math.abs(r.left - m.left) < 20 && Math.abs(r.top - m.top) < 20 && Math.abs(r.width - m.width) < 40);
      return { selected: sel.length === 1 && sel[0] === math, framed: frames.length === 1 };
    })()`);
      assert.deepEqual(await framed(), { selected: true, framed: true }, 'the display is not selected by a click and Escape');
      await click(page, await center(page, `${FORMAT} textarea[name="tex"]`));
      await press(page, 'End');
      await type(page, ' a');
      await press(page, 'Enter');
      await frames(page);
      await frames(page);
      assert.deepEqual(await framed(), { selected: true, framed: true }, 'after Enter in the TeX field');
      const edited = await render(page);
      assert.notEqual(edited, before);
      await undo(page);
      await frames(page);
      assert.equal(await render(page), before);
      assert.deepEqual(await framed(), { selected: true, framed: true }, 'after an undo of the TeX');
      await redo(page);
      await frames(page);
      assert.equal(await render(page), edited);
      assert.deepEqual(await framed(), { selected: true, framed: true }, 'after a redo of the TeX');
      const { text } = await saveAndReopen(page, `r13-4-formula-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(errors(page), []);
    });
  }
});
