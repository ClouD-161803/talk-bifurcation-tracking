import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { center, click, clickText, drag, press, type } from './helpers/editor.mjs';

describe('Reset Rotation and readouts of turned figures', () => {
  const DECK = 'test-deck.html';
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const PLATFORMS = ['mac', 'other'];
  const STOCK = readFileSync(DECK, 'utf8');
  const LEGACY = STOCK.replace('light version">', 'light version" style="rotate: 20deg">').replace('dark version">', 'dark version" style="rotate: 20deg">');

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
  const near = (a, b, d) => Math.abs(a - b) <= d;
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const enabled = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)}).enabled`);

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
  const fields = async (page) => ({ x: await fieldValue(page, 'x'), y: await fieldValue(page, 'y'), w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height') });

  async function load(t, platform, text = STOCK, prep = '') {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    if (prep) await page.evaluate(prep);
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${FIGURES})`);
    await frames(page);
    return page;
  }

  async function undoes(page, before, what) {
    const edited = await render(page);
    assert.notEqual(edited, before, `${what} did not change the text`);
    await undo(page);
    assert.equal(await render(page), before, `an undo of ${what}`);
    await redo(page);
    assert.equal(await render(page), edited, `a redo of ${what}`);
    return edited;
  }

  async function figureState(page) {
    const text = await render(page);
    const start = text.indexOf('<figure class="figure-box"');
    const tags = text.slice(start, text.indexOf('</figure>', start)).match(/<(figure|img)\b[^>]*>/g);
    const turned = await page.evaluate(`(() => { const f = document.querySelector('section.present figure'); return [f, ...f.querySelectorAll('img')].map((el) => getComputedStyle(el).rotate); })()`);
    return { tags, turned };
  }

  async function assertUpright(page, rest) {
    const s = await figureState(page);
    for (const tag of s.tags) assert.doesNotMatch(tag, /rotate/, `a part of the figure is turned: ${js(s.tags)}`);
    assert.deepEqual(s.turned, ['none', 'none', 'none'], `the figure and its images are drawn at ${js(s.turned)}`);
    assert.equal(await fieldValue(page, 'angle'), 0);
    const f = await fields(page);
    for (const k of ['x', 'y', 'w', 'h']) assert.ok(near(f[k], rest[k], 1), `the fields ${js(f)} against the upright figure ${js(rest)}`);
    assert.equal(await enabled(page, 'arrange.resetRotation'), false);
  }

  async function readout(page) {
    const text = await page.evaluate(`(() => { const o = document.querySelector('.beeson-offset'); return o && !o.hidden && o.getClientRects().length ? o.textContent : ''; })()`);
    const m = /x:\s*(-?\d+)\s*px\s+y:\s*(-?\d+)\s*px/.exec(text);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  }

  async function assertNudgeReadout(page, what) {
    await page.evaluate('document.activeElement?.blur()');
    await press(page, 'ArrowRight');
    await frames(page);
    const r = await readout(page);
    const f = await fields(page);
    assert.ok(r && near(r.x, f.x, 1) && near(r.y, f.y, 1), `the readout of a nudge of ${what} is ${js(r)}, and the fields read ${js(f)}`);
  }

  async function assertDragReadout(page, at, what) {
    await drag(page, at, { dx: -100, dy: 30, hold: true });
    const r = await readout(page);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x - 100, y: at.y + 30, button: 'left', clickCount: 1 });
    await frames(page);
    const f = await fields(page);
    assert.ok(r && near(r.x, f.x, 1) && near(r.y, f.y, 1), `the readout of a drag of ${what} is ${js(r)}, and the fields read ${js(f)}`);
  }

  const centerOf = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  async function groupOnFigures(page, platform) {
    await clickText(page, IMG);
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    await frames(page);
  }

  async function dragRotor(page, deg) {
    const o = await page.evaluate(`(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const shown = (el) => !el.hidden && el.getClientRects().length > 0;
    return { c: mid([...document.querySelectorAll('.beeson-frame.selected')].find(shown)), r: mid([...document.querySelectorAll('.beeson-rotor')].find(shown)) };
  })()`);
    const mouse = (type, x, y, extra) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const radius = Math.hypot(o.r.x - o.c.x, o.r.y - o.c.y), from = Math.atan2(o.r.y - o.c.y, o.r.x - o.c.x);
    await mouse('mouseMoved', o.r.x, o.r.y, {});
    await mouse('mousePressed', o.r.x, o.r.y, { button: 'left', buttons: 1, clickCount: 1 });
    let at = o.r;
    for (let i = 1; i <= 10; i++) {
      const a = from + ((deg * Math.PI) / 180) * (i / 10);
      at = { x: o.c.x + radius * Math.cos(a), y: o.c.y + radius * Math.sin(a) };
      await mouse('mouseMoved', at.x, at.y, { button: 'left', buttons: 1 });
    }
    await mouse('mouseReleased', at.x, at.y, { button: 'left', buttons: 0, clickCount: 1 });
    await frames(page);
  }

  async function uprightFields(t, platform) {
    const page = await load(t, platform);
    await clickText(page, IMG);
    const rest = await fields(page);
    await page.close();
    return rest;
  }

  for (const platform of PLATFORMS) {
    test(`a figure whose images are turned in the file is made upright by a typed 0 and by Reset Rotation (${platform})`, async (t) => {
      const rest = await uprightFields(t, platform);
      const page = await load(t, platform, LEGACY, `document.querySelectorAll('figure.figure-box > img').forEach((i) => i.setAttribute('style', 'rotate: 20deg'))`);
      await clickText(page, IMG);
      assert.equal(await fieldValue(page, 'angle'), 20, 'the angle of the figure at the open');
      assert.equal(await enabled(page, 'arrange.resetRotation'), true);

      await typeField(page, 'angle', 0);
      await assertUpright(page, rest);
      await undoes(page, LEGACY, 'a typed 0');
      await undo(page);
      assert.equal(await fieldValue(page, 'angle'), 20, 'the angle of the figure after the undo');

      await typeField(page, 'angle', 30);
      const s = await figureState(page);
      assert.match(s.tags[0], /rotate: 30deg/, `the figure is not turned by 30 degrees: ${js(s.tags)}`);
      for (const tag of s.tags.slice(1)) assert.doesNotMatch(tag, /rotate/, `an image keeps its angle: ${js(s.tags)}`);
      assert.equal(await fieldValue(page, 'angle'), 30);
      const thirty = await undoes(page, LEGACY, 'a typed 30');
      assert.equal(await enabled(page, 'arrange.resetRotation'), true);
      await exec(page, 'arrange.resetRotation');
      await frames(page);
      await assertUpright(page, rest);
      await undoes(page, thirty, 'Reset Rotation');
      assert.deepEqual(errors(page), []);
    });

    test(`a figure whose images are turned in the file is turned by its rotate handle as one object (${platform})`, async (t) => {
      const page = await load(t, platform, LEGACY, `document.querySelectorAll('figure.figure-box > img').forEach((i) => i.setAttribute('style', 'rotate: 20deg'))`);
      await clickText(page, IMG);
      await dragRotor(page, 40);
      const deg = await fieldValue(page, 'angle');
      assert.ok(deg >= 55 && deg <= 65, `the figure is turned to ${deg} degrees`);
      const s = await figureState(page);
      assert.match(s.tags[0], new RegExp(`rotate: ${deg}deg`), `the figure is not turned by ${deg} degrees: ${js(s.tags)}`);
      for (const tag of s.tags.slice(1)) assert.doesNotMatch(tag, /rotate/, `an image keeps its angle: ${js(s.tags)}`);
      assert.deepEqual(s.turned.slice(1), ['none', 'none']);
      await undoes(page, LEGACY, 'a turn by the rotate handle');
      assert.deepEqual(errors(page), []);
    });

    test(`a figure whose picture was turned alone by a second click is made upright by a typed 0 (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, IMG);
      const rest = await fields(page);
      await clickText(page, IMG);
      await typeField(page, 'angle', 50);
      let s = await figureState(page);
      assert.doesNotMatch(s.tags[0], /rotate/, `the figure is turned with its picture selected alone: ${js(s.tags)}`);
      for (const tag of s.tags.slice(1)) assert.match(tag, /rotate: 50deg/, `a picture selected alone is not turned alone: ${js(s.tags)}`);
      const fifty = await undoes(page, STOCK, 'a typed 50 of the picture');

      await clickText(page, 'section.present > h2');
      await press(page, 'Escape');
      await clickText(page, IMG);
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection()[0]?.localName'), 'figure');
      assert.equal(await fieldValue(page, 'angle'), 50);
      await typeField(page, 'angle', 0);
      await assertUpright(page, rest);
      await undoes(page, fifty, 'a typed 0 of the figure');
      s = await figureState(page);
      assert.deepEqual(s.turned, ['none', 'none', 'none']);
      assert.deepEqual(errors(page), []);
    });

    test(`the readout of a nudge and of a drag of a turned figure and text gives the fields X and Y (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, IMG);
      for (const deg of [0, 30]) {
        await typeField(page, 'angle', deg);
        await assertNudgeReadout(page, `the figure at ${deg} degrees`);
        await assertDragReadout(page, await centerOf(page, IMG), `the figure at ${deg} degrees`);
      }
      await clickText(page, 'section.present > h2');
      await press(page, 'Escape');
      await frames(page);
      await typeField(page, 'angle', 30);
      await assertNudgeReadout(page, 'the heading at 30 degrees');
      assert.deepEqual(errors(page), []);
    });

    test(`the readout of a nudge and of a drag of a turned group gives the fields X and Y of its frame (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupOnFigures(page, platform);
      for (const deg of [0, 30]) {
        await typeField(page, 'angle', deg);
        await assertNudgeReadout(page, `the group at ${deg} degrees`);
        await assertDragReadout(page, await centerOf(page, IMG), `the group at ${deg} degrees`);
      }
      assert.deepEqual(errors(page), []);
    });

    test(`a typed Width or Height of a turned group keeps its X and Y (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupOnFigures(page, platform);
      for (const deg of [30, 90, 180]) {
        await typeField(page, 'angle', deg);
        const rest = await fields(page);
        for (const [id, v] of [['width', 1500], ['height', 700]]) {
          const before = await render(page);
          await typeField(page, id, v);
          const f = await fields(page);
          assert.ok(near(f.x, rest.x, 1) && near(f.y, rest.y, 1), `a typed ${id} at ${deg} degrees moved the group from ${js(rest)} to ${js(f)}`);
          assert.ok(near(f[id === 'width' ? 'w' : 'h'], v, 1), `a typed ${id} of ${v} at ${deg} degrees reads ${js(f)}`);
          await undoes(page, before, `a typed ${id} at ${deg} degrees`);
        }
        await typeField(page, 'width', rest.w);
        await typeField(page, 'height', rest.h);
      }
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('sizes of turned figures, and Esc during turns', () => {
  const DECK = 'test-deck.html';
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const PLATFORMS = ['mac', 'other'];
  const STOCK = readFileSync(DECK, 'utf8');
  const LEGACY = STOCK.replace('light version">', 'light version" style="rotate: 20deg">').replace('dark version">', 'dark version" style="rotate: 20deg">');

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
  const near = (a, b, d) => Math.abs(a - b) <= d;
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const enabled = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)}).enabled`);

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
  const fields = async (page) => ({ x: await fieldValue(page, 'x'), y: await fieldValue(page, 'y'), w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height') });

  async function load(t, platform, text = STOCK, prep = '') {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    if (prep) await page.evaluate(prep);
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${FIGURES})`);
    await frames(page);
    return page;
  }

  async function undoes(page, before, what) {
    const edited = await render(page);
    assert.notEqual(edited, before, `${what} did not change the text`);
    await undo(page);
    assert.equal(await render(page), before, `an undo of ${what}`);
    await redo(page);
    assert.equal(await render(page), edited, `a redo of ${what}`);
    return edited;
  }

  async function figureState(page) {
    const text = await render(page);
    const start = text.indexOf('<figure class="figure-box"');
    const tags = text.slice(start, text.indexOf('</figure>', start)).match(/<(figure|img)\b[^>]*>/g);
    const turned = await page.evaluate(`(() => { const f = document.querySelector('section.present figure'); return [f, ...f.querySelectorAll('img')].map((el) => getComputedStyle(el).rotate); })()`);
    return { tags, turned };
  }

  async function groupOnFigures(page, platform) {
    await click(page, IMG);
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    await frames(page);
  }

  async function dragRotor(page, deg, hold = false) {
    const o = await page.evaluate(`(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const shown = (el) => !el.hidden && el.getClientRects().length > 0;
    return { c: mid([...document.querySelectorAll('.beeson-frame.union, .beeson-frame.selected')].find(shown)), r: mid([...document.querySelectorAll('.beeson-rotor')].find(shown)) };
  })()`);
    const mouse = (type, x, y, extra) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const radius = Math.hypot(o.r.x - o.c.x, o.r.y - o.c.y), from = Math.atan2(o.r.y - o.c.y, o.r.x - o.c.x);
    await mouse('mouseMoved', o.r.x, o.r.y, {});
    await mouse('mousePressed', o.r.x, o.r.y, { button: 'left', buttons: 1, clickCount: 1 });
    let at = o.r;
    for (let i = 1; i <= 10; i++) {
      const a = from + ((deg * Math.PI) / 180) * (i / 10);
      at = { x: o.c.x + radius * Math.cos(a), y: o.c.y + radius * Math.sin(a) };
      await mouse('mouseMoved', at.x, at.y, { button: 'left', buttons: 1 });
    }
    await frames(page);
    if (!hold) await mouse('mouseReleased', at.x, at.y, { button: 'left', buttons: 0, clickCount: 1 });
    await frames(page);
    return at;
  }

  for (const platform of PLATFORMS) {
    test(`a typed Width or Height of a turned figure keeps its X and Y (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, IMG);
      for (const deg of [30, 90, 200]) {
        await typeField(page, 'angle', deg);
        const rest = await fields(page);
        for (const [id, v] of [['width', 500], ['height', 800]]) {
          const before = await render(page);
          await typeField(page, id, v);
          const f = await fields(page);
          assert.ok(near(f.x, rest.x, 1) && near(f.y, rest.y, 1), `a typed ${id} at ${deg} degrees moved the figure from ${js(rest)} to ${js(f)}`);
          assert.ok(near(f[id === 'width' ? 'w' : 'h'], v, 1), `a typed ${id} of ${v} at ${deg} degrees reads ${js(f)}`);
          assert.equal(await fieldValue(page, 'angle'), deg);
          await undoes(page, before, `a typed ${id} at ${deg} degrees`);
          await undo(page);
        }
      }
      assert.deepEqual(errors(page), []);
    });

    test(`a group turned by the field Angle or by its rotate handle and then reset gives back the file before the turns (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupOnFigures(page, platform);
      const grouped = await render(page);
      assert.notEqual(grouped, STOCK);
      await typeField(page, 'angle', 30);
      await typeField(page, 'angle', 75);
      const turned = await render(page);
      await exec(page, 'arrange.resetRotation');
      await frames(page);
      assert.equal(await render(page), grouped, 'Reset Rotation after the turns to 30 and to 75');
      await undoes(page, turned, 'Reset Rotation');

      await exec(page, 'arrange.resetRotation');
      for (const deg of [25, 40, -50]) await dragRotor(page, deg);
      assert.notEqual(await fieldValue(page, 'angle'), 0);
      await typeField(page, 'angle', 0);
      assert.equal(await render(page), grouped, 'a typed 0 after three turns by the rotate handle');
      assert.deepEqual(errors(page), []);
    });

    for (const route of ['figure of a deck with turned images', 'picture selected alone']) {
      test(`Esc during a drag of the rotate handle of a ${route} puts the page and the file back (${platform})`, async (t) => {
        const legacy = route.startsWith('figure');
        const page = legacy
          ? await load(t, platform, LEGACY, `document.querySelectorAll('figure.figure-box > img').forEach((i) => i.setAttribute('style', 'rotate: 20deg'))`)
          : await load(t, platform);
        await click(page, IMG);
        if (!legacy) await click(page, IMG);
        const was = await figureState(page);
        const at = await dragRotor(page, 40, true);
        const during = await figureState(page);
        assert.notDeepEqual(during.turned, was.turned, 'the drag did not turn the figure');
        await press(page, 'Escape');
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1 });
        await frames(page);
        const now = await figureState(page);
        assert.deepEqual(now.turned, was.turned, `after Esc the figure and its images are drawn at ${js(now.turned)}, not ${js(was.turned)}`);
        assert.equal(await render(page), page.source, 'the text after Esc');
        assert.equal(await fieldValue(page, 'angle'), legacy ? 20 : 0);
        assert.deepEqual(errors(page), []);
      });
    }
  }
});

describe('undo of turns where one image is turned', () => {
  const DECK = 'test-deck.html';
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const PLATFORMS = ['mac', 'other'];
  const STOCK = readFileSync(DECK, 'utf8');
  const ONE = STOCK.replace('light version">', 'light version" style="rotate: 20deg">');
  const PREP = `document.querySelector('figure.figure-box > img.for-light').setAttribute('style', 'rotate: 20deg')`;

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
  const near = (a, b, d) => Math.abs(a - b) <= d;
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const enabled = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)}).enabled`);

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
  const fields = async (page) => ({ x: await fieldValue(page, 'x'), y: await fieldValue(page, 'y'), w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height') });

  async function load(t, platform, text = STOCK, prep = '') {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    if (prep) await page.evaluate(prep);
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${FIGURES})`);
    await frames(page);
    return page;
  }

  async function undoes(page, before, what) {
    const edited = await render(page);
    assert.notEqual(edited, before, `${what} did not change the text`);
    await undo(page);
    assert.equal(await render(page), before, `an undo of ${what}`);
    await redo(page);
    assert.equal(await render(page), edited, `a redo of ${what}`);
    return edited;
  }

  async function figureState(page) {
    const text = await render(page);
    const start = text.indexOf('<figure class="figure-box"');
    const tags = text.slice(start, text.indexOf('</figure>', start)).match(/<(figure|img)\b[^>]*>/g);
    const turned = await page.evaluate(`(() => { const f = document.querySelector('section.present figure'); return [f, ...f.querySelectorAll('img')].map((el) => getComputedStyle(el).rotate); })()`);
    return { tags, turned };
  }

  async function dragRotor(page, deg, hold = false) {
    const o = await page.evaluate(`(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const shown = (el) => !el.hidden && el.getClientRects().length > 0;
    return { c: mid([...document.querySelectorAll('.beeson-frame.union, .beeson-frame.selected')].find(shown)), r: mid([...document.querySelectorAll('.beeson-rotor')].find(shown)) };
  })()`);
    const mouse = (type, x, y, extra) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const radius = Math.hypot(o.r.x - o.c.x, o.r.y - o.c.y), from = Math.atan2(o.r.y - o.c.y, o.r.x - o.c.x);
    await mouse('mouseMoved', o.r.x, o.r.y, {});
    await mouse('mousePressed', o.r.x, o.r.y, { button: 'left', buttons: 1, clickCount: 1 });
    let at = o.r;
    for (let i = 1; i <= 10; i++) {
      const a = from + ((deg * Math.PI) / 180) * (i / 10);
      at = { x: o.c.x + radius * Math.cos(a), y: o.c.y + radius * Math.sin(a) };
      await mouse('mouseMoved', at.x, at.y, { button: 'left', buttons: 1 });
    }
    await frames(page);
    if (!hold) await mouse('mouseReleased', at.x, at.y, { button: 'left', buttons: 0, clickCount: 1 });
    await frames(page);
    return at;
  }

  const styles = async (page) => [...(await render(page)).matchAll(/<img class="for-(?:dark|light)"[^>]*>/g)].map((m) => /style="([^"]*)"/.exec(m[0])?.[1] ?? null);

  for (const platform of PLATFORMS) {
    test(`an undo of a typed Angle or of Reset Rotation on a figure with one turned image gives back the opened text (${platform})`, async (t) => {
      const page = await load(t, platform, ONE, PREP);
      await click(page, IMG);
      assert.equal(await fieldValue(page, 'angle'), 20);
      assert.deepEqual(await styles(page), [null, 'rotate: 20deg']);
      for (const deg of [0, 30]) {
        await typeField(page, 'angle', deg);
        await undoes(page, ONE, `a typed ${deg}`);
        await undo(page);
        assert.deepEqual(await styles(page), [null, 'rotate: 20deg'], `the images after an undo of a typed ${deg}`);
      }
      await exec(page, 'arrange.resetRotation');
      await frames(page);
      assert.equal(await fieldValue(page, 'angle'), 0);
      await undoes(page, ONE, 'Reset Rotation');
      await undo(page);
      assert.deepEqual(await styles(page), [null, 'rotate: 20deg'], 'the images after an undo of Reset Rotation');
      assert.equal(await fieldValue(page, 'angle'), 20);
      assert.deepEqual(errors(page), []);
    });

    test(`an undo of a turn by the rotate handle of a figure with one turned image gives back the opened text (${platform})`, async (t) => {
      const page = await load(t, platform, ONE, PREP);
      await click(page, IMG);
      await dragRotor(page, 40);
      assert.notEqual(await fieldValue(page, 'angle'), 20);
      await undoes(page, ONE, 'a turn by the rotate handle');
      await undo(page);
      assert.deepEqual(await styles(page), [null, 'rotate: 20deg'], 'the images after an undo of the turn');
      assert.deepEqual(errors(page), []);
    });
  }
});
