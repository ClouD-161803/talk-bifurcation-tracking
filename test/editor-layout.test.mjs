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
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { arrange, kindOf, relayout, shift } from '../src/editor/commands/layout.ts';
import { byteExact, center, click, drag, press, saveAndReopen } from './helpers/editor.mjs';

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
