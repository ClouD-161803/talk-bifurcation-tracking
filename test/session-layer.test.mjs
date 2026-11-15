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

test('a chip takes a press on itself only, and a press beside it, on an element under it, on a grip, or in the Slide Sorter reaches the editor', { timeout: 180_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [onOne(shape('mid', 600, 560, 200, 100), shape('under', 612, 470, 120, 80), shape('box', 1200, 400, 300, 200))] });
  await show(ana, 'One');
  await show(ben, 'One');
  await select(ana, el(0, '#mid'));
  // each press is made on a chip, which a press that it takes expands for 3 s
  const collapsed = async () => (await untilDrawn(ben, (d) => d.flags[0]?.chip, 'the flag of Ana to collapse to a chip on the page of Ben')).flags[0];
  const c = center(await collapsed());
  // the element under the chip begins right of its center, more than 6 px from a press 12 px left of it
  const under = await boxOf(ben, el(0, '#under'));
  assert.ok(under.x > c.x - 6 && under.x < c.x + 8 && under.y < c.y && under.y + under.h > c.y, `the element under lies under the chip, at ${JSON.stringify({ under, c })}`);
  // the editor picks a text element within 6 px of a press, hence the other elements lie farther away
  const gap = await ben.evaluate(`Math.min(...[...${el(0, '*')}.parentElement.children].filter((e) => e.id !== 'under').map((e) => {
    const r = e.getBoundingClientRect();
    return Math.hypot(Math.max(r.left - ${c.x - 12}, 0, ${c.x - 12} - r.right), Math.max(r.top - ${c.y}, 0, ${c.y} - r.bottom));
  }))`);
  assert.ok(gap > 8, `the slide lies 12 px left of the center of the chip, ${gap} px from any other element`);

  // a press 12 px left of the center of the chip, on the slide
  await select(ben, el(0, '#box'));
  await collapsed();
  await clickAt(ben, c.x - 12, c.y);
  await frame(ben);
  assert.equal(await selected(ben), 'none', 'a press beside the chip reaches the slide');
  // a press 12 px right of the center of the chip, on the element under it
  await collapsed();
  await clickAt(ben, c.x + 12, c.y);
  await frame(ben);
  assert.equal(await selected(ben), 'under', 'a press on the element under the chip selects it');
  // a press on the chip shows the name and does not reach the slide, with the element under it not
  // selected, since a grip of the own frame takes a press before the chip
  await select(ben, el(0, '#box'));
  await collapsed();
  const was = await selected(ben);
  await clickAt(ben, c.x, c.y);
  await frame(ben);
  assert.equal(await selected(ben), was, 'a press on the chip does not reach the slide');
  assert.equal((await drawn(ben)).flags[0].chip, false, 'a press on the chip shows the name');

  // a drag of the upper left grip of the own frame, near the chip of Ana on the same element
  await select(ana, el(0, '#box'));
  await select(ben, el(0, '#box'));
  const near = await collapsed();
  const grip = await boxOf(ben, `document.querySelector('.beeson-grip[data-handle=nw]:not([hidden])')`);
  const g = center(grip);
  assert.ok(Math.abs(g.x - center(near).x) < 16 && Math.abs(g.y - center(near).y) < 16, 'the grip lies within 16 px of the center of the chip');
  const width = await ben.evaluate(`${el(0, '#box')}.style.width`);
  await ben.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y });
  await mouse(ben, 'mousePressed', g.x, g.y, { buttons: 1 });
  for (let i = 1; i <= 10; i++) await ben.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x - 4 * i, y: g.y - 3 * i, buttons: 1 });
  await mouse(ben, 'mouseReleased', g.x - 40, g.y - 30);
  await frame(ben);
  assert.notEqual(await ben.evaluate(`${el(0, '#box')}.style.width`), width, 'a drag of the grip resizes the box');

  // a click in the Slide Sorter where the chip of Ana is
  const hidden = await collapsed();
  await ben.evaluate(`${C}.app.commands.run('view.lightTable')`);
  await frame(ben);
  const h = center(hidden);
  const target = await ben.evaluate(`(() => {
    const t = document.elementFromPoint(${h.x}, ${h.y});
    window.__got = { down: 0, click: 0 };
    t.addEventListener('pointerdown', () => window.__got.down++, { once: true });
    t.addEventListener('click', () => window.__got.click++, { once: true });
    return !!t.closest('.beeson-edit-sorter, .beeson-sorter, [class*=sorter]');
  })()`);
  assert.ok(target, 'the Slide Sorter lies where the chip is');
  await clickAt(ben, h.x, h.y);
  await frame(ben);
  assert.deepEqual(await ben.evaluate('window.__got'), { down: 1, click: 1 }, 'the Slide Sorter gets the press and the click');
  clean(ana);
  clean(ben);
});

