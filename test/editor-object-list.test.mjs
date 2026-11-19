// the Object List: its rows, the selection, the padlocks, the drag of a row by layers, the group
// rows, the search field, and the rows that follow the image of the mode shown

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, drag, editorPage, press, saveAndReopen } from './helpers/editor.mjs';

// regression tests of R10.2 on both platforms with trusted input: the object list of
// navigator/objects.ts, the Text pane for several text blocks, the arrowheads of the marks of equal
// gaps, and the guides written into data-guides. after each edit of the file the text is checked
// when rendered, byte for byte after an undo, again after a redo, and after a save and an open
describe('the rows and selection of the Object List', () => {
  const PLATFORMS = ['mac', 'other'];
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const SECTIONS = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].map((m) => m[0]);
  const MATH = SECTIONS.findIndex((s) => s.includes('<h2>Math, an ordered list, and a zone</h2>'));
  const OBJECTS = '.beeson-edit-objects';
  const ROW = `${OBJECTS} .row`;
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };

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
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.tagName.toLowerCase())`);
  const active = (page) => page.evaluate(`document.activeElement.closest(${js(OBJECTS)}) ? 'list:' + document.activeElement.textContent : document.activeElement.tagName`);
  // the rows of the object list as level, name, and selection, e.g. '1 Formula *'
  const rows = (page) =>
    page.evaluate(`[...document.querySelectorAll(${js(ROW)})].map((r) => r.getAttribute('aria-level') + ' ' + r.querySelector('.name').textContent + (r.getAttribute('aria-selected') === 'true' ? ' *' : ''))`);
  const rowBox = (page, n) =>
    page.evaluate(`(() => { const r = document.querySelectorAll(${js(ROW)})[${n}].getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; })()`);

  // the editor on slide n of the deck of layouts, served over HTTP, with the storage of the browser
  // cleared, or holding the items of storage
  async function load(t, platform, n = MATH, storage = {}) {
    const page = await browser.newPage();
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate(`(() => { localStorage.clear(); for (const [k, v] of Object.entries(${js(storage)})) localStorage.setItem(k, v); })()`);
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(LAYOUTS, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the checks after an edit whose rendered text is edited: the text before it after an undo, the
  // same text after a redo, and a save and an open without problems
  async function checkEdit(page, edited, base = page.source) {
    assert.notEqual(edited, base);
    await undo(page);
    assert.equal(await render(page), base);
    await redo(page);
    assert.equal(await render(page), edited);
    await saveAndReopen(page, `r10-2-${Math.random().toString(36).slice(2)}.html`);
    assert.deepEqual(errors(page), []);
  }

  async function openList(page, platform) {
    await press(page, LIST_KEY[platform]);
    await frames(page);
    assert.equal(await page.evaluate(`!document.querySelector(${js(OBJECTS)}).hidden`), true);
  }

  const FRONT_TO_BACK = [
    '1 Figure: A caption under a zone.',
    '1 Text: A first step A final step',
    '1 Text: where the Coriolis term is…',
    '1 Formula',
    '1 Text: The lead-in of a display',
    '1 Text: Math, an ordered list, and a zone',
  ];

  for (const platform of PLATFORMS) {
    test(`${platform}: View > Object List shows a row for each object from front to back, reached with F6`, async (t) => {
      const page = await load(t, platform);
      assert.equal((await state(page, 'view.objects')).checked, false);
      await openList(page, platform);
      assert.equal((await state(page, 'view.objects')).checked, true);
      assert.deepEqual(await rows(page), FRONT_TO_BACK);
      assert.match(await active(page), /^list:/);
      await press(page, 'Escape');
      assert.equal(await active(page), 'BODY');
      let reached = false;
      for (let i = 0; i < 12 && !reached; i++) {
        await press(page, 'F6');
        reached = (await active(page)).startsWith('list:');
      }
      assert.ok(reached, 'F6 does not reach the object list');
      await page.evaluate('Reveal.slide(0)');
      await frames(page);
      assert.ok((await rows(page)).length > 0);
      assert.notDeepEqual(await rows(page), FRONT_TO_BACK);
      await press(page, LIST_KEY[platform]);
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector(${js(OBJECTS)}).hidden`), true);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: a click, Shift, the command modifier, and the arrow keys select rows, and the list shows the selection of the canvas`, async (t) => {
      const page = await load(t, platform);
      await openList(page, platform);
      await click(page, `${ROW}:nth-child(3)`);
      assert.deepEqual(await selected(page), ['p']);
      assert.equal((await rows(page))[2], '1 Text: where the Coriolis term is… *');
      await click(page, `${ROW}:nth-child(1)`, { modifiers: 'Mod' });
      assert.deepEqual((await selected(page)).sort(), ['figure', 'p']);
      await click(page, `${ROW}:nth-child(1)`, { modifiers: 'Mod' });
      assert.deepEqual(await selected(page), ['p']);
      // the row clicked last is the current row of the arrow keys
      await press(page, 'ArrowDown');
      assert.deepEqual(await selected(page), ['ol']);
      await press(page, 'Shift+ArrowDown');
      assert.deepEqual((await selected(page)).sort(), ['ol', 'p']);
      await click(page, `${ROW}:nth-child(6)`, { modifiers: 'Shift' });
      assert.deepEqual((await selected(page)).sort(), ['h2', 'ol', 'p']);
      // a selection made on the canvas is shown in the list at once
      await press(page, 'Escape');
      await click(page, '.reveal .slides section.present figure.figure-box img');
      assert.deepEqual(await selected(page), ['figure']);
      assert.equal((await rows(page))[0], '1 Figure: A caption under a zone. *');
      assert.equal((await rows(page)).filter((r) => r.endsWith('*')).length, 1);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: the padlock of a row locks and unlocks its object as one entry of the history`, async (t) => {
      const page = await load(t, platform);
      await openList(page, platform);
      await click(page, `${ROW}:nth-child(4) .lock`);
      const edited = await render(page);
      assert.match(edited, /<div class="math[^"]*"[^>]* data-locked>/);
      assert.equal(await page.evaluate(`document.querySelectorAll(${js(ROW)})[3].querySelector('.lock').getAttribute('aria-pressed')`), 'true');
      await checkEdit(page, edited);
      await click(page, `${ROW}:nth-child(4) .lock`);
      assert.equal(await render(page), page.source);
    });

    test(`${platform}: a drag of a row moves its object by the layers of Bring Forward and Send Backward, and a row that cannot move is not dragged`, async (t) => {
      const page = await load(t, platform);
      await openList(page, platform);
      // the list, an element in the flow, is sent behind the other blocks by a z-index under 0
      const list = await rowBox(page, 1);
      const last = await rowBox(page, 5);
      await drag(page, { x: list.x, y: list.y }, { dy: last.bottom - 2 - list.y, steps: 8 });
      assert.equal(await render(page), page.source.replace('<ol>', '<ol style="position: relative; z-index: -1">'));
      await undo(page);
      assert.equal(await render(page), page.source);
      // the heading at the back of the list cannot move further back, and its row is not dragged
      const back = await rowBox(page, 5);
      await drag(page, { x: back.x, y: back.y }, { dy: back.bottom - 2 - back.y, steps: 8 });
      assert.equal(await render(page), page.source);
      assert.equal((await page.evaluate('window.BeesonEditor.status()')).undo, false);
      // the heading is brought in front of the figure by a z-index, which does not move it in the file
      const heading = await rowBox(page, 5);
      const first = await rowBox(page, 0);
      await drag(page, { x: heading.x, y: heading.y }, { dy: first.top + 2 - heading.y, steps: 8 });
      const raised = await render(page);
      assert.equal(raised, page.source.replace('<h2>Math, an ordered list', '<h2 style="position: relative; z-index: 1">Math, an ordered list'));
      assert.equal((await rows(page))[0], '1 Text: Math, an ordered list, and a zone *');
      await undo(page);
      assert.equal(await render(page), page.source);
      // a nudge makes the lead-in a layer, which the figure is then dragged behind
      await click(page, `${ROW}:nth-child(5)`);
      await press(page, 'Escape');
      await press(page, 'ArrowRight');
      const nudged = await render(page);
      // the rows are in the order of the drawing, with the layers over the other blocks. the list,
      // whose items are positioned, is drawn with the layers, over the lead-in written before it
      assert.deepEqual((await rows(page)).slice(0, 3), ['1 Figure: A caption under a zone.', '1 Text: A first step A final step', '1 Text: The lead-in of a display *']);
      const from = await rowBox(page, 0);
      const to = await rowBox(page, 2);
      await drag(page, { x: from.x, y: from.y }, { dy: to.bottom - 2 - from.y, steps: 8 });
      assert.deepEqual((await rows(page)).slice(0, 3), ['1 Text: A first step A final step', '1 Text: The lead-in of a display', '1 Figure: A caption under a zone. *']);
      const edited = await render(page);
      assert.ok(edited.indexOf('<figure class="figure-box') < edited.indexOf('The lead-in of a display'));
      await undo(page);
      assert.equal(await render(page), nudged);
      await redo(page);
      assert.equal(await render(page), edited);
      await saveAndReopen(page, `r10-2-drag-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: the members of a group are rows under its group row, which folds`, async (t) => {
      const page = await load(t, platform);
      await openList(page, platform);
      await click(page, `${ROW}:nth-child(1)`);
      await click(page, `${ROW}:nth-child(4)`, { modifiers: 'Mod' });
      await press(page, 'Escape');
      await press(page, platform === 'mac' ? 'Mod+Alt+G' : 'Mod+G');
      const edited = await render(page);
      assert.deepEqual((await rows(page)).slice(0, 3), ['1 Group *', '2 Figure: A caption under a zone. *', '2 Formula *']);
      await click(page, `${ROW}:nth-child(2)`);
      assert.deepEqual(await selected(page), ['figure']);
      await click(page, `${ROW}:nth-child(1)`);
      assert.deepEqual((await selected(page)).sort(), ['div', 'figure']);
      await click(page, `${ROW}:nth-child(1) .twist`);
      assert.deepEqual((await rows(page)).slice(0, 2), ['1 Group *', '1 Text: A first step A final step']);
      await press(page, 'ArrowRight');
      assert.equal((await rows(page)).length, 7);
      await checkEdit(page, edited);
    });

    test(`${platform}: the search field filters the rows by name`, async (t) => {
      const page = await load(t, platform);
      await openList(page, platform);
      await click(page, `${OBJECTS} input`);
      await page.send('Input.insertText', { text: 'step' });
      await frames(page);
      assert.deepEqual(await rows(page), ['1 Text: A first step A final step']);
      await page.send('Input.insertText', { text: 'zzz' });
      await frames(page);
      assert.deepEqual(await rows(page), []);
      assert.equal(await page.evaluate(`document.querySelector('${OBJECTS} .empty').hidden`), false);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await rows(page), FRONT_TO_BACK);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // the inspector as its tabs, the paragraph style, and the controls of the Text pane that are on or
  // mixed, e.g. 'text.bold=mixed'
  const inspector = (page) =>
    page.evaluate(`({
    tabs: [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].map((t) => t.textContent + (t.getAttribute('aria-selected') === 'true' ? '*' : '')),
    style: document.querySelector('.beeson-edit-inspector .ed-popup')?.textContent ?? null,
    on: [...document.querySelectorAll('.beeson-edit-inspector [data-command^="text."][aria-pressed]')].filter((b) => b.getAttribute('aria-pressed') !== 'false').map((b) => b.dataset.command + '=' + b.getAttribute('aria-pressed')),
  })`);

  for (const platform of PLATFORMS) {
    // the lead-in alone in the accent and bold, then the lead-in and the heading selected
    async function mixedBlocks(t) {
      const page = await load(t, platform);
      await openList(page, platform);
      await click(page, `${ROW}:nth-child(5)`);
      await exec(page, 'text.tone.accent');
      await exec(page, 'text.bold');
      await click(page, `${ROW}:nth-child(6)`, { modifiers: 'Mod' });
      return page;
    }

    test(`${platform}: the Text pane shows the values that several text blocks do not share as mixed, and Bold sets bold on each`, async (t) => {
      const page = await mixedBlocks(t);
      assert.deepEqual(await inspector(page), { tabs: ['Text*', 'Arrange'], style: 'Mixed', on: ['text.bold=mixed', 'text.tone.text=mixed', 'text.tone.accent=mixed', 'text.align.left=true'] });
      const base = await render(page);
      await click(page, '.beeson-edit-inspector button[data-command="text.bold"]');
      assert.equal((await inspector(page)).on[0], 'text.bold=true');
      const bold = await render(page);
      assert.match(bold, /<h2><strong>Math, an ordered list, and a zone<\/strong><\/h2>/);
      assert.match(bold, /<strong><span class="tone-accent">The lead-in of a display<\/span><\/strong>|<span class="tone-accent"><strong>The lead-in of a display<\/strong><\/span>/);
      await checkEdit(page, bold, base);
    });

    test(`${platform}: a swatch of the Text pane colors several text blocks as one entry of the history`, async (t) => {
      const page = await mixedBlocks(t);
      const base = await render(page);
      await click(page, '.beeson-edit-inspector .ed-swatches button[data-command="text.tone.violet"]');
      assert.deepEqual((await inspector(page)).on, ['text.bold=mixed', 'text.tone.violet=true', 'text.align.left=true']);
      const violet = await render(page);
      assert.equal(violet.split('tone-violet').length, 3);
      assert.equal(violet.includes('tone-accent'), false);
      await checkEdit(page, violet, base);
    });

    test(`${platform}: the paragraph style and the kind of list of several blocks that differ are mixed`, async (t) => {
      const page = await load(t, platform);
      await openList(page, platform);
      await click(page, `${ROW}:nth-child(5)`);
      await click(page, `${ROW}:nth-child(6)`, { modifiers: 'Mod' });
      assert.deepEqual(await inspector(page), { tabs: ['Text*', 'Arrange'], style: 'Mixed', on: ['text.tone.text=true', 'text.align.left=true'] });
      await click(page, `${ROW}:nth-child(6)`, { modifiers: 'Mod' });
      await click(page, `${ROW}:nth-child(2)`, { modifiers: 'Mod' });
      assert.deepEqual((await inspector(page)).on, ['text.tone.text=true', 'text.align.left=true', 'text.list.none=mixed', 'text.list.ol=mixed']);
      // a formula among them leaves Arrange alone
      await click(page, `${ROW}:nth-child(4)`, { modifiers: 'Mod' });
      assert.deepEqual((await inspector(page)).tabs, []);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`${platform}: a mark of equal gaps is a line with an arrowhead at each end, in the color of the guides`, async (t) => {
      const page = await load(t, platform);
      await openList(page, platform);
      await click(page, `${ROW}:nth-child(4)`);
      // the formula is moved down, then dragged by its handle back to the middle between the lead-in
      // and the paragraph under it
      const handle = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-handle')].find((d) => !d.hidden && d.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const middle = await page.evaluate(`(() => {
      const s = document.querySelector('.reveal .slides section.present');
      const [a, m, c] = [':scope > p', ':scope > div.math', ':scope > p.fragment'].map((q) => s.querySelector(q).getBoundingClientRect());
      return (a.bottom + c.top - m.height) / 2 - m.top;
    })()`);
      await drag(page, handle, { dy: 60, steps: 6 });
      const moved = await render(page);
      await drag(page, { x: handle.x, y: handle.y + 60 }, { dy: middle - 58, steps: 10, hold: true });
      const marks = await page.evaluate(`(() => {
      const probe = document.body.appendChild(document.createElement('span'));
      probe.style.color = 'var(--ed-guide)';
      const guide = getComputedStyle(probe).color;
      probe.remove();
      return [...document.querySelectorAll('.beeson-gap')].filter((d) => !d.hidden).map((d) => {
        const paths = d.querySelectorAll('svg path');
        return { axis: d.className, heads: (paths[1]?.getAttribute('d').match(/Z/g) ?? []).length, color: getComputedStyle(paths[0]).stroke === guide, fill: getComputedStyle(paths[1]).fill === guide };
      });
    })()`);
      assert.equal(marks.length, 2);
      for (const m of marks) assert.deepEqual(m, { axis: 'beeson-gap v', heads: 2, color: true, fill: true });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: handle.x, y: handle.y + middle + 2, button: 'left', clickCount: 1 });
      await frames(page);
      assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-gap')].filter((d) => !d.hidden).length`), 0);
      await checkEdit(page, await render(page), moved);
    });
  }

  // the guides drawn on the canvas, as [axis, place in slide px]
  const drawnGuides = (page) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-hand-guide')].filter((g) => !g.hidden && !g.classList.contains('off')).map((g) => [g.dataset.axis, Number(g.dataset.at)]).sort()`);
  const MATH_TAG = '<section>\n  <h2>Math, an ordered list, and a zone</h2>';
  const GUIDES_KEY = `beeson-edit-guides:/${LAYOUTS}`;
  // the guides are shown with the rulers
  const RULERS = { 'beeson-edit-rulers': '1' };

  for (const platform of PLATFORMS) {
    test(`${platform}: guides kept in the storage of the browser are shown, and written into data-guides at the next change of the guides of their slide`, async (t) => {
      const legacy = SECTIONS.map((_, i) => (i === MATH ? { x: [300], y: [] } : i === MATH + 1 ? { x: [], y: [200] } : { x: [], y: [] }));
      const page = await load(t, platform, MATH, { [GUIDES_KEY]: js(legacy), ...RULERS });
      assert.deepEqual(await drawnGuides(page), [['x', 300]]);
      await byteExact(page);
      await exec(page, 'view.guides.add', { x: [], y: [500] });
      await frames(page);
      assert.deepEqual(await drawnGuides(page), [['x', 300], ['y', 500]]);
      const edited = await render(page);
      assert.equal(edited, page.source.replace(MATH_TAG, MATH_TAG.replace('<section>', '<section data-guides="x300 y500">')));
      // the guides of the slide are no longer in the storage, and those of the next slide are kept
      const kept = JSON.parse(await page.evaluate(`localStorage.getItem(${js(GUIDES_KEY)})`));
      assert.deepEqual([kept[MATH], kept[MATH + 1]], [{ x: [], y: [] }, { x: [], y: [200] }]);
      await undo(page);
      await frames(page);
      assert.deepEqual(await drawnGuides(page), [['x', 300]]);
      assert.deepEqual(JSON.parse(await page.evaluate(`localStorage.getItem(${js(GUIDES_KEY)})`))[MATH], { x: [300], y: [] });
      await checkEdit(page, edited, page.source);
      assert.deepEqual(await drawnGuides(page), [['x', 300], ['y', 500]]);
      // the guides of the next slide, still in the storage, are shown there
      await page.evaluate(`Reveal.slide(${MATH + 1})`);
      await frames(page);
      assert.deepEqual(await drawnGuides(page), [['y', 200]]);
    });

    test(`${platform}: Clear All Guides on Slide takes data-guides off its section, and Paste Guides writes it on another`, async (t) => {
      const page = await load(t, platform, MATH, RULERS);
      await exec(page, 'view.guides.add', { x: [960], y: [540] });
      await exec(page, 'slide.guides.copy');
      await page.evaluate(`Reveal.slide(${MATH + 1})`);
      await frames(page);
      await exec(page, 'slide.guides.paste');
      await frames(page);
      assert.deepEqual(await drawnGuides(page), [['x', 960], ['y', 540]]);
      const narrow = '<section class="narrow">\n  <h2>A narrow slide</h2>';
      const pasted = await render(page);
      assert.ok(pasted.includes(narrow.replace('class="narrow"', 'class="narrow" data-guides="x960 y540"')));
      await exec(page, 'view.guides.clear');
      await frames(page);
      assert.deepEqual(await drawnGuides(page), []);
      const cleared = await render(page);
      assert.ok(cleared.includes(narrow));
      await checkEdit(page, cleared, pasted);
    });
  }
});

// regression tests of R11.3 on both platforms with trusted input: the drag of a group row of the
// object list, checked when rendered, after each undo and redo, and after a save and an open of the
// saved text
describe('the drag of a group row', () => {
  const GROUPS = 'test/pages/editor-r11-3.html';
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
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg ? `, ${js(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

  // the editor on slide n of deck, served over HTTP, with the storage of the browser cleared and the
  // Format pane shown
  async function load(t, platform, { deck = GROUPS, n = 0 } = {}) {
    const page = await browser.newPage();
    t.after(() => page.close().catch(() => {}));
    await page.send('Page.bringToFront');
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear(); true');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(status.problems, []);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  let saves = 0;
  async function saved(page) {
    const { text } = await saveAndReopen(page, `r11-3-${++saves}.html`);
    page.source = text;
    await byteExact(page);
  }

  const OBJECTS = '.beeson-edit-objects';
  const ROW = `${OBJECTS} .row`;
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };
  // the rows of the object list as level, name, and selection, e.g. '1 Group *'
  const rows = (page) =>
    page.evaluate(`[...document.querySelectorAll(${js(ROW)})].map((r) => r.getAttribute('aria-level') + ' ' + r.querySelector('.name').textContent + (r.getAttribute('aria-selected') === 'true' ? ' *' : ''))`);
  const rowBox = (page, n) =>
    page.evaluate(`(() => { const r = document.querySelectorAll(${js(ROW)})[${n}].getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; })()`);
  const GROUPED = readFileSync(GROUPS, 'utf8');
  const figure = (name) => {
    const end = GROUPED.indexOf(`<figcaption class="caption">${name}</figcaption>\n      </figure>`);
    return GROUPED.slice(GROUPED.lastIndexOf('      <figure', end), GROUPED.indexOf('</figure>', end) + '</figure>\n'.length);
  };
  // the deck of groups with its figures in the order of names, from back to front
  const ordered = (...names) => {
    const first = GROUPED.indexOf(figure('A'));
    const last = GROUPED.indexOf(figure('C')) + figure('C').length;
    return GROUPED.slice(0, first) + names.map(figure).join('') + GROUPED.slice(last);
  };

  for (const platform of PLATFORMS) {
    // a group row could not be dragged. it now moves its members in the order of the layers as one
    // object, and they keep their order among themselves
    test(`a group row is dragged as one object, whose members keep their order, as one entry (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: GROUPS, n: 0 });
      await press(page, LIST_KEY[platform]);
      await frames(page);
      assert.deepEqual(await rows(page), ['1 Group', '2 Figure: C', '2 Figure: A', '1 Figure: B', '1 Text: A group around a figure']);
      // the group behind B: C passes B, and A stays behind C
      let from = await rowBox(page, 0);
      let to = await rowBox(page, 3);
      await drag(page, { x: from.x, y: from.y }, { dy: to.bottom - 2 - from.y, steps: 8 });
      await frames(page);
      assert.deepEqual(await rows(page), ['1 Figure: B', '1 Group *', '2 Figure: C *', '2 Figure: A *', '1 Text: A group around a figure']);
      const behind = ordered('A', 'C', 'B');
      assert.equal(await render(page), behind);
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Reorder');
      // the group in front of B again: both members pass B, in their order
      from = await rowBox(page, 1);
      to = await rowBox(page, 0);
      await drag(page, { x: from.x, y: from.y }, { dy: to.top + 2 - from.y, steps: 8 });
      await frames(page);
      assert.deepEqual(await rows(page), ['1 Group *', '2 Figure: C *', '2 Figure: A *', '1 Figure: B', '1 Text: A group around a figure']);
      const front = ordered('B', 'A', 'C');
      assert.equal(await render(page), front);
      await undo(page);
      assert.equal(await render(page), behind);
      await undo(page);
      assert.equal(await render(page), page.source);
      await redo(page);
      assert.equal(await render(page), behind);
      await redo(page);
      assert.equal(await render(page), front);
      await saved(page);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R12.8 on both platforms with trusted input: the keys of the Arrange menu in
// the Object List, and the drop line of a row dragged in the Object List. after each edit of the
// file the text is checked byte for byte after an undo and again after a redo
describe('Arrange keys and the drop line of rows', () => {
  const DECK = 'test-deck.html';
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
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const settle = async (page) => {
    await page.evaluate('new Promise((d) => setTimeout(() => d(true), 120))');
    await frames(page);
  };

  // the editor on slide n, counted from 0, of deck, served over HTTP with the storage cleared
  async function load(t, platform, { deck = DECK, n = 0 } = {}) {
    const page = await browser.newPage();
    t.after(() => page.close().catch(() => {}));
    await page.send('Page.bringToFront');
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear(); true');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const undoKey = (page) => press(page, 'Mod+Z');
  const redoKey = (page) => press(page, 'Mod+Shift+Z');

  const OBJECTS = '.beeson-edit-objects';
  const ROW = `${OBJECTS} .row`;
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };
  // the rows of the object list as level, name, and selection, e.g. '1 Group *'
  const rows = (page) =>
    page.evaluate(`[...document.querySelectorAll(${js(ROW)})].map((r) => r.getAttribute('aria-level') + ' ' + r.querySelector('.name').textContent + (r.getAttribute('aria-selected') === 'true' ? ' *' : ''))`);
  const rowBox = (page, n) =>
    page.evaluate(`(() => { const r = document.querySelectorAll(${js(ROW)})[${n}].getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; })()`);
  const KEYS = {
    mac: { group: 'Mod+Alt+G', lock: 'Mod+L', backward: 'Mod+Alt+Shift+B' },
    other: { group: 'Mod+G', lock: 'Mod+L', backward: 'Mod+ArrowDown' },
  };

  for (const platform of PLATFORMS) {
    // plots-objects-outline-4: in Keynote's object list and PowerPoint's Selection Pane, the keys of
    // the Arrange menu act on the rows chosen. they did nothing while a row had the focus
    test(`the keys of Group, Lock, and Send Backward act on the rows chosen in the Object List (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 4 });
      await press(page, LIST_KEY[platform]);
      await frames(page);
      const start = await rows(page);
      assert.equal(start.length, 4);
      await click(page, await rowBox(page, 0));
      await click(page, await rowBox(page, 2), { modifiers: 'Mod' });
      await frames(page);
      assert.deepEqual((await rows(page)).filter((r) => r.endsWith('*')).length, 2);
      await press(page, KEYS[platform].group);
      await settle(page);
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Group');
      assert.equal((await rows(page))[0], '1 Group *');
      assert.equal(await page.evaluate(`!!document.activeElement.closest('${ROW}')`), true, 'the focus left the Object List');
      const grouped = await render(page);
      await undoKey(page);
      await settle(page);
      await byteExact(page);
      await redoKey(page);
      await settle(page);
      assert.equal(await render(page), grouped);
      await undoKey(page);
      await settle(page);
      // the figure alone, locked, then sent backward, from its focused row
      await click(page, await rowBox(page, 0));
      await press(page, KEYS[platform].lock);
      await settle(page);
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Lock');
      assert.match(await render(page), /<figure class="figure-box"[^>]* data-locked/);
      await undoKey(page);
      await settle(page);
      await byteExact(page);
      await click(page, await rowBox(page, 0));
      await press(page, KEYS[platform].backward);
      await settle(page);
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Send Backward');
      assert.deepEqual((await rows(page)).map((r) => r.replace(' *', '')), [start[1], start[0], start[2], start[3]]);
      await undoKey(page);
      await settle(page);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  const dropLine = (page) => page.evaluate(`(() => { const d = document.querySelector('${OBJECTS} .drop'); return d && !d.hidden ? d.getBoundingClientRect().top + 1 : null; })()`);

  for (const platform of PLATFORMS) {
    // plots-objects-outline-5: the drop line of a row drag marked a gap past the layers that the
    // figure can pass, and the figure stopped short of it. the line now stops at the last gap that
    // Send to Back reaches, and the row lands at the line
    test(`the drop line of a row drag in the Object List stops where the object can go (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 4 });
      await press(page, LIST_KEY[platform]);
      await frames(page);
      const start = (await rows(page)).map((r) => r.replace(' *', ''));
      assert.match(start[0], /Figure/);
      const from = await rowBox(page, 0);
      const last = await rowBox(page, 3);
      await drag(page, { x: from.x, y: from.y }, { dy: last.bottom + 10 - from.y, steps: 8, hold: true });
      // the figure passes the texts in the flow, hence Send to Back reaches the bottom of the list
      const line = await dropLine(page);
      assert.ok(line !== null && Math.abs(line - last.bottom) <= 2, `the drop line is at ${line}, not at the bottom of row 3 (${last.bottom})`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x, y: last.bottom + 10, button: 'left', clickCount: 1 });
      await settle(page);
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Reorder');
      const now = (await rows(page)).map((r) => r.replace(' *', ''));
      assert.deepEqual(now, [start[1], start[2], start[3], start[0]]);
      await undoKey(page);
      await settle(page);
      await byteExact(page);
      // the heading in the flow, which Bring to Front puts over the figure by a z-index since R13.1,
      // shows its drop line at the top of the list and lands there
      const h2 = await rowBox(page, 3);
      await drag(page, { x: h2.x, y: h2.y }, { dy: from.top + 2 - h2.y, steps: 8, hold: true });
      const top = await dropLine(page);
      assert.ok(top !== null && Math.abs(top - from.top) <= 2, `the drop line is at ${top}, not at the top of row 0 (${from.top})`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: h2.x, y: from.top + 2, button: 'left', clickCount: 1 });
      await settle(page);
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Reorder');
      assert.deepEqual((await rows(page)).map((r) => r.replace(' *', '')), [start[3], start[0], start[1], start[2]]);
      await undoKey(page);
      await settle(page);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }
});

// the Steps pane and the Object List, R35.2, on both platforms. after a flip of the mode, the rows
// of a dark and light pair of pictures in the section are bound to the twin that is shown. a folded
// group row of the Object List selects and locks the members that its group has now, after a
// Delete, an undo, a Duplicate of a member, and Arrange > Group. a picture selected across a flip
// keeps its rows marked, while the selection holds the hidden twin
describe('rows of a pair follow the shown picture', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r35-2.html';

  let browser;
  before(async () => { browser = await launch(); });
  after(async () => { await browser?.close(); });

  let last = null;
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}).then(() => true)`);

  async function deckPage(platform, slide = 0) {
    await last?.close().catch(() => {});
    const page = await editorPage(browser, { deck: DECK, query: `edit&still&edit-platform=${platform}`, page: { width: 1600, height: 1000 }, clear: true });
    last = page;
    if (slide) await page.evaluate(`Reveal.slide(${slide})`);
    if (!(await page.evaluate(`window.BeesonEditor.state('view.objects').checked`))) await exec(page, 'view.objects');
    await frames(page);
    return page;
  }

  // the selection, each element named by its class or its words, and marked when it is hidden or
  // out of the page
  const SELECTION = `window.BeesonEditor.selection().map((e) => (e.localName === 'img' ? 'img.' + e.className.split(' ')[0] : e.textContent.trim()) + (!e.isConnected ? ' (detached)' : e.getClientRects().length ? '' : ' (hidden)'))`;
  const selection = async (page) => { await frames(page); return page.evaluate(SELECTION); };

  // the center of the row of the Object List with the name, or of the part of this row
  const objectRow = (page, name, part = null) => page.evaluate(`(() => {
  const r = [...document.querySelectorAll('.beeson-edit-objects .row')].find((r) => r.querySelector('.name').textContent === ${JSON.stringify(name)});
  if (!r) return null;
  const b = (${part ? `r.querySelector(${JSON.stringify(part)})` : 'r'}).getBoundingClientRect();
  return { x: b.left + b.width * ${part ? 0.5 : 0.6}, y: b.top + b.height / 2 };
})()`);
  const objectRows = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-objects .row')].map((r) => r.getAttribute('aria-level') + ':' + r.querySelector('.name').textContent + (r.getAttribute('aria-expanded') ? ' [' + r.getAttribute('aria-expanded') + ']' : ''))`);

  // the words of the row of the picture pair in the Steps pane, and the point at its center
  const STEP_ROW = `[...document.querySelectorAll('.beeson-edit-side .rows .row')].find((r) => r.textContent.includes('A figure'))`;
  const stepRow = (page) => page.evaluate(`(() => {
  const r = ${STEP_ROW};
  if (!r) return null;
  const b = r.getBoundingClientRect();
  return { text: r.querySelector('.body').textContent, x: b.left + b.width * 0.6, y: b.top + b.height / 2 };
})()`);

  // a press with Mod at a point of a row. on a Mac host, a trusted press with Ctrl also opens the
  // menu of a right click, hence it is dispatched there for the platform other
  async function modPress(page, at) {
    const ctrl = process.platform === 'darwin' && (await page.evaluate(`new URLSearchParams(location.search).get('edit-platform')`)) === 'other';
    if (!ctrl) await click(page, at, { modifiers: 'Mod' });
    else {
      await page.evaluate(`(() => {
      const el = document.elementFromPoint(${at.x}, ${at.y});
      for (const type of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ctrlKey: true, clientX: ${at.x}, clientY: ${at.y} }));
      return true;
    })()`);
    }
    await frames(page);
  }

  // the picture that is shown, the marked rows of the two lists, whether the fields of the step are
  // shown, and the picture at which the number of the step is drawn
  const MARKED = `({
  shown: [...document.querySelectorAll('section.present img')].filter((i) => i.getClientRects().length).map((i) => 'img.' + i.className.split(' ')[0]),
  steps: [...document.querySelectorAll('.beeson-edit-side .rows .row.selected')].map((r) => r.querySelector('.body').textContent),
  objects: [...document.querySelectorAll('.beeson-edit-objects .row[aria-selected="true"]')].map((r) => r.textContent),
  fields: !document.querySelector('.beeson-edit-side .detail').classList.contains('off'),
  badge: [...document.querySelectorAll('.beeson-badge')].map((b) => b.owner?.localName === 'img' ? 'img.' + b.owner.className.split(' ')[0] : null).filter(Boolean),
})`;

  // asserts that each way to the picture pair reaches the twin that is shown, and that its Steps row
  // reads the alt of this twin
  async function pairBound(page, twin, alt) {
    await frames(page);
    await click(page, await objectRow(page, 'Image'));
    assert.deepEqual(await selection(page), [twin], 'the row Image of the Object List selects the hidden twin');
    const row = await stepRow(page);
    assert.ok(row.text.startsWith(alt), `the Steps row reads ${row.text}`);
    const marked = await page.evaluate(MARKED);
    assert.deepEqual(marked.shown, [twin]);
    assert.deepEqual(marked.badge, [twin], 'the number of the step is not drawn at the shown picture');
    assert.deepEqual(marked.objects, ['Image']);
    assert.equal(marked.steps.length, 1, 'the row Image of the Object List does not mark the Steps row');
    await press(page, 'Escape');
    await frames(page);
    const at = await stepRow(page);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await frames(page);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-hover')].map((e) => e.localName + '.' + [...e.classList].find((c) => /^for-/.test(c)))`), [twin], 'the hover on the Steps row marks the hidden twin');
    await click(page, at);
    assert.deepEqual(await selection(page), [twin], 'the Steps row selects the hidden twin');
    await press(page, 'Escape');
    // a click on the picture on the slide marks its rows and shows the fields Start, Delay, and Effect
    await click(page, { x: 100, y: 950 });
    await click(page, 'section.present img');
    assert.deepEqual(await selection(page), [twin]);
    const on = await page.evaluate(MARKED);
    assert.equal(on.steps.length, 1, 'a click on the shown picture does not mark its Steps row');
    assert.ok(on.steps[0].startsWith(alt));
    assert.deepEqual(on.objects, ['Image']);
    assert.equal(on.fields, true, 'the fields Start, Delay, and Effect are hidden');
  }

  for (const platform of PLATFORMS) {
    // the pair of slide 1 has one alt, hence the words of its Steps row stay the same at a flip, and
    // the pair of slide 3 has two alts
    for (const [slide, dark, light] of [[0, 'A figure', 'A figure'], [2, 'A figure, dark', 'A figure, light']]) {
      test(`the rows of the Steps pane and of the Object List follow the twin shown after a flip of the mode, on slide ${slide + 1} (${platform})`, async () => {
        const page = await deckPage(platform, slide);
        await exec(page, 'view.steps');
        await frames(page);
        await pairBound(page, 'img.for-dark', dark);
        // D flips the mode while the hidden twin of the next mode is selected
        await press(page, 'Escape');
        await click(page, 'section.present img');
        await press(page, 'D');
        await frames(page);
        assert.equal(await page.evaluate('document.documentElement.dataset.theme'), 'light');
        await pairBound(page, 'img.for-light', light);
        // View > Slide in Dark Mode flips it back, with the selection cleared
        await press(page, 'Escape');
        await exec(page, 'view.slideDark');
        await frames(page);
        assert.equal(await page.evaluate('document.documentElement.dataset.theme'), 'dark');
        await pairBound(page, 'img.for-dark', dark);
        assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
      });

      test(`the rows of a picture selected on the slide stay marked across a flip of the mode, on slide ${slide + 1} (${platform})`, async () => {
        const page = await deckPage(platform, slide);
        await exec(page, 'view.steps');
        await frames(page);
        await click(page, { x: 100, y: 950 });
        await click(page, 'section.present img');
        // D and then View > Slide in Dark Mode, each while the picture stays selected
        for (const [flip, theme, twin, alt] of [['D', 'light', 'img.for-light', light], ['view.slideDark', 'dark', 'img.for-dark', dark]]) {
          if (flip === 'D') await press(page, 'D');
          else await exec(page, flip);
          await frames(page);
          assert.equal(await page.evaluate('document.documentElement.dataset.theme'), theme);
          assert.equal((await selection(page)).length, 1);
          const marked = await page.evaluate(MARKED);
          assert.deepEqual(marked.shown, [twin]);
          assert.equal(marked.steps.length, 1, `after ${flip}, the Steps row of the selected picture is not marked`);
          assert.ok(marked.steps[0].startsWith(alt));
          assert.deepEqual(marked.objects, ['Image'], `after ${flip}, the row Image of the Object List is not marked`);
          assert.equal(marked.fields, true, `after ${flip}, the fields Start, Delay, and Effect are hidden`);
          assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-badge.on').length`), 1, `after ${flip}, the number of the step is not marked`);
        }
        assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
      });
    }

    for (const slide of [0, 2]) {
      test(`a Mod+click on the marked row of a picture selected across a flip takes it off the selection, on slide ${slide + 1} (${platform})`, async () => {
        const page = await deckPage(platform, slide);
        await exec(page, 'view.steps');
        await frames(page);
        for (const list of ['Object List', 'Steps pane']) {
          const row = () => (list === 'Object List' ? objectRow(page, 'Image') : stepRow(page));
          await click(page, { x: 100, y: 950 });
          await click(page, 'section.present img');
          assert.equal((await selection(page)).length, 1);
          await press(page, 'D');
          await frames(page);
          assert.ok((await selection(page))[0].endsWith('(hidden)'), 'the selection does not hold the hidden twin after D');
          await modPress(page, await row());
          assert.deepEqual(await selection(page), [], `a Mod+click on the marked row of the ${list} keeps the picture selected`);
          const marked = await page.evaluate(MARKED);
          assert.deepEqual([marked.steps.length, marked.objects.length], [0, 0], `rows stay marked after the Mod+click in the ${list}`);
          // a second Mod+click selects the twin that is shown
          await modPress(page, await row());
          const now = await selection(page);
          assert.equal(now.length, 1, `a second Mod+click in the ${list} selects ${JSON.stringify(now)}`);
          assert.ok(!now[0].endsWith('(hidden)'), `a second Mod+click in the ${list} selects the hidden twin`);
          await press(page, 'D');
          await frames(page);
        }
        assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
      });
    }

    test(`a folded group row selects and locks the members of its group after a Delete and its undo (${platform})`, async () => {
      const page = await deckPage(platform, 1);
      await click(page, await objectRow(page, 'Rectangle: Gamma'));
      await click(page, await objectRow(page, 'Group', '.twist'));
      assert.deepEqual(await objectRows(page), ['1:Rectangle: Delta', '1:Group [false]', '1:Text: A paragraph.', '1:Text: Groups']);
      assert.deepEqual(await selection(page), ['Gamma']);
      await press(page, 'Delete');
      await frames(page);
      await click(page, await objectRow(page, 'Group'));
      assert.deepEqual(await selection(page), ['Alpha', 'Beta'], 'the folded row selects the deleted member');
      await click(page, await objectRow(page, 'Group', '.lock'));
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('section.present .shape[data-locked]').length`), 2);
      // the undo of the lock and of the Delete brings the file back
      await press(page, 'Mod+Z');
      await press(page, 'Mod+Z');
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
      await click(page, await objectRow(page, 'Group'));
      assert.deepEqual(await selection(page), ['Alpha', 'Beta', 'Gamma'], 'the folded row does not select the member brought back by the undo');
      assert.deepEqual(await objectRows(page), ['1:Rectangle: Delta', '1:Group [false]', '1:Text: A paragraph.', '1:Text: Groups']);
    });

    test(`a folded group row selects and locks the members of its group after a Duplicate and Arrange > Group (${platform})`, async () => {
      const page = await deckPage(platform, 1);
      await click(page, await objectRow(page, 'Rectangle: Gamma'));
      await click(page, await objectRow(page, 'Group', '.twist'));
      await exec(page, 'edit.duplicate');
      await frames(page);
      // the copy of a lone member is put outside the group, by copiedGroups of model/groups.ts
      const group = await page.evaluate(`[...document.querySelectorAll('section.present .shape')].map((s) => s.getAttribute('data-group'))`);
      assert.deepEqual(group, ['g1', 'g1', 'g1', null, null]);
      assert.deepEqual(await objectRows(page), ['1:Rectangle: Delta', '1:Rectangle: Gamma', '1:Group [false]', '1:Text: A paragraph.', '1:Text: Groups']);
      await click(page, await objectRow(page, 'Group'));
      assert.deepEqual(await selection(page), ['Alpha', 'Beta', 'Gamma']);
      await click(page, await objectRow(page, 'Group', '.lock'));
      await frames(page);
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('section.present .shape')].map((s) => s.hasAttribute('data-locked'))`), [true, true, true, false, false]);
      assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-objects .row')].find((r) => r.querySelector('.name').textContent === 'Group').querySelector('.lock').getAttribute('aria-pressed')`), 'true');
      await press(page, 'Mod+Z');
      await frames(page);
      // Arrange > Group of the folded group and Delta puts both in a new group, under which the
      // folded row keeps its three members
      await click(page, await objectRow(page, 'Group'));
      await click(page, await objectRow(page, 'Rectangle: Delta'), { modifiers: 'Shift' });
      assert.deepEqual(await selection(page), ['Alpha', 'Beta', 'Gamma', 'Delta']);
      await exec(page, 'arrange.group');
      await frames(page);
      assert.deepEqual(await objectRows(page), ['1:Group [true]', '2:Rectangle: Delta', '2:Group [false]', '1:Rectangle: Gamma', '1:Text: A paragraph.', '1:Text: Groups']);
      // the folded row of g1, under the row of the new group
      const inner = (part) => page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-objects .row')].filter((r) => r.querySelector('.name').textContent === 'Group')[1]; const b = (${part ? `r.querySelector('${part}')` : 'r'}).getBoundingClientRect(); return { x: b.left + b.width * ${part ? 0.5 : 0.6}, y: b.top + b.height / 2 }; })()`);
      await click(page, await inner());
      assert.deepEqual(await selection(page), ['Alpha', 'Beta', 'Gamma']);
      await click(page, await inner('.lock'));
      await frames(page);
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('section.present .shape')].map((s) => s.hasAttribute('data-locked'))`), [true, true, true, false, false]);
      await press(page, 'Mod+Z');
      await frames(page);
      // the undo of the Group and of the Duplicate leaves the folded row with the three members
      await press(page, 'Mod+Z');
      await press(page, 'Mod+Z');
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
      await click(page, await objectRow(page, 'Group'));
      assert.deepEqual(await selection(page), ['Alpha', 'Beta', 'Gamma'], 'the folded row selects the copy that the undo took off');
      await click(page, await objectRow(page, 'Group', '.lock'));
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('section.present .shape[data-locked]').length`), 3);
      await press(page, 'Mod+Z');
      await press(page, 'Mod+Shift+Z');
      await frames(page);
      // the rendered text, opened again, has the three locks and every block paired
      const text = await page.evaluate('window.BeesonEditor.render()');
      assert.equal((text.match(/data-locked/g) ?? []).length, 3);
      assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(text)})`)).problems, []);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), text);
    });
  }
});
