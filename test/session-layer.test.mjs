import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caretAtEnd, frame, front } from './helpers/apply.mjs';
import { C, clean, converge, show } from './helpers/client.mjs';
import { boxOf, drawn, el, select, session, untilDrawn } from './helpers/presence.mjs';
import { until } from './helpers/session.mjs';

const shape = (id, x, y, w, h, extra = '') => `<div class="shape tone-accent" id="${id}"${extra} style="width: ${w}px; height: ${h}px; translate: ${x}px ${y}px"><p>${id}</p></div>`;
const onOne = (...html) => ['  <p>First slide</p>', `  <p>First slide</p>\n  ${html.join('\n  ')}`];

const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
async function clickAt(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await mouse(page, 'mousePressed', x, y, { buttons: 1 });
  await mouse(page, 'mouseReleased', x, y);
}
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
  const collapsed = async () => (await untilDrawn(ben, (d) => d.flags[0]?.chip, 'the flag of Ana to collapse to a chip on the page of Ben')).flags[0];
  const c = center(await collapsed());
  const under = await boxOf(ben, el(0, '#under'));
  assert.ok(under.x > c.x - 6 && under.x < c.x + 8 && under.y < c.y && under.y + under.h > c.y, `the element under lies under the chip, at ${JSON.stringify({ under, c })}`);
  const gap = await ben.evaluate(`Math.min(...[...${el(0, '*')}.parentElement.children].filter((e) => e.id !== 'under').map((e) => {
    const r = e.getBoundingClientRect();
    return Math.hypot(Math.max(r.left - ${c.x - 12}, 0, ${c.x - 12} - r.right), Math.max(r.top - ${c.y}, 0, ${c.y} - r.bottom));
  }))`);
  assert.ok(gap > 8, `the slide lies 12 px left of the center of the chip, ${gap} px from any other element`);

  await select(ben, el(0, '#box'));
  await collapsed();
  await clickAt(ben, c.x - 12, c.y);
  await frame(ben);
  assert.equal(await selected(ben), 'none', 'a press beside the chip reaches the slide');
  await collapsed();
  await clickAt(ben, c.x + 12, c.y);
  await frame(ben);
  assert.equal(await selected(ben), 'under', 'a press on the element under the chip selects it');
  await select(ben, el(0, '#box'));
  await collapsed();
  const was = await selected(ben);
  await clickAt(ben, c.x, c.y);
  await frame(ben);
  assert.equal(await selected(ben), was, 'a press on the chip does not reach the slide');
  assert.equal((await drawn(ben)).flags[0].chip, false, 'a press on the chip shows the name');

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

test('a selected group is framed once, with one flag, around its members', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [onOne(shape('g1', 300, 400, 200, 120, ' data-group="g1"'), shape('g2', 700, 600, 200, 120, ' data-group="g1"'))] });
  await show(ana, 'One');
  await show(ben, 'One');
  await select(ana, el(0, '#g1'), el(0, '#g2'));
  const d = await untilDrawn(ben, (d) => d.frames.length > 0, 'the frame of Ana on the page of Ben');
  assert.equal(d.frames.length, 1, 'one frame');
  assert.equal(d.flags.length, 1, 'one flag');
  const f = d.frames[0];
  for (const id of ['#g1', '#g2']) {
    const b = await boxOf(ben, el(0, id));
    assert.ok(f.x < b.x && f.y < b.y && f.x + f.w > b.x + b.w && f.y + f.h > b.y + b.h, `the frame holds ${id}`);
  }
  clean(ana);
  clean(ben);
});

test('a frame below the slide is not drawn over the speaker notes', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [onOne(shape('low', 700, 900, 400, 500))] });
  await show(ana, 'One');
  await show(ben, 'One');
  await front(ben);
  if (!(await ben.evaluate(`${C}.app.notes.shown()`))) await ben.evaluate(`${C}.app.commands.run('view.notes')`);
  await select(ana, el(0, '#low'));
  const d = await untilDrawn(ben, (d) => d.frames.length === 1, 'the frame of Ana on the page of Ben');
  const pane = await boxOf(ben, `document.querySelector('.beeson-edit-pane')`);
  const f = d.frames[0];
  assert.ok(f.y < pane.y - 8 && f.y + f.h > pane.y + 8, `the frame crosses the top of the notes pane, at ${JSON.stringify({ f, pane })}`);
  await ben.evaluate(`document.head.append(Object.assign(document.createElement('style'), { textContent: '.beeson-presence .frame { pointer-events: auto !important; }' }))`);
  const at = (y) => ben.evaluate(`document.elementFromPoint(${f.x + 1}, ${y})?.classList.contains('frame') ?? false`);
  assert.equal(await at(pane.y - 6), true, 'the frame is drawn on the canvas');
  assert.equal(await at(pane.y + 6), false, 'the frame is not drawn over the notes pane');
  clean(ana);
  clean(ben);
});

test('the flag of an element at the top edge of the slide is drawn whole in a landscape phone', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [onOne(shape('top', 800, 0, 300, 100))], pages: [{}, { width: 844, height: 390, mobile: true }] });
  await show(ana, 'One');
  await show(ben, 'One');
  await select(ana, el(0, '#top'));
  const d = await untilDrawn(ben, (d) => d.flags.length === 1 && d.frames.length === 1, 'the frame and the flag of Ana on the page of Ben');
  const top = await ben.evaluate(`${C}.app.stage.viewport.top`);
  const room = d.frames[0].y - top;
  assert.ok(room < 21, `the room above the frame, ${room} px, is less than the height of a flag`);
  assert.ok(d.flags[0].y >= top - 0.5, `the flag at ${d.flags[0].y} is below the top of the canvas at ${top}`);
  clean(ana);
  clean(ben);
});

const CARET = `(() => {
  const c = document.querySelector('.beeson-presence .caret');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const flag = [...document.querySelectorAll('.beeson-presence .flags')].find((f) => f.dataset.caret !== undefined);
  const b = flag?.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top, h: r.height, flag: b ? { x: b.left, y: b.top, w: b.width, h: b.height, text: flag.querySelector('.long').textContent } : null };
})()`;

test('the caret of a person has a name flag at its top, unless the frame of the person around its text element shows the flag', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await front(ana);
  await caretAtEnd(ana, el(1, 'p'));
  const d = await untilDrawn(ben, (d) => d.carets.length === 1 && d.frames.length === 1 && d.flags.length === 1, 'the frame, the flag, and the caret of Ana on the page of Ben');
  assert.equal(d.flags[0].client, await ana.evaluate(`${C}.client`), 'the one flag is that of the frame of Ana');
  assert.equal((await ben.evaluate(CARET)).flag, null, 'the caret does not have a flag of its own');
  await front(ben);
  await ben.evaluate(`(() => { const c = ${C}; const all = c.resolved.bind(c); c.resolved = () => all().map((r) => ({ ...r, selected: [] })); c.app.invalidate('selection'); })()`);
  const e = await until(async () => {
    await frame(ben);
    const e = await ben.evaluate(CARET);
    return e?.flag ? e : null;
  }, 'the flag of the caret of Ana on the page of Ben');
  assert.equal(e.flag.text, 'Ana');
  assert.ok(Math.abs(e.flag.y + e.flag.h - e.y) < 6 && Math.abs(e.flag.x - e.x) < 6, `the flag sits on the top of the caret, at ${JSON.stringify(e)}`);
  clean(ana);
  clean(ben);
});

test('two carets in one paragraph are drawn as two bars with the name flags of their people, and a selection of one of them as a highlight outside the text', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben, cy] } = await session(t, ['Ana', 'Ben', 'Cy']);
  for (const page of [ana, ben, cy]) await show(page, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await front(ben);
  await ben.evaluate(`(() => { const p = ${p}; p.focus(); const t = p.firstChild; getSelection().setBaseAndExtent(t, 0, t, 'Second'.length); })()`);
  await until(() => cy.evaluate(`${C}.resolved().filter((r) => r.caret).length === 2`), 'the carets of Ana and Ben on the page of Cy');
  const d = await untilDrawn(cy, (d) => d.carets.length === 2, 'the two caret bars on the page of Cy');
  assert.deepEqual([...new Set(d.flags.map((f) => f.text))].sort(), ['Ana', 'Ben'], 'a name flag of each person');
  assert.ok(Math.abs(d.carets[0].x - d.carets[1].x) > 20, `the bars are apart, at ${JSON.stringify(d.carets)}`);
  const name = `beeson-c${await cy.evaluate(`${C}.resolved().find((r) => r.name === 'Ben').color % 4`)}`;
  await until(async () => {
    await front(cy);
    await frame(cy);
    return cy.evaluate(`[...(CSS.highlights.get(${JSON.stringify(name)}) ?? [])].map((r) => r.toString()).join() === 'Second'`);
  }, 'the highlight of the selection of Ben on the page of Cy');
  assert.equal(await cy.evaluate(`${p}.innerHTML`), 'Second slide');
  const saved = await converge(server, [ana, ben, cy]);
  assert.ok(saved.includes('  <p>Second slide</p>') && !saved.includes('beeson-c') && !saved.includes('highlight'), 'the file keeps the paragraph without the highlight');
  clean(ana);
  clean(ben);
  clean(cy);
});

const REAL = `(() => {
  const r = getSelection().getRangeAt(0).getClientRects()[0];
  const sl = ${C}.app.slides(); const f = sl.getBoundingClientRect(); const k = f.width / sl.offsetWidth;
  return { x: (r.left + r.width / 2 - f.left) / k, y: (r.top + r.height / 2 - f.top) / k, length: Math.hypot(r.width, r.height) / k };
})()`;
const BAR = `(() => {
  const c = document.querySelector('.beeson-presence .caret');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const sl = ${C}.app.slides(); const f = sl.getBoundingClientRect(); const k = f.width / sl.offsetWidth;
  const m = new DOMMatrix(getComputedStyle(c).transform);
  return { x: (r.left + r.width / 2 - f.left) / k, y: (r.top + r.height / 2 - f.top) / k, length: c.offsetHeight / k, deg: (Math.atan2(m.b, m.a) * 180) / Math.PI };
})()`;

test('the caret bar in a turned text element is turned with it and as long as the line', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [onOne(`<div class="shape tone-accent" id="turned" style="width: 400px; height: 200px; translate: 1200px 300px; rotate: 40deg"><p>turned words</p></div>`)] });
  await show(ana, 'One');
  await show(ben, 'One');
  await front(ana);
  await caretAtEnd(ana, el(0, '#turned p'));
  await ana.evaluate(`(() => { const t = ${el(0, '#turned p')}.lastChild; getSelection().collapse(t, t.length); })()`);
  const real = await ana.evaluate(REAL);
  await until(() => ben.evaluate(`${C}.resolved()[0]?.caret?.at === 'turned words'.length`), 'the caret of Ana at the end of the text on the page of Ben');
  await untilDrawn(ben, (d) => d.carets.length === 1, 'the caret of Ana on the page of Ben');
  const bar = await ben.evaluate(BAR);
  assert.ok(Math.abs(bar.deg - 40) < 1, `the bar is turned by ${bar.deg} degrees`);
  assert.ok(Math.abs(bar.length - real.length) < 2 && Math.hypot(bar.x - real.x, bar.y - real.y) < 3, `the bar ${JSON.stringify(bar)} lies on the caret ${JSON.stringify(real)}`);
  clean(ana);
  clean(ben);
});

const COUNT = `(() => {
  if (window.__reads) { window.__reads = { all: 0, session: 0 }; return; }
  window.__reads = { all: 0, session: 0 };
  const note = () => {
    window.__reads.all++;
    if (/\\/session\\.js/.test(new Error().stack)) window.__reads.session++;
  };
  const wrap = (proto, name) => {
    const f = proto[name];
    proto[name] = function (...args) { note(); return f.apply(this, args); };
  };
  const getter = (proto, name) => {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    Object.defineProperty(proto, name, { ...d, get() { note(); return d.get.call(this); } });
  };
  for (const n of ['getBoundingClientRect', 'getClientRects']) { wrap(Element.prototype, n); wrap(Range.prototype, n); }
  const style = window.getComputedStyle;
  window.getComputedStyle = function (...args) { note(); return style.apply(this, args); };
  for (const n of ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop', 'offsetParent']) getter(HTMLElement.prototype, n);
  for (const n of ['clientWidth', 'clientHeight', 'clientLeft', 'clientTop', 'scrollWidth', 'scrollHeight', 'scrollLeft', 'scrollTop']) getter(Element.prototype, n);
})()`;

test('a drag of the own selection on a slide of 40 elements, 6 of them selected by another person, reads no layout for presence, and the frames follow it', { timeout: 120_000 }, async (t) => {
  const shapes = Array.from({ length: 40 }, (_, i) => shape(`s${i}`, 100 + (i % 8) * 210, 160 + Math.floor(i / 8) * 170, 160, 110));
  const { pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { edits: [onOne(...shapes)] });
  await show(ana, 'One');
  await show(ben, 'One');
  await select(ana, ...[0, 1, 2, 9, 10, 11].map((i) => el(0, `#s${i}`)));
  await select(ben, el(0, '#s0'));
  const before = await untilDrawn(ben, (d) => d.frames.length === 6, 'the six frames of Ana on the page of Ben');
  const moved = before.frames.reduce((a, b) => (b.x + b.y < a.x + a.y ? b : a));
  const from = center(await boxOf(ben, el(0, '#s0')));
  await ben.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
  await mouse(ben, 'mousePressed', from.x, from.y, { buttons: 1 });
  await ben.evaluate(COUNT);
  for (let i = 1; i <= 20; i++) {
    await ben.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + 3 * i, y: from.y + 2 * i, buttons: 1 });
    await frame(ben);
  }
  const reads = await ben.evaluate('({ ...window.__reads })');
  const during = await ben.evaluate(`[...document.querySelectorAll('.beeson-presence .frame')].map((f) => { const r = f.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })`);
  await mouse(ben, 'mouseReleased', from.x + 60, from.y + 40);
  await frame(ben);
  assert.ok(reads.all > 0, 'the reads of the page are counted');
  assert.equal(reads.session, 0, 'theme/session.js reads no layout in the pointer moves of a drag');
  const box = center(await boxOf(ben, el(0, '#s0')));
  const followed = during.find((f) => Math.abs(f.w - moved.w) < 1 && Math.abs(f.x - moved.x - (box.x - from.x)) < 2 && Math.abs(f.y - moved.y - (box.y - from.y)) < 2);
  assert.ok(box.x - from.x > 30 && followed, `the frame of Ana on the dragged element moves with it, by ${box.x - from.x}, ${box.y - from.y}`);
  clean(ana);
  clean(ben);
});
