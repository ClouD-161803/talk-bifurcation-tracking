// turns by the rotate handle, the field Angle, and Reset Rotation of elements, figures with
// captions, and groups, with the hold at multiples of 45 degrees and Esc during a turn

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';

// regression tests of R8.2 on both platforms with trusted input. the text of a text column fitted by a
// change of layout to Split is drawn in the color of the text column. the rotate grip of a selected
// element is drawn on a stem above the top center of its frame, outside its text, and the handle
// of a block is drawn clear of the grips. a group is turned by its own rotate grip and by the field
// Angle of the Arrange pane, each member about the center of the group. a thumbnail of the
// navigator is drawn only from typeset formulas. after each edit the text is checked byte for byte,
// after an undo and a redo, and after a save and an open
describe('the rotate handle drawn above the frame', () => {
  const PLATFORMS = ['mac', 'other'];
  // the slide of the demo deck with the figure and its caption, under a paragraph and over a list
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  let saves = 0;
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));

  // inScope asserts that the edit writes only what the scope rule allows, besides the problems of the
  // text before it
  function inScope(edited, source) {
    const now = textProblems(edited, THEME);
    for (const p of textProblems(source, THEME)) {
      const i = now.indexOf(p);
      if (i >= 0) now.splice(i, 1);
    }
    assert.deepEqual(now, []);
  }

  // the editor on the slide n of the demo deck served over HTTP, in a window of 1600 by 1000 px as
  // in the shoot of the council, in the mode of the slides given, with the Format tab shown. with
  // watch set, every drawing of a thumbnail is checked for raw TeX from before the open on
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

  // roundTrip checks the text before byte for byte after undos undos, the edit after as many redos,
  // and an open of the saved edit without problems, which is the text before the next check
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r8-2-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  const release = (page, at) => page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });

  // finding 1: Change Layout to Split set the text of the text column in the style Small, which the theme colors
  // gray for a note on a white or black slide, and thus drew it gray on the black text column
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

  // the frame of the selection, the rotate grip, its stem, the handle of a block, and the shown grips,
  // in CSS px of the window, and the boxes of the lines of the text of the selected element
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

  // the paragraphs of the demo deck stacked close between a heading and a list or a display
  const STACKED = [
    [2, 'Design the complete slide'],
    [3, 'You can type LaTeX'],
    [3, 'The Coriolis terms couple'],
    [4, 'Export your matplotlib'],
    [5, 'Copy-paste the code'],
    [10, 'Videos are shown'],
  ];

  // finding 2: the rotate grip of a text block was drawn inside its frame over its first line, and
  // the handle of the block over its upper left grip
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
      // the grip turns the last paragraph, under the heading of slide 11
      const v = await chrome(page);
      await drag(page, { x: v.rotor.x, y: v.rotor.y }, { dx: 120, dy: 40 });
      await frames(page);
      assert.match(await render(page), /<p[^>]* style="rotate: \d+deg">Videos are shown/, 'the grip does not turn the paragraph');
      await roundTrip(page);

      // an image has its grip on the same stem above its frame
      await page.evaluate(`Reveal.slide(${FIGURE})`);
      await frames(page);
      await click(page, IMG);
      await frames(page);
      const img = await chrome(page);
      assert.ok(img.rotor && img.rotor.bottom < img.frame.top && img.stem, `the rotate grip of the image at ${js(img.rotor)} is not on a stem above its frame at ${js(img.frame)}`);
    });
  }

  // the members of the selected group, each with its angle in degrees and its center on the screen. a figure is
  // turned at its picture, i.e. its shown image, since its caption is not turned with it
  const members = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => {
  const pic = el.matches('figure, .figure-box, .plate') ? [...el.querySelectorAll('img, video')].find((m) => m.getBoundingClientRect().width) ?? el : el;
  const r = pic.getBoundingClientRect();
  const deg = (parseFloat(getComputedStyle(pic).rotate) || 0) + (pic === el ? 0 : parseFloat(getComputedStyle(el).rotate) || 0);
  return { tag: el.localName, deg, x: r.left + r.width / 2, y: r.top + r.height / 2 };
})`);
  // the point p turned by deg degrees about the point c
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

  // the paragraph and the figure of slide 5 grouped with the key of the platform, which selects the group
  async function grouped(page, platform) {
    await click(page, IMG);
    await click(page, '.reveal section.present > p', { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Mod+Alt+G' : 'Mod+G');
    await frames(page);
    assert.match(await render(page), /<p data-group="g\d+">Export/, 'the paragraph is not grouped');
    page.source = await render(page);
    assert.deepEqual((await members(page)).map((m) => m.tag).sort(), ['figure', 'p'], 'the group is not selected');
  }

  // finding 3: a group was drawn without a rotate grip, and the field Angle set the angle of each
  // member about its own center
  for (const platform of PLATFORMS) {
    test(`a group is turned by its rotate grip about its center as one entry of the history (${platform})`, async (t) => {
      const page = await load(t, platform);
      await grouped(page, platform);
      const v = await chrome(page);
      assert.ok(v.rotor, 'a selected group is drawn without a rotate grip');
      assert.ok(v.rotor.bottom < v.frame.top && Math.abs(v.rotor.x - v.frame.x) <= 1 && v.stem, `the rotate grip of the group at ${js(v.rotor)} is not on a stem above the middle of its frame at ${js(v.frame)}`);
      const before = await members(page);
      const c = { x: v.frame.x, y: v.frame.y };
      // a drag of the grip from above the center to the right of the center turns the group by 90 degrees
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
      // the figure, with its caption in it, is turned as one object, with the angle on the figure
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

  // every drawing of a thumbnail with a shown formula of the deck in raw TeX, kept in
  // window.rawThumbs, and the number of drawings of the thumbnail of slide 5 with typeset formulas
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

  // finding 4: the thumbnail of a slide was drawn before its formulas were typeset, and showed raw
  // TeX, e.g. while the image of slide 5 was rotated right after the deck was opened
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
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R15.1 on both platforms, after finding 1 and finding 5 of the judge opus in
// round 6: a figure with a caption is turned as one object, with its frame, its grips, and its
// rotate handle turned with it, and its grips still resize it. the fields X and Y of a turned
// figure, text, or group give its unturned box, a turned figure is checked against the texts by
// its turned picture, and a group selected with another object is drawn as one frame
describe('a figure with a caption turned as one', () => {
  const DECK = 'test-deck.html';
  // the index of the figures slide in index.html
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
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
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

  // an undo gives the text before and a redo the edited text byte for byte, and the saved text is
  // opened again without problems
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

  // the shown frames of the selection, the grips at their centers with their cursors, and the
  // center of the rotate handle, in CSS px of the viewport
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

  // the frame of the figure, its grips, and its rotate handle all turned by deg, with the frame as
  // large as the fields W and H give it, and each grip with the cursor of its turned direction
  async function assertTurnedFrame(page, deg, size) {
    const o = await overlay(page);
    assert.equal(o.frames.length, 1, `the frames are ${js(o.frames)}`);
    const [f] = o.frames;
    assert.equal(f.rotate, `${deg}deg`, `the frame is ${js(f)}, not turned by ${deg}°`);
    // the frame is drawn 8 px outside the box of the figure
    assert.ok(near(f.width, size.w * o.scale + 16, 3) && near(f.height, size.h * o.scale + 16, 3), `the frame ${js(f)} against the fields ${js(size)} at the scale ${o.scale}`);
    const g = o.grips;
    for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) assert.ok(g[h], `the grip ${h} is not drawn: ${js(g)}`);
    assert.ok(sameAngle(angle(g.nw, g.ne), deg), `the top edge from ${js(g.nw)} to ${js(g.ne)} is not turned by ${deg}°`);
    assert.ok(sameAngle(angle(g.nw, g.sw), deg + 90), `the left edge from ${js(g.nw)} to ${js(g.sw)} is not turned by ${deg}°`);
    assert.ok(near(dist(g.nw, g.ne), f.width, 3) && near(dist(g.nw, g.sw), f.height, 3), `the grips ${js(g)} are not at the corners of the frame ${js(f)}`);
    assert.ok(o.rotor && sameAngle(angle(g.n, o.rotor), deg - 90, 3), `the rotate handle at ${js(o.rotor)} is not above the grip n at ${js(g.n)} on the turned frame`);
    // the cursor of a grip at its direction turned by deg, to the nearest eighth of a turn
    const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
    const DIRS = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
    for (const [h, d] of Object.entries(DIRS)) {
      const want = CURSORS[Math.round((((d + deg) % 360) + 360) % 360 / 45) % 4];
      assert.equal(g[h].cursor, want, `the grip ${h} at ${deg}° has the cursor ${g[h].cursor}`);
    }
  }

  // a drag of the rotate handle about the center of the figure by the turn of deg degrees, released
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

  // the texts of the figures slide that are outlined as an overflow, and the message of the state
  const overflow = async (page) => ({
    outlined: await page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('.beeson-overflow')].map((el) => el.localName)`),
    message: (await page.evaluate('window.BeesonEditor.status()')).message,
  });

  // the paragraph and the figure of the figures slide made one group with the key of Group
  async function groupOnFigures(page, platform) {
    await clickText(page, IMG);
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    // finding 1: at an angle of 30 typed into the field, the frame was the upright box of the
    // figure, about 908 slide px wide, with upright grips
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
      assert.deepEqual(errors(page), []);
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
      // the grip se dragged outward along the turned diagonal of the frame
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
      assert.deepEqual(errors(page), []);
    });

    // finding 1: X and Y read 1060 and 58 at 30°, against 1200 and 160 at 0°
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
      assert.deepEqual(errors(page), []);
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
      assert.deepEqual(errors(page), []);
    });

    // finding 1: after the turn by 30 degrees, the title bar read "5 texts lie over a figure". an
    // overlap is reported only after a change of the layout or an insert, hence the layout of the
    // slide is changed and changed back before each look at the report
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
      // the turned figure moved over the paragraph is reported at the next check
      await typeField(page, 'x', 200);
      s = await checked();
      assert.ok(s.outlined.includes('p'), `the turned figure over the paragraph: ${js(s)}`);
      assert.match(s.message, /\d+ texts? (is|are) under a picture/);
      assert.deepEqual(errors(page), []);
    });

    // finding 5: the group of the paragraph and the figure with the heading was drawn as three frames
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
      assert.deepEqual(errors(page), []);
    });

    // item 5: a typed Height of 700 of a group turned by 180 degrees read 709, since the paragraph
    // rewrapped by the scale kept the upright top of its box, which is its bottom on the screen
    test(`a typed Height of a group turned by 180 degrees reads back as typed (${platform})`, async (t) => {
      const page = await load(t, platform);
      await groupOnFigures(page, platform);
      await typeField(page, 'angle', 180);
      const last = await render(page);
      await typeField(page, 'height', 700);
      assert.equal(await fieldValue(page, 'height'), 700);
      await checkEdit(page, `r15-1-group-height-${platform}.html`, last);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R16.1 on both platforms, after the findings G1 to G3 of the second review of
// round 7: a figure whose picture has a rotate of its own is made upright by a typed 0 and by Reset
// Rotation, the readout of a drag or a nudge of a turned element gives the corner of the fields X
// and Y, and a typed Width or Height of a turned group keeps its X and Y
describe('Reset Rotation and readouts of turned figures', () => {
  const DECK = 'test-deck.html';
  // the index of the figures slide in index.html
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const PLATFORMS = ['mac', 'other'];
  const STOCK = readFileSync(DECK, 'utf8');
  // the demo deck in the form that the editor saved before round 7, with both images of the figure
  // turned by 20 degrees
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

  // the editor on the demo deck at the figures slide, opened from text, with the script prep run on
  // the page before the open
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

  // one undo gives the text before, and one redo the edited text, byte for byte
  async function undoes(page, before, what) {
    const edited = await render(page);
    assert.notEqual(edited, before, `${what} did not change the text`);
    await undo(page);
    assert.equal(await render(page), before, `an undo of ${what}`);
    await redo(page);
    assert.equal(await render(page), edited, `a redo of ${what}`);
    return edited;
  }

  // the start tags of the figure and of its two images in the text, and the computed angles of the three
  async function figureState(page) {
    const text = await render(page);
    const start = text.indexOf('<figure class="figure-box"');
    const tags = text.slice(start, text.indexOf('</figure>', start)).match(/<(figure|img)\b[^>]*>/g);
    const turned = await page.evaluate(`(() => { const f = document.querySelector('section.present figure'); return [f, ...f.querySelectorAll('img')].map((el) => getComputedStyle(el).rotate); })()`);
    return { tags, turned };
  }

  // the figure and both of its images upright, in the text and on the page, with the fields of the
  // upright figure rest and Reset Rotation dimmed
  async function assertUpright(page, rest) {
    const s = await figureState(page);
    for (const tag of s.tags) assert.doesNotMatch(tag, /rotate/, `a part of the figure is turned: ${js(s.tags)}`);
    assert.deepEqual(s.turned, ['none', 'none', 'none'], `the figure and its images are drawn at ${js(s.turned)}`);
    assert.equal(await fieldValue(page, 'angle'), 0);
    const f = await fields(page);
    for (const k of ['x', 'y', 'w', 'h']) assert.ok(near(f[k], rest[k], 1), `the fields ${js(f)} against the upright figure ${js(rest)}`);
    assert.equal(await enabled(page, 'arrange.resetRotation'), false);
  }

  // the x and y of the readout of a move, at the frame or at the pointer, or null where it is hidden
  async function readout(page) {
    const text = await page.evaluate(`(() => { const o = document.querySelector('.beeson-offset'); return o && !o.hidden && o.getClientRects().length ? o.textContent : ''; })()`);
    const m = /x:\s*(-?\d+)\s*px\s+y:\s*(-?\d+)\s*px/.exec(text);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  }

  // a nudge by ArrowRight, whose readout gives the fields X and Y after it
  async function assertNudgeReadout(page, what) {
    await page.evaluate('document.activeElement?.blur()');
    await press(page, 'ArrowRight');
    await frames(page);
    const r = await readout(page);
    const f = await fields(page);
    assert.ok(r && near(r.x, f.x, 1) && near(r.y, f.y, 1), `the readout of a nudge of ${what} is ${js(r)}, and the fields read ${js(f)}`);
  }

  // a drag from the point at by -100 and 30 screen px, whose readout before the release gives the
  // fields X and Y after the release
  async function assertDragReadout(page, at, what) {
    await drag(page, at, { dx: -100, dy: 30, hold: true });
    const r = await readout(page);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x - 100, y: at.y + 30, button: 'left', clickCount: 1 });
    await frames(page);
    const f = await fields(page);
    assert.ok(r && near(r.x, f.x, 1) && near(r.y, f.y, 1), `the readout of a drag of ${what} is ${js(r)}, and the fields read ${js(f)}`);
  }

  const centerOf = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  // the paragraph and the figure of the figures slide made one group with the key of Group
  async function groupOnFigures(page, platform) {
    await clickText(page, IMG);
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    await frames(page);
  }

  // a drag of the shown rotate handle by deg degrees about the center of the frame of the selection
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

  // the fields of the upright figure of the demo deck
  async function uprightFields(t, platform) {
    const page = await load(t, platform);
    await clickText(page, IMG);
    const rest = await fields(page);
    await page.close();
    return rest;
  }

  for (const platform of PLATFORMS) {
    // G1: a typed 0 left the figure at rotate: 340deg with its images at 20deg, X and Y at 956 and
    // -31, and Reset Rotation dimmed
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

    // G1: the rotate handle of the figure also gives the angle of its images to the figure
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

    // G1: on the demo deck, a picture turned alone to 50 and its figure then typed to 0 left the
    // figure at rotate: 310deg with the images at 50deg
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

    // G2: at 30 degrees, a nudge of the figure read x 1023 and y 68 against the fields 1201 and 160,
    // and a drag read x 843 and y 120 against 1021 and 212
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

    // G3: at 180 degrees, W 1500 moved the group from X 120 and Y 160 to X 300 and Y 277, and H 700
    // moved it to X 551 and Y 334
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

// regression tests of R17.9 on both platforms, after the entries N2 and N3 of the checks of round 7
// and a note of R16.1: a typed Width or Height of a turned figure keeps its X and Y, a group turned
// and reset gives back the file before the turns, and Esc during a drag of the rotate handle puts
// both images of the other mode and of the shown mode back
describe('sizes of turned figures, and Esc during turns', () => {
  const DECK = 'test-deck.html';
  // the index of the figures slide in index.html
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const PLATFORMS = ['mac', 'other'];
  const STOCK = readFileSync(DECK, 'utf8');
  // the demo deck in the form that the editor saved before round 7, with both images of the figure
  // turned by 20 degrees
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

  // the editor on the demo deck at the figures slide, opened from text, with the script prep run on
  // the page before the open
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

  // one undo gives the text before, and one redo the edited text, byte for byte
  async function undoes(page, before, what) {
    const edited = await render(page);
    assert.notEqual(edited, before, `${what} did not change the text`);
    await undo(page);
    assert.equal(await render(page), before, `an undo of ${what}`);
    await redo(page);
    assert.equal(await render(page), edited, `a redo of ${what}`);
    return edited;
  }

  // the start tags of the figure and of its two images in the text, and the computed angles of the three
  async function figureState(page) {
    const text = await render(page);
    const start = text.indexOf('<figure class="figure-box"');
    const tags = text.slice(start, text.indexOf('</figure>', start)).match(/<(figure|img)\b[^>]*>/g);
    const turned = await page.evaluate(`(() => { const f = document.querySelector('section.present figure'); return [f, ...f.querySelectorAll('img')].map((el) => getComputedStyle(el).rotate); })()`);
    return { tags, turned };
  }

  // the paragraph and the figure of the figures slide made one group with the key of Group
  async function groupOnFigures(page, platform) {
    await click(page, IMG);
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    await frames(page);
  }

  // a drag of the shown rotate handle by deg degrees about the center of the frame of the
  // selection, with the button held at the end where hold is set
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
    // N2: at 90 degrees, a typed Width of 500 moved the figure from X 1200 and Y 160 to 1195 and 155,
    // and a typed Height of 800 to 1220 and 180
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

    // N3: a group turned to 30, then to 75, and reset kept translate: 1px 0px on the figure
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

    // the note of R16.1: a cancelled drag of the rotate handle put the shown image back and left the
    // image of the other mode turned
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

// regression tests of R18.5 on both platforms, after the finding C1 of the third review of round 7:
// in a deck in which only the image of one mode of a figure has a rotate, an undo of a typed Angle,
// of Reset Rotation, or of a turn by the rotate handle gives each image of the pair its own place
// back, and thus the opened text byte for byte
describe('undo of turns where one image is turned', () => {
  const DECK = 'test-deck.html';
  // the index of the figures slide in index.html
  const FIGURES = 4;
  const IMG = 'section.present figure img.for-light';
  const PLATFORMS = ['mac', 'other'];
  const STOCK = readFileSync(DECK, 'utf8');
  // the demo deck with the image of the light mode of the figure turned by 20 degrees, and the
  // image of the dark mode upright, as a deck edited by hand can have them
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

  // the editor on the demo deck at the figures slide, opened from text, with the script prep run on
  // the page before the open
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

  // one undo gives the text before, and one redo the edited text, byte for byte
  async function undoes(page, before, what) {
    const edited = await render(page);
    assert.notEqual(edited, before, `${what} did not change the text`);
    await undo(page);
    assert.equal(await render(page), before, `an undo of ${what}`);
    await redo(page);
    assert.equal(await render(page), edited, `a redo of ${what}`);
    return edited;
  }

  // the start tags of the figure and of its two images in the text, and the computed angles of the three
  async function figureState(page) {
    const text = await render(page);
    const start = text.indexOf('<figure class="figure-box"');
    const tags = text.slice(start, text.indexOf('</figure>', start)).match(/<(figure|img)\b[^>]*>/g);
    const turned = await page.evaluate(`(() => { const f = document.querySelector('section.present figure'); return [f, ...f.querySelectorAll('img')].map((el) => getComputedStyle(el).rotate); })()`);
    return { tags, turned };
  }

  // a drag of the shown rotate handle by deg degrees about the center of the frame of the
  // selection, with the button held at the end where hold is set
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

  // the style attributes of the two images of the figure in the text, dark first
  const styles = async (page) => [...(await render(page)).matchAll(/<img class="for-(?:dark|light)"[^>]*>/g)].map((m) => /style="([^"]*)"/.exec(m[0])?.[1] ?? null);

  for (const platform of PLATFORMS) {
    // C1: after a typed 0 and one undo, the image of the dark mode read style="rotate: 20deg"
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

// regression tests of R19.8 on both platforms, after the findings D19 to D21 of the fourth review
// of round 7: a group with a member turned by itself is turned and reset back to the grouped file,
// a drag of the rotate handle cancelled by Esc does not change the place that a later reset gives
// back, and Esc cancels a drag of a row of the Object List and of a thumbnail of the navigator
describe('groups with a turned member, and cancelled turns', () => {
  const DECK = 'test-deck.html';
  // the index of the figures slide in index.html
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

  // the editor on the demo deck at the figures slide, opened from text, with the script prep run on
  // the page before the open
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

  // one undo gives the text before, and one redo the edited text, byte for byte
  async function undoes(page, before, what) {
    const edited = await render(page);
    assert.notEqual(edited, before, `${what} did not change the text`);
    await undo(page);
    assert.equal(await render(page), before, `an undo of ${what}`);
    await redo(page);
    assert.equal(await render(page), edited, `a redo of ${what}`);
    return edited;
  }

  // the start tags of the figure and of its two images in the text, and the computed angles of the three
  async function figureState(page) {
    const text = await render(page);
    const start = text.indexOf('<figure class="figure-box"');
    const tags = text.slice(start, text.indexOf('</figure>', start)).match(/<(figure|img)\b[^>]*>/g);
    const turned = await page.evaluate(`(() => { const f = document.querySelector('section.present figure'); return [f, ...f.querySelectorAll('img')].map((el) => getComputedStyle(el).rotate); })()`);
    return { tags, turned };
  }

  // the paragraph and the figure of the figures slide made one group with the key of Group
  async function groupOnFigures(page, platform) {
    await click(page, IMG);
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    await frames(page);
  }

  // a drag of the shown rotate handle by deg degrees about the center of the frame of the
  // selection, with the button held at the end where hold is set
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

  // the label of the entry that Undo takes back, or undefined
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo')?.label`);

  // the figure of the figures slide turned by 20 degrees by itself, then grouped with the paragraph
  async function groupTurnedFigure(page, platform) {
    await click(page, IMG);
    await typeField(page, 'angle', 20);
    await groupOnFigures(page, platform);
  }

  // Esc pressed during a drag of the rotate handle by 40 degrees, then the release
  async function cancelledTurn(page) {
    const at = await dragRotor(page, 40, true);
    await press(page, 'Escape');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1 });
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    // D19: the figure turned by 20 degrees and grouped read translate: 27px 5px, and 26px 6px after
    // the turns to 30 and 75 and Reset Rotation
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
      assert.deepEqual(errors(page), []);
    });

    // D20: Esc in a drag of the rotate handle after a typed 30 left translate: 1px -1px after Reset
    // Rotation
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
        assert.deepEqual(errors(page), []);
      });
    }

    // D21: after Esc the drop line was still shown, and the release wrote the Reorder
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
      assert.deepEqual(errors(page), []);
    });

    // a guard: the navigator already ends the drag of a thumbnail at Esc
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
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R20.5 on both platforms with trusted input: a drag of the rotate handle is
// held at a multiple of 45 degrees while its absolute angle is within 4 degrees of it, with an
// angle guide through the center of the turn, and follows the pointer to the degree beyond. the
// free modifier turns the hold off, a group is held by its first member and a multiple selection by
// its first object, and Esc puts a held drag back. the file is checked byte for byte
describe('the hold at multiples of 45 degrees', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r20-5.html';
  // the bit masks of the modifiers of Input.dispatchMouseEvent: Shift, and the free modifier, ⌘ on a
  // Mac and Alt elsewhere
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
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

  // the text of the readout and the angle guide shown during a drag, the guide with its center on
  // the screen and its angle
  const shown = (page) => page.evaluate(`(() => {
  const out = document.querySelector('.beeson-offset');
  const spoke = document.querySelector('.beeson-guide.spoke');
  const on = spoke && !spoke.hidden && spoke.getClientRects().length > 0;
  const r = on ? spoke.getBoundingClientRect() : null;
  return { readout: out && !out.hidden ? out.textContent : null, spoke: on ? { x: r.left + r.width / 2, y: r.top + r.height / 2, deg: spoke.style.rotate } : null };
})()`);

  // a drag of the rotate handle that turns the pointer by deg degrees about the screen point c, with
  // the modifiers of the bit mask mods. the button is held, and the function returned releases it.
  // its method to turns the pointer on to deg2 degrees from the press, with the modifiers mods2
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
      assert.deepEqual(errors(page), []);
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
      assert.deepEqual(errors(page), []);
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
      assert.deepEqual(errors(page), []);
    });

    test(`the hold acts on the absolute angle, and a turn back to 0 gives back the file (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      await clickText(page, `.reveal ${QR}`);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await exec(page, 'arrange.setRotation', { deg: 20 });
      await frames(page);
      const c = await center(page, `.reveal ${QR}`);
      // a turn by 23 from 20 degrees reaches 43 and is held at 45. a hold of the delta would write 43
      let release = await turnBy(page, c, 23);
      assert.equal((await shown(page)).readout, '45°');
      await release();
      await byteExact(page, [['style="width: 300px"', 'style="width: 300px; rotate: 45deg"']]);
      // a turn by -42 from 45 degrees reaches 3 and is held at 0, which takes the declaration off
      release = await turnBy(page, c, -42);
      assert.equal((await shown(page)).readout, '0°');
      await release();
      await byteExact(page);
      assert.equal(await angle(page, QR), '');
      assert.deepEqual(errors(page), []);
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
      assert.deepEqual(errors(page), []);
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
      assert.deepEqual(errors(page), []);
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
      assert.deepEqual(errors(page), []);
    });
  }
});
