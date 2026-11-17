// the floor rule of a session in Chrome, on the edit command started on a temporary talk folder: a
// command of one page that would change a text element that another page holds is refused with
// the bubble, also when the command reaches the element from a neighbor, from its table, or from
// an entry of the history

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, frame, front } from './helpers/apply.mjs';
import { C, clean, converge, show } from './helpers/client.mjs';
import { center, click, drag, press, typeKeys } from './helpers/editor.mjs';
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
    // Ana hears the hold of Ben before Ben leaves the item, hence the wait for the free items at the
    // next case cannot end before this hold arrives
    await until(() => ana.evaluate(`${P}.locks.size === 1`), 'the item that Ben holds to be locked on the page of Ana');
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

test('a text element taken from a page that composes with an input method keeps its caret until the composition ends', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  // both pages claim the paragraph at the same time, and the larger client id gives it up
  const ids = { ana: await ana.evaluate(`${C}.client`), ben: await ben.evaluate(`${C}.client`) };
  const [keeper, loser] = ids.ana < ids.ben ? [ana, ben] : [ben, ana];
  await hold(ana);
  await hold(ben);
  await caretAtEnd(keeper, p);
  await front(loser);
  await caretAtEnd(loser, p);
  const compose = (type) => loser.evaluate(`${p}.dispatchEvent(new CompositionEvent(${JSON.stringify(type)}, { bubbles: true, data: '' }))`);
  await compose('compositionstart');
  await release(ana);
  await release(ben);
  await until(() => loser.evaluate(`${LOCKED(p)} && ${P}.held === null`), 'the page with the larger client id to give the paragraph up');
  const caret = `({ focused: document.activeElement === ${p}, caret: ${p}.contains(getSelection().focusNode) })`;
  assert.deepEqual(await loser.evaluate(caret), { focused: true, caret: true }, 'the caret stays during the composition');
  await compose('compositionend');
  await until(async () => JSON.stringify(await loser.evaluate(caret)) === JSON.stringify({ focused: false, caret: false }), 'the caret to leave at the end of the composition');
  clean(ana);
  clean(ben);
});

const PLATE = `  <p>First slide</p>
  <div class="plate row">
    <figure id="first"><img src="brand/logo.png" alt="A"><figcaption class="caption">The first figure.</figcaption></figure>
    <figure id="second"><img src="brand/logo.png" alt="B"><figcaption class="caption">The second figure.</figcaption></figure>
  </div>`;

test('a figure of a plate is selected and dragged by itself while the caption of another figure of the plate is held', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>First slide</p>', PLATE]] });
  await show(ana, 'One');
  await show(ben, 'One');
  const caption = el(0, '#first figcaption');
  await caretAtEnd(ana, caption);
  await typeKeys(ana, ' typed');
  await until(() => ben.evaluate(`${LOCKED(caption)} && ${caption}.textContent === 'The first figure. typed'`), 'the caption that Ana holds, with her text, to be locked on the page of Ben');
  await front(ben);
  await unbubble(ben);
  await drag(ben, 'section.present #second img', { dx: 60, dy: 20 });
  assert.deepEqual(await ben.evaluate(`window.BeesonEditor.selection().map((e) => e.localName + (e.id ? '#' + e.id : ''))`), ['figure#second']);
  assert.equal(await ben.evaluate(BUBBLE), null, 'the press is not refused');
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<figure id="second" style="translate: -?\d+px -?\d+px">/);
  assert.match(text, /<div class="plate row">/);
  assert.match(text, /The first figure\. typed<\/figcaption>/);
  clean(ana);
  clean(ben);
});

const SELECTED = `window.BeesonEditor.selection().map((e) => e.localName + (e.id ? '#' + e.id : '') + (e.alt ? '[' + e.alt + ']' : ''))`;
const tap = async (page, selector) => {
  const point = await center(page, selector);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

// a plate without a hold takes a click as a selection of the plate, then of the figure, then of
// its picture. the plate is refused while a caption in it is held, hence the first click takes the
// figure
test('a click and a tap on a figure of a plate select the figure while the caption of another figure of the plate is held, and a second click selects its picture', { timeout: 180_000 }, async (t) => {
  const { pages: [ana, ben, cy] } = await session(t, ['Ana', 'Ben', 'Cy'], { edits: [['  <p>First slide</p>', PLATE]], pages: [{}, {}, { width: 844, height: 390, mobile: true }] });
  for (const page of [ana, ben, cy]) await show(page, 'One');
  const caption = el(0, '#first figcaption');
  await caretAtEnd(ana, caption);
  await typeKeys(ana, ' typed');
  const image = 'section.present #second img';
  for (const [page, how] of [[ben, 'a click'], [cy, 'a tap']]) {
    await until(() => page.evaluate(`${LOCKED(caption)} && ${caption}.textContent === 'The first figure. typed'`), `the caption that Ana holds to be locked on the page of ${how}`);
    await front(page);
    await unbubble(page);
    await (page === cy ? tap(page, image) : click(page, image));
    await frame(page);
    assert.deepEqual(await page.evaluate(SELECTED), ['figure#second'], how);
    assert.equal(await page.evaluate(BUBBLE), null, `${how} is not refused`);
  }
  await front(ben);
  await click(ben, image);
  await frame(ben);
  assert.deepEqual(await ben.evaluate(SELECTED), ['img[B]'], 'a second click');
  assert.equal(await ana.evaluate(`document.activeElement === ${caption}`), true, 'the caret of Ana stays in the caption');
  clean(ana);
  clean(ben);
  clean(cy);
});

test('a text element that a page moved, or moved back with Undo, is locked on this page when another page holds it', { timeout: 240_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  const last = `${p}.parentElement.lastElementChild === ${p}`;
  // the source of the page of Ben does not read as the deck after his move, and a change of another
  // page, from which his page would read the deck again, does not follow
  await front(ben);
  await ben.evaluate(`(() => { const p = ${p}; return ${C}.app.doc.move(p, p.parentElement, null).then(() => true); })()`);
  await converge(server, [ana, ben]);
  await caretAtEnd(ana, p);
  await until(() => ben.evaluate(LOCKED(p)), 'the moved paragraph that Ana holds to be locked on the page of Ben');
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the undo of the move');
  assert.equal(await ben.evaluate(last), true, 'the paragraph stays at the end of its slide');
  await unbubble(ben);
  // the same after the undo of the move, taken once Ana left the paragraph
  await front(ana);
  await leave(ana);
  await until(() => ben.evaluate(`${P}.locks.size === 0`), 'the lock to go when Ana leaves the paragraph');
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(last), false, 'the undo of the move is taken');
  await converge(server, [ana, ben]);
  // the page of Ben last heard of a hold of Ana more than 30 s ago, and the hold that it reads
  // late begins when it is read
  await ben.evaluate(`(${P}.skew += 31_000, true)`);
  await caretAtEnd(ana, p);
  await until(() => ben.evaluate(LOCKED(p)), 'the paragraph that Ana holds again to be locked on the page of Ben');
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.redo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the redo of the move');
  assert.equal(await ben.evaluate(last), false, 'the paragraph stays where the undo put it');
  clean(ana);
  clean(ben);
});
