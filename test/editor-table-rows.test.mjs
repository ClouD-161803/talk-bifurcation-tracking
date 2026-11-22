import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { numberOf, sortOrder } from '../src/editor/table.ts';
import { attributeProblem, editProblems, textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, contrast, drag, press, saveAndReopen, type } from './helpers/editor.mjs';
import { decodePng } from './helpers/png.mjs';

describe('rows of a new table, and Sort', () => {
  const DECK = 'test-deck.html';
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const PLATFORMS = ['mac', 'other'];
  const SIZES = { mac: { width: 1600, height: 1000 }, other: { width: 1920, height: 1080 } };
  const FIGURES = 4;
  const TABLES = 'test/pages/editor-tables.html';
  const PANEL = '#beeson-edit-panel-format';

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
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const rect = (page, selector) => page.evaluate(`(() => { const e = [...document.querySelectorAll(${js(selector)})].find((e) => e.getBoundingClientRect().width); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  async function load(t, platform, { deck = DECK, n = 0 } = {}) {
    const page = await browser.newPage(SIZES[platform]);
    t.after(() => page.close().catch(() => {}));
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
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

  let saves = 0;
  async function roundTrip(page, edited = null) {
    const text = await render(page);
    if (edited !== null) assert.equal(text, edited);
    assert.notEqual(text, page.source, 'the edit did not change the text');
    await undo(page);
    await byteExact(page);
    await redo(page);
    assert.equal(await render(page), text);
    const saved = await saveAndReopen(page, `r7-8-${++saves}.html`);
    assert.equal(saved.text, text);
    assert.deepEqual(page.errors, []);
    page.source = saved.text;
    return text;
  }

  const count = (text, re) => (text.match(re) ?? []).length;

  for (const platform of PLATFORMS) {
    test(`a table of 3 by 3 cells chosen in the grid is inserted with its 3 rows, on the slide (${platform})`, async (t) => {
      const page = await load(t, platform, { n: FIGURES });
      const rows = count(page.source, /<tr>/g);
      await click(page, '.reveal section.present ul > li:last-child');
      await press(page, 'Escape');
      await click(page, '.beeson-edit-top [data-command="insert.table"]');
      await page.waitFor(`!!document.querySelector('dialog.beeson-table-picker[open]')`);
      const cell = await rect(page, '.beeson-table-picker .grid > :nth-child(23)');
      await click(page, cell);
      await page.waitFor(`!!document.querySelector('.reveal section.present table')`);
      await frames(page);
      const shape = await page.evaluate(`[...document.querySelector('.reveal section.present table').rows].map((r) => r.cells.length)`);
      assert.deepEqual(shape, [3, 3, 3]);
      const slide = await rect(page, '.reveal section.present');
      const table = await rect(page, '.reveal section.present table');
      const figure = await rect(page, '.reveal section.present figure.figure-box');
      assert.ok(table.top >= slide.top && table.bottom <= slide.bottom, `the table at ${js(table)} runs past the slide at ${js(slide)}`);
      const center = Math.abs((table.left + table.right - slide.left - slide.right) / 2) < 3;
      const fill = await page.evaluate(`getComputedStyle(document.querySelector('.reveal section.present table')).backgroundColor`);
      assert.ok(!meets(table, figure) || (center && !/^rgba\(.*, 0\)$|^transparent$/.test(fill)), 'the table covers the figure off the center of the slide, or without a fill');
      assert.equal(await undoLabel(page), 'Undo Insert Table');
      const edited = await roundTrip(page);
      assert.equal(count(edited, /<tr>/g), rows + 3);
    });
  }

  const itemAt = (page, label) => page.evaluate(`(() => {
  const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)});
  if (!item || item.getAttribute('aria-disabled') === 'true') return null;
  const r = item.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  const cellOf = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;
  const PLAIN = [
    '<tr><td>Moon</td><td>\\(0.01215\\)</td><td>Earth and Moon</td></tr>',
    '<tr><td>Europa</td><td>2.53e-5</td><td>Jupiter</td></tr>',
    '<tr><td>Titan</td><td>2.37e-4</td><td>Saturn</td></tr>',
  ];
  const plainRows = (order) => order.map((i) => PLAIN[i]).join('\n      ');

  test('numbers of a table are read by value, and a sort puts numbers before texts and empty cells last', () => {
    assert.equal(numberOf('1,200'), 1200);
    assert.equal(numberOf('(10.00)'), -10);
    assert.equal(numberOf('12 %'), 0.12);
    assert.equal(numberOf('−3.5'), -3.5);
    assert.equal(numberOf('2.53e-5'), 2.53e-5);
    assert.equal(numberOf('Halo'), null);
    assert.deepEqual(sortOrder(['10', '9', '100']), [1, 0, 2]);
    assert.deepEqual(sortOrder(['10', '9', '100'], true), [2, 0, 1]);
    assert.deepEqual(sortOrder(['b', '', '2', 'A', '1']), [4, 2, 3, 0, 1]);
    assert.deepEqual(sortOrder(['b', '', '2', 'A', '1'], true), [2, 4, 0, 3, 1]);
    assert.deepEqual(sortOrder(['x', 'y', 'x']), [0, 2, 1]);
  });

  for (const platform of PLATFORMS) {
    test(`Sort Descending in the menu of a cell reorders the body rows by its column, as one entry (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: TABLES, n: 1 });
      await clickText(page, cellOf(2, 1));
      await frames(page);
      await click(page, cellOf(2, 1), { button: 'right' });
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu.cell')`);
      const item = await itemAt(page, 'Sort Descending');
      assert.ok(item, 'the menu of the cell does not offer Sort Descending');
      await click(page, item);
      await frames(page);
      await byteExact(page, [[plainRows([0, 1, 2]), plainRows([0, 2, 1])]]);
      assert.equal(await undoLabel(page), 'Undo Sort Descending');
      await roundTrip(page);
    });

    test(`Sort Ascending in the Table pane reorders the body rows by the column of the caret (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: TABLES, n: 1 });
      await clickText(page, cellOf(1, 0));
      await frames(page);
      const button = await rect(page, `${PANEL} [data-command="table.sortAscending"]`);
      assert.ok(button, 'the Table pane does not have Sort Ascending');
      await click(page, button);
      await frames(page);
      await byteExact(page, [[plainRows([0, 1, 2]), plainRows([1, 0, 2])]]);
      assert.equal(await undoLabel(page), 'Undo Sort Ascending');
      assert.equal(await page.evaluate('document.activeElement.textContent'), 'Moon');
      await roundTrip(page);
      await clickText(page, cellOf(1, 0));
      await exec(page, 'table.sortAscending');
      assert.equal(await render(page), page.source);
      assert.equal((await state(page, 'edit.undo')).enabled, false);
    });

    test(`Sort is dimmed for a table with a cell over two rows (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: TABLES, n: 0 });
      await clickText(page, cellOf(3, 1));
      await frames(page);
      assert.equal((await state(page, 'table.sortAscending')).enabled, false);
      assert.equal((await state(page, 'table.sortDescending')).enabled, false);
    });
  }

  const EMPTY = 'test/pages/editor-empty-figure-box.html';
  const PLACEHOLDER = '.reveal section.present .beeson-placeholder';
  const shownPlaceholders = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present .beeson-placeholder')].filter((p) => p.getBoundingClientRect().width > 0).length`);
  const buttonOf = (page, label) => rect(page, `${PLACEHOLDER} button[aria-label="${label}"]`);

  for (const platform of PLATFORMS) {
    test(`an empty zone or plate is drawn with a placeholder of the editor only, which a save does not write (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: EMPTY, n: 0 });
      for (const n of [0, 1, 2]) {
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        assert.equal(await shownPlaceholders(page), 1, `slide ${n} does not show one placeholder`);
        const labels = await page.evaluate(`[...document.querySelectorAll('${PLACEHOLDER} button')].map((b) => b.getAttribute('aria-label'))`);
        assert.deepEqual(labels, ['Insert Image', 'Insert Video', 'Insert Table', 'Insert QR Code']);
        const slot = await rect(page, '.reveal section.present :is(.figure-box, .plate)');
        const box = await rect(page, PLACEHOLDER);
        assert.ok(box.left >= slot.left - 0.5 && box.right <= slot.right + 0.5 && box.top >= slot.top - 0.5 && box.bottom <= slot.bottom + 0.5, `the placeholder at ${js(box)} is not inside its slot at ${js(slot)}`);
        const icon = await buttonOf(page, 'Insert Table');
        assert.ok(icon.x > slot.left + slot.width / 4 && icon.x < slot.right - slot.width / 4, 'the icons are not at the center of the slot');
        assert.equal(await page.evaluate(`document.querySelector('${PLACEHOLDER}').textContent`), '');
      }
      const thumb = await page.evaluate(`(() => {
      const hosts = [...document.querySelectorAll('.beeson-edit-nav *')].filter((h) => h.shadowRoot?.querySelector('.beeson-thumb'));
      return hosts.map((h) => [...h.shadowRoot.querySelectorAll('.beeson-placeholder')].filter((p) => p.getBoundingClientRect().width > 0).length);
    })()`);
      assert.ok(thumb.length >= 3, `the navigator draws ${thumb.length} thumbnails`);
      assert.deepEqual([...new Set(thumb)], [0]);
      assert.equal(await render(page), page.source);
      const { text } = await saveAndReopen(page, `r7-8-${++saves}.html`);
      assert.equal(text, page.source, 'the save of a deck with empty zones changed the file');
      assert.equal(await page.evaluate(`window.BeesonEditor.status().dirty`), false);
      assert.deepEqual(page.errors, []);
    });

    test(`the QR Code icon of a placeholder inserts a QR code into its zone, and an undo draws the placeholder again (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: EMPTY, n: 0 });
      await click(page, await buttonOf(page, 'Insert QR Code'));
      await page.waitFor(`!!document.querySelector('.reveal section.present .figure-box > .qr')`);
      await frames(page);
      assert.equal(await shownPlaceholders(page), 0);
      assert.equal(await undoLabel(page), 'Undo Insert QR Code');
      await undo(page);
      await frames(page);
      await byteExact(page);
      assert.equal(await shownPlaceholders(page), 1);
      await redo(page);
      await frames(page);
      assert.equal(await shownPlaceholders(page), 0);
      const edited = await roundTrip(page);
      assert.match(edited, /<div class="figure-box">\s*<div class="qr" data-qr="https:\/\/example.com"><\/div>\s*<\/div>/);
    });

    test(`the Table icon of a placeholder inserts a table of the size chosen into its zone (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: EMPTY, n: 1 });
      await click(page, await buttonOf(page, 'Insert Table'));
      await page.waitFor(`!!document.querySelector('dialog.beeson-table-picker[open]')`);
      await click(page, await rect(page, '.beeson-table-picker .grid > :nth-child(12)'));
      await page.waitFor(`!!document.querySelector('.reveal section.present .figure-box > table')`);
      await frames(page);
      assert.deepEqual(await page.evaluate(`[...document.querySelector('.reveal section.present .figure-box > table').rows].map((r) => r.cells.length)`), [2, 2]);
      assert.equal(await shownPlaceholders(page), 0);
      assert.equal(await page.evaluate('document.activeElement.localName'), 'th');
      assert.equal(await undoLabel(page), 'Undo Insert Table');
      const edited = await roundTrip(page);
      assert.match(edited, /<div class="figure-box">\s*<table>\s*<tbody>\s*<tr><th style="width: \d+px"><\/th><th style="width: \d+px"><\/th><\/tr>\s*<tr><td><\/td><td><\/td><\/tr>\s*<\/tbody>\s*<\/table>\s*<\/div>/);
    });

    test(`the Image icon of a placeholder inserts the file chosen into its plate (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: EMPTY, n: 2 });
      await click(page, await buttonOf(page, 'Insert Image'));
      await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
      const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
      await page.send('DOM.setFileInputFiles', { files: [resolve('demo/figure-light.png')], objectId: result.objectId });
      await page.waitFor(`!!document.querySelector('.reveal section.present .plate > img')`);
      await frames(page);
      assert.equal(await shownPlaceholders(page), 0);
      assert.equal(await undoLabel(page), 'Undo Insert Image');
      assert.equal((await state(page, 'insert.image')).label, 'Image…');
      const edited = await render(page);
      assert.equal(edited, page.source.replace('<div class="plate"></div>', '<div class="plate">\n    <img src="media/figure-light.png">\n  </div>'));
      await undo(page);
      await frames(page);
      await byteExact(page);
      assert.equal(await shownPlaceholders(page), 1);
      await redo(page);
      assert.equal(await render(page), edited);
      assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(edited)})`)).problems, []);
      assert.deepEqual(page.errors, []);
    });

    test(`the Video icon of a placeholder inserts the file chosen into its zone, as the entry Insert Video (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: EMPTY, n: 0 });
      await click(page, await buttonOf(page, 'Insert Video'));
      await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
      const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
      await page.send('DOM.setFileInputFiles', { files: [resolve('demo/clip-dark.mp4')], objectId: result.objectId });
      await page.waitFor(`!!document.querySelector('.reveal section.present .figure-box > video')`);
      await frames(page);
      assert.equal(await shownPlaceholders(page), 0);
      assert.equal(await undoLabel(page), 'Undo Insert Video');
      assert.equal((await state(page, 'insert.video')).label, 'Video…');
      const edited = await render(page);
      assert.match(edited, /<div class="figure-box">\s*<video [^>]*src="media\/clip-dark\.mp4"[^>]*><\/video>\s*<\/div>/);
      await undo(page);
      await frames(page);
      await byteExact(page);
      assert.equal(await shownPlaceholders(page), 1);
      await redo(page);
      assert.equal(await render(page), edited);
      assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.redo').enabled`), false);
      assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(edited)})`)).problems, []);
      assert.deepEqual(page.errors, []);
    });
  }

  const LAYOUTS = 'test/pages/editor-layouts.html';
  const IMG = '.reveal section.present figure.figure-box img.for-dark';
  const BAR = 'dialog.beeson-mask-bar';
  const written = async (page) => (await render(page)).match(/<img class="for-dark"[^>]*?(?: style="([^"]*)")?>/)[1] ?? null;
  const handlesShown = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-mask-window i')].filter((i) => getComputedStyle(i).display !== 'none').length`);
  const pressed = (page) => page.evaluate(`[...document.querySelectorAll('${BAR} .modes button')].map((b) => b.title + ' ' + b.getAttribute('aria-pressed'))`);
  const handleAt = (page, name) => rect(page, `.beeson-mask-window i[data-handle=${name}]`);

  function differ(a, b) {
    const [x, y] = [decodePng(a).px, decodePng(b).px];
    assert.equal(x.length, y.length);
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
    return sum / x.length;
  }

  const insetBox = (page) => page.evaluate(`(() => {
  const el = document.querySelector(${js(IMG)}), k = Reveal.getScale(), r = el.getBoundingClientRect();
  const w = el.offsetWidth * k, h = el.offsetHeight * k;
  return { x: Math.round(r.left + r.width / 2 - w / 2 + 12), y: Math.round(r.top + r.height / 2 - h / 2 + 12), width: Math.round(w - 24), height: Math.round(h - 24), scale: 1 };
})()`);

  async function pictureKept(page, edited) {
    await press(page, 'Escape');
    await click(page, '.reveal section.present h2');
    await frames(page);
    const box = await insetBox(page);
    const after = await page.screenshot(box);
    await undo(page);
    await frames(page);
    await byteExact(page);
    const before = await page.screenshot(box);
    const kept = differ(after, before);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const shift = differ(await page.screenshot({ ...box, x: box.x + dx, y: box.y + dy }), after);
      assert.ok(kept < shift, `the picture moved: ${kept} in place against ${shift} shifted by ${dx}, ${dy} px`);
    }
    await redo(page);
    assert.equal(await render(page), edited);
  }

  async function editMask(page) {
    await click(page, IMG, { count: 2 });
    await page.waitFor(`!!document.querySelector('${BAR}[open]')`);
    assert.deepEqual(await pressed(page), ['Edit Image true', 'Edit Mask false']);
    assert.equal(await handlesShown(page), 0, 'the handles are drawn in Edit Image, where they do not resize');
    await click(page, `${BAR} button[title="Edit Mask"]`);
    assert.deepEqual(await pressed(page), ['Edit Image false', 'Edit Mask true']);
    assert.equal(await handlesShown(page), 8);
  }

  const RESIZED = /^scale: [\d.]+; clip-path: inset\([\d.]+%\); object-fit: contain; object-position: -?[\d.]+(%|px) -?[\d.]+(%|px); width: (\d+)px; height: (\d+)px(; translate: -?\d+px -?\d+px)?$/;

  for (const platform of PLATFORMS) {
    test(`in Edit Mask a handle resizes the box of an image, and the picture stays in place (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS, n: 3 });
      await editMask(page);
      await drag(page, await handleAt(page, 'nw'), { dx: 120, dy: 90 });
      await press(page, 'Enter');
      assert.equal(await page.evaluate(`!!document.querySelector('${BAR}[open]')`), false);
      assert.equal(await undoLabel(page), 'Undo Edit Mask');
      const style = await written(page);
      const m = style?.match(RESIZED);
      assert.ok(m && m[5], `the style ${style} is not a resized mask with a translate`);
      assert.ok(+m[3] < 600 && +m[4] < 800, `the box of ${m[3]} by ${m[4]} px is not smaller than the zone`);
      const edited = await render(page);
      const pair = (text, tag) => text.replace(tag, `${tag.slice(0, -1)} style="${style}">`);
      assert.equal(edited, pair(pair(page.source, '<img class="for-dark" src="../../demo/figure-dark.png" alt="A figure, dark version">'), '<img class="for-light" src="../../demo/figure-light.png" alt="A figure, light version">'));
      assert.deepEqual(textProblems(edited, THEME), textProblems(page.source, THEME), 'the resized mask is out of the scope rule');
      await pictureKept(page, edited);
      await roundTrip(page, edited);
    });

    test(`in Edit Mask a drag inside the box moves it over the picture, and Esc and Reset leave the image as it was (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS, n: 3 });
      await editMask(page);
      await drag(page, await handleAt(page, 'se'), { dx: -150, dy: -150 });
      await press(page, 'Escape');
      assert.equal(await written(page), null);
      assert.equal(await render(page), page.source);
      await editMask(page);
      await drag(page, await handleAt(page, 'e'), { dx: -100, dy: 0 });
      await click(page, `${BAR} button[title="The picture as it was before this edit"]`);
      await click(page, `${BAR} button.done`);
      assert.equal(await render(page), page.source);
      assert.equal(await page.evaluate(`document.querySelector(${js(IMG)}).getAttribute('style')`), null);
      await editMask(page);
      await drag(page, await handleAt(page, 'se'), { dx: -150, dy: -150 });
      const shrunk = await rect(page, '.beeson-mask-window');
      await drag(page, shrunk, { dx: 60, dy: 70 });
      const moved = await rect(page, '.beeson-mask-window');
      assert.ok(Math.abs(moved.left - shrunk.left - 60) < 2 && Math.abs(moved.top - shrunk.top - 70) < 2, `the box moved from ${js(shrunk)} to ${js(moved)}`);
      assert.ok(Math.abs(moved.width - shrunk.width) < 1.5 && Math.abs(moved.height - shrunk.height) < 1.5, 'the move changed the size of the box');
      await click(page, `${BAR} button.done`);
      assert.equal(await undoLabel(page), 'Undo Edit Mask');
      const style = await written(page);
      const m = style?.match(RESIZED);
      assert.ok(m && m[5], `the style ${style} is not a resized mask with a translate`);
      const edited = await render(page);
      await pictureKept(page, edited);
      await roundTrip(page, edited);
      await click(page, IMG);
      await click(page, IMG);
      assert.equal((await state(page, 'image.resetMask')).enabled, true);
      await exec(page, 'image.resetMask');
      const reset = await written(page);
      assert.match(reset, /^object-fit: contain; width: \d+px; height: \d+px; translate: -?\d+px -?\d+px$/);
      assert.deepEqual(textProblems(await render(page), THEME), textProblems(page.source, THEME), 'the reset mask is out of the scope rule');
      assert.equal((await state(page, 'image.resetMask')).enabled, false);
      const fit = await page.evaluate(`getComputedStyle(document.querySelector(${js(IMG)})).objectFit`);
      assert.equal(fit, 'contain');
      await roundTrip(page);
    });
  }
});

describe('Alt or Option with an arrow adds rows', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r13-3.html';

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
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);

  async function load(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate('Reveal.slide(1)');
    await wait(page, 300);
    return page;
  }

  const TABLE = `document.querySelector('.reveal section.present table')`;
  const size = (page) => page.evaluate(`[${TABLE}.rows.length, ${TABLE}.rows[0].cells.length]`);
  const texts = (page) => page.evaluate(`[...${TABLE}.rows].map((tr) => [...tr.cells].map((c) => c.textContent.trim()))`);
  const where = (page) => page.evaluate(`(() => {
  const c = document.activeElement?.closest?.('td, th');
  const at = c ? [[...${TABLE}.rows].indexOf(c.parentElement), [...c.parentElement.cells].indexOf(c)] : null;
  return { at, range: !!document.querySelector('.beeson-table-bars .cell.range:not([hidden])'), selected: window.BeesonEditor.selection().map((e) => e.tagName) };
})()`);

  async function caretInB2(page) {
    const B2 = `[...${TABLE}.querySelectorAll('td')].find((c) => c.textContent.trim() === 'B2')`;
    const p = await page.evaluate(`(() => { const r = ${B2}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, p);
    await wait(page);
    await page.evaluate(`(() => { const n = ${B2}.firstChild; getSelection().collapse(n, n.length); return true; })()`);
    assert.equal(await page.evaluate(`document.activeElement?.closest('td')?.textContent.trim() ?? null`), 'B2', 'the caret is not in the cell B2');
  }

  const ROWS = [['A1', 'B1', 'C1'], ['A2', 'B2', 'C2'], ['A3', 'B3', 'C3'], ['A4', 'B4', 'C4']];
  const ADDS = [
    ['Alt+ArrowUp', [5, 3], 'Add Row Above', [1, 1], [ROWS[0], ['', 'x', ''], ...ROWS.slice(1)]],
    ['Alt+ArrowDown', [5, 3], 'Add Row Below', [2, 1], [ROWS[0], ROWS[1], ['', 'x', ''], ...ROWS.slice(2)]],
    ['Alt+ArrowLeft', [4, 4], 'Add Column Before', [1, 1], ROWS.map((r, i) => [r[0], i === 1 ? 'x' : '', r[1], r[2]])],
    ['Alt+ArrowRight', [4, 4], 'Add Column After', [1, 2], ROWS.map((r, i) => [r[0], r[1], i === 1 ? 'x' : '', r[2]])],
  ];
  const IDS = { 'Alt+ArrowUp': 'table.rowAbove', 'Alt+ArrowDown': 'table.rowBelow', 'Alt+ArrowLeft': 'table.columnBefore', 'Alt+ArrowRight': 'table.columnAfter' };
  const UNDONE = { at: [1, 1], range: false, selected: [] };

  test('Alt with an arrow adds a row or a column with the caret in a cell, as one entry, and the caret goes into the new cell (other)', async (t) => {
    const page = await load(t, 'other');
    for (const [key, shape, label, at, cells] of ADDS) {
      await caretInB2(page);
      await page.evaluate(`window.BeesonEditor.exec(${js(IDS[key])})`);
      await wait(page);
      await undo(page);
      await wait(page);
      assert.deepEqual(await where(page), UNDONE, `after the undo of ${IDS[key]} from the menu`);
      await caretInB2(page);
      await press(page, key);
      await wait(page);
      assert.deepEqual(await size(page), shape, `the table after ${key}`);
      assert.equal(await undoLabel(page), `Undo ${label}`);
      assert.deepEqual(await where(page), { at, range: false, selected: [] }, `the caret after ${key}`);
      const added = await render(page);
      await undo(page);
      await wait(page);
      assert.equal(await render(page), page.source, `one undo of ${key} does not give the file back byte for byte`);
      assert.deepEqual(await where(page), UNDONE, `after the undo of ${key}`);
      await redo(page);
      assert.equal(await render(page), added, `the redo of ${key} does not add again`);
      await undo(page);
      await caretInB2(page);
      await press(page, key);
      await wait(page);
      await type(page, 'x');
      await wait(page);
      assert.deepEqual(await texts(page), cells, `the letter after ${key} is not typed in the new cell`);
      await undo(page);
      await undo(page);
      assert.equal(await render(page), page.source, `the undos after ${key} do not give the file back`);
    }
    await caretInB2(page);
    await press(page, 'Alt+ArrowDown');
    await wait(page);
    const added = await render(page);
    const { text } = await saveAndReopen(page, 'r17-10-1.html');
    assert.equal(text, added);
    assert.deepEqual(page.errors, []);
  });

  test('Option with an arrow is left to the text with the caret in a cell, and the table stays as it is (mac)', async (t) => {
    const page = await load(t, 'mac');
    for (const [key] of ADDS) {
      await caretInB2(page);
      await press(page, key);
      await wait(page);
      assert.deepEqual(await size(page), [4, 3], `the table after ${key}`);
      assert.equal(await render(page), page.source, `${key} changes the file`);
    }
    assert.equal(await undoLabel(page), 'Undo');
    assert.deepEqual(page.errors, []);
  });

  const watchKeys = (page) => page.evaluate(`(() => { window.__keys = []; addEventListener('keydown', (ev) => { if (ev.altKey) window.__keys.push(ev.key + ' ' + ev.defaultPrevented); }, true); return true; })()`);
  const watched = (page) => page.evaluate('window.__keys.splice(0)');

  for (const platform of PLATFORMS) {
    test(`Alt with Left or Right does not reach the browser where it adds a column (${platform})`, async (t) => {
      const page = await load(t, platform);
      await watchKeys(page);
      await page.evaluate('window.__stay = true');
      const where = () => page.evaluate('[window.__stay === true, history.length, Reveal.getIndices().h]');
      if (platform === 'other') {
        await caretInB2(page);
        const url = await where();
        await press(page, 'Alt+ArrowLeft');
        await press(page, 'Alt+ArrowRight');
        await wait(page);
        assert.deepEqual(await watched(page), ['ArrowLeft true', 'ArrowRight true'], 'with the caret in a cell');
        assert.deepEqual(await size(page), [4, 5]);
        assert.deepEqual(await where(), url);
        await undo(page);
        await undo(page);
      }
      await caretInB2(page);
      await press(page, 'Escape');
      await wait(page);
      assert.equal(await page.evaluate(`!!document.querySelector('.beeson-table-bars .cell.range:not([hidden])')`), true, 'Esc does not select the cell');
      await watched(page);
      const url = await where();
      await press(page, 'Alt+ArrowLeft');
      await press(page, 'Alt+ArrowRight');
      await wait(page);
      assert.deepEqual(await watched(page), ['ArrowLeft true', 'ArrowRight true'], 'with the cell selected');
      assert.deepEqual(await size(page), [4, 5]);
      assert.deepEqual(await where(), url);
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('Start at, and rows moved by their bars', () => {
  const DECK = 'test/pages/editor-r13-3.html';
  const PLATFORMS = ['mac', 'other'];
  const LISTS = 0;
  const PLAIN = 1;
  const HEADER = 2;
  const MERGED = 3;

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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  let saves = 0;

  async function load(t, platform, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function roundTrip(page, base = page.source) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r13-3-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    page.source = text;
    return edited;
  }

  async function drawnNumbers(page, selector) {
    await page.send('Accessibility.enable', {});
    const { root } = await page.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await page.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
    const { nodes } = await page.send('Accessibility.getFullAXTree', {});
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const out = [];
    for (const nodeId of nodeIds) {
      const { node } = await page.send('DOM.describeNode', { nodeId });
      const li = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
      const texts = [];
      const walk = (n) => {
        if (n.role?.value === 'StaticText') texts.push(n.name?.value ?? '');
        for (const id of n.childIds ?? []) if (byId.has(id)) walk(byId.get(id));
      };
      if (li) walk(li);
      out.push(texts[0]);
    }
    return out;
  }

  async function numbersAre(page, selector, expected) {
    let now = [];
    for (const end = Date.now() + 3000; Date.now() < end; await new Promise((d) => setTimeout(d, 100))) {
      now = (await drawnNumbers(page, selector)).slice(0, expected.length);
      if (JSON.stringify(now) === JSON.stringify(expected)) return;
    }
    assert.deepEqual(now, expected);
  }

  const find = (selector, needle = '') => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;
  const ITEM = '.reveal section.present ol > li';

  const pointOf = (page, selector, needle) => page.evaluate(`(() => {
  const el = ${find(selector, needle)};
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + ${js(needle)}.length);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }
})()`);

  const caretAtEnd = (page, needle) => page.evaluate(`(() => {
  const li = ${find(ITEM, needle)};
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) last = n;
  li.closest('[contenteditable="true"]').focus();
  getSelection().collapse(last, last.length);
})()`);

  async function showTab(page, name) {
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === ${js(name)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (at) await click(page, at);
    await frames(page);
  }

  const START = '.beeson-edit-inspector input[name="Start at"]';

  test('the theme draws a numbered list from its attribute start, in the show and in the print view', async (t) => {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(deckUrl(DECK, 'still'));
    await page.waitFor(deckSettled);
    assert.deepEqual(await drawnNumbers(page, 'section ol > li'), ['1', '2', '3', '4', '5', '7', '8']);
    await printView(page, deckUrl(DECK, 'print-pdf&still'));
    const printed = await drawnNumbers(page, '.pdf-page ol > li');
    assert.deepEqual(printed.slice(0, 7), ['1', '2', '3', '4', '5', '7', '8']);
  });

  test('the attribute start is in the scope rule only on an ol and only as a whole number', () => {
    assert.equal(attributeProblem('start', false, 'ol', '3'), null);
    assert.equal(attributeProblem('start', false, 'ul', '3'), 'the attribute start');
    assert.equal(attributeProblem('start', false, 'ol', 'x'), 'the attribute start');
    assert.equal(attributeProblem('start', false, 'ol', '-2'), null);
    assert.equal(attributeProblem('start', false, 'ol', '2.5'), 'the attribute start');
    const theme = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
    assert.deepEqual(editProblems('ol', [], { attrs: { start: '4' } }, theme), []);
    assert.deepEqual(editProblems('li', [], { attrs: { start: '4' } }, theme), ['the attribute start']);
  });

  for (const platform of PLATFORMS) {
    test(`the field Start at of the Text pane writes start on a numbered list, and a 1 takes it off (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS);
      await click(page, await pointOf(page, ITEM, 'Bravo'));
      await showTab(page, 'Text');
      assert.equal(await page.evaluate(`document.querySelector(${js(START)})?.value`), '1', 'the Text pane does not have a field Start at that shows 1');
      await click(page, START, { count: 3 });
      await type(page, '4');
      await press(page, 'Enter');
      await frames(page);
      const four = await render(page);
      assert.equal(four, page.source.replace('<ol>', '<ol start="4">'));
      assert.equal(await undoLabel(page), 'Undo Start At');
      await numbersAre(page, '.reveal section.present ol > li', ['4', '5', '6', '7', '8']);
      await roundTrip(page);
      await click(page, await pointOf(page, ITEM, 'Charlie'));
      await showTab(page, 'Text');
      assert.equal(await page.evaluate(`document.querySelector(${js(START)}).value`), '4');
      await click(page, START, { count: 3 });
      await type(page, '1');
      await press(page, 'Enter');
      await frames(page);
      assert.equal(await render(page), readFileSync(DECK, 'utf8'));
      await roundTrip(page);
    });

    test(`the field Start at is dimmed outside a numbered list (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS);
      await click(page, await pointOf(page, ITEM, 'Bravo'));
      await exec(page, 'text.list.ul');
      await frames(page);
      await showTab(page, 'Text');
      assert.equal(await page.evaluate(`document.querySelector(${js(START)})?.disabled`), true, 'Start at is not dimmed in a list of dashes');
      assert.equal((await state(page, 'text.list.start')).enabled, false);
    });

    test(`Return on an empty item cuts a numbered list, and the second list goes on with the count (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS);
      await caretAtEnd(page, 'Bravo');
      await press(page, 'Enter');
      const added = await render(page);
      await press(page, 'Enter');
      const cut = await render(page);
      assert.match(cut, /<li>Bravo<\/li>\n {2}<\/ol>\n {2}<p><\/p>\n {2}<ol start="3">\n {4}<li>Charlie<\/li>/, `the second list does not start at 3: ${cut.match(/Bravo[\s\S]{0,120}/)?.[0]}`);
      await numbersAre(page, '.reveal section.present ol > li', ['1', '2', '3', '4', '5']);
      assert.equal(await undoLabel(page), 'Undo New Paragraph');
      await roundTrip(page, added);
      await caretAtEnd(page, 'Seventh');
      await press(page, 'Enter');
      await press(page, 'Enter');
      const again = await render(page);
      assert.match(again, /<li>Seventh<\/li>\n {2}<\/ol>\n {2}<p><\/p>\n {2}<ol start="8">\n {4}<li>Eighth<\/li>/, `the second list does not go on from 7: ${again.match(/Seventh[\s\S]{0,140}/)?.[0]}`);
    });

    test(`Dashes on a numbered list with a start number takes the attribute off (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS);
      await click(page, await pointOf(page, ITEM, 'Seventh'));
      await exec(page, 'text.list.ul');
      await frames(page);
      assert.ok((await render(page)).includes('<ul>\n    <li>Seventh</li>'), 'the list of dashes keeps the attribute start');
      await roundTrip(page);
    });
  }

  const rowsOf = (page) => page.evaluate(`[...document.querySelector('.reveal section.present table').rows].map((tr) => [...tr.cells].map((c) => c.textContent.trim()).join(' '))`);
  const onSegments = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-table-bars .bar > .on')].map((d) => d.textContent)`);
  const segment = (bar, i) => `.beeson-table-bars .bar.${bar} > [data-index="${i}"]`;
  const middle = async (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const lineShown = (page) => page.evaluate(`(() => { const l = document.querySelector('.beeson-table-bars .drop'); return !!l && !l.hidden && l.getBoundingClientRect().width > 0; })()`);
  const menuLabels = (page) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].map((m) => ({ label: m.querySelector('.label')?.textContent ?? m.textContent.trim(), disabled: m.getAttribute('aria-disabled') === 'true' }))`);
  const cellPoint = (page, text) => pointOf(page, '.reveal section.present td, .reveal section.present th', text);

  async function selectLine(page, text, bar, i, shift = false) {
    if (!shift) await click(page, await cellPoint(page, text));
    await frames(page);
    await click(page, await middle(page, segment(bar, i)), { modifiers: shift ? 'Shift' : '' });
    await frames(page);
  }

  async function dragSegment(page, bar, i, d, hold = false) {
    const m = await middle(page, segment(bar, i));
    const step = bar === 'rows' ? { dy: d * m.h } : { dx: d * m.w };
    await drag(page, m, { ...step, steps: 12, hold });
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`a drag of a selected row bar moves the row down by one and by two, with a line at the gap (${platform})`, async (t) => {
      const page = await load(t, platform, PLAIN);
      await selectLine(page, 'A2', 'rows', 1);
      assert.deepEqual(await onSegments(page), ['A', 'B', 'C', '2']);
      await dragSegment(page, 'rows', 1, 1, true);
      assert.equal(await lineShown(page), true, 'the gap where the row lands is not marked by a line');
      const m = await middle(page, segment('rows', 1));
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y + m.h, button: 'left', clickCount: 1 });
      await page.waitFor(`window.BeesonEditor.state('edit.undo').label === 'Undo Move Row'`);
      await frames(page);
      assert.deepEqual(await rowsOf(page), ['A1 B1 C1', 'A3 B3 C3', 'A2 B2 C2', 'A4 B4 C4']);
      assert.equal(await lineShown(page), false);
      assert.deepEqual(await onSegments(page), ['A', 'B', 'C', '3'], 'the moved row does not stay selected');
      await roundTrip(page);
      await selectLine(page, 'A1', 'rows', 0);
      await dragSegment(page, 'rows', 0, 2);
      assert.deepEqual(await rowsOf(page), ['A3 B3 C3', 'A2 B2 C2', 'A1 B1 C1', 'A4 B4 C4']);
      const moved = await render(page);
      assert.match(moved, /<tr><td style="width: 300px">A3<\/td><td style="width: 200px">B3<\/td><td>C3<\/td><\/tr>/);
      assert.match(moved, /<tr><td>A1<\/td><td>B1<\/td><td>C1<\/td><\/tr>/);
      assert.deepEqual(await onSegments(page), ['A', 'B', 'C', '3']);
      await roundTrip(page);
    });

    test(`a range of two rows is moved together, and Esc during a drag cancels it (${platform})`, async (t) => {
      const page = await load(t, platform, PLAIN);
      await selectLine(page, 'A2', 'rows', 1);
      await selectLine(page, 'A2', 'rows', 2, true);
      assert.deepEqual(await onSegments(page), ['A', 'B', 'C', '2', '3']);
      await dragSegment(page, 'rows', 2, 1, true);
      assert.equal(await lineShown(page), true);
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await lineShown(page), false, 'Esc does not take the line off');
      const m = await middle(page, segment('rows', 2));
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y + m.h, button: 'left', clickCount: 1 });
      await frames(page);
      assert.equal(await render(page), page.source, 'a drag canceled by Esc changes the file');
      assert.deepEqual(await onSegments(page), ['A', 'B', 'C', '2', '3']);
      await dragSegment(page, 'rows', 2, 1);
      assert.deepEqual(await rowsOf(page), ['A1 B1 C1', 'A4 B4 C4', 'A2 B2 C2', 'A3 B3 C3']);
      assert.equal(await undoLabel(page), 'Undo Move Row');
      assert.deepEqual(await onSegments(page), ['A', 'B', 'C', '3', '4']);
      await roundTrip(page);
    });

    test(`a press on a row bar that is not selected selects its row and does not move it (${platform})`, async (t) => {
      const page = await load(t, platform, PLAIN);
      await click(page, await cellPoint(page, 'A2'));
      await frames(page);
      await dragSegment(page, 'rows', 1, 1);
      assert.equal(await render(page), page.source);
    });

    test(`a drag of a selected column bar moves the column left with its width (${platform})`, async (t) => {
      const page = await load(t, platform, PLAIN);
      await selectLine(page, 'B2', 'cols', 1);
      assert.deepEqual(await onSegments(page), ['B', '1', '2', '3', '4']);
      await dragSegment(page, 'cols', 1, -1);
      assert.deepEqual(await rowsOf(page), ['B1 A1 C1', 'B2 A2 C2', 'B3 A3 C3', 'B4 A4 C4']);
      assert.equal(await undoLabel(page), 'Undo Move Column');
      assert.match(await render(page), /<tr><td style="width: 200px">B1<\/td><td style="width: 300px">A1<\/td><td>C1<\/td><\/tr>/);
      assert.deepEqual(await onSegments(page), ['A', '1', '2', '3', '4'], 'the moved column does not stay selected');
      await roundTrip(page);
    });

    test(`Move Row and Move Column are in the menus of the bars and of a cell, dimmed at the edge of the table (${platform})`, async (t) => {
      const page = await load(t, platform, PLAIN);
      await selectLine(page, 'A1', 'rows', 0);
      await click(page, await middle(page, segment('rows', 0)), { button: 'right' });
      await frames(page);
      const rowMenu = await menuLabels(page);
      assert.deepEqual(rowMenu.filter((m) => m.label.startsWith('Move')), [{ label: 'Move Row Up', disabled: true }, { label: 'Move Row Down', disabled: false }]);
      await press(page, 'Escape');
      await selectLine(page, 'C1', 'cols', 2);
      await click(page, await middle(page, segment('cols', 2)), { button: 'right' });
      await frames(page);
      const colMenu = await menuLabels(page);
      assert.deepEqual(colMenu.filter((m) => m.label.startsWith('Move')), [{ label: 'Move Column Left', disabled: false }, { label: 'Move Column Right', disabled: true }]);
      await press(page, 'Escape');
      await click(page, await cellPoint(page, 'B4'));
      await click(page, await cellPoint(page, 'B4'), { button: 'right' });
      await frames(page);
      const cellMenu = await menuLabels(page);
      assert.deepEqual(cellMenu.filter((m) => m.label.startsWith('Move')).map((m) => [m.label, m.disabled]), [['Move Row Up', false], ['Move Row Down', true], ['Move Column Left', false], ['Move Column Right', false]]);
      await press(page, 'Escape');
      await click(page, await cellPoint(page, 'B2'));
      await exec(page, 'table.moveRowUp');
      await frames(page);
      assert.deepEqual(await rowsOf(page), ['A2 B2 C2', 'A1 B1 C1', 'A3 B3 C3', 'A4 B4 C4']);
      assert.match(await render(page), /<tr><td style="width: 300px">A2<\/td><td style="width: 200px">B2<\/td><td>C2<\/td><\/tr>\n\s*<tr><td>A1<\/td><td>B1<\/td><td>C1<\/td><\/tr>/);
      await roundTrip(page);
      await click(page, await cellPoint(page, 'B3'));
      await exec(page, 'table.moveColumnRight');
      await frames(page);
      assert.deepEqual(await rowsOf(page), ['A2 C2 B2', 'A1 C1 B1', 'A3 C3 B3', 'A4 C4 B4']);
      assert.equal(await undoLabel(page), 'Undo Move Column Right');
      await roundTrip(page);
    });

    test(`a header row and the body rows are not mixed, and a merged cell blocks a move across it (${platform})`, async (t) => {
      const page = await load(t, platform, HEADER);
      await selectLine(page, 'Moon', 'rows', 1);
      assert.equal((await state(page, 'table.moveRowUp')).enabled, false, 'the first body row moves into the header');
      await dragSegment(page, 'rows', 1, -1, true);
      assert.equal(await lineShown(page), false, 'a line is shown in the header');
      await press(page, 'Escape');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 0, y: 0, button: 'left', clickCount: 1 });
      assert.equal(await render(page), page.source);
      await exec(page, 'table.moveRowDown');
      await frames(page);
      assert.deepEqual(await rowsOf(page), ['Body Mass ratio System', 'Europa 2.53e-5 Jupiter', 'Moon 0.01215 Earth and Moon', 'Titan 2.37e-4 Saturn']);
      await roundTrip(page);

      await page.evaluate(`Reveal.slide(${MERGED})`);
      await frames(page);
      await selectLine(page, 'Lyapunov', 'rows', 3);
      assert.equal((await state(page, 'table.moveRowUp')).enabled, true, 'Move Row Up of the row under a merged block is dimmed');
      await dragSegment(page, 'rows', 3, -1, true);
      assert.equal(await lineShown(page), false, 'a line is shown inside a merged cell');
      await press(page, 'Escape');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 0, y: 0, button: 'left', clickCount: 1 });
      await click(page, await cellPoint(page, '14.8'));
      assert.equal((await state(page, 'table.moveColumnLeft')).enabled, false, 'a column moves across a merged cell');
      assert.equal((await state(page, 'table.moveColumnRight')).enabled, true);
      assert.equal(await render(page), page.source);
    });
  }
});

describe('a row or column dragged by its bar', () => {
  const TABLES = 'test/pages/editor-r13-3.html';
  const PLAIN = 1;
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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  let saves = 0;

  async function load(t, platform, deck, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function roundTrip(page) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), page.source, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r15-5-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
  }

  const rowsOf = (page) => page.evaluate(`[...document.querySelector('.reveal section.present table').rows].map((tr) => [...tr.cells].map((c) => c.textContent.trim()).join(' '))`);
  const segment = (bar, i) => `.beeson-table-bars .bar.${bar} > [data-index="${i}"]`;
  const middle = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const lineShown = (page) => page.evaluate(`(() => { const l = document.querySelector('.beeson-table-bars .drop'); return !!l && !l.hidden && l.getBoundingClientRect().width > 0; })()`);
  const box = (page, expr) => page.evaluate(`(() => { const r = (${expr}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const TABLE = `document.querySelector('.reveal section.present table')`;
  const rowBox = (page, r) => box(page, `${TABLE}.rows[${r}]`);
  const cellBox = (page, r, c) => box(page, `${TABLE}.rows[${r}].cells[${c}]`);
  const lifted = (page) => page.evaluate(`(() => {
  const l = document.querySelector('.beeson-table-bars .lift');
  if (!l || l.hidden) return null;
  const r = l.getBoundingClientRect();
  return r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height, text: [...l.children].map((c) => c.textContent.trim()).join(' '), opacity: Number(getComputedStyle(l).opacity), shadow: getComputedStyle(l).boxShadow } : null;
})()`);
  const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 2, `${what}: ${a} against ${b}`);
  const cellPoint = (page, text) => page.evaluate(`(() => {
  const td = [...document.querySelectorAll('.reveal section.present td')].find((c) => c.textContent.trim() === ${js(text)});
  const r = td.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  async function selectLine(page, text, bar, i) {
    await click(page, await cellPoint(page, text));
    await frames(page);
    await click(page, await middle(page, segment(bar, i)));
    await frames(page);
  }

  const pointer = (page, type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

  for (const platform of PLATFORMS) {
    test(`a row dragged by its bar is lifted and follows the pointer, and the file changes only at the drop (${platform})`, async (t) => {
      const page = await load(t, platform, TABLES, PLAIN);
      await selectLine(page, 'A2', 'rows', 1);
      const m = await middle(page, segment('rows', 1));
      const row = await rowBox(page, 1);
      const before = await undoLabel(page);
      await drag(page, m, { dy: m.h, steps: 12, hold: true });
      await frames(page);
      const l = await lifted(page);
      assert.ok(l, 'the dragged row is not lifted while the button is held');
      near(l.y, row.y + m.h, 'the top of the lifted row');
      near(l.x, row.x, 'the left of the lifted row');
      near(l.h, row.h, 'the height of the lifted row');
      near(l.w, row.w, 'the width of the lifted row');
      assert.equal(l.text, 'A2 B2 C2');
      assert.ok(l.opacity < 1 || l.shadow !== 'none', 'the lifted row is drawn neither lighter nor with a shadow');
      assert.equal(await lineShown(page), true, 'the gap where the row lands is not marked by a line');
      assert.deepEqual(await rowBox(page, 1), row);
      assert.equal(await page.evaluate(`getComputedStyle(${TABLE}.rows[1]).transform`), 'none');
      assert.equal(await render(page), page.source, 'the file changes during the drag');
      assert.equal(await undoLabel(page), before);
      await pointer(page, 'mouseMoved', m.x, m.y + 1.5 * m.h);
      await frames(page);
      near((await lifted(page)).y, row.y + 1.5 * m.h, 'the top of the lifted row after a further move');
      await pointer(page, 'mouseReleased', m.x, m.y + 1.5 * m.h);
      await page.waitFor(`window.BeesonEditor.state('edit.undo').label === 'Undo Move Row'`);
      await frames(page);
      assert.equal(await lifted(page), null, 'the lifted row is still shown after the drop');
      assert.deepEqual(await rowsOf(page), ['A1 B1 C1', 'A3 B3 C3', 'A2 B2 C2', 'A4 B4 C4']);
      await roundTrip(page);
    });

    test(`a column dragged by its bar is lifted and follows the pointer along its axis (${platform})`, async (t) => {
      const page = await load(t, platform, TABLES, PLAIN);
      await selectLine(page, 'B2', 'cols', 1);
      const m = await middle(page, segment('cols', 1));
      const top = await cellBox(page, 0, 1);
      const table = await box(page, TABLE);
      await drag(page, m, { dx: -m.w, dy: 40, steps: 12, hold: true });
      await frames(page);
      const l = await lifted(page);
      assert.ok(l, 'the dragged column is not lifted while the button is held');
      near(l.x, top.x - m.w, 'the left of the lifted column');
      near(l.w, top.w, 'the width of the lifted column');
      near(l.y, table.y, 'the top of the lifted column');
      near(l.h, table.h, 'the height of the lifted column');
      assert.equal(l.text, 'B1 B2 B3 B4');
      assert.equal(await lineShown(page), true);
      assert.equal(await render(page), page.source, 'the file changes during the drag');
      await pointer(page, 'mouseReleased', m.x - m.w, m.y + 40);
      await page.waitFor(`window.BeesonEditor.state('edit.undo').label === 'Undo Move Column'`);
      await frames(page);
      assert.equal(await lifted(page), null);
      assert.deepEqual(await rowsOf(page), ['B1 A1 C1', 'B2 A2 C2', 'B3 A3 C3', 'B4 A4 C4']);
      await roundTrip(page);
    });

    test(`Esc during a drag by a bar puts the lifted row back without an entry of the history (${platform})`, async (t) => {
      const page = await load(t, platform, TABLES, PLAIN);
      await selectLine(page, 'A2', 'rows', 1);
      const m = await middle(page, segment('rows', 1));
      const before = await undoLabel(page);
      await drag(page, m, { dy: m.h, steps: 12, hold: true });
      await frames(page);
      assert.ok(await lifted(page), 'the dragged row is not lifted while the button is held');
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await lifted(page), null, 'Esc leaves the lifted row on the screen');
      assert.equal(await lineShown(page), false);
      await pointer(page, 'mouseMoved', m.x, m.y + 2 * m.h);
      await frames(page);
      assert.equal(await lifted(page), null, 'the lifted row comes back after Esc');
      await pointer(page, 'mouseReleased', m.x, m.y + 2 * m.h);
      await frames(page);
      assert.equal(await render(page), page.source, 'a drag canceled by Esc changes the file');
      assert.equal(await undoLabel(page), before, 'a drag canceled by Esc is an entry of the history');
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('the drop line, and body cells pasted', () => {
  const PLATFORMS = ['mac', 'other'];
  const BARS = 'test/pages/editor-r13-3.html';
  const TABLES = 'test/pages/editor-tables.html';
  const MOD = { mac: 4, other: 2 };

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
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  let saves = 0;

  async function load(t, platform, deck, n, theme = '') {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still${theme ? `&theme=${theme}` : ''}&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    page.platform = platform;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await wait(page, 300);
    return page;
  }

  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r17-4-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    return edited;
  }

  const TABLE = `document.querySelector('.reveal section.present table')`;
  const rowsOf = (page) => page.evaluate(`[...${TABLE}.rows].map((tr) => [...tr.cells].map((c) => c.textContent.trim()).join(' '))`);
  const segment = (bar, i) => `.beeson-table-bars .bar.${bar} > [data-index="${i}"]`;
  const middle = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const LIFT = `document.querySelector('.beeson-table-bars .lift')`;
  const liftText = (page) => page.evaluate(`[...${LIFT}.children].map((d) => d.textContent.trim()).join(' ')`);
  const DROP = `document.querySelector('.beeson-table-bars .drop')`;
  const shown = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; })()`);
  const pointer = (page, type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const cellPoint = (page, text) => page.evaluate(`(() => {
  const td = [...document.querySelectorAll('.reveal section.present :is(td, th)')].find((c) => c.textContent.trim() === ${js(text)});
  const r = td.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  async function pressRow(page, cell, i, k) {
    await click(page, await cellPoint(page, cell));
    await wait(page, 100);
    await click(page, await middle(page, segment('rows', i)));
    await wait(page, 100);
    const m = await middle(page, segment('rows', i));
    await pointer(page, 'mouseMoved', m.x, m.y);
    await pointer(page, 'mousePressed', m.x, m.y);
    for (let j = 1; j <= 10; j++) await pointer(page, 'mouseMoved', m.x, m.y + (k * m.h * j) / 10);
    await wait(page);
    return { x: m.x, y: m.y + k * m.h, h: m.h };
  }

  async function pixels(page, points) {
    const png = await page.screenshot({ x: 0, y: 0, width: 1600, height: 1000, scale: 1 });
    return page.evaluate(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${png.toString('base64')}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const s = img.width / innerWidth;
    return ${js(points)}.map(([x, y]) => 'rgb(' + [...g.getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data].slice(0, 3).join(', ') + ')');
  })()`);
  }

  for (const platform of PLATFORMS) {
    for (const theme of ['dark', 'light']) {
      test(`the drop line of a row dragged by its bar is drawn over the lifted copy, in ${theme} mode (${platform})`, async (t) => {
        const page = await load(t, platform, BARS, 1, theme);
        const m = await pressRow(page, 'A2', 1, 1.4);
        const drop = await shown(page, DROP);
        const lift = await shown(page, LIFT);
        assert.ok(drop && lift, `the drag does not show the copy and the line: ${js({ drop, lift })}`);
        assert.ok(drop.y > lift.y && drop.y + drop.h < lift.y + lift.h, `the line is not under the copy: ${js({ drop, lift })}`);
        const x = drop.x + drop.w * 0.25;
        const ys = [-1.5, -1, 0, 0.5, 1].map((d) => (d < 0 ? drop.y + d : d === 1 ? drop.y + drop.h + 1 : drop.y + drop.h * d));
        const [above, ...across] = await pixels(page, [[x, drop.y - 6], ...ys.map((y) => [x, y])]);
        const line = across.reduce((m, p) => (contrast(p, above) > contrast(m, above) ? p : m));
        const ratio = contrast(line, above);
        assert.ok(ratio >= 3, `the edge of the drop line reads ${line} against ${above} beside it, a contrast of ${ratio.toFixed(2)} to 1`);
        await press(page, 'Escape');
        await pointer(page, 'mouseReleased', m.x, m.y);
        await wait(page);
        assert.equal(await render(page), page.source);
        assert.deepEqual(page.errors, []);
      });
    }
  }

  const at = (page, r, c) => page.evaluate(`(() => { const t = Reveal.getCurrentSlide().querySelector('table'); const b = t.rows[${r}].cells[${c}].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);

  async function copyBody(page) {
    await click(page, await at(page, 1, 0));
    await wait(page);
    await click(page, await at(page, 2, 1), { modifiers: 'Shift' });
    await wait(page);
    assert.ok(await page.evaluate(`(() => { const o = document.querySelector('.beeson-table-bars .cell.range'); return !!o && !o.hidden; })()`), 'the range is not selected');
    await page.evaluate(`(() => { window.__w = []; const o = DataTransfer.prototype.setData; DataTransfer.prototype.setData = function (t, v) { window.__w.push([t, v]); return o.call(this, t, v); }; })()`);
    const base = { key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: MOD[page.platform] };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: ['copy'] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page);
    const w = await page.evaluate('window.__w');
    await press(page, 'Escape');
    await press(page, 'Escape');
    await page.evaluate('Reveal.slide(2)');
    await wait(page, 300);
    await page.evaluate('document.activeElement?.blur()');
    return { plain: w.find((x) => x[0] === 'text/plain')?.[1] ?? '', html: w.find((x) => x[0] === 'text/html')?.[1] ?? '' };
  }

  const BODY = '<tbody>\n      <tr><td>Moon</td><td style="text-align: right">\\(0.01215\\)</td></tr>\n      <tr><td>Europa</td><td style="text-align: right">2.53e-5</td></tr>\n    </tbody>';
  const tables = (page) => page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('table').length`);
  const MENU_ITEM = (label) => `[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.textContent === ${js(label)})`;
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const itemDimmed = (page, label) => page.evaluate(`${MENU_ITEM(label)}?.getAttribute('aria-disabled') === 'true'`);
  const openEdit = async (page) => {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === 'Edit')`));
    await wait(page);
  };
  const closeMenus = async (page) => {
    await page.evaluate('window.BeesonEditorShell?.closeMenus?.(); true');
    await wait(page);
  };

  for (const platform of PLATFORMS) {
    test(`a range of body cells pasted onto a slide by the key is a table of body cells (${platform})`, async (t) => {
      const page = await load(t, platform, TABLES, 1);
      const { plain, html } = await copyBody(page);
      assert.ok(html.includes('<td>Moon</td>'), html);
      const done = await page.evaluate(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${js(plain)}); dt.setData('text/html', ${js(html)}); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(ev); return ev.defaultPrevented; })()`);
      assert.ok(done, 'the paste is not taken by the editor');
      await wait(page, 300);
      assert.equal(await tables(page), 2, 'the paste does not make a table');
      const pasted = await render(page);
      assert.ok(pasted.includes(BODY), `the new table is not of body cells:\n${pasted.slice(pasted.lastIndexOf('<table>'), pasted.lastIndexOf('</table>'))}`);
      const look = await page.evaluate(`(() => { const c = Reveal.getCurrentSlide().querySelectorAll('table')[1].rows[0].cells[0]; const s = getComputedStyle(c); return { tag: c.localName, style: s.fontStyle }; })()`);
      assert.deepEqual(look, { tag: 'td', style: 'normal' });
      assert.equal(await undoLabel(page), 'Undo Paste');
      await roundTrip(page, page.source);
    });

    test(`Paste of the Edit menu on the canvas with a range of cells on the clipboard makes the table of the key (${platform})`, async (t) => {
      const page = await load(t, platform, TABLES, 1);
      await page.send('Page.bringToFront');
      await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
      await copyBody(page);
      await click(page, await rect(page, `document.querySelector('.reveal section.present h2')`).then((p) => ({ x: p.x, y: p.y + 260 })));
      await wait(page);
      assert.equal(await tables(page), 1);
      await openEdit(page);
      assert.equal(await itemDimmed(page, 'Paste'), false, 'Paste is dimmed on the canvas');
      await click(page, await rect(page, MENU_ITEM('Paste')));
      await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll('table').length === 2`).catch(() => {});
      await wait(page, 300);
      await closeMenus(page);
      assert.equal(await tables(page), 2, 'Paste of the Edit menu does not make a table');
      const pasted = await render(page);
      assert.ok(pasted.includes(BODY), `the new table is not the table of the key:\n${pasted.slice(pasted.lastIndexOf('<table>'), pasted.lastIndexOf('</table>'))}`);
      assert.equal(await undoLabel(page), 'Undo Paste');
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName)`), ['table']);
      await roundTrip(page, page.source);
    });
  }

  for (const platform of PLATFORMS) {
    test(`a key pressed during a drag of a row by its bar is without effect, and Esc ends the drag (${platform})`, async (t) => {
      const page = await load(t, platform, BARS, 1);
      let p = await pressRow(page, 'A2', 1, 2.2);
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.deepEqual(await rowsOf(page), ['A1 B1 C1', 'A3 B3 C3', 'A4 B4 C4', 'A2 B2 C2']);
      assert.equal(await undoLabel(page), 'Undo Move Row');
      const moved = await render(page);
      p = await pressRow(page, 'A3', 1, 1.2);
      const lift = await liftText(page);
      assert.equal(lift, 'A3 B3 C3');
      for (const key of ['Mod+Z', 'Backspace', 'Delete', 'ArrowDown', 'Mod+X', 'PageDown']) {
        await press(page, key);
        await wait(page, 50);
        assert.equal(await page.evaluate('Reveal.getIndices().h'), 1, `${key} during the drag changes the slide`);
        assert.equal(await render(page), moved, `${key} during the drag changes the file`);
        assert.equal(await undoLabel(page), 'Undo Move Row', `${key} during the drag is an entry of the history`);
        assert.deepEqual(await rowsOf(page), ['A1 B1 C1', 'A3 B3 C3', 'A4 B4 C4', 'A2 B2 C2'], `${key} during the drag changes the table`);
        assert.ok(await shown(page, LIFT), `${key} during the drag takes the lifted row off`);
      }
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.deepEqual(await rowsOf(page), ['A1 B1 C1', 'A4 B4 C4', 'A3 B3 C3', 'A2 B2 C2']);
      await roundTrip(page, moved);
      const now = await render(page);
      p = await pressRow(page, 'A1', 0, 1.2);
      await press(page, 'Escape');
      await wait(page);
      assert.equal(await shown(page, LIFT), null, 'Esc does not end the drag');
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.equal(await render(page), now);
      assert.deepEqual(page.errors, []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`a row moved past a merged block and a merged block moved whole are moved, and a refused move is not lifted (${platform})`, async (t) => {
      let page = await load(t, platform, BARS, 3);
      const rows = await rowsOf(page);
      assert.deepEqual(rows, ['Family Period Jacobi', 'Halo 14.8 3.05', '6.6 3.04', 'Lyapunov 2.69 3.10']);
      let p = await pressRow(page, 'Lyapunov', 3, -2);
      assert.ok(await shown(page, LIFT), 'the row is not lifted');
      assert.ok(await shown(page, DROP), 'the drop line is not drawn at the gap above the merged block');
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.deepEqual(await rowsOf(page), ['Family Period Jacobi', 'Lyapunov 2.69 3.10', 'Halo 14.8 3.05', '6.6 3.04']);
      assert.equal(await undoLabel(page), 'Undo Move Row');
      await roundTrip(page, page.source);
      page = await load(t, platform, BARS, 3);
      p = await pressRow(page, '14.8', 1, 2);
      assert.equal(await liftText(page), 'Halo 14.8 3.05 6.6 3.04');
      assert.ok(await shown(page, DROP), 'the drop line is not drawn after the last row');
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.deepEqual(await rowsOf(page), ['Family Period Jacobi', 'Lyapunov 2.69 3.10', 'Halo 14.8 3.05', '6.6 3.04']);
      await undo(page);
      await wait(page);
      assert.equal(await render(page), page.source);
      p = await pressRow(page, 'Lyapunov', 3, -1);
      assert.equal(await shown(page, DROP), null, 'a drop line is drawn inside the merged block');
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.equal(await render(page), page.source);
      p = await pressRow(page, 'Family', 0, 2);
      assert.equal(await shown(page, LIFT), null, 'the header row is lifted although it cannot be moved');
      assert.equal(await shown(page, DROP), null);
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });
  }
});
