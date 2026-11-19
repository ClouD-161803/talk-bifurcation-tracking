// a picture with its caption as one object: the first click selects the figure, a second click the
// picture, the caption moves with the picture, and each command acts on the figure or on the
// picture alone

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { tokenize } from '../src/editor/tokens.ts';
import { byteExact, click, clickText, drag, press, saveAndReopen, selectPicture, type } from './helpers/editor.mjs';

// regression tests of R8.1 on both platforms, in both modes, on a figure with an image of each mode
// and on a figure with one image, with trusted input. a picture with its caption is one object, as
// in Keynote. the first click on the picture selects the figure with one frame, a click on the
// caption puts the caret in it, a second click on the picture selects the picture alone, and Esc
// then selects the figure again. the moves, the resizes, the order, the groups, the locks, and the
// clipboard act on the figure from the figure and from its picture, and write the same text. the
// rotation, the flips, the mask, Replace, and the Image pane act on the picture alone, and on both
// images of a pair where an image of each mode shares the place. after each command the text is
// checked, then byte for byte after an undo, the edit again after a redo, and in the scope rule,
// and each test ends with a save and an open of the saved text
describe('the first click selects the figure', () => {
  const PLATFORMS = ['mac', 'other'];
  const MODES = ['dark', 'light'];
  const DECK = 'test/pages/editor-figure.html';
  // the slide of the figure with an image of each mode, and of the figure with one image
  const FIGURES = [{ n: 0, name: 'a pair' }, { n: 1, name: 'one image' }];
  const IMG = '.reveal section.present figure.figure-box > img';
  const CAPTION = '.reveal section.present figure.figure-box > figcaption';
  const OVER = '.reveal section.present > p:nth-of-type(2)';
  const PANEL = '#beeson-edit-panel-format';
  const BAR = 'dialog.beeson-mask-bar';
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const SOURCE = readFileSync(DECK, 'utf8');

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
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const near = (a, b, by = 1.5) => Math.abs(a - b) <= by;
  let saves = 0;

  // the selected elements, each named by its tag and its classes of the deck, apart from those that
  // the Image pane writes
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => [el.localName, ...el.classList].filter((c) => !c.startsWith('beeson-') && !['visible', 'current-fragment', 'white-figure', 'invert'].includes(c)).join('.'))`);
  const rectOf = (page, selector) => page.evaluate(`(() => {
  const r = [...document.querySelectorAll(${js(selector)})].map((e) => e.getBoundingClientRect()).find((r) => r.width);
  return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
})()`);
  // the picture of the shown image, i.e. the image fitted into its box with object-fit contain, the
  // place of the caption from its lower left corner and from the lower left corner of the box of the
  // image (bx, by), in screen px, and the scale k of the slide
  const pictureOf = (page) => page.evaluate(`(() => {
  const img = [...document.querySelectorAll(${js(IMG)})].find((e) => e.getBoundingClientRect().width);
  const r = img.getBoundingClientRect();
  const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  const left = r.left + (r.width - w) / 2, top = r.top + (r.height - h) / 2;
  const c = document.querySelector(${js(CAPTION)}).getBoundingClientRect();
  const s = document.querySelector('.reveal .slides');
  return { left, top, right: left + w, bottom: top + h, x: left + w / 2, y: top + h / 2, dx: c.left - left, dy: c.top - top - h, bx: c.left - r.left, by: c.top - r.bottom, k: s.getBoundingClientRect().width / s.offsetWidth };
})()`);
  // the caption of a picture with a width under it, at the gap of 16 slide px of the theme
  const underPicture = (now) => near(now.dx, 0) && near(now.dy, 16 * now.k);
  // the caption of a picture whose box keeps its letterbox under the box, at the same gap
  const underBox = (now) => near(now.bx, 0) && near(now.by, 16 * now.k);
  const shownFrames = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-frame.selected, .beeson-frame.union')].filter((f) => !f.hidden && f.getBoundingClientRect().width).map((f) => { const r = f.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })`);
  const shownGrips = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-grip')].filter((g) => !g.hidden && g.getBoundingClientRect().width).length`);
  const tabs = (page) => page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].map((b) => b.textContent)`);
  const showTab = async (page, name) => {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === ${js(name)})?.click()`);
    await frames(page);
  };
  const gripAt = (page, handle) => rectOf(page, `.beeson-grip[data-handle="${handle}"]:not([hidden])`);

  // the start tags of a text, each named by its tag and the count of the tags of its name before it,
  // e.g. figure#1 for the figure of the second slide
  function startTags(html) {
    const seen = {};
    return tokenize(html).filter((t) => t.type === 'start').map((t) => {
      seen[t.name] = (seen[t.name] ?? -1) + 1;
      return { id: `${t.name}#${seen[t.name]}`, text: html.slice(t.start, t.end), start: t.start, end: t.end };
    });
  }

  // the start tags that differ from before to after, by their names, asserting that nothing else of
  // the text differs
  function changedTags(before, after) {
    const a = startTags(before), b = startTags(after);
    assert.equal(b.length, a.length, 'the edit adds or removes an element');
    const out = {};
    let rebuilt = '', at = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i].text === b[i].text) continue;
      out[a[i].id] = b[i].text;
      rebuilt += before.slice(at, a[i].start) + b[i].text;
      at = a[i].end;
    }
    assert.equal(rebuilt + before.slice(at), after, 'the edit changes more than start tags');
    return out;
  }

  // the text of slide n
  function slideOf(text, n) {
    const at = [...text.matchAll(/<section>/g)][n].index;
    return text.slice(at, text.indexOf('</section>', at));
  }

  // the elements of slide n of a text in their order, by the words that name them
  function orderOf(text, n) {
    const slide = slideOf(text, n);
    const marks = { h2: '<h2>', under: 'drawn under the figure', figure: '<figure', over: 'drawn over the figure' };
    return Object.keys(marks).sort((x, y) => slide.indexOf(marks[x]) - slide.indexOf(marks[y]));
  }

  // the text of the figure of slide n, with the white space before it
  function figureText(text, n) {
    const at = text.indexOf('<figure', [...text.matchAll(/<section>/g)][n].index);
    const end = text.indexOf('</figure>', at) + '</figure>'.length;
    let start = at;
    while (/\s/.test(text[start - 1])) start--;
    return { start, at, end };
  }

  // the parts of the figure of slide n of the test page: its tag, the tags of its images with the
  // shown one first, the tag of its caption, the tags of the paragraphs under it and over it, and the
  // name of its shown picture in the selection
  function partsOf(mode, n) {
    const imgs = n === 0 ? (mode === 'dark' ? ['img#0', 'img#1'] : ['img#1', 'img#0']) : ['img#2'];
    return { fig: `figure#${n}`, imgs, cap: `figcaption#${n}`, over: `p#${2 * n + 1}`, pic: n === 0 ? `img.for-${mode}` : 'img' };
  }

  // the editor on slide n of the test page in a mode, in a window of 1600 by 1000 px, with the Format
  // tab shown
  async function load(t, platform, mode, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    if ((await page.evaluate('Beeson.theme.get()')) !== mode) await page.evaluate('Beeson.theme.toggle()');
    page.source = SOURCE;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    page.parts = partsOf(mode, n);
    return page;
  }

  // nothing selected, with the focus off the chrome
  async function deselect(page) {
    await page.evaluate('document.activeElement instanceof HTMLElement && document.activeElement.blur()');
    for (let i = 0; i < 3 && (await selected(page)).length; i++) await exec(page, 'selection.clear');
    assert.deepEqual(await selected(page), []);
  }

  // the figure selected by clicks on its picture, or its picture by one click more. a figure in a
  // group takes two clicks, the first of which selects the group
  async function pick(page, from, first = 1) {
    await deselect(page);
    for (let i = 0; i < first + (from === 'picture' ? 1 : 0); i++) {
      await clickText(page, IMG);
      await frames(page);
    }
    assert.deepEqual(await selected(page), [from === 'figure' ? 'figure.figure-box' : page.parts.pic], `the ${from} is not selected by its clicks`);
  }

  // the text after an edit is in the scope rule wherever the text before it is
  function inScope(edited, source) {
    const now = textProblems(edited, THEME);
    for (const p of textProblems(source, THEME)) {
      const i = now.indexOf(p);
      if (i >= 0) now.splice(i, 1);
    }
    assert.deepEqual(now, [], 'the edit writes outside the scope rule');
  }

  // the edit, the file byte for byte after an undo, the edit again after a redo, and the file again
  // after a second undo, from which the next command starts
  async function roundTrip(page, edited) {
    assert.notEqual(edited, page.source, 'the command does not change the file');
    inScope(edited, page.source);
    await undo(page);
    await frames(page);
    await byteExact(page);
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited, 'a redo does not write the edit again');
    await undo(page);
    await frames(page);
    await byteExact(page);
  }

  // act run from each of froms, the figure and its picture by default, which must write the same
  // text up to same, accepted by expect. an act that returns false changes the selection on purpose
  async function check(page, what, act, expect, { froms = ['figure', 'picture'], first = 1, same = (text) => text } = {}) {
    let text = null;
    for (const from of froms) {
      await pick(page, from, first);
      const was = await selected(page);
      const kept = await act(from);
      await frames(page);
      const edited = await render(page);
      if (text === null) {
        expect(edited);
        text = edited;
      } else assert.equal(same(edited), same(text), `${what} from the picture does not write what it writes from the figure`);
      if (kept !== false) assert.deepEqual(await selected(page), was, `${what} from the ${from} changes the selection`);
      await roundTrip(page, edited);
    }
    return text;
  }

  // a save of the text after a redo of the last edit, and an open of the saved text, which is then
  // the text that the next command starts from
  async function saved(page, edited, media = null) {
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = media ? await savedInto(page, media) : await saveAndReopen(page, `r8-1-${++saves}.html`);
    assert.equal(text, edited);
    inScope(text, SOURCE);
    assert.deepEqual(errors(page), []);
    page.source = text;
  }

  // a save of a deck with new media files into a folder of the private file system, which is given
  // as the folder of the deck, and an open of the saved text. the names in media/ are asserted
  async function savedInto(page, media) {
    const { text, names } = await page.evaluate(`(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('r8-1-${++saves}', { create: true });
    const deck = await dir.getFileHandle('deck.html', { create: true });
    window.showDirectoryPicker = async () => dir;
    window.BeesonEditor.attach(deck);
    await window.BeesonEditor.save();
    const names = [];
    for await (const [name] of (await dir.getDirectoryHandle('media')).entries()) names.push(name);
    return { text: await (await deck.getFile()).text(), names: names.sort() };
  })()`);
    assert.deepEqual(names, media, 'the new media files are not written into media/');
    const status = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(status.problems, []);
    assert.equal(await render(page), text);
    return { text };
  }

  // a value typed into a number field of the Arrange pane, committed with Enter
  async function typeField(page, id, value) {
    await showTab(page, 'Arrange');
    const input = `#beeson-edit-num-${id}`;
    assert.equal(await page.evaluate(`!!document.querySelector('${input}') && !document.querySelector('${input}').disabled`), true, `the field ${id} is not enabled`);
    await page.evaluate(`(() => { const i = document.querySelector('${input}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
    await frames(page);
  }
  async function fieldValue(page, id) {
    await showTab(page, 'Arrange');
    return Number(await page.evaluate(`document.querySelector('#beeson-edit-num-${id}')?.value`));
  }

  // a trusted drag of the file at path from the Finder, dropped at the point at
  async function dropFile(page, at, path) {
    const data = { items: [], files: [path], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await page.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
  }

  // the keys of the commands, and the modifier that turns the snapping of a resize off
  const KEYS = {
    mac: { front: 'Mod+Shift+F', forward: 'Mod+Alt+Shift+F', backward: 'Mod+Alt+Shift+B', back: 'Mod+Shift+B', group: 'Mod+Alt+G', ungroup: 'Mod+Alt+Shift+G', lock: 'Mod+L', unlock: 'Mod+Alt+L', remove: 'Backspace', duplicate: 'Mod+D', free: 'Meta' },
    other: { front: 'Mod+Shift+ArrowUp', forward: 'Mod+ArrowUp', backward: 'Mod+ArrowDown', back: 'Mod+Shift+ArrowDown', group: 'Mod+G', ungroup: 'Mod+Shift+G', lock: 'Mod+L', unlock: 'Mod+Shift+L', remove: 'Delete', duplicate: 'Mod+D', free: 'Alt' },
  };

  const COMBOS = PLATFORMS.flatMap((platform) => MODES.flatMap((mode) => FIGURES.map((f) => ({ platform, mode, ...f }))));
  const named = ({ platform, mode, name }) => `${name}, ${mode} mode, ${platform}`;

  for (const combo of COMBOS) {
    const { platform, mode, n } = combo;
    const keys = KEYS[platform];

    // the first click selected the picture without its caption, which a drag then tore off it
    test(`the first click on the picture selects the figure with one frame, a second click the picture, and Esc the figure (${named(combo)})`, async (t) => {
      const page = await load(t, platform, mode, n);
      await clickText(page, IMG);
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box'], 'the first click on the picture does not select its figure');
      const shown = await shownFrames(page);
      assert.equal(shown.length, 1, `the figure is drawn with ${shown.length} frames`);
      const pic = await pictureOf(page);
      const cap = await rectOf(page, CAPTION);
      const holds = (f, b) => f.left <= b.left + 1 && f.top <= b.top + 1 && f.right >= b.right - 1 && f.bottom >= b.bottom - 1;
      assert.ok(holds(shown[0], pic) && holds(shown[0], cap), `the frame ${js(shown[0])} does not hold the picture ${js(pic)} and the caption ${js(cap)}`);
      assert.equal(await shownGrips(page), 8, 'the figure is not drawn with one set of grips');
      // the Image pane with its tabs, as the Format sidebar of an image with a caption in Keynote
      const figureTabs = await tabs(page);
      assert.ok(figureTabs.includes('Image') && figureTabs.includes('Arrange'), `the tabs of the figure are ${js(figureTabs)}`);
      await clickText(page, IMG);
      await frames(page);
      assert.deepEqual(await selected(page), [page.parts.pic], 'a second click on the picture does not select it alone');
      assert.ok((await tabs(page)).includes('Image'), 'the picture does not have the Image pane');
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box'], 'Esc on the picture does not select its figure');
      await press(page, 'Escape');
      assert.deepEqual(await selected(page), []);
      // a click on the caption puts the caret in it, also with the picture selected, and Esc then
      // selects the figure
      await clickText(page, CAPTION);
      await frames(page);
      assert.equal(await page.evaluate(`!!document.activeElement?.matches('figcaption')`), true, 'a click on the caption does not put the caret in it');
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box'], 'Esc in the caption does not select its figure');
      await clickText(page, IMG);
      await clickText(page, CAPTION);
      await frames(page);
      assert.equal(await page.evaluate(`!!document.activeElement?.matches('figcaption')`), true, 'a click on the caption of a selected picture does not put the caret in it');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`a drag, the arrow keys, and the X and Y fields move the figure from the figure and from its picture (${named(combo)})`, async (t) => {
      const page = await load(t, platform, mode, n);
      const { fig } = page.parts;
      const moved = (re) => (edited) => {
        const c = changedTags(page.source, edited);
        assert.deepEqual(Object.keys(c), [fig], `the move changes ${js(c)}`);
        assert.match(c[fig], re);
      };
      // the caption stays under the picture while the figure is dragged
      await check(page, 'a drag', async () => {
        const rest = await pictureOf(page);
        await drag(page, rest, { dx: -70, dy: 40 });
        await frames(page);
        const now = await pictureOf(page);
        assert.ok(now.left < rest.left - 40, 'the picture is not moved by the drag');
        assert.ok(near(now.dx, rest.dx) && near(now.dy, rest.dy), `the caption is at ${js([now.dx, now.dy])} from the picture, not at ${js([rest.dx, rest.dy])}`);
      }, moved(/^<figure class="figure-box" style="translate: -\d+px \d+px">$/));
      await check(page, 'a nudge', () => press(page, 'ArrowRight'), moved(/^<figure class="figure-box" style="translate: 1px 0px">$/));
      await check(page, 'a nudge by 10', () => press(page, 'Shift+ArrowDown'), moved(/^<figure class="figure-box" style="translate: 0px 10px">$/));
      await check(page, 'a typed X', async () => typeField(page, 'x', (await fieldValue(page, 'x')) + 50), moved(/^<figure class="figure-box" style="translate: 50px 0px">$/));
      const last = await check(page, 'a typed Y', async () => typeField(page, 'y', (await fieldValue(page, 'y')) - 30), moved(/^<figure class="figure-box" style="translate: 0px -30px">$/));
      await saved(page, last);
    });

    test(`a grip and the W and H fields resize the figure from the figure and from its picture, with the caption kept under the picture (${named(combo)})`, async (t) => {
      const page = await load(t, platform, mode, n);
      const { fig, imgs, cap } = page.parts;
      const sized = (width) => (edited) => {
        const c = changedTags(page.source, edited);
        assert.ok(Object.keys(c).every((id) => [fig, cap, ...imgs].includes(id)), `the resize changes ${js(c)}`);
        const widths = imgs.map((id) => c[id]?.match(/ style="(?:object-fit: contain; )?width: (\d+)px/)?.[1]);
        assert.ok(widths.every((w) => w && w === widths[0]), `the images are given the widths ${js(widths)}`);
        if (width) assert.equal(Number(widths[0]), width);
      };
      // the corner across from the grip is kept, and the caption is under the picture. the frame of
      // the figure holds the caption, hence the same drag gives a picture of another width from the
      // figure than from the picture
      await check(page, 'a drag of a grip', async () => {
        const rest = await pictureOf(page);
        await drag(page, await gripAt(page, 'se'), { dx: -90, dy: -90, modifiers: keys.free });
        await frames(page);
        const now = await pictureOf(page);
        assert.ok(now.right < rest.right - 40, 'the picture is not made smaller by its grip');
        assert.ok(near(now.left, rest.left) && near(now.top, rest.top), `the corner across from the grip moves from ${js(rest)} to ${js(now)}`);
        assert.ok(underPicture(now), `the caption is at ${js([now.dx, now.dy])} from the picture, not under it`);
      }, sized(), { same: (text) => text.replace(/width: \d+px/g, 'width: Npx') });
      // H of the figure gives its picture with its caption, and H of the picture the picture alone
      const tall = {};
      const typed = await check(page, 'a typed W', async (from) => {
        await typeField(page, 'width', 300);
        assert.ok(underBox(await pictureOf(page)), 'the caption is not kept under the box of the picture');
        tall[from] = await fieldValue(page, 'height');
      }, sized(300));
      assert.equal(tall.picture, 360);
      assert.ok(tall.figure > 360, `H of the figure is ${tall.figure}, without its caption`);
      // the picture of 1200 by 1440 px is 300 px wide at a height of 360 px
      const last = await check(page, 'a typed H', (from) => typeField(page, 'height', tall[from]), (edited) => assert.equal(edited, typed, 'a typed H does not write the width at the aspect of the picture'));
      await saved(page, last);
    });

    test(`the four order commands move the figure from the figure and from its picture (${named(combo)})`, async (t) => {
      const page = await load(t, platform, mode, n);
      assert.deepEqual(orderOf(page.source, n), ['h2', 'under', 'figure', 'over']);
      // each paragraph is a layer of its own, and Send to Back also passes the heading in the flow, by a
      // z-index under 0 in place of a move in the file
      const up = ['h2', 'under', 'over', 'figure'], down = ['h2', 'figure', 'under', 'over'], file = orderOf(page.source, n);
      let last = null;
      for (const [order, want] of [['front', up], ['forward', up], ['backward', down], ['back', file]]) {
        last = await check(page, order, () => press(page, keys[order]), (edited) => {
          assert.deepEqual(orderOf(edited, n), want, `${order} puts the figure at ${js(orderOf(edited, n))}`);
          if (order === 'back') assert.deepEqual(changedTags(page.source, edited), { [page.parts.fig]: '<figure class="figure-box" style="z-index: -1">' });
        });
      }
      await saved(page, last);
    });

    test(`Group, Ungroup, Lock, and Unlock act on the figure from the figure and from its picture (${named(combo)})`, async (t) => {
      const page = await load(t, platform, mode, n);
      const { fig, over } = page.parts;
      // a lock from the picture keeps the picture selected, and Unlock then takes it off the figure
      for (const from of ['figure', 'picture']) {
        await pick(page, from);
        const was = await selected(page);
        await press(page, keys.lock);
        await frames(page);
        const locked = await render(page);
        assert.deepEqual(changedTags(page.source, locked), { [fig]: '<figure class="figure-box" data-locked>' }, `Lock from the ${from} does not lock the figure`);
        assert.deepEqual(await selected(page), was);
        inScope(locked, page.source);
        await drag(page, await pictureOf(page), { dx: 60, dy: 30 });
        await press(page, 'ArrowLeft');
        await frames(page);
        assert.equal(await render(page), locked, `the figure locked from the ${from} is moved`);
        assert.equal((await state(page, 'arrange.order.back')).enabled, false, `the figure locked from the ${from} is ordered`);
        await press(page, keys.unlock);
        await frames(page);
        await byteExact(page);
        await undo(page);
        assert.equal(await render(page), locked, 'an undo of Unlock does not lock the figure again');
        await redo(page);
        await byteExact(page);
        await undo(page);
        await undo(page);
        await byteExact(page);
        await redo(page);
        assert.equal(await render(page), locked, 'a redo of Lock does not lock the figure again');
        await undo(page);
      }
      const grouped = await check(page, 'Group', async () => {
        await click(page, OVER, { modifiers: 'Shift' });
        await press(page, keys.group);
        await frames(page);
        assert.deepEqual(await selected(page), ['figure.figure-box', 'p'], 'Group does not select the figure and the paragraph');
        return false;
      }, (edited) => assert.deepEqual(changedTags(page.source, edited), { [fig]: '<figure class="figure-box" data-group="g1">', [over]: '<p style="translate: 0px 80px" data-group="g1">' }));
      await saved(page, grouped);
      // a figure in a group is selected by itself at the second click, and its picture at the third
      const last = await check(page, 'Ungroup', async () => {
        await press(page, keys.ungroup);
        await frames(page);
        assert.deepEqual(await selected(page), ['figure.figure-box', 'p'], 'Ungroup does not select the figure and the paragraph');
        return false;
      }, (edited) => assert.equal(edited, SOURCE), { first: 2 });
      await saved(page, last);
    });

    test(`Cut, Copy and Paste, Duplicate, and Delete act on the figure from the figure and from its picture (${named(combo)})`, async (t) => {
      const page = await load(t, platform, mode, n);
      const f = figureText(page.source, n);
      const without = page.source.slice(0, f.start) + page.source.slice(f.end);
      await check(page, 'Delete', async () => {
        await press(page, keys.remove);
        assert.deepEqual(await selected(page), []);
        return false;
      }, (edited) => assert.equal(edited, without, 'Delete does not remove the figure with its images and caption'));
      await check(page, 'Cut', async () => {
        await exec(page, 'edit.cut');
        assert.deepEqual(await selected(page), []);
        return false;
      }, (edited) => assert.equal(edited, without, 'Cut does not remove the figure with its images and caption'));
      // a copy that would cover its figure is put 20 px right and down of it
      const copied = (edited) => {
        const slide = slideOf(edited, n);
        const copies = slide.match(/<figure[^>]*>[\s\S]*?<\/figure>/g) ?? [];
        assert.equal(copies.length, 2, `the slide holds ${copies.length} figures`);
        const original = page.source.slice(f.at, f.end);
        assert.equal(copies[0], original);
        assert.equal(copies[1], original.replace('<figure class="figure-box">', '<figure class="figure-box" style="translate: 20px 20px">'));
      };
      const pasted = await check(page, 'Copy and Paste', async () => {
        await exec(page, 'edit.copy');
        await exec(page, 'edit.paste');
        assert.deepEqual(await selected(page), ['figure.figure-box'], 'the copy is not selected');
        return false;
      }, copied);
      const last = await check(page, 'Duplicate', async () => {
        await press(page, keys.duplicate);
        await frames(page);
        assert.deepEqual(await selected(page), ['figure.figure-box'], 'the copy is not selected');
        return false;
      }, (edited) => {
        copied(edited);
        assert.equal(edited, pasted, 'Duplicate does not write what Copy and Paste write');
      });
      await saved(page, last);
    });

    // Duplicate and Copy of the picture of a pair, selected by itself, copied only the image shown,
    // without its image of the other mode
    if (n === 0) test(`Duplicate and Copy and Paste of the picture of a pair, selected by itself, copy both images of the pair (${named(combo)})`, async (t) => {
      const page = await load(t, platform, mode, n);
      const count = (text) => ['for-dark', 'for-light'].map((m) => slideOf(text, n).split(`<img class="${m}"`).length - 1);
      for (const act of ['Duplicate', 'Copy and Paste']) {
        await deselect(page);
        // the picture alone, by a second click on it
        for (let i = 0; i < 2; i++) {
          await clickText(page, IMG);
          await frames(page);
        }
        assert.deepEqual(await selected(page), [page.parts.pic], 'the picture is not selected by itself');
        if (act === 'Duplicate') await press(page, keys.duplicate);
        else {
          await exec(page, 'edit.copy');
          await exec(page, 'edit.paste');
        }
        await frames(page);
        const edited = await render(page);
        assert.deepEqual(count(edited), [2, 2], `${act} of the picture writes ${js(count(edited))} images of each mode, not both images of the pair twice`);
        await roundTrip(page, edited);
      }
    });

    // Replace with a file of the other kind put an element with the mode of the picture alone in its
    // place, without the group and the lock of the picture
    test(`Replace with a video keeps the group and the lock of the picture (${named(combo)})`, async (t) => {
      const marked = (attrs, over) => {
        const at = [...SOURCE.matchAll(/<section>/g)][n].index;
        const end = SOURCE.indexOf('</section>', at);
        const slide = SOURCE.slice(at, end).replace(/(<img [^>]*)>/g, `$1${attrs}>`).replace('<p style="translate: 0px 80px">', `<p style="translate: 0px 80px"${over}>`);
        return SOURCE.slice(0, at) + slide + SOURCE.slice(end);
      };
      // the video put in the place of the shown image of the text, which keeps its mode, group, and lock
      const replacedIn = (text, attrs) => {
        const tags = slideOf(text, n).match(/<img [^>]*>/g);
        const shown = tags.find((tag) => n === 1 || tag.includes(`for-${mode}`));
        const cls = n === 0 ? ` class="for-${mode}"` : '';
        return text.replace(shown, `<video${cls} src="media/clip-dark.mp4" poster="media/clip-dark.png" muted loop data-autoplay${attrs}></video>`);
      };
      const opened = async (text) => {
        const page = await load(t, platform, mode, n);
        const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
        assert.deepEqual(s.problems, []);
        page.source = text;
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        return page;
      };
      // a group, through Replace of the Image pane given a video file
      let page = await opened(marked(' data-group="g1"', ' data-group="g1"'));
      await pick(page, 'figure');
      await page.evaluate(`(async () => {
      const bytes = await (await fetch('/demo/clip-dark.mp4')).arrayBuffer();
      await window.BeesonEditor.exec('media.replace', { files: [new File([bytes], 'clip-dark.mp4', { type: 'video/mp4' })] });
    })()`);
      await frames(page);
      let edited = await render(page);
      assert.equal(edited, replacedIn(page.source, ' data-group="g1"'), 'the video of Replace does not keep the group of the image');
      await roundTrip(page, edited);
      await saved(page, edited, ['clip-dark.mp4', 'clip-dark.png']);
      // a group and a lock, through a drop of a video file onto the picture, which the lock does not
      // turn off
      page = await opened(marked(' data-group="g1" data-locked', ' data-group="g1"'));
      await dropFile(page, await pictureOf(page), resolve('demo/clip-dark.mp4'));
      await page.waitFor(`window.BeesonEditor.render().includes('media/clip-dark.mp4')`);
      await frames(page);
      edited = await render(page);
      assert.equal(edited, replacedIn(page.source, ' data-group="g1" data-locked'), 'the video of a drop does not keep the group and the lock of the image');
      await roundTrip(page, edited);
      await saved(page, edited, ['clip-dark.mp4', 'clip-dark.png']);
    });

    test(`the rotation, the flips, Edit Mask, Replace, and the Image pane act on the picture alone, and on both images of a pair (${named(combo)})`, async (t) => {
      const page = await load(t, platform, mode, n);
      const { imgs } = page.parts;
      // each image of the figure is given the same declarations, and nothing else is changed
      const styled = (re) => (edited) => {
        const c = changedTags(page.source, edited);
        assert.deepEqual(Object.keys(c).sort(), [...imgs].sort(), `the edit changes ${js(c)}`);
        const styles = imgs.map((id) => c[id].match(/ style="([^"]*)"/)?.[1]);
        assert.match(styles[0] ?? '', re);
        assert.ok(styles.every((s) => s === styles[0]), `the images of the pair are given the styles ${js(styles)}`);
      };
      const picture = { froms: ['picture'] };
      await check(page, 'a turn by the rotate handle', async () => {
        const rest = await rectOf(page, CAPTION);
        await drag(page, await rectOf(page, '.beeson-rotor:not([hidden])'), { dx: 160, dy: 0 });
        await frames(page);
        const now = await rectOf(page, CAPTION);
        assert.ok(near(now.left, rest.left) && near(now.top, rest.top), 'the caption is moved by a turn of the picture');
      }, styled(/^rotate: \d+deg$/), picture);
      await check(page, 'a typed angle', () => typeField(page, 'angle', 30), styled(/^rotate: 30deg$/), picture);
      await check(page, 'Flip Horizontal', () => exec(page, 'arrange.flipHorizontal'), styled(/^scale: -1 1$/));
      await check(page, 'Flip Vertical', () => exec(page, 'arrange.flipVertical'), styled(/^scale: 1 -1$/));
      await check(page, 'Edit Mask', async () => {
        await exec(page, 'image.editMask');
        await page.waitFor(`!!document.querySelector('${BAR}[open]')`);
        await clickText(page, `${BAR} button[title="Edit Mask"]`);
        await drag(page, await rectOf(page, '.beeson-mask-window i[data-handle=se]'), { dx: -120, dy: -120 });
        await press(page, 'Enter');
        await frames(page);
        assert.equal(await page.evaluate(`!!document.querySelector('${BAR}[open]')`), false, 'Enter does not close Edit Mask');
      }, styled(/clip-path: inset\(/), picture);
      // Replace, White Figure, and the alt text are written on the shown image alone, whose file they name
      const shownOnly = (re) => (edited) => {
        const c = changedTags(page.source, edited);
        assert.deepEqual(Object.keys(c), [imgs[0]], `the edit changes ${js(c)}`);
        assert.match(c[imgs[0]], re);
      };
      await check(page, 'Replace Image', () => page.evaluate(`(async () => {
      const bytes = await (await fetch('/demo/figure-dark.png')).arrayBuffer();
      await window.BeesonEditor.exec('media.replace', { files: [new File([bytes], 'replaced.png', { type: 'image/png' })] });
    })()`), shownOnly(/ src="media\/replaced[^"]*\.png"/), {
        // the second file of the same name is written under a name of its own, e.g. replaced-2.png
        same: (text) => text.replace(/media\/replaced(-\d+)?\.png/g, 'media/replaced.png'),
      });
      await check(page, 'White Figure', async () => {
        assert.ok((await tabs(page)).includes('Image'), 'the Image pane is not shown');
        await exec(page, 'figure.whiteFigure');
      }, shownOnly(/class="[^"]*\bwhite-figure\b/));
      const last = await check(page, 'an alt text', () => exec(page, 'figure.alt', { value: 'A new alt text' }), shownOnly(/ alt="A new alt text"/));
      await saved(page, last);
    });
  }
});

// regression tests of R7.9 on both platforms with trusted input, for the places where round 3 of
// the council was worse than round 2. the caption of a figure is moved with its image and kept
// under it at a move or a resize of the image alone, and not at a rotation of the image. the four
// order commands act on the figure of a selected image. Esc on a selected image selects its
// figure, also with the focus on a button of the inspector, and the inspector then shows the pane
// of the figure. the formula sheets are kept beside their target inside the canvas, and a table
// is not rotated. after each edit the text is checked byte for byte, after an undo and a redo, and
// after a save and an open
describe('the caption moved with its image', () => {
  const PLATFORMS = ['mac', 'other'];
  const TABLES = 'test/pages/editor-tables.html';
  // the slides of the demo deck with the display formula and with the figure and its caption
  const EQUATIONS = 3;
  const FIGURE = 4;
  const IMG = '.reveal section.present figure.figure-box > img';
  const CAPTION = '.reveal section.present figure.figure-box > figcaption';
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
  const inside = (a, b) => a.left >= b.left && a.top >= b.top && a.right <= b.right && a.bottom <= b.bottom;
  let saves = 0;

  // the selected elements, each named by its tag and its classes of the deck
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => [el.localName, ...el.classList].filter((c) => !c.startsWith('beeson-') && c !== 'visible' && c !== 'current-fragment').join('.'))`);
  // the center of the first shown element of a selector, in CSS px of the window
  const centerOf = (page, selector) => page.evaluate(`(() => {
  const r = [...document.querySelectorAll(${js(selector)})].map((e) => e.getBoundingClientRect()).find((r) => r.width);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
  // the box of the first element of a selector, with its right and bottom edges
  const rectOf = (page, selector) => page.evaluate(`(() => {
  const b = [...document.querySelectorAll(${js(selector)})].map((e) => e.getBoundingClientRect()).filter((r) => r.width).pop();
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
})()`);
  const canvasOf = (page) => page.evaluate('(() => { const v = window.BeesonEditorShell.stage.viewport; return { left: v.left, top: v.top, right: v.right, bottom: v.bottom }; })()');
  const pane = (page) => page.evaluate(`document.querySelector('${PANEL} .ed-panes')?.dataset.pane`);
  const tabs = (page) => page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].map((b) => b.textContent)`);
  const showTab = async (page, name) => {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === ${js(name)})?.click()`);
    await frames(page);
  };

  // the editor on the slide n of a deck served over HTTP, in a window of 1600 by 1000 px as in the
  // shoot of the council, with the Format tab shown
  async function load(t, platform, { deck = 'test-deck.html', n = FIGURE } = {}) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
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

  // roundTrip checks the text before byte for byte after undos undos, the edit after as many redos,
  // and an open of the saved edit without problems, which is the text before the next check
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r7-9-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  // the place of the caption from the lower left corner of the picture of the shown image, i.e. the
  // image fitted into its box with object-fit contain, in screen px
  const captionFromPicture = (page) => page.evaluate(`(() => {
  const img = [...document.querySelectorAll(${js(IMG)})].find((e) => e.getBoundingClientRect().width);
  const r = img.getBoundingClientRect();
  let w = r.width, h = r.height;
  if (getComputedStyle(img).objectFit === 'contain') {
    const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    w = img.naturalWidth * k;
    h = img.naturalHeight * k;
  }
  const left = r.left + (r.width - w) / 2, bottom = r.top + (r.height + h) / 2;
  const c = document.querySelector(${js(CAPTION)}).getBoundingClientRect();
  const s = document.querySelector('.reveal .slides');
  return { dx: c.left - left, dy: c.top - bottom, left, bottom, caption: { left: c.left, top: c.top }, k: s.getBoundingClientRect().width / s.offsetWidth, box: { dx: c.left - r.left, dy: c.top - r.bottom } };
})()`);

  function sameOffset(now, before, what) {
    const ok = Math.abs(now.dx - before.dx) <= 1.5 && Math.abs(now.dy - before.dy) <= 1.5;
    assert.ok(ok, `${what}: the caption is at ${js([now.dx, now.dy])} from the lower left corner of the image, and not at ${js([before.dx, before.dy])} as before`);
  }

  // the caption under the picture of an image with a width, at the gap of 16 slide px that the theme
  // puts between the picture and the caption of a figure box, which is the size of such a picture
  function underPicture(now, what) {
    const ok = Math.abs(now.dx) <= 1.5 && Math.abs(now.dy - 16 * now.k) <= 1.5;
    assert.ok(ok, `${what}: the caption is at ${js([now.dx, now.dy])} from the lower left corner of the image, and not under it at the gap of the theme`);
  }

  // the caption under the box of an image whose picture object-fit contain draws inside it, e.g.
  // an image of a figure box typed to a width, at the gap of 16 slide px of the theme
  function underBox(now, what) {
    const ok = Math.abs(now.box.dx) <= 1.5 && Math.abs(now.box.dy - 16 * now.k) <= 1.5;
    assert.ok(ok, `${what}: the caption is at ${js([now.box.dx, now.box.dy])} from the lower left corner of the image box, and not under it at the gap of the theme`);
  }

  const gripAt = (page, handle) => page.evaluate(`(() => {
  const g = [...document.querySelectorAll('.beeson-grip[data-handle="${handle}"]')].find((g) => !g.hidden && g.getBoundingClientRect().width);
  const r = g.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
  // the image selected again after an open of the saved text, which clears the selection
  async function reselect(page) {
    await page.evaluate(`Reveal.slide(${FIGURE})`);
    await frames(page);
    await selectPicture(page, IMG);
    assert.deepEqual(await selected(page), ['img.for-dark']);
  }
  const release = (page, at) => page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });

  async function openBar(page, bar) {
    await click(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await frames(page);
  }
  const menuItems = (page) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => ({ label: i.querySelector('.label')?.textContent ?? '', dimmed: i.getAttribute('aria-disabled') === 'true' }))`);

  // the caption of a figure, kept under its image
  for (const platform of PLATFORMS) {
    test(`a drag of the image of a figure moves its caption with it (${platform})`, async (t) => {
      const page = await load(t, platform);
      await selectPicture(page, IMG);
      assert.deepEqual(await selected(page), ['img.for-dark'], 'a click on the image does not select the image alone');
      const rest = await captionFromPicture(page);
      const from = await centerOf(page, IMG);
      await drag(page, from, { dx: -80, dy: 20, hold: true });
      const held = await captionFromPicture(page);
      assert.ok(Math.abs(held.left - rest.left) > 40, 'the image is not moved by the drag');
      sameOffset(held, rest, 'while the image is dragged');
      await release(page, { x: from.x - 80, y: from.y + 20 });
      await frames(page);
      sameOffset(await captionFromPicture(page), rest, 'after the drag');
      assert.match(await render(page), /<figure class="figure-box[^"]*"[^>]* style="translate: -?\d+px -?\d+px">/, 'the drag of the image does not move its figure');
      await roundTrip(page);
    });

    test(`a resize of the image of a figure keeps its caption under it (${platform})`, async (t) => {
      const page = await load(t, platform);
      await selectPicture(page, IMG);
      const rest = await captionFromPicture(page);
      const at = await gripAt(page, 'se');
      await drag(page, at, { dx: -90, dy: -60, hold: true });
      const held = await captionFromPicture(page);
      assert.ok(held.bottom < rest.bottom - 30, 'the image is not shrunk by the drag of its grip');
      underPicture(held, 'while the image is resized');
      await release(page, { x: at.x - 90, y: at.y - 60 });
      await frames(page);
      underPicture(await captionFromPicture(page), 'after the resize');
      await roundTrip(page);
    });

    test(`the keys, the fields, and Reset Position move the caption with the image, and a rotation does not (${platform})`, async (t) => {
      const page = await load(t, platform);
      await selectPicture(page, IMG);
      const rest = await captionFromPicture(page);
      // three nudges in a row are one entry of the history
      for (let i = 0; i < 3; i++) await press(page, 'Shift+ArrowLeft');
      await frames(page);
      const nudged = await captionFromPicture(page);
      assert.ok(nudged.left < rest.left - 5, 'the image is not nudged');
      sameOffset(nudged, rest, 'after three nudges');
      await roundTrip(page);
      await reselect(page);

      await exec(page, 'arrange.setPosition', { y: 100 });
      await frames(page);
      sameOffset(await captionFromPicture(page), rest, 'after a position typed in Y');
      await roundTrip(page);
      await reselect(page);

      await exec(page, 'arrange.setSize', { w: 420 });
      await frames(page);
      underBox(await captionFromPicture(page), 'after a width typed in W');
      await roundTrip(page);
      await reselect(page);

      await exec(page, 'arrange.resetPosition');
      await frames(page);
      underBox(await captionFromPicture(page), 'after Reset Position');
      await roundTrip(page);
      await reselect(page);

      // a turn of the image alone leaves its caption where it is, and the start tag of the caption
      // as it was
      const before = await captionFromPicture(page);
      const text = await render(page);
      await exec(page, 'arrange.setRotation', { deg: 30 });
      await frames(page);
      const turned = await captionFromPicture(page);
      assert.ok(Math.abs(turned.caption.left - before.caption.left) <= 1 && Math.abs(turned.caption.top - before.caption.top) <= 1, 'the caption is moved by a rotation of the image');
      const captionTag = (s) => s.match(/<figcaption[^>]*>/g);
      assert.deepEqual(captionTag(await render(page)), captionTag(text));
      await roundTrip(page);
    });

  }

  // the order of the figure of a selected image
  for (const platform of PLATFORMS) {
    test(`the order commands act on the figure of a selected image (${platform})`, async (t) => {
      const page = await load(t, platform);
      const orders = ['front', 'forward', 'backward', 'back'];
      const states = async () => Object.fromEntries(await Promise.all(orders.map(async (o) => [o, (await state(page, `arrange.order.${o}`)).enabled])));
      // the states with the figure selected, which the states with its image must match
      await selectPicture(page, IMG);
      await exec(page, 'selection.container');
      assert.deepEqual(await selected(page), ['figure.figure-box']);
      const figure = await states();
      assert.equal(figure.backward && figure.back, true, `Send Backward and Send to Back are dimmed for the figure: ${js(figure)}`);
      await exec(page, 'arrange.order.back');
      const byFigure = await render(page);
      await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);

      await click(page, '.reveal section.present h2');
      await press(page, 'Escape');
      await selectPicture(page, IMG);
      assert.deepEqual(await selected(page), ['img.for-dark']);
      assert.deepEqual(await states(), figure, 'the order commands of the image are not those of its figure');
      await showTab(page, 'Arrange');
      const buttons = await page.evaluate(`Object.fromEntries(${js(orders)}.map((o) => [o, !document.querySelector('${PANEL} button[data-command="arrange.order.' + o + '"]')?.disabled]))`);
      assert.deepEqual(buttons, figure, 'the order buttons of the Arrange pane are not live as for the figure');
      await openBar(page, 'Arrange');
      const items = await menuItems(page);
      for (const label of ['Send Backward', 'Send to Back']) assert.equal(items.find((i) => i.label === label)?.dimmed, false, `${label} is dimmed in the Arrange menu: ${js(items)}`);
      await press(page, 'Escape');
      await frames(page);
      // Send to Back of the pane moves the figure as with the figure selected, and keeps the image
      // selected
      await click(page, `${PANEL} button[data-command="arrange.order.back"]`);
      await frames(page);
      assert.equal(await render(page), byFigure, 'Send to Back of the image does not move its figure');
      assert.deepEqual(await selected(page), ['img.for-dark'], 'the image is not selected after Send to Back');
      await roundTrip(page);
    });

  }

  // Esc on a selected image, and the pane of its figure
  for (const platform of PLATFORMS) {
    test(`Esc on a selected image selects its figure, with the pane of the figure, after a click on the inspector (${platform})`, async (t) => {
      const page = await load(t, platform);
      // the focus on the tab Format of the inspector, as the photographer of the council left it
      const format = await page.evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Format' && b.getBoundingClientRect().left > innerWidth * 0.75 && b.getBoundingClientRect().top > 80);
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
      await click(page, format);
      await frames(page);
      await selectPicture(page, IMG);
      await frames(page);
      assert.deepEqual(await selected(page), ['img.for-dark']);
      assert.equal(await pane(page), 'image');
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box'], 'Esc on the selected image does not select its figure');
      assert.ok((await tabs(page)).includes('Image'), `the inspector does not offer the Image pane for the figure: ${js(await tabs(page))}`);
      // Select Figure shows the same pane, and Esc on the selected figure clears the selection
      await click(page, '.reveal section.present h2');
      await press(page, 'Escape');
      await selectPicture(page, IMG);
      await exec(page, 'selection.container');
      await frames(page);
      assert.deepEqual(await selected(page), ['figure.figure-box']);
      assert.ok((await tabs(page)).includes('Image'));
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), []);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

  }

  // the formula sheets, kept inside the canvas
  for (const platform of PLATFORMS) {
    test(`the sheet of a new formula is kept beside it inside the canvas, off the figure and its caption (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, '.reveal section.present ul > li:last-child');
      await press(page, 'Escape');
      await exec(page, 'insert.formula');
      await page.waitFor(`!!document.querySelector('.beeson-math')`);
      await sleep(300);
      const pop = await rectOf(page, '.beeson-math');
      const target = await rectOf(page, '.reveal section.present div.math');
      const caption = await rectOf(page, CAPTION);
      const canvas = await canvasOf(page);
      assert.ok(inside(pop, canvas), `the sheet ${js(pop)} is not inside the canvas ${js(canvas)}`);
      assert.ok(!meets(pop, target), `the sheet ${js(pop)} is put over its formula ${js(target)}`);
      assert.ok(!meets(pop, caption), `the sheet ${js(pop)} is put over the caption ${js(caption)}`);
      assert.ok(pop.left >= target.right && pop.top < target.bottom && pop.bottom > target.top, `the sheet ${js(pop)} is not level beside its formula ${js(target)}`);
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-math')`);
      if ((await render(page)) !== page.source) await page.evaluate('window.BeesonEditor.undo()');
      await byteExact(page);
    });

    test(`the TeX sheet of a display formula is kept inside the canvas (${platform})`, async (t) => {
      const page = await load(t, platform, { n: EQUATIONS });
      await click(page, '.reveal section.present div.math mjx-container');
      await page.waitFor(`!!document.querySelector('.beeson-math')`);
      await sleep(300);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-math .title').textContent`), 'Edit Formula');
      const pop = await rectOf(page, '.beeson-math');
      const canvas = await canvasOf(page);
      assert.ok(inside(pop, canvas), `the sheet ${js(pop)} is drawn past the canvas ${js(canvas)}`);
      assert.ok(!meets(pop, await rectOf(page, '.reveal section.present div.math')), 'the sheet is put over its formula');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-math')`);
      await byteExact(page);
    });

  }

  // a table, which is not rotated
  for (const platform of PLATFORMS) {
    test(`a table is drawn without a rotate handle, and no rotation acts on it (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: TABLES, n: 1 });
      const rotor = () => page.evaluate(`(() => { const r = document.querySelector('.beeson-rotor'); return !!r && !r.hidden && getComputedStyle(r).display !== 'none'; })()`);
      const cell = (r, c) => `.reveal section.present table tr:nth-child(${r + 1}) > :nth-child(${c + 1})`;
      // a range of cells selected by a drag, as in the state of the council
      const a = await centerOf(page, cell(1, 0));
      const b = await centerOf(page, cell(2, 1));
      await drag(page, a, { dx: b.x - a.x, dy: b.y - a.y });
      await frames(page);
      assert.equal(await rotor(), false, 'a rotate handle is drawn on a range of cells');
      // the table selected as an element
      await click(page, cell(0, 0));
      await press(page, 'Escape');
      await frames(page);
      if ((await selected(page))[0] !== 'table') await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['table']);
      assert.equal(await rotor(), false, 'a rotate handle is drawn on a selected table');
      assert.equal((await state(page, 'arrange.setRotation')).enabled, false, 'Rotate is enabled on a table');
      await exec(page, 'arrange.setRotation', { deg: 30 });
      await byteExact(page);
      await showTab(page, 'Arrange');
      const angle = await page.evaluate(`[...document.querySelectorAll('${PANEL} input')].some((i) => i.closest('label, .ed-field, .ed-row')?.textContent?.includes('Angle') && !i.disabled)`);
      assert.equal(angle, false, 'the Angle field of the Arrange pane is live for a table');
      assert.deepEqual(errors(page), []);
    });
  }

  // the resize grips, square on a Mac as in PowerPoint and Keynote for the Mac, and round elsewhere
  // as in PowerPoint for Windows
  for (const platform of PLATFORMS) {
    test(`the resize grips are ${platform === 'mac' ? 'square' : 'round'}, and the rotate handle is round (${platform})`, async (t) => {
      const page = await load(t, platform, { n: FIGURE });
      await click(page, IMG);
      await frames(page);
      const looks = await page.evaluate(`(() => {
      const shown = (el) => !el.hidden && getComputedStyle(el).display !== 'none';
      const grips = [...document.querySelectorAll('.beeson-grip:not(.locked)')].filter(shown);
      const rotor = document.querySelector('.beeson-rotor');
      return { grips: grips.length, radii: [...new Set(grips.map((g) => getComputedStyle(g).borderTopLeftRadius))], sizes: [...new Set(grips.map((g) => { const r = g.getBoundingClientRect(); return r.width + 'x' + r.height; }))], rotor: rotor && shown(rotor) ? getComputedStyle(rotor).borderTopLeftRadius : null };
    })()`);
      assert.equal(looks.grips, 8, 'the selected image does not have eight grips');
      assert.deepEqual(looks.radii, [platform === 'mac' ? '0px' : '50%'], `the grips have the corners ${js(looks.radii)}`);
      assert.deepEqual(looks.sizes, ['11x11'], `the grips have the sizes ${js(looks.sizes)}`);
      assert.equal(looks.rotor, '50%', 'the rotate handle is not round');
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R8.5, the review of a picture with its caption, on both platforms and in both
// modes, with trusted input. the figures are a pair of images and one image, in a figure box of a content
// slide and in the plate of a figure slide, whose caption is a block of the layout. after each
// command the text is checked, then byte for byte after an undo and the edit again after a redo,
// and in the scope rule
describe('commands on a figure or its picture', () => {
  const PLATFORMS = ['mac', 'other'];
  const MODES = ['dark', 'light'];
  const DECK = 'test/pages/editor-r8-5.html';
  // the slides of the deck by what they hold
  const FIGURE_BOX_PAIR = 0, FIGURE_BOX_ONE = 1, PLATE_PAIR = 2, PLATE_ONE = 3, EMPTY = 4, STEPPED = 5;
  const NAMES = ['a pair in a zone', 'one image in a zone', 'a pair in a plate', 'one image in a plate', 'a slide without a figure', 'a stepped pair'];
  const IMG = '.reveal section.present img';
  const CAPTION = '.reveal section.present .caption';
  const PANEL = '#beeson-edit-panel-format';
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const SOURCE = readFileSync(DECK, 'utf8');

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
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const near = (a, b, by = 2) => Math.abs(a - b) <= by;

  // the selected elements, each named by its tag and its first class of the deck
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => [el.localName, ...[...el.classList].filter((c) => /^(figure-box|plate|caption|for-dark|for-light)$/.test(c))].join('.'))`);
  const rectOf = (page, selector) => page.evaluate(`(() => {
  const r = [...document.querySelectorAll(${js(selector)})].map((e) => e.getBoundingClientRect()).find((r) => r.width);
  return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
})()`);

  // the picture of the shown image of the slide on the screen: its center, about which it is turned,
  // its size without its rotation, and its angle with that of the figure around it, in degrees. the
  // picture of an image fitted with object-fit contain is smaller than the box of the image
  const pictureOf = (page) => page.evaluate(`(() => {
  const img = [...document.querySelectorAll(${js(IMG)})].find((e) => e.getBoundingClientRect().width);
  const slides = document.querySelector('.reveal .slides');
  const k = slides.getBoundingClientRect().width / slides.offsetWidth;
  const r = img.getBoundingClientRect();
  const s = getComputedStyle(img);
  const deg = (el) => parseFloat(getComputedStyle(el).rotate) || 0;
  const angle = deg(img) + deg(img.parentElement);
  let w = img.offsetWidth, h = img.offsetHeight, dx = 0, dy = 0;
  if (s.objectFit === 'contain') {
    const f = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const pw = img.naturalWidth * f, ph = img.naturalHeight * f;
    const [px, py] = s.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
    dx = px * (w - pw) + pw / 2 - w / 2;
    dy = py * (h - ph) + ph / 2 - h / 2;
    w = pw;
    h = ph;
  }
  const a = (angle * Math.PI) / 180;
  const flip = parseFloat(s.scale) < 0 ? -1 : 1;
  const x = r.left + r.width / 2 + (flip * dx * Math.cos(a) - dy * Math.sin(a)) * k;
  const y = r.top + r.height / 2 + (flip * dx * Math.sin(a) + dy * Math.cos(a)) * k;
  return { x, y, width: w * k, height: h * k, left: x - (w * k) / 2, top: y - (h * k) / 2, angle, own: deg(img), figure: deg(img.parentElement), k };
})()`);

  // the text of slide n
  function slideOf(text, n) {
    const at = [...text.matchAll(/<section[ >]/g)][n].index;
    return text.slice(at, text.indexOf('</section>', at));
  }

  // the start tags of slide n of a text whose name is in names
  const tagsOf = (text, n, names) => [...slideOf(text, n).matchAll(/<([a-z0-9-]+)\b[^>]*>/g)].filter((m) => names.includes(m[1])).map((m) => m[0]);

  const showTab = async (page, name) => {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === ${js(name)})?.click()`);
    await frames(page);
  };

  // the page loaded before it in the file is closed first. Within 1 s of the last change of a page,
  // its unsaved edits are kept in the storage of the browser, and they would then be offered on a
  // dialog over the slide of the next page
  let last = null;
  async function load(t, platform, mode, n) {
    await last?.close().catch(() => {});
    const page = await browser.newPage({ width: 1600, height: 1000 });
    last = page;
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    if ((await page.evaluate('Beeson.theme.get()')) !== mode) await page.evaluate('Beeson.theme.toggle()');
    page.source = SOURCE;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    // the names of the figure and of its shown image in selected()
    const pair = n === FIGURE_BOX_PAIR || n === PLATE_PAIR || n === STEPPED;
    page.parts = { figure: n === PLATE_PAIR || n === PLATE_ONE ? 'div.plate' : 'figure.figure-box', pic: pair ? `img.for-${mode}` : 'img', images: pair ? 2 : 1 };
    return page;
  }

  // nothing selected, with the focus off the chrome
  async function deselect(page) {
    await page.evaluate('document.activeElement instanceof HTMLElement && document.activeElement.blur()');
    for (let i = 0; i < 3 && (await selected(page)).length; i++) await exec(page, 'selection.clear');
    assert.deepEqual(await selected(page), []);
  }

  // the figure selected by one click on its picture, or its picture by two
  async function pick(page, from) {
    await deselect(page);
    for (let i = 0; i < (from === 'picture' ? 2 : 1); i++) {
      await click(page, IMG);
      await frames(page);
    }
    assert.deepEqual(await selected(page), [from === 'figure' ? page.parts.figure : page.parts.pic], `the ${from} is not selected by its clicks`);
  }

  // the text after an edit is in the scope rule wherever the text before it is
  function inScope(edited, source) {
    const now = textProblems(edited, THEME);
    for (const p of textProblems(source, THEME)) {
      const i = now.indexOf(p);
      if (i >= 0) now.splice(i, 1);
    }
    assert.deepEqual(now, [], 'the edit writes outside the scope rule');
  }

  // the edit, the file byte for byte after an undo, the edit again after a redo, and the file again
  // after a second undo, from which the next command starts
  async function roundTrip(page, edited) {
    assert.notEqual(edited, page.source, 'the command does not change the file');
    inScope(edited, page.source);
    await undo(page);
    await frames(page);
    await byteExact(page);
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited, 'a redo does not write the edit again');
    await undo(page);
    await frames(page);
    await byteExact(page);
  }

  // a value typed into a number field of the Arrange pane, committed with Enter
  async function typeField(page, id, value) {
    await showTab(page, 'Arrange');
    const input = `#beeson-edit-num-${id}`;
    assert.equal(await page.evaluate(`!!document.querySelector('${input}') && !document.querySelector('${input}').disabled`), true, `the field ${id} is not enabled`);
    await page.evaluate(`(() => { const i = document.querySelector('${input}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
    await frames(page);
  }
  async function fieldValue(page, id) {
    await showTab(page, 'Arrange');
    return Number(await page.evaluate(`document.querySelector('#beeson-edit-num-${id}')?.value`));
  }

  // the angles written on slide n of a text, by the name of the tag
  const anglesOf = (text, n) => [...slideOf(text, n).matchAll(/<([a-z0-9-]+)\b[^>]*\brotate: (\d+)deg/g)].map((m) => `${m[1]} ${m[2]}`);

  // a turn of the picture of slide n from the figure and from the picture. a figure with its caption
  // in it, selected as one object, is turned as one object: the angle is written on the figure and on
  // no other tag, and the picture and the caption are carried about the center of both. else the
  // angle is written on every image of the figure and on no other tag, the caption stays where it
  // is, upright, and the picture turns about its own center. act returns the angle that it asks for,
  // or null for the angle of a drag
  async function turns(t, platform, mode, n, what, act) {
    for (const from of ['figure', 'picture']) {
      const page = await load(t, platform, mode, n);
      await pick(page, from);
      const was = await selected(page);
      const caption = await rectOf(page, CAPTION);
      const pic = await pictureOf(page);
      const whole = from === 'figure' && page.parts.figure === 'figure.figure-box';
      const left = Math.min(pic.left, caption.left), top = Math.min(pic.top, caption.top);
      const c = { x: (left + Math.max(pic.left + pic.width, caption.right)) / 2, y: (top + Math.max(pic.top + pic.height, caption.bottom)) / 2 };
      const asked = await act(page);
      await frames(page);
      const edited = await render(page);
      const angles = anglesOf(edited, n);
      const where = `${what} of ${NAMES[n]} from the ${from}`;
      const tag = whole ? 'figure' : 'img';
      assert.equal(angles.length, whole ? 1 : page.parts.images, `${where} writes the angle on ${angles.join(', ') || 'no tag'}`);
      assert.ok(angles.every((a) => a.startsWith(`${tag} `) && a === angles[0]), `${where} writes the angle on ${angles.join(', ')}`);
      if (asked !== null) assert.equal(angles[0], `${tag} ${asked}`);
      const now = await rectOf(page, CAPTION);
      const turned = await pictureOf(page);
      // a point carried about c by the angle of the turn
      const a = (turned.angle * Math.PI) / 180;
      const at = (o) => (whole ? { x: c.x + (o.x - c.x) * Math.cos(a) - (o.y - c.y) * Math.sin(a), y: c.y + (o.x - c.x) * Math.sin(a) + (o.y - c.y) * Math.cos(a) } : o);
      const q = at(caption);
      if (whole) assert.ok(near(now.x, q.x) && near(now.y, q.y), `${where} does not carry the caption with the picture`);
      else assert.ok(near(now.left, caption.left, 1) && near(now.top, caption.top, 1) && near(now.width, caption.width, 1) && near(now.height, caption.height, 1), `${where} moves or turns the caption`);
      assert.equal(whole ? turned.own : turned.figure, 0, `${where} turns the ${whole ? 'picture in' : ''} figure`);
      assert.ok(turned.angle > 0, `${where} does not turn the picture`);
      const p = at(pic);
      assert.ok(near(turned.x, p.x) && near(turned.y, p.y), `${where} moves the center of the picture from ${Math.round(p.x)}, ${Math.round(p.y)} to ${Math.round(turned.x)}, ${Math.round(turned.y)}`);
      assert.deepEqual(await selected(page), was, `${where} changes the selection`);
      // the angle is shown in the field from both selections, and the image of the other mode has it
      assert.equal(await fieldValue(page, 'angle'), turned.angle, `the Angle field after ${where}`);
      await page.evaluate('Beeson.theme.toggle()');
      await frames(page);
      const other = await pictureOf(page);
      assert.ok(other.own === turned.own && other.figure === turned.figure && near(other.x, p.x) && near(other.y, p.y), `${where} is not kept in the other mode`);
      await page.evaluate('Beeson.theme.toggle()');
      await frames(page);
      // Reset Rotation puts the file back
      assert.equal((await state(page, 'arrange.resetRotation')).enabled, true, `Reset Rotation is dimmed after ${where}`);
      await exec(page, 'arrange.resetRotation');
      await frames(page);
      await byteExact(page);
      await undo(page);
      await frames(page);
      assert.equal(await render(page), edited);
      await roundTrip(page, edited);
      assert.deepEqual(errors(page), []);
    }
  }

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`the rotate handle turns the picture of a figure and leaves its caption, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, FIGURE_BOX_ONE, PLATE_PAIR]) {
          await turns(t, platform, mode, n, 'a turn by the rotate handle', async (page) => {
            assert.equal(await page.evaluate(`!document.querySelector('.beeson-rotor').hidden`), true, 'the rotate handle is not drawn');
            await drag(page, '.beeson-rotor', { dx: 80, dy: 60 });
            return null;
          });
        }
      });

      test(`the Angle field turns the picture of a figure and leaves its caption, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, FIGURE_BOX_ONE, PLATE_PAIR]) {
          await turns(t, platform, mode, n, 'a turn by the Angle field', async (page) => {
            await typeField(page, 'angle', 30);
            return 30;
          });
        }
      });
    }
  }

  // the heading of the slide added to the selection with a click and Shift
  async function addHeading(page) {
    const r = await rectOf(page, '.reveal section.present > h2');
    await click(page, { x: r.left + 20, y: r.y }, { modifiers: 'Shift' });
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`a group turned by its rotate handle turns the picture of its figure and leaves the caption upright, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, PLATE_PAIR]) {
          const page = await load(t, platform, mode, n);
          await pick(page, 'figure');
          await addHeading(page);
          await exec(page, 'arrange.group');
          await frames(page);
          page.source = await render(page);
          const pic = await pictureOf(page);
          await drag(page, '.beeson-rotor', { dx: 60, dy: 40 });
          await frames(page);
          const edited = await render(page);
          const angles = anglesOf(edited, n);
          const where = `a turn of a group with ${NAMES[n]}`;
          // a figure with its caption in it is turned with its caption, as one object, and a plate
          // turns its pictures and leaves the caption of the slide upright
          const whole = n === FIGURE_BOX_PAIR;
          assert.deepEqual(angles.map((a) => a.split(' ')[0]).sort(), whole ? ['figure', 'h2'] : ['h2', 'img', 'img'], `${where} writes the angle on ${angles.join(', ')}`);
          assert.equal(new Set(angles.map((a) => a.split(' ')[1])).size, 1, `${where} writes the angles ${angles.join(', ')}`);
          const turned = await pictureOf(page);
          assert.equal(whole ? turned.own : turned.figure, 0, `${where} turns the ${whole ? 'picture in its' : ''} figure`);
          assert.equal(await page.evaluate(`getComputedStyle(document.querySelector(${js(CAPTION)}).parentElement).rotate`), whole ? `${turned.angle}deg` : 'none', `${where} turns the caption`);
          // the picture is carried about the center of the group
          assert.ok(!near(turned.x, pic.x, 4) || !near(turned.y, pic.y, 4), `${where} leaves the picture in place`);
          assert.equal(await fieldValue(page, 'angle'), turned.angle, `the Angle field after ${where}`);
          await roundTrip(page, edited);
          assert.deepEqual(errors(page), []);
        }
      });
    }
  }

  // a trusted drag of the file at path from the Finder, dropped at the point at. the label of the
  // outline drawn while the file is over the point is returned
  async function dropFile(page, at, path) {
    const data = { items: [], files: [resolve(path)], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver']) await page.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
    const outline = await page.evaluate(`(() => { const b = document.querySelector('.beeson-drop'); return b && !b.hidden ? b.textContent : null; })()`);
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: at.x, y: at.y, data });
    return outline;
  }
  const waitText = (page, text) => page.waitFor(`window.BeesonEditor.render().includes(${js(text)})`, 30000);

  // the text of the figure of slide n, i.e. of its figure box or plate
  function figureOf(text, n) {
    const slide = slideOf(text, n);
    const at = slide.search(/<(figure|div) class="(figure-box|plate)/);
    const end = slide.indexOf(slide[at + 1] === 'f' ? '</figure>' : '</div>', at);
    return slide.slice(at, end);
  }

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`a file dropped onto the picture of a locked figure does not replace it, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, PLATE_PAIR]) {
          const page = await load(t, platform, mode, n);
          await pick(page, 'figure');
          await exec(page, 'arrange.lock');
          await frames(page);
          page.source = await render(page);
          const locked = figureOf(page.source, n);
          assert.match(locked, /^<(figure|div) class="(figure-box|plate)" data-locked>/);
          const pic = await pictureOf(page);
          // as in Keynote, the file is added to the slide beside the locked picture
          const outline = await dropFile(page, pic, 'demo/clip-dark.png');
          assert.equal(outline, 'Add Image', `the outline over the picture of a locked figure of ${NAMES[n]}`);
          await waitText(page, 'media/clip-dark.png');
          // the picture is in the text before it is placed and sized, hence the text is read once its entry is in the history
          await page.waitFor(`/Insert/.test(window.BeesonEditor.state('edit.undo').label)`, 30000);
          await frames(page);
          const edited = await render(page);
          assert.equal(figureOf(edited, n), locked, `a file dropped onto the locked picture of ${NAMES[n]} changes its figure`);
          // since R9.9, the new picture is placed in the free space of the slide, with a translate and a width
          assert.match(slideOf(edited, n), /<figure class="figure-box"(?: style="[^"]*")?>\s*<img src="media\/clip-dark\.png"(?: style="[^"]*")?>/, 'the file is not added in a zone of its own');
          await roundTrip(page, edited);
          assert.deepEqual(errors(page), []);
        }
      });

      test(`Replace with a video keeps the mode, the step, the id, and the place of an image, on ${platform} in ${mode} mode`, async (t) => {
        for (const from of ['figure', 'picture']) {
          const page = await load(t, platform, mode, STEPPED);
          await pick(page, from);
          const pic = await pictureOf(page);
          assert.equal(await dropFile(page, pic, 'demo/clip-dark.mp4'), 'Replace Image');
          await waitText(page, 'media/clip-dark.mp4');
          await frames(page);
          const edited = await render(page);
          const videos = tagsOf(edited, STEPPED, ['video']);
          assert.equal(videos.length, 1, 'the image of the mode is not replaced with one video');
          for (const part of [`class="for-${mode} fragment"`, 'data-fragment-index="1"', 'data-id="curves"', 'style="translate: 12px 8px; width: 500px"', 'src="media/clip-dark.mp4"', 'poster="media/clip-dark.png"']) {
            assert.ok(videos[0].includes(part), `the video ${videos[0]} of a Replace from the ${from} is written without ${part}`);
          }
          assert.ok(!videos[0].includes('alt='), `the video ${videos[0]} keeps the alt text of the image`);
          // the image of the other mode is left, and the selection is on the same object
          assert.equal(tagsOf(edited, STEPPED, ['img']).length, 1);
          assert.deepEqual(await selected(page), [from === 'figure' ? 'figure.figure-box' : `video.for-${mode}`], `the selection after a Replace from the ${from}`);
          await roundTrip(page, edited);
          assert.deepEqual(errors(page), []);
        }
      });
    }
  }

  // the widths written on the images of slide n of a text
  const widthsOf = (text, n) => tagsOf(text, n, ['img']).map((tag) => /\bwidth: (\d+)px/.exec(tag)?.[1] ?? null);

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`a width typed in the W field and Reset Size keep the upper left corner of the picture of a figure, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, FIGURE_BOX_ONE, PLATE_PAIR, PLATE_ONE]) {
          for (const from of ['figure', 'picture']) {
            const page = await load(t, platform, mode, n);
            await pick(page, from);
            const pic = await pictureOf(page);
            const caption = await rectOf(page, CAPTION);
            await typeField(page, 'width', 400);
            const edited = await render(page);
            const where = `a width typed for ${NAMES[n]} from the ${from}`;
            // a letterboxed picture keeps its box, whose width is written, and W reads 400 below
            const written = widthsOf(edited, n);
            assert.ok(written.length === page.parts.images && written.every((w) => w && w === written[0]), `${where} is not written on every image`);
            const sized = await pictureOf(page);
            assert.ok(near(sized.left, pic.left) && near(sized.top, pic.top), `${where} moves the corner of the picture from ${Math.round(pic.left)}, ${Math.round(pic.top)} to ${Math.round(sized.left)}, ${Math.round(sized.top)}`);
            // the caption of a figure box is under the box of its image at the gap of 16 slide px of the
            // theme, since the box keeps its letterbox, and the caption of a figure slide stays in
            // its layout
            const under = await rectOf(page, CAPTION);
            if (n === FIGURE_BOX_PAIR || n === FIGURE_BOX_ONE) assert.ok(near(under.top - (await rectOf(page, IMG)).bottom, 16 * sized.k), `${where} leaves the caption away from the box of its picture`);
            else assert.ok(near(under.top, caption.top) && near(under.left, caption.left), `${where} moves the caption of the layout`);
            assert.equal(await fieldValue(page, 'width'), 400);
            // Reset Size keeps the corner as well
            assert.equal((await state(page, 'arrange.resetSize')).enabled, true);
            await exec(page, 'arrange.resetSize');
            await frames(page);
            const reset = await pictureOf(page);
            assert.ok(near(reset.left, pic.left) && near(reset.top, pic.top) && near(reset.width, pic.width), `Reset Size after ${where} moves the corner of the picture to ${Math.round(reset.left)}, ${Math.round(reset.top)}`);
            await byteExact(page);
            await undo(page);
            await frames(page);
            assert.equal(await render(page), edited);
            await roundTrip(page, edited);
            assert.deepEqual(errors(page), []);
          }
        }
      });
    }
  }

  const count = (text, part) => text.split(part).length - 1;
  const ID = 'data-id="curves"';

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`a copy of a figure does not repeat a data-id of its slide, on ${platform} in ${mode} mode`, async (t) => {
        assert.equal(count(SOURCE, ID), 2);
        for (const from of ['figure', 'picture']) {
          const page = await load(t, platform, mode, STEPPED);
          // Duplicate, with both images of the pair in the copy
          await pick(page, from);
          await press(page, 'Mod+D');
          await frames(page);
          let edited = await render(page);
          assert.equal(count(slideOf(edited, STEPPED), '<img class="for-'), 4, `Duplicate from the ${from} does not copy both images`);
          assert.equal(count(edited, ID), 2, `Duplicate from the ${from} repeats the data-id`);
          assert.equal(count(slideOf(edited, STEPPED), 'data-fragment-index="1"'), 4, 'the copy does not keep the step of its images');
          await roundTrip(page, edited);
          // a copy made by a drag with the copy modifier. Chrome on a Mac opens the context menu at a
          // press with Ctrl, and a release of the drag over one of its items runs the item, e.g. Send
          // to Back. the menu is thus kept closed on the platform other, as it is off a Mac
          if (platform !== 'mac') await page.evaluate(`window.addEventListener('contextmenu', (ev) => { if (ev.ctrlKey && ev.button === 0) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true)`);
          await pick(page, from);
          await drag(page, IMG, { dx: 80, dy: 30, modifiers: platform === 'mac' ? 'Alt' : 'Ctrl' });
          await page.waitFor(`window.BeesonEditor.render().split('<figure').length === ${count(SOURCE, '<figure') + 2}`);
          edited = await render(page);
          assert.equal(count(edited, ID), 2, `a copy by a drag from the ${from} repeats the data-id`);
          await roundTrip(page, edited);
          // Copy and Paste on the slide of the figure
          await pick(page, from);
          await exec(page, 'edit.copy');
          await exec(page, 'edit.paste');
          await frames(page);
          edited = await render(page);
          assert.equal(count(slideOf(edited, STEPPED), '<img class="for-'), 4);
          assert.equal(count(edited, ID), 2, `Paste on the slide of the figure from the ${from} repeats the data-id`);
          await roundTrip(page, edited);
          // on another slide the first copy keeps the id, by which reveal.js pairs the elements of two
          // slides, and a second copy does not repeat it
          await pick(page, from);
          await exec(page, 'edit.copy');
          await page.evaluate(`Reveal.slide(${EMPTY})`);
          await frames(page);
          await exec(page, 'edit.paste');
          await frames(page);
          edited = await render(page);
          assert.equal(count(slideOf(edited, EMPTY), ID), 2, 'the first copy on another slide does not keep the data-id');
          assert.deepEqual(await selected(page), ['figure.figure-box'], 'the pasted figure is not selected');
          await exec(page, 'edit.paste');
          await frames(page);
          const twice = await render(page);
          assert.equal(count(slideOf(twice, EMPTY), '<img class="for-'), 4);
          assert.equal(count(slideOf(twice, EMPTY), ID), 2, 'a second copy on another slide repeats the data-id');
          inScope(twice, SOURCE);
          await undo(page);
          await frames(page);
          assert.equal(await render(page), edited);
          await undo(page);
          await frames(page);
          await byteExact(page);
          assert.deepEqual(errors(page), []);
        }
      });
    }
  }

  // whether the one selected element is the last figure of the slide, i.e. a copy put after its source
  const copySelected = (page) => page.evaluate(`(() => { const s = window.BeesonEditor.selection(); const all = document.querySelectorAll('.reveal section.present figure.figure-box'); return s.length === 1 && all.length === 2 && s[0] === all[1]; })()`);

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`an undo of Delete, Cut, Duplicate, and Paste of a figure selects what was selected, and a redo the copy, on ${platform} in ${mode} mode`, async (t) => {
        for (const from of ['figure', 'picture']) {
          const page = await load(t, platform, mode, FIGURE_BOX_PAIR);
          const removals = { Delete: () => press(page, platform === 'mac' ? 'Backspace' : 'Delete'), Cut: () => exec(page, 'edit.cut') };
          for (const [name, act] of Object.entries(removals)) {
            await pick(page, from);
            const was = await selected(page);
            await act();
            await frames(page);
            assert.equal(count(await render(page), '<figure'), count(SOURCE, '<figure') - 1, `${name} from the ${from} does not remove the figure`);
            assert.deepEqual(await selected(page), []);
            await undo(page);
            await frames(page);
            await byteExact(page);
            assert.deepEqual(await selected(page), was, `an undo of ${name} from the ${from} does not select it again`);
            await redo(page);
            await frames(page);
            assert.deepEqual(await selected(page), [], `a redo of ${name} from the ${from} leaves a selection`);
            await undo(page);
            await frames(page);
            await byteExact(page);
          }
          const copies = { Duplicate: () => press(page, 'Mod+D'), Paste: async () => { await exec(page, 'edit.copy'); await exec(page, 'edit.paste'); } };
          for (const [name, act] of Object.entries(copies)) {
            await pick(page, from);
            const was = await selected(page);
            await act();
            await frames(page);
            assert.equal(await copySelected(page), true, `${name} from the ${from} does not select the copy`);
            await undo(page);
            await frames(page);
            await byteExact(page);
            assert.deepEqual(await selected(page), was, `an undo of ${name} from the ${from} does not select its source again`);
            await redo(page);
            await frames(page);
            assert.equal(await copySelected(page), true, `a redo of ${name} from the ${from} does not select the copy`);
            await undo(page);
            await frames(page);
            await byteExact(page);
          }
          assert.deepEqual(errors(page), []);
        }
      });
    }
  }

  // the declaration scale written on the images of slide n of a text
  const flipsOf = (text, n) => tagsOf(text, n, ['img']).map((tag) => /\bscale: (-?\d+ -?\d+)/.exec(tag)?.[1] ?? null);

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`a flip mirrors the picture of a figure in place, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, PLATE_PAIR, PLATE_ONE]) {
          for (const from of ['figure', 'picture']) {
            const page = await load(t, platform, mode, n);
            for (const [id, scale] of [['arrange.flipHorizontal', '-1 1'], ['arrange.flipVertical', '1 -1']]) {
              await pick(page, from);
              const pic = await pictureOf(page);
              const caption = await rectOf(page, CAPTION);
              assert.equal((await state(page, id)).enabled, true);
              await exec(page, id);
              await frames(page);
              const edited = await render(page);
              const where = `${id} of ${NAMES[n]} from the ${from}`;
              assert.deepEqual(flipsOf(edited, n), new Array(page.parts.images).fill(scale), `${where} is not written on every image`);
              const flipped = await pictureOf(page);
              assert.ok(near(flipped.left, pic.left) && near(flipped.top, pic.top), `${where} moves the picture from ${Math.round(pic.left)}, ${Math.round(pic.top)} to ${Math.round(flipped.left)}, ${Math.round(flipped.top)}`);
              const now = await rectOf(page, CAPTION);
              assert.ok(near(now.left, caption.left, 1) && near(now.top, caption.top, 1), `${where} moves the caption`);
              // the frame of the selection is drawn at the picture, 8 px outside a figure in a figure box,
              // which holds its caption
              const frame = await rectOf(page, '.beeson-frame.selected:not([hidden])');
              const inset = from === 'figure' && n === FIGURE_BOX_PAIR ? 8 : 0;
              assert.ok(near(frame.left, flipped.left - inset) && near(frame.top, flipped.top - inset), `the frame after ${where} is at ${Math.round(frame.left)}, ${Math.round(frame.top)}`);
              await roundTrip(page, edited);
            }
            assert.deepEqual(errors(page), []);
          }
        }
      });
    }
  }

  // whether the frame of the selection lies inside the slide, within 2 px
  const frameInSlide = (page) => page.evaluate(`(() => {
  const f = [...document.querySelectorAll('.beeson-frame.selected')].find((e) => !e.hidden)?.getBoundingClientRect();
  const s = document.querySelector('.reveal .slides').getBoundingClientRect();
  return !!f && f.width > 20 && f.left >= s.left - 2 && f.top >= s.top - 2 && f.right <= s.right + 2 && f.bottom <= s.bottom + 2;
})()`);

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`a copy of the plate of a figure slide is drawn on its slide, as a zone where the layout does not have a plate, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [PLATE_PAIR, PLATE_ONE]) {
          for (const from of ['figure', 'picture']) {
            const page = await load(t, platform, mode, n);
            const images = n === PLATE_PAIR ? 2 : 1;
            // Duplicate on the figure slide, whose layout has one plate
            await pick(page, from);
            await press(page, 'Mod+D');
            await frames(page);
            let edited = await render(page);
            let where = `Duplicate of ${NAMES[n]} from the ${from}`;
            assert.equal(count(slideOf(edited, n), '<div class="plate">'), 1, `${where} writes a second plate`);
            assert.equal(count(slideOf(edited, n), '<div class="figure-box">'), 1, `${where} does not write the copy as a zone`);
            assert.equal(count(slideOf(edited, n), '<img'), 2 * images, `${where} does not copy every image`);
            assert.deepEqual(await selected(page), ['div.figure-box'], `${where} does not select the copy`);
            assert.equal(await frameInSlide(page), true, `the copy of ${where} is not drawn on the slide`);
            await roundTrip(page, edited);
            // Copy and Paste onto a content slide
            await pick(page, from);
            await exec(page, 'edit.copy');
            await page.evaluate(`Reveal.slide(${EMPTY})`);
            await frames(page);
            await exec(page, 'edit.paste');
            await frames(page);
            edited = await render(page);
            where = `Paste of ${NAMES[n]} onto a content slide from the ${from}`;
            assert.equal(count(slideOf(edited, EMPTY), '<div class="figure-box">'), 1, `${where} does not write a zone`);
            assert.equal(count(slideOf(edited, EMPTY), '<img'), images);
            assert.deepEqual(await selected(page), ['div.figure-box']);
            assert.equal(await frameInSlide(page), true, `the copy of ${where} is not drawn on the slide`);
            inScope(edited, SOURCE);
            await undo(page);
            await frames(page);
            await byteExact(page);
            // Cut and Paste on the figure slide, which is then without a plate
            await page.evaluate(`Reveal.slide(${n})`);
            await frames(page);
            await pick(page, from);
            await exec(page, 'edit.cut');
            await frames(page);
            await exec(page, 'edit.paste');
            await frames(page);
            edited = await render(page);
            assert.equal(count(slideOf(edited, n), '<div class="plate">'), 1, 'a plate pasted onto its figure slide after a cut is not a plate');
            assert.equal(await frameInSlide(page), true);
            await undo(page);
            await undo(page);
            await frames(page);
            await byteExact(page);
            assert.deepEqual(errors(page), []);
          }
        }
      });
    }
  }

  // the items of the open context menu, each with its text and whether it is dimmed
  const menuItems = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].filter((i) => i.getClientRects().length).map((i) => ({ text: i.textContent.trim().replace(/\\s+/g, ' '), off: i.classList.contains('disabled') || i.getAttribute('aria-disabled') === 'true' }))`);

  // a click on the item of the open context menu whose text starts with name
  async function chooseItem(page, name) {
    const at = await page.evaluate(`(() => {
    const i = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.textContent.trim().startsWith(${js(name)}));
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the context menu does not have an item ${name}`);
    await click(page, at);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    for (const mode of MODES) {
      test(`Lock and Unlock of the context menu of a figure and of its picture are written on the figure, on ${platform} in ${mode} mode`, async (t) => {
        for (const n of [FIGURE_BOX_PAIR, PLATE_PAIR]) {
          for (const from of ['figure', 'picture']) {
            const page = await load(t, platform, mode, n);
            await pick(page, from);
            await click(page, IMG, { button: 'right' });
            await frames(page);
            assert.deepEqual(await selected(page), [from === 'figure' ? page.parts.figure : page.parts.pic], 'a right click changes the selection');
            await chooseItem(page, 'Lock');
            const edited = await render(page);
            const tag = n === FIGURE_BOX_PAIR ? '<figure class="figure-box" data-locked>' : '<div class="plate" data-locked>';
            assert.equal(edited, SOURCE.replace(tag.replace(' data-locked', ''), tag), `Lock of the context menu of ${NAMES[n]} from the ${from} is not written on the figure alone`);
            // the menu of the locked figure lists Unlock with its key, and dims what changes the figure
            await click(page, IMG, { button: 'right' });
            await frames(page);
            const items = await menuItems(page);
            const unlock = items.find((i) => i.text.startsWith('Unlock'));
            assert.ok(unlock && !unlock.off, 'Unlock is missing or dimmed in the menu of a locked figure');
            assert.equal(unlock.text, platform === 'mac' ? 'Unlock⌥⌘L' : 'UnlockCtrl+Shift+L');
            for (const name of ['Cut', 'Delete', 'Bring to Front', 'Flip Horizontal']) assert.ok(items.find((i) => i.text.startsWith(name))?.off, `${name} is live in the menu of a locked figure`);
            for (const name of ['Copy', 'Duplicate']) assert.equal(items.find((i) => i.text.startsWith(name))?.off, false, `${name} is dimmed in the menu of a locked figure`);
            await chooseItem(page, 'Unlock');
            await byteExact(page);
            await undo(page);
            await frames(page);
            assert.equal(await render(page), edited);
            await roundTrip(page, edited);
            assert.deepEqual(errors(page), []);
          }
        }
      });
    }
  }
});
