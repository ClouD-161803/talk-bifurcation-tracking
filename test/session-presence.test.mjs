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
import { C, clean, converge, open, sessionUrl, show, talk, TEXT } from './helpers/client.mjs';
import { click, typeKeys } from './helpers/editor.mjs';
import { until } from './helpers/session.mjs';

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
// with its text, its client, and whether it is a chip
const DRAWN = `(() => {
  const box = (n) => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const layer = document.querySelector('.beeson-presence');
  return {
    frames: [...layer.querySelectorAll('.frame')].map(box),
    flags: [...layer.querySelectorAll('.flag')].map((f) => ({ text: f.classList.contains('chip') && !f.parentElement.classList.contains('hover') ? f.querySelector('.short').textContent : f.textContent.replace(f.querySelector('.short')?.textContent ?? '', ''), client: f.dataset.client ?? null, chip: f.classList.contains('chip') })),
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
