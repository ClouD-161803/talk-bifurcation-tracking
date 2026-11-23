import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { resolve } from 'node:path';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';

describe('layers of new elements and repeated pastes', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r28-1.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const [FAR, NEAR, FROM, TARGET, THIRD] = [0, 1, 2, 3, 4];
  const MOD = { mac: 4, other: 2 };

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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}, ${js(arg ?? null)} ?? undefined)).then(() => true)`);
  const section = (text, title) => [...text.matchAll(/<section>[\s\S]*?<\/section>/g)].map((m) => m[0]).find((s) => s.includes(`<h2>${title}</h2>`));

  async function load(t, platform, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`)).problems, []);
    await page.send('Page.bringToFront');
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await page.evaluate(`Reveal.slide(${slide})`);
    await sleep(150);
    return page;
  }

  async function textBox(page) {
    await click(page, '.beeson-edit-top [data-command="insert.text"]');
    await sleep(300);
    await type(page, 'words');
    await sleep(300);
    await press(page, 'Escape');
    await press(page, 'Escape');
    await sleep(300);
    return page.evaluate(`(() => {
    const sl = document.querySelector('.reveal .slides'), S = sl.getBoundingClientRect(), k = S.width / sl.offsetWidth;
    const e = [...Reveal.getCurrentSlide().querySelectorAll(':scope > p')].find((p) => p.textContent === 'words');
    const r = document.createRange();
    r.selectNodeContents(e);
    const q = r.getBoundingClientRect();
    return { left: Math.round((q.left - S.left) / k), top: Math.round((q.top - S.top) / k), width: Math.round(q.width / k), height: Math.round(q.height / k) };
  })()`);
  }

  const topAt = (page, what) => page.evaluate(`(() => {
  const sl = Reveal.getCurrentSlide();
  const word = [...sl.querySelectorAll(':scope > p')].find((p) => p.textContent === 'words');
  const shape = [...sl.querySelectorAll(':scope > .shape')].at(-1), line = [...sl.querySelectorAll(':scope > svg.line')].at(-1);
  let q;
  if (${js(what)} === 'line') q = line.querySelector(':scope > line, :scope > path').getBoundingClientRect();
  else { const r = document.createRange(); r.selectNodeContents(word); q = r.getBoundingClientRect(); }
  const st = document.createElement('style');
  st.textContent = '.reveal .slides section .shape, .reveal .slides section .shape *, .reveal .slides section svg.line * { pointer-events: auto !important }';
  document.head.append(st);
  const all = document.elementsFromPoint(q.left + q.width / 2, q.top + q.height / 2).filter((x) => sl.contains(x));
  st.remove();
  const at = all.find((x) => word.contains(x) || x.closest('.shape, svg.line'));
  return !at ? 'nothing' : word.contains(at) ? 'word' : at.closest('.shape') === shape ? 'new shape' : at.closest('svg.line') === line ? 'new line' : 'other';
})()`);

  for (const platform of PLATFORMS) {
    test(`1: a text box far from a shape is layered over it, and a rectangle drawn over it is in front (${platform})`, async (t) => {
      const page = await load(t, platform, FAR);
      const b = await textBox(page);
      const typed = await render(page);
      assert.match(section(typed, 'Far'), /\n {2}<p style="[^"]*z-index: \d+[^"]*">words<\/p>\n/, 'the text box is not layered over the older shape');
      await exec(page, 'insert.shape.rectangle', { box: { left: b.left - 20, top: b.top - 20, width: b.width + 40, height: b.height + 40 } });
      await sleep(300);
      const drawn = await render(page);
      assert.equal(await topAt(page, 'word'), 'new shape', 'the new rectangle is drawn under the word');
      await undo(page);
      assert.equal(await render(page), typed, 'the undo does not give the file back');
      await redo(page);
      assert.equal(await render(page), drawn);
      await saveAndReopen(page);
      assert.deepEqual(page.errors, []);
    });

    test(`1: a text box under a shape is layered, and a new shape and a new line are put in front (${platform})`, async (t) => {
      const page = await load(t, platform, NEAR);
      const b = await textBox(page);
      const typed = await render(page);
      assert.match(section(typed, 'Near'), /<p style="position: relative; z-index: 1[^"]*">words<\/p>/, 'the text box under the shape is not put over it');
      assert.equal(await topAt(page, 'word'), 'word');
      await exec(page, 'insert.shape.rectangle', { box: { left: b.left - 20, top: b.top - 20, width: b.width + 40, height: b.height + 40 } });
      await sleep(300);
      const shaped = await render(page);
      assert.equal(await topAt(page, 'word'), 'new shape', 'the new rectangle is drawn under the word');
      assert.equal((await page.evaluate('window.BeesonEditor.state("edit.undo")')).label, 'Undo Insert Shape');
      await undo(page);
      assert.equal(await render(page), typed, 'the undo does not take the layer of the new shape off');
      await redo(page);
      assert.equal(await render(page), shaped);
      assert.equal(await topAt(page, 'word'), 'new shape');
      const y = b.top + b.height / 2;
      await exec(page, 'insert.arrow', { from: { x: b.left - 40, y }, to: { x: b.left + b.width + 40, y } });
      await sleep(300);
      const lined = await render(page);
      assert.equal(await topAt(page, 'line'), 'new line', 'the new arrow is drawn under the words or the shape');
      await undo(page);
      assert.equal(await render(page), shaped, 'the undo does not take the layer of the new line off');
      await redo(page);
      assert.equal(await render(page), lined);
      await saveAndReopen(page);
      assert.equal(await topAt(page, 'line'), 'new line');
      assert.deepEqual(page.errors, []);
    });

    for (const what of ['shape', 'line', 'both']) {
      test(`2: a ${what} pasted again on another slide is put 20 px from the copy before it, by the key and the menu (${platform})`, async (t) => {
        for (const route of ['key', 'menu']) {
          const page = await load(t, platform, FROM);
          const at = (sel) => page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(${js(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          const pick = async () => {
            if (what !== 'line') await click(page, await at('.shape p'));
            if (what !== 'shape') await click(page, await at('svg.line line'), what === 'both' ? { modifiers: 'Shift' } : {});
            await frames(page);
            assert.equal((await page.evaluate('window.BeesonEditor.selection()')).length, what === 'both' ? 2 : 1);
          };
          const key = async (k, code, kc, cmd) => {
            const e = { key: k, code, windowsVirtualKeyCode: kc, modifiers: MOD[platform] };
            await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...e, commands: [cmd] });
            await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...e });
            await sleep(400);
          };
          const menu = async (item) => {
            await click(page, await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((e) => e.textContent.trim() === 'Edit').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
            await sleep(250);
            await click(page, await page.evaluate(`(() => { const e = [...document.querySelectorAll('[role=menu] [role^=menuitem]')].find((x) => x.getClientRects().length && x.textContent.trim().startsWith(${js(item)})); const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`));
            await sleep(400);
          };
          const copy = () => (route === 'key' ? key('c', 'KeyC', 67, 'copy') : menu('Copy'));
          const paste = async () => {
            await (route === 'key' ? key('v', 'KeyV', 86, 'paste') : menu('Paste'));
            await frames(page);
          };
          const go = async (n) => {
            await page.evaluate(`Reveal.slide(${n})`);
            await frames(page);
            await sleep(200);
          };
          const places = () => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll(':scope > .shape, :scope > svg.line')].map((e) => (e.localName === 'svg' ? 'L ' : 'S ') + e.style.translate)`);
          const S = (d) => `S ${1200 + d}px ${300 + d}px`, L = (d) => `L ${1200 + d}px ${700 + d}px`;
          const of = (d) => (what === 'shape' ? [S(d)] : what === 'line' ? [L(d)] : [S(d), L(d)]);
          const why = `${what} by the ${route}`;
          await pick();
          await copy();
          await go(TARGET);
          await paste();
          assert.deepEqual(await places(), of(0), `the first paste on another slide is not at the place of its source, ${why}`);
          const one = await render(page);
          await paste();
          const two = await render(page);
          await paste();
          assert.deepEqual(await places(), [...of(0), ...of(20), ...of(40)], `a later paste covers the copy before it, ${why}`);
          const three = await render(page);
          await undo(page);
          assert.equal(await render(page), two, `the undo of the third paste does not give the file back, ${why}`);
          await undo(page);
          assert.equal(await render(page), one);
          await redo(page);
          await redo(page);
          assert.equal(await render(page), three);
          await go(THIRD);
          await paste();
          await paste();
          assert.deepEqual(await places(), [...of(0), ...of(20)], `the count does not start again on a third slide, ${why}`);
          await undo(page);
          await undo(page);
          await paste();
          assert.deepEqual(await places(), of(0), `the count does not start again after an undo of the first paste, ${why}`);
          await go(FROM);
          await pick();
          await copy();
          await go(TARGET);
          await paste();
          assert.deepEqual(await places(), [...of(0), ...of(20), ...of(40), ...of(0)], `the count does not start again at a new copy, ${why}`);
          await paste();
          assert.deepEqual((await places()).slice(-of(0).length), of(20), why);
          const { text } = await saveAndReopen(page);
          const saved = [...section(text, 'Target').matchAll(/translate: [^;"]+/g)].map((m) => m[0]);
          assert.deepEqual(saved, [0, 20, 40, 0, 20].flatMap(of).map((p) => `translate: ${p.slice(2)}`), `the saved offsets differ, ${why}`);
          assert.deepEqual(page.errors, []);
          await page.close();
        }
      });
    }
  }
});

describe('fast layer commands and new elements in front', () => {
  const SOURCE = readFileSync('test-deck.html', 'utf8');
  const DECK = 'test/pages/editor-r20-11.html';
  const DECK_SOURCE = readFileSync(DECK, 'utf8');
  const slideOf = (text, has) => [...text.matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => has(m[0]));
  const STEPS = slideOf(SOURCE, (s) => s.includes('Show your steps one at a time'));
  const FIGURES = slideOf(SOURCE, (s) => s.includes('Figures are first class citizens'));
  const [UNDER, ROOM, LINED] = [0, 1, 2];
  const PLATFORMS = ['mac', 'other'];
  const KEYS = {
    mac: { front: 'Mod+Shift+F', forward: 'Mod+Alt+Shift+F', backward: 'Mod+Alt+Shift+B', back: 'Mod+Shift+B', group: 'Alt+Mod+G' },
    other: { front: 'Mod+Shift+ArrowUp', forward: 'Mod+ArrowUp', backward: 'Mod+ArrowDown', back: 'Mod+Shift+ArrowDown', group: 'Mod+G' },
  };
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };
  const ROW = '.beeson-edit-objects .row';
  const S = '.reveal section.present';
  const IMG = `${S} figure img.for-light`;

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
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg ? `, ${js(arg)}` : ''})).then(() => true)`);
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName).join(',')`);
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const ms = async (f) => {
    const t0 = performance.now();
    await f();
    return Math.round(performance.now() - t0);
  };

  async function load(t, platform, text, n, file = null, theme = '') {
    if (file) {
      writeFileSync(file, text);
      t.after(() => rmSync(file, { force: true }));
    }
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${file ?? (text === DECK_SOURCE ? DECK : 'test-deck.html')}?edit&still${theme}&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const showList = async (page, platform) => {
    await press(page, LIST_KEY[platform]);
    await frames(page);
  };
  const rowAt = (page, which) => page.evaluate(`(() => {
  const rows = [...document.querySelectorAll(${js(ROW)})];
  const r = (typeof ${js(which)} === 'number' ? rows[${js(which)}] : rows.find((x) => x.querySelector('.name').textContent.startsWith(${js(which)}))).getBoundingClientRect();
  return { x: r.left + 60, y: r.top + r.height / 2 };
})()`);
  const rowNames = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].map((r) => r.querySelector('.name').textContent)`);

  const corners = (page, selectors) => page.evaluate(`${js(selectors)}.map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })`);

  const drawnAt = (page, a, b) => page.evaluate(`(() => {
  const el = document.querySelector(${js(a)});
  const box = document.querySelector(${js(b)}).getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  let at = null;
  for (const r of range.getClientRects()) {
    const x = Math.max(r.left, box.left) + 8, y = r.top + r.height / 2;
    if (!at && r.width > 4 && x < Math.min(r.right, box.right) - 4 && y > box.top + 2 && y < box.bottom - 2) at = { x, y };
  }
  if (!at) return 'no point of the words over the box';
  const style = document.createElement('style');
  style.textContent = '.reveal .slides section .shape { pointer-events: auto !important }';
  document.head.append(style);
  const hit = document.elementFromPoint(at.x, at.y);
  style.remove();
  return hit === el || el.contains(hit) ? 'words' : hit?.closest('.shape') ? 'shape' : hit?.localName ?? 'nothing';
})()`);

  const drawnAtCenter = (page, selector) => page.evaluate(`(() => {
  const r = document.querySelector(${js(selector)}).getBoundingClientRect();
  const style = document.createElement('style');
  style.textContent = '.reveal .slides section .shape { pointer-events: auto !important }';
  document.head.append(style);
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  style.remove();
  return hit?.closest('.shape') ? 'shape' : hit?.closest('.math, .figure-box, p') ? 'new' : hit?.localName ?? 'nothing';
})()`);

  async function dragOntoShape(page, selector) {
    const mid = (s) => page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(s)})].find((e) => !e.hidden && e.getClientRects().length)?.getBoundingClientRect(); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const [from, to] = [await mid(selector), await mid(`${S} > .shape`)];
    const grip = (await mid('.beeson-handle')) ?? from;
    await drag(page, grip, { dx: to.x - from.x, dy: to.y - from.y });
    await frames(page);
    const now = await mid(selector);
    assert.ok(Math.abs(now.x - to.x) < 4 && Math.abs(now.y - to.y) < 4, `the drag did not put the element onto the shape: ${js([from, now, to])}`);
  }

  async function undoAll(page) {
    for (let i = 0; i < 6 && (await render(page)) !== page.source; i++) await undo(page);
    assert.equal(await render(page), page.source);
  }

  function manyChildren(n, m, source = SOURCE, title = 'Many children') {
    const ps = Array.from({ length: n }, (_, i) => `  <p style="font-size: 22px; margin: 0">Paragraph number ${i} of a long slide.</p>`).join('\n');
    const figs = Array.from({ length: m }, (_, i) => `  <div class="figure-box" style="translate: ${-900 + i * 40}px ${-300 + i * 30}px"><img src="demo/figure-dark.png" alt="f${i}"></div>`).join('\n');
    const slide = `<section>\n  <h2>${title}</h2>\n${ps}\n${figs}\n  <div class="foot">A foot.</div>\n</section>\n\n`;
    const text = source.replace('<section class="closing">', `${slide}<section class="closing">`);
    return { text, n: slideOf(text, (s) => s.includes(title)) };
  }

  async function layerTimes(page, platform, n) {
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    const names = await rowNames(page);
    const figs = names.map((r, i) => [r, i]).filter(([r]) => /^(Figure|Image|Picture)/.test(r)).map(([, i]) => i);
    assert.ok(figs.length >= 5, js(names));
    await clickText(page, await rowAt(page, figs[0]));
    await frames(page);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menubar button')].find((x) => x.textContent === 'Arrange'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const menu = await ms(async () => {
      await clickText(page, at);
      await frames(page);
    });
    await page.evaluate('window.BeesonEditorShell.closeMenus()');
    await frames(page);
    const commands = {};
    for (const o of ['back', 'forward', 'front', 'backward']) {
      const base = await render(page);
      commands[o] = await ms(async () => {
        await press(page, KEYS[platform][o]);
        await frames(page);
      });
      if ((await render(page)) !== base) {
        await undo(page);
        await frames(page);
      }
      assert.equal(await render(page), base);
    }
    const shifts = [];
    for (const i of figs.slice(1, 5)) {
      const row = await rowAt(page, i);
      shifts.push(await ms(async () => {
        await click(page, row, { modifiers: 'Shift' });
        await frames(page);
      }));
    }
    assert.equal((await selected(page)).split(',').length, 5);
    const base = await render(page);
    const front = await ms(async () => {
      await press(page, KEYS[platform].front);
      await frames(page);
    });
    assert.notEqual(await render(page), base);
    await undo(page);
    await frames(page);
    assert.equal(await render(page), base);
    return { rows: names.length, menu, command: Math.max(...Object.values(commands)), shift: Math.max(...shifts), front };
  }

  const RATIO = 8;
  const SLACK = 150;

  for (const platform of PLATFORMS) {
    test(`the Arrange menu, a layer command, and a Shift-click run without a pause on a slide with 47 rows (${platform})`, { timeout: 180000 }, async (t) => {
      const few = manyChildren(2, 5, SOURCE, 'Few children');
      const { text, n } = manyChildren(25, 20, few.text);
      const page = await load(t, platform, text, n, `.r20-11-many-${platform}.html`);
      await showList(page, platform);
      const names = await rowNames(page);
      assert.ok(names.filter((r) => !r.startsWith('Backdrop')).length >= 47, `the slide has ${names.length} rows`);
      assert.equal(names.filter((r) => /^(Figure|Image|Picture)/.test(r)).length, 20, js(names));
      await layerTimes(page, platform, few.n);
      const small = await layerTimes(page, platform, few.n);
      const large = await layerTimes(page, platform, n);
      const TIMES = ['menu', 'command', 'shift', 'front'];
      const over = () => TIMES.filter((k) => large[k] >= RATIO * small[k] + SLACK);
      for (let again = 0; again < 2 && over().length; again++) {
        const next = await layerTimes(page, platform, n);
        for (const k of TIMES) large[k] = Math.min(large[k], next[k]);
      }
      t.diagnostic(`with ${small.rows} rows ${js(small)}, with ${large.rows} rows ${js(large)}`);
      for (const k of TIMES) {
        assert.ok(large[k] < RATIO * small[k] + SLACK, `${k} took ${large[k]} ms with ${large.rows} rows, and ${small[k]} ms with ${small.rows} rows`);
      }
      assert.deepEqual(page.errors, []);
    });

    for (const o of ['forward', 'front']) {
      test(`Bring ${o === 'front' ? 'to Front' : 'Forward'} of a caption on a content slide keeps its words in their place (${platform})`, async (t) => {
        const page = await load(t, platform, SOURCE, STEPS);
        await showList(page, platform);
        await clickText(page, await rowAt(page, 'Text: Design the complete'));
        await frames(page);
        await exec(page, 'text.style.caption');
        await frames(page);
        const caption = `${S} > p.caption`;
        const was = await corners(page, [caption, `${S} > ul`]);
        const base = await render(page);
        await press(page, KEYS[platform][o]);
        await frames(page);
        const edited = await render(page);
        assert.notEqual(edited, base, 'the command does not change the file');
        assert.deepEqual(await corners(page, [caption, `${S} > ul`]), was, 'the caption or the list moved');
        assert.match(edited, /<p class="caption" style="[^"]*z-index: \d+[^"]*">Design the complete[\s\S]*?<ul>/, 'the caption is not kept before the list');
        await undo(page);
        assert.equal(await render(page), base);
        await redo(page);
        assert.equal(await render(page), edited);
        assert.deepEqual(page.errors, []);
      });
    }

    test(`a new text box dragged onto a shape is drawn in front of it (${platform})`, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, ROOM);
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(200);
      await type(page, 'Box over the shape');
      await sleep(300);
      assert.match(await render(page), /<p style="[^"]*z-index: \d+[^"]*">Box over the shape<\/p>/, 'the insert does not hold the layer of the text box');
      await press(page, 'Escape');
      await frames(page);
      const box = `${S} > p:nth-of-type(2)`;
      assert.equal(await page.evaluate(`document.querySelector(${js(box)}).textContent`), 'Box over the shape');
      await dragOntoShape(page, box);
      assert.equal(await drawnAtCenter(page, box), 'new');
      await undoAll(page);
      assert.deepEqual(page.errors, []);
    });

    test(`a new formula dragged onto a shape is drawn in front of it, and its undo gives the file back (${platform})`, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, ROOM);
      await exec(page, 'insert.formula');
      await sleep(300);
      await type(page, 'x^2 + y^2 = r^2');
      await sleep(300);
      await clickText(page, { x: 8, y: 500 });
      await sleep(300);
      const inserted = await render(page);
      assert.match(inserted, /<div class="math" style="[^"]*z-index: \d+/, 'the insert does not hold the layer of the formula');
      const math = `${S} > .math`;
      await dragOntoShape(page, `${math} mjx-container`);
      assert.equal(await drawnAtCenter(page, `${math} mjx-container`), 'new');
      await undoAll(page);
      assert.deepEqual(page.errors, []);
    });

    test(`a new figure dragged onto a shape is drawn in front of it (${platform})`, { timeout: 60000 }, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, ROOM);
      await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
      await page.evaluate(`window.__done = window.BeesonEditor.exec('insert.image').then(() => true); 0`);
      await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
      const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
      await page.send('DOM.setFileInputFiles', { files: [resolve('demo/figure-light.png')], objectId: result.objectId });
      await page.waitFor('window.__done', 20000);
      await sleep(300);
      const img = `${S} > .figure-box img`;
      assert.ok(await page.evaluate(`!!document.querySelector(${js(img)})`), 'no figure was inserted');
      assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Insert Image');
      await dragOntoShape(page, img);
      assert.equal(await drawnAtCenter(page, img), 'new');
      await undoAll(page);
      assert.deepEqual(page.errors, []);
    });

    test(`Send to Back of a shape over the words of the text column draws the words over it and keeps the layout (${platform})`, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, UNDER);
      const shape = `${S} > .shape`;
      const els = [`${S} > h2`, `${S} > p`, `${S} > ul`, shape];
      assert.equal(await drawnAt(page, `${S} > p`, shape), 'shape');
      const was = await corners(page, els);
      await showList(page, platform);
      await clickText(page, await rowAt(page, 'Rounded Rectangle'));
      await frames(page);
      await press(page, KEYS[platform].back);
      await frames(page);
      const edited = await render(page);
      assert.notEqual(edited, DECK_SOURCE);
      assert.deepEqual(await corners(page, els), was, 'the layout changed');
      assert.equal(await drawnAt(page, `${S} > p`, shape), 'words');
      assert.equal(await drawnAt(page, `${S} > ul`, shape), 'words');
      await undo(page);
      assert.equal(await render(page), DECK_SOURCE);
      assert.deepEqual(page.errors, []);
    });

    test(`Reset Slide leaves the place of a line (${platform})`, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, LINED);
      const line = `${S} > svg.line`;
      const was = await corners(page, [line]);
      await exec(page, 'slide.reset');
      await frames(page);
      const edited = await render(page);
      assert.match(edited, /<p>A moved paragraph\.<\/p>/, 'Reset Slide does not take the translate off the paragraph');
      assert.match(edited, /<svg class="line" width="400" height="1" style="translate: 700px 600px">/);
      assert.deepEqual(await corners(page, [line]), was, 'the line moved');
      await undo(page);
      assert.equal(await render(page), DECK_SOURCE);
      assert.deepEqual(page.errors, []);
    });
  }

  const PANEL = '#beeson-edit-panel-format';
  async function typeField(page, id, value) {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === 'Arrange')?.click()`);
    await frames(page);
    await page.evaluate(`(() => { const i = document.querySelector('#beeson-edit-num-${id}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
    await frames(page);
  }

  async function dragRotor(page, deg) {
    const o = await page.evaluate(`(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const shown = (el) => !el.hidden && el.getClientRects().length > 0;
    return { c: mid([...document.querySelectorAll('.beeson-frame.union, .beeson-frame.selected')].find(shown)), r: mid([...document.querySelectorAll('.beeson-rotor')].find(shown)) };
  })()`);
    const radius = Math.hypot(o.r.x - o.c.x, o.r.y - o.c.y), from = Math.atan2(o.r.y - o.c.y, o.r.x - o.c.x);
    await mouse(page, 'mouseMoved', o.r.x, o.r.y);
    await mouse(page, 'mousePressed', o.r.x, o.r.y, { button: 'left', buttons: 1, clickCount: 1 });
    let at = o.r;
    for (let i = 1; i <= 10; i++) {
      const a = from + ((deg * Math.PI) / 180) * (i / 10);
      at = { x: o.c.x + radius * Math.cos(a), y: o.c.y + radius * Math.sin(a) };
      await mouse(page, 'mouseMoved', at.x, at.y, { button: 'left', buttons: 1 });
    }
    await frames(page);
    await mouse(page, 'mouseReleased', at.x, at.y, { button: 'left', buttons: 0, clickCount: 1 });
    await frames(page);
  }

  async function groupOnFigures(page, platform, own) {
    await clickText(page, IMG);
    if (own) {
      await typeField(page, 'angle', 20);
      await clickText(page, IMG);
    }
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, KEYS[platform].group);
    await frames(page);
  }

  async function reselect(page) {
    await clickText(page, { x: 8, y: 500 });
    await frames(page);
    await clickText(page, IMG);
    await frames(page);
  }

  async function step(page, s) {
    if (s.startsWith('f')) await typeField(page, 'angle', Number(s.slice(1)));
    else if (s.startsWith('h')) await dragRotor(page, Number(s.slice(1)));
    else if (s === 'nudge') {
      await reselect(page);
      await press(page, 'ArrowRight');
      await frames(page);
    }
  }

  const RUNS = [
    [true, ['f30', 'f75', 'f140']],
    [true, ['f30', 'f75', 'f140', 'f200', 'f260']],
    [true, ['h40', 'f110', 'h-30']],
    [false, ['f30', 'f75', 'f140', 'f200', 'f260']],
    [false, ['f30', 'nudge', 'f75']],
    [true, ['f30', 'nudge', 'f75', 'f140']],
  ];
  for (const platform of PLATFORMS) {
    for (const [own, steps] of RUNS) {
      test(`Reset Rotation of a group${own ? ' with a member turned by itself' : ''} after ${steps.join(' ')} gives the file back (${platform})`, { timeout: 60000 }, async (t) => {
        const page = await load(t, platform, SOURCE, FIGURES, null, '&theme=light');
        await groupOnFigures(page, platform, own);
        assert.match(await render(page), /data-group="g1"/);
        const nudges = steps.filter((s) => s === 'nudge');
        for (const s of nudges) await step(page, s);
        const expected = await render(page);
        for (let i = 0; i < nudges.length; i++) await undo(page);
        await reselect(page);
        for (const s of steps) await step(page, s);
        await exec(page, 'arrange.resetRotation');
        await frames(page);
        assert.equal(await render(page), expected);
        assert.deepEqual(page.errors, []);
      });
    }

    test(`a move drag cancelled by Esc does not change what Reset Rotation gives back after a nudge (${platform})`, { timeout: 60000 }, async (t) => {
      const results = [];
      for (const cancel of [false, true]) {
        const page = await load(t, platform, SOURCE, FIGURES, null, '&theme=light');
        await clickText(page, IMG);
        await typeField(page, 'angle', 30);
        await press(page, 'Escape');
        await frames(page);
        assert.equal(await selected(page), 'figure');
        await press(page, 'ArrowRight');
        await frames(page);
        const nudged = await render(page);
        if (cancel) {
          const c = await page.evaluate(`(() => { const r = document.querySelector(${js(IMG)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          await drag(page, c, { dx: 60, dy: 0, hold: true });
          await press(page, 'Escape');
          await mouse(page, 'mouseReleased', c.x + 60, c.y, { button: 'left', buttons: 0, clickCount: 1 });
          await frames(page);
          assert.equal(await render(page), nudged, 'the cancelled drag changed the file');
        }
        await exec(page, 'arrange.resetRotation');
        await frames(page);
        results.push(await render(page));
        assert.deepEqual(page.errors, []);
        await page.close();
      }
      assert.match(results[0], /<figure class="figure-box" style="translate: [^"]+">/);
      assert.equal(results[1], results[0]);
    });

    test(`Esc during a drag of a line end or of a line keeps the selection of the press (${platform})`, async (t) => {
      const page = await load(t, platform, SOURCE, FIGURES, null, '&theme=light');
      await exec(page, 'insert.line', { from: { x: 200, y: 900 }, to: { x: 700, y: 950 } });
      await frames(page);
      const base = await render(page);
      assert.equal(await selected(page), 'svg');
      const held = async (from, dx, dy) => {
        await drag(page, from, { dx, dy, hold: true });
        await press(page, 'Escape');
        await frames(page);
        const afterEsc = await selected(page);
        await mouse(page, 'mouseReleased', from.x + dx, from.y + dy, { button: 'left', buttons: 0, clickCount: 1 });
        await frames(page);
        return [afterEsc, await selected(page)];
      };
      const end = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-line-end')].find((x) => x.getClientRects().length && x.dataset.end === '2'); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      assert.deepEqual(await held(end, 80, -60), ['svg', 'svg'], 'the selection after Esc in a drag of the line end');
      assert.equal(await render(page), base);
      await clickText(page, IMG);
      await frames(page);
      const mid = await page.evaluate(`(() => { const r = document.querySelector('${S} svg.line line').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await click(page, mid, { modifiers: 'Shift' });
      await frames(page);
      const both = await selected(page);
      assert.equal(both.split(',').length, 2);
      assert.deepEqual(await held(mid, 50, -40), [both, both], 'the selection after Esc in a drag of the line with the figure');
      assert.equal(await render(page), base);
      assert.deepEqual(page.errors, []);
    });
  }
});
