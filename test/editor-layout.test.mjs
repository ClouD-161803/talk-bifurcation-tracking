// the layout and the arrangement of the elements of a slide on both platforms, driven with trusted
// input: a content slide changed to split from the chooser of the Slide pane writes div.text-column
// around its words and keeps its figure box, Bring to Front and Send to Back of a QR code in the flow
// write a z-index, a grouped pair is selected, moved, and deleted together, a lock keeps
// an element from a drag, a rotation with Shift snaps to 15 degrees, and Reset Slide takes it
// off. each edit is checked byte for byte, after an undo and a redo, against the scope rule, and
// after a save and an open of the saved text. the tests do not use the system clipboard

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { resolve } from 'node:path';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { arrange, kindOf, relayout, shift } from '../src/editor/commands/layout.ts';
import { byteExact, center, click, clickText, drag, press, saveAndReopen } from './helpers/editor.mjs';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
const PANEL = '#beeson-edit-panel-format';
const KEYS = {
  mac: { front: 'Mod+Shift+F', back: 'Mod+Shift+B', group: 'Mod+Alt+G', ungroup: 'Mod+Alt+Shift+G', lock: 'Mod+L', unlock: 'Mod+Alt+L' },
  other: { front: 'Mod+Shift+ArrowUp', back: 'Mod+Shift+ArrowDown', group: 'Mod+G', ungroup: 'Mod+Shift+G', lock: 'Mod+L', unlock: 'Mod+Shift+L' },
};

const SECTIONS = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].map((m) => m[0]);
const MATH = SECTIONS.findIndex((s) => s.includes('<h2>Math, an ordered list, and a zone</h2>'));
const TITLE = 0;
const QR = '<div class="qr" data-qr="https://github.com/beeson-group/slides"></div>';
const BACKDROP = '<div class="backdrop" data-backdrop="tubes" data-cx="0.42" data-cy="0" data-half="0.6">';
const BLOCK_END = '    <p class="who">The Beeson group<br>Princeton University</p>\n  </div>\n';

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

// the editor on slide n of the deck of layouts, served over HTTP so that a save is written into the
// origin private file system
async function layoutPage(platform, n) {
  await last?.close().catch(() => {});
  const page = await browser.newPage();
  last = page;
  await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
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
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
// the shown elements of the selection: each framed by itself, or the members of a group in its
// one frame
const shownFrames = (page) => page.evaluate(`(() => {
  const frames = [...document.querySelectorAll('.beeson-frame.selected')].filter((f) => !f.hidden && f.getBoundingClientRect().width).length;
  const group = [...document.querySelectorAll('.beeson-frame.union.group')].some((f) => !f.hidden);
  return group ? window.BeesonEditor.selection().filter((e) => e.getBoundingClientRect().width).length : frames;
})()`);

// the element drawn on top, 'qr' or another one, where the QR code of the current slide meets the
// first line of the words of the who and sub paragraphs of its block, and the backdrop. the QR
// code is moved over each paragraph for the moment of the hit test, by a translate in its style,
// which does not change its order
const drawnOver = (page) => page.evaluate(`(() => {
  const s = Reveal.getCurrentSlide(), q = s.querySelector(':scope > .qr'), style = q.getAttribute('style');
  const k = s.getBoundingClientRect().width / s.offsetWidth;
  const top = (x, y, other) => {
    const hit = document.elementsFromPoint(x, y).find((e) => q.contains(e) || other.contains(e));
    return hit ? (q.contains(hit) ? 'qr' : 'text') : null;
  };
  const over = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const line = range.getClientRects()[0], b = q.getBoundingClientRect();
    q.style.translate = (line.left - b.left) / k + 'px ' + (line.top - b.top) / k + 'px';
    const hit = top(line.left + 12, line.top + line.height / 2, el);
    if (style === null) q.removeAttribute('style');
    else q.setAttribute('style', style);
    return hit;
  };
  const r = q.getBoundingClientRect();
  const backdrop = top(r.left + r.width / 2, r.top + r.height / 2, s.querySelector(':scope > .backdrop'));
  return { who: over(s.querySelector('.title-text > .who')), sub: over(s.querySelector('.title-text > .sub')), backdrop: backdrop === 'text' ? 'backdrop' : backdrop };
})()`);

// the problems of the scope rule in the rendered text that the file did not have before
async function inScope(page) {
  const now = textProblems(await render(page), THEME);
  for (const p of textProblems(page.source, THEME)) {
    const i = now.indexOf(p);
    if (i >= 0) now.splice(i, 1);
  }
  assert.deepEqual(now, []);
}

// before is the edits that the undo keeps, of an earlier entry of the history
async function roundTrip(page, edits, before = []) {
  await byteExact(page, edits);
  await inScope(page);
  await undo(page);
  await byteExact(page, before);
  await redo(page);
  await byteExact(page, edits);
}

let saves = 0;
async function saved(page, edits) {
  const { text } = await saveAndReopen(page, `layout-${++saves}.html`);
  page.source = text;
  await byteExact(page);
  assert.ok(edits.every(([, after]) => text.includes(after)));
}

// the math slide of the deck of layouts written as a split slide: its words in the text column, one step
// deeper, and its figure box after the text column
function asSplit(section) {
  const lines = section.split('\n');
  const figureBox = lines.findIndex((l) => l.startsWith('  <figure class="figure-box'));
  const words = lines.slice(1, figureBox).map((l) => `  ${l}`);
  return ['<section class="split">', '  <div class="text-column">', ...words, '  </div>', ...lines.slice(figureBox)].join('\n');
}

test('relayout writes each layout from the parts of a slide, and gives back a slide already in its layout', () => {
  for (const s of SECTIONS) {
    const layout = /<section class="(title|section|closing|figure|split|narrow|wide)\b/.exec(s)?.[1] ?? 'content';
    assert.equal(relayout(s, layout, '  '), s);
  }
  const math = SECTIONS[MATH];
  const split = relayout(math, 'split', '  ');
  assert.equal(split, asSplit(math));
  assert.equal(relayout(split, 'content', '  '), math);
  // the block of a title slide takes the heading, made an h1, and the words, and a figure stays out
  const title = relayout(math, 'title', '  ');
  assert.ok(title.startsWith('<section class="title">\n  <div class="title-text">\n    <h1>Math, an ordered list, and a zone</h1>\n'));
  assert.ok(title.includes('\n  </div>\n  <figure class="figure-box fragment"'));
  assert.equal(relayout(title, 'content', '  '), math);
  // a slide without a heading gets an empty one in a wrapper, a slide without words gets the empty
  // paragraph of a new split slide, and a class of another kind is kept
  assert.equal(relayout('<section class="x">\n  <div class="figure-box"></div>\n</section>', 'split', '\t'), '<section class="split x">\n\t<div class="text-column">\n\t\t<h2></h2>\n\t\t<p></p>\n\t</div>\n\t<div class="figure-box"></div>\n</section>');
  // the lines of a pre keep their white space
  assert.equal(shift('<pre>\n  a\n</pre>\n  <p>', '  ', '    '), '<pre>\n  a\n</pre>\n    <p>');
  assert.deepEqual(arrange([kindOf('h2', []), kindOf('p', []), kindOf('div', ['figure-box']), kindOf('div', ['foot'])], 'split'), [{ wrap: 'text-column', parts: [0, 1, 3] }, 2]);
});

for (const platform of PLATFORMS) {
  test(`a content slide changed to split from the chooser writes div.text-column around its words and keeps its zone on ${platform}`, async () => {
    const page = await layoutPage(platform, MATH);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    await click(page, `${PANEL} .ed-chooser`);
    await page.waitFor(`!!document.querySelector('.beeson-edit-layouts')`);
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-layouts .tile[aria-selected="true"]').dataset.layout`), 'content');
    assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-edit-layouts .tile .pic').length`), 8);
    await click(page, '.beeson-edit-layouts .tile[data-layout="split"]');
    await frames(page);
    assert.equal(await page.evaluate(`!!document.querySelector('.beeson-edit-layouts')`), false);
    const edit = [SECTIONS[MATH], asSplit(SECTIONS[MATH])];
    const lit = `[...Reveal.getCurrentSlide().querySelectorAll('.coriolis')].map((e) => e.classList.contains('hl-accent'))`;
    assert.deepEqual(await page.evaluate(lit), [true, true], 'the Coriolis term is not colored on the new slide');
    await roundTrip(page, [edit]);
    assert.deepEqual(await page.evaluate(lit), [true, true], 'the Coriolis term is not colored after a redo');
    assert.deepEqual(await page.evaluate(`(() => { const s = Reveal.getCurrentSlide(); return [s.className.includes('split'), !!s.querySelector(':scope > .text-column > h2'), !!s.querySelector(':scope > figure.figure-box')]; })()`), [true, true, true]);
    assert.equal((await state(page, 'slide.layout.split')).checked, true);
    await saved(page, [edit]);
    // the Slide menu changes it back, and Reset Slide is then disabled
    await exec(page, 'slide.layout.content');
    assert.equal(await render(page), readFileSync(LAYOUTS, 'utf8'));
    assert.equal((await state(page, 'slide.reset')).enabled, false);
    assert.deepEqual(errors(page), []);
  });

  // a QR code of a title slide is in the flow, hence a layer command orders it by a z-index
  test(`Send to Back and Bring to Front of a QR code in the flow write a z-index on ${platform}`, async () => {
    const page = await layoutPage(platform, TITLE);
    await click(page, '.reveal section.present > .qr');
    assert.equal((await state(page, 'arrange.order.front')).enabled, false, 'the QR code is already in front');
    assert.deepEqual(await drawnOver(page), { who: 'qr', sub: 'qr', backdrop: 'qr' });
    await press(page, KEYS[platform].back);
    await frames(page);
    // the backdrop is the ground of its layout, hence it is put under the QR code, behind the block
    const edits = [[`${QR}\n`, `${QR.replace('>', ' style="z-index: -1">')}\n`], [BACKDROP, BACKDROP.replace('>', ' style="z-index: -1">')]];
    await byteExact(page, edits);
    assert.deepEqual(await drawnOver(page), { who: 'text', sub: 'text', backdrop: 'qr' }, 'the QR code sent to the back is not drawn behind the block and over the backdrop');
    assert.equal((await state(page, 'arrange.order.back')).enabled, false, 'the QR code is already at the back');
    assert.equal((await state(page, 'arrange.order.backward')).enabled, false, 'the QR code is sent behind the backdrop');
    await inScope(page);
    await undo(page);
    await byteExact(page);
    await redo(page);
    await byteExact(page, edits);
    // Bring to Front takes the declarations off again, and is one entry
    await press(page, KEYS[platform].front);
    await frames(page);
    await byteExact(page);
    assert.deepEqual(await drawnOver(page), { who: 'qr', sub: 'qr', backdrop: 'qr' });
    await undo(page);
    await byteExact(page, edits);
    await redo(page);
    await byteExact(page);
    // Send Backward passes one row of the object list, the last text of the block, which is raised
    // over the QR code in the stacking context of the slide
    const backward = [[BLOCK_END, BLOCK_END.replace('<p class="who">', '<p class="who" style="position: relative; z-index: 1">')]];
    await exec(page, 'arrange.order.backward');
    await byteExact(page, backward);
    assert.deepEqual(await drawnOver(page), { who: 'text', sub: 'qr', backdrop: 'qr' }, 'the QR code sent backward is not drawn between the last two texts of the block');
    await saved(page, backward);
    assert.deepEqual(errors(page), []);
  });

  test(`a grouped pair is selected, moved, and deleted together, and a locked element is not dragged on ${platform}`, async () => {
    const page = await layoutPage(platform, TITLE);
    await click(page, '.reveal section.present h1', { modifiers: 'Shift' });
    await click(page, '.reveal section.present > .qr', { modifiers: 'Shift' });
    assert.equal(await shownFrames(page), 2);
    await press(page, KEYS[platform].group);
    await frames(page);
    const grouped = [['<h1>Every layout</h1>', '<h1 data-group="g1">Every layout</h1>'], [QR, '<div class="qr" data-qr="https://github.com/beeson-group/slides" data-group="g1"></div>']];
    await roundTrip(page, grouped);
    // a click on one member selects both
    await exec(page, 'selection.clear');
    await click(page, '.reveal section.present > .qr');
    assert.equal(await shownFrames(page), 2, 'a click on a member does not select its group');
    const scale = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); return s.getBoundingClientRect().width / s.offsetWidth; })()`);
    await drag(page, '.reveal section.present > .qr', { dx: -100 * scale, dy: -50 * scale, modifiers: platform === 'mac' ? 'Meta' : 'Alt' });
    await frames(page);
    const moved = [
      ['<h1>Every layout</h1>', '<h1 style="translate: -100px -50px" data-group="g1">Every layout</h1>'],
      [QR, '<div class="qr" data-qr="https://github.com/beeson-group/slides" style="translate: -100px -50px" data-group="g1"></div>'],
    ];
    await roundTrip(page, moved, grouped);
    await press(page, 'Delete');
    await frames(page);
    await byteExact(page, [['    <h1>Every layout</h1>\n', ''], [`  ${QR}\n`, '']]);
    await undo(page);
    await byteExact(page, moved);
    await saved(page, moved);
    // Ungroup takes data-group off both, and a lock keeps the QR code from a drag
    await click(page, '.reveal section.present > .qr');
    await press(page, KEYS[platform].ungroup);
    await exec(page, 'selection.clear');
    await click(page, '.reveal section.present > .qr');
    assert.equal(await shownFrames(page), 1);
    await press(page, KEYS[platform].lock);
    const qr = '<div class="qr" data-qr="https://github.com/beeson-group/slides" style="translate: -100px -50px" data-locked></div>';
    const locked = [['<h1 style="translate: -100px -50px" data-group="g1">', '<h1 style="translate: -100px -50px">'], ['<div class="qr" data-qr="https://github.com/beeson-group/slides" style="translate: -100px -50px" data-group="g1"></div>', qr]];
    await byteExact(page, locked);
    assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-grip:not([hidden])').length`), 0, 'a locked element shows grips');
    assert.equal(await page.evaluate(`document.querySelector('.beeson-lock:not([hidden])')?.getAttribute('aria-label')`), 'Unlock', 'the padlock of a locked element is not closed');
    await drag(page, '.reveal section.present > .qr', { dx: 80, dy: 40 });
    await press(page, 'ArrowLeft');
    await byteExact(page, locked);
    await press(page, KEYS[platform].unlock);
    await byteExact(page, [locked[0], [locked[1][0], locked[1][0].replace(' data-group="g1"', '')]]);
    assert.deepEqual(errors(page), []);
  });

  test(`a rotation by the rotate handle with Shift snaps to 15 degrees, and the angle is shown on ${platform}`, async () => {
    const page = await layoutPage(platform, TITLE);
    await click(page, '.reveal section.present > .qr');
    const c = await center(page, '.reveal section.present > .qr');
    const knob = await center(page, '.beeson-rotor');
    assert.ok(Math.abs(knob.x - c.x) < 1 && knob.y < c.y, 'the rotate handle is not above the middle of the QR code');
    // the pointer is turned by 37 degrees about the center, which Shift snaps to 30
    const r = c.y - knob.y;
    const a = (37 * Math.PI) / 180;
    await drag(page, knob, { dx: r * Math.sin(a), dy: r - r * Math.cos(a), modifiers: 'Shift', hold: true });
    assert.equal(await page.evaluate(`document.querySelector('.beeson-offset').textContent`), '30°');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: knob.x + r * Math.sin(a), y: knob.y + r - r * Math.cos(a), button: 'left', clickCount: 1, modifiers: 8 });
    await frames(page);
    const turned = [[QR, '<div class="qr" data-qr="https://github.com/beeson-group/slides" style="rotate: 30deg"></div>']];
    await roundTrip(page, turned);
    // without Shift, the angle is kept to the degree, and the field of the Arrange pane sets it
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await exec(page, 'arrange.setRotation', { deg: 37 });
    await byteExact(page, [[QR, '<div class="qr" data-qr="https://github.com/beeson-group/slides" style="rotate: 37deg"></div>']]);
    await undo(page);
    await byteExact(page, turned);
    await saved(page, turned);
    assert.deepEqual(errors(page), []);
  });

  test(`Reset Slide takes the rotation off a QR code and gives back its layout on ${platform}`, async () => {
    const page = await layoutPage(platform, TITLE);
    assert.equal((await state(page, 'slide.reset')).enabled, false, 'a slide in its layout can be reset');
    await click(page, '.reveal section.present > .qr');
    await exec(page, 'arrange.setRotation', { deg: 37 });
    const turned = [[QR, '<div class="qr" data-qr="https://github.com/beeson-group/slides" style="rotate: 37deg"></div>']];
    await byteExact(page, turned);
    assert.equal((await state(page, 'slide.reset')).enabled, true);
    await exec(page, 'slide.reset');
    await frames(page);
    await byteExact(page);
    await undo(page);
    await byteExact(page, turned);
    await redo(page);
    await byteExact(page);
    assert.deepEqual(errors(page), []);
  });
}

// the tiles of the layout chooser and of the New Slide gallery, and the sketch of the well Slide
// Layout of the inspector, of R15.14, on both platforms. a tile draws the texts that a new slide of
// its layout gets, and a gray box at the place where the layout puts a figure or a backdrop: the
// figure box of Content and the backdrop of Content, Narrow. Content, Wide is without a box, in its tile
// and in the well, since its text column runs over the place of the figure box
describe('the tiles of the layout chooser', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  // the content, narrow, and wide slides of editor-layouts.html
  const SLIDES = { content: 3, narrow: 4, wide: 5 };
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
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  async function load(t, platform, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(LAYOUTS, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the gray boxes of each tile of the gallery of selector, by the layout of the tile: the class and
  // the left, top, width, and height in slide px of each figure box, plate, and backdrop of its sample
  const tiles = (page, selector) => page.evaluate(`(() => {
  const out = {};
  for (const tile of document.querySelectorAll(${js(selector)} + ' .tile')) {
    const root = tile.querySelector('.pic').shadowRoot;
    const slide = root.querySelector('section');
    const s = slide.getBoundingClientRect();
    const k = s.width / slide.offsetWidth;
    out[tile.dataset.layout] = [...slide.querySelectorAll('.figure-box, .plate, .backdrop')].map((e) => {
      const r = e.getBoundingClientRect();
      return [e.className, ...[(r.left - s.left) / k, (r.top - s.top) / k, r.width / k, r.height / k].map(Math.round)];
    });
  }
  return out;
})()`);

  for (const platform of PLATFORMS) {
    for (const [name, command, selector] of [
      ['layout chooser', 'slide.layoutChooser', '.beeson-edit-layouts'],
      ['New Slide gallery', 'slide.gallery', '.beeson-edit-gallery:not(.beeson-edit-layouts)'],
    ]) {
      test(`the tiles Content and Content, Narrow of the ${name} draw the place of their figure, and Content, Wide is without one (${platform})`, async (t) => {
        const page = await load(t, platform, SLIDES.content);
        await exec(page, command);
        await frames(page);
        const drawn = await tiles(page, selector);
        // the figure box of a content slide and the backdrop of a narrow slide, as theme/beeson.css places them
        assert.deepEqual(drawn.content, [['figure-box', 1200, 120, 600, 800]]);
        assert.deepEqual(drawn.narrow, [['backdrop', 920, 0, 1000, 1080]]);
        assert.deepEqual(drawn.wide, []);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`a new Content slide is written without a zone (${platform})`, async (t) => {
      const page = await load(t, platform, SLIDES.content);
      const before = await render(page);
      await exec(page, 'slide.new.content');
      await frames(page);
      const made = await render(page);
      assert.equal((made.match(/class="figure-box"/g) ?? []).length, (before.match(/class="figure-box"/g) ?? []).length);
      assert.deepEqual(errors(page), []);
    });

    test(`the well Slide Layout draws the block of the figure for Content and Content, Narrow, and not for Content, Wide (${platform})`, async (t) => {
      const page = await load(t, platform, SLIDES.content);
      // the blocks of the sketch that are at least as high as the figure of a content slide, i.e. the
      // figure box of Content and the backdrop of Content, Narrow, whose square left corners are drawn
      // by a second rect with rx 0
      const blocks = () => page.evaluate(`(() => {
      const svg = document.querySelector('.beeson-edit-inspector .ed-chooser .thumb svg');
      return svg ? [...svg.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') === 'var(--ed-faint)' && Number(r.getAttribute('height')) >= 24 && r.getAttribute('rx') !== '0').length : null;
    })()`);
      const name = () => page.evaluate(`document.querySelector('.beeson-edit-inspector .ed-chooser .what span:last-child')?.textContent ?? null`);
      for (const [layout, label, n] of [['content', 'Content', 1], ['narrow', 'Content, Narrow', 1], ['wide', 'Content, Wide', 0]]) {
        await page.evaluate(`Reveal.slide(${SLIDES[layout]})`);
        await frames(page);
        assert.equal(await name(), label);
        assert.equal(await blocks(), n, `the block of the figure in the well for ${label}`);
      }
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R41.1 on both platforms: a QR code on the merged theme, which places the code
// of a closing slide 200 px wide at the lower right and every other code in the flow at 320 px. a
// change of layout between Closing and another layout keeps the drawn place and size of a code that
// the editor placed, in one entry of the history, and a code without a place takes the place of the
// new layout. each edit of the file is checked byte for byte after an undo and a redo
describe('a QR code kept across Closing', () => {
  const DECK = 'test-deck.html';
  const PLATFORMS = ['mac', 'other'];
  // the indexes of the title slide and of the closing slide in index.html
  const TITLE = 0;
  const CLOSING = 12;
  // the deck of layouts, with the indexes of its title slide and of its content slide with math
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const LAYOUT_TITLE = 0;
  const LAYOUT_MATH = 3;
  // the handles of a selected element, each with the direction in which a drag of it grows the box
  const HANDLES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
  // the modifier that turns the snapping of a drag off
  const FREE = { mac: 'Meta', other: 'Alt' };
  // the start tag of a QR code made by insert.qr, whose text is not in the deck
  const NEW = /<div class="qr"[^>]*data-qr="https:\/\/example\.com"[^>]*>/g;

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
  const exec = async (page, id, arg) => {
    await page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
    await settle(page);
  };
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
    await settle(page);
  };
  const redo = async (page) => {
    await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
    await settle(page);
  };
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const near = (a, b, by = 1) => Math.abs(a - b) <= by;

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
    await settle(page);
    return page;
  }

  // the QR codes of the current slide in their order: the center of the drawn box in slide px, the
  // width without the rotation, the computed position, and the style attribute
  const codes = (page) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect(), k = s.width / slide.offsetWidth;
  return [...slide.querySelectorAll('.qr')].map((q) => {
    const r = q.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - s.left) / k, y: (r.top + r.height / 2 - s.top) / k, width: q.offsetWidth, position: getComputedStyle(q).position, style: q.getAttribute('style') };
  });
})()`);
  // the box in slide px of the last element of selector on the current slide, or of the selected
  // element without selector, with its computed position
  const box = (page, selector = null) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect(), k = s.width / slide.offsetWidth;
  const el = ${js(selector)} ? [...slide.querySelectorAll(${js(selector)})].at(-1) : window.BeesonEditor.selection()[0];
  const r = el.getBoundingClientRect();
  return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k, width: r.width / k, position: getComputedStyle(el).position };
})()`);
  const layout = (page) => page.evaluate(`document.querySelector('.reveal .slides > section.present').className`);

  // a new QR code on slide n, put with its upper left corner at the point p in slide px
  async function placed(t, platform, n, p) {
    const page = await load(t, platform, n);
    await exec(page, 'insert.qr');
    await exec(page, 'arrange.setPosition', p);
    return page;
  }

  // asserts that the command id, a change of layout, keeps the drawn box of the last QR code of the
  // slide and writes its width in px, in one entry of the history with an undo and a redo byte for
  // byte
  async function keeps(page, id, width) {
    const before = await render(page);
    const was = (await codes(page)).at(-1);
    await exec(page, id);
    const after = await render(page);
    const now = (await codes(page)).at(-1);
    assert.notEqual(now.position, was.position, `the theme places the code in the same way: ${js({ was, now })}`);
    assert.ok(near(now.x, was.x) && near(now.y, was.y), `the QR code is moved by the change of layout: ${js({ was, now })}`);
    assert.equal(now.width, was.width, `the QR code is resized by the change of layout: ${js({ was, now })}`);
    const tags = after.match(NEW);
    assert.equal(tags.length, 1, after);
    assert.match(tags[0], new RegExp(`width: ${width}px`), `the width is not written: ${tags[0]}`);
    await undo(page);
    assert.equal(await render(page), before, 'the undo does not give the text before the change byte for byte');
    assert.deepEqual((await codes(page)).at(-1), was);
    await redo(page);
    assert.equal(await render(page), after, 'the redo does not give the text after the change byte for byte');
    assert.deepEqual((await codes(page)).at(-1), now);
    return { before, after, was, now };
  }

  for (const platform of PLATFORMS) {
    test(`Closing to Title keeps the drawn place and size of a placed QR code, in one entry of the history (${platform})`, async (t) => {
      const page = await placed(t, platform, CLOSING, { x: 700, y: 300 });
      const { before, was } = await keeps(page, 'slide.layout.title', 200);
      assert.match(await layout(page), /\btitle\b/);
      // a change back gives the text again, as the file has it
      await exec(page, 'slide.layout.closing');
      assert.equal(await render(page), before, 'the change back to Closing does not give the text again');
      const back = (await codes(page)).at(-1);
      assert.ok(near(back.x, was.x) && near(back.y, was.y) && back.width === was.width, js({ was, back }));
      assert.deepEqual(errors(page), []);
    });

    test(`Title to Closing keeps the drawn place and size of a placed QR code, in one entry of the history (${platform})`, async (t) => {
      const page = await placed(t, platform, TITLE, { x: 1300, y: 200 });
      await keeps(page, 'slide.layout.closing', 320);
      assert.match(await layout(page), /\bclosing\b/);
      assert.deepEqual(errors(page), []);
    });

    // a run of changes of layout writes the slide from its text before the run, and the code keeps
    // the translate and the width that it has on the title slide
    test(`Closing to Title to Section keeps the place of a QR code on the title slide (${platform})`, async (t) => {
      const page = await placed(t, platform, CLOSING, { x: 700, y: 300 });
      await exec(page, 'slide.layout.title');
      const tag = (await render(page)).match(NEW)[0];
      const was = (await codes(page)).at(-1);
      const before = await render(page);
      await exec(page, 'slide.layout.section');
      assert.match(await layout(page), /\bsection\b/);
      assert.equal((await render(page)).match(NEW)[0], tag);
      const now = (await codes(page)).at(-1);
      assert.equal(now.width, was.width);
      await undo(page);
      assert.equal(await render(page), before);
      assert.deepEqual(errors(page), []);
    });

    // the code of the closing slide of the deck has neither a translate nor a width
    test(`a QR code without a place takes the place and the size of the new layout (${platform})`, async (t) => {
      const page = await placed(t, platform, CLOSING, { x: 700, y: 300 });
      const tag = '<div class="qr" data-qr="https://github.com/beeson-group/slides"></div>';
      assert.ok(page.source.includes(tag));
      await exec(page, 'slide.layout.title');
      const [first] = await codes(page);
      assert.equal(first.style, null);
      assert.equal(first.width, 320, `the QR code does not take the width of the title slide: ${js(first)}`);
      assert.equal(first.position, 'relative');
      assert.ok((await render(page)).includes(tag), 'the tag of the QR code is changed');
      assert.deepEqual(errors(page), []);
    });

    // the QR code of the title slide of the layouts page, in the flow at the upper left corner, and a
    // new one on its content slide with math, in the flow of the text column
    for (const [name, n, insert] of [['title slide', LAYOUT_TITLE, false], ['content slide', LAYOUT_MATH, true]]) {
      test(`a drag of each of the eight handles of a QR code in the flow of a ${name} keeps the opposite edge or corner, in one entry of the history (${platform})`, async (t) => {
        const page = await load(t, platform, n, LAYOUTS);
        if (insert) await exec(page, 'insert.qr');
        const base = await render(page);
        const sel = '.reveal .slides > section.present .qr';
        for (const [handle, [ux, uy]] of Object.entries(HANDLES)) {
          await click(page, sel);
          await settle(page);
          const was = await box(page);
          assert.equal(was.position, 'relative');
          await drag(page, `.beeson-grip[data-handle="${handle}"]`, { dx: 30 * ux, dy: 30 * uy, modifiers: FREE[platform] });
          await settle(page);
          const now = await box(page);
          assert.ok(now.width > was.width + 10, `the handle ${handle} does not resize the QR code: ${js({ was, now })}`);
          if (ux) assert.ok(near(ux > 0 ? now.left : now.right, ux > 0 ? was.left : was.right, 1.5), `the handle ${handle} moves the opposite edge: ${js({ was, now })}`);
          if (uy) assert.ok(near(uy > 0 ? now.top : now.bottom, uy > 0 ? was.top : was.bottom, 1.5), `the handle ${handle} moves the opposite edge: ${js({ was, now })}`);
          await undo(page);
          assert.equal(await render(page), base, `one undo does not take the drag of the handle ${handle} off`);
        }
        assert.deepEqual(errors(page), []);
      });
    }

    test(`Insert > QR Code on the title slide puts the code on the slide, off its texts (${platform})`, async (t) => {
      const page = await load(t, platform, TITLE);
      await exec(page, 'insert.qr');
      const q = (await codes(page)).at(-1);
      const b = await box(page, '.reveal .slides > section.present .qr');
      const texts = await page.evaluate(`(() => {
      const slide = document.querySelector('.reveal .slides > section.present');
      const s = slide.getBoundingClientRect(), k = s.width / slide.offsetWidth;
      return [...slide.querySelectorAll('.title-text > *')].map((e) => e.getBoundingClientRect()).map((r) => ({ left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k }));
    })()`);
      assert.ok(b.left >= 0 && b.top >= 0 && b.right <= 1920 && b.bottom <= 1080, `the QR code is not on the slide: ${js(b)}`);
      for (const r of texts) assert.ok(b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom, `the QR code lies over a text: ${js({ b, r })}`);
      assert.equal(q.position, 'relative');
      t.diagnostic(`the new QR code is at ${js(b)} in slide px`);
      assert.deepEqual(errors(page), []);
    });

    // the theme places a code in the flow in the same way on a title slide and on a section slide
    test(`Title to Section keeps the translate of a QR code in the flow as text (${platform})`, async (t) => {
      const page = await placed(t, platform, TITLE, { x: 1300, y: 200 });
      const tag = (await render(page)).match(NEW)[0];
      await exec(page, 'slide.layout.section');
      assert.match(await layout(page), /\bsection\b/);
      assert.equal((await render(page)).match(NEW)[0], tag);
      assert.deepEqual(errors(page), []);
    });
  }

  // a QR code of the title slide that a change to Closing gave a width of 320 px is drawn 320 px
  // wide by default on a section slide and on a content slide. hence the next change takes the
  // width off and writes only the translate
  for (const platform of PLATFORMS) {
    for (const to of ['section', 'content']) {
      test(`Title to Closing to ${to[0].toUpperCase() + to.slice(1)} writes only the translate of a placed QR code, whose default width is its width (${platform})`, async (t) => {
        const page = await placed(t, platform, TITLE, { x: 413, y: 517 });
        await exec(page, 'slide.layout.closing');
        assert.match((await render(page)).match(NEW)[0], /width: 320px/);
        const before = await render(page);
        const was = (await codes(page)).at(-1);
        await exec(page, `slide.layout.${to}`);
        assert.match(await layout(page), to === 'content' ? /^(?!.*\b(title|closing|section)\b)/ : /\bsection\b/);
        const after = await render(page);
        const tag = after.match(NEW)[0];
        assert.doesNotMatch(tag, /width/, `a surplus width is written: ${tag}`);
        assert.match(tag, /translate: /);
        const now = (await codes(page)).at(-1);
        assert.ok(near(now.x, was.x) && near(now.y, was.y) && now.width === was.width, `the QR code is moved or resized: ${js({ was, now })}`);
        await undo(page);
        assert.equal(await render(page), before, 'the undo does not give the text before the change byte for byte');
        await redo(page);
        assert.equal(await render(page), after, 'the redo does not give the text after the change byte for byte');
        assert.deepEqual(errors(page), []);
      });
    }
  }
});

// regression tests of R41.2 on both platforms: a QR code whose translate is not written in px, e.g.
// with a bare 0 or as a percentage of its box, keeps its drawn place and size at a change of layout
// away from Closing, with an undo and a redo byte for byte
describe('a QR code without a px translate', () => {
  const DECK = 'test/pages/editor-r41-2.html';
  const PLATFORMS = ['mac', 'other'];
  const TRANSLATES = ['0 -300px', '10% 5%', '-40px 0'];

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
  const exec = async (page, id) => {
    await page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
    await settle(page);
  };
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const near = (a, b, by = 1) => Math.abs(a - b) <= by;

  // the deck of three closing slides, with the slide of the translate shown
  async function load(t, platform, translate) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    const source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${TRANSLATES.indexOf(translate)})`);
    await settle(page);
    return page;
  }

  // the QR code of the current slide: the center of its drawn box in slide px, its width, and its style
  const code = (page) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect(), k = s.width / slide.offsetWidth;
  const q = slide.querySelector('.qr'), r = q.getBoundingClientRect();
  return { x: (r.left + r.width / 2 - s.left) / k, y: (r.top + r.height / 2 - s.top) / k, width: q.offsetWidth, style: q.getAttribute('style') };
})()`);

  for (const platform of PLATFORMS) {
    for (const translate of TRANSLATES) {
      for (const layout of ['title', 'section']) {
        test(`Closing to ${layout} keeps the drawn place of a QR code with the translate ${translate} (${platform})`, async (t) => {
          const page = await load(t, platform, translate);
          const before = await render(page);
          const was = await code(page);
          assert.equal(was.style, `translate: ${translate}`);
          await exec(page, `slide.layout.${layout}`);
          const after = await render(page);
          const now = await code(page);
          assert.ok(near(now.x, was.x) && near(now.y, was.y), `the QR code is moved by the change of layout: ${js({ was, now })}`);
          assert.equal(now.width, was.width, `the QR code is resized by the change of layout: ${js({ was, now })}`);
          await page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
          await settle(page);
          assert.equal(await render(page), before, 'the undo does not give the text before the change byte for byte');
          assert.deepEqual(await code(page), was);
          await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
          await settle(page);
          assert.equal(await render(page), after, 'the redo does not give the text after the change byte for byte');
          assert.deepEqual(await code(page), now);
          assert.deepEqual(errors(page), []);
        });
      }
    }
  }
});

// the work of R12.4 on both platforms: the place of a new table, a text laid over a figure by a
// change of the layout, the pair of an image for the two modes, the caption of a picture, the
// slide made from the Content tile, and the name and the path of an unsaved picture.
// each edit of the file is checked byte for byte, after an undo and a redo, and after a save and
// an open
describe('a text over a figure after Change Layout', () => {
  const DECK = 'test-deck.html';
  // the slides of index.html with a list beside a backdrop and with a figure in a figure box
  const STEPS = 2;
  const FIGURES = 4;
  const PLATFORMS = ['mac', 'other'];
  const DARK_FILE = resolve('demo/figure-dark.png');
  const LIGHT_FILE = resolve('demo/figure-light.png');

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

  // the box in slide px of each shown element of selector on the current slide
  const boxes = (page, selector) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present, .reveal .slides > section > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  return [...slide.querySelectorAll(${js(selector)})].filter((e) => e.getClientRects().length).map((e) => {
    const r = e.getBoundingClientRect();
    return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k };
  });
})()`);
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

  // the editor on a deck served over HTTP, with the storage of the origin emptied first, and with
  // slide n shown
  async function load(t, platform, { deck = DECK, n = 0, size = { width: 1600, height: 1000 }, query = '' } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}${query}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the rendered text differs from before, an undo gives before and a redo the edited text byte for
  // byte, and the saved text is opened again without problems
  async function checkEdit(page, before, name) {
    const edited = await render(page);
    assert.notEqual(edited, before);
    await undo(page);
    assert.equal(await render(page), before);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
    return edited;
  }

  // the files at paths given to the open file chooser of the editor, as a person picks them
  async function choose(page, paths) {
    await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
    const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
    await page.send('DOM.setFileInputFiles', { files: paths, objectId: result.objectId });
  }

  // a trusted drag of the files at paths from the Finder, dropped at the point at. it returns the
  // tag of the drop outline before the drop
  async function dropFiles(page, at, paths) {
    const data = { items: [], files: paths, dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: at.x, y: at.y, data });
    await page.send('Input.dispatchDragEvent', { type: 'dragOver', x: at.x, y: at.y, data });
    const outline = await page.evaluate(`(() => { const b = document.querySelector('.beeson-drop'); return b && !b.hidden ? b.textContent : null; })()`);
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: at.x, y: at.y, data });
    return outline;
  }

  const waitText = (page, text) => page.waitFor(`window.BeesonEditor.render().includes(${js(text)})`, 30000);
  const tabs = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].map((t) => t.textContent.trim())`);

  // a save into a folder of the private file system, which a stub of showDirectoryPicker gives as the
  // folder that the person chooses, and an open of the saved text. it returns the saved text and the
  // names of the files of its media/
  async function saveInto(page, folder) {
    const saved = await page.evaluate(`(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(${js(folder)}, { create: true });
    const deck = await dir.getFileHandle('deck.html', { create: true });
    window.showDirectoryPicker = async () => dir;
    window.BeesonEditor.attach(deck);
    await window.BeesonEditor.save();
    const files = [];
    try {
      for await (const [name] of (await dir.getDirectoryHandle('media')).entries()) files.push(name);
    } catch {}
    return { text: await (await deck.getFile()).text(), files: files.sort() };
  })()`);
    const status = await page.evaluate(`window.BeesonEditor.open(${js(saved.text)})`);
    assert.deepEqual(status.problems, []);
    return saved;
  }

  for (const platform of PLATFORMS) {
    // tables-equations-insert-5
    test(`a new table beside the list of a slide with a backdrop is put in the free space over the backdrop (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      const before = await render(page);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await frames(page);
      const [table] = await boxes(page, ':scope > table');
      assert.ok(table, 'no table was inserted');
      for (const b of await boxes(page, ':scope > ul > li, :scope > p, :scope > h2')) {
        assert.ok(!meets(table, b), `the table at ${js(table)} lies over a text at ${js(b)}`);
      }
      await checkEdit(page, before, `r12-4-table-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });

    // navigator-slides-canvas-1
    test(`a text laid over the figure of its slide by a change of the layout is marked and named in the status (${platform})`, async (t) => {
      // beeson.css draws the block of a closing slide in front of the figure, with a z-index of 2,
      // hence the status names the texts first there
      for (const [id, said] of [['slide.layout.wide', /\d+ texts? (is|are) under a picture/], ['slide.layout.title', /\d+ texts? (is|are) under a picture/], ['slide.layout.closing', /\d+ texts? (is|are) over a picture/]]) {
        const page = await load(t, platform, { n: FIGURES });
        assert.equal((await page.evaluate('window.BeesonEditor.status()')).overflow, 0, 'the slide is reported before the change');
        await exec(page, id);
        await frames(page);
        await frames(page);
        const s = await page.evaluate('window.BeesonEditor.status()');
        assert.ok(s.overflow > 0, `after ${id}, the texts over the figure are not counted`);
        assert.match(s.message, said, `after ${id}, the status reads ${s.message}`);
        assert.ok(await page.evaluate(`document.querySelectorAll('.reveal section.present .beeson-overflow').length > 0`));
        await undo(page);
        await frames(page);
        await frames(page);
        assert.equal((await page.evaluate('window.BeesonEditor.status()')).overflow, 0, `after an undo of ${id}, the slide is still reported`);
      }
    });

    // media-arrange-2
    test(`a picture hidden by Dark in light mode keeps its Image pane, and a drop or Replace adds its twin for light mode (${platform})`, async (t) => {
      for (const how of ['drop', 'replace']) {
        const page = await load(t, platform, { n: STEPS, query: '&theme=light' });
        const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
        await choose(page, [DARK_FILE]);
        await insert;
        await waitText(page, 'media/figure-dark.png');
        await frames(page);
        await exec(page, 'figure.mode.dark');
        await frames(page);
        const before = await render(page);
        assert.match(before, /<img src="media\/figure-dark.png" class="for-dark"/);
        assert.ok((await tabs(page)).includes('Image'), `the inspector shows only ${await tabs(page)}`);
        const replace = await page.evaluate(`window.BeesonEditor.state('media.replace')`);
        assert.equal(replace.enabled, true);
        assert.match(replace.label, /Light Mode/);
        assert.equal((await page.evaluate(`window.BeesonEditor.state('figure.mode.both')`)).enabled, true);
        if (how === 'drop') {
          const at = await page.evaluate(`(() => { const f = window.BeesonEditor.selection()[0]; const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          const outline = await dropFiles(page, at, [LIGHT_FILE]);
          assert.match(outline ?? '', /Light Mode/);
        } else {
          const run = page.evaluate(`window.BeesonEditor.exec('media.replace').then(() => true)`);
          await choose(page, [LIGHT_FILE]);
          await run;
        }
        await waitText(page, 'media/figure-light.png');
        await frames(page);
        const edited = await render(page);
        assert.match(edited, /<img src="media\/figure-dark.png" class="for-dark">\s*<img src="media\/figure-light.png" class="for-light">/);
        assert.equal(edited.split('<figure').length, before.split('<figure').length, 'the file was added as a new figure');
        assert.equal(await page.evaluate(`[...document.querySelectorAll('.reveal section.present img.for-light')].filter((e) => e.getBoundingClientRect().width > 0).length`), 1);
        await undo(page);
        assert.equal(await render(page), before);
        await redo(page);
        assert.equal(await render(page), edited);
        const saved = await saveInto(page, `r12-4-pair-${how}-${platform}`);
        assert.equal(saved.text, edited);
        assert.deepEqual(saved.files, ['figure-dark.png', 'figure-light.png']);
        assert.deepEqual(errors(page), []);
      }
    });

    // feel-3. a caption is switched on in the Image pane, as with Caption in the Style tab of Keynote
    // (K34), and edited in place
    test(`a picture is given a caption by the Caption switch of the Image pane, and the caption is typed into (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await waitText(page, 'media/figure-dark.png');
      await frames(page);
      const before = await render(page);
      const box = await page.evaluate(`(() => [...document.querySelectorAll('.beeson-edit-inspector label')].some((l) => l.textContent.trim() === 'Caption'))()`);
      assert.ok(box, 'the Image pane does not have a Caption switch');
      const state = await page.evaluate(`window.BeesonEditor.state('figure.caption')`);
      assert.deepEqual([state.enabled, state.checked], [true, false]);
      await exec(page, 'figure.caption');
      await frames(page);
      await page.send('Input.insertText', { text: 'A new caption' });
      await frames(page);
      const edited = await render(page);
      assert.match(edited, /<img src="media\/figure-dark.png"[^>]*>\s*<figcaption class="caption">A new caption<\/figcaption>\s*<\/figure>/);
      assert.equal((await page.evaluate(`window.BeesonEditor.state('figure.caption')`)).checked, true);
      // the caption is written into the file at its first input, which is one entry with the switch,
      // as the first input into a new text box
      await undo(page);
      assert.equal(await render(page), before);
      await redo(page);
      assert.equal(await render(page), edited);
      const saved = await saveInto(page, `r12-4-caption-${platform}`);
      assert.equal(saved.text, edited);
      // Caption off takes the caption off
      await page.evaluate(`Reveal.slide(${STEPS})`);
      await frames(page);
      await clickText(page, '.reveal section.present > figure img');
      await frames(page);
      await exec(page, 'figure.caption');
      assert.equal(await render(page), before);
      assert.deepEqual(errors(page), []);
    });

    // feel-4. a new Content slide holds the texts that its tile in Add Slide shows: a heading, a
    // paragraph, and a dash list, as a new Title & Bullets slide of Keynote holds the placeholders of
    // its thumbnail (K95). the tile is drawn from the same skeleton, with a gray box at the place of
    // the figure box of the layout, which is not written into a new slide
    test(`a new Content slide holds the paragraph and the list of its tile (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      const before = await render(page);
      await exec(page, 'slide.new.content');
      await frames(page);
      const made = await render(page);
      await undo(page);
      assert.equal(await render(page), before);
      await redo(page);
      assert.equal(await render(page), made);
      await frames(page);
      const slide = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides > section.present'); return { tags: [...s.children].filter((c) => !c.hasAttribute('data-generated') && !c.matches('aside.notes')).map((c) => c.localName + (c.className ? '.' + [...c.classList].filter((k) => !k.startsWith('beeson')).join('.') : '')), items: s.querySelectorAll(':scope > ul > li').length }; })()`);
      assert.deepEqual(slide.tags.filter((x) => !x.startsWith('div.run') && !x.startsWith('div.foot')), ['h2', 'p', 'ul']);
      const { sampleText } = await import('../src/editor/model/templates.ts');
      assert.match(sampleText('content'), /<section>\s*<h2>[^<]+<\/h2>\s*<p>[^<]+<\/p>\s*<ul>(\s*<li>[^<]+<\/li>)+\s*<\/ul>\s*<div class="figure-box"[^>]*><\/div>\s*<\/section>/, 'the Content tile draws the texts of a new slide and the place of its zone');
      assert.equal(slide.items, 1);
      // typing into the list item gives a dash item, and Return a second one
      await clickText(page, '.reveal section.present > ul > li');
      await page.send('Input.insertText', { text: 'A first point' });
      await press(page, 'Enter');
      await page.send('Input.insertText', { text: 'A second point' });
      await frames(page);
      const edited = await render(page);
      assert.match(edited, /<li>A first point<\/li>\s*<li>A second point<\/li>/);
      const { text } = await saveAndReopen(page, `r12-4-content-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(errors(page), []);
    });

    // round 5, judge opus, finding 5 (state 303). an empty placeholder of the old layout without a
    // place in the new one is dropped, and the placeholders of the new layout are shown as on a new
    // slide of it, as Change Layout of PowerPoint does (P33)
    test(`a new content slide changed to Figure holds the plate, the heading, and the caption of a new figure slide (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      await exec(page, 'slide.new.content');
      await frames(page);
      const before = await render(page);
      await exec(page, 'slide.layout.figure');
      await frames(page);
      await frames(page);
      const tags = await page.evaluate(`[...document.querySelector('.reveal .slides > section.present').children].filter((c) => !c.hasAttribute('data-generated') && !c.matches('aside.notes')).map((c) => c.localName + (c.classList.contains('caption') ? '.caption' : c.classList.contains('plate') ? '.plate' : ''))`);
      assert.deepEqual(tags, ['div.plate', 'h2', 'p.caption']);
      const s = await page.evaluate('window.BeesonEditor.status()');
      assert.equal(s.overflow, 0, `the status reads ${s.message}`);
      const [caption] = await boxes(page, ':scope > p.caption');
      assert.ok(caption && caption.bottom <= 1080 && caption.right - caption.left > 1, `the caption placeholder is not shown: ${js(caption)}`);
      const edited = await render(page);
      await undo(page);
      assert.equal(await render(page), before);
      await redo(page);
      assert.equal(await render(page), edited);
      // the change back gives the slide as it was
      await exec(page, 'slide.layout.content');
      assert.equal(await render(page), before);
      assert.deepEqual(errors(page), []);
    });

    // round 5, judge opus, finding 6 (state 302). the list of slide 3 in the black text column of Split is
    // kept off the footnote of the text column, or else it is marked and named in the status
    test(`after Change Layout to Split on slide 3, a list over the footnote of the panel is reported (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      await exec(page, 'slide.layout.split');
      await frames(page);
      await frames(page);
      const [foot] = await boxes(page, ':scope > .text-column > .foot');
      assert.ok(foot, 'the footnote is not in the panel');
      const over = (await boxes(page, ':scope > .text-column > ul > li, :scope > .text-column > p')).filter((b) => meets(b, foot));
      const s = await page.evaluate('window.BeesonEditor.status()');
      if (over.length) {
        assert.ok(s.overflow >= over.length, `${over.length} texts lie over the footnote at ${js(foot)}, and the status reads ${s.message}`);
        assert.match(s.message, /past the slide or into its footnote/);
      }
      assert.deepEqual(errors(page), []);
    });
    // feel-5
    test(`the Steps pane names a new picture by the name of its file, not by its object URL (${platform})`, async (t) => {
      const page = await load(t, platform, { n: STEPS });
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await waitText(page, 'media/figure-dark.png');
      if (!(await page.evaluate(`window.BeesonEditor.state('view.steps').checked`))) await exec(page, 'view.steps');
      await frames(page);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-side [aria-label]')].map((r) => r.getAttribute('aria-label')).filter((l) => /Figure/.test(l))`);
      assert.ok(rows.some((l) => l.includes('figure-dark.png')), `the rows read ${js(rows)}`);
      assert.ok(!rows.some((l) => /[0-9a-f]{8}-[0-9a-f]{4}-/.test(l)), `a row names the object URL: ${js(rows)}`);
      assert.deepEqual(errors(page), []);
    });
    // feel-6
    test(`a duplicate or a layout change of a slide with an unsaved new picture does not ask the server for its file (${platform})`, async (t) => {
      for (const how of ['edit.duplicate', 'slide.duplicate', 'slide.layout.split']) {
        const page = await load(t, platform, { n: STEPS });
        const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
        await choose(page, [DARK_FILE]);
        await insert;
        await waitText(page, 'media/figure-dark.png');
        await frames(page);
        if (how === 'slide.layout.split') await exec(page, 'slide.duplicate');
        await exec(page, how);
        await page.evaluate('new Promise((d) => setTimeout(d, 500))');
        const asked = await page.evaluate(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('media/figure-dark'))`);
        assert.deepEqual(asked, [], `after ${how}`);
        assert.deepEqual(errors(page), [], `after ${how}`);
        await page.close();
      }
    });
    // state 287 and 304
    test(`a new table in the empty slot of a new Figure slide takes the width of the slot (${platform})`, async (t) => {
      for (const how of ['new', 'change']) {
        const page = await load(t, platform, { n: STEPS });
        await exec(page, how === 'new' ? 'slide.new.figure' : 'slide.new.content');
        if (how === 'change') await exec(page, 'slide.layout.figure');
        await frames(page);
        const before = await render(page);
        await exec(page, 'insert.table', { rows: 3, columns: 3 });
        await frames(page);
        const m = await page.evaluate(`(() => { const t = document.querySelector('.reveal section.present table'); const slot = t.parentElement; const s = getComputedStyle(slot); const r = slot.getBoundingClientRect(); const k = r.width / slot.offsetWidth; return { slot: slot.className, table: t.getBoundingClientRect().width / k, inner: slot.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight), widths: [...t.rows[0].cells].map((c) => c.style.width) }; })()`);
        assert.ok(m.table > m.inner * 0.95, `after ${how}, the table is ${m.table} px wide in a slot ${m.inner} px wide (${m.slot})`);
        assert.ok(m.widths.every((w) => /px$/.test(w)), `after ${how}, the first row has the widths ${js(m.widths)}`);
        await checkEdit(page, before, `a table in the slot after ${how}`);
        assert.deepEqual(errors(page), []);
      }
    });
  }
});

// the work of R14.1 on both platforms: the empty caption of a picture at the place of a caption,
// and the report of a new table that is drawn over a text
describe('empty captions and the report of a table', () => {
  const DECK = 'test-deck.html';
  // the slides of index.html with a list beside a backdrop, and with a figure in a figure box
  const STEPS = 2;
  const FIGURES = 4;
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const DARK_FILE = resolve('demo/figure-dark.png');

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
  const status = (page) => page.evaluate('window.BeesonEditor.status()');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  // the box in slide px of an element of the current slide
  const box = (page, selector) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const e = slide.querySelector(${js(selector)});
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k };
})()`);

  async function load(t, platform, n, query = '', deck = DECK) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}${query}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(deck, 'utf8'))})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(typeof n === 'number' ? `Reveal.slide(${n})` : `Reveal.slide([...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('h2')?.textContent === ${js(n)}))`);
    await frames(page);
    return page;
  }

  async function choose(page, paths) {
    await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
    const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
    await page.send('DOM.setFileInputFiles', { files: paths, objectId: result.objectId });
  }

  for (const platform of PLATFORMS) {
    // juror item 6b and D27. the empty caption of the Caption switch is drawn where the theme puts
    // the caption of a figure box, 16 px under the picture, with its prompt and the caret in it, and it is
    // not reported as a text past the slide
    test(`the empty caption of the Caption switch is drawn under the picture with its prompt and the caret (${platform})`, async (t) => {
      const page = await load(t, platform, STEPS);
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await page.waitFor(`window.BeesonEditor.render().includes('media/figure-dark.png')`, 30000);
      await frames(page);
      await exec(page, 'figure.caption');
      await frames(page);
      const img = await box(page, 'figure img');
      const cap = await box(page, 'figure > figcaption');
      assert.ok(img && cap, `no caption: ${js({ img, cap })}`);
      assert.ok(cap.bottom <= 1080, `the empty caption is drawn past the slide: ${js(cap)}`);
      assert.ok(Math.abs(cap.top - img.bottom - 16) < 2, `the empty caption is not 16 px under the picture: ${js({ img, cap })}`);
      const shown = await page.evaluate(`(() => {
      const c = document.querySelector('.reveal section.present figure > figcaption');
      const p = getComputedStyle(c, '::before');
      const sel = getSelection();
      return { prompt: p.content, caret: !!sel.anchorNode && c.contains(sel.anchorNode) };
    })()`);
      assert.deepEqual(shown, { prompt: '"Click to add a caption"', caret: true });
      const s = await status(page);
      assert.equal(s.overflow, 0, `the empty caption is reported: ${s.message}`);
      assert.ok(!/past the slide| (under|over) a /.test(s.message), s.message);
      // the typed caption stays at the same place
      await page.send('Input.insertText', { text: 'A' });
      await frames(page);
      const typed = await box(page, 'figure > figcaption');
      assert.ok(Math.abs(typed.top - cap.top) < 2, `the caption moves at its first input: ${js({ cap, typed })}`);
      assert.deepEqual(errors(page), []);
    });

    // D28. a new table on a slide without a free place is reported as a figure that hides a text
    test(`a new table drawn over a text is reported (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await frames(page);
      const s = await status(page);
      assert.ok(s.overflow > 0 && /\d+ texts? (is|are) under a table/.test(s.message), `the table is not reported: ${js({ overflow: s.overflow, message: s.message })}`);
      const marked = await page.evaluate(`[...document.querySelectorAll('.reveal section.present .beeson-overflow')].map((e) => e.localName)`);
      assert.ok(marked.length > 0 && !marked.some((n) => n === 'th' || n === 'td'), `the cells of the table are marked: ${js(marked)}`);
      assert.deepEqual(errors(page), []);
    });

    // D30. after Dark on a picture in light mode, the button of the well of the Image pane adds the
    // twin for light mode, and it is named as the command, as the context menu names it
    test(`the button of the well names the choice of the twin of a picture hidden by its mode (${platform})`, async (t) => {
      const page = await load(t, platform, STEPS, '&theme=light');
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await page.waitFor(`window.BeesonEditor.render().includes('media/figure-dark.png')`, 30000);
      await frames(page);
      const label = () => page.evaluate(`(() => { const b = document.querySelector('.beeson-edit-inspector .ed-well .ed-btn'); return b ? { text: b.textContent.trim(), title: b.title } : null; })()`);
      assert.equal((await label())?.text, 'Replace…');
      await exec(page, 'figure.mode.dark');
      await frames(page);
      const state = await page.evaluate(`window.BeesonEditor.state('media.replace')`);
      assert.equal(state.label, 'Choose Image for Light Mode…');
      const b = await label();
      assert.equal(b?.text, 'Choose for Light Mode…', `the button reads ${js(b)}`);
      assert.equal(b.title, state.label);
      assert.deepEqual(errors(page), []);
    });

    // D19. a display formula is drawn as a block as wide as the text column, while its glyphs end at
    // the left of the picture. the formula is measured by the box of its glyphs
    test(`a display formula whose glyphs end left of the picture is not reported over it (${platform})`, async (t) => {
      for (const id of ['slide.layout.wide', 'slide.layout.title']) {
        const page = await load(t, platform, 'Math, an ordered list, and a zone', '', LAYOUTS);
        await exec(page, id);
        await frames(page);
        await frames(page);
        const m = await page.evaluate(`(() => {
        const slide = document.querySelector('.reveal .slides > section.present');
        const math = slide.querySelector('div.math');
        const glyphs = math.querySelector('mjx-container svg').getBoundingClientRect();
        const img = [...slide.querySelectorAll('figure img')].find((i) => i.getClientRects().length).getBoundingClientRect();
        return { marked: math.classList.contains('beeson-overflow'), clear: glyphs.right < img.left, wide: math.getBoundingClientRect().right > img.left };
      })()`);
        assert.deepEqual([m.clear, m.wide], [true, true], `the slide does not show the case of D19 after ${id}: ${js(m)}`);
        assert.equal(m.marked, false, `after ${id}, the formula is reported over the figure`);
        assert.deepEqual(errors(page), []);
      }
    });

    // D29. a typed caption under a new picture meets the box of the footnote but not its text, which
    // ends left of the caption, and it is not reported as running into the footnote
    test(`a caption beside the end of the footnote text is not reported as running into it (${platform})`, async (t) => {
      const page = await load(t, platform, STEPS);
      const insert = page.evaluate(`window.BeesonEditor.exec('insert.image').then(() => true)`);
      await choose(page, [DARK_FILE]);
      await insert;
      await page.waitFor(`window.BeesonEditor.render().includes('media/figure-dark.png')`, 30000);
      await frames(page);
      await exec(page, 'figure.caption');
      await frames(page);
      await page.send('Input.insertText', { text: 'A new caption' });
      await frames(page);
      const m = await page.evaluate(`(() => {
      const slide = document.querySelector('.reveal .slides > section.present');
      const foot = slide.querySelector(':scope > .foot');
      const cap = slide.querySelector('figure > figcaption').getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(foot);
      const text = Math.max(...[...range.getClientRects()].map((r) => r.right));
      const f = foot.getBoundingClientRect();
      return { boxMeets: cap.left < f.right && cap.bottom > f.top, textClear: text < cap.left };
    })()`);
      assert.deepEqual(m, { boxMeets: true, textClear: true }, 'the slide does not show the case of D29');
      const s = await status(page);
      assert.equal(s.overflow, 0, `the caption is reported: ${s.message}`);
      assert.deepEqual(errors(page), []);
    });

    // D20. after Section on the slide of the code box, the footnote is drawn over the code box, and
    // both are marked, as a text over a picture is
    test(`a footnote drawn over a code box is marked with the code box (${platform})`, async (t) => {
      const page = await load(t, platform, 'Code boxes, you guessed it...');
      await exec(page, 'slide.layout.section');
      await frames(page);
      await frames(page);
      const m = await page.evaluate(`(() => {
      const slide = document.querySelector('.reveal .slides > section.present');
      const a = slide.querySelector('pre').getBoundingClientRect();
      const foot = slide.querySelector('.foot');
      const b = foot.getBoundingClientRect();
      return { meets: a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right, foot: foot.classList.contains('beeson-overflow'), pre: slide.querySelector('pre').classList.contains('beeson-overflow') || !!slide.querySelector('pre .beeson-overflow, pre.beeson-overflow') };
    })()`);
      assert.equal(m.meets, true, 'the slide does not show the case of D20');
      assert.deepEqual([m.foot, m.pre], [true, true], `the marks are ${js(m)}`);
      const s = await status(page);
      assert.ok(s.overflow >= 2, `the status reads ${s.message}`);
      assert.deepEqual(errors(page), []);
    });
    // a pending element is not written yet, hence the texts under an empty code box are not reported
    test(`an empty new code box over a text is not reported before it has a text (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await exec(page, 'insert.code');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present pre.beeson-pending').length`), 1, 'a pending code box was not inserted');
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present .beeson-overflow').length`), 0, 'a text under the empty code box is marked');
      assert.equal((await status(page)).overflow, 0);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R15.9 on both platforms, by ruling 2 of the juror of round 6: a text over a
// figure is reported only after a change of the layout of its slide and after an insert that the
// editor placed, with a sentence that names what covers what. an overlap leaves the report once
// the user moves the text or the figure, and a text is tested by the lines of its words inside its
// box (gap 2 of the verdict, state 109)
describe('when and how an overlap is reported', () => {
  const DECK = 'test-deck.html';
  const PLATFORMS = ['mac', 'other'];
  // slide 5 of the demo deck, with a heading, a paragraph, a list of three items, and a figure
  const FIGURES = 4;

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
  const status = (page) => page.evaluate('window.BeesonEditor.status()');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const settle = async (page) => {
    await frames(page);
    await frames(page);
  };

  // the editor on the demo deck with slide n shown
  async function load(t, platform, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the texts of the current slide outside the shown elements of selector whose lines, clipped to the
  // box of their text, meet the box of one of them, by tag name and the start of their text, and the
  // texts outlined by the editor
  const covered = (page, selector) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const figs = [...slide.querySelectorAll(${js(selector)})].filter((f) => f.getClientRects().length).map((f) => ({ f, r: f.getBoundingClientRect() }));
  const meets = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const clip = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  const name = (el) => el.localName + ':' + el.textContent.trim().slice(0, 16);
  const texts = [...slide.querySelectorAll('[contenteditable="true"]')].filter((el) => !el.closest('aside.notes, .backdrop') && !figs.some(({ f }) => f.contains(el)));
  const under = texts.filter((el) => {
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].some((l) => l.width > 1 && figs.some(({ r }) => meets(clip(l, box), r)));
  });
  return { under: under.map(name), marked: [...slide.querySelectorAll('.beeson-overflow')].map(name) };
})()`);

  // whether the first element of selector is drawn over the first text named in the list of covered
  const onTop = (page, selector, text) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const f = [...slide.querySelectorAll(${js(selector)})].find((e) => e.getClientRects().length);
  const el = [...slide.querySelectorAll('[contenteditable="true"]')].find((e) => e.localName + ':' + e.textContent.trim().slice(0, 16) === ${js(text)});
  const range = document.createRange();
  range.selectNodeContents(el);
  const a = f.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  for (const l of range.getClientRects()) {
    const x0 = Math.max(l.left, a.left, b.left), x1 = Math.min(l.right, a.right, b.right), y0 = Math.max(l.top, a.top, b.top), y1 = Math.min(l.bottom, a.bottom, b.bottom);
    if (x1 < x0 + 2 || y1 < y0 + 2) continue;
    const hit = document.elementsFromPoint((x0 + x1) / 2, (y0 + y1) / 2).find((e) => f.contains(e) || e === f || el.contains(e));
    return hit ? (f.contains(hit) || hit === f ? 'figure' : 'text') : null;
  }
  return null;
})()`);

  // the scale of the slide on the screen, and the center of the move handle of the selected block
  const scaleOf = (page) => page.evaluate(`document.querySelector('.reveal section.present').getBoundingClientRect().width / 1920`);
  const handle = (page) => page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-handle')].find((d) => !d.hidden && d.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  // a point inside the first line of the first element of selector, 12 px from its left end
  const lineStart = (page, selector) => page.evaluate(`(() => {
  const el = document.querySelector(${js(selector)});
  const range = document.createRange();
  range.selectNodeContents(el);
  const l = range.getClientRects()[0];
  return { x: l.left + 12, y: l.top + l.height / 2 };
})()`);

  for (const platform of PLATFORMS) {
    // probe 13 of the verdict: the sentence named the wrong object and the wrong direction
    test(`a new table over a text is reported by name, and a drag of the table by 30 px takes the report away (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await settle(page);
      const c = await covered(page, ':scope > table');
      assert.ok(c.under.length > 0, 'the new table does not cover a text');
      const n = c.under.length;
      const s = await status(page);
      assert.ok(s.message.includes(`${n} text${n === 1 ? ' is' : 's are'} under a table`), `the status reads ${js(s.message)} for ${js(c.under)}`);
      assert.ok(!/over a figure/.test(s.message), s.message);
      assert.deepEqual(c.marked, c.under, 'the outlined texts are not those under the table');
      assert.equal(await onTop(page, ':scope > table', c.under[0]), 'figure', 'the table is not drawn over the text');
      // an undo of the insert takes the report away, and a redo brings it back
      await undo(page);
      await settle(page);
      assert.equal((await status(page)).overflow, 0, 'the report stays after an undo of the insert');
      await redo(page);
      await settle(page);
      assert.ok((await status(page)).message.includes('under a table'), 'the report is not back after a redo of the insert');
      // the table is moved by 30 slide px by its handle and still covers a text
      const k = await scaleOf(page);
      await drag(page, await handle(page), { dx: 30 * k, dy: 0, steps: 8 });
      await settle(page);
      const moved = await covered(page, ':scope > table');
      assert.ok(moved.under.length > 0, 'the table moved by 30 px does not cover a text');
      assert.notEqual(await render(page), page.source);
      const m = await status(page);
      assert.equal(m.overflow, 0, `the table moved by the user is reported: ${js(m.message)}`);
      assert.ok(!/ (under|over) a /.test(m.message), m.message);
      assert.deepEqual(moved.marked, []);
      await undo(page);
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      const u = await status(page);
      assert.equal(u.overflow, 0, `after an undo of the drag and of the insert the status reads ${js(u.message)}`);
      assert.deepEqual((await covered(page, ':scope > figure img')).marked, []);
      assert.deepEqual(errors(page), []);
    });

    // probe 2 and gap 1 of the verdict
    test(`the figure of slide 5 dragged over the text column is not reported (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      const img = '.reveal section.present figure img';
      await clickText(page, img);
      await frames(page);
      const at = await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(img)})].find((i) => i.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const k = await scaleOf(page);
      await drag(page, at, { dx: -530 * k, dy: -40 * k, steps: 12 });
      await settle(page);
      assert.notEqual(await render(page), page.source);
      const c = await covered(page, ':scope > figure img');
      assert.ok(c.under.length >= 3, `the figure is not over the text column: ${js(c.under)}`);
      const s = await status(page);
      assert.equal(s.overflow, 0, `the status reads ${js(s.message)}`);
      assert.ok(!/ (under|over) a /.test(s.message), s.message);
      assert.deepEqual(c.marked, []);
      assert.deepEqual(errors(page), []);
    });

    // the texts left under the picture of slide 5 by the layout Wide. a text that the user moves
    // leaves the report, and the others stay until the picture is moved
    test(`a change of layout that leaves texts under a picture is reported, and a text or the picture moved leaves the report (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await exec(page, 'slide.layout.wide');
      await settle(page);
      const c = await covered(page, ':scope > figure img');
      assert.ok(c.under.length >= 2, `the layout Wide does not leave two texts under the picture: ${js(c.under)}`);
      assert.equal(await onTop(page, ':scope > figure img', c.under[0]), 'figure');
      const n = c.under.length;
      assert.ok((await status(page)).message.includes(`${n} texts are under a picture`), (await status(page)).message);
      assert.deepEqual(c.marked, c.under);
      // the paragraph is nudged down by the keys
      await clickText(page, await lineStart(page, '.reveal section.present > p'));
      await press(page, 'Escape');
      await press(page, 'ArrowDown');
      await settle(page);
      const p = (await covered(page, ':scope > figure img'));
      const para = p.under.find((x) => x.startsWith('p:'));
      assert.ok(para, `the nudged paragraph is not under the picture: ${js(p.under)}`);
      assert.ok(!p.marked.includes(para), `the nudged paragraph is outlined: ${js(p.marked)}`);
      assert.deepEqual(p.marked, p.under.filter((x) => x !== para), 'the other texts left the report');
      const rest = p.under.length - 1;
      assert.ok((await status(page)).message.includes(`${rest} text${rest === 1 ? ' is' : 's are'} under a picture`), (await status(page)).message);
      // the picture is nudged left
      await clickText(page, '.reveal section.present figure img');
      await press(page, 'ArrowLeft');
      await settle(page);
      const f = await covered(page, ':scope > figure img');
      assert.ok(f.under.length >= 2, `the nudged picture is not over the texts: ${js(f.under)}`);
      assert.deepEqual(f.marked, []);
      assert.ok(!/ (under|over) a /.test((await status(page)).message), (await status(page)).message);
      assert.deepEqual(errors(page), []);
    });

    test(`a text drawn over a picture after a change of layout is named before the picture (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await clickText(page, await lineStart(page, '.reveal section.present > p'));
      await press(page, 'Escape');
      await exec(page, 'arrange.order.front');
      await settle(page);
      assert.notEqual(await render(page), page.source, 'Bring to Front did not act on the paragraph');
      await exec(page, 'slide.layout.wide');
      await settle(page);
      const c = await covered(page, ':scope > figure img');
      const para = c.under.find((x) => x.startsWith('p:'));
      assert.ok(para && c.under.length >= 2, `the layout Wide does not leave the paragraph and a list item under the picture: ${js(c.under)}`);
      assert.equal(await onTop(page, ':scope > figure img', para), 'text');
      const rest = c.under.length - 1;
      const s = await status(page);
      assert.ok(s.message.includes(`${rest} text${rest === 1 ? ' is' : 's are'} under a picture. 1 text is over a picture`), s.message);
      assert.deepEqual(c.marked, c.under);
      assert.deepEqual(errors(page), []);
    });

    // item 3 of the brief: a picture and a QR code over texts after a change of layout are named in
    // one sentence. the QR code is put over the paragraph by a typed position, which is not reported
    test(`a picture and a QR code over texts after a change of layout are named in one sentence (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await exec(page, 'insert.qr');
      await settle(page);
      const p = await page.evaluate(`(() => {
      const slide = document.querySelector('.reveal .slides > section.present');
      const s = slide.getBoundingClientRect();
      const k = s.width / slide.offsetWidth;
      const r = slide.querySelector(':scope > p').getBoundingClientRect();
      return { x: Math.round((r.left - s.left) / k + 100), y: Math.round((r.top - s.top) / k) };
    })()`);
      await exec(page, 'arrange.setPosition', p);
      await settle(page);
      assert.ok((await covered(page, '.qr')).under.length > 0, 'the QR code is not over a text');
      assert.equal((await status(page)).overflow, 0, 'an overlap made by a typed position is reported');
      await exec(page, 'slide.layout.wide');
      await settle(page);
      const qr = await covered(page, '.qr');
      const both = await covered(page, ':scope > figure img, .qr');
      assert.ok(qr.under.length > 0, `the QR code is not over a text after Wide: ${js(qr.under)}`);
      const n = both.under.length;
      const s = await status(page);
      assert.match(s.message, new RegExp(`${n} texts are under a (picture and a QR code|QR code and a picture)`), `the status reads ${js(s.message)} for ${js(both.under)}`);
      assert.deepEqual(both.marked, both.under);
      assert.deepEqual(errors(page), []);
    });
  }

  // the closing slide of the deck, with a second QR code that is selected
  async function closing(t, platform) {
    const page = await load(t, platform, 0);
    await page.evaluate(`Reveal.slide([...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.matches('.closing')))`);
    await frames(page);
    await exec(page, 'insert.qr');
    await frames(page);
    return page;
  }

  // the boxes in slide px of the heading, of its one line of text, and of the last QR code
  const boxes = (page) => page.evaluate(`(() => {
  const slide = document.querySelector('.reveal .slides > section.present');
  const s = slide.getBoundingClientRect();
  const k = s.width / slide.offsetWidth;
  const px = (r) => ({ left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k });
  const h1 = slide.querySelector('h1');
  const range = document.createRange();
  range.selectNodeContents(h1);
  const codes = slide.querySelectorAll('.qr');
  return { h1: px(h1.getBoundingClientRect()), line: px(range.getClientRects()[0]), qr: px(codes[codes.length - 1].getBoundingClientRect()), marked: h1.classList.contains('beeson-overflow') };
})()`);

  // puts the new QR code over the first word of the heading by a typed position, with its lower edge
  // dy px under the upper edge of the box of the heading. an overlap made by the user is not
  // reported, hence the layout is then changed to Title, which keeps the place of the heading and
  // asks for the report of the whole slide. typed is the count of the report after the typed position
  async function put(page, dy) {
    const b = await boxes(page);
    await exec(page, 'arrange.setPosition', { x: Math.round(b.h1.left + 40), y: Math.round(b.h1.top - (b.qr.bottom - b.qr.top) + dy) });
    await frames(page);
    const typed = (await status(page)).overflow;
    await exec(page, 'slide.layout.title');
    await settle(page);
    return { ...(await boxes(page)), typed };
  }

  for (const platform of PLATFORMS) {
    // state 109 of round 6: a QR code snapped to the upper edge of the heading "Thank you" was
    // reported as "1 text lies over a figure", since the rect of the line starts 18 px over the box
    test(`a QR code that ends at the upper edge of a heading is not reported as under its text (${platform})`, async (t) => {
      const page = await closing(t, platform);
      const b = await put(page, 0);
      assert.ok(Math.abs(b.qr.bottom - b.h1.top) < 1, `the QR code does not end at the heading: ${js(b)}`);
      assert.ok(b.qr.right > b.line.left + 2 && b.qr.left < b.line.right - 2, `the QR code is not over the text of the heading: ${js(b)}`);
      // the content area of the font is taller than the box of the heading
      assert.ok(b.line.top < b.h1.top - 2, `the line of the heading is inside its box: ${js(b)}`);
      const s = await status(page);
      assert.equal(s.overflow, 0, `the heading is reported: ${js(s.message)}`);
      assert.equal(b.marked, false, 'the heading is outlined');
      assert.deepEqual(errors(page), []);
    });

    test(`a QR code that reaches 10 px into the box of a heading is reported after a change of layout (${platform})`, async (t) => {
      const page = await closing(t, platform);
      const b = await put(page, 10);
      assert.equal(b.typed, 0, 'an overlap made by a typed position is reported');
      assert.ok(Math.abs(b.qr.bottom - b.h1.top - 10) < 1, `the QR code does not reach into the heading: ${js(b)}`);
      const s = await status(page);
      assert.equal(s.overflow, 1, `the heading is not reported: ${js(s.message)}`);
      assert.match(s.message, /1 text is (under|over) a QR code/);
      assert.equal(b.marked, true, 'the heading is not outlined');
      assert.deepEqual(errors(page), []);
    });
  }
});
