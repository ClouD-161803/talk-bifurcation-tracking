// the shell of the editor: the regions of the window, the menus and the context menus drawn from
// the registry of commands, the dialogs, the stage of the slide with its zoom, and the order of the
// focus. the commands that the packages of the plan have not defined yet are defined by the tests

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';
import { click, clickText, contrast, editorPage, GROUND, INK, press, type } from './helpers/editor.mjs';
import { serve } from '../scripts/webdriver.mjs';

const scheme = (page, value) => page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
const frames = (page) => page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');

// a regression test of the edge of the slide, which was not seen since the page and the slide were
// both painted in --bg: the pasteboard around the slide must differ from the slide in both modes
test('the slide is set off from the pasteboard in both modes of the slide', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  for (const mode of ['dark', 'light']) {
    await page.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(mode)}`);
    await frames(page);
    const look = await page.evaluate(`(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--bg)';
      document.querySelector('.reveal').append(probe);
      const slide = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { slide, pasteboard: getComputedStyle(document.body).backgroundColor, shadow: getComputedStyle(document.querySelector('.reveal')).boxShadow };
    })()`);
    assert.notEqual(look.pasteboard, look.slide, `${mode}: the pasteboard is the color of the slide`);
    assert.notEqual(look.shadow, 'none', `${mode}: the slide has no shadow`);
  }
  assert.deepEqual(page.errors, []);
});

// a regression test of the focus left on Slides and Steps after a pointer click, since nav.ts and
// steps.ts wire them without the blur of wire()
test('a pointer click on Navigator or Steps leaves the focus off the button', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  for (const name of ['Navigator', 'Steps']) {
    const at = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-bottom button')].find((b) => b.textContent === ${JSON.stringify(name)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await clickText(page, at);
    await frames(page);
    assert.notEqual(await page.evaluate('document.activeElement.textContent'), name, `the focus is left on ${name}`);
  }
  assert.deepEqual(page.errors, []);
});

// a regression test of the order of Tab, in which the slide came before the toolbar, since the
// shell was appended after .reveal
test('Tab from the start of the page reaches the bars before the slide', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  // the focus is put on a mark at the start of the body, from which Tab goes on in the order of the DOM
  await page.evaluate(`{ const mark = document.createElement('span'); mark.id = 'start'; mark.tabIndex = -1; document.body.prepend(mark); mark.focus(); }`);
  await press(page, 'Tab');
  const first = await page.evaluate(`(() => { const a = document.activeElement; return { inSlide: !!a.closest('.reveal'), inBars: !!a.closest('.beeson-edit-header, .beeson-edit-top') }; })()`);
  assert.deepEqual(first, { inSlide: false, inBars: true });
  assert.deepEqual(page.errors, []);
});

// a command of a package that is not built yet, defined in the page through the shell
const define = (page, command) => page.evaluate(`window.BeesonEditorShell.define(${command})`);
const boxOf = (page, selector) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`);

test('the regions have the sizes of the plan at 1440 by 900, and the slide is fitted with its pasteboard', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser, { page: { width: 1440, height: 900 } });
  await page.evaluate(`window.BeesonEditor.exec('view.notes'); window.BeesonEditor.exec('view.steps'); window.BeesonEditor.setPane(160)`);
  await frames(page);
  assert.equal((await boxOf(page, '.beeson-edit-titlebar')).h, 28);
  assert.equal((await boxOf(page, '.beeson-edit-top')).h, 52);
  assert.equal((await boxOf(page, '.beeson-edit-bottom')).h, 28);
  assert.equal((await boxOf(page, '.beeson-edit-nav')).w, 200);
  assert.equal((await boxOf(page, '.beeson-edit-inspector')).w, 288);
  const cell = await boxOf(page, '.beeson-edit-canvas');
  assert.deepEqual([cell.w, cell.h], [952, 631]);
  const stage = await page.evaluate(`(() => { const s = window.BeesonEditorShell.stage; const r = document.querySelector('.reveal .slides').getBoundingClientRect(); return { scale: s.scale, reveal: Reveal.getScale(), zoom: s.zoom, origin: s.origin, left: r.left, top: r.top, width: r.width, viewport: s.viewport.toJSON() }; })()`);
  assert.equal(stage.scale, 0.46);
  assert.equal(stage.reveal, 0.46);
  assert.equal(stage.zoom, null);
  assert.ok(Math.abs(stage.origin.x - stage.left) < 0.5 && Math.abs(stage.origin.y - stage.top) < 0.5, JSON.stringify(stage));
  // a margin of at least 32 px of pasteboard is left around the slide
  assert.ok(stage.left - stage.viewport.left >= 32 && stage.viewport.right - stage.left - stage.width >= 32, JSON.stringify(stage));
  // the slide sits in the canvas cell, and the notes in the cell under it
  const notes = await boxOf(page, '.reveal section.present > aside.notes');
  const pane = await boxOf(page, '.beeson-edit-pane');
  assert.ok(Math.abs(notes.x - pane.x) <= 1 && Math.abs(notes.y - pane.y) <= 1 && Math.abs(notes.w - pane.w) <= 1, JSON.stringify({ notes, pane }));
  assert.deepEqual(page.errors, []);
});

test('the chrome follows the color scheme of the system, and D flips only the slide', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  const colors = () => page.evaluate(`(() => ({ header: getComputedStyle(document.querySelector('.beeson-edit-header')).backgroundColor, nav: getComputedStyle(document.querySelector('.beeson-edit-nav')).backgroundColor, text: getComputedStyle(document.querySelector('.beeson-edit-top .tb')).color, slide: getComputedStyle(document.querySelector('.reveal')).backgroundColor, thumb: getComputedStyle(document.querySelector('.beeson-edit-nav .row .pic')).backgroundColor }))()`);
  await scheme(page, 'light');
  await page.evaluate(`document.activeElement.blur()`);
  const before = await colors();
  await press(page, 'D');
  await page.waitFor(`document.documentElement.dataset.theme === 'light'`);
  await frames(page);
  const after = await colors();
  assert.deepEqual({ ...after, slide: null, thumb: null }, { ...before, slide: null, thumb: null });
  assert.notEqual(after.slide, before.slide);
  // a thumbnail of the navigator is drawn in the mode of the slide, not in the colors of the chrome
  assert.equal(before.thumb, before.slide);
  assert.equal(after.thumb, after.slide);
  await scheme(page, 'dark');
  const dark = await colors();
  assert.notEqual(dark.header, before.header);
  assert.notEqual(dark.text, before.text);
  assert.deepEqual(page.errors, []);
});

for (const platform of ['mac', 'other']) {
  test(`a menu of the menu bar is opened, walked, and run with the keys of the platform ${platform}`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await editorPage(browser, { query: `edit&still&edit-platform=${platform}` });
    await define(page, `{ id: 'test.box', label: 'Text Box', keys: { mac: ['Mod+Shift+K'], other: ['Mod+Shift+K'] }, menu: { bar: 'Insert', group: 'text', order: 1 }, run: () => { window.ran = (window.ran ?? 0) + 1; } }`);
    await define(page, `{ id: 'test.off', label: 'Formula', enabled: () => false, menu: { bar: 'Insert', group: 'text', order: 2 }, run: () => {} }`);
    await define(page, `{ id: 'test.table', label: 'Table…', menu: { bar: 'Insert', group: 'more', order: 3 }, run: () => { window.table = true; } }`);
    const items = () => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => [i.querySelector('.label').textContent, i.querySelector('.keys').textContent, i.getAttribute('aria-disabled') === 'true', i.classList.contains('hi')])`);
    // a click on the title opens the menu without the focus, with the keys in the notation of the platform
    await click(page, await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent === 'Insert').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    const keys = platform === 'mac' ? '⇧⌘K' : 'Ctrl+Shift+K';
    assert.deepEqual((await items()).slice(0, 3), [['Text Box', keys, false, false], ['Formula', '', true, false], ['Table…', '', false, false]]);
    // a rule is drawn between two groups of a menu
    assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.textContent.startsWith('Table…')).previousElementSibling.getAttribute('role')`), 'separator');
    // the arrows skip the disabled item, and Enter runs the highlighted one
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    assert.deepEqual((await items()).slice(0, 3).map((i) => i[3]), [false, false, true]);
    await press(page, 'Enter');
    assert.equal(await page.evaluate('window.table'), true);
    assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-edit-menu').length`), 0);
    // from the keyboard: the focused title opens with Enter, Esc closes the menu, and the focus goes back
    await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent === 'Insert').focus()`);
    await press(page, 'Enter');
    assert.deepEqual((await items()).slice(0, 3).map((i) => i[3]), [true, false, false]);
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-menubar [aria-expanded=true]').textContent`), 'Insert');
    await press(page, 'Escape');
    assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-edit-menu').length`), 0);
    assert.equal(await page.evaluate('document.activeElement.textContent'), 'Insert');
    // Left on a title moves to the title before it, and Down opens its menu
    await press(page, 'ArrowLeft');
    assert.equal(await page.evaluate('document.activeElement.textContent'), 'Edit');
    await press(page, 'ArrowDown');
    assert.deepEqual((await items()).slice(0, 2).map((i) => i[0]), ['Undo', 'Redo']);
    // the group find of the Edit menu is drawn as one run of items after a rule
    const edit = (await items()).map((i) => i[0]);
    const find = edit.indexOf('Find…');
    assert.deepEqual(edit.slice(find, find + 5), ['Find…', 'Find Next', 'Find Previous', 'Use Selection for Find', 'Replace…'], JSON.stringify(edit));
    // Right in an open menu opens the menu beside it
    await press(page, 'ArrowRight');
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-menubar [aria-expanded=true]').textContent`), 'Insert');
    await press(page, 'Escape');
    // a menu without an item is dimmed, and one with items is not
    const dimmed = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].map((b) => [b.getAttribute('aria-disabled'), String(window.BeesonEditorShell.menuItems(b.textContent).length === 0)])`);
    assert.ok(dimmed.every(([a, b]) => a === b), JSON.stringify(dimmed));
    assert.ok(dimmed.some(([a]) => a === 'false'));
    assert.deepEqual(page.errors, []);
  });
}

test('a right-click opens the context menu of a figure, of the slide, and of a slide row, and its command gets the place', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  await define(page, `{ id: 'test.front', label: 'Test Element Item', context: ['element'], menu: { bar: 'Arrange', group: 'order', order: 1 }, run: (app, arg) => { window.got = { kind: arg.kind, tag: arg.target.localName, selected: app.selection.has(arg.target) }; } }`);
  await define(page, `{ id: 'test.paste', label: 'Test Canvas Item', context: ['canvas', 'navigator'], run: (app, arg) => { window.got = { kind: arg.kind }; } }`);
  await define(page, `{ id: 'test.dup', label: 'Test Slide Item', context: ['slide'], run: (app, arg) => { window.got = { kind: arg.kind, index: [...app.slides().children].indexOf(arg.target) }; } }`);
  const labels = () => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu.context .item .label')].map((l) => l.textContent)`);
  const run = (label) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu.context .item')].find((i) => i.querySelector('.label').textContent === ${JSON.stringify(label)}).click()`);
  // a figure of the slide with the figure
  await page.evaluate(`Reveal.slide([...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('img.beeson-movable, .figure-box.beeson-movable, .qr.beeson-movable')))`);
  await frames(page);
  const figure = await page.evaluate(`(() => { const el = [...document.querySelectorAll('.reveal section.present :is(img, .figure-box, .qr).beeson-movable')].find((e) => e.getBoundingClientRect().width > 40); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, figure, { button: 'right' });
  assert.ok((await labels()).includes('Test Element Item'));
  assert.ok(!(await labels()).includes('Test Canvas Item'));
  await run('Test Element Item');
  const got = await page.evaluate('window.got');
  assert.equal(got.kind, 'element');
  assert.equal(got.selected, true);
  // the pasteboard around the slide
  const cell = await boxOf(page, '.beeson-edit-canvas');
  await click(page, { x: cell.x + 8, y: cell.y + 8 }, { button: 'right' });
  assert.ok(!(await labels()).includes('Test Element Item'));
  await run('Test Canvas Item');
  assert.deepEqual(await page.evaluate('window.got'), { kind: 'canvas' });
  // a row of the slide list
  await page.evaluate(`document.querySelectorAll('.beeson-edit-nav .row')[2].scrollIntoView()`);
  await click(page, await page.evaluate(`(() => { const r = document.querySelectorAll('.beeson-edit-nav .row')[2].getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; })()`), { button: 'right' });
  await run('Test Slide Item');
  assert.deepEqual(await page.evaluate('window.got'), { kind: 'slide', index: 2 });
  // Esc closes a context menu without running anything
  await click(page, { x: cell.x + 8, y: cell.y + 8 }, { button: 'right' });
  await press(page, 'Escape');
  assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-edit-menu').length`), 0);
  assert.deepEqual(page.errors, []);
});

test('a dialog keeps Tab inside, answers with the button pressed, and gives the focus back', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  await page.evaluate(`[...document.querySelectorAll('.beeson-edit-top .tb')].find((b) => b.textContent === 'Present').focus()`);
  await page.evaluate(`window.answer = 'none'; window.BeesonEditorShell.ask({ title: 'Delete the slide?', text: 'It has notes.', buttons: [{ label: 'Delete', value: 'delete', primary: true }, { label: 'Cancel', value: 'cancel' }] }, 'cancel').then((v) => { window.answer = v; }); 0`);
  const focused = () => page.evaluate('document.activeElement.textContent');
  assert.equal(await focused(), 'Cancel');
  await press(page, 'Tab');
  assert.equal(await focused(), 'Delete');
  await press(page, 'Tab');
  assert.equal(await focused(), 'Cancel');
  await press(page, 'Shift+Tab');
  assert.equal(await focused(), 'Delete');
  await press(page, 'Escape');
  await page.waitFor(`window.answer !== 'none'`);
  assert.equal(await page.evaluate('window.answer'), null);
  assert.equal(await focused(), 'Present');
  await page.evaluate(`window.answer = 'none'; window.BeesonEditorShell.ask({ title: 'Delete the slide?', buttons: [{ label: 'Delete', value: 'delete' }, { label: 'Cancel', value: 'cancel' }] }).then((v) => { window.answer = v; }); 0`);
  // the first button has the focus, and a key that presses a button answers with its value
  assert.equal(await focused(), 'Delete');
  await press(page, 'Space');
  await page.waitFor(`window.answer !== 'none'`);
  assert.equal(await page.evaluate('window.answer'), 'delete');
  assert.equal(await page.evaluate(`document.querySelectorAll('dialog.beeson-edit-dialog[open]').length`), 0);
  assert.deepEqual(page.errors, []);
});

test('the labels of the toolbar are kept while they fit, and the late groups go into a menu while they do not', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  for (const [width, labels, more] of [[1440, true, false], [1024, true, 'file'], [900, true, 'inserts'], [840, true, 'inserts']]) {
    const page = await editorPage(browser, { page: { width, height: 700 } });
    const bar = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-top .tb')]; return { texts: b.filter((e) => !e.classList.contains('more-groups')).map((e) => e.textContent), label: getComputedStyle(b[0].querySelector('.label')).display !== 'none', more: !!document.querySelector('.beeson-edit-top .more-groups') }; })()`);
    assert.equal(bar.label, labels, `${width}: labels`);
    assert.equal(bar.more, !!more, `${width}: the menu More`);
    // Format and Steps stay after More, since Format opens and closes the inspector, beside which
    // the navigator is hidden in a narrow window. At 1024 px Preview, Present, and Save are folded,
    // and at 900 and 840 px the group of the inserts is folded too
    const inserts = ['Table', 'Text', 'Formula', 'Shape', 'Media'];
    assert.deepEqual(bar.texts.map((x) => x.replace(/^\d+%/, '%')), more ? ['View', '%Zoom', 'Undo', 'Redo', 'Delete', 'Add Slide', ...(more === 'file' ? inserts : []), 'Format', 'Steps'] : ['View', '%Zoom', 'Undo', 'Redo', 'Delete', 'Add Slide', 'Table', 'Text', 'Formula', 'Shape', 'Media', 'Preview', 'Present', 'Save', 'Format', 'Steps']);
    const cell = await boxOf(page, '.beeson-edit-canvas');
    assert.ok(cell.w > 0 && cell.h > 0);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('the zoom of the status bar scales the slide past Fit, the canvas scrolls, and Fit comes back', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser, { page: { width: 1440, height: 900 } });
  const state = () => page.evaluate(`(() => { const s = window.BeesonEditorShell.stage; const c = document.querySelector('.beeson-edit-canvas'); return { zoom: s.zoom, scale: Reveal.getScale(), percent: document.querySelector('.beeson-edit-bottom .percent').textContent, scroll: c.scrollWidth > c.clientWidth }; })()`);
  const fit = await state();
  assert.equal(fit.zoom, null);
  await page.evaluate(`[...document.querySelectorAll('.beeson-edit-bottom button')].find((b) => b.getAttribute('aria-label') === 'Zoom in').click()`);
  const zoomed = await state();
  assert.ok(zoomed.zoom > fit.scale, JSON.stringify(zoomed));
  assert.equal(zoomed.scale, zoomed.zoom);
  assert.equal(zoomed.percent, `${Math.round(zoomed.zoom * 100)}%`);
  await page.evaluate(`window.BeesonEditorShell.stage.setZoom(2)`);
  assert.equal((await state()).scroll, true);
  // the slide is clipped to the cell, and the canvas is scrolled
  const clip = await page.evaluate(`getComputedStyle(document.querySelector('.reveal')).clipPath`);
  assert.match(clip, /^inset\(/);
  const before = await page.evaluate(`window.BeesonEditorShell.stage.origin`);
  await page.evaluate(`document.querySelector('.beeson-edit-canvas').scrollBy(200, 100)`);
  await frames(page);
  const after = await page.evaluate(`window.BeesonEditorShell.stage.origin`);
  assert.ok(Math.abs(before.x - after.x - 200) < 1 && Math.abs(before.y - after.y - 100) < 1, JSON.stringify({ before, after }));
  // a figure selected at the zoom is framed at its box
  await page.evaluate(`[...document.querySelectorAll('.beeson-edit-bottom button')].find((b) => b.textContent === 'Fit').click()`);
  assert.deepEqual(await state(), fit);
  assert.deepEqual(page.errors, []);
});

// reveal.js gave the focus to the body whenever a hidden page was shown again, hence the keys of a
// person who came back to the tab went to the slide behind a dialog, or deleted the selected object
test('a return to the tab of the editor keeps the focus in a dialog and in a field of the Format pane', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser);
  const other = await browser.newPage({ width: 800, height: 600 });
  await page.send('Page.bringToFront');
  // a person switches to another tab and back
  const away = async () => {
    await other.send('Page.bringToFront');
    await page.waitFor('document.hidden');
    await page.send('Page.bringToFront');
    await page.waitFor('!document.hidden');
    await frames(page);
  };
  const focused = () => page.evaluate(`document.activeElement === document.body ? 'the body' : document.activeElement.getAttribute('name') ?? document.activeElement.textContent`);

  await page.evaluate(`window.BeesonEditorShell.ask({ title: 'Delete the slide?', buttons: [{ label: 'Delete', value: 'delete' }, { label: 'Cancel', value: 'cancel' }] }, 'cancel'); 0`);
  assert.equal(await focused(), 'Cancel');
  await away();
  assert.equal(await focused(), 'Cancel');
  await press(page, 'Tab');
  assert.equal(await focused(), 'Delete');
  await press(page, 'Escape');
  await page.waitFor(`!document.querySelector('dialog.beeson-edit-dialog[open]')`);

  const at = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('h2')?.textContent === 'Code boxes, you guessed it...')`);
  await page.evaluate(`Reveal.slide(${at})`);
  await page.waitFor(`Reveal.getIndices().h === ${at}`);
  await frames(page);
  await clickText(page, '.reveal section.present > pre');
  await press(page, 'Escape');
  await page.waitFor('window.BeesonEditor.selection().length === 1');
  const FIELD = `[...document.querySelectorAll('.beeson-edit-inspector [name="line-steps"]')].find((el) => el.getClientRects().length && !el.disabled)`;
  await page.waitFor(`!!${FIELD}`);
  const { x, y, width, height } = await page.evaluate(`(${FIELD}).getBoundingClientRect().toJSON()`);
  await click(page, { x: x + width / 2, y: y + height / 2 });
  await page.waitFor(`document.activeElement === ${FIELD}`);
  await away();
  assert.equal(await focused(), 'line-steps');
  await press(page, 'Backspace');
  await frames(page);
  assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present > pre').length`), 1, 'Backspace in the field deleted the selected object');
  assert.deepEqual(page.errors, []);
});

// the work of R12.1 on both platforms: the focus rings of the Go to Slide field, of the popover of
// the presenter display, and of the bars of the chrome
describe('the contrast of the rings around controls', () => {
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
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  // the editor on index.html, served over HTTP or opened from its file, with query in its URL. the
  // script prepare is run on the page before source is opened
  async function load(t, { query, file = false, source = readFileSync('test-deck.html', 'utf8'), prepare = '' }) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(file ? deckUrl('test-deck.html', query) : `${server.origin}/test-deck.html?${query}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    if (prepare) await page.evaluate(prepare);
    page.source = source;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(source)})`);
    assert.deepEqual(s.problems, []);
    await frames(page);
    return page;
  }
  // the outline of the focused element, and the color of --ed-focus beside it
  const RING = `(() => {
  const a = document.activeElement;
  const cs = getComputedStyle(a);
  const p = document.createElement('div');
  p.style.color = 'var(--ed-focus)';
  a.parentElement.append(p);
  const focus = getComputedStyle(p).color;
  p.remove();
  return { visible: a.matches(':focus-visible'), color: cs.outlineColor, width: parseFloat(cs.outlineWidth), style: cs.outlineStyle, focus };
})()`;

  // dialogs-undo-a11y-5: the Go to Slide field and the checkboxes of the presenter display drew the
  // thin blue ring of the browser
  for (const platform of PLATFORMS) {
    for (const theme of ['dark', 'light']) {
      test(`the Go to Slide field and the checkboxes of Display Options draw the ring of the editor (${platform}, ${theme})`, async (t) => {
        const page = await load(t, { query: `edit&still&theme=${theme}&edit-platform=${platform}` });
        await exec(page, 'navigate.goTo');
        await page.waitFor(`document.activeElement.matches('.jump-to-slide-input')`);
        let ring = await page.evaluate(RING);
        assert.equal(ring.color, ring.focus, 'Go to Slide');
        assert.ok(ring.width >= 2 && ring.style === 'solid', JSON.stringify(ring));
        await press(page, 'Escape');
        await page.evaluate(`(() => { window.open = () => null; return true; })()`);
        await exec(page, 'play.customizePresenter');
        await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open] .parts:not([hidden])')`);
        for (let i = 0; i < 20 && !(await page.evaluate(`document.activeElement.matches('.parts input[type=checkbox]')`)); i++) await press(page, 'Tab');
        ring = await page.evaluate(RING);
        assert.ok(ring.visible);
        // the dialog sets --ed-focus of its own, hence the ring is measured against its bar
        const bar = await page.evaluate(ON_BAR);
        assert.ok(contrast(bar.ring, bar.bg) >= 3, `Display Options: ${bar.ring} on ${bar.bg} is ${contrast(bar.ring, bar.bg).toFixed(2)}:1`);
        assert.ok(ring.width >= 2 && ring.style === 'solid', JSON.stringify(ring));
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the ring of the focused element and the first opaque background of its ancestors, i.e. its bar
  const ON_BAR = `(() => {
  const a = document.activeElement;
  if (!a || a === document.body || !a.matches(':focus-visible')) return null;
  let bg = null;
  for (let e = a.parentElement; e && !bg; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!c.startsWith('rgba') && c !== 'transparent') bg = c; }
  const cs = getComputedStyle(a);
  return { what: (a.getAttribute('aria-label') || a.title || a.textContent).trim().slice(0, 30), ring: cs.outlineColor, width: parseFloat(cs.outlineWidth), bg };
})()`;

  // dialogs-undo-a11y-6: the ring of the buttons of the bars was about 2.2:1 against its bar
  for (const platform of PLATFORMS) {
    for (const scheme of ['light', 'dark']) {
      test(`the focus ring of the buttons of the bars has a contrast of 3:1 against its bar (${platform}, ${scheme})`, async (t) => {
        const page = await load(t, { query: `edit&still&theme=${scheme}&edit-platform=${platform}` });
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
        await page.evaluate('Reveal.slide(4)');
        await frames(page);
        const seen = [];
        for (let i = 0; i < 6; i++) {
          await press(page, 'F6');
          await frames(page);
          const at = await page.evaluate(ON_BAR);
          if (at && at.width > 0) seen.push(at);
        }
        assert.ok(seen.length >= 3, JSON.stringify(seen));
        for (const at of seen) assert.ok(contrast(at.ring, at.bg) >= 3, `${at.what}: ${at.ring} on ${at.bg} is ${contrast(at.ring, at.bg).toFixed(2)}:1`);
        assert.deepEqual(errors(page), []);
      });
    }
  }
});

// the work of R13.7 on both platforms and in both appearances: the contrast of the muted labels of
// the chrome and of the placeholders of its fields, the focus ring of the presenter display, and
// the toolbar while Customize Toolbar is open in a window that is made narrow
describe('the contrast of muted labels and placeholders', () => {
  const PLATFORMS = ['mac', 'other'];
  const SCHEMES = ['light', 'dark'];

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
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  // the editor on index.html in the appearance scheme, with the local storage cleared
  async function load(t, platform, scheme, { width = 1600, height = 1000 } = {}) {
    const page = await browser.newPage({ width, height });
    t.after(() => page.close().catch(() => {}));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await page.send('Storage.clearDataForOrigin', { origin: server.origin, storageTypes: 'local_storage' });
    await page.goto(`${server.origin}/test-deck.html?edit&still&theme=${scheme}&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync('test-deck.html', 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await frames(page);
    return page;
  }

  const below = (rows, min) => rows.filter((r) => contrast(r.fg, r.bg) < min).map((r) => `${r.what}: ${r.fg} on ${r.bg} is ${contrast(r.fg, r.bg).toFixed(2)}:1`);

  // every visible text of the chrome drawn in --ed-muted, with its ground and the opacity of its
  // ancestors. a disabled control is left out, since WCAG does not ask a contrast of it
  const MUTED = `(() => {
  const probe = document.createElement('i');
  probe.style.color = 'var(--ed-muted)';
  document.querySelector('.beeson-edit-header').append(probe);
  const muted = getComputedStyle(probe).color;
  probe.remove();
  const ground = ${GROUND};
  const out = [];
  for (const el of document.querySelectorAll('.beeson-edit-header *, .beeson-edit-nav *, .beeson-edit-inspector *, .beeson-edit-bottom *, .beeson-edit-notes-zoom *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!el.getClientRects().length || el.closest(':disabled, [aria-disabled="true"], [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.color !== muted || cs.visibility !== 'visible') continue;
    out.push({ what: el.textContent.trim().slice(0, 30), fg: ${INK}(el), bg: ground(el) });
  }
  return out;
})()`;

  // tour-dark-narrow-other n 2: the number of the selected row of the navigator, the label Slide
  // Layout of the Format pane, and the save state of the title bar were drawn under 4.5:1
  for (const platform of PLATFORMS) {
    for (const scheme of SCHEMES) {
      test(`every muted label of the chrome has a contrast of 4.5:1 on its ground (${platform}, ${scheme})`, async (t) => {
        const page = await load(t, platform, scheme);
        if (!(await page.evaluate(`document.documentElement.classList.contains('beeson-format')`))) await exec(page, 'shell.format');
        await exec(page, 'view.notes');
        await frames(page);
        const rows = await page.evaluate(MUTED);
        const texts = rows.map((r) => r.what);
        for (const want of ['1', 'Slide Layout', '100%']) assert.ok(texts.includes(want), `${want} is not among ${js(texts)}`);
        assert.ok(texts.some((x) => /unsaved|saved/i.test(x)), `the save state is not among ${js(texts)}`);
        assert.deepEqual(below(rows, 4.5), []);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the placeholder of every visible empty field of the editor, with the ground of its field
  const PLACEHOLDERS = `(() => {
  const ground = ${GROUND};
  return [...document.querySelectorAll('input[placeholder], textarea[placeholder]')]
    .filter((f) => f.placeholder && !f.value && f.getClientRects().length && !f.closest('.reveal .slides'))
    .map((f) => ({ what: f.placeholder, fg: getComputedStyle(f, '::placeholder').color, bg: ground(f) }));
})()`;

  // tour-dark-narrow-other n 1: in the dark appearance, the placeholder Find measured 1.76:1 and the
  // placeholder Search of the Object List 2.46:1
  for (const platform of PLATFORMS) {
    for (const scheme of SCHEMES) {
      test(`the placeholders of Find and of the Object List have a contrast of 4.5:1 (${platform}, ${scheme})`, async (t) => {
        const page = await load(t, platform, scheme);
        const seen = [];
        await exec(page, 'find.open');
        await frames(page);
        seen.push(...(await page.evaluate(PLACEHOLDERS)));
        await exec(page, 'find.close');
        await exec(page, 'view.objects');
        await frames(page);
        seen.push(...(await page.evaluate(PLACEHOLDERS)));
        const names = seen.map((r) => r.what);
        assert.ok(names.includes('Find') && names.includes('Search'), js(names));
        assert.deepEqual(below(seen, 4.5), []);
        assert.equal(await render(page), page.source);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the prompts of empty notes, i.e. Click to add notes in the notes pane and the line of the notes of
  // the presenter display, are the placeholders of the notes, and were drawn in --ed-faint
  for (const platform of PLATFORMS) {
    for (const scheme of SCHEMES) {
      test(`the prompts of empty notes have a contrast of 4.5:1 (${platform}, ${scheme})`, async (t) => {
        const page = await load(t, platform, scheme);
        const n = await page.evaluate(`Reveal.getSlides().findIndex((s) => !s.querySelector(':scope > aside.notes'))`);
        assert.ok(n >= 0);
        await page.evaluate(`Reveal.slide(${n})`);
        await exec(page, 'view.notes');
        await frames(page);
        const seen = [await page.evaluate(`(() => {
        const a = document.querySelector('.reveal .slides section.present > aside.notes');
        return { what: getComputedStyle(a, '::before').content, fg: getComputedStyle(a, '::before').color, bg: ${GROUND}(a) };
      })()`)];
        await page.evaluate(`(() => { window.open = () => null; return true; })()`);
        await exec(page, 'play.customizePresenter');
        await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open] .notes .text.empty')`);
        seen.push(await page.evaluate(`(() => {
        const e = document.querySelector('dialog.beeson-edit-presenter .notes .text.empty');
        return { what: e.textContent, fg: getComputedStyle(e).color, bg: ${GROUND}(e) };
      })()`));
        assert.match(seen[0].what, /Click to add notes/);
        assert.deepEqual(below(seen, 4.5), []);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the ring of the focused element of the presenter display and the ground of its control
  const RING = `(() => {
  const a = document.activeElement;
  if (!a || !a.closest('dialog.beeson-edit-presenter') || !a.matches(':focus-visible')) return null;
  const cs = getComputedStyle(a);
  return { what: (a.getAttribute('aria-label') || a.title || a.textContent).trim().slice(0, 30), fg: cs.outlineColor, width: parseFloat(cs.outlineWidth), bg: ${GROUND}(a.parentElement) };
})()`;

  // r12-1-contrast-focus n 1: the ring of the presenter display and of its Display Options was a
  // translucent violet, at about 2.5:1 on its black bars
  for (const platform of PLATFORMS) {
    for (const scheme of SCHEMES) {
      test(`the focus ring of the presenter display has a contrast of 3:1 on each of its grounds (${platform}, ${scheme})`, async (t) => {
        const page = await load(t, platform, scheme);
        await page.evaluate(`(() => { window.open = () => null; return true; })()`);
        await exec(page, 'play.customizePresenter');
        await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open] .parts:not([hidden])')`);
        const seen = [];
        for (let i = 0; i < 16; i++) {
          await press(page, 'Tab');
          const at = await page.evaluate(RING);
          if (at && at.width > 0) seen.push(at);
        }
        assert.ok(seen.length >= 6, js(seen));
        assert.deepEqual(below(seen, 3), []);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  async function resize(page, width, height) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(150);
    await frames(page);
  }

  const OUTSIDE = `[...document.querySelectorAll('.beeson-edit-top [data-at]')].filter((el) => { const r = el.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5 || !r.width; }).map((el) => el.dataset.command ?? el.className)`;

  // r12-2-shell-inspector n 1: a window made narrow while Customize Toolbar was open kept the labels
  // of the toolbar, and Present, Save, Format, and Steps lay past its right edge
  for (const platform of PLATFORMS) {
    test(`while Customize Toolbar is open, every toolbar item stays inside a window made narrow (${platform})`, async (t) => {
      const page = await load(t, platform, 'light', { width: 1600, height: 800 });
      await exec(page, 'view.customizeToolbar');
      await page.waitFor(`!document.querySelector('.beeson-edit-customize').hidden`);
      await frames(page);
      for (const width of [900, 760]) {
        await resize(page, width, 700);
        assert.deepEqual(await page.evaluate(OUTSIDE), [], `toolbar items lie past the window at ${width} px`);
      }
      await resize(page, 1600, 800);
      assert.ok(!(await page.evaluate(`document.querySelector('.beeson-edit-top').classList.contains('compact')`)), 'the labels are not drawn again at 1600 px');
      assert.deepEqual(await page.evaluate(OUTSIDE), []);
      await exec(page, 'view.customizeToolbar');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }
});
