// the holds of a session in Chrome, on the edit command started on a temporary talk folder: a
// command of one page that would move, delete, or restructure a text element that another page
// types in is refused with the bubble, also when the command reaches the element from a neighbor,
// from its table, or from an entry of the history, and typing and formatting in it are not

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, frame, front } from './helpers/apply.mjs';
import { C, clean, converge, show } from './helpers/client.mjs';
import { center, click, drag, press, type, typeKeys } from './helpers/editor.mjs';
import { BUBBLE, el, leave, HOLDER, P, REFUSED, select, session, unbubble } from './helpers/presence.mjs';
import { until } from './helpers/session.mjs';

const TABLE = `  <p>First slide</p>
  <table>
    <tr><th>A1</th><th>B1</th></tr>
    <tr><td>A2</td><td>B2</td></tr>
  </table>`;
const tableOf = (text) => text.match(/<table>[\s\S]*?<\/table>/)?.[0];

test('a held table cell refuses Delete Column, Delete Row, and a paste of cells from another cell of its table, by the menu or by the key, and takes a paste of plain text', { timeout: 240_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>First slide</p>', TABLE]] });
  await show(ana, 'One');
  await show(ben, 'One');
  const a2 = el(0, 'td');
  await caretAtEnd(ana, a2);
  await typeKeys(ana, ' typed');
  await until(() => ben.evaluate(`${HOLDER(a2)} === 'Ana' && ${a2}.textContent === 'A2 typed'`), 'the cell that Ana types in, with her text, to be held on the page of Ben');
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
  // the paste of cells by the key, which the code of the table reads from the event of the paste
  await unbubble(ben);
  await caretAtEnd(ben, el(0, 'th'));
  await ben.evaluate(`(() => { const d = new DataTransfer(); d.setData('text/plain', 'p\\tq\\nr\\ts'); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: d })); })()`);
  await frame(ben);
  assert.equal(await ben.evaluate(`${el(0, 'table')}.outerHTML`), before, 'the paste of cells by the key leaves the table as it was');
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the paste of cells by the key');
  // a paste of plain text into one cell is taken, as in a paragraph
  await unbubble(ben);
  await caretAtEnd(ben, el(0, 'th'));
  await ben.evaluate(`${C}.app.commands.run('edit.paste', 'word')`);
  assert.equal(await ben.evaluate(BUBBLE), null, 'a paste of plain text is not refused');
  assert.equal(await ben.evaluate(`${el(0, 'th')}.textContent`), 'A1word');
  await leave(ben);
  const text = await converge(server, [ana, ben]);
  assert.match(tableOf(text), /<th>A1word<\/th>/);
  assert.match(tableOf(text), /<td>A2 typed<\/td><td>B2<\/td>/);
  assert.equal(await ben.evaluate(HOLDER(a2)), 'Ana', 'the cell is still held');
  clean(ana);
  clean(ben);
});

const caretAtStart = async (page, expression) => {
  await front(page);
  assert.ok(await page.evaluate(`(() => { const h = ${expression}; h.focus(); getSelection().collapse(h.firstChild ?? h, 0); return document.activeElement === h; })()`), `the caret is at the start of ${expression}`);
};
const listOf = (page) => page.evaluate(`${el(1, 'ul')}.outerHTML`);

test('a held list item refuses Backspace and Delete from the item beside it, and Tab from the item after it', { timeout: 420_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['    <li>Beta</li>', '    <li>Beta</li>\n    <li>Gamma</li>']] });
  await show(ana, 'Two');
  await show(ben, 'Two');
  const item = (n) => el(1, `li:nth-child(${n})`);
  // each case: the item that Ana is in, where Ben puts the caret, and the key that Ben presses
  const cases = [
    [1, () => caretAtStart(ben, item(2)), 'Backspace'],
    [2, () => caretAtEnd(ben, item(1)), 'Delete'],
    [2, () => caretAtEnd(ben, item(3)), 'Tab'],
  ];
  for (const [held, put, key] of cases) {
    // the item that Ben left is free on the page of Ana
    await until(() => ana.evaluate(`${P}.holds.size === 0`), 'the items to be free on the page of Ana');
    await front(ana);
    await caretAtEnd(ana, item(held));
    await until(() => ben.evaluate(`${P}.holds.size === 1 && ${HOLDER(item(held))} === 'Ana'`), `the item ${held} that Ana is in to be held on the page of Ben`);
    const before = await listOf(ben);
    await put();
    // Ana hears the hold of Ben before Ben leaves the item, hence the wait for the free items at the
    // next case cannot end before this hold arrives
    await until(() => ana.evaluate(`${P}.holds.size === 1`), 'the hold of Ben on the item to reach the page of Ana');
    await unbubble(ben);
    await press(ben, key);
    assert.equal(await listOf(ben), before, `${key} leaves the list as it was when Ana is in the item ${held}`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, key);
    await leave(ben);
  }
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<li>Alpha<\/li>\s*<li>Beta<\/li>\s*<li>Gamma<\/li>/);
  clean(ana);
  clean(ben);
});

// the paragraph of slide Two that Ana types in, after a paragraph that a join reaches
const INTRO = [['  <p>Second slide</p>', '  <p>Intro</p>\n  <p>Second slide</p>']];
const SECOND = el(1, 'p:nth-of-type(2)');

test('a text element that another page types in refuses Delete, Arrange, a join, and Move Section, and takes Bold and Replace', { timeout: 300_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: INTRO });
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = SECOND;
  const text = `${p}.textContent`;
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' typed');
  await until(async () => (await ben.evaluate(`${HOLDER(p)} === 'Ana' && ${text} === 'Second slide typed'`)), 'the paragraph that Ana types in, with her text, to be held on the page of Ben');
  // Delete of the paragraph selected as an element
  await unbubble(ben);
  await select(ben, p);
  await ben.evaluate(`${C}.app.commands.run('element.delete')`);
  assert.equal(await ben.evaluate(`${p}?.textContent`), 'Second slide typed', 'element.delete');
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'element.delete');
  // a command of Arrange and a join of the caret in it
  await caretAtEnd(ben, p);
  await unbubble(ben);
  assert.ok(await ben.evaluate(`${C}.app.commands.enabled('arrange.align.center')`));
  await ben.evaluate(`${C}.app.commands.run('arrange.align.center')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'arrange.align.center');
  await ben.evaluate(`getSelection().collapse(${p}.firstChild, 0)`);
  await unbubble(ben);
  await press(ben, 'Backspace');
  assert.equal(await ben.evaluate(text), 'Second slide typed', 'the join leaves the paragraph as it was');
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'text.joinBackward');
  // a move of a section, whose slides are not read
  await unbubble(ben);
  await ben.evaluate(`${C}.app.commands.run('slide.moveSection', { head: document.querySelectorAll('.reveal .slides > section')[0], gap: 2 })`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'slide.moveSection');
  assert.equal(await ben.evaluate(`Reveal.getCurrentSlide().querySelector('h2').textContent`), 'Two');
  // Replace and Bold change its text
  await unbubble(ben);
  await ben.evaluate(`window.BeesonEditor.exec('find.replace', 'Second')`);
  await ben.evaluate(`document.querySelector('.beeson-find .replace input').focus()`);
  await type(ben, 'Third');
  await ben.evaluate(`window.BeesonEditor.exec('find.replaceOne')`);
  await ben.evaluate(`window.BeesonEditor.exec('find.close')`);
  assert.equal(await ben.evaluate(text), 'Third slide typed');
  await front(ben);
  await ben.evaluate(`(() => { const p = ${p}; p.focus(); const t = p.firstChild; getSelection().setBaseAndExtent(t, 0, t, 'Third'.length); })()`);
  await ben.evaluate(`${C}.app.commands.run('text.bold')`);
  assert.equal(await ben.evaluate(BUBBLE), null, 'Replace and Bold are not refused');
  let saved = await converge(server, [ana, ben]);
  assert.match(saved, /<p><(b|strong)>Third<\/\1> slide typed<\/p>/);
  // the paragraph is deleted once Ana leaves it
  await front(ana);
  await leave(ana);
  await until(() => ben.evaluate(`${P}.holds.size === 0`), 'the hold to go when Ana leaves the paragraph');
  await select(ben, p);
  await ben.evaluate(`${C}.app.commands.run('element.delete')`);
  assert.equal(await ben.evaluate(BUBBLE), null);
  saved = await converge(server, [ana, ben]);
  assert.ok(!saved.includes('slide typed'), 'the paragraph is deleted');
  clean(ana);
  clean(ben);
});

test('an undo of typing in a text element that another page types in is taken, and an undo or a redo that moves it or a transaction that names it is refused', { timeout: 420_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  // Ben moves the paragraph to the end of its slide before Ana puts her caret in it. a change of
  // the paragraph by Ana would take the entry of the move out of the history of Ben, and her typing
  // in the heading gives the page of Ben a text after the move, from which her caret is read
  await front(ben);
  await ben.evaluate(`(() => { const p = ${p}; return ${C}.app.doc.move(p, p.parentElement, null).then(() => true); })()`);
  assert.equal(await ben.evaluate(`${C}.app.history.undoLabel`), 'move');
  await converge(server, [ana, ben]);
  await caretAtEnd(ana, el(1, 'h2'));
  await typeKeys(ana, ' 2');
  await converge(server, [ana, ben]);
  assert.equal(await ben.evaluate(`${C}.app.history.undoLabel`), 'move');
  const last = `${p}.parentElement.lastElementChild === ${p}`;
  await caretAtEnd(ana, p);
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the paragraph that Ana is in to be held on the page of Ben');
  await unbubble(ben);
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the undo of the move');
  assert.equal(await ben.evaluate(last), true, 'the paragraph stays at the end of its slide');
  assert.equal(await ben.evaluate(`${C}.app.history.undoLabel`), 'move', 'the entry of the move is kept');
  // the redo of the move, undone while Ana is not in the paragraph
  await front(ana);
  await leave(ana);
  await until(() => ben.evaluate(`${P}.holds.size === 0`), 'the hold to go when Ana leaves the paragraph');
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(last), false, 'the undo of the move is taken once Ana left the paragraph');
  await caretAtEnd(ana, p);
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the paragraph that Ana is in again to be held on the page of Ben');
  await unbubble(ben);
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.redo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the redo of the move');
  assert.equal(await ben.evaluate(last), false, 'the paragraph stays where the undo put it');
  assert.equal(await ben.evaluate(`${C}.app.history.canRedo`), true, 'the entry of the redo is kept');
  // the typing of Ben in the paragraph that Ana types in is undone
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' by Ana');
  await converge(server, [ana, ben]);
  await front(ben);
  await ben.evaluate(`(() => { const p = ${p}; p.focus(); getSelection().collapse(p.firstChild, 0); })()`);
  await typeKeys(ben, 'Ben: ');
  await converge(server, [ana, ben]);
  await unbubble(ben);
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(BUBBLE), null, 'the undo of typing');
  let text = await converge(server, [ana, ben]);
  assert.match(text, /<p>Second slide by Ana<\/p>/);

  // an undo of a command, whose entry is a transaction
  await front(ana);
  await leave(ana);
  await until(() => ben.evaluate(`${P}.holds.size === 0`), 'the hold to go when Ana leaves the paragraph');
  await select(ben, p);
  await ben.evaluate(`${C}.app.commands.run('text.bigger')`);
  await converge(server, [ana, ben]);
  await ben.evaluate(`${C}.app.selection.clear()`);
  const h3 = el(1, 'h3');
  await caretAtEnd(ana, h3);
  await until(async () => (await ben.evaluate(HOLDER(h3))) === 'Ana', 'the subheading that Ana is in to be held on the page of Ben');
  await unbubble(ben);
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(`${h3}?.isConnected ?? false`), true, 'the undo leaves the subheading in place');
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'edit.undo');
  assert.equal(await ben.evaluate(`${C}.app.history.undoLabel`), 'Bigger', 'the entry of the undo is kept');
  text = await converge(server, [ana, ben]);
  assert.match(text, /<h3>Second slide by Ana<\/h3>/);
  clean(ana);
  clean(ben);
});

test('an undo of a person who typed in a text element together with another person keeps the text of the other person', { timeout: 240_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' by Ana');
  await converge(server, [ana, ben]);
  await front(ben);
  await ben.evaluate(`(() => { const p = ${p}; p.focus(); getSelection().collapse(p.firstChild, 0); })()`);
  await typeKeys(ben, 'Ben: ');
  await converge(server, [ana, ben]);
  await front(ana);
  await ana.evaluate(`${C}.app.commands.run('edit.undo')`);
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<p>Ben: Second slide<\/p>/);
  clean(ana);
  clean(ben);
});

const ORDER = `[...document.querySelectorAll('.reveal .slides > section')].map((s) => s.querySelector('h2').textContent).join(',')`;

test('an undo or a redo of a move of the slide of a held text element, or of a nudge of an element around it, is refused', { timeout: 360_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>Second slide</p>', '  <div class="group"><p>Second slide</p><p>Other</p></div>']] });
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = `[...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2').textContent === 'Two').querySelector('.group p')`;
  const group = `${p}.parentElement`;
  // the slide that Ana shows may change with the order of the slides
  const enter = async () => {
    await show(ana, 'Two');
    await caretAtEnd(ana, p);
    await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the paragraph that Ana is in to be held on the page of Ben');
    await unbubble(ben);
    await front(ben);
  };
  const exit = async () => {
    await front(ana);
    await leave(ana);
    await until(() => ben.evaluate(`${P}.holds.size === 0`), 'the hold to go when Ana leaves the paragraph');
    await front(ben);
  };
  // Ben nudges the element around the paragraph and moves its slide before Ana enters it
  await select(ben, group);
  await ben.evaluate(`${C}.app.commands.run('arrange.nudge.right.far')`);
  assert.match(await ben.evaluate(`${group}.getAttribute('style')`), /translate: 10px/);
  await ben.evaluate(`${C}.app.selection.clear()`);
  await ben.evaluate(`${C}.app.commands.run('slide.moveTo', { slides: [${p}.closest('section')], gap: 0 })`);
  assert.equal(await ben.evaluate(ORDER), 'Two,One');
  await converge(server, [ana, ben]);
  await enter();
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the undo of the move of the slide');
  assert.equal(await ben.evaluate(ORDER), 'Two,One', 'the undo leaves the slides in their order');
  await exit();
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(ORDER), 'One,Two', 'the undo of the move of the slide is taken once Ana left');
  await enter();
  await ben.evaluate(`${C}.app.commands.run('edit.redo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the redo of the move of the slide');
  assert.equal(await ben.evaluate(ORDER), 'One,Two', 'the redo leaves the slides in their order');
  await unbubble(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the undo of the nudge');
  assert.match(await ben.evaluate(`${group}.getAttribute('style')`), /translate: 10px/, 'the undo leaves the element around the paragraph in place');
  await leave(ben);
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<div class="group" style="translate: 10px[^"]*"><p>Second slide<\/p>/);
  clean(ana);
  clean(ben);
});

test('an undo or a redo of a nudge of two elements, the second around a held text element, is refused, and an undo of a delete of another element of its slide is taken', { timeout: 300_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>Second slide</p>', '  <p>Box</p>\n  <div class="group"><p>Second slide</p><p>Other</p></div>\n  <p>Spare</p>']] });
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, '.group p');
  const group = el(1, '.group');
  const box = el(1, ':scope > p');
  const spare = `[...${el(1, 'h2')}.parentElement.children].find((e) => e.textContent === 'Spare')`;
  const enter = async () => {
    await front(ana);
    await caretAtEnd(ana, p);
    await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the paragraph that Ana is in to be held on the page of Ben');
    // a clock of Ben far behind keeps the hold until Ana leaves
    await ben.evaluate(`${P}.skew = -1e8`);
    await unbubble(ben);
    await front(ben);
  };
  const exit = async () => {
    await front(ana);
    await leave(ana);
    await until(() => ben.evaluate(`${P}.holds.size === 0`), 'the hold to go when Ana leaves the paragraph');
    await front(ben);
  };
  const places = () => ben.evaluate(`[${box}, ${group}].map((e) => e.style.translate)`);
  // Ben nudges the box and the element around the paragraph, then deletes another paragraph
  await select(ben, box, group);
  await ben.evaluate(`${C}.app.commands.run('arrange.nudge.right.far')`);
  const nudged = await places();
  assert.ok(nudged.every((x) => x.startsWith('10px')), 'the nudge moves both elements');
  await select(ben, spare);
  await ben.evaluate(`${C}.app.commands.run('element.delete')`);
  assert.equal(await ben.evaluate(`${spare} ?? null`), null, 'the paragraph Spare is deleted');
  await ben.evaluate(`${C}.app.selection.clear()`);
  await enter();
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(BUBBLE), null, 'the undo of the delete of another element of the slide is not refused');
  assert.notEqual(await ben.evaluate(`${spare} ?? null`), null, 'the undo of the delete of another element of the slide is taken');
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the undo of the nudge');
  assert.deepEqual(await places(), nudged, 'the undo leaves both elements in place');
  await exit();
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.deepEqual(await places(), ['', ''], 'the undo of the nudge is taken once Ana left');
  await enter();
  await ben.evaluate(`${C}.app.commands.run('edit.redo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the redo of the nudge');
  assert.deepEqual(await places(), ['', ''], 'the redo leaves both elements in place');
  await leave(ben);
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<p>Box<\/p>\s*<div class="group"><p>Second slide<\/p><p>Other<\/p><\/div>\s*<p>Spare<\/p>/);
  clean(ana);
  clean(ben);
});

test('an undo of typing in a text element that the person left keeps the text that another person typed in it since', { timeout: 300_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' by Ana');
  await converge(server, [ana, ben]);
  // the typing of Ana in the heading ends her typing in the paragraph, hence the keys of Ben after
  // it are not added to her entry
  await caretAtEnd(ana, el(1, 'h2'));
  await typeKeys(ana, ' 2');
  await converge(server, [ana, ben]);
  await front(ben);
  await ben.evaluate(`(() => { const p = ${p}; p.focus(); getSelection().collapse(p.firstChild, 0); })()`);
  await typeKeys(ben, 'Ben: ');
  await converge(server, [ana, ben]);
  await front(ana);
  for (let i = 0; i < 2; i++) await ana.evaluate(`${C}.app.commands.run('edit.undo')`);
  const text = await converge(server, [ana, ben]);
  assert.match(text, /<h2>Two<\/h2>\s*<p>Ben: Second slide<\/p>/);
  clean(ana);
  clean(ben);
});

test('the bubble of a refusal for a text element on another slide names the slide, at the top of the window', { timeout: 240_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'One');
  await caretAtEnd(ana, el(1, 'p'));
  await until(() => ben.evaluate(`${P}.holds.size === 1`), 'the paragraph that Ana is in to be held on the page of Ben');
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('slide.moveTo', { slides: [document.querySelectorAll('.reveal .slides > section')[1]], gap: 0 })`);
  const shown = await ben.evaluate(`(() => { const b = document.querySelector('.beeson-bubble'); if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.textContent, center: r.left + r.width / 2, top: r.top, middle: innerWidth / 2 }; })()`);
  assert.equal(shown?.text, 'Ana is typing on slide 2. You can do this once they leave it or stop for 30 s.');
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

test('a refusal is read from one hidden status region, which is in the page before the first bubble', { timeout: 240_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await front(ben);
  const first = await ben.evaluate(`(() => { window.__said = document.querySelector('.beeson-bubble-said'); return ${SAID}; })()`);
  assert.deepEqual(first, { count: 1, role: 'status', text: '', size: 1, kept: true }, 'an empty status region before any bubble');
  await caretAtEnd(ana, p);
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the paragraph that Ana is in to be held on the page of Ben');
  await select(ben, p);
  for (let i = 0; i < 2; i++) {
    await unbubble(ben);
    await ben.evaluate(`${C}.app.commands.run('element.delete')`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED);
    assert.equal(await ben.evaluate(`document.querySelector('.beeson-bubble').getAttribute('role')`), null, 'the bubble itself has no role');
    assert.deepEqual(await ben.evaluate(SAID), { count: 1, role: 'status', text: REFUSED, size: 1, kept: true }, `the refusal ${i + 1} in the status region`);
  }
  clean(ana);
  clean(ben);
});

const PLATE = `  <p>First slide</p>
  <div class="plate row">
    <figure id="first"><img src="brand/logo.png" alt="A"><figcaption class="caption">The first figure.</figcaption></figure>
    <figure id="second"><img src="brand/logo.png" alt="B"><figcaption class="caption">The second figure.</figcaption></figure>
  </div>`;

test('a figure of a plate is selected and dragged by itself while the caption of another figure of the plate is held', { timeout: 240_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [['  <p>First slide</p>', PLATE]] });
  await show(ana, 'One');
  await show(ben, 'One');
  const caption = el(0, '#first figcaption');
  await caretAtEnd(ana, caption);
  await typeKeys(ana, ' typed');
  await until(() => ben.evaluate(`${HOLDER(caption)} === 'Ana' && ${caption}.textContent === 'The first figure. typed'`), 'the hold of Ana on the caption, with her text, to reach the page of Ben');
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
test('a click and a tap on a figure of a plate select the figure while the caption of another figure of the plate is held, and a second click selects its picture', { timeout: 300_000 }, async (t) => {
  const { pages: [ana, ben, cy] } = await session(t, ['Ana', 'Ben', 'Cy'], { edits: [['  <p>First slide</p>', PLATE]], pages: [{}, {}, { width: 844, height: 390, mobile: true }] });
  for (const page of [ana, ben, cy]) await show(page, 'One');
  const caption = el(0, '#first figcaption');
  await caretAtEnd(ana, caption);
  await typeKeys(ana, ' typed');
  const image = 'section.present #second img';
  for (const [page, how] of [[ben, 'a click'], [cy, 'a tap']]) {
    await until(() => page.evaluate(`${HOLDER(caption)} === 'Ana' && ${caption}.textContent === 'The first figure. typed'`), `the hold of Ana on the caption to reach the page of ${how}`);
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

test('a text element that a page moved, or moved back with Undo, is held on this page when another person puts the caret in it', { timeout: 240_000 }, async (t) => {
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
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the moved paragraph that Ana is in to be held on the page of Ben');
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the undo of the move');
  assert.equal(await ben.evaluate(last), true, 'the paragraph stays at the end of its slide');
  await unbubble(ben);
  // the same after the undo of the move, taken once Ana left the paragraph
  await front(ana);
  await leave(ana);
  await until(() => ben.evaluate(`${P}.holds.size === 0`), 'the hold to go when Ana leaves the paragraph');
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.undo')`);
  assert.equal(await ben.evaluate(last), false, 'the undo of the move is taken');
  await converge(server, [ana, ben]);
  // the page of Ben last heard of a hold of Ana more than 30 s ago, and the hold that it reads
  // late begins when it is read
  await ben.evaluate(`(${P}.skew += 31_000, true)`);
  await caretAtEnd(ana, p);
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the paragraph that Ana is in again to be held on the page of Ben');
  await front(ben);
  await ben.evaluate(`${C}.app.commands.run('edit.redo')`);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED, 'the redo of the move');
  assert.equal(await ben.evaluate(last), false, 'the paragraph stays where the undo put it');
  clean(ana);
  clean(ben);
});
