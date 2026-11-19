import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';
import { snapMove } from '../src/editor/canvas/snap.ts';

describe('readouts and X and Y of a group', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const MATH = 3;
  const IMG = '.reveal section.present figure.figure-box img:not([hidden])';

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
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const wait = (page, ms) => page.evaluate(`new Promise((d) => setTimeout(() => d(true), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

  async function load(t, platform, { deck = LAYOUTS, n = 0, size = { width: 1600, height: 1000 } } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    await page.send('Storage.clearDataForOrigin', { origin: server.origin, storageTypes: 'local_storage' });
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  let saves = 0;
  async function roundTrip(page, edits) {
    await byteExact(page, edits);
    const edited = await render(page);
    await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r7-1-${++saves}.html`);
    assert.equal(text, edited);
    page.source = text;
  }

  const fieldsOf = (page) =>
    page.evaluate(`(() => { const v = (n) => document.querySelector('#beeson-edit-panel-format input[name="' + n + '"]')?.value ?? null; return { w: Number(v('Width')), h: Number(v('Height')) }; })()`);
  const readoutOf = (page) =>
    page.evaluate(`(() => { const t = document.querySelector('.beeson-offset:not([hidden])')?.textContent ?? ''; const m = t.match(/w: (\\d+) px  h: (\\d+) px/); return m ? { w: Number(m[1]), h: Number(m[2]), text: t } : null; })()`);

  for (const platform of PLATFORMS) {
    test(`the readout of a resize of a group gives the size of W and H (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await clickText(page, IMG);
      await click(page, '.reveal section.present > p', { modifiers: 'Shift' });
      await exec(page, 'arrange.group');
      await frames(page);
      await page.evaluate(`[...document.querySelectorAll('#beeson-edit-panel-format button')].find((b) => b.textContent.trim() === 'Arrange')?.click()`);
      await frames(page);
      const start = await fieldsOf(page);
      const se = await page.evaluate(`(() => { const g = document.querySelector('.beeson-grip[data-group="1"][data-handle="se"]'); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await drag(page, se, { dx: -120, dy: -90, steps: 12, hold: true });
      await frames(page);
      const readout = await readoutOf(page);
      let f = await fieldsOf(page);
      assert.ok(readout, 'a readout is shown during the resize');
      assert.ok(f.w < start.w - 50, js({ start, f }));
      const near = (a, b) => Math.abs(a - b) <= 1;
      assert.ok(near(readout.w, f.w) && near(readout.h, f.h), `during the resize the readout reads ${readout.text} and the fields ${js(f)}`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: se.x - 120, y: se.y - 90, button: 'left', clickCount: 1 });
      await frames(page);
      f = await fieldsOf(page);
      assert.ok(near(readout.w, f.w) && near(readout.h, f.h), `after the resize the fields read ${js(f)}, and the last readout ${readout.text}`);
      assert.deepEqual(errors(page), []);
    });
  }

  const placedOf = (page) =>
    page.evaluate(`(() => {
    const slides = document.querySelector('.reveal .slides');
    const top = slides.getBoundingClientRect();
    const s = top.width / slides.offsetWidth;
    const box = (r) => ({ left: (r.left - top.left) / s, top: (r.top - top.top) / s, right: (r.right - top.left) / s, bottom: (r.bottom - top.top) / s });
    const sec = document.querySelector('.reveal section.present');
    const el = document.querySelector('.beeson-pending') ?? [...sec.querySelectorAll('p')].find((p) => p.textContent === 'Typed');
    const v = document.querySelector('.beeson-edit-canvas').getBoundingClientRect();
    const seen = box(new DOMRect(v.left, v.top, v.width, v.height));
    const w = sec.offsetWidth, h = sec.offsetHeight;
    const visible = { left: Math.max(0, seen.left), top: Math.max(0, seen.top), right: Math.min(w, seen.right), bottom: Math.min(h, seen.bottom) };
    const ink = (t) => { const g = document.createRange(); g.selectNodeContents(t); return box(g.getBoundingClientRect()); };
    const texts = [...sec.querySelectorAll(':scope > h2, :scope > p, :scope > ul, :scope > ol')].filter((t) => t !== el && t.getClientRects().length).map(ink);
    return { box: box(el.getBoundingClientRect()), feet: [...sec.querySelectorAll('.foot')].map((f) => box(f.getBoundingClientRect())), texts, w, h, visible };
  })()`);

  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const SMALL = '.reveal section.present > p.small';
  for (const platform of PLATFORMS) {
    for (const { name, y, zoom } of [
      { name: 'over the footnote', y: 880 },
      { name: 'under the slide', y: 1000 },
      { name: 'under the slide at Actual Size, scrolled to the upper left', y: 1000, zoom: true },
    ]) {
      test(`a new text box that would be ${name} is put at the center of the visible slide (${platform})`, async (t) => {
        const page = await load(t, platform, { n: 2 });
        await clickText(page, SMALL);
        await press(page, 'Escape');
        await exec(page, 'arrange.setPosition', { y });
        await frames(page);
        assert.match(await page.evaluate(`document.querySelector(${js(SMALL)}).getAttribute('style') ?? ''`), /translate/);
        page.source = await render(page);
        if (zoom) {
          await exec(page, 'zoom.actual');
          await page.evaluate(`(() => { const c = document.querySelector('.beeson-edit-canvas'); c.scrollLeft = 0; c.scrollTop = 0; })()`);
          await frames(page);
        }
        await exec(page, 'insert.text');
        await frames(page);
        const check = (at, what) => {
          const { box, feet, texts, w, h, visible } = at;
          for (const x of texts) assert.ok(!meets(box, x), `the ${what} at ${js(box)} is over a text at ${js(x)}`);
          assert.ok(box.left >= -1 && box.top >= -1 && box.right <= w + 1 && box.bottom <= h + 1, `the ${what} at ${js(box)} is off the slide of ${w} by ${h}`);
          for (const f of feet) assert.ok(!meets(box, f), `the ${what} at ${js(box)} is over the footnote at ${js(f)}`);
          const bw = box.right - box.left, bh = box.bottom - box.top;
          const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
          const cx = clamp((visible.left + visible.right) / 2, bw / 2, w - bw / 2);
          const cy = clamp((visible.top + visible.bottom) / 2, bh / 2, h - bh / 2);
          const centered = { left: cx - bw / 2, right: cx + bw / 2, top: cy - bh / 2, bottom: cy + bh / 2 };
          if (texts.some((x) => meets(centered, x))) return;
          assert.ok(Math.abs((box.left + box.right) / 2 - cx) <= 2, `the ${what} at ${js(box)} is not centered at x ${cx} of the visible part ${js(visible)}`);
          const under = feet.filter((f) => meets(centered, f));
          if (!under.length) assert.ok(Math.abs((box.top + box.bottom) / 2 - cy) <= 2, `the ${what} at ${js(box)} is not centered at y ${cy} of the visible part ${js(visible)}`);
          else assert.ok(box.bottom >= Math.min(...under.map((f) => f.top)) - 40, `the ${what} at ${js(box)} is moved further up than the footnote at ${js(under)}`);
        };
        const empty = await placedOf(page);
        check(empty, 'empty box');
        await type(page, 'Typed');
        await wait(page, 300);
        const written = await placedOf(page);
        check(written, 'written box');
        assert.ok(Math.abs(written.box.left - empty.box.left) <= 1 && Math.abs(written.box.top - empty.box.top) <= 1, `the box is moved from ${js(empty.box)} to ${js(written.box)} when it is written`);
        const tag = (await render(page)).match(/<p style="(width: \d+px; )?translate: -?\d+px -?\d+px">Typed<\/p>/)?.[0];
        assert.ok(tag, 'the box is written with its offset');
        await roundTrip(page, [['A small paragraph.</p>\n', `A small paragraph.</p>\n  ${tag}\n`]]);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  const frameOf = (page) =>
    page.evaluate(`(() => { const slides = document.querySelector('.reveal .slides'); const s = slides.getBoundingClientRect().width / slides.offsetWidth; const f = document.querySelector('.beeson-frame.union.group:not([hidden])'); if (!f) return null; const r = f.getBoundingClientRect(); return { w: (r.width - 16) / s, h: (r.height - 16) / s }; })()`);

  const FIGURES = 4;
  const grouped = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present [data-group]')].map((e) => e.localName).sort()`);
  const DEMO_IMG = '.reveal section.present figure.figure-box img:not([hidden])';
  for (const platform of PLATFORMS) {
    test(`the readout, the frame, and W and H give one size during and after a resize of a group (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test-deck.html', n: FIGURES });
      await clickText(page, '.reveal section.present > p');
      await press(page, 'Escape');
      await click(page, DEMO_IMG, { modifiers: 'Shift' });
      await exec(page, 'arrange.group');
      await frames(page);
      assert.deepEqual(await grouped(page), ['figure', 'p'], 'the paragraph and the figure are not grouped');
      const empty = await page.evaluate(`(() => { const r = document.querySelector('.reveal section.present').getBoundingClientRect(); return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.9 }; })()`);
      await clickText(page, empty);
      await clickText(page, DEMO_IMG);
      await frames(page);
      assert.ok(await frameOf(page), 'the group is not selected');
      await page.evaluate(`[...document.querySelectorAll('#beeson-edit-panel-format button')].find((b) => b.textContent.trim() === 'Arrange')?.click()`);
      await frames(page);
      const near = (a, b) => Math.abs(a - b) <= 1.5;
      const same = (what, a, b) => assert.ok(near(a.w, b.w) && near(a.h, b.h), `${what}: ${js(a)} and ${js(b)}`);
      same('before the resize, the frame and the fields', await frameOf(page), await fieldsOf(page));
      const se = await page.evaluate(`(() => { const g = document.querySelector('.beeson-grip[data-group="1"][data-handle="se"]'); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await drag(page, se, { dx: -120, dy: -90, steps: 12, hold: true });
      await frames(page);
      const readout = await readoutOf(page);
      assert.ok(readout, 'a readout is shown during the resize');
      const during = await fieldsOf(page);
      same('during the resize, the readout and the fields', readout, during);
      same('during the resize, the frame and the fields', await frameOf(page), during);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: se.x - 120, y: se.y - 90, button: 'left', clickCount: 1 });
      await frames(page);
      const done = await fieldsOf(page);
      same('after the resize, the last readout and the fields', readout, done);
      same('after the resize, the frame and the fields', await frameOf(page), done);
      assert.deepEqual(errors(page), []);
    });
  }

  const positionFieldsOf = (page) =>
    page.evaluate(`(() => { const v = (n) => document.querySelector('#beeson-edit-panel-format input[name="' + n + '"]')?.value ?? null; return { x: v('X'), y: v('Y') }; })()`);
  const cornerOfFrame = (page) =>
    page.evaluate(`(() => { const slides = document.querySelector('.reveal .slides'); const o = slides.getBoundingClientRect(); const s = o.width / slides.offsetWidth; const r = document.querySelector('.beeson-frame.union.group:not([hidden])').getBoundingClientRect(); return { x: (r.left + 8 - o.left) / s, y: (r.top + 8 - o.top) / s }; })()`);
  const membersOf = (page) =>
    page.evaluate(`(() => { const slides = document.querySelector('.reveal .slides'); const o = slides.getBoundingClientRect(); const s = o.width / slides.offsetWidth; return window.BeesonEditor.selection().map((e) => { const r = e.getBoundingClientRect(); return { x: (r.left - o.left) / s, y: (r.top - o.top) / s }; }); })()`);

  for (const platform of PLATFORMS) {
    test(`X and Y give the corner of a group, and a typed X or Y moves the whole group as one entry (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test-deck.html', n: FIGURES });
      await clickText(page, '.reveal section.present > p');
      await press(page, 'Escape');
      await click(page, DEMO_IMG, { modifiers: 'Shift' });
      await exec(page, 'arrange.group');
      await frames(page);
      await page.evaluate(`[...document.querySelectorAll('#beeson-edit-panel-format button')].find((b) => b.textContent.trim() === 'Arrange')?.click()`);
      await frames(page);
      page.source = await render(page);
      const corner = await cornerOfFrame(page);
      const xy = await positionFieldsOf(page);
      assert.ok(xy.x !== '' && xy.y !== '', `X and Y read ${js(xy)} for a group at ${js(corner)}`);
      assert.ok(Math.abs(Number(xy.x) - corner.x) <= 1 && Math.abs(Number(xy.y) - corner.y) <= 1, `X and Y read ${js(xy)} for a group at ${js(corner)}`);
      const before = await membersOf(page);
      for (const [name, value] of [['X', Number(xy.x) - 40], ['Y', Number(xy.y) + 30]]) {
        await click(page, `#beeson-edit-panel-format input[name="${name}"]`);
        await page.evaluate(`document.querySelector('#beeson-edit-panel-format input[name="${name}"]').select()`);
        await type(page, String(value));
        await press(page, 'Enter');
        await frames(page);
      }
      const now = await cornerOfFrame(page);
      assert.ok(Math.abs(now.x - (Number(xy.x) - 40)) <= 1 && Math.abs(now.y - (Number(xy.y) + 30)) <= 1, `the group is at ${js(now)} after X ${Number(xy.x) - 40} and Y ${Number(xy.y) + 30}`);
      assert.deepEqual(await positionFieldsOf(page), { x: String(Number(xy.x) - 40), y: String(Number(xy.y) + 30) });
      const after = await membersOf(page);
      for (const [i, m] of after.entries()) assert.ok(Math.abs(m.x - before[i].x + 40) <= 1 && Math.abs(m.y - before[i].y - 30) <= 1, `member ${i} moved from ${js(before[i])} to ${js(m)}`);
      assert.deepEqual(await grouped(page), ['figure', 'p'], 'the group is taken apart');
      const typed = await render(page);
      await page.evaluate('window.BeesonEditor.undo()');
      await frames(page);
      const half = await membersOf(page);
      for (const [i, m] of half.entries()) assert.ok(Math.abs(m.x - before[i].x + 40) <= 1 && Math.abs(m.y - before[i].y) <= 1, `after an undo member ${i} is at ${js(m)}`);
      await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);
      await page.evaluate('window.BeesonEditor.redo()');
      await page.evaluate('window.BeesonEditor.redo()');
      assert.equal(await render(page), typed);
      const { text } = await saveAndReopen(page, `r7-1-${++saves}.html`);
      assert.equal(text, typed);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`X and Y stay empty for several ungrouped elements at different corners (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test-deck.html', n: FIGURES });
      await clickText(page, '.reveal section.present > p');
      await press(page, 'Escape');
      await click(page, DEMO_IMG, { modifiers: 'Shift' });
      await frames(page);
      await page.evaluate(`[...document.querySelectorAll('#beeson-edit-panel-format button')].find((b) => b.textContent.trim() === 'Arrange')?.click()`);
      await frames(page);
      assert.equal(await page.evaluate(`window.BeesonEditor.selection().length`), 2);
      assert.deepEqual(await positionFieldsOf(page), { x: '', y: '' });
      assert.deepEqual(errors(page), []);
    });
  }

  async function loadTime(t, platform, busy = 0) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    if (busy) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `{ const until = performance.now() + ${busy}; while (performance.now() < until); }` });
    const t0 = Date.now();
    await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    return { page, ms: Date.now() - t0 };
  }

  async function tabPair(t, platform, paused) {
    const first = await loadTime(t, platform);
    await first.page.evaluate(`window.BeesonEditor.open(${js(readFileSync(LAYOUTS, 'utf8'))})`);
    const second = await loadTime(t, platform, paused && 3 * first.ms);
    const errs = [...errors(first.page), ...errors(second.page)];
    await Promise.all([first.page.close(), second.page.close()]);
    return { first: first.ms, second: second.ms, errs };
  }

  async function secondTab(t, platform, paused = false) {
    let pair = await tabPair(t, platform, paused);
    for (let again = 0; again < 2 && pair.second >= 2 * pair.first; again++) {
      const next = await tabPair(t, platform, false);
      if (next.second / next.first < pair.second / pair.first) pair = next;
    }
    assert.ok(pair.second < 2 * pair.first, `the second tab takes ${pair.second} ms to load, and the first ${pair.first} ms`);
    assert.deepEqual(pair.errs, []);
  }

  for (const platform of PLATFORMS) {
    test(`a second tab of a deck with videos loads as fast as the first (${platform})`, (t) => secondTab(t, platform));
  }

  test('a second tab slowed once by a pause of the machine is measured again before the test fails', (t) => secondTab(t, 'other', true));
});

describe('Width and Height of a turned group', () => {
  const DECK = 'test-deck.html';
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });

  const PANEL = '#beeson-edit-panel-format';
  async function fieldValue(page, id) {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === 'Arrange')?.click()`);
    await frames(page);
    return Number(await page.evaluate(`document.querySelector('#beeson-edit-num-${id}')?.value`));
  }
  async function typeField(page, id, value) {
    await fieldValue(page, id);
    await page.evaluate(`(() => { const i = document.querySelector('#beeson-edit-num-${id}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
    await frames(page);
  }
  const sizeFields = async (page) => ({ w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height') });

  async function load(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${FIGURES})`);
    await frames(page);
    return page;
  }

  async function checkEdit(page, name, before) {
    const edited = await render(page);
    assert.notEqual(edited, before);
    await undo(page);
    assert.equal(await render(page), before);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
  }

  async function groupOnFigures(page, platform) {
    await click(page, IMG);
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    for (const [field, value] of [['width', 1400], ['height', 700]]) {
      test(`a typed ${field} of a turned group reads back as typed, and the same value again leaves the file (${platform})`, async (t) => {
        const page = await load(t, platform);
        await groupOnFigures(page, platform);
        await typeField(page, 'angle', 30);
        const turned = await render(page);
        await typeField(page, field, value);
        const read = await sizeFields(page);
        assert.ok(Math.abs(read[field[0]] - value) <= 1, `a typed ${field} of ${value} reads ${js(read)}`);
        const typed = await render(page);
        await typeField(page, field, value);
        assert.equal(await render(page), typed, `a second ${field} of ${value} changes the file`);
        assert.deepEqual(await sizeFields(page), read);
        await checkEdit(page, `r14-5-group-${field}-${platform}.html`, turned);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`the readout of a corner resize of a turned figure with a caption gives the size of the fields (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, IMG);
      await typeField(page, 'angle', 30);
      const turned = await render(page);
      const at = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-grip[data-handle="se"]')].find((g) => g.getClientRects().length && !g.hidden); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await mouse(page, 'mouseMoved', at.x, at.y);
      await mouse(page, 'mousePressed', at.x, at.y, { button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 12; i++) await mouse(page, 'mouseMoved', at.x + 5 * i, at.y + 5 * i, { button: 'left', buttons: 1 });
      await frames(page);
      const readout = await page.evaluate(`(() => { const o = document.querySelector('.beeson-offset'); return o && !o.hidden ? o.textContent : ''; })()`);
      await mouse(page, 'mouseReleased', at.x + 60, at.y + 60, { button: 'left', buttons: 0, clickCount: 1 });
      await frames(page);
      const read = await sizeFields(page);
      const m = /w:\s*(\d+)\s*px\s*h:\s*(\d+)\s*px/.exec(readout);
      assert.ok(m, `the readout is ${js(readout)}`);
      assert.ok(Math.abs(Number(m[1]) - read.w) <= 1 && Math.abs(Number(m[2]) - read.h) <= 1, `the readout ${js(readout)} against the fields ${js(read)}`);
      await checkEdit(page, `r14-5-turned-resize-${platform}.html`, turned);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`a typed Height of a figure with a caption reads back as typed (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, IMG);
      let last = page.source;
      for (const h of [975, 700, 775, 950]) {
        last = await render(page);
        await typeField(page, 'height', h);
        assert.equal(await fieldValue(page, 'height'), h, `a typed Height of ${h}`);
      }
      await checkEdit(page, `r14-5-height-${platform}.html`, last);
      assert.deepEqual(errors(page), []);
    });
    test(`a typed Height of 1 of a figure with a caption does not write a width of 0 (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, IMG);
      await typeField(page, 'height', 1);
      const widths = await page.evaluate(`[...document.querySelector(${JSON.stringify(IMG)}).closest('figure').querySelectorAll('img')].map((i) => i.style.width)`);
      assert.ok(widths.length > 0 && widths.every((w) => parseFloat(w) >= 1), `the pictures are written ${JSON.stringify(widths)} wide`);
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('Align of groups, and slides shown by undo', () => {
  const DECK = 'test-deck.html';
  const FIGURES = 4;
  const CLOSING = 12;
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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const near = (a, b, by = 2) => Math.abs(a - b) <= by;
  const shown = (page) => page.evaluate('Reveal.getIndices().h');
  const boxOf = (page, selector) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides').getBoundingClientRect(), k = s.width / 1920;
  const e = [...Reveal.getCurrentSlide().querySelectorAll(${js(selector)})].find((e) => e.getClientRects().length && e.getBoundingClientRect().width);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, width: r.width / k, height: r.height / k };
})()`);
  const selectionShown = (page) => page.evaluate('window.BeesonEditor.selection().every((el) => Reveal.getCurrentSlide().contains(el))');

  const PANEL = '#beeson-edit-panel-format';
  async function fieldValue(page, id) {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === 'Arrange')?.click()`);
    await frames(page);
    return Number(await page.evaluate(`document.querySelector('#beeson-edit-num-${id}')?.value`));
  }
  async function typeField(page, id, value) {
    await fieldValue(page, id);
    await page.evaluate(`(() => { const i = document.querySelector('#beeson-edit-num-${id}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
    await frames(page);
  }
  const figureBox = (page, caption = true) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides').getBoundingClientRect(), k = s.width / 1920;
  const img = Reveal.getCurrentSlide().querySelector('figure img.for-light'), i = img.getBoundingClientRect();
  const q = Math.min(i.width / img.naturalWidth, i.height / img.naturalHeight), w = img.naturalWidth * q, h = img.naturalHeight * q;
  const boxes = [{ left: i.left + (i.width - w) / 2, top: i.top + (i.height - h) / 2, right: i.left + (i.width + w) / 2, bottom: i.top + (i.height + h) / 2 }];
  if (${caption}) boxes.push(Reveal.getCurrentSlide().querySelector('figcaption').getBoundingClientRect());
  const left = Math.min(...boxes.map((b) => b.left)), top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.right)), bottom = Math.max(...boxes.map((b) => b.bottom));
  return { left: (left - s.left) / k, top: (top - s.top) / k, width: (right - left) / k, height: (bottom - top) / k };
})()`);

  async function load(t, platform, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function checkEdit(page, name, before = page.source) {
    const edited = await render(page);
    assert.notEqual(edited, before);
    await undo(page);
    assert.equal(await render(page), before);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
  }

  async function groupOnFigures(page) {
    await clickText(page, 'section.present figure img.for-light');
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName).sort()'), ['figure', 'p']);
    await press(page, (await page.evaluate("new URLSearchParams(location.search).get('edit-platform')")) === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    assert.equal(await page.evaluate('Reveal.getCurrentSlide().querySelectorAll("[data-group]").length'), 2);
  }

  for (const platform of PLATFORMS) {
    test(`Align moves a whole group as one object (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await groupOnFigures(page);
      const grouped = await render(page);
      const p0 = await boxOf(page, ':scope > p'), f0 = await boxOf(page, ':scope > figure');
      await exec(page, 'arrange.alignTo.selection');
      await exec(page, 'arrange.align.left');
      await frames(page);
      const p = await boxOf(page, ':scope > p'), f = await boxOf(page, ':scope > figure');
      assert.ok(near(f.left - p.left, f0.left - p0.left) && near(f.top - p.top, f0.top - p0.top), `the members kept their places: ${js({ p0, f0, p, f })}`);
      assert.ok(near(Math.min(p.left, f.left), 0), `the group is at the left edge of the slide: ${js({ p, f })}`);
      await checkEdit(page, `r12-5-align-${platform}.html`, grouped);
      assert.deepEqual(errors(page), []);
    });

    test(`Distribute moves a whole group as one object (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await groupOnFigures(page);
      const grouped = await render(page);
      const p0 = await boxOf(page, ':scope > p'), f0 = await boxOf(page, ':scope > figure');
      await clickText(page, 'section.present figure img.for-light');
      await click(page, 'section.present h2', { modifiers: 'Shift' });
      await click(page, 'section.present > ul > li', { modifiers: 'Shift' });
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 4);
      await exec(page, 'arrange.distribute.vertical');
      await frames(page);
      const p = await boxOf(page, ':scope > p'), f = await boxOf(page, ':scope > figure');
      assert.ok(near(f.left - p.left, f0.left - p0.left) && near(f.top - p.top, f0.top - p0.top), `the members kept their places: ${js({ p0, f0, p, f })}`);
      await checkEdit(page, `r12-5-distribute-${platform}.html`, grouped);
      assert.deepEqual(errors(page), []);
    });

    test(`a typed width keeps the upper left corner of the QR code of the closing slide (${platform})`, async (t) => {
      const page = await load(t, platform, CLOSING);
      await clickText(page, 'section.present .qr');
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.matches(".qr"))'), [true]);
      const was = await boxOf(page, '.qr');
      await exec(page, 'arrange.setSize', { w: 240 });
      await frames(page);
      const now = await boxOf(page, '.qr');
      assert.ok(near(now.width, 240), `the width is 240: ${js(now)}`);
      assert.ok(near(now.left, was.left) && near(now.top, was.top), `the corner stays: ${js({ was, now })}`);
      await checkEdit(page, `r12-5-qr-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });

    for (const [what, act] of [
      ['Duplicate', (page) => press(page, 'Mod+D')],
      ['a duplicating drag', (page, platform) => drag(page, 'section.present figure img.for-light', { dx: -120, dy: 0, modifiers: platform === 'mac' ? 'Alt' : 'Ctrl' })],
      ['Delete', (page) => press(page, 'Backspace')],
      ['Lock', (page) => press(page, 'Mod+L')],
    ]) {
      test(`an undo and a redo of ${what} show the slide that they change (${platform})`, async (t) => {
        const page = await load(t, platform, FIGURES);
        await clickText(page, 'section.present figure img.for-light');
        await act(page, platform);
        await frames(page);
        const edited = await render(page);
        assert.notEqual(edited, page.source);
        await page.evaluate('Reveal.slide(1)');
        await frames(page);
        await undo(page);
        await frames(page);
        assert.equal(await render(page), page.source);
        assert.equal(await shown(page), FIGURES, 'the undo shows the slide of the change');
        assert.ok(await selectionShown(page), 'the selection is on the shown slide');
        await page.evaluate('Reveal.slide(7)');
        await frames(page);
        await redo(page);
        await frames(page);
        assert.equal(await render(page), edited);
        assert.equal(await shown(page), FIGURES, 'the redo shows the slide of the change');
        assert.ok(await selectionShown(page), 'the selection is on the shown slide');
        assert.deepEqual(errors(page), []);
      });
    }
    test(`a held corner grip keeps its diagonal cursor through the resize (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      const grip = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-grip[data-handle="se"]')].find((g) => g.getClientRects().length && !g.hidden); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const cursor = (x, y) => page.evaluate(`getComputedStyle(document.elementFromPoint(${x}, ${y})).cursor`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grip.x, y: grip.y });
      assert.equal(await cursor(grip.x, grip.y), 'nwse-resize');
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: grip.x, y: grip.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 8; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grip.x - 15 * i, y: grip.y - 4 * i, button: 'left', buttons: 1 });
      await frames(page);
      assert.equal(await cursor(grip.x - 120, grip.y - 32), 'nwse-resize', 'the held grip keeps its cursor');
      const readout = await page.evaluate(`document.querySelector('.beeson-offset').textContent`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: grip.x - 120, y: grip.y - 32, button: 'left', buttons: 0, clickCount: 1 });
      await frames(page);
      const [, w, h] = readout.match(/w: (\d+) px\s+h: (\d+) px/) ?? [];
      assert.ok(near(Number(w), await fieldValue(page, 'width'), 1) && near(Number(h), await fieldValue(page, 'height'), 1), `the readout ${readout} is not W ${await fieldValue(page, 'width')} and H ${await fieldValue(page, 'height')}`);
      await clickText(page, { x: grip.x - 120, y: grip.y - 32 });
      await frames(page);
      assert.notEqual(await cursor(grip.x - 120, grip.y - 32), 'nwse-resize');
      await checkEdit(page, `r12-5-grip-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });
    test(`a multiple selection is turned by its rotate handle, each element about its own center (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present > p');
      await press(page, 'Escape');
      await click(page, 'section.present figure img.for-light', { modifiers: 'Shift' });
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['p', 'figure']);
      const centerOf = (selector) => page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const p0 = await centerOf(':scope > p'), i0 = await centerOf('figure img.for-light'), q0 = await centerOf('figcaption');
      const s = await page.evaluate(`(() => { const r = document.querySelector('.reveal .slides').getBoundingClientRect(); return { left: r.left, top: r.top, k: r.width / 1920 }; })()`);
      const f = await figureBox(page), c = { x: s.left + (f.left + f.width / 2) * s.k, y: s.top + (f.top + f.height / 2) * s.k };
      const rotor = await page.evaluate(`(() => { const r = document.querySelector('.beeson-rotor'); if (!r || r.hidden || !r.getClientRects().length) return null; const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
      assert.ok(rotor, 'the rotate handle is drawn');
      await drag(page, rotor, { dx: p0.x - rotor.x + (p0.y - rotor.y), dy: p0.y - rotor.y, steps: 12, modifiers: 'Shift' });
      await frames(page);
      const angles = await page.evaluate(`[Reveal.getCurrentSlide().querySelector(':scope > p'), Reveal.getCurrentSlide().querySelector('figure.figure-box')].map((el) => el.style.rotate)`);
      assert.deepEqual(angles, ['90deg', '90deg']);
      const p1 = await centerOf(':scope > p'), i1 = await centerOf('figure img.for-light'), q1 = await centerOf('figcaption');
      const at = (o) => ({ x: c.x - (o.y - c.y), y: c.y + (o.x - c.x) });
      assert.ok(near(p1.x, p0.x) && near(p1.y, p0.y), `the paragraph kept its center: ${js({ p0, p1 })}`);
      assert.ok([[i1, at(i0)], [q1, at(q0)]].every(([a, b]) => near(a.x, b.x) && near(a.y, b.y)), `the figure kept the center of its picture with its caption: ${js({ c, i0, i1, q0, q1 })}`);
      await checkEdit(page, `r12-5-rotor-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });
    test(`the Height of a figure selected as one object gives its picture with its caption (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      const f0 = await figureBox(page);
      assert.ok(f0.height > 800, `the frame holds the caption: ${js(f0)}`);
      for (const [id, v] of [['x', f0.left], ['y', f0.top], ['width', f0.width], ['height', f0.height]]) {
        assert.ok(near(await fieldValue(page, id), v, 1), `${id} reads ${await fieldValue(page, id)}, not ${Math.round(v)} of the frame`);
      }
      await typeField(page, 'height', 700);
      const f1 = await figureBox(page);
      assert.ok(near(f1.height, 700, 3) && near(f1.left, f0.left) && near(f1.top, f0.top), `the frame is ${js(f1)}`);
      assert.ok(near(await fieldValue(page, 'height'), 700, 3), `Height reads ${await fieldValue(page, 'height')}`);
      await checkEdit(page, `r12-5-figure-height-${platform}.html`);
      await clickText(page, { x: 10, y: 10 });
      await clickText(page, 'section.present figure img.for-light');
      await clickText(page, 'section.present figure img.for-light');
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['img']);
      const h = await fieldValue(page, 'height');
      const pic = await figureBox(page, false);
      assert.ok(near(h, pic.height, 2) && h < 700 - 50, `the picture alone reads ${h} against its box ${js(pic)}`);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`a turned group keeps the size of its frame and of its W and H fields (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await groupOnFigures(page);
      const grouped = await render(page);
      const w0 = await fieldValue(page, 'width'), h0 = await fieldValue(page, 'height');
      const frame = () => page.evaluate(`(() => { const f = document.querySelector('.beeson-frame.union.group'); return f.hidden ? null : { width: f.offsetWidth, height: f.offsetHeight, rotate: f.style.rotate }; })()`);
      const f0 = await frame();
      let before = grouped;
      for (const deg of [20, 45]) {
        if (deg === 45) before = await render(page);
        await typeField(page, 'angle', deg);
        const w = await fieldValue(page, 'width'), h = await fieldValue(page, 'height'), f = await frame();
        assert.ok(near(w, w0, 3) && near(h, h0, 3), `at ${deg} degrees W and H read ${w} by ${h}, not ${w0} by ${h0}`);
        assert.ok(near(f.width, f0.width, 3) && near(f.height, f0.height, 3) && f.rotate === `${deg}deg`, `at ${deg} degrees the frame is ${js(f)}, not ${js(f0)} turned`);
      }
      await checkEdit(page, `r12-5-turned-group-${platform}.html`, before);
      assert.deepEqual(errors(page), []);
    });
  }

  test('the marks of equal gaps are drawn clear of the guides along the same axis', () => {
    const box = (left, top, width, height) => ({ left, top, width, height });
    const slide = { width: 1920, height: 1080 };
    for (const [moved, boxes] of [
      [box(446, 400, 100, 100), [box(100, 400, 200, 100), box(700, 400, 200, 100)]],
      [box(446, 420, 100, 60), [box(100, 400, 200, 100), box(700, 400, 200, 100)]],
    ]) {
      const snap = snapMove(moved, { boxes, slide }, 16);
      const gaps = snap.spacing.filter((s) => s.axis === 'x').flatMap((s) => s.gaps);
      assert.equal(gaps.length, 2);
      const lines = snap.guides.filter((g) => g.axis === 'y').map((g) => g.at);
      for (const g of gaps) {
        assert.ok(lines.every((at) => Math.abs(at - g.at) >= 7), `a mark at y ${g.at} is on a guide of ${js(lines)}`);
        assert.ok(g.at > Math.max(...boxes.map((b) => b.top + b.height), moved.top + moved.height) - 1, `a mark at y ${g.at} is not under the boxes`);
      }
    }
  });
});
