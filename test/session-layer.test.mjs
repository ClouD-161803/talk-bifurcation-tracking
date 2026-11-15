// the layer of presence of a session in Chrome, on the edit command started on a temporary talk
// folder: the frames, the name flags, the chips, and the caret bars that a page draws of the other
// people, the presses that a chip takes, and the reads of layout that the layer makes

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, frame, front } from './helpers/apply.mjs';
import { C, clean, show } from './helpers/client.mjs';
import { boxOf, drawn, el, select, session, untilDrawn } from './helpers/presence.mjs';
import { until } from './helpers/session.mjs';

const shape = (id, x, y, w, h, extra = '') => `<div class="shape tone-accent" id="${id}"${extra} style="width: ${w}px; height: ${h}px; translate: ${x}px ${y}px"><p>${id}</p></div>`;
// the paragraph of slide One replaced by html
const onOne = (...html) => ['  <p>First slide</p>', `  <p>First slide</p>\n  ${html.join('\n  ')}`];

const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
async function clickAt(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await mouse(page, 'mousePressed', x, y, { buttons: 1 });
  await mouse(page, 'mouseReleased', x, y);
}
// the selection of page by the ids of its items, or its kind
const selected = (page) => page.evaluate(`(() => { const s = ${C}.app.selection; return s.kind === 'elements' ? s.items.map((e) => e.id || e.localName).join(' ') : s.kind; })()`);
const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

test('the initials of a chip are those of the avatar, in whole graphemes and with the digit of a second person of one tone and the same initials', { timeout: 180_000 }, async (t) => {
  const names = ['Ana Silva', 'Ben', '🧑‍🚀 Ann', 'Dee', 'Alex Smith'];
  const { pages } = await session(t, names);
  const ben = pages[1];
  for (const page of pages) await show(page, 'Two');
  const colors = [];
  for (const page of pages) colors.push(await page.evaluate(`${C}.color`));
  assert.equal(colors[0] % 4, colors[4] % 4, 'Ana Silva and Alex Smith have one tone');
  await select(pages[0], el(1, 'h2'));
  await select(pages[2], el(1, 'p'));
  await select(pages[4], el(1, 'ul'));
  await untilDrawn(ben, (d) => d.flags.length === 3, 'the three flags on the page of Ben');
  const short = await ben.evaluate(`Object.fromEntries([...document.querySelectorAll('.beeson-presence .flag')].map((f) => [f.title, f.querySelector('.short').textContent]))`);
  assert.deepEqual(short, { 'Ana Silva': 'AS', '🧑‍🚀 Ann': '🧑‍🚀A', 'Alex Smith': 'AS2' });
  for (const page of pages) clean(page);
});

