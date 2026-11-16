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

// whether page reads the caret of the person of name in the text element of expression
const caretOf = (page, name, expression) => page.evaluate(`${P}.resolved().some((r) => r.name === ${JSON.stringify(name)} && r.caret?.el === ${expression})`);

/** Ana types text at the end of the text element of expression, until Ben sees it held by her. */
async function holding(ana, ben, expression, text) {
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

test('a text selection from an item into a held item refuses Backspace, Delete, a typed letter, a cut, a paste, and a drop, and the holder keeps typing', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, BETA, ' typed by Ana');
  const before = await listOf(ben);
  await ben.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  const drop = async () => {
    const at = await center(ben, 'section.present li:nth-child(2)');
    const data = { items: [{ mimeType: 'text/plain', data: 'dropped' }], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await ben.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
  };
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
    // a text selection from offset 2 of Alpha to the same place in Beta
    await front(ben);
    await ben.evaluate(`(() => { const a = ${ALPHA}; a.focus(); getSelection().collapse(a.firstChild, 2); })()`);
    await press(ben, 'Shift+ArrowDown');
    await frame(ben);
    assert.ok(await ben.evaluate(`${C}.app.commands.enabled('text.flow.delete')`), `a text selection over both items for ${what}`);
    await unbubble(ben);
    await act();
    await frame(ben);
    assert.equal(await listOf(ben), before, `${what} leaves both items as they were`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, what);
  }
  assert.ok(await caretOf(ben, 'Ana', BETA), 'the caret of Ana stays in her item');
  await caretAtEnd(ana, BETA);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.equal(ITEMS(text), '<ul> <li>Alpha</li> <li>Beta typed by Ana more</li> </ul>');
  clean(ana);
  clean(ben);
});

test('a held paragraph refuses a paragraph style, a list style, and Enter, and the holder keeps typing', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await holding(ana, ben, SECOND, ' typed');
  const before = await ben.evaluate(`${SECOND}.outerHTML`);
  const cases = [
    ['text.style.subheading', () => ben.evaluate(`${C}.app.commands.run('text.style.subheading')`)],
    ['text.list.ul', () => ben.evaluate(`${C}.app.commands.run('text.list.ul')`)],
    ['Enter', () => press(ben, 'Enter')],
  ];
  for (const [what, act] of cases) {
    await front(ben);
    await ben.evaluate(`(() => { const p = ${SECOND}; p.focus(); getSelection().collapse(p.firstChild, 3); })()`);
    await unbubble(ben);
    await act();
    await frame(ben);
    assert.equal(await ben.evaluate(`${SECOND}?.outerHTML`), before, `${what} leaves the paragraph as it was`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, what);
  }
  assert.ok(await caretOf(ben, 'Ana', SECOND), 'the caret of Ana stays in her paragraph');
  await caretAtEnd(ana, SECOND);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<h2>Two<\/h2>\s*<p>Second slide typed more<\/p>\s*<ul>/);
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

const TABLE = `  <p>First slide</p>
  <table>
    <tr><th>A1</th><th>B1</th></tr>
    <tr><td>A2</td><td>B2</td></tr>
  </table>`;

test('a drag of the grip of a column, or of the edge of a table, whose cell is held is refused, and the holder keeps typing', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>First slide</p>', TABLE]] });
  await show(ana, 'One');
  await show(ben, 'One');
  const a2 = el(0, 'td');
  const table = el(0, 'table');
  await holding(ana, ben, a2, ' typed');
  // each case: how Ben shows the grip, and the grip. the grip of the last column sets its width,
  // and the grip at the right edge of the table selected as an object sets the widths of all
  const cases = [
    [() => click(ben, 'section.present th:nth-child(2)'), '.beeson-table-bars .grip[data-grip="1"]'],
    [async () => {
      await click(ben, 'section.present th:nth-child(2)');
      await press(ben, 'Escape');
      await press(ben, 'Escape');
    }, '.beeson-table-bars .beeson-grip[data-handle="e"]'],
  ];
  for (const [put, grip] of cases) {
    await put();
    await frame(ben);
    await unbubble(ben);
    await drag(ben, grip, { dx: 40 });
    await frame(ben);
    assert.ok(!(await ben.evaluate(`${table}.outerHTML`)).includes('width'), `a drag of ${grip} leaves the widths of the columns as they were`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, grip);
  }
  assert.ok(await caretOf(ben, 'Ana', a2), 'the caret of Ana stays in her cell');
  await caretAtEnd(ana, a2);
  await typeKeys(ana, ' more');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<td>A2 typed more<\/td><td>B2<\/td>/);
  assert.ok(!text.match(/<table>[\s\S]*?<\/table>/)[0].includes('width'), 'the widths are not saved');
  clean(ana);
  clean(ben);
});
