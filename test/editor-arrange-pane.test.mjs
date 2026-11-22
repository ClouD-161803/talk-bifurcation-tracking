import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';

describe('a figure with a caption in the fields', () => {
  const DECK = 'test-deck.html';
  const FIGURES = 4;
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
  const near = (a, b, by = 2) => Math.abs(a - b) <= by;

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
  const geometry = (page) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides').getBoundingClientRect(), k = s.width / 1920;
  const to = (b) => ({ left: (b.left - s.left) / k, top: (b.top - s.top) / k, width: (b.right - b.left) / k, height: (b.bottom - b.top) / k });
  const img = [...Reveal.getCurrentSlide().querySelectorAll('figure img')].find((i) => i.getBoundingClientRect().width), i = img.getBoundingClientRect();
  const q = Math.min(i.width / img.naturalWidth, i.height / img.naturalHeight), w = img.naturalWidth * q, h = img.naturalHeight * q;
  const picture = to({ left: i.left + (i.width - w) / 2, top: i.top + (i.height - h) / 2, right: i.left + (i.width + w) / 2, bottom: i.top + (i.height + h) / 2 });
  const caption = to(Reveal.getCurrentSlide().querySelector('figcaption').getBoundingClientRect());
  const f = [...document.querySelectorAll('.beeson-frame.selected')].find((f) => f.getClientRects().length && !f.hidden);
  const fr = f && f.getBoundingClientRect();
  return { picture, caption, frame: fr && to(fr), aspect: img.naturalWidth / img.naturalHeight, drawn: w / h, box: i.width / i.height };
})()`);

  async function load(t, platform, n, size = { width: 1600, height: 1000 }) {
    const page = await browser.newPage(size);
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

  for (const platform of PLATFORMS) {
    test(`the fields and the frame of a figure give its drawn picture with its caption (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      const g = await geometry(page);
      const top = Math.min(g.picture.top, g.caption.top), bottom = Math.max(g.picture.top + g.picture.height, g.caption.top + g.caption.height);
      for (const [id, v] of [['x', g.picture.left], ['y', top], ['width', g.picture.width], ['height', bottom - top]]) {
        assert.ok(near(await fieldValue(page, id), v, 1), `${id} reads ${await fieldValue(page, id)} against ${v}: ${js(g)}`);
      }
      assert.ok(g.frame.top <= g.picture.top + 1, `the top line of the frame is above the picture: ${js(g)}`);
      assert.deepEqual(page.errors, []);
    });

    test(`Align Top and a typed Y of 0 put the visible top of a figure on the edge of the slide (${platform})`, async (t) => {
      let page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      await exec(page, 'arrange.align.top');
      await frames(page);
      let g = await geometry(page);
      assert.ok(near(g.picture.top, 0, 1), `Align Top puts the picture at ${g.picture.top}`);
      assert.ok(near(await fieldValue(page, 'y'), 0, 1));
      await checkEdit(page, `r13-2-align-top-${platform}.html`);
      page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      await typeField(page, 'y', 0);
      g = await geometry(page);
      assert.ok(near(g.picture.top, 0, 1), `a typed Y of 0 puts the picture at ${g.picture.top}`);
      await checkEdit(page, `r13-2-typed-y-${platform}.html`);
      assert.deepEqual(page.errors, []);
    });

    test(`a typed Height of a figure keeps the aspect of its picture and its caption on the slide (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      const y = await fieldValue(page, 'y');
      const h = Math.round(1080 - y - 20);
      await typeField(page, 'height', h);
      const g = await geometry(page);
      assert.ok(near(g.drawn, g.aspect, 0.01), `the drawn picture keeps its aspect: ${js(g)}`);
      assert.ok(near(g.box, 0.75, 0.01), `the image box keeps the ratio of the zone of 600 by 800 px: ${js(g)}`);
      const bottom = g.caption.top + g.caption.height;
      assert.ok(near(bottom - g.picture.top, h, 3), `the figure is ${bottom - g.picture.top} high against ${h}: ${js(g)}`);
      assert.ok(bottom <= 1080 + 1, `the caption ends at ${bottom}`);
      assert.ok(near(await fieldValue(page, 'height'), h, 3) && near(await fieldValue(page, 'y'), y, 1));
      assert.ok(near(await fieldValue(page, 'width'), g.picture.width, 1));
      await checkEdit(page, `r13-2-typed-height-${platform}.html`);
      assert.deepEqual(page.errors, []);
    });

    test(`a drag of a figure snaps the visible top of its picture to the edge of the slide (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      const g0 = await geometry(page);
      const k = await page.evaluate(`document.querySelector('.reveal .slides').getBoundingClientRect().width / 1920`);
      const at = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector('figure img.for-light').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const dy = -(g0.picture.top - 4) * k;
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 10; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y + (dy * i) / 10, button: 'left', buttons: 1 });
      await frames(page);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y + dy, button: 'left', buttons: 0, clickCount: 1 });
      await frames(page);
      const g = await geometry(page);
      assert.ok(near(g.picture.top, 0, 1), `the drag puts the picture at ${g.picture.top}`);
      assert.ok(near(await fieldValue(page, 'y'), 0, 1));
      await checkEdit(page, `r13-2-snap-${platform}.html`);
      assert.deepEqual(page.errors, []);
    });
  }

  const outer = (g) => {
    const left = Math.min(g.picture.left, g.caption.left), top = Math.min(g.picture.top, g.caption.top);
    const right = Math.max(g.picture.left + g.picture.width, g.caption.left + g.caption.width), bottom = Math.max(g.picture.top + g.picture.height, g.caption.top + g.caption.height);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };
  const grip = (page, handle) => page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-grip[data-handle="${handle}"]')].find((g) => g.getClientRects().length && !g.hidden); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  for (const scale of [1, 1.25]) {
    for (const handle of ['nw', 'ne', 'sw', 'se']) {
      test(`a corner resize of a figure by its ${handle} grip keeps the corner across from it at a pixel ratio of ${scale}`, async (t) => {
        const page = await load(t, 'other', FIGURES, { width: 1600, height: 1000, scale });
        await clickText(page, 'section.present figure img.for-light');
        const f0 = outer(await geometry(page));
        const k = await page.evaluate(`document.querySelector('.reveal .slides').getBoundingClientRect().width / 1920`);
        const at = await grip(page, handle);
        const sx = handle.includes('e') ? 1 : -1, sy = handle.includes('s') ? 1 : -1;
        const dx = sx * 180 * k, dy = sy * 180 * k;
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 12; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x + (dx * i) / 12, y: at.y + (dy * i) / 12, button: 'left', buttons: 1, modifiers: 0 });
        await frames(page);
        const g = await geometry(page), f = outer(g);
        const readout = await page.evaluate(`document.querySelector('.beeson-offset').textContent`);
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x + dx, y: at.y + dy, button: 'left', buttons: 0, clickCount: 1 });
        await frames(page);
        const info = js({ f0, f, g, readout });
        assert.ok(near(sx > 0 ? f.left : f.right, sx > 0 ? f0.left : f0.right, 2), `x across: ${info}`);
        assert.ok(near(sy > 0 ? f.top : f.bottom, sy > 0 ? f0.top : f0.bottom, 2), `y across: ${info}`);
        assert.ok(near(g.drawn, g.aspect, 0.01) && f.width > f0.width + 40, `the picture grew at its aspect: ${info}`);
        const [, w, h] = readout.match(/w: (\d+) px\s+h: (\d+) px/) ?? [];
        assert.ok(near(Number(w), f.width, 2) && near(Number(h), f.height, 2), `the readout: ${info}`);
        const g1 = await geometry(page), f1 = outer(g1);
        assert.ok(near(f1.width, f.width, 2) && near(f1.height, f.height, 2) && near(f1.left, f.left, 2) && near(f1.top, f.top, 2), `the release keeps the frame: ${js({ f, f1 })}`);
        for (const [id, v] of [['x', f1.left], ['y', f1.top], ['width', f1.width], ['height', f1.height]]) {
          assert.ok(near(await fieldValue(page, id), v, 1), `${id} reads ${await fieldValue(page, id)} against ${v}`);
        }
        const width = Number((await page.evaluate(`Reveal.getCurrentSlide().querySelector('figure img.for-light').getAttribute('style')`)).match(/width:\s*([\d.]+)px/)[1]);
        assert.ok(near(width, g1.picture.width, 1), `the file holds width ${width} against the drawn ${g1.picture.width}`);
        await checkEdit(page, `r13-2-corner-${handle}-${scale}.html`);
        assert.deepEqual(page.errors, []);
      });
    }
  }

  const canvasBox = (page) => page.evaluate(`(() => {
  const c = document.querySelector('.beeson-edit-canvas'), r = c.getBoundingClientRect();
  let left = r.left + c.clientLeft, top = r.top + c.clientTop;
  const right = left + c.clientWidth, bottom = top + c.clientHeight;
  for (const ruler of document.querySelectorAll('.beeson-ruler')) {
    const b = ruler.getBoundingClientRect();
    if (!ruler.getClientRects().length || !b.width || !b.height) continue;
    if (b.width > b.height) top = Math.max(top, b.bottom); else left = Math.max(left, b.right);
  }
  return { left, top, right, bottom };
})()`);
  const readoutBox = (page) => page.evaluate(`(() => { const o = document.querySelector('.beeson-offset'); if (!o || o.hidden) return null; const r = o.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, text: o.textContent }; })()`);

  for (const platform of PLATFORMS) {
    for (const zoom of [false, true]) {
      test(`the readout of a drag stays inside the visible canvas at its edges${zoom ? ' while zoomed in' : ''} (${platform})`, async (t) => {
        const page = await load(t, platform, FIGURES);
        await exec(page, 'view.rulers');
        await clickText(page, 'section.present figure img.for-light');
        if (zoom) await exec(page, 'zoom.selection');
        await frames(page);
        const c = await canvasBox(page);
        const at = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector('figure img.for-light').getBoundingClientRect(); const x = Math.max(r.left, 0) + 20, y = Math.max(r.top, 0) + 20; return { x, y }; })()`);
        const at2 = { x: Math.min(Math.max(at.x, c.left + 30), c.right - 30), y: Math.min(Math.max(at.y, c.top + 30), c.bottom - 30) };
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at2.x, y: at2.y });
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at2.x, y: at2.y, button: 'left', buttons: 1, clickCount: 1 });
        for (const [x, y] of [[c.right - 3, (c.top + c.bottom) / 2], [(c.left + c.right) / 2, c.bottom - 3], [c.right - 3, c.bottom - 3], [c.left + 3, c.top + 3]]) {
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (x + at2.x) / 2, y: (y + at2.y) / 2, button: 'left', buttons: 1 });
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
          await frames(page);
          const r = await readoutBox(page);
          assert.ok(r, 'a readout is shown');
          assert.ok(r.left >= c.left - 0.5 && r.top >= c.top - 0.5 && r.right <= c.right + 0.5 && r.bottom <= c.bottom + 0.5, `the readout ${js(r)} is outside the canvas ${js(c)} at ${x}, ${y}`);
        }
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at2.x, y: at2.y, button: 'left', buttons: 0, clickCount: 1 });
        await frames(page);
        assert.deepEqual(page.errors, []);
      });
    }
  }

  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const seen = (page, selector) => page.evaluate(`(() => { const e = document.querySelector(${js(selector)}); return !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; })()`);
  async function choose(page, bar, label) {
    await clickText(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await frames(page);
    const at = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)});
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the menu ${bar} does not have an item ${label}`);
    await clickText(page, at);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    for (const width of [800, 1600]) {
      test(`View > Slide Only agrees with the navigator shown in a window ${width} px wide (${platform})`, async (t) => {
        const page = await load(t, platform, 0, { width, height: 900 });
        if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
        await frames(page);
        const agree = async (why) => {
          const nav = await seen(page, '.beeson-edit-nav');
          assert.equal((await state(page, 'view.slideOnly')).checked, !nav, `Slide Only ${why}`);
          return nav;
        };
        const first = await agree('at the start');
        assert.equal(first, width > 1000, 'the navigator is hidden beside the inspector only in a narrow window');
        await choose(page, 'View', 'Slide Only');
        assert.equal(await agree('after Slide Only'), !first, 'Slide Only changes what is shown');
        await choose(page, 'View', 'Slide Only');
        assert.equal(await agree('after Slide Only twice'), first, 'a second Slide Only gives back what was shown');
        if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
        await frames(page);
        await agree('with the inspector open');
        await choose(page, 'View', 'Slide Only');
        await agree('after a third Slide Only');
        assert.deepEqual(page.errors, []);
      });
    }
  }

  const pointOf = (page, selector, needle, k = 0) => page.evaluate(`(() => {
  const el = [...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}));
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i + ${k});
    r.setEnd(n, i + ${k} + 1);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }
})()`);
  const selected = (page) => page.evaluate(`(() => {
  const s = getSelection();
  const el = s.focusNode && (s.focusNode.nodeType === 1 ? s.focusNode : s.focusNode.parentElement);
  return { text: s.toString(), block: el?.closest('p, li, h2')?.localName ?? null, editing: !!el?.closest('[contenteditable="true"]') };
})()`);

  const word = async (page) => {
    const s = await selected(page);
    return { ...s, text: s.text.trimEnd() };
  };

  for (const platform of PLATFORMS) {
    for (const [id, block, back] of [['text.list.ul', 'li', 'p'], ['text.list.ol', 'li', 'p']]) {
      test(`an undo and a redo of ${id} on a word of a paragraph select the word again (${platform})`, async (t) => {
        const page = await load(t, platform, FIGURES);
        await click(page, await pointOf(page, '.reveal section.present > p', 'styles', 2), { count: 2 });
        assert.deepEqual(await word(page), { text: 'styles', block: back, editing: true });
        await exec(page, id);
        assert.deepEqual(await word(page), { text: 'styles', block, editing: true }, 'the list style keeps the word');
        await undo(page);
        await frames(page);
        assert.deepEqual(await word(page), { text: 'styles', block: back, editing: true }, 'the undo selects the word again');
        assert.equal(await render(page), page.source);
        await redo(page);
        await frames(page);
        assert.deepEqual(await word(page), { text: 'styles', block, editing: true }, 'the redo selects the word again');
        await checkEdit(page, `r13-2-list-${id}-${platform}.html`);
        assert.deepEqual(page.errors, []);
      });
    }

    test(`an undo and a redo of Numbers on the items of a list select the items again (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      const ITEM = '.reveal section.present ul > li';
      await clickText(page, await pointOf(page, ITEM, 'toggle', 2));
      await press(page, 'Mod+A');
      const all = (await selected(page)).text;
      assert.ok(all.length > 20, `Mod+A selects the list: ${all}`);
      await exec(page, 'text.list.ol');
      await undo(page);
      await frames(page);
      assert.equal((await selected(page)).text, all, 'the undo selects the items again');
      await redo(page);
      await frames(page);
      assert.equal((await selected(page)).text, all, 'the redo selects the items again');
      await checkEdit(page, `r13-2-list-items-${platform}.html`);
      assert.deepEqual(page.errors, []);
    });
  }

  async function menuKeys(page, bar) {
    const i = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].findIndex((b) => b.textContent === ${js(bar)})`);
    await click(page, `.beeson-edit-menubar [role=menuitem]:nth-child(${i + 1})`);
    const items = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => [i.querySelector('.label')?.textContent, i.querySelector('.keys')?.textContent ?? '']))`);
    await page.evaluate('window.BeesonEditorShell.closeMenus(); true');
    await frames(page);
    return items;
  }

  for (const platform of PLATFORMS) {
    test(`the Slide menu lists Delete Slide without a key and Duplicate Slide with Mod+D, which duplicates the slide, with nothing selected on the canvas (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      const c = await canvasBox(page);
      await clickText(page, { x: c.left + 8, y: c.bottom - 8 });
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().length'), 0);
      const keys = await menuKeys(page, 'Slide');
      const count = () => page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`);
      assert.equal(keys['Delete Slide'], '');
      assert.equal(keys['Duplicate Slide'], platform === 'mac' ? '⌘D' : 'Ctrl+D');
      const before = await count();
      await press(page, platform === 'mac' ? 'Backspace' : 'Delete');
      await frames(page);
      assert.equal(await count(), before);
      assert.ok((await menuKeys(page, 'Edit')).Duplicate);
      await clickText(page, { x: c.left + 8, y: c.bottom - 8 });
      await press(page, 'Mod+D');
      await frames(page);
      assert.equal(await count(), before + 1);
      assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Duplicate Slide');
      await undo(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });
  }

  const sizeFields = async (page) => ({ w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height'), angle: await fieldValue(page, 'angle') });

  for (const platform of PLATFORMS) {
    test(`a turned figure selected as one object keeps W and H of its picture with its caption at every angle (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      const rest = await sizeFields(page);
      assert.deepEqual(rest, { w: 600, h: 875, angle: 0 });
      for (const deg of [30, 60, 90, 0]) {
        await typeField(page, 'angle', deg);
        assert.deepEqual(await sizeFields(page), { ...rest, angle: deg }, `at ${deg} degrees`);
      }
      const rotor = await page.evaluate(`(() => { const r = document.querySelector('.beeson-rotor'); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rotor.x, y: rotor.y });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rotor.x, y: rotor.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 10; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rotor.x + 12 * i, y: rotor.y, button: 'left', buttons: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rotor.x + 120, y: rotor.y, button: 'left', buttons: 0, clickCount: 1 });
      await frames(page);
      const turned = await sizeFields(page);
      assert.ok(turned.angle > 5, `the handle turned the figure: ${js(turned)}`);
      assert.deepEqual({ w: turned.w, h: turned.h }, { w: rest.w, h: rest.h }, `after the rotate handle: ${js(turned)}`);
      await checkEdit(page, `r13-2-turned-${platform}.html`);
      assert.deepEqual(page.errors, []);
    });

    test(`a typed Height of a turned figure comes back as typed and gives the same size at Angle 0 (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      await typeField(page, 'angle', 29);
      const turned = await render(page);
      await typeField(page, 'height', 875);
      assert.deepEqual(await sizeFields(page), { w: 600, h: 875, angle: 29 });
      assert.equal(await render(page), turned, 'a typed Height of 875 changes the file');
      await typeField(page, 'height', 700);
      const at29 = await sizeFields(page);
      assert.ok(near(at29.h, 700, 2) && at29.angle === 29, `the typed Height reads ${js(at29)}`);
      const typed = await render(page);
      await typeField(page, 'angle', 0);
      const at0 = await sizeFields(page);
      assert.ok(near(at0.h, 700, 2) && near(at0.w, at29.w, 1), `at Angle 0 the size is ${js(at0)} against ${js(at29)}`);
      await checkEdit(page, `r13-2-turned-height-${platform}.html`, typed);
      assert.deepEqual(page.errors, []);
    });

    test(`an undo of a typed Height gives back Width and Height in their fields (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, 'section.present figure img.for-light');
      await typeField(page, 'height', 975);
      assert.notEqual(await fieldValue(page, 'width'), 600);
      await undo(page);
      await frames(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual({ w: Number(await page.evaluate(`document.querySelector('#beeson-edit-num-width').value`)), h: Number(await page.evaluate(`document.querySelector('#beeson-edit-num-height').value`)) }, { w: 600, h: 875 });
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('Height typed into the Arrange pane', () => {
  const PLATFORMS = ['mac', 'other'];
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const ROWS = 'test/pages/editor-r27-2.html';
  const PANEL = '#beeson-edit-panel-format';

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
  const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);

  async function load(t, platform, deck = 'test-deck.html', slide = FIGURES) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await frames(page);
    return page;
  }

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
  const size = async (page) => ({ w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height') });

  const pictureAspect = (page) => page.evaluate(`(() => {
  const img = document.querySelector(${js(`.reveal ${IMG}`)});
  const r = img.getBoundingClientRect();
  const k = getComputedStyle(img).objectFit === 'contain' ? Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight) : 0;
  return k ? img.naturalWidth / img.naturalHeight : r.width / r.height;
})()`);
  const NATURAL = 1200 / 1440;

  for (const platform of PLATFORMS) {
    test(`a typed Height of 700 and then of 875 gives back 600 by 875 and the file byte for byte (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, `.reveal ${IMG}`);
      assert.deepEqual(await size(page), { w: 600, h: 875 });
      await typeField(page, 'height', 700);
      assert.equal(await fieldValue(page, 'height'), 700);
      assert.ok(Math.abs((await pictureAspect(page)) - NATURAL) < 0.01, 'the typed height did not keep the aspect of the picture');
      const at700 = await render(page);
      await typeField(page, 'height', 875);
      assert.deepEqual(await size(page), { w: 600, h: 875 });
      assert.equal(await render(page), page.source, 'the height typed back did not give the file back');
      await typeField(page, 'width', 600);
      assert.deepEqual(await size(page), { w: 600, h: 875 });
      await byteExact(page);
      await undo(page);
      assert.equal(await render(page), at700, 'the first undo did not take off the typed height of 875');
      await undo(page);
      await byteExact(page);
      assert.equal((await state(page, 'edit.undo')).enabled, false, 'the values typed are more than two entries of the history');
      await redo(page);
      await redo(page);
      await byteExact(page);
      assert.deepEqual(await size(page), { w: 600, h: 875 });
      assert.deepEqual(page.errors, []);
    });

    test(`a typed Height of a figure with a caption reads back as typed, with the aspect of the picture kept (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, `.reveal ${IMG}`);
      for (const [h, off] of [[610, 0], [700, 0], [820, 0], [900, 0], [600, 0]]) {
        await typeField(page, 'height', h);
        const read = await fieldValue(page, 'height');
        assert.ok(Math.abs(read - h) <= off, `a typed Height of ${h} reads ${read}`);
        assert.ok(Math.abs((await pictureAspect(page)) - NATURAL) < 0.01, `a typed Height of ${h} did not keep the aspect of the picture`);
      }
      await typeField(page, 'width', 500);
      assert.equal(await fieldValue(page, 'width'), 500);
      assert.ok(Math.abs((await pictureAspect(page)) - NATURAL) < 0.01, 'a typed Width did not keep the aspect of the picture');
      await typeField(page, 'height', 760);
      assert.equal(await fieldValue(page, 'height'), 760);
      const edited = await render(page);
      const { text } = await saveAndReopen(page, `r27-2-height-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(page.errors, []);
    });

    test(`a typed Height that a whole px of width gives reads back as typed, also on another wrap of the caption (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, `.reveal ${IMG}`);
      for (const [h, w] of [[785, 529], [621, 321], [825, 521], [585, 253], [658, 154]]) {
        await typeField(page, 'width', w);
        assert.equal(await fieldValue(page, 'height'), h, `a typed Width of ${w} does not give ${h}`);
        await undo(page);
        await byteExact(page);
        await typeField(page, 'height', h);
        const read = await size(page);
        assert.equal(read.h, h, `a typed Height of ${h} reads ${read.w} by ${read.h}`);
        assert.ok(Math.abs((await pictureAspect(page)) - NATURAL) < 0.01, `a typed Height of ${h} did not keep the aspect of the picture`);
        await undo(page);
        await byteExact(page);
      }
      assert.deepEqual(page.errors, []);
    });

    test(`a value typed as a size field shows it is not an entry of the history (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, `.reveal ${IMG}`);
      await typeField(page, 'width', 600);
      await typeField(page, 'height', 875);
      await byteExact(page);
      assert.equal((await state(page, 'edit.undo')).enabled, false);
      await typeField(page, 'height', 700);
      const at700 = await render(page);
      const shown = await size(page);
      await typeField(page, 'height', 700);
      await typeField(page, 'width', shown.w);
      assert.equal(await render(page), at700);
      await undo(page);
      await byteExact(page);
      assert.equal((await state(page, 'edit.undo')).enabled, false);
      assert.deepEqual(page.errors, []);
    });
  }

  const rows = (page) => page.evaluate(`(() => {
  const k = Reveal.getScale();
  return [...document.querySelectorAll('.reveal section.present table tr')].map((tr) => Math.round(tr.getBoundingClientRect().height / k));
})()`);
  const cell = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;

  const cellMenu = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu.cell .item .label')].map((l) => l.textContent)`);
  const itemOf = (page, menu, label) => page.evaluate(`(() => {
  const b = [...document.querySelectorAll('.beeson-edit-menu${menu} .item')].find((b) => b.getClientRects().length && b.querySelector('.label')?.textContent === ${js(label)});
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + 20, y: r.top + r.height / 2, enabled: b.getAttribute('aria-disabled') !== 'true' };
})()`);

  const FIT_MOON = ['<tr style="height: 160px"><td>Moon</td>', '<tr><td>Moon</td>'];
  const FIT_EUROPA = ['<td style="height: 140px">Europa</td>', '<td>Europa</td>'];

  for (const platform of PLATFORMS) {
    test(`Resize Row to Fit Content of the cell menu fits the row of the caret to its content (${platform})`, async (t) => {
      const page = await load(t, platform, ROWS, 0);
      const before = await rows(page);
      assert.ok(before[1] >= 160 && before[2] >= 140, `the written heights are not drawn: ${js(before)}`);
      await click(page, cell(1, 0));
      await click(page, cell(1, 0), { button: 'right' });
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu.cell')`);
      const labels = await cellMenu(page);
      const i = labels.indexOf('Resize Row to Fit Content');
      assert.ok(i >= 0, `the cell menu does not have Resize Row to Fit Content: ${labels.join(', ')}`);
      assert.ok(Math.abs(i - labels.indexOf('Resize Column to Fit Content')) === 1, `the row item is not beside the column item: ${labels.join(', ')}`);
      const item = await itemOf(page, '.cell', 'Resize Row to Fit Content');
      assert.ok(item.enabled);
      await click(page, item);
      await sleep(150);
      await byteExact(page, [FIT_MOON]);
      const after = await rows(page);
      assert.ok(after[1] < 100 && Math.abs(after[1] - after[3]) <= 2, `the row is not fitted to its content: ${js(after)}`);
      assert.equal(after[2], before[2], 'another row changed');
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Resize Row to Fit Content');
      await undo(page);
      await byteExact(page);
      assert.equal((await state(page, 'edit.undo')).enabled, false);
      await redo(page);
      await byteExact(page, [FIT_MOON]);
      const edited = await render(page);
      const { text } = await saveAndReopen(page, `r27-2-row-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(page.errors, []);
    });

    test(`the menu of a row bar has Resize Row to Fit Content, as the menu of a column bar has the column command (${platform})`, async (t) => {
      const page = await load(t, platform, ROWS, 0);
      await click(page, cell(1, 0));
      await sleep(100);
      await click(page, '.beeson-table-bars .bar.rows > [data-index="1"]', { button: 'right' });
      await sleep(100);
      const item = await itemOf(page, '', 'Resize Row to Fit Content');
      assert.ok(item?.enabled, 'the menu of the row bar does not have Resize Row to Fit Content');
      await click(page, item);
      await sleep(150);
      await byteExact(page, [FIT_MOON]);
      assert.deepEqual(page.errors, []);
    });

    test(`Resize Row to Fit Content of the Table pane fits the rows of a range, as one entry of the history (${platform})`, async (t) => {
      const page = await load(t, platform, ROWS, 0);
      if (!(await state(page, 'shell.format')).checked) await page.evaluate(`window.BeesonEditor.exec('shell.format')`);
      await click(page, cell(1, 1));
      await click(page, cell(2, 1), { modifiers: 'Shift' });
      await sleep(100);
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane`), 'table');
      const at = await page.evaluate(`(() => { const b = document.querySelector('${PANEL} button[data-command="table.fitRow"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, title: b.title || b.getAttribute('aria-label') || b.textContent }; })()`);
      assert.ok(at, 'the Table pane does not have Resize Row to Fit Content');
      assert.equal(at.title, 'Resize Row to Fit Content');
      await click(page, at);
      await sleep(150);
      await byteExact(page, [FIT_MOON, FIT_EUROPA]);
      const after = await rows(page);
      assert.ok(Math.abs(after[1] - after[3]) <= 2 && Math.abs(after[2] - after[3]) <= 2, `the rows are not fitted: ${js(after)}`);
      await undo(page);
      await byteExact(page);
      assert.equal((await state(page, 'edit.undo')).enabled, false, 'the fit is more than one entry of the history');
      assert.deepEqual(page.errors, []);
    });

    test(`Format > Table has Resize Row to Fit Content, dimmed on a row without a written height (${platform})`, async (t) => {
      const page = await load(t, platform, ROWS, 0);
      await click(page, cell(3, 0));
      await sleep(100);
      assert.equal((await state(page, 'table.fitRow')).enabled, false, 'the command is not dimmed on a row without a height');
      await click(page, cell(2, 0));
      await sleep(100);
      assert.equal((await state(page, 'table.fitRow')).enabled, true);
      assert.equal((await state(page, 'table.fitRow')).label, 'Resize Row to Fit Content');
      await click(page, await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent === 'Format').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
      const table = await itemOf(page, '', 'Table');
      assert.ok(table, 'the Format menu does not have Table');
      await click(page, table);
      await sleep(100);
      const item = await itemOf(page, '', 'Resize Row to Fit Content');
      assert.ok(item?.enabled, 'Format > Table does not have Resize Row to Fit Content');
      await click(page, item);
      await sleep(150);
      await byteExact(page, [FIT_EUROPA]);
      assert.deepEqual(page.errors, []);
    });
  }

  async function keysIn(page, bar, labels) {
    const i = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].findIndex((b) => b.textContent === ${js(bar)})`);
    await click(page, `.beeson-edit-menubar [role=menuitem]:nth-child(${i + 1})`);
    const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => ({ label: i.querySelector('.label')?.textContent, keys: i.querySelector('.keys')?.textContent ?? '' }))`);
    await page.evaluate('window.BeesonEditorShell.closeMenus(); true');
    return Object.fromEntries(labels.map((l) => [l, items.find((i) => i.label === l)?.keys]));
  }
  const count = (page) => page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`);

  for (const platform of PLATFORMS) {
    test(`the Slide menu prints the keys of Duplicate Slide and Delete Slide where the keys run them (${platform})`, async (t) => {
      const page = await load(t, platform);
      const mac = platform === 'mac';
      const dup = mac ? '⌘D' : 'Ctrl+D';
      const del = mac ? '⌫' : 'Delete';
      await click(page, `.reveal ${IMG}`);
      assert.deepEqual(await keysIn(page, 'Slide', ['Duplicate Slide', 'Delete Slide']), { 'Duplicate Slide': '', 'Delete Slide': '' }, 'with a figure selected, the keys run Duplicate and Delete of the figure');
      await click(page, '.beeson-edit-nav .row:nth-child(5)');
      await sleep(100);
      assert.deepEqual(await keysIn(page, 'Slide', ['Duplicate Slide', 'Delete Slide']), { 'Duplicate Slide': dup, 'Delete Slide': del });
      assert.deepEqual(await keysIn(page, 'Edit', ['Duplicate', 'Delete']), { Duplicate: dup, Delete: del });
      const n = await count(page);
      await press(page, 'Mod+D');
      await sleep(200);
      assert.equal(await count(page), n + 1, 'the key did not duplicate the slide');
      await press(page, mac ? 'Backspace' : 'Delete');
      await sleep(200);
      assert.equal(await count(page), n, 'the key did not delete the slide');
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('a Height that no whole width gives', () => {
  const PLATFORMS = ['mac', 'other'];
  const FIGURES = 4;
  const IMG = '.reveal section.present figure img.for-light';
  const DECK = 'test/pages/editor-r31-2.html';
  const PANEL = '#beeson-edit-panel-format';

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
  const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : ', ' + js(arg)})).then(() => true)`);

  async function load(t, platform, deck, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await frames(page);
    return page;
  }

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
  const size = async (page) => ({ w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height') });

  const heightsAt = (page, img, most) => page.evaluate(`(() => {
  const i = document.querySelector(${js(img)});
  const f = i.closest('figure');
  const all = [...f.querySelectorAll('img')];
  const kept = all.map((o) => [o.style.width, o.style.height, o.style.objectFit]);
  const k = Reveal.getScale();
  const fit = getComputedStyle(i).objectFit === 'contain';
  const s = Math.min(i.offsetWidth / i.naturalWidth, i.offsetHeight / i.naturalHeight);
  const ratio = fit && (i.offsetWidth - s * i.naturalWidth > 0.5 || i.offsetHeight - s * i.naturalHeight > 0.5) ? i.offsetHeight / i.offsetWidth : 0;
  const out = [!!ratio];
  for (let w = 1; w <= ${most}; w++) {
    for (const o of all) {
      o.style.width = w + 'px';
      if (ratio) Object.assign(o.style, { height: Math.round(w * ratio) + 'px', objectFit: 'contain' });
    }
    const a = i.getBoundingClientRect();
    const boxes = [a, ...[...f.querySelectorAll(':scope > figcaption')].map((c) => c.getBoundingClientRect())];
    const box = Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top));
    const picture = fit ? Math.min(i.offsetWidth / i.naturalWidth, i.offsetHeight / i.naturalHeight) * i.naturalHeight : i.offsetHeight;
    out.push(picture + (i.offsetHeight - picture) / 2 + Math.max(0, box - a.height) / k);
  }
  all.forEach((o, n) => ([o.style.width, o.style.height, o.style.objectFit] = kept[n]));
  return out;
})()`);

  function nearest(map, h) {
    let best = null;
    for (let w = 1; w < map.length; w++) {
      const d = Math.max(0, Math.abs(Math.round(map[w]) - h) - (map[0] ? 1 : 0));
      if (!best || d < best.d) best = { w, h: Math.round(map[w]), d };
    }
    return best;
  }

  const FIGURE_CASES = [
    ['test-deck.html', FIGURES, IMG, [[200, { w: 159, h: 564 }], [422, { w: 159, h: 564 }], [496, { w: 159, h: 564 }], [437], [570]]],
    [DECK, 0, '.reveal section.present figure img', [[200, { w: 116, h: 410 }], [311], [385], [422]]],
  ];

  for (const platform of PLATFORMS) {
    for (const [deck, slide, img, cases] of FIGURE_CASES) {
      test(`a typed Height that no width gives reads the nearest height, at the smaller width of two (${deck}, ${platform})`, async (t) => {
        const page = await load(t, platform, deck, slide);
        await click(page, img);
        await sleep(100);
        const map = await heightsAt(page, img, 800);
        for (const [h, want] of cases) {
          const near = nearest(map, h);
          await typeField(page, 'height', h);
          const read = await size(page);
          assert.equal(Math.abs(read.h - h), near.d, `a typed Height of ${h} reads ${read.w} by ${read.h}, where width ${near.w} gives ${near.h}`);
          if (want) assert.ok(Math.abs(read.w - want.w) <= 1 && Math.abs(read.h - want.h) <= 1, `a typed Height of ${h} reads ${read.w} by ${read.h}, not ${want.w} by ${want.h}`);
          if (near.d > 0) assert.equal(read.w, near.w, `a typed Height of ${h} reads ${read.w} by ${read.h}, where the smaller width ${near.w} gives ${near.h}`);
          assert.equal((await state(page, 'edit.undo')).label, 'Undo Size');
          await undo(page);
          await byteExact(page);
          assert.equal((await state(page, 'edit.undo')).enabled, false, `a typed Height of ${h} is more than one entry of the history`);
        }
        assert.deepEqual(page.errors, []);
      });
    }

    test(`a typed Height that no width gives is solved in less than 100 ms on slide 5, and undone, redone, and saved byte for byte (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', FIGURES);
      await click(page, IMG);
      await sleep(100);
      const times = [];
      for (const h of [200, 422, 496, 437]) {
        times.push(await page.evaluate(`(() => { const t0 = performance.now(); window.BeesonEditor.exec('arrange.setSize', { h: ${h} }); return performance.now() - t0; })()`));
        await undo(page);
        await byteExact(page);
      }
      times.sort((a, b) => a - b);
      assert.ok(times[1] < 100, `a typed height took ${times.map((x) => x.toFixed(0)).join(', ')} ms`);
      await typeField(page, 'height', 422);
      const edited = await render(page);
      await undo(page);
      await byteExact(page);
      await redo(page);
      assert.equal(await render(page), edited);
      const { text } = await saveAndReopen(page, `r31-2-height-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(page.errors, []);
    });
  }

  const cell = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;
  const FIT = /distribute|fit/i;
  const formatTable = (page) => page.evaluate(`window.BeesonEditorShell.menuItems('Format', 'Table').map((i) => i.command).filter((c) => c && ${FIT}.test(c))`);
  const cellMenu = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu.cell .item .label')].map((l) => l.textContent).filter((l) => ${FIT}.test(l))`);

  async function selectTable(page) {
    await clickText(page, cell(1, 0));
    await sleep(100);
    await press(page, 'Escape');
    await sleep(100);
    await press(page, 'Escape');
    await sleep(100);
    assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((e) => e.localName)'), ['table']);
  }
  const widths = (text, n) => [...text.split('<section')[n + 1].split('</tr>')[0].matchAll(/<t[hd][^>]*>/g)].map((m) => /width: (\d+)px/.exec(m[0])?.[1] ?? null).map((w) => (w ? Number(w) : null));
  const lines = (page) => page.evaluate(`[...document.querySelectorAll(${js(cell(1, 0).replace(':nth-child(1)', '*'))})].map((c) => {
  const r = document.createRange();
  r.selectNodeContents(c);
  return new Set([...r.getClientRects()].map((b) => Math.round(b.top))).size;
})`);

  for (const platform of PLATFORMS) {
    test(`Format > Table lists the fit commands in the order of the cell menu (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 1);
      await click(page, cell(1, 0));
      await sleep(100);
      await click(page, cell(1, 0), { button: 'right' });
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu.cell')`);
      assert.deepEqual(await cellMenu(page), ['Distribute Rows Evenly', 'Distribute Columns Evenly', 'Resize Row to Fit Content', 'Resize Column to Fit Content']);
      await press(page, 'Escape');
      assert.deepEqual(await formatTable(page), ['table.distributeRows', 'table.distributeColumns', 'table.fitRow', 'table.fitColumn']);
      assert.deepEqual(page.errors, []);
    });

    test(`Resize Column to Fit Content fits every column of a table selected as an object, as one entry of the history (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 1);
      assert.ok((await lines(page)).some((n) => n > 1), 'a cell of the second row is on one line before the fit');
      await selectTable(page);
      assert.equal((await state(page, 'table.fitColumn')).enabled, true, 'Resize Column to Fit Content is dimmed with the table selected');
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane`), 'table');
      const at = await page.evaluate(`(() => { const b = document.querySelector('${PANEL} button[data-command="table.fitColumn"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' }; })()`);
      assert.ok(at && !at.disabled, 'the button Fit to Content of the Columns section is dimmed');
      await click(page, at);
      await sleep(150);
      const edited = await render(page);
      const [a, b] = widths(edited, 1);
      assert.ok(a > 90 && b > 90, `the columns are not fitted: ${js([a, b])}`);
      assert.deepEqual(await lines(page), [1, 1], 'a cell of the second row is not on one line');
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Resize Column to Fit Content');
      await undo(page);
      await byteExact(page);
      assert.equal((await state(page, 'edit.undo')).enabled, false, 'the fit is more than one entry of the history');
      await redo(page);
      assert.equal(await render(page), edited);
      const { text } = await saveAndReopen(page, `r31-2-fit-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(page.errors, []);
    });

    test(`Resize Column to Fit Content sets the widest text of the column of the caret on one line (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 1);
      await click(page, cell(1, 0));
      await sleep(100);
      await exec(page, 'table.fitColumn');
      await sleep(100);
      assert.deepEqual(await lines(page), [1, 1], 'Distant retrograde is not on one line');
      assert.equal(widths(await render(page), 1)[1], 90, 'another column changed');
      await undo(page);
      await byteExact(page);
      assert.deepEqual(page.errors, []);
    });

    test(`Resize Column to Fit Content of Format > Table fits every column of a table selected as an object, and is dimmed on a table without a column to fit (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 1);
      await selectTable(page);
      const item = (await page.evaluate(`window.BeesonEditorShell.menuItems('Format', 'Table')`)).find((i) => i.command === 'table.fitColumn');
      assert.ok(item, 'Format > Table does not have Resize Column to Fit Content');
      await exec(page, 'table.fitColumn');
      await sleep(100);
      const [a, b] = widths(await render(page), 1);
      assert.ok(a > 90 && b > 90, `the columns are not fitted: ${js([a, b])}`);
      await undo(page);
      await byteExact(page);
      await page.evaluate('Reveal.slide(2)');
      await frames(page);
      await selectTable(page);
      assert.equal((await state(page, 'table.fitColumn')).enabled, false, 'the command is not dimmed on a table whose first row is one merged cell');
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('Width or Height typed and typed back', () => {
  const PLATFORMS = ['mac', 'other'];
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const DECK = 'test/pages/editor-r36-2.html';
  const PANEL = '#beeson-edit-panel-format';

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
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);

  async function load(t, platform, { deck = 'test-deck.html', slide = FIGURES } = {}) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await frames(page);
    await page.waitFor(`[...document.querySelectorAll('.reveal section.present img')].every((i) => i.complete && i.naturalWidth)`);
    return page;
  }

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
  const fields = async (page) => ({ w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height'), x: await fieldValue(page, 'x'), y: await fieldValue(page, 'y') });

  const boxes = (page, selector) => page.evaluate(`(() => {
  const el = document.querySelector(${js(`.reveal ${selector}`)});
  const s = document.querySelector('.reveal section.present').getBoundingClientRect();
  const k = Reveal.getScale();
  const place = (e) => {
    const r = e.getBoundingClientRect();
    return { cx: (r.left + r.width / 2 - s.left) / k, cy: (r.top + r.height / 2 - s.top) / k, w: e.offsetWidth, h: e.offsetHeight };
  };
  const img = el.matches('img') ? el : [...el.querySelectorAll('img')].find((i) => i.offsetWidth);
  const out = { box: place(el) };
  if (img) {
    out.img = place(img);
    const f = Math.min(img.offsetWidth / img.naturalWidth, img.offsetHeight / img.naturalHeight);
    out.picture = getComputedStyle(img).objectFit === 'contain' ? { w: img.naturalWidth * f, h: img.naturalHeight * f } : { w: img.offsetWidth, h: img.offsetHeight };
  }
  return out;
})()`);
  function near(a, b, what) {
    for (const [part, box] of Object.entries(b)) {
      for (const [key, v] of Object.entries(box)) assert.ok(Math.abs(a[part][key] - v) <= 1, `${what}: ${part}.${key} is ${a[part][key]}, against ${v} before`);
    }
  }

  for (const platform of PLATFORMS) {
    test(`a typed Width of 601 scales the box of the figure of slide 5 to 601 by 801, and 600 gives it back (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, `.reveal ${IMG}`);
      const start = await fields(page);
      assert.deepEqual(start, { w: 600, h: 875, x: 1200, y: 160 });
      const first = await boxes(page, 'section.present figure');
      assert.deepEqual([first.img.w, first.img.h], [600, 800]);
      await typeField(page, 'width', 601);
      const at601 = await boxes(page, 'section.present figure');
      assert.ok(Math.abs(at601.img.w - 601) <= 1 && Math.abs(at601.img.h - 801) <= 1, `a typed Width of 601 gives a box of ${at601.img.w} by ${at601.img.h}`);
      const read = await fields(page);
      assert.equal(read.w, 601);
      assert.ok(Math.abs(read.h - 876) <= 1, `a typed Width of 601 reads a Height of ${read.h}`);
      assert.deepEqual([read.x, read.y], [1200, 160], 'the typed Width moved the upper left corner of the figure');
      const edited = await render(page);
      assert.ok(!/<figure class="figure-box" style="[^"]*translate/.test(edited), 'a translate was written on the figure, whose corner did not move');
      await typeField(page, 'width', 600);
      assert.deepEqual(await fields(page), start);
      near(await boxes(page, 'section.present figure'), first, 'the Width typed back');
      await byteExact(page);
      await undo(page);
      assert.equal(await render(page), edited, 'the first undo did not take off the Width typed back');
      await undo(page);
      await byteExact(page);
      assert.equal((await state(page, 'edit.undo')).enabled, false, 'the values typed are more than two entries of the history');
      await redo(page);
      assert.equal(await render(page), edited);
      const { text } = await saveAndReopen(page, `r36-2-width-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(page.errors, []);
    });

    test(`a typed Height of the figure of slide 5 keeps its letterbox, and the old Height typed back gives the file back (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, `.reveal ${IMG}`);
      const start = await fields(page);
      const first = await boxes(page, 'section.present figure');
      await typeField(page, 'height', 951);
      assert.equal(await fieldValue(page, 'height'), 951);
      const at = await boxes(page, 'section.present figure');
      assert.ok(Math.abs(at.img.w / at.img.h - 0.75) < 0.005, `a typed Height gives a box of ${at.img.w} by ${at.img.h}`);
      const edited = await render(page);
      await typeField(page, 'height', 875);
      assert.deepEqual(await fields(page), start);
      near(await boxes(page, 'section.present figure'), first, 'the Height typed back');
      await byteExact(page);
      await undo(page);
      assert.equal(await render(page), edited);
      await undo(page);
      await byteExact(page);
      await redo(page);
      await redo(page);
      await byteExact(page);
      assert.deepEqual(page.errors, []);
    });

    test(`a figure of 500 by 707 typed to a Height of 744 and back to 707 reads 500 by 707 (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test/pages/editor-r8-5.html', slide: 5 });
      await click(page, `.reveal ${IMG}`);
      const start = await fields(page);
      assert.deepEqual([start.w, start.h], [500, 707]);
      const first = await boxes(page, 'section.present figure');
      await typeField(page, 'height', 744);
      assert.equal(await fieldValue(page, 'height'), 744);
      const edited = await render(page);
      await typeField(page, 'height', 707);
      assert.deepEqual(await fields(page), start);
      near(await boxes(page, 'section.present figure'), first, 'the Height typed back');
      await byteExact(page);
      await undo(page);
      assert.equal(await render(page), edited);
      await undo(page);
      await byteExact(page);
      await redo(page);
      await redo(page);
      await byteExact(page);
      const { text } = await saveAndReopen(page, `r36-2-707-${platform}.html`);
      assert.equal(text, page.source);
      assert.deepEqual(page.errors, []);
    });

    const KINDS = [
      ['a figure with a caption and a width written', 0, 'section.present figure'],
      ['a figure without a caption', 1, 'section.present figure'],
      ['a picture alone', 2, 'section.present > img'],
      ['a shape', 3, 'section.present .shape'],
      ['a turned figure with a caption', 4, 'section.present figure'],
    ];
    for (const [kind, slide, selector] of KINDS) {
      for (const [id, step] of [['width', 37], ['height', 41]]) {
        const key = id === 'width' ? 'w' : 'h';
        test(`a ${id === 'width' ? 'Width' : 'Height'} typed and typed back gives back ${kind} (${platform})`, async (t) => {
          const page = await load(t, platform, { deck: DECK, slide });
          await click(page, `.reveal ${selector}${selector.endsWith('figure') ? ' img' : ''}`);
          const start = await fields(page);
          const first = await boxes(page, selector);
          await typeField(page, id, start[key] + step);
          const typed = await fields(page);
          assert.equal(typed[key], start[key] + step, `the typed ${id} of ${kind} reads ${typed[key]}`);
          const edited = await render(page);
          assert.notEqual(edited, page.source);
          await typeField(page, id, start[key]);
          assert.deepEqual(await fields(page), start, `the ${id} typed back of ${kind}`);
          near(await boxes(page, selector), first, `the ${id} typed back of ${kind}`);
          await byteExact(page);
          await undo(page);
          assert.equal(await render(page), edited);
          await undo(page);
          await byteExact(page);
          assert.equal((await state(page, 'edit.undo')).enabled, false);
          await redo(page);
          assert.equal(await render(page), edited);
          const { text } = await saveAndReopen(page, `r36-2-${slide}-${id}-${platform}.html`);
          assert.equal(text, edited);
          assert.deepEqual(page.errors, []);
        });
      }
    }

    for (const [id, value] of [['width', 614], ['height', 933]]) {
      test(`a typed ${id === 'width' ? 'Width' : 'Height'} of a pillarboxed figure with a caption keeps X and Y, and the old value gives it back (${platform})`, async (t) => {
        const page = await load(t, platform, { deck: DECK, slide: 5 });
        await click(page, `.reveal ${IMG}`);
        const start = await fields(page);
        assert.deepEqual(start, { w: 667, h: 866, x: 880, y: 120 });
        const first = await boxes(page, 'section.present figure');
        await typeField(page, id, value);
        const typed = await fields(page);
        assert.equal(typed[id === 'width' ? 'w' : 'h'], value);
        assert.deepEqual([typed.x, typed.y], [start.x, start.y], `a typed ${id} of ${value} reads X ${typed.x} and Y ${typed.y}`);
        const edited = await render(page);
        const tag = edited.match(/<figure class="figure-box"[^>]*>/g).at(-1);
        assert.ok(!/translate/.test(tag), `a translate was written on the figure, whose corner did not move: ${tag}`);
        await typeField(page, id, start[id === 'width' ? 'w' : 'h']);
        assert.deepEqual(await fields(page), start);
        near(await boxes(page, 'section.present figure'), first, `the ${id} typed back`);
        await byteExact(page);
        await undo(page);
        assert.equal(await render(page), edited);
        await undo(page);
        await byteExact(page);
        await redo(page);
        assert.equal(await render(page), edited);
        const { text } = await saveAndReopen(page, `r36-2-split-${id}-${platform}.html`);
        assert.equal(text, edited);
        assert.deepEqual(page.errors, []);
      });
    }
  }
});

describe('a typed Height read at a collapsed width', () => {
  const PLATFORMS = ['mac', 'other'];
  const PANEL = '#beeson-edit-panel-format';
  const FIGURES = [
    ['the figure of slide 5 of index.html', 'test-deck.html', 4, [-175, -143, -139, -131, -129, -123, -119, -60, 76]],
    ['a figure with a caption and a written width', 'test/pages/editor-r36-2.html', 0, [-200, -160, -123, -119, -80, -40, 40]],
  ];

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
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');

  async function load(t, platform, deck, slide) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await frames(page);
    await page.waitFor(`[...document.querySelectorAll('.reveal section.present img')].every((i) => i.complete && i.naturalWidth)`);
    return page;
  }

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
  const parts = (page) => page.evaluate(`(() => {
  const fig = document.querySelector('.reveal section.present figure');
  const img = [...fig.querySelectorAll('img')].find((i) => i.offsetWidth);
  const f = Math.min(img.offsetWidth / img.naturalWidth, img.offsetHeight / img.naturalHeight);
  return { picture: img.naturalHeight * f, caption: fig.querySelector('figcaption').offsetHeight };
})()`);

  for (const platform of PLATFORMS) {
    for (const [kind, deck, slide, steps] of FIGURES) {
      test(`a typed Height scales ${kind} and is not read at a collapsed width (${platform})`, async (t) => {
        const page = await load(t, platform, deck, slide);
        await click(page, '.reveal section.present figure img');
        const start = { w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height') };
        const wrong = [];
        const read = [];
        for (const d of steps) {
          const h = start.h + d;
          await typeField(page, 'height', h);
          const now = { w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height') };
          const p = await parts(page);
          read.push(`${h}: ${now.w} by ${now.h}`);
          if (Math.abs(now.h - h) > 1) wrong.push(`a typed Height of ${h} reads ${now.h}`);
          if (p.caption > p.picture) wrong.push(`a typed Height of ${h} gives ${now.w} by ${now.h}, with a caption of ${p.caption} px on a picture of ${Math.round(p.picture)} px`);
          if (d < 0 ? now.w >= start.w : now.w <= start.w) wrong.push(`a typed Height of ${h} gives a Width of ${now.w}, from ${start.w} by ${start.h}`);
          await undo(page);
          await byteExact(page);
        }
        assert.deepEqual(wrong, [], `the sizes read: ${read.join(', ')}`);
        assert.deepEqual(page.errors, []);
      });
    }
  }
});
