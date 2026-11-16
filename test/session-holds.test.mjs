// the holds of a session in Chrome, on the edit command started on a temporary talk folder: a key,
// a command, or a drag of one page that would move, delete, split, retag, or replace a text element
// that another page types in, or an element around it, is refused with the bubble, and the person
// who types keeps the caret and the next keys. a command that changes none of these is not refused

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, frame, front } from './helpers/apply.mjs';
import { C, clean, converge, loads, ONLINE, show } from './helpers/client.mjs';
import { center, click, drag, press, typeKeys } from './helpers/editor.mjs';
import { BUBBLE, el, HOLDER, leave, P, REFUSED, select, session, unbubble } from './helpers/presence.mjs';
import { until } from './helpers/session.mjs';

const ALPHA = el(1, 'li:nth-child(1)');
const BETA = el(1, 'li:nth-child(2)');
const SECOND = el(1, 'p');
const listOf = (page) => page.evaluate(`${el(1, 'ul')}.outerHTML`);
const ITEMS = (text) => text.match(/<ul>[\s\S]*?<\/ul>/)?.[0].replace(/\s+/g, ' ');
// the last element of slide Two whose text starts with text, i.e. its text element
const LAST = (text) => `[...${el(1, 'h2')}.parentElement.querySelectorAll('*')].findLast((e) => e.textContent.startsWith(${JSON.stringify(text)}))`;

// whether page reads the caret of the person of name in the text element of expression
const caretOf = (page, name, expression) => page.evaluate(`${P}.resolved().some((r) => r.name === ${JSON.stringify(name)} && r.caret?.el === ${expression})`);
// whether the focus of page is in the text element of expression
const caretIn = (page, expression) => page.evaluate(`(() => { const h = ${expression}; return document.activeElement === h && h.contains(getSelection().focusNode); })()`);

/** Ana types text at the end of the text element of expression, until Ben sees it held by her. */
async function holding(ana, ben, expression, text) {
  await front(ana);
  await caretAtEnd(ana, expression);
  await typeKeys(ana, text);
  await until(() => ben.evaluate(`${HOLDER(expression)} === 'Ana' && ${expression}.textContent.endsWith(${JSON.stringify(text)})`), 'the text element that Ana types in, with her text, to be held on the page of Ben');
}

// a key that the browser runs as an edit command of its own, e.g. the paste of the clipboard by
// Ctrl+V, or by Cmd+V on a Mac
const MOD = process.platform === 'darwin' ? 4 : 2;
async function edit(page, letter, command) {
  const base = { key: letter, code: `Key${letter.toUpperCase()}`, windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0), modifiers: MOD };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [command] });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

test('a text selection from an item into a held item refuses Backspace, Delete, a typed letter, a cut, a paste, and a drop, which a text selection over two items that are not held takes, and the holder keeps typing', { timeout: 180_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['    <li>Beta</li>\n', '    <li>Beta</li>\n    <li>Gamma</li>\n    <li>Delta</li>\n']] });
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, BETA, ' typed by Ana');
  // a clock of Ben far behind keeps the hold for the whole test
  await ben.evaluate(`${P}.skew = -1e8`);
  const before = await listOf(ben);
  await ben.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  const drop = async (n) => {
    const at = await center(ben, `section.present li:nth-child(${n})`);
    const data = { items: [{ mimeType: 'text/plain', data: 'dropped' }], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await ben.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
  };
  // each case: the act, given the place of the second item of its text selection
  const cases = [
    ['Backspace', () => press(ben, 'Backspace')],
    ['Delete', () => press(ben, 'Delete')],
    ['a typed letter', () => typeKeys(ben, 'X')],
    ['a cut', () => edit(ben, 'x', 'cut')],
    ['a paste', async () => {
      assert.equal(await ben.evaluate(`navigator.clipboard.writeText('word').then(() => true)`), true);
      await edit(ben, 'v', 'paste');
    }],
    ['a drop', drop],
  ];
  for (const [what, act] of cases) {
    // a text selection from offset 2 of item n - 1 to the same place in item n, first into the held
    // item and then over Gamma and Delta
    for (const n of [2, 4]) {
      await front(ben);
      await leave(ben);
      await frame(ben);
      await ben.evaluate(`(() => { const a = ${el(1, `li:nth-child(${n - 1})`)}; a.focus(); getSelection().collapse(a.firstChild, 2); })()`);
      await press(ben, 'Shift+ArrowDown');
      await frame(ben);
      assert.ok(await ben.evaluate(`${C}.app.commands.enabled('text.flow.delete')`), `a text selection over two items for ${what}`);
      await unbubble(ben);
      await act(n);
      await frame(ben);
      if (n === 2) {
        assert.equal(await listOf(ben), before, `${what} leaves both items as they were`);
        assert.equal(await ben.evaluate(BUBBLE), REFUSED, what);
        continue;
      }
      assert.notEqual(await listOf(ben), before, `${what} over two items that are not held is taken`);
      assert.equal(await ben.evaluate(BUBBLE), null, `${what} over two items that are not held`);
      assert.ok((await listOf(ben)).includes('<li contenteditable="true">Beta typed by Ana</li>'), `${what} over two items that are not held leaves the held item as it was`);
      // the act undone, so that the next case finds Gamma and Delta again
      for (let i = 0; i < 4 && (await listOf(ben)) !== before; i++) await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
      assert.equal(await listOf(ben), before, `${what} over two items that are not held is undone`);
    }
  }
  assert.ok(await caretOf(ben, 'Ana', BETA), 'the caret of Ana stays in her item');
  await caretAtEnd(ana, BETA);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.equal(ITEMS(text), '<ul> <li>Alpha</li> <li>Beta typed by Ana more</li> <li>Gamma</li> <li>Delta</li> </ul>');
  clean(ana);
  clean(ben);
});

test('a held paragraph refuses a paragraph style, a list style, and Enter, which a paragraph beside it takes, and the holder keeps typing', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['    <li>Beta</li>\n  </ul>', '    <li>Beta</li>\n  </ul>\n  <p>Third</p>']] });
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, SECOND, ' typed');
  // a clock of Ben far behind keeps the hold for the whole test
  await ben.evaluate(`${P}.skew = -1e8`);
  const before = await ben.evaluate(`${SECOND}.outerHTML`);
  const slide = `${el(1, 'h2')}.parentElement.innerHTML`;
  const cases = [
    ['text.style.subheading', () => ben.evaluate(`${C}.app.commands.run('text.style.subheading')`)],
    ['text.list.ul', () => ben.evaluate(`${C}.app.commands.run('text.list.ul')`)],
    ['Enter', () => press(ben, 'Enter')],
  ];
  for (const [what, act] of cases) {
    await front(ben);
    await leave(ben);
    await frame(ben);
    await ben.evaluate(`(() => { const p = ${SECOND}; p.focus(); getSelection().collapse(p.firstChild, 3); })()`);
    await unbubble(ben);
    await act();
    await frame(ben);
    assert.equal(await ben.evaluate(`${SECOND}?.outerHTML`), before, `${what} leaves the paragraph as it was`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, what);
    // the same act in the paragraph Third, which is not held
    const all = await ben.evaluate(slide);
    await leave(ben);
    await frame(ben);
    await ben.evaluate(`(() => { const p = ${LAST('Third')}; p.focus(); getSelection().collapse(p.firstChild, 3); })()`);
    await unbubble(ben);
    await act();
    await frame(ben);
    assert.notEqual(await ben.evaluate(slide), all, `${what} in a paragraph that is not held is taken`);
    assert.equal(await ben.evaluate(BUBBLE), null, `${what} in a paragraph that is not held`);
    assert.equal(await ben.evaluate(`${SECOND}?.outerHTML`), before, `${what} in a paragraph that is not held leaves the held paragraph as it was`);
    for (let i = 0; i < 4 && (await ben.evaluate(slide)) !== all; i++) await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
    assert.equal(await ben.evaluate(slide), all, `${what} in a paragraph that is not held is undone`);
  }
  assert.ok(await caretOf(ben, 'Ana', SECOND), 'the caret of Ana stays in her paragraph');
  await caretAtEnd(ana, SECOND);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<h2>Two<\/h2>\s*<p>Second slide typed more<\/p>\s*<ul>/);
  assert.match(text, /<\/ul>\s*<p>Third<\/p>/);
  clean(ana);
  clean(ben);
});

const FOURTH = LAST('Fourth');
// the elements of slide Two before the paragraph Fifth, and those from it on
const PART = (from) => `(() => { const c = [...${el(1, 'h2')}.parentElement.children]; const i = c.findIndex((e) => e.textContent.trim().startsWith('Fifth')); return c.slice(${from ? 'i' : '0, i'}).map((e) => e.outerHTML).join(''); })()`;
const HEAD = PART(false);
const TAIL = PART(true);

// a text selection from offset at of the text element of expression up into the one before it
async function spanUp(page, expression, at = 2) {
  await front(page);
  await leave(page);
  await frame(page);
  await page.evaluate(`(() => { const h = ${expression}; h.focus(); getSelection().collapse(h.firstChild, ${at}); })()`);
  await press(page, 'Shift+ArrowUp');
  await frame(page);
}

// the whole text of the text element of expression selected
async function whole(page, expression) {
  await front(page);
  await leave(page);
  await frame(page);
  await page.evaluate(`(() => { const h = ${expression}; h.focus(); const r = document.createRange(); r.selectNodeContents(h); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
  await frame(page);
}

test('a paragraph style, a list style, or Paste Style over a text selection from a held paragraph into the one before it is refused, and over two paragraphs that are not held it is taken', { timeout: 180_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['    <li>Beta</li>\n  </ul>', '    <li>Beta</li>\n  </ul>\n  <p>Third</p>\n  <p>Fourth</p>\n  <p>Fifth</p>\n  <p>Sixth</p>']] });
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, FOURTH, ' typed');
  // a clock of Ben far behind keeps the hold for the whole test
  await ben.evaluate(`${P}.skew = -1e8`);
  const before = await ben.evaluate(HEAD);
  // the style of a list item, which Paste Style sets with its list
  await caretAtEnd(ben, ALPHA);
  await ben.evaluate(`${C}.app.commands.run('text.copyStyle')`);
  // each case: the command, and how its text selection is made from a text element. a text
  // selection up from the held paragraph has its focus in the paragraph before it, and Paste Style
  // sets the list and the style of a text selection whose part in the focus is its whole text
  const fromStart = (page, expression) => spanUp(page, expression, 0);
  const cases = [
    ['text.list.ol', spanUp],
    ['text.list.none', spanUp],
    ['text.style.subheading', spanUp],
    ['text.pasteStyle', fromStart],
    ['text.pasteStyle', whole],
  ];
  for (const [id, put] of cases) {
    const what = `${id} over ${put === whole ? 'the whole text' : 'a text selection up into the paragraph before'}`;
    await put(ben, FOURTH);
    await unbubble(ben);
    await ben.evaluate(`${C}.app.commands.run(${JSON.stringify(id)})`);
    await frame(ben);
    assert.equal(await ben.evaluate(HEAD), before, `${what} of the held paragraph leaves it and the paragraph before as they were`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, `${what} of the held paragraph`);
    const tail = await ben.evaluate(TAIL);
    await put(ben, LAST('Sixth'));
    await unbubble(ben);
    await ben.evaluate(`${C}.app.commands.run(${JSON.stringify(id)})`);
    await frame(ben);
    assert.notEqual(await ben.evaluate(TAIL), tail, `${what} of paragraphs that are not held is taken`);
    assert.equal(await ben.evaluate(BUBBLE), null, `${what} of paragraphs that are not held`);
    assert.equal(await ben.evaluate(HEAD), before, `${what} of paragraphs that are not held leaves the held paragraph as it was`);
  }
  assert.ok(await caretOf(ben, 'Ana', FOURTH), 'the caret of Ana stays in her paragraph');
  await caretAtEnd(ana, FOURTH);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<p>Third<\/p>\s*<p>Fourth typed more<\/p>/);
  clean(ana);
  clean(ben);
});

const STYLE = (expression) => `${expression}.getAttribute('style')`;

test('a drag of the move handle, the rotate handle, or a grip of a held paragraph is refused, also by a touch on a phone, and the holder keeps typing', { timeout: 180_000 }, async (t) => {
  const { server, pages: [ana, ben, cy] } = await session(t, ['Ana', 'Ben', 'Cy'], { pages: [{}, {}, { width: 390, height: 844, mobile: true }] });
  for (const page of [ana, ben, cy]) await show(page, 'Two');
  await holding(ana, ben, SECOND, ' typed');
  for (const handle of ['.beeson-handle', '.beeson-rotor', '.beeson-grip[data-handle="e"]']) {
    await select(ben, SECOND);
    await frame(ben);
    await unbubble(ben);
    await drag(ben, handle, { dx: 60, dy: 50 });
    await frame(ben);
    assert.equal(await ben.evaluate(STYLE(SECOND)), null, `a drag of ${handle} leaves the paragraph in place`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, handle);
  }
  await until(() => cy.evaluate(`${HOLDER(SECOND)} === 'Ana'`), 'the paragraph to be held on the phone of Cy');
  await select(cy, SECOND);
  await frame(cy);
  await unbubble(cy);
  // the move handle is drawn beyond the left edge of the window of a phone, hence its grip is dragged
  const h = await center(cy, '.beeson-grip[data-handle="e"]');
  await cy.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [h] });
  for (let i = 1; i <= 8; i++) await cy.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: h.x + i * 8, y: h.y + i * 6 }] });
  await cy.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await frame(cy);
  assert.equal(await cy.evaluate(STYLE(SECOND)), null, 'a touch drag of the grip leaves the paragraph as it was');
  assert.equal(await cy.evaluate(BUBBLE), REFUSED, 'a touch drag of the grip');
  assert.ok(await caretOf(ben, 'Ana', SECOND), 'the caret of Ana stays in her paragraph');
  await caretAtEnd(ana, SECOND);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben, cy]);
  assert.match(text, /<p>Second slide typed more<\/p>/);
  clean(ana);
  clean(ben);
  clean(cy);
});

// the translate of the element of expression
const PLACE = (expression) => `${expression}.style.translate`;
const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });

test('a double click on the move handle of a held paragraph, or Enter on this handle, is refused, and on a paragraph beside it each puts the paragraph back', { timeout: 120_000 }, async (t) => {
  const edits = [['  <p>Second slide</p>', '  <p style="translate: 40px 30px">Second slide</p>'], ['    <li>Beta</li>\n  </ul>', '    <li>Beta</li>\n  </ul>\n  <p style="translate: 20px 10px">Third</p>']];
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits });
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, SECOND, ' typed');
  // a clock of Ben far behind keeps the hold for the whole test
  await ben.evaluate(`${P}.skew = -1e8`);
  const THIRD = LAST('Third');
  // each case: the act on the paragraph of expression, whose selector picks it on the current slide
  const cases = [
    ['a double click on the move handle', async (selector) => {
      await front(ben);
      const c = await center(ben, selector);
      await mouse(ben, 'mouseMoved', c.x, c.y);
      await frame(ben);
      const h = await center(ben, '.beeson-handle');
      await mouse(ben, 'mouseMoved', h.x, h.y);
      await click(ben, h, { count: 2 });
    }],
    ['Enter on the focused move handle', async (selector, expression) => {
      await select(ben, expression);
      await frame(ben);
      await ben.evaluate(`document.querySelector('.beeson-handle').focus()`);
      await press(ben, 'Enter');
    }],
  ];
  for (const [what, act] of cases) {
    for (const [expression, selector, held] of [[SECOND, 'section.present > p:first-of-type', true], [THIRD, 'section.present > p:last-of-type', false]]) {
      await leave(ben);
      await ben.evaluate(`${C}.app.selection.clear()`);
      const before = await ben.evaluate(PLACE(expression));
      await unbubble(ben);
      await act(selector, expression);
      await frame(ben);
      if (held) {
        assert.equal(await ben.evaluate(PLACE(expression)), before, `${what} leaves the held paragraph in its place`);
        assert.equal(await ben.evaluate(BUBBLE), REFUSED, what);
        continue;
      }
      assert.notEqual(await ben.evaluate(PLACE(expression)), before, `${what} puts a paragraph that is not held back`);
      assert.equal(await ben.evaluate(BUBBLE), null, `${what} of a paragraph that is not held`);
      await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
      assert.equal(await ben.evaluate(PLACE(expression)), before, `${what} of a paragraph that is not held is undone`);
    }
  }
  assert.ok(await caretOf(ben, 'Ana', SECOND), 'the caret of Ana stays in her paragraph');
  await caretAtEnd(ana, SECOND);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<p style="translate: 40px 30px">Second slide typed more<\/p>/);
  clean(ana);
  clean(ben);
});

test('a drag of the move handle of a paragraph that becomes held during the drag puts the paragraph back at the release, and a drag of a paragraph beside it is taken', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['    <li>Beta</li>\n  </ul>', '    <li>Beta</li>\n  </ul>\n  <p>Third</p>']] });
  await show(ana, 'Two');
  await show(ben, 'Two');
  await select(ben, SECOND);
  await frame(ben);
  const h = await center(ben, '.beeson-handle');
  await mouse(ben, 'mouseMoved', h.x, h.y);
  await mouse(ben, 'mousePressed', h.x, h.y, { button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 5; i++) await mouse(ben, 'mouseMoved', h.x + i * 10, h.y + i * 8, { button: 'left', buttons: 1 });
  assert.notEqual(await ben.evaluate(PLACE(SECOND)), '', 'the paragraph follows the drag before it is held');
  await holding(ana, ben, SECOND, ' typed');
  // a clock of Ben far behind keeps the hold for the whole test
  await ben.evaluate(`${P}.skew = -1e8`);
  await front(ben);
  await unbubble(ben);
  await mouse(ben, 'mouseMoved', h.x + 60, h.y + 48, { button: 'left', buttons: 1 });
  await mouse(ben, 'mouseReleased', h.x + 60, h.y + 48, { button: 'left', clickCount: 1 });
  await frame(ben);
  assert.equal(await ben.evaluate(PLACE(SECOND)), '', 'the release puts the held paragraph back');
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the release of a drag of a held paragraph');
  const THIRD = LAST('Third');
  await select(ben, THIRD);
  await frame(ben);
  await unbubble(ben);
  await drag(ben, '.beeson-handle', { dx: 60, dy: 50 });
  await frame(ben);
  assert.notEqual(await ben.evaluate(PLACE(THIRD)), '', 'a drag of a paragraph that is not held moves it');
  assert.equal(await ben.evaluate(BUBBLE), null, 'a drag of a paragraph that is not held');
  assert.ok(await caretOf(ben, 'Ana', SECOND), 'the caret of Ana stays in her paragraph');
  await caretAtEnd(ana, SECOND);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<p>Second slide typed more<\/p>/);
  assert.match(text, /<p style="translate: [^"]+">Third<\/p>/);
  clean(ana);
  clean(ben);
});

const TABLE = `  <p>First slide</p>
  <table>
    <tr><th>A1</th><th>B1</th></tr>
    <tr><td>A2</td><td>B2</td></tr>
    <tr><td>A3</td><td>B3</td></tr>
  </table>`;
const OTHER = `  <p>Second slide</p>
  <table>
    <tr><th>C1</th><th>D1</th></tr>
    <tr><td>C2</td><td>D2</td></tr>
    <tr><td>C3</td><td>D3</td></tr>
  </table>`;
// the classes that a drag of a table puts on the page while it runs
const GESTURES = ['beeson-column-resizing', 'beeson-resizing', 'beeson-line-moving', 'beeson-line-refused', 'beeson-autofilling'];

test('a drag of the grip of a column, of the edge of a table, of the bar of a row, or of the fill handle, in a table whose cell is held, is refused at its first move, the same drag in a table that is not held is taken, and the holder keeps typing', { timeout: 180_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>First slide</p>', TABLE], ['  <p>Second slide</p>', OTHER]] });
  await show(ana, 'One');
  await show(ben, 'One');
  const a2 = el(0, 'td');
  await holding(ana, ben, a2, ' typed');
  // a clock of Ben far behind keeps the hold for the whole test
  await ben.evaluate(`${P}.skew = -1e8`);
  const rows = (n) => ben.evaluate(`[...${el(n, 'table')}.rows].map((r) => { const b = r.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; })`);
  const run = (id) => ben.evaluate(`${C}.app.commands.run(${JSON.stringify(id)})`);
  // each case: how Ben shows the grip on the slide of index n, the grip or its point, and how far it
  // is dragged.
  // the grip of the last column sets its width, the grip at the right edge of the table selected as
  // an object sets the widths of all, the bar of the third row moves it above the second, and the
  // fill handle of the first row fills the second
  const cases = [
    ['the grip of a column', () => click(ben, 'section.present th:nth-child(2)'), '.beeson-table-bars .grip[data-grip="1"]', async () => ({ dx: 40 })],
    ['the edge of the table', async () => {
      await click(ben, 'section.present th:nth-child(2)');
      await press(ben, 'Escape');
      await press(ben, 'Escape');
    }, '.beeson-table-bars .beeson-grip[data-handle="e"]', async () => ({ dx: 40 })],
    ['the bar of a row', async () => {
      await click(ben, 'section.present tr:nth-child(3) td');
      await run('table.selectRow');
      // the segment of the third row is pressed at its top, which no other control covers
    }, () => ben.evaluate(`(() => { const r = document.querySelector('.beeson-table-bars .bar.rows > [data-index="2"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 4 }; })()`), async (n, from) => ({ dy: (await rows(n))[1].top + 4 - from.y })],
    ['the fill handle', async () => {
      await click(ben, 'section.present th');
      await run('table.selectRow');
    }, '.beeson-table-bars .fill', async (n, from) => ({ dy: (await rows(n))[1].bottom - 4 - from.y })],
  ];
  for (const [what, put, grip, far] of cases) {
    for (const [n, heading] of [[0, 'One'], [1, 'Two']]) {
      const table = el(n, 'table');
      await show(ben, heading);
      await leave(ben);
      await ben.evaluate(`${C}.app.selection.clear()`);
      await put();
      await frame(ben);
      const before = await ben.evaluate(`${C}.app.doc.elementText(${table})`);
      await unbubble(ben);
      const from = typeof grip === 'string' ? await center(ben, grip) : await grip();
      const { dx = 0, dy = 0 } = await far(n, from);
      await drag(ben, from, { dx, dy, steps: 12, hold: true });
      if (n === 0) {
        assert.equal(await ben.evaluate(BUBBLE), REFUSED, `a drag of ${what} is refused before its release`);
        assert.deepEqual(await ben.evaluate(`${JSON.stringify(GESTURES)}.filter((c) => document.documentElement.classList.contains(c))`), [], `a refused drag of ${what} ends at its first move`);
        assert.ok(!(await ben.evaluate(`${table}.outerHTML`)).includes('style'), `a refused drag of ${what} does not change the table on the page`);
        assert.equal(await ben.evaluate(`!!document.querySelector('.beeson-table-bars .spread:not([hidden])')`), false, `a refused drag of ${what} does not mark cells to fill`);
      }
      await unbubble(ben);
      await ben.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x + dx, y: from.y + dy, button: 'left', clickCount: 1 });
      await frame(ben);
      const after = await ben.evaluate(`${C}.app.doc.elementText(${table})`);
      if (n === 0) {
        assert.equal(after, before, `a refused drag of ${what} leaves the table as it was`);
        assert.ok(!(await ben.evaluate(`${table}.outerHTML`)).includes('style'), `a refused drag of ${what} leaves no style on the page`);
        assert.equal(await ben.evaluate(BUBBLE), null, `the release of a refused drag of ${what} is not refused again`);
        continue;
      }
      assert.notEqual(after, before, `a drag of ${what} in a table that is not held is taken`);
      assert.equal(await ben.evaluate(BUBBLE), null, `a drag of ${what} in a table that is not held`);
      await run('edit.undo');
      assert.equal(await ben.evaluate(`${C}.app.doc.elementText(${table})`), before, `a drag of ${what} in a table that is not held is undone`);
    }
  }
  assert.ok(await caretOf(ben, 'Ana', a2), 'the caret of Ana stays in her cell');
  await caretAtEnd(ana, a2);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<tr><th>A1<\/th><th>B1<\/th><\/tr>\s*<tr><td>A2 typed more<\/td><td>B2<\/td><\/tr>\s*<tr><td>A3<\/td><td>B3<\/td><\/tr>/);
  assert.ok(!text.match(/<table>[\s\S]*?<\/table>/)[0].includes('width'), 'the widths are not saved');
  clean(ana);
  clean(ben);
});

test('a drag in the navigator of a slide where a text element is held is refused at its first move, and a drag of another slide is taken', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, SECOND, ' typed');
  // a clock of Ben far behind keeps the hold for the whole test
  await ben.evaluate(`${P}.skew = -1e8`);
  const ORDER = `[...document.querySelectorAll('.reveal .slides > section')].map((s) => s.querySelector('h2').textContent).join(',')`;
  // the paragraph of slide Two, wherever the slide is
  const p = `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2').textContent === 'Two').querySelector('p')`;
  const row = (n) => center(ben, `.beeson-edit-nav .row:nth-of-type(${n})`);
  await front(ben);
  const [one, two] = [await row(1), await row(2)];
  await unbubble(ben);
  await drag(ben, two, { dy: one.y - two.y - 20, steps: 12, hold: true });
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'a drag of the slide of the held element is refused before its release');
  assert.equal(await ben.evaluate(`!!document.querySelector('.beeson-edit-ghost')`), false, 'a refused drag of a slide ends at its first move');
  await unbubble(ben);
  await ben.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: two.x, y: one.y - 20, button: 'left', clickCount: 1 });
  await frame(ben);
  assert.equal(await ben.evaluate(ORDER), 'One,Two', 'a refused drag leaves the slides in their order');
  assert.equal(await ben.evaluate(BUBBLE), null, 'the release of a refused drag is not refused again');
  await drag(ben, one, { dy: two.y - one.y + 30, steps: 12 });
  await frame(ben);
  assert.equal(await ben.evaluate(ORDER), 'Two,One', 'a drag of a slide where nothing is held is taken');
  assert.equal(await ben.evaluate(BUBBLE), null, 'a drag of a slide where nothing is held');
  assert.ok(await caretOf(ben, 'Ana', p), 'the caret of Ana stays in her paragraph');
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<h2>Two<\/h2>\s*<p>Second slide typed more<\/p>[\s\S]*<h2>One<\/h2>/);
  clean(ana);
  clean(ben);
});

const PLATE = `  <p>First slide</p>
  <div class="plate row">
    <figure id="first"><img src="brand/logo.png" alt="A"><figcaption class="caption">The first figure.</figcaption></figure>
    <figure id="second"><img src="brand/logo.png" alt="B"><figcaption class="caption">The second figure.</figcaption></figure>
  </div>`;
const SELECTED = `window.BeesonEditor.selection().map((e) => e.localName + (e.id ? '#' + e.id : '') + (e.classList.contains('plate') ? '.plate' : ''))`;

test('a drag of a figure whose caption is held, or of the plate around it, is refused, and a click on the figure is not', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>First slide</p>', PLATE]] });
  await show(ana, 'One');
  await show(ben, 'One');
  const caption = el(0, '#first figcaption');
  await holding(ana, ben, caption, ' typed');
  const image = 'section.present #first img';
  for (const [what, before] of [['a drag on the figure', null], ['a drag of the selected plate', () => select(ben, el(0, '.plate'))]]) {
    await front(ben);
    await ben.evaluate(`${C}.app.selection.clear()`);
    await before?.();
    await unbubble(ben);
    await drag(ben, image, { dx: 80, dy: 60 });
    await frame(ben);
    assert.equal(await ben.evaluate(`${el(0, '.plate')}.outerHTML.includes('style=')`), false, `${what} leaves the plate and its figures in place`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, what);
  }
  await ben.evaluate(`${C}.app.selection.clear()`);
  await unbubble(ben);
  await click(ben, image);
  await frame(ben);
  assert.notDeepEqual(await ben.evaluate(SELECTED), [], 'a click on the figure selects');
  assert.equal(await ben.evaluate(BUBBLE), null, 'a click is not refused');
  assert.ok(await caretOf(ben, 'Ana', caption), 'the caret of Ana stays in the caption');
  await caretAtEnd(ana, caption);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<div class="plate row">\s*<figure id="first">/);
  assert.match(text, /The first figure\. typed more<\/figcaption>/);
  clean(ana);
  clean(ben);
});

const FIGURE = '<figure id="first"><img src="brand/logo.png" alt="A"><figcaption class="caption">The first figure.</figcaption></figure>';
const THREE = `<section>
  <h2>Three</h2>
  <figure id="second"><img src="brand/logo.png" alt="B"><figcaption class="caption">The second figure.</figcaption></figure>
  <div class="foot">Another note</div>
</section>`;

test('Caption off, Footnote off, and a layout of the slide are refused when they would take off a held caption or footnote, and taken on a slide where nothing is held', { timeout: 180_000 }, async (t) => {
  const edits = [
    ['  <p>First slide</p>', `  <p>First slide</p>\n  ${FIGURE}`],
    ['  <p>Second slide</p>', '  <p>Second slide</p>\n  <div class="foot">A note</div>'],
    ['  </ul>\n</section>\n', `  </ul>\n</section>\n\n${THREE}\n`],
  ];
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits });
  await show(ana, 'One');
  await show(ben, 'One');
  const caption = el(0, 'figcaption');
  const foot = el(1, '.foot');
  const slide = (n) => `${C}.app.doc.elementText(document.querySelectorAll('.reveal .slides > section')[${n}])`;
  const none = async () => {
    await front(ben);
    await leave(ben);
    await ben.evaluate(`${C}.app.selection.clear()`);
  };
  const run = async (id) => {
    await unbubble(ben);
    await ben.evaluate(`${C}.app.commands.run(${JSON.stringify(id)})`);
    await frame(ben);
  };
  // each case: the command, how Ben selects on the slide of index n, and the element that it takes off
  const cases = [
    ['figure.caption with the picture selected', 'figure.caption', (n) => select(ben, el(n, 'img')), (n) => el(n, 'figcaption')],
    ['figure.caption with a caret in the caption', 'figure.caption', async (n) => {
      await none();
      await ben.evaluate(`(() => { const c = ${el(n, 'figcaption')}; c.focus(); getSelection().collapse(c.firstChild, 3); })()`);
      await frame(ben);
    }, (n) => el(n, 'figcaption')],
    ['slide.layout.title with nothing selected', 'slide.layout.title', none, null],
    ['slide.footnote with nothing selected', 'slide.footnote', none, (n) => el(n, '.foot')],
  ];
  // the slide of the held element of each case, and the third slide, where nothing is held
  const holds = [[caption, 0, 'One'], [caption, 0, 'One'], [caption, 0, 'One'], [foot, 1, 'Two']];
  for (const [i, [what, id, put, off]] of cases.entries()) {
    const [held, n, heading] = holds[i];
    if (held !== holds[i - 1]?.[0]) {
      await show(ana, heading);
      await holding(ana, ben, held, ' typed');
      // a clock of Ben far behind keeps the hold for the whole test
      await ben.evaluate(`${P}.skew = -1e8`);
    }
    await show(ben, heading);
    await put(n);
    const before = await ben.evaluate(slide(n));
    await run(id);
    assert.equal(await ben.evaluate(slide(n)), before, `${what} leaves the slide of the held element as it was`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, what);
    await show(ben, 'Three');
    await put(2);
    const three = await ben.evaluate(slide(2));
    await run(id);
    assert.notEqual(await ben.evaluate(slide(2)), three, `${what} on a slide where nothing is held is taken`);
    assert.equal(await ben.evaluate(BUBBLE), null, `${what} on a slide where nothing is held`);
    if (off) assert.equal(await ben.evaluate(`${off(2)} === null`), true, `${what} on a slide where nothing is held takes off its element`);
    for (let k = 0; k < 4 && (await ben.evaluate(slide(2))) !== three; k++) await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
    assert.equal(await ben.evaluate(slide(2)), three, `${what} on a slide where nothing is held is undone`);
  }
  assert.ok(await caretOf(ben, 'Ana', foot), 'the caret of Ana stays in the footnote');
  await caretAtEnd(ana, foot);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /The first figure\. typed<\/figcaption><\/figure>/);
  assert.match(text, /<div class="foot">A note typed more<\/div>/);
  clean(ana);
  clean(ben);
});

const PREVIEWS = ['slide.previewTransition', 'slide.guides.copy', 'steps.preview', 'steps.playFrom', 'backdrop.preview', 'preview.backdrop', 'preview.selectBackdrop'];

test('a held paragraph selected as an element takes Enter, Escape, Tab, PageUp, New Slide, Text Box, Copy Style, Format, Comment, a preview, and Copy Guides', { timeout: 180_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, SECOND, ' typed');
  const kind = () => ben.evaluate(`${C}.app.selection.kind`);
  const slides = `document.querySelectorAll('.reveal .slides > section').length`;
  const drafts = `[...document.querySelectorAll('.beeson-comments textarea')].filter((x) => x.getClientRects().length).length`;
  // each case: what Ben does with the held paragraph selected, and what holds once it is done
  const cases = [
    ['Enter', () => press(ben, 'Enter'), async () => (await kind()) === 'text' && (await caretIn(ben, SECOND))],
    ['Escape', () => press(ben, 'Escape'), async () => (await kind()) === 'none'],
    ['Tab', () => press(ben, 'Tab'), () => ben.evaluate(`(() => { const s = window.BeesonEditor.selection(); return s.length === 1 && s[0] !== ${SECOND}; })()`)],
    ['PageUp', () => press(ben, 'PageUp'), () => ben.evaluate(`Reveal.getCurrentSlide().querySelector('h2').textContent === 'One'`)],
    ['slide.new', async () => {
      await ben.evaluate(`window.__slides = ${slides}`);
      await ben.evaluate(`${C}.app.commands.run('slide.new')`);
    }, () => ben.evaluate(`${slides} === window.__slides + 1`)],
    ['insert.text', async () => {
      await ben.evaluate(`window.__boxes = Reveal.getCurrentSlide().querySelectorAll('p').length`);
      await ben.evaluate(`${C}.app.commands.run('insert.text')`);
    }, () => ben.evaluate(`Reveal.getCurrentSlide().querySelectorAll('p').length === window.__boxes + 1`)],
    ['text.copyStyle', () => ben.evaluate(`${C}.app.commands.run('text.copyStyle')`), () => ben.evaluate(`${C}.app.commands.enabled('text.pasteStyle')`)],
    ['shell.format', async () => {
      await ben.evaluate(`window.__format = ${C}.app.commands.state('shell.format').checked`);
      await ben.evaluate(`${C}.app.commands.run('shell.format')`);
    }, () => ben.evaluate(`${C}.app.commands.state('shell.format').checked === !window.__format`)],
    ['insert.comment', () => ben.evaluate(`${C}.app.commands.run('insert.comment')`), () => ben.evaluate(`${drafts} === 1`)],
    ['insert.comment from a context menu', () => ben.evaluate(`${C}.app.commands.run('insert.comment', { kind: 'element', target: ${SECOND} })`), () => ben.evaluate(`${drafts} === 1`)],
    // a preview and Copy Guides change nothing in the deck
    ['a preview or Copy Guides', () => null, () => ben.evaluate(`${JSON.stringify(PREVIEWS)}.every((id) => !${C}.app.commands.refused(id))`)],
  ];
  for (const [what, act, done] of cases) {
    await show(ben, 'Two');
    // the caret of Ben that Enter put into the paragraph is taken out first
    await leave(ben);
    await select(ben, SECOND);
    await frame(ben);
    await unbubble(ben);
    await act();
    await frame(ben);
    assert.equal(await ben.evaluate(BUBBLE), null, `${what} is not refused`);
    await until(done, `${what} to do what it does without a hold`, 5000);
  }
  clean(ana);
  clean(ben);
});

// the commands that leave a selected element as it is, and those that change it
const TAKEN = ['insert.shape.rectangle', 'insert.line', 'insert.arrow', 'insert.table', 'insert.tableSize', 'insert.formula', 'insert.code', 'insert.theorem', 'insert.qr', 'insert.image', 'insert.video', 'insert.file', 'insert.footnote', 'insert.backdrop', 'find.matchCase', 'find.wholeWords', 'find.tex', 'find.scopeAll', 'find.scopeNotes', 'find.scopeAlt', 'notes.zoomIn', 'notes.zoomOut', 'notes.zoomReset', 'slide.duplicate', 'slide.gallery', 'slide.transition.fade', 'play.rehearse', 'play.useTimings', 'play.clearTimings', 'text.bold', 'text.italic', 'text.code', 'text.strike', 'text.superscript', 'text.subscript', 'text.tone.text', 'text.link', 'text.removeLink', 'text.clear'];
const KEPT = ['steps.add', 'insert.citation', 'element.delete', 'arrange.nudge.right.far', 'find.replaceAll', 'text.bigger', 'slide.magicMove'];

test('a held paragraph selected as an element takes a new shape, table, or slide, the options of Find, the zoom of the notes, a transition, the timings, and the formats of text, and refuses a step, a citation, and a delete', { timeout: 180_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, SECOND, ' typed');
  // a clock of Ben far behind keeps the hold for the whole test
  await ben.evaluate(`${P}.skew = -1e8`);
  const ids = JSON.stringify([...TAKEN, ...KEPT]);
  assert.deepEqual(await ben.evaluate(`${ids}.filter((id) => !${C}.app.commands.get(id))`), [], 'every command is registered');
  const parent = `${SECOND}.parentElement === Reveal.getSlides()[1]`;
  const reselect = async () => {
    await show(ben, 'Two');
    await leave(ben);
    await select(ben, SECOND);
    await frame(ben);
    await unbubble(ben);
  };
  await reselect();
  assert.deepEqual(await ben.evaluate(`${JSON.stringify(TAKEN)}.filter((id) => ${C}.app.commands.refused(id))`), [], 'none of the commands that leave the paragraph as it is is refused');
  for (const id of KEPT) {
    await reselect();
    assert.equal(await ben.evaluate(`${C}.app.commands.refused(${JSON.stringify(id)})`), true, `${id} is refused`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, `${id} shows the bubble`);
  }
  // each case: what Ben runs with the held paragraph selected, and what holds once it is done
  const slides = `document.querySelectorAll('.reveal .slides > section').length`;
  const count = (selector) => `Reveal.getSlides()[1].querySelectorAll(${JSON.stringify(selector)}).length`;
  const cases = [
    ['insert.shape.rectangle', { box: { left: 200, top: 600, width: 200, height: 100 } }, `${count('.shape')} === 1`],
    ['insert.table', { rows: 2, columns: 2 }, `${count('table')} === 1`],
    ['slide.duplicate', null, `${slides} === 3`],
    ['find.matchCase', null, `${C}.app.commands.state('find.matchCase').checked === true`],
    ['text.bold', null, `!!${SECOND}.querySelector('b, strong')`],
  ];
  await ben.evaluate(`${C}.app.commands.run('find.open')`);
  for (const [id, arg, done] of cases) {
    await reselect();
    await ben.evaluate(`${C}.app.commands.run(${JSON.stringify(id)}, ${JSON.stringify(arg)} ?? undefined)`);
    await frame(ben);
    assert.equal(await ben.evaluate(BUBBLE), null, `${id} is not refused`);
    await until(() => ben.evaluate(done), `${id} to do what it does without a hold`, 5000);
    assert.ok(await ben.evaluate(parent), `${id} leaves the paragraph in its slide`);
  }
  await front(ana);
  await caretAtEnd(ana, SECOND);
  await typeKeys(ana, ' more');
  await until(() => /<p><(b|strong)>Second slide typed more<\/\1><\/p>|<p><(b|strong)>Second slide typed<\/\2> more<\/p>/.test(server.read()), 'the keys of Ana to reach index.html');
  clean(ana);
  clean(ben);
});

test('Insert Backdrop and a drawing of the backdrop are refused on a slide whose backdrop has a held label, and taken on a slide whose backdrop does not', { timeout: 120_000 }, async (t) => {
  const edits = [['  <p>First slide</p>', '  <p>First slide</p>\n  <div class="backdrop" data-backdrop="wideRibbon"><span class="label" data-at="earth">Earth</span></div>'], ['  <p>Second slide</p>', '  <p>Second slide</p>\n  <div class="backdrop" data-backdrop="wideRibbon"></div>']];
  const { pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits });
  await show(ana, 'One');
  await show(ben, 'One');
  const label = el(0, '.label');
  await holding(ana, ben, label, ' typed');
  await ben.evaluate(`${P}.skew = -1e8`);
  const gallery = `!!document.querySelector('.beeson-backdrop-gallery')`;
  // the drawing of a file, which takes the labels off a backdrop, and a built-in drawing
  for (const [slide, n, drawing] of [['One', 0, 'logo'], ['Two', 1, 'tubes']]) {
    const backdrop = el(n, '.backdrop');
    const before = await ben.evaluate(`${C}.app.doc.elementText(${backdrop})`);
    for (const [id, arg] of [['insert.backdrop'], ['backdrop.builtIn', { value: drawing }]]) {
      await show(ben, slide);
      await leave(ben);
      await ben.evaluate(`${C}.app.selection.clear()`);
      await unbubble(ben);
      await ben.evaluate(`${C}.app.commands.run(${JSON.stringify(id)}, ${JSON.stringify(arg ?? null)} ?? undefined)`);
      await frame(ben);
      if (slide === 'One') {
        assert.equal(await ben.evaluate(BUBBLE), REFUSED, `${id} is refused over the held label`);
        assert.equal(await ben.evaluate(gallery), false, `${id} leaves the gallery closed`);
        assert.equal(await ben.evaluate(`${C}.app.doc.elementText(${backdrop})`), before, `${id} leaves the backdrop and its label`);
      } else {
        assert.equal(await ben.evaluate(BUBBLE), null, `${id} is not refused on a backdrop without a held label`);
        if (id === 'insert.backdrop') {
          await until(() => ben.evaluate(gallery), 'the gallery to open', 10_000);
          await press(ben, 'Escape');
        } else assert.equal(await ben.evaluate(`${backdrop}.dataset.backdrop`), 'tubes', `${id} draws the backdrop anew`);
      }
    }
  }
  clean(ana);
  // the gallery looks for the file of the Broucke drawing, which the talk does not have
  clean(ben, [/status of 404 .*demo\/broucke-sample\.js/]);
});

test('a page that loads after a person stopped typing does not see the text element of their caret as held', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, SECOND, ' typed');
  await until(() => ben.evaluate(`${P}.resolved().some((r) => r.name === 'Ana' && r.caret && !r.typing)`), 'Ana to stop typing on the page of Ben');
  // the 30 s of the hold pass on the clock of Ben
  await ben.evaluate(`${P}.skew = 31000`);
  assert.equal(await ben.evaluate(`${P}.holds.size`), 0, 'the hold ends after 30 s');
  const count = await loads(ben);
  await ben.evaluate('location.reload()').catch(() => {});
  await until(async () => (await loads(ben).catch(() => 0)) > count, 'the page of Ben to load again');
  await ben.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await ben.waitFor(ONLINE);
  await front(ben);
  await until(() => caretOf(ben, 'Ana', SECOND), 'the caret of Ana to be read on the new page of Ben');
  assert.equal(await ben.evaluate(HOLDER(SECOND)), null, 'the paragraph is not held on the new page');
  clean(ana);
  clean(ben);
});
