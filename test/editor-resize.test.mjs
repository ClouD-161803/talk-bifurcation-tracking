// resizes by the grips and by the fields W and H, with Constrain Proportions, the width written
// being the width drawn, the readouts of a move or a resize, and other fixes of round 6

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { byteExact, click, clickText, drag, press, saveAndReopen, selectFigure, selectPicture, type } from './helpers/editor.mjs';

// resizing, lines, and guides of package R5.2 on both platforms, driven with trusted input: a
// picture sized in the editor is drawn at the size written into its tag, with or without the
// editor, the fields W and H give the drawn picture, a marquee selects a line, an element snaps to
// the ends and the middle of a line and a line to the other elements, the guides placed by hand
// follow their slide, a picture is stretched with Constrain Proportions off, and a text block is
// given a width by its grips. each edit is checked byte for byte after an undo, and after a save
// and an open of the saved text
describe('pictures drawn at the size written', () => {
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const PLATFORMS = ['mac', 'other'];
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const SECTIONS = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].map((m) => m[0]);
  const MATH = SECTIONS.findIndex((s) => s.includes('<h2>Math, an ordered list, and a zone</h2>'));
  const WHITE_FIGURE = SECTIONS.findIndex((s) => s.includes('<h2>A figure slide with a paper image</h2>'));
  const FIGURE_BOX_IMG = '.reveal section.present .figure-box > img';
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

  let last = null;
  let saves = 0;

  // the editor on slide n of the deck of layouts, served over HTTP, with the storage of the browser
  // cleared first unless keep is set
  async function editor(platform, n = MATH, { keep = false } = {}) {
    await last?.close().catch(() => {});
    const page = await browser.newPage();
    last = page;
    await page.send('Page.bringToFront');
    const url = `${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    if (!keep) {
      await page.evaluate('localStorage.clear()');
      await page.goto(url);
    }
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(LAYOUTS, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const near = (a, b, by = 2) => Math.abs(a - b) <= by;

  async function inScope(page) {
    const now = textProblems(await render(page), THEME);
    for (const p of textProblems(page.source, THEME)) {
      const i = now.indexOf(p);
      if (i >= 0) now.splice(i, 1);
    }
    assert.deepEqual(now, []);
  }

  // the edit, the file again after an undo, the edit again after a redo, and a save opened again
  async function roundTrip(page, edited) {
    await undo(page);
    await frames(page);
    await byteExact(page);
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited, 'a redo does not write the edit again');
    await inScope(page);
    await saveAndReopen(page, `r5-2-${++saves}.html`);
  }

  // the screen point of a point in slide px, and the box of an element in slide px
  const screen = (page, x, y) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  return { x: r.left + ${x} * k, y: r.top + ${y} * k };
})()`);
  const slideBox = (page, selector) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width);
  const b = el.getBoundingClientRect();
  return { left: (b.left - r.left) / k, top: (b.top - r.top) / k, width: b.width / k, height: b.height / k };
})()`);

  // the box of the picture of the shown image or video of selector in slide px, fitted in its box
  // with object-fit contain where its style sets that
  const pictureBox = (page, selector) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const sr = s.getBoundingClientRect(), k = sr.width / s.offsetWidth;
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width);
  const r = el.getBoundingClientRect();
  const [w, h] = el instanceof HTMLImageElement ? [el.naturalWidth, el.naturalHeight] : [el.videoWidth, el.videoHeight];
  let b = { left: r.left, top: r.top, width: r.width, height: r.height };
  if (w && h && getComputedStyle(el).objectFit === 'contain') {
    const q = Math.min(r.width / w, r.height / h);
    b = { left: r.left + (r.width - w * q) / 2, top: r.top + (r.height - h * q) / 2, width: w * q, height: h * q };
  }
  return { left: (b.left - sr.left) / k, top: (b.top - sr.top) / k, width: b.width / k, height: b.height / k };
})()`);

  // the height in slide px that the caption of the figure of ZONE_IMG adds to its picture, which the
  // field H of the figure selected as one object gives with the picture, as its frame holds both
  async function captionBand(page) {
    const pic = await pictureBox(page, FIGURE_BOX_IMG), cap = await slideBox(page, '.reveal section.present .figure-box > figcaption');
    return Math.max(pic.top + pic.height, cap.top + cap.height) - Math.min(pic.top, cap.top) - pic.height;
  }

  // the Arrange pane of the Format tab shown, and the values of its fields W and H
  async function arrange(page) {
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await sleep(50);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('${PANEL} button')].find((b) => [b.textContent.trim(), b.title, b.getAttribute('aria-label')].includes('Arrange')); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await clickText(page, at);
    await sleep(50);
    return sizeFields(page);
  }
  const sizeFields = (page) => page.evaluate(`(() => {
  const f = (n) => document.querySelector('${PANEL} #beeson-edit-num-' + n);
  return { w: f('width')?.value ?? null, h: f('height')?.value ?? null, wOff: !!f('width')?.disabled, hOff: !!f('height')?.disabled };
})()`);

  // a value typed into a field of the inspector and committed with Return
  async function setField(page, name, value) {
    const at = await page.evaluate(`(() => { const r = document.querySelector('${PANEL} #beeson-edit-num-${name}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, at, { count: 3 });
    await press(page, 'Mod+A');
    await page.send('Input.insertText', { text: String(value) });
    await press(page, 'Enter');
    await sleep(80);
  }

  // the figure box of the math slide selected with a click on its image, whose grips and size fields size
  // the image, with its caption kept under it
  async function selectFigureBoxFigure(page) {
    await clickText(page, FIGURE_BOX_IMG);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`${platform}: a picture sized past the box of its zone or plate is drawn at the size in its tag, with and without the editor`, async () => {
      const page = await editor(platform);
      await selectFigureBoxFigure(page);
      await arrange(page);
      await setField(page, 'width', 1000);
      const pic = await pictureBox(page, FIGURE_BOX_IMG);
      assert.ok(near(pic.width, 1000) && near(pic.height, 1200), `the image of width 1000 is drawn at ${Math.round(pic.width)} by ${Math.round(pic.height)}`);
      const edited = await render(page);
      assert.match(edited, /<img class="for-dark"[^>]* style="object-fit: contain; width: 1000px; height: 1333px"/, 'the box of the image is not written at the ratio of its zone');
      await roundTrip(page, edited);
      assert.deepEqual(errors(page), []);

      // a white figure of a plate, which the theme scales down to fit
      const plate = await editor(platform, WHITE_FIGURE);
      await clickText(plate, '.reveal section.present .plate > img');
      await clickText(plate, '.reveal section.present .plate > img');
      await arrange(plate);
      await setField(plate, 'width', 1800);
      // the white frame of 24 px around the picture is inside the width of the image
      const whiteFigure = await slideBox(plate, '.reveal section.present .plate > img');
      assert.ok(near(whiteFigure.width, 1800) && near(whiteFigure.height, 1752 * 1.2 + 48), `the paper image of width 1800 is drawn at ${Math.round(whiteFigure.width)} by ${Math.round(whiteFigure.height)}`);
      assert.deepEqual(errors(plate), []);

      // the same tags in a deck without the editor
      const show = await browser.newPage();
      await show.goto(`${server.origin}/${LAYOUTS}?still`);
      await show.waitFor(deckSettled);
      await show.evaluate(`(() => { Reveal.slide(${MATH}); for (const img of document.querySelectorAll('.figure-box > img')) img.style.width = '1000px'; })()`);
      await frames(show);
      const shown = await pictureBox(show, FIGURE_BOX_IMG);
      assert.ok(near(shown.width, 1000) && near(shown.height, 1200), `the deck draws the image of width 1000 at ${Math.round(shown.width)} by ${Math.round(shown.height)}`);
      await show.close();
    });
  }

  for (const platform of PLATFORMS) {
    test(`${platform}: W and H of the Arrange pane give the size of the drawn picture, not of the box of the image`, async () => {
      const page = await editor(platform);
      await selectFigureBoxFigure(page);
      const fields = await arrange(page);
      const pic = await pictureBox(page, FIGURE_BOX_IMG);
      const box = await slideBox(page, FIGURE_BOX_IMG);
      assert.ok(box.height - pic.height > 40, 'the picture fills the box of the image, which this test needs to tell them apart');
      const band = await captionBand(page);
      assert.deepEqual([Number(fields.w), Number(fields.h)], [Math.round(pic.width), Math.round(pic.height + band)], `W and H are ${fields.w} and ${fields.h}, and the picture is ${Math.round(pic.width)} by ${Math.round(pic.height)} with a caption of ${Math.round(band)}`);
      assert.equal(await render(page), page.source, 'the pane writes into the file');
      assert.deepEqual(errors(page), []);
    });
  }

  // the line of the current slide drawn from a to b in slide px with Insert > Line, then deselected
  async function addLine(page, a, b) {
    await exec(page, 'insert.line', { from: a, to: b });
    await frames(page);
    await press(page, 'Escape');
    await frames(page);
  }
  const lineEnds = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-line-end')].filter((g) => !g.hidden).length`);

  for (const platform of PLATFORMS) {
    test(`${platform}: a marquee that touches a line selects it, and one beside it does not`, async () => {
      const page = await editor(platform);
      await addLine(page, { x: 400, y: 960 }, { x: 900, y: 960 });
      assert.equal(await lineEnds(page), 0, 'the line is still selected');
      // a marquee from below the line up across its middle
      const from = await screen(page, 600, 1050);
      const to = await screen(page, 700, 940);
      await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
      await frames(page);
      assert.equal(await lineEnds(page), 2, 'the marquee does not select the line');
      // a marquee beside the end of the line selects nothing
      await press(page, 'Escape');
      const off = await screen(page, 950, 1050);
      const offTo = await screen(page, 1000, 1000);
      await drag(page, off, { dx: offTo.x - off.x, dy: offTo.y - off.y });
      await frames(page);
      assert.equal(await lineEnds(page), 0, 'a marquee beside the line selects it');
      assert.deepEqual(errors(page), []);
    });
  }

  // the guides of a snap that are drawn, each as its axis and its place in slide px
  const guidesShown = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-overlay .beeson-guide')].filter((g) => !g.hidden).map((g) => {
  const s = document.querySelector('.reveal .slides');
  const sr = s.getBoundingClientRect(), k = sr.width / s.offsetWidth, r = g.getBoundingClientRect();
  return g.classList.contains('v') ? ['x', Math.round((r.left - sr.left) / k)] : ['y', Math.round((r.top - sr.top) / k)];
})`);
  const release = (page, at) => page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });

  for (const platform of PLATFORMS) {
    test(`${platform}: a dragged figure snaps to the end and the middle of a line, with the guide drawn`, async () => {
      const page = await editor(platform);
      // a vertical line at x 1100 from y 300 to 700, left of the figure box, with its middle at y 500
      await addLine(page, { x: 1100, y: 300 }, { x: 1100, y: 700 });
      const drawn = await render(page);
      await selectFigure(page, FIGURE_BOX_IMG);
      const figureBox = await slideBox(page, '.reveal section.present .figure-box');
      // the left edge of the figure box is dragged to 5 px right of the line, and its top to 5 px under the
      // middle of the line
      const start = await screen(page, figureBox.left + figureBox.width / 2, figureBox.top + figureBox.height / 2);
      const k = (await screen(page, 1, 0)).x - (await screen(page, 0, 0)).x;
      const dx = (1105 - figureBox.left) * k, dy = (505 - figureBox.top) * k;
      await drag(page, start, { dx, dy, hold: true });
      const guides = await guidesShown(page);
      await release(page, { x: start.x + dx, y: start.y + dy });
      await frames(page);
      const moved = await slideBox(page, '.reveal section.present .figure-box');
      assert.ok(near(moved.left, 1100, 1), `the left edge of the zone is at ${moved.left.toFixed(1)}, not on the line at 1100`);
      assert.ok(near(moved.top, 500, 1), `the top of the zone is at ${moved.top.toFixed(1)}, not at the middle of the line at 500`);
      assert.ok(guides.some(([a, at]) => a === 'x' && near(at, 1100, 1)), `the guide of the line is not drawn: ${JSON.stringify(guides)}`);
      const edited = await render(page);
      await undo(page);
      await frames(page);
      assert.equal(await render(page), drawn, 'an undo does not put the zone back');
      await redo(page);
      assert.equal(await render(page), edited);
      await inScope(page);
      await saveAndReopen(page, `r5-2-${++saves}.html`);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: a dragged line snaps by its end to the middle of a figure and to the end of another line, with the guides drawn`, async () => {
      const page = await editor(platform);
      // a horizontal line under the figure box, whose right end is dragged to 3 px right of the middle of
      // the figure box at x 1500, which is not on a line of the layout
      await addLine(page, { x: 1300, y: 1000 }, { x: 1450, y: 1000 });
      const k = (await screen(page, 1, 0)).x - (await screen(page, 0, 0)).x;
      const z = await slideBox(page, '.reveal section.present .figure-box');
      const middle = z.left + z.width / 2;
      const ends = () => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('svg.line')].map((svg) => { const [x, y] = (svg.style.translate || '0px 0px').split(' ').map(parseFloat); const l = svg.querySelector('line'); const n = (a) => Number(l.getAttribute(a)); return [x + n('x1'), y + n('y1'), x + n('x2'), y + n('y2')]; })`);
      let at = await screen(page, 1375, 1000);
      let dx = (middle + 3 - 1450) * k;
      await drag(page, at, { dx, dy: 0, hold: true });
      let guides = await guidesShown(page);
      await release(page, { x: at.x + dx, y: at.y });
      await frames(page);
      let [line] = await ends(page);
      assert.ok(near(line[2], middle, 1), `the right end of the line is at ${line[2]}, not on the middle of the zone at ${middle}`);
      assert.ok(guides.some(([a, p]) => a === 'x' && near(p, middle, 1)), `the guide of the zone is not drawn: ${JSON.stringify(guides)}`);
      let edited = await render(page);
      await undo(page);
      await frames(page);
      assert.ok((await render(page)).includes('translate: 1300px 1000px'), 'an undo does not put the line back');
      await redo(page);
      assert.equal(await render(page), edited);

      // a second line, whose left end is dragged to 3 px under the right end of the first
      await addLine(page, { x: 400, y: 700 }, { x: 600, y: 700 });
      [, line] = await ends(page);
      const [first] = await ends(page);
      at = await screen(page, 500, 700);
      dx = (first[2] - 400) * k;
      const dy = (first[3] + 3 - 700) * k;
      await drag(page, at, { dx, dy, hold: true });
      guides = await guidesShown(page);
      await release(page, { x: at.x + dx, y: at.y + dy });
      await frames(page);
      const [, second] = await ends(page);
      assert.ok(near(second[0], first[2], 1) && near(second[1], first[3], 1), `the left end of the second line is at ${second[0]}, ${second[1]}, not on the end of the first at ${first[2]}, ${first[3]}`);
      assert.ok(guides.some(([a, p]) => a === 'y' && near(p, first[3], 1)), `the guide of the first line is not drawn: ${JSON.stringify(guides)}`);
      edited = await render(page);
      await undo(page);
      await frames(page);
      assert.ok((await render(page)).includes('translate: 400px 700px'), 'an undo does not put the second line back');
      await redo(page);
      assert.equal(await render(page), edited);
      await inScope(page);
      await saveAndReopen(page, `r5-2-${++saves}.html`);
      assert.deepEqual(errors(page), []);
    });
  }

  // the guides of the current slide, as drawn, the title of the slide, the guides kept in the
  // storage of the browser by an editor before data-guides, by the index of their slide, and the
  // center of a row of the navigator
  const handGuides = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-hand-guide')].filter((g) => !g.hidden && !g.classList.contains('off')).map((g) => [g.dataset.axis, Number(g.dataset.at)])`);
  const goTo = async (page, n) => {
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
  };
  const titleOf = (page) => page.evaluate(`Reveal.getCurrentSlide().querySelector('h1, h2')?.textContent ?? ''`);
  const stored = (page) => page.evaluate(`JSON.parse(localStorage.getItem('beeson-edit-guides:' + location.pathname) ?? '[]')`);
  const navRow = (page, i) => page.evaluate(`(() => {
  const r = document.querySelectorAll('.beeson-edit-nav .row')[${i}];
  r.scrollIntoView({ block: 'center' });
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
})()`);

  for (const platform of PLATFORMS) {
    test(`${platform}: a guide follows its slide when slides are moved, added, duplicated, pasted, and deleted, and through an undo of each`, async () => {
      const page = await editor(platform);
      const title = await titleOf(page);
      // the guides are drawn while the rulers are shown
      await exec(page, 'view.rulers');
      await exec(page, 'view.guides.add', { x: [640], y: [300] });
      await frames(page);
      assert.deepEqual(await handGuides(page), [['x', 640], ['y', 300]]);
      // the guides are in data-guides on the section of the slide, and not in the storage
      const written = (page) => page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].map((s) => s.getAttribute('data-guides'))`);
      const check = async (n, what, copies = [n]) => {
        await goTo(page, n);
        assert.equal(await titleOf(page), title, `the slide is not at ${n} after ${what}`);
        assert.deepEqual(await handGuides(page), [['x', 640], ['y', 300]], `the guides do not follow the slide after ${what}`);
        const attrs = await written(page);
        assert.deepEqual(attrs.flatMap((a, i) => (a === null ? [] : [[i, a]])), copies.map((i) => [i, 'x640 y300']), `data-guides is not on the slides ${copies} after ${what}: ${JSON.stringify(attrs)}`);
        assert.equal((await render(page)).split('data-guides="x640 y300"').length - 1, copies.length, `the file does not hold the guides of ${copies.length} slides after ${what}`);
        assert.deepEqual(await stored(page), [], `guides are kept in the storage after ${what}`);
      };
      await check(MATH, 'the add');
      // moved up with the navigator, and back with an undo
      await clickText(page, await navRow(page, MATH));
      await exec(page, 'slide.moveUp');
      await frames(page);
      await check(MATH - 1, 'a move up');
      await undo(page);
      await check(MATH, 'an undo of the move');
      // a slide added before it
      await clickText(page, await navRow(page, 1));
      await exec(page, 'slide.new');
      await frames(page);
      await check(MATH + 1, 'a new slide before it');
      await undo(page);
      await check(MATH, 'an undo of the new slide');
      // a slide before it deleted
      await clickText(page, await navRow(page, 1));
      await exec(page, 'slide.delete');
      await frames(page);
      await check(MATH - 1, 'a delete of a slide before it');
      await undo(page);
      await check(MATH, 'an undo of the delete');
      // duplicated: the copy after it gets a copy of its guides, as in Keynote
      await clickText(page, await navRow(page, MATH));
      await exec(page, 'slide.duplicate');
      await frames(page);
      await check(MATH + 1, 'a duplicate', [MATH, MATH + 1]);
      await undo(page);
      await check(MATH, 'an undo of the duplicate');
      // copied and pasted after it: the pasted slide keeps the guides, as in Keynote
      await clickText(page, await navRow(page, MATH));
      await exec(page, 'slide.copy');
      await exec(page, 'slide.paste');
      await frames(page);
      await check(MATH + 1, 'a paste', [MATH, MATH + 1]);
      await undo(page);
      await check(MATH, 'an undo of the paste');
      // an undo of the add takes the guides off the file
      const tag = '<section>\n  <h2>Math, an ordered list, and a zone</h2>';
      await byteExact(page, [[tag, tag.replace('<section>', '<section data-guides="x640 y300">')]]);
      await undo(page);
      await frames(page);
      assert.deepEqual(await handGuides(page), []);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: a guide stored in an earlier session is read at its slide after a slide is added before it`, async () => {
      // the guide as an editor before data-guides kept it, in the storage of the browser by the index
      // of its slide
      const first = await editor(platform);
      const legacy = SECTIONS.map((_, i) => ({ x: i === MATH ? [640] : [], y: [] }));
      await first.evaluate(`localStorage.setItem('beeson-edit-guides:' + location.pathname, ${JSON.stringify(JSON.stringify(legacy))})`);
      // the next session adds a slide at the start before it shows the slide of the guide
      const page = await editor(platform, 0, { keep: true });
      await exec(page, 'view.rulers');
      await clickText(page, await navRow(page, 0));
      await exec(page, 'slide.new');
      await frames(page);
      await goTo(page, MATH + 1);
      assert.equal(await titleOf(page), 'Math, an ordered list, and a zone');
      assert.deepEqual(await handGuides(page), [['x', 640]], 'the stored guide is not read at its slide after a slide is added before it');
      await goTo(page, MATH);
      assert.deepEqual(await handGuides(page), [], 'the slide now at the index of the stored guide shows it');
      assert.deepEqual(errors(page), []);
    });
  }

  // the shown grips of the first selected element by their handle, as screen points, the switch
  // Constrain Proportions of the Arrange pane, and the scale from slide px to screen px
  const gripsAt = (page) => page.evaluate(`Object.fromEntries([...document.querySelectorAll('.beeson-grip[data-member="0"]')].filter((g) => !g.hidden).map((g) => { const r = g.getBoundingClientRect(); return [g.dataset.handle, { x: r.left + r.width / 2, y: r.top + r.height / 2 }]; }))`);
  const constrainSwitch = (page) => page.evaluate(`(() => {
  const l = [...document.querySelectorAll('${PANEL} label.ed-check')].find((l) => l.textContent.trim() === 'Constrain Proportions');
  const i = l?.querySelector('input');
  return i ? { checked: i.checked, disabled: i.disabled } : null;
})()`);
  const toggleConstrain = async (page) => {
    const at = await page.evaluate(`(() => { const l = [...document.querySelectorAll('${PANEL} label.ed-check')].find((l) => l.textContent.trim() === 'Constrain Proportions'); const r = l.querySelector('input').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await clickText(page, at);
    await frames(page);
  };
  const scaleOf = async (page) => (await screen(page, 1, 0)).x - (await screen(page, 0, 0)).x;
  const fitOf = (page, selector) => page.evaluate(`getComputedStyle([...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width)).objectFit`);
  const SPLIT = SECTIONS.findIndex((s) => s.includes('<h2>A split slide</h2>'));
  const IMG_STYLE = (style) => new RegExp(`<img class="for-dark"[^>]* style="${style}">`);

  for (const platform of PLATFORMS) {
    test(`${platform}: with Constrain Proportions off, a side grip and the field H stretch an image, whose height is written`, async () => {
      let page = await editor(platform);
      await selectFigureBoxFigure(page);
      await arrange(page);
      assert.deepEqual(await constrainSwitch(page), { checked: true, disabled: false }, 'the switch of an image is not on and free');
      await toggleConstrain(page);
      assert.deepEqual(await constrainSwitch(page), { checked: false, disabled: false }, 'a click does not turn the switch off');
      assert.equal(await render(page), page.source, 'the switch writes into the file');
      const k = await scaleOf(page);
      // the picture of 600 by 720 is narrowed by 100 with its grip e, and keeps its height
      await drag(page, (await gripsAt(page)).e, { dx: -100 * k });
      await frames(page);
      let box = await slideBox(page, FIGURE_BOX_IMG);
      assert.ok(near(box.width, 500) && near(box.height, 720), `the image stretched by its grip e is drawn at ${Math.round(box.width)} by ${Math.round(box.height)}`);
      assert.equal(await fitOf(page, FIGURE_BOX_IMG), 'fill', 'the stretched picture is fitted in its box, not stretched to it');
      let edited = await render(page);
      assert.match(edited, IMG_STYLE('width: 500px; height: 720px(; translate: [^"]+)?'), 'the width and the height are not written on the image');
      assert.deepEqual(await sizeFields(page), { w: '500', h: String(Math.round(720 + (await captionBand(page)))), wOff: false, hOff: false });
      await roundTrip(page, edited);

      // the field H with the switch off sets the height alone, of the picture with its caption
      page = await editor(platform);
      await selectFigureBoxFigure(page);
      await arrange(page);
      await toggleConstrain(page);
      await setField(page, 'height', 400);
      box = await slideBox(page, FIGURE_BOX_IMG);
      const band = await captionBand(page);
      assert.ok(near(box.width, 600) && near(box.height + band, 400), `the image of a figure of height 400 is drawn at ${Math.round(box.width)} by ${Math.round(box.height)} over a caption of ${Math.round(band)}`);
      edited = await render(page);
      assert.match(edited, IMG_STYLE('width: 600px; height: \\d+px(; translate: [^"]+)?'));
      await roundTrip(page, edited);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: with Constrain Proportions on, a corner grip and W and H keep the aspect, and Shift on a corner frees it`, async () => {
      let page = await editor(platform);
      await selectFigureBoxFigure(page);
      await arrange(page);
      const k = await scaleOf(page);
      await drag(page, (await gripsAt(page)).se, { dx: -100 * k, dy: -20 * k });
      await frames(page);
      let box = await slideBox(page, FIGURE_BOX_IMG);
      assert.ok(near(box.width / box.height, 600 / 720, 0.01), `the corner grip changes the aspect to ${Math.round(box.width)} by ${Math.round(box.height)}`);
      let edited = await render(page);
      assert.match(edited, IMG_STYLE('width: \\d+px'), 'a height is written by a resize that keeps the aspect');
      await roundTrip(page, edited);

      // Shift on a corner frees the aspect, and then the side grip e and the field W keep the aspect
      // that the stretched image has. the grip is on the frame of the figure, which holds the band of
      // 40 px between the picture fitted into its figure box and the caption, and the figure box of a picture with
      // a width is the size of the picture, hence the picture is 40 px higher than the frame shrinks
      page = await editor(platform);
      await selectFigureBoxFigure(page);
      await arrange(page);
      await drag(page, (await gripsAt(page)).se, { dx: -100 * k, dy: -120 * k, modifiers: 'Shift' });
      await frames(page);
      box = await slideBox(page, FIGURE_BOX_IMG);
      assert.ok(near(box.width, 500, 3) && near(box.height, 640, 3), `the corner grip with Shift draws the image at ${Math.round(box.width)} by ${Math.round(box.height)}, not at 500 by 640`);
      edited = await render(page);
      assert.match(edited, IMG_STYLE('width: \\d+px; height: \\d+px'), 'the height of an image stretched with Shift is not written');
      const aspect = box.width / box.height;
      await drag(page, (await gripsAt(page)).e, { dx: -100 * k });
      await frames(page);
      box = await slideBox(page, FIGURE_BOX_IMG);
      assert.ok(near(box.width / box.height, aspect, 0.01), `the grip e of a stretched image changes its aspect from ${aspect.toFixed(3)} to ${(box.width / box.height).toFixed(3)}`);
      // the fields of the picture selected inside its figure give the picture alone
      await clickText(page, FIGURE_BOX_IMG);
      await frames(page);
      await setField(page, 'width', 200);
      box = await slideBox(page, FIGURE_BOX_IMG);
      assert.ok(near(box.width, 200) && near(box.height, 200 / aspect), `the field W of a stretched image draws it at ${Math.round(box.width)} by ${Math.round(box.height)}`);
      await setField(page, 'height', 300);
      box = await slideBox(page, FIGURE_BOX_IMG);
      assert.ok(near(box.width, 300 * aspect) && near(box.height, 300), `the field H of a stretched image draws it at ${Math.round(box.width)} by ${Math.round(box.height)}`);
      edited = await render(page);
      for (let n = 0; n < 3; n++) await undo(page);
      await frames(page);
      assert.match(await render(page), IMG_STYLE('width: \\d+px; height: \\d+px'), 'the undo of the field W and the grip e does not give the stretched image back');
      await undo(page);
      await frames(page);
      await byteExact(page);
      for (let n = 0; n < 4; n++) await redo(page);
      assert.equal(await render(page), edited);
      await inScope(page);
      await saveAndReopen(page, `r5-2-${++saves}.html`);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: a video is stretched with its switch off, and a QR code keeps its square with its switch held on`, async () => {
      let page = await editor(platform, SPLIT);
      const VIDEO = '.reveal section.present .figure-box > video';
      // the figure box is selected with a first click, and its video with a second
      await clickText(page, VIDEO);
      await clickText(page, VIDEO);
      await frames(page);
      await arrange(page);
      assert.deepEqual(await constrainSwitch(page), { checked: true, disabled: false }, 'the switch of a video is not on and free');
      await toggleConstrain(page);
      const before = await pictureBox(page, VIDEO);
      await setField(page, 'height', 300);
      const box = await slideBox(page, VIDEO);
      assert.ok(near(box.width, before.width) && near(box.height, 300), `the video of height 300 is drawn at ${Math.round(box.width)} by ${Math.round(box.height)}`);
      assert.equal(await fitOf(page, VIDEO), 'fill', 'the stretched video is letterboxed');
      const edited = await render(page);
      assert.match(edited, /<video src="..\/..\/demo\/clip-dark.mp4" [^>]*style="width: \d+px; height: 300px(; translate: [^"]+)?">/);
      await roundTrip(page, edited);

      page = await editor(platform, 0);
      await page.evaluate(`localStorage.setItem('beeson-edit-constrain-qr', 'off')`);
      await clickText(page, '.reveal section.present .qr');
      await arrange(page);
      assert.deepEqual(await constrainSwitch(page), { checked: true, disabled: true }, 'the switch of a QR code is not held on');
      await setField(page, 'height', 260);
      const qr = await slideBox(page, '.reveal section.present .qr');
      assert.ok(near(qr.width, 260) && near(qr.height, 260), `the QR code of height 260 is drawn at ${Math.round(qr.width)} by ${Math.round(qr.height)}`);
      assert.match(await render(page), /<div class="qr" [^>]*style="width: 260px[^"]*"/);
      assert.deepEqual(errors(page), []);
    });
  }

  // the lead-in paragraph of the math slide, as a point inside its text
  const LEAD = `[...document.querySelectorAll('.reveal section.present p')].find((p) => p.textContent === 'The lead-in of a display')`;
  const leadBox = (page) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const sr = s.getBoundingClientRect(), k = sr.width / s.offsetWidth, b = ${LEAD}.getBoundingClientRect();
  return { left: (b.left - sr.left) / k, top: (b.top - sr.top) / k, width: b.width / k, height: b.height / k, x: b.left + 20, y: b.top + b.height / 2 };
})()`);

  for (const platform of PLATFORMS) {
    test(`${platform}: the side and corner grips of a text block set its width, which W shows, and its height follows its text`, async () => {
      const page = await editor(platform);
      const lead = await leadBox(page);
      await clickText(page, lead);
      await press(page, 'Escape');
      await frames(page);
      const grips = await gripsAt(page);
      assert.deepEqual(Object.keys(grips).sort(), ['e', 'ne', 'nw', 'se', 'sw', 'w'], `a text block shows the grips ${Object.keys(grips).join(' ')}`);
      const k = await scaleOf(page);
      await drag(page, grips.e, { dx: -400 * k });
      await frames(page);
      let box = await leadBox(page);
      assert.ok(near(box.width, lead.width - 400, 9), `the paragraph narrowed by 400 from ${Math.round(lead.width)} is ${Math.round(box.width)} wide`);
      assert.ok(near(box.left, lead.left, 1), 'the grip e moves the left edge of the paragraph');
      let edited = await render(page);
      assert.match(edited, new RegExp(`<p style="width: ${Math.round(box.width)}px">The lead-in of a display</p>`), 'the width of the paragraph is not written in px');
      const fields = await arrange(page);
      assert.deepEqual([fields.w, fields.wOff, fields.hOff], [String(Math.round(box.width)), false, true], `W and H of a text block are ${JSON.stringify(fields)}`);
      await setField(page, 'width', 200);
      box = await leadBox(page);
      assert.ok(near(box.width, 200) && box.height > lead.height * 1.5, `the paragraph of width 200 is ${Math.round(box.width)} by ${Math.round(box.height)}, and its text does not wrap`);
      edited = await render(page);
      assert.match(edited, /<p style="width: 200px">The lead-in of a display<\/p>/);
      await undo(page);
      await undo(page);
      await frames(page);
      await byteExact(page);
      await redo(page);
      await redo(page);
      assert.equal(await render(page), edited);
      await inScope(page);
      await saveAndReopen(page, `r5-2-${++saves}.html`);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`${platform}: a text block narrowed by a grip until its text wraps keeps its top, and grows down`, async () => {
      const page = await editor(platform);
      const lead = await leadBox(page);
      await clickText(page, lead);
      await press(page, 'Escape');
      await frames(page);
      const k = await scaleOf(page);
      for (const handle of ['e', 'se', 'w']) {
        await drag(page, (await gripsAt(page))[handle], { dx: (handle === 'w' ? 760 : -760) * k, dy: handle === 'se' ? 30 * k : 0 });
        await frames(page);
        const box = await leadBox(page);
        assert.ok(box.height > lead.height * 1.5, `the paragraph narrowed by the grip ${handle} to ${Math.round(box.width)} does not wrap`);
        assert.ok(near(box.top, lead.top, 1), `the paragraph narrowed by the grip ${handle} has its top at ${box.top.toFixed(1)}, not at ${lead.top.toFixed(1)}`);
        await undo(page);
        await frames(page);
        await byteExact(page);
      }
      assert.deepEqual(errors(page), []);
    });
  }

  // the screen point of the end 2 of the line of the current slide, and the center of its grip
  const arrowAt = (page) => page.evaluate(`(() => {
  const svg = Reveal.getCurrentSlide().querySelector('svg.line');
  const l = svg.querySelector('line'), r = svg.getBoundingClientRect(), k = r.width / svg.width.baseVal.value;
  const n = (a) => Number(l.getAttribute(a));
  const end = { x: r.left + n('x2') * k, y: r.top + n('y2') * k };
  return { end, grip: [...document.querySelectorAll('.beeson-line-end')].filter((g) => !g.hidden && g.dataset.end === '2').map((g) => { const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })[0] };
})()`);

  for (const platform of PLATFORMS) {
    test(`${platform}: the grip of the end of a selected arrow is on its tip, its end is dragged by its grip, and the selection counts it`, async () => {
      const page = await editor(platform);
      await exec(page, 'insert.arrow', { from: { x: 300, y: 980 }, to: { x: 900, y: 980 } });
      await frames(page);
      const at = await arrowAt(page);
      assert.ok(at.grip, 'the end of the arrow does not have a grip');
      assert.ok(near(at.grip.x, at.end.x, 1) && near(at.grip.y, at.end.y, 1), `the grip of the arrowhead is off its end: ${JSON.stringify(at)}`);
      const sel = await page.evaluate('window.BeesonEditor.selection?.()');
      assert.equal(Array.isArray(sel) ? sel.length : sel?.elements?.length, 1, 'BeesonEditor.selection() does not count the selected arrow');
      // a drag of the grip moves the end by the drag, without a jump to the pointer
      const k = await scaleOf(page);
      await drag(page, at.grip, { dx: 0, dy: -100 * k, modifiers: platform === 'mac' ? 'Meta' : 'Alt' });
      await frames(page);
      const moved = await arrowAt(page);
      assert.ok(near(moved.end.x, at.end.x, 1.5) && near(moved.end.y, at.end.y - 100 * k, 1.5), `the end dragged by 100 up is at ${JSON.stringify(moved.end)}, from ${JSON.stringify(at.end)}`);
      const edited = await render(page);
      await undo(page);
      await frames(page);
      assert.ok((await render(page)).includes('marker-end'), 'an undo removes the arrow');
      await redo(page);
      assert.equal(await render(page), edited);
      await inScope(page);
      await saveAndReopen(page, `r5-2-${++saves}.html`);
      assert.deepEqual(errors(page), []);
    });
  }

  // the selected elements by their tag and first class
  const selected = (page) => page.evaluate(`(window.BeesonEditor.selection?.() ?? []).map((e) => [e.tagName.toLowerCase(), ...e.classList].slice(0, 2).join('.'))`);

  for (const platform of PLATFORMS) {
    test(`${platform}: the first click on the image of a figure selects the figure, and the second the image, which is rotated without its caption, and Esc selects the figure`, async () => {
      const page = await editor(platform);
      const caption = await slideBox(page, '.reveal section.present .figure-box .caption');
      await clickText(page, FIGURE_BOX_IMG);
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box'], 'the first click on the image does not select its figure');
      await clickText(page, FIGURE_BOX_IMG);
      await frames(page);
      assert.deepEqual(await selected(page), ['img.for-dark'], 'the second click on the image does not select the image');
      assert.equal((await state(page, 'image.editMask')).enabled, true, 'Edit Mask is not offered on the image');
      // Select Figure of the Edit menu, and a click on the band under the figure, select the figure
      assert.equal((await state(page, 'selection.container')).enabled, true, 'Select Figure is not offered on the image');
      await exec(page, 'selection.container');
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box'], 'Select Figure does not select the figure of the image');
      await clickText(page, FIGURE_BOX_IMG);
      const z = await page.evaluate(`(() => { const r = document.querySelector('.reveal section.present .figure-box').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom + 3 }; })()`);
      await clickText(page, z);
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box'], 'a click on the band under the figure does not select it');
      await clickText(page, FIGURE_BOX_IMG);
      await frames(page);
      assert.deepEqual(await selected(page), ['img.for-dark'], 'a click on the image of a selected figure does not select the image');
      const rotor = await page.evaluate(`(() => { const r = document.querySelector('.beeson-rotor').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const k = await scaleOf(page);
      await drag(page, rotor, { dx: 200 * k, dy: 0 });
      await frames(page);
      const edited = await render(page);
      assert.match(edited, /<img class="for-dark" [^>]*style="rotate: -?\d+(\.\d+)?deg"/, 'the image is not rotated');
      assert.match(edited, /<img class="for-light" [^>]*style="rotate: -?\d+(\.\d+)?deg"/, 'the image of the other mode is not rotated with it');
      assert.match(edited, /<figure class="figure-box fragment" data-fragment-index="2">/, 'the figure is rotated');
      assert.deepEqual(await slideBox(page, '.reveal section.present .figure-box .caption'), caption, 'the caption moves with the image');
      await roundTrip(page, edited);
      await goTo(page, MATH);
      await selectPicture(page, FIGURE_BOX_IMG);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box'], 'Esc on the image does not select its figure');
      assert.deepEqual(errors(page), []);
    });
  }

  // the first click on the image of a locked figure selected the image, which is not locked itself,
  // and was then moved, resized, and rotated past the lock of its figure
  for (const platform of PLATFORMS) {
    test(`${platform}: the first click on the image of a locked figure selects the figure, which is not moved or rotated`, async () => {
      const page = await editor(platform);
      await selectFigure(page, FIGURE_BOX_IMG);
      await press(page, 'Mod+L');
      await frames(page);
      const locked = await render(page);
      assert.match(locked, /<figure class="figure-box fragment" data-fragment-index="2" data-locked>/, 'the figure is not locked');
      await press(page, 'Escape');
      await clickText(page, FIGURE_BOX_IMG);
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box'], 'the first click on the image of a locked figure does not select the figure');
      assert.equal((await state(page, 'selection.selectMedia')).enabled, false, 'Return selects the image of a locked figure');
      assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-rotor')].filter((r) => !r.hidden && r.getBoundingClientRect().width).length`), 0, 'a rotate grip is drawn on a locked figure');
      const k = await scaleOf(page);
      await drag(page, FIGURE_BOX_IMG, { dx: 120 * k, dy: 40 * k });
      await frames(page);
      assert.equal(await render(page), locked, 'a drag of the image changes a locked figure');
      assert.deepEqual(errors(page), []);
    });
  }

  // the frames, the grips, and the boxes of the members of the selection, in CSS px of the viewport.
  // a text block is boxed by its box, and a figure by its drawn picture and its caption, which are
  // the boxes that W and H of the Arrange pane give for a group
  const groupView = (page) => page.evaluate(`(() => {
  const shown = (s) => [...document.querySelectorAll(s)].filter((e) => !e.hidden && e.getBoundingClientRect().width);
  const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const pic = (el) => [...el.querySelectorAll('img')].find((i) => i.getBoundingClientRect().width) ?? el;
  // the picture of an image, fitted in its box with object-fit contain
  const drawn = (el) => {
    const r = el.getBoundingClientRect();
    if (!(el instanceof HTMLImageElement) || getComputedStyle(el).objectFit !== 'contain') return r;
    const q = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight), w = el.naturalWidth * q, h = el.naturalHeight * q;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, right: r.left + (r.width + w) / 2, bottom: r.top + (r.height + h) / 2 };
  };
  const members = window.BeesonEditor.selection().map((el) => {
    const r = drawn(pic(el));
    const caps = el.matches('figure') ? [...el.querySelectorAll(':scope > figcaption, :scope > .caption')].map((c) => c.getBoundingClientRect()).filter((c) => c.width) : [];
    return { left: Math.min(r.left, ...caps.map((c) => c.left)), top: Math.min(r.top, ...caps.map((c) => c.top)), right: Math.max(r.right, ...caps.map((c) => c.right)), bottom: Math.max(r.bottom, ...caps.map((c) => c.bottom)) };
  });
  return {
    members,
    frames: shown('.beeson-frame.selected').length,
    union: shown('.beeson-frame.union').map((f) => ({ ...box(f.getBoundingClientRect()), group: f.classList.contains('group') })),
    grips: shown('.beeson-grip').map((g) => { const r = g.getBoundingClientRect(); return { handle: g.dataset.handle, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }),
  };
})()`);

  for (const platform of PLATFORMS) {
    test(`${platform}: a selected group is drawn with one frame and one set of grips around its members, which scale them together`, async () => {
      const page = await editor(platform);
      await selectFigure(page, FIGURE_BOX_IMG);
      const lead = await page.evaluate(`(() => { const r = ${LEAD}.getBoundingClientRect(); return { x: r.right + 3, y: r.top + r.height / 2 }; })()`);
      await click(page, lead, { modifiers: 'Shift' });
      await exec(page, 'arrange.group');
      await frames(page);
      const v = await groupView(page);
      assert.equal(v.members.length, 2, 'the group of the paragraph and the figure is not selected');
      // the frame stands 8 px outside the members, since the figure holds a caption
      const left = Math.min(...v.members.map((m) => m.left)) - 8, top = Math.min(...v.members.map((m) => m.top)) - 8;
      const right = Math.max(...v.members.map((m) => m.right)) + 8, bottom = Math.max(...v.members.map((m) => m.bottom)) + 8;
      assert.equal(v.frames, 0, 'each member of the group is framed by itself');
      assert.equal(v.union.length, 1, 'the group does not have one frame');
      assert.ok(v.union[0].group, 'the frame of the group is drawn as the frame of a multiple selection');
      assert.ok(near(v.union[0].left, left, 1) && near(v.union[0].top, top, 1) && near(v.union[0].right, right, 1) && near(v.union[0].bottom, bottom, 1), `the frame ${JSON.stringify(v.union[0])} is not around the members ${JSON.stringify({ left, top, right, bottom })}`);
      assert.equal(v.grips.length, 8, `the group has ${v.grips.length} grips, not one set of eight`);
      const se = v.grips.find((g) => g.handle === 'se');
      assert.ok(near(se.x, right, 1) && near(se.y, bottom, 1), 'the grip se is not at the corner of the group');
      // a drag of the corner scales both members about the corner across from it
      const before = await page.evaluate(`window.BeesonEditor.selection().map((el) => ([...el.querySelectorAll('img')].find((i) => i.getBoundingClientRect().width) ?? el).getBoundingClientRect().width)`);
      await drag(page, se, { dx: -(right - left) * 0.2, dy: -(bottom - top) * 0.2 });
      await frames(page);
      const after = await groupView(page);
      const widths = await page.evaluate(`window.BeesonEditor.selection().map((el) => ([...el.querySelectorAll('img')].find((i) => i.getBoundingClientRect().width) ?? el).getBoundingClientRect().width)`);
      const k = widths.map((w, i) => w / before[i]);
      assert.ok(k.every((x) => x < 0.9), `the members are scaled by ${k}`);
      assert.ok(near(k[0], k[1], 0.03), `the members are scaled by ${k}, not together`);
      assert.ok(near(Math.min(...after.members.map((m) => m.left)), left + 8, 3) && near(Math.min(...after.members.map((m) => m.top)), top + 8, 3), 'the corner across from the grip moves');
      const edited = await render(page);
      const tag = edited.match(/<p [^>]*>The lead-in of a display<\/p>/)?.[0] ?? '';
      assert.ok(/data-group="g1"/.test(tag) && /style="[^"]*width: \d+px/.test(tag), `the width of the paragraph is not written: ${tag}`);
      // the resize and the group are undone, and redone
      await undo(page);
      await undo(page);
      await frames(page);
      await byteExact(page);
      await redo(page);
      await redo(page);
      assert.equal(await render(page), edited);
      await inScope(page);
      await saveAndReopen(page, `r5-2-${++saves}.html`);
      assert.deepEqual(errors(page), []);
    });
  }

  // the box of the rotate grip, and the boxes of the lines of text of the blocks of the current slide
  // other than the selected one, in CSS px of the viewport
  const rotorView = (page) => page.evaluate(`(() => {
  const g = document.querySelector('.beeson-rotor');
  const r = g.hidden ? null : g.getBoundingClientRect();
  const own = window.BeesonEditor.selection()[0];
  const text = [];
  for (const el of Reveal.getCurrentSlide().querySelectorAll('h1, h2, h3, p, li, div.math, .caption')) {
    if (own && (own.contains(el) || el.contains(own))) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    for (const b of range.getClientRects()) if (b.width && b.height) text.push({ el: el.localName, left: b.left, top: b.top, right: b.right, bottom: b.bottom });
  }
  const f = [...document.querySelectorAll('.beeson-frame.selected')].find((f) => !f.hidden)?.getBoundingClientRect();
  const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === g;
  return { rotor: r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, frame: f && { top: f.top }, hit, text };
})()`);
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  for (const platform of PLATFORMS) {
    test(`${platform}: the rotate grip of a selected text block is above its frame, off the text of another block where there is room, and turns the block`, async () => {
      const page = await editor(platform);
      // the display reaches down to the frame of the second paragraph, whose grip thus covers it, as
      // the rotate handle of PowerPoint covers a shape above
      const blocks = [['The lead-in of a display', true], ['where the Coriolis term is colored.', false]];
      for (const [words, room] of blocks) {
        const at = await page.evaluate(`(() => { const p = [...document.querySelectorAll('.reveal section.present p')].find((p) => p.textContent === ${JSON.stringify(words)}); const r = p.getBoundingClientRect(); return { x: r.right + 3, y: r.top + r.height / 2 }; })()`);
        await clickText(page, at);
        await frames(page);
        const v = await rotorView(page);
        assert.ok(v.rotor, `the paragraph "${words}" does not have a rotate grip`);
        assert.ok(v.rotor.bottom < v.frame.top, `the rotate grip of "${words}" is not above its frame`);
        assert.ok(v.hit, `the rotate grip of "${words}" cannot be pressed`);
        const hit = v.text.find((t) => overlaps(v.rotor, t));
        if (room) assert.ok(!hit, `the rotate grip of "${words}" at ${JSON.stringify(v.rotor)} covers the text of a ${hit?.el} at ${JSON.stringify(hit)}`);
      }
      // the grip turns the last block
      const v = await rotorView(page);
      await drag(page, { x: (v.rotor.left + v.rotor.right) / 2, y: (v.rotor.top + v.rotor.bottom) / 2 }, { dx: 120, dy: 40 });
      await frames(page);
      const edited = await render(page);
      assert.match(edited, /<p class="fragment" data-fragment-index="2" data-highlight="coriolis" style="rotate: \d+deg">/, 'the grip does not turn the paragraph');
      await roundTrip(page, edited);
      assert.deepEqual(errors(page), []);
    });
  }

  // the points of a grid over the inspector at which the stage of the mask edit is hit, and whether
  // the box of the stage reaches into the inspector
  const maskOverInspector = (page) => page.evaluate(`(() => {
  const pane = document.querySelector('${PANEL}').getBoundingClientRect();
  if (!pane.width) return { reaches: false, hits: [] };
  const stage = document.querySelector('.beeson-mask-stage').getBoundingClientRect();
  const reaches = stage.right > pane.left && stage.left < pane.right && stage.bottom > pane.top && stage.top < pane.bottom;
  const hits = [];
  for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
    const x = pane.left + (pane.width * i) / 10, y = pane.top + (pane.height * j) / 10;
    if (document.elementFromPoint(x, y)?.closest('.beeson-mask-layer')) hits.push([Math.round(x), Math.round(y)]);
  }
  return { reaches, hits };
})()`);

  for (const platform of PLATFORMS) {
    test(`${platform}: the faded picture of Edit Mask at a high zoom is clipped to the canvas, out of the inspector`, async () => {
      const page = await editor(platform);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await selectFigureBoxFigure(page);
      await page.evaluate('window.BeesonEditorShell.stage.setZoom(3)');
      await frames(page);
      await exec(page, 'image.editMask');
      await frames(page);
      // the picture scaled to the top of the slider, past the right edge of the canvas
      await page.evaluate(`(() => {
      const s = document.querySelector('dialog.beeson-mask-bar input[type=range]');
      s.value = '1000';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
      await frames(page);
      const v = await maskOverInspector(page);
      assert.ok(v.reaches, 'the stage of the mask edit does not reach into the inspector, hence the test does not see the bug');
      assert.deepEqual(v.hits, [], 'the mask edit is drawn over the inspector');
      await press(page, 'Escape');
      await frames(page);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }
});

// package R6.7 on both platforms, driven with trusted input: a width written by a resize grip is
// the width drawn, for a picture, a video, a QR code, and a text block, also past the box of a figure box
describe('the width written by a grip is drawn', () => {
  const PLATFORMS = ['mac', 'other'];
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const SECTIONS = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].map((m) => m[0]);
  const MATH = SECTIONS.findIndex((s) => s.includes('<h2>Math, an ordered list, and a zone</h2>'));
  const SPLIT = SECTIONS.findIndex((s) => s.includes('<h2>A split slide</h2>'));
  const NARROW = SECTIONS.findIndex((s) => s.includes('<h2>A narrow slide</h2>'));

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
  let saves = 0;

  // the editor on slide n of the deck of layouts, served over HTTP, with the storage cleared
  async function editor(platform, n) {
    await last?.close().catch(() => {});
    const page = await browser.newPage();
    last = page;
    await page.send('Page.bringToFront');
    const url = `${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(LAYOUTS, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  // the shown grips of the first selected element by their handle, as screen points
  const gripsAt = (page) => page.evaluate(`Object.fromEntries([...document.querySelectorAll('.beeson-grip[data-member="0"]')].filter((g) => !g.hidden).map((g) => { const r = g.getBoundingClientRect(); return [g.dataset.handle, { x: r.left + r.width / 2, y: r.top + r.height / 2 }]; }))`);

  // the width in the style of the shown element of selector, and the width of what is drawn, both in
  // slide px: the picture of an image or a video fitted in its box, and else the box
  const widths = (page, selector) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const k = s.getBoundingClientRect().width / s.offsetWidth;
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width);
  const r = el.getBoundingClientRect();
  let drawn = r.width;
  const [w, h] = el instanceof HTMLImageElement ? [el.naturalWidth, el.naturalHeight] : el instanceof HTMLVideoElement ? [el.videoWidth, el.videoHeight] : [0, 0];
  if (w && h && getComputedStyle(el).objectFit === 'contain') drawn = w * Math.min(r.width / w, r.height / h);
  return { written: parseFloat(el.style.width), drawn: drawn / k, scale: k };
})()`);

  // each element, how it is selected, the grip that is dragged, and how far to the right in slide px
  const CASES = [
    { name: 'an image of a zone', slide: MATH, selector: '.reveal section.present .figure-box > img', clicks: 1, grip: 'se', dx: 400 },
    { name: 'a video of a zone', slide: SPLIT, selector: '.reveal section.present .figure-box > video', clicks: 2, grip: 'se', dx: 400 },
    { name: 'a QR code', slide: 0, selector: '.reveal section.present .qr', clicks: 1, grip: 'se', dx: 300 },
    { name: 'a text block', slide: MATH, selector: '.reveal section.present p', text: 'The lead-in of a display', grip: 'e', dx: 500 },
    { name: 'the heading of a narrow slide', slide: NARROW, selector: '.reveal section.present h2', text: 'A narrow slide', grip: 'e', dx: 400 },
  ];

  for (const platform of PLATFORMS) {
    for (const c of CASES) {
      test(`${platform}: the width that a grip writes on ${c.name} is the width drawn, also past the box of its zone`, async () => {
        const page = await editor(platform, c.slide);
        // a text block is selected by a click into its text and Esc
        const selector = c.text ? `${c.selector}[data-r67]` : c.selector;
        if (c.text) {
          await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(c.selector)})].find((p) => p.textContent === ${JSON.stringify(c.text)}).setAttribute('data-r67', '')`);
          const at = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; })()`);
          await clickText(page, at);
          await press(page, 'Escape');
        } else for (let n = 0; n < c.clicks; n++) await clickText(page, c.selector);
        await frames(page);
        const before = await widths(page, selector);
        const grips = await gripsAt(page);
        assert.ok(grips[c.grip], `${c.name} does not show the grip ${c.grip}: ${Object.keys(grips).join(' ')}`);
        await drag(page, grips[c.grip], { dx: c.dx * before.scale, dy: c.grip === 'se' ? 10 * before.scale : 0 });
        await frames(page);
        const after = await widths(page, selector);
        assert.ok(after.written > before.drawn + 50, `the grip wrote a width of ${after.written} on ${c.name} drawn at ${Math.round(before.drawn)}`);
        assert.ok(Math.abs(after.written - after.drawn) <= 2, `the grip wrote width: ${after.written}px on ${c.name}, which is drawn at ${Math.round(after.drawn)} px`);
        const edited = await render(page);
        assert.ok(edited.includes(`width: ${after.written}px`), `the width ${after.written} is not written into the file`);
        await undo(page);
        await frames(page);
        await byteExact(page);
        await redo(page);
        await frames(page);
        assert.equal(await render(page), edited);
        await saveAndReopen(page, `r6-7-${++saves}.html`);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the items of the open menus that run a command, as its id, label, and key text
  const shownItems = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item[data-command]')].map((i) => ({ id: i.dataset.command, label: i.querySelector('.label').textContent, keys: i.querySelector('.keys').textContent }))`);

  async function openBar(page, bar) {
    await clickText(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${JSON.stringify(bar)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await frames(page);
  }

  // the rows of the sheet of keyboard shortcuts by its group and label, opened from the Help menu
  async function sheetRows(page) {
    await page.evaluate(`window.BeesonEditor.exec('help.keys')`);
    await frames(page);
    const rows = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('dialog.beeson-edit-keys section')].flatMap((s) => [...s.querySelectorAll('.row')].map((r) => [s.querySelector('h3').textContent + ' > ' + r.firstChild.textContent, r.lastChild.textContent])))`);
    await press(page, 'Escape');
    return rows;
  }

  // the notation of each platform: the symbols of Keynote on a Mac, and the words of PowerPoint for
  // Windows elsewhere, e.g. Ctrl+Shift+Up Arrow and Page Down
  const NOTATION = {
    mac: { 'arrange.order.front': '⇧⌘F', 'navigate.next': '⇟', 'edit.redo': '⇧⌘Z', redoSheet: '⇧⌘Z, ⌘Y', nextSheet: '⇟, →, ↓' },
    other: { 'arrange.order.front': 'Ctrl+Shift+Up Arrow', 'navigate.next': 'Page Down', 'edit.redo': 'Ctrl+Y', redoSheet: 'Ctrl+Y, Ctrl+Shift+Z', nextSheet: 'Page Down, Right Arrow, Down Arrow' },
  };

  for (const platform of PLATFORMS) {
    test(`${platform}: a menu, a context menu, a tooltip, and the sheet write the keys of a command in one notation`, async () => {
      const page = await editor(platform, MATH);
      await clickText(page, '.reveal section.present .figure-box > img');
      await frames(page);
      const menus = new Map();
      for (const bar of ['File', 'Edit', 'Insert', 'Format', 'Arrange', 'Slide', 'View', 'Help']) {
        await openBar(page, bar);
        for (const item of await shownItems(page)) menus.set(item.id, { ...item, bar });
        await press(page, 'Escape');
        await frames(page);
      }
      const sheet = await sheetRows(page);
      let compared = 0;
      for (const item of menus.values()) {
        if (!item.keys) continue;
        const row = sheet[`${item.bar} > ${item.label}`];
        assert.ok(row, `the sheet does not list ${item.bar} > ${item.label}`);
        assert.equal(row.split(', ')[0], item.keys, `${item.bar} > ${item.label} reads ${item.keys} in its menu and ${row} in the sheet`);
        compared++;
      }
      assert.ok(compared > 20, `only ${compared} items of the menus have keys`);
      const want = NOTATION[platform];
      for (const id of ['arrange.order.front', 'navigate.next', 'edit.redo']) assert.equal(menus.get(id)?.keys, want[id], id);
      assert.equal(sheet['Edit > Redo'], want.redoSheet);
      assert.equal(sheet['View > Next Slide'], want.nextSheet);

      // the context menu of the image and the tooltips of the toolbar
      await click(page, '.reveal section.present .figure-box > img', { button: 'right' });
      await frames(page);
      const context = await shownItems(page);
      await press(page, 'Escape');
      assert.ok(context.some((i) => i.id === 'arrange.order.front'), 'the context menu of an image does not have Bring to Front');
      for (const item of context) if (menus.get(item.id)) assert.equal(item.keys, menus.get(item.id).keys, `${item.label} in the context menu`);
      const tips = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-top [data-command][title]')].map((b) => ({ id: b.dataset.command, title: b.title }))`);
      let tipped = 0;
      for (const tip of tips) {
        const keys = menus.get(tip.id)?.keys;
        if (!keys) continue;
        assert.ok(tip.title.endsWith(`(${keys})`), `the tooltip "${tip.title}" does not end with (${keys})`);
        tipped++;
      }
      assert.ok(tipped >= 2, `only ${tipped} tooltips have keys`);
      assert.deepEqual(errors(page), []);
    });
  }

  // the modifiers of a drag of canvas/drag.ts and of a line end of commands/line.ts, in the group
  // Mouse of the sheet: the free modifier is ⌘ on a Mac and Alt elsewhere, and the copy modifier ⌥ on
  // a Mac and Ctrl elsewhere
  const MOUSE = {
    mac: { 'Lock Axis or Angle, Toggle Aspect': '⇧-drag', 'Move, Resize, or Rotate Without Snapping': '⌘-drag', 'Drag a Copy, Resize About the Center': '⌥-drag' },
    other: { 'Lock Axis or Angle, Toggle Aspect': 'Shift+drag', 'Move, Resize, or Rotate Without Snapping': 'Alt+drag', 'Drag a Copy, Resize About the Center': 'Ctrl+drag' },
  };

  for (const platform of PLATFORMS) {
    test(`${platform}: the sheet lists the modifiers of a drag in the group Mouse, and the listed copy modifier drops a copy`, async () => {
      const page = await editor(platform, MATH);
      const sheet = await sheetRows(page);
      const mouse = Object.fromEntries(Object.entries(sheet).filter(([k]) => k.startsWith('Mouse > ')).map(([k, v]) => [k.slice(8), v]));
      assert.deepEqual(mouse, MOUSE[platform]);
      assert.deepEqual(await page.evaluate('window.BeesonEditorShell.keyClashes()'), []);

      // the modifier of Drag a Copy, held at the release of a drag of the image of the figure box
      const listed = mouse['Drag a Copy, Resize About the Center'];
      const copy = { '⌥-drag': 'Alt', 'Ctrl+drag': 'Ctrl' }[listed];
      const img = '.reveal section.present .figure-box > img.for-dark';
      const count = async () => (await render(page)).split('<figure class="figure-box').length - 1;
      const before = await count();
      await selectFigure(page, img);
      await drag(page, img, { dx: -200, dy: 40, modifiers: copy });
      await new Promise((done) => setTimeout(done, 300));
      assert.equal(await count(), before + 1, `${listed} does not drop a copy of the figure`);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R6.8 on both platforms with trusted input: the menus of a locked figure, the
// line steps of a code box after a line is typed or deleted, the fit of the slide in a narrow window,
// the size of a group in the Arrange pane during a resize, the place of a new text box, the keys of
// the keyboard sheet, the figure selected from its image, the tiles of the New Slide gallery, and the
// position in the readouts and in the Arrange pane.
// after each edit the text is checked byte for byte, after an undo and a redo, and after a save and
// an open
describe('locked figure menus, code line steps, and readouts', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  // the slide of the deck of layouts with an ordered list and a figure with a caption
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

  // the editor on the slide n of a deck served over HTTP, with the Format tab shown
  async function load(t, platform, { deck = LAYOUTS, n = 0, size = { width: 1600, height: 1000 } } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    // an earlier test that keeps its page open 1 s after its last edit leaves a draft in the storage
    // of the origin, and the dialog of this draft then covers the slide of the next page of the deck
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

  // roundTrip checks the edits in the text, then the text before byte for byte after an undo, the
  // edit after a redo, and an open of the saved edit without problems
  let saves = 0;
  async function roundTrip(page, edits) {
    await byteExact(page, edits);
    const edited = await render(page);
    await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r6-8-${++saves}.html`);
    assert.equal(text, edited);
    page.source = text;
  }

  // menuItems returns the label of each item of the open menu, and whether the item is dimmed
  const menuItems = (page) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => ({ label: i.querySelector('.label')?.textContent ?? '', dimmed: i.getAttribute('aria-disabled') === 'true' }))`);

  for (const platform of PLATFORMS) {
    test(`the menus of a locked figure offer Unlock and dim Delete (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await click(page, IMG);
      await press(page, 'Mod+L');
      await frames(page);
      assert.ok(await page.evaluate(`!!document.querySelector('.reveal section.present [data-locked]')`), 'the lock key does not lock');
      await click(page, IMG, { button: 'right' });
      await frames(page);
      const items = await menuItems(page);
      const lock = items.find((i) => /^(Un)?[Ll]ock$/.test(i.label));
      assert.equal(lock?.label, 'Unlock', `the context menu of the locked figure reads ${js(items)}`);
      assert.equal(lock.dimmed, false);
      assert.equal(items.find((i) => i.label === 'Delete')?.dimmed, true, `Delete is enabled on the locked figure: ${js(items)}`);
      await press(page, 'Escape');
      await frames(page);
      assert.equal((await state(page, 'element.delete')).enabled, false, 'Delete of the Edit menu is enabled on the locked figure');
      assert.equal((await state(page, 'arrange.unlock')).enabled, true, 'Unlock of the Arrange menu is dimmed on the locked figure');
      assert.equal((await state(page, 'arrange.lock')).enabled, false, 'Lock of the Arrange menu is enabled on the locked figure');
      // Unlock of the context menu unlocks the image
      await click(page, IMG, { button: 'right' });
      await frames(page);
      await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === 'Unlock')?.click()`);
      await frames(page);
      assert.ok(await page.evaluate(`!document.querySelector('.reveal section.present [data-locked]')`), 'Unlock does not unlock the image');
      assert.deepEqual(errors(page), []);
    });

    test(`the context menu of a figure locked as a whole offers Unlock (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await click(page, IMG);
      await frames(page);
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((e) => e.tagName)`), ['FIGURE']);
      await press(page, 'Mod+L');
      await frames(page);
      const FIG = '<figure class="figure-box fragment" data-fragment-index="2">';
      await roundTrip(page, [[FIG, FIG.replace('>', ' data-locked>')]]);
      await click(page, IMG, { button: 'right' });
      await frames(page);
      const items = await menuItems(page);
      assert.equal(items.find((i) => /^(Un)?[Ll]ock$/.test(i.label))?.label, 'Unlock', js(items));
      assert.equal(items.find((i) => i.label === 'Delete')?.dimmed, true, js(items));
      assert.deepEqual(errors(page), []);
    });
  }

  const CODE = '<code class="language-python" data-line-numbers="1-3|4|5-7|8-9">def halo_family():';
  const SEED = '    x0, vy0 = SEED\n';

  // caretAt puts the caret at offset of the text of the code box of the current slide, focused
  const caretAt = (page, offset) =>
    page.evaluate(`(() => {
    const code = document.querySelector('.reveal section.present pre > code');
    code.closest('[contenteditable="true"]').focus();
    const walk = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let left = ${offset};
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (left <= n.data.length) { getSelection().setBaseAndExtent(n, left, n, left); return true; }
      left -= n.data.length;
    }
    return false;
  })()`);

  // a Return of a keyboard carries the text \r, which the browser types as a new line, as the press of
  // test/helpers/editor.mjs does not
  async function enter(page) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  }
  // an edit of the code box writes its text again, with the > of line 5 as &gt;
  const GT = ['if len(members) >= 2:', 'if len(members) &gt;= 2:'];

  for (const platform of PLATFORMS) {
    test(`a line typed or deleted in a code box shifts its line steps in one entry (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test-deck.html' });
      await page.evaluate(`Reveal.slide(Reveal.getIndices(document.querySelector('pre > code').closest('section')).h)`);
      await frames(page);
      const source = page.source;
      const text = await page.evaluate(`document.querySelector('.reveal section.present pre > code').textContent`);
      const end3 = text.indexOf(SEED) + SEED.length - 1;
      // Return at the end of line 3 starts line 4 with the indent of line 3, and the groups after it
      // are moved down by one line
      assert.ok(await caretAt(page, end3));
      await enter(page);
      await frames(page);
      const shifted = CODE.replace('1-3|4|5-7|8-9', '1-3|5|6-8|9-10');
      const typed = [[CODE, shifted], [SEED, `${SEED}    \n`], GT];
      await byteExact(page, typed);
      await type(page, 'pass');
      await frames(page);
      await byteExact(page, [[CODE, shifted], [SEED, `${SEED}    pass\n`], GT]);
      // the line steps go back with the undo of Return, in one entry with it
      await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page, typed);
      await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);
      await page.evaluate('window.BeesonEditor.redo()');
      await byteExact(page, typed);
      await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);
      // Backspace at the start of line 4 joins it to line 3, and the groups after it are moved up
      assert.ok(await caretAt(page, end3 + 1));
      await press(page, 'Backspace');
      await frames(page);
      const joined = [[CODE, CODE.replace('1-3|4|5-7|8-9', '1-3|3|4-6|7-8')], [SEED + '    for', '    x0, vy0 = SEED    for'], GT];
      await roundTrip(page, joined);
      assert.notEqual(page.source, source);
      assert.deepEqual(errors(page), []);
    });

    test(`Return in a code box indents the new line as the line before (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test-deck.html' });
      await page.evaluate(`Reveal.slide(Reveal.getIndices(document.querySelector('pre > code').closest('section')).h)`);
      await frames(page);
      const text = await page.evaluate(`document.querySelector('.reveal section.present pre > code').textContent`);
      // the line of the for is indented by 4, and the line after it by 8
      const FOR = '    for z0 in np.linspace(Z_START, Z_END, STEPS + 1) / DU:\n';
      assert.ok(await caretAt(page, text.indexOf(FOR) + FOR.length - 1));
      await enter(page);
      await type(page, 'pass');
      await frames(page);
      await byteExact(page, [[CODE, CODE.replace('1-3|4|5-7|8-9', '1-3|4|6-8|9-10')], [FOR, `${FOR}    pass\n`], GT]);
      // Return at the start of a line moves it down without an indent of the new line
      await page.evaluate('window.BeesonEditor.undo()');
      await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);
      assert.ok(await caretAt(page, text.indexOf(FOR)));
      await enter(page);
      await frames(page);
      await roundTrip(page, [[CODE, CODE.replace('1-3|4|5-7|8-9', '1-3|5|6-8|9-10')], [FOR, `\n${FOR}`], GT]);
      assert.deepEqual(errors(page), []);
    });
  }

  // fitOf returns the box of the canvas cell, the box of the slide, and the zoom of the status bar
  const fitOf = (page) =>
    page.evaluate(`(() => {
    const c = document.querySelector('.beeson-edit-canvas');
    const r = c.getBoundingClientRect();
    const s = document.querySelector('.reveal:not(.beeson-peek)').getBoundingClientRect();
    const zoom = [...document.querySelectorAll('.beeson-edit-bottom *')].find((e) => !e.children.length && /^\\d+%$/.test(e.textContent.trim()))?.textContent.trim();
    return { cell: { x: r.left + c.clientLeft, y: r.top + c.clientTop, w: c.clientWidth, h: c.clientHeight }, slide: { x: s.left, y: s.top, w: s.width, h: s.height }, scale: Reveal.getScale(), zoom };
  })()`);

  for (const platform of PLATFORMS) {
    for (const width of [760, 1000]) {
      test(`the slide fits a canvas of a window ${width} px wide at the largest zoom (${platform})`, async (t) => {
        const page = await load(t, platform, { n: MATH, size: { width, height: 700 } });
        await wait(page, 200);
        const f = await fitOf(page);
        // the slide is inside the cell, with a margin of at least 8 px on each side
        assert.ok(f.slide.x >= f.cell.x + 8 - 0.5 && f.slide.x + f.slide.w <= f.cell.x + f.cell.w - 8 + 0.5, js(f));
        assert.ok(f.slide.y >= f.cell.y + 8 - 0.5 && f.slide.y + f.slide.h <= f.cell.y + f.cell.h - 8 + 0.5, js(f));
        // in a canvas under 400 px, the zoom is the largest hundredth that leaves 8 px, and in a larger
        // one, a margin of at most 32 px
        const best = (m) => Math.floor(Math.min((f.cell.w - 2 * m) / 1920, (f.cell.h - 2 * m) / 1080) * 100 + 1e-6) / 100;
        if (f.cell.w < 400) assert.equal(f.scale, best(8), js(f));
        else assert.ok(f.scale >= best(32), js(f));
        assert.equal(f.zoom, `${Math.round(f.scale * 100)}%`);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // fieldsOf returns the values of the fields Width and Height of the Arrange pane
  const fieldsOf = (page) =>
    page.evaluate(`(() => { const v = (n) => document.querySelector('#beeson-edit-panel-format input[name="' + n + '"]')?.value ?? null; return { w: v('Width'), h: v('Height') }; })()`);
  // groupBoxOf returns the size of the box of the members of the group of the selection, in slide px:
  // a figure is boxed by its drawn picture and its caption, which hangs under its figure box, and another
  // element by its box
  const groupBoxOf = (page) =>
    page.evaluate(`(() => {
    const els = window.BeesonEditor.selection();
    const drawn = (el) => {
      const r = el.getBoundingClientRect();
      if (!(el instanceof HTMLImageElement) || getComputedStyle(el).objectFit !== 'contain') return r;
      const q = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight), w = el.naturalWidth * q, h = el.naturalHeight * q;
      return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, right: r.left + (r.width + w) / 2, bottom: r.top + (r.height + h) / 2 };
    };
    const rs = els.map((e) => {
      const r = drawn([...e.querySelectorAll('img')].find((i) => i.getBoundingClientRect().width) ?? e);
      const caps = e.matches('figure') ? [...e.querySelectorAll(':scope > figcaption, :scope > .caption')].map((c) => c.getBoundingClientRect()).filter((c) => c.width) : [];
      return { left: Math.min(r.left, ...caps.map((c) => c.left)), top: Math.min(r.top, ...caps.map((c) => c.top)), right: Math.max(r.right, ...caps.map((c) => c.right)), bottom: Math.max(r.bottom, ...caps.map((c) => c.bottom)) };
    });
    const s = Reveal.getScale();
    return { w: (Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left))) / s, h: (Math.max(...rs.map((r) => r.bottom)) - Math.min(...rs.map((r) => r.top))) / s };
  })()`);

  for (const platform of PLATFORMS) {
    test(`the Arrange pane shows the size of a group, also during its resize (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      // the figure is selected with a click on its image, and the paragraph added with Shift
      await click(page, IMG);
      await click(page, '.reveal section.present > p', { modifiers: 'Shift' });
      await frames(page);
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((e) => e.tagName).sort()`), ['FIGURE', 'P']);
      await exec(page, 'arrange.group');
      await frames(page);
      await page.evaluate(`[...document.querySelectorAll('#beeson-edit-panel-format button')].find((b) => b.textContent.trim() === 'Arrange')?.click()`);
      await frames(page);
      const near = (field, value) => Math.abs(Number(field) - value) <= 1.5;
      const box = await groupBoxOf(page);
      let f = await fieldsOf(page);
      assert.ok(near(f.w, box.w) && near(f.h, box.h), `the fields read ${js(f)} for a group of ${js(box)}`);
      // the corner grip of the group is held after a move of 120 by 90 px
      const se = await page.evaluate(`(() => { const g = document.querySelector('.beeson-grip[data-group="1"][data-handle="se"]'); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const { drag } = await import('./helpers/editor.mjs');
      await drag(page, se, { dx: -120, dy: -90, steps: 12, hold: true });
      await frames(page);
      const held = await groupBoxOf(page);
      f = await fieldsOf(page);
      const readout = await page.evaluate(`document.querySelector('.beeson-offset:not([hidden])')?.textContent ?? ''`);
      assert.ok(held.w < box.w - 50, js({ box, held }));
      assert.ok(near(f.w, held.w) && near(f.h, held.h), `during the resize the fields read ${js(f)} for a group of ${js(held)}, and the readout ${readout}`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: se.x - 120, y: se.y - 90, button: 'left', clickCount: 1 });
      await frames(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // boxesOf returns the box in slide px of the text of the last item of the list of the current
  // slide, and the boxes of the new text box and of the element after the list
  const boxesOf = (page) =>
    page.evaluate(`(() => {
    const s = Reveal.getScale();
    const top = document.querySelector('.reveal .slides').getBoundingClientRect();
    const box = (r) => ({ top: (r.top - top.top) / s, bottom: (r.bottom - top.top) / s, left: (r.left - top.left) / s, right: (r.right - top.left) / s });
    const ul = document.querySelector('.reveal section.present > ul');
    const r = document.createRange();
    r.selectNodeContents([...ul.children].at(-1));
    const next = ul.nextElementSibling;
    return { ink: box(r.getBoundingClientRect()), next: box(next.getBoundingClientRect()), tag: next.localName };
  })()`);

  for (const platform of PLATFORMS) {
    test(`a new text box is put under a list moved down, without an overlap (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test-deck.html', n: 4 });
      assert.match(await page.evaluate(`document.querySelector('.reveal section.present > ul').getAttribute('style') ?? ''`), /translate/);
      await exec(page, 'insert.text');
      await frames(page);
      let b = await boxesOf(page);
      assert.ok(b.next.top >= b.ink.bottom + 8, `the empty box at ${js(b.next)} overlaps the last line of the list at ${js(b.ink)}`);
      const empty = b.next;
      await type(page, 'Typed');
      await wait(page, 300);
      b = await boxesOf(page);
      assert.equal(b.tag, 'p');
      assert.ok(b.next.top >= b.ink.bottom + 8, `the written box at ${js(b.next)} overlaps the last line of the list at ${js(b.ink)}`);
      assert.ok(Math.abs(b.next.top - empty.top) < 1, `the box is moved from ${empty.top} to ${b.next.top} when it is written`);
      // the box is moved with the list, by the 20 px of its translate, and it is written where its
      // empty box was drawn, 10 px under its place in the flow after a list item
      const tag = (await render(page)).match(/<p[^>]*>Typed<\/p>/)?.[0];
      assert.equal(tag, '<p style="translate: 0px 30px">Typed</p>');
      assert.deepEqual(errors(page), []);
    });

    test(`a new text box under a list in its place is written without an offset (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await exec(page, 'insert.text');
      await frames(page);
      await type(page, 'Typed');
      await wait(page, 300);
      assert.match(await render(page), /\n {2}<p>Typed<\/p>\n/);
      assert.deepEqual(errors(page), []);
    });
  }

  // item 6: in the trial, Insert listed ⌥⌘E at Formula and at Inline Formula, and View > Zoom listed
  // ⌘= at Zoom In and at Bigger Notes Text. one key is listed at one item of a menu, enabled or not
  for (const platform of PLATFORMS) {
    test(`no key is listed at two items of one menu or one context menu (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      assert.deepEqual(await page.evaluate('window.BeesonEditorShell.keyClashes(true)'), []);
      assert.deepEqual(await page.evaluate('window.BeesonEditorShell.keyClashes()'), []);
      assert.deepEqual(errors(page), []);
    });
  }

  // R6.6's test of the tiles of the layout chooser failed once under load, with the Split tile drawn
  // unlike on the slide before. each tile is a shadow root, into which the links of the deck were
  // cloned, and a tile was thus shown before their sheets were loaded. a tile is drawn in the type of
  // the theme on the frame of the command that opens its gallery
  for (const platform of PLATFORMS) {
    test(`the tiles of the layout chooser and of New Slide are styled when they are shown (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      for (const [id, dialog] of [['slide.layoutChooser', '.beeson-edit-layouts'], ['slide.gallery', '.beeson-edit-gallery:not(.beeson-edit-layouts)']]) {
        const fonts = await page.evaluate(`(() => {
        window.BeesonEditor.exec(${JSON.stringify(id)});
        return [...document.querySelectorAll('${dialog} .tile .pic')].map((p) => getComputedStyle(p.shadowRoot.querySelector('section h2, section h1')).fontFamily);
      })()`);
        // New Slide has a tile of Title Only after the eight layouts of the chooser
        assert.equal(fonts.length, id === 'slide.gallery' ? 9 : 8, `the gallery of ${id} is not open`);
        assert.deepEqual(fonts.filter((f) => !/Latin Modern/.test(f)), [], `tiles of ${id} are drawn before the sheets of the theme`);
        await press(page, 'Escape');
        await frames(page);
      }
      assert.deepEqual(errors(page), []);
    });
  }

  // item 8: the New Slide gallery drew samples of its own, and the layout chooser drew sampleText of
  // model/templates.ts. the tile of a layout is the same in both, on a slide with a backdrop too
  const tileSlides = (page, id, dialog) => page.evaluate(`(async () => {
  window.BeesonEditor.exec(${JSON.stringify(id)});
  await new Promise((r) => requestAnimationFrame(r));
  return [...document.querySelectorAll('${dialog} .tile')].map((t) => ({ layout: t.dataset.layout ?? null, name: t.textContent.trim(), slide: t.querySelector('.pic').shadowRoot.querySelector('.slides > section').outerHTML }));
})()`);

  for (const platform of PLATFORMS) {
    test(`the tile of a layout is the same in New Slide and in the layout chooser (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 0 });
      const chooser = await tileSlides(page, 'slide.layoutChooser', '.beeson-edit-layouts');
      await press(page, 'Escape');
      await frames(page);
      const gallery = await tileSlides(page, 'slide.gallery', '.beeson-edit-gallery:not(.beeson-edit-layouts)');
      await press(page, 'Escape');
      assert.equal(chooser.length, 8);
      // New Slide has a tile of Title Only after the eight layouts of the chooser
      assert.deepEqual(gallery.map((g) => g.name), [...chooser.map((c) => c.name), 'Title Only']);
      for (const [i, c] of chooser.entries()) assert.equal(gallery[i].slide, c.slide, `the tile of ${c.layout} differs`);
      assert.deepEqual(errors(page), []);
    });
  }

  // item 7: in the trial (state 177), Esc and Edit > Select Figure selected figure.figure-box, but its frame
  // stayed on the image, above the caption of the figure. the frame of the figure holds its caption
  const FIGURE_IMG = '.reveal section.present .figure-box > img:not([hidden])';
  const frameAndCaption = (page) => page.evaluate(`(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const frames = [...document.querySelectorAll('.beeson-frame.selected')].filter((f) => !f.hidden && f.getClientRects().length);
  return { selected: window.BeesonEditor.selection().map((e) => e.tagName), frames: frames.map(box), caption: box(document.querySelector('.reveal section.present figure.figure-box figcaption')), image: box(document.querySelector('${FIGURE_IMG}')) };
})()`);

  for (const platform of PLATFORMS) {
    test(`the frame of a figure selected from its image holds its caption (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: 'test-deck.html', n: 4 });
      // a second click on the image frames its picture alone
      await selectPicture(page, FIGURE_IMG);
      await frames(page);
      const [pic] = (await frameAndCaption(page)).frames;
      await press(page, 'Escape');
      await frames(page);
      await press(page, 'Escape');
      await frames(page);
      for (const how of ['Esc', 'Select Figure']) {
        await selectPicture(page, FIGURE_IMG);
        await frames(page);
        if (how === 'Esc') await press(page, 'Escape');
        else await exec(page, 'selection.container');
        await frames(page);
        const s = await frameAndCaption(page);
        assert.deepEqual(s.selected, ['FIGURE'], `${how} does not select the figure`);
        assert.equal(s.frames.length, 1);
        const [f] = s.frames;
        assert.ok(pic.bottom < s.caption.top, `the frame of the image at ${js(pic)} reaches the caption`);
        // the frame of a figure with a caption stands 8 px outside it
        assert.ok(Math.abs(f.top + 8 - pic.top) <= 1 && f.bottom >= s.caption.bottom - 1 && f.left <= Math.min(pic.left, s.caption.left) + 1 && f.right >= Math.max(pic.right, s.caption.right) - 1, `after ${how} the frame at ${js(f)} leaves out the caption at ${js(s.caption)}`);
        await press(page, 'Escape');
        await frames(page);
      }
      assert.deepEqual(errors(page), []);
    });
  }

  // item 10: the readout of a move gives the upper left corner of the element in slide px, and the
  // fields X and Y of the Arrange pane, the readout of a nudge, and the readout of a line drag gave the
  // translate. all four give the position on the slide, and a value typed into X or Y moves the
  // element to that position
  const positionOf = (page) => page.evaluate(`(() => { const v = (n) => document.querySelector('#beeson-edit-panel-format input[name="' + n + '"]')?.value ?? null; return { x: v('X'), y: v('Y') }; })()`);
  const readoutOf = (page) => page.evaluate(`(() => { const o = document.querySelector('.beeson-offset:not(.beeson-guide-readout)'); return o && !o.hidden ? o.textContent : null; })()`);
  // cornerOf returns the upper left corner of the box of the selected element in slide px
  const cornerOf = (page) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  // the frame of the selected element, drawn 8 px outside the picture with its caption of a figure
  const f = document.querySelector('.beeson-overlay > .beeson-frame.selected:not([hidden])').getBoundingClientRect();
  return { x: Math.round((f.left + 8 - r.left) / k), y: Math.round((f.top + 8 - r.top) / k) };
})()`);
  const xy = (text) => {
    const m = /^x: (-?\d+) px\s+y: (-?\d+) px$/.exec(text ?? '');
    assert.ok(m, `the readout ${text} does not give x and y`);
    return { x: m[1], y: m[2] };
  };
  const arrangeTab = (page) => page.evaluate(`[...document.querySelectorAll('#beeson-edit-panel-format button')].find((b) => b.textContent.trim() === 'Arrange')?.click()`);

  for (const platform of PLATFORMS) {
    test(`a figure moved by a drag or a nudge shows the same x and y in its readout and in the fields, and a typed X moves it there (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await click(page, IMG);
      await frames(page);
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((e) => e.tagName)`), ['FIGURE']);
      await arrangeTab(page);
      await frames(page);
      const start = await cornerOf(page);
      assert.deepEqual(await positionOf(page), { x: String(start.x), y: String(start.y) }, 'the fields do not give the position of the figure in place');
      const img = await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(IMG)})].map((e) => e.getBoundingClientRect()).find((b) => b.width); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const { drag } = await import('./helpers/editor.mjs');
      await drag(page, img, { dx: -70, dy: 45, hold: true });
      await frames(page);
      const held = xy(await readoutOf(page));
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: img.x - 70, y: img.y + 45, button: 'left', clickCount: 1 });
      await frames(page);
      assert.deepEqual(await positionOf(page), held, 'the fields do not give the x and y of the readout of the move');
      // a nudge to the right
      await press(page, 'ArrowRight');
      await frames(page);
      const nudged = { x: String(Number(held.x) + 1), y: held.y };
      assert.deepEqual(xy(await readoutOf(page)), nudged, 'the readout of a nudge does not give the position');
      assert.deepEqual(await positionOf(page), nudged);
      // a value typed into X
      const moved = await render(page);
      await click(page, '#beeson-edit-panel-format input[name="X"]');
      await page.evaluate(`document.querySelector('#beeson-edit-panel-format input[name="X"]').select()`);
      await type(page, '400');
      await press(page, 'Enter');
      await frames(page);
      assert.equal((await cornerOf(page)).x, 400, 'a typed X does not move the figure to x 400');
      assert.deepEqual(await positionOf(page), { x: '400', y: held.y });
      const typed = await render(page);
      await page.evaluate('window.BeesonEditor.undo()');
      assert.equal(await render(page), moved);
      await page.evaluate('window.BeesonEditor.redo()');
      assert.equal(await render(page), typed);
      const { text } = await saveAndReopen(page, `r6-8-${++saves}.html`);
      assert.equal(text, typed);
      await frames(page);
      assert.deepEqual(errors(page), []);
    });

    test(`a line moved by a drag shows the same x and y in its readout and in the fields (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await exec(page, 'insert.line', { from: { x: 300, y: 900 }, to: { x: 800, y: 900 } });
      await exec(page, 'selection.clear');
      await frames(page);
      const m = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth; return { x: r.left + 550 * k, y: r.top + 903 * k }; })()`);
      await click(page, m);
      await frames(page);
      await arrangeTab(page);
      await frames(page);
      const { drag } = await import('./helpers/editor.mjs');
      await drag(page, m, { dx: 60, dy: -40, hold: true });
      await frames(page);
      const held = xy(await readoutOf(page));
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x + 60, y: m.y - 40, button: 'left', clickCount: 1 });
      await frames(page);
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`), ['svg']);
      assert.deepEqual(await positionOf(page), held, 'the fields do not give the x and y of the readout of the line drag');
      assert.deepEqual(errors(page), []);
    });
  }
});
