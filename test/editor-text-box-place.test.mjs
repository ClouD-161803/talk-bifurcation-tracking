// the place of a new text box, kept at its first key and at a paste, on title and closing slides
// off the lines of the block, and the slide shown by an undo of Delete Text Box

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';

// regression tests of R15.3 on both platforms: the end of the show played by Present at a click
// past its last step, a new text box kept in its place at its first input, and Distribute with a
// group in the selection
describe('a new text box kept in place', () => {
  const PLATFORMS = ['mac', 'other'];
  const FIGURES = 4;
  const LAST = 12;

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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)})`).then(() => frames(page));
  const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

  // the editor on slide n of the demo deck, served over HTTP
  async function load(t, platform, n = 0) {
    const text = readFileSync('test-deck.html', 'utf8');
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/test-deck.html?edit&still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the frame of the show played by Present
  const SHOW = `document.querySelector('.beeson-edit-show iframe')?.contentWindow`;
  const showReady = `(() => { try { const w = ${SHOW}; return !!w?.Reveal?.isReady() && (!w.MathJax || (w.MathJax.startup?.promise?.then(() => true) ?? false)); } catch { return false; } })()`;
  const showing = (page) => page.evaluate(`!!document.querySelector('.beeson-edit-show')`);
  async function present(t, platform, n) {
    const page = await load(t, platform, n);
    await press(page, 'Mod+Enter');
    await page.waitFor(showReady, 20000);
    await sleep(300);
    return page;
  }

  // a point of the slide shown by the show, on the heading of slide 12 and away from its video
  const slidePoint = { x: 400, y: 180 };

  // finding opus 3 of round 6: a click past the last step of the last slide left the show up, while a
  // key forward ended it. a click plays the steps of slide 12 first, and a deck opened by itself
  // stays at its last slide at a click
  for (const platform of PLATFORMS) {
    test(`the show played by Present returns to the editor at a click past its last step (${platform})`, async (t) => {
      const page = await present(t, platform, LAST - 1);
      const at = () => page.evaluate(`${SHOW}.Reveal.getIndices().h`);
      assert.equal(await page.evaluate(`${SHOW}.Reveal.availableFragments().next`), true, 'slide 12 does not have steps');
      await click(page, slidePoint);
      await sleep(300);
      assert.equal(await at(), LAST - 1, 'a step of slide 12 is skipped');
      for (let i = 0; i < 10 && (await at()) < LAST; i++) {
        await click(page, slidePoint);
        await sleep(300);
      }
      assert.equal(await at(), LAST);
      assert.equal(await showing(page), true, 'the show ends at the arrival on its last slide');
      for (let i = 0; i < 4 && (await showing(page)); i++) {
        await click(page, slidePoint);
        await sleep(300);
      }
      assert.equal(await showing(page), false, 'four clicks at the last slide do not end the show');
      assert.equal(await page.evaluate('Reveal.getIndices().h'), LAST);
      await byteExact(page);
      assert.deepEqual(errors(page), []);

      const deck = await browser.newPage({ width: 1600, height: 1000 });
      t.after(() => deck.close().catch(() => {}));
      await deck.goto(`${server.origin}/test-deck.html?still#/${LAST}`);
      await deck.waitFor(deckSettled);
      for (let i = 0; i < 3; i++) {
        await click(deck, slidePoint);
        await sleep(200);
      }
      assert.equal(await deck.evaluate('Reveal.getIndices().h'), LAST);
      assert.equal(await deck.evaluate('location.search'), '?still');
      assert.deepEqual(errors(deck), []);
    });
  }

  // the box on the screen of the new text box of the current slide, empty or written
  const BOX = `(() => {
  const s = Reveal.getCurrentSlide();
  const p = s.querySelector('p.beeson-pending') ?? [...s.querySelectorAll('p')].find((e) => e.textContent.startsWith('H'));
  if (!p) return null;
  const r = p.getBoundingClientRect();
  return { left: r.left, top: r.top, pending: p.classList.contains('beeson-pending') };
})()`;
  const boxOf = (page) => page.evaluate(BOX);
  const undo = (page) => press(page, 'Mod+Z').then(() => sleep(200));
  const redo = (page) => press(page, 'Mod+Shift+Z').then(() => sleep(200));

  // a trusted Mod+key with the editing command of the browser, e.g. paste
  async function command(page, platform, key, name) {
    const base = { key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), modifiers: platform === 'mac' ? 4 : 2 };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [name] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  const kept = (a, b, what) => assert.ok(a && b && near(a.left, b.left, 0.6) && near(a.top, b.top, 0.6), `${what} moves the text box from ${js(a)} to ${js(b)}`);

  // finding opus 4 of round 6: the empty box was drawn with a margin of 24 px above it, and the text
  // box written at its first key with the margin of the theme, which moved it up
  for (const platform of PLATFORMS) {
    test(`a new text box stays in its place at its first key and after an undo of its typing (${platform})`, async (t) => {
      for (const n of [FIGURES, 1, 9]) {
        const page = await load(t, platform, n);
        await click(page, '.beeson-edit-top [data-command="insert.text"]');
        await sleep(200);
        const empty = await boxOf(page);
        assert.equal(empty?.pending, true, `Text does not add an empty text box on slide ${n + 1}`);
        await type(page, 'H');
        await sleep(300);
        const first = await boxOf(page);
        kept(empty, first, `the first key on slide ${n + 1}`);
        const written = await render(page);
        await sleep(1200);
        await type(page, 'ello');
        await sleep(300);
        kept(empty, await boxOf(page), `typing on slide ${n + 1}`);
        await undo(page);
        assert.equal(await render(page), written);
        kept(empty, await boxOf(page), `an undo of the typing on slide ${n + 1}`);
        await undo(page);
        await byteExact(page);
        await redo(page);
        assert.equal(await render(page), written);
        kept(empty, await boxOf(page), `a redo of the text box on slide ${n + 1}`);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });

    test(`a new text box stays in its place at a paste (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
      await page.evaluate(`navigator.clipboard.writeText('Hello')`);
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(200);
      const empty = await boxOf(page);
      assert.equal(empty?.pending, true);
      await command(page, platform, 'v', 'paste');
      await sleep(300);
      const pasted = await boxOf(page);
      assert.equal(pasted?.pending, false, 'the paste is not written');
      kept(empty, pasted, 'the paste');
      assert.match(await render(page), /<p[^>]*>Hello<\/p>/);
      await undo(page);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // the boxes of the heading, the group of the paragraph and the figure, and the list of slide 5, in
  // slide px. the box of the figure is its frame, i.e. the picture as it is fitted into the image and
  // the caption under it
  const OBJECTS = `(() => {
  const s = document.querySelector('.reveal .slides');
  const S = s.getBoundingClientRect(), k = S.width / s.offsetWidth;
  const rect = (e) => {
    if (e.localName !== 'figure') return e.getBoundingClientRect();
    const img = [...e.querySelectorAll('img')].find((i) => i.getBoundingClientRect().width);
    const r = img.getBoundingClientRect(), c = e.querySelector('figcaption')?.getBoundingClientRect();
    const f = getComputedStyle(img).objectFit === 'contain' ? Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight) : 0;
    const w = f ? img.naturalWidth * f : r.width, h = f ? img.naturalHeight * f : r.height;
    const left = r.left + (r.width - w) / 2, top = r.top + (r.height - h) / 2;
    return { left, top, right: Math.max(left + w, c?.right ?? 0), bottom: Math.max(top + h, c?.bottom ?? 0) };
  };
  const box = (...els) => {
    const rs = els.map(rect);
    const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right)), bottom = Math.max(...rs.map((r) => r.bottom));
    return { left: (left - S.left) / k, top: (top - S.top) / k, right: (right - S.left) / k, bottom: (bottom - S.top) / k };
  };
  const c = Reveal.getCurrentSlide();
  const p = c.querySelector(':scope > p'), f = c.querySelector(':scope > figure');
  return { h2: box(c.querySelector(':scope > h2')), group: box(p, f), p: box(p), f: box(f), ul: box(c.querySelector(':scope > ul')) };
})()`;

  // the paragraph and the figure of slide 5 grouped, and the heading and the list added to the
  // selection
  async function groupAndSelect(page, platform) {
    await click(page, 'section.present figure img.for-light');
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, platform === 'mac' ? 'Alt+Mod+G' : 'Mod+G');
    assert.equal(await page.evaluate('Reveal.getCurrentSlide().querySelectorAll("[data-group]").length'), 2);
    await click(page, 'section.present h2', { modifiers: 'Shift' });
    await click(page, 'section.present > ul > li', { modifiers: 'Shift' });
    await frames(page);
  }

  // D23 of round 6: Distribute Vertically with a group moved the group above the slide and outside the
  // span of the selection
  for (const platform of PLATFORMS) {
    test(`Distribute with a group keeps every object in the span of the selection and the outer two in place (${platform})`, async (t) => {
      for (const [axis, start, end] of [['vertical', 'top', 'bottom'], ['horizontal', 'left', 'right']]) {
        const page = await load(t, platform, FIGURES);
        await groupAndSelect(page, platform);
        const grouped = await render(page);
        const b0 = await page.evaluate(OBJECTS);
        const all = [b0.h2, b0.group, b0.ul];
        const span = [Math.min(...all.map((b) => b[start])), Math.max(...all.map((b) => b[end]))];
        // the outer two are the first and the last in the order of their start
        const order = ['h2', 'group', 'ul'].sort((a, b) => b0[a][start] - b0[b][start] || (b0[a][end] - b0[a][start]) - (b0[b][end] - b0[b][start]));
        await exec(page, `arrange.distribute.${axis}`);
        const b = await page.evaluate(OBJECTS);
        for (const name of ['h2', 'group', 'ul']) {
          assert.ok(b[name][start] >= span[0] - 1 && b[name][end] <= span[1] + 1, `Distribute ${axis} puts the ${name} at ${js(b[name])}, outside ${js(span)}`);
          assert.ok(b[name].top >= -1 && b[name].left >= -1, `Distribute ${axis} puts the ${name} off the slide at ${js(b[name])}`);
        }
        for (const name of [order[0], order[2]]) assert.ok(near(b[name][start], b0[name][start]), `Distribute ${axis} moves the outer ${name} from ${js(b0[name])} to ${js(b[name])}`);
        // the members of the group keep their places in it
        assert.ok(near(b.f.left - b.p.left, b0.f.left - b0.p.left) && near(b.f.top - b.p.top, b0.f.top - b0.p.top), `the members of the group are moved apart: ${js({ b0, b })}`);
        const edited = await render(page);
        // the three start at the left margin, where equal gaps leave them, as in PowerPoint
        if (axis === 'horizontal') assert.equal(edited, grouped, 'Distribute Horizontally of objects at one left margin changes the file');
        else {
          await undo(page);
          assert.equal(await render(page), grouped);
          await redo(page);
          assert.equal(await render(page), edited);
        }
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }

  const DISTRIBUTE = ['horizontal', 'vertical', 'evenly'].map((k) => `arrange.distribute.${k}`);
  const PANEL = '#beeson-edit-panel-format';
  // whether each Distribute command is enabled, and whether its button of the Arrange pane is
  const distributeOn = async (page) => {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === 'Arrange')?.click()`);
    await frames(page);
    return page.evaluate(`${js(DISTRIBUTE)}.map((id) => [window.BeesonEditor.state(id).enabled, !document.querySelector('${PANEL} [data-command="' + id + '"]')?.disabled])`);
  };

  // ruling 4 of the juror of round 6: with one selected object the pane reads Align to Slide, and
  // Distribute acts on the object against the slide, as in PowerPoint. a group alone is one object
  for (const platform of PLATFORMS) {
    test(`Distribute is enabled for one selected object, and centers a group alone on the slide as one object (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      const on = DISTRIBUTE.map(() => [true, true]);
      await click(page, 'section.present figure img.for-light');
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 1);
      assert.deepEqual(await distributeOn(page), on, 'Distribute is dimmed for one figure');
      await groupAndSelect(page, platform);
      await click(page, 'section.present > ul > li');
      await click(page, 'section.present figure img.for-light');
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 2);
      assert.deepEqual(await distributeOn(page), on, 'Distribute is dimmed for one group');
      const was = await page.evaluate(OBJECTS);
      const grouped = await render(page);
      await exec(page, 'arrange.distribute.vertical');
      const now = await page.evaluate(OBJECTS);
      const dy = now.p.top - was.p.top;
      assert.ok(Math.abs(dy) > 1 && near(now.f.top - was.f.top, dy), `the members of the group are moved by ${dy} and ${now.f.top - was.f.top}`);
      assert.ok(near((now.group.top + now.group.bottom) / 2, 540, 1.5), `the group is not centered on the slide: ${js(now.group)}`);
      assert.ok(near(now.p.left, was.p.left) && near(now.f.left, was.f.left), 'Distribute Vertically moves the group along x');
      await undo(page);
      assert.equal(await render(page), grouped, 'an undo of Distribute does not give the file back');
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R17.11 on both platforms: a new text box on a title or closing slide is a
// child of the section, and the lines of the block keep their places. a box begun by a click on
// Text right after a box was emptied is undone by one undo
describe('the lines of a title block kept', () => {
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => press(page, 'Mod+Z').then(() => sleep(250));
  const redo = (page) => press(page, 'Mod+Shift+Z').then(() => sleep(250));
  const labels = (page) => page.evaluate(`({ undo: window.BeesonEditor.state('edit.undo').label, redo: window.BeesonEditor.state('edit.redo').label })`);

  // the editor on slide n of the demo deck, served over HTTP
  async function load(t, platform, n = 0) {
    const text = readFileSync('test-deck.html', 'utf8');
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/test-deck.html?edit&still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the boxes in slide px of the lines of the block of the current slide, and of the paragraphs of
  // the new text box, i.e. the children of the section that start with mark or are pending
  const PLACES = (mark) => `(() => {
  const s = document.querySelector('.reveal .slides');
  const S = s.getBoundingClientRect(), k = S.width / s.offsetWidth;
  const px = (e) => { const r = e.getBoundingClientRect(); return { left: (r.left - S.left) / k, top: (r.top - S.top) / k, right: (r.right - S.left) / k, bottom: (r.bottom - S.top) / k }; };
  const c = Reveal.getCurrentSlide();
  const lines = [];
  for (const e of c.querySelectorAll('.title-text > *')) for (const r of e.getClientRects()) lines.push({ left: (r.left - S.left) / k, top: (r.top - S.top) / k });
  const box = [...c.querySelectorAll(':scope > p')].filter((p) => p.classList.contains('beeson-pending') || (${js(mark)} && p.textContent.startsWith(${js(mark)})));
  return { lines, box: box.map(px), inTitleText: !!c.querySelector('.title-text .beeson-pending') };
})()`;
  const places = (page, mark = '') => page.evaluate(PLACES(mark));
  const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
  function sameLines(a, b, what) {
    assert.equal(a.lines.length, b.lines.length, `${what} changes the number of lines of the block`);
    a.lines.forEach((l, i) => assert.ok(near(l.left, b.lines[i].left) && near(l.top, b.lines[i].top), `${what} moves a line of the block from ${js(l)} to ${js(b.lines[i])}`));
  }
  // an item of a menu of the menu bar, chosen with the mouse. Paste comes before Paste and Match
  // Style in the Edit menu, hence the first item that starts with the name is taken
  async function menu(page, bar, item) {
    await click(page, await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((e) => e.textContent.trim() === ${js(bar)}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    await sleep(250);
    const at = await page.evaluate(`(() => { const e = [...document.querySelectorAll('[role=menu] [role^=menuitem]')].find((x) => x.getClientRects().length && x.textContent.trim().startsWith(${js(item)})); const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, at);
    await sleep(500);
    await frames(page);
  }
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  // N19 of round 7: on a title or closing slide, Insert > Text Box put the paragraph into the block,
  // which is held at its foot, hence each line of the box lifted the lines of the block by a line
  for (const platform of PLATFORMS) {
    test(`a new text box on a title or closing slide keeps the lines of the block in place (${platform})`, async (t) => {
      for (const n of [0, 12]) {
        const page = await load(t, platform, n);
        const at = `on slide ${n + 1}`;
        const start = await places(page);
        await click(page, '.beeson-edit-top [data-command="insert.text"]');
        await sleep(300);
        const empty = await places(page);
        assert.equal(empty.box.length, 1, `Text does not add a text box as a child of the section ${at}`);
        assert.equal(empty.inTitleText, false, `the text box is put into the title text ${at}`);
        sameLines(start, empty, `the insert ${at}`);
        // the box is inside the margins of the slide, and off the words of the block and the lockup
        const b = empty.box[0];
        assert.ok(b.left >= 119.5 && b.right <= 1800.5 && b.top >= 0 && b.bottom <= 1080, `the text box ${js(b)} is outside the margins ${at}`);
        const words = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const S = s.getBoundingClientRect(), k = S.width / s.offsetWidth; return [...Reveal.getCurrentSlide().querySelectorAll('.title-text > *')].filter((e) => e.textContent.trim()).map((e) => { const r = e.getBoundingClientRect(); return { left: (r.left - S.left) / k, top: (r.top - S.top) / k, right: (r.right - S.left) / k, bottom: (r.bottom - S.top) / k }; }); })()`);
        for (const w of words) assert.ok(!meets(b, w), `the text box ${js(b)} lies over the words ${js(w)} ${at}`);
        if (n === 0) assert.ok(!meets(b, { left: 120, top: 60, right: 560, bottom: 132 }), `the text box ${js(b)} lies over the lockup ${at}`);
        await type(page, 'a');
        await sleep(300);
        const first = await places(page, 'a');
        sameLines(start, first, `the first key ${at}`);
        assert.ok(near(first.box[0].left, b.left) && near(first.box[0].top, b.top), `the first key moves the text box ${at}`);
        await press(page, 'Enter');
        await type(page, 'b');
        await press(page, 'Enter');
        await type(page, 'c');
        await sleep(1300);
        const three = await places(page);
        sameLines(start, three, `three lines typed into the box ${at}`);
        const written = await render(page);
        // the new paragraphs are children of the section, before the foot and the notes
        const slide = written.split(/<section/)[n + 1];
        assert.match(slide, /<p style="[^"]*translate: [\d.-]+px [\d.-]+px[^"]*">a<\/p>/, `the box is not written with its translate ${at}`);
        assert.ok(slide.indexOf('>a</p>') > slide.indexOf('</div>', slide.indexOf('class="title-text"')), `the box is written into the block ${at}`);
        if (slide.includes('aside class="notes"')) assert.ok(slide.indexOf('>c</p>') < slide.indexOf('aside class="notes"'), `the box is written after the notes ${at}`);
        await undo(page);
        sameLines(start, await places(page), `an undo ${at}`);
        await redo(page);
        sameLines(start, await places(page), `a redo ${at}`);
        assert.equal(await render(page), written);
        assert.deepEqual(errors(page), []);

        // the saved deck opened without edit draws the box at the place shown in the editor
        const shown = (await places(page, 'a')).box;
        const file = `.r17-11-${platform}-${n}.html`;
        writeFileSync(file, written);
        t.after(() => rmSync(file, { force: true }));
        for (const theme of ['light', 'dark']) {
          const show = await browser.newPage({ width: 1600, height: 1000 });
          await show.goto(`${server.origin}/${file}?still&theme=${theme}#/${n}`);
          await show.waitFor(deckSettled);
          await show.evaluate(`Reveal.slide(${n})`);
          await frames(show);
          const drawn = await show.evaluate(PLACES('a'));
          sameLines(start, drawn, `the show in ${theme} mode ${at}`);
          assert.equal(drawn.box.length, shown.length);
          drawn.box.forEach((d, i) => assert.ok(near(d.left, shown[i].left, 1) && near(d.top, shown[i].top, 1), `the show in ${theme} mode draws a line of the box at ${js(d)} in place of ${js(shown[i])} ${at}`));
          await show.close();
        }
        await page.close();
      }
    });
  }

  // the rules of R17.2 on a title slide: an undo of the first letter leaves the empty box, a box
  // emptied and left is taken out of the file, and Edit > Paste as the first input is written
  for (const platform of PLATFORMS) {
    test(`a new text box on a title slide follows the rules of a new text box (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(300);
      const empty = await places(page);
      await type(page, 'h');
      await sleep(1300);
      await undo(page);
      const back = await places(page);
      assert.equal(back.box.length, 1, 'an undo of the first letter does not leave the empty box');
      assert.ok(near(back.box[0].left, empty.box[0].left) && near(back.box[0].top, empty.box[0].top), 'an undo of the first letter moves the box');
      assert.equal(await page.evaluate(`document.activeElement?.classList.contains('beeson-pending')`), true, 'the caret is not in the empty box');
      await byteExact(page);
      await type(page, 'h');
      await sleep(300);
      await press(page, 'Backspace');
      await sleep(300);
      await press(page, 'Escape');
      await press(page, 'Escape');
      await sleep(300);
      await byteExact(page);
      await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
      await page.evaluate(`navigator.clipboard.writeText('Pasted words')`);
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(300);
      const box = (await places(page)).box[0];
      await menu(page, 'Edit', 'Paste');
      const pasted = await places(page, 'Pasted');
      sameLines(empty, pasted, 'the paste of the menu');
      assert.ok(near(pasted.box[0].left, box.left) && near(pasted.box[0].top, box.top), 'the paste of the menu moves the box');
      assert.match(await render(page), /<p style="[^"]*">Pasted words<\/p>/, 'the paste of the menu is not written');
      assert.deepEqual(errors(page), []);
    });
  }

  // the edge left by R17.2: after a click on Text right after a box was emptied, the history held an
  // insert of the new box whose undo did nothing
  for (const platform of PLATFORMS) {
    test(`one undo takes a box begun by a click on Text right after a box was emptied (${platform})`, async (t) => {
      for (const n of [4, 0]) {
        const page = await load(t, platform, n);
        await click(page, '.beeson-edit-top [data-command="insert.text"]');
        await sleep(300);
        await type(page, 'h');
        await sleep(300);
        await press(page, 'Backspace');
        await sleep(300);
        await click(page, '.beeson-edit-top [data-command="insert.text"]');
        await sleep(600);
        assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('p.beeson-pending').length`), 1, `the new box is not kept on slide ${n + 1}`);
        await byteExact(page);
        assert.equal((await labels(page)).undo, 'Undo Insert Text Box', `the last entry is not the insert of the new box on slide ${n + 1}`);
        await undo(page);
        assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('p.beeson-pending').length`), 0, `an undo does not take the new box on slide ${n + 1}`);
        await byteExact(page);
        // each entry left changes the file at its undo
        for (let i = 0; i < 6 && (await labels(page)).undo !== 'Undo'; i++) {
          const was = await render(page);
          await undo(page);
          assert.notEqual(await render(page), was, `the undo of an entry does not change the file on slide ${n + 1}`);
        }
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }
});

// regression tests of R20.12 on both platforms: a click on a figure that leaves an emptied new text
// box (F6), Paste of the Edit menu with the caret in a cell (F18), the place of a further new text
// box on a title slide and of a new table without a free place (F8, O1), the slide shown by the
// undo of Delete Text Box (F7), and Paste of the Edit menu with the read of the clipboard refused
// (F19)
describe('further boxes and tables on a title slide', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test-deck.html';
  const TABLES = 'test/pages/editor-tables.html';
  const TITLE = 'test/pages/editor-r20-12.html';
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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const labels = (page) => page.evaluate(`({ undo: window.BeesonEditor.state('edit.undo').label, redo: window.BeesonEditor.state('edit.redo').label })`);
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  // the editor on slide n of deck, served over HTTP, with the storage of the origin emptied
  async function load(t, platform, deck = DECK, n = 0) {
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
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    await sleep(200);
    return page;
  }

  // an item of a menu of the menu bar, chosen with the mouse. Paste comes before Paste and Match
  // Style in the Edit menu, hence the first item that starts with the name is taken
  async function menu(page, bar, item) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((e) => e.textContent.trim() === ${js(bar)})`));
    await sleep(250);
    const at = await page.evaluate(`(() => { const e = [...document.querySelectorAll('[role=menu] [role^=menuitem]')].find((x) => x.getClientRects().length && x.textContent.trim().startsWith(${js(item)})); const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await clickText(page, at);
    await sleep(500);
    await frames(page);
  }

  // the boxes in slide px of the elements of the current slide that match selector, each with its
  // text, its frame, and the ink of its words
  const BOXES = (selector) => `(() => {
  const s = document.querySelector('.reveal .slides');
  const S = s.getBoundingClientRect(), k = S.width / s.offsetWidth;
  const px = (r) => ({ left: (r.left - S.left) / k, top: (r.top - S.top) / k, right: (r.right - S.left) / k, bottom: (r.bottom - S.top) / k });
  return [...Reveal.getCurrentSlide().querySelectorAll(${js(selector)})].map((e) => {
    const range = document.createRange();
    range.selectNodeContents(e);
    return { text: e.textContent.trim(), frame: px(e.getBoundingClientRect()), ink: px(range.getBoundingClientRect()) };
  });
})()`;
  const boxes = (page, selector) => page.evaluate(BOXES(selector));

  // F6: a click on a figure that left an emptied new text box took the box out, and the undo of the
  // entries of the box put the caret into it again, which dropped the selection of the figure
  for (const platform of PLATFORMS) {
    test(`a click on a figure that leaves an emptied text box selects the figure (${platform})`, async (t) => {
      for (const pause of [300, 1300]) {
        const page = await load(t, platform, DECK, 4);
        const at = `with a pause of ${pause} ms`;
        // an older entry, which stays undoable
        await clickText(page, 'section.present h2');
        await press(page, 'End');
        await type(page, 'Q');
        await sleep(1300);
        const older = await render(page);
        await click(page, '.beeson-edit-top [data-command="insert.text"]');
        await sleep(300);
        await type(page, 'h');
        await sleep(pause);
        await press(page, 'Backspace');
        await sleep(300);
        await clickText(page, 'section.present figure img.for-light');
        await sleep(700);
        assert.equal(await render(page), older, `the emptied box is kept ${at}`);
        const sel = await page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`);
        assert.deepEqual(sel, ['figure'], `the click does not select the figure ${at}`);
        await press(page, 'ArrowRight');
        await sleep(300);
        assert.ok((await render(page)).includes('<figure class="figure-box" style="translate: 1px 0px">'), `ArrowRight does not nudge the figure ${at}`);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }

  // the body cells Moon to 2.53e-5 of slide 2 of the tables deck copied by a trusted Mod+C, and the
  // caret put into the cell Titan by a click
  async function copyRange(t, platform) {
    const page = await load(t, platform, TABLES, 1);
    await page.send('Page.bringToFront');
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    const cell = (r, c) => rect(page, `document.querySelector('.reveal section.present table').rows[${r}].cells[${c}]`);
    await clickText(page, await cell(1, 0));
    await sleep(150);
    await click(page, await cell(2, 1), { modifiers: 'Shift' });
    await sleep(150);
    const base = { key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: MOD[platform] };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: ['copy'] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(150);
    await clickText(page, await cell(3, 0));
    await sleep(300);
    return page;
  }
  const PASTED = '<tr><td>Moon</td><td>\\(0.01215\\)</td><td>Saturn</td></tr>\n      <tr><td>Europa</td><td>2.53e-5</td><td></td></tr>';

  // F18: Paste of the Edit menu with the caret in a cell typed the whole range into this cell, while
  // Mod+V filled the cells from it
  for (const platform of PLATFORMS) {
    test(`Paste of the Edit menu and of the cell menu fill the cells from the caret as Mod+V does (${platform})`, async (t) => {
      for (const route of ['key', 'menu', 'cell menu']) {
        const page = await copyRange(t, platform);
        const base = await render(page);
        if (route === 'key') {
          const v = { key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: MOD[platform] };
          await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...v, commands: ['paste'] });
          await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...v });
          await sleep(500);
        } else if (route === 'menu') await menu(page, 'Edit', 'Paste');
        else {
          await click(page, await rect(page, `document.querySelector('.reveal section.present table').rows[3].cells[0]`), { button: 'right' });
          await sleep(300);
          const item = await rect(page, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.textContent === 'Paste')`);
          assert.ok(item, 'the cell menu does not have Paste');
          await clickText(page, item);
          await sleep(500);
        }
        const edited = await render(page);
        const table = edited.slice(edited.indexOf('A plain table'), edited.indexOf('</table>', edited.indexOf('A plain table')));
        assert.ok(edited.includes(PASTED), `${route} does not fill the cells from the caret: ${table}`);
        assert.equal((await labels(page)).undo, 'Undo Paste', `${route} is not one entry Paste`);
        await undo(page);
        assert.equal(await render(page), base, `the undo of ${route} does not give the file back`);
        await redo(page);
        assert.equal(await render(page), edited, `the redo of ${route} does not write the paste again`);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }

  // F8: on a title slide, an earlier new text box counted only by the ink of its words, hence a
  // second and a third box were put inside its frame, and its words ran under theirs once it grew
  for (const platform of PLATFORMS) {
    test(`a second and a third new text box on a title slide are put off the frames of the earlier ones (${platform})`, async (t) => {
      const page = await load(t, platform, TITLE, 0);
      for (const words of ['First box', 'Second box', 'Third box']) {
        await click(page, '.beeson-edit-top [data-command="insert.text"]');
        await sleep(300);
        await type(page, words);
        await sleep(300);
        await press(page, 'Escape');
        await press(page, 'Escape');
        await sleep(300);
      }
      const made = await boxes(page, ':scope > p');
      assert.deepEqual(made.map((b) => b.text), ['First box', 'Second box', 'Third box']);
      const block = await boxes(page, '.title-text > *');
      for (const [i, a] of made.entries()) {
        for (const b of made.slice(i + 1)) assert.ok(!meets(a.frame, b.frame), `the box ${b.text} ${js(b.frame)} is put over the frame of ${a.text} ${js(a.frame)}`);
        assert.ok(a.frame.left >= 119.5 && a.frame.right <= 1800.5, `the box ${a.text} ${js(a.frame)} is outside the margins`);
        for (const w of block) assert.ok(!meets(a.ink, w.ink), `the box ${a.text} lies over the words ${w.text}`);
      }
      await clickText(page, await page.evaluate(`(() => { const r = document.createRange(); r.selectNodeContents(Reveal.getCurrentSlide().querySelector(':scope > p')); const b = r.getBoundingClientRect(); return { x: b.right - 2, y: b.top + b.height / 2 }; })()`));
      await press(page, 'End');
      await type(page, ' and a few more words');
      await sleep(300);
      const typed = await boxes(page, ':scope > p');
      assert.equal(typed[0].text, 'First box and a few more words');
      for (const b of typed.slice(1)) assert.ok(!meets(typed[0].ink, b.ink), `the words of the first box ${js(typed[0].ink)} run under ${b.text} ${js(b.ink)}`);
      await press(page, 'Escape');
      for (let i = 0; i < 20 && (await page.evaluate(`window.BeesonEditor.state('edit.undo').enabled`)); i++) await undo(page);
      assert.equal(await render(page), page.source, 'the undo of every insert does not give the file back');
      assert.deepEqual(errors(page), []);
    });
  }

  // F8: on a closing slide, a new table counted an earlier new text box only by the ink of its
  // words, hence the table was put over the frame of the box
  for (const platform of PLATFORMS) {
    test(`a new table on a closing slide is put off the frame of an earlier new text box (${platform})`, async (t) => {
      const n = (page) => page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.matches('.closing'))`);
      let page = await load(t, platform, DECK, 0);
      const closing = await n(page);
      await page.close();
      page = await load(t, platform, DECK, closing);
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(300);
      await type(page, 'A box');
      await sleep(300);
      await press(page, 'Escape');
      await press(page, 'Escape');
      await sleep(300);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await sleep(300);
      const [box] = await boxes(page, ':scope > p');
      const [table] = await boxes(page, 'table');
      assert.equal(box.text, 'A box');
      assert.ok(!meets(box.frame, table.frame), `the table ${js(table.frame)} lies over the frame of the text box ${js(box.frame)}`);
      assert.deepEqual(errors(page), []);
    });
  }

  // the boxes in slide px of the tables, of the pictures of the figures, and of each line of the
  // words of the current slide
  const PIECES = `(() => {
  const slide = Reveal.getCurrentSlide();
  const s = document.querySelector('.reveal .slides');
  const S = s.getBoundingClientRect(), k = S.width / s.offsetWidth;
  const px = (r) => ({ left: (r.left - S.left) / k, top: (r.top - S.top) / k, right: (r.right - S.left) / k, bottom: (r.bottom - S.top) / k });
  const tables = [...slide.querySelectorAll('table')].map((e) => px(e.getBoundingClientRect()));
  const figures = [...slide.querySelectorAll('figure img')].filter((e) => e.getClientRects().length).map((e) => px(e.getBoundingClientRect()));
  const lines = [...slide.querySelectorAll('h2, p, li')].filter((e) => e.getClientRects().length && !e.closest('table, figure')).flatMap((e) => {
    const range = document.createRange();
    range.selectNodeContents(e);
    return [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map(px);
  });
  return { tables, figures, lines };
})()`;

  // O1: a new table without a free place is put at the place off the figures nearest to the middle
  // of the slide, as the juror of round 6 ruled (finding 64 of glm in round 9)
  for (const platform of PLATFORMS) {
    test(`a new table without a free place is put at the middle of the slide, off the figure and the first table (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 4);
      const base = await render(page);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await sleep(300);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await sleep(300);
      const { tables, figures } = await page.evaluate(PIECES);
      assert.equal(tables.length, 2);
      assert.ok(!meets(tables[0], tables[1]), `the tables lie over each other: ${js(tables)}`);
      for (const [i, b] of tables.entries()) {
        for (const f of figures) assert.ok(!meets(b, f), `table ${i + 1} ${js(b)} lies over the figure ${js(f)}`);
      }
      assert.ok(Math.abs((tables[0].top + tables[0].bottom) / 2 - 540) <= 1, `table 1 ${js(tables[0])} is not at the middle of the slide`);
      await undo(page);
      await undo(page);
      assert.equal(await render(page), base);
      assert.deepEqual(errors(page), []);
    });
  }

  // F7: the entry Delete Text Box of a box left by a click on a row of the navigator was opened on
  // the clicked slide, hence its undo showed this slide and not the slide of the box
  for (const platform of PLATFORMS) {
    test(`the undo of Delete Text Box shows the slide of the box (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 4);
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(300);
      await type(page, 'hello');
      await sleep(1300);
      await press(page, 'Shift+Home');
      await press(page, 'Mod+B');
      await press(page, 'Backspace');
      await sleep(300);
      const emptied = await render(page);
      await click(page, '.beeson-edit-nav .row:nth-child(3)');
      await sleep(700);
      assert.equal(await page.evaluate('Reveal.getIndices().h'), 1);
      assert.equal((await labels(page)).undo, 'Undo Delete Text Box');
      const left = await render(page);
      await press(page, 'Escape');
      await undo(page);
      await frames(page);
      assert.equal(await page.evaluate('Reveal.getIndices().h'), 4, 'the undo of Delete Text Box does not show the slide of the box');
      assert.equal(await render(page), emptied);
      await page.evaluate('Reveal.slide(1)');
      await frames(page);
      await redo(page);
      await frames(page);
      assert.equal(await page.evaluate('Reveal.getIndices().h'), 4, 'the redo of Delete Text Box does not show the slide of the box');
      assert.equal(await render(page), left);
      assert.deepEqual(errors(page), []);
    });
  }

  // F19: with the read of the clipboard refused, Paste of the Edit menu pasted nothing and said
  // nothing, while Mod+V pasted
  for (const platform of PLATFORMS) {
    test(`Paste of the Edit menu with the read of the clipboard refused says that Mod+V pastes (${platform})`, async (t) => {
      const page = await load(t, platform, TABLES, 2);
      await page.send('Page.bringToFront');
      await page.send('Browser.setPermission', { origin: server.origin, permission: { name: 'clipboard-read' }, setting: 'denied' });
      assert.equal(await page.evaluate(`navigator.clipboard.readText().then(() => 'read', (e) => e.name)`), 'NotAllowedError');
      await clickText(page, await rect(page, `document.querySelector('.reveal section.present h2')`).then((p) => ({ x: p.x, y: p.y + 260 })));
      await sleep(200);
      const base = await render(page);
      await menu(page, 'Edit', 'Paste');
      assert.equal(await render(page), base);
      const state = await page.evaluate(`document.querySelector('.beeson-edit-titlebar .state').textContent`);
      const key = platform === 'mac' ? '⌘V' : 'Ctrl+V';
      assert.match(state, /browser/i, `the state does not say that the browser refused the read: ${state}`);
      assert.ok(state.includes(key), `the state does not name ${key}: ${state}`);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R15.12 on both platforms, the findings F1, F2, F6, F7, and F11 of the review
// of round 7: a new text box in the block of a title or a closing slide, Distribute of texts at one
// margin, and the lifted copy of a row at a zoom and at a change of slide
describe('the first key in a new title box', () => {
  const PLATFORMS = ['mac', 'other'];
  const TABLES = 'test/pages/editor-r13-3.html';

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
  const undoLabel = (page) => state(page, 'edit.undo').then((s) => s.label);
  const near = (a, b, what, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);
  let saves = 0;

  // the editor on slide n of deck, served over HTTP, with the storage of the origin emptied
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
    await wait(page);
    return page;
  }

  // the texts of the block of the current slide in slide px, and the new text box, a child of the
  // section after them: the box of each and the boxes of its lines, with the box of an empty text as
  // its one line
  const TEXTS = `(() => {
  const s = document.querySelector('.reveal .slides'), S = s.getBoundingClientRect(), k = S.width / s.offsetWidth;
  const px = (r) => ({ top: (r.top - S.top) / k, bottom: (r.bottom - S.top) / k, left: (r.left - S.left) / k, right: (r.right - S.left) / k });
  const c = Reveal.getCurrentSlide();
  return [...c.querySelector('.title-text').children, ...c.querySelectorAll(':scope > p')].map((e) => {
    const range = document.createRange();
    range.selectNodeContents(e);
    const lines = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map(px);
    return { name: e.classList.contains('beeson-pending') ? 'box' : e.localName + (e.className ? '.' + e.className : ''), text: e.textContent, box: px(e.getBoundingClientRect()), lines: lines.length ? lines : [px(e.getBoundingClientRect())] };
  });
})()`;
  const meets = (a, b) => a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5 && a.left < b.right && b.left < a.right;

  // F1: on a title or a closing slide the block is anchored at its bottom. at the first key the
  // texts of the block moved down by 48 px, and the box was held in its place over the last line
  for (const platform of PLATFORMS) {
    test(`the first key in a new text box of a title or a closing slide moves no text, and the box does not lie over a text (${platform})`, async (t) => {
      for (const n of [0, 12]) {
        const page = await load(t, platform, n);
        await click(page, '.beeson-edit-top [data-command="insert.text"]');
        await wait(page, 200);
        const empty = await page.evaluate(TEXTS);
        assert.equal(empty.at(-1)?.name, 'box', `Text does not add an empty box after the texts of the block of slide ${n + 1}`);
        await type(page, 'Hq');
        await wait(page);
        const written = await page.evaluate(TEXTS);
        assert.equal(written.length, empty.length);
        const box = written.at(-1);
        assert.equal(box.text, 'Hq');
        for (let i = 0; i < empty.length - 1; i++) near(written[i].box.top, empty[i].box.top, `the first key on slide ${n + 1} moves the ${empty[i].name}`, 0.6);
        near(box.box.top, empty.at(-1).box.top, `the first key on slide ${n + 1} moves the box`, 0.6);
        // the distance of the box to the text before it is the distance that the empty box had
        near(box.box.top - written.at(-2).box.bottom, empty.at(-1).box.top - empty.at(-2).box.bottom, `the gap over the box on slide ${n + 1}`, 0.6);
        for (const other of written.slice(0, -1)) {
          for (const a of box.lines) for (const b of other.lines) assert.ok(!meets(a, b), `a line of the box on slide ${n + 1} lies over a line of the ${other.name}: ${js({ a, b })}`);
        }
        const text = await render(page);
        assert.match(text, /<\/div>\s*(<div class="qr"[^>]*><\/div>\s*)?<p style="(width: \d+px; )?translate: \d+px \d+px;?">Hq<\/p>/, `the box of slide ${n + 1} is not written as a paragraph with its translate after the block`);
        const { text: saved } = await saveAndReopen(page, `r15-12-${++saves}.html`);
        assert.equal(saved, text);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }

  // the left and the right of the heading, the paragraph, and the list of slide 5, in slide px
  const COLUMN = `(() => {
  const s = document.querySelector('.reveal .slides'), S = s.getBoundingClientRect(), k = S.width / s.offsetWidth;
  const c = Reveal.getCurrentSlide();
  return Object.fromEntries(['h2', 'p', 'ul'].map((n) => { const r = c.querySelector(':scope > ' + n).getBoundingClientRect(); return [n, [Math.round((r.left - S.left) / k), Math.round((r.right - S.left) / k)]]; }));
})()`;

  // F2: Distribute Horizontally of three texts at the left margin spaced their centers where the gap
  // is negative, and moved the list by 25 px
  for (const platform of PLATFORMS) {
    test(`Distribute Horizontally of three texts at one left margin leaves them and the file as they are (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await click(page, 'section.present figure img.for-light');
      await click(page, 'section.present h2', { modifiers: 'Shift' });
      await click(page, 'section.present > p', { modifiers: 'Shift' });
      await click(page, 'section.present > ul > li', { modifiers: 'Shift' });
      await click(page, 'section.present figure img.for-light', { modifiers: 'Shift' });
      await wait(page);
      assert.deepEqual((await page.evaluate('window.BeesonEditor.selection().map((e) => e.localName)')).sort(), ['h2', 'p', 'ul']);
      await page.evaluate(`window.BeesonEditor.exec('arrange.alignTo.selection')`);
      assert.equal((await state(page, 'arrange.distribute.horizontal')).enabled, true);
      const before = await page.evaluate(COLUMN);
      await page.evaluate(`window.BeesonEditor.exec('arrange.distribute.horizontal')`);
      await wait(page);
      assert.deepEqual(await page.evaluate(COLUMN), before, 'Distribute moves a text off the margin');
      assert.equal(await render(page), page.source, 'Distribute changes the file');
      assert.deepEqual(errors(page), []);
    });
  }

  // the rows of the table of the current slide, a segment of a bar, and the lifted copy of a row
  const TABLE = `document.querySelector('.reveal section.present table')`;
  const rowsOf = (page) => page.evaluate(`[...${TABLE}.rows].map((tr) => [...tr.cells].map((c) => c.textContent.trim()).join(' '))`);
  const segment = (bar, i) => `.beeson-table-bars .bar.${bar} > [data-index="${i}"]`;
  const middle = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${js(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const boxOf = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; })()`);
  const LIFT = `document.querySelector('.beeson-table-bars .lift')`;
  const pointer = (page, type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const cellPoint = (page, text) => page.evaluate(`(() => {
  const td = [...document.querySelectorAll('.reveal section.present td')].find((c) => c.textContent.trim() === ${js(text)});
  const r = td.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  // row 2 of the plain table selected by its bar and dragged down by one row with the button held
  async function liftRow(page) {
    await click(page, await cellPoint(page, 'A2'));
    await wait(page, 100);
    await click(page, await middle(page, segment('rows', 1)));
    await wait(page, 100);
    const m = await middle(page, segment('rows', 1));
    await drag(page, m, { dy: m.h, steps: 10, hold: true });
    await wait(page, 100);
    assert.ok(await boxOf(page, LIFT), 'the dragged row is not lifted');
    return { x: m.x, y: m.y + m.h };
  }

  // F6: the lifted copy kept its size and its place from the start of the drag after a zoom
  for (const platform of PLATFORMS) {
    test(`the lifted copy of a row is scaled and placed with the table at a zoom during the drag (${platform})`, async (t) => {
      const page = await load(t, platform, 1, TABLES);
      const at = await liftRow(page);
      const l0 = await boxOf(page, LIFT), r0 = await boxOf(page, `${TABLE}.rows[1]`);
      for (let i = 0; i < 3; i++) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x + 60, y: at.y, deltaX: 0, deltaY: -100, modifiers: 2, buttons: 1 });
        await wait(page, 100);
      }
      await wait(page);
      const r1 = await boxOf(page, `${TABLE}.rows[1]`);
      assert.ok(r1.h > r0.h * 1.2, `the canvas is not zoomed: ${js({ r0, r1 })}`);
      const check = async (y, what) => {
        const l = await boxOf(page, LIFT), r = await boxOf(page, `${TABLE}.rows[1]`);
        assert.ok(l, `the lifted row is gone ${what}`);
        near(l.w, r.w, `the width of the lifted row ${what}`, 2);
        near(l.h, r.h, `the height of the lifted row ${what}`, 2);
        near(l.x, r.x, `the left of the lifted row ${what}`, 2);
        // the point of the copy under the pointer is the one pressed, at the scale of the zoom
        near(l.y - y, ((l0.y - at.y) * r.h) / r0.h, `the top of the lifted row against the pointer ${what}`, 2);
      };
      await check(at.y, 'after the zoom');
      await pointer(page, 'mouseMoved', at.x, at.y + 20);
      await wait(page, 100);
      await check(at.y + 20, 'after a move at the zoom');
      await press(page, 'Escape');
      await pointer(page, 'mouseReleased', at.x, at.y + 20);
      await wait(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }

  // F7: a drag by a bar went on after a change of slide, and the release moved the row of the slide
  // that was left, as an entry of the history. a key does not change the slide during the drag, as
  // test/editor-table.test.mjs checks for PageDown
  for (const platform of PLATFORMS) {
    for (const [how, go] of [['Reveal.slide', (page) => page.evaluate('Reveal.slide(2)')]]) {
      test(`a change of slide by ${how} ends the drag of a row by its bar without a change of the file (${platform})`, async (t) => {
        const page = await load(t, platform, 1, TABLES);
        const before = await undoLabel(page);
        const rows = await rowsOf(page);
        const at = await liftRow(page);
        await go(page);
        await wait(page);
        assert.equal(await page.evaluate('Reveal.getIndices().h'), 2, 'the slide is not changed');
        assert.equal(await boxOf(page, LIFT), null, 'the lifted row stays after the change of slide');
        assert.equal(await page.evaluate(`document.querySelector('.beeson-table-bars .lift').children.length`), 0, 'the lifted cells stay in the page');
        await pointer(page, 'mouseMoved', at.x, at.y + 30);
        await pointer(page, 'mouseReleased', at.x, at.y + 30);
        await wait(page);
        assert.equal(await render(page), page.source, 'the release changes the file');
        assert.equal(await undoLabel(page), before, 'the release is an entry of the history');
        await page.evaluate('Reveal.slide(1)');
        await wait(page);
        assert.deepEqual(await rowsOf(page), rows);
        assert.deepEqual(errors(page), []);
      });
    }
  }
});
