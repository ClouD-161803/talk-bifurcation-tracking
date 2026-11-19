import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, drag, openFormula, press, saveAndReopen, selectFigure, selectPicture, type } from './helpers/editor.mjs';

describe('the element changed by an undo is selected', () => {
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
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  let saves = 0;

  const SLIDE = '.reveal .slides section.present';
  const IMG = `${SLIDE} figure.figure-box img.for-dark`;
  const PARA = `${SLIDE} > p`;

  async function load(t, platform, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/test-deck.html?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync('test-deck.html', 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  const selected = (page) => page.evaluate(`(() => {
  const el = document.activeElement;
  const caret = el && el.closest('.reveal .slides') && el.isContentEditable ? el.localName : null;
  return { els: window.BeesonEditor.selection().map((e) => e.localName + (e.classList.contains('figure-box') ? '.figure-box' : '')), caret };
})()`);

  const caretOffset = (page) => page.evaluate(`(() => {
  const el = document.activeElement;
  const s = getSelection();
  if (!el || !s.rangeCount || !el.contains(s.anchorNode)) return null;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(s.anchorNode, s.anchorOffset);
  return r.toString().length;
})()`);

  const FIGURE_CHANGES = {
    Lock: { act: (page) => press(page, 'Mod+L') },
    Unlock: {
      setup: async (page) => {
        await press(page, 'Mod+L');
        await wait(page);
      },
      act: (page, platform) => press(page, platform === 'mac' ? 'Mod+Alt+L' : 'Mod+Shift+L'),
    },
    move: { act: (page) => press(page, 'ArrowRight') },
    resize: {
      act: async (page) => {
        const at = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-grip[data-handle="se"]')].find((g) => g.getClientRects().length && !g.hidden); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await drag(page, at, { dx: -60, dy: -40 });
      },
    },
  };

  for (const platform of PLATFORMS) {
    for (const [name, change] of Object.entries(FIGURE_CHANGES)) {
      test(`after an undo and a redo of ${name} on a figure that was deselected, the figure is selected (${platform})`, async (t) => {
        const page = await load(t, platform, 4);
        await clickText(page, await center(page, IMG));
        await wait(page);
        await change.setup?.(page);
        const start = await render(page);
        await change.act(page, platform);
        await wait(page, 1100);
        const changed = await render(page);
        assert.notEqual(changed, start, `${name} does not change the file`);
        await press(page, 'Escape');
        await wait(page);
        assert.deepEqual((await selected(page)).els, [], 'Esc does not deselect the figure');
        await press(page, 'Mod+Z');
        await wait(page);
        assert.equal(await render(page), start, 'the undo does not give back the file');
        assert.deepEqual(await selected(page), { els: ['figure.figure-box'], caret: null }, 'the figure is not selected after the undo');
        await press(page, 'Escape');
        await wait(page);
        await press(page, 'Mod+Shift+Z');
        await wait(page);
        assert.equal(await render(page), changed, 'the redo does not give back the change');
        assert.deepEqual(await selected(page), { els: ['figure.figure-box'], caret: null }, 'the figure is not selected after the redo');
        const { text } = await saveAndReopen(page, `r15-6-${++saves}.html`);
        assert.equal(text, changed);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`after an undo and a redo of Lock, a figure that stayed selected is still selected (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await clickText(page, await center(page, IMG));
      await press(page, 'Mod+L');
      await wait(page);
      await press(page, 'Mod+Z');
      await wait(page);
      await byteExact(page);
      assert.deepEqual(await selected(page), { els: ['figure.figure-box'], caret: null });
      await press(page, 'Mod+Shift+Z');
      await wait(page);
      assert.deepEqual(await selected(page), { els: ['figure.figure-box'], caret: null });
      assert.deepEqual(errors(page), []);
    });

    test(`an undo and a redo of typing keep the caret in the text where it was (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await clickText(page, await center(page, PARA));
      await press(page, 'End');
      await type(page, ' XY');
      await wait(page);
      const typed = await render(page);
      const end = (await caretOffset(page)) - 3;
      await press(page, 'Mod+Z');
      await wait(page);
      await byteExact(page);
      assert.deepEqual(await selected(page), { els: [], caret: 'p' }, 'the caret is not kept in the paragraph after the undo');
      assert.equal(await caretOffset(page), end);
      await press(page, 'Mod+Shift+Z');
      await wait(page);
      assert.equal(await render(page), typed);
      assert.deepEqual(await selected(page), { els: [], caret: 'p' }, 'the caret is not kept in the paragraph after the redo');
      assert.equal(await caretOffset(page), end + 3);
      const { text } = await saveAndReopen(page, `r15-6-${++saves}.html`);
      assert.equal(text, typed);
      assert.deepEqual(errors(page), []);
    });

    test(`an undo and a redo of typing in a paragraph left with Esc select the paragraph as a block (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await clickText(page, await center(page, PARA));
      await press(page, 'End');
      await type(page, ' XY');
      await wait(page);
      const typed = await render(page);
      await press(page, 'Escape');
      await wait(page);
      assert.deepEqual(await selected(page), { els: ['p'], caret: null });
      await press(page, 'Mod+Z');
      await wait(page);
      await byteExact(page);
      assert.deepEqual(await selected(page), { els: ['p'], caret: null }, 'the paragraph is not selected as a block after the undo');
      await press(page, 'Mod+Shift+Z');
      await wait(page);
      assert.equal(await render(page), typed);
      assert.deepEqual(await selected(page), { els: ['p'], caret: null }, 'the paragraph is not selected as a block after the redo');
      assert.deepEqual(errors(page), []);
    });

    test(`an undo of typing with a figure selected selects the paragraph that it changes (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await clickText(page, await center(page, PARA));
      await press(page, 'End');
      await type(page, ' XY');
      await wait(page);
      await clickText(page, await center(page, IMG));
      await wait(page);
      assert.deepEqual(await selected(page), { els: ['figure.figure-box'], caret: null });
      await press(page, 'Mod+Z');
      await wait(page);
      await byteExact(page);
      assert.deepEqual(await selected(page), { els: ['p'], caret: null });
      assert.deepEqual(errors(page), []);
    });

    test(`an undo and a redo of a color from the Format pane select the paragraph as a block (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await clickText(page, await center(page, PARA));
      await press(page, 'Escape');
      await wait(page);
      if (!(await state(page, 'shell.format')).checked) await page.evaluate(`window.BeesonEditor.exec('shell.format')`);
      await wait(page);
      const swatch = '.beeson-edit-inspector [data-command="text.tone.accent"]';
      await page.waitFor(`(() => { const b = document.querySelector(${js(swatch)}); return !!b && !b.disabled && b.getClientRects().length > 0; })()`);
      await clickText(page, await center(page, swatch));
      await wait(page);
      const toned = await render(page);
      assert.notEqual(toned, page.source, 'the swatch does not color the paragraph');
      await press(page, 'Escape');
      await wait(page);
      await press(page, 'Mod+Z');
      await wait(page);
      await byteExact(page);
      assert.deepEqual(await selected(page), { els: ['p'], caret: null }, 'the paragraph is not selected as a block after the undo');
      await press(page, 'Escape');
      await press(page, 'Mod+Shift+Z');
      await wait(page);
      assert.equal(await render(page), toned);
      assert.deepEqual(await selected(page), { els: ['p'], caret: null }, 'the paragraph is not selected as a block after the redo');
      const { text } = await saveAndReopen(page, `r15-6-${++saves}.html`);
      assert.equal(text, toned);
      assert.deepEqual(errors(page), []);
    });
  }

  async function button(page, id) {
    await clickText(page, await page.evaluate(`(() => {
    const r = document.querySelector('[data-command=${js(id)}]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await wait(page);
  }

  for (const platform of PLATFORMS) {
    test(`Undo of the toolbar keeps the caret in a text of the slide (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await clickText(page, await center(page, PARA));
      await press(page, 'End');
      await type(page, ' XY');
      await wait(page);
      await button(page, 'edit.undo');
      await byteExact(page);
      assert.deepEqual(await selected(page), { els: [], caret: 'p' });
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('the selection after an undo frames another element', () => {
  const PLATFORMS = ['mac', 'other'];
  const FIGURES = 4;
  const POTENTIAL = 3;

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
  const wait = (page, ms = 150) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undoLabel = (page) => state(page, 'edit.undo').then((s) => s.label);
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const count = (page, selector) => page.evaluate(`Reveal.getCurrentSlide().querySelectorAll(${js(selector)}).length`);

  async function load(t, platform, n, deck = 'test-deck.html') {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await wait(page, 300);
    return page;
  }

  const focus = (page) => page.evaluate(`(() => {
  const a = document.activeElement, s = getSelection();
  return {
    focus: a === document.body ? 'body' : a.tagName.toLowerCase(),
    caret: !!(s.rangeCount && a.isContentEditable && a.closest('.reveal') && a.contains(s.anchorNode)),
    selected: window.BeesonEditor.selection().map((el) => el.tagName.toLowerCase()),
  };
})()`);

  async function caret(page) {
    const at = await page.evaluate(`(() => {
    const el = Reveal.getCurrentSlide().querySelector(':scope > p');
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = w.nextNode(); node; node = w.nextNode()) {
      const i = node.textContent.indexOf('matplotlib');
      if (i < 0) continue;
      const r = document.createRange(); r.setStart(node, i + 4); r.setEnd(node, i + 5);
      const b = r.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2 };
    }
    return null;
  })()`);
    await clickText(page, at);
    await wait(page);
    assert.equal((await focus(page)).caret, true, 'the click does not put the caret into the paragraph');
  }

  const IMAGE = `[...Reveal.getCurrentSlide().querySelectorAll('figure img')].find((i) => i.getClientRects().length)`;

  for (const platform of PLATFORMS) {
    test(`an undo or a redo that frames a figure takes the caret off the paragraph (${platform})`, async (t) => {
      for (const how of ['undo', 'redo']) {
        const page = await load(t, platform, FIGURES);
        await clickText(page, await rect(page, IMAGE));
        await press(page, 'ArrowRight');
        await wait(page);
        assert.equal(await undoLabel(page), 'Undo Move');
        const moved = await render(page);
        if (how === 'redo') await press(page, 'Mod+Z');
        await wait(page);
        await caret(page);
        await press(page, how === 'undo' ? 'Mod+Z' : 'Mod+Shift+Z');
        await wait(page);
        const text = await render(page);
        assert.equal(text, how === 'undo' ? page.source : moved);
        assert.deepEqual(await focus(page), { focus: 'body', caret: false, selected: ['figure'] }, `the ${how} leaves a caret beside the framed figure`);
        await press(page, 'q');
        await wait(page);
        assert.equal(await render(page), text, `q after the ${how} is typed`);
        await press(page, 'Mod+D');
        await wait(page);
        assert.equal(await count(page, 'figure'), 2, `Mod+D after the ${how} does not duplicate the figure`);
        assert.equal(await undoLabel(page), 'Undo Duplicate');
        await press(page, 'Mod+Z');
        await wait(page);
        assert.equal(await render(page), text);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });

    test(`Mod+D on a row of the Object List duplicates its object (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await exec(page, 'view.objects');
      await wait(page, 300);
      await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-objects .row')].filter((e) => e.getClientRects().length).find((e) => /zero-velocity/i.test(e.textContent))`));
      await wait(page);
      assert.equal(await page.evaluate(`!!document.activeElement.closest('.beeson-edit-objects')`), true, 'the row does not have the focus');
      await press(page, 'Mod+D');
      await wait(page, 300);
      assert.equal(await count(page, 'figure'), 2, 'Mod+D on the row does not duplicate the figure');
      assert.equal(await undoLabel(page), 'Undo Duplicate');
      const copied = await render(page);
      await page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
      assert.equal(await render(page), page.source);
      await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
      assert.equal(await render(page), copied);
      const { text } = await saveAndReopen(page, `r18-4-objects-${platform}.html`);
      assert.equal(text, copied);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`an undo or a redo of the TeX of an inline formula keeps its paragraph framed (${platform})`, async (t) => {
      for (const how of ['undo', 'redo']) {
        const page = await load(t, platform, POTENTIAL);
        await openFormula(page, '.reveal section.present p mjx-container');
        await wait(page, 300);
        assert.equal(await page.evaluate(`(() => { const f = document.querySelector('.beeson-math textarea'); if (!f) return false; f.focus(); f.setSelectionRange(f.value.length, f.value.length); return true; })()`), true, 'Enter does not open the TeX of the formula');
        await type(page, ' + 1');
        await press(page, 'Mod+Enter');
        await wait(page, 600);
        assert.equal(await undoLabel(page), 'Undo Formula');
        const applied = await render(page);
        const framed = await focus(page);
        assert.deepEqual(framed.selected, ['p']);
        await press(page, 'Mod+Z');
        await wait(page, 400);
        if (how === 'redo') {
          await press(page, 'Mod+Shift+Z');
          await wait(page, 400);
        }
        const text = await render(page);
        assert.equal(text, how === 'undo' ? page.source : applied);
        const now = await focus(page);
        assert.deepEqual(now.selected, ['p'], `the ${how} does not frame the paragraph`);
        assert.equal(now.caret, false, `the ${how} leaves a caret in the paragraph`);
        await press(page, 'q');
        await wait(page);
        assert.equal(await render(page), text, `q after the ${how} is typed into the paragraph`);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });

    test(`an undo of Hide Slide with the caret in a paragraph keeps the text as the selection (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await caret(page);
      assert.equal((await state(page, 'zoom.selection')).enabled, true);
      await press(page, platform === 'mac' ? 'Mod+Shift+H' : 'Ctrl+Shift+H');
      await wait(page);
      assert.equal(await undoLabel(page), 'Undo Hide Slide');
      await press(page, 'Mod+Z');
      await wait(page, 300);
      assert.equal(await render(page), page.source);
      assert.equal((await focus(page)).caret, true, 'the undo takes the caret off');
      assert.equal((await state(page, 'zoom.selection')).enabled, true, 'the undo empties the selection while the caret stays');
      await press(page, 'Mod+D');
      await wait(page, 300);
      assert.equal(await count(page, ':scope > p'), 2, 'Mod+D does not duplicate the paragraph of the caret');
      assert.equal(await undoLabel(page), 'Undo Duplicate');
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('undo of a resize, move, or turn', () => {
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const PLATFORMS = ['mac', 'other'];
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const MULTI = 'test/pages/editor-multi.html';
  const SECTIONS = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].map((m) => m[0]);
  const MATH = SECTIONS.findIndex((s) => s.includes('<h2>Math, an ordered list, and a zone</h2>'));
  const FIGURE_BOX_IMG = '.reveal section.present .figure-box > img';
  const FIG = '.reveal section.present figure.figure-box';
  const SHOTS = process.env.R64_SHOTS ?? null;

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

  async function editor(platform, { deck = LAYOUTS, n = MATH, keep = false, close = true, mode = 'dark' } = {}) {
    if (close) await last?.close().catch(() => {});
    const page = await browser.newPage();
    last = page;
    await page.send('Page.bringToFront');
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    if (!keep) {
      await page.evaluate('localStorage.clear()');
      await page.goto(url);
    }
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    await page.evaluate(`document.documentElement.dataset.theme = '${mode}'`);
    page.source = readFileSync(deck, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const near = (a, b, by = 2) => Math.abs(a - b) <= by;

  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => [el.localName, ...el.classList].filter((c) => !c.startsWith('beeson-') && c !== 'visible' && c !== 'current-fragment').join('.'))`);
  const drawn = (page) => page.evaluate(`(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), union: el.classList.contains('union') }; };
  const shown = (el) => !el.hidden && getComputedStyle(el).display !== 'none';
  return {
    frames: [...document.querySelectorAll('.beeson-overlay .beeson-frame.selected, .beeson-overlay .beeson-frame.union')].filter(shown).map(box),
    grips: [...document.querySelectorAll('.beeson-overlay .beeson-grip')].filter(shown).length,
  };
})()`);
  const boxOf = (page, selector) => page.evaluate(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width);
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`);
  const gripAt = (page, handle, group = false) => page.evaluate(`(() => {
  const g = [...document.querySelectorAll('.beeson-grip${group ? '[data-group]' : ''}[data-handle="${handle}"]')].find((g) => !g.hidden);
  const r = g.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
  const readout = (page) => page.evaluate(`(() => { const o = document.querySelector('.beeson-offset:not(.beeson-guide-readout)'); return o && !o.hidden ? o.textContent : null; })()`);
  const release = (page, at) => page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });

  async function framedOnce(page, ref, what) {
    const d = await drawn(page);
    assert.ok(!d.frames.some((f) => f.left <= 1 && f.top <= 1), `${what}: a frame is drawn at the corner of the window: ${JSON.stringify(d.frames)}`);
    assert.equal(d.frames.length, 1, `${what}: ${d.frames.length} frames are drawn: ${JSON.stringify(d.frames)}`);
    const [f, b] = [d.frames[0], ref.frames[0]];
    assert.ok(near(f.left, b.left) && near(f.top, b.top) && near(f.width, b.width) && near(f.height, b.height), `${what}: the frame ${JSON.stringify(f)} is not at ${JSON.stringify(b)}`);
    return d;
  }

  async function shot(page, name) {
    if (!SHOTS) return;
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  }

  for (const platform of PLATFORMS) {
    test(`${platform}: an undo and a redo of a resize of an image select the image alone`, async () => {
      for (const mode of ['dark', 'light']) {
        const page = await editor(platform, { mode });
        await selectPicture(page, FIGURE_BOX_IMG);
        await frames(page);
        assert.deepEqual(await selected(page), [`img.for-${mode}`], 'a second click on the image of a figure does not select the image');
        const ref = await drawn(page);
        await drag(page, await gripAt(page, 'se'), { dx: -60, dy: -40 });
        await frames(page);
        const resized = await render(page);
        assert.notEqual(resized, page.source, 'the resize is not written');
        await undo(page);
        await frames(page);
        assert.deepEqual(await selected(page), [`img.for-${mode}`], 'the undo does not select the image alone');
        await framedOnce(page, ref, 'after the undo');
        await shot(page, `undo-resize-image-${mode}-${platform}`);
        await byteExact(page);
        await redo(page);
        await frames(page);
        assert.deepEqual(await selected(page), [`img.for-${mode}`], 'the redo does not select the image alone');
        const d = await drawn(page);
        assert.equal(d.frames.length, 1, `after the redo, ${d.frames.length} frames are drawn: ${JSON.stringify(d.frames)}`);
        assert.ok(!d.frames.some((f) => f.left <= 1 && f.top <= 1), `after the redo, a frame is drawn at the corner of the window`);
        assert.equal(await render(page), resized, 'the redo does not write the resize again');
        await saveAndReopen(page);
        assert.deepEqual(errors(page), []);
      }
    });

    test(`${platform}: an undo and a redo of a resize, a move, and a rotation of a figure select the figure`, async () => {
      const page = await editor(platform);
      await selectFigure(page, FIGURE_BOX_IMG);
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box.fragment'], 'Esc does not select the figure');
      const ref = await drawn(page);
      await drag(page, await gripAt(page, 'se'), { dx: -60, dy: -40 });
      await frames(page);
      const resized = await render(page);
      for (const [step, what] of [[undo, 'undo'], [redo, 'redo']]) {
        await step(page);
        await frames(page);
        assert.deepEqual(await selected(page), ['figure.figure-box.fragment'], `the ${what} of the resize does not select the figure`);
        const d = await drawn(page);
        assert.equal(d.frames.length, 1, `after the ${what} of the resize, ${d.frames.length} frames are drawn: ${JSON.stringify(d.frames)}`);
        assert.ok(!d.frames.some((f) => f.left <= 1 && f.top <= 1), `after the ${what} of the resize, a frame is drawn at the corner of the window`);
        assert.equal(d.grips, ref.grips, `the figure is not drawn with its ${ref.grips} grips after the ${what}`);
        if (what === 'undo') await framedOnce(page, ref, 'after the undo of the resize');
        if (what === 'undo') {
          await shot(page, `undo-resize-figure-dark-${platform}`);
          await byteExact(page);
        } else assert.equal(await render(page), resized);
      }
      await undo(page);
      const img = await boxOf(page, FIGURE_BOX_IMG);
      await drag(page, { x: img.left + img.width / 2, y: img.top + img.height / 2 }, { dx: -80, dy: 30 });
      await frames(page);
      assert.match(await render(page), /<figure class="figure-box fragment" data-fragment-index="2" style="translate: -?\d+px -?\d+px">/);
      for (const [step, what] of [[undo, 'undo'], [redo, 'redo']]) {
        await step(page);
        await frames(page);
        assert.deepEqual(await selected(page), ['figure.figure-box.fragment'], `the ${what} of the move does not select the figure`);
        const d = await drawn(page);
        assert.equal(d.frames.length, 1, `after the ${what} of the move, ${d.frames.length} frames are drawn`);
        if (what === 'undo') await framedOnce(page, ref, 'after the undo of the move');
      }
      await undo(page);
      await byteExact(page);
      const rotor = await boxOf(page, '.beeson-rotor');
      const fig = await boxOf(page, FIG);
      await drag(page, { x: rotor.left + rotor.width / 2, y: rotor.top + rotor.height / 2 }, { dx: fig.width / 2, dy: fig.height / 3 });
      await frames(page);
      assert.match(await render(page), /rotate: \d+deg/, 'the rotation is not written');
      for (const [step, what] of [[undo, 'undo'], [redo, 'redo']]) {
        await step(page);
        await frames(page);
        assert.deepEqual(await selected(page), ['figure.figure-box.fragment'], `the ${what} of the rotation does not select the figure`);
        const d = await drawn(page);
        assert.equal(d.frames.length, 1, `after the ${what} of the rotation, ${d.frames.length} frames are drawn`);
      }
      await undo(page);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: an undo and a redo of a resize of a group select the group`, async () => {
      const page = await editor(platform, { deck: MULTI, n: 0 });
      await selectFigure(page, FIGURE_BOX_IMG);
      await click(page, '.reveal section.present .qr', { modifiers: 'Shift' });
      await frames(page);
      await exec(page, 'arrange.group');
      await frames(page);
      const group = ['div.qr', 'figure.figure-box'];
      assert.deepEqual((await selected(page)).sort(), group, 'the group is not selected');
      const grouped = await render(page);
      const before = await drawn(page);
      await drag(page, await gripAt(page, 'se', true), { dx: -60, dy: -40 });
      await frames(page);
      const resized = await render(page);
      assert.notEqual(resized, grouped, 'the resize of the group is not written');
      for (const [step, what] of [[undo, 'undo'], [redo, 'redo']]) {
        await step(page);
        await frames(page);
        assert.deepEqual((await selected(page)).sort(), group, `the ${what} does not select the group`);
        const d = await drawn(page);
        assert.ok(!d.frames.some((f) => f.left <= 1 && f.top <= 1), `after the ${what}, a frame is drawn at the corner of the window: ${JSON.stringify(d.frames)}`);
        assert.equal(d.frames.length, before.frames.length, `after the ${what}, ${d.frames.length} frames are drawn and not ${before.frames.length}: ${JSON.stringify(d.frames)}`);
        assert.equal(d.grips, before.grips, `after the ${what}, ${d.grips} grips are drawn and not ${before.grips}`);
        if (what === 'undo') assert.equal(await render(page), grouped);
      }
      assert.equal(await render(page), resized, 'the redo does not write the resize again');
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: the readout of a move gives the upper left corner of the element in slide px, and the readout of a resize its size`, async () => {
      for (const mode of ['dark', 'light']) {
        const page = await editor(platform, { mode });
        await selectFigure(page, FIGURE_BOX_IMG);
        const img = await boxOf(page, FIGURE_BOX_IMG);
        const from = { x: img.left + img.width / 2, y: img.top + img.height / 2 };
        await drag(page, from, { dx: -70, dy: 45, hold: true });
        await frames(page);
        const text = await readout(page);
        const corner = await page.evaluate(`(() => {
        const s = document.querySelector('.reveal .slides');
        const r = s.getBoundingClientRect();
        const scale = r.width / s.offsetWidth;
        const f = document.querySelector('.beeson-overlay > .beeson-frame.selected:not([hidden])').getBoundingClientRect();
        return { x: Math.round((f.left + 8 - r.left) / scale), y: Math.round((f.top + 8 - r.top) / scale) };
      })()`);
        const m = /^x: (-?\d+) px\s+y: (-?\d+) px$/.exec(text ?? '');
        assert.ok(m, `the readout ${text} does not give x and y`);
        assert.ok(near(Number(m[1]), corner.x, 1) && near(Number(m[2]), corner.y, 1), `the readout ${text} is not the upper left corner ${corner.x}, ${corner.y} of the figure`);
        await shot(page, `move-readout-${mode}-${platform}`);
        await release(page, { x: from.x - 70, y: from.y + 45 });
        await frames(page);
        await undo(page);
        await byteExact(page);
        const se = await gripAt(page, 'se');
        await drag(page, se, { dx: -60, dy: -40, hold: true });
        await frames(page);
        assert.match((await readout(page)) ?? '', /^w: \d+ px {2}h: \d+ px$/, 'the readout of a resize does not give the size');
        await shot(page, `resize-readout-${mode}-${platform}`);
        await release(page, { x: se.x - 60, y: se.y - 40 });
        await frames(page);
        await undo(page);
        await byteExact(page);
        assert.deepEqual(errors(page), []);
      }
    });

    test(`${platform}: a page that has not changed its guides does not write the guides it read at its start over those of a newer session`, async () => {
      const key = `beeson-edit-guides:/${LAYOUTS}`;
      const stored = async (page) => (await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}) ?? '[]')`))[MATH] ?? { x: [], y: [] };
      const older = await editor(platform);
      const count = await older.evaluate(`document.querySelectorAll('.reveal .slides > section').length`);
      const legacy = Array.from({ length: count }, (_, i) => ({ x: i === MATH ? [640] : [], y: [] }));
      await older.evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(legacy))})`);
      await older.evaluate(`localStorage.setItem('beeson-edit-rulers', '1')`);
      const first = await editor(platform, { keep: true });
      const newer = await editor(platform, { keep: true, close: false });
      await exec(newer, 'view.guides.add', { y: [300] });
      await frames(newer);
      assert.ok((await render(newer)).includes('data-guides="x640 y300"'));
      assert.deepEqual(await stored(newer), { x: [], y: [] });
      await first.send('Page.bringToFront');
      await first.evaluate(`window.BeesonEditor.open(${JSON.stringify(first.source)})`);
      await frames(first);
      await exec(first, 'insert.text');
      await frames(first);
      await sleep(100);
      assert.deepEqual(await stored(first), { x: [], y: [] }, 'the first page writes over the guides of the newer session');
      await first.goto('about:blank');
      await sleep(100);
      assert.deepEqual(await stored(newer), { x: [], y: [] }, 'a page that is left writes over the guides of the newer session');
      await first.close();
      assert.deepEqual(errors(newer), []);
    });
  }

  const LEAD = `[...document.querySelectorAll('.reveal section.present p')].find((p) => p.textContent === 'The lead-in of a display')`;
  const leadAt = (page) => page.evaluate(`(() => { const r = document.createRange(); r.selectNodeContents(${LEAD}.firstChild); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  const caretInLead = (page) => page.evaluate(`(() => { const s = getSelection(); return document.activeElement === ${LEAD} && !!s.rangeCount && ${LEAD}.contains(s.anchorNode); })()`);

  for (const platform of PLATFORMS) {
    test(`${platform}: a first click on a grouped text block selects its group, a second the block, and a third puts the caret in it`, async () => {
      const page = await editor(platform);
      await clickText(page, await leadAt(page));
      await frames(page);
      assert.ok(await caretInLead(page), 'a click on a text block that is not grouped does not put the caret in it');
      await press(page, 'Escape');
      await selectFigure(page, FIGURE_BOX_IMG);
      await click(page, await leadAt(page), { modifiers: 'Shift' });
      await exec(page, 'arrange.group');
      await frames(page);
      const group = ['figure.figure-box.fragment', 'p'];
      assert.deepEqual((await selected(page)).sort(), group, 'the paragraph and the figure are not grouped');
      await exec(page, 'selection.clear');
      await frames(page);
      await clickText(page, await leadAt(page));
      await frames(page);
      assert.ok(!(await caretInLead(page)), 'a first click on a grouped text block puts the caret in it');
      assert.deepEqual((await selected(page)).sort(), group, 'a first click on a grouped text block does not select its group');
      await clickText(page, await leadAt(page));
      await frames(page);
      assert.ok(!(await caretInLead(page)), 'a second click on a grouped text block puts the caret in it');
      assert.deepEqual(await selected(page), ['p'], 'a second click on a grouped text block does not select the block alone');
      await clickText(page, await leadAt(page));
      await frames(page);
      assert.ok(await caretInLead(page), 'a third click on a grouped text block does not put the caret in it');
      await press(page, 'Escape');
      await exec(page, 'selection.clear');
      await frames(page);
      const grouped = await render(page);
      await drag(page, await leadAt(page), { dx: 40, dy: 30 });
      await frames(page);
      const moved = await render(page);
      assert.match(moved, /<p style="translate: -?\d+px -?\d+px" data-group="g1">The lead-in of a display<\/p>/, 'the paragraph is not moved');
      assert.match(moved, /<figure class="figure-box fragment" data-fragment-index="2" style="translate: -?\d+px -?\d+px" data-group="g1">/, 'the figure is not moved with the paragraph');
      await undo(page);
      assert.equal(await render(page), grouped);
      await redo(page);
      assert.equal(await render(page), moved);
      await saveAndReopen(page);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`${platform}: each member of a multiple selection has its own grips, without a frame around all, and the grip of one resizes all`, async () => {
      for (const mode of ['dark', 'light']) {
        const page = await editor(platform, { mode });
        await selectFigure(page, FIGURE_BOX_IMG);
        await click(page, await leadAt(page), { modifiers: 'Shift' });
        await frames(page);
        assert.deepEqual((await selected(page)).sort(), ['figure.figure-box.fragment', 'p'], 'the figure and the paragraph are not selected');
        const view = await page.evaluate(`(() => {
        const shown = (el) => !el.hidden && getComputedStyle(el).display !== 'none';
        const grips = [...document.querySelectorAll('.beeson-overlay .beeson-grip')].filter(shown);
        return {
          union: [...document.querySelectorAll('.beeson-overlay .beeson-frame.union')].filter(shown).length,
          frames: [...document.querySelectorAll('.beeson-overlay .beeson-frame.selected')].filter(shown).length,
          members: [...new Set(grips.map((g) => g.dataset.member))].map((m) => grips.filter((g) => g.dataset.member === m).map((g) => g.dataset.handle).sort()),
        };
      })()`);
        assert.equal(view.union, 0, 'a frame is drawn around the members of a multiple selection');
        assert.equal(view.frames, 2, `${view.frames} frames are drawn for two members`);
        assert.equal(view.members.length, 2, `the grips of ${view.members.length} members are drawn, not of both`);
        assert.ok(view.members.some((h) => h.length === 8), `the figure does not have eight grips: ${JSON.stringify(view.members)}`);
        assert.ok(view.members.some((h) => h.includes('e') && h.includes('w') && !h.includes('n')), `the paragraph does not have the grips of a text block: ${JSON.stringify(view.members)}`);
        await shot(page, `multiple-selection-${mode}-${platform}`);
        const widths = () => page.evaluate(`[${LEAD}, [...document.querySelectorAll(${JSON.stringify(FIGURE_BOX_IMG)})].find((i) => i.getBoundingClientRect().width)].map((el) => el.getBoundingClientRect().width)`);
        const before = await widths();
        const se = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-grip[data-handle="se"]')].filter((g) => !g.hidden).map((g) => g.getBoundingClientRect()).sort((a, b) => b.left - a.left)[0]; return { x: g.left + g.width / 2, y: g.top + g.height / 2 }; })()`);
        await drag(page, se, { dx: -80, dy: -60 });
        await frames(page);
        const after = await widths();
        assert.ok(after[0] < before[0] - 5 && after[1] < before[1] - 5, `the widths ${JSON.stringify(before)} became ${JSON.stringify(after)}, not both smaller`);
        const resized = await render(page);
        assert.match(resized, /<p style="width: \d+px">The lead-in of a display<\/p>/, 'the width of the paragraph is not written');
        await undo(page);
        await byteExact(page);
        await redo(page);
        assert.equal(await render(page), resized);
        await saveAndReopen(page);
        assert.deepEqual(errors(page), []);
      }
    });
  }
});
