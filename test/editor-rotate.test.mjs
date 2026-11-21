import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';

describe('the rotate handle drawn above the frame', () => {
  const PLATFORMS = ['mac', 'other'];
  const FIGURE = 4;
  const IMG = '.reveal section.present figure.figure-box > img';
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
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  let saves = 0;
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));

  function inScope(edited, source) {
    const now = textProblems(edited, THEME);
    for (const p of textProblems(source, THEME)) {
      const i = now.indexOf(p);
      if (i >= 0) now.splice(i, 1);
    }
    assert.deepEqual(now, []);
  }

  async function load(t, platform, { n = FIGURE, mode = 'dark', watch = false } = {}) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
    const url = `${server.origin}/test-deck.html?edit&still&theme=${mode}&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    if (watch) await page.evaluate(WATCH);
    page.source = readFileSync('test-deck.html', 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
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
    const { text } = await saveAndReopen(page, `r8-2-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    page.source = text;
    return edited;
  }

  const release = (page, at) => page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });

  for (const platform of PLATFORMS) {
    for (const mode of ['dark', 'light']) {
      test(`the text of a panel fitted by Change Layout to Split is drawn in the color of the panel in ${mode} mode (${platform})`, async (t) => {
        const page = await load(t, platform, { mode });
        await exec(page, 'slide.layout.split');
        await sleep(300);
        await frames(page);
        const seen = await page.evaluate(`(() => {
        const panel = document.querySelector('.reveal section.present > .text-column');
        const small = [...panel.querySelectorAll('.small')];
        const texts = [...small, ...small.flatMap((s) => [...s.querySelectorAll('li')])];
        return { panel: getComputedStyle(panel).color, small: small.length, colors: texts.map((e) => [e.localName, e.textContent.trim().slice(0, 24), getComputedStyle(e).color]) };
      })()`);
        assert.ok(seen.small > 0, 'the text of the panel is not fitted with the style Small');
        for (const [tag, words, color] of seen.colors) assert.equal(color, seen.panel, `the ${tag} "${words}" of the fitted panel is drawn in ${color}, and not in ${seen.panel} as the panel`);
        assert.equal(seen.panel, 'rgb(242, 242, 239)', 'the text color of the panel is not #f2f2ef');
        await roundTrip(page);
      });
    }
  }

  const chrome = (page) => page.evaluate(`(() => {
  const box = (el) => { if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
  const frame = [...document.querySelectorAll('.beeson-frame.selected, .beeson-frame.union')].find((f) => !f.hidden);
  const rotor = document.querySelector('.beeson-rotor');
  const own = window.BeesonEditor.selection();
  const text = [];
  for (const el of own) {
    const range = document.createRange();
    range.selectNodeContents(el);
    for (const b of range.getClientRects()) if (b.width && b.height) text.push({ left: b.left, top: b.top, right: b.right, bottom: b.bottom });
  }
  const r = box(rotor);
  return {
    frame: box(frame),
    rotor: r,
    stem: box(document.querySelector('.beeson-rotor-stem')),
    handle: box(document.querySelector('.beeson-handle')),
    grips: [...document.querySelectorAll('.beeson-grip')].map(box).filter(Boolean),
    hit: r ? document.elementFromPoint(r.x, r.y) === rotor : false,
    text,
  };
})()`);

  const STACKED = [
    [2, 'Design the complete slide'],
    [3, 'You can type LaTeX'],
    [3, 'The Coriolis terms couple'],
    [4, 'Export your matplotlib'],
    [5, 'Copy-paste the code'],
    [10, 'Videos are shown'],
  ];

  for (const platform of PLATFORMS) {
    test(`the rotate grip of a text block is drawn on a stem above its frame, and the block handle clear of its grips (${platform})`, async (t) => {
      const page = await load(t, platform);
      for (const [n, words] of STACKED) {
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        await press(page, 'Escape');
        const at = await page.evaluate(`(() => { const p = [...document.querySelectorAll('.reveal section.present p')].find((p) => p.textContent.trim().startsWith(${js(words)})); const r = p.getBoundingClientRect(); return { x: r.right + 3, y: r.top + r.height / 2 }; })()`);
        await click(page, at);
        await frames(page);
        const v = await chrome(page);
        const what = `the paragraph "${words}" of slide ${n + 1}`;
        assert.ok(v.frame && v.rotor, `${what} is not framed with a rotate grip`);
        assert.ok(v.rotor.bottom < v.frame.top, `the rotate grip of ${what} at ${js(v.rotor)} is not above its frame at ${js(v.frame)}`);
        assert.ok(Math.abs(v.rotor.x - v.frame.x) <= 1, `the rotate grip of ${what} is not at the middle of its frame`);
        assert.ok(v.stem && v.stem.top <= v.rotor.bottom + 1 && v.stem.bottom >= v.frame.top - 1, `the rotate grip of ${what} is not on a stem from its frame`);
        assert.ok(!v.text.some((r) => meets(r, v.rotor)), `the rotate grip of ${what} covers its own text`);
        assert.ok(v.hit, `the rotate grip of ${what} is not the element at its center, i.e. it cannot be pressed`);
        assert.ok(v.handle, `${what} is drawn without its block handle`);
        const hit = v.grips.find((g) => meets(g, v.handle));
        assert.ok(!hit, `the block handle of ${what} at ${js(v.handle)} covers a grip at ${js(hit)}`);
        assert.ok(!meets(v.handle, v.rotor), `the block handle of ${what} covers its rotate grip`);
      }
      const v = await chrome(page);
      await drag(page, { x: v.rotor.x, y: v.rotor.y }, { dx: 120, dy: 40 });
      await frames(page);
      assert.match(await render(page), /<p[^>]* style="rotate: \d+deg">Videos are shown/, 'the grip does not turn the paragraph');
      await roundTrip(page);

      await page.evaluate(`Reveal.slide(${FIGURE})`);
      await frames(page);
      await click(page, IMG);
      await frames(page);
      const img = await chrome(page);
      assert.ok(img.rotor && img.rotor.bottom < img.frame.top && img.stem, `the rotate grip of the image at ${js(img.rotor)} is not on a stem above its frame at ${js(img.frame)}`);
    });
  }

  const members = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => {
  const pic = el.matches('figure, .figure-box, .plate') ? [...el.querySelectorAll('img, video')].find((m) => m.getBoundingClientRect().width) ?? el : el;
  const r = pic.getBoundingClientRect();
  const deg = (parseFloat(getComputedStyle(pic).rotate) || 0) + (pic === el ? 0 : parseFloat(getComputedStyle(el).rotate) || 0);
  return { tag: el.localName, deg, x: r.left + r.width / 2, y: r.top + r.height / 2 };
})`);
  const turn = (p, c, deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: c.x + (p.x - c.x) * Math.cos(a) - (p.y - c.y) * Math.sin(a), y: c.y + (p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a) };
  };
  function turnedAbout(now, before, c, deg, what) {
    assert.equal(now.length, before.length);
    now.forEach((m, i) => {
      assert.equal(Math.round(m.deg), ((Math.round(before[i].deg + deg) % 360) + 360) % 360, `${what}: the ${m.tag} of the group is turned by ${m.deg} degrees and not by ${deg}`);
      const want = turn(before[i], c, deg);
      assert.ok(Math.hypot(m.x - want.x, m.y - want.y) <= 3, `${what}: the center of the ${m.tag} of the group is at ${js([m.x, m.y])} and not at ${js([want.x, want.y])}, turned about the center of the group`);
    });
  }

  async function grouped(page, platform) {
    await click(page, IMG);
    await click(page, '.reveal section.present > p', { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Mod+Alt+G' : 'Mod+G');
    await frames(page);
    assert.match(await render(page), /<p data-group="g\d+">Export/, 'the paragraph is not grouped');
    page.source = await render(page);
    assert.deepEqual((await members(page)).map((m) => m.tag).sort(), ['figure', 'p'], 'the group is not selected');
  }

  for (const platform of PLATFORMS) {
    test(`a group is turned by its rotate grip about its center as one entry of the history (${platform})`, async (t) => {
      const page = await load(t, platform);
      await grouped(page, platform);
      const v = await chrome(page);
      assert.ok(v.rotor, 'a selected group is drawn without a rotate grip');
      assert.ok(v.rotor.bottom < v.frame.top && Math.abs(v.rotor.x - v.frame.x) <= 1 && v.stem, `the rotate grip of the group at ${js(v.rotor)} is not on a stem above the middle of its frame at ${js(v.frame)}`);
      const before = await members(page);
      const c = { x: v.frame.x, y: v.frame.y };
      const r = c.y - v.rotor.y;
      await drag(page, { x: v.rotor.x, y: v.rotor.y }, { dx: r, dy: r, steps: 12, hold: true });
      await frames(page);
      const readout = await page.evaluate(`document.querySelector('.beeson-offset:not([hidden])')?.textContent ?? ''`);
      assert.equal(readout, '90°', 'the angle is not shown at the pointer during the turn of the group');
      turnedAbout(await members(page), before, c, 90, 'during the drag');
      await release(page, { x: v.rotor.x + r, y: v.rotor.y + r });
      await frames(page);
      turnedAbout(await members(page), before, c, 90, 'after the drag');
      const edited = await render(page);
      assert.match(edited, /<p style="rotate: 90deg; translate: -?\d+px -?\d+px" data-group="g\d+">Export/, 'the paragraph is not written with its offset and its angle');
      assert.match(edited, /<figure class="figure-box" style="rotate: 90deg; translate: -?\d+px -?\d+px" data-group="g\d+">/, 'the figure is not written with its offset and its angle');
      assert.equal(edited.match(/<img class="for-(dark|light)" [^>]*style="[^"]*rotate/g), null, 'the images of the figure are written with an angle');
      assert.deepEqual((await members(page)).map((m) => m.tag).sort(), ['figure', 'p'], 'the group is not selected after the turn');
      inScope(edited, page.source);
      await roundTrip(page);
    });

    test(`the field Angle of the Arrange pane turns a group about its center (${platform})`, async (t) => {
      const page = await load(t, platform);
      await grouped(page, platform);
      const v = await chrome(page);
      const before = await members(page);
      await page.evaluate(`[...document.querySelectorAll('${PANEL} button')].find((b) => b.textContent.trim() === 'Arrange')?.click()`);
      await frames(page);
      const field = `${PANEL} input[name="Angle"]`;
      assert.equal(await page.evaluate(`document.querySelector('${field}')?.disabled`), false, 'the field Angle is not live on a group');
      await click(page, field, { count: 3 });
      await press(page, 'Mod+A');
      await page.send('Input.insertText', { text: '30' });
      await press(page, 'Enter');
      await frames(page);
      turnedAbout(await members(page), before, { x: v.frame.x, y: v.frame.y }, 30, 'after 30 typed in Angle');
      assert.equal(await page.evaluate(`document.querySelector('${field}').value`), '30');
      inScope(await render(page), page.source);
      await roundTrip(page);
    });
  }

  const WATCH = `(() => {
  window.rawThumbs = [];
  window.typesetThumbs = 0;
  const check = () => {
    const hosts = [...document.querySelectorAll('.beeson-edit-nav .row .pic')];
    hosts.forEach((h, i) => {
      const root = h.shadowRoot;
      const wrap = root?.querySelector('.beeson-thumb');
      if (!wrap || wrap.dataset.checked) return;
      wrap.dataset.checked = '1';
      const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (t.parentElement.closest('pre, code, mjx-container') || getComputedStyle(t.parentElement).visibility === 'hidden') continue;
        const m = /\\\\[(\\[].{0,16}/.exec(t.data);
        if (m) window.rawThumbs.push({ slide: i + 1, text: m[0] });
      }
      if (i === 4 && wrap.querySelector('mjx-container')) window.typesetThumbs++;
    });
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
  return true;
})()`;

  for (const platform of PLATFORMS) {
    test(`a thumbnail of the navigator is drawn only from typeset formulas (${platform})`, async (t) => {
      const page = await load(t, platform, { mode: 'light', watch: true });
      await sleep(150);
      await click(page, IMG);
      const rotor = await page.evaluate(`(() => { const r = document.querySelector('.beeson-rotor').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await drag(page, rotor, { dx: 120, dy: 40, hold: true });
      await sleep(1500);
      await release(page, { x: rotor.x + 120, y: rotor.y + 40 });
      await sleep(800);
      const raw = await page.evaluate('window.rawThumbs');
      assert.deepEqual(raw, [], `a thumbnail is drawn with raw TeX: ${js(raw)}`);
      assert.ok((await page.evaluate('window.typesetThumbs')) > 0, 'the thumbnail of slide 5 is not drawn with its typeset formulas');
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('a figure with a caption turned as one', () => {
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
  const near = (a, b, d) => Math.abs(a - b) <= d;
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
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
  const fields = async (page) => ({ x: await fieldValue(page, 'x'), y: await fieldValue(page, 'y'), w: await fieldValue(page, 'width'), h: await fieldValue(page, 'height') });

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

  const overlay = (page) => page.evaluate(`(() => {
  const shown = (el) => !el.hidden && el.getClientRects().length > 0;
  const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const frames = [...document.querySelectorAll('.beeson-frame.selected, .beeson-frame.union')].filter(shown).map((f) => ({ union: f.classList.contains('union'), width: f.offsetWidth, height: f.offsetHeight, rotate: f.style.rotate, center: mid(f) }));
  const grips = Object.fromEntries([...document.querySelectorAll('.beeson-grip')].filter(shown).map((g) => [g.dataset.handle, { ...mid(g), cursor: getComputedStyle(g).cursor }]));
  const rotor = [...document.querySelectorAll('.beeson-rotor')].find(shown);
  const slides = document.querySelector('.reveal .slides');
  return { frames, grips, rotor: rotor ? mid(rotor) : null, scale: slides.getBoundingClientRect().width / slides.offsetWidth };
})()`);
  const angle = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const sameAngle = (a, b, d = 1.5) => Math.abs(((a - b + 540) % 360) - 180) <= d;

  async function assertTurnedFrame(page, deg, size) {
    const o = await overlay(page);
    assert.equal(o.frames.length, 1, `the frames are ${js(o.frames)}`);
    const [f] = o.frames;
    assert.equal(f.rotate, `${deg}deg`, `the frame is ${js(f)}, not turned by ${deg}°`);
    assert.ok(near(f.width, size.w * o.scale + 16, 3) && near(f.height, size.h * o.scale + 16, 3), `the frame ${js(f)} against the fields ${js(size)} at the scale ${o.scale}`);
    const g = o.grips;
    for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) assert.ok(g[h], `the grip ${h} is not drawn: ${js(g)}`);
    assert.ok(sameAngle(angle(g.nw, g.ne), deg), `the top edge from ${js(g.nw)} to ${js(g.ne)} is not turned by ${deg}°`);
    assert.ok(sameAngle(angle(g.nw, g.sw), deg + 90), `the left edge from ${js(g.nw)} to ${js(g.sw)} is not turned by ${deg}°`);
    assert.ok(near(dist(g.nw, g.ne), f.width, 3) && near(dist(g.nw, g.sw), f.height, 3), `the grips ${js(g)} are not at the corners of the frame ${js(f)}`);
    assert.ok(o.rotor && sameAngle(angle(g.n, o.rotor), deg - 90, 3), `the rotate handle at ${js(o.rotor)} is not above the grip n at ${js(g.n)} on the turned frame`);
    const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
    const DIRS = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
    for (const [h, d] of Object.entries(DIRS)) {
      const want = CURSORS[Math.round((((d + deg) % 360) + 360) % 360 / 45) % 4];
      assert.equal(g[h].cursor, want, `the grip ${h} at ${deg}° has the cursor ${g[h].cursor}`);
    }
  }

  async function dragRotor(page, deg) {
    const o = await overlay(page);
    const c = o.frames[0].center;
    const r = Math.hypot(o.rotor.x - c.x, o.rotor.y - c.y), from = Math.atan2(o.rotor.y - c.y, o.rotor.x - c.x);
    await mouse(page, 'mouseMoved', o.rotor.x, o.rotor.y);
    await mouse(page, 'mousePressed', o.rotor.x, o.rotor.y, { button: 'left', buttons: 1, clickCount: 1 });
    let at = o.rotor;
    for (let i = 1; i <= 10; i++) {
      const a = from + ((deg * Math.PI) / 180) * (i / 10);
      at = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
      await mouse(page, 'mouseMoved', at.x, at.y, { button: 'left', buttons: 1 });
    }
    await mouse(page, 'mouseReleased', at.x, at.y, { button: 'left', buttons: 0, clickCount: 1 });
    await frames(page);
  }

  const overflow = async (page) => ({
    outlined: await page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('.beeson-overflow')].map((el) => el.localName)`),
    message: (await page.evaluate('window.BeesonEditor.status()')).message,
  });

  async function groupOnFigures(page, platform) {
    await clickText(page, IMG);
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`a figure with a caption turned by the field Angle is turned as one object, with its frame, grips, and rotate handle (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, IMG);
      const rest = await fields(page);
      await typeField(page, 'angle', 30);
      assert.equal(await fieldValue(page, 'angle'), 30);
      const edited = await render(page);
      assert.match(edited, /<figure class="figure-box" style="[^"]*\brotate: 30deg[^"]*">/, 'the figure is not turned as one object');
      assert.doesNotMatch(edited, /<img [^>]*rotate/, 'a picture of the figure is turned by itself');
      const caption = await page.evaluate(`getComputedStyle(document.querySelector(${js(IMG)}).closest('figure')).rotate`);
      assert.equal(caption, '30deg');
      const size = await fields(page);
      assert.deepEqual({ w: size.w, h: size.h }, { w: rest.w, h: rest.h }, `W and H at 0° ${js(rest)} and at 30° ${js(size)}`);
      await assertTurnedFrame(page, 30, size);
      await checkEdit(page, `r15-1-angle-${platform}.html`, page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`a figure with a caption turned by its rotate handle is framed turned, and its corner grip resizes it with the corner across kept (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, IMG);
      await dragRotor(page, 40);
      const deg = await fieldValue(page, 'angle');
      assert.ok(deg >= 35 && deg <= 45, `the figure is turned to ${deg}°`);
      const turned = await render(page);
      assert.match(turned, new RegExp(`<figure class="figure-box" style="[^"]*\\brotate: ${deg}deg[^"]*">`), 'the figure is not turned as one object');
      const before = await fields(page);
      await assertTurnedFrame(page, deg, before);
      const o = await overlay(page);
      const { nw, se } = o.grips;
      const u = { x: (se.x - nw.x) / dist(nw, se), y: (se.y - nw.y) / dist(nw, se) };
      await mouse(page, 'mouseMoved', se.x, se.y);
      await mouse(page, 'mousePressed', se.x, se.y, { button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 10; i++) await mouse(page, 'mouseMoved', se.x + 6 * i * u.x, se.y + 6 * i * u.y, { button: 'left', buttons: 1 });
      await frames(page);
      const readout = await page.evaluate(`(() => { const o = document.querySelector('.beeson-offset'); return o && !o.hidden ? o.textContent : ''; })()`);
      await mouse(page, 'mouseReleased', se.x + 60 * u.x, se.y + 60 * u.y, { button: 'left', buttons: 0, clickCount: 1 });
      await frames(page);
      const after = await fields(page);
      assert.ok(after.w > before.w + 20 && after.h > before.h + 20, `the fields are ${js(after)} after the resize, against ${js(before)}`);
      const m = /w:\s*(\d+)\s*px\s*h:\s*(\d+)\s*px/.exec(readout);
      assert.ok(m && near(Number(m[1]), after.w, 1) && near(Number(m[2]), after.h, 1), `the readout ${js(readout)} against the fields ${js(after)}`);
      assert.equal(await fieldValue(page, 'angle'), deg);
      await assertTurnedFrame(page, deg, after);
      const kept = (await overlay(page)).grips.nw;
      assert.ok(dist(kept, nw) <= 3, `the corner nw moved from ${js(nw)} to ${js(kept)}`);
      await checkEdit(page, `r15-1-resize-${platform}.html`, turned);
      assert.deepEqual(page.errors, []);
    });

    test(`X and Y of a turned figure and text are those of the unturned box, and a typed X or Y reads back (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, IMG);
      const rest = await fields(page);
      await typeField(page, 'angle', 30);
      const figure = await fields(page);
      assert.ok(near(figure.x, rest.x, 1) && near(figure.y, rest.y, 1), `the figure at 0° ${js(rest)} and at 30° ${js(figure)}`);
      let last = await render(page);
      for (const [id, v] of [['x', 1100], ['y', 100]]) {
        last = await render(page);
        await typeField(page, id, v);
        assert.equal(await fieldValue(page, id), v, `a typed ${id} of ${v}`);
      }
      assert.equal(await fieldValue(page, 'angle'), 30);
      await checkEdit(page, `r15-1-position-${platform}.html`, last);

      await clickText(page, 'section.present > h2');
      await press(page, 'Escape');
      await frames(page);
      const h2 = await fields(page);
      await typeField(page, 'angle', 30);
      const turnedH2 = await fields(page);
      assert.ok(near(turnedH2.x, h2.x, 1) && near(turnedH2.y, h2.y, 1), `the heading at 0° ${js(h2)} and at 30° ${js(turnedH2)}`);
      assert.deepEqual(page.errors, []);
    });

    test(`X and Y of a turned group are those of its unturned frame, and a typed X reads back (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupOnFigures(page, platform);
      const rest = await fields(page);
      await typeField(page, 'angle', 30);
      const group = await fields(page);
      assert.ok(near(group.x, rest.x, 1) && near(group.y, rest.y, 1), `the group at 0° ${js(rest)} and at 30° ${js(group)}`);
      const last = await render(page);
      await typeField(page, 'x', 200);
      assert.equal(await fieldValue(page, 'x'), 200);
      await checkEdit(page, `r15-1-group-x-${platform}.html`, last);
      assert.deepEqual(page.errors, []);
    });

    test(`a figure turned by the field Angle or by its rotate handle is not reported over the texts that its picture does not cover (${platform})`, async (t) => {
      const page = await load(t, platform);
      const checked = async () => {
        await exec(page, 'slide.layout.wide');
        await exec(page, 'slide.layout.content');
        await frames(page);
        await clickText(page, IMG);
        return overflow(page);
      };
      await clickText(page, IMG);
      assert.deepEqual((await overflow(page)).outlined, []);
      await typeField(page, 'angle', 30);
      let s = await checked();
      assert.equal(await fieldValue(page, 'angle'), 30, 'the change of the layout took the angle off');
      assert.deepEqual(s.outlined, [], `at 30° by the field: ${js(s)}`);
      assert.doesNotMatch(s.message, / (under|over) a /);
      await typeField(page, 'angle', 0);
      await dragRotor(page, 38);
      assert.ok((await fieldValue(page, 'angle')) > 30, 'the rotate handle did not turn the figure');
      s = await checked();
      assert.deepEqual(s.outlined, [], `after the rotate handle: ${js(s)}`);
      assert.doesNotMatch(s.message, / (under|over) a /);
      await typeField(page, 'x', 200);
      s = await checked();
      assert.ok(s.outlined.includes('p'), `the turned figure over the paragraph: ${js(s)}`);
      assert.match(s.message, /\d+ texts? (is|are) under a picture/);
      assert.deepEqual(page.errors, []);
    });

    test(`a group selected with another object is drawn as one frame, beside the frame of the other object (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupOnFigures(page, platform);
      const alone = (await overlay(page)).frames;
      assert.equal(alone.length, 1, `the group alone is drawn as ${js(alone)}`);
      const h2 = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > h2').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
      await click(page, h2, { modifiers: 'Shift' });
      await frames(page);
      assert.equal((await page.evaluate('window.BeesonEditor.selection().length')), 3);
      const both = (await overlay(page)).frames;
      assert.equal(both.length, 2, `the group with the heading is drawn as ${js(both)}`);
      const union = both.find((f) => f.union);
      assert.ok(union && near(union.width, alone[0].width, 2) && near(union.height, alone[0].height, 2), `the frame of the group ${js(union)} against ${js(alone[0])}`);
      assert.deepEqual(page.errors, []);
    });

    test(`a typed Height of a group turned by 180 degrees reads back as typed (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupOnFigures(page, platform);
      await typeField(page, 'angle', 180);
      const last = await render(page);
      await typeField(page, 'height', 700);
      assert.equal(await fieldValue(page, 'height'), 700);
      await checkEdit(page, `r15-1-group-height-${platform}.html`, last);
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('groups with a turned member, and cancelled turns', () => {
  const DECK = 'test-deck.html';
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const PLATFORMS = ['mac', 'other'];
  const STOCK = readFileSync(DECK, 'utf8');

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

  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo')?.label`);

  async function groupTurnedFigure(page, platform) {
    await click(page, IMG);
    await typeField(page, 'angle', 20);
    await groupOnFigures(page, platform);
  }

  async function cancelledTurn(page) {
    const at = await dragRotor(page, 40, true);
    await press(page, 'Escape');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1 });
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`a group with a member turned by itself, turned by the field or by its rotate handle and reset, gives back the grouped file (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupTurnedFigure(page, platform);
      const grouped = await render(page);
      assert.match(grouped, /<figure class="figure-box" style="rotate: 20deg[^"]*" data-group/);
      await typeField(page, 'angle', 30);
      await typeField(page, 'angle', 75);
      const turned = await render(page);
      await exec(page, 'arrange.resetRotation');
      await frames(page);
      assert.equal(await render(page), grouped, 'Reset Rotation after the typed 30 and 75');
      await undoes(page, turned, 'Reset Rotation');
      await undo(page);
      await undo(page);
      await undo(page);
      assert.equal(await render(page), grouped);
      await dragRotor(page, 30);
      await dragRotor(page, 45);
      await exec(page, 'arrange.resetRotation');
      await frames(page);
      assert.equal(await render(page), grouped, 'Reset Rotation after the turns by the rotate handle');
      assert.deepEqual(page.errors, []);
    });

    for (const own of [false, true]) {
      test(`a drag of the rotate handle cancelled by Esc does not change the place that Reset Rotation gives back${own ? ', with a member turned by itself' : ''} (${platform})`, async (t) => {
        const page = await load(t, platform);
        if (own) await groupTurnedFigure(page, platform);
        else await groupOnFigures(page, platform);
        const grouped = await render(page);
        await typeField(page, 'angle', 30);
        const thirty = await render(page);
        const label = await undoLabel(page);
        await cancelledTurn(page);
        assert.equal(await render(page), thirty, 'the text after Esc');
        assert.equal(await undoLabel(page), label);
        await exec(page, 'arrange.resetRotation');
        await frames(page);
        assert.equal(await render(page), grouped, 'Reset Rotation after the cancelled drag');
        await undoes(page, thirty, 'Reset Rotation');
        assert.deepEqual(page.errors, []);
      });
    }

    test(`Esc during a drag of a row of the Object List cancels it, and the release leaves the order and the file (${platform})`, async (t) => {
      const page = await load(t, platform);
      await press(page, platform === 'mac' ? 'Mod+Shift+L' : 'Alt+F10');
      await frames(page);
      const ROW = '.beeson-edit-objects .row';
      const names = () => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].map((r) => r.querySelector('.name')?.textContent)`);
      const state = () => page.evaluate(`(() => { const d = document.querySelector('.beeson-edit-objects .drop'); return { drop: !!d && !d.hidden, dragged: document.querySelectorAll('.beeson-edit-objects .row.dragged').length }; })()`);
      const rows = await names();
      assert.ok(rows.length >= 3, `the rows are ${js(rows)}`);
      const box = (n) => page.evaluate(`(() => { const r = document.querySelectorAll(${js(ROW)})[${n}].getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2, bottom: r.bottom }; })()`);
      const a = await box(0), z = await box(rows.length - 1);
      const label = await undoLabel(page);
      await drag(page, a, { dy: z.bottom + 10 - a.y, steps: 8, hold: true });
      assert.deepEqual(await state(), { drop: true, dragged: 1 }, 'the drag of the row did not start');
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await state(), { drop: false, dragged: 0 }, 'the drag after Esc');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x, y: z.bottom + 10, button: 'left', clickCount: 1 });
      await frames(page);
      assert.deepEqual(await names(), rows);
      assert.equal(await undoLabel(page), label);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`Esc during a drag of a thumbnail of the navigator cancels it, and the release leaves the file (${platform})`, async (t) => {
      const page = await load(t, platform);
      const THUMB = '.beeson-edit-nav .rows .row';
      const n = await page.evaluate(`document.querySelectorAll(${js(THUMB)}).length`);
      assert.ok(n >= 4, `the navigator shows ${n} thumbnails`);
      const box = (i) => page.evaluate(`(() => { const r = document.querySelectorAll(${js(THUMB)})[${i}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; })()`);
      const a = await box(1), z = await box(3);
      const label = await undoLabel(page);
      await drag(page, a, { dy: z.y + z.h / 2 - a.y, steps: 8, hold: true });
      await press(page, 'Escape');
      await frames(page);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x, y: z.y + z.h / 2, button: 'left', clickCount: 1 });
      await frames(page);
      assert.equal(await undoLabel(page), label);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('the hold at multiples of 45 degrees', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r20-5.html';
  const SHIFT = 8;
  const FREE = { mac: 4, other: 1 };
  const QR = 'section.present > .qr';
  const P = 'section.present > p';

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
  const exec = (page, id, args) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${args ? `, ${js(args)}` : ''})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const angle = (page, selector) => page.evaluate(`document.querySelector(${js(`.reveal .slides ${selector}`)}).style.rotate`);

  async function load(t, platform, slide) {
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
    await page.evaluate(`Reveal.slide(${slide})`);
    await frames(page);
    return page;
  }

  const shown = (page) => page.evaluate(`(() => {
  const out = document.querySelector('.beeson-offset');
  const spoke = document.querySelector('.beeson-guide.spoke');
  const on = spoke && !spoke.hidden && spoke.getClientRects().length > 0;
  const r = on ? spoke.getBoundingClientRect() : null;
  return { readout: out && !out.hidden ? out.textContent : null, spoke: on ? { x: r.left + r.width / 2, y: r.top + r.height / 2, deg: spoke.style.rotate } : null };
})()`);

  async function turnBy(page, c, deg, mods = 0) {
    const r = await center(page, '.beeson-rotor');
    const mouse = (type, x, y, extra) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const radius = Math.hypot(r.x - c.x, r.y - c.y), from = Math.atan2(r.y - c.y, r.x - c.x);
    let at = r, was = 0, held = mods;
    const to = async (d, m = held) => {
      held = m;
      for (let i = 1; i <= 10; i++) {
        const a = from + ((was + (d - was) * (i / 10)) * Math.PI) / 180;
        at = { x: c.x + radius * Math.cos(a), y: c.y + radius * Math.sin(a) };
        await mouse('mouseMoved', at.x, at.y, { button: 'left', buttons: 1, modifiers: m });
      }
      was = d;
      await frames(page);
    };
    await mouse('mouseMoved', r.x, r.y, { modifiers: mods });
    await mouse('mousePressed', r.x, r.y, { button: 'left', buttons: 1, clickCount: 1, modifiers: mods });
    await to(deg);
    const release = () => mouse('mouseReleased', at.x, at.y, { button: 'left', buttons: 0, clickCount: 1, modifiers: held }).then(() => frames(page));
    release.to = to;
    return release;
  }

  const near = (a, b, d = 2) => Math.abs(a.x - b.x) <= d && Math.abs(a.y - b.y) <= d;

  for (const platform of PLATFORMS) {
    test(`a turn by 43 degrees is held at 45 with an angle guide through the center (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      await clickText(page, `.reveal ${QR}`);
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-rotor').title`), 'Drag to rotate, held at multiples of 45°, with Shift in steps of 15°');
      const c = await center(page, `.reveal ${QR}`);
      const release = await turnBy(page, c, 43);
      const during = await shown(page);
      assert.equal(during.readout, '45°');
      assert.ok(during.spoke, 'the angle guide is not drawn');
      assert.ok(near(during.spoke, c), `the angle guide at ${js(during.spoke)} does not run through the center ${js(c)}`);
      assert.equal(during.spoke.deg, '45deg');
      await release();
      assert.equal((await shown(page)).spoke, null, 'the angle guide is kept after the release');
      await byteExact(page, [['style="width: 300px"', 'style="width: 300px; rotate: 45deg"']]);
      await undo(page);
      await byteExact(page);
      assert.deepEqual(page.errors, []);
    });

    test(`a turn on from 43 to 50 degrees leaves the hold and follows the pointer to the degree (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      await clickText(page, `.reveal ${QR}`);
      const release = await turnBy(page, await center(page, `.reveal ${QR}`), 43);
      assert.equal((await shown(page)).readout, '45°');
      await release.to(50);
      assert.deepEqual(await shown(page), { readout: '50°', spoke: null });
      await release();
      await byteExact(page, [['style="width: 300px"', 'style="width: 300px; rotate: 50deg"']]);
      assert.deepEqual(page.errors, []);
    });

    test(`the free modifier turns the hold off, and Shift keeps its steps of 15 degrees (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      await clickText(page, `.reveal ${QR}`);
      const c = await center(page, `.reveal ${QR}`);
      let release = await turnBy(page, c, 42);
      assert.equal((await shown(page)).readout, '45°');
      await release.to(43, FREE[platform]);
      assert.deepEqual(await shown(page), { readout: '43°', spoke: null });
      await release();
      await byteExact(page, [['style="width: 300px"', 'style="width: 300px; rotate: 43deg"']]);
      await undo(page);
      release = await turnBy(page, c, 37, SHIFT);
      assert.deepEqual(await shown(page), { readout: '30°', spoke: null });
      await release();
      await byteExact(page, [['style="width: 300px"', 'style="width: 300px; rotate: 30deg"']]);
      assert.deepEqual(page.errors, []);
    });

    test(`the hold acts on the absolute angle, and a turn back to 0 gives back the file (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      await clickText(page, `.reveal ${QR}`);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await exec(page, 'arrange.setRotation', { deg: 20 });
      await frames(page);
      const c = await center(page, `.reveal ${QR}`);
      let release = await turnBy(page, c, 23);
      assert.equal((await shown(page)).readout, '45°');
      await release();
      await byteExact(page, [['style="width: 300px"', 'style="width: 300px; rotate: 45deg"']]);
      release = await turnBy(page, c, -42);
      assert.equal((await shown(page)).readout, '0°');
      await release();
      await byteExact(page);
      assert.equal(await angle(page, QR), '');
      assert.deepEqual(page.errors, []);
    });

    test(`a group is held by the angle of its first member, and its other member keeps its angle to it (${platform})`, async (t) => {
      const page = await load(t, platform, 1);
      await clickText(page, `.reveal ${P}`);
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 2, 'the group is not selected');
      const c = await center(page, '.beeson-frame.union');
      const release = await turnBy(page, c, 88);
      const during = await shown(page);
      assert.equal(during.readout, '90°');
      assert.ok(during.spoke && near(during.spoke, c), `the angle guide at ${js(during.spoke)} does not run through the center of the group ${js(c)}`);
      await release();
      assert.deepEqual([await angle(page, P), await angle(page, QR)], ['90deg', '100deg']);
      const edited = await render(page);
      assert.match(edited, /<p data-group="g1" style="rotate: 90deg; translate: -?\d+px -?\d+px">Export/);
      assert.match(edited, /<div class="qr" data-qr="two" style="width: 240px; rotate: 100deg; translate: -?\d+px -?\d+px" data-group="g1"><\/div>/);
      await undo(page);
      await byteExact(page);
      assert.deepEqual(page.errors, []);
    });

    test(`a multiple selection is held by its first object, and the other object turns by the same delta (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await clickText(page, `.reveal ${P}`);
      await press(page, 'Escape');
      await click(page, `.reveal ${QR}`, { modifiers: 'Shift' });
      await frames(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['p', 'div']);
      const p0 = await center(page, `.reveal ${P}`), q0 = await center(page, `.reveal ${QR}`);
      const release = await turnBy(page, p0, 43);
      const during = await shown(page);
      assert.equal(during.readout, '45°');
      assert.ok(during.spoke && near(during.spoke, p0), `the angle guide at ${js(during.spoke)} does not run through the center of the paragraph ${js(p0)}`);
      await release();
      assert.deepEqual([await angle(page, P), await angle(page, QR)], ['45deg', '65deg']);
      assert.ok(near(await center(page, `.reveal ${P}`), p0) && near(await center(page, `.reveal ${QR}`), q0), 'an object is not turned about its own center');
      assert.match(await render(page), /<p style="rotate: 45deg">Export[\s\S]*<div class="qr" data-qr="three" style="width: 240px; rotate: 65deg"><\/div>/);
      assert.deepEqual(page.errors, []);
    });

    test(`Esc during a drag held at 45 degrees puts the page and the file back (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      await clickText(page, `.reveal ${QR}`);
      const release = await turnBy(page, await center(page, `.reveal ${QR}`), 43);
      assert.equal((await shown(page)).readout, '45°');
      assert.equal(await angle(page, QR), '45deg');
      await press(page, 'Escape');
      await release();
      assert.deepEqual(await shown(page), { readout: null, spoke: null });
      assert.equal(await angle(page, QR), '');
      assert.equal(await render(page), page.source);
      assert.equal((await state(page, 'edit.undo')).enabled, false, 'the cancelled drag is in the history');
      assert.deepEqual(page.errors, []);
    });
  }
});
