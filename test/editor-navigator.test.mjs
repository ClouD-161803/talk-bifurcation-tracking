import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, drag, press, saveAndReopen, type, typeKeys } from './helpers/editor.mjs';

const PLATFORMS = ['mac', 'other'];

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
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let saves = 0;

const WATCH = `(() => {
  window.rawThumbs = [];
  const check = () => {
    document.querySelectorAll('.beeson-edit-nav .row .pic').forEach((h, i) => {
      const wrap = h.shadowRoot?.querySelector('.beeson-thumb');
      if (!wrap || wrap.dataset.checked) return;
      wrap.dataset.checked = '1';
      const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const up = t.parentElement;
        if (up.closest('pre, code, mjx-container') || getComputedStyle(up).visibility === 'hidden') continue;
        const m = /\\\\[(\\[].{0,16}/.exec(t.data);
        if (m) window.rawThumbs.push({ slide: i + 1, text: m[0] });
      }
    });
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
  return true;
})()`;

async function load(t, platform, { n = 0, mode = 'light', width = 1600, height = 1000 } = {}) {
  const page = await browser.newPage({ width, height });
  t.after(() => page.close().catch(() => {}));
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
  const url = `${server.origin}/test-deck.html?edit&still&theme=${mode}&edit-platform=${platform}`;
  await page.goto(url);
  await page.evaluate('localStorage.clear()');
  await page.goto(url);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  await page.evaluate(WATCH);
  page.source = readFileSync('test-deck.html', 'utf8');
  const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
  assert.deepEqual(s.problems, []);
  if (n) await page.evaluate(`Reveal.slide(${n})`);
  await frames(page);
  return page;
}

async function roundTrip(page, undos = 1) {
  const edited = await render(page);
  assert.notEqual(edited, page.source, 'the action does not change the file');
  for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
  await byteExact(page);
  for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
  assert.equal(await render(page), edited);
  const { text } = await saveAndReopen(page, `r9-2-${++saves}.html`);
  assert.equal(text, edited);
  assert.deepEqual(page.errors, []);
  page.source = text;
  return edited;
}

const PICTURES = `(() => {
  const list = document.querySelector('.beeson-edit-nav .rows') ?? document.querySelector('.beeson-edit-nav');
  const box = list.getBoundingClientRect();
  const slides = [...document.querySelectorAll('.reveal:not(.beeson-peek) .slides > section')];
  return [...document.querySelectorAll('.beeson-edit-nav .row .pic')].map((h, i) => {
    const r = h.getBoundingClientRect();
    const shown = r.width > 0 && r.bottom > box.top && r.top < box.bottom;
    const head = (s) => s?.querySelector('h1, h2')?.textContent.replace(/\\s+/g, ' ').trim() ?? '';
    const section = h.shadowRoot?.querySelector('.beeson-thumb .slides > section');
    return { slide: i + 1, shown, heading: head(slides[i]), drawn: section ? head(section) : null };
  }).filter((p) => p.shown);
})()`;

async function allDrawn(page, what) {
  const pics = await page.evaluate(PICTURES);
  assert.ok(pics.length >= 3, `only ${pics.length} thumbnails are in view ${what}`);
  for (const p of pics) assert.equal(p.drawn, p.heading, `the thumbnail of slide ${p.slide} is drawn ${p.drawn === null ? 'blank' : `with the heading "${p.drawn}"`} ${what}`);
}

const thumb = (page, n) =>
  page.evaluate(`(() => { const r = document.querySelectorAll('.beeson-edit-nav .row .pic')[${n - 1}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

const noRawTex = async (page) => assert.deepEqual(await page.evaluate('window.rawThumbs'), [], 'a thumbnail is drawn with raw TeX');

for (const platform of PLATFORMS) {
  test(`every thumbnail in view shows its slide at the load of the deck and after a click on it (${platform})`, async (t) => {
    const page = await load(t, platform);
    await allDrawn(page, 'at the load of the deck');
    for (const n of [3, 2, 4]) {
      await clickText(page, await thumb(page, n));
      await frames(page);
      assert.equal(await page.evaluate('Reveal.getIndices().h'), n - 1);
      await allDrawn(page, `after a click on the thumbnail of slide ${n}`);
    }
    await sleep(800);
    await allDrawn(page, 'after the clicks settle');
    await noRawTex(page);
    assert.deepEqual(page.errors, []);
  });

  test(`every thumbnail in view shows its slide after the arrow keys in the navigator (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickText(page, await thumb(page, 1));
    for (const [key, n] of [['ArrowDown', 2], ['ArrowDown', 3], ['ArrowDown', 4], ['ArrowUp', 3]]) {
      await press(page, key);
      await frames(page);
      assert.equal(await page.evaluate('Reveal.getIndices().h'), n - 1, `${key} does not show slide ${n}`);
      await allDrawn(page, `after ${key} to slide ${n}`);
    }
    await sleep(800);
    await allDrawn(page, 'after the arrow keys settle');
    await noRawTex(page);
    assert.deepEqual(page.errors, []);
  });

  test(`the thumbnail of a slide with formulas shows the slide after an edit and an undo, never with raw TeX (${platform})`, async (t) => {
    const page = await load(t, platform, { n: 3 });
    const para = '.reveal section.present p.fragment[data-fragment-index="2"]';
    await clickText(page, para);
    await press(page, 'End');
    await type(page, ' Edited');
    await sleep(900);
    await allDrawn(page, 'while a paragraph with a formula is edited');
    await press(page, 'Escape');
    await sleep(900);
    await allDrawn(page, 'after the edit');
    const drawnText = () => page.evaluate(`document.querySelectorAll('.beeson-edit-nav .row .pic')[3].shadowRoot.querySelector('.beeson-thumb').textContent`);
    assert.match(await drawnText(), /Edited/, 'the thumbnail of slide 4 does not show the edit');
    await press(page, 'Mod+Z');
    await frames(page);
    await allDrawn(page, 'right after the undo');
    await sleep(900);
    await allDrawn(page, 'after the undo');
    assert.doesNotMatch(await drawnText(), /Edited/, 'the thumbnail of slide 4 still shows the edit after the undo');
    await noRawTex(page);
    await press(page, 'Mod+Shift+Z');
    await roundTrip(page);
    await noRawTex(page);
  });
}

async function caretAt(page, selector, mark) {
  for (let i = 0; i < 2; i++) {
    await clickText(page, selector);
    await frames(page);
    if (await page.evaluate(`document.querySelector(${js(selector)}).contains(document.activeElement)`)) break;
  }
  const ok = await page.evaluate(`(() => {
    const host = document.querySelector(${js(selector)});
    const sel = getSelection();
    if (${js(mark)} === 'start' || ${js(mark)} === 'end') {
      const range = document.createRange();
      range.selectNodeContents(host);
      range.collapse(${js(mark)} === 'start');
      sel.removeAllRanges();
      sel.addRange(range);
      return document.activeElement === host || host.contains(document.activeElement);
    }
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const i = t.data.indexOf(${js(mark)});
      if (i >= 0) { sel.collapse(t, i + ${js(mark)}.length); return true; }
    }
    return false;
  })()`);
  assert.ok(ok, `the caret is not put at ${mark} of ${selector}`);
}

const PARA = '<p>Export your matplotlib figure with the styles of the template. It will show frameless.</p>';
const ITEM = '<li class="fragment" data-fragment-index="2">You might have noticed a toggle on the top right: try clicking it on this slide.</li>';
const DASHED = [
  ['paragraph', '.reveal section.present > p', PARA],
  ['list item', '.reveal section.present li:nth-child(2)', ITEM],
];

for (const platform of PLATFORMS) {
  for (const [what, selector, html] of DASHED) {
    test(`a hyphen typed between spaces becomes an en dash and keeps the space after it, at the start, the middle, and the end of a ${what} (${platform})`, async (t) => {
      const inner = /^<[^>]*>([^]*)<\/[a-z]+>$/.exec(html)[1];
      const words = inner.split(' ').slice(0, 3).join(' ');
      const cases = [
        ['start', 'ok - go ', `ok – go ${inner}`],
        [words, ' - ok', inner.replace(words, `${words} – ok`)],
        ['end', ' - ok', `${inner} – ok`],
        ['end', ' - ', `${inner} – `],
      ];
      for (const [mark, typed, now] of cases) {
        const page = await load(t, platform, { n: 4 });
        await caretAt(page, selector, mark);
        await typeKeys(page, typed);
        await press(page, 'Escape');
        await frames(page);
        const want = html.replace(inner, now);
        const lines = (await render(page)).split('\n').filter((l) => !page.source.split('\n').includes(l));
        assert.deepEqual(lines.map((l) => l.trim()), [want], `${js(typed)} typed at ${mark} of the ${what} is not written as in Keynote`);
        await byteExact(page, [[html, want]]);
        await roundTrip(page, 3);
        await page.close();
      }
    });
  }
}

const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const TABLE_STATE = `(() => {
  const slide = document.querySelector('.reveal section.present');
  const table = slide.querySelector('table');
  const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const t = box(table.getBoundingClientRect());
  const all = { ...t };
  for (const el of document.querySelectorAll('.beeson-table-bars > *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.matches('.cell, .fill, .spread, .guide')) continue;
    all.left = Math.min(all.left, r.left); all.top = Math.min(all.top, r.top);
    all.right = Math.max(all.right, r.right); all.bottom = Math.max(all.bottom, r.bottom);
  }
  const ink = (el) => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return b.width && b.height ? box(b) : null; };
  const others = [];
  for (const el of slide.querySelectorAll('h2, p, li, .math, pre, .foot, .caption, figcaption')) {
    if (table.contains(el) || el.closest('aside.notes') || !el.getClientRects().length) continue;
    const b = ink(el);
    if (b) others.push({ what: el.localName + ':' + el.textContent.trim().slice(0, 24), box: b });
  }
  for (const el of slide.querySelectorAll('.figure-box, .plate, .surface, figure img:not([hidden])')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && getComputedStyle(el).display !== 'none') others.push({ what: el.localName + '.' + el.className, box: box(r) });
  }
  const hidden = [...table.querySelectorAll('td, th')].every((c) => {
    const r = c.getBoundingClientRect();
    return [[0.25, 0.3], [0.5, 0.5], [0.75, 0.7]].every(([u, v]) => table.contains(document.elementFromPoint(r.left + u * r.width, r.top + v * r.height)));
  });
  const opaque = [table, ...table.querySelectorAll('td, th')].some((el) => { const c = getComputedStyle(el).backgroundColor; return c !== 'transparent' && !/rgba\\(.*, 0\\)$/.test(c); });
  return { table: t, all, slide: box(slide.getBoundingClientRect()), others, hidden, opaque, shape: [...table.rows].map((r) => r.cells.length) };
})()`;

async function insertTableOn(page, columns, rows) {
  const last = '.reveal section.present ul > li:last-child';
  if (await page.evaluate(`!!document.querySelector('${last}')`)) {
    await clickText(page, last);
    await press(page, 'Escape');
  }
  await exec(page, 'insert.table', { rows, columns });
  await frames(page);
  return page.evaluate(TABLE_STATE);
}

const TABLES = [
  [4, 3, 3, false, 'the slide with the figure, as in state 93', ['li:Dark and light mode: exp', 'li:You might have noticed a']],
  [4, 4, 6, false, 'the slide with the figure, as in shot 10 of the opus report'],
  [8, 3, 3, false, 'the slide with the surface, as in shot 11 of the opus report'],
  [5, 3, 3, true, 'the slide with the code box'],
  [1, 3, 3, true, 'a section slide'],
];
for (const platform of PLATFORMS) {
  for (const [n, columns, rows, room, what, under] of TABLES) {
    test(`a new table of ${columns} by ${rows} cells on ${what} is put where it fits with its bars, or over the least of the content, readable (${platform})`, async (t) => {
      const page = await load(t, platform, { n });
      const s = await insertTableOn(page, columns, rows);
      assert.deepEqual(s.shape, Array(rows).fill(columns), 'the table is not inserted with every row chosen');
      const inside = s.all.left >= s.slide.left - 1 && s.all.right <= s.slide.right + 1 && s.all.top >= s.slide.top - 1;
      const hit = s.others.filter((o) => meets(s.all, o.box)).map((o) => o.what);
      if (room) {
        assert.deepEqual(hit, [], `the table with its bars at ${js(s.all)} is drawn over the content of the slide, where it has free space`);
        assert.ok(inside && s.table.bottom <= s.slide.bottom + 1, `the table with its bars at ${js(s.all)} runs past the slide at ${js(s.slide)}`);
      } else if (hit.length) {
        assert.ok(inside && s.table.bottom <= s.slide.bottom + 1, `the table at ${js(s.table)} runs past the slide at ${js(s.slide)}`);
        if (under) assert.deepEqual(hit, under);
        for (const o of s.others.filter((o) => !/^[a-z0-9]+:/.test(o.what))) {
          const a = Math.max(0, Math.min(s.table.right, o.box.right) - Math.max(s.table.left, o.box.left)) * Math.max(0, Math.min(s.table.bottom, o.box.bottom) - Math.max(s.table.top, o.box.top));
          assert.ok(a <= ((o.box.right - o.box.left) * (o.box.bottom - o.box.top)) / 2, `the table at ${js(s.table)} lies on ${o.what} at ${js(o.box)}`);
        }
        assert.ok(s.opaque, 'the table over the content of the slide does not have a fill, and its text mixes with the text under it');
        assert.ok(s.hidden, 'a cell of the table over the content of the slide is drawn under another element');
      }
      assert.ok(s.hidden, 'a cell of the table is drawn under another element');
      assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Insert Table');
      await roundTrip(page);
    });
  }
}

const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);

const shellBoxes = (page) => page.evaluate(`(() => {
  const box = (sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width } : null;
  };
  return { nav: box('body > .beeson-edit-nav'), canvas: box('.beeson-edit-canvas'), inspector: box('body > .beeson-edit-inspector'), slide: box('.reveal:not(.beeson-peek) .slides > section.present'), format: box('.beeson-edit-header [data-command="shell.format"]') };
})()`);

async function resize(page, width, height = 800) {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  await frames(page);
}

function docked(b, what) {
  assert.ok(b.canvas && b.slide, `the canvas or the slide is not shown ${what}`);
  if (b.inspector) assert.ok(b.inspector.left >= b.canvas.right - 1, `the inspector at ${Math.round(b.inspector.left)} px is drawn over the canvas, which ends at ${Math.round(b.canvas.right)} px, ${what}`);
  if (b.nav) assert.ok(b.nav.right <= b.canvas.left + 1, `the navigator is drawn over the canvas ${what}`);
  const s = b.slide;
  const right = Math.min(b.canvas.right, b.inspector?.left ?? Infinity);
  assert.ok(s.left >= b.canvas.left - 1 && s.right <= right + 1 && s.top >= b.canvas.top - 1 && s.bottom <= b.canvas.bottom + 1, `the slide at ${js(s)} is not shown whole on the canvas at ${js(b.canvas)} ${what}`);
}

const pressFormat = async (page) => {
  const b = await shellBoxes(page);
  await clickText(page, { x: (b.format.left + b.format.right) / 2, y: (b.format.top + b.format.bottom) / 2 });
  await sleep(200);
  await frames(page);
};

for (const platform of PLATFORMS) {
  test(`the inspector is docked beside the whole slide at 1440, 1024, 900, and 760 px, and the navigator is hidden only while both do not fit (${platform})`, async (t) => {
    const page = await load(t, platform, { n: 2, width: 1440, height: 800 });
    if (!(await state(page, 'shell.format')).checked) await page.evaluate(`window.BeesonEditor.exec('shell.format')`);
    for (const width of [1440, 1024, 900, 760]) {
      await resize(page, width);
      const open = await shellBoxes(page);
      assert.ok(open.inspector, `the inspector is not shown at ${width} px`);
      docked(open, `at ${width} px with the inspector open`);
      if (width >= 1024) assert.ok(open.nav && Math.abs(open.nav.width - 200) <= 1, `the navigator is narrowed at ${width} px`);
      else if (open.nav) assert.ok(open.nav.width < 200, `the navigator keeps its width of 200 px at ${width} px`);
      if (width === 760) assert.equal(open.nav, null, 'the navigator is shown with the inspector at 760 px, where the slide does not fit between them');
      await pressFormat(page);
      const closed = await shellBoxes(page);
      assert.equal(closed.inspector, null, `the Format button does not close the inspector at ${width} px`);
      docked(closed, `at ${width} px with the inspector closed`);
      assert.ok(closed.nav, `the navigator is not shown again when the inspector is closed at ${width} px`);
      assert.ok(closed.canvas.width > open.canvas.width + 100, `the canvas does not take the place of the inspector at ${width} px`);
      await pressFormat(page);
      assert.ok((await shellBoxes(page)).inspector, `the Format button does not open the inspector at ${width} px`);
    }
    await resize(page, 1440);
    const wide = await shellBoxes(page);
    docked(wide, 'at 1440 px after 760 px');
    assert.ok(wide.nav && Math.abs(wide.nav.width - 200) <= 1, 'the navigator is not shown again at its width when the window is wide again');
    assert.equal((await state(page, 'view.navigator'))?.checked ?? true, true);
    assert.deepEqual(page.errors, []);
  });
}

const PANE_NOTE = `document.querySelector('#beeson-edit-panel-format .ed-note')?.textContent`;
const cellOf = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;
const middle = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

const RANGE = `(() => {
  const box = (el) => {
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const bars = document.querySelector('.beeson-table-bars');
  const corners = {};
  for (const el of bars?.querySelectorAll('[data-corner]') ?? []) if (box(el)) corners[el.dataset.corner] = box(el);
  return { frame: box(bars?.querySelector('.cell')), fill: box(bars?.querySelector('.fill')), corners };
})()`;

async function handlesAtCorners(page, what) {
  const { frame, fill, corners } = await page.evaluate(RANGE);
  assert.ok(frame, `the range is not framed ${what}`);
  assert.deepEqual(Object.keys(corners).sort(), ['lower-left', 'upper-left', 'upper-right'], `the frame of the range does not have its corner handles ${what}`);
  const at = { 'upper-left': [frame.left, frame.top], 'upper-right': [frame.right, frame.top], 'lower-left': [frame.left, frame.bottom] };
  for (const [name, [x, y]] of Object.entries(at)) {
    const m = middle(corners[name]);
    assert.ok(Math.abs(m.x - x) < 6 && Math.abs(m.y - y) < 6, `the ${name} handle at ${js(m)} is not at the ${name} corner ${js({ x, y })} of the frame ${what}`);
    assert.ok(!meets(corners[name], fill), `the ${name} handle is drawn over the fill handle ${what}`);
  }
  const f = middle(fill);
  assert.ok(Math.abs(f.x - frame.right) < 6 && Math.abs(f.y - frame.bottom) < 6, `the fill handle is not at the lower right corner of the frame ${what}`);
  return corners;
}

async function dragCorner(page, name, r, c) {
  const { corners } = await page.evaluate(RANGE);
  const from = middle(corners[name]);
  const to = middle(await page.evaluate(`document.querySelector(${js(cellOf(r, c))}).getBoundingClientRect().toJSON()`));
  await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y, steps: 12 });
  await frames(page);
}

for (const platform of PLATFORMS) {
  test(`a range of cells is extended and contracted by a drag of the handles at the corners of its frame (${platform})`, async (t) => {
    const page = await load(t, platform);
    await exec(page, 'slide.new.content');
    await frames(page);
    await exec(page, 'insert.table', { rows: 5, columns: 3 });
    await frames(page);
    for (const [r, c, text] of [[1, 0, '1'], [2, 0, '2'], [1, 1, 'orbit'], [2, 1, 'tube']]) {
      await clickText(page, cellOf(r, c));
      await type(page, text);
    }
    await frames(page);
    const source = await render(page);
    const undo = (await state(page, 'edit.undo')).label;
    const from = middle(await page.evaluate(`document.querySelector(${js(cellOf(1, 0))}).getBoundingClientRect().toJSON()`));
    const to = middle(await page.evaluate(`document.querySelector(${js(cellOf(2, 1))}).getBoundingClientRect().toJSON()`));
    await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
    await frames(page);
    assert.match(await page.evaluate(PANE_NOTE), /cells A2:B3$/);
    await handlesAtCorners(page, 'after a drag over A2:B3');
    for (const [name, r, c, range] of [
      ['lower-left', 3, 0, 'A2:B4'],
      ['upper-right', 1, 2, 'A2:C4'],
      ['upper-left', 2, 1, 'B3:C4'],
      ['upper-left', 0, 0, 'A1:C4'],
      ['lower-left', 1, 0, 'A1:C2'],
    ]) {
      const what = `after a drag of the ${name} handle to ${'ABC'[c]}${r + 1}`;
      await dragCorner(page, name, r, c);
      assert.match(await page.evaluate(PANE_NOTE), new RegExp(`cells ${range}$`), `the range is not ${range} ${what}`);
      await handlesAtCorners(page, what);
      assert.equal(await render(page), source, `the file is edited ${what}`);
      assert.equal((await state(page, 'edit.undo')).label, undo, `a history entry is added ${what}`);
    }
    const { fill } = await page.evaluate(RANGE);
    const handle = middle(fill);
    const end = middle(await page.evaluate(`document.querySelector(${js(cellOf(4, 2))}).getBoundingClientRect().toJSON()`));
    await drag(page, handle, { dy: end.y - handle.y, steps: 12 });
    await page.waitFor(`window.BeesonEditor.state('edit.undo').label === 'Undo Autofill'`);
    await frames(page);
    assert.match(await page.evaluate(PANE_NOTE), /cells A1:C5$/);
    await handlesAtCorners(page, 'after an autofill');
    assert.deepEqual(page.errors, []);
  });
}
