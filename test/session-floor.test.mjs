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

