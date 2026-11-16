// the presence of the pages of a session in Chrome, on the edit command started on a temporary
// talk folder: the frame and the name flag of the selection of another page and its caret, read
// at the right element after the edits of others, the highlight of a selection, the hold of a text
// element that another page types in, which never reaches the text, a tap on a chip and into a
// text element in a phone window, and the reads of layout of a pointer move and a scroll over frames

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

test('the selection of another page is framed with a name flag, on its slide only, until it ends', { timeout: 360_000 }, async (t) => {
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

test('a selection is read at its element after another person inserts text and a third a slide before it', { timeout: 480_000 }, async (t) => {
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

test('the flag of a person who types reads that the person is typing, and the caret is a bar', { timeout: 300_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  await caretAtEnd(ana, el(1, 'p'));
  // a timer of 2 s on the page of Ana, started at each key after the typing timer of presence.ts,
  // records whether the last state that her page sent by then says that she stopped typing
  await ana.evaluate(`(() => {
    const c = ${C};
    const send = c.sendPresence.bind(c);
    c.sendPresence = (s) => { window.__typing = s.typing; return send(s); };
    let timer = 0;
    document.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { window.__stopped = window.__typing === false; }, 2000); }, true);
    return true;
  })()`);
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
  await until(() => ana.evaluate(`window.__stopped !== undefined`), 'the timer of 2 s after the last key of Ana');
  assert.equal(await ana.evaluate(`window.__stopped`), true, 'the page of Ana sends that she stopped typing 2 s after her last key');
  // the caret that leaves the text takes the bar away
  await ana.evaluate(`(() => { document.activeElement.blur(); getSelection().removeAllRanges(); })()`);
  await until_(ben, (d) => !d.carets.length, 'the caret bar to go');
  clean(ana);
  clean(ben);
});

const BUBBLE = `document.querySelector('.beeson-bubble')?.textContent ?? null`;
const REFUSED = 'Ana is typing here. You can do this once they leave it or stop for 30 s.';
// the name of the person who holds the element of expression, or null
const HOLDER = (expression) => `${P}.holderOf(${expression})?.name ?? null`;
// the bubble of page cleared, so that the next one can be told from it
const unbubble = (page) => page.evaluate(`document.querySelector('.beeson-bubble')?.remove()`);

test('a text element that another page types in takes a caret, a selection, and the typing of a second page, and refuses the commands of its slide', { timeout: 420_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' typed');
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the paragraph that Ana types in to be held on the page of Ben');
  assert.equal(await ana.evaluate(HOLDER(p)), null, 'the paragraph is not held on the page that types in it');

  // a click into the text puts the caret there, and a selection in it is kept
  await front(ben);
  await click(ben, await (async () => { const b = await boxOf(ben, p); return { x: b.x + b.w / 4, y: b.y + b.h / 2 }; })());
  assert.equal(await ben.evaluate(BUBBLE), null);
  assert.deepEqual(await ben.evaluate(`({ focused: document.activeElement === ${p}, caret: ${p}.contains(getSelection().focusNode) })`), { focused: true, caret: true });
  await ben.evaluate(`(() => { const t = ${p}.firstChild; getSelection().setBaseAndExtent(t, 0, t, 'Second'.length); })()`);
  await frame(ben);
  assert.equal(await ben.evaluate(`getSelection().toString()`), 'Second');
  assert.equal(await ben.evaluate(`${C}.app.selection.kind`), 'text');
  // Ben types over the selection, and Ana at the end
  await typeKeys(ben, 'Ben');
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' and more');
  let text = await converge(server, [ana, ben]);
  assert.ok(text.includes('<p>Ben slide typed and more</p>'), `both texts reach index.html: ${text.match(/<p>.*slide.*<\/p>/g)}`);
  assert.equal(await ben.evaluate(HOLDER(p)), 'Ana');

  // the commands that change its slide, on the shown slide or on the slide selected as in the
  // navigator
  const moveTo = `{ slides: [Reveal.getCurrentSlide()], gap: 0 }`;
  await front(ben);
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

  // a copy of the slide with the held paragraph in it
  await show(ben, 'Two');
  await ben.evaluate(`${C}.app.commands.run('slide.duplicate')`);
  text = await converge(server, [ana, ben]);
  assert.equal(text.split('<p>Ben slide typed and more</p>').length, 3, 'the copy of the slide is in index.html');
  // Ana moves the caret into the copy, and of the two paragraphs only the copy is held on the page
  // of Ben
  const at = 2;
  await ana.evaluate(`Reveal.slide(${at})`);
  await caretAtEnd(ana, el(at, 'p'));
  const held = el(at, 'p');
  const heldAt = `[...document.querySelectorAll('.reveal .slides > section')].flatMap((s, i) => [...s.querySelectorAll('p')].some((e) => ${P}.holderOf(e)) ? [i] : [])`;
  await until(async () => JSON.stringify(await ben.evaluate(heldAt)) === `[${at}]`, 'only the copy that Ana is in to be held on the page of Ben');
  // the hold is not written into the page, the text of the port, a render, or index.html
  for (const page of [ana, ben]) assert.equal(await page.evaluate(`document.querySelector('.beeson-held')`), null);
  for (const read of [TEXT, 'window.BeesonEditor.render()', `${C}.app.files.render()`]) assert.ok(!(await ben.evaluate(read)).includes('beeson-held'), read);
  assert.ok(!server.read().includes('beeson-held'));

  // a change of index.html from outside still reaches the held element
  let k = 0;
  writeFileSync(server.file, server.read().replace(/<p>Ben slide typed and more<\/p>/g, (m) => (++k === at ? '<p>Second slide, from outside</p>' : m)));
  for (const page of [ana, ben]) await until(() => page.evaluate(`${held}.textContent === 'Second slide, from outside'`), 'the change from outside on each page');

  // the caret that leaves takes the hold away
  await front(ana);
  await ana.evaluate(`(() => { document.activeElement.blur(); getSelection().removeAllRanges(); })()`);
  await until(async () => (await ben.evaluate(HOLDER(held))) === null, 'the hold to go when Ana leaves the paragraph');
  clean(ana);
  clean(ben);
});

// the x in px of the point after n characters of the text of the element of expression
const xAt = (page, expression, n) => page.evaluate(`(() => {
  const w = document.createTreeWalker(${expression}, NodeFilter.SHOW_TEXT);
  let left = ${n};
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    if (left <= t.length) { const r = document.createRange(); r.setStart(t, left); return r.getClientRects()[0].left; }
    left -= t.length;
  }
  return null;
})()`);

test('a caret sent before the typing of another person reaches the page of this person is drawn at its characters', { timeout: 240_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  // the state of Ana with her caret after Second is held back while Ben types before it
  await hold(ana);
  await front(ana);
  await ana.evaluate(`(() => { const p = ${p}; p.focus(); getSelection().collapse(p.firstChild, 'Second'.length); })()`);
  await until(() => ana.evaluate(`(window.__mine = window.__held.findLast((s) => s.caret?.at === 'Second'.length)) !== undefined`), 'the state of Ana with her caret');
  await front(ben);
  await ben.evaluate(`(() => { const p = ${p}; p.focus(); getSelection().collapse(p.firstChild, 0); })()`);
  await typeKeys(ben, 'XYZ');
  await ben.evaluate(`(() => { document.activeElement.blur(); getSelection().removeAllRanges(); })()`);
  await until(() => ana.evaluate(`${p}.textContent === 'XYZSecond slide'`), 'the typing of Ben on the page of Ana');
  await ana.evaluate(`window.__send(window.__mine)`);
  const d = await until_(ben, (d) => d.carets.length === 1, 'the caret of Ana on the page of Ben');
  const x = await xAt(ben, p, 'XYZSecond'.length);
  assert.ok(Math.abs(d.carets[0].x + d.carets[0].w / 2 - x) < 2, `the caret of Ana is drawn after XYZSecond, at ${x}, and it is at ${d.carets[0].x + d.carets[0].w / 2}`);
  clean(ana);
  clean(ben);
});

// Chrome writes the space before an element as U+00A0 into the text of the person who types
// there, and the other pages hold U+0020 at this place
test('the caret of a person whose browser holds a space as a no-break space is drawn at its characters while the next state is on its way', { timeout: 240_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  writeFileSync(server.file, server.read().replace('<p>Second slide</p>', '<p>Second <strong>slide</strong></p>'));
  const ana = await open(browser, sessionUrl(server.edit), { name: 'Ana' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ana, ben]);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  const text = (page) => page.evaluate(`${p}.textContent`);
  await front(ben);
  await ben.evaluate(`(() => { const p = ${p}; p.focus(); getSelection().collapse(p.firstChild, 'Second'.length); })()`);
  await typeKeys(ben, ' here');
  await until(async () => (await text(ana)) === 'Second here slide', 'the typing of Ben on the page of Ana');
  assert.equal(await text(ben), 'Second here\u00a0slide', 'Chrome wrote U+00A0 into the text of Ben');
  await until(() => ana.evaluate(`${C}.resolved().find((r) => r.name === 'Ben')?.caret?.at === 'Second here'.length`), 'the caret of Ben after here on the page of Ana');
  // the states of Ben with his caret after too are held back, as on a slow network
  await hold(ben);
  await typeKeys(ben, ' too');
  await until(async () => (await text(ana)) === 'Second here too slide', 'the second typing of Ben on the page of Ana');
  const x = await xAt(ana, p, 'Second here too'.length);
  // the center of the bar of Ben on the page of Ana
  const bar = async () => {
    const d = await drawn(ana);
    return d.carets.length === 1 ? d.carets[0].x + d.carets[0].w / 2 : null;
  };
  const there = await until(async () => Math.abs((await bar()) - x) < 2, 'the bar', 5000).catch(() => false);
  assert.ok(there, `the caret of Ben is drawn after Second here too, at ${x}, and it is at ${await bar()}`);
  clean(ana);
  clean(ben);
});

const MATHJAX = '<script src="theme/mathjax-config.js"></script>\n<script src="theme/vendor/mathjax/tex-svg.js"></script>\n</head>';

test('the caret and the selection of another person in a paragraph with a formula are drawn without a lookup of the formulas of the whole deck', { timeout: 300_000 }, async (t) => {
  const browser = await launch({ offline: false });
  t.after(() => browser.close());
  const server = await talk(t);
  writeFileSync(server.file, server.read().replace('</head>', MATHJAX).replace('<p>Second slide</p>', '<p>Second slide</p>\n  <p>A square \\(x^2\\) in a line</p>'));
  const ana = await open(browser, sessionUrl(server.edit), { name: 'Ana' });
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben' });
  await converge(server, [ana, ben]);
  const math = `document.querySelectorAll('.reveal .slides > section')[1].querySelectorAll('p')[1]`;
  for (const page of [ana, ben]) {
    await show(page, 'Two');
    await page.waitFor(`!!${math}.querySelector('mjx-container')`);
  }
  await ben.evaluate(`(() => {
    const d = window.MathJax.startup.document;
    const items = d.getMathItemsWithin.bind(d);
    window.__whole = 0;
    d.getMathItemsWithin = (nodes) => (nodes.includes(document.body) && window.__whole++, items(nodes));
    return true;
  })()`);
  // Ana selects the words after the formula, and then puts the caret at their end
  await front(ana);
  await ana.evaluate(`(() => { const p = ${math}; p.focus(); const t = p.lastChild; getSelection().setBaseAndExtent(t, 1, t, t.length); })()`);
  await until_(ben, (d) => d.carets.length === 1, 'the caret of Ana on the page of Ben');
  await front(ana);
  await ana.evaluate(`getSelection().collapseToEnd()`);
  const end = await xAt(ben, math, 'A square '.length + 1);
  await until_(ben, (d) => d.carets.length === 1 && d.carets[0].x > end, 'the caret of Ana at the end of the paragraph');
  assert.equal(await ben.evaluate('window.__whole'), 0, 'the formulas are looked up in the paragraph alone');
  clean(ana);
  clean(ben);
});

// a copy of a slide that holds the element of a state makes its offset doubtful on another page, and
// a copy of a slide reloads the other pages today. the decision of send() is hence checked on its log
test('a page sends its state again at a new version when another page could not carry its last state', { timeout: 180_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await caretAtEnd(ana, el(1, 'p'));
  await until(async () => (await ben.evaluate(HOLDER(el(1, 'p')))) === 'Ana', 'the paragraph that Ana is in to be held on the page of Ben');
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

test('the speaker notes that another page types in are held, and not framed', { timeout: 300_000 }, async (t) => {
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
  await until(() => ana.evaluate(`${P}.holds.size === 0`), 'the notes to be free on the page of Ana');
  await caretAtEnd(ana, notes);
  await until(async () => (await ben.evaluate(HOLDER(notes))) === 'Ana', 'the notes that Ana is in to be held on the page of Ben');
  assert.deepEqual((await drawn(ben)).frames, [], 'the notes are not framed');
  // Ben puts a caret into them as well
  await caretAtEnd(ben, notes);
  assert.equal(await ben.evaluate(BUBBLE), null);
  clean(ana);
  clean(ben);
});

// the clock of the holds of page moved by ms
const later = (page, ms) => page.evaluate(`(() => { ${P}.skew += ${ms}; return true; })()`);

test('a text element is held while the caret of another person is in it and this person was active in the last 30 s', { timeout: 300_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' typed');
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the hold of Ana on the page of Ben');
  // the end of the typing of Ana is her last activity, in a state sent after her last key
  await until(() => ben.evaluate(`${P}.resolved().some((r) => r.name === 'Ana' && r.caret?.at === 'Second slide typed'.length && !r.typing)`), 'Ana to stop typing');
  await later(ben, 29_000);
  assert.equal(await ben.evaluate(HOLDER(p)), 'Ana', 'still held at 29 s');
  await later(ben, 1000);
  assert.equal(await ben.evaluate(HOLDER(p)), null, 'not held after 30 s without typing');
  assert.equal(await ben.evaluate(`${P}.holds.size`), 0);
  // Ana holds it again when she types. bringing her page to the front can take its caret out
  await front(ana);
  await caretAtEnd(ana, p);
  await typeKeys(ana, '!');
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the hold of Ana after she types again');
  // a caret moved to another element is an activity, and the hold goes with it
  await later(ben, 30_000);
  await caretAtEnd(ana, el(1, 'h2'));
  await until(async () => (await ben.evaluate(`(${HOLDER(el(1, 'h2'))}) === 'Ana' && (${HOLDER(p)}) === null`)), 'the hold to move with the caret of Ana');
  // a caret that leaves takes the hold away
  await ana.evaluate(`(() => { document.activeElement.blur(); getSelection().removeAllRanges(); })()`);
  await until(() => ben.evaluate(`${P}.holds.size === 0`), 'the hold to go when Ana leaves the heading');
  clean(ana);
  clean(ben);
});

// the texts of the ranges of each highlight of page by its name, after a frame of the page in front
const highlights = async (page) => {
  await front(page);
  await frame(page);
  return JSON.stringify(await page.evaluate(`Object.fromEntries([...CSS.highlights].map(([name, h]) => [name, [...h].map((r) => r.toString())]))`));
};
// the background of the highlight of name in the element of expression
const tintOf = (page, expression, name) => page.evaluate(`getComputedStyle(${expression}, '::highlight(${name})').backgroundColor`);

test('the selected text of another person is a highlight in the tone of the person, hidden in a preview, until the selection or the session ends', { timeout: 300_000 }, async (t) => {
  const { server, pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await front(ana);
  await ana.evaluate(`(() => { const p = ${p}; p.focus(); const t = p.firstChild; getSelection().setBaseAndExtent(t, t.length, t, 'Second '.length); })()`);
  await until(() => ben.evaluate(`${C}.resolved()[0]?.caret?.from === 'Second slide'.length`), 'the selection of Ana on the page of Ben');
  const name = `beeson-c${await ben.evaluate(`${C}.resolved()[0].color % 4`)}`;
  await until(async () => (await highlights(ben)) === JSON.stringify({ [name]: ['slide'] }), 'the highlight of the selection of Ana on the page of Ben');
  assert.notEqual(await tintOf(ben, p, name), 'rgba(0, 0, 0, 0)', 'the highlight has a color');
  await ben.evaluate(`document.documentElement.classList.add('beeson-previewing')`);
  assert.equal(await tintOf(ben, p, name), 'rgba(0, 0, 0, 0)', 'the highlight is transparent in a preview');
  await ben.evaluate(`document.documentElement.classList.remove('beeson-previewing')`);
  // the highlight is not written into the text
  assert.ok(!(await ben.evaluate(TEXT)).includes('highlight') && !server.read().includes('highlight'));
  // a collapsed selection takes the highlight away
  await front(ana);
  await ana.evaluate(`getSelection().collapseToEnd()`);
  await until(async () => (await highlights(ben)) === '{}', 'the highlight to go when Ana collapses the selection');
  // and Leave Session deletes it
  await front(ana);
  await ana.evaluate(`(() => { const t = ${p}.firstChild; getSelection().setBaseAndExtent(t, 0, t, 'Second'.length); })()`);
  await until(async () => (await highlights(ben)) === JSON.stringify({ [name]: ['Second'] }), 'the highlight of the new selection of Ana');
  await front(ben);
  await ben.evaluate(`${C}.leave()`);
  await until(() => ben.evaluate(`${C}.connection === 'ended'`), 'Ben to leave');
  assert.equal(await highlights(ben), '{}');
  clean(ana);
  clean(ben);
});

test('the text on each side of a caret is read as 12 characters at most', { timeout: 240_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await caretAtEnd(ana, el(1, 'p'));
  await until(() => ben.evaluate(`${C}.resolved()[0]?.caret?.post === ''`), 'the caret of Ana on the page of Ben');
  await hold(ana);
  await ana.evaluate(`(() => { const s = ${P}.sent; window.__send({ ...s, caret: { ...s.caret, pre: 'a'.repeat(999) + 'z', post: 'y' + 'b'.repeat(999) } }); })()`);
  await until(() => ben.evaluate(`${C}.resolved()[0]?.caret?.post.length > 0`), 'the long caret of Ana on the page of Ben');
  assert.deepEqual(await ben.evaluate(`(({ pre, post }) => ({ pre, post }))(${C}.resolved()[0].caret)`), { pre: 'a'.repeat(11) + 'z', post: 'y' + 'b'.repeat(11) });
  clean(ana);
  clean(ben);
});

test('in a touch window of 390 px, a tap on a chip shows the name', { timeout: 300_000 }, async (t) => {
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

test('in a touch window of 390 px, a tap puts the caret into a text element that another person types in, and both texts are kept', { timeout: 300_000 }, async (t) => {
  const { browser, server, pages: [ana] } = await session(t, ['Ana']);
  const ben = await open(browser, sessionUrl(server.edit), { name: 'Ben', width: 390, height: 844, mobile: true });
  await converge(server, [ana, ben]);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' typed');
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the paragraph that Ana types in to be held on the page of Ben');
  await front(ben);
  const b = await boxOf(ben, p);
  const point = { x: b.x + 2, y: b.y + b.h / 2 };
  await ben.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await ben.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(() => ben.evaluate(`document.activeElement === ${p} && ${p}.contains(getSelection().focusNode)`), 'the caret of Ben in the paragraph');
  assert.equal(await ben.evaluate(BUBBLE), null);
  await ben.evaluate(`getSelection().collapse(${p}.firstChild, 0)`);
  await typeKeys(ben, 'Ben: ');
  await caretAtEnd(ana, p);
  await typeKeys(ana, ' and more');
  const text = await converge(server, [ana, ben]);
  assert.ok(text.includes('<p>Ben: Second slide typed and more</p>'), 'both texts reach index.html');
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

test('a pointer move and a scroll over three frames read no layout for presence', { timeout: 240_000 }, async (t) => {
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

test('a page that reads its source again keeps a remote edit that waits for its history', { timeout: 300_000 }, async (t) => {
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

test('after a page deletes an element and selects the next one, the other page reads the selection', { timeout: 240_000 }, async (t) => {
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

test('an element that a page makes itself is read by the other page once its operation is acknowledged', { timeout: 300_000 }, async (t) => {
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
  // a new text box holds the caret, which is read on the other page once the box has text
  await ana.evaluate(`${C}.app.commands.run('insert.text')`);
  await until(() => ana.evaluate(`!!${P}.caretHost`), 'the caret of Ana in the new text box');
  await typeKeys(ana, 'Hi');
  await converge(server, [ana, ben]);
  const box = await where(ana, `[${P}.caretHost]`);
  assert.equal(box[0][2], 'Hi');
  await until(async () => JSON.stringify(await where(ben, `[${C}.resolved()[0]?.caret?.el].filter(Boolean)`)) === JSON.stringify(box), 'the caret of Ana in the text box on the page of Ben', 5000);
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

test('a state of a version ahead of the page is read once an acknowledgment of the page reaches it', { timeout: 300_000 }, async (t) => {
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

test('a page that joins while another person types reads the selection of a page that does not type', { timeout: 300_000 }, async (t) => {
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

test('a state older than a resync with the whole text keeps its elements, and a state of the resync is read after later operations', { timeout: 360_000 }, async (t) => {
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

test('a page that the edit command drops for silence and takes back sends its state again', { timeout: 240_000 }, async (t) => {
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

test('a selected element whose start tag another change renames is not read as the new element', { timeout: 300_000 }, async (t) => {
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

test('a caret at the start of a line after a line break is drawn at the start of this line', { timeout: 240_000 }, async (t) => {
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
    return { x: b[b.length - 1].left, y: b[b.length - 1].top, at: ${P}.client.shell.presence.selectionIn(p).at };
  })()`);
  await until(async () => (await ben.evaluate(`${C}.resolved()[0]?.caret?.at`)) === mine.at, 'the caret of Ana on the page of Ben');
  const d = await until_(ben, (d) => d.carets.length === 1, 'the caret bar of Ana');
  const bar = d.carets[0];
  assert.ok(Math.abs(bar.x + bar.w / 2 - mine.x) < 2 && Math.abs(bar.y - mine.y) < 4, `the bar at ${JSON.stringify(bar)} is at the caret of Ana at ${JSON.stringify(mine)}`);
  clean(ana);
  clean(ben);
});

test('a person idle for 30 s does not hold the element of the caret on a page whose clock was set back', { timeout: 240_000 }, async (t) => {
  const { pages: [ana, ben] } = await session(t);
  await show(ana, 'Two');
  await show(ben, 'Two');
  const p = el(1, 'p');
  await caretAtEnd(ana, p);
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana', 'the paragraph held on the page of Ben');
  // the clock of Ben goes back 9 min, e.g. at a correction of the time of the machine, and 30 s pass
  // without typing
  await ben.evaluate(`(() => { const real = Date.now; Date.now = () => real.call(Date) - 540_000; return true; })()`);
  await later(ben, 30_000);
  assert.equal(await ben.evaluate(HOLDER(p)), null);
  clean(ana);
  clean(ben);
});

test('a listener of the client that throws is reported, and the page goes on polling', { timeout: 240_000 }, async (t) => {
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

// the timers of presence on page that are set: the throttle of a state, the rest of the caret, and
// the end of typing
const TIMERS = `(() => { const p = ${P}; return [p.timer, p.restTimer, p.typingTimer].filter((id) => id !== 0).length; })()`;

test('after Leave Session and after the end of the session, no element stays held, and no timer of presence runs', { timeout: 360_000 }, async (t) => {
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
  await until(async () => (await ben.evaluate(HOLDER(p))) === 'Ana' && (await cy.evaluate(HOLDER(p))) === 'Ana', 'the paragraph held on the pages of Ben and Cy');
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
  assert.deepEqual(await ben.evaluate(`({ held: ${HOLDER(p)}, resolved: ${C}.resolved().length, timers: ${TIMERS} })`), { held: null, resolved: 0, timers: 0 });
  // a caret and keys after the end set no timer
  await ben.evaluate(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await caretAtEnd(ben, el(1, 'h2'));
  await typeKeys(ben, 'y');
  assert.equal(await ben.evaluate(TIMERS), 0);
  // a signal ends a process at once on Windows, where a page is thus not told the end of the session
  if (process.platform !== 'win32') {
    server.edit.child.kill('SIGTERM');
    await server.edit.exited;
    server.edit = null;
    for (const page of [ana, cy]) await until(() => page.evaluate(`${C}.connection === 'ended'`), 'the end of the session');
    assert.deepEqual(await cy.evaluate(`({ held: ${HOLDER(p)}, resolved: ${C}.resolved().length, timers: ${TIMERS} })`), { held: null, resolved: 0, timers: 0 });
    assert.equal(await ana.evaluate(TIMERS), 0);
  }
  clean(ana);
  clean(ben);
  clean(cy);
});

test('unsent edits of the sender are taken out of its offsets', { timeout: 300_000 }, async (t) => {
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

test('a name with markup is shown as text in the flag', { timeout: 240_000 }, async (t) => {
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

test('after a restart, a page that rejoins second is read by the other page', { timeout: 420_000 }, async (t) => {
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

test('after a restart, a state that waited while the edit command was down is sent with the new token', { timeout: 420_000 }, async (t) => {
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

test('a page back online sends its state before the answer of its next poll', { timeout: 300_000 }, async (t) => {
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
