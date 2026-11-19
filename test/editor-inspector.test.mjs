// the Format tab of the inspector on both platforms, driven with trusted input: a click in the
// inspector keeps the selection on the canvas, X typed as 40 writes the translate of a figure, Align
// Left of two elements is one entry of the history, Narrow writes the class of the slide, and the
// description of an image is written into its alt. each edit is checked byte for byte, after an
// undo and a redo, against the scope rule, and after a save and an open of the saved text

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { byteExact, captured, click, clickText, drag, editorPage, openFormula, press, saveAndReopen, selectFigure, type, typeKeys } from './helpers/editor.mjs';
import { substitution } from '../src/editor/text/substitute.ts';
import { besidePlace } from '../src/editor/ui/dialog.ts';
import { fillLine, GRID } from '../src/editor/table.ts';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));

const FIGURE = '<figure class="figure-box fragment" data-fragment-index="2">';
const LEAD = '<p>The lead-in of a display</p>';
const WHITE_FIGURE = '<img class="white-figure" src="../../demo/figure-light.png" alt="A white raster figure">';

const P = '.reveal section.present > p';
const FIGURE_BOX = '.reveal section.present .figure-box';
const IMG = '.reveal section.present .figure-box > img';
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

// the editor on slide n of the deck of layouts, served over HTTP so that a save is written into the
// origin private file system, with the Format tab shown
async function inspectorPage(platform, n) {
  await last?.close().catch(() => {});
  const page = await browser.newPage();
  last = page;
  await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(LAYOUTS, 'utf8');
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
  assert.deepEqual(status.problems, []);
  if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
  await page.evaluate(`Reveal.slide(${n})`);
  await frames(page);
  return page;
}

const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const pane = (page) => page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane ?? null`);

// the index of the first slide of the deck that has an element at selector
const slideWith = (selector) => {
  const sections = readFileSync(LAYOUTS, 'utf8').split('<section').slice(1);
  return sections.findIndex((s) => s.includes(selector));
};

// a click on the tab or the button of the inspector whose text or title is name
async function tap(page, name) {
  const at = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('${PANEL} button, ${PANEL} label.ed-check')].find((b) => b.textContent.trim() === ${JSON.stringify(name)} || b.title === ${JSON.stringify(name)} || b.getAttribute('aria-label') === ${JSON.stringify(name)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  assert.ok(at, `the inspector does not have a button ${name}`);
  await click(page, at);
  await frames(page);
}

// the boxes of the solid frames shown, and whether one is drawn around the element at selector
const shownFrames = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-frame.selected')].filter((f) => !f.hidden && f.getBoundingClientRect().width).map((f) => { const r = f.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })`);
// the box of the first shown element matched by selector. a figure that holds a picture is framed at
// the picture, i.e. at the image or video fitted into it with object-fit contain, and over its
// caption while the figure is selected
const boxOf = (page, selector) => page.evaluate(`(() => {
  let el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width);
  const caps = el.matches('figure, .figure-box, .plate') && window.BeesonEditor.selection().includes(el) ? [...el.querySelectorAll(':scope > figcaption, :scope > .caption')].map((c) => c.getBoundingClientRect()).filter((c) => c.width) : [];
  const out = (b) => ({ left: Math.min(b.left, ...caps.map((c) => c.left)), top: Math.min(b.top, ...caps.map((c) => c.top)), right: Math.max(b.right, ...caps.map((c) => c.right)), bottom: Math.max(b.bottom, ...caps.map((c) => c.bottom)) });
  const pic = el.matches('figure, .figure-box, .plate') ? [...el.querySelectorAll(':scope > img, :scope > video')].find((m) => m.getBoundingClientRect().width) : null;
  el = pic ?? el;
  const r = el.getBoundingClientRect();
  const [w, h] = el instanceof HTMLImageElement ? [el.naturalWidth, el.naturalHeight] : el instanceof HTMLVideoElement ? [el.videoWidth, el.videoHeight] : [0, 0];
  const fit = getComputedStyle(el).objectFit;
  if (!w || !h || (fit !== 'contain' && fit !== 'scale-down')) return out({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const s = Math.min(r.width / w, r.height / h, fit === 'scale-down' ? 1 : Infinity);
  const [px, py] = getComputedStyle(el).objectPosition.split(/\\s+/).map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
  const left = r.left + (r.width - w * s) * px, top = r.top + (r.height - h * s) * py;
  return out({ left, top, right: left + w * s, bottom: top + h * s });
})()`);
const around = (frame, box) => ['left', 'top'].every((k) => box[k] - frame[k] >= -1 && box[k] - frame[k] <= 9) && ['right', 'bottom'].every((k) => frame[k] - box[k] >= -1 && frame[k] - box[k] <= 9);
async function framed(page, selectors) {
  const shown = await shownFrames(page);
  const out = [];
  for (const s of selectors) {
    const box = await boxOf(page, s);
    if (shown.some((f) => around(f, box))) out.push(s);
  }
  return out;
}

// the problems of the scope rule in the rendered text that the file did not have before
async function inScope(page) {
  const now = textProblems(await page.evaluate('window.BeesonEditor.render()'), THEME);
  for (const p of textProblems(page.source, THEME)) {
    const i = now.indexOf(p);
    if (i >= 0) now.splice(i, 1);
  }
  assert.deepEqual(now, []);
}

async function roundTrip(page, edits) {
  await byteExact(page, edits);
  await inScope(page);
  await undo(page);
  await byteExact(page);
  await redo(page);
  await byteExact(page, edits);
}

let saves = 0;
async function saved(page, edits) {
  const { text } = await saveAndReopen(page, `inspector-${++saves}.html`);
  page.source = text;
  await byteExact(page);
  assert.ok(edits.every(([, after]) => text.includes(after)));
}

const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

// the value typed into the field at selector of the inspector, after its old value is selected
async function typeInto(page, selector, text) {
  await click(page, `${PANEL} ${selector}`);
  await page.evaluate(`document.querySelector('${PANEL} ${selector}').select()`);
  await type(page, text);
  await press(page, 'Enter');
  await frames(page);
}

for (const platform of PLATFORMS) {
  test(`a click in the inspector keeps the selected figure, and X typed 40 px to the right writes its translate on ${platform}`, async () => {
    const page = await inspectorPage(platform, slideWith(FIGURE));
    await selectFigure(page, IMG);
    assert.deepEqual(await framed(page, [FIGURE_BOX]), [FIGURE_BOX], 'the figure is not selected by a click on its image and Esc');
    // the figure has the Image pane with its tabs, as an image with a caption in Keynote, and its
    // place in the Arrange tab
    assert.equal(await pane(page), 'image');
    await tap(page, 'Arrange');
    assert.equal(await pane(page), 'arrange');
    await tap(page, 'Slide');
    assert.deepEqual(await framed(page, [FIGURE_BOX]), [FIGURE_BOX], 'a click on Align to Slide clears the selection');
    await tap(page, 'Selection');
    // X and Y are the position of the figure on the slide, and a position 40 px to the right is
    // written as a translate of 40 px
    const field = (n) => page.evaluate(`Number(document.querySelector('${PANEL} #beeson-edit-num-${n}').value)`);
    const x0 = await field('x'), y0 = await field('y');
    await typeInto(page, '#beeson-edit-num-x', String(x0 + 40));
    assert.deepEqual(await framed(page, [FIGURE_BOX]), [FIGURE_BOX], 'a value typed into X clears the selection');
    const moved = [FIGURE, '<figure class="figure-box fragment" data-fragment-index="2" style="translate: 40px 0px">'];
    await roundTrip(page, [moved]);
    assert.equal(await field('x'), x0 + 40);
    // Y is written next to X, and Reset Position takes both off
    await typeInto(page, '#beeson-edit-num-y', String(y0 - 12));
    const both = [FIGURE, '<figure class="figure-box fragment" data-fragment-index="2" style="translate: 40px -12px">'];
    await byteExact(page, [both]);
    await undo(page);
    await byteExact(page, [moved]);
    await tap(page, 'Reset Position');
    await byteExact(page);
    await undo(page);
    await byteExact(page, [moved]);
    await saved(page, [moved]);
    assert.deepEqual(errors(page), []);
  });

  test(`a click on Bold in the Text pane keeps the range of the text, and formats it on ${platform}`, async () => {
    const page = await inspectorPage(platform, 2);
    await page.evaluate(`(() => {
      const p = [...document.querySelectorAll('.reveal section.present > p')].find((e) => e.textContent.startsWith('A paragraph'));
      p.focus();
      const t = p.firstChild;
      const r = document.createRange();
      r.setStart(t, 2);
      r.setEnd(t, 11);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    })()`);
    await frames(page);
    await frames(page);
    assert.equal(await pane(page), 'text');
    assert.equal(await page.evaluate(`document.querySelector('${PANEL} [data-command="text.bold"]').disabled`), false);
    await tap(page, 'Bold');
    const bold = ['<p>A paragraph with', '<p>A <strong>paragraph</strong> with'];
    await byteExact(page, [bold]);
    assert.equal(await page.evaluate('getSelection().toString()'), 'paragraph', 'a click on Bold loses the range');
    assert.equal(await page.evaluate(`document.querySelector('${PANEL} [data-command="text.bold"]').getAttribute('aria-pressed')`), 'true');
    await inScope(page);
    await undo(page);
    await byteExact(page);
    await redo(page);
    await byteExact(page, [bold]);
    await saved(page, [bold]);
    assert.deepEqual(errors(page), []);
  });

  test(`Align Left of two elements writes both offsets as one entry of the history on ${platform}`, async () => {
    const page = await inspectorPage(platform, slideWith(FIGURE));
    const p = await boxOf(page, P);
    const f = await boxOf(page, FIGURE_BOX);
    await selectFigure(page, IMG);
    await click(page, { x: p.right + 3, y: (p.top + p.bottom) / 2 }, { modifiers: 'Shift' });
    assert.deepEqual(await framed(page, [P, FIGURE_BOX]), [P, FIGURE_BOX]);
    assert.equal(await pane(page), 'arrange');
    await tap(page, 'Slide');
    await tap(page, 'Align Left');
    assert.deepEqual(await framed(page, [P, FIGURE_BOX]), [P, FIGURE_BOX], 'Align Left clears the selection');
    const text = await page.evaluate('window.BeesonEditor.render()');
    const x = (tag) => Number(text.match(new RegExp(`${tag.slice(0, -1)} style="translate: (-?\\d+)px 0px">`))?.[1]);
    const [px, fx] = [x(LEAD.slice(0, 3)), x(FIGURE)];
    assert.ok(px < 0 && fx === px, `the offsets of the paragraph and the figure are ${px} and ${fx}`);
    const edits = [
      [LEAD, `<p style="translate: ${px}px 0px">The lead-in of a display</p>`],
      [FIGURE, `${FIGURE.slice(0, -1)} style="translate: ${fx}px 0px">`],
    ];
    await byteExact(page, edits);
    await inScope(page);
    // one undo takes both offsets off
    await undo(page);
    await byteExact(page);
    await redo(page);
    await byteExact(page, edits);
    // the two are moved as one ensemble: the left edge of the pair is at the left edge of the slide,
    // and the figure keeps its distance from the paragraph
    const left = await page.evaluate(`document.querySelector('.reveal .slides').getBoundingClientRect().left`);
    const [p2, f2] = [await boxOf(page, P), await boxOf(page, FIGURE_BOX)];
    assert.ok(Math.abs(Math.min(p2.left, f2.left) - left) <= 1, 'the pair is not at the left edge');
    assert.ok(Math.abs(f2.left - p2.left - (f.left - p.left)) <= 1, 'the figure did not keep its distance from the paragraph');
    await saved(page, edits);
    assert.deepEqual(errors(page), []);
  });

  test(`Narrow in the Slide pane writes the class of the section on ${platform}`, async () => {
    const page = await inspectorPage(platform, 2);
    assert.equal(await pane(page), 'slide');
    await tap(page, 'Narrow');
    const narrow = ['<section data-timing="40">', '<section data-timing="40" class="narrow">'];
    await roundTrip(page, [narrow]);
    await tap(page, 'Wide');
    await byteExact(page, [['<section data-timing="40">', '<section data-timing="40" class="wide">']]);
    await tap(page, 'Normal');
    await byteExact(page);
    await undo(page);
    await undo(page);
    await byteExact(page, [narrow]);
    await saved(page, [narrow]);
    assert.deepEqual(errors(page), []);
  });

  test(`the description typed into the Image pane is written into the alt of the image on ${platform}`, async () => {
    const page = await inspectorPage(platform, slideWith(WHITE_FIGURE));
    await click(page, '.reveal section.present .plate > img');
    assert.equal(await pane(page), 'image');
    await typeInto(page, 'textarea[name="alt"]', 'Zero-velocity curves, with "quotes" & an ampersand');
    assert.deepEqual(await framed(page, ['.reveal section.present .plate']), ['.reveal section.present .plate'], 'a description typed clears the selection');
    const alt = [WHITE_FIGURE, '<img class="white-figure" src="../../demo/figure-light.png" alt="Zero-velocity curves, with &quot;quotes&quot; &amp; an ampersand">'];
    await roundTrip(page, [alt]);
    // Decorative writes the empty alt, and a second click takes the alt off
    await tap(page, 'Decorative');
    await byteExact(page, [[WHITE_FIGURE, '<img class="white-figure" src="../../demo/figure-light.png" alt>']]);
    assert.equal(await page.evaluate(`document.querySelector('${PANEL} textarea[name="alt"]').disabled`), true);
    await undo(page);
    await byteExact(page, [alt]);
    await saved(page, [alt]);
    assert.deepEqual(errors(page), []);
  });
}

test('Edit Alt Text… of the context menu shows the Image pane with its description focused', async () => {
  const page = await inspectorPage('other', slideWith(WHITE_FIGURE));
  await click(page, '.reveal section.present .plate > img');
  await tap(page, 'Arrange');
  await exec(page, 'figure.alt');
  await frames(page);
  assert.equal(await pane(page), 'image');
  assert.equal(await page.evaluate(`document.activeElement?.getAttribute('name')`), 'alt');
  // the keys typed into the field are not taken by the canvas, e.g. an arrow nudges nothing
  await press(page, 'ArrowLeft');
  await byteExact(page);
  assert.deepEqual(errors(page), []);
});

test('the text of a QR code is written into its data-qr and drawn again, also after an undo', async () => {
  const page = await inspectorPage('mac', 0);
  await click(page, '.reveal section.present .qr');
  assert.equal(await pane(page), 'qr');
  const modules = () => page.evaluate(`document.querySelector('.reveal section.present .qr svg')?.outerHTML.length ?? 0`);
  const before = await modules();
  await typeInto(page, 'textarea[name="qr"]', 'https://example.com/a/much/longer/address/for/a/larger/code');
  const qr = ['<div class="qr" data-qr="https://github.com/beeson-group/slides">', '<div class="qr" data-qr="https://example.com/a/much/longer/address/for/a/larger/code">'];
  await roundTrip(page, [qr]);
  const drawn = await modules();
  assert.ok(drawn > 0 && drawn !== before, 'the QR code is not drawn again from its new text');
  await undo(page);
  await frames(page);
  assert.equal(await modules(), before, 'the QR code is not drawn again after an undo');
  // an empty text is refused, and the file is kept
  await typeInto(page, 'textarea[name="qr"]', ' ');
  await byteExact(page);
  assert.deepEqual(errors(page), []);
});

// the panes of the Format tab that are kept across a change that they depend on, R35.1, on both
// platforms. the Slide pane shows the sections and the controls of a pane built fresh for the same
// selection after Mod+A or Mod+click in the navigator, and after a change of the layout of several
// slides that keeps the current slide, with its undo and its redo. the Image pane and the Video
// pane name the twin of a dark and light pair that a flip of the mode shows, and act on it. the
// Poster Frame slider of the Video pane is on again once the video is loaded after an undo or a
// redo of Replace…
describe('panes kept across a change they depend on', () => {
  const PLATFORMS = ['mac', 'other'];
  const PANEL = '#beeson-edit-panel-format';

  let browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  let last = null;
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}).then(() => true)`);

  async function open(platform) {
    await last?.close().catch(() => {});
    const page = await editorPage(browser, { query: `edit&still&edit-platform=${platform}`, page: { width: 1600, height: 1000 }, clear: true });
    last = page;
    if (!(await page.evaluate(`window.BeesonEditor.state('shell.format').checked`))) await exec(page, 'shell.format');
    await frames(page);
    return page;
  }

  // a click on the row of slide n of the navigator, counted from 1. Chrome on a macOS host turns a
  // trusted Ctrl+click into a context menu without a click, hence the Ctrl+click of other is
  // dispatched in the page there
  async function row(page, n, modifiers = '') {
    const at = await page.evaluate(`(() => {
    const r = document.querySelectorAll('.beeson-edit-nav .row')[${n - 1}];
    r.scrollIntoView({ block: 'nearest' });
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
    const ctrl = modifiers === 'Mod' && process.platform === 'darwin' && (await page.evaluate(`new URLSearchParams(location.search).get('edit-platform')`)) === 'other';
    if (ctrl) await page.evaluate(`document.querySelectorAll('.beeson-edit-nav .row')[${n - 1}].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, clientX: ${at.x}, clientY: ${at.y} }))`);
    else await click(page, at, { modifiers });
    await frames(page);
  }

  // the pane that is shown: its shown sections, its layout card, and the state of each shown control
  const PANE = `(() => {
  const root = document.querySelector('${PANEL} .ed-panes');
  const shown = (el) => !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
  return {
    pane: root?.dataset.pane ?? null,
    sections: [...(root?.querySelectorAll('.ed-sec') ?? [])].filter(shown).map((s) => s.querySelector(':scope > h5')?.textContent ?? '(untitled)'),
    card: root?.querySelector('.ed-chooser .what > span:last-child')?.textContent ?? null,
    notes: [...(root?.querySelectorAll('.ed-note') ?? [])].filter(shown).map((n) => n.textContent),
    controls: [...(root?.querySelectorAll('button, input, textarea, select') ?? [])].filter(shown).map((c) => [
      c.dataset.command ?? c.name ?? c.textContent.trim(), c.disabled,
      c.getAttribute('aria-pressed') ?? c.getAttribute('aria-checked') ?? (c.type === 'checkbox' ? String(c.checked) + (c.indeterminate ? '-' : '') : null),
      'value' in c && c.type !== 'checkbox' && c.localName !== 'button' ? c.value : null,
    ]),
  };
})()`;
  const pane = async (page) => { await frames(page); return page.evaluate(PANE); };

  // the pane built again for the same selection, i.e. the Format tab shown again without its panes
  async function fresh(page) {
    await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.remove()`);
    await exec(page, 'shell.format');
    await exec(page, 'shell.format');
    return pane(page);
  }

  // the kept pane, which must be the pane built fresh for the same selection
  async function same(page, what) {
    const kept = await pane(page);
    const built = await fresh(page);
    assert.deepEqual(kept, built, what);
    return built;
  }

  const current = (page) => page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].indexOf(Reveal.getCurrentSlide()) + 1`);

  async function chooseLayout(page, layout) {
    await click(page, `${PANEL} .ed-chooser`);
    await page.waitFor(`!!document.querySelector('.beeson-edit-layouts')`);
    await click(page, `.beeson-edit-layouts .tile[data-layout="${layout}"]`);
    await sleep(200);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`the Slide pane after Mod+A in the navigator is the pane built for every slide (${platform})`, async () => {
      const page = await open(platform);
      for (const n of [4, 13, 5]) {
        await row(page, n);
        await press(page, 'Mod+A');
        await sleep(100);
        assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-edit-nav .row[aria-selected="true"]').length`), 13, `Mod+A on slide ${n} selects every slide`);
        assert.equal(await current(page), n);
        const built = await same(page, `Mod+A on slide ${n}`);
        assert.deepEqual(built.sections, ['Appearance'], `Mod+A on slide ${n}`);
        assert.equal(built.card, 'Multiple Layouts');
      }
    });

    test(`the Slide pane after Mod+click takes a slide off the selection is the pane built for the slide left (${platform})`, async () => {
      const page = await open(platform);
      // [first, then with Mod, then with Mod again, the slide left, its sections]
      for (const [a, b, c, left, sections] of [
        [3, 1, 3, 1, ['Backdrop', 'Appearance']],
        [3, 2, 3, 2, ['Backdrop', 'Appearance', '(untitled)']],
        [2, 3, 2, 3, ['Text Column', 'Backdrop', 'Appearance', 'Running Head']],
      ]) {
        await row(page, a);
        await row(page, b, 'Mod');
        await row(page, c, 'Mod');
        assert.equal(await current(page), left);
        const built = await same(page, `slides ${a} and ${b}, then ${c} taken off`);
        assert.deepEqual(built.sections, sections, `slide ${left} alone`);
      }
    });

    test(`the Slide pane after a change of the layout of several slides that keeps the current slide, its undo, and its redo is the pane built fresh (${platform})`, async () => {
      const page = await open(platform);
      for (const [a, b, layout, sections] of [
        [6, 7, 'section', ['Backdrop', 'Appearance', '(untitled)']],
        [12, 13, 'closing', ['Backdrop', 'Appearance']],
      ]) {
        await row(page, a);
        await row(page, b, 'Mod');
        await page.evaluate(`window.__kept = Reveal.getCurrentSlide()`);
        const before = await same(page, `slides ${a} and ${b}`);
        assert.equal(before.card, 'Multiple Layouts');
        await chooseLayout(page, layout);
        assert.equal(await page.evaluate(`Reveal.getCurrentSlide() === window.__kept`), true, `slide ${b} stays current`);
        const built = await same(page, `slides ${a} and ${b} after ${layout}`);
        assert.deepEqual(built.sections, sections);
        await exec(page, 'edit.undo');
        await sleep(200);
        assert.equal(await page.evaluate(`Reveal.getCurrentSlide() === window.__kept`), true, `slide ${b} stays current at the undo`);
        assert.deepEqual((await same(page, `slides ${a} and ${b} after the undo of ${layout}`)).sections, ['Appearance']);
        assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
        await exec(page, 'edit.redo');
        await sleep(200);
        assert.deepEqual((await same(page, `slides ${a} and ${b} after the redo of ${layout}`)).sections, sections);
        await exec(page, 'edit.undo');
        await sleep(200);
      }
    });

    test(`the Image pane and the Video pane name the twin that a flip of the mode shows, and act on it (${platform})`, async () => {
      const page = await open(platform);
      for (const [tag, kind] of [['img', 'image'], ['video', 'video']]) {
        const h = await page.evaluate(`Reveal.getIndices(document.querySelector('${tag}.for-dark').closest('section')).h`);
        await page.evaluate(`Reveal.slide(${h})`);
        await frames(page);
        await click(page, `section.present ${tag}.for-dark`);
        await frames(page);
        const read = () => page.evaluate(`(() => {
        const root = document.querySelector('${PANEL} .ed-panes');
        const shown = [...document.querySelectorAll('section.present ${tag}')].find((m) => m.getClientRects().length > 0);
        return { pane: root?.dataset.pane, file: root?.querySelector('.ed-well .name')?.textContent, alt: root?.querySelector('textarea[name="alt"]')?.value ?? null,
          shown: shown?.getAttribute('src').split('/').pop(), shownAlt: shown?.getAttribute('alt') ?? null };
      })()`);
        let was = await read();
        assert.equal(was.pane, kind);
        assert.equal(was.file, was.shown);
        for (const flip of ['key', 'menu']) {
          if (flip === 'key') await press(page, 'D');
          else await exec(page, 'view.slideDark');
          await frames(page);
          await sleep(100);
          const now = await read();
          assert.equal(now.pane, kind);
          assert.notEqual(now.shown, was.shown, 'the flip shows the other twin');
          assert.equal(now.file, now.shown, `the ${kind} pane names the twin shown after the flip (${flip})`);
          if (kind === 'image') assert.equal(now.alt, now.shownAlt, `the description is that of the twin shown (${flip})`);
          was = now;
        }
        // the Description field acts on the twin that the flip shows
        if (kind === 'image') {
          await press(page, 'D');
          await frames(page);
          await sleep(100);
          assert.equal((await read()).shown, 'figure-light.png');
          await click(page, `${PANEL} textarea[name="alt"]`);
          await page.evaluate(`document.querySelector('${PANEL} textarea[name="alt"]').select()`);
          await type(page, 'Light curves');
          await page.evaluate(`document.querySelector('${PANEL} textarea[name="alt"]').blur()`);
          await frames(page);
          assert.deepEqual(await page.evaluate(`['dark', 'light'].map((m) => document.querySelector('section.present img.for-' + m).getAttribute('alt'))`),
            ['Zero-velocity curves of the Earth–Moon system, dark version', 'Light curves']);
          await exec(page, 'edit.undo');
          assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
          await press(page, 'D');
          await frames(page);
        }
      }
    });

    test(`the Poster Frame slider is on once the video is loaded after an undo and a redo of Replace… (${platform})`, async () => {
      const page = await open(platform);
      await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
      const h = await page.evaluate(`Reveal.getIndices(document.querySelector('video.for-dark').closest('section')).h`);
      await page.evaluate(`Reveal.slide(${h})`);
      await frames(page);
      await click(page, 'section.present video.for-dark');
      const loaded = `document.querySelector('section.present video.for-dark').readyState >= 1`;
      await page.waitFor(loaded);
      await sleep(300);
      const slider = () => page.evaluate(`(() => {
      const input = document.querySelector('${PANEL} input[name="poster-frame"]');
      const play = document.querySelector('${PANEL} .ed-frame .ed-play');
      const v = document.querySelector('section.present video.for-dark');
      return { off: input.disabled, play: play.disabled, max: Number(input.max).toFixed(2), length: v.duration.toFixed(2), file: document.querySelector('${PANEL} .ed-well .name').textContent };
    })()`);
      const on = await slider();
      assert.deepEqual(on, { off: false, play: false, max: on.length, length: on.length, file: 'clip-dark.mp4' });
      const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('${PANEL} button')].find((b) => b.textContent.trim() === 'Replace…'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await click(page, at);
      await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
      const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
      await page.send('DOM.setFileInputFiles', { files: [fileURLToPath(new URL('../demo/clip-light.mp4', import.meta.url))], objectId: result.objectId });
      await page.waitFor(`document.querySelector('section.present video.for-dark').getAttribute('src') !== 'demo/clip-dark.mp4'`);
      await page.waitFor(loaded);
      await sleep(300);
      assert.deepEqual(await slider(), { ...on, file: 'clip-light.mp4' }, 'after Replace…');
      for (const [step, file] of [['edit.undo', 'clip-dark.mp4'], ['edit.redo', 'clip-light.mp4']]) {
        await exec(page, step);
        await frames(page);
        await page.waitFor(loaded);
        await sleep(500);
        assert.deepEqual(await slider(), { ...on, file }, `after ${step} of Replace…`);
      }
      await exec(page, 'edit.undo');
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
    });
  }
});

// the fixes of R5.5 on both platforms: the space after a smart dash at the end of a paragraph, the
// Text pane live in an empty text, the switch Number the lines of the Code pane, the menu of the
// delivery of a list in the Steps tab, a list in the text column after a change of layout to Split, and
// typeset math in the running head of the Slide pane. each edit of the file is checked byte for
// byte, after an undo and a redo, and after a save and an open
describe('the Text and Code panes in new boxes', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const PARAGRAPH = '<p>A paragraph with <strong>bold</strong>, <em>italic</em>, <code>code</code>, and \\(x^2\\) inline.</p>';

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

  // the editor on the slide at index of the deck of layouts, served over HTTP, with the Format tab
  async function editor(platform, index = 2) {
    await last?.close().catch(() => {});
    const page = await browser.newPage();
    last = page;
    await page.send('Page.bringToFront');
    await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(LAYOUTS, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${index})`);
    await frames(page);
    return page;
  }

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

  // the caret put at the end of the first element at selector, with its block focused
  const caretAtEnd = (page, selector) =>
    page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    el.closest('[contenteditable="true"]').focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);

  let saves = 0;
  async function saved(page) {
    const { text } = await saveAndReopen(page, `r5-5-${++saves}.html`);
    page.source = text;
    await byteExact(page);
    return text;
  }

  // a trailing space typed at the end of a block is a no-break space in Chrome, and the en dash put
  // for the hyphen must keep it, since a plain trailing space is dropped by the next character
  test('an en dash keeps the space typed after it, whatever space the browser typed', () => {
    const on = { quotes: true, dashes: true };
    assert.deepEqual(substitution('done -', ' ', on), { remove: 2, insert: '– ' });
    assert.deepEqual(substitution('done -', ' ', on), { remove: 2, insert: '– ' });
    assert.deepEqual(substitution('done -', ' ', on), { remove: 2, insert: '– ' });
    assert.equal(substitution('done-', ' ', on), null);
  });

  for (const platform of PLATFORMS) {
    test(`a hyphen between spaces at the end of a paragraph becomes an en dash and keeps both spaces on ${platform}`, async () => {
      const page = await editor(platform);
      await caretAtEnd(page, '.reveal section.present > p');
      await typeKeys(page, ' "Halo" -- it\'s done - ok');
      const typed = PARAGRAPH.replace('inline.', 'inline. “Halo” — it’s done – ok');
      await byteExact(page, [[PARAGRAPH, typed]]);
      await saved(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // the controls of the Text pane that are not dimmed
  const liveControls = (page) =>
    page.evaluate(`[...document.querySelectorAll('#beeson-edit-panel-format .ed-panes button')].filter((b) => !b.disabled && !b.closest('.ed-tabs')).map((b) => b.getAttribute('aria-label') || b.title || b.textContent)`);

  // the button of the Format tab with the title, clicked as a user would
  async function tap(page, title) {
    const at = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('#beeson-edit-panel-format button')].find((b) => (b.getAttribute('aria-label') || b.title || b.textContent) === ${JSON.stringify(title)});
    if (!b || b.disabled) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the Format tab does not have a live ${title}`);
    await click(page, at);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`the Text pane is live in a new text box, and a format chosen before typing is typed on ${platform}`, async () => {
      const page = await editor(platform);
      await exec(page, 'insert.text');
      await frames(page);
      const live = await liveControls(page);
      for (const title of ['Bold', 'Italic', 'Accent', 'Paragraph Style']) assert.ok(live.includes(title), `${title} is dimmed in a new text box`);
      await tap(page, 'Bold');
      assert.equal((await state(page, 'text.bold')).checked, true);
      await tap(page, 'Accent');
      await typeKeys(page, 'Hi there');
      const text = await page.evaluate('window.BeesonEditor.render()');
      assert.ok(text.includes('<p><strong><span class="tone-accent">Hi there</span></strong></p>'), 'the new text is not bold and orange');
      // the box with its first character is one entry, and the typing after it another
      await undo(page);
      await undo(page);
      await byteExact(page);
      await redo(page);
      await redo(page);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), text);
      await saved(page);
      assert.deepEqual(errors(page), []);
    });

    test(`a format chosen at the end of a footnote is typed after it on ${platform}`, async () => {
      const page = await editor(platform);
      const FOOT = '<div class="foot">A footnote of a content slide.</div>';
      await caretAtEnd(page, '.reveal section.present .foot');
      await frames(page);
      const live = await liveControls(page);
      for (const title of ['Bold', 'Italic', 'Strikethrough', 'Paragraph Style']) assert.ok(live.includes(title), `${title} is dimmed in a footnote`);
      await tap(page, 'Italic');
      await typeKeys(page, ' ok');
      const edits = [[FOOT, '<div class="foot">A footnote of a content slide. <em>ok</em></div>']];
      await byteExact(page, edits);
      await undo(page);
      await byteExact(page);
      await redo(page);
      await byteExact(page, edits);
      await saved(page);
    });

    test(`the size of a code box is live in the Text pane, and the formats it cannot hold are dimmed on ${platform}`, async () => {
      const page = await editor(platform, 5);
      const PRE = '<pre><code class="language-python" data-line-numbers="1|2">';
      await caretAtEnd(page, '.reveal section.present pre code');
      await frames(page);
      await page.evaluate(`document.querySelector('#beeson-edit-panel-format .ed-tabs [role=tab]:nth-child(2)')?.click()`);
      await frames(page);
      const live = await liveControls(page);
      assert.ok(live.includes('Smaller'), 'the size of a code box is dimmed');
      assert.ok(!live.includes('Bold') && !live.includes('Accent'), 'a format that a code box cannot hold is live');
      await tap(page, 'Smaller');
      const edits = [[PRE, PRE.replace('<pre>', '<pre style="font-size: 18px">')]];
      await byteExact(page, edits);
      assert.equal((await state(page, 'text.smaller')).enabled, false);
      assert.equal((await state(page, 'text.bigger')).enabled, true);
      await undo(page);
      await byteExact(page);
      await redo(page);
      await byteExact(page, edits);
      await saved(page);
    });
  }

  for (const platform of PLATFORMS) {
    test(`a paragraph style and a list chosen in a new text box, and the size in a new code box, are typed on ${platform}`, async () => {
      const page = await editor(platform);
      await exec(page, 'insert.text');
      await frames(page);
      await exec(page, 'text.list.ul');
      assert.equal((await state(page, 'text.list.ul')).checked, true);
      await typeKeys(page, 'Item');
      assert.ok((await page.evaluate('window.BeesonEditor.render()')).includes('<li>Item</li>'), 'the new text is not a list item');
      const page2 = await editor(platform);
      await exec(page2, 'insert.text');
      await frames(page2);
      await exec(page2, 'text.style.subheading');
      await typeKeys(page2, 'Sub');
      assert.ok((await page2.evaluate('window.BeesonEditor.render()')).includes('<h3>Sub</h3>'), 'the new text is not a subheading');
      const page3 = await editor(platform, 5);
      await exec(page3, 'insert.code');
      await frames(page3);
      assert.equal((await state(page3, 'text.bold')).enabled, false);
      await exec(page3, 'text.smaller');
      await typeKeys(page3, 'x');
      const text = await page3.evaluate('window.BeesonEditor.render()');
      assert.ok(text.includes('<pre style="font-size: 18px"><code class="language-python">x</code></pre>'), 'the new code box is not small');
      await undo(page3);
      await byteExact(page3);
      await saved(page3);
      assert.deepEqual(errors(page3), []);
    });
  }

  // the numbers drawn at the left of the code box of the slide, and the gap between the left edge
  // of the box and its first character, in CSS pixels
  const drawnNumbers = (page) =>
    page.evaluate(`(() => {
    const pre = document.querySelector('.reveal section.present pre');
    const content = getComputedStyle(pre, '::before').content;
    const r = document.createRange();
    r.setStart(pre.querySelector('code').firstChild, 0);
    r.setEnd(pre.querySelector('code').firstChild, 1);
    return { numbers: content === 'none' ? '' : JSON.parse(content.replace(/\\\\a /g, '\\\\n')), indent: r.getBoundingClientRect().left - pre.getBoundingClientRect().left };
  })()`);

  for (const platform of PLATFORMS) {
    test(`a code box is drawn with numbered lines while Number the lines is on, and the switch numbers them on ${platform}`, async () => {
      const page = await editor(platform, 5);
      await caretAtEnd(page, '.reveal section.present pre code');
      await frames(page);
      assert.equal((await state(page, 'code.numbers')).checked, true);
      const numbered = await drawnNumbers(page);
      assert.equal(numbered.numbers, '1\n2', 'the lines of the code box are not numbered on the canvas');
      // a new code box is drawn without numbers until the switch is turned on
      await exec(page, 'insert.code');
      await frames(page);
      await type(page, 'x\ny');
      await frames(page);
      const pre = '<pre><code class="language-python">x\ny</code></pre>';
      const before = await page.evaluate('window.BeesonEditor.render()');
      assert.ok(before.includes(pre), before.match(/<pre>.*\n?.*<\/pre>/g)?.join(" ; "));
      await page.evaluate(`(() => { const c = [...document.querySelectorAll('.reveal section.present pre code')].pop(); const r = document.createRange(); r.selectNodeContents(c); r.collapse(false); c.closest('[contenteditable="true"]').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
      await frames(page);
      assert.equal((await state(page, 'code.numbers')).checked, false);
      const plain = await page.evaluate(`getComputedStyle([...document.querySelectorAll('.reveal section.present pre')].pop(), '::before').content`);
      assert.ok(plain === 'none' || plain === 'normal', 'a code box without data-line-numbers is drawn with numbers');
      await exec(page, 'code.numbers');
      await frames(page);
      const after = await page.evaluate('window.BeesonEditor.render()');
      assert.equal(after, before.replace(pre, '<pre><code class="language-python" data-line-numbers>x\ny</code></pre>'));
      const content = await page.evaluate(`getComputedStyle([...document.querySelectorAll('.reveal section.present pre')].pop(), '::before').content`);
      assert.ok(content.includes('1') && content.includes('2'), 'the switch does not number the lines of the box on the canvas');
      assert.equal((await state(page, 'code.numbers')).checked, true);
      await undo(page);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), before);
      await redo(page);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), after);
      await saved(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // the editor on the demo deck at a size of the window, with the Steps tab shown on the slide of a
  // list delivered item by item
  async function stepsPage(platform, width, height) {
    await last?.close().catch(() => {});
    const page = await browser.newPage({ width, height });
    last = page;
    await page.goto(`${server.origin}/test-deck.html?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync('test-deck.html', 'utf8');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`)).problems, []);
    await exec(page, 'view.steps');
    await page.evaluate(`Reveal.slide(Reveal.getIndices(document.querySelector('li.fragment').closest('section')).h)`);
    await page.evaluate('new Promise((d) => setTimeout(d, 150))');
    return page;
  }

  for (const platform of PLATFORMS) {
    for (const [width, height] of [[1600, 1000], [1920, 1080], [1280, 800]]) {
      test(`the menu of the delivery of a list leaves every row of the Steps tab visible at ${width} by ${height} on ${platform}`, async () => {
        const page = await stepsPage(platform, width, height);
        const chip = await page.evaluate(`(() => { const r = document.querySelector('.beeson-edit-side .list-head .chip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await click(page, chip);
        await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
        const { menu, covered } = await page.evaluate(`(() => {
        const box = (el) => el.getBoundingClientRect();
        const m = box(document.querySelector('.beeson-edit-menu'));
        const rows = [...document.querySelectorAll('.beeson-edit-side .list-head, .beeson-edit-side .rows .row')].filter((r) => box(r).height);
        const hit = (r) => r.left < m.right && m.left < r.right && r.top < m.bottom && m.top < r.bottom;
        return { menu: { left: m.left, top: m.top, right: m.right, bottom: m.bottom }, covered: rows.filter((r) => hit(box(r))).map((r) => r.textContent.slice(0, 30)) };
      })()`);
        assert.deepEqual(covered, [], 'the menu is drawn over rows of the Steps tab');
        assert.ok(menu.left >= 0 && menu.top >= 0 && menu.right <= width && menu.bottom <= height, 'the menu runs out of the window');
        // the menu is level with the head row, at its side
        const head = await page.evaluate(`(() => { const r = document.querySelector('.beeson-edit-side .list-head').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })()`);
        assert.ok(menu.top <= head.bottom && menu.bottom >= head.top, `the menu is not level with its row: ${JSON.stringify([menu, head])}`);
        await press(page, 'Escape');
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the contrast ratio of two colors given as rgb() strings, as WCAG 2 defines it
  function contrast(a, b) {
    const lum = (c) => {
      const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map((v) => {
        const s = Number(v) / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }

  for (const platform of PLATFORMS) {
    test(`a slide changed to Split keeps its text inside the panel, with readable inline code in both modes, on ${platform}`, async () => {
      const page = await stepsPage(platform, 1600, 1000);
      await page.evaluate(`Reveal.slide(Reveal.getIndices([...document.querySelectorAll('.reveal section h2')].find((h) => h.textContent.startsWith('Figures are first')).closest('section')).h)`);
      await frames(page);
      const source = page.source;
      await exec(page, 'slide.layout.split');
      await page.evaluate('new Promise((d) => setTimeout(d, 300))');
      const fit = await page.evaluate(`(() => {
      const panel = document.querySelector('.reveal section.present > .text-column');
      const p = panel.getBoundingClientRect();
      const out = [...panel.children].filter((el) => !el.matches('.foot, aside')).filter((el) => el.getBoundingClientRect().bottom > p.bottom + 1).map((el) => el.localName);
      return { out, marked: document.querySelectorAll('.reveal section.present .beeson-overflow').length };
    })()`);
      assert.deepEqual(fit.out, [], 'a text runs past the bottom of the panel');
      assert.equal(fit.marked, 0);
      const split = await page.evaluate('window.BeesonEditor.render()');
      assert.notEqual(split, source);
      for (const theme of ['dark', 'light']) {
        await page.evaluate(`document.documentElement.dataset.theme = '${theme}'`);
        const [fg, bg] = await page.evaluate(`(() => { const c = document.querySelector('.reveal section.present > .text-column code'); return [getComputedStyle(c).color, getComputedStyle(c.closest('.text-column')).backgroundColor]; })()`);
        assert.ok(contrast(fg, bg) >= 4.5, `inline code in the panel has a contrast of ${contrast(fg, bg).toFixed(2)} in ${theme} mode`);
      }
      await undo(page);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), source);
      await redo(page);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), split);
      await saved(page);
      assert.deepEqual(errors(page), []);
    });
  }

  const until = async (page, expr, ms = 3000) => {
    for (const end = Date.now() + ms; Date.now() < end; await page.evaluate('new Promise((d) => setTimeout(d, 50))')) if (await page.evaluate(expr)) return true;
    return false;
  };
  const typesetIn = (selector) => `document.querySelectorAll(${JSON.stringify(selector)}).length > 0`;

  for (const platform of PLATFORMS) {
    test(`the Slide pane shows the running head of a slide with its math typeset on ${platform}`, async () => {
      const page = await editor(platform, 2);
      const sel = '.beeson-edit-inspector .ed-sec .ed-note.running-head';
      assert.ok(await until(page, typesetIn(`${sel} mjx-container`)), 'the running head of the Slide pane is not typeset');
      const note = await page.evaluate(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); return { tex: n.dataset.tex, shown: n.textContent }; })()`);
      assert.equal(note.tex, '“Content \\(\\mathcal{L}_{1}\\)”, from the last section slide');
      assert.ok(!note.shown.includes('\\('));
      assert.deepEqual(errors(page), []);
    });
  }
});

// tests of the popovers beside their target, the zoom levels, the poster frame slider, and the
// table grid with Autofill, on either platform with trusted input. the Insert Formula sheet is kept
// off its formula inside the canvas, the Edit Formula sheet and the link editor are kept off a list
// item near the bottom of the slide, the
// toolbar and the status bar list the same zoom levels, a poster is captured at the time of the
// slider, also in a deck opened from a file, the grid of Insert Table is 10 columns by 8 rows with
// Insert Table… under it, and a drag of the fill handle of a range of cells fills the cells beside
// it. after each edit the text is in the scope rule, an undo gives the file byte for byte, a redo
// gives the edit, and a save is opened again without problems
describe('popovers, zoom levels, and the poster frame slider', () => {
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const PANEL = '#beeson-edit-panel-format';
  const PLATFORMS = ['mac', 'other'];
  // the indexes of slides of index.html: "Show your steps one at a time", whose list ends near the
  // bottom of the slide, "Equations are first class citizens", and "Embedding videos"
  const STEPS = 2;
  const EQUATIONS = 3;
  const VIDEOS = 10;
  const LAST = '.reveal section.present ul > li:last-child';

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

  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const js = (v) => JSON.stringify(v);
  const settle = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(window.BeesonEditor.status()))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

  // the editor on a deck served over HTTP, with the Format tab shown
  async function open(platform, { deck = 'test-deck.html', size = { width: 1440, height: 900 } } = {}) {
    const page = await browser.newPage(size);
    // an earlier test that keeps its page open 1 s after its last edit leaves a draft in the storage
    // of the origin, and the dialog of this draft then covers the slide of the next page of the deck
    await page.send('Storage.clearDataForOrigin', { origin: server.origin, storageTypes: 'local_storage' });
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(status.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    return page;
  }

  async function show(page, h) {
    await page.evaluate(`Reveal.slide(${h})`);
    await sleep(150);
    await settle(page);
  }

  const boxOf = (page, selector) => page.evaluate(`(() => {
  const el = [...document.querySelectorAll(${js(selector)})].find((e) => e.getClientRects().length);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
})()`);
  const meets = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const middle = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

  // asserts that the popover of selector popover does not meet the box of target, is inside the
  // window, and has an arrow
  async function besideCheck(page, popover, target, what) {
    const p = await boxOf(page, popover);
    const t = await boxOf(page, target);
    const view = await page.evaluate('({ width: innerWidth, height: innerHeight })');
    assert.ok(p && t, `${what} or its target is not shown`);
    assert.ok(!meets(p, t), `${what} at ${js(p)} covers its target at ${js(t)}`);
    assert.ok(p.left >= 0 && p.top >= 0 && p.right <= view.width && p.bottom <= view.height, `${what} at ${js(p)} is not inside the window`);
    assert.ok(await page.evaluate(`!!document.querySelector(${js(popover)}).dataset.beside`), `${what} does not have an arrow at its target`);
  }

  let saves = 0;
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the edit did not change the text');
    const added = textProblems(edited, THEME);
    for (const p of textProblems(page.source, THEME)) if (added.includes(p)) added.splice(added.indexOf(p), 1);
    assert.deepEqual(added, [], 'the edit is out of the scope rule');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    assert.equal((await settle(page)).undo, false, `the edit is more than ${undos} entries of the history`);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r6-3-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  test('a popover is put on the first side where it fits, and flipped where the window ends', () => {
    const view = { width: 1440, height: 900 };
    const item = { left: 250, top: 780, right: 750, bottom: 830, width: 500, height: 50 };
    // below an item near the bottom of the window there is no room, hence the popover goes above it
    const up = besidePlace(item, 372, 200, view);
    assert.equal(up.side, 'above');
    assert.ok(up.y + 200 <= item.top);
    assert.equal(besidePlace(item, 460, 316, view, ['right', 'left', 'below', 'above']).side, 'right');
    const wide = { ...item, left: 600, right: 1300, width: 700 };
    const left = besidePlace(wide, 460, 316, view, ['right', 'left', 'below', 'above']);
    assert.equal(left.side, 'left');
    assert.ok(left.x + 460 <= wide.left);
    // without room on any side, the popover is kept in the window without an arrow
    const full = besidePlace({ left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 }, 460, 316, view);
    assert.equal(full.side, null);
    assert.ok(full.x >= 8 && full.y >= 8 && full.x + 460 <= 1432 && full.y + 316 <= 892);
  });

  test('Autofill goes on with a step of numbers and repeats any other line', () => {
    assert.deepEqual(fillLine(['1', '2'], 3), [{ text: '3' }, { text: '4' }, { text: '5' }]);
    assert.deepEqual(fillLine(['Step 1', 'Step 3'], 2), [{ text: 'Step 5' }, { text: 'Step 7' }]);
    assert.deepEqual(fillLine(['1.5', '1.25'], 2), [{ text: '1.00' }, { text: '0.75' }]);
    assert.deepEqual(fillLine(['a', 'b'], 3), [{ copy: 0 }, { copy: 1 }, { copy: 0 }]);
    assert.deepEqual(fillLine(['7'], 2), [{ copy: 0 }, { copy: 0 }]);
    assert.deepEqual(fillLine(['1', '1'], 1), [{ copy: 0 }]);
    assert.deepEqual(fillLine(['<b>1</b>', '<b>2</b>'], 1), [{ text: '<b>3</b>' }]);
    assert.deepEqual(GRID, { columns: 10, rows: 8 });
  });

  // the caret at the end of the last item of the list of the current slide
  async function caretInLast(page) {
    const r = await boxOf(page, LAST);
    await clickText(page, { x: r.right - 4, y: r.bottom - 6 });
    await settle(page);
    await page.evaluate(`(() => {
    const r = document.createRange();
    r.selectNodeContents(document.querySelector(${js(LAST)}));
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  })()`);
  }

  for (const platform of PLATFORMS) {
    test(`the formula sheets and the link editor are put beside a list item near the bottom of the slide (${platform})`, async (t) => {
      const page = await open(platform);
      t.after(() => page.close?.());
      await show(page, STEPS);
      const slide = await boxOf(page, '.reveal section.present');
      const item = await boxOf(page, LAST);
      assert.ok(item.bottom > slide.top + (slide.bottom - slide.top) * 0.75, 'the last item is not near the bottom of the slide');

      await caretInLast(page);
      await exec(page, 'math.inline');
      await page.waitFor(`!!document.querySelector('.beeson-math')`);
      await sleep(200);
      await besideCheck(page, '.beeson-math', LAST, 'the Insert Inline Formula sheet');
      await type(page, 'x^2');
      // the sheet takes its TeX once the preview is typeset
      await page.waitFor(`!document.querySelector('.beeson-math button.primary').disabled`);
      await press(page, 'Mod+Enter');
      await page.waitFor(`!document.querySelector('.beeson-math')`);
      await settle(page);
      assert.match(await render(page), /one slide per step\.\\\(x\^2\\\)<\/li>/);

      await openFormula(page, `${LAST} mjx-container`);
      await page.waitFor(`!!document.querySelector('.beeson-math')`);
      await sleep(200);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-math .title').textContent`), 'Edit Formula');
      await besideCheck(page, '.beeson-math', LAST, 'the Edit Formula sheet');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-math')`);
      await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);

      // the link editor on the word PDF of the item
      await caretInLast(page);
      await page.evaluate(`(() => {
      const text = document.querySelector(${js(LAST)}).firstChild;
      const at = text.data.indexOf('PDF');
      const r = document.createRange();
      r.setStart(text, at);
      r.setEnd(text, at + 3);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    })()`);
      await settle(page);
      await press(page, 'Mod+K');
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-link[open]')`);
      await sleep(100);
      await besideCheck(page, 'dialog.beeson-edit-link', LAST, 'the link editor');
      await type(page, 'example.com');
      await press(page, 'Enter');
      await page.waitFor(`window.BeesonEditor.render().includes('<a href="https://example.com">PDF</a>')`);
      await roundTrip(page);
    });

    // in this window no side of the new formula below the list has room in the canvas but the one
    // above it, hence the sheet is put over the list, as R7.9 keeps it inside the canvas and off the
    // inspector
    test(`the formula sheet of a new display formula below a list is kept above it, inside the canvas (${platform})`, async (t) => {
      const page = await open(platform);
      t.after(() => page.close?.());
      await show(page, STEPS);
      await clickText(page, LAST);
      await press(page, 'Escape');
      await exec(page, 'insert.formula');
      await page.waitFor(`!!document.querySelector('.beeson-math')`);
      await sleep(200);
      await besideCheck(page, '.beeson-math', '.reveal section.present div.math', 'the Insert Formula sheet');
      const p = await boxOf(page, '.beeson-math');
      const v = await page.evaluate('window.BeesonEditorShell.stage.viewport.toJSON()');
      assert.ok(p.left >= v.left && p.top >= v.top && p.right <= v.right && p.bottom <= v.bottom, `the Insert Formula sheet at ${js(p)} is not inside the canvas ${js(v)}`);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-math').dataset.beside`), 'above');
      await press(page, 'Escape');
    });
  }

  // the labels of the items of the open menu, with their dimmed state
  const menuLabels = (page) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].map((m) => ({ label: m.querySelector('.label')?.textContent ?? m.textContent.trim(), disabled: m.getAttribute('aria-disabled') === 'true' }))`);
  const pick = (page, label) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].find((m) => (m.querySelector('.label')?.textContent ?? '') === ${js(label)}).click()`);
  const zoomOf = (page) => page.evaluate('window.BeesonEditorShell.stage.zoom');

  for (const platform of PLATFORMS) {
    test(`the zoom popup of the toolbar and the zoom menu of the status bar list the same levels, with Actual Size and Zoom to Selection (${platform})`, async (t) => {
      const page = await open(platform);
      t.after(() => page.close?.());
      await show(page, EQUATIONS);
      await click(page, '.beeson-edit-top [data-command="toolbar.zoom"]');
      await settle(page);
      const popup = await menuLabels(page);
      await press(page, 'Escape');
      await click(page, '.beeson-edit-bottom .percent');
      await settle(page);
      const bar = await menuLabels(page);
      await press(page, 'Escape');
      const levels = (items) => items.map((i) => i.label).filter((l) => /%$/.test(l));
      assert.deepEqual(levels(popup), levels(bar));
      assert.deepEqual(levels(bar), ['25%', '33%', '50%', '67%', '75%', '100%', '125%', '150%', '200%', '300%', '400%']);
      assert.deepEqual(popup.slice(0, 3).map((i) => i.label), ['Fit Slide', 'Actual Size', 'Zoom to Selection']);
      // Zoom to Selection is dimmed without a selection, as in the View menu
      assert.equal(popup[2].disabled, true);
      await click(page, '.beeson-edit-top [data-command="toolbar.zoom"]');
      await pick(page, 'Actual Size');
      await settle(page);
      assert.equal(await zoomOf(page), 1);
      await exec(page, 'zoom.fit');
      await show(page, STEPS);
      const fit = await zoomOf(page);
      await clickText(page, LAST);
      await press(page, 'Escape');
      await settle(page);
      await click(page, '.beeson-edit-top [data-command="toolbar.zoom"]');
      await settle(page);
      assert.equal((await menuLabels(page))[2].disabled, false);
      await pick(page, 'Zoom to Selection');
      await settle(page);
      assert.ok((await zoomOf(page)) > fit, `Zoom to Selection kept the zoom at ${fit}`);
      // Zoom In goes on from 300 percent to 400 percent, the last level
      await page.evaluate('window.BeesonEditorShell.stage.setZoom(3)');
      await exec(page, 'zoom.in');
      assert.equal(await zoomOf(page), 4);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }

  // the video of the mode of the slide, its selector, and the name of its clip
  async function videoOfSlide(page) {
    const mode = await page.evaluate(`[...document.querySelectorAll('.reveal section.present video')].find((v) => v.getClientRects().length && v.getBoundingClientRect().width).classList.contains('for-dark') ? 'dark' : 'light'`);
    return { mode, video: `.reveal section.present video.for-${mode}`, clip: `clip-${mode}` };
  }
  const clipOf = (mode) => `<video class="for-${mode}" src="demo/clip-${mode}.mp4" poster="demo/clip-${mode}.png" muted loop data-autoplay></video>`;
  const SLIDER = `${PANEL} input[name="poster-frame"]`;
  // a hash of the bytes of the poster that the page shows, read from its object URL
  const posterBytes = (page, video) => page.evaluate(`fetch(document.querySelector(${js(video)}).poster).then((r) => r.arrayBuffer()).then((b) => [...new Uint8Array(b)].reduce((h, x) => (h * 31 + x) >>> 0, b.byteLength))`);
  // a trusted click on the poster frame slider at a fraction of its length
  async function slideTo(page, fraction) {
    const r = await boxOf(page, SLIDER);
    await clickText(page, { x: r.left + 8 + (r.right - r.left - 16) * fraction, y: (r.top + r.bottom) / 2 });
  }
  const ASK = 'dialog.beeson-edit-dialog.beeson-poster-ask[open]';

  for (const platform of PLATFORMS) {
    test(`the poster frame slider captures the frame at its time as the poster (${platform})`, async (t) => {
      const page = await open(platform);
      t.after(() => page.close?.());
      await show(page, VIDEOS);
      const { mode, video, clip } = await videoOfSlide(page);
      await clickText(page, video);
      await settle(page);
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane`), 'video');
      await page.waitFor(`!document.querySelector(${js(SLIDER)}).disabled`);
      const length = await page.evaluate(`document.querySelector(${js(video)}).duration`);
      await slideTo(page, 0.5);
      await captured(page, `window.BeesonEditor.render().includes('poster="media/${clip}.png"')`);
      await settle(page);
      const time = await page.evaluate(`Number(document.querySelector(${js(SLIDER)}).value)`);
      assert.ok(Math.abs(time - length / 2) < length * 0.1, `the slider is at ${time} of ${length} s`);
      assert.match(await page.evaluate(`document.querySelector('${PANEL} .ed-frame output').textContent`), /^0:\d\d\.\d$/);
      const half = await posterBytes(page, video);
      assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Poster Frame');
      const edited = page.source.replace(clipOf(mode), clipOf(mode).replace(`poster="demo/${clip}.png"`, `poster="media/${clip}.png"`));
      assert.equal(await render(page), edited);
      // the first frame of the video is another picture
      await page.evaluate(`document.querySelector(${js(SLIDER)}).focus()`);
      await press(page, 'Home');
      await captured(page, `window.BeesonEditor.render().includes('poster="media/${clip}-2.png"')`);
      assert.notEqual(await posterBytes(page, video), half);
      await page.evaluate('window.BeesonEditor.undo()');
      await settle(page);
      // the new posters are written into media/ of the folder of the saved deck, the root of the
      // private file system of the page
      await page.evaluate('window.showDirectoryPicker = () => navigator.storage.getDirectory()');
      await roundTrip(page);
    });

    // regression test of opus 13 and qwen3 34 of the juror of round 2: in a deck opened from a file,
    // the browser keeps the frames of a video of the folder from the page, and the Video pane must
    // still offer a way to set the poster
    test(`in a deck opened from a file, the Video pane offers a way to set the poster, and the slider captures through the chosen file (${platform})`, async (t) => {
      const page = await editorPage(browser, { query: `edit&still&edit-platform=${platform}`, page: { width: 1440, height: 900 }, clear: true });
      t.after(() => page.close?.());
      assert.equal(await page.evaluate('location.protocol'), 'file:');
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await show(page, VIDEOS);
      const { mode, video, clip } = await videoOfSlide(page);
      await clickText(page, video);
      await settle(page);
      const before = (await page.evaluate('window.BeesonEditor.status()')).message;
      // the Video pane is filled after the click, and under load later than one settle
      await page.waitFor(`!!document.querySelector(${js(SLIDER)}) || !!document.querySelector('${PANEL} [data-command="media.poster"]')`);
      if (await page.evaluate(`!!document.querySelector(${js(SLIDER)})`)) {
        await page.waitFor(`!document.querySelector(${js(SLIDER)}).disabled`);
        await slideTo(page, 0.5);
      } else await click(page, `${PANEL} [data-command="media.poster"]`);
      await page.waitFor(`!!document.querySelector(${js(ASK)}) || window.BeesonEditor.status().message !== ${js(before)}`, 8000);
      const asked = await page.evaluate(`document.querySelector(${js(ASK)})?.textContent ?? null`);
      assert.ok(asked, `the pane did not offer a way to set the poster: ${(await page.evaluate('window.BeesonEditor.status()')).message}`);
      assert.ok(asked.includes(`${clip}.mp4`), asked);
      await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
      await clickText(page, `${ASK} button.primary`);
      await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
      const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
      await page.send('DOM.setFileInputFiles', { files: [resolve(`demo/${clip}.mp4`)], objectId: result.objectId });
      await captured(page, `window.BeesonEditor.render().includes('poster="media/${clip}.png"')`);
      if (!(await page.evaluate(`!!document.querySelector(${js(SLIDER)})`))) return;
      // a second move of the slider reads the chosen file again without asking
      const half = await posterBytes(page, video);
      await page.evaluate(`document.querySelector(${js(SLIDER)}).focus()`);
      await press(page, 'Home');
      await captured(page, `window.BeesonEditor.render().includes('poster="media/${clip}-2.png"')`);
      assert.equal(await page.evaluate(`!!document.querySelector(${js(ASK)})`), false);
      assert.notEqual(await posterBytes(page, video), half);
      const edited = page.source.replace(clipOf(mode), clipOf(mode).replace(`poster="demo/${clip}.png"`, `poster="media/${clip}-2.png"`));
      assert.equal(await render(page), edited);
      assert.deepEqual(errors(page), []);
    });
  }

  // the text of the cells of the table of the current slide, row by row
  const cells = (page) => page.evaluate(`[...document.querySelector('.reveal section.present table').rows].map((tr) => [...tr.cells].map((c) => c.textContent))`);
  const cellAt = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;

  for (const platform of PLATFORMS) {
    test(`the Insert Table grid has 10 columns by 8 rows, and Insert Table… inserts a larger table (${platform})`, async (t) => {
      const page = await open(platform);
      t.after(() => page.close?.());
      await show(page, EQUATIONS);
      await click(page, '.beeson-edit-top [data-command="insert.table"]');
      await page.waitFor(`!!document.querySelector('dialog.beeson-table-picker[open]')`);
      assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-table-picker .grid > div').length`), 80);
      const { x, y } = middle(await boxOf(page, '.beeson-table-picker .grid > :last-child'));
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      assert.equal(await page.evaluate(`document.querySelector('.beeson-table-picker .size').textContent`), '10 × 8 Table');
      await clickText(page, '.beeson-table-picker .more');
      await page.waitFor(`!!document.querySelector('dialog.beeson-table-size[open]')`);
      assert.equal(await page.evaluate('document.activeElement.name'), 'columns');
      await type(page, '12');
      await press(page, 'Tab');
      await type(page, '9');
      await press(page, 'Enter');
      await page.waitFor(`!!document.querySelector('.reveal section.present table')`);
      await settle(page);
      const shape = await cells(page);
      assert.equal(shape.length, 9);
      assert.ok(shape.every((r) => r.length === 12), js(shape.map((r) => r.length)));
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present table tr:first-child th').length`), 12);
      assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Insert Table');
      await roundTrip(page);
    });

    test(`a drag of the fill handle of a range of cells goes on with its numbers and copies its words (${platform})`, async (t) => {
      const page = await open(platform);
      t.after(() => page.close?.());
      await show(page, EQUATIONS);
      await exec(page, 'insert.table', { rows: 5, columns: 3 });
      await settle(page);
      for (const [r, c, text] of [[1, 0, '1'], [2, 0, '2'], [1, 1, 'Step 1'], [2, 1, 'Step 2'], [1, 2, 'orbit'], [2, 2, 'tube']]) {
        await clickText(page, cellAt(r, c));
        await type(page, text);
      }
      await settle(page);
      const typed = await render(page);
      // the range of rows 2 and 3, by a drag across its cells
      const from = middle(await boxOf(page, cellAt(1, 0)));
      const to = middle(await boxOf(page, cellAt(2, 2)));
      await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
      await settle(page);
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-table-bars .bar > .on')].map((d) => d.textContent)`), ['A', 'B', 'C', '2', '3']);
      const handle = await boxOf(page, '.beeson-table-bars .fill');
      assert.ok(handle, 'the range does not have a fill handle');
      const range = await boxOf(page, '.beeson-table-bars .cell');
      assert.ok(Math.abs(middle(handle).x - range.right) < 4 && Math.abs(middle(handle).y - range.bottom) < 4, 'the fill handle is not at the lower right corner of the range');
      const end = middle(await boxOf(page, cellAt(4, 2)));
      await drag(page, middle(handle), { dy: end.y - middle(handle).y, steps: 12, hold: true });
      assert.ok(await boxOf(page, '.beeson-table-bars .spread'), 'the cells that the drag reaches are not marked');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: middle(handle).x, y: end.y, button: 'left', clickCount: 1 });
      await page.waitFor(`window.BeesonEditor.state('edit.undo').label === 'Undo Autofill'`);
      await settle(page);
      assert.deepEqual((await cells(page)).slice(1), [['1', 'Step 1', 'orbit'], ['2', 'Step 2', 'tube'], ['3', 'Step 3', 'orbit'], ['4', 'Step 4', 'tube']]);
      // the range is the source with the cells filled from it
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-table-bars .bar.rows > .on')].map((d) => d.textContent)`), ['2', '3', '4', '5']);
      const filled = await render(page);
      assert.match(filled, /<tr><td>3<\/td><td>Step 3<\/td><td>orbit<\/td><\/tr>/);
      assert.deepEqual(textProblems(filled, THEME).filter((p) => !textProblems(typed, THEME).includes(p)), []);
      await page.evaluate('window.BeesonEditor.undo()');
      assert.equal(await render(page), typed);
      await page.evaluate('window.BeesonEditor.redo()');
      assert.equal(await render(page), filled);
      const { text } = await saveAndReopen(page, `r6-3-${++saves}.html`);
      assert.equal(text, filled);
      assert.deepEqual(errors(page), []);
    });
  }
});
