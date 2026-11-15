// the floor rule of a session in Chrome, on the edit command started on a temporary talk folder: a
// command of one page that would change a text element that another page holds is refused with
// the bubble, also when the command reaches the element from a neighbor, from its table, or from
// an entry of the history

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { C, clean, converge, show } from './helpers/client.mjs';
import { press, typeKeys } from './helpers/editor.mjs';
import { BUBBLE, el, hold, leave, LOCKED, P, REFUSED, release, session, unbubble } from './helpers/presence.mjs';
import { until } from './helpers/session.mjs';

const TABLE = `  <p>First slide</p>
  <table>
    <tr><th>A1</th><th>B1</th></tr>
    <tr><td>A2</td><td>B2</td></tr>
  </table>`;
const tableOf = (text) => text.match(/<table>[\s\S]*?<\/table>/)?.[0];

test('a held table cell refuses Delete Column, Delete Row, and a paste of cells from another cell of its table', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>First slide</p>', TABLE]] });
  await show(ana, 'One');
  await show(ben, 'One');
  const a2 = el(0, 'td');
  await caretAtEnd(ana, a2);
  await typeKeys(ana, ' typed');
  await until(() => ben.evaluate(`${LOCKED(a2)} && ${a2}.textContent === 'A2 typed'`), 'the cell that Ana holds, with her text, to be locked on the page of Ben');
  const before = await ben.evaluate(`${el(0, 'table')}.outerHTML`);
  for (const [cell, id, arg] of [['th', 'table.deleteColumn'], ['td:nth-child(2)', 'table.deleteRow'], ['th', 'edit.paste', 'p\tq\nr\ts']]) {
    await unbubble(ben);
    await caretAtEnd(ben, el(0, cell));
    // the command is offered as before
    assert.ok(await ben.evaluate(`${C}.app.commands.enabled(${JSON.stringify(id)})`), `${id} is enabled`);
    await ben.evaluate(`${C}.app.commands.run(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
    assert.equal(await ben.evaluate(`${el(0, 'table')}.outerHTML`), before, `${id} leaves the table as it was`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, id);
  }
  await leave(ben);
  const text = await converge(server, [ana, ben]);
  assert.match(tableOf(text), /<td>A2 typed<\/td><td>B2<\/td>/);
  assert.equal(await ana.evaluate(`${P}.held === ${a2}`), true, 'Ana still holds the cell');
  clean(ana);
  clean(ben);
});

const caretAtStart = async (page, expression) => {
  await front(page);
  assert.ok(await page.evaluate(`(() => { const h = ${expression}; h.focus(); getSelection().collapse(h.firstChild ?? h, 0); return document.activeElement === h; })()`), `the caret is at the start of ${expression}`);
};
const listOf = (page) => page.evaluate(`${el(1, 'ul')}.outerHTML`);

test('a held list item refuses Backspace and Delete from the item beside it, and Tab from the item after it', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['    <li>Beta</li>', '    <li>Beta</li>\n    <li>Gamma</li>']] });
  await show(ana, 'Two');
  await show(ben, 'Two');
  const item = (n) => el(1, `li:nth-child(${n})`);
  // each case: the item that Ana holds, where Ben puts the caret, and the key that Ben presses
  const cases = [
    [1, () => caretAtStart(ben, item(2)), 'Backspace'],
    [2, () => caretAtEnd(ben, item(1)), 'Delete'],
    [2, () => caretAtEnd(ben, item(3)), 'Tab'],
  ];
  for (const [held, put, key] of cases) {
    // the item that Ben left is free on the page of Ana
    await until(() => ana.evaluate(`${P}.locks.size === 0`), 'the items to be free on the page of Ana');
    await front(ana);
    await caretAtEnd(ana, item(held));
    await until(() => ben.evaluate(`${P}.locks.size === 1 && ${LOCKED(item(held))}`), `the item ${held} that Ana holds to be locked on the page of Ben`);
    const before = await listOf(ben);
    await put();
    await unbubble(ben);
    await press(ben, key);
    assert.equal(await listOf(ben), before, `${key} leaves the list as it was when Ana holds the item ${held}`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, key);
    await leave(ben);
  }
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<li>Alpha<\/li>\s*<li>Beta<\/li>\s*<li>Gamma<\/li>/);
  clean(ana);
  clean(ben);
});

test('Undo and Redo are refused as a whole when a part of their entry changes a held text element, and the entry is kept', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  const free = (page) => until(() => page.evaluate(`${P}.locks.size === 0 && !${C}.resolved().some((r) => r.held)`), 'no text element to be held');

  // a redo of typing
  await caretAtEnd(ben, p);
  await typeKeys(ben, ' by Ben');
  await converge(server, [ana, ben]);
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  await converge(server, [ana, ben]);
  await leave(ben);
  await free(ana);
  await caretAtEnd(ana, p);
  await until(() => ben.evaluate(LOCKED(p)), 'the paragraph that Ana holds to be locked on the page of Ben');
  await unbubble(ben);
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.redo')`);
  assert.equal(await ben.evaluate(`${p}.textContent`), 'Second slide', 'the redo leaves the held paragraph as it was');
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'edit.redo');
  assert.equal(await ben.evaluate(`${C}.app.history.canRedo`), true, 'the entry of the redo is kept');
  await front(ana);
  await leave(ana);
  await free(ben);

  // an undo of a command, whose entry is a transaction
  await front(ben);
  await ben.evaluate(`${C}.app.selection.set('elements', [${p}])`);
  await ben.evaluate(`${C}.app.commands.run('text.bigger')`);
  await converge(server, [ana, ben]);
  await ben.evaluate(`${C}.app.selection.clear()`);
  const h3 = el(1, 'h3');
  await caretAtEnd(ana, h3);
  await until(() => ben.evaluate(LOCKED(h3)), 'the subheading that Ana holds to be locked on the page of Ben');
  await unbubble(ben);
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(`${h3}?.isConnected ?? false`), true, 'the undo leaves the held subheading in place');
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'edit.undo');
  assert.equal(await ben.evaluate(`${C}.app.history.undoLabel`), 'Bigger', 'the entry of the undo is kept');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<h3>Second slide<\/h3>/);
  clean(ana);
  clean(ben);
});

test('the bubble of a refusal for a text element on another slide names the slide, at the top of the window', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'One');
  await caretAtEnd(ana, el(1, 'p'));
  await until(() => ben.evaluate(`${P}.locks.size === 1`), 'the paragraph that Ana holds to be locked on the page of Ben');
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('slide.moveTo', { slides: [document.querySelectorAll('.reveal .slides > section')[1]], gap: 0 })`);
  const shown = await ben.evaluate(`(() => { const b = document.querySelector('.beeson-bubble'); if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.textContent, center: r.left + r.width / 2, top: r.top, middle: innerWidth / 2 }; })()`);
  assert.equal(shown?.text, 'Ana is typing on slide 2. You can do this once they leave the text or stop for 30 s.');
  assert.ok(Math.abs(shown.center - shown.middle) < 2 && shown.top < 100, `the bubble is at the top of the window, at ${JSON.stringify(shown)}`);
  clean(ana);
  clean(ben);
});

// the hidden status region of the bubbles, with its text
const SAID = `(() => {
  const all = document.querySelectorAll('.beeson-bubble-said');
  const r = all[0]?.getBoundingClientRect();
  return { count: all.length, role: all[0]?.getAttribute('role') ?? null, text: all[0]?.textContent.trim() ?? null, size: r ? Math.max(r.width, r.height) : null, kept: !!all[0] && all[0] === window.__said };
})()`;

test('a refusal is read from one hidden status region, which is in the page before the first bubble', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await front(ben);
  const first = await ben.evaluate(`(() => { window.__said = document.querySelector('.beeson-bubble-said'); return ${SAID}; })()`);
  assert.deepEqual(first, { count: 1, role: 'status', text: '', size: 1, kept: true }, 'an empty status region before any bubble');
  await caretAtEnd(ana, p);
  await until(() => ben.evaluate(LOCKED(p)), 'the paragraph that Ana holds to be locked on the page of Ben');
  for (let i = 0; i < 2; i++) {
    await unbubble(ben);
    await ben.evaluate(`${p}.focus()`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED);
    assert.equal(await ben.evaluate(`document.querySelector('.beeson-bubble').getAttribute('role')`), null, 'the bubble itself has no role');
    assert.deepEqual(await ben.evaluate(SAID), { count: 1, role: 'status', text: REFUSED, size: 1, kept: true }, `the refusal ${i + 1} in the status region`);
  }
  clean(ana);
  clean(ben);
});

