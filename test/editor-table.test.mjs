// the tables of the editor: the model of src/editor/table.ts under node, and on either platform
// with trusted input the Insert Table grid, Tab and the arrow keys between the cells, the rows and
// columns added and deleted, the header row, the numbers at the right, the context menu of a cell,
// a paste of tab-separated text or of an HTML table, onto the slide or into a cell, a range of
// cells selected by a drag, a Shift-click, and the keys, the cells merged and unmerged, the widths
// of the columns, and Auto-Align. after each edit the text is in the scope rule, an undo gives the
// file byte for byte, a redo gives the edit, and a save is opened again without problems. a paste
// is a synthetic event with a DataTransfer of its own, since the clipboard of the system is shared
// with the other tests run at the same time

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { columnName, emptyRows, grow, isNumeric, layoutCells, numberOf, numericColumns, parseTabular, sortOrder, spotsIn, tableHtml } from '../src/editor/table.ts';
import { attributeProblem, editProblems, textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, contrast, drag, editorPage, press, saveAndReopen, selectFigure, type } from './helpers/editor.mjs';

const LAYOUTS_DECK = 'test/pages/editor-layouts.html';
// a table with a rowspan and a colspan on its first slide, and a plain table on its second
const TABLES_DECK = 'test/pages/editor-tables.html';
// the index of the slide of the equations in index.html, a content slide without a table
const EQUATIONS = 3;
const STYLE = { step: '  ', eol: '\n' };
const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));

test('numbers are told from words, and a column of numbers is set at the right below its header', () => {
  for (const t of ['42', '-3.5', '1,200', '$9.99', '12 %', '(10.00)', '3.2e-4', '−7', '+1']) assert.ok(isNumeric(t), t);
  for (const t of ['', 'Halo', '1.2.3', '12 km', 'e5', '-', '1.2e']) assert.ok(!isNumeric(t), t);
  assert.deepEqual(numericColumns([['Family', 'Period'], ['Lyapunov', '2.69'], ['Halo', '']]), [false, true]);
  assert.deepEqual(numericColumns([['A', 'B'], ['', 'x']]), [false, false]);
});

test('tab-separated text is read as rows of cells, with quoted cells and short rows padded', () => {
  assert.deepEqual(parseTabular('a\tb\n1\t2\r\n3\t4\n'), [['a', 'b'], ['1', '2'], ['3', '4']]);
  assert.deepEqual(parseTabular('"x\ty"\t"say ""hi"""\nz'), [['x\ty', 'say "hi"'], ['z', '']]);
  assert.equal(parseTabular('one line\ntwo lines'), null);
  assert.equal(parseTabular('\t'), null);
});

test('a table is written with an explicit tbody, a header row of th, and numbers at the right', () => {
  assert.equal(tableHtml(emptyRows(2, 2), STYLE, '  '), '<table>\n    <tbody>\n      <tr><th></th><th></th></tr>\n      <tr><td></td><td></td></tr>\n    </tbody>\n  </table>');
  assert.equal(
    tableHtml([['Body', 'μ'], ['Moon', '0.01215'], ['a < b', '1']], { step: '\t', eol: '\r\n' }, '\t'),
    '<table>\r\n\t\t<tbody>\r\n\t\t\t<tr><th>Body</th><th style="text-align: right">μ</th></tr>\r\n\t\t\t<tr><td>Moon</td><td style="text-align: right">0.01215</td></tr>\r\n\t\t\t<tr><td>a &lt; b</td><td style="text-align: right">1</td></tr>\r\n\t\t</tbody>\r\n\t</table>',
  );
  assert.deepEqual([0, 1, 25, 26, 27, 701, 702].map(columnName), ['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
});

test('the cells of a table are laid out with their colspan and rowspan, and a range grows over merged cells', () => {
  // the table of merged cells of TABLES_DECK: Halo over two rows, Distant retrograde over two columns
  const cell = (name, rows = 1, cols = 1) => ({ name, rows, cols });
  const g = layoutCells([
    [cell('Family'), cell('Period'), cell('Jacobi')],
    [cell('Halo', 2), cell('14.8'), cell('3.05')],
    [cell('6.6'), cell('3.04')],
    [cell('DRO', 1, 2), cell('2.92')],
  ], (c) => c);
  assert.equal(g.width, 3);
  assert.deepEqual(g.grid.map((r) => r.map((s) => s.cell.name)), [['Family', 'Period', 'Jacobi'], ['Halo', '14.8', '3.05'], ['Halo', '6.6', '3.04'], ['DRO', 'DRO', '2.92']]);
  assert.deepEqual(g.spots[2].map((s) => [s.row, s.col]), [[2, 1], [2, 2]]);
  // a range from 6.6 to Distant retrograde grows to Halo, which reaches into it
  assert.deepEqual(grow(g, { r0: 2, c0: 1, r1: 3, c1: 1 }), { r0: 1, c0: 0, r1: 3, c1: 1 });
  assert.deepEqual(spotsIn(g, { r0: 1, c0: 0, r1: 3, c1: 1 }).map((s) => s.cell.name), ['Halo', '14.8', '6.6', 'DRO']);
  // a rowspan of 0 or past the last row reaches the last row
  assert.equal(layoutCells([[cell('a', 0)], [], [cell('b')]], (c) => c).spots[0][0].rows, 3);
  assert.equal(layoutCells([[cell('a', 9)], [cell('b')]], (c) => c).grid[1][1].cell.name, 'b');
});

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

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const settle = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(window.BeesonEditor.status()))))');
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
const js = (v) => JSON.stringify(v);

async function open(platform, deck = 'test-deck.html') {
  const page = await browser.newPage();
  await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(deck, 'utf8');
  const status = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
  assert.deepEqual(status.problems, []);
  page.platform = platform;
  return page;
}

async function show(page, at) {
  const h = typeof at === 'number' ? at : await page.evaluate(`Reveal.getIndices(document.querySelector(${js(at)}).closest('section')).h`);
  await page.evaluate(`Reveal.slide(${h})`);
  await sleep(150);
}

// the center of a cell of the table of the current slide, by row and column
const cellSelector = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;
const at = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

// the row and the column of the cell of the focus, or null outside a table
const focusCell = (page) => page.evaluate(`(() => {
  const c = document.activeElement?.closest?.('td, th');
  if (!c) return null;
  return [[...c.closest('table').rows].indexOf(c.parentElement), [...c.parentElement.cells].indexOf(c)];
})()`);

const selected = (page) => page.evaluate('String(window.getSelection())');

// a paste event with data of its own, as the browser sends it for the paste key
const paste = (page, data) =>
  page.evaluate(`(() => {
    const data = new DataTransfer();
    for (const [type, text] of Object.entries(${js(data)})) data.setData(type, text);
    (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  })()`);

// the time for the edits of a paste, which are run after the event
const settled = async (page) => {
  await sleep(120);
  return settle(page);
};

let saves = 0;
async function roundTrip(page, undos = 1) {
  const edited = await render(page);
  assert.notEqual(edited, page.source, 'the edit did not change the text');
  // the problems of the scope rule that the file did not have before
  const added = textProblems(edited, THEME);
  for (const p of textProblems(page.source, THEME)) if (added.includes(p)) added.splice(added.indexOf(p), 1);
  assert.deepEqual(added, [], 'the edit is out of the scope rule');
  for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
  await byteExact(page);
  assert.equal((await settle(page)).undo, false, `the edit is more than ${undos} entries of the history`);
  for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
  assert.equal(await render(page), edited);
  const { text } = await saveAndReopen(page, `table-${++saves}.html`);
  assert.equal(text, edited);
  assert.deepEqual(errors(page), []);
  return edited;
}

const THREE = '<table>\n    <tbody>\n      <tr><th></th><th></th><th></th></tr>\n      <tr><td></td><td></td><td></td></tr>\n      <tr><td></td><td></td><td></td></tr>\n    </tbody>\n  </table>';

// the text rendered with the translate taken off a new table, which placeTable of
// commands/table.ts gives it on a slide whose text column is full
const placed = async (page) => (await render(page)).replace(/<table style="translate: -?\d+px -?\d+px">/, '<table>');

// the table of a text cut out with the line it is on, which gives the deck before the insert
const without = (text, table) => text.replace(`\n  ${table}`, '');

const LAYOUT_ROWS = [
  '<tr><th>Family</th><th>Period</th></tr>',
  '<tr><td>Lyapunov</td><td>\\(2.69\\)</td></tr>',
  '<tr class="fragment" data-fragment-index="1"><td>Halo</td><td>\\(3.41\\)</td></tr>',
];
const layoutTable = (rows) => `<table>\n${rows.map((r) => `    ${r}\n`).join('')}  </table>`;

// the white space before the first row of a table without a tbody tag is in the table, before the
// tbody of the page, and a row inserted into that tbody was written on the line of the row before
test('a row inserted into a table without a tbody tag is written on a line of its own', async (t) => {
  const page = await open('mac', LAYOUTS_DECK);
  t.after(() => page.close?.());
  const tbody = `document.querySelector('.reveal .slides table').tBodies[0]`;
  await page.evaluate(`window.BeesonEditor.doc.insert('<tr><td>Axial</td><td></td></tr>', ${tbody}, null)`);
  await page.evaluate(`window.BeesonEditor.doc.insert('<tr><td>Vertical</td><td></td></tr>', ${tbody}, ${tbody}.rows[1])`);
  await byteExact(page, [[layoutTable(LAYOUT_ROWS), layoutTable([LAYOUT_ROWS[0], '<tr><td>Vertical</td><td></td></tr>', ...LAYOUT_ROWS.slice(1), '<tr><td>Axial</td><td></td></tr>'])]]);
  await page.evaluate('window.BeesonEditor.undo()');
  await page.evaluate('window.BeesonEditor.undo()');
  await byteExact(page);
});

// for the same reason, a row inserted before the first row, or the first row removed, wrote the
// white space of the first row twice
test('the first row of a table without a tbody tag is replaced without its white space twice', async (t) => {
  const page = await open('mac', LAYOUTS_DECK);
  t.after(() => page.close?.());
  const tbody = `document.querySelector('.reveal .slides table').tBodies[0]`;
  await page.evaluate(`window.BeesonEditor.doc.insert('<tr><td>Axial</td><td></td></tr>', ${tbody}, ${tbody}.rows[0])`);
  await byteExact(page, [[layoutTable(LAYOUT_ROWS), layoutTable(['<tr><td>Axial</td><td></td></tr>', ...LAYOUT_ROWS])]]);
  await page.evaluate('window.BeesonEditor.undo()');
  await page.evaluate(`window.BeesonEditor.doc.remove(${tbody}.rows[0])`);
  await byteExact(page, [[layoutTable(LAYOUT_ROWS), layoutTable(LAYOUT_ROWS.slice(1))]]);
  await page.evaluate('window.BeesonEditor.undo()');
  await byteExact(page);
});

// a key with Option and the editing command that Chrome on a Mac sends with it, e.g. moveWordRight,
// which press() does not send
async function optionKey(page, name, command) {
  const [key, keyCode] = { ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40] }[name];
  const base = { key, code: key, windowsVirtualKeyCode: keyCode, modifiers: 1 };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [command] });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// the offset of the caret in the text of the cell of the focus
const caretOffset = (page) => page.evaluate(`(() => {
  const r = window.getSelection().getRangeAt(0).cloneRange();
  r.setStart(document.activeElement.closest('td, th'), 0);
  return r.toString().length;
})()`);

// on a Mac, Option with an arrow moves the caret by a word or a paragraph in every text field, the
// cells of Keynote included, and Option with Right Arrow in a cell added a column. the word move is
// left to the browser, which moves as its host does: past the space after the word on Windows, and
// to the end of the word on macOS and Linux
test('Option and Right Arrow in the text of a cell move the caret by a word (mac)', async (t) => {
  const page = await open('mac', LAYOUTS_DECK);
  t.after(() => page.close?.());
  await show(page, '.reveal .slides table');
  await click(page, cellSelector(0, 0));
  await press(page, 'End');
  await type(page, ' of orbits');
  await press(page, 'Home');
  await optionKey(page, 'ArrowRight', 'moveWordRight');
  await settle(page);
  assert.equal(await page.evaluate(`document.querySelector('.reveal section.present table').rows[0].cells.length`), 2, 'a column is added');
  assert.deepEqual(await focusCell(page), [0, 0]);
  assert.equal(await caretOffset(page), process.platform === 'win32' ? 'Family '.length : 'Family'.length);
  assert.deepEqual(errors(page), []);
});

for (const platform of ['mac', 'other']) {
  test(`Insert Table from the grid writes a 3 by 3 table with a tbody and a header row (${platform})`, async (t) => {
    const page = await open(platform);
    t.after(() => page.close?.());
    await show(page, EQUATIONS);
    await click(page, '.beeson-edit-top [data-command="insert.table"]');
    await page.waitFor(`!!document.querySelector('dialog.beeson-table-picker[open]')`);
    assert.equal(await page.evaluate('document.activeElement.className'), 'grid');
    // the cell of row 3 and column 3 of the grid of 10 columns
    const cell = await at(page, 'dialog.beeson-table-picker .grid > :nth-child(23)');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.x, y: cell.y });
    assert.equal(await page.evaluate(`document.querySelector('.beeson-table-picker .size').textContent`), '3 × 3 Table');
    assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-table-picker .grid > .on').length`), 9);
    await click(page, cell);
    await settled(page);
    assert.equal(await page.evaluate(`!!document.querySelector('dialog.beeson-table-picker')`), false);
    const edited = await placed(page);
    assert.ok(edited.includes(`\n  ${THREE}\n`), `the table is not written:\n${edited.slice(edited.indexOf('Equations'), edited.indexOf('Equations') + 1600)}`);
    assert.equal(without(edited, THREE), page.source);
    assert.deepEqual(await focusCell(page), [0, 0]);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Insert Table');
    // the bars of the table are shown around it, with column A and row 1 marked
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-table-bars .bar > .on')].map((d) => d.textContent)`), ['A', '1']);
    await roundTrip(page);
  });

  test(`the keys of the Insert Table grid choose a size, and Escape closes it (${platform})`, async (t) => {
    const page = await open(platform);
    t.after(() => page.close?.());
    await show(page, EQUATIONS);
    await page.evaluate(`window.BeesonEditor.exec('insert.table')`);
    await page.waitFor(`!!document.querySelector('dialog.beeson-table-picker[open]')`);
    await press(page, 'Escape');
    assert.equal(await page.evaluate(`!!document.querySelector('dialog.beeson-table-picker')`), false);
    assert.equal(await render(page), page.source);
    await page.evaluate(`window.BeesonEditor.exec('insert.table')`);
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowLeft']) await press(page, key);
    assert.equal(await page.evaluate(`document.querySelector('.beeson-table-picker .size').textContent`), '1 × 4 Table');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await settled(page);
    const table = '<table>\n    <tbody>\n      <tr><th></th><th></th></tr>\n      <tr><td></td><td></td></tr>\n      <tr><td></td><td></td></tr>\n      <tr><td></td><td></td></tr>\n    </tbody>\n  </table>';
    assert.equal(without(await placed(page), table), page.source);
    await roundTrip(page);
  });

  test(`Tab and Shift+Tab go between the cells, and Tab in the last cell writes a new row (${platform})`, async (t) => {
    const page = await open(platform, LAYOUTS_DECK);
    t.after(() => page.close?.());
    await show(page, '.reveal .slides table');
    await click(page, cellSelector(0, 0));
    assert.deepEqual(await focusCell(page), [0, 0]);
    await press(page, 'Tab');
    assert.deepEqual(await focusCell(page), [0, 1]);
    assert.equal(await selected(page), 'Period');
    await press(page, 'Tab');
    assert.deepEqual(await focusCell(page), [1, 0]);
    assert.equal(await selected(page), 'Lyapunov');
    await press(page, 'Shift+Tab');
    assert.deepEqual(await focusCell(page), [0, 1]);
    await press(page, 'Shift+Tab');
    await press(page, 'Shift+Tab');
    assert.deepEqual(await focusCell(page), [0, 0], 'Shift+Tab in the first cell leaves it');
    assert.equal(await render(page), page.source);
    await click(page, cellSelector(2, 0));
    await press(page, 'Tab');
    assert.deepEqual(await focusCell(page), [2, 1]);
    await press(page, 'Tab');
    await settle(page);
    assert.deepEqual(await focusCell(page), [3, 0]);
    await byteExact(page, [[layoutTable(LAYOUT_ROWS), layoutTable([...LAYOUT_ROWS, '<tr><td></td><td></td></tr>'])]]);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Add Row');
    // the text typed into the new row is a second entry, and both are undone to the deck
    await type(page, 'Axial');
    await settle(page);
    await byteExact(page, [[layoutTable(LAYOUT_ROWS), layoutTable([...LAYOUT_ROWS, '<tr><td>Axial</td><td></td></tr>'])]]);
    await roundTrip(page, 2);
  });

  test(`an arrow key at the edge of a cell goes to the cell beside it (${platform})`, async (t) => {
    const page = await open(platform, LAYOUTS_DECK);
    t.after(() => page.close?.());
    await show(page, '.reveal .slides table');
    // the cells of the header row hold text, and those of the second column math
    await click(page, cellSelector(0, 0));
    await press(page, 'End');
    await press(page, 'ArrowLeft');
    assert.deepEqual(await focusCell(page), [0, 0], 'an arrow inside the text moves the caret');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    assert.deepEqual(await focusCell(page), [0, 1]);
    await press(page, 'ArrowLeft');
    assert.deepEqual(await focusCell(page), [0, 0]);
    await press(page, 'ArrowDown');
    assert.deepEqual(await focusCell(page), [1, 0]);
    await press(page, 'ArrowUp');
    assert.deepEqual(await focusCell(page), [0, 0]);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    assert.deepEqual(await focusCell(page), [2, 0]);
    await press(page, 'ArrowDown');
    assert.deepEqual(await focusCell(page), [2, 0], 'Down in the last row stays in the table');
    assert.equal(await render(page), page.source);
    assert.deepEqual(errors(page), []);
  });

  test(`rows and columns are added and deleted at the cell of the caret, one entry each (${platform})`, async (t) => {
    const table = layoutTable(LAYOUT_ROWS);
    const steps = [
      // a row above the header row is a header row, and a row below it is a row of td
      [0, 1, 'table.rowAbove', [`<tr><th></th><th></th></tr>`, ...LAYOUT_ROWS], [0, 1]],
      [0, 1, 'table.rowBelow', [LAYOUT_ROWS[0], '<tr><td></td><td></td></tr>', ...LAYOUT_ROWS.slice(1)], [1, 1]],
      [1, 0, 'table.columnBefore', ['<tr><th></th><th>Family</th><th>Period</th></tr>', '<tr><td></td><td>Lyapunov</td><td>\\(2.69\\)</td></tr>', '<tr class="fragment" data-fragment-index="1"><td></td><td>Halo</td><td>\\(3.41\\)</td></tr>'], [1, 0]],
      [1, 1, 'table.columnAfter', ['<tr><th>Family</th><th>Period</th><th></th></tr>', '<tr><td>Lyapunov</td><td>\\(2.69\\)</td><td></td></tr>', '<tr class="fragment" data-fragment-index="1"><td>Halo</td><td>\\(3.41\\)</td><td></td></tr>'], [1, 2]],
      [1, 0, 'table.deleteRow', [LAYOUT_ROWS[0], LAYOUT_ROWS[2]], [1, 0]],
      [2, 1, 'table.deleteColumn', ['<tr><th>Family</th></tr>', '<tr><td>Lyapunov</td></tr>', '<tr class="fragment" data-fragment-index="1"><td>Halo</td></tr>'], [2, 0]],
    ];
    for (const [r, c, id, rows, focus] of steps) {
      const page = await open(platform, LAYOUTS_DECK);
      await show(page, '.reveal .slides table');
      await click(page, cellSelector(r, c));
      assert.equal(await page.evaluate(`window.BeesonEditor.state(${js(id)}).enabled`), true, id);
      await page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
      await settle(page);
      await byteExact(page, [[table, layoutTable(rows)]]);
      assert.deepEqual(await focusCell(page), focus, `the caret after ${id}`);
      await roundTrip(page);
      // a page left open behind the next one is drawn slowly
      await page.close();
    }
  });

  // as in Keynote, Option with an arrow adds a row or a column while the cell is selected as a block,
  // after Esc in its text, and the new cell is then the selected block
  test(`the keys of the rows and columns add and delete them at the cell selected as a block (${platform})`, async (t) => {
    const page = await open(platform, LAYOUTS_DECK);
    t.after(() => page.close?.());
    const table = layoutTable(LAYOUT_ROWS);
    const empty = '<tr><td></td><td></td></tr>';
    const marked = () => page.evaluate(`[...document.querySelectorAll('.beeson-table-bars .bar > .on')].map((d) => d.textContent)`);
    const range = () => page.evaluate(`!!document.querySelector('.beeson-table-bars .cell.range:not([hidden])')`);
    await show(page, '.reveal .slides table');
    await click(page, cellSelector(1, 0));
    // on a Mac the text of a cell takes the keys, which add nothing there. on Windows and Linux they
    // act in the text too, as test/editor-table.test.mjs checks
    if (platform === 'mac') {
      await press(page, 'Alt+ArrowDown');
      await press(page, 'Alt+ArrowUp');
      await settle(page);
      assert.equal(await render(page), page.source);
    }
    assert.equal(await range(), false);
    await press(page, 'Escape');
    await settle(page);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('table.rowBelow').enabled`), true);
    assert.equal(await focusCell(page), null);
    assert.deepEqual(await marked(), ['A', '2']);
    assert.equal(await range(), true);
    await press(page, 'Alt+ArrowDown');
    await settle(page);
    assert.deepEqual(await marked(), ['A', '3']);
    await press(page, 'Alt+ArrowDown');
    await settle(page);
    await byteExact(page, [[table, layoutTable([LAYOUT_ROWS[0], LAYOUT_ROWS[1], empty, empty, LAYOUT_ROWS[2]])]]);
    assert.deepEqual(await marked(), ['A', '4']);
    assert.equal(await focusCell(page), null, 'the new cell is selected as a block, not its text');
    assert.equal(await range(), true);
    await press(page, 'Alt+ArrowUp');
    await settle(page);
    await byteExact(page, [[table, layoutTable([LAYOUT_ROWS[0], LAYOUT_ROWS[1], empty, empty, empty, LAYOUT_ROWS[2]])]]);
    assert.deepEqual(await marked(), ['A', '4']);
    for (let i = 0; i < 3; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    // the undo removed the cell selected as a block, hence it is selected again
    await click(page, cellSelector(1, 0));
    await press(page, 'Escape');
    await press(page, 'Alt+ArrowRight');
    await settle(page);
    await byteExact(page, [[table, layoutTable(['<tr><th>Family</th><th></th><th>Period</th></tr>', '<tr><td>Lyapunov</td><td></td><td>\\(2.69\\)</td></tr>', '<tr class="fragment" data-fragment-index="1"><td>Halo</td><td></td><td>\\(3.41\\)</td></tr>'])]]);
    assert.deepEqual(await marked(), ['B', '2']);
    await press(page, 'Alt+ArrowLeft');
    await settle(page);
    assert.deepEqual(await marked(), ['B', '2']);
    assert.equal(await page.evaluate(`document.querySelector('.reveal section.present table').rows[0].cells.length`), 4);
    if (platform === 'mac') {
      await press(page, 'Ctrl+Mod+Backspace');
      await press(page, 'Ctrl+Mod+Backspace');
      await settle(page);
      await byteExact(page);
      await press(page, 'Mod+Alt+Backspace');
      await settle(page);
      await byteExact(page, [[table, layoutTable([LAYOUT_ROWS[0], LAYOUT_ROWS[2]])]]);
      assert.deepEqual(await marked(), ['B', '2']);
      await page.evaluate('window.BeesonEditor.undo()');
    } else {
      await page.evaluate('window.BeesonEditor.undo()');
      await page.evaluate('window.BeesonEditor.undo()');
    }
    await byteExact(page);
    // a click puts the caret into the text of a cell again, where the keys add nothing on a Mac
    await click(page, cellSelector(0, 0));
    if (platform === 'mac') {
      await press(page, 'Alt+ArrowDown');
      await settle(page);
      assert.equal(await render(page), page.source);
    }
    // a row added with a key is one entry, undone byte for byte and saved without problems
    await press(page, 'Escape');
    await press(page, 'Alt+ArrowDown');
    await settle(page);
    const edited = await render(page);
    assert.ok(edited.includes(layoutTable([LAYOUT_ROWS[0], empty, ...LAYOUT_ROWS.slice(1)])));
    await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `table-keys-${platform}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
  });

  test(`Header Row and Numbers at the Right are switches of the table (${platform})`, async (t) => {
    let page = await open(platform, LAYOUTS_DECK);
    t.after(() => page.close?.());
    const table = layoutTable(LAYOUT_ROWS);
    await show(page, '.reveal .slides table');
    await click(page, cellSelector(1, 1));
    assert.equal(await page.evaluate(`window.BeesonEditor.state('table.header').checked`), true);
    await page.evaluate(`window.BeesonEditor.exec('table.header')`);
    await settle(page);
    await byteExact(page, [[table, layoutTable(['<tr><td>Family</td><td>Period</td></tr>', ...LAYOUT_ROWS.slice(1)])]]);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('table.header').checked`), false);
    assert.deepEqual(await focusCell(page), [1, 1]);
    await roundTrip(page);
    await page.close();
    page = await open(platform, LAYOUTS_DECK);
    await show(page, '.reveal .slides table');
    await click(page, cellSelector(1, 1));
    // the cells of math are numbers
    assert.equal(await page.evaluate(`window.BeesonEditor.state('table.numbersRight').checked`), false);
    await page.evaluate(`window.BeesonEditor.exec('table.numbersRight')`);
    await settle(page);
    const right = (s) => s.replace(/<(t[dh])>(Period|\\\(\d\.\d\d\\\))</g, '<$1 style="text-align: right">$2<');
    await byteExact(page, [[table, layoutTable(LAYOUT_ROWS.map(right))]]);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('table.numbersRight').checked`), true);
    await roundTrip(page);
  });

  test(`a right-click on a cell opens the menu of the cell, whose items act on it (${platform})`, async (t) => {
    const page = await open(platform, LAYOUTS_DECK);
    t.after(() => page.close?.());
    await show(page, '.reveal .slides table');
    await click(page, cellSelector(1, 0));
    await click(page, cellSelector(2, 1), { button: 'right' });
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu.cell')`);
    const labels = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu.cell .item .label')].map((l) => l.textContent)`);
    for (const label of ['Add Row Above', 'Add Row Below', 'Add Column Before', 'Add Column After', 'Delete Row', 'Delete Column', 'Header Row', 'Delete Table']) {
      assert.ok(labels.some((l) => l.startsWith(label)), `${label} is not in the menu: ${labels.join(', ')}`);
    }
    assert.deepEqual(await focusCell(page), [2, 1]);
    const item = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menu.cell .item')].find((b) => b.querySelector('.label').textContent === 'Delete Row'); const r = b.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, item);
    await settle(page);
    await byteExact(page, [[layoutTable(LAYOUT_ROWS), layoutTable(LAYOUT_ROWS.slice(0, 2))]]);
    await roundTrip(page);
  });

  test(`the Table pane of the inspector shows the cell of the caret and adds a row below it (${platform})`, async (t) => {
    const page = await open(platform, LAYOUTS_DECK);
    t.after(() => page.close?.());
    const panel = '#beeson-edit-panel-format';
    if (!(await page.evaluate(`window.BeesonEditor.state('shell.format').checked`))) await page.evaluate(`window.BeesonEditor.exec('shell.format')`);
    await show(page, '.reveal .slides table');
    await click(page, cellSelector(1, 0));
    await settle(page);
    assert.equal(await page.evaluate(`document.querySelector('${panel} .ed-panes')?.dataset.pane`), 'table');
    assert.equal(await page.evaluate(`document.querySelector('${panel} .ed-note')?.textContent`), '3 rows, 2 columns, cell A2');
    const below = await page.evaluate(`(() => { const r = document.querySelector('${panel} button[title^="Add Row Below"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, below);
    await settle(page);
    await byteExact(page, [[layoutTable(LAYOUT_ROWS), layoutTable([LAYOUT_ROWS[0], LAYOUT_ROWS[1], '<tr><td></td><td></td></tr>', LAYOUT_ROWS[2]])]]);
    assert.deepEqual(await focusCell(page), [2, 0]);
    assert.equal(await page.evaluate(`document.querySelector('${panel} .ed-note')?.textContent`), '4 rows, 2 columns, cell A3');
    await roundTrip(page);
  });

  test(`a paste of tab-separated text onto the slide writes a table, numbers at the right (${platform})`, async (t) => {
    const page = await open(platform);
    t.after(() => page.close?.());
    await show(page, EQUATIONS);
    assert.equal(await page.evaluate('window.BeesonEditor.status().problems.length'), 0);
    await paste(page, { 'text/plain': 'Family\tPeriod\nLyapunov\t2.69\nHalo\t3.41\n' });
    await settled(page);
    const table = '<table>\n    <tbody>\n      <tr><th>Family</th><th style="text-align: right">Period</th></tr>\n      <tr><td>Lyapunov</td><td style="text-align: right">2.69</td></tr>\n      <tr><td>Halo</td><td style="text-align: right">3.41</td></tr>\n    </tbody>\n  </table>';
    const edited = await placed(page);
    assert.ok(edited.includes(table), `the table is not written:\n${edited.slice(edited.indexOf('Equations'), edited.indexOf('Equations') + 1600)}`);
    assert.equal(without(edited, table), page.source);
    // the new table is selected, and its bars are shown without a cell marked
    assert.equal(await page.evaluate(`window.BeesonEditor.state('table.delete').enabled`), true);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-table-bars:not([hidden]) .bar > div')].length`), 5);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Paste');
    await roundTrip(page);
  });

  test(`a paste of lines without a tab is left to the paste of a text (${platform})`, async (t) => {
    const page = await open(platform);
    t.after(() => page.close?.());
    await show(page, EQUATIONS);
    await paste(page, { 'text/plain': 'one\ntwo' });
    await settled(page);
    assert.ok(!(await render(page)).includes('<table>'), 'plain lines are written as a table');
  });

  test(`a paste of an HTML table onto the slide writes its cells (${platform})`, async (t) => {
    const page = await open(platform);
    t.after(() => page.close?.());
    await show(page, EQUATIONS);
    const html = '<meta charset="utf-8"><table style="border:1px"><thead><tr><th>Body</th><th colspan="2">Mass</th></tr></thead><tbody><tr><td>Earth</td><td>5.97</td><td>e24 kg</td></tr><tr><td>Moon <b>&amp;</b> Luna</td><td>0.073</td><td>e24 kg</td></tr></tbody></table>';
    await paste(page, { 'text/html': html, 'text/plain': 'Body\tMass\nEarth\t5.97\te24 kg\nMoon & Luna\t0.073\te24 kg' });
    await settled(page);
    const table = '<table>\n    <tbody>\n      <tr><th>Body</th><th style="text-align: right">Mass</th><th></th></tr>\n      <tr><td>Earth</td><td style="text-align: right">5.97</td><td>e24 kg</td></tr>\n      <tr><td>Moon &amp; Luna</td><td style="text-align: right">0.073</td><td>e24 kg</td></tr>\n    </tbody>\n  </table>';
    assert.equal(without(await placed(page), table), page.source);
    await roundTrip(page);
  });

  test(`a paste of tab-separated text into a cell fills the cells from it on, with rows added (${platform})`, async (t) => {
    const page = await open(platform, LAYOUTS_DECK);
    t.after(() => page.close?.());
    await show(page, '.reveal .slides table');
    await click(page, cellSelector(2, 0));
    await paste(page, { 'text/plain': 'Axial\t4.0\nVertical\t4.4' });
    await settled(page);
    await byteExact(page, [[layoutTable(LAYOUT_ROWS), layoutTable([
      ...LAYOUT_ROWS.slice(0, 2),
      '<tr class="fragment" data-fragment-index="1"><td>Axial</td><td>4.0</td></tr>',
      '<tr><td>Vertical</td><td>4.4</td></tr>',
    ])]]);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Paste');
    await roundTrip(page);
  });
}

// the rows of the table of merged cells of TABLES_DECK, and the table of rows in its indentation
const MERGED_ROWS = [
  '<tr><th>Family</th><th>Period</th><th>Jacobi</th></tr>',
  '<tr><td rowspan="2">Halo</td><td style="text-align: right">14.8</td><td style="text-align: right">3.05</td></tr>',
  '<tr><td style="text-align: right">6.6</td><td style="text-align: right">3.04</td></tr>',
  '<tr><td colspan="2">Distant retrograde</td><td style="text-align: right">2.92</td></tr>',
];
const tbodyTable = (rows) => `<table>\n    <tbody>\n${rows.map((r) => `      ${r}\n`).join('')}    </tbody>\n  </table>`;
const R = '<td style="text-align: right">';

// the cells were counted with colspan only, hence a row or a column added at a cell next to a
// rowspan was written with a cell too many, or at the wrong column
for (const platform of ['mac', 'other']) {
  test(`a row added in a table with a rowspan grows the rowspan and gets a cell less (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 0);
    await click(page, cellSelector(1, 1));
    await page.evaluate(`window.BeesonEditor.exec('table.rowBelow')`);
    await settle(page);
    await byteExact(page, [[tbodyTable(MERGED_ROWS), tbodyTable([
      MERGED_ROWS[0],
      MERGED_ROWS[1].replace('rowspan="2"', 'rowspan="3"'),
      `<tr>${R}</td>${R}</td></tr>`,
      ...MERGED_ROWS.slice(2),
    ])]]);
    await roundTrip(page);
  });

  test(`a column added in a table with a rowspan is put at its column in each row (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 0);
    // the cell 6.6 is the first cell of its row and in the second column
    await click(page, cellSelector(2, 0));
    await page.evaluate(`window.BeesonEditor.exec('table.columnAfter')`);
    await settle(page);
    await byteExact(page, [[tbodyTable(MERGED_ROWS), tbodyTable([
      '<tr><th>Family</th><th>Period</th><th></th><th>Jacobi</th></tr>',
      `<tr><td rowspan="2">Halo</td>${R}14.8</td><td></td>${R}3.05</td></tr>`,
      `<tr>${R}6.6</td><td></td>${R}3.04</td></tr>`,
      `<tr><td colspan="2">Distant retrograde</td><td></td>${R}2.92</td></tr>`,
    ])]]);
    await roundTrip(page);
  });
}

// the letters of the columns and the numbers of the rows marked in the bars, whether the outline is
// drawn as cells selected as a block, and the cell of the caret
const marked = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-table-bars .bar > .on')].map((d) => d.textContent)`);
const asRange = (page) => page.evaluate(`!!document.querySelector('.beeson-table-bars .cell.range:not([hidden])')`);

const PLAIN_ROWS = [
  '<tr><th>Body</th><th>Mass ratio</th><th>System</th></tr>',
  '<tr><td>Moon</td><td>\\(0.01215\\)</td><td>Earth and Moon</td></tr>',
  '<tr><td>Europa</td><td>2.53e-5</td><td>Jupiter</td></tr>',
  '<tr><td>Titan</td><td>2.37e-4</td><td>Saturn</td></tr>',
];

for (const platform of ['mac', 'other']) {
  test(`a drag across cells and a Shift-click select a range of cells, which the keys move and extend (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    const from = await at(page, cellSelector(1, 0));
    const to = await at(page, cellSelector(2, 1));
    await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
    await settle(page);
    assert.deepEqual(await marked(page), ['A', 'B', '2', '3']);
    assert.ok(await asRange(page));
    assert.equal(await focusCell(page), null);
    assert.equal(await selected(page), '');
    await click(page, cellSelector(3, 2), { modifiers: 'Shift' });
    await settle(page);
    assert.deepEqual(await marked(page), ['A', 'B', 'C', '2', '3', '4']);
    await press(page, 'Shift+ArrowLeft');
    await settle(page);
    assert.deepEqual(await marked(page), ['A', 'B', '2', '3', '4']);
    await press(page, 'Shift+ArrowUp');
    await press(page, 'Shift+ArrowUp');
    await settle(page);
    assert.deepEqual(await marked(page), ['A', 'B', '2']);
    // an arrow selects the one cell beside the focus, and stops at the edge of the table
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await settle(page);
    assert.deepEqual(await marked(page), ['C', '2']);
    await press(page, 'ArrowRight');
    await settle(page);
    assert.deepEqual(await marked(page), ['C', '2'], 'the arrow moved the table');
    assert.equal(await render(page), page.source);
    // Return puts the caret into the focus
    await press(page, 'Enter');
    await settle(page);
    assert.deepEqual(await focusCell(page), [1, 2]);
    // a Shift-click from the caret selects the cells between
    await click(page, cellSelector(3, 0), { modifiers: 'Shift' });
    await settle(page);
    assert.deepEqual(await marked(page), ['A', 'B', 'C', '2', '3', '4']);
    assert.equal(await focusCell(page), null);
    // a click into a cell puts the caret there again
    await click(page, cellSelector(2, 0));
    await settle(page);
    assert.deepEqual(await focusCell(page), [2, 0]);
    assert.ok(!(await asRange(page)));
    assert.deepEqual(errors(page), []);
  });

  test(`a range of cells grows over a merged cell, and Select Row and Select Column select its lines (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 0);
    // from 6.6 down to Distant retrograde, which takes in Halo above it
    const from = await at(page, cellSelector(2, 0));
    const to = await at(page, cellSelector(3, 0));
    await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
    await settle(page);
    assert.deepEqual(await marked(page), ['A', 'B', '2', '3', '4']);
    await click(page, cellSelector(1, 1));
    await page.evaluate(`window.BeesonEditor.exec('table.selectColumn')`);
    await settle(page);
    assert.deepEqual(await marked(page), ['A', 'B', '1', '2', '3', '4']);
    await click(page, cellSelector(2, 1));
    await page.evaluate(`window.BeesonEditor.exec('table.selectRow')`);
    await settle(page);
    assert.deepEqual(await marked(page), ['A', 'B', 'C', '2', '3']);
    // the menu of a cell in the range keeps the range, and its rows are added below it
    await click(page, cellSelector(2, 1), { button: 'right' });
    await settle(page);
    assert.deepEqual(await marked(page), ['A', 'B', 'C', '2', '3']);
    const items = await page.evaluate(`[...document.querySelectorAll('[role=menu][aria-label="cell menu"] [role=menuitem]')].map((r) => r.textContent)`);
    assert.ok(items.some((s) => s.startsWith('Select Row')) && items.some((s) => s.startsWith('Select Column')), items.join());
    await press(page, 'Escape');
    assert.deepEqual(errors(page), []);
  });

  test(`Delete clears the text of the cells selected as a block (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    await click(page, cellSelector(2, 1));
    await page.evaluate(`window.BeesonEditor.exec('table.selectColumn')`);
    await settle(page);
    await press(page, 'Backspace');
    await settled(page);
    await byteExact(page, [[tbodyTable(PLAIN_ROWS), tbodyTable(PLAIN_ROWS.map((r) => r.replace(/(<t[dh]>[^<]*<\/t[dh]>)<t([dh])>[^<]*<\/t[dh]>/, '$1<t$2></t$2>')))]]);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Clear Cells');
    assert.equal(await page.evaluate('document.querySelectorAll(".reveal section.present table").length'), 1);
    await roundTrip(page);
  });
}

// a drag from one cell of the current slide to another, by row and column
async function dragCells(page, [r0, c0], [r1, c1]) {
  const from = await at(page, cellSelector(r0, c0));
  const to = await at(page, cellSelector(r1, c1));
  await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
  await settle(page);
}

for (const platform of ['mac', 'other']) {
  test(`Merge Cells writes the range as one cell with a colspan and a rowspan and the text of each cell on a line (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    // Moon and the formula above Europa and 2.53e-5
    await dragCells(page, [1, 0], [2, 1]);
    assert.equal((await page.evaluate(`window.BeesonEditor.state('table.unmerge')`)).enabled, false);
    if (platform === 'mac') await press(page, 'Ctrl+Mod+M');
    else await page.evaluate(`window.BeesonEditor.exec('table.merge')`);
    await settled(page);
    await byteExact(page, [[tbodyTable(PLAIN_ROWS), tbodyTable([
      PLAIN_ROWS[0],
      '<tr><td colspan="2" rowspan="2">Moon<br>\\(0.01215\\)<br>Europa<br>2.53e-5</td><td>Earth and Moon</td></tr>',
      '<tr><td>Jupiter</td></tr>',
      PLAIN_ROWS[3],
    ])]]);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Merge Cells');
    // the merged cell stays selected as a block, and is the range of Unmerge Cells
    assert.deepEqual(await marked(page), ['A', 'B', '2', '3']);
    assert.ok(await asRange(page));
    assert.equal(await page.evaluate(`document.querySelector('.reveal section.present td[rowspan] mjx-container') !== null`), true);
    await roundTrip(page);
  });

  test(`Unmerge Cells splits each merged cell of the range into empty cells of its tag and alignment (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 0);
    // the column of Halo grows over Distant retrograde, which reaches into the second column
    await click(page, cellSelector(1, 0));
    await page.evaluate(`window.BeesonEditor.exec('table.selectColumn')`);
    await settle(page);
    assert.equal((await page.evaluate(`window.BeesonEditor.state('table.unmerge')`)).enabled, true);
    await page.evaluate(`window.BeesonEditor.exec('table.unmerge')`);
    await settled(page);
    await byteExact(page, [[tbodyTable(MERGED_ROWS), tbodyTable([
      MERGED_ROWS[0],
      `<tr><td>Halo</td>${R}14.8</td>${R}3.05</td></tr>`,
      `<tr><td></td>${R}6.6</td>${R}3.04</td></tr>`,
      `<tr><td>Distant retrograde</td><td></td>${R}2.92</td></tr>`,
    ])]]);
    assert.deepEqual(await marked(page), ['A', 'B', '1', '2', '3', '4']);
    assert.equal((await page.evaluate(`window.BeesonEditor.state('table.unmerge')`)).enabled, false);
    await roundTrip(page);
  });

  test(`a merged cell of an aligned column keeps its style, and a row left empty is taken out (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 0);
    // 14.8 and 3.05 over 6.6 and 3.04: the second row is then empty and taken out, and Halo with it
    // a row shorter
    await dragCells(page, [1, 1], [2, 1]);
    await page.evaluate(`window.BeesonEditor.exec('table.merge')`);
    await settled(page);
    await byteExact(page, [[tbodyTable(MERGED_ROWS), tbodyTable([
      MERGED_ROWS[0],
      `<tr><td>Halo</td><td style="text-align: right" colspan="2">14.8<br>3.05<br>6.6<br>3.04</td></tr>`,
      MERGED_ROWS[3],
    ])]]);
    await roundTrip(page);
  });

  test(`a merged cell of a header row is a th (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 0);
    // Period and Jacobi of the header row are one th
    await dragCells(page, [0, 1], [0, 2]);
    await page.evaluate(`window.BeesonEditor.exec('table.merge')`);
    await settled(page);
    await byteExact(page, [[tbodyTable(MERGED_ROWS), tbodyTable(['<tr><th>Family</th><th colspan="2">Period<br>Jacobi</th></tr>', ...MERGED_ROWS.slice(1)])]]);
    await roundTrip(page);
  });
}

// the widths of the content of the cells of the first row of the current slide in slide px, their
// widths in the layout, and the scale of the slide on the screen
const firstRow = (page) => page.evaluate(`(() => {
  const table = document.querySelector('.reveal section.present table');
  const cells = [...table.rows[0].cells];
  return {
    content: cells.map((c) => parseFloat(getComputedStyle(c).width)),
    outer: cells.map((c) => c.offsetWidth),
    table: table.offsetWidth,
    scale: table.getBoundingClientRect().width / table.offsetWidth,
  };
})()`);
// the widths in px written into the style of the cells of the first row of the plain table
const writtenWidths = (text) => {
  const m = text.match(/<tr><th(?: style="width: (\d+)px")?>Body<\/th><th(?: style="width: (\d+)px")?>Mass ratio<\/th><th(?: style="width: (\d+)px")?>System<\/th><\/tr>/);
  assert.ok(m, 'the first row of the plain table is not in the text');
  return m.slice(1).map((w) => (w === undefined ? null : Number(w)));
};
const withWidths = (widths) => PLAIN_ROWS.with(0, `<tr>${['Body', 'Mass ratio', 'System'].map((name, i) => (widths[i] === null ? `<th>${name}</th>` : `<th style="width: ${widths[i]}px">${name}</th>`)).join('')}</tr>`);
const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1.5, `${what}: ${a} is not ${b}`);

for (const platform of ['mac', 'other']) {
  test(`a drag of the border of two columns writes the widths of both into the cells of the first row (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    await click(page, cellSelector(2, 0));
    await settle(page);
    const before = await firstRow(page);
    await drag(page, '.beeson-table-bars .grip[data-grip="0"]', { dx: 20 });
    await settle(page);
    const text = await render(page);
    const [a, b, c] = writtenWidths(text);
    near(a, before.content[0] + 20 / before.scale, 'the left column');
    near(b, before.content[1] - 20 / before.scale, 'the right column');
    assert.equal(c, null);
    await byteExact(page, [[tbodyTable(PLAIN_ROWS), tbodyTable(withWidths([a, b, null]))]]);
    near((await firstRow(page)).table, before.table, 'the table');
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Resize Column');
    // the caret stays in its cell
    assert.deepEqual(await focusCell(page), [2, 0]);
    await roundTrip(page);
  });

  test(`a drag of a border stops where the words of a column leave it no narrower (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    await click(page, cellSelector(2, 0));
    await settle(page);
    const before = await firstRow(page);
    await drag(page, '.beeson-table-bars .grip[data-grip="0"]', { dx: 400 });
    await settle(page);
    const [a, b] = writtenWidths(await render(page));
    near((await firstRow(page)).table, before.table, 'the table');
    assert.ok(a > before.content[0] && b < before.content[1] && b >= 24, `${a} ${b}`);
    await roundTrip(page);
  });

  test(`a drag of the last border widens the last column, and Resize Column to Fit Content sets it on one line (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    await click(page, cellSelector(1, 2));
    await settle(page);
    const lines = () => page.evaluate(`(() => {
      const r = document.createRange();
      r.selectNodeContents(document.querySelector(${js(cellSelector(1, 2))}));
      return new Set([...r.getClientRects()].map((b) => Math.round(b.top))).size;
    })()`);
    assert.equal(await lines(), 1);
    const before = await firstRow(page);
    await drag(page, '.beeson-table-bars .grip[data-grip="2"]', { dx: -before.content[2] * before.scale * 0.6 });
    await settle(page);
    assert.ok(await lines() > 1, 'Earth and Moon is on one line in a narrow column');
    await page.evaluate(`window.BeesonEditor.exec('table.fitColumn')`);
    await settle(page);
    assert.equal(await lines(), 1);
    const [a, b, c] = writtenWidths(await render(page));
    assert.deepEqual([a, b], [null, null]);
    near(c, before.content[2], 'the fitted column');
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Resize Column to Fit Content');
    await roundTrip(page, 2);
  });

  test(`Distribute Columns Evenly makes the columns as wide as each other in the same width (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    await click(page, cellSelector(2, 0));
    const before = await firstRow(page);
    await page.evaluate(`window.BeesonEditor.exec('table.distributeColumns')`);
    await settle(page);
    const after = await firstRow(page);
    const each = before.outer.reduce((x, y) => x + y) / 3;
    for (const [i, w] of after.outer.entries()) near(w, each, `the column ${i}`);
    near(after.table, before.table, 'the table');
    assert.ok(writtenWidths(await render(page)).every((w) => w !== null));
    await roundTrip(page);
  });

  test(`Distribute Columns Evenly in a range of two columns keeps the third (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    const before = await firstRow(page);
    await dragCells(page, [2, 1], [3, 2]);
    await page.evaluate(`window.BeesonEditor.exec('table.distributeColumns')`);
    await settle(page);
    const after = await firstRow(page);
    near(after.outer[1], (before.outer[1] + before.outer[2]) / 2, 'the column B');
    near(after.outer[2], (before.outer[1] + before.outer[2]) / 2, 'the column C');
    near(after.outer[0], before.outer[0], 'the column A');
    assert.equal(writtenWidths(await render(page))[0], null);
    assert.ok(await asRange(page));
    await roundTrip(page);
  });
}

for (const platform of ['mac', 'other']) {
  const autoAlign = (page) => (platform === 'mac' ? press(page, 'Alt+Mod+U') : page.evaluate(`window.BeesonEditor.exec('table.autoAlign')`));

  test(`Auto-Align sets a column of numbers at the right in the style of its cells (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    await click(page, cellSelector(2, 0));
    await autoAlign(page);
    await settle(page);
    const right = (r) => r.replace(/<(t[dh])>((?:\\\(0\.01215\\\)|2\.53e-5|2\.37e-4|Mass ratio))</, '<$1 style="text-align: right">$2<');
    await byteExact(page, [[tbodyTable(PLAIN_ROWS), tbodyTable(PLAIN_ROWS.map(right))]]);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Auto-Align');
    assert.equal((await page.evaluate(`window.BeesonEditor.state('table.autoAlign')`)).enabled, false);
    await roundTrip(page);
  });

  test(`Auto-Align in a range sets only the cells of the range (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 1);
    // Europa and Titan with their numbers and systems
    await dragCells(page, [2, 0], [3, 2]);
    assert.deepEqual(await marked(page), ['A', 'B', 'C', '3', '4']);
    await autoAlign(page);
    await settle(page);
    await byteExact(page, [[tbodyTable(PLAIN_ROWS), tbodyTable([
      ...PLAIN_ROWS.slice(0, 2),
      '<tr><td>Europa</td><td style="text-align: right">2.53e-5</td><td>Jupiter</td></tr>',
      '<tr><td>Titan</td><td style="text-align: right">2.37e-4</td><td>Saturn</td></tr>',
    ])]]);
    assert.ok(await asRange(page));
    await roundTrip(page);
  });

  test(`Auto-Align sets a word at the right at the left again, as the theme sets a text (${platform})`, async (t) => {
    const page = await open(platform, TABLES_DECK);
    t.after(() => page.close?.());
    await show(page, 2);
    await click(page, cellSelector(2, 0));
    await autoAlign(page);
    await settle(page);
    await byteExact(page, [[
      '<tr><th>Orbit</th><th>Period</th></tr>\n      <tr><td style="text-align: right">Halo</td><td>14.8</td></tr>\n      <tr><td>Lyapunov</td><td>2.69</td></tr>',
      `<tr><th>Orbit</th><th style="text-align: right">Period</th></tr>\n      <tr><td>Halo</td>${R}14.8</td></tr>\n      <tr><td>Lyapunov</td>${R}2.69</td></tr>`,
    ]]);
    await roundTrip(page);
  });
}

// regression tests of tables, media, and locked elements, on either platform with trusted input:
// a table inserted under the list of a full slide, the width of the Table pane, the text of merged
// cells, the controls of a locked element, and Capture Poster on a video of a deck opened from a
// file. after each edit the text is in the scope rule, an undo gives the file byte for byte, a
// redo gives the edit, and a save is opened again without problems
describe('the Table pane, merged cells, and locked controls', () => {
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const PANEL = '#beeson-edit-panel-format';
  // the index of the slide "Figures are first class citizens, too" of index.html, whose list ends
  // above the bottom of its figure
  const FIGURES = 4;

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

  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const js = (v) => JSON.stringify(v);
  const settle = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(window.BeesonEditor.status()))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

  // the editor on a deck served over HTTP, with the Format tab shown, in a window of size
  async function open(platform, { deck = 'test-deck.html', size } = {}) {
    const page = await browser.newPage(size);
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(status.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    return page;
  }

  async function show(page, h) {
    await page.evaluate(`Reveal.slide(${h})`);
    await sleep(150);
    await settle(page);
  }

  // the box of the first shown element of selector in CSS px of the viewport, or null
  const boxOf = (page, selector) => page.evaluate(`(() => {
  const el = [...document.querySelectorAll(${js(selector)})].find((e) => e.getClientRects().length);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
})()`);

  // the box of the text of the element of selector, without the white space of its box
  const inkOf = (page, selector) => page.evaluate(`(() => {
  const range = document.createRange();
  range.selectNodeContents(document.querySelector(${js(selector)}));
  const r = range.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
})()`);

  const inside = (a, b, what) => {
    const slack = 0.5;
    assert.ok(a.left >= b.left - slack && a.top >= b.top - slack && a.right <= b.right + slack && a.bottom <= b.bottom + slack, `${what}: ${js(a)} is not inside ${js(b)}`);
  };
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  let saves = 0;
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the edit did not change the text');
    const added = textProblems(edited, THEME);
    for (const p of textProblems(page.source, THEME)) if (added.includes(p)) added.splice(added.indexOf(p), 1);
    assert.deepEqual(added, [], 'the edit is out of the scope rule');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    assert.equal((await settle(page)).undo, false, `the edit is more than ${undos} entries of the history`);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r5-4-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  // the window of the pictures of round 2 on the Mac, and a window of 1920 by 1080 elsewhere
  const SIZES = { mac: { width: 1600, height: 1000 }, other: { width: 1920, height: 1080 } };

  // state table-inserted of round 2: the table was put into the flow under the list, which its
  // translate moves down, hence the bar of the columns covered the last line of the list, and the
  // rows and the button Add Row ran past the bottom of the slide. a table of 2 rows fits under the
  // list, and one of 3 rows is moved up over it, as tested in editor-table.test.mjs
  for (const platform of ['mac', 'other']) {
    test(`a table inserted under the list of a full slide is put in its free space, with its controls in the canvas (${platform})`, async (t) => {
      const page = await open(platform, { size: SIZES[platform] });
      t.after(() => page.close?.());
      await show(page, FIGURES);
      const li = '.reveal section.present ul > li:last-child';
      await clickText(page, li);
      await press(page, 'Escape');
      await exec(page, 'insert.table', { rows: 2, columns: 3 });
      await sleep(100);
      await settle(page);
      const slide = await boxOf(page, '.reveal section.present');
      const stage = await boxOf(page, '.beeson-edit-canvas');
      const table = await boxOf(page, '.reveal section.present table');
      const ink = await inkOf(page, li);
      const cols = await boxOf(page, '.beeson-table-bars .bar.cols');
      const figure = await boxOf(page, '.reveal section.present figure.figure-box');
      assert.ok(cols.top >= ink.bottom - 0.5, `the bar of the columns at ${cols.top} covers the list, whose text ends at ${ink.bottom}`);
      assert.ok(!meets(table, figure), 'the table covers the figure');
      inside(table, slide, 'the table');
      for (const name of ['Add Row', 'Add Column', 'Select Table']) inside(await boxOf(page, `.beeson-table-bars .round[title="${name}"]`), stage, name);
      assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Insert Table');
      const edited = await roundTrip(page);
      assert.match(edited, /<table style="translate: 0px \d+px">/);
    });
  }

  // the controls of the Format tab that reach past the right edge of the inspector, with their text
  const overflowing = (page) => page.evaluate(`(() => {
  const panel = document.querySelector('${PANEL}');
  const edge = panel.getBoundingClientRect().right - (panel.offsetWidth - panel.clientWidth);
  return [...panel.querySelectorAll('button, input, label, .ed-seg')]
    .filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > edge + 0.5)
    .map((el) => el.textContent.trim() || el.getAttribute('aria-label') || el.localName);
})()`);

  // states inspector-table and inspector-table-dark of round 2: the row Size of the Table pane put
  // Distribute Evenly and Fit to Content beside its label, and Fit to Content was cut off at the
  // right edge of the inspector
  for (const platform of ['mac', 'other']) {
    test(`every control of the Table pane fits the width of the inspector (${platform})`, async (t) => {
      const page = await open(platform, { size: SIZES[platform] });
      t.after(() => page.close?.());
      await show(page, FIGURES);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await sleep(100);
      await settle(page);
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane`), 'table');
      assert.deepEqual(await overflowing(page), []);
      for (const id of ['table.distributeColumns', 'table.fitColumn']) {
        assert.equal(await page.evaluate(`document.querySelectorAll('${PANEL} [data-command="${id}"]').length`), 1, id);
      }
    });
  }

  // the deck of tables of the table tests: a table with a rowspan and a colspan on its first slide,
  // a table of mass ratios on its second, and a first column set at the right in its first row on
  // its third
  const TABLES_DECK = 'test/pages/editor-tables.html';
  const cellSelector = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;
  const centerOf = (page, selector) => boxOf(page, selector).then((b) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 }));

  async function dragCells(page, [r0, c0], [r1, c1]) {
    const from = await centerOf(page, cellSelector(r0, c0));
    const to = await centerOf(page, cellSelector(r1, c1));
    await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
    await settle(page);
  }

  // the lines of the text of the cell of selector on the page, from the tops of its line boxes
  const linesOf = (page, selector) => page.evaluate(`(() => {
  const range = document.createRange();
  range.selectNodeContents(document.querySelector(${js(selector)}));
  return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
})()`);

  // state table-merged of round 2: Merge Cells joined the text of the cells with spaces on one line,
  // where PowerPoint and Keynote keep the text of each cell on a line of its own
  for (const platform of ['mac', 'other']) {
    test(`Merge Cells keeps the text of each cell on a line of its own, in the order of reading (${platform})`, async (t) => {
      const page = await open(platform, { deck: TABLES_DECK });
      t.after(() => page.close?.());
      await show(page, 1);
      // Moon and the formula above Europa and 2.53e-5
      await dragCells(page, [1, 0], [2, 1]);
      if (platform === 'mac') await press(page, 'Ctrl+Mod+M');
      else await exec(page, 'table.merge');
      await sleep(120);
      await settle(page);
      await byteExact(page, [[
        '<tr><td>Moon</td><td>\\(0.01215\\)</td><td>Earth and Moon</td></tr>\n      <tr><td>Europa</td><td>2.53e-5</td><td>Jupiter</td></tr>',
        '<tr><td colspan="2" rowspan="2">Moon<br>\\(0.01215\\)<br>Europa<br>2.53e-5</td><td>Earth and Moon</td></tr>\n      <tr><td>Jupiter</td></tr>',
      ]]);
      assert.equal(await linesOf(page, '.reveal section.present td[rowspan]'), 4);
      assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.reveal section.present td[rowspan]')).textAlign`), 'left');
      await roundTrip(page);
    });

    test(`a merged cell keeps the alignment of its first cell (${platform})`, async (t) => {
      const page = await open(platform, { deck: TABLES_DECK });
      t.after(() => page.close?.());
      await show(page, 2);
      // Halo, set at the right, above Lyapunov, set at the left
      await dragCells(page, [1, 0], [2, 0]);
      await exec(page, 'table.merge');
      await sleep(120);
      await settle(page);
      await byteExact(page, [[
        '<tr><td style="text-align: right">Halo</td><td>14.8</td></tr>\n      <tr><td>Lyapunov</td><td>2.69</td></tr>',
        '<tr><td style="text-align: right" rowspan="2">Halo<br>Lyapunov</td><td>14.8</td></tr>\n      <tr><td>2.69</td></tr>',
      ]]);
      assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.reveal section.present td[rowspan]')).textAlign`), 'right');
      await roundTrip(page);
    });
  }

  // the controls of the Format tab other than its tabs, as text, command, and whether each is enabled
  const controls = (page) => page.evaluate(`[...document.querySelectorAll('${PANEL} :is(button, input, textarea, select)')]
  .filter((e) => e.getAttribute('role') !== 'tab' && e.getClientRects().length)
  .map((e) => ({ name: e.textContent.trim() || e.getAttribute('aria-label') || e.name || e.type, command: e.dataset.command ?? null, on: !e.disabled }))`);

  // the items of the open menu, as their text without the keys, and whether each is enabled
  const menuItems = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu [role^=menuitem]')]
  .map((e) => ({ text: e.textContent.trim(), on: e.getAttribute('aria-disabled') !== 'true' }))`);

  // the commands that change a figure, which a lock turns off
  const CHANGES = [
    'media.replace', 'figure.alt', 'figure.decorative', 'figure.whiteFigure', 'figure.invert', 'figure.mode.dark', 'image.editMask', 'image.crop',
    'edit.cut', 'element.delete', 'selection.editText', 'arrange.align.left', 'arrange.order.back', 'arrange.flipHorizontal', 'arrange.nudge.left',
    'arrange.group', 'steps.add',
  ];
  // the items of the context menu of a locked figure that do not change it
  const KEPT = ['Copy', 'Paste', 'Duplicate', 'Save as Picture…', 'Unlock'];

  // state locked-element of round 2: a figure locked with Lock kept Replace and the other controls
  // of the Image pane, the align, flip, and order buttons of the Arrange pane, and the items of its
  // context menu enabled, where Keynote turns off every control of a locked object but Unlock
  for (const platform of ['mac', 'other']) {
    test(`a locked figure cannot be changed from the inspector, the menus, or its context menu until it is unlocked (${platform})`, async (t) => {
      const page = await open(platform, { size: SIZES[platform] });
      t.after(() => page.close?.());
      await show(page, FIGURES);
      const figure = '.reveal section.present figure.figure-box img';
      await selectFigure(page, figure);
      await settle(page);
      assert.equal((await state(page, 'media.replace')).enabled, true);
      await press(page, 'Mod+L');
      await settle(page);
      assert.equal(await page.evaluate(`document.querySelector('.reveal section.present figure.figure-box').hasAttribute('data-locked')`), true);
      assert.equal((await state(page, 'arrange.unlock')).enabled, true);
      assert.equal((await state(page, 'edit.copy')).enabled, true);
      for (const id of CHANGES) assert.equal((await state(page, id)).enabled, false, `${id} is enabled on a locked figure`);
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane`), 'image');
      assert.deepEqual((await controls(page)).filter((c) => c.on), [], 'the Image pane has enabled controls');
      await clickText(page, `${PANEL} [role=tab]:last-child`);
      await settle(page);
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane`), 'arrange');
      assert.deepEqual((await controls(page)).filter((c) => c.on).map((c) => c.command), ['arrange.unlock'], 'the Arrange pane has enabled controls other than Unlock');
      await click(page, figure, { button: 'right' });
      await settle(page);
      const on = (await menuItems(page)).filter((i) => i.on).map((i) => i.text);
      assert.ok(on.some((text) => text.startsWith('Unlock')), 'Unlock is not in the context menu');
      assert.deepEqual(on.filter((text) => !KEPT.some((k) => text.startsWith(k))), [], 'the context menu has enabled items that change the figure');
      await press(page, 'Escape');
      const edited = await roundTrip(page);
      assert.match(edited, /<figure class="figure-box" data-locked>/);
      // Unlock gives the controls back, on the figure selected again after the open of the save
      await clickText(page, figure);
      await settle(page);
      assert.equal((await state(page, 'media.replace')).enabled, false);
      await press(page, platform === 'mac' ? 'Mod+Alt+L' : 'Mod+Shift+L');
      await settle(page);
      assert.equal(await page.evaluate(`document.querySelector('.reveal section.present figure.figure-box').hasAttribute('data-locked')`), false);
      for (const id of ['media.replace', 'figure.whiteFigure', 'arrange.align.left', 'edit.cut']) assert.equal((await state(page, id)).enabled, true, `${id} is off after Unlock`);
      assert.ok((await controls(page)).filter((c) => c.on).length > 10, 'the Arrange pane is still off after Unlock');
    });
  }

  // the text of a locked block was still typed into after a double click, where Keynote keeps the
  // text of a locked object as it is until an unlock
  const LEAD = '<p>Design the complete slide first, then break it up into steps. Direct the viewer\'s attention.</p>';
  for (const platform of ['mac', 'other']) {
    test(`the text of a locked block is not changed by typing until it is unlocked (${platform})`, async (t) => {
      const page = await open(platform);
      t.after(() => page.close());
      await show(page, 2);
      const lead = '.reveal section.present > p';
      await clickText(page, lead);
      await press(page, 'Escape');
      await press(page, 'Mod+L');
      await settle(page);
      const locked = page.source.replace(LEAD, LEAD.replace('<p>', '<p data-locked>'));
      assert.equal(await render(page), locked);
      await click(page, lead, { count: 2 });
      await type(page, 'XYZ');
      for (const key of ['Backspace', 'Delete', 'Enter']) await press(page, key);
      await press(page, 'Escape');
      await settle(page);
      const typed = await render(page);
      assert.ok(typed === locked, `the text of the locked block was changed: ${typed.match(/<p data-locked>.*<\/p>/)?.[0]}`);
      await clickText(page, lead);
      await press(page, platform === 'mac' ? 'Mod+Alt+L' : 'Mod+Shift+L');
      await settle(page);
      await byteExact(page);
      await click(page, lead, { count: 2 });
      await type(page, 'XYZ');
      await settle(page);
      assert.match(await render(page), /XYZ/, 'the unlocked block cannot be typed into');
      assert.deepEqual(errors(page), []);
    });
  }

  // the lock cancelled the beforeinput of Enter, but the typing of text/typing.ts still broke the
  // line of the locked block by hand
  test('Enter and Shift+Enter at a caret in a locked block do not break its line', async (t) => {
    const page = await open('other');
    t.after(() => page.close());
    await show(page, 2);
    const lead = '.reveal section.present > p';
    await clickText(page, lead);
    await press(page, 'Escape');
    await press(page, 'Mod+L');
    await settle(page);
    const locked = await render(page);
    assert.ok(locked.includes(LEAD.replace('<p>', '<p data-locked>')));
    await click(page, lead, { count: 2 });
    // a collapsed caret at the end of the word chosen by the double click
    await page.evaluate('getSelection().collapseToEnd()');
    for (const key of ['Enter', 'Shift+Enter']) await press(page, key);
    await press(page, 'Escape');
    await settle(page);
    const typed = await render(page);
    assert.ok(typed === locked, `the line of the locked block was broken: ${typed.match(/<p data-locked>.*?<\/p>/s)?.[0]}`);
    assert.deepEqual(errors(page), []);
  });

  // the index of the slide "Embedding videos" of index.html, with a video for each mode
  const VIDEOS = 10;
  const clipOf = (mode) => `<video class="for-${mode}" src="demo/clip-${mode}.mp4" poster="demo/clip-${mode}.png" muted loop data-autoplay></video>`;

  // a trusted click on the button of the Format tab with the text name
  async function tap(page, name) {
    const at = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('${PANEL} button')].find((b) => b.textContent.trim() === ${js(name)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the inspector does not have a button ${name}`);
    await clickText(page, at);
  }

  // the file at path given to the open file chooser of the editor, as a person picks it
  async function choose(page, path) {
    await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
    const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
    await page.send('DOM.setFileInputFiles', { files: [path], objectId: result.objectId });
  }

  const ASK = 'dialog.beeson-edit-dialog.beeson-poster-ask[open]';

  // state video-capture-poster of round 2: in a deck opened from a file, the page has an origin of
  // its own, which the video of the folder does not share, hence the browser kept the frames of the
  // video from the page, and Capture Poster failed with a message in the title bar
  for (const platform of ['mac', 'other']) {
    test(`Capture Poster on a video of a deck opened from a file asks once for its file and writes its first frame (${platform})`, async (t) => {
      const page = await editorPage(browser, { query: `edit&still&edit-platform=${platform}` });
      t.after(() => page.close?.());
      assert.match(await page.evaluate('location.protocol'), /^file:$/);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await show(page, VIDEOS);
      // the video of the mode of the slide, and its file
      const mode = await page.evaluate(`[...document.querySelectorAll('.reveal section.present video')].find((v) => v.getClientRects().length && v.getBoundingClientRect().width).classList.contains('for-dark') ? 'dark' : 'light'`);
      const video = `.reveal section.present video.for-${mode}`;
      const clip = `clip-${mode}`;
      await clickText(page, video);
      await settle(page);
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane`), 'video');
      const button = await page.evaluate(`[...document.querySelectorAll('${PANEL} [data-command="media.poster"]')].map((b) => [b.textContent.trim(), b.title])[0]`);
      const before = (await page.evaluate('window.BeesonEditor.status()')).message;
      await click(page, `${PANEL} [data-command="media.poster"]`);
      const asked = await page.waitFor(`!!document.querySelector(${js(ASK)}) || window.BeesonEditor.status().message !== ${js(before)}`, 8000).then(() => page.evaluate(`document.querySelector(${js(ASK)})?.textContent ?? null`));
      assert.ok(asked, `Capture Poster did not ask for the file: ${(await page.evaluate('window.BeesonEditor.status()')).message}`);
      assert.ok(asked.includes(`${clip}.mp4`), asked);
      // the button says that it asks for the file
      assert.equal(button[0], 'Capture Poster…');
      assert.match(button[1], /asked once for the file/);
      // a chooser opened by a trusted click is cancelled at once in headless Chrome unless the
      // protocol intercepts it, and the input then keeps waiting for its files
      await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
      await clickText(page, `${ASK} button.primary`);
      await choose(page, resolve(`demo/${clip}.mp4`));
      await page.waitFor(`window.BeesonEditor.render().includes('poster="media/${clip}.png"')`);
      const captured = page.source.replace(clipOf(mode), clipOf(mode).replace(`poster="demo/${clip}.png"`, `poster="media/${clip}.png"`));
      assert.equal(await render(page), captured);
      assert.doesNotMatch((await page.evaluate('window.BeesonEditor.status()')).message ?? '', /cannot/);
      assert.deepEqual(textProblems(captured, THEME).filter((p) => !textProblems(page.source, THEME).includes(p)), []);
      await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);
      await page.evaluate('window.BeesonEditor.redo()');
      assert.equal(await render(page), captured);
      // a second capture reads the file chosen before, without asking again
      await page.evaluate('window.BeesonEditor.undo()');
      await clickText(page, video);
      await settle(page);
      await tap(page, 'Capture Poster');
      await page.waitFor(`window.BeesonEditor.render().includes('poster="media/${clip}')`);
      assert.equal(await page.evaluate(`!!document.querySelector(${js(ASK)})`), false);
      assert.deepEqual(errors(page), []);
    });
  }
});

// tests of R7.8 on both platforms with trusted input: every row of a new table kept, a placeholder
// with icons in an empty figure box that is drawn by the editor only, a mask resized by its handles, and
// a sort of the rows of a table. after each edit the text is checked byte for byte, after an undo
// and a redo, and after a save and an open
describe('rows of a new table, and Sort', () => {
  const DECK = 'test-deck.html';
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const PLATFORMS = ['mac', 'other'];
  // the window of the pictures of round 3 on the Mac, and a window of 1920 by 1080 elsewhere
  const SIZES = { mac: { width: 1600, height: 1000 }, other: { width: 1920, height: 1080 } };
  // the index of the slide "Figures are first class citizens, too" of index.html, whose list ends
  // near the bottom of the slide, beside its figure
  const FIGURES = 4;
  // the deck of tables of the table tests, with a table with a rowspan on its first slide and a
  // plain table of mass ratios on its second
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const rect = (page, selector) => page.evaluate(`(() => { const e = [...document.querySelectorAll(${js(selector)})].find((e) => e.getBoundingClientRect().width); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  // the editor on slide n of a deck served over HTTP, with the Format tab shown
  async function load(t, platform, { deck = DECK, n = 0 } = {}) {
    const page = await browser.newPage(SIZES[platform]);
    t.after(() => page.close().catch(() => {}));
    // the file chooser of the browser is given its files by the test, as in editor-media.test.mjs
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

  // roundTrip checks the edited text, the text before byte for byte after an undo, the edited text
  // after a redo, and an open of the saved text without problems. it returns the edited text
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
    assert.deepEqual(errors(page), []);
    page.source = saved.text;
    return text;
  }

  const count = (text, re) => (text.match(re) ?? []).length;

  // states 23, 49, 93, and 157 of round 3: a table of 3 by 3 cells chosen in the grid was inserted
  // with 2 rows, since the row that did not fit under the list was taken out
  for (const platform of PLATFORMS) {
    test(`a table of 3 by 3 cells chosen in the grid is inserted with its 3 rows, on the slide (${platform})`, async (t) => {
      const page = await load(t, platform, { n: FIGURES });
      const rows = count(page.source, /<tr>/g);
      await click(page, '.reveal section.present ul > li:last-child');
      await press(page, 'Escape');
      await click(page, '.beeson-edit-top [data-command="insert.table"]');
      await page.waitFor(`!!document.querySelector('dialog.beeson-table-picker[open]')`);
      // the cell of the third row and the third column of the grid of 10 columns
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
      // a table that does not fit beside the figure is put at the center of the slide with a fill
      const center = Math.abs((table.left + table.right - slide.left - slide.right) / 2) < 3;
      const fill = await page.evaluate(`getComputedStyle(document.querySelector('.reveal section.present table')).backgroundColor`);
      assert.ok(!meets(table, figure) || (center && !/^rgba\(.*, 0\)$|^transparent$/.test(fill)), 'the table covers the figure off the center of the slide, or without a fill');
      assert.equal(await undoLabel(page), 'Undo Insert Table');
      const edited = await roundTrip(page);
      assert.equal(count(edited, /<tr>/g), rows + 3);
    });
  }

  // the center of the item labeled label of the open menus, or null
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
    // rows with equal keys keep their order
    assert.deepEqual(sortOrder(['x', 'y', 'x']), [0, 2, 1]);
  });

  // state 95 of round 3: the menu of a cell did not sort the rows of its table. Keynote sorts the
  // body rows by a column from the menu of the column
  for (const platform of PLATFORMS) {
    test(`Sort Descending in the menu of a cell reorders the body rows by its column, as one entry (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: TABLES, n: 1 });
      await click(page, cellOf(2, 1));
      await frames(page);
      await click(page, cellOf(2, 1), { button: 'right' });
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu.cell')`);
      const item = await itemAt(page, 'Sort Descending');
      assert.ok(item, 'the menu of the cell does not offer Sort Descending');
      await click(page, item);
      await frames(page);
      // 0.01215, 2.37e-4, and 2.53e-5, with the formula read as its number
      await byteExact(page, [[plainRows([0, 1, 2]), plainRows([0, 2, 1])]]);
      assert.equal(await undoLabel(page), 'Undo Sort Descending');
      await roundTrip(page);
    });

    test(`Sort Ascending in the Table pane reorders the body rows by the column of the caret (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: TABLES, n: 1 });
      await click(page, cellOf(1, 0));
      await frames(page);
      const button = await rect(page, `${PANEL} [data-command="table.sortAscending"]`);
      assert.ok(button, 'the Table pane does not have Sort Ascending');
      await click(page, button);
      await frames(page);
      // Europa, Moon, and Titan
      await byteExact(page, [[plainRows([0, 1, 2]), plainRows([1, 0, 2])]]);
      assert.equal(await undoLabel(page), 'Undo Sort Ascending');
      // the caret is kept in its cell, which is moved with its row
      assert.equal(await page.evaluate('document.activeElement.textContent'), 'Moon');
      await roundTrip(page);
      // a sort of rows already in order is not an entry of the history, which the open of the saved
      // text emptied
      await click(page, cellOf(1, 0));
      await exec(page, 'table.sortAscending');
      assert.equal(await render(page), page.source);
      assert.equal((await state(page, 'edit.undo')).enabled, false);
    });

    test(`Sort is dimmed for a table with a cell over two rows (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: TABLES, n: 0 });
      await click(page, cellOf(3, 1));
      await frames(page);
      assert.equal((await state(page, 'table.sortAscending')).enabled, false);
      assert.equal((await state(page, 'table.sortDescending')).enabled, false);
    });
  }

  // the deck of empty figure boxes: a split slide and a content slide with an empty figure box each, and a figure
  // slide with an empty plate
  const EMPTY = 'test/pages/editor-empty-figure-box.html';
  const PLACEHOLDER = '.reveal section.present .beeson-placeholder';
  const shownPlaceholders = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present .beeson-placeholder')].filter((p) => p.getBoundingClientRect().width > 0).length`);
  const buttonOf = (page, label) => rect(page, `${PLACEHOLDER} button[aria-label="${label}"]`);

  // state 98 of round 3: an empty figure box was drawn as nothing until a file was dragged over it, where
  // PowerPoint draws a content placeholder with icons that insert into it
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
        // the icons are at the center of the slot
        const icon = await buttonOf(page, 'Insert Table');
        assert.ok(icon.x > slot.left + slot.width / 4 && icon.x < slot.right - slot.width / 4, 'the icons are not at the center of the slot');
        // the placeholder does not have text, since a slot with text is not empty
        assert.equal(await page.evaluate(`document.querySelector('${PLACEHOLDER}').textContent`), '');
      }
      // a thumbnail of the navigator does not draw the placeholder
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
      assert.deepEqual(errors(page), []);
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
      // the cell of the second row and the second column of the grid of 10 columns
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
      // the entry is named as every insert, and the item of the Insert menu keeps its own label
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
      // a save of a new file asks for the folder of the deck, which editor-media.test.mjs stubs, hence
      // the text is opened again without a save
      assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(edited)})`)).problems, []);
      assert.deepEqual(errors(page), []);
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
      assert.deepEqual(errors(page), []);
    });
  }

  // the deck of layouts of the mask tests, whose slide 3 has a dark image of 1200 by 1440 px in a
  // figure box of 600 by 800 px
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const IMG = '.reveal section.present figure.figure-box img.for-dark';
  const BAR = 'dialog.beeson-mask-bar';
  const written = async (page) => (await render(page)).match(/<img class="for-dark"[^>]*?(?: style="([^"]*)")?>/)[1] ?? null;
  const handlesShown = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-mask-window i')].filter((i) => getComputedStyle(i).display !== 'none').length`);
  const pressed = (page) => page.evaluate(`[...document.querySelectorAll('${BAR} .modes button')].map((b) => b.title + ' ' + b.getAttribute('aria-pressed'))`);
  const handleAt = (page, name) => rect(page, `.beeson-mask-window i[data-handle=${name}]`);

  // the pixels of a PNG written by Chrome, with 8 bits per channel and without interlace, as in
  // editor-formula.test.mjs
  function decodePng(png) {
    let at = 8, width = 0, channels = 4;
    const data = [];
    while (at < png.length) {
      const length = png.readUInt32BE(at), kind = png.toString('ascii', at + 4, at + 8), body = png.subarray(at + 8, at + 8 + length);
      if (kind === 'IHDR') ({ width, channels } = { width: body.readUInt32BE(0), channels: body[9] === 6 ? 4 : 3 });
      if (kind === 'IDAT') data.push(body);
      at += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(data)), stride = width * channels, height = raw.length / (stride + 1), px = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? px[y * stride + x - channels] : 0, b = y ? px[(y - 1) * stride + x] : 0;
        const c = x >= channels && y ? px[(y - 1) * stride + x - channels] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        px[y * stride + x] = raw[y * (stride + 1) + 1 + x] + [0, a, b, (a + b) >> 1, paeth][filter];
      }
    }
    return px;
  }

  // the mean difference of two captures of the same size, per channel
  function differ(a, b) {
    const [x, y] = [decodePng(a), decodePng(b)];
    assert.equal(x.length, y.length);
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
    return sum / x.length;
  }

  // the box of the image on the screen without its scale, inset by 12 px past the selection frame
  const insetBox = (page) => page.evaluate(`(() => {
  const el = document.querySelector(${js(IMG)}), k = Reveal.getScale(), r = el.getBoundingClientRect();
  const w = el.offsetWidth * k, h = el.offsetHeight * k;
  return { x: Math.round(r.left + r.width / 2 - w / 2 + 12), y: Math.round(r.top + r.height / 2 - h / 2 + 12), width: Math.round(w - 24), height: Math.round(h - 24), scale: 1 };
})()`);

  // the picture of the image after an edit captured inside its new box, and the same place after an
  // undo, which differ by the resampling of the scaled picture only, i.e. less than the place shifted
  // by 1 px in any direction. the edit is redone after the check
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

  // state 138 of round 3: the frame of Edit Mask was drawn with eight handles that did not resize it,
  // where Keynote resizes the mask with them and keeps the picture in place
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
      // the mask is written on both images of the pair of a dark and a light figure
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
      // Esc leaves the image as it was
      await press(page, 'Escape');
      assert.equal(await written(page), null);
      assert.equal(await render(page), page.source);
      // Reset puts the box back, and Done then does not write anything
      await editMask(page);
      await drag(page, await handleAt(page, 'e'), { dx: -100, dy: 0 });
      await click(page, `${BAR} button[title="The picture as it was before this edit"]`);
      await click(page, `${BAR} button.done`);
      assert.equal(await render(page), page.source);
      assert.equal(await page.evaluate(`document.querySelector(${js(IMG)}).getAttribute('style')`), null);
      // a box made smaller is moved over the picture by a drag inside it
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
      // Reset Mask takes the zoom and the place of the picture off, and keeps object-fit contain, without
      // which the theme stretches the picture to the box
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

// regression tests of R9.5, the tables, on both platforms with trusted input. a table is selected
// as an object by the Esc ladder of Keynote, by Select Table, and by its move handle, and is then
// moved, resized in width, and deleted as any element. after each edit the text is checked byte for
// byte, after an undo and a redo, and after a save and an open
describe('a table selected as an object', () => {
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const middle = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
  let saves = 0;

  // the editor on a deck served over HTTP in a window of 1600 by 1000 px, on the slide n
  async function load(t, platform, { deck = 'test-deck.html', n = 0, mode = 'light' } = {}) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
    const url = `${server.origin}/${deck}?edit&still&theme=${mode}&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // roundTrip checks the text before byte for byte after undos undos, the edit after as many redos,
  // and an open of the saved edit without problems, which is the text before the next check
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r9-5-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  // newTable adds a slide with a table of 3 by 3 cells and the caret in its first cell, as the audit
  // makes it, and keeps the text of the file after it as the text before the next check
  async function newTable(page) {
    await exec(page, 'slide.new');
    await frames(page);
    await exec(page, 'insert.table', { rows: 3, columns: 3 });
    await frames(page);
    page.source = await render(page);
  }

  const PANE_NOTE = `document.querySelector('#beeson-edit-panel-format .ed-note')?.textContent ?? ''`;
  const cellOf = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;

  // what is selected of the table of the current slide: the table as an object, the cells as a
  // block, or a text, with the frame, the grips, and the rotate handle drawn, and its box on the
  // screen and its translate
  const TABLE = `(() => {
  const table = document.querySelector('.reveal section.present table');
  const shown = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const sel = window.BeesonEditor.selection();
  const bars = document.querySelector('.beeson-table-bars');
  const outline = bars?.querySelector('.cell');
  const frame = [...document.querySelectorAll('.beeson-overlay .beeson-frame.selected')].find(shown);
  const grips = {};
  for (const g of document.querySelectorAll('.beeson-grip')) if (shown(g)) grips[g.dataset.handle] = box(g);
  return {
    table: !!table,
    object: sel.length === 1 && sel[0] === table,
    none: sel.length === 0 && !document.activeElement?.closest('td, th'),
    block: shown(outline) && outline.classList.contains('range'),
    caret: !!document.activeElement?.closest('td, th'),
    frame: frame ? box(frame) : null,
    grips,
    rotor: shown(document.querySelector('.beeson-rotor')),
    box: table ? box(table) : null,
    translate: table ? (table.style.translate || '0px 0px').split(' ').map(parseFloat) : null,
  };
})()`;

  // isObject asserts that the table is selected as an object, with its frame and without a cell
  // selected, and returns what TABLE reads
  async function isObject(page, what) {
    const s = await page.evaluate(TABLE);
    assert.ok(s.object, `the table is not the selection ${what}`);
    assert.ok(!s.block, `a cell of the table is still selected as a block ${what}`);
    assert.ok(!s.caret, `the caret is still in a cell ${what}`);
    assert.ok(s.frame, `the table is not framed ${what}`);
    assert.doesNotMatch(await page.evaluate(PANE_NOTE), /cells? [A-Z]/, `the Table pane names a cell ${what}`);
    return s;
  }

  // finding select-move-resize-3: Esc from a cell selected as a block cleared the selection, and
  // Select Table and the move handle left the cell selected, hence an arrow key moved the cell
  for (const platform of PLATFORMS) {
    test(`Esc goes from the text of a cell to the cell, to the table as an object, and to nothing (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await newTable(page);
      let s = await page.evaluate(TABLE);
      assert.ok(s.caret, 'the caret is not in the new table');
      await press(page, 'Escape');
      await frames(page);
      s = await page.evaluate(TABLE);
      assert.ok(s.block, 'the first Esc does not select the cell as a block');
      assert.match(await page.evaluate(PANE_NOTE), /cell A1$/);
      await press(page, 'Escape');
      await frames(page);
      s = await isObject(page, 'after the second Esc');
      assert.ok(!s.rotor, 'a table selected as an object has a rotate handle');
      await press(page, 'Escape');
      await frames(page);
      s = await page.evaluate(TABLE);
      assert.ok(s.none, 'the third Esc does not clear the selection');
      assert.deepEqual(errors(page), []);
    });

    test(`Select Table and the move handle select the table as an object, which the arrow keys move and Delete deletes (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await newTable(page);
      await press(page, 'Escape');
      await frames(page);
      await click(page, '.beeson-table-bars .round[title="Select Table"]');
      await frames(page);
      let s = await isObject(page, 'after a click on Select Table');
      const [x0, y0] = s.translate;
      await press(page, 'ArrowRight');
      await frames(page);
      s = await isObject(page, 'after ArrowRight');
      assert.deepEqual(s.translate, [x0 + 1, y0], 'ArrowRight does not move the table selected as an object');
      assert.match(await render(page), new RegExp(`<table style="translate: ${x0 + 1}px ${y0}px">`));
      await roundTrip(page);

      // the move handle, pressed while a cell is selected as a block
      await click(page, cellOf(1, 1));
      await press(page, 'Escape');
      await frames(page);
      assert.match(await page.evaluate(PANE_NOTE), /cell B2$/);
      await click(page, '.beeson-overlay .beeson-handle');
      await frames(page);
      await isObject(page, 'after a click on the move handle');
      await press(page, 'ArrowDown');
      await frames(page);
      s = await isObject(page, 'after ArrowDown');
      assert.deepEqual(s.translate, [x0 + 1, y0 + 1], 'ArrowDown does not move the table selected as an object');
      for (const id of ['edit.cut', 'edit.copy', 'edit.duplicate', 'arrange.lock', 'element.delete']) {
        assert.equal((await state(page, id)).enabled, true, `${id} is not enabled on the table selected as an object`);
      }
      await press(page, 'Delete');
      await frames(page);
      s = await page.evaluate(TABLE);
      assert.ok(!s.table, 'Delete does not delete the table selected as an object');
      // the nudge down and the delete
      await roundTrip(page, 2);
      assert.deepEqual(errors(page), []);
    });

    test(`the grips at the left and right edges of a table selected as an object set the widths of its columns (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await newTable(page);
      await press(page, 'Escape');
      await press(page, 'Escape');
      await frames(page);
      let s = await isObject(page, 'after two Esc');
      assert.deepEqual(Object.keys(s.grips).sort(), ['e', 'w'], 'a table selected as an object does not have grips at its left and right edges only');
      const right = middle(s.grips.e);
      const left = middle(s.grips.w);
      const mid = (s.box.top + s.box.bottom) / 2;
      assert.ok(Math.abs(right.x - s.box.right) < 4 && Math.abs(right.y - mid) < 4, 'the right grip is not at the middle of the right edge');
      assert.ok(Math.abs(left.x - s.box.left) < 4 && Math.abs(left.y - mid) < 4, 'the left grip is not at the middle of the left edge');
      const was = s.box;
      await drag(page, right, { dx: 90, steps: 12 });
      await frames(page);
      s = await isObject(page, 'after a drag of the right grip');
      assert.ok(Math.abs(s.box.right - was.right - 90) < 4, `the right edge is moved by ${s.box.right - was.right} px for a drag of 90 px`);
      assert.ok(Math.abs(s.box.left - was.left) < 2, 'the left edge is moved by a drag of the right grip');
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Resize Table');
      const widths = [...(await render(page)).matchAll(/<th style="width: (\d+)px">/g)].map((m) => Number(m[1]));
      assert.equal(widths.length, 3, 'the widths are not written into the cells of the first row');
      assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, `the columns are not widened alike: ${widths}`);
      await roundTrip(page);

      // the open of the saved text clears the selection
      await click(page, cellOf(0, 0));
      await press(page, 'Escape');
      await press(page, 'Escape');
      await frames(page);
      const wide = (await isObject(page, 'after the open of the saved text and two Esc')).box;
      await drag(page, middle((await page.evaluate(TABLE)).grips.w), { dx: -60, steps: 12 });
      await frames(page);
      s = await isObject(page, 'after a drag of the left grip');
      assert.ok(Math.abs(wide.left - s.box.left - 60) < 4, `the left edge is moved by ${s.box.left - wide.left} px for a drag of -60 px`);
      assert.ok(Math.abs(s.box.right - wide.right) < 3, 'the right edge is moved by a drag of the left grip');
      await roundTrip(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // what is open of the menus: the labels of the items of the one menu shown, or null
  const MENU = `(() => {
  const m = [...document.querySelectorAll('.beeson-edit-menu')].find((el) => el.getClientRects().length);
  return m ? [...m.querySelectorAll('[role^="menuitem"]')].map((i) => i.textContent.trim()) : null;
})()`;
  const segment = (bar, i) => `.beeson-table-bars .bar.${bar} > [data-index="${i}"]`;

  // finding tables-equations-insert-3: a click on a column letter or a row number opened the menu of
  // the table and moved the caret, and did not select the column or the row
  for (const platform of PLATFORMS) {
    test(`a click on a column letter or a row number selects the column or the row, Shift extends it, and the arrow and a right-click open its menu (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test/pages/editor-tables.html', n: 1 });
      await click(page, cellOf(2, 2));
      await frames(page);
      assert.match(await page.evaluate(PANE_NOTE), /cell C3$/);
      for (const [bar, i, modifiers, range] of [['cols', 1, '', 'B1:B4'], ['cols', 2, 'Shift', 'B1:C4'], ['rows', 3, '', 'A4:C4'], ['rows', 1, 'Shift', 'A2:C4'], ['cols', 0, '', 'A1:A4']]) {
        const what = `after a ${modifiers ? 'Shift-' : ''}click on ${bar === 'cols' ? 'the letter' : 'the number'} ${bar === 'cols' ? 'ABC'[i] : i + 1}`;
        await click(page, segment(bar, i), { modifiers });
        await frames(page);
        assert.equal(await page.evaluate(MENU), null, `a menu is opened ${what}`);
        assert.match(await page.evaluate(PANE_NOTE), new RegExp(`cells ${range}$`), `the cells ${range} are not selected ${what}`);
        assert.ok((await page.evaluate(TABLE)).block, `the cells are not selected as a block ${what}`);
      }
      assert.equal(await render(page), page.source, 'a selection in the bars edits the file');

      // the menu of a column from a right-click and from the arrow of its letter, with the commands
      // of a column
      await click(page, segment('cols', 1), { button: 'right' });
      await frames(page);
      let items = await page.evaluate(MENU);
      assert.ok(items?.some((l) => l.startsWith('Add Column Before')), `a right-click on the letter B does not open the menu of the column: ${js(items)}`);
      assert.ok(!items.some((l) => l.startsWith('Delete Row')), 'the menu of a column offers Delete Row');
      assert.match(await page.evaluate(PANE_NOTE), /cells B1:B4$/);
      await press(page, 'Escape');
      await frames(page);
      await click(page, `${segment('cols', 2)} .more`);
      await frames(page);
      items = await page.evaluate(MENU);
      assert.ok(items?.some((l) => l.startsWith('Delete Column')), `the arrow of the letter C does not open the menu of the column: ${js(items)}`);
      await click(page, await page.evaluate(`(() => { const i = [...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].find((el) => el.textContent.trim().startsWith('Delete Column')); const r = i.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`));
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector('.reveal section.present table tr').cells.length`), 2, 'Delete Column of the menu of the letter C does not delete the column C');
      await roundTrip(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // the box of the move handle, and the boxes of the bars and buttons of the table drawn
  const HANDLE = `(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const h = document.querySelector('.beeson-overlay .beeson-handle');
  const parts = [...document.querySelectorAll('.beeson-table-bars > .bar, .beeson-table-bars > .round')].filter((el) => el.getClientRects().length).map((el) => ({ name: el.title || el.className, ...box(el) }));
  return { handle: h && !h.hidden ? box(h) : null, parts };
})()`;
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  // finding select-move-resize-6: the move handle of a selected table was drawn half under the bar of
  // its row numbers
  for (const platform of PLATFORMS) {
    test(`the move handle of a selected table is drawn clear of its bars, and its drag moves the table (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await newTable(page);
      for (const what of ['with the caret in a cell', 'with a cell selected as a block', 'with the table selected as an object']) {
        if (what !== 'with the caret in a cell') await press(page, 'Escape');
        await frames(page);
        const { handle, parts } = await page.evaluate(HANDLE);
        assert.ok(handle, `the move handle is not drawn ${what}`);
        for (const p of parts) assert.ok(!meets(handle, p), `the move handle at ${js(handle)} is drawn over ${p.name} at ${js(p)} ${what}`);
      }
      const { handle } = await page.evaluate(HANDLE);
      const was = (await page.evaluate(TABLE)).translate;
      await drag(page, middle(handle), { dx: 40, dy: 30, steps: 12 });
      await frames(page);
      const s = await isObject(page, 'after a drag of the move handle');
      assert.ok(s.translate[0] > was[0] + 20 && s.translate[1] > was[1] + 15, `a drag of the move handle does not move the table: ${js(was)} to ${js(s.translate)}`);
      await roundTrip(page);
    });
  }

  // the fields of the counts of rows and columns of the Table pane, with their values, or null
  const COUNTS = `(() => {
  const f = (name) => document.querySelector('#beeson-edit-panel-format #beeson-edit-num-' + name);
  return f('rows') && f('columns') ? { rows: f('rows').value, columns: f('columns').value } : null;
})()`;
  const shape = (page) => page.evaluate(`[...document.querySelector('.reveal section.present table').rows].map((r) => r.cells.length)`);

  // finding tables-equations-insert-8: the Table pane did not have fields for the counts of rows and
  // columns, as the Table tab of Keynote has
  for (const platform of PLATFORMS) {
    test(`the Table pane has fields with steppers for the counts of rows and columns, each change one entry of the history (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test/pages/editor-tables.html', n: 1 });
      await click(page, cellOf(2, 2));
      await frames(page);
      assert.deepEqual(await page.evaluate(COUNTS), { rows: '4', columns: '3' }, 'the Table pane does not show the counts of rows and columns in fields');
      await click(page, '#beeson-edit-panel-format button[aria-label="Increase Rows"]');
      await frames(page);
      assert.deepEqual(await shape(page), [3, 3, 3, 3, 3], 'the stepper of Rows does not add a row at the end');
      assert.deepEqual(await page.evaluate(COUNTS), { rows: '5', columns: '3' });
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Set Row Count');
      await roundTrip(page);

      await click(page, cellOf(1, 0));
      await frames(page);
      await click(page, '#beeson-edit-panel-format #beeson-edit-num-columns');
      // a key with the command modifier sent over the protocol does not run the editing commands of
      // macOS, hence the text of the field is selected by a script
      await page.evaluate(`document.querySelector('#beeson-edit-num-columns').select()`);
      await page.send('Input.insertText', { text: '1' });
      await press(page, 'Enter');
      await frames(page);
      assert.deepEqual(await shape(page), [1, 1, 1, 1, 1], 'a count of 1 typed into Columns does not take out the last two columns');
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Set Column Count');
      await roundTrip(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // the buttons of the insert group of the toolbar, by their command, with true where one is enabled
  const INSERTS = `Object.fromEntries([...document.querySelectorAll('.beeson-edit-top button[data-command^="insert."]')]
  .filter((b) => b.getClientRects().length > 0).map((b) => [b.dataset.command, !b.disabled]))`;
  const TABLE_BUTTON = '.beeson-edit-top button[data-command="insert.table"]';
  const PICKER = `!!document.querySelector('dialog.beeson-table-picker[open]')`;
  const pressed = (page) => page.evaluate(`(() => { const b = document.querySelector(${js(TABLE_BUTTON)}); return { pressed: b.getAttribute('aria-pressed'), expanded: b.getAttribute('aria-expanded') }; })()`);

  // finding tables-equations-insert-10: while the grid of Insert > Table was open, the insert buttons
  // were disabled, and the Table button under its grid was not drawn pressed
  for (const [platform, mode] of [['mac', 'light'], ['other', 'dark']]) {
    test(`the Table button is drawn pressed under its open grid, and the other insert buttons stay enabled (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 6, mode });
      const was = await page.evaluate(INSERTS);
      assert.ok(Object.values(was).filter(Boolean).length >= 4, `the insert buttons are not enabled before the grid opens: ${js(was)}`);
      await click(page, TABLE_BUTTON);
      await page.waitFor(PICKER);
      await frames(page);
      assert.deepEqual(await page.evaluate(INSERTS), was, 'an insert button is disabled while the grid of the Table button is open');
      assert.deepEqual(await pressed(page), { pressed: 'true', expanded: 'true' }, 'the Table button is not drawn pressed under its open grid');

      await press(page, 'Escape');
      await frames(page);
      assert.equal(await page.evaluate(PICKER), false, 'Esc does not close the grid');
      assert.deepEqual(await pressed(page), { pressed: null, expanded: 'false' }, 'the Table button is still pressed after the grid is closed');

      // a second click on the pressed button closes its grid, as a click on another button does
      await click(page, TABLE_BUTTON);
      await page.waitFor(PICKER);
      await click(page, TABLE_BUTTON);
      await frames(page);
      assert.equal(await page.evaluate(PICKER), false, 'a click on the pressed Table button does not close its grid');
      await click(page, TABLE_BUTTON);
      await page.waitFor(PICKER);
      await frames(page);
      await click(page, '.beeson-edit-top button[data-command="insert.text"]');
      await frames(page);
      assert.equal(await page.evaluate(PICKER), false, 'a click on Text does not close the grid');
      await type(page, 'Gap');
      await frames(page);
      assert.match(await render(page), />Gap</, 'a click on Text with the grid open does not insert a text box');
      assert.deepEqual(errors(page), []);
    });
  }

  // finding tables-equations-insert-11: the header option of the Table pane was labeled with the
  // element of HTML it writes, Header row, written as th
  for (const platform of PLATFORMS) {
    test(`the header option of the Table pane reads Header Row, as in the menus (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test/pages/editor-tables.html', n: 1 });
      await click(page, cellOf(2, 2));
      await frames(page);
      const label = await page.evaluate(`document.querySelector('#beeson-edit-panel-format input[data-command="table.header"]')?.parentElement.textContent ?? null`);
      assert.equal(label, 'Header Row', 'the header option of the Table pane is not labeled Header Row');
      assert.deepEqual(errors(page), []);
    });
  }

  // the frame of the cell or the range drawn on the table, and the boxes of the glyphs of the cells
  // with the given texts, which are beside the range
  const BESIDE = (texts) => `(() => {
  const frame = document.querySelector('.beeson-table-bars .cell:not([hidden])')?.getBoundingClientRect();
  const cells = [...document.querySelectorAll('.reveal section.present table :is(td,th)')].filter((c) => ${js(texts)}.includes(c.textContent.trim()));
  const glyphs = cells.flatMap((c) => {
    const r = document.createRange();
    r.selectNodeContents(c);
    return [...r.getClientRects()].filter((b) => b.width > 0).map((b) => ({ text: c.textContent.trim(), left: b.left, top: b.top, right: b.right, bottom: b.bottom }));
  });
  return { frame: frame && { left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom }, glyphs, cells: cells.length };
})()`;
  const OUTSIDE = ['Body', 'Mass ratio', 'System', 'Earth and Moon', 'Jupiter', 'Titan', '2.37e-4', 'Saturn'];

  async function clearOf(page, what) {
    const s = await page.evaluate(BESIDE(OUTSIDE));
    assert.equal(s.cells, OUTSIDE.length);
    assert.ok(s.frame, `the frame is not drawn ${what}`);
    const covered = s.glyphs.filter((g) => meets(g, s.frame)).map((g) => g.text);
    assert.deepEqual(covered, [], `the frame ${what} at ${js(s.frame)} covers the glyphs of ${covered.join(', ')} beside it`);
  }

  // the check of a round of the council: the frame of a range of cells and of a merged cell was drawn
  // outside the cells, over the first glyph of the column after it
  for (const platform of PLATFORMS) {
    test(`the frame of a range of cells and of a merged cell is drawn on their edges, clear of the text beside them (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test/pages/editor-tables.html', n: 1 });
      await click(page, cellOf(1, 0));
      await click(page, cellOf(2, 1), { modifiers: 'Shift' });
      await frames(page);
      assert.match(await page.evaluate(PANE_NOTE), /cells A2:B3/);
      await clearOf(page, 'of the range A2:B3');
      await exec(page, 'table.merge');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector('.reveal section.present table tr:nth-child(2) > td').colSpan`), 2);
      await clearOf(page, 'of the merged cell A2:B3');
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R17.10 on both platforms with trusted keys: Alt with an arrow adds a row or a
// column with the caret in a cell on Windows and Linux, where the text does not use these keys, and
// the caret goes into the new cell. on a Mac, Option with an arrow is left to the text. Alt with Left or
// Right does not reach the browser, which would go back or forward in its history
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);

  // the editor on slide 2 of test/pages/editor-r13-3.html, whose table holds A1 to C4 in 4 rows of
  // 3 cells
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
  // the row and column of the cell of the caret, or null, the cell selected as a range, and the
  // elements selected
  const where = (page) => page.evaluate(`(() => {
  const c = document.activeElement?.closest?.('td, th');
  const at = c ? [[...${TABLE}.rows].indexOf(c.parentElement), [...c.parentElement.cells].indexOf(c)] : null;
  return { at, range: !!document.querySelector('.beeson-table-bars .cell.range:not([hidden])'), selected: window.BeesonEditor.selection().map((e) => e.tagName) };
})()`);

  // the caret at the end of the text of the cell B2, as after a click into it
  async function caretInB2(page) {
    const B2 = `[...${TABLE}.querySelectorAll('td')].find((c) => c.textContent.trim() === 'B2')`;
    const p = await page.evaluate(`(() => { const r = ${B2}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, p);
    await wait(page);
    await page.evaluate(`(() => { const n = ${B2}.firstChild; getSelection().collapse(n, n.length); return true; })()`);
    assert.equal(await page.evaluate(`document.activeElement?.closest('td')?.textContent.trim() ?? null`), 'B2', 'the caret is not in the cell B2');
  }

  // the keys, the size of the table after each, its name in the history, the cell of the caret
  // after it, and the cells of the table after a letter typed at the caret
  const ROWS = [['A1', 'B1', 'C1'], ['A2', 'B2', 'C2'], ['A3', 'B3', 'C3'], ['A4', 'B4', 'C4']];
  const ADDS = [
    ['Alt+ArrowUp', [5, 3], 'Add Row Above', [1, 1], [ROWS[0], ['', 'x', ''], ...ROWS.slice(1)]],
    ['Alt+ArrowDown', [5, 3], 'Add Row Below', [2, 1], [ROWS[0], ROWS[1], ['', 'x', ''], ...ROWS.slice(2)]],
    ['Alt+ArrowLeft', [4, 4], 'Add Column Before', [1, 1], ROWS.map((r, i) => [r[0], i === 1 ? 'x' : '', r[1], r[2]])],
    ['Alt+ArrowRight', [4, 4], 'Add Column After', [1, 2], ROWS.map((r, i) => [r[0], r[1], i === 1 ? 'x' : '', r[2]])],
  ];
  const IDS = { 'Alt+ArrowUp': 'table.rowAbove', 'Alt+ArrowDown': 'table.rowBelow', 'Alt+ArrowLeft': 'table.columnBefore', 'Alt+ArrowRight': 'table.columnAfter' };
  // after the undo of an add with the caret in a cell, from the menu as from a key, the caret is back
  // in the cell B2 (R19.3)
  const UNDONE = { at: [1, 1], range: false, selected: [] };

  // item 1: with the caret in a cell, the keys did nothing on Windows and Linux, although the menu of
  // the cell lists them
  test('Alt with an arrow adds a row or a column with the caret in a cell, as one entry, and the caret goes into the new cell (other)', async (t) => {
    const page = await load(t, 'other');
    for (const [key, shape, label, at, cells] of ADDS) {
      // the place of the caret after the undo of the same command run from the menu
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
      // a letter typed after the key goes into the new cell
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
    // a key added row is saved and opened without a problem
    await caretInB2(page);
    await press(page, 'Alt+ArrowDown');
    await wait(page);
    const added = await render(page);
    const { text } = await saveAndReopen(page, 'r17-10-1.html');
    assert.equal(text, added);
    assert.deepEqual(errors(page), []);
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
    assert.deepEqual(errors(page), []);
  });

  // item 2: Alt with Left or Right is Back or Forward of a browser on Windows and Linux, hence the
  // editor prevents it where it adds a column, with the caret in a cell and with the cell selected
  const watchKeys = (page) => page.evaluate(`(() => { window.__keys = []; addEventListener('keydown', (ev) => { if (ev.altKey) window.__keys.push(ev.key + ' ' + ev.defaultPrevented); }, true); return true; })()`);
  const watched = (page) => page.evaluate('window.__keys.splice(0)');

  for (const platform of PLATFORMS) {
    test(`Alt with Left or Right does not reach the browser where it adds a column (${platform})`, async (t) => {
      const page = await load(t, platform);
      await watchKeys(page);
      // the page is the same document on the same slide, i.e. neither Back nor Forward was taken
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
      // the cell selected as a range by Esc
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
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R13.3 on both platforms with trusted input: the start number of a numbered
// list, drawn by the theme from the attribute start and written with the field Start at of the Text
// pane and by Return on an empty item that cuts a numbered list, and a row or a column of a table
// moved by a drag of its bar and by the commands Move Row Up, Move Row Down, Move Column Left, and
// Move Column Right. after each edit the text is checked byte for byte after an undo, the edit
// again after a redo, and after a save and an open
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  let saves = 0;

  // the editor on slide n of the deck, served over HTTP, with the storage of the origin emptied
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

  // the edit checked against base after an undo, again after a redo, and after a save and an open,
  // whose text becomes page.source
  async function roundTrip(page, base = page.source) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r13-3-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  // the numbers drawn before the items of selector, read from the tree of accessibility of Chrome,
  // in which the counter of a pseudo-element is a text node of the item
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

  // the numbers drawn before the first items of selector once they are expected, since Chrome
  // updates its tree of accessibility after a change of the page, within 3 s
  async function numbersAre(page, selector, expected) {
    let now = [];
    for (const end = Date.now() + 3000; Date.now() < end; await new Promise((d) => setTimeout(d, 100))) {
      now = (await drawnNumbers(page, selector)).slice(0, expected.length);
      if (JSON.stringify(now) === JSON.stringify(expected)) return;
    }
    assert.deepEqual(now, expected);
  }

  // the shown element of selector that holds needle, as an expression
  const find = (selector, needle = '') => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;
  const ITEM = '.reveal section.present ol > li';

  // the client point of the middle of the text needle
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

  // the caret put at the end of the item that holds needle
  const caretAtEnd = (page, needle) => page.evaluate(`(() => {
  const li = ${find(ITEM, needle)};
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) last = n;
  li.closest('[contenteditable="true"]').focus();
  getSelection().collapse(last, last.length);
})()`);

  // the tab of the inspector named name shown, with the Format pane open
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
    assert.equal(attributeProblem('start', false, 'ol', '-2'), 'the attribute start');
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
      // a typed 1 takes the attribute off, which gives the file back
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
      // a list with a start number goes on from it
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

  // the rows of the table of the current slide, as the texts of their cells
  const rowsOf = (page) => page.evaluate(`[...document.querySelector('.reveal section.present table').rows].map((tr) => [...tr.cells].map((c) => c.textContent.trim()).join(' '))`);
  const onSegments = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-table-bars .bar > .on')].map((d) => d.textContent)`);
  const segment = (bar, i) => `.beeson-table-bars .bar.${bar} > [data-index="${i}"]`;
  const middle = async (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const lineShown = (page) => page.evaluate(`(() => { const l = document.querySelector('.beeson-table-bars .drop'); return !!l && !l.hidden && l.getBoundingClientRect().width > 0; })()`);
  const menuLabels = (page) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].map((m) => ({ label: m.querySelector('.label')?.textContent ?? m.textContent.trim(), disabled: m.getAttribute('aria-disabled') === 'true' }))`);
  const cellPoint = (page, text) => pointOf(page, '.reveal section.present td, .reveal section.present th', text);

  // the row or the column of segment i of a bar selected by a click on it, with the caret first put
  // into the cell of text so that the bars are shown
  async function selectLine(page, text, bar, i, shift = false) {
    if (!shift) await click(page, await cellPoint(page, text));
    await frames(page);
    await click(page, await middle(page, segment(bar, i)), { modifiers: shift ? 'Shift' : '' });
    await frames(page);
  }

  // a drag of segment i of a bar by d times the size of the segment, released, or held with hold
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
      // the first row moved down by two takes the widths of the columns off it, which stay on the row
      // that is first now
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
      // with the caret in a cell, the commands move its row or its column
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
      // Move Row Up moves the row past the whole merged block, and a drag into the block is refused
      assert.equal((await state(page, 'table.moveRowUp')).enabled, true, 'Move Row Up of the row under a merged block is dimmed');
      await dragSegment(page, 'rows', 3, -1, true);
      assert.equal(await lineShown(page), false, 'a line is shown inside a merged cell');
      await press(page, 'Escape');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 0, y: 0, button: 'left', clickCount: 1 });
      // the column Period is not moved across the merged cell Halo, and the column Jacobi is moved
      await click(page, await cellPoint(page, '14.8'));
      assert.equal((await state(page, 'table.moveColumnLeft')).enabled, false, 'a column moves across a merged cell');
      assert.equal((await state(page, 'table.moveColumnRight')).enabled, true);
      assert.equal(await render(page), page.source);
    });
  }
});

// regression tests of R15.5 on both platforms with trusted input: a row or a column dragged by its
// bar is lifted and follows the pointer along its axis while the button is held, the file changes
// only at the drop, and Esc puts it back
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  let saves = 0;

  // the editor on slide n of deck, served over HTTP, with the storage of the origin emptied
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

  // the text after an edit checked against page.source after an undo, again after a redo, and after
  // a save and an open of the saved text
  async function roundTrip(page) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), page.source, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r15-5-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
  }

  // the rows of the table of the current slide, as the texts of their cells
  const rowsOf = (page) => page.evaluate(`[...document.querySelector('.reveal section.present table').rows].map((tr) => [...tr.cells].map((c) => c.textContent.trim()).join(' '))`);
  const segment = (bar, i) => `.beeson-table-bars .bar.${bar} > [data-index="${i}"]`;
  const middle = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const lineShown = (page) => page.evaluate(`(() => { const l = document.querySelector('.beeson-table-bars .drop'); return !!l && !l.hidden && l.getBoundingClientRect().width > 0; })()`);
  const box = (page, expr) => page.evaluate(`(() => { const r = (${expr}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const TABLE = `document.querySelector('.reveal section.present table')`;
  const rowBox = (page, r) => box(page, `${TABLE}.rows[${r}]`);
  const cellBox = (page, r, c) => box(page, `${TABLE}.rows[${r}].cells[${c}]`);
  // the box, the words, and the look of the lifted copy of the rows or the columns dragged by their
  // bar, which the editor draws over the table, or null while none is shown
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

  // the row or the column of segment i of a bar selected by a click on it, after a click into the cell
  // of text, which shows the bars
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
      // the row in the table stays, and the file is not changed during the drag
      assert.deepEqual(await rowBox(page, 1), row);
      assert.equal(await page.evaluate(`getComputedStyle(${TABLE}.rows[1]).transform`), 'none');
      assert.equal(await render(page), page.source, 'the file changes during the drag');
      assert.equal(await undoLabel(page), before);
      // the lifted row follows the pointer further down
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
      // the move of 40 px across the axis is not followed
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
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R17.4 on both platforms with trusted input: the drop line of a drag by a bar
// drawn over the lifted copy, a range of body cells pasted onto a slide as body cells, by the key
// and by Paste of the Edit menu, a key pressed during a drag by a bar, and a move of rows in a
// table with a merged cell
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  let saves = 0;

  // the editor on slide n of deck, served over HTTP, with the storage of the origin emptied
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

  // the edit checked against base after an undo, again after a redo, and after a save and an open
  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r17-4-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
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

  // the row i selected by a click into the cell named cell and a click on its bar, and pressed on
  // its bar and moved by k heights of the row with the button held. the point of the pointer is
  // returned
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

  // the pixels of a screenshot at the points, read back in the page
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

  // N43: the drop line of a drag by a bar was drawn under the lifted copy at 85 percent opacity, at
  // a contrast of about 1.1 to 1 in dark mode and 1.2 to 1 in light mode
  for (const platform of PLATFORMS) {
    for (const theme of ['dark', 'light']) {
      test(`the drop line of a row dragged by its bar is drawn over the lifted copy, in ${theme} mode (${platform})`, async (t) => {
        const page = await load(t, platform, BARS, 1, theme);
        // 1.4 rows down, the gap is after row 3 and under the copy
        const m = await pressRow(page, 'A2', 1, 1.4);
        const drop = await shown(page, DROP);
        const lift = await shown(page, LIFT);
        assert.ok(drop && lift, `the drag does not show the copy and the line: ${js({ drop, lift })}`);
        assert.ok(drop.y > lift.y && drop.y + drop.h < lift.y + lift.h, `the line is not under the copy: ${js({ drop, lift })}`);
        const x = drop.x + drop.w * 0.25;
        const [line, above] = await pixels(page, [[x, drop.y + drop.h / 2], [x, drop.y - 6]]);
        const ratio = contrast(line, above);
        assert.ok(ratio >= 3, `the drop line reads ${line} against ${above} beside it, a contrast of ${ratio.toFixed(2)} to 1`);
        await press(page, 'Escape');
        await pointer(page, 'mouseReleased', m.x, m.y);
        await wait(page);
        assert.equal(await render(page), page.source);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the cells of slide 2 of test/pages/editor-tables.html at row r and column c of its table
  const at = (page, r, c) => page.evaluate(`(() => { const t = Reveal.getCurrentSlide().querySelector('table'); const b = t.rows[${r}].cells[${c}].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);

  // the body cells Moon to 2.53e-5 of slide 2 selected as a block and copied by a trusted Mod+C,
  // with the data that the copy wrote
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

  // the new table of a paste of the range Moon to 2.53e-5, whose cells are body cells as in the source
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

  // requirement 9i and N50: a range of body cells pasted onto a slide was written with th cells in
  // its first row, drawn italic in the color of a header
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

    // N49: Paste of the Edit menu on the canvas with a range on the clipboard pasted nothing
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
      // the entry takes the name of the menu item, as in Keynote
      assert.equal(await undoLabel(page), 'Undo Paste');
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName)`), ['table']);
      await roundTrip(page, page.source);
    });
  }

  // N44: a key pressed during a drag by a bar acted on the table, and the drag went on with a stale
  // lifted copy
  for (const platform of PLATFORMS) {
    test(`a key pressed during a drag of a row by its bar is without effect, and Esc ends the drag (${platform})`, async (t) => {
      const page = await load(t, platform, BARS, 1);
      // an earlier entry, which Mod+Z during the drag must not undo
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
      // the drag goes on, and the release moves the row
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.deepEqual(await rowsOf(page), ['A1 B1 C1', 'A4 B4 C4', 'A3 B3 C3', 'A2 B2 C2']);
      await roundTrip(page, moved);
      // Esc ends a drag, and its release writes nothing
      const now = await render(page);
      p = await pressRow(page, 'A1', 0, 1.2);
      await press(page, 'Escape');
      await wait(page);
      assert.equal(await shown(page, LIFT), null, 'Esc does not end the drag');
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.equal(await render(page), now);
      assert.deepEqual(errors(page), []);
    });
  }

  // N45: in a table with a merged cell, a move of rows that keeps every merged cell whole was refused
  // without a sign, with a lifted copy and without a drop line
  for (const platform of PLATFORMS) {
    test(`a row moved past a merged block and a merged block moved whole are moved, and a refused move is not lifted (${platform})`, async (t) => {
      let page = await load(t, platform, BARS, 3);
      const rows = await rowsOf(page);
      assert.deepEqual(rows, ['Family Period Jacobi', 'Halo 14.8 3.05', '6.6 3.04', 'Lyapunov 2.69 3.10']);
      // Lyapunov to the gap under the header row
      let p = await pressRow(page, 'Lyapunov', 3, -2);
      assert.ok(await shown(page, LIFT), 'the row is not lifted');
      assert.ok(await shown(page, DROP), 'the drop line is not drawn at the gap above the merged block');
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.deepEqual(await rowsOf(page), ['Family Period Jacobi', 'Lyapunov 2.69 3.10', 'Halo 14.8 3.05', '6.6 3.04']);
      assert.equal(await undoLabel(page), 'Undo Move Row');
      await roundTrip(page, page.source);
      // the two rows of Halo dragged below Lyapunov, on the file as it was opened
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
      // Lyapunov into the merged block is refused, without a drop line
      p = await pressRow(page, 'Lyapunov', 3, -1);
      assert.equal(await shown(page, DROP), null, 'a drop line is drawn inside the merged block');
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.equal(await render(page), page.source);
      // the header row cannot be moved anywhere, hence it is not lifted
      p = await pressRow(page, 'Family', 0, 2);
      assert.equal(await shown(page, LIFT), null, 'the header row is lifted although it cannot be moved');
      assert.equal(await shown(page, DROP), null);
      await pointer(page, 'mouseReleased', p.x, p.y);
      await wait(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }
});
