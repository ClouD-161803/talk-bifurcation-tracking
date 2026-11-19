// a range of table cells: cut, copy, paste, and delete on the range, the fill handle, the frame of
// a cell, and a range pasted with its formulas and formats

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { byteExact, click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';

// regression tests of R8.3 on both platforms with trusted input, for findings of round 3 of the
// council. every popover of the editor is put by one rule, beside its target, off the text of its
// slide, and inside the canvas. a key of the keyboard sheet is listed at one command only. Use
// Rehearsed Timings is checked only when the deck has timings. the fill handle of a table follows
// the pointer, and the Table pane counts the range while the handle is dragged. the frame of a
// cell is drawn outside its text, and a new table and its bars are kept off a placeholder. Insert
// Table… opens with the size of the grid. the Text pane applies its formats to a block selected on
// the canvas. after each edit the text is checked byte for byte, after an undo and a redo, and
// after a save and an open
describe('popovers, the fill handle, and cell frames', () => {
  const PLATFORMS = ['mac', 'other'];
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const PANEL = '#beeson-edit-panel-format';
  // the slides of the demo deck with the display formula and with the figure and its caption
  const EQUATIONS = 3;
  const FIGURE = 4;
  const P = '.reveal section.present > p';
  const LIST = '.reveal section.present > ul';

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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(window.BeesonEditor.status()))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const meets = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const inside = (a, b) => a.left >= b.left - 0.5 && a.top >= b.top - 0.5 && a.right <= b.right + 0.5 && a.bottom <= b.bottom + 0.5;
  const middle = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
  let saves = 0;

  // the box of the first shown element of a selector, with its right and bottom edges
  const rectOf = (page, selector) => page.evaluate(`(() => {
  const el = [...document.querySelectorAll(${js(selector)})].find((e) => e.getClientRects().length);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
})()`);
  // the boxes of the lines of the text and of the formulas of the elements of a selector, i.e. the
  // text that a popover is kept off, without the empty part of a block
  const inkOf = (page, selector) => page.evaluate(`(() => {
  const out = [];
  const range = document.createRange();
  for (const el of document.querySelectorAll(${js(selector)})) {
    for (const svg of el.querySelectorAll('mjx-container > svg')) out.push(svg.getBoundingClientRect());
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.data.trim() || n.parentElement.closest('mjx-container')) continue;
      range.selectNodeContents(n);
      out.push(...range.getClientRects());
    }
  }
  return out.filter((r) => r.width && r.height).map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
})()`);
  const covered = async (page, pop, selector) => (await inkOf(page, selector)).find((r) => meets(pop, r));
  const canvasOf = (page) => page.evaluate('(() => { const v = window.BeesonEditorShell.stage.viewport; return { left: v.left, top: v.top, right: v.right, bottom: v.bottom }; })()');

  // the editor on the slide n of a deck served over HTTP, in a window of 1600 by 1000 px as in the
  // shoot of the council, with the Format tab shown
  async function load(t, platform, { deck = 'test-deck.html', n = FIGURE, size = { width: 1600, height: 1000 } } = {}) {
    const page = await browser.newPage(size);
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
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // roundTrip checks the text before byte for byte after undos undos, the edit after as many redos,
  // an edit within the scope rule, and an open of the saved edit without problems. the saved text
  // becomes page.source, the text before the next check
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    const added = textProblems(edited, THEME);
    for (const p of textProblems(page.source, THEME)) if (added.includes(p)) added.splice(added.indexOf(p), 1);
    assert.deepEqual(added, [], 'the edit is out of the scope rule');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r8-3-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  // the words text selected in the first element at selector, with its block focused
  const selectWords = (page, selector, text) => page.evaluate(`(() => {
  const el = document.querySelector(${js(selector)});
  el.closest('[contenteditable="true"]').focus();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const at = n.data.indexOf(${js(text)});
    if (at < 0) continue;
    const r = document.createRange();
    r.setStart(n, at);
    r.setEnd(n, at + ${text.length});
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  }
  return false;
})()`);

  // finding 1 of R8.3: the link editor covered the first two items of the list under its word
  // (state 126). the formula sheets of states 45 and 79 are put by the same rule
  for (const platform of PLATFORMS) {
    test(`the link editor of a word is put beside its paragraph, off the list under it and inside the canvas (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, P);
      assert.ok(await selectWords(page, P, 'matplotlib'));
      await frames(page);
      await exec(page, 'text.link', { kind: 'email' });
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-link[open]')`);
      await sleep(150);
      const pop = await rectOf(page, 'dialog.beeson-edit-link');
      const canvas = await canvasOf(page);
      assert.ok(inside(pop, canvas), `the link editor ${js(pop)} is not inside the canvas ${js(canvas)}`);
      for (const sel of [P, `${LIST} > li:nth-child(1)`, `${LIST} > li:nth-child(2)`, `${LIST} > li:nth-child(3)`, '.reveal section.present h2', '.reveal section.present figcaption']) {
        const line = await covered(page, pop, sel);
        assert.ok(!line, `the link editor ${js(pop)} covers a line of ${sel} at ${js(line)}`);
      }
      assert.ok(await page.evaluate(`!!document.querySelector('dialog.beeson-edit-link').dataset.beside`), 'the link editor does not have an arrow at its target');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('dialog.beeson-edit-link[open]')`);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`the formula sheets are put by the same rule, beside their target inside the canvas and off the text (${platform})`, async (t) => {
      const page = await load(t, platform, { n: EQUATIONS });
      // state 45, the TeX sheet of the display formula
      await clickText(page, '.reveal section.present div.math mjx-container');
      await page.waitFor(`!!document.querySelector('.beeson-math')`);
      await sleep(300);
      let pop = await rectOf(page, '.beeson-math');
      const canvas = await canvasOf(page);
      assert.ok(inside(pop, canvas), `the TeX sheet ${js(pop)} is drawn past the canvas ${js(canvas)}`);
      for (const sel of ['div.math', 'h2', '> p']) {
        const line = await covered(page, pop, `.reveal section.present ${sel}`);
        assert.ok(!line, `the TeX sheet ${js(pop)} covers a line of ${sel} at ${js(line)}`);
      }
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-math')`);
      await byteExact(page);
      // state 79, the sheet of a new formula under the list of the slide with the figure
      await page.evaluate(`Reveal.slide(${FIGURE})`);
      await frames(page);
      await clickText(page, `${LIST} > li:last-child`);
      await press(page, 'Escape');
      await exec(page, 'insert.formula');
      await page.waitFor(`!!document.querySelector('.beeson-math')`);
      await sleep(300);
      pop = await rectOf(page, '.beeson-math');
      assert.ok(inside(pop, canvas), `the sheet ${js(pop)} is not inside the canvas ${js(canvas)}`);
      for (const sel of ['div.math', 'figcaption', '> p', 'h2']) {
        const line = await covered(page, pop, `.reveal section.present ${sel}`);
        assert.ok(!line, `the sheet ${js(pop)} covers a line of ${sel} at ${js(line)}`);
      }
      assert.ok(!meets(pop, await rectOf(page, '.reveal section.present div.math')), `the sheet ${js(pop)} covers its new formula`);
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-math')`);
      if ((await render(page)) !== page.source) await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // the rows of the sheet of keyboard shortcuts, each as its group, its label, and its keys, read
  // from the sheet opened from the Help menu
  async function sheet(page) {
    await exec(page, 'help.keys');
    await frames(page);
    const rows = await page.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-keys section')].flatMap((s) => [...s.querySelectorAll('.row')].map((r) => ({ group: s.querySelector('h3').textContent, label: r.firstChild.textContent, keys: r.lastChild.textContent })))`);
    await press(page, 'Escape');
    await frames(page);
    return rows;
  }

  // finding 2 of R8.3: Shift+F3 was listed at Find Previous and at Change Case on Windows and Linux
  // (states 175 and 209). a key may be listed at two rows of the menus only when one of its commands
  // is taken in the navigator alone, e.g. Delete at Delete and at Delete Slide, as in both apps
  for (const platform of PLATFORMS) {
    test(`each key of the keyboard sheet is listed at one command of a pane, which the key runs (${platform})`, async (t) => {
      const page = await load(t, platform);
      const rows = await sheet(page);
      assert.ok(rows.length > 90, `the sheet lists ${rows.length} rows`);
      const caseKey = platform === 'mac' ? '⇧F3' : 'Shift+F3';
      const listed = rows.filter((r) => r.keys.split(', ').includes(caseKey)).map((r) => `${r.group} > ${r.label}`);
      assert.deepEqual(listed, ['Format > Change Case'], `${caseKey} is not listed at Change Case alone`);
      assert.deepEqual(await page.evaluate('window.BeesonEditorShell.sheetClashes()'), [], 'a key is listed at two commands of one pane of the sheet');
      const previous = rows.find((r) => r.label === 'Find Previous').keys;
      // the key of Change Case changes the case of the words selected in a text
      await clickText(page, P);
      assert.ok(await selectWords(page, P, 'matplotlib'));
      await frames(page);
      await press(page, 'Shift+F3');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector(${js(P)}).textContent.includes('MATPLOTLIB')`), true, 'Shift+F3 does not change the case of the words');
      await roundTrip(page);
      // the key of Find Previous selects a match of the query, also from the caret in a text
      await exec(page, 'find.open', 'styles');
      await frames(page);
      await press(page, 'Escape');
      await clickText(page, `${LIST} > li:first-child`);
      await frames(page);
      await press(page, platform === 'mac' ? 'Mod+Shift+G' : 'Ctrl+Shift+F3');
      await frames(page);
      assert.equal(await page.evaluate('getSelection().toString()'), 'styles', `${previous} does not select the match before the caret in a text`);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // finding 3 of R8.3: Use Rehearsed Timings was checked while no timings were recorded (state 193)
  for (const platform of PLATFORMS) {
    test(`Use Rehearsed Timings is checked and enabled only when the deck has timings (${platform})`, async (t) => {
      const page = await load(t, platform);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal .slides section[data-timing]').length`), 0);
      assert.equal((await state(page, 'play.clearTimings')).enabled, false);
      let s = await state(page, 'play.useTimings');
      assert.equal(s.enabled, false, 'Use Rehearsed Timings is enabled without timings');
      // a switch turned on in the storage is not shown checked while the deck has no timings
      await page.evaluate(`localStorage.setItem('beeson-use-timings', '1')`);
      s = await state(page, 'play.useTimings');
      assert.equal(s.checked, false, 'Use Rehearsed Timings is checked without timings');
      // a timing of the current slide, as a rehearsal writes it
      await page.evaluate(`window.BeesonEditor.doc.setTag(document.querySelector('.reveal section.present'), { attrs: { 'data-timing': '12' } }, 'timing')`);
      await frames(page);
      s = await state(page, 'play.useTimings');
      assert.equal(s.enabled, true, 'Use Rehearsed Timings is dimmed with timings');
      assert.equal(s.checked, true, 'Use Rehearsed Timings is not checked with timings and the switch on');
      assert.equal((await state(page, 'play.clearTimings')).enabled, true);
      await exec(page, 'play.clearTimings');
      await frames(page);
      s = await state(page, 'play.useTimings');
      assert.deepEqual([s.enabled, s.checked], [false, false], 'Use Rehearsed Timings is live after Clear Timings');
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  const cellAt = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;
  const paneNote = (page) => page.evaluate(`document.querySelector('${PANEL} .ed-note')?.textContent`);

  // a new Content slide after the slide with the figure with a table of 3 columns by 5 rows from the
  // grid of the button Table, with rows 2 and 3 typed, as in states 197 and 198
  async function tableSlide(page) {
    await exec(page, 'slide.new.content');
    await frames(page);
    await exec(page, 'insert.table', { rows: 5, columns: 3 });
    await frames(page);
    for (const [r, c, text] of [[1, 0, '1'], [2, 0, '2'], [1, 1, 'Step 1'], [2, 1, 'Step 2'], [1, 2, 'orbit'], [2, 2, 'tube']]) {
      await clickText(page, cellAt(r, c));
      await type(page, text);
    }
    await frames(page);
  }

  // finding 4 of R8.3: the fill handle stood at the corner of the range during its own drag, and
  // the Table pane read the range from before the drag (state 198)
  for (const platform of PLATFORMS) {
    test(`the fill handle of a range follows the pointer, and the Table pane counts the range during the drag (${platform})`, async (t) => {
      const page = await load(t, platform);
      await tableSlide(page);
      const from = middle(await rectOf(page, cellAt(1, 0)));
      const to = middle(await rectOf(page, cellAt(2, 2)));
      await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
      await frames(page);
      assert.match(await paneNote(page), /cells A2:C3$/);
      const handle = middle(await rectOf(page, '.beeson-table-bars .fill'));
      const end = middle(await rectOf(page, cellAt(4, 2)));
      await drag(page, handle, { dy: end.y - handle.y, steps: 12, hold: true });
      await frames(page);
      const moved = middle(await rectOf(page, '.beeson-table-bars .fill'));
      assert.ok(Math.abs(moved.x - handle.x) < 3 && Math.abs(moved.y - end.y) < 3, `the fill handle at ${js(moved)} is not under the pointer at ${js({ x: handle.x, y: end.y })}`);
      assert.match(await paneNote(page), /cells A2:C5$/, 'the Table pane does not count the range during the drag');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: handle.x, y: end.y, button: 'left', clickCount: 1 });
      await page.waitFor(`window.BeesonEditor.state('edit.undo').label === 'Undo Autofill'`);
      await frames(page);
      assert.match(await paneNote(page), /cells A2:C5$/);
      const corner = await rectOf(page, '.beeson-table-bars .cell');
      const back = middle(await rectOf(page, '.beeson-table-bars .fill'));
      assert.ok(Math.abs(back.x - corner.right) < 6 && Math.abs(back.y - corner.bottom) < 6, 'the fill handle is not back at the corner of the range after the drag');
      assert.deepEqual(errors(page), []);
    });
  }

  // the box inside the border of the frame of the selected cells
  const frameInside = (page) => page.evaluate(`(() => {
  const el = document.querySelector('.beeson-table-bars .cell');
  const r = el.getBoundingClientRect();
  const w = parseFloat(getComputedStyle(el).borderLeftWidth);
  return { left: r.left + w, top: r.top + w, right: r.right - w, bottom: r.bottom - w };
})()`);
  // the box of the ink of the text of an element, from the range of its content
  const cellInk = (page, selector) => page.evaluate(`(() => {
  const r = document.createRange();
  r.selectNodeContents(document.querySelector(${js(selector)}));
  const b = r.getBoundingClientRect();
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
})()`);

  // finding 5 of R8.3: the frame of a merged cell was drawn over its first characters, and the
  // placeholder of a new slide under the column bar of its table (state 96)
  for (const platform of PLATFORMS) {
    test(`the frame of a selected cell is drawn outside its text, and the bars of a new table are kept off the placeholder (${platform})`, async (t) => {
      const page = await load(t, platform);
      await tableSlide(page);
      const holder = await rectOf(page, '.reveal section.present > p:empty');
      assert.ok(holder, 'the new slide does not have an empty paragraph');
      for (const sel of ['.beeson-table-bars .bar', '.beeson-table-bars .bar ~ .bar', '.beeson-table-bars .round', '.reveal section.present table']) {
        const r = await rectOf(page, sel);
        assert.ok(!meets(r, holder), `${sel} at ${js(r)} is drawn over the placeholder at ${js(holder)}`);
      }
      // the cells A2 to B3 merged, as in state 96
      const from = middle(await rectOf(page, cellAt(1, 0)));
      const to = middle(await rectOf(page, cellAt(2, 1)));
      await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
      await frames(page);
      await exec(page, 'table.merge');
      await frames(page);
      const frame = await frameInside(page);
      const ink = await cellInk(page, cellAt(1, 0));
      assert.ok(inside(ink, frame), `the text of the merged cell at ${js(ink)} is drawn under its frame, whose inside is ${js(frame)}`);
      // one cell of the first column selected as a block, whose text starts at the left edge of the
      // cell
      await clickText(page, cellAt(3, 0));
      await press(page, 'Escape');
      await frames(page);
      // its frame is on the edges of the cell, on its padding at the right, the top, and the bottom,
      // hence the box of its text, without the padding, is inside the frame
      const one = await frameInside(page);
      const text = await page.evaluate(`(() => {
      const c = document.querySelector(${js(cellAt(3, 0))});
      const r = c.getBoundingClientRect();
      const k = r.width / c.offsetWidth;
      const p = (side) => parseFloat(getComputedStyle(c)['padding' + side]) * k;
      return { left: r.left + p('Left'), top: r.top + p('Top'), right: r.right - p('Right'), bottom: r.bottom - p('Bottom') };
    })()`);
      assert.ok(inside(text, one), `the box of the text of the cell at ${js(text)} is drawn under its frame, whose inside is ${js(one)}`);
      assert.deepEqual(errors(page), []);
    });
  }

  const sizeFields = (page) => page.evaluate(`Object.fromEntries([...document.querySelectorAll('dialog.beeson-table-size input')].map((i) => [i.name, i.value]))`);

  // finding 6 of R8.3: Insert Table… opened with 6 rows after the pointer rested on 3 rows of the
  // grid (states 196 and 205)
  for (const platform of PLATFORMS) {
    test(`Insert Table… opens with the size that the pointer last rested on in the grid, and inserts every row (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'slide.new.content');
      await frames(page);
      await click(page, '.beeson-edit-top [data-command="insert.table"]');
      await page.waitFor(`!!document.querySelector('dialog.beeson-table-picker[open]')`);
      // the cell of 4 columns by 3 rows of the grid of 10 columns
      const { x, y } = middle(await rectOf(page, '.beeson-table-picker .grid > :nth-child(24)'));
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      assert.equal(await page.evaluate(`document.querySelector('.beeson-table-picker .size').textContent`), '4 × 3 Table');
      await clickText(page, '.beeson-table-picker .more');
      await page.waitFor(`!!document.querySelector('dialog.beeson-table-size[open]')`);
      assert.deepEqual(await sizeFields(page), { columns: '4', rows: '3' }, 'the dialog does not open with the size of the grid');
      await press(page, 'Tab');
      await type(page, '9');
      await press(page, 'Enter');
      await page.waitFor(`!!document.querySelector('.reveal section.present table')`);
      await frames(page);
      const shape = await page.evaluate(`[...document.querySelector('.reveal section.present table').rows].map((tr) => tr.cells.length)`);
      assert.deepEqual(shape, Array(9).fill(4), 'the table is not inserted with every row');
      await roundTrip(page, 2);
      // a later Insert Table… without a rest on the grid opens with the size typed last
      await click(page, '.beeson-edit-top [data-command="insert.table"]');
      await page.waitFor(`!!document.querySelector('dialog.beeson-table-picker[open]')`);
      await clickText(page, '.beeson-table-picker .more');
      await page.waitFor(`!!document.querySelector('dialog.beeson-table-size[open]')`);
      assert.deepEqual(await sizeFields(page), { columns: '4', rows: '9' });
      await press(page, 'Escape');
      assert.deepEqual(errors(page), []);
    });
  }

  // the commands of the Text pane that apply to a text selection, by their ids, apart from Bigger
  const TEXT_PANE = ['text.style.body', 'text.formatPainter', 'text.bold', 'text.italic', 'text.strike', 'text.code', 'text.superscript', 'text.subscript', 'text.smaller', 'text.case.upper', 'text.tone.accent', 'text.link', 'text.clear'];
  // the dimmed controls of the Text pane, each as its command or its text, and its tooltip
  const dimmed = (page) => page.evaluate(`[...document.querySelectorAll('${PANEL} button:disabled')].map((b) => [b.dataset.command || b.textContent, b.title])`);
  // the controls that are dimmed by design on a block of one level that does not have a link, and
  // Start at, which is set only on a numbered list
  const UNUSED = /^text\.(indent|outdent|removeLink|list\.start)$|^(Remove Link|Increase Indent Level|Decrease Indent Level)$/;

  // finding 7 of R8.3: with a list selected as a block, the Text pane dimmed every control but the
  // list buttons (state 190)
  for (const platform of PLATFORMS) {
    test(`the Text pane applies its formats to a list selected as a block (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, P);
      await press(page, 'Escape');
      await frames(page);
      await click(page, `${PANEL} [data-command="text.list.ul"]`);
      await frames(page);
      const off = [];
      for (const id of TEXT_PANE) if (!(await state(page, id)).enabled) off.push(id);
      assert.deepEqual(off, [], 'a command of the Text pane is dimmed for the list selected as a block');
      // Bigger stays dimmed with its reason, since the theme does not have a class of an item larger
      // than Body
      for (const [id, title] of (await dimmed(page)).filter(([id]) => !UNUSED.test(id))) {
        assert.ok(id === 'text.bigger' && / (because|since|not|only) /.test(title), `the control ${id} is dimmed for the list selected as a block with the tooltip ${js(title)}`);
      }
      // Bold, the accent tone, and Smaller are set on the whole text of the item, with the class of
      // the style Small on the item
      await click(page, `${PANEL} [data-command="text.bold"]`);
      await frames(page);
      await click(page, `${PANEL} .ed-swatches [data-command="text.tone.accent"]`);
      await frames(page);
      await click(page, `${PANEL} [data-command="text.smaller"]`);
      await frames(page);
      const text = await roundTrip(page, 4);
      assert.match(text, /<ul>\s*<li class="small">(<span class="tone-accent"><strong>|<strong><span class="tone-accent">)Export your matplotlib figure with the styles of the template\. It will show frameless\.(<\/strong><\/span>|<\/span><\/strong>)<\/li>\s*<\/ul>/);
      assert.deepEqual(errors(page), []);
    });

    test(`a control of the Text pane dimmed for a selected block says why in its tooltip (${platform})`, async (t) => {
      const page = await load(t, platform);
      for (const sel of [P, `${LIST} > li:first-child`, '.reveal section.present h2']) {
        await clickText(page, sel);
        await press(page, 'Escape');
        await frames(page);
        for (const [id, title] of await dimmed(page)) {
          if (UNUSED.test(id)) continue;
          assert.match(title, / (because|since|not|only) /, `the control ${id} is dimmed for ${sel} with the tooltip ${js(title)}, which does not give a reason`);
        }
      }
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R12.7, the range of cells of a table, on both platforms with trusted input.
// with a range of cells selected, Cut, Copy, Paste, Delete, and Duplicate act on the range as the
// Delete key does, and the range stays selected after a clear. an undo in the Rows field undoes
// the count of the table, and a column grip released at its start widths writes nothing
describe('Cut, Copy, and Delete on a range', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-tables.html';

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
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const tables = (page) => page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('table').length`);
  let saves = 0;

  // the editor on the tables page served over HTTP in a window of 1600 by 1000 px, on slide 2
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
    await frames(page);
    return page;
  }

  // the center of the cell of the current slide that holds text
  async function cell(page, text) {
    return page.evaluate(`(() => {
    const c = [...Reveal.getCurrentSlide().querySelectorAll('td, th')].find((c) => c.textContent.includes(${js(text)}));
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  }

  // the cells from the cell of from to the cell of to selected as a block, by a click and a Shift-click
  async function range(page, from, to) {
    await click(page, await cell(page, from));
    await frames(page);
    await click(page, await cell(page, to), { modifiers: 'Shift' });
    await frames(page);
  }

  // whether cells are selected as a block, i.e. the outline of the block is shown and no cell has a caret
  const inRange = (page) => page.evaluate(`(() => {
  const o = document.querySelector('.beeson-table-bars .cell.range');
  return !!o && !o.hidden && document.activeElement?.localName !== 'td';
})()`);

  // a clipboard event of type fired at the focus with a DataTransfer that holds data, and what the
  // editor wrote onto the DataTransfer
  async function fire(page, type, data = {}) {
    return page.evaluate(`(() => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(${js(data)})) dt.setData(k, v);
    const ev = new ClipboardEvent(${js(type)}, { clipboardData: dt, bubbles: true, cancelable: true });
    (document.activeElement || document.body).dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, plain: dt.getData('text/plain'), html: dt.getData('text/html') };
  })()`);
  }

  // the cells from Moon to 2.53e-5 cleared, with the other cells of the table kept
  const CLEARED = [
    ['<tr><td>Moon</td><td>\\(0.01215\\)</td><td>Earth and Moon</td></tr>', '<tr><td></td><td></td><td>Earth and Moon</td></tr>'],
    ['<tr><td>Europa</td><td>2.53e-5</td><td>Jupiter</td></tr>', '<tr><td></td><td></td><td>Jupiter</td></tr>'],
  ];

  // the cells from Moon to 2.53e-5 filled with a b and c d
  const FILLED = [
    ['<tr><td>Moon</td><td>\\(0.01215\\)</td><td>Earth and Moon</td></tr>', '<tr><td>a</td><td>b</td><td>Earth and Moon</td></tr>'],
    ['<tr><td>Europa</td><td>2.53e-5</td><td>Jupiter</td></tr>', '<tr><td>c</td><td>d</td><td>Jupiter</td></tr>'],
  ];

  // roundTrip checks the edits byte for byte, the source after an undo, the edit again after a
  // redo, and an open of the saved edit without problems
  async function roundTrip(page, edits) {
    const edited = await render(page);
    await byteExact(page, edits);
    await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r12-7-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
  }

  for (const platform of PLATFORMS) {
    test(`Edit > Delete on a range of cells clears the cells and keeps the table (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, 'Moon', '2.53e-5');
      assert.equal(await inRange(page), true);
      await exec(page, 'element.delete');
      await frames(page);
      assert.equal(await tables(page), 1, 'Delete removed the table');
      assert.equal(await undoLabel(page), 'Undo Delete');
      assert.equal(await inRange(page), true, 'the range is not selected after Delete');
      await roundTrip(page, CLEARED);
    });

    test(`Cut on a range of cells copies and clears the cells (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, 'Moon', '2.53e-5');
      const out = await fire(page, 'cut');
      await frames(page);
      assert.equal(out.prevented, true);
      assert.equal(await tables(page), 1, 'Cut removed the table');
      assert.equal(out.plain, 'Moon\t\\(0.01215\\)\nEuropa\t2.53e-5');
      assert.equal(await undoLabel(page), 'Undo Cut');
      await roundTrip(page, CLEARED);
    });

    test(`Cut of the Edit menu on a range of cells clears the cells (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, 'Moon', '2.53e-5');
      await exec(page, 'edit.cut');
      await frames(page);
      assert.equal(await tables(page), 1, 'Edit > Cut removed the table');
      await byteExact(page, CLEARED);
    });

    test(`Duplicate is dimmed on a range of cells, and its key does not copy the table (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, 'Moon', '2.53e-5');
      assert.equal((await state(page, 'edit.duplicate')).enabled, false);
      await press(page, 'Mod+D');
      await frames(page);
      assert.equal(await tables(page), 1, 'the key of Duplicate copied the table');
      await byteExact(page);
    });

    test(`Copy of a range of cells gives the cells as tab-separated text and a table (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, 'Moon', 'Jupiter');
      const out = await fire(page, 'copy');
      assert.equal(out.prevented, true);
      assert.equal(out.plain, 'Moon\t\\(0.01215\\)\tEarth and Moon\nEuropa\t2.53e-5\tJupiter');
      assert.ok(!out.html.includes('<!--beeson-->'), 'the copy holds the table as an element of the editor');
      assert.ok(!out.html.includes('Titan') && !out.html.includes('Body'), 'the copy holds cells outside the range');
      assert.match(out.html, /<table[^>]*>[\s\S]*<td>Moon<\/td>[\s\S]*<td>Jupiter<\/td>[\s\S]*<\/table>/);
      assert.equal(await inRange(page), true);
      await byteExact(page);
    });

    test(`a paste of tab-separated text onto a range of cells fills them from its first cell (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, 'Moon', '2.53e-5');
      const out = await fire(page, 'paste', { 'text/plain': 'a\tb\nc\td' });
      await frames(page);
      assert.equal(out.prevented, true);
      assert.equal(await tables(page), 1, 'the paste added a table');
      assert.equal(await undoLabel(page), 'Undo Paste');
      assert.equal(await inRange(page), true, 'the pasted cells are not selected');
      await roundTrip(page, FILLED);
    });

    test(`Paste of the Edit menu onto a range of cells fills them from its first cell (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, 'Moon', '2.53e-5');
      await exec(page, 'edit.paste', 'a\tb\nc\td');
      await frames(page);
      assert.equal(await tables(page), 1, 'Edit > Paste added a table');
      await byteExact(page, FILLED);
    });

    test(`Backspace on a range of cells keeps the range selected (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, 'Moon', 'Jupiter');
      await press(page, 'Shift+ArrowDown');
      await frames(page);
      await press(page, 'Backspace');
      await frames(page);
      assert.equal(await undoLabel(page), 'Undo Clear Cells');
      assert.equal(await inRange(page), true, 'the range is a caret after Backspace');
      await press(page, 'Mod+Z');
      await frames(page);
      assert.equal(await inRange(page), true, 'the range is a caret after an undo of the clear');
      await press(page, 'Mod+Shift+Z');
      await frames(page);
      assert.equal(await inRange(page), true, 'the range is a caret after a redo of the clear');
    });

    test(`an undo in the Rows field after a commit undoes the count of the table (${platform})`, async (t) => {
      const page = await load(t, platform);
      if (!(await page.evaluate(`window.BeesonEditor.state('shell.format').checked`))) await exec(page, 'shell.format');
      await click(page, await cell(page, 'Europa'));
      await frames(page);
      const field = '#beeson-edit-num-rows';
      await page.waitFor(`!!document.querySelector(${js(field)})`);
      await click(page, field);
      // a key without the editing command of the browser does not select the text in headless Chrome
      await page.evaluate(`document.querySelector(${js(field)}).select()`);
      await type(page, '6');
      await press(page, 'Enter');
      await frames(page);
      const rows = () => page.evaluate(`Reveal.getCurrentSlide().querySelector('table').rows.length`);
      const value = () => page.evaluate(`document.querySelector(${js(field)}).value`);
      assert.equal(await rows(), 6);
      assert.equal(await page.evaluate('document.activeElement.id'), 'beeson-edit-num-rows');
      const count = `Reveal.getCurrentSlide().querySelector('table').rows.length`;
      await press(page, 'Mod+Z');
      await page.waitFor(`${count} === 4`).catch(() => {});
      assert.equal(await rows(), 4, 'the undo in the field did not undo the table');
      assert.equal(await value(), '4');
      await byteExact(page);
      await press(page, 'Mod+Shift+Z');
      await page.waitFor(`${count} === 6`).catch(() => {});
      assert.equal(await rows(), 6);
      assert.equal(await value(), '6');
      // a blur after the redo does not add an entry to the history
      await page.evaluate('document.activeElement.blur()');
      await frames(page);
      assert.equal(await rows(), 6);
      assert.equal(await undoLabel(page), 'Undo Set Row Count');
      assert.equal((await state(page, 'edit.redo')).enabled, false);
      await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);
    });

    test(`a column grip released at its start widths writes nothing (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, await cell(page, 'Moon'));
      await frames(page);
      const grip = await page.evaluate(`(() => {
      const r = document.querySelector('.beeson-table-bars .grips [data-grip="0"]').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
      const mouse = (kind, x, extra = {}) => page.send('Input.dispatchMouseEvent', { type: kind, x, y: grip.y, ...extra });
      await mouse('mouseMoved', grip.x);
      await mouse('mousePressed', grip.x, { button: 'left', buttons: 1, clickCount: 1 });
      for (const dx of [5, 10, 20, 30, 40, -20, -40]) await mouse('mouseMoved', grip.x + dx, { button: 'left', buttons: 1 });
      await mouse('mouseReleased', grip.x - 40, { button: 'left', clickCount: 1 });
      await frames(page);
      await byteExact(page);
      assert.equal((await state(page, 'edit.undo')).enabled, false, 'the drag added an entry to the history');
    });
  }
});

// regression tests of R13.5 on both platforms with trusted input: a cut or a copy of a range of
// table cells keeps the formulas and the inline elements of the theme of each cell, and a paste of
// such a range writes them back. each edit of the file is checked byte for byte, after an undo and
// a redo, and after a save and an open
describe('formulas kept in cut and pasted cells', () => {
  const DECK = 'test/pages/editor-tables.html';
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
  const settle = (page) => page.evaluate('new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), 100))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const plainTable = (s) => s.match(/<h2>A plain table[\s\S]*?<\/table>/)[0];

  // the editor on the tables page with slide 2 shown, and every write of a cut or a copy recorded
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
    await page.evaluate('Reveal.slide(1)');
    await settle(page);
    await page.evaluate(`(() => { window.__w = []; const o = DataTransfer.prototype.setData; DataTransfer.prototype.setData = function (t, v) { window.__w.push([t, v]); return o.call(this, t, v); }; })()`);
    page.platform = platform;
    return page;
  }

  const at = (page, r, c) => page.evaluate(`(() => { const t = Reveal.getCurrentSlide().querySelector('table'); const b = t.rows[${r}].cells[${c}].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);

  // the cells from a to b selected as a block, with a click and a Shift-click
  async function range(page, a, b) {
    await click(page, await at(page, ...a));
    await settle(page);
    await click(page, await at(page, ...b), { modifiers: 'Shift' });
    await settle(page);
    assert.ok(await page.evaluate(`(() => { const o = document.querySelector('.beeson-table-bars .cell.range'); return !!o && !o.hidden; })()`), 'the range is not selected');
  }

  // a trusted Mod+X or Mod+C, which the browser turns into a cut or a copy event, and what it wrote
  async function clip(page, command) {
    const [key, code, kc] = command === 'cut' ? ['x', 'KeyX', 88] : ['c', 'KeyC', 67];
    const modifiers = page.platform === 'mac' ? 4 : 2;
    await page.evaluate('window.__w = []');
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: kc, modifiers, commands: [command] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc, modifiers });
    await settle(page);
    const w = await page.evaluate('window.__w');
    return { plain: w.find((x) => x[0] === 'text/plain')?.[1] ?? '', html: w.find((x) => x[0] === 'text/html')?.[1] ?? '' };
  }

  // a paste event with the given data at the focus, as the browser sends it
  async function paste(page, plain, html) {
    const done = await page.evaluate(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${js(plain)}); if (${js(html)}) dt.setData('text/html', ${js(html)}); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(ev); return ev.defaultPrevented; })()`);
    assert.ok(done, 'the paste is not taken by the editor');
    await settle(page);
  }

  for (const platform of PLATFORMS) {
    test(`a cut of a range with a formula pasted back leaves the table as in the file (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, [1, 0], [2, 1]);
      const { plain, html } = await clip(page, 'cut');
      assert.equal(plain, 'Moon\t\\(0.01215\\)\nEuropa\t2.53e-5');
      assert.match(html, /^<table data-beeson[^>]*>/);
      assert.ok(html.includes('<td>\\(0.01215\\)</td>'), html);
      const cut = await render(page);
      assert.ok(plainTable(cut).includes('<tr><td></td><td></td><td>Earth and Moon</td></tr>'));
      await range(page, [1, 0], [2, 1]);
      await paste(page, plain, html);
      assert.equal(await render(page), page.source);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelector('table').rows[1].cells[1].querySelectorAll('mjx-container').length`), 1);
      await undo(page);
      assert.equal(await render(page), cut);
      await redo(page);
      assert.equal(await render(page), page.source);
      await saveAndReopen(page);
      assert.deepEqual(errors(page), []);
    });

    test(`a copy of a bold row pasted onto another row keeps the bold (${platform})`, async (t) => {
      const page = await load(t, platform);
      const europa = await at(page, 2, 0);
      await click(page, europa);
      await settle(page);
      await click(page, europa, { count: 2 });
      await settle(page);
      await press(page, 'Mod+B');
      await settle(page);
      await press(page, 'Escape');
      await settle(page);
      const bold = await render(page);
      assert.ok(bold.includes('<tr><td><strong>Europa</strong></td><td>2.53e-5</td><td>Jupiter</td></tr>'));
      await range(page, [2, 0], [2, 2]);
      const { plain, html } = await clip(page, 'copy');
      assert.equal(plain, 'Europa\t2.53e-5\tJupiter');
      assert.ok(html.includes('<td><strong>Europa</strong></td>'), html);
      await range(page, [3, 0], [3, 2]);
      await paste(page, plain, html);
      const pasted = bold.replace('<tr><td>Titan</td><td>2.37e-4</td><td>Saturn</td></tr>', '<tr><td><strong>Europa</strong></td><td>2.53e-5</td><td>Jupiter</td></tr>');
      assert.notEqual(pasted, bold);
      assert.equal(await render(page), pasted);
      await undo(page);
      assert.equal(await render(page), bold);
      await redo(page);
      assert.equal(await render(page), pasted);
      const { text } = await saveAndReopen(page);
      assert.equal(text, pasted);
      assert.deepEqual(errors(page), []);
    });

    test(`a pasted table of the editor keeps only the inline elements of the theme (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, [3, 0], [3, 1]);
      const html = '<table data-beeson="cells"><tr><td><span class="tone-accent" style="color: red">Io</span><script>alert(1)</script></td><td><a href="https://example.com"><em>4.7e-5</em></a></td></tr></table>';
      await paste(page, 'Io\t4.7e-5', html);
      const row = '<tr><td><span class="tone-accent">Io</span></td><td><em>4.7e-5</em></td><td>Saturn</td></tr>';
      assert.equal(await render(page), page.source.replace('<tr><td>Titan</td><td>2.37e-4</td><td>Saturn</td></tr>', row));
      await undo(page);
      assert.equal(await render(page), page.source);
    });

    test(`a pasted table of another app is plain text, with a formula drawn again (${platform})`, async (t) => {
      const page = await load(t, platform);
      await range(page, [3, 0], [3, 1]);
      await paste(page, 'Io\t\\(4.7\\)', '<table><tr><td><strong>Io</strong></td><td>\\(4.7\\)</td></tr></table>');
      const row = '<tr><td>Io</td><td>\\(4.7\\)</td><td>Saturn</td></tr>';
      const pasted = page.source.replace('<tr><td>Titan</td><td>2.37e-4</td><td>Saturn</td></tr>', row);
      assert.equal(await render(page), pasted);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelector('table').rows[3].cells[1].querySelectorAll('mjx-container').length`), 1);
      await undo(page);
      assert.equal(await render(page), page.source);
      await redo(page);
      assert.equal(await render(page), pasted);
      await saveAndReopen(page);
    });
  }

  // the Light Table on the demo deck, with the tiles, the focused tile, and the selected tiles
  async function lightTable(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/test-deck.html?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync('test-deck.html', 'utf8');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`)).problems, []);
    await page.evaluate(`window.BeesonEditor.exec('view.lightTable')`);
    await settle(page);
    return page;
  }
  const tiles = (page) => page.evaluate(`(() => {
  const all = [...document.querySelectorAll('.beeson-edit-sorter .tile')];
  return { shown: !document.querySelector('.beeson-edit-sorter').hidden, n: all.length, focus: all.indexOf(document.activeElement), selected: all.flatMap((t, i) => (t.getAttribute('aria-selected') === 'true' ? [i] : [])) };
})()`);
  const tileAt = (page, i) => page.evaluate(`(() => { const r = document.querySelectorAll('.beeson-edit-sorter .tile .pic')[${i}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const itemAt = (page, label) => page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const every = (n) => [...Array(n).keys()];

  for (const platform of PLATFORMS) {
    test(`Mod+A on a tile of the Light Table selects every slide and keeps the focus on the tile (${platform})`, async (t) => {
      const page = await lightTable(t, platform);
      await click(page, await tileAt(page, 3));
      await settle(page);
      await press(page, 'Mod+A');
      await settle(page);
      const { n, focus, selected } = await tiles(page);
      assert.deepEqual(selected, every(n));
      assert.equal(focus, 3);
      await press(page, 'ArrowRight');
      await settle(page);
      assert.deepEqual(await tiles(page), { shown: true, n, focus: 4, selected: [4] });
      await press(page, 'Escape');
      await settle(page);
      assert.equal((await tiles(page)).shown, false);
      assert.equal(await render(page), page.source);
    });

    test(`Select All Slides in the menu of a tile keeps the focus on the tiles (${platform})`, async (t) => {
      const page = await lightTable(t, platform);
      await click(page, await tileAt(page, 3));
      await settle(page);
      await click(page, await tileAt(page, 4), { button: 'right' });
      await settle(page);
      await click(page, await itemAt(page, 'Select All Slides'));
      await settle(page);
      const { n, focus, selected } = await tiles(page);
      assert.deepEqual(selected, every(n));
      assert.equal(focus, 4);
      await press(page, 'ArrowRight');
      await settle(page);
      assert.deepEqual(await tiles(page), { shown: true, n, focus: 5, selected: [5] });
      await press(page, 'Escape');
      await settle(page);
      assert.equal((await tiles(page)).shown, false);
    });

    test(`Mod+D on a tile of the Light Table moves the focus to the tile of the duplicate (${platform})`, async (t) => {
      const page = await lightTable(t, platform);
      await click(page, await tileAt(page, 3));
      await settle(page);
      const n = (await tiles(page)).n;
      await press(page, 'Mod+D');
      await settle(page);
      assert.deepEqual(await tiles(page), { shown: true, n: n + 1, focus: 4, selected: [4] });
      await press(page, 'ArrowRight');
      await settle(page);
      assert.deepEqual(await tiles(page), { shown: true, n: n + 1, focus: 5, selected: [5] });
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R19.3 on both platforms with trusted input: a range of cells pasted by Paste
// of the Edit menu after a reload (D5), Move Row Up and Down of a row next to a merged block (D7),
// and the caret after an undo of an add of a row or a column
describe('pasted ranges, Move Row, and undo of adds', () => {
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
  const enabled = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)}).enabled`);
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  let saves = 0;

  // the editor on slide n of deck, served over HTTP, with the storage of the origin emptied
  async function load(t, platform, deck, n, page = null) {
    if (!page) {
      page = await browser.newPage({ width: 1600, height: 1000 });
      const p = page;
      t.after(() => p.close().catch(() => {}));
    }
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
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

  // the edit checked after an undo, again after a redo, and after a save and an open
  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r19-3-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  const MENU_ITEM = (label) => `[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.textContent === ${js(label)})`;
  const openEdit = async (page) => {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === 'Edit')`));
    await wait(page);
  };
  const closeMenus = async (page) => {
    await page.evaluate('window.BeesonEditorShell?.closeMenus?.(); true');
    await wait(page);
  };
  const menuRun = async (page, label) => {
    await openEdit(page);
    await click(page, await rect(page, MENU_ITEM(label)));
    await wait(page, 300);
    await closeMenus(page);
  };

  const TABLE = `document.querySelector('.reveal section.present table')`;
  const at = (page, r, c) => rect(page, `${TABLE}.rows[${r}].cells[${c}]`);
  const tables = (page) => page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('table').length`);
  const rowsOf = (page) => page.evaluate(`[...${TABLE}.rows].map((tr) => [...tr.cells].map((c) => c.textContent.trim()).join(' '))`);

  // D5: Paste of the Edit menu read the table of a copied range only from the copy of the same page,
  // hence after a reload, or in another tab, the first row of the range was written as th cells
  const BODY = '<tbody>\n      <tr><td>Moon</td><td style="text-align: right">\\(0.01215\\)</td></tr>\n      <tr><td>Europa</td><td style="text-align: right">2.53e-5</td></tr>\n    </tbody>';
  const HEAD = '<tbody>\n      <tr><th>Moon</th><th style="text-align: right">\\(0.01215\\)</th></tr>\n      <tr><td>Europa</td><td style="text-align: right">2.53e-5</td></tr>\n    </tbody>';
  const lastTable = (text) => text.slice(text.lastIndexOf('<table'), text.lastIndexOf('</table>'));

  // the body cells Moon to 2.53e-5 of slide 2 copied by a trusted Mod+C onto the system clipboard,
  // then the deck opened again on slide 3, which drops the copy of the page
  async function copyAndReload(t, platform) {
    const page = await load(t, platform, TABLES, 1);
    await page.send('Page.bringToFront');
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await click(page, await at(page, 1, 0));
    await wait(page);
    await click(page, await at(page, 2, 1), { modifiers: 'Shift' });
    await wait(page);
    const base = { key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: MOD[platform] };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: ['copy'] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page);
    const html = await page.evaluate(`navigator.clipboard.read().then(async (items) => { for (const i of items) if (i.types.includes('text/html')) return (await i.getType('text/html')).text(); return ''; })`);
    assert.ok(html.includes('<td>Moon</td>'), `the system clipboard does not hold the table of the range: ${html}`);
    await load(t, platform, TABLES, 2, page);
    await page.evaluate('document.activeElement?.blur()');
    await click(page, await rect(page, `document.querySelector('.reveal section.present h2')`).then((p) => ({ x: p.x, y: p.y + 260 })));
    await wait(page);
    return page;
  }

  for (const platform of PLATFORMS) {
    test(`Paste of the Edit menu after a reload writes the cells of a copied range as Mod+V does (${platform})`, async (t) => {
      const page = await copyAndReload(t, platform);
      assert.equal(await tables(page), 1);
      await menuRun(page, 'Paste');
      await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll('table').length === 2`).catch(() => {});
      await wait(page, 300);
      assert.equal(await tables(page), 2, 'Paste of the Edit menu does not make a table');
      const pasted = await render(page);
      assert.ok(pasted.includes(BODY), `the new table is not of body cells:\n${lastTable(pasted)}`);
      assert.equal(await undoLabel(page), 'Undo Paste');
      await roundTrip(page, page.source);
    });

    test(`Paste of the Edit menu pastes the plain text where the browser refuses the read of the clipboard (${platform})`, async (t) => {
      const page = await copyAndReload(t, platform);
      await page.evaluate(`navigator.clipboard.read = () => Promise.reject(new DOMException('Read permission denied.', 'NotAllowedError')); true`);
      await menuRun(page, 'Paste');
      await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll('table').length === 2`).catch(() => {});
      await wait(page, 300);
      assert.equal(await tables(page), 2, 'the plain text is not pasted as a table');
      const pasted = await render(page);
      assert.ok(pasted.includes(HEAD), `the plain text is not pasted as before:\n${lastTable(pasted)}`);
      assert.deepEqual(errors(page), []);
    });
  }

  // D7: Move Row Up of a row under a merged block was dimmed, although a drag moves it past the
  // whole block, as Move Row Down of the block does
  const rowBar = (i) => `.beeson-table-bars .bar.rows > [data-index="${i}"]`;
  const cellPoint = (page, text) => rect(page, `[...document.querySelectorAll('.reveal section.present :is(td, th)')].find((c) => c.textContent.trim() === ${js(text)})`);
  async function selectRow(page, text, i) {
    await click(page, await cellPoint(page, text));
    await wait(page, 100);
    await click(page, await rect(page, `document.querySelector(${js(rowBar(i))})`));
    await wait(page, 100);
  }
  const SOURCE = ['Family Period Jacobi', 'Halo 14.8 3.05', '6.6 3.04', 'Lyapunov 2.69 3.10'];
  const MOVED = ['Family Period Jacobi', 'Lyapunov 2.69 3.10', 'Halo 14.8 3.05', '6.6 3.04'];

  for (const platform of PLATFORMS) {
    test(`Move Row Up and Down of a row next to a merged block move it past the whole block, as a drag does (${platform})`, async (t) => {
      const page = await load(t, platform, BARS, 3);
      assert.deepEqual(await rowsOf(page), SOURCE);
      await selectRow(page, 'Lyapunov', 3);
      assert.equal(await enabled(page, 'table.moveRowUp'), true, 'Move Row Up of the row under the block is dimmed');
      assert.equal(await enabled(page, 'table.moveRowDown'), false, 'Move Row Down of the last row is live');
      await page.evaluate(`window.BeesonEditor.exec('table.moveRowUp')`);
      await wait(page);
      assert.deepEqual(await rowsOf(page), MOVED);
      assert.equal(await undoLabel(page), 'Undo Move Row Up');
      const moved = await roundTrip(page, page.source);
      // the moved row goes back down by its own command
      await selectRow(page, 'Lyapunov', 1);
      assert.equal(await enabled(page, 'table.moveRowUp'), false, 'Move Row Up of the row under the header row is live');
      assert.equal(await enabled(page, 'table.moveRowDown'), true, 'Move Row Down of the row above the block is dimmed');
      await page.evaluate(`window.BeesonEditor.exec('table.moveRowDown')`);
      await wait(page);
      assert.deepEqual(await rowsOf(page), SOURCE);
      assert.equal(await render(page), page.source);
      await undo(page);
      assert.equal(await render(page), moved);
      assert.deepEqual(errors(page), []);
    });

    // a column is moved only where no merged cell is in its way, by a drag as by a command, hence
    // the column Jacobi next to the merged cell Distant retrograde stays where it is
    test(`Move Column Left and Right of a column next to a merged block are dimmed, as its drag is refused (${platform})`, async (t) => {
      const page = await load(t, platform, TABLES, 0);
      await click(page, await cellPoint(page, '3.05'));
      await wait(page, 100);
      await click(page, await rect(page, `document.querySelector('.beeson-table-bars .bar.cols > [data-index="2"]')`));
      await wait(page, 100);
      assert.equal(await enabled(page, 'table.moveColumnLeft'), false);
      assert.equal(await enabled(page, 'table.moveColumnRight'), false);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }

  // item 4: after an undo of an add of a row or a column made with the caret in a cell, the caret was
  // not in any cell and the focus was on the page, hence the next key went to the deck
  const CARET = `(() => {
  const s = getSelection();
  const c = document.activeElement?.closest?.('td, th');
  if (!c || !s.rangeCount || !s.isCollapsed) return null;
  const r = document.createRange();
  r.selectNodeContents(c);
  r.setEnd(s.anchorNode, s.anchorOffset);
  return { at: [[...${TABLE}.rows].indexOf(c.parentElement), [...c.parentElement.cells].indexOf(c)], offset: r.toString().length };
})()`;
  const caret = (page) => page.evaluate(CARET);
  const B2 = `[...${TABLE}.querySelectorAll('td')].find((c) => c.textContent.trim() === 'B2')`;
  // the caret between the letters of the cell B2 of slide 2 of test/pages/editor-r13-3.html, after a
  // click into it
  async function caretInB2(page) {
    await click(page, await rect(page, B2));
    await wait(page);
    await page.evaluate(`(() => { const n = ${B2}.firstChild; getSelection().collapse(n, 1); return true; })()`);
    assert.deepEqual(await caret(page), { at: [1, 1], offset: 1 }, 'the caret is not in the cell B2');
  }
  // the commands, the cell of the caret after each, and their keys on Windows and Linux
  const ADDS = [
    ['table.rowAbove', [1, 1], 'Alt+ArrowUp'],
    ['table.rowBelow', [2, 1], 'Alt+ArrowDown'],
    ['table.columnBefore', [1, 1], 'Alt+ArrowLeft'],
    ['table.columnAfter', [1, 2], 'Alt+ArrowRight'],
  ];
  // the cell B2 after the undo of an add above or before it is at its place again
  const typedB2 = (page) => page.source.replace('<td>B2</td>', '<td>Bx2</td>');

  for (const platform of PLATFORMS) {
    test(`after an undo of an add made with the caret in a cell, the caret is back at its spot, and after a redo in the new cell (${platform})`, async (t) => {
      const page = await load(t, platform, BARS, 1);
      const routes = platform === 'other' ? ['menu', 'key'] : ['menu'];
      for (const route of routes) {
        for (const [id, added, key] of ADDS) {
          await caretInB2(page);
          if (route === 'key') await press(page, key);
          else await page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
          await wait(page);
          assert.deepEqual(await caret(page), { at: added, offset: 0 }, `the caret after ${id} by the ${route}`);
          await undo(page);
          await wait(page);
          assert.equal(await render(page), page.source);
          assert.deepEqual(await caret(page), { at: [1, 1], offset: 1 }, `the caret after the undo of ${id} by the ${route}`);
          await redo(page);
          await wait(page);
          assert.deepEqual(await caret(page), { at: added, offset: 0 }, `the caret after the redo of ${id} by the ${route}`);
          await undo(page);
          await wait(page);
          // the next letter is written at the spot of the caret
          await type(page, 'x');
          await wait(page);
          assert.equal(await render(page), typedB2(page), `the letter after the undo of ${id} by the ${route}`);
          await undo(page);
          await wait(page);
          assert.equal(await render(page), page.source);
        }
      }
      assert.deepEqual(errors(page), []);
    });
  }
});
