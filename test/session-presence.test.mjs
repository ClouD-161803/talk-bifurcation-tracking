// the presence of the pages of a session in Chrome, on the edit command started on a temporary
// talk folder: the frame and the name flag of the selection of another page and its caret, read
// at the right element after the edits of others, the floor rule on a text element that another
// page holds, the lock class that never reaches the text, a tap on a chip in a phone window, and
// the reads of layout of a pointer move and a scroll over frames

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { caretAtEnd, frame, front } from './helpers/apply.mjs';
import { C, clean, converge, ONLINE, open, sessionUrl, show, talk, TEXT } from './helpers/client.mjs';
import { click, type, typeKeys } from './helpers/editor.mjs';
import { closeGate, openGate } from './helpers/gate.mjs';
import { ANSWERS, NET } from './helpers/net.mjs';
import { post, until } from './helpers/session.mjs';

const P = 'window.BeesonSession.presence()';
// the element of selector on the slide at index
const el = (slide, selector) => `document.querySelectorAll('.reveal .slides > section')[${slide}].querySelector(${JSON.stringify(selector)})`;

// the elements of expressions selected on page
async function select(page, ...expressions) {
  await front(page);
  const ok = await page.evaluate(`(() => {
    const els = [${expressions.join(', ')}];
    if (els.some((e) => !e)) return false;
    ${C}.app.selection.set('elements', els);
    return true;
  })()`);
  assert.ok(ok, `${expressions.join(', ')} are on the page`);
}

// what the layer of page draws: each frame and caret bar by its box on the screen, and each flag
// with its text, its long text, which a chip keeps without showing it, its client, and whether it
// is a chip
const DRAWN = `(() => {
  const box = (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const layer = document.querySelector('.beeson-presence');
  return {
    frames: [...layer.querySelectorAll('.frame')].map(box),
    flags: [...layer.querySelectorAll('.flag')].map((f) => ({ text: f.classList.contains('chip') && !f.parentElement.classList.contains('hover') ? f.querySelector('.short').textContent : f.textContent.replace(f.querySelector('.short')?.textContent ?? '', ''), long: f.querySelector('.long')?.textContent ?? null, client: f.dataset.client ?? null, chip: f.classList.contains('chip') })),
    carets: [...layer.querySelectorAll('.caret')].map(box),
  };
})()`;

const drawn = async (page) => {
  await front(page);
  await frame(page);
  return page.evaluate(DRAWN);
};

// the box of the element of expression on the screen
const boxOf = (page, expression) => page.evaluate(`(() => { const r = ${expression}.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);

// waits until the layer of page draws what holds for
async function until_(page, holds, what) {
  return until(async () => {
    const d = await drawn(page);
    return holds(d) ? d : null;
  }, what);
}

// asserts that frame lies around box, outside it on every side
function around(frameBox, box, label) {
  assert.ok(frameBox.x < box.x && frameBox.y < box.y && frameBox.x + frameBox.w > box.x + box.w && frameBox.y + frameBox.h > box.y + box.h, `${label}: the frame ${JSON.stringify(frameBox)} is around ${JSON.stringify(box)}`);
}

async function session(t, names = ['Ana', 'Ben'], options = {}) {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  const pages = [];
  for (const name of names) pages.push(await open(browser, sessionUrl(server.edit), { name, ...options }));
  await converge(server, pages);
  return { browser, server, pages };
}

test('the selection of another page is framed with a name flag, on its slide only, until it ends', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await select(ana, el(1, 'ul'));
  const seen = await until_(ben, (d) => d.frames.length === 1, 'the frame of the selection of Ana on the page of Ben');
  around(seen.frames[0], await boxOf(ben, el(1, 'ul')), 'the list');
  assert.deepEqual(seen.flags.map((f) => [f.text, f.chip]), [['Ana', false]]);
  const resolved = await ben.evaluate(`${C}.resolved().map((r) => ({ name: r.name, person: r.person, selected: r.selected.map((e) => e.localName), slide: r.slide?.querySelector('h2')?.textContent }))`);
  const person = await ana.evaluate(`${C}.person`);
  assert.deepEqual(resolved, [{ name: 'Ana', person, selected: ['ul'], slide: 'Two' }]);
  assert.deepEqual(await ana.evaluate(`${C}.resolved().length`), 1, 'the page of Ana resolves only Ben');

  // after 3 s the flag collapses to a chip with the initials
  const chip = await until_(ben, (d) => d.flags[0]?.chip, 'the flag of Ana to collapse');
  assert.equal(chip.flags[0].text, 'AN');

  // on another slide nothing is drawn
  await show(ben, 'One');
  assert.deepEqual(await drawn(ben), { frames: [], flags: [], carets: [] });
  await show(ben, 'Two');
  await until_(ben, (d) => d.frames.length === 1, 'the frame on the slide again');

  // a selection that ends takes the frame and the flag away
  await front(ana);
  await ana.evaluate(`${C}.app.selection.clear()`);
  await until_(ben, (d) => !d.frames.length && !d.flags.length, 'the frame to go');
  await select(ana, el(1, 'h2'), el(1, 'p'));
  const two = await until_(ben, (d) => d.frames.length === 2, 'the frames of two elements');
  around(two.frames[0], await boxOf(ben, el(1, 'h2')), 'the heading');
  around(two.frames[1], await boxOf(ben, el(1, 'p')), 'the paragraph');

  // a page that leaves takes its frames and flags with it
  await ana.close();
  await until_(ben, (d) => !d.frames.length && !d.flags.length, 'the frames of Ana to go when the page closes');
  assert.equal(await ben.evaluate(`${C}.resolved().length`), 0);
  clean(ben);
});

// the states that page sends are held back until release(), which sends the first or the last
const hold = (page) => page.evaluate(`(() => {
  const c = ${C};
  window.__send = c.sendPresence.bind(c);
  window.__held = [];
  c.sendPresence = (s) => window.__held.push(s);
})()`);
const release = (page, which = 'last') => page.evaluate(`(() => {
  const c = ${C};
  c.sendPresence = window.__send;
  const s = window.__held.${which === 'first' ? 'at(0)' : 'at(-1)'};
  if (s) c.sendPresence(s);
  return s ?? null;
})()`);

test('a selection is read at its element after another person inserts text and a third a slide before it', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben, cy] } = await session(t, ['Ana', 'Ben', 'Cy']);
  for (const page of [ana, ben, cy]) await show(page, 'Two');
  // the state of Ana is sent once Ben and Cy have changed the text before it, at the version
  // before their changes, which both carry through the operations they received
  await hold(ana);
  await select(ana, el(1, 'li:nth-child(2)'));
  await until(() => ana.evaluate('window.__held.length > 0'), 'the state of Ana with the list item');
  await caretAtEnd(ben, el(1, 'p'));
  await typeKeys(ben, ' with more words');
  // Ben leaves his text, whose frame the page of Cy would draw as well
  await ben.evaluate(`(() => { document.activeElement.blur(); getSelection().removeAllRanges(); })()`);
  await show(cy, 'One');
  await cy.evaluate(`${C}.app.commands.run('slide.new')`);
  await converge(server, [ana, ben, cy]);
  for (const page of [ben, cy]) {
    await show(page, 'Two');
    assert.equal(await page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`), 3);
  }
  const sent = await release(ana, 'first');
  const n = (v) => Number(v.split('.')[1]);
  const now = await ana.evaluate(`${C}.base.v`);
  assert.ok(n(now) - n(sent.v) >= 2, `the state of Ana at ${sent.v} is behind the text at ${now}`);
  for (const [page, name] of [[ben, 'Ben'], [cy, 'Cy']]) {
    const read = await until(() => page.evaluate(`(() => { const r = ${C}.resolved()[0]; return r?.selected.length ? { selected: r.selected.map((e) => e.textContent), slide: r.slide?.querySelector('h2')?.textContent ?? null } : null; })()`), `the selection of Ana on the page of ${name}`);
    assert.deepEqual(read.selected, ['Beta'], `on the page of ${name}`);
    assert.ok(read.slide === 'Two' || read.slide === null, `the slide of Ana on the page of ${name} is Two or in doubt, and it is ${read.slide}`);
    const d = await until_(page, (d) => d.frames.length === 1, `the frame on the page of ${name}`);
    around(d.frames[0], await boxOf(page, el(2, 'li:nth-child(2)')), `the item Beta on the page of ${name}`);
  }
  // the next state of Ana, of the newest version, reads the slide as well
  await show(ana, 'Two');
  await ana.evaluate(`${C}.app.selection.set('elements', [${el(2, 'li:nth-child(1)')}])`);
  for (const page of [ben, cy]) {
    const read = await until(() => page.evaluate(`(() => { const r = ${C}.resolved()[0]; return r?.selected[0]?.textContent === 'Alpha' ? r.slide?.querySelector('h2')?.textContent : null; })()`), 'the new selection of Ana');
    assert.equal(read, 'Two');
  }
  for (const page of [ana, ben, cy]) clean(page);
});

test('the flag of a person who types reads that the person is typing, and the caret is a bar', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await caretAtEnd(ana, el(1, 'p'));
  await typeKeys(ana, ' and more');
  await until(() => ben.evaluate(`${el(1, 'p')}.textContent.endsWith('and more')`), 'the text of Ana on the page of Ben');
  const text = await ben.evaluate(`(() => { const r = document.createRange(); r.selectNodeContents(${el(1, 'p')}); const b = r.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  const typing = await until_(ben, (d) => d.flags[0]?.text === 'Ana is typing' && d.carets.length === 1 && Math.abs(d.carets[0].x + d.carets[0].w / 2 - (text.x + text.w)) < 4, 'the flag of Ana typing and her caret at the end of the text');
  const bar = typing.carets[0];
  assert.ok(bar.y >= text.y - 2 && bar.y + bar.h <= text.y + text.h + 2 && bar.h > 10, 'the caret bar spans the line');
  assert.ok(bar.w >= 1.5 && bar.w <= 4, `the caret bar is 2 px wide, and it is ${bar.w}`);
  await until(async () => (await ben.evaluate(`${C}.resolved()[0]?.caret?.el.textContent`))?.endsWith('and more'), 'the caret element of Ana');
  // the caret moved to the start rests, and its offset is sent
  await ana.evaluate(`(() => { const r = document.createRange(); r.setStart(${el(1, 'p')}.firstChild, 0); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
  const start = await until_(ben, (d) => d.carets.length === 1 && Math.abs(d.carets[0].x - text.x) < 4, 'the caret bar at the start of the text');
  assert.ok(start.carets[0].x < bar.x);
  // 2 s after the last key the flag reads the name again, and the caret stays. the flag is a chip
  // by then when the keys took over a second, hence its long text is read
  const still = await until_(ben, (d) => d.flags[0]?.long === 'Ana', 'the flag of Ana after she stops typing');
  assert.equal(still.carets.length, 1);
  // the caret that leaves the text takes the bar away
  await ana.evaluate(`(() => { document.activeElement.blur(); getSelection().removeAllRanges(); })()`);
  await until_(ben, (d) => !d.carets.length, 'the caret bar to go');
  clean(ana);
  clean(ben);
});

const BUBBLE = `document.querySelector('.beeson-bubble')?.textContent ?? null`;
const REFUSED = 'Ana is typing here. You can edit this text once they leave it or stop for 30 s.';
const LOCKED = (expression) => `${expression}.classList.contains('beeson-held')`;
// the bubble of page cleared, so that the next one can be told from it
const unbubble = (page) => page.evaluate(`document.querySelector('.beeson-bubble')?.remove()`);

test('a text element that another page holds refuses a caret, a press, a selection, and the commands of its slide', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await until(() => ben.evaluate(LOCKED(p)), 'the paragraph that Ana holds to be locked on the page of Ben');
  assert.equal(await ana.evaluate(LOCKED(p)), false, 'the page that holds the paragraph does not lock it');
  assert.equal(await ben.evaluate(`${P}.holder(${p}).name`), 'Ana');

  // a click into the text
  await front(ben);
  await click(ben, await (async () => { const b = await boxOf(ben, p); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; })());
  assert.equal(await ben.evaluate(BUBBLE), REFUSED);
  assert.deepEqual(await ben.evaluate(`({ focused: document.activeElement === ${p} || ${p}.contains(document.activeElement), caret: ${p}.contains(getSelection().focusNode), selected: ${C}.app.selection.has(${p}) })`), { focused: false, caret: false, selected: false });
  // a caret put by a script
  await unbubble(ben);
  await ben.evaluate(`${p}.focus()`);
  assert.equal(await ben.evaluate(`document.activeElement === ${p}`), false);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED);
  // a selection, e.g. by the marquee or Select All, drops the element
  await unbubble(ben);
  await ben.evaluate(`${C}.app.selection.set('elements', [${p}, ${el(1, 'h2')}])`);
  assert.deepEqual(await ben.evaluate(`${C}.app.selection.items.map((e) => e.localName)`), ['h2']);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED);
  // the commands that change its slide, on the shown slide or on the slide selected as in the
  // navigator
  const moveTo = `{ slides: [Reveal.getCurrentSlide()], gap: 0 }`;
  for (const [id, slides, arg] of [['slide.delete', false], ['slide.hide', false], ['slide.cut', true], ['slide.moveTo', false, moveTo]]) {
    await unbubble(ben);
    await ben.evaluate(slides ? `${C}.app.selection.set('slides', [Reveal.getCurrentSlide()])` : `${C}.app.selection.clear()`);
    assert.ok(await ben.evaluate(`${C}.app.commands.enabled(${JSON.stringify(id)})`), `${id} is enabled`);
    await ben.evaluate(`${C}.app.commands.run(${JSON.stringify(id)}${arg ? `, ${arg}` : ''})`);
    assert.equal(await ben.evaluate(BUBBLE), REFUSED, id);
  }
  await ben.evaluate(`${C}.app.selection.clear()`);
  assert.equal(await ben.evaluate(`document.querySelectorAll('.reveal .slides > section').length`), 2);
  assert.equal(await ben.evaluate(`Reveal.getCurrentSlide().querySelector('h2').textContent`), 'Two');
  // a command of another slide is not refused
  await show(ben, 'One');
  await ben.evaluate(`${C}.app.commands.run('slide.hide')`);
  await until(() => ben.evaluate(`document.querySelectorAll('.reveal .slides > section')[0].hasAttribute('data-visibility')`), 'slide One to be hidden');

  // the lock never reaches the text: not the text of the port, a render, or index.html
  await show(ben, 'Two');
  await caretAtEnd(ben, el(1, 'h2'));
  await typeKeys(ben, ' too');
  // a copy of the slide with the locked paragraph in it
  await ben.evaluate(`${C}.app.commands.run('slide.duplicate')`);
  const text = await converge(server, [ana, ben]);
  assert.ok(text.includes('<h2>Two too</h2>') && text.includes('<section data-visibility="hidden">'), 'the edits of Ben reach index.html');
  assert.equal(text.split('<p>Second slide</p>').length, 3, 'the copy of the slide is in index.html');
  // Ana moves the caret into the copy, and of the two paragraphs only the copy is locked on the page
  // of Ben
  const at = 2;
  await ana.evaluate(`Reveal.slide(${at})`);
  await caretAtEnd(ana, el(at, 'p'));
  const held = el(at, 'p');
  const lockedAt = `[...document.querySelectorAll('.beeson-held')].map((e) => [...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.contains(e)))`;
  await until(async () => JSON.stringify(await ben.evaluate(lockedAt)) === `[${at}]`, 'only the copy that Ana is in to be locked on the page of Ben');
  for (const read of [TEXT, 'window.BeesonEditor.render()', `${C}.app.files.render()`]) assert.ok(!(await ben.evaluate(read)).includes('beeson-held'), read);
  assert.ok(!server.read().includes('beeson-held'));

  // a change of index.html from outside still reaches the held element
  let k = 0;
  writeFileSync(server.file, server.read().replace(/<p>Second slide<\/p>/g, (m) => (++k === at ? '<p>Second slide, from outside</p>' : m)));
  for (const page of [ana, ben]) await until(() => page.evaluate(`${held}.textContent === 'Second slide, from outside'`), 'the change from outside on each page');

  // the caret that leaves takes the lock away
  await front(ana);
  await ana.evaluate(`(() => { document.activeElement.blur(); getSelection().removeAllRanges(); })()`);
  await until(async () => !(await ben.evaluate(LOCKED(held))), 'the lock to go when Ana leaves the paragraph');
  await ben.evaluate(`Reveal.slide(${at})`);
  await caretAtEnd(ben, held);
  clean(ana);
  clean(ben);
});

// a copy of a slide that holds the element of a state makes its offset doubtful on another page, and
// a copy of a slide reloads the other pages today. the decision of send() is hence checked on its log
test('a page sends its state again at a new version when another page could not carry its last state', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await caretAtEnd(ana, el(1, 'p'));
  await until(() => ben.evaluate(LOCKED(el(1, 'p'))), 'the paragraph that Ana holds to be locked on the page of Ben');
  const sendsWhen = (carry) => ana.evaluate(`(() => {
    const p = ${P}, c = ${C}, send = c.sendPresence;
    // a change of the state that waits for its throttle is sent first
    p.send();
    let sent = 0;
    c.sendPresence = (s) => { sent++; send.call(c, s); };
    p.log.carry = ${carry};
    p.sentV = { ...p.sentV, n: p.sentV.n - 1 };
    p.send();
    c.sendPresence = send;
    delete p.log.carry;
    return sent;
  })()`);
  assert.equal(await sendsWhen('(o) => o'), 0, 'a state that the log carries to the same offsets is not sent again');
  assert.equal(await sendsWhen('() => null'), 1, 'a state with an offset in doubt is sent again');
  assert.equal(await sendsWhen('() => undefined'), 1, 'a state that the log does not reach is sent again');
  clean(ana);
  clean(ben);
});

test('the speaker notes that another page holds are locked, and not framed', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  writeFileSync(server.file, server.read().replace('<p>First slide</p>', '<p>First slide</p>\n  <aside class="notes">Notes of one</aside>'));
  await converge(server, [ana, ben]);
  const notes = el(0, 'aside.notes');
  for (const page of [ana, ben]) {
    await show(page, 'One');
    await page.evaluate(`${C}.app.commands.run('view.notes')`);
    await page.waitFor(`document.documentElement.classList.contains('beeson-notes')`);
  }
  // the Notes pane opens with the caret in the notes, which Ben leaves before Ana enters them
  await ben.evaluate(`(() => { document.activeElement?.blur(); getSelection().removeAllRanges(); })()`);
  await until(() => ana.evaluate(`${P}.locks.size === 0 && !${P}.resolved().some((r) => r.held)`), 'the notes to be free on the page of Ana');
  await caretAtEnd(ana, notes);
  await until(() => ben.evaluate(LOCKED(notes)), 'the notes that Ana holds to be locked on the page of Ben');
  await front(ben);
  await ben.evaluate(`${notes}.focus()`);
  assert.equal(await ben.evaluate(`document.activeElement === ${notes}`), false);
  assert.equal(await ben.evaluate(BUBBLE), REFUSED);
  assert.deepEqual((await drawn(ben)).frames, [], 'the notes are not framed');
  clean(ana);
  clean(ben);
});

// the clock of the floor rule of page moved by ms, and its deadlines taken
const later = (page, ms) => page.evaluate(`(() => { const p = ${P}; p.skew += ${ms}; p.check(); return true; })()`);

test('a hold beats every 5 s, is lost after 15 s of silence, and is taken by another person after 30 s without typing', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' typed');
  await until(() => ben.evaluate(LOCKED(p)), 'the lock of Ana on the page of Ben');
  const beat = () => ben.evaluate(`${C}.resolved()[0]?.beat`);
  assert.equal(await beat(), 0);

  // the heartbeat of Ana after 5 s
  await later(ana, 4900);
  assert.equal(await ana.evaluate(`${P}.held === ${p}`), true);
  await later(ana, 100);
  await until(async () => (await beat()) === 1, 'the first heartbeat of Ana');

  // 15 s without a heartbeat, on the clock of Ben, end the hold of Ana there. the clock is moved to
  // 14.9 s after the heartbeat was heard, and the lock is read in the same turn
  assert.equal(await ben.evaluate(`(() => { const p = ${P}; const o = [...p.others.values()][0]; p.skew += 14_900 - (p.now() - o.heardAt); p.check(); return ${LOCKED(p)}; })()`), true, 'still locked at 14.9 s');
  await later(ben, 100);
  assert.equal(await ben.evaluate(LOCKED(p)), false, 'the hold is lost after 15 s of silence');
  // and the next heartbeat holds it again
  await later(ana, 5000);
  await until(async () => (await beat()) === 2 && (await ben.evaluate(LOCKED(p))), 'the second heartbeat of Ana to lock the paragraph again');

  // 30 s without typing: the paragraph is open to Ben while the heartbeats go on
  await later(ben, 30_000);
  await later(ana, 30_000);
  await until(async () => (await beat()) === 3, 'the third heartbeat of Ana');
  await later(ben, 0);
  assert.equal(await ben.evaluate(LOCKED(p)), false, 'Ana has not typed for 30 s');
  await caretAtEnd(ben, p);
  // Ana yields the paragraph to Ben
  await until(() => ana.evaluate(`${LOCKED(p)} && ${P}.held === null`), 'Ana to yield the paragraph');
  assert.equal(await ana.evaluate(BUBBLE), 'Ben is editing this text now.');
  assert.deepEqual(await ana.evaluate(`({ caret: ${p}.contains(getSelection().focusNode), focused: document.activeElement === ${p} })`), { caret: false, focused: false });
  assert.equal(await ben.evaluate(`${P}.held === ${p} && !${LOCKED(p)}`), true, 'Ben holds the paragraph');
  await typeKeys(ben, ' by Ben');
  await until(() => ana.evaluate(`${p}.textContent.endsWith('typed by Ben')`), 'the typing of Ben on the page of Ana');
  clean(ana);
  clean(ben);
});

test('of two pages that claim one text element at the same time, the smaller client id keeps it', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await hold(ana);
  await hold(ben);
  await caretAtEnd(ana, p);
  await caretAtEnd(ben, p);
  await release(ana);
  await release(ben);
  const ids = { ana: await ana.evaluate(`${C}.client`), ben: await ben.evaluate(`${C}.client`) };
  const [keeper, loser, name] = ids.ana < ids.ben ? [ana, ben, 'Ana'] : [ben, ana, 'Ben'];
  await until(() => loser.evaluate(`${LOCKED(p)} && ${P}.held === null`), 'the page with the larger client id to give the paragraph up');
  assert.equal(await loser.evaluate(BUBBLE), `${name} is typing here. You can edit this text once they leave it or stop for 30 s.`);
  assert.equal(await loser.evaluate(`${p}.contains(getSelection().focusNode)`), false);
  assert.equal(await keeper.evaluate(`${P}.held === ${p} && !${LOCKED(p)}`), true);
  await until(() => keeper.evaluate(`${C}.resolved()[0]?.held === null`), 'the claim of the other page to end on the page that keeps the paragraph');
  clean(ana);
  clean(ben);
});

test('in a touch window of 390 px, a tap on a chip shows the name', { timeout: 120_000 }, async (t) => {
  const { browser, server, pages: [ana] } = await session(t, ['Ana']);
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben', width: 390, height: 844, mobile: true });
  await converge(server, [ana, ben]);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await select(ana, el(1, 'ul'));
  const chip = await until_(ben, (d) => d.flags[0]?.chip, 'the flag of Ana to collapse to a chip');
  assert.deepEqual(chip.flags.map((f) => f.text), ['AN']);
  const at = await ben.evaluate(`(() => { const r = document.querySelector('.beeson-presence .flag.chip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()`);
  assert.equal(at.w, 16, 'the chip is 16 px wide');
  // a tap 6 px off the chip, inside its hit area of 32 px
  const point = { x: at.x + 6, y: at.y + 6 };
  await ben.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await ben.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const shown = await until_(ben, (d) => d.flags[0] && !d.flags[0].chip, 'the chip to show the name after the tap');
  assert.equal(shown.flags[0].text, 'Ana');
  assert.equal(await ben.evaluate(`${C}.app.selection.kind`), 'none', 'the tap does not reach the canvas');
  // and it collapses again
  await until_(ben, (d) => d.flags[0]?.chip, 'the flag to collapse again');
  clean(ana);
  clean(ben);
});

// counts the reads of layout from now on in window.__reads, with those made by theme/session.js
const COUNT = `(() => {
  if (window.__reads) { window.__reads = { all: 0, session: 0 }; return; }
  window.__reads = { all: 0, session: 0 };
  const note = () => {
    window.__reads.all++;
    if (/session\\.js/.test(new Error().stack)) window.__reads.session++;
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

test('a pointer move and a scroll over three frames read no layout for presence', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await front(ben);
  await ben.evaluate(`${C}.app.stage.setZoom(2)`);
  await frame(ben);
  const canvas = await boxOf(ben, `${C}.app.stage.el`);
  const run = async () => {
    await front(ben);
    await ben.evaluate(`(() => { const el = ${C}.app.stage.el; el.scrollLeft = el.scrollWidth / 4; el.scrollTop = el.scrollHeight / 4; })()`);
    await frame(ben);
    await ben.evaluate(COUNT);
    for (let i = 0; i < 40; i++) await ben.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: canvas.x + 40 + ((canvas.w - 80) * i) / 40, y: canvas.y + canvas.h / 2 + 30 * Math.sin(i / 3) });
    for (let i = 0; i < 10; i++) {
      await ben.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: canvas.x + canvas.w / 2, y: canvas.y + canvas.h / 2, deltaX: 0, deltaY: i < 5 ? 60 : -60 });
      await frame(ben);
    }
    await frame(ben);
    return ben.evaluate('({ ...window.__reads })');
  };
  await select(ana, el(1, 'h2'), el(1, 'p'), el(1, 'ul'));
  await until_(ben, (d) => d.frames.length === 3, 'the three frames of Ana on the page of Ben');
  const framed = await run();
  assert.equal((await drawn(ben)).frames.length, 3);
  // the reads of the editor itself are counted as well, which shows that the count is taken
  assert.ok(framed.all > 0, 'the reads of the page are counted');
  assert.equal(framed.session, 0, 'theme/session.js reads no layout in a pointer move or a scroll over three frames');
  clean(ana);
  clean(ben);
});

test('a page that reads its source again keeps a remote edit that waits for its history', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'One');
  // the typeset of a slow machine keeps the transaction of Insert Formula open, and the formula is
  // selected without an offset once it ends
  await ana.evaluate(`(window.MathJax ??= { typesetPromise: async () => {} }, true)`);
  await closeGate(ana);
  await front(ana);
  await ana.evaluate(`void ${C}.app.commands.run('insert.formula')`);
  await until(() => ana.evaluate('window.__held > 0'), 'the typeset of the formula to wait');
  await caretAtEnd(ben, el(0, 'h2'));
  await type(ben, ' x');
  await until(() => ana.evaluate(`${C}.base.text.includes('<h2>One x</h2>') && ${el(0, 'h2')}.textContent === 'One'`), 'the edit of Ben to wait for the history of Ana');
  await openGate(ana);
  await until(() => ana.evaluate(`${C}.app.selection.items[0]?.matches('div.math') ?? false`), 'the formula to be selected');
  const text = await converge(server, [ana, ben]);
  assert.ok(text.includes('<h2>One x</h2>'), 'the edit of Ben is in index.html');
  assert.equal(await ben.evaluate(`${el(0, 'h2')}.textContent`), 'One x', 'the edit of Ben is on his page');
  assert.equal(await ana.evaluate(`${el(0, 'h2')}.textContent`), 'One x', 'the edit of Ben is on the page of Ana');
  clean(ana);
  clean(ben);
});

// the elements that page reads as selected by the first other page, by their text
const theirs = (page) => page.evaluate(`(${C}.resolved()[0]?.selected ?? []).map((e) => e.textContent.trim())`);

test('after a page deletes an element and selects the next one, the other page reads the selection', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await select(ana, el(1, 'li:nth-child(1)'));
  await until(async () => (await theirs(ben)).join() === 'Alpha', 'the selection of Alpha on the page of Ben');
  await ana.evaluate(`${C}.app.commands.run('element.delete')`);
  await converge(server, [ana, ben]);
  await select(ana, el(1, 'li'));
  await until(async () => (await theirs(ben)).join() === 'Beta', 'the selection of Beta on the page of Ben', 5000);
  clean(ana);
  clean(ben);
});

// each element of list on page by its slide, its place among its siblings, and its text
const where = (page, list) => page.evaluate(`(${list}).map((e) => [[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.contains(e)), [...e.parentElement.children].indexOf(e), e.textContent.trim()])`);

test('an element that a page makes itself is read by the other page once its operation is acknowledged', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await select(ana, el(1, 'li:nth-child(2)'));
  await until(async () => (await theirs(ben)).join() === 'Beta', 'the selection of Beta on the page of Ben');
  // the copy of Duplicate is selected
  await ana.evaluate(`${C}.app.commands.run('edit.duplicate')`);
  await converge(server, [ana, ben]);
  const copy = await where(ana, `${C}.app.selection.items`);
  assert.deepEqual(copy, [[1, 2, 'Beta']], 'the copy is selected on the page of Ana');
  await until(async () => JSON.stringify(await where(ben, `${C}.resolved()[0]?.selected ?? []`)) === JSON.stringify(copy), 'the copy selected on the page of Ben', 5000);
  // a new text box holds the caret, and it is held once it has text
  await ana.evaluate(`${C}.app.commands.run('insert.text')`);
  await until(() => ana.evaluate(`!!${P}.held`), 'the new text box to hold the caret of Ana');
  await typeKeys(ana, 'Hi');
  await converge(server, [ana, ben]);
  const box = await where(ana, `[${P}.held]`);
  assert.equal(box[0][2], 'Hi');
  await until(async () => JSON.stringify(await where(ben, `[${C}.resolved()[0]?.held].filter(Boolean)`)) === JSON.stringify(box), 'the text box held on the page of Ben', 5000);
  clean(ana);
  clean(ben);
});

// the polls of events of page wait while a gate is closed, and window.__waiting counts the polls
// that wait
const gatePolls = (page) => page.evaluate(`(() => {
  const f = window.fetch;
  window.__gate = null;
  window.__waiting = 0;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('/.session/events') || !window.__gate) return f.call(this, input, init);
    window.__waiting++;
    return window.__gate.then(() => (window.__waiting--, f.call(this, input, init)));
  };
  return true;
})()`);
const closePolls = (page) => page.evaluate(`(window.__gate = new Promise((done) => (window.__open = done)), true)`);
const openPolls = (page) => page.evaluate(`(window.__gate = null, window.__open(), true)`);
// the last state that page sent, once the edit command has it
const posted = (page) => until(() => page.evaluate(`(() => { const c = ${C}; return !c.presenceBusy && !c.presenceDue && ${P}.sent; })()`), 'the state of the page at the edit command');

test('a state of a version ahead of the page is read once an acknowledgment of the page reaches it', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'One');
  await gatePolls(ben);
  await select(ana, el(1, 'li:nth-child(2)'));
  await until(async () => (await theirs(ben)).join() === 'Beta', 'the selection of Beta on the page of Ben');
  // the poll of Ben at the edit command is answered at a change of his presence, and the next one
  // waits, hence the broadcast of his operation waits with the next state of Ana
  await closePolls(ben);
  await caretAtEnd(ben, el(0, 'p'));
  await until(() => ben.evaluate('window.__waiting > 0'), 'a poll of Ben to wait');
  await typeKeys(ben, 'x');
  await until(() => ben.evaluate(`(() => { const c = ${C}, s = c.snapshot(); return !c.sending && s.mine !== s.base; })()`), 'the operation of Ben to be answered');
  await until(() => ana.evaluate(`${C}.base.text.includes('First slidex')`), 'the operation of Ben on the page of Ana');
  await select(ana, el(1, 'li:nth-child(1)'));
  await until(() => ana.evaluate(`(() => { const s = ${P}.sent; return s.v === ${C}.base.v && s.selected.length === 1; })()`), 'the state of Ana with Alpha at the new version');
  const sent = await posted(ana);
  await openPolls(ben);
  await until(async () => (await ben.evaluate(`${C}.base.v`)) === sent.v, 'the base of Ben to reach the state of Ana');
  await until(async () => (await theirs(ben)).join() === 'Alpha', 'the selection of Alpha on the page of Ben', 5000);
  clean(ana);
  clean(ben);
});

test('a page that joins while another person types reads the selection of a page that does not type', { timeout: 120_000 }, async (t) => {
  const { browser, server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await gatePolls(ana);
  await select(ana, el(1, 'h2'));
  await until(async () => (await ben.evaluate(`(${C}.resolved()[0]?.selected ?? []).map((e) => e.localName).join()`)) === 'h2', 'the selection of Ana on the page of Ben');
  // the next answer to Ana holds the join of Cy and the operations of Ben that came before it
  await closePolls(ana);
  await caretAtEnd(ben, el(1, 'li:nth-child(2)'));
  await until(() => ana.evaluate('window.__waiting > 0'), 'a poll of Ana to wait');
  await typeKeys(ben, 'qq');
  await until(() => server.read().includes('<li>Betaqq</li>'), 'the typing of Ben in index.html');
  const cy = await open(browser, sessionUrl(server.edit), { name: 'Cy' });
  await show(cy, 'Two');
  await openPolls(ana);
  const of = (name) => `(${C}.resolved().find((r) => r.name === ${JSON.stringify(name)})?.selected ?? []).map((e) => e.localName).join()`;
  await until(async () => (await cy.evaluate(of('Ana'))) === 'h2', 'the selection of Ana on the page of Cy', 5000);
  clean(ana);
  clean(ben);
  clean(cy);
});

// a writer that is not a page, which joins the session of server and sends operations itself
async function writer(server) {
  const { port, base } = server.edit;
  const hello = (await post(port, `${base}.session/hello`, { name: 'Writer', person: 'writer-1' })).json();
  const w = { v: hello.v, seq: 0 };
  // count operations of one character b each, at the end of the text of Beta, which do not move the
  // offsets of the elements of the deck
  w.write = async (count) => {
    for (let i = 0; i < count; i++) {
      const at = server.read().indexOf('</li>\n  </ul>');
      const a = (await post(port, `${base}.session/op`, { token: hello.token, client: hello.client, seq: ++w.seq, base: w.v, patches: [{ start: at, end: at, text: 'b' }] })).json();
      assert.ok(a.ok, JSON.stringify(a));
      w.v = a.v;
    }
    return w.v;
  };
  return w;
}

// the texts of the elements that the person of name selects on page, without the b of the writer
const selectedOf = (page, name) => page.evaluate(`(${C}.resolved().find((r) => r.name === ${JSON.stringify(name)})?.selected ?? []).map((e) => e.textContent.trim().replace(/b+$/, ''))`);

test('a state older than a resync with the whole text keeps its elements, and a state of the resync is read after later operations', { timeout: 180_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  // a poll is answered within a second, hence a poll of a page waits at its gate soon
  const server = await talk(t, { env: { SLIDES_POLL_HOLD_MS: '1000' } });
  const ana = await open(browser, sessionUrl(server.edit), { name: 'Ana' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ana, ben]);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await gatePolls(ana);
  await gatePolls(ben);
  await select(ana, el(1, 'li:nth-child(2)'));
  await until(async () => (await selectedOf(ben, 'Ana')).join() === 'Beta', 'the selection of Beta on the page of Ben');
  await closePolls(ben);
  await until(() => ben.evaluate('window.__waiting > 0'), 'a poll of Ben to wait');
  // the log of the edit command keeps 1000 operations, hence it does not reach back to Ben
  const w = await writer(server);
  const first = await w.write(1010);
  await until(async () => (await ana.evaluate(`${C}.base.v`)) === first, 'the operations on the page of Ana');
  await select(ana, el(1, 'li:nth-child(1)'));
  await select(ana, el(1, 'li:nth-child(2)'));
  assert.equal((await posted(ana)).v, first);
  const resync = await w.write(10);
  await until(async () => (await ana.evaluate(`${C}.base.v`)) === resync, 'the last operations on the page of Ana');
  assert.equal((await posted(ana)).v, first);
  await openPolls(ben);
  await until(() => ben.evaluate(`(() => { const o = [...${P}.others.values()].find((o) => o.state.v === ${JSON.stringify(first)}); return ${C}.base.v === ${JSON.stringify(resync)} && !!o && !o.ahead; })()`), 'the state of Ana read again after the resync of Ben');
  assert.deepEqual(await selectedOf(ben, 'Ana'), ['Beta']);
  // a state of Ana at the version of the resync, read by Ben after one more operation
  await closePolls(ana);
  await until(() => ana.evaluate('window.__waiting > 0'), 'a poll of Ana to wait');
  const after = await w.write(1);
  await until(async () => (await ben.evaluate(`${C}.base.v`)) === after, 'the operation on the page of Ben');
  await select(ana, el(1, 'li:nth-child(1)'));
  assert.equal((await posted(ana)).v, resync);
  await until(async () => (await selectedOf(ben, 'Ana')).join() === 'Alpha', 'the selection of Alpha on the page of Ben', 5000);
  await openPolls(ana);
  clean(ana);
  clean(ben);
});

test('a page that the edit command drops for silence and takes back sends its state again', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  // a page without a poll for 3 s is dropped, and a poll is answered within a second
  const server = await talk(t, { env: { SLIDES_POLL_HOLD_MS: '1000', SLIDES_GONE_MS: '3000' } });
  const ana = await open(browser, sessionUrl(server.edit), { name: 'Ana' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ana, ben]);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await gatePolls(ana);
  await select(ana, el(1, 'li:nth-child(2)'));
  await until(async () => (await selectedOf(ben, 'Ana')).join() === 'Beta', 'the selection of Beta on the page of Ben');
  // a frozen tab, whose poll waits without an error
  await closePolls(ana);
  await until(() => ben.evaluate(`!${C}.people.some((p) => p.name === 'Ana')`), 'the edit command to drop Ana');
  await openPolls(ana);
  await until(() => ben.evaluate(`${C}.people.some((p) => p.name === 'Ana')`), 'the edit command to take Ana back');
  await until(async () => (await selectedOf(ben, 'Ana')).join() === 'Beta', 'the selection of Beta on the page of Ben again', 5000);
  clean(ana);
  clean(ben);
});

test('a selected element whose start tag another change renames is not read as the new element', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  // a poll is answered within a second, hence a poll of a page waits at its gate soon
  const server = await talk(t, { env: { SLIDES_POLL_HOLD_MS: '1000' } });
  const ana = await open(browser, sessionUrl(server.edit), { name: 'Ana' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ana, ben]);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await gatePolls(ana);
  await select(ana, el(1, 'p'));
  const read = `(${C}.resolved().find((r) => r.name === 'Ana')?.selected ?? []).map((e) => e.localName)`;
  await until(async () => (await ben.evaluate(read)).join() === 'p', 'the selection of the paragraph on the page of Ben');
  // Ana does not hear of the change, hence Ben reads her last state again after it
  await closePolls(ana);
  await until(() => ana.evaluate('window.__waiting > 0'), 'a poll of Ana to wait');
  writeFileSync(server.file, server.read().replace('<p>Second slide</p>', '<h3>Second slide</h3>'));
  await until(() => ben.evaluate(`!!${el(1, 'h3')}`), 'the heading on the page of Ben');
  await until(async () => (await ben.evaluate(read)).join() !== 'p', 'Ben to read the state of Ana again');
  assert.deepEqual(await ben.evaluate(read), []);
  await openPolls(ana);
  clean(ana);
  clean(ben);
});

test('a caret at the start of a line after a line break is drawn at the start of this line', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  writeFileSync(server.file, server.read().replace('<p>Second slide</p>', '<p>Second slide, tail<br>next line</p>'));
  const ana = await open(browser, sessionUrl(server.edit), { name: 'Ana' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ana, ben]);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await front(ana);
  const mine = await ana.evaluate(`(() => {
    const p = ${el(1, 'p')};
    p.focus();
    const r = document.createRange();
    r.setStart(p.querySelector('br').nextSibling, 0);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    const b = r.getClientRects();
    return { x: b[b.length - 1].left, y: b[b.length - 1].top, at: ${P}.client.shell.presence.caretIn(p) };
  })()`);
  await until(async () => (await ben.evaluate(`${C}.resolved()[0]?.caret?.at`)) === mine.at, 'the caret of Ana on the page of Ben');
  const d = await until_(ben, (d) => d.carets.length === 1, 'the caret bar of Ana');
  const bar = d.carets[0];
  assert.ok(Math.abs(bar.x + bar.w / 2 - mine.x) < 2 && Math.abs(bar.y - mine.y) < 4, `the bar at ${JSON.stringify(bar)} is at the caret of Ana at ${JSON.stringify(mine)}`);
  clean(ana);
  clean(ben);
});

test('of two pages whose claims of one text element are heard 4 s late, the smaller client id keeps it', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await hold(ana);
  await hold(ben);
  await caretAtEnd(ana, p);
  await caretAtEnd(ben, p);
  // both clocks move 4 s, as for states that arrive 4 s late
  await later(ana, 4000);
  await later(ben, 4000);
  await release(ana);
  await release(ben);
  const ids = { ana: await ana.evaluate(`${C}.client`), ben: await ben.evaluate(`${C}.client`) };
  const [keeper, loser] = ids.ana < ids.ben ? [ana, ben] : [ben, ana];
  await until(() => loser.evaluate(`${LOCKED(p)} && ${P}.held === null`), 'the page with the larger client id to give the paragraph up', 5000);
  assert.equal(await keeper.evaluate(`${P}.held === ${p} && !${LOCKED(p)}`), true);
  clean(ana);
  clean(ben);
});

test('a hold of an element that leaves the page ends, and its heartbeat stops', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const beta = el(1, 'li:nth-child(2)');
  await caretAtEnd(ana, beta);
  await until(() => ana.evaluate(`${P}.held === ${beta}`), 'the hold of Beta on the page of Ana');
  await until(async () => (await ben.evaluate(`${C}.resolved()[0]?.held?.textContent`)) === 'Beta', 'the hold of Ana on the page of Ben');
  writeFileSync(server.file, server.read().replace('\n    <li>Beta</li>', ''));
  await until(() => ana.evaluate(`!${el(1, 'li:nth-child(2)')}`), 'Beta to leave the page of Ana');
  const beat = await ana.evaluate(`${P}.sent.beat`);
  await later(ana, 5000);
  assert.equal(await ana.evaluate(`${P}.held`), null);
  assert.equal(await ana.evaluate(`${P}.sent.beat`), beat);
  assert.equal(await ana.evaluate(`${P}.ticker`), 0, 'the ticker of the floor rule stops');
  clean(ana);
  clean(ben);
});

test('a hold whose holder is idle for 30 s is not locked on a page whose clock was set back', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await until(() => ben.evaluate(LOCKED(p)), 'the paragraph locked on the page of Ben');
  const first = await ben.evaluate(`${C}.resolved()[0].beat`);
  // the clock of Ben goes back 9 min, e.g. at a correction of the time of the machine
  await ben.evaluate(`(() => { const real = Date.now; Date.now = () => real.call(Date) - 540_000; return true; })()`);
  // 35 s pass without typing, and the heartbeats of Ana arrive every 5 s
  for (let i = 1; i <= 7; i++) {
    await later(ben, 5000);
    await later(ana, 5000);
    await until(async () => (await ben.evaluate(`${C}.resolved()[0]?.beat`)) === first + i, `heartbeat ${i} of Ana on the page of Ben`);
  }
  await later(ben, 0);
  assert.equal(await ben.evaluate(LOCKED(p)), false);
  clean(ana);
  clean(ben);
});

test('a listener of the client that throws is reported, and the page goes on polling', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await ben.evaluate(`(() => { let n = 0; ${C}.on('ops', () => { if (n++ === 0) throw new Error('a part failed'); }); return true; })()`);
  await show(ana, 'One');
  await caretAtEnd(ana, el(0, 'p'));
  await type(ana, ' one');
  await until(() => server.read().includes('First slide one'), 'the first edit in index.html');
  await until(() => ben.evaluate(`window.BeesonEditor.session.text().includes('First slide one')`), 'the first edit on the page of Ben');
  await type(ana, ' two');
  await until(() => ben.evaluate(`window.BeesonEditor.session.text().includes('First slide one two')`), 'the second edit on the page of Ben');
  assert.ok(ben.errors.some((e) => e.includes('a part failed')), `the error is reported: ${JSON.stringify(ben.errors)}`);
  clean(ana);
  clean(ben, [/a part failed/]);
});

// the timers of presence on page that are set: the ticker of the floor rule, the throttle of a
// state, the rest of the caret, and the end of typing
const TIMERS = `(() => { const p = ${P}; return [p.ticker, p.timer, p.restTimer, p.typingTimer].filter((id) => id !== 0).length; })()`;

test('after Leave Session and after the end of the session, no element stays locked, and no timer of presence runs', { timeout: 120_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  // a poll is answered within a second, hence the poll of Ben in flight when he leaves is answered soon
  const server = await talk(t, { env: { SLIDES_POLL_HOLD_MS: '1000' } });
  const pages = [];
  for (const name of ['Ana', 'Ben', 'Cy']) pages.push(await open(browser, sessionUrl(server.edit), { name, script: `${NET}\n${ANSWERS}` }));
  await converge(server, pages);
  const [ana, ben, cy] = pages;
  const p = el(1, 'p');
  for (const page of [ana, ben, cy]) await show(page, 'Two');
  await caretAtEnd(ana, p);
  await typeKeys(ana, 'x');
  await until(() => server.read().includes('<p>Second slidex</p>'), 'the letter of Ana in index.html');
  await until(async () => (await ben.evaluate(LOCKED(p))) && (await cy.evaluate(LOCKED(p))), 'the paragraph locked on the pages of Ben and Cy');
  await front(ben);
  // Ben leaves while a poll of his is in flight, and its answer, which his client drops, arrives after
  await ben.waitFor(`(() => {
    if (__net.log.findLast((l) => l.url.includes('/.session/events'))?.status !== null) return false;
    window.__before = window.__answers;
    ${C}.leave();
    return true;
  })()`);
  await until(() => ben.evaluate(`${C}.connection === 'ended'`), 'Ben to leave');
  await ben.waitFor(`window.__answers > window.__before`);
  assert.deepEqual(await ben.evaluate(`({ locked: ${LOCKED(p)}, resolved: ${C}.resolved().length, timers: ${TIMERS} })`), { locked: false, resolved: 0, timers: 0 });
  // a caret and keys after the end begin no hold
  await ben.evaluate(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await caretAtEnd(ben, el(1, 'h2'));
  await typeKeys(ben, 'y');
  assert.deepEqual(await ben.evaluate(`({ held: ${P}.held, timers: ${TIMERS} })`), { held: null, timers: 0 });
  // a signal ends a process at once on Windows, where a page is thus not told the end of the session
  if (process.platform !== 'win32') {
    server.edit.child.kill('SIGTERM');
    await server.edit.exited;
    server.edit = null;
    for (const page of [ana, cy]) await until(() => page.evaluate(`${C}.connection === 'ended'`), 'the end of the session');
    assert.deepEqual(await cy.evaluate(`({ locked: ${LOCKED(p)}, resolved: ${C}.resolved().length, timers: ${TIMERS} })`), { locked: false, resolved: 0, timers: 0 });
    assert.deepEqual(await ana.evaluate(`({ held: ${P}.held, timers: ${TIMERS} })`), { held: null, timers: 0 });
  }
  clean(ana);
  clean(ben);
  clean(cy);
});

test('unsent edits of the sender are taken out of its offsets', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  // the operations of Ana wait until window.__go
  await ana.evaluate(`(() => {
    const f = window.fetch;
    const gate = new Promise((done) => (window.__go = done));
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/.session/op')) return gate.then(() => f.call(this, input, init));
      return f.call(this, input, init);
    };
    return true;
  })()`);
  await show(ana, 'One');
  await caretAtEnd(ana, el(0, 'p'));
  await typeKeys(ana, ' with many more words');
  // Ben changes slide One, which Ana applies over her unsent words
  await show(ben, 'One');
  await caretAtEnd(ben, el(0, 'h2'));
  await type(ben, ' x');
  await until(() => ana.evaluate(`${el(0, 'h2')}.textContent === 'One x'`), 'the edit of Ben on the page of Ana');
  await until(() => ana.evaluate(`window.BeesonEditor.session.copy().includes('First slide with many more words') && !${C}.acked()`), 'Ana with unsent words');
  await ana.evaluate(`(() => { document.activeElement.blur(); getSelection().removeAllRanges(); })()`);
  await show(ana, 'Two');
  await select(ana, el(1, 'li:nth-child(2)'));
  const id = await ana.evaluate(`${C}.client`);
  await until(async () => {
    const sent = await ana.evaluate(`JSON.stringify(${P}.sent)`);
    const s = JSON.parse(sent);
    if (!s || s.caret || s.selected.length !== 1) return false;
    return (await ben.evaluate(`JSON.stringify(${C}.presence.find((p) => p.client === ${JSON.stringify(id)})?.state)`)) === sent;
  }, 'the state of Ana with one selected element on the page of Ben');
  assert.deepEqual(await selectedOf(ben, 'Ana'), ['Beta']);
  await ana.evaluate('window.__go()');
  clean(ana);
  clean(ben);
});

test('a name with markup is shown as text in the flag', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t, ['<i>Ana</i>', 'Ben']);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await select(ana, el(1, 'ul'));
  const text = await until(async () => {
    await front(ben);
    await frame(ben);
    return ben.evaluate(`document.querySelector('.beeson-presence .flag .long')?.textContent ?? null`);
  }, 'the flag of Ana on the page of Ben');
  assert.equal(text, '<i>Ana</i>');
  clean(ana);
  clean(ben);
});

test('after a restart, a page that rejoins second is read by the other page', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { script: NET });
  const { port } = server.edit;
  await show(ana, 'Two');
  await show(ben, 'Two');
  await select(ana, el(1, 'ul'));
  await until(async () => (await selectedOf(ben, 'Ana')).length === 1, 'the selection of Ana on the page of Ben');
  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  // Ana also retries by her own timer. her hello is held, hence she rejoins after Ben is read alone
  await ana.evaluate(`__net.rule('/.session/hello', 'hold')`);
  await until(() => ana.evaluate(`${C}.connection !== 'online'`), 'Ana offline');
  await until(() => ben.evaluate(`${C}.connection !== 'online'`), 'Ben offline');
  await server.start(['--port', String(port)]);
  await ben.evaluate(`${C}.tryNow(); true`);
  await ben.waitFor(ONLINE, 20_000);
  await until(() => ben.evaluate(`${C}.people.length === 1`), 'Ben alone at the edit command');
  await ana.evaluate(`(__net.clear(), __net.release('/.session/hello'), ${C}.tryNow(), true)`);
  await ana.waitFor(ONLINE, 20_000);
  await until(async () => (await selectedOf(ben, 'Ana')).length === 1, 'the selection of Ana on the page of Ben after the restart', 10_000);
  // the requests to the edit command that stopped, the polls with the tokens of before, and the
  // hello without a name, which the edit command refuses after a kill that lost the person
  const refused = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 404 .*\/\.session\/events\?/, /status of 400 .*\/\.session\/hello/];
  clean(ana, refused);
  clean(ben, refused);
});

test('the heartbeat is sent by the timer of the page, without check()', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await caretAtEnd(ana, el(1, 'p'));
  await until(() => ben.evaluate(LOCKED(el(1, 'p'))), 'the paragraph locked on the page of Ben');
  const first = await ben.evaluate(`${C}.resolved()[0].beat`);
  await ana.evaluate(`(${P}.skew += 5000, true)`);
  await until(async () => (await ben.evaluate(`${C}.resolved()[0]?.beat`)) === first + 1, 'the first heartbeat by the timer of Ana', 4000);
  clean(ana);
  clean(ben);
});

test('after a restart, a state that waited while the edit command was down is sent with the new token', { timeout: 120_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  const { port } = server.edit;
  await show(ana, 'Two');
  await show(ben, 'Two');
  // the presence requests of Ana wait while window.__hold is set, and the statuses of their answers
  // are kept
  await ana.evaluate(`(() => {
    const f = window.fetch;
    window.__hold = null;
    window.__holding = 0;
    window.__statuses = [];
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      if (!url.includes('/.session/presence')) return f.call(this, input, init);
      window.__holding++;
      return Promise.resolve(window.__hold).then(() => (window.__holding--, f.call(this, input, init))).then((r) => (window.__statuses.push(r.status), r));
    };
    return true;
  })()`);
  await select(ana, el(1, 'ul'));
  await until(async () => (await selectedOf(ben, 'Ana')).length === 1, 'the selection of Ana on the page of Ben');
  await ana.evaluate(`(window.__hold = new Promise((done) => (window.__release = done)), true)`);
  await select(ana, el(1, 'h2'));
  await until(() => ana.evaluate('window.__holding === 1'), 'the state of Ana to wait');
  server.edit.child.kill('SIGKILL');
  await server.edit.exited;
  // the state fails against the edit command that stopped, and it waits for the next one
  await ana.evaluate('(window.__release(), true)');
  await until(() => ana.evaluate(`window.__holding === 0 && !${C}.presenceBusy && ${C}.connection !== 'online'`), 'the state of Ana to fail, and Ana offline');
  await until(() => ben.evaluate(`${C}.connection !== 'online'`), 'Ben offline');
  await server.start(['--port', String(port)]);
  await ben.evaluate(`${C}.tryNow(); true`);
  await ben.waitFor(ONLINE, 20_000);
  await ana.evaluate(`${C}.tryNow(); true`);
  await ana.waitFor(ONLINE, 20_000);
  const h2 = `(${C}.resolved().find((r) => r.name === 'Ana')?.selected ?? []).map((e) => e.localName).join()`;
  await until(async () => (await ben.evaluate(h2)) === 'h2', 'the selection of Ana on the page of Ben after the restart', 10_000);
  assert.deepEqual((await ana.evaluate('window.__statuses')).filter((s) => s !== 200 && s !== 204), [], 'every state is sent with a token that the edit command knows');
  const refused = [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/, /status of 404 .*\/\.session\/events\?/, /status of 400 .*\/\.session\/hello/];
  clean(ana, refused);
  clean(ben, refused);
});

test('a page back online sends its state before the answer of its next poll', { timeout: 120_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t, ['Ana', 'Ben'], { script: NET });
  await show(ana, 'One');
  await show(ben, 'One');
  await select(ana, el(0, 'h2'));
  await until(async () => (await selectedOf(ben, 'Ana')).join() === 'One', 'the selection of Ana on the page of Ben');
  await ana.evaluate(`(__net.rule('/.session/', 'cut'), __net.drop('/.session/'), true)`);
  await ana.waitFor(`${C}.connection === 'offline'`);
  // the first poll after the reconnect is held, as the edit command holds a poll without news
  await ana.evaluate(`(__net.clear(), __net.rule('/.session/events', 'hold', { times: 1 }), ${C}.tryNow(), true)`);
  await ana.waitFor(`${ONLINE} && __net.held.length === 1`);
  await select(ana, el(0, 'p'));
  await until(async () => (await selectedOf(ben, 'Ana')).join() === 'First slide', 'the new selection of Ana on the page of Ben while her poll is held');
  await ana.evaluate(`__net.release('/.session/events')`);
  clean(ana);
  clean(ben);
});
