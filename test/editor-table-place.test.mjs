import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, drag, press, saveAndReopen } from './helpers/editor.mjs';
import { declarationProblem } from '../src/editor/model/scope.ts';

describe('a new element on a figure slide', () => {
  const DECK = 'test/pages/editor-layouts.html';
  const SLIDES = [
    [6, 'a paper image', '.plate > img'],
    [7, 'a video', '.plate > video'],
    [8, 'a plot', '.plate svg'],
    [9, 'a backdrop', null],
  ];
  const PLATFORMS = ['mac', 'other'];
  const BARS = 24;

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

  const measure = (page, selector, texts) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const box = (r) => ({ left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k });
  const boxes = ${js(selector)} ? [...slide.querySelectorAll(${js(selector)})].filter((e) => e.getClientRects().length).map((e) => box(e.getBoundingClientRect())) : [];
  const lines = [];
  for (const el of slide.querySelectorAll(${js(texts)})) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 1) lines.push(box(r));
    }
  }
  return { k, boxes, lines };
})()`);
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const covers = (a, b) => (Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))) / ((b.right - b.left) * (b.bottom - b.top));
  const round = (boxes) => boxes.map((b) => [b.left, b.top, b.right, b.bottom].map(Math.round));
  const grown = (b, d) => ({ left: b.left - d, top: b.top - d, right: b.right + d, bottom: b.bottom + d });

  async function load(t, platform, n, deck = DECK) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  for (const platform of PLATFORMS) {
    for (const [id, name] of [['insert.text', 'text'], ['insert.formula', 'formula'], ['insert.qr', 'QR code']]) {
      test(`a new ${name} on a figure slide with a paper image does not move the image (${platform})`, async (t) => {
        const page = await load(t, platform, 6);
        const before = await render(page);
        const { boxes: media } = await measure(page, '.plate > img', ':scope > h2');
        assert.equal(media.length, 1);
        await exec(page, id);
        await frames(page);
        if (id !== 'insert.text') assert.notEqual(await render(page), before, 'nothing was inserted');
        const { boxes: after } = await measure(page, '.plate > img', ':scope > h2');
        assert.deepEqual(round(after), round(media), `the insert of a ${name} moved the image of the plate`);
        await undo(page);
        assert.equal(await render(page), before);
        assert.deepEqual(page.errors, []);
      });
    }

    const removals = [['deleted', 'element.delete'], ['cut', 'edit.cut']];
    const inserts = [['insert.table', 'table', ':scope > table', { rows: 3, columns: 3 }], ['insert.qr', 'QR code', ':scope > .qr', undefined]];
    for (const [verb, command, id, name, selector, arg] of removals.flatMap((r) => inserts.map((i) => [...r, ...i]))) {
      test(`a new ${name} on a figure slide stays in its place when the plate is ${verb} (${platform})`, async (t) => {
        const page = await load(t, platform, 6);
        await exec(page, id, arg);
        await frames(page);
        await press(page, 'Escape');
        await press(page, 'Escape');
        await frames(page);
        const edited = await render(page);
        const { boxes: placed } = await measure(page, selector, ':scope > h2');
        assert.equal(placed.length, 1, `no ${name} was inserted`);
        const at = await page.evaluate(`(() => {
        const r = document.querySelector('.reveal section.present .plate img').getBoundingClientRect();
        for (let fy = 0.9; fy > 0.1; fy -= 0.05) for (let fx = 0.1; fx < 0.9; fx += 0.05) {
          const x = r.left + r.width * fx, y = r.top + r.height * fy;
          const hit = document.elementsFromPoint(x, y);
          if (hit.find((e) => e.tagName === 'IMG') && !hit.find((e) => e.closest('table, .qr, h2, .caption'))) return { x, y };
        }
        return null;
      })()`);
        assert.ok(at, 'the image does not have a point clear of the other elements');
        await click(page, at);
        await frames(page);
        await exec(page, command);
        await frames(page);
        assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present .plate').length`), 0, `the plate was not ${verb}`);
        const { boxes: left } = await measure(page, selector, ':scope > h2');
        assert.deepEqual(round(left), round(placed), `the ${name} moved when the plate was ${verb}`);
        const deleted = await render(page);
        await undo(page);
        assert.equal(await render(page), edited);
        const { boxes: back } = await measure(page, selector, ':scope > h2');
        assert.deepEqual(round(back), round(placed));
        await redo(page);
        assert.equal(await render(page), deleted);
        assert.deepEqual(page.errors, []);
      });
    }

    test(`a deleted plate does not write an offset on the element beside it once the slide is a content slide (${platform})`, async (t) => {
      const page = await load(t, platform, 6);
      await exec(page, 'insert.qr');
      await frames(page);
      await press(page, 'Escape');
      await frames(page);
      await exec(page, 'slide.layout.content');
      await frames(page);
      const offset = (text) => /<div class="qr"[^>]*translate: ([^;"]*)/.exec(text)?.[1];
      const written = offset(await render(page));
      assert.ok(written, 'the QR code does not have an offset');
      await click(page, '.reveal section.present .figure-box img');
      await frames(page);
      await exec(page, 'element.delete');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present .figure-box').length`), 0, 'the plate was not deleted');
      assert.equal(offset(await render(page)), written, 'the delete of the plate changed the offset of the QR code');
      assert.deepEqual(page.errors, []);
    });

    test(`a second QR code on a figure slide with a plot is put off the first (${platform})`, async (t) => {
      const page = await load(t, platform, 8);
      for (let i = 0; i < 2; i++) {
        await exec(page, 'insert.qr');
        await frames(page);
        await press(page, 'Escape');
        await frames(page);
      }
      const { boxes } = await measure(page, ':scope > .qr', ':scope > h2');
      assert.equal(boxes.length, 2, 'two QR codes were not inserted');
      assert.ok(!meets(boxes[0], boxes[1]), `the QR codes at ${js(boxes[0])} and ${js(boxes[1])} lie over each other`);
      assert.deepEqual(page.errors, []);
    });

    test(`a second table on a new figure slide is put off the first with the room of its bars (${platform})`, async (t) => {
      const page = await load(t, platform, 3, 'test-deck.html');
      await exec(page, 'slide.new');
      await exec(page, 'slide.layout.figure');
      await frames(page);
      for (let i = 0; i < 2; i++) {
        await exec(page, 'insert.table', { rows: 3, columns: 3 });
        await frames(page);
        await press(page, 'Escape');
        await press(page, 'Escape');
        await frames(page);
      }
      const { k, boxes } = await measure(page, 'table', ':scope > h2');
      assert.equal(boxes.length, 2, 'two tables were not inserted');
      const [first, second] = boxes[0].top <= boxes[1].top ? boxes : [boxes[1], boxes[0]];
      assert.ok(!meets(grown(second, BARS / k), first), `the bars of the table at ${js(second)} lie over the table at ${js(first)}`);
      assert.deepEqual(page.errors, []);
    });

    for (const [n, what, drawn] of SLIDES) {
      test(`a new table on a figure slide with ${what} is put off the heading and the caption with the room of its bars (${platform})`, async (t) => {
        const page = await load(t, platform, n);
        const before = await render(page);
        const { boxes: media } = await measure(page, drawn, ':scope > h2');
        await exec(page, 'insert.table', { rows: 3, columns: 3 });
        await frames(page);
        const { k, boxes: [table], lines } = await measure(page, ':scope > table', ':scope > h2, :scope > .caption');
        assert.ok(table, 'no table was inserted');
        assert.ok(lines.length >= 2, 'the lines of the heading and of the caption were not measured');
        const room = BARS / k;
        const bars = grown(table, room);
        assert.ok(bars.left >= -1 && bars.top >= -1 && table.right <= 1921 && table.bottom <= 1081, `the table at ${js(table)} does not have its bars inside the slide`);
        for (const l of lines) assert.ok(!meets(bars, l), `the table at ${js(table)} with the room of its bars lies over a line of text at ${js(l)}`);
        const { boxes: after } = await measure(page, drawn, ':scope > h2');
        assert.deepEqual(round(after), round(media), 'the insert of a table moved what is drawn in the plate');
        for (const m of media) {
          if (what === 'a paper image') assert.ok(!meets(table, m), `the table at ${js(table)} lies over the image at ${js(m)}`);
          else assert.ok(covers(table, m) < 0.05, `the table at ${js(table)} covers more than a twentieth of what is drawn in the plate at ${js(m)}`);
        }
        const edited = await render(page);
        assert.notEqual(edited, before);
        await undo(page);
        assert.equal(await render(page), before);
        await redo(page);
        assert.equal(await render(page), edited);
        assert.deepEqual(page.errors, []);
      });
    }
  }
});

describe('a new table at a free place', () => {
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const FIGURES = 4;
  const VIDEO = 7;
  const PLATFORMS = ['mac', 'other'];
  const MARGIN = 120;

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

  const boxes = (page, selector) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  return [...slide.querySelectorAll(${js(selector)})].filter((e) => e.getClientRects().length).map((e) => {
    const r = e.getBoundingClientRect();
    return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k };
  });
})()`);
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const round = (b) => [b.left, b.top, b.right - b.left, b.bottom - b.top].map(Math.round);
  const inside = (b) => b.left >= MARGIN - 1 && b.right <= 1920 - MARGIN + 1 && b.top >= -1 && b.bottom <= 1081;

  async function load(t, platform, n, deck = DECK) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const insertTable = async (page) => {
    await exec(page, 'insert.table', { rows: 3, columns: 3 });
    await frames(page);
  };

  async function checkEdit(page, before, name) {
    const edited = await render(page);
    assert.notEqual(edited, before);
    await undo(page);
    assert.equal(await render(page), before);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
  }

  for (const platform of PLATFORMS) {
    test(`a new table on slide 5 is put inside the margins at the middle of the slide, off the figure, and a second table off the first (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      const before = await render(page);
      const [figure] = await boxes(page, ':scope > figure.figure-box');
      assert.ok(figure, 'slide 5 does not have a figure in its zone');
      await insertTable(page);
      const [table] = await boxes(page, ':scope > table');
      assert.ok(table, 'no table was inserted');
      assert.ok(inside(table), `the table at ${js(round(table))} is not inside the margins of the slide`);
      assert.ok(!meets(table, figure), `the table at ${js(round(table))} lies over the figure at ${js(round(figure))}`);
      assert.ok(Math.abs((table.top + table.bottom) / 2 - 540) <= 1, `the table at ${js(round(table))} is not at the middle of the slide`);
      assert.deepEqual(round(table), [654, 431, 498, 218]);
      await checkEdit(page, before, `r15-10-table-${platform}.html`);
      await insertTable(page);
      const tables = await boxes(page, ':scope > table');
      assert.equal(tables.length, 2);
      assert.ok(inside(tables[1]), `the second table at ${js(round(tables[1]))} is not inside the margins`);
      assert.ok(!meets(tables[1], tables[0]), `the second table at ${js(round(tables[1]))} lies over the first at ${js(round(tables[0]))}`);
      assert.ok(!meets(tables[1], figure), `the second table at ${js(round(tables[1]))} lies over the figure`);
      assert.deepEqual(page.errors, []);
    });

    test(`a new table on a slide with a free place is put there as before (${platform})`, async (t) => {
      for (const [n, place] of [[5, [120, 715, 498, 218]], [3, [1251, 411, 498, 218]]]) {
        const page = await load(t, platform, n);
        const before = await render(page);
        await insertTable(page);
        const [table] = await boxes(page, ':scope > table');
        assert.ok(table, 'no table was inserted');
        assert.deepEqual(round(table), place, `the table on slide ${n + 1} moved from its free place`);
        await checkEdit(page, before, `r15-10-free-${n}-${platform}.html`);
        assert.deepEqual(page.errors, []);
      }
    });

    test(`a new table on the figure slide with a video does not cover the video (${platform})`, async (t) => {
      const page = await load(t, platform, VIDEO, LAYOUTS);
      const before = await render(page);
      const [video] = await boxes(page, '.plate > video');
      assert.ok(video, 'the figure slide does not have a video');
      await insertTable(page);
      const [table] = await boxes(page, ':scope > table');
      assert.ok(table, 'no table was inserted');
      assert.ok(!meets(table, video), `the table at ${js(round(table))} lies over the video at ${js(round(video))}`);
      assert.ok(inside(table), `the table at ${js(round(table))} is not inside the margins of the slide`);
      const number = await page.evaluate(`(() => {
      const n = document.querySelector('.reveal .slide-number');
      const slide = document.querySelector('.reveal .slides > section.present');
      const s = slide.getBoundingClientRect(), k = s.width / slide.offsetWidth, r = n?.getBoundingClientRect();
      return r && r.width ? { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k } : null;
    })()`);
      if (number) assert.ok(!meets(table, number), `the table at ${js(round(table))} lies over the slide number at ${js(round(number))}`);
      await checkEdit(page, before, `r15-10-video-${platform}.html`);
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('second and third new tables on a slide', () => {
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const FIGURES = 4;
  const MARGIN = 120;

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
  const settle = async (page) => {
    await frames(page);
    await frames(page);
  };
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const status = (page) => page.evaluate('window.BeesonEditor.status()');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const show = async (page, n) => {
    await page.evaluate(`Reveal.slide(${n})`);
    await settle(page);
  };
  const indexOf = (page, selector) => page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.matches(${js(selector)}))`);
  const outlined = (page) => page.evaluate(`document.querySelectorAll('.reveal section.present .beeson-overflow').length`);

  async function load(t, platform, deck = DECK) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    return page;
  }

  const pieces = (page) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const px = (r) => ({ left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k });
  const shown = (e) => e.getClientRects().length && !e.closest('aside.notes, .backdrop');
  const tables = [...slide.querySelectorAll('table')].filter(shown).map((e) => px(e.getBoundingClientRect()));
  const figures = [...slide.querySelectorAll('img, video, .qr, .plot, figure')].filter(shown).map((e) => px(e.getBoundingClientRect()));
  const texts = [...slide.querySelectorAll('h1, h2, p, li')].filter((e) => shown(e) && !e.closest('table')).flatMap((e) => {
    const range = document.createRange();
    range.selectNodeContents(e);
    return [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => ({ ...px(r), name: e.localName + ':' + e.textContent.trim().slice(0, 16) }));
  });
  return { tables, figures, texts };
})()`);
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const round = (b) => [b.left, b.top, b.right - b.left, b.bottom - b.top].map(Math.round);
  const inside = (b) => b.left >= MARGIN - 1 && b.right <= 1920 - MARGIN + 1 && b.top >= -1 && b.bottom <= 1081;

  async function newTables(t, platform, deck, selector, count = 3) {
    const page = await load(t, platform, deck);
    const n = await indexOf(page, selector);
    assert.ok(n >= 0, `${deck} does not have a slide ${selector}`);
    await show(page, n);
    const before = await render(page);
    for (let i = 0; i < count; i++) {
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await settle(page);
      const { tables, figures, texts } = await pieces(page);
      assert.equal(tables.length, i + 1, 'no table was inserted');
      const table = tables[i];
      const where = `table ${i + 1} on ${deck} ${selector} at ${js(round(table))}`;
      assert.ok(inside(table), `${where} is not inside the margins`);
      for (const o of tables.slice(0, i)) assert.ok(!meets(table, o), `${where} lies over a table at ${js(round(o))}`);
      for (const f of figures) assert.ok(!meets(table, f), `${where} lies over a figure at ${js(round(f))}`);
      for (const l of texts) assert.ok(!meets(table, l), `${where} lies over the words ${l.name} at ${js(round(l))}`);
    }
    for (let i = 0; i < count; i++) await undo(page);
    assert.equal(await render(page), before);
    assert.deepEqual(page.errors, []);
  }

  for (const platform of PLATFORMS) {
    test(`three new tables on the section slide of the demo deck lie off each other and off the words (${platform})`, (t) => newTables(t, platform, DECK, '.section'));
    test(`three new tables on the section slide of the layouts page lie off each other and off the words (${platform})`, (t) => newTables(t, platform, LAYOUTS, '.section'));
    test(`three new tables on a title slide lie off each other and off the words (${platform})`, (t) => newTables(t, platform, DECK, '.title'));
    test(`three new tables on a closing slide lie off each other, the QR code, and the words (${platform})`, (t) => newTables(t, platform, DECK, '.closing'));
    test(`two new tables on a split slide lie off each other, the zone, and the words (${platform})`, (t) => newTables(t, platform, LAYOUTS, '.split', 2));
  }

  for (const platform of PLATFORMS) {
    for (const kept of [false, true]) {
      test(`the report of a layout change on slide 5 stays after 70 inserts on slide 1${kept ? '' : ', each undone'} (${platform})`, async (t) => {
        const page = await load(t, platform);
        await show(page, FIGURES);
        await exec(page, 'slide.layout.wide');
        await settle(page);
        const s = await status(page);
        const m = s.message.match(/(\d+) texts are under a picture/);
        assert.ok(m, `the layout Wide is not reported: ${js(s.message)}`);
        const marked = await outlined(page);
        assert.equal(marked, Number(m[1]));
        await show(page, 0);
        for (let i = 0; i < 70; i++) {
          await exec(page, 'insert.qr');
          if (!kept) await undo(page);
        }
        await settle(page);
        assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present .qr').length`), kept ? 70 : 0);
        await show(page, FIGURES);
        const later = await status(page);
        assert.ok(later.message.includes(`${m[1]} texts are under a picture`), `the report of slide 5 is lost: ${js(later.message)}`);
        assert.equal(await outlined(page), marked);
        assert.deepEqual(page.errors, []);
      });
    }
  }

  const heading = (page) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const px = (r) => ({ left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k });
  const h1 = slide.querySelector('h1');
  const range = document.createRange();
  range.selectNodeContents(h1);
  const codes = slide.querySelectorAll('.qr');
  const q = codes[codes.length - 1];
  return { h1: px(h1.getBoundingClientRect()), line: px(range.getClientRects()[0]), qr: px(q.getBoundingClientRect()), size: q.offsetWidth, marked: h1.classList.contains('beeson-overflow') };
})()`);

  async function turned(t, platform, at) {
    const page = await load(t, platform);
    await show(page, await indexOf(page, '.closing'));
    await exec(page, 'insert.qr');
    await settle(page);
    await exec(page, 'arrange.setRotation', { deg: 45 });
    await settle(page);
    const g = await heading(page);
    const c = at(g);
    let p = { x: Math.round(c.x - g.size / 2), y: Math.round(c.y - g.size / 2) };
    for (let i = 0; i < 2; i++) {
      await exec(page, 'arrange.setPosition', p);
      await settle(page);
      const m = await heading(page);
      p = { x: Math.round(p.x + c.x - (m.qr.left + m.qr.right) / 2), y: Math.round(p.y + c.y - (m.qr.top + m.qr.bottom) / 2) };
    }
    await exec(page, 'slide.layout.title');
    await settle(page);
    await settle(page);
    return { page, b: await heading(page), s: await status(page) };
  }

  for (const platform of PLATFORMS) {
    test(`a turned QR code that meets the line of a heading only above its box is not reported (${platform})`, async (t) => {
      const { page, b, s } = await turned(t, platform, (g) => ({ x: g.line.right + 20, y: g.h1.top + 10 - g.size / Math.SQRT2 }));
      assert.ok(Math.abs((b.qr.left + b.qr.right) / 2 - b.line.right - 20) < 1.5, `the QR code is not 20 px right of the words: ${js(b)}`);
      assert.ok(b.qr.bottom > b.h1.top + 8, `the QR code does not reach into the box of the heading: ${js(b)}`);
      assert.ok(b.line.top < b.h1.top - 2, `the line of the heading is inside its box: ${js(b)}`);
      assert.equal(s.overflow, 0, `the heading is reported: ${js(s.message)}`);
      assert.equal(b.marked, false, 'the heading is outlined');
      assert.deepEqual(page.errors, []);
    });

    test(`a turned QR code whose corner reaches the words of a heading inside its box is reported (${platform})`, async (t) => {
      const { page, b, s } = await turned(t, platform, (g) => ({ x: g.line.right - 40, y: g.h1.top + 30 - g.size / Math.SQRT2 }));
      assert.ok(b.qr.bottom > b.h1.top + 28, `the QR code does not reach into the box of the heading: ${js(b)}`);
      assert.equal(s.overflow, 1, `the heading is not reported: ${js(s.message)}`);
      assert.match(s.message, /1 text is (under|over) a QR code/);
      assert.equal(b.marked, true, 'the heading is not outlined');
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('a new table off the backdrop orbit', () => {
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const FIGURES = 4;
  const MARGIN = 120;

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
  const settle = async (page) => {
    await frames(page);
    await frames(page);
  };
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');

  async function load(t, platform, deck, n, width = 1600, height = 1000) {
    const page = await browser.newPage({ width, height });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    const at = typeof n === 'number' ? n : await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.matches(${js(n)}))`);
    assert.ok(at >= 0, `${deck} does not have a slide ${n}`);
    await page.evaluate(`Reveal.slide(${at})`);
    await settle(page);
    return page;
  }

  const insertTable = async (page) => {
    await exec(page, 'insert.table', { rows: 3, columns: 3 });
    await settle(page);
  };

  const pieces = (page) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const px = (r) => ({ left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k });
  const shown = (e) => e.getClientRects().length && !e.closest('aside.notes, .backdrop');
  const of = (sel) => [...slide.querySelectorAll(sel)].filter(shown).map((e) => px(e.getBoundingClientRect()));
  const words = [];
  const walk = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !shown(el) || el.closest('table, .plot, aside, script, style, mjx-assistive-mml, .beeson-pending')) continue;
    const owner = el.closest('h1, h2, p, li, figcaption, .caption, .run, .foot') ?? el;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) words.push({ ...px(r), name: owner.localName + ':' + owner.textContent.trim().slice(0, 16) });
  }
  return { tables: of('table'), figures: of('img, video, .qr, figure, .figure-box'), words };
})()`);
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const round = (b) => [b.left, b.top, b.right - b.left, b.bottom - b.top].map(Math.round);
  const inside = (b) => b.left >= MARGIN - 1 && b.right <= 1920 - MARGIN + 1 && b.top >= -1 && b.bottom <= 1081;
  const wordsUnder = (box, words) => words.filter((l) => meets(box, l)).map((l) => `${l.name} ${Math.round(area(box, l))} px2`);

  async function undone(page, before) {
    assert.notEqual(await render(page), before);
    await undo(page);
    assert.equal(await render(page), before);
  }

  const drawnUnder = (page, box) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect(), k = s.width / slide.offsetWidth;
  const b = ${js(box)};
  let n = 0, all = 0;
  for (const c of slide.querySelectorAll('.backdrop canvas')) {
    const cr = c.getBoundingClientRect();
    if (!cr.width || !c.width) continue;
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const sx = c.width / cr.width, sy = c.height / cr.height;
    for (let y = 0; y < 1080; y += 4) for (let x = 0; x < 1920; x += 4) {
      const px = Math.floor((s.left + x * k - cr.left) * sx), py = Math.floor((s.top + y * k - cr.top) * sy);
      if (px < 0 || py < 0 || px >= c.width || py >= c.height || data[(py * c.width + px) * 4 + 3] <= 20) continue;
      all += 1;
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) n += 1;
    }
  }
  return { n, all };
})()`);

  for (const platform of PLATFORMS) {
    test(`a new table on the figure slide with a backdrop lies off the drawn orbit and the words (${platform})`, async (t) => {
      const page = await load(t, platform, LAYOUTS, 9);
      assert.ok(await page.evaluate(`!!document.querySelector('.reveal section.present.figure > .backdrop canvas')`), 'slide 10 is not the figure slide with a backdrop');
      const before = await render(page);
      await insertTable(page);
      const { tables, words } = await pieces(page);
      assert.equal(tables.length, 1, 'no table was inserted');
      const where = `the table at ${js(round(tables[0]))}`;
      assert.ok(inside(tables[0]), `${where} is not inside the margins`);
      assert.deepEqual(wordsUnder(tables[0], words), [], `${where} lies over words`);
      const d = await drawnUnder(page, tables[0]);
      assert.ok(d.all > 1000, `the backdrop is not drawn: ${js(d)}`);
      assert.equal(d.n, 0, `${where} lies over ${d.n} of ${d.all} sampled drawn pixels of the orbit`);
      await undone(page, before);
      assert.deepEqual(page.errors, []);
    });
  }

  async function two(t, platform, width, height) {
    const page = await load(t, platform, DECK, FIGURES, width, height);
    await insertTable(page);
    await insertTable(page);
    const p = await pieces(page);
    const boxes = [p.tables[0], p.tables[1]].map(round);
    assert.deepEqual(page.errors, []);
    await page.close();
    return { boxes, ...p };
  }

  for (const platform of PLATFORMS) {
    test(`two tables on slide 5 are put at the same places in slide px at three sizes of the window (${platform})`, async (t) => {
      const runs = [];
      for (const [w, h] of [[1280, 800], [1600, 1000], [1920, 1080]]) runs.push({ size: `${w}x${h}`, ...(await two(t, platform, w, h)) });
      for (const r of runs.slice(1)) {
        r.boxes.forEach((b, i) => b.forEach((v, j) => assert.ok(Math.abs(v - runs[0].boxes[i][j]) <= 1, `at ${r.size} the boxes are ${js(r.boxes)}, at ${runs[0].size} ${js(runs[0].boxes)}`)));
      }
      for (const r of runs) {
        const second = r.tables[1];
        assert.deepEqual(wordsUnder(second, r.words.filter((l) => l.name.startsWith('h2:'))), [], `at ${r.size} the second table at ${js(round(second))} lies over the heading`);
        assert.ok(inside(second), `at ${r.size} the second table at ${js(round(second))} is not inside the margins`);
      }
    });
  }

  for (const platform of PLATFORMS) {
    for (const [deck, selector] of [[DECK, '.title'], [DECK, '.closing']]) {
      test(`two new tables on a ${selector.slice(1)} slide leave the words of its block at their place (${platform})`, async (t) => {
        const page = await load(t, platform, deck, selector);
        const before = await render(page);
        const start = (await pieces(page)).words;
        for (let i = 0; i < 2; i++) {
          await insertTable(page);
          const { tables, words } = await pieces(page);
          assert.equal(tables.length, i + 1, 'no table was inserted');
          assert.deepEqual(words.map(round), start.map(round), `after table ${i + 1} the words moved from ${js(start.map((l) => [l.name, ...round(l)]))} to ${js(words.map((l) => [l.name, ...round(l)]))}`);
          const table = tables[i];
          assert.ok(inside(table), `table ${i + 1} at ${js(round(table))} is not inside the margins`);
          assert.deepEqual(wordsUnder(table, words), [], `table ${i + 1} at ${js(round(table))} lies over words`);
          for (const o of tables.slice(0, i)) assert.ok(!meets(table, o), `table ${i + 1} at ${js(round(table))} lies over a table at ${js(round(o))}`);
        }
        await undo(page);
        await undone(page, before);
        assert.deepEqual(page.errors, []);
      });
    }
  }
});

describe('drawn backdrop cells read at any zoom', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
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
  const settle = async (page) => {
    await frames(page);
    await frames(page);
  };
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');

  async function load(t, platform, deck, n, width = 1600, height = 1000) {
    const page = await browser.newPage({ width, height });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    const at = typeof n === 'number' ? n : await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.matches(${js(n)}))`);
    assert.ok(at >= 0, `${deck} does not have a slide ${n}`);
    await page.evaluate(`Reveal.slide(${at})`);
    await settle(page);
    return page;
  }

  const insertTable = async (page) => {
    await exec(page, 'insert.table', { rows: 3, columns: 3 });
    await settle(page);
  };

  const pieces = (page) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const px = (r) => ({ left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k });
  const shown = (e) => e.getClientRects().length && !e.closest('aside.notes, .backdrop');
  const of = (sel) => [...slide.querySelectorAll(sel)].filter(shown).map((e) => px(e.getBoundingClientRect()));
  const words = [];
  const walk = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !shown(el) || el.closest('table, .plot, aside, script, style, mjx-assistive-mml, .beeson-pending')) continue;
    const owner = el.closest('h1, h2, p, li, figcaption, .caption, .run, .foot') ?? el;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) words.push({ ...px(r), name: owner.localName + ':' + owner.textContent.trim().slice(0, 16) });
  }
  return { tables: of('table'), figures: of('img, video, .qr, figure, .figure-box'), words };
})()`);
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const round = (b) => [b.left, b.top, b.right - b.left, b.bottom - b.top].map(Math.round);
  const wordsUnder = (box, words) => words.filter((l) => meets(box, l)).map((l) => `${l.name} ${Math.round(area(box, l))} px2`);

  const drawnUnder = (page, box) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect(), k = s.width / slide.offsetWidth;
  const b = ${js(box)};
  let n = 0, all = 0;
  for (const c of slide.querySelectorAll('.backdrop canvas')) {
    const cr = c.getBoundingClientRect();
    if (!cr.width || !c.width) continue;
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const sx = c.width / cr.width, sy = c.height / cr.height;
    for (let y = 0; y < 1080; y += 4) for (let x = 0; x < 1920; x += 4) {
      const px = Math.floor((s.left + x * k - cr.left) * sx), py = Math.floor((s.top + y * k - cr.top) * sy);
      if (px < 0 || py < 0 || px >= c.width || py >= c.height || data[(py * c.width + px) * 4 + 3] <= 20) continue;
      all += 1;
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) n += 1;
    }
  }
  return { n, all };
})()`);

  const zoom = async (page, z) => {
    await page.evaluate(`window.BeesonEditorShell.stage.setZoom(${js(z)})`);
    await settle(page);
  };

  for (const platform of PLATFORMS) {
    test(`a new table on the figure slide with a backdrop at 200 percent reads a small copy of the canvases, and lies off the drawn orbit (${platform})`, async (t) => {
      const page = await load(t, platform, LAYOUTS, 9);
      await zoom(page, 2);
      await page.evaluate(`(() => {
      const read = CanvasRenderingContext2D.prototype.getImageData;
      window.__reads = [];
      CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h, ...rest) {
        window.__reads.push(w * h);
        return read.call(this, x, y, w, h, ...rest);
      };
    })()`);
      await insertTable(page);
      const reads = await page.evaluate('window.__reads');
      assert.ok(reads.length > 0, 'the canvases of the backdrop were not read');
      assert.ok(Math.max(...reads) <= 960 * 540, `the largest read is ${Math.max(...reads)} px`);
      await zoom(page, null);
      const { tables, words } = await pieces(page);
      assert.equal(tables.length, 1, 'no table was inserted');
      const where = `the table at ${js(round(tables[0]))}`;
      assert.deepEqual(wordsUnder(tables[0], words), [], `${where} lies over words`);
      const d = await drawnUnder(page, tables[0]);
      assert.ok(d.all > 1000, `the backdrop is not drawn: ${js(d)}`);
      assert.equal(d.n, 0, `${where} lies over ${d.n} of ${d.all} sampled drawn pixels of the orbit`);
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('a new table without a free place', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test-deck.html';
  const ROWS = 'test/pages/editor-r26-6.html';
  const HEIGHTS = 'test/pages/editor-r26-6-heights.html';
  const PANEL = '#beeson-edit-panel-format';
  const FIGURES = 4;
  const MARGIN = 120;
  const ROOM = 48;

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
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const title = (page) => page.evaluate(`document.querySelector('.beeson-edit-menubar .state, .beeson-edit-header .state')?.textContent ?? null`);
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const gap = (a, b) => Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
  const round = (b) => [b.left, b.top, b.right - b.left, b.bottom - b.top].map(Math.round);
  const inside = (b) => b.left >= MARGIN - 1 && b.right <= 1920 - MARGIN + 1 && b.top >= -1 && b.bottom <= 1081;

  async function load(t, platform, deck = DECK, n = 0) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    await sleep(150);
    return page;
  }

  const boxes = (page, selector) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  return [...slide.querySelectorAll(${js(selector)})].filter((e) => e.getClientRects().length).map((e) => {
    const r = e.getBoundingClientRect();
    return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k };
  });
})()`);

  for (const platform of PLATFORMS) {
    test(`a new table on a slide without a free place is put at the middle of the slide inside the margins, and a second table beside the first (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, FIGURES);
      const base = await render(page);
      const [figure] = await boxes(page, ':scope > figure.figure-box');
      assert.ok(figure, 'slide 5 does not have a figure in its zone');
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await sleep(300);
      const [table] = await boxes(page, ':scope > table');
      assert.ok(table, 'no table was inserted');
      assert.ok(inside(table), `the table at ${js(round(table))} is not inside the margins of the slide`);
      assert.ok(Math.abs((table.top + table.bottom) / 2 - 540) <= 1, `the table at ${js(round(table))} is not at the middle of the slide`);
      assert.ok(!meets(table, figure), `the table at ${js(round(table))} lies over the figure at ${js(round(figure))}`);
      assert.deepEqual(round(table), [654, 431, 498, 218]);
      assert.match(await title(page), /\d+ texts? (is|are) under a table$/);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await sleep(300);
      const tables = await boxes(page, ':scope > table');
      assert.equal(tables.length, 2);
      assert.ok(inside(tables[1]), `the second table at ${js(round(tables[1]))} is not inside the margins`);
      assert.ok(!meets(tables[1], tables[0]), `the second table at ${js(round(tables[1]))} lies over the first at ${js(round(tables[0]))}`);
      assert.ok(gap(tables[0], tables[1]) >= ROOM - 1, `the second table at ${js(round(tables[1]))} does not keep the room of the bars to the first at ${js(round(tables[0]))}`);
      assert.ok(!meets(tables[1], figure), `the second table at ${js(round(tables[1]))} lies over the figure`);
      const edited = await render(page);
      await undo(page);
      await undo(page);
      assert.equal(await render(page), base);
      await redo(page);
      await redo(page);
      assert.equal(await render(page), edited);
      const { text } = await saveAndReopen(page, `r26-6-tables-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(page.errors, []);
    });
  }

  const heights = (page) => page.evaluate(`(() => {
  const slides = document.querySelector('.reveal .slides');
  const k = slides.getBoundingClientRect().width / slides.offsetWidth;
  const table = Reveal.getCurrentSlide().querySelector('table');
  return { rows: [...table.rows].map((r) => r.getBoundingClientRect().height / k), table: table.getBoundingClientRect().height / k };
})()`);
  const cell = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;
  const near = (a, b, what, tolerance = 1) => assert.ok(Math.abs(a - b) <= tolerance, `${what} is ${a} and not ${b}`);
  const written = (text) => [...text.matchAll(/<tr( style="[^"]*")?>/g)].map((m) => (m[1] ? Number(/height: (\d+)px/.exec(m[1])?.[1] ?? NaN) : null));

  async function roundTrip(page, name) {
    const edited = await render(page);
    assert.notEqual(edited, page.source);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Distribute Rows Evenly');
    await undo(page);
    assert.equal(await render(page), page.source);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
  }

  test('the height of a row is in the scope rule in px', () => {
    assert.equal(declarationProblem('tr', [], 'height', '120px'), null);
    assert.match(declarationProblem('tr', [], 'height', '40%'), /height 40% on a tr/);
    assert.match(declarationProblem('td', [], 'height', '120px'), /height/);
  });

  for (const platform of PLATFORMS) {
    test(`Distribute Rows Evenly of the cell menu gives every row the same height and keeps the height of the table (${platform})`, async (t) => {
      const page = await load(t, platform, HEIGHTS);
      const before = await heights(page);
      await click(page, cell(2, 1));
      await click(page, cell(2, 1), { button: 'right' });
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu.cell')`);
      const labels = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu.cell .item .label')].map((l) => l.textContent)`);
      const i = labels.indexOf('Distribute Rows Evenly');
      assert.ok(i >= 0, `Distribute Rows Evenly is not in the menu: ${labels.join(', ')}`);
      assert.equal(labels[i + 1], 'Distribute Columns Evenly');
      const item = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menu.cell .item')].find((b) => b.querySelector('.label').textContent === 'Distribute Rows Evenly'); const r = b.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
      await click(page, item);
      await sleep(200);
      await frames(page);
      const after = await heights(page);
      const each = before.table / before.rows.length;
      for (const [n, h] of after.rows.entries()) near(h, each, `the row ${n + 1}`, 1.5);
      near(after.table, before.table, 'the table', 2);
      assert.ok(written(await render(page)).every((h) => h !== null), 'a row does not have a written height');
      await roundTrip(page, `r26-6-menu-${platform}.html`);
    });

    test(`Distribute Rows Evenly of the Table pane gives every row the height of the row of two lines (${platform})`, async (t) => {
      const page = await load(t, platform, ROWS);
      if (!(await page.evaluate(`window.BeesonEditor.state('shell.format').checked`))) await exec(page, 'shell.format');
      const before = await heights(page);
      await click(page, cell(1, 0));
      await sleep(150);
      await frames(page);
      const button = await page.evaluate(`(() => { const b = document.querySelector('${PANEL} button[title^="Distribute Rows Evenly"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      assert.ok(button, 'the Table pane does not have Distribute Rows Evenly');
      await click(page, button);
      await sleep(200);
      await frames(page);
      const after = await heights(page);
      const high = Math.max(...before.rows);
      for (const [n, h] of after.rows.entries()) near(h, high, `the row ${n + 1}`, 1.5);
      await roundTrip(page, `r26-6-pane-${platform}.html`);
    });

    test(`Distribute Rows Evenly of Format > Table in a range of two rows keeps the other rows (${platform})`, async (t) => {
      const page = await load(t, platform, HEIGHTS);
      const items = await page.evaluate(`window.BeesonEditorShell.menuItems('Format', 'Table').map((i) => i.command ?? i.label ?? '|')`);
      assert.equal(items[items.indexOf('table.distributeColumns') - 1], 'table.distributeRows', items.join(' '));
      const before = await heights(page);
      const center = (sel) => page.evaluate(`(() => { const r = document.querySelector(${js(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const from = await center(cell(1, 0));
      const to = await center(cell(2, 1));
      await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
      await sleep(150);
      await exec(page, 'table.distributeRows');
      await sleep(200);
      await frames(page);
      const after = await heights(page);
      const each = (before.rows[1] + before.rows[2]) / 2;
      near(after.rows[1], each, 'the row 2', 1.5);
      near(after.rows[2], each, 'the row 3', 1.5);
      near(after.rows[0], before.rows[0], 'the row 1');
      near(after.rows[3], before.rows[3], 'the row 4');
      assert.deepEqual(written(await render(page)).map((h) => h !== null), [false, true, true, false]);
      await roundTrip(page, `r26-6-range-${platform}.html`);
    });
  }
});
