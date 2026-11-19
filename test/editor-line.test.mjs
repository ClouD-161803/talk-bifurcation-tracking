// lines and arrows of commands/line.ts on both platforms, driven with trusted input: Insert > Arrow
// writes an svg with a line and a marker before the notes of the slide, a drag in the mode of
// Insert > Line draws a line, with Shift at a multiple of 45 degrees, a press near a line selects
// it and shows the Line pane, whose swatches and arrowheads set its tone and its markers, a drag of
// an end handle moves that end, a drag of the line moves it, and a duplicate points its arrowheads
// at its own marker. each edit is checked byte for byte, after an undo and a redo, against the
// scope rule, and after a save and an open of the saved text

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { attributeProblem, textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { boxOf, distance, fixHeads, lineText, stepped } from '../src/editor/commands/line.ts';
import { byteExact, click, drag, press, saveAndReopen, type } from './helpers/editor.mjs';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
const PANEL = '#beeson-edit-panel-format';
const SECTIONS = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].map((m) => m[0]);
const MATH = SECTIONS.findIndex((s) => s.includes('<h2>Math, an ordered list, and a zone</h2>'));

let browser;
let server;
before(async () => {
  browser = await launch({ offline: false });
  server = await serve('.');
});
after(async () => {
  await browser?.close();
  server?.close();
});

let last = null;

async function linePage(platform, n = MATH) {
  await last?.close().catch(() => {});
  const page = await browser.newPage();
  last = page;
  await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(LAYOUTS, 'utf8');
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
  assert.deepEqual(status.problems, []);
  await page.evaluate(`Reveal.slide(${n})`);
  await frames(page);
  return page;
}

const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

async function inScope(page) {
  const now = textProblems(await render(page), THEME);
  for (const p of textProblems(page.source, THEME)) {
    const i = now.indexOf(p);
    if (i >= 0) now.splice(i, 1);
  }
  assert.deepEqual(now, []);
}

// the screen point of a point in slide px
const screen = (page, x, y) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  return { x: r.left + ${x} * k, y: r.top + ${y} * k };
})()`);

// the lines of the current slide, with their ends in slide px, classes, and markers
const lines = (page) => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('svg.line')].map((svg) => {
  const l = svg.querySelector('line');
  const [tx, ty] = (svg.style.translate || '0px 0px').split(' ').map((v) => parseFloat(v) || 0);
  const n = (a) => Number(l.getAttribute(a));
  return { ends: [tx + n('x1'), ty + n('y1'), tx + n('x2'), ty + n('y2')], cls: svg.getAttribute('class'), id: svg.querySelector('marker').id,
    start: l.getAttribute('marker-start'), end: l.getAttribute('marker-end'), stroke: getComputedStyle(l).stroke, width: svg.getBoundingClientRect().width };
})`);

// the rendered text without the one line inserted into it, and that line
async function inserted(page) {
  const text = await render(page);
  const m = /\n[ \t]*(<svg class="line[^\n]*<\/svg>)/.exec(text);
  assert.ok(m, 'a line is not in the rendered text');
  assert.equal(text.slice(0, m.index) + text.slice(m.index + m[0].length), page.source);
  return m[1];
}

test('the markup, the arrowheads of a copy, the steps of 45 degrees, and the distance of a line', () => {
  const t = lineText({ x1: 700, y1: 600, x2: 300, y2: 400 }, { id: 'line-1', heads: 'end', tone: 'accent' });
  assert.equal(t, '<svg class="line tone-accent" width="400" height="200" style="translate: 300px 400px"><defs><marker id="line-1" orient="auto-start-reverse"><path d="M-4-2.5 1 0-4 2.5z"></path></marker></defs><line x1="400" y1="200" x2="0" y2="0" marker-end="url(#line-1)"></line></svg>');
  assert.deepEqual(textProblems(t, THEME), []);
  assert.deepEqual(boxOf({ x1: 10, y1: 5, x2: 10, y2: 5 }), { left: 10, top: 5, width: 1, height: 1 });
  const both = lineText({ x1: 0, y1: 0, x2: 10, y2: 0 }, { id: 'line-2', heads: 'both' });
  assert.ok(both.startsWith('<svg class="line" width="10" height="1"><defs>'));
  assert.ok(both.includes('marker-start="url(#line-2)" marker-end="url(#line-2)"'));
  const copy = `<p>a</p>\n${both.replace('id="line-2"', 'id="line-3"')}`;
  assert.equal(fixHeads(copy), `<p>a</p>\n${both.replaceAll('line-2', 'line-3')}`);
  assert.equal(fixHeads('<svg class="beeson"><marker id="a"></marker><line marker-end="url(#b)"></line></svg>'), '<svg class="beeson"><marker id="a"></marker><line marker-end="url(#b)"></line></svg>');
  const s = stepped({ x: 0, y: 0 }, { x: 100, y: 90 });
  assert.ok(Math.abs(s.x - s.y) < 1e-9 && Math.abs(s.x - 95) < 1e-9);
  assert.deepEqual(stepped({ x: 0, y: 0 }, { x: 100, y: 10 }), { x: 100, y: 0 });
  assert.equal(distance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
  assert.equal(distance({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
});

for (const platform of PLATFORMS) {
  test(`Insert > Arrow writes an svg before the notes, undone and redone byte for byte, and saved, on ${platform}`, async () => {
    const page = await linePage(platform);
    assert.equal((await state(page, 'insert.arrow')).enabled, true);
    await exec(page, 'insert.arrow', { from: { x: 300, y: 400 }, to: { x: 700, y: 600 } });
    await frames(page);
    const svg = await inserted(page);
    assert.equal(svg, lineText({ x1: 300, y1: 400, x2: 700, y2: 600 }, { id: 'line-1', heads: 'end' }));
    const [l] = await lines(page);
    assert.deepEqual(l.ends, [300, 400, 700, 600]);
    assert.equal(l.end, 'url(#line-1)');
    // stroked in --text, and drawn at the scale of the slide
    const text = await page.evaluate(`(() => { const d = document.createElement('div'); d.style.color = 'var(--text)'; Reveal.getCurrentSlide().append(d); const c = getComputedStyle(d).color; d.remove(); return c; })()`);
    assert.equal(l.stroke, text);
    assert.ok(l.width > 100);
    // the line is selected and the Line pane is shown
    assert.equal((await state(page, 'line.heads.none')).enabled, true);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    assert.ok(await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].some((b) => b.textContent === 'Line')`));
    await inScope(page);
    await undo(page);
    await byteExact(page);
    await redo(page);
    assert.equal(await inserted(page), svg);
    const { text: saved } = await saveAndReopen(page, `line-${platform}.html`);
    assert.ok(saved.includes(svg));
    assert.deepEqual(errors(page), []);
  });

  test(`a drag in the mode of Insert > Line draws a line, with Shift at 45 degrees, and Esc leaves the mode, on ${platform}`, async () => {
    const page = await linePage(platform);
    await exec(page, 'insert.line');
    assert.equal((await state(page, 'insert.line')).checked, true);
    const a = await screen(page, 200, 300);
    const b = await screen(page, 600, 330);
    // the modifier of a move without the snap draws the line where the pointer is
    await drag(page, a, { dx: b.x - a.x, dy: b.y - a.y, modifiers: platform === 'mac' ? 'Meta' : 'Alt' });
    await frames(page);
    let [l] = await lines(page);
    assert.ok(Math.abs(l.ends[0] - 200) <= 1 && Math.abs(l.ends[1] - 300) <= 1, `${l.ends}`);
    assert.ok(Math.abs(l.ends[2] - 600) <= 2 && Math.abs(l.ends[3] - 330) <= 2);
    assert.equal(l.end, null);
    assert.equal((await state(page, 'insert.line')).checked, null);
    await undo(page);
    await byteExact(page);
    // with Shift the end is at 45 degrees from the start
    await exec(page, 'insert.line');
    const c = await screen(page, 500, 570);
    await drag(page, a, { dx: c.x - a.x, dy: c.y - a.y, modifiers: 'Shift' });
    await frames(page);
    [l] = await lines(page);
    assert.ok(Math.abs(l.ends[2] - l.ends[0] - (l.ends[3] - l.ends[1])) <= 1 && l.ends[2] - l.ends[0] > 200, `${l.ends}`);
    await undo(page);
    await byteExact(page);
    // Esc leaves the mode, and a drag then does not draw
    await exec(page, 'insert.arrow');
    await press(page, 'Escape');
    assert.equal((await state(page, 'insert.arrow')).checked, null);
    await byteExact(page);
    assert.deepEqual(errors(page), []);
  });

  test(`the Line pane sets the tone and the arrowheads, and the end handles and a drag move a line, on ${platform}`, async () => {
    const page = await linePage(platform);
    await exec(page, 'insert.line', { from: { x: 300, y: 500 }, to: { x: 800, y: 500 } });
    await exec(page, 'selection.clear');
    assert.equal((await state(page, 'line.heads.none')).enabled, false);
    await frames(page);
    // a press within a few pixels of the line selects it
    const m = await screen(page, 550, 500);
    await click(page, { x: m.x, y: m.y + 3 });
    await frames(page);
    assert.equal((await state(page, 'line.heads.none')).enabled, true);
    assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-line-end')].filter((g) => !g.hidden).length`), 2);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    const svg = await inserted(page);
    await click(page, `${PANEL} [data-command="line.tone.accent"]`);
    await frames(page);
    let [l] = await lines(page);
    assert.equal(l.cls, 'line tone-accent');
    const accent = await page.evaluate(`getComputedStyle(Reveal.getCurrentSlide()).getPropertyValue('--accent').trim()`);
    assert.ok(accent);
    assert.equal(await inserted(page), svg.replace('class="line"', 'class="line tone-accent"'));
    await click(page, `${PANEL} [data-command="line.heads.both"]`);
    await frames(page);
    [l] = await lines(page);
    assert.equal(l.start, `url(#${l.id})`);
    assert.equal(l.end, `url(#${l.id})`);
    assert.equal((await state(page, 'line.heads.both')).checked, true);
    await inScope(page);
    await undo(page);
    await undo(page);
    assert.equal(await inserted(page), svg);
    await redo(page);
    await redo(page);
    const styled = await inserted(page);
    // a drag of the second end handle moves only that end, by the drag, from a handle drawn past
    // the arrowhead
    const end = await page.evaluate(`(() => { const r = document.querySelector('.beeson-line-end[data-end="2"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const at = await screen(page, l.ends[2], l.ends[3]);
    const to = await screen(page, 800, 700);
    await drag(page, end, { dx: to.x - at.x, dy: to.y - at.y, modifiers: platform === 'mac' ? 'Meta' : 'Alt' });
    await frames(page);
    [l] = await lines(page);
    assert.deepEqual(l.ends.slice(0, 2), [300, 500]);
    assert.ok(Math.abs(l.ends[2] - 800) <= 2 && Math.abs(l.ends[3] - 700) <= 2, `${l.ends}`);
    await inScope(page);
    await undo(page);
    assert.equal(await inserted(page), styled);
    await redo(page);
    const moved = await inserted(page);
    // a drag of the line moves both ends
    const mid = await screen(page, 550, 600);
    await drag(page, mid, { dx: 0, dy: -100, modifiers: platform === 'mac' ? 'Meta' : 'Alt' });
    await frames(page);
    const [k] = await lines(page);
    assert.ok(Math.abs(k.ends[1] - l.ends[1] - (k.ends[3] - l.ends[3])) <= 1 && k.ends[1] < l.ends[1], `${k.ends} ${l.ends}`);
    await undo(page);
    assert.equal(await inserted(page), moved);
    await redo(page);
    // a duplicate points its arrowheads at its own marker
    await press(page, 'Mod+D');
    await frames(page);
    const all = await lines(page);
    assert.equal(all.length, 2);
    assert.notEqual(all[0].id, all[1].id);
    for (const one of all) assert.equal(one.end, `url(#${one.id})`);
    await inScope(page);
    const { text } = await saveAndReopen(page, `line-pane-${platform}.html`);
    assert.equal((text.match(/<svg class="line/g) ?? []).length, 2);
    assert.deepEqual(errors(page), []);
  });
}

// tests of R20.3, curved and elbow lines with weights and a dash, on both platforms with trusted
// input. a curve is a path M x1 y1 Q cx cy x2 y2 and an elbow a path of horizontal and vertical
// segments in an svg.line, drawn by Curved Arrow and Elbow Arrow of the Insert menu, selected and
// marqueed by their stroke, bent by a third grip, and switched with the segment Kind of the Line
// pane. the segment Weight writes weight-2, weight-6, or weight-8 on the svg, and the switch Dashed
// writes dashed. each edit is checked byte for byte after an undo and a redo, against the scope
// rule, and after a save and an open of the saved text. the geometry of canvas/stroke.ts is tested
// under node
describe('curved and elbow arrows with weights and dashes', async () => {
  // imported by itself, so that each test fails on its own without the module
  const { bboxOf, bendTo, gripOf, parseStroke, pointsOf, rebend, strokeText, withKind } = await import('../src/editor/canvas/stroke.ts').catch(() => ({}));

  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r20-3.html';
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const PANEL = '#beeson-edit-panel-format';
  const ORIGINAL = readFileSync(DECK, 'utf8').match(/<svg class="line fragment"[^\n]*<\/svg>/)[0];
  const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
  // a child element of a line, read by parseStroke as a DOM element is
  const child = (localName, attrs) => ({ localName, getAttribute: (n) => attrs[n] ?? null });

  test('the text, the box, the grip, and a moved end of a curve and an elbow in canvas/stroke.ts', () => {
    // a curve from 100,500 to 500,500 bulging up to its control point at 300,300
    const curve = { kind: 'curve', x1: 100, y1: 500, x2: 500, y2: 500, c: { x: 300, y: 300 } };
    const t = strokeText(curve);
    assert.equal(t.tag, 'path');
    // the apex is at y 400, halfway to the control point, hence the box is 100 px high
    assert.deepEqual(t.box, { left: 100, top: 400, width: 400, height: 100 });
    assert.equal(t.attrs.d, 'M0 100 Q200 -100 400 100');
    assert.deepEqual(parseStroke(child('path', t.attrs), { x: 100, y: 400 }), curve);
    assert.deepEqual(gripOf(curve), { x: 300, y: 400 });
    assert.deepEqual(bendTo(curve, { x: 300, y: 400 }), curve);
    assert.deepEqual(bendTo(curve, { x: 200, y: 450 }).c, { x: 100, y: 400 });
    const pts = pointsOf(curve);
    assert.equal(pts.length, 25);
    assert.deepEqual(pts[12], { x: 300, y: 400 });
    // a moved end keeps the control point in proportion to the chord: a chord twice as long and
    // turned by 90 degrees puts the control point 400 px to the right of its middle
    const turned = rebend(curve, { x1: 100, y1: 100, x2: 100, y2: 900 });
    assert.ok(near(turned.c.x, 500, 1e-9) && near(turned.c.y, 500, 1e-9), JSON.stringify(turned.c));
    // the default bend of a new curve is a quarter of the chord to the left of its direction
    assert.deepEqual(withKind({ x1: 100, y1: 500, x2: 500, y2: 500 }, 'curve').c, { x: 300, y: 400 });
    // a straight line is written as the line element of lineText
    const s = strokeText(withKind({ x1: 700, y1: 600, x2: 300, y2: 400 }, 'straight'));
    assert.deepEqual(s, { box: { left: 300, top: 400, width: 400, height: 200 }, tag: 'line', attrs: { x1: '400', y1: '200', x2: '0', y2: '0' } });
    // an elbow leaving horizontally, with its middle segment halfway
    const elbow = withKind({ x1: 100, y1: 200, x2: 500, y2: 400 }, 'elbow');
    assert.deepEqual(elbow, { kind: 'elbow', x1: 100, y1: 200, x2: 500, y2: 400, h: true, m: 300 });
    const e = strokeText(elbow);
    assert.deepEqual(e.box, { left: 100, top: 200, width: 400, height: 200 });
    assert.equal(e.attrs.d, 'M0 0 H200 V200 H400');
    assert.deepEqual(parseStroke(child('path', e.attrs), { x: 100, y: 200 }), elbow);
    assert.deepEqual(gripOf(elbow), { x: 300, y: 300 });
    assert.deepEqual(pointsOf(elbow), [{ x: 100, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 400 }, { x: 500, y: 400 }]);
    // the grip moves the middle segment along x only, and past an end the box grows
    const out = bendTo(elbow, { x: 600, y: 999 });
    assert.equal(out.m, 600);
    assert.deepEqual(strokeText(out).box, { left: 100, top: 200, width: 500, height: 200 });
    // within the tolerance the middle segment lands on the line of an end, written with one bend
    const one = bendTo(elbow, { x: 495, y: 300 }, 8);
    assert.equal(one.m, 500);
    assert.equal(strokeText(one).attrs.d, 'M0 0 H400 V200');
    assert.deepEqual(parseStroke(child('path', { d: 'M0 0 H400 V200' })), { kind: 'elbow', h: true, m: 400, x1: 0, y1: 0, x2: 400, y2: 200 });
    assert.equal(strokeText(bendTo(elbow, { x: 104, y: 0 }, 8)).attrs.d, 'M0 0 V200 H400');
    // an elbow leaving vertically, and a moved end that keeps the fraction of the middle segment
    const up = withKind({ x1: 100, y1: 100, x2: 200, y2: 500 }, 'elbow');
    assert.equal(strokeText(up).attrs.d, 'M0 0 V200 H100 V400');
    assert.equal(rebend(up, { x1: 100, y1: 100, x2: 200, y2: 900 }).m, 500);
    // a path that the editor does not write is not read
    assert.equal(parseStroke(child('path', { d: 'M0 0 C10 10 20 20 30 30' })), null);
    assert.equal(parseStroke(child('path', { d: 'M0 0 H10 H20' })), null);
    assert.deepEqual(bboxOf({ kind: 'straight', x1: 10, y1: 5, x2: 10, y2: 5 }), { left: 10, top: 5, width: 1, height: 1 });
  });

  test('the text of a curved and an elbow arrow follows the scope rule', () => {
    const curve = lineText(withKind({ x1: 100, y1: 500, x2: 500, y2: 500 }, 'curve'), { id: 'line-1', heads: 'end' });
    assert.equal(curve, '<svg class="line" width="400" height="50" style="translate: 100px 450px"><defs><marker id="line-1" orient="auto-start-reverse"><path d="M-4-2.5 1 0-4 2.5z"></path></marker></defs><path d="M0 50 Q200 -50 400 50" marker-end="url(#line-1)"></path></svg>');
    assert.deepEqual(textProblems(curve, THEME), []);
    const elbow = lineText(withKind({ x1: 100, y1: 200, x2: 500, y2: 400 }, 'elbow'), { id: 'line-2', heads: 'both' });
    assert.ok(elbow.includes('<path d="M0 0 H200 V200 H400" marker-start="url(#line-2)" marker-end="url(#line-2)"></path>'), elbow);
    assert.deepEqual(textProblems(elbow, THEME), []);
    for (const name of ['d', 'marker-start', 'marker-end']) assert.equal(attributeProblem(name, false, 'path'), null, name);
    assert.deepEqual(textProblems('<svg class="line weight-6 dashed" width="1" height="1"></svg><svg class="line weight-2"></svg><svg class="line weight-8"></svg>', THEME), []);
  });

  let browser;
  let server;
  before(async () => {
    browser = await launch({ offline: false });
    server = await serve('.');
  });
  after(async () => {
    await browser?.close();
    server?.close();
  });

  const js = (v) => JSON.stringify(v);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg ? `, ${js(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName + (e.getAttribute('class') ? '.' + e.getAttribute('class').split(' ')[0] : ''))`);
  const grips = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-line-end')].filter((g) => !g.hidden).map((g) => { const r = g.getBoundingClientRect(); return { end: g.dataset.end, x: r.left + r.width / 2, y: r.top + r.height / 2, locked: g.classList.contains('locked') }; })`);
  const free = (platform) => (platform === 'mac' ? 'Meta' : 'Alt');
  let saves = 0;

  async function load(t, platform, n = 0) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    return page;
  }

  async function inScope(page) {
    const now = textProblems(await render(page), THEME);
    for (const p of textProblems(page.source, THEME)) {
      const i = now.indexOf(p);
      if (i >= 0) now.splice(i, 1);
    }
    assert.deepEqual(now, []);
  }

  // the edit undone to the file byte for byte, redone to the same text, and saved and opened again
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    await inScope(page);
    for (let i = 0; i < undos; i++) await undo(page);
    await byteExact(page);
    for (let i = 0; i < undos; i++) await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r20-3-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  // the screen point of a point in slide px
  const screen = (page, x, y) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  return { x: r.left + ${x} * k, y: r.top + ${y} * k };
})()`);

  // the lines of the current slide: the tag and the attributes of the stroke, its translate, the
  // classes, and the computed fill, stroke, width, and dash of the stroke
  const lines = (page) => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('svg.line')].map((svg) => {
  const l = svg.querySelector(':scope > line, :scope > path');
  const cs = getComputedStyle(l);
  const [tx, ty] = (svg.style.translate || '0px 0px').split(' ').map((v) => parseFloat(v) || 0);
  return { tag: l.localName, d: l.getAttribute('d'), t: [tx, ty], w: Number(svg.getAttribute('width')), h: Number(svg.getAttribute('height')), cls: svg.getAttribute('class'),
    id: svg.querySelector('marker').id, start: l.getAttribute('marker-start'), end: l.getAttribute('marker-end'),
    fill: cs.fill, stroke: cs.stroke, weight: cs.strokeWidth, dash: cs.strokeDasharray, rotate: svg.style.rotate,
    head: svg.querySelector('marker path').getBoundingClientRect().width };
})`);

  // the rendered text without the one line inserted into it, and that line
  async function inserted(page) {
    const text = await render(page);
    const m = /\n[ \t]*(<svg class="line[^\n]*<\/svg>)/.exec(text);
    assert.ok(m, 'a line is not in the rendered text');
    assert.equal(text.slice(0, m.index) + text.slice(m.index + m[0].length), page.source);
    return m[1];
  }

  // the numbers of the d of a curve, M x1 y1 Q cx cy x2 y2, in slide px
  const curveOf = (l) => l.d.match(/-?\d+/g).map((v, i) => Number(v) + l.t[i % 2]);
  const closeTo = (a, b, tol = 2) => a.length === b.length && a.every((v, i) => near(v, b[i], tol));
  // a click on the point x, y of the stroke of a line in slide px, which selects it again after an
  // open of the saved text
  const reselect = async (page, x, y) => {
    await click(page, await screen(page, x, y));
    await frames(page);
  };

  const curve = (page) => exec(page, 'insert.curve', { from: { x: 300, y: 600 }, to: { x: 1100, y: 600 } });

  for (const platform of PLATFORMS) {
    test(`Curved Arrow and Elbow Arrow write a path before the notes, not filled, and follow Arrow in the menus, on ${platform}`, async (t) => {
      const page = await load(t, platform);
      assert.equal((await state(page, 'insert.curve')).enabled, true);
      await curve(page);
      await frames(page);
      const svg = await inserted(page);
      assert.equal(svg, lineText(withKind({ x1: 300, y1: 600, x2: 1100, y2: 600 }, 'curve'), { id: 'line-2', heads: 'end' }));
      assert.match(await render(page), /<svg class="line"[^\n]*<\/svg>\n  <aside class="notes">Notes\./);
      let [l] = await lines(page);
      assert.equal(l.tag, 'path');
      assert.equal(l.fill, 'none');
      const text = await page.evaluate(`(() => { const d = document.createElement('div'); d.style.color = 'var(--text)'; Reveal.getCurrentSlide().append(d); const c = getComputedStyle(d).color; d.remove(); return c; })()`);
      assert.equal(l.stroke, text);
      assert.equal(l.end, `url(#${l.id})`);
      assert.equal(await undoLabel(page), 'Undo Insert Curved Arrow');
      // the Line pane is shown with Curved checked in its segment Kind
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await frames(page);
      assert.ok(await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].some((b) => b.textContent === 'Line')`));
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} [data-command="line.kind.curve"]')?.getAttribute('aria-pressed')`), 'true');
      assert.equal((await state(page, 'line.kind.curve')).checked, true);
      await roundTrip(page);
      page.source = await render(page);
      // an elbow from a drag of 800 by 200 px leaves horizontally with its middle segment halfway
      await exec(page, 'insert.elbow', { from: { x: 300, y: 700 }, to: { x: 1100, y: 900 } });
      await frames(page);
      [, l] = await lines(page);
      assert.equal(l.d, 'M0 0 H400 V200 H800');
      assert.deepEqual(l.t, [300, 700]);
      assert.equal(await undoLabel(page), 'Undo Insert Elbow Arrow');
      await roundTrip(page);
      // the Shape button and the Insert menu list the two after Arrow
      const shape = await page.evaluate(`(() => { const r = document.querySelector('.beeson-edit-split:has([data-command="insert.shape.rounded"]) .more').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await click(page, shape);
      await frames(page);
      const listed = await page.evaluate(`[...[...document.querySelectorAll('.beeson-edit-menu')].filter((m) => m.getClientRects().length).at(-1).querySelectorAll('.item')].map((i) => i.dataset.command)`);
      assert.deepEqual(listed.slice(listed.indexOf('insert.arrow'), listed.indexOf('insert.arrow') + 3), ['insert.arrow', 'insert.curve', 'insert.elbow']);
      await press(page, 'Escape');
    });

    test(`a drag in the mode of Curved Arrow draws a curve with its bend, and of Elbow Arrow an elbow, on ${platform}`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'insert.curve');
      assert.equal((await state(page, 'insert.curve')).checked, true);
      const a = await screen(page, 300, 600);
      const b = await screen(page, 700, 600);
      await drag(page, a, { dx: b.x - a.x, dy: b.y - a.y, modifiers: free(platform) });
      await frames(page);
      let [l] = await lines(page);
      const m = /^M(\S+) (\S+) Q(\S+) (\S+) (\S+) (\S+)$/.exec(l.d);
      assert.ok(m, l.d);
      const [x1, y1, cx, cy, x2, y2] = m.slice(1).map(Number).map((v, i) => v + l.t[i % 2]);
      assert.ok(near(x1, 300, 2) && near(y1, 600, 2) && near(x2, 700, 2) && near(y2, 600, 2), l.d);
      assert.ok(near(cx, 500, 2) && near(cy, 500, 2), `${cx} ${cy}`);
      assert.equal((await state(page, 'insert.curve')).checked, null);
      await undo(page);
      await byteExact(page);
      await exec(page, 'insert.elbow');
      const c = await screen(page, 500, 900);
      await drag(page, a, { dx: c.x - a.x, dy: c.y - a.y, modifiers: free(platform) });
      await frames(page);
      [l] = await lines(page);
      assert.match(l.d, /^M0 0 V\d+ H\d+ V\d+$/);
      await undo(page);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`a press, a right-click, and a marquee find a curve by its stroke and not by its chord, on ${platform}`, async (t) => {
      const page = await load(t, platform);
      await curve(page);
      await exec(page, 'selection.clear');
      await frames(page);
      // the control point is at 700,400, hence the apex is 100 px above the chord, at y 500
      const chord = await screen(page, 700, 600);
      await click(page, chord);
      await frames(page);
      assert.deepEqual(await selected(page), [], 'a press on the chord, far from the curve, selects it');
      const apex = await screen(page, 700, 503);
      await click(page, apex);
      await frames(page);
      assert.deepEqual(await selected(page), ['svg.line'], 'a press near the apex does not select the curve');
      await exec(page, 'selection.clear');
      await click(page, apex, { button: 'right' });
      await frames(page);
      assert.deepEqual(await selected(page), ['svg.line'], 'a right-click near the apex does not select the curve');
      assert.ok(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu')].some((m) => m.getClientRects().length && [...m.querySelectorAll('.item')].some((i) => i.dataset.command === 'arrange.toggleLock'))`), 'the element menu is not open');
      await press(page, 'Escape');
      await exec(page, 'selection.clear');
      await frames(page);
      // a marquee around the apex, away from the chord and the ends
      const from = await screen(page, 650, 470);
      const to = await screen(page, 750, 520);
      await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
      await frames(page);
      assert.deepEqual(await selected(page), ['svg.line'], 'a marquee across the bulge does not select the curve');
      await exec(page, 'selection.clear');
      // a marquee on the chord inside the bulge selects nothing
      const in1 = await screen(page, 650, 570);
      const in2 = await screen(page, 750, 630);
      await drag(page, in1, { dx: in2.x - in1.x, dy: in2.y - in1.y });
      await frames(page);
      assert.deepEqual(await selected(page), [], 'a marquee on the chord selects the curve');
      assert.deepEqual(errors(page), []);
    });

    test(`the grip of the bend moves the control point of a curve, Esc puts it back, and a moved end keeps the arc, on ${platform}`, async (t) => {
      const page = await load(t, platform);
      await curve(page);
      await frames(page);
      page.source = await render(page);
      let g = await grips(page);
      assert.deepEqual(g.map((x) => x.end), ['1', '2', 'bend']);
      const bend = g[2];
      const apex = await screen(page, 700, 500);
      assert.ok(near(bend.x, apex.x) && near(bend.y, apex.y), `the grip is at ${bend.x},${bend.y}, not on the apex ${apex.x},${apex.y}`);
      // a drag of the grip to 700,300 puts the control point at 700,0
      const to = await screen(page, 700, 300);
      await drag(page, bend, { dx: to.x - bend.x, dy: to.y - bend.y, modifiers: free(platform), hold: true });
      await press(page, 'Escape');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
      await frames(page);
      await byteExact(page);
      assert.equal((await grips(page)).length, 3, 'Esc in a drag of the bend leaves the curve');
      await drag(page, bend, { dx: to.x - bend.x, dy: to.y - bend.y, modifiers: free(platform) });
      await frames(page);
      let [l] = await lines(page);
      assert.ok(closeTo(curveOf(l), [300, 600, 700, 0, 1100, 600]), l.d);
      assert.ok(l.d.startsWith('M0 ') && /^M0 \d+ Q\d+ -\d+ 800 \d+$/.test(l.d), l.d);
      assert.equal(await undoLabel(page), 'Undo Bend Line');
      await roundTrip(page);
      page.source = await render(page);
      await reselect(page, 700, 302);
      // a drag of the second end to 700,600 halves the chord, and the apex is then 150 px above it
      g = await grips(page);
      const end = g.find((x) => x.end === '2');
      const at = await screen(page, 1100, 600);
      const mid = await screen(page, 700, 600);
      await drag(page, end, { dx: mid.x - at.x, dy: mid.y - at.y, modifiers: free(platform) });
      await frames(page);
      [l] = await lines(page);
      const [x1, y1, cx, cy, x2, y2] = curveOf(l);
      assert.ok(closeTo([x1, y1, x2, y2], [300, 600, 700, 600], 0), l.d);
      assert.ok(closeTo([cx, cy], [500, 300], 3), l.d);
      await roundTrip(page);
    });

    test(`a dragged end of a line snaps to the middle of a curve on its stroke, on ${platform}`, async (t) => {
      const page = await load(t, platform);
      await curve(page);
      await exec(page, 'insert.line', { from: { x: 200, y: 200 }, to: { x: 400, y: 200 } });
      await frames(page);
      page.source = await render(page);
      // the end is dropped 4 px off the apex of the curve at 700,500, far from its chord
      const end = (await grips(page)).find((x) => x.end === '2');
      const at = await screen(page, 400, 200);
      const to = await screen(page, 704, 497);
      await drag(page, end, { dx: to.x - at.x, dy: to.y - at.y });
      await frames(page);
      const [, l] = await lines(page);
      assert.equal(l.tag, 'line');
      const x2 = await page.evaluate(`Number(Reveal.getCurrentSlide().querySelectorAll('svg.line')[1].querySelector('line').getAttribute('x2'))`);
      const y2 = await page.evaluate(`Number(Reveal.getCurrentSlide().querySelectorAll('svg.line')[1].querySelector('line').getAttribute('y2'))`);
      assert.deepEqual([l.t[0] + x2, l.t[1] + y2], [700, 500]);
      await roundTrip(page);
    });

    test(`the grip of an elbow moves its middle segment, and onto the line of an end writes one bend, on ${platform}`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'insert.elbow', { from: { x: 300, y: 300 }, to: { x: 1100, y: 700 } });
      await frames(page);
      page.source = await render(page);
      const g = await grips(page);
      const bend = g.find((x) => x.end === 'bend');
      const was = await screen(page, 700, 500);
      assert.ok(near(bend.x, was.x) && near(bend.y, was.y));
      // a drag to the right and down moves only x of the middle segment
      const to = await screen(page, 900, 650);
      await drag(page, bend, { dx: to.x - bend.x, dy: to.y - bend.y, modifiers: free(platform) });
      await frames(page);
      let [l] = await lines(page);
      const m = /^M0 0 H(\d+) V400 H800$/.exec(l.d);
      assert.ok(m && near(Number(m[1]), 600, 2), l.d);
      await roundTrip(page);
      page.source = await render(page);
      await reselect(page, 300 + Number(m[1]), 400);
      // a drag to 5 px left of the second end lands the segment on its line
      const g2 = (await grips(page)).find((x) => x.end === 'bend');
      const onto = await screen(page, 1095, 500);
      await drag(page, g2, { dx: onto.x - g2.x, dy: onto.y - g2.y });
      await frames(page);
      [l] = await lines(page);
      assert.equal(l.d, 'M0 0 H800 V400');
      assert.deepEqual(l.t, [300, 300]);
      await roundTrip(page);
    });

    test(`the segment Kind takes a grouped arrow at a step to a curve, an elbow, and back to its bytes, on ${platform}`, async (t) => {
      const page = await load(t, platform, 1);
      // a click on the arrow selects its group, and the commands of Format > Line act on its line
      await click(page, await screen(page, 500, 500));
      await frames(page);
      assert.deepEqual(await selected(page), ['p', 'svg.line']);
      assert.equal((await state(page, 'line.kind.straight')).checked, true);
      await exec(page, 'line.kind.curve');
      await frames(page);
      let text = await render(page);
      const curved = text.match(/<svg class="line fragment"[^\n]*<\/svg>/)[0];
      assert.equal(curved, '<svg class="line fragment" width="400" height="50" style="translate: 300px 450px" data-group="g1" data-fragment-index="1"><defs><marker id="line-1" orient="auto-start-reverse"><path d="M-4-2.5 1 0-4 2.5z"></path></marker></defs><path d="M0 50 Q200 -50 400 50" marker-end="url(#line-1)"></path></svg>');
      assert.equal(text.replace(curved, ORIGINAL), page.source);
      assert.equal(await undoLabel(page), 'Undo Line Kind');
      assert.deepEqual(await selected(page), ['p', 'svg.line']);
      assert.equal((await state(page, 'line.kind.curve')).checked, true);
      await roundTrip(page);
      await reselect(page, 500, 452);
      await exec(page, 'line.kind.elbow');
      await frames(page);
      text = await render(page);
      assert.ok(text.includes('<svg class="line fragment" width="400" height="1" style="translate: 300px 500px" data-group="g1" data-fragment-index="1"><defs><marker id="line-1" orient="auto-start-reverse"><path d="M-4-2.5 1 0-4 2.5z"></path></marker></defs><path d="M0 0 H200 V0 H400" marker-end="url(#line-1)"></path></svg>'));
      await exec(page, 'line.kind.straight');
      await frames(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(await selected(page), ['p', 'svg.line']);
      // each change of kind is one entry, after the open of the saved curve
      await undo(page);
      assert.equal((await lines(page))[0].tag, 'path');
      await undo(page);
      assert.equal(await render(page), page.source.replace(ORIGINAL, curved));
      assert.deepEqual(errors(page), []);
    });

    test(`the segment Weight and the switch Dashed write a class on the svg, and the head grows with the weight, on ${platform}`, async (t) => {
      const page = await load(t, platform);
      await curve(page);
      await frames(page);
      page.source = await render(page);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await frames(page);
      let [l] = await lines(page);
      assert.equal(l.weight, '3px');
      assert.equal(l.dash, 'none');
      assert.equal((await state(page, 'line.weight.3')).checked, true);
      const head = l.head;
      await click(page, `${PANEL} [data-command="line.weight.6"]`);
      await frames(page);
      [l] = await lines(page);
      assert.equal(l.cls, 'line weight-6');
      assert.equal(l.weight, '6px');
      assert.ok(near(l.head, head * 2, 1), `the head is ${l.head} px wide, not twice ${head}`);
      assert.equal(await undoLabel(page), 'Undo Line Weight');
      await roundTrip(page);
      await reselect(page, 700, 503);
      await click(page, `${PANEL} [data-command="line.weight.2"]`);
      await frames(page);
      [l] = await lines(page);
      assert.equal(l.cls, 'line weight-2');
      assert.equal(l.weight, '2px');
      await click(page, `${PANEL} [data-command="line.weight.8"]`);
      await frames(page);
      assert.equal((await lines(page))[0].weight, '8px');
      await click(page, `${PANEL} [data-command="line.weight.3"]`);
      await frames(page);
      await byteExact(page);
      await click(page, `${PANEL} input[data-command="line.dashed"]`);
      await frames(page);
      [l] = await lines(page);
      assert.equal(l.cls, 'line dashed');
      assert.notEqual(l.dash, 'none');
      assert.equal((await state(page, 'line.dashed')).checked, true);
      assert.equal(await undoLabel(page), 'Undo Dashed');
      await roundTrip(page);
    });

    test(`a nudge, a duplicate, a paste, a group, a lock, the order, a flip, and a turn act on a curve as on a line, on ${platform}`, async (t) => {
      const page = await load(t, platform);
      await curve(page);
      await frames(page);
      page.source = await render(page);
      const before = (await lines(page))[0];
      // the arrow keys move it by 1 and 10 px
      await press(page, 'ArrowRight');
      await press(page, 'Shift+ArrowDown');
      await frames(page);
      let [l] = await lines(page);
      assert.deepEqual(l.t, [before.t[0] + 1, before.t[1] + 10]);
      assert.equal(l.d, before.d);
      await undo(page);
      await byteExact(page);
      // a duplicate and a paste each get a marker of their own, named by their url()
      await press(page, 'Mod+D');
      await frames(page);
      await exec(page, 'edit.copy');
      await exec(page, 'edit.paste');
      await frames(page);
      const all = await lines(page);
      assert.equal(all.length, 3);
      assert.equal(new Set(all.map((x) => x.id)).size, 3);
      for (const one of all) {
        assert.equal(one.tag, 'path');
        assert.equal(one.end, `url(#${one.id})`);
      }
      await inScope(page);
      await undo(page);
      await undo(page);
      await byteExact(page);
      // a group of the curve and the heading is moved together by the arrow keys
      await click(page, await screen(page, 700, 503));
      await click(page, '.reveal section.present h2', { modifiers: 'Shift' });
      await exec(page, 'arrange.group');
      await frames(page);
      assert.match(await render(page), /<svg class="line" [^>]*data-group="[^"]+"/);
      await exec(page, 'selection.clear');
      await click(page, await screen(page, 700, 503));
      await press(page, 'ArrowLeft');
      await frames(page);
      assert.match(await render(page), /<h2 [^>]*style="translate: -1px 0px"|<h2 style="translate: -1px 0px"/);
      await undo(page);
      await undo(page);
      await byteExact(page);
      // a lock grays its three grips
      await exec(page, 'selection.clear');
      await click(page, await screen(page, 700, 503));
      await exec(page, 'arrange.lock');
      await frames(page);
      assert.deepEqual((await grips(page)).map((x) => [x.end, x.locked]), [['1', true], ['2', true], ['bend', true]]);
      await undo(page);
      await byteExact(page);
      // the layer order and a turn are offered, and a flip is not, as for a straight line
      for (const [id, on] of [['arrange.order.back', true], ['arrange.setRotation', true], ['arrange.flipHorizontal', false], ['arrange.flipVertical', false]]) {
        assert.equal((await state(page, id)).enabled, on, id);
      }
      await exec(page, 'arrange.order.back');
      await frames(page);
      assert.match(await render(page), /<svg class="line"[^>]*z-index: -1[^\n]*<path d="M0 /);
      await undo(page);
      await byteExact(page);
      await exec(page, 'arrange.setRotation', { deg: 30 });
      await frames(page);
      [l] = await lines(page);
      assert.equal(l.rotate, '30deg');
      await roundTrip(page);
    });
  }
});

// tests of R27.1 on both platforms, connection lines as the connectors of PowerPoint: an end of a
// line drawn or dragged onto an element is attached to it, written as data-anchor on the element and
// data-from or data-to on the svg, and it follows every change of the box of the element in the
// same entry of the history. a move of the whole line, a delete of the element, and a copy
// without the element take the attachment off, and a copy with the element attaches the copy to the copies.
// the Line pane names each attached end. each edit is checked byte for byte after an undo and a redo
describe('line ends attached to elements', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r27-1.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const SLIDE = '.reveal .slides > section.present';
  const PANEL = '#beeson-edit-panel-format';
  const [EMPTY, GLUED, GROUPED, STACK] = [0, 1, 2, 3];

  let browser;
  let server;
  before(async () => {
    browser = await launch({ offline: false });
    server = await serve('.');
  });
  after(async () => {
    await browser?.close();
    server?.close();
  });

  const js = (v) => JSON.stringify(v);
  const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}, ${js(arg ?? null)} ?? undefined)).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const free = (platform) => (platform === 'mac' ? 'Meta' : 'Alt');
  const copyKey = (platform) => (platform === 'mac' ? 'Alt' : 'Ctrl');
  // a function of the page called with the arguments
  const call = (page, fn, ...args) => page.evaluate(`(${fn})(${args.map(js).join(', ')})`);

  // the page loaded before it in the file is closed first. Within 1 s of the last change of a page,
  // its unsaved edits are kept in the storage of the browser, and they would then be offered on a
  // dialog over the slide of the next page
  let last = null;
  async function load(t, platform, slide = EMPTY, text = SOURCE) {
    await last?.close().catch(() => {});
    const page = await browser.newPage({ width: 1600, height: 1000 });
    last = page;
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(text)})`)).problems, []);
    page.source = text;
    await page.evaluate(`Reveal.slide(${slide})`);
    await sleep(150);
    return page;
  }

  // the point on the screen of a point in slide px
  function screenOf(p) {
    const s = document.querySelector('.reveal .slides');
    const r = s.getBoundingClientRect();
    const k = r.width / s.offsetWidth;
    return { x: r.left + p.x * k, y: r.top + p.y * k };
  }
  const screen = (page, x, y) => call(page, screenOf, { x, y });
  const scale = (page) => page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); return s.getBoundingClientRect().width / s.offsetWidth; })()`);

  // the lines of the current slide: their attachment and their two ends in slide px, rounded
  function linesNow(slide) {
    return [...document.querySelector(slide).querySelectorAll('svg.line')].map((svg) => {
      const [tx, ty] = (svg.style.translate || '0px 0px').split(/\s+/).map((v) => parseFloat(v) || 0);
      const c = svg.querySelector(':scope > line, :scope > path');
      let a, b;
      if (c.localName === 'line') {
        a = { x: +c.getAttribute('x1'), y: +c.getAttribute('y1') };
        b = { x: +c.getAttribute('x2'), y: +c.getAttribute('y2') };
      } else {
        const n = c.getTotalLength();
        a = c.getPointAtLength(0);
        b = c.getPointAtLength(n);
      }
      return { from: svg.getAttribute('data-from'), to: svg.getAttribute('data-to'), ends: [a.x + tx, a.y + (ty || 0), b.x + tx, b.y + (ty || 0)].map(Math.round) };
    });
  }
  const lines = (page) => call(page, linesNow, SLIDE);

  // the names of data-anchor on the slide, in document order, with the kind of each element
  const anchors = (page) => page.evaluate(`[...document.querySelector(${js(SLIDE)}).querySelectorAll('[data-anchor]')].map((el) => el.getAttribute('data-anchor') + ' ' + el.localName)`);

  // for each attached end of the current slide, its distance in slide px from its place in the box of
  // its element, i.e. the box of the style of a shape turned by its rotate, or the box seen of any
  // other element
  function offsets(slide) {
    const s = document.querySelector('.reveal .slides');
    const r = s.getBoundingClientRect();
    const k = r.width / s.offsetWidth;
    const root = document.querySelector(slide);
    const place = (v) => {
      const [name, fx, fy] = v.split(/\s+/);
      const el = root.querySelector(`[data-anchor="${name}"]`);
      if (!el) return null;
      let box, deg = 0;
      if (el.matches('.shape')) {
        const [tx, ty] = (el.style.translate || '0px 0px').split(/\s+/).map((v) => parseFloat(v) || 0);
        box = { left: tx, top: ty || 0, width: parseFloat(el.style.width), height: parseFloat(el.style.height) };
        deg = parseFloat(el.style.rotate) || 0;
      } else {
        const b = el.getBoundingClientRect();
        box = { left: (b.left - r.left) / k, top: (b.top - r.top) / k, width: b.width / k, height: b.height / k };
      }
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      const x = box.left + +fx * box.width - cx, y = box.top + +fy * box.height - cy;
      const a = (deg * Math.PI) / 180;
      return { x: cx + x * Math.cos(a) - y * Math.sin(a), y: cy + x * Math.sin(a) + y * Math.cos(a) };
    };
    const out = [];
    for (const svg of root.querySelectorAll('svg.line')) {
      const [tx, ty] = (svg.style.translate || '0px 0px').split(/\s+/).map((v) => parseFloat(v) || 0);
      const c = svg.querySelector(':scope > line, :scope > path');
      const n = c.localName === 'path' ? c.getTotalLength() : 0;
      const a = c.localName === 'line' ? { x: +c.getAttribute('x1'), y: +c.getAttribute('y1') } : c.getPointAtLength(0);
      const b = c.localName === 'line' ? { x: +c.getAttribute('x2'), y: +c.getAttribute('y2') } : c.getPointAtLength(n);
      for (const [attr, p] of [['data-from', a], ['data-to', b]]) {
        const v = svg.getAttribute(attr);
        if (!v) continue;
        const at = place(v);
        out.push(at ? Math.round(Math.hypot(p.x + tx - at.x, p.y + (ty || 0) - at.y)) : -1);
      }
    }
    return out;
  }
  const linesOf = async (page, count) => {
    const d = await call(page, offsets, SLIDE);
    assert.equal(d.length, count, `the slide does not have ${count} glued ends: ${js(d)}`);
    assert.ok(d.every((v) => v >= 0 && v <= 1), `a glued end is off its place in the box of its element: ${js(d)}`);
  };

  // an undo gives back the text before, and a redo the text after
  async function undoRedo(page, before, after) {
    await undo(page);
    await frames(page);
    assert.equal(await render(page), before, 'one undo does not give the file back');
    await redo(page);
    await frames(page);
    assert.equal(await render(page), after, 'a redo does not write the edit again');
  }

  // the start tag of the svg of the first line in a text
  const lineTag = (text) => /<svg class="line"[^>]*>/.exec(text)?.[0];

  // F78. two rounded rectangles, a curved arrow drawn from the right edge of the first to the left edge
  // of the second, and a nudge of the first by 120 slide px with Shift and the arrow key. the tail of
  // the arrow stays at the middle of the right edge of the box
  for (const platform of PLATFORMS) {
    test(`F78: a curved arrow drawn between two boxes follows a nudge of the first box (${platform})`, async (t) => {
      const page = await load(t, platform, EMPTY);
      await exec(page, 'insert.shape.rounded', { box: { left: 279, top: 463, width: 241, height: 148 } });
      await exec(page, 'insert.shape.rounded', { box: { left: 1186, top: 463, width: 241, height: 148 } });
      await exec(page, 'insert.curve');
      const k = await scale(page);
      await drag(page, await screen(page, 520, 537), { dx: (1186 - 520) * k, dy: 0, steps: 12 });
      await sleep(100);
      const [drawn] = await lines(page);
      assert.deepEqual(drawn.ends, [520, 537, 1186, 537], 'the arrow is not drawn between the edges');
      assert.deepEqual(await anchors(page), ['a1 div', 'a2 div'], 'the two boxes are not named');
      assert.equal(drawn.from, 'a1 1 0.5', 'the tail is not glued to the middle of the right edge of the first box');
      assert.equal(drawn.to, 'a2 0 0.5', 'the head is not glued to the middle of the left edge of the second box');
      const before = await render(page);
      await click(page, await screen(page, 399, 537));
      await frames(page);
      for (let i = 0; i < 12; i++) await press(page, 'Shift+ArrowRight');
      await sleep(100);
      const box = await page.evaluate(`document.querySelector(${js(`${SLIDE} > .shape`)}).style.translate`);
      assert.equal(box, '399px 463px', 'the box is not nudged by 120 px');
      const [moved] = await lines(page);
      assert.deepEqual(moved.ends.slice(0, 2), [640, 537], 'the tail of the arrow is left behind by the box');
      assert.deepEqual(moved.ends.slice(2), [1186, 537], 'the head of the arrow is moved');
      await linesOf(page, 2);
      await undoRedo(page, before, await render(page));
      assert.deepEqual(errors(page), []);
    });
  }

  // rule 1. an end drawn onto an element is attached at the pointer, or at the middle of the nearest edge
  // within 16 slide px of it. a text in the flow, a line, and a drag with the free key do not attach, and
  // a text moved as a box does. the element under a dragged end is outlined
  for (const platform of PLATFORMS) {
    test(`rule 1: the ends of a drawn line are glued at the pointer or at the middle of an edge (${platform})`, async (t) => {
      const page = await load(t, platform, GLUED);
      const k = await scale(page);
      // from inside the first box, away from its edges, to 10 px under the middle of the top edge of the
      // ellipse
      await exec(page, 'insert.arrow');
      const a = await screen(page, 330, 520);
      await drag(page, a, { dx: (1306 - 330) * k, dy: (810 - 520) * k, steps: 12, hold: true });
      const outline = await call(page, (sel) => {
        const o = document.querySelector('.beeson-attach-target');
        const el = document.querySelector(sel);
        if (!o || o.hidden || !o.getClientRects().length) return null;
        const r = o.getBoundingClientRect(), e = el.getBoundingClientRect();
        const probe = document.createElement('div');
        probe.style.color = 'var(--ed-select)';
        document.body.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return { d: Math.max(Math.abs(r.left - e.left), Math.abs(r.top - e.top), Math.abs(r.right - e.right), Math.abs(r.bottom - e.bottom)), color: getComputedStyle(o).borderTopColor, accent };
      }, `${SLIDE} > .shape.ellipse`);
      assert.ok(outline, 'the element under the dragged end is not outlined');
      assert.ok(outline.d <= 3, `the outline is not at the box of the ellipse: ${outline.d}`);
      assert.equal(outline.color, outline.accent, 'the outline is not in the accent color');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x + (1306 - 330) * k, y: a.y + (810 - 520) * k, button: 'left', clickCount: 1 });
      await sleep(100);
      assert.equal(await page.evaluate('document.querySelectorAll(".beeson-attach-target:not([hidden])").length'), 0, 'the outline stays after the release');
      const drawn = (await lines(page)).at(-1);
      assert.equal(drawn.to, 'a3 0.5 0', 'the head is not put at the middle of the top edge of the ellipse');
      assert.deepEqual(drawn.ends.slice(2), [1306, 800]);
      const [name, fx, fy] = (drawn.from ?? '').split(' ');
      assert.equal(name, 'a1', 'the tail is not glued to the first box');
      assert.ok(Math.abs(+fx * 241 + 279 - drawn.ends[0]) <= 1 && Math.abs(+fy * 148 + 463 - drawn.ends[1]) <= 1, `the tail is not glued at the pointer: ${drawn.from} ${drawn.ends}`);
      assert.ok(!['0.5', '0', '1'].includes(fx) || !['0.5', '0', '1'].includes(fy), 'the tail is put at an edge');
      assert.deepEqual(await anchors(page), ['a1 div', 'a2 div', 'a3 div']);
      await linesOf(page, 4);
      const after = await render(page);
      await undo(page);
      assert.equal(await render(page), SOURCE, 'one undo does not take the line and its glue off');
      await redo(page);
      assert.equal(await render(page), after);

      // with the free key, neither end is attached
      await exec(page, 'insert.line');
      await drag(page, await screen(page, 400, 540), { dx: (1300 - 400) * k, dy: (880 - 540) * k, steps: 12, modifiers: free(platform) });
      await sleep(100);
      const loose = (await lines(page)).at(-1);
      assert.deepEqual([loose.from, loose.to], [null, null], 'an end drawn with the free key is glued');
      // a text in the flow and another line do not take an attachment, and a text moved as a box does
      await exec(page, 'insert.line');
      await drag(page, await screen(page, 300, 270), { dx: (900 - 300) * k, dy: (950 - 270) * k, steps: 12 });
      await sleep(100);
      const onLine = (await lines(page)).at(-1);
      assert.deepEqual([onLine.from, onLine.to], [null, null], 'a text in the flow or a line takes glue');
      await exec(page, 'insert.line');
      const moved = await call(page, (sel) => { const p = [...document.querySelectorAll(sel)].at(-1).getBoundingClientRect(); return { x: p.left + p.width / 2, y: p.top + p.height / 2 }; }, `${SLIDE} > p`);
      const at = await screen(page, 1000, 300);
      await drag(page, at, { dx: moved.x - at.x, dy: moved.y - at.y, steps: 12 });
      await sleep(100);
      const onWords = (await lines(page)).at(-1);
      assert.equal(onWords.from, null);
      assert.match(onWords.to ?? '', /^a4 /, 'a text moved as a box does not take glue');
      // the moved words come before the shapes in the file
      assert.deepEqual(await anchors(page), ['a4 p', 'a1 div', 'a2 div', 'a3 div']);
      await saveAndReopen(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // rule 2. the attachment is written into the tags only, as attributes of the editor: a deck without an attachment
  // and a deck with an attachment are written byte for byte by an open and a save, and the attributes are in
  // the scope rule
  for (const platform of PLATFORMS) {
    test(`rule 2: an open and a save keep a deck with and without glue byte for byte (${platform})`, async (t) => {
      const page = await load(t, platform, GLUED);
      await exec(page, 'insert.shape.rounded', { box: { left: 600, top: 200, width: 200, height: 100 } });
      await undo(page);
      const { text } = await saveAndReopen(page, 'glued.html');
      assert.equal(text, SOURCE, 'a deck with glue is changed by an open and a save');
      const plain = SOURCE.replace(/ data-(?:anchor|from|to)="[^"]*"/g, '');
      const bare = await load(t, platform, GLUED, plain);
      await exec(bare, 'insert.shape.rounded', { box: { left: 600, top: 200, width: 200, height: 100 } });
      await undo(bare);
      const saved = await saveAndReopen(bare, 'bare.html');
      assert.equal(saved.text, plain, 'a deck without glue is changed by an open and a save');
      assert.deepEqual(errors(page), []);
    });
  }

  // rule 3. whenever an attached element gets another box, its ends follow in the same entry of the history
  const FOLLOW = [
    ['a drag', async (page) => {
      await drag(page, await screen(page, 399, 500), { dx: 90, dy: 60, steps: 10 });
    }],
    ['a typed X and Y', async (page) => {
      await click(page, await screen(page, 399, 500));
      await exec(page, 'arrange.setPosition', { x: 200, y: 300 });
    }],
    ['a typed Width and Height', async (page) => {
      await click(page, await screen(page, 399, 500));
      await exec(page, 'arrange.setSize', { w: 320 });
      await exec(page, 'arrange.setSize', { h: 200 });
    }],
    ['a resize by a grip', async (page) => {
      await click(page, await screen(page, 399, 500));
      await frames(page);
      const grip = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-grip')].find((g) => g.dataset.handle === 'e' && g.getClientRects().length); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      assert.ok(grip, 'the east grip of the box is not shown');
      await drag(page, grip, { dx: 80, dy: 0, steps: 8 });
    }],
    ['a turn', async (page) => {
      await click(page, await screen(page, 399, 500));
      await exec(page, 'arrange.setRotation', { deg: 30 });
    }],
    ['Align Bottom', async (page) => {
      await click(page, await screen(page, 399, 500));
      await click(page, await screen(page, 1306, 880), { modifiers: 'Shift' });
      await exec(page, 'arrange.align.bottom');
    }],
    // a line attached to the text moved as a box, which Reset Slide puts back into the flow
    ['Reset Slide', async (page) => {
      await exec(page, 'slide.reset');
    }, async (page) => {
      await exec(page, 'insert.line');
      const words = await call(page, (sel) => { const p = [...document.querySelectorAll(sel)].at(-1).getBoundingClientRect(); return { x: p.left + p.width / 2, y: p.top + p.height / 2 }; }, `${SLIDE} > p`);
      const at = await screen(page, 1000, 300);
      await drag(page, at, { dx: words.x - at.x, dy: words.y - at.y, steps: 12 });
      await sleep(100);
      return 3;
    }],
  ];
  for (const platform of PLATFORMS) {
    for (const [name, run, prepare] of FOLLOW) {
      test(`rule 3: the glued ends follow ${name} of an element, undone with it in one step (${platform})`, async (t) => {
        const page = await load(t, platform, GLUED);
        const count = (await prepare?.(page)) ?? 2;
        await linesOf(page, count);
        const base = await render(page);
        const was = (await lines(page)).map((l) => l.ends);
        await run(page);
        await sleep(150);
        assert.notEqual(await render(page), base, `${name} does not change the deck`);
        await linesOf(page, count);
        assert.notDeepEqual((await lines(page)).map((l) => l.ends), was, 'the line does not follow');
        const after = await render(page);
        // each change of the box is one entry with the line in it
        const steps = name === 'a typed Width and Height' ? 2 : 1;
        for (let i = 0; i < steps; i++) await undo(page);
        assert.equal(await render(page), base, 'the undo does not put the box and the line back');
        for (let i = 0; i < steps; i++) await redo(page);
        assert.equal(await render(page), after, 'the redo does not move the box and the line again');
        await linesOf(page, count);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`rule 3: a glued end follows a move of the group of its element (${platform})`, async (t) => {
      const page = await load(t, platform, GROUPED);
      await linesOf(page, 2);
      await drag(page, await screen(page, 300, 660), { dx: 60, dy: 90, steps: 10 });
      await sleep(150);
      assert.notEqual(await page.evaluate(`document.querySelector(${js(`${SLIDE} > .shape`)}).style.translate`), '200px 400px', 'the group is not moved');
      await linesOf(page, 2);
      await undoRedo(page, SOURCE, await render(page));
      // and a nudge of the box at the other end
      await click(page, await screen(page, 1300, 460));
      for (let i = 0; i < 3; i++) await press(page, 'ArrowDown');
      await sleep(100);
      await linesOf(page, 2);
      assert.deepEqual(errors(page), []);
    });
  }

  // rule 4. a drag of an attached end off its element takes its attachment off, a drop on another element
  // attaches it there, a move of the whole line takes both off, a delete of the element leaves the line
  // without its attachment, and a copy keeps the attachment only with the elements
  const endGrip = (page, which) => page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-line-end')].find((g) => !g.hidden && g.dataset.end === ${js(which)}); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const platform of PLATFORMS) {
    test(`rule 4: a dragged end is glued off and on, and a moved line is let go (${platform})`, async (t) => {
      const page = await load(t, platform, GLUED);
      const k = await scale(page);
      await click(page, await screen(page, 853, 454));
      await frames(page);
      assert.equal((await page.evaluate('window.BeesonEditor.selection()')).length, 1);
      // the head dragged onto the ellipse, near the middle of its left edge
      let grip = await endGrip(page, '2');
      await drag(page, grip, { dx: (1190 - 1186) * k, dy: (875 - 537) * k, steps: 10 });
      await sleep(100);
      let [l] = await lines(page);
      assert.equal(l.to, 'a3 0 0.5', 'the head is not glued to the ellipse');
      assert.deepEqual(await anchors(page), ['a1 div', 'a3 div'], 'the name of the box let go is kept, or the ellipse is not named');
      await linesOf(page, 2);
      await undoRedo(page, SOURCE, await render(page));
      // the head dragged off to the empty slide
      grip = await endGrip(page, '2');
      await drag(page, grip, { dx: -200 * k, dy: 100 * k, steps: 10 });
      await sleep(100);
      [l] = await lines(page);
      assert.equal(l.to, null, 'the head dragged off the ellipse is still glued');
      assert.deepEqual(await anchors(page), ['a1 div']);
      // with the free key a drop on a box does not attach
      grip = await endGrip(page, '2');
      const target = await screen(page, 1306, 537);
      await drag(page, grip, { dx: target.x - grip.x, dy: target.y - grip.y, steps: 10, modifiers: free(platform) });
      await sleep(100);
      [l] = await lines(page);
      assert.equal(l.to, null, 'an end dropped with the free key is glued');

      // a move of the whole line by a drag lets both ends go
      const fresh = await load(t, platform, GLUED);
      await drag(fresh, await screen(fresh, 853, 454), { dx: 0, dy: -80 * k, steps: 10 });
      await sleep(100);
      [l] = await lines(fresh);
      assert.deepEqual([l.from, l.to], [null, null], 'a dragged line is still glued');
      assert.deepEqual(await anchors(fresh), [], 'the names of the boxes are kept without glue');
      await undoRedo(fresh, SOURCE, await render(fresh));
      // and by a nudge
      await undo(fresh);
      await click(fresh, await screen(fresh, 853, 454));
      await press(fresh, 'ArrowUp');
      await press(fresh, 'ArrowUp');
      await sleep(50);
      [l] = await lines(fresh);
      assert.deepEqual([l.from, l.to], [null, null], 'a nudged line is still glued');
      await undoRedo(fresh, SOURCE, await render(fresh));
      // and by a typed position
      await undo(fresh);
      await exec(fresh, 'arrange.setPosition', { y: 300 });
      [l] = await lines(fresh);
      assert.deepEqual([l.from, l.to], [null, null], 'a line moved by a typed position is still glued');
      await undoRedo(fresh, SOURCE, await render(fresh));
      assert.deepEqual(errors(page), []);
      assert.deepEqual(errors(fresh), []);
    });

    test(`rule 4: a delete of a glued box leaves the line, and a copy glues only to copied boxes (${platform})`, async (t) => {
      const page = await load(t, platform, GLUED);
      await click(page, await screen(page, 1306, 537));
      await exec(page, 'element.delete');
      await sleep(100);
      let [l] = await lines(page);
      assert.equal(l.to, null, 'the line is glued to a deleted box');
      assert.deepEqual(l.ends, [520, 537, 1186, 537], 'the line is moved by the delete');
      assert.equal(l.from, 'a1 1 0.5');
      await undoRedo(page, SOURCE, await render(page));
      await undo(page);

      // the line copied alone is pasted without an attachment
      await click(page, await screen(page, 853, 454));
      await exec(page, 'edit.copy');
      await exec(page, 'edit.paste');
      await sleep(100);
      let all = await lines(page);
      assert.equal(all.length, 3);
      assert.deepEqual([all[0].from, all[0].to], ['a1 1 0.5', 'a2 0 0.5']);
      const pasted = all.find((x, i) => i > 0 && x.ends[0] !== 700);
      assert.deepEqual([pasted.from, pasted.to], [null, null], 'a line copied without its boxes is pasted with glue');
      await undo(page);
      assert.equal(await render(page), SOURCE);

      // the two boxes and the line, by Copy and Paste, by Duplicate, and by a drag with the copy key
      for (const route of ['paste', 'duplicate', 'drag']) {
        await click(page, await screen(page, 399, 500));
        await click(page, await screen(page, 1306, 500), { modifiers: 'Shift' });
        await click(page, await screen(page, 853, 454), { modifiers: 'Shift' });
        assert.equal((await page.evaluate('window.BeesonEditor.selection()')).length, 3);
        if (route === 'paste') {
          await exec(page, 'edit.copy');
          await exec(page, 'edit.paste');
        } else if (route === 'duplicate') await exec(page, 'edit.duplicate');
        else await drag(page, await screen(page, 399, 500), { dx: 0, dy: 280 * (await scale(page)), steps: 10, modifiers: copyKey(platform) });
        await sleep(150);
        all = await lines(page);
        assert.equal(all.length, 3, `${route} does not copy the line`);
        const names = await anchors(page);
        assert.equal(new Set(names.map((n) => n.split(' ')[0])).size, names.length, `${route} writes a name twice on the slide: ${names}`);
        assert.equal(names.length, 4, `${route} does not name the copies: ${names}`);
        const copy = all.find((x) => x.from && x.from !== 'a1 1 0.5');
        assert.ok(copy, `${route} does not glue the copied line to the copies: ${js(all)}`);
        assert.ok(copy.to && copy.to !== 'a2 0 0.5');
        await linesOf(page, 4);
        await undo(page);
        assert.equal(await render(page), SOURCE, `one undo does not take the copies of ${route} off`);
      }

      // Duplicate Slide and a paste of the slide keep the attachment of the copy
      for (const route of ['slide.duplicate', 'slide.paste']) {
        if (route === 'slide.paste') await exec(page, 'slide.copy');
        await exec(page, route);
        await sleep(200);
        assert.equal(await page.evaluate('Reveal.getIndices().h'), 2);
        assert.deepEqual(await anchors(page), ['a1 div', 'a2 div']);
        await linesOf(page, 2);
        await undo(page);
        await page.evaluate('Reveal.slide(1)');
        await sleep(100);
        assert.equal(await render(page), SOURCE);
      }
      assert.deepEqual(errors(page), []);
    });
  }

  // item 5. the Line pane names each attached end, with a button that takes its attachment off
  for (const platform of PLATFORMS) {
    test(`item 5: the Line pane names the glued ends and takes the glue off (${platform})`, async (t) => {
      const page = await load(t, platform, GLUED);
      await click(page, await screen(page, 853, 454));
      await frames(page);
      await sleep(100);
      const text = await page.evaluate(`document.querySelector(${js(PANEL)}).innerText`);
      assert.match(text, /Start: Rounded Rectangle: Goal/, 'the start is not named in the Line pane');
      assert.match(text, /End: Rounded Rectangle/, 'the end is not named in the Line pane');
      assert.equal((await state(page, 'line.detach.end')).enabled, true);
      const button = await page.evaluate(`(() => { const b = document.querySelector(${js(`${PANEL} [data-command="line.detach.end"]`)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      assert.ok(button, 'the end does not have a button that takes its glue off');
      await click(page, button);
      await sleep(100);
      const [l] = await lines(page);
      assert.deepEqual([l.from, l.to], ['a1 1 0.5', null]);
      assert.deepEqual(await anchors(page), ['a1 div']);
      assert.ok(lineTag(await render(page)).includes('data-from="a1 1 0.5"'));
      await undoRedo(page, SOURCE, await render(page));
      await undo(page);
      await exec(page, 'line.detach.end');
      await frames(page);
      const after = await page.evaluate(`document.querySelector(${js(PANEL)}).innerText`);
      assert.doesNotMatch(after, /End: Rounded Rectangle/, 'the pane names an end let go');
      assert.deepEqual(errors(page), []);
    });
  }

  // repairs of R27.1 after its check

  // a new line drawn from a to b in slide px
  async function drawLine(page, a, b) {
    const k = await scale(page);
    await exec(page, 'insert.line');
    await drag(page, await screen(page, a.x, a.y), { dx: (b.x - a.x) * k, dy: (b.y - a.y) * k, steps: 12 });
    await sleep(100);
    return (await lines(page)).at(-1);
  }

  // rule 1. an end is attached to the element under the pointer, even where the middle of an edge of an
  // element above it is within reach. the lower box spans y 600 to 720 and is first in the file, and
  // the upper box spans y 472 to 592
  for (const platform of PLATFORMS) {
    test(`rule 1: an end is glued to the element under the pointer before a nearer middle of another (${platform})`, async (t) => {
      const page = await load(t, platform, STACK);
      const low = await drawLine(page, { x: 1200, y: 460 }, { x: 450, y: 601 });
      assert.equal(low.to, 'a1 0.5 0', `the end inside the lower box is glued to another element: ${js(low)}`);
      assert.deepEqual(low.ends.slice(2), [450, 600]);
      assert.deepEqual(await anchors(page), ['a1 div']);
      await linesOf(page, 1);
      // on a fresh slide, since an end snaps to the end of another line
      const fresh = await load(t, platform, STACK);
      const high = await drawLine(fresh, { x: 1200, y: 480 }, { x: 450, y: 590 });
      assert.equal(high.to, 'a1 0.5 1', `the end inside the upper box is not glued to it: ${js(high)}`);
      assert.deepEqual(high.ends.slice(2), [450, 592]);
      assert.deepEqual(await anchors(fresh), ['a1 div']);
      assert.equal(await fresh.evaluate(`document.querySelector(${js(SLIDE)}).querySelector('[data-anchor]').style.translate`), '300px 472px');
      await linesOf(fresh, 1);
      assert.deepEqual(errors(page), []);
      assert.deepEqual(errors(fresh), []);
    });
  }

  // rule 1. a group takes an attachment as one object: an end at the middle of the right edge of the box of the
  // group, between its two members, is attached to the group, whose members share the name, and it
  // follows a move of the group. the Line pane names the group
  for (const platform of PLATFORMS) {
    test(`rule 1: a group takes glue as one object at the middle of an edge of its box (${platform})`, async (t) => {
      const page = await load(t, platform, GROUPED);
      const l = await drawLine(page, { x: 900, y: 800 }, { x: 402, y: 560 });
      assert.equal(l.to, 'a3 1 0.5', `the end is not glued to the middle of the right edge of the group: ${js(l)}`);
      assert.deepEqual(l.ends.slice(2), [400, 560]);
      assert.deepEqual(await anchors(page), ['a1 a3 div', 'a3 div', 'a2 div'], 'the members of the group do not share a name');
      await frames(page);
      await sleep(100);
      assert.match(await page.evaluate(`document.querySelector(${js(PANEL)}).innerText`), /End: Group/, 'the Line pane does not name the group');
      const before = await render(page);
      await drag(page, await screen(page, 300, 660), { dx: 60, dy: 90, steps: 10 });
      await sleep(150);
      const box = await page.evaluate(`[...document.querySelectorAll(${js(`${SLIDE} > .shape[data-group]`)})].map((el) => { const [x, y] = el.style.translate.split(/\\s+/).map(parseFloat); return [x, y, x + parseFloat(el.style.width), y + parseFloat(el.style.height)]; })`);
      assert.notEqual(box[0][0], 200, 'the group is not moved');
      const right = Math.max(...box.map((b) => b[2])), middle = (Math.min(...box.map((b) => b[1])) + Math.max(...box.map((b) => b[3]))) / 2;
      const moved = (await lines(page)).at(-1);
      assert.deepEqual(moved.ends.slice(2), [Math.round(right), Math.round(middle)], 'the end does not follow the box of the group');
      await undoRedo(page, before, await render(page));
      assert.deepEqual(errors(page), []);
    });
  }

  // rule 2. a delete or a cut of an attached line takes the names off the elements that it was attached to
  for (const platform of PLATFORMS) {
    test(`rule 2: a delete or a cut of a glued line takes the names off its elements (${platform})`, async (t) => {
      const page = await load(t, platform, GLUED);
      for (const command of ['element.delete', 'edit.cut']) {
        await click(page, await screen(page, 853, 454));
        await frames(page);
        assert.equal((await page.evaluate('window.BeesonEditor.selection()')).length, 1);
        await exec(page, command);
        await sleep(100);
        assert.equal((await lines(page)).length, 1, `${command} does not take the line off`);
        assert.deepEqual(await anchors(page), [], `${command} of the line leaves the names of its elements`);
        await undo(page);
        assert.equal(await render(page), SOURCE, `one undo does not put back the line and the names after ${command}`);
      }
      assert.deepEqual(errors(page), []);
    });
  }

  // item 5. the row of an end that is not attached is not shown, nor is the section without an attached end
  const shownButtons = (page) => page.evaluate(`[...document.querySelectorAll(${js(`${PANEL} [data-command^="line.detach"]`)})].filter((b) => b.getClientRects().length).map((b) => b.dataset.command)`);
  for (const platform of PLATFORMS) {
    test(`item 5: the Line pane shows a row only for a glued end of one line (${platform})`, async (t) => {
      const page = await load(t, platform, GLUED);
      await click(page, await screen(page, 853, 454));
      await frames(page);
      await sleep(100);
      assert.deepEqual(await shownButtons(page), ['line.detach.start', 'line.detach.end']);
      await exec(page, 'line.detach.end');
      await frames(page);
      assert.deepEqual(await shownButtons(page), ['line.detach.start'], 'a button is shown for the end let go');
      // the loose line alone, and the two lines
      await click(page, await screen(page, 900, 950));
      await frames(page);
      await sleep(100);
      assert.equal((await page.evaluate('window.BeesonEditor.selection()')).length, 1);
      assert.deepEqual(await shownButtons(page), [], 'a button is shown for a line without glue');
      assert.doesNotMatch(await page.evaluate(`document.querySelector(${js(PANEL)}).innerText`), /Connections/, 'the section is shown for a line without glue');
      await click(page, await screen(page, 853, 454), { modifiers: 'Shift' });
      await frames(page);
      await sleep(100);
      assert.equal((await page.evaluate('window.BeesonEditor.selection()')).length, 2);
      assert.deepEqual(await shownButtons(page), [], 'a button is shown for two selected lines');
      assert.deepEqual(errors(page), []);
    });
  }
});

// tests of R36.3 on both platforms, a turn of a line with an attached end. as a connection line of
// Keynote, a line attached at one end or at both is not turned: while every selected element is such a
// line, the field Angle of the Arrange pane, the quarter turns, and Reset Rotation are dimmed and do
// nothing, and the field reads "Detach the line to turn it". once each end is detached in the
// section Connections of the Line pane, the line is turned by the field, and a selection with
// another element is turned as it was without this rule
describe('attached lines are not turned until detached', () => {
  const PLATFORMS = ['mac', 'other'];
  // slide 0 holds a curved arrow attached from a1 to a2, i.e. the two rounded rectangles, and a loose
  // line under them, and slide 1 the same arrow turned by 20 degrees in the file
  const DECK = 'test/pages/editor-r36-3.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const [GLUED, TURNED] = [0, 1];
  const SLIDE = '.reveal .slides > section.present';
  const PANEL = '#beeson-edit-panel-format';
  const ANGLE = '#beeson-edit-num-angle';
  const WHY = 'Detach the line to turn it';
  const TURNS = ['arrange.setRotation', 'arrange.resetRotation', 'arrange.rotateLeft', 'arrange.rotateRight'];

  let browser;
  let server;
  before(async () => {
    browser = await launch({ offline: false });
    server = await serve('.');
  });
  after(async () => {
    await browser?.close();
    server?.close();
  });

  const js = (v) => JSON.stringify(v);
  const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}, ${js(arg ?? null)} ?? undefined)).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const call = (page, fn, ...args) => page.evaluate(`(${fn})(${args.map(js).join(', ')})`);

  async function load(t, platform, slide = GLUED) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`)).problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await sleep(150);
    return page;
  }

  // the point on the screen of a point in slide px
  function screenOf(p) {
    const s = document.querySelector('.reveal .slides');
    const r = s.getBoundingClientRect();
    const k = r.width / s.offsetWidth;
    return { x: r.left + p.x * k, y: r.top + p.y * k };
  }
  const screen = (page, x, y) => call(page, screenOf, { x, y });
  // points in slide px on the attached arrow at its middle and at a quarter of its length, away from the
  // grip of its bend, on the loose line, and on the box a1
  const ON_ARROW = [853, 454];
  const ON_QUARTER = [686, 475];
  const ON_LOOSE = [900, 950];
  const ON_BOX = [399, 500];

  // the attachment and the angle of each line of the slide
  const lines = (page) => page.evaluate(`[...document.querySelector(${js(SLIDE)}).querySelectorAll('svg.line')].map((svg) => ({ from: svg.getAttribute('data-from'), to: svg.getAttribute('data-to'), rotate: svg.style.rotate }))`);

  // a click on the first point and a click with Shift on each other point
  async function select(page, ...points) {
    for (const [i, [x, y]] of points.entries()) await click(page, await screen(page, x, y), { modifiers: i ? 'Shift' : '' });
    await frames(page);
    await sleep(100);
    assert.equal((await page.evaluate('window.BeesonEditor.selection()')).length, points.length);
  }

  // the pane of a name, through its tab where the selection has more than one pane
  async function showTab(page, name) {
    await page.evaluate(`[...document.querySelectorAll('.ed-tabs button')].find((b) => b.textContent.trim() === ${js(name)})?.click()`);
    await frames(page);
  }
  async function arrangeTab(page) {
    await showTab(page, 'Arrange');
    await page.waitFor(`document.querySelector(${js(ANGLE)}) !== null`);
  }

  // the field Angle: whether its input is disabled and its control dimmed, its title, and its value
  const angleField = (page) => page.evaluate(`(() => {
  const input = document.querySelector(${js(ANGLE)});
  const box = input.closest('.ed-num');
  return { disabled: input.disabled, dimmed: box.classList.contains('off'), title: box.title, value: input.value };
})()`);

  // an angle typed into the field and entered with Tab
  async function typeAngle(page, deg) {
    await click(page, ANGLE);
    await page.evaluate(`document.querySelector(${js(ANGLE)}).select()`);
    await type(page, String(deg));
    await press(page, 'Tab');
    await sleep(150);
  }

  // the quarter turns in the menu of the element at x, y in slide px, each with whether it is dimmed
  async function menuTurns(page, x, y) {
    await click(page, await screen(page, x, y), { button: 'right' });
    await sleep(100);
    const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => [i.querySelector('.label')?.textContent ?? i.textContent.trim(), i.getAttribute('aria-disabled') === 'true'])`);
    await page.evaluate('window.BeesonEditorShell.closeMenus()');
    return Object.fromEntries(items.filter(([label]) => /^Rotate (Left|Right) 90°$/.test(label)));
  }

  // every turn of the selected attached line refused: the commands, the field with its reason, and the
  // items of the menu of the line at the point at dimmed, no handle of a turn shown, and the file
  // untouched after each command and after a typed angle, without an entry of the history. the Tab
  // after the typed angle reaches the canvas, which selects the next object
  async function refused(page, at = ON_QUARTER) {
    for (const id of TURNS) assert.equal((await state(page, id)).enabled, false, `${id} is enabled on a glued line`);
    const field = await angleField(page);
    assert.equal(field.disabled, true, 'the field Angle is not dimmed on a glued line');
    assert.equal(field.dimmed, true, 'the control of the field Angle is not dimmed');
    assert.equal(field.title, WHY, 'the field Angle does not give the reason');
    if (at) assert.deepEqual(await menuTurns(page, ...at), { 'Rotate Left 90°': true, 'Rotate Right 90°': true }, 'a quarter turn of the menu of the line is not dimmed');
    assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-rotor')].some((r) => r.getClientRects().length > 0)`), false, 'a handle of a turn is shown on a glued line');
    const before = await render(page);
    const undoable = (await state(page, 'edit.undo')).enabled;
    for (const id of TURNS) {
      await exec(page, id, id === 'arrange.setRotation' ? { deg: 30 } : undefined);
      await sleep(50);
      assert.equal(await render(page), before, `${id} changed the file of a glued line`);
    }
    await typeAngle(page, 30);
    assert.equal(await render(page), before, 'a typed angle changed the file of a glued line');
    assert.equal((await state(page, 'edit.undo')).enabled, undoable, 'a refused turn made an entry of the history');
  }

  // items 1, 2, and 4. a line attached at both ends, also turned in the file, and a line attached at one end
  for (const platform of PLATFORMS) {
    test(`item 2: the turns of a line glued at both ends are dimmed and leave the file untouched (${platform})`, async (t) => {
      const page = await load(t, platform);
      await select(page, ON_ARROW);
      await arrangeTab(page);
      await refused(page);
      assert.equal(await render(page), SOURCE);
      assert.deepEqual(await lines(page), [{ from: 'a1 1 0.5', to: 'a2 0 0.5', rotate: '' }, { from: null, to: null, rotate: '' }]);
      await select(page, ON_ARROW);
      await showTab(page, 'Line');
      assert.match(await page.evaluate(`document.querySelector(${js(PANEL)}).innerText`), /Connections/, 'the section Connections is gone');
      assert.deepEqual(errors(page), []);
    });

    test(`item 2: Reset Rotation of a turned line glued at both ends is dimmed (${platform})`, async (t) => {
      const page = await load(t, platform, TURNED);
      // a marquee around the middle of the turned arrow, clear of the two boxes
      const from = await screen(page, 700, 300);
      const to = await screen(page, 1000, 620);
      await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y, steps: 10 });
      await frames(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['svg']);
      await arrangeTab(page);
      assert.equal((await angleField(page)).value, '20');
      assert.equal((await lines(page))[0].rotate, '20deg');
      await refused(page, null);
      assert.equal(await render(page), SOURCE);
      assert.deepEqual(errors(page), []);
    });

    test(`item 2: the turns of a line glued at one end are dimmed, and the line is turned after Detach (${platform})`, async (t) => {
      const page = await load(t, platform);
      await select(page, ON_ARROW);
      await exec(page, 'line.detach.end');
      await sleep(100);
      assert.deepEqual((await lines(page))[0], { from: 'a1 1 0.5', to: null, rotate: '' });
      await arrangeTab(page);
      await refused(page);
      // Detach of the start leaves a loose line, which the field turns in one entry
      await select(page, ON_ARROW);
      await arrangeTab(page);
      await exec(page, 'line.detach.start');
      await sleep(100);
      const loose = await render(page);
      assert.deepEqual((await lines(page))[0], { from: null, to: null, rotate: '' });
      assert.equal(await page.evaluate(`document.querySelector(${js(SLIDE)}).querySelectorAll('[data-anchor]').length`), 0);
      for (const id of ['arrange.setRotation', 'arrange.rotateLeft', 'arrange.rotateRight']) assert.equal((await state(page, id)).enabled, true, `${id} is dimmed after Detach`);
      const field = await angleField(page);
      assert.equal(field.disabled, false, 'the field Angle is dimmed after Detach');
      assert.equal(field.title, '');
      await typeAngle(page, 30);
      assert.equal((await lines(page))[0].rotate, '30deg', 'a typed angle does not turn the line after Detach');
      const turned = await render(page);
      assert.notEqual(turned, loose);
      await undo(page);
      assert.equal(await render(page), loose, 'one undo does not take the turn back');
      await redo(page);
      assert.equal(await render(page), turned, 'a redo does not turn the line again');
      assert.equal((await state(page, 'arrange.resetRotation')).enabled, true);
      const { text } = await saveAndReopen(page, `r36-3-${platform}.html`);
      assert.equal(text, turned);
      assert.deepEqual(errors(page), []);
    });
  }

  // items 2 and 4. an attached line selected with a box or with a loose line is turned by the field as
  // it was without this rule
  for (const platform of PLATFORMS) {
    for (const [name, other] of [['a box', ON_BOX], ['a loose line', ON_LOOSE]]) {
      test(`item 2: a glued line selected with ${name} is turned as before (${platform})`, async (t) => {
        const page = await load(t, platform);
        await select(page, ON_ARROW, other);
        await arrangeTab(page);
        for (const id of ['arrange.setRotation', 'arrange.rotateLeft', 'arrange.rotateRight']) assert.equal((await state(page, id)).enabled, true, `${id} is dimmed on a mixed selection`);
        const field = await angleField(page);
        assert.equal(field.disabled, false, 'the field Angle is dimmed on a mixed selection');
        assert.equal(field.title, '');
        await typeAngle(page, 30);
        assert.equal((await lines(page))[0].rotate, '30deg', 'the glued line is not turned with the other element');
        const turned = await render(page);
        assert.notEqual(turned, SOURCE);
        await undo(page);
        assert.equal(await render(page), SOURCE, 'one undo does not take the turn back');
        await redo(page);
        assert.equal(await render(page), turned, 'a redo does not turn the selection again');
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // item 3. a drag of the whole attached line still takes the attachment of both ends off, after which the
  // field turns the line
  for (const platform of PLATFORMS) {
    test(`item 3: a glued line dragged whole is let go and turned by the field (${platform})`, async (t) => {
      const page = await load(t, platform);
      await drag(page, await screen(page, ...ON_ARROW), { dx: 40, dy: 60, steps: 8 });
      await sleep(150);
      const [moved] = await lines(page);
      assert.deepEqual([moved.from, moved.to], [null, null], 'a drag of the whole line keeps the glue of an end');
      await arrangeTab(page);
      assert.equal((await angleField(page)).disabled, false);
      await typeAngle(page, 15);
      assert.equal((await lines(page))[0].rotate, '15deg');
      assert.deepEqual(errors(page), []);
    });
  }
});
