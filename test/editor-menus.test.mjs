// the items of the menu bar and of the context menus, i.e. the Edit menu, Paste and Match Style,
// File > Revert to Saved, Open Recent, Export To, Save as Picture…, and the search of the Help menu

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { createHash } from 'node:crypto';
import { deckSettled, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

// the inserts of the toolbar, the clipboard commands, and the keys, on both platforms: Cut and
// Copy on a collapsed caret, Paste in the menu of a text, the keys of every command in the menus
// and in the sheet of shortcuts, the error color of the formula sheet, the insert cluster of the
// toolbar with its split buttons, and the keys moved off the keys that a browser takes before the
// page. each edit is checked byte for byte, after an undo and a redo, and after a save and an open
// of the saved text
describe('clipboard commands and keys in the menus', () => {
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

  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  // the editor on a deck served over HTTP, with the storage of the origin emptied first
  async function load(t, platform, { deck = 'test-deck.html', size = { width: 1600, height: 1000 }, scheme } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    if (scheme) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(s.problems, []);
    await frames(page);
    return page;
  }

  // window.app is set to the app of the editor by the run of a command that the test defines
  async function grabApp(page) {
    await page.evaluate(`window.BeesonEditorShell.define({ id: 'test.app', label: 'App', run: (a) => { window.app = a; } })`);
    await page.evaluate(`window.BeesonEditor.exec('test.app')`);
  }

  // the command, label, keys, and enabled state of each item of the last open menu
  const menuRows = (page) => page.evaluate(`(() => { const m = [...document.querySelectorAll('.beeson-edit-menu')].at(-1); return m ? [...m.querySelectorAll('.item')].map((i) => ({ id: i.dataset.command ?? '', label: i.querySelector('.label')?.textContent ?? '', keys: i.querySelector('.keys')?.textContent ?? '', enabled: i.getAttribute('aria-disabled') !== 'true' })) : []; })()`);

  // barMenu opens the menu of a title of the menu bar with a click, and returns its rows
  async function barMenu(page, title) {
    await page.evaluate('window.BeesonEditorShell.closeMenus()');
    await sleep(30);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menubar button')].find((x) => x.textContent === ${JSON.stringify(title)}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await clickText(page, at);
    await sleep(80);
    return menuRows(page);
  }

  // caretInTitle collapses the caret in the heading of the title slide after its first n characters
  async function caretInTitle(page, n = 4) {
    await page.evaluate('Reveal.slide(0)');
    await sleep(200);
    await clickText(page, await center(page, '.reveal section.present h1'));
    await sleep(100);
    await page.evaluate(`(() => { const h = document.querySelector('.reveal section.present h1'); getSelection().collapse(h.firstChild, ${n}); })()`);
    await sleep(50);
  }

  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);

  for (const platform of PLATFORMS) {
    test(`Cut and Copy are disabled while the caret is collapsed in a text, and enabled on a range (${platform})`, async (t) => {
      const page = await load(t, platform);
      await caretInTitle(page);
      assert.equal((await state(page, 'edit.cut')).enabled, false, 'Cut is enabled on a collapsed caret');
      assert.equal((await state(page, 'edit.copy')).enabled, false, 'Copy is enabled on a collapsed caret');
      assert.equal((await state(page, 'edit.paste')).enabled, true);
      const rows = await barMenu(page, 'Edit');
      const enabled = Object.fromEntries(rows.map((r) => [r.id, r.enabled]));
      assert.deepEqual([enabled['edit.cut'], enabled['edit.copy'], enabled['edit.paste']], [false, false, true], 'the Edit menu offers Cut or Copy on a collapsed caret');
      await page.evaluate('window.BeesonEditorShell.closeMenus()');
      // Shift+F10 opens the menu of the text at the caret
      await press(page, 'Shift+F10');
      await sleep(150);
      const context = await menuRows(page);
      assert.deepEqual(context.slice(0, 3).map((r) => [r.id, r.enabled]), [['edit.cut', false], ['edit.copy', false], ['edit.paste', true]]);
      await press(page, 'Escape');
      await sleep(50);
      await page.evaluate(`(() => { const t = document.querySelector('.reveal section.present h1').firstChild; getSelection().setBaseAndExtent(t, 0, t, 4); })()`);
      await sleep(50);
      assert.equal((await state(page, 'edit.cut')).enabled, true, 'Cut is disabled on a range');
      assert.equal((await state(page, 'edit.copy')).enabled, true, 'Copy is disabled on a range');
      assert.deepEqual(errors(page), []);
    });

    test(`Paste is a command of the menu of a text, and pastes there as Edit > Paste does (${platform})`, async (t) => {
      const page = await load(t, platform);
      await grabApp(page);
      assert.ok((await page.evaluate(`window.app.commands.forContext('text').map((c) => c.id)`)).includes('edit.paste'), 'Paste is not declared for the menu of a text');
      // the clipboard of the system is shared with the other tests, hence readText is a stub
      await page.evaluate(`navigator.clipboard.readText = async () => ' pasted'`);
      await caretInTitle(page, 10);
      await press(page, 'Shift+F10');
      await sleep(150);
      // Cut and Copy are disabled, hence Paste is the first item highlighted
      assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-menu .item.hi')?.dataset.command`), 'edit.paste');
      await press(page, 'Enter');
      await sleep(300);
      const fromContext = await render(page);
      assert.equal(await page.evaluate(`document.querySelector('.reveal section.present h1').textContent`), 'Presenting pasted in HTML');
      await page.evaluate('window.BeesonEditor.undo()');
      await sleep(150);
      assert.equal(await render(page), page.source);
      // Edit > Paste at the same caret writes the same file
      await caretInTitle(page, 10);
      await barMenu(page, 'Edit');
      await click(page, await center(page, '.beeson-edit-menu .item[data-command="edit.paste"]'));
      await sleep(300);
      assert.equal(await render(page), fromContext, 'the menu of a text and the Edit menu paste differently');
      await page.evaluate('window.BeesonEditor.undo()');
      await sleep(150);
      assert.equal(await render(page), page.source);
      await page.evaluate('window.BeesonEditor.redo()');
      await sleep(150);
      assert.equal(await render(page), fromContext);
      const { text } = await saveAndReopen(page, `r5-3-paste-${platform}.html`);
      assert.equal(text, fromContext);
      assert.deepEqual(errors(page), []);
    });

    test(`every command shows the keys it runs on, in its menu and in the sheet of shortcuts, each key once (${platform})`, async (t) => {
      const page = await load(t, platform);
      const mac = platform === 'mac';
      const slide = Object.fromEntries((await barMenu(page, 'Slide')).map((r) => [r.label, r.keys]));
      // ⌘D and ⌫ are the keys of Edit > Duplicate and Edit > Delete. with nothing selected on the
      // canvas, ⌘D duplicates the slide and ⌫ does nothing, hence only Duplicate Slide lists its key
      assert.equal(slide['Duplicate Slide'], mac ? '⌘D' : 'Ctrl+D');
      assert.equal(slide['Delete Slide'], '');
      assert.equal(slide['Move Slide Up'], mac ? '⌥↑' : 'Alt+Up Arrow');
      assert.equal(slide['Move Slide Down'], mac ? '⌥↓' : 'Alt+Down Arrow');
      const edit = Object.fromEntries((await barMenu(page, 'Edit')).map((r) => [r.label, r.keys]));
      assert.equal(edit.Duplicate, mac ? '⌘D' : 'Ctrl+D');
      assert.equal(edit.Delete, mac ? '⌫' : 'Delete');
      await page.evaluate('window.BeesonEditorShell.closeMenus()');
      await page.evaluate(`window.BeesonEditor.exec('help.keys')`);
      await sleep(100);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-keys .row')].map((r) => ({ label: r.firstElementChild.textContent, keys: r.querySelector('kbd').textContent.split(', ') }))`);
      const keysOf = (label) => rows.find((r) => r.label === label)?.keys ?? [];
      assert.deepEqual(keysOf('Duplicate Slide'), [], JSON.stringify(keysOf('Duplicate Slide')));
      assert.ok(keysOf('Duplicate').includes(mac ? '⌘D' : 'Ctrl+D'), JSON.stringify(keysOf('Duplicate')));
      assert.deepEqual(keysOf('Delete Slide'), [], JSON.stringify(keysOf('Delete Slide')));
      assert.ok(keysOf('Delete').includes(mac ? '⌫' : 'Delete'), JSON.stringify(keysOf('Delete')));
      assert.ok(keysOf('Move Slide Up').includes(mac ? '⌥↑' : 'Alt+Up Arrow'), JSON.stringify(keysOf('Move Slide Up')));
      assert.ok(keysOf('Move Slide Down').includes(mac ? '⌥↓' : 'Alt+Down Arrow'), JSON.stringify(keysOf('Move Slide Down')));
      assert.ok(keysOf('Add Row Above').includes(mac ? '⌥↑' : 'Alt+Up Arrow'), 'Add Row Above lost its key');
      for (const r of rows) assert.equal(new Set(r.keys).size, r.keys.length, `${r.label} lists a key twice: ${r.keys}`);
      assert.deepEqual(errors(page), []);
    });

    for (const scheme of ['light', 'dark']) {
      test(`the error of the formula sheet is drawn in a color of the chrome, not in the red of the deck (${platform}, ${scheme})`, async (t) => {
        const page = await load(t, platform, { scheme });
        await page.evaluate(`document.documentElement.style.setProperty('--red', 'rgb(1, 2, 3)')`);
        await page.evaluate(`Reveal.slide([...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.querySelector('.math mjx-container')))`);
        await sleep(250);
        await clickText(page, await center(page, '.reveal section.present .math mjx-container'));
        await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
        await page.evaluate(`(() => { const f = document.querySelector('.beeson-math textarea'); f.focus(); f.value = '\\\\frac{'; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await page.waitFor(`!!document.querySelector('.beeson-math .error:not(.prompt)')?.textContent`);
        const colors = await page.evaluate(`(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--ed-error)';
        document.querySelector('.beeson-math').append(probe);
        const out = { error: getComputedStyle(document.querySelector('.beeson-math .error')).color, token: getComputedStyle(probe).color, defined: getComputedStyle(document.documentElement).getPropertyValue('--ed-error').trim() };
        probe.remove();
        return out;
      })()`);
        assert.notEqual(colors.error, 'rgb(1, 2, 3)', 'the error of the formula sheet is drawn in the --red of the deck');
        assert.ok(colors.defined, 'the chrome does not define --ed-error');
        assert.equal(colors.error, colors.token);
        await press(page, 'Escape');
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the buttons of the insert group of the toolbar, with the command, the text, the shown label, and
  // whether each is the main part of a split button
  const insertGroup = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-top .group[data-group="insert"] .tb')].map((b) => ({ id: b.dataset.command, text: b.textContent, label: getComputedStyle(b.querySelector('.label')).display !== 'none', split: !!b.closest('.beeson-edit-split') }))`);

  const LAYOUTS = 'test/pages/editor-layouts.html';
  const MATH = readFileSync(LAYOUTS, 'utf8').split(/<section\b/).slice(1).findIndex((s) => s.includes('<h2>Math, an ordered list, and a zone</h2>'));

  // a point of the slide given in slide px, in CSS px of the viewport
  const screen = (page, x, y) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  return { x: r.left + ${x} * k, y: r.top + ${y} * k };
})()`);

  for (const platform of PLATFORMS) {
    test(`the insert group of the toolbar is Table, Text, Formula, Shape, and Media, with labels while they fit (${platform})`, async (t) => {
      for (const [width, labels] of [[1600, true], [1080, true]]) {
        const page = await load(t, platform, { size: { width, height: 800 } });
        const group = await insertGroup(page);
        assert.deepEqual(group.map((b) => [b.id, b.text, b.split]), [
          ['insert.table', 'Table', false],
          ['insert.text', 'Text', false],
          ['insert.formula', 'Formula', false],
          ['insert.shape.rounded', 'Shape', true],
          ['insert.image', 'Media', true],
        ], `${width}: the insert group`);
        assert.ok(group.every((b) => b.label === labels), `${width}: the labels`);
        assert.equal(await page.evaluate(`!!document.querySelector('.beeson-edit-top .more-groups')`), false, `${width}: the menu More`);
        const top = await page.evaluate(`(() => { const t = document.querySelector('.beeson-edit-top'); return { scroll: t.scrollWidth - t.clientWidth, h: t.getBoundingClientRect().height }; })()`);
        assert.ok(top.scroll <= 0, `${width}: the toolbar overflows by ${top.scroll} px`);
        assert.equal(top.h, 52);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });

    test(`the arrow of Media lists the inserts of a picture, and QR Code from it is inserted and undone byte for byte (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS });
      await page.evaluate(`Reveal.slide(${MATH})`);
      await sleep(200);
      assert.equal(await page.evaluate(`document.querySelector('[data-command="insert.image"]').title`), 'Image…');
      await click(page, await center(page, '.beeson-edit-split:has([data-command="insert.image"]) .more'));
      await sleep(100);
      const rows = await menuRows(page);
      assert.deepEqual(rows.map((r) => r.label), ['Image…', 'Video…', 'TikZ Figure', 'QR Code', 'Backdrop…', 'Choose File…']);
      assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-edit-menu .rule').length`), 1, 'Choose File… is not set apart by a rule');
      await click(page, await center(page, '.beeson-edit-menu .item[data-command="insert.qr"]'));
      await sleep(300);
      const edited = await render(page);
      assert.ok(edited.length > page.source.length && edited.includes('class="qr"'), 'QR Code of the list of Media did not insert a QR code');
      await page.evaluate('window.BeesonEditor.undo()');
      await sleep(150);
      assert.equal(await render(page), page.source);
      await page.evaluate('window.BeesonEditor.redo()');
      await sleep(150);
      assert.equal(await render(page), edited);
      const { text } = await saveAndReopen(page, `r5-3-qr-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(errors(page), []);
    });

    test(`Shape draws a rounded rectangle from its main part and an arrow from its list, and is pressed while one is drawn (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS });
      await page.evaluate(`Reveal.slide(${MATH})`);
      await sleep(200);
      const shape = '.beeson-edit-top [data-command="insert.shape.rounded"]';
      const pressed = () => page.evaluate(`document.querySelector('${shape}').getAttribute('aria-pressed')`);
      await clickText(page, await center(page, shape));
      await sleep(50);
      assert.equal((await state(page, 'insert.shape.rounded')).checked, true, 'the main part of Shape does not draw a rounded rectangle');
      assert.equal(await pressed(), 'true');
      await press(page, 'Escape');
      await sleep(50);
      assert.notEqual(await pressed(), 'true', 'Shape is still pressed');
      await click(page, await center(page, '.beeson-edit-split:has([data-command="insert.shape.rounded"]) .more'));
      await sleep(100);
      assert.deepEqual((await menuRows(page)).map((r) => r.label), ['Rounded Rectangle', 'Rectangle', 'Ellipse', 'Triangle', 'Block Arrow', 'Double Block Arrow', 'Brace', 'Plus', 'Equals', 'Line', 'Arrow', 'Curved Arrow', 'Elbow Arrow']);
      await click(page, await center(page, '.beeson-edit-menu .item[data-command="insert.arrow"]'));
      await sleep(50);
      assert.equal((await state(page, 'insert.arrow')).checked, true);
      assert.equal(await pressed(), 'true', 'Shape is not pressed while an arrow is drawn');
      const a = await screen(page, 200, 300);
      const b = await screen(page, 600, 330);
      // the drag is made with the modifier of a move without the snap, Meta on a Mac and Alt elsewhere
      const bits = platform === 'mac' ? 4 : 1;
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, modifiers: bits });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1, modifiers: bits });
      for (let i = 1; i <= 10; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + ((b.x - a.x) * i) / 10, y: a.y + ((b.y - a.y) * i) / 10, button: 'left', buttons: 1, modifiers: bits });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1, modifiers: bits });
      await sleep(200);
      const edited = await render(page);
      assert.ok(edited.includes('<svg class="line'), 'the drag did not draw an arrow');
      assert.ok(edited.includes('marker-end'), 'the line drawn is not an arrow');
      assert.notEqual(await pressed(), 'true', 'Shape is still pressed');
      await page.evaluate('window.BeesonEditor.undo()');
      await sleep(150);
      assert.equal(await render(page), page.source);
      await page.evaluate('window.BeesonEditor.redo()');
      await sleep(150);
      assert.equal(await render(page), edited);
      const { text } = await saveAndReopen(page, `r5-3-arrow-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(errors(page), []);
    });
  }

  // keys that a browser on the platform takes before the page, from the table of keys.md of R5.3:
  // the reserved commands of Chromium and the keys of Firefox marked reserved. Cmd+R and Cmd+L,
  // which Safari alone keeps, are listed after their fallbacks in Safari only, as editor-r8-4 tests
  const TAKEN = {
    mac: ['Mod+N', 'Mod+Shift+N', 'Mod+T', 'Mod+Shift+T', 'Mod+W', 'Mod+Shift+W', 'Mod+Q', 'Mod+Shift+P', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+PageUp', 'Ctrl+PageDown', 'Ctrl+Home', 'Mod+Alt+ArrowLeft', 'Mod+Alt+ArrowRight', 'Mod+Shift+[', 'Mod+Shift+]', 'Mod+Shift+{', 'Mod+Shift+}'],
    other: ['Mod+N', 'Mod+Shift+N', 'Mod+T', 'Mod+Shift+T', 'Mod+W', 'Mod+Shift+W', 'Mod+Shift+P', 'Mod+Shift+Q', 'Mod+F4', 'Alt+F4', 'F11', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+PageUp', 'Ctrl+PageDown'],
  };

  for (const platform of PLATFORMS) {
    test(`no menu shows a key that a browser takes before the page, and Rulers and Lock run on their new keys (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS });
      const mac = platform === 'mac';
      await grabApp(page);
      const keys = await page.evaluate(`window.app.commands.list().filter((c) => c.keys?.${platform}).map((c) => ({ id: c.id, keys: c.keys.${platform} }))`);
      for (const c of keys) {
        // a key taken by Safari alone may stay behind the key shown, for Chrome and Firefox
        const shown = mac ? c.keys.slice(0, 1) : c.keys;
        for (const k of shown) assert.ok(!TAKEN[platform].includes(k), `${c.id} shows ${k}, which a browser takes before the page`);
      }
      const pinned = Object.fromEntries(keys.map((c) => [c.id, c.keys]));
      assert.deepEqual(pinned['view.rulers'], mac ? ['Mod+R', 'Ctrl+Mod+R'] : ['Alt+Shift+R']);
      assert.deepEqual(pinned['arrange.lock'], mac ? ['Mod+L', 'Ctrl+Mod+L'] : ['Mod+L']);
      const view = Object.fromEntries((await barMenu(page, 'View')).map((r) => [r.label, r.keys]));
      assert.equal(view.Rulers, mac ? '⌘R' : 'Alt+Shift+R');
      const arrange = Object.fromEntries((await barMenu(page, 'Arrange')).map((r) => [r.label, r.keys]));
      assert.equal(arrange.Lock, mac ? '⌘L' : 'Ctrl+L');
      await page.evaluate('window.BeesonEditorShell.closeMenus()');
      await page.evaluate(`window.BeesonEditor.exec('help.keys')`);
      await sleep(100);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-keys .row')].map((r) => ({ label: r.firstElementChild.textContent, keys: r.querySelector('kbd').textContent.split(', ') }))`);
      assert.deepEqual(rows.find((r) => r.label === 'Lock')?.keys, mac ? ['⌘L', '⌃⌘L'] : ['Ctrl+L']);
      if (mac) assert.deepEqual(rows.find((r) => r.label === 'Rulers')?.keys, ['⌘R', '⌃⌘R']);
      await press(page, 'Escape');
      await sleep(50);
      if (mac) {
        const rulers = (await state(page, 'view.rulers')).checked;
        await press(page, 'Ctrl+Mod+R');
        await frames(page);
        assert.equal((await state(page, 'view.rulers')).checked, !rulers, 'Ctrl+Cmd+R does not toggle the rulers');
        await press(page, 'Ctrl+Mod+R');
        await frames(page);
        assert.equal((await state(page, 'view.rulers')).checked, rulers);
      }
      // Lock on its new key writes data-locked on the QR code of the title slide, byte for byte
      await page.evaluate('Reveal.slide(0)');
      await sleep(200);
      await clickText(page, await center(page, '.reveal section.present > .qr'));
      await sleep(50);
      await press(page, mac ? 'Ctrl+Mod+L' : 'Mod+L');
      await sleep(100);
      const edited = await render(page);
      const qr = page.source.match(/<div class="qr"[^>]*>/)[0];
      assert.equal(edited, page.source.replace(qr, qr.replace(/>$/, ' data-locked>')));
      await page.evaluate('window.BeesonEditor.undo()');
      await sleep(150);
      assert.equal(await render(page), page.source);
      await page.evaluate('window.BeesonEditor.redo()');
      await sleep(150);
      assert.equal(await render(page), edited);
      const { text } = await saveAndReopen(page, `r5-3-lock-${platform}.html`);
      assert.equal(text, edited);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R6.1 on both platforms with trusted input: the Edit menu in the order of the
// Edit menu of Keynote, Delete of the selected words of a text, the list buttons on a selected
// block, a key that runs one command in each state, every row of the keyboard sheet in a window
// of 1280 by 800, and the context menu of the picture of a figure without Edit Text. after each
// edit the text is checked byte for byte, after an undo and a redo, and after a save and an open
describe('the Edit menu in the order of Keynote', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const PANEL = '#beeson-edit-panel-format';
  // the slide of the deck of layouts with a paragraph and a list, and the slide with an ordered
  // list and a figure with a caption
  const TEXT = 2;
  const MATH = 3;

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

  // the editor on the slide n of a deck served over HTTP, with the Format tab shown
  async function load(t, platform, { deck = LAYOUTS, n = 0, size = { width: 1600, height: 1000 } } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
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

  // the edits applied to the text, then an undo gives the text before byte for byte, a redo gives
  // the edit, and a save of the edit is opened again without problems
  let saves = 0;
  async function roundTrip(page, edits) {
    await byteExact(page, edits);
    const edited = await render(page);
    await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r6-1-${++saves}.html`);
    assert.equal(text, edited);
    page.source = text;
  }

  // the words text selected in the first element at selector, with its block focused
  const selectWords = (page, selector, text) =>
    page.evaluate(`(() => {
    const el = document.querySelector(${js(selector)});
    el.closest('[contenteditable="true"]').focus();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.data.indexOf(${js(text)});
      if (at < 0) continue;
      const r = document.createRange();
      r.setStart(n, at);
      r.setEnd(n, at + ${text.length});
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      return true;
    }
    return false;
  })()`);

  // the items of a menu of the menu bar as labels, with a submenu as its label in braces and a rule
  // as a bar
  const menuLabels = (page, bar) => page.evaluate(`(() => {
  const E = window.BeesonEditor;
  return window.BeesonEditorShell.menuItems(${js(bar)}).map((i) => i.rule ? '|' : i.command ? E.state(i.command).label : '{' + i.label + '}');
})()`);

  // the center of the item labeled label of the open menu, or null
  const itemAt = (page, label) => page.evaluate(`(() => {
  const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)});
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  async function openBar(page, bar) {
    await clickText(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await frames(page);
  }

  // the Edit menu of Keynote 15.4 in references/keynote-menus.txt of the council: Undo and Redo, the
  // clipboard and Delete, Duplicate Selection and the selection, then Find. the labels are those of
  // the commands of the editor, e.g. Duplicate for Duplicate Selection and Select Figure for Select
  // Parent
  const EDIT = ['Undo', 'Redo', '|', 'Cut', 'Copy', 'Paste', 'Paste and Match Style', 'Delete', '|', 'Duplicate', 'Select All', 'Deselect', 'Select Figure', '|', 'Find…', 'Find Next', 'Find Previous', 'Use Selection for Find', 'Replace…', '|', '{Spelling and Grammar}', '{Substitutions}', '{Speech}'];

  for (const platform of PLATFORMS) {
    // finding opus 10 of round 2: Select All and Find were listed before Cut
    test(`the Edit menu reads Undo, the clipboard and Delete, Duplicate and Select All, then Find (${platform})`, async (t) => {
      const page = await load(t, platform);
      assert.deepEqual(await menuLabels(page, 'Edit'), EDIT);
      assert.deepEqual(errors(page), []);
    });

    // finding glm 29 of round 2: Edit > Delete was dimmed in a text. both apps delete the selected
    // words, and both dim Delete with a bare caret
    test(`Edit > Delete deletes the selected words of a text and is dimmed with a bare caret (${platform})`, async (t) => {
      const page = await load(t, platform, { n: TEXT });
      const p = '.reveal section.present > p:not(.small)';
      await clickText(page, p);
      await frames(page);
      assert.equal((await state(page, 'element.delete')).enabled, false, 'Delete is enabled with a bare caret');
      assert.ok(await selectWords(page, p, 'paragraph '));
      await frames(page);
      assert.equal((await state(page, 'element.delete')).enabled, true, 'Delete is dimmed over the selected words');
      await openBar(page, 'Edit');
      const at = await itemAt(page, 'Delete');
      assert.ok(at, 'Delete is not in the Edit menu');
      await clickText(page, at);
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector(${js(p)}).textContent.startsWith('A with ')`), true);
      assert.equal((await state(page, 'element.delete')).enabled, false);
      await roundTrip(page, [['<p>A paragraph with', '<p>A with']]);
      assert.deepEqual(errors(page), []);
    });

    // findings opus 17, gemini 17, and qwen3 26 of round 2: the list buttons of the Text pane were
    // dimmed for a paragraph selected as a block
    test(`the list buttons of the Text pane make a selected paragraph a list and a selected list paragraphs (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      const p = '.reveal section.present > p:first-of-type';
      await clickText(page, p);
      await press(page, 'Escape');
      await frames(page);
      for (const kind of ['none', 'ul', 'ol']) assert.equal((await state(page, `text.list.${kind}`)).enabled, true, `text.list.${kind} is dimmed on a selected paragraph`);
      assert.equal((await state(page, 'text.list.none')).checked, true);
      await click(page, `${PANEL} [data-command="text.list.ul"]`);
      await frames(page);
      await roundTrip(page, [['<p>The lead-in of a display</p>', '<ul>\n    <li>The lead-in of a display</li>\n  </ul>']]);
      // the new list is selected as a block again, and Numbers makes it an ordered list
      await clickText(page, '.reveal section.present > ul > li');
      await press(page, 'Escape');
      await frames(page);
      assert.equal((await state(page, 'text.list.ul')).checked, true);
      await click(page, `${PANEL} [data-command="text.list.ol"]`);
      await frames(page);
      await roundTrip(page, [['<ul>\n    <li>The lead-in of a display</li>\n  </ul>', '<ol>\n    <li>The lead-in of a display</li>\n  </ol>']]);
      // Paragraphs on a selected list makes each item a paragraph with the attributes of the item
      await clickText(page, '.reveal section.present > ol:last-of-type > li');
      await press(page, 'Escape');
      await frames(page);
      assert.equal((await state(page, 'text.list.ol')).checked, true);
      await click(page, `${PANEL} [data-command="text.list.none"]`);
      await frames(page);
      await roundTrip(page, [[
        '<ol>\n    <li class="fragment" data-fragment-index="3">A first step</li>\n    <li class="fragment" data-final>A final step</li>\n  </ol>',
        '<p class="fragment" data-fragment-index="3">A first step</p>\n  <p class="fragment" data-final>A final step</p>',
      ]]);
      assert.deepEqual(errors(page), []);
    });

    // finding gemini 19 of round 2: Shift+F3 ran Find Previous and Change Case on Windows and
    // Linux. in each state below, every key of the sheet runs one enabled command at most
    test(`no key of the keyboard sheet runs two commands in one state of the editor (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      const clashes = async (where) => (await page.evaluate('window.BeesonEditorShell.keyClashes()')).map((c) => `${where}: ${c}`);
      const found = [];
      // a query of the find panel enables Find Next and Find Previous after the panel is closed
      await exec(page, 'find.open', 'step');
      await exec(page, 'find.close');
      await frames(page);
      found.push(...(await clashes('the canvas')));
      await clickText(page, '.reveal section.present figure.figure-box img:not([hidden])');
      await frames(page);
      found.push(...(await clashes('a figure')));
      await press(page, 'Escape');
      const p = '.reveal section.present > p:first-of-type';
      await clickText(page, p);
      await frames(page);
      found.push(...(await clashes('a caret in a text')));
      await selectWords(page, p, 'lead-in');
      await frames(page);
      found.push(...(await clashes('words of a text')));
      await clickText(page, '.reveal section.present > ol > li');
      await frames(page);
      found.push(...(await clashes('a list item')));
      await press(page, 'Escape');
      await frames(page);
      found.push(...(await clashes('a block')));
      await exec(page, 'find.open', 'step');
      await frames(page);
      found.push(...(await clashes('the find field')));
      await press(page, 'Escape');
      await page.evaluate(`document.querySelector('.beeson-edit-nav .row')?.focus()`);
      await frames(page);
      found.push(...(await clashes('the navigator')));
      assert.deepEqual(found, []);
      assert.deepEqual(errors(page), []);
    });

    // Find Previous keeps a key on every platform, Ctrl+Shift+F3 on Windows and Linux, and Shift+F3
    // is Change Case, as in PowerPoint
    test(`Find Previous and Change Case each have their key (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await exec(page, 'find.open', 'step');
      await frames(page);
      await exec(page, 'find.next');
      await exec(page, 'find.next');
      const at = () => page.evaluate(`document.querySelector('.beeson-find .count')?.textContent.match(/(\\d+) of (\\d+)/)?.[1] ?? null`);
      const second = await at();
      assert.ok(second, 'the find panel does not count its matches');
      await press(page, platform === 'mac' ? 'Mod+Shift+G' : 'Ctrl+Shift+F3');
      await frames(page);
      assert.notEqual(await at(), second, 'the key of Find Previous does not step back in the find panel');
      await press(page, 'Escape');
      const p = '.reveal section.present > p:first-of-type';
      await clickText(page, p);
      assert.ok(await selectWords(page, p, 'lead-in'));
      await frames(page);
      await press(page, 'Shift+F3');
      await frames(page);
      const text = await page.evaluate(`document.querySelector(${js(p)}).textContent`);
      assert.notEqual(text, 'The lead-in of a display', 'Shift+F3 did not change the case of the words');
      assert.deepEqual(errors(page), []);
    });

    // finding gemini 19 of round 2: the group Other of the keyboard sheet was cut at the bottom of
    // the sheet on Windows and Linux. in a window of 768 px or more, every row is shown without a
    // scroll, and in a smaller window the sheet scrolls to its last row
    for (const [width, height] of [[1280, 800], [1366, 768], [1600, 1000], [1024, 700]]) {
      test(`every row of the keyboard sheet is shown in a window of ${width} by ${height} (${platform})`, async (t) => {
        const page = await load(t, platform, { size: { width, height } });
        await exec(page, 'help.keys');
        await frames(page);
        const sheet = () => page.evaluate(`(() => {
        const d = document.querySelector('dialog.beeson-edit-keys');
        const b = d.querySelector('.body');
        const body = b.getBoundingClientRect();
        const box = d.getBoundingClientRect();
        const rows = [...d.querySelectorAll('.row')].map((r) => ({ label: r.firstChild.textContent, box: r.getBoundingClientRect() }));
        const cut = rows.filter((r) => r.box.top < body.top - 0.5 || r.box.bottom > body.bottom + 0.5 || r.box.right > body.right + 0.5).map((r) => r.label);
        const lasts = [...d.querySelectorAll('.column')].map((c) => [...c.querySelectorAll('.row')].at(-1).getBoundingClientRect());
        return {
          open: d.open, rows: rows.length, cut, scrolls: b.scrollHeight > b.clientHeight + 1, overflow: getComputedStyle(b).overflowY,
          lastsShown: lasts.every((r) => r.bottom <= body.bottom + 0.5), inside: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
        };
      })()`);
        const s = await sheet();
        assert.equal(s.open, true);
        assert.ok(s.rows > 90, `${s.rows} rows`);
        assert.equal(s.inside, true, 'the sheet is outside the window');
        if (height >= 768) {
          assert.deepEqual(s.cut, [], 'rows of the sheet are cut');
          assert.equal(s.scrolls, false, 'the sheet scrolls');
        } else {
          assert.equal(s.overflow, 'auto');
          await page.evaluate(`(() => { const b = document.querySelector('dialog.beeson-edit-keys .body'); b.scrollTop = b.scrollHeight; })()`);
          await frames(page);
          assert.equal((await sheet()).lastsShown, true, 'the last row of a column is not shown at the end of the scroll');
        }
        assert.deepEqual(errors(page), []);
      });
    }

    // finding glm 30 of round 2: the context menu of the image of a figure listed Edit Text, which
    // edits its caption, where the context menu of an image in Keynote does not have an item for text
    test(`the context menu of the picture of a figure has no Edit Text, and the caption is still edited (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      const img = '.reveal section.present figure.figure-box img:not([hidden])';
      await click(page, img, { button: 'right' });
      await frames(page);
      const labels = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item .label')].map((l) => l.textContent)`);
      assert.ok(labels.includes('Copy'), JSON.stringify(labels));
      assert.ok(!labels.includes('Edit Text'), `the context menu of the picture lists Edit Text: ${JSON.stringify(labels)}`);
      // Esc closes the menu. a click on the image selects it, and Esc selects its figure, on which
      // Return puts the caret into the caption
      await press(page, 'Escape');
      await frames(page);
      await clickText(page, img);
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName).join()`), 'figure');
      await press(page, 'Enter');
      await frames(page);
      assert.equal(await page.evaluate(`document.activeElement?.closest('figcaption')?.textContent ?? null`), 'A caption under a zone.');
      await press(page, 'Escape');
      await press(page, 'Escape');
      // a click on the caption edits it too
      await clickText(page, '.reveal section.present figure.figure-box figcaption');
      await frames(page);
      assert.equal(await page.evaluate(`document.activeElement?.closest('figcaption')?.textContent ?? null`), 'A caption under a zone.');
      assert.deepEqual(errors(page), []);
    });
  }
});

// tests of R7.2 on both platforms with trusted input: Edit > Paste and Match Style in the Edit menu
// and in the menu of a text, File > Revert to Saved, File > Open Recent with the decks kept in
// IndexedDB and on the dialog of a deck that cannot read itself, and File > Export To with PDF… and
// HTML…. after each edit the text is checked byte for byte, after an undo and a redo, and after a
// save and an open. the system clipboard is shared with the other tests, hence readText is a stub
describe('Paste and Match Style and Open Recent', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  // the slide of the deck of layouts with a paragraph and a list
  const TEXT = 2;
  const P = '.reveal section.present > p:not(.small)';
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

  const js = (v) => JSON.stringify(v);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const status = (page) => page.evaluate('window.BeesonEditor.status()');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  // two frames, or a moment in a tab hidden by the tab of the print view, which does not get frames
  const frames = (page) => page.evaluate('new Promise((d) => document.hidden ? setTimeout(() => d(true), 50) : requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const wait = (page, ms) => page.evaluate(`new Promise((d) => setTimeout(() => d(true), ${ms}))`);
  // the names of the decks of Open Recent kept in the database of the editor, which the menus show
  // before the write, hence a reload waits for them
  const storedRecents = (page) => page.evaluate(`new Promise((done) => {
  const ask = indexedDB.open('beeson-editor', 1);
  ask.onsuccess = () => {
    const db = ask.result;
    const get = db.transaction('recent').objectStore('recent').get('decks');
    get.onsuccess = () => { db.close(); done((get.result ?? []).map((r) => r.name)); };
  };
})`);
  async function written(page, names) {
    for (let i = 0; i < 100 && JSON.stringify(await storedRecents(page)) !== JSON.stringify(names); i++) await wait(page, 50);
    assert.deepEqual(await storedRecents(page), names);
  }
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const ready = 'window.BeesonEditor && window.BeesonEditor.ready.then(() => true)';

  // the editor on the slide n of a deck served over HTTP. with drafts, the page keeps its unsaved
  // edits in the storage of the browser
  async function load(t, platform, { deck = LAYOUTS, n = TEXT, open = true, drafts = false } = {}) {
    const page = await browser.newPage({ width: 1600, height: 1000, drafts });
    t.after(() => page.close().catch(() => {}));
    page.url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
    await page.goto(page.url);
    await page.waitFor(deckSettled);
    await page.waitFor(ready);
    page.source = readFileSync(deck, 'utf8');
    if (open) assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`)).problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the edits applied to the text, then an undo gives the text before byte for byte, a redo gives
  // the edit, and a save of the edit is opened again without problems
  let saves = 0;
  async function roundTrip(page, edits) {
    await byteExact(page, edits);
    const edited = await render(page);
    await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r7-2-${++saves}.html`);
    assert.equal(text, edited);
    page.source = text;
  }

  // the items of a menu of the menu bar as labels, with a submenu as its label in braces and a rule
  // as a bar
  const menuLabels = (page, bar, submenu) => page.evaluate(`(() => {
  const E = window.BeesonEditor;
  return window.BeesonEditorShell.menuItems(${js(bar)}${submenu ? `, ${js(submenu)}` : ''}).map((i) => i.rule ? '|' : i.command ? E.state(i.command).label : '{' + i.label + '}');
})()`);

  // the rows of the open menus, the last opened last, each with its label, keys, and dimmed state
  const rows = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu')].map((m) => [...m.querySelectorAll('.item')].map((i) => ({
  label: i.querySelector('.label')?.textContent ?? '',
  keys: i.querySelector('.keys')?.textContent ?? '',
  dimmed: i.getAttribute('aria-disabled') === 'true',
  submenu: i.getAttribute('aria-haspopup') === 'menu',
})))`);

  // the center of the last item labeled label of the open menus, or null
  const itemAt = (page, label) => page.evaluate(`(() => {
  const item = [...document.querySelectorAll('.beeson-edit-menu .item')].filter((i) => i.querySelector('.label')?.textContent === ${js(label)}).at(-1);
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  async function openBar(page, bar) {
    await clickText(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu .item')`, 3000);
  }

  // a trusted click on each label of a path of the menus, e.g. File, Export To, PDF…, with the
  // pointer moved onto a submenu row so that it opens
  async function choose(page, bar, ...path) {
    await openBar(page, bar);
    for (const [i, label] of path.entries()) {
      const at = await itemAt(page, label);
      assert.ok(at, `${label} is not in the open menu of ${bar}`);
      if (i < path.length - 1) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
        await page.waitFor(`document.querySelectorAll('.beeson-edit-menu').length > ${i + 1}`);
      } else await clickText(page, at);
    }
    await frames(page);
  }

  // a trusted click on the button labeled label of the open dialog with class name
  async function cardButton(page, name, label) {
    const at = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('dialog.beeson-edit-dialog.${name}:not([hidden]) button')].find((b) => b.textContent === ${js(label)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the card ${name} does not have a button ${label}`);
    await clickText(page, at);
    await frames(page);
  }

  const card = (page, name) => page.evaluate(`(() => {
  const c = document.querySelector('dialog.beeson-edit-dialog.${name}');
  return c && !c.hidden ? { title: c.querySelector('h3').textContent, text: c.querySelector('p')?.textContent ?? '', buttons: [...c.querySelectorAll('button')].map((b) => b.textContent) } : null;
})()`);

  // the caret at the end of the paragraph of the slide, put there by a trusted click just past its
  // last character, since a click on its formula opens the editor of the formula
  async function caretInParagraph(page) {
    await clickText(page, await page.evaluate(`(() => {
    const p = document.querySelector(${js(P)});
    const r = document.createRange();
    r.setStart(p.lastChild, p.lastChild.length - 1);
    r.setEnd(p.lastChild, p.lastChild.length);
    const box = r.getBoundingClientRect();
    return { x: box.right - 1, y: box.top + box.height / 2 };
  })()`));
    await frames(page);
    assert.equal(await page.evaluate(`(() => { const s = getSelection(); const p = document.querySelector(${js(P)}); return s.isCollapsed && s.anchorNode === p.lastChild && s.anchorOffset === p.lastChild.length; })()`), true, 'the caret is not at the end of the paragraph');
  }

  const paragraph = (page) => page.evaluate(`document.querySelector(${js(P)}).textContent`);

  // readText gives text, and writeText keeps the clipboard of the page
  const clipboard = (page, text) => page.evaluate(`(() => {
  window.__clip = ${js(text)};
  navigator.clipboard.readText = async () => window.__clip;
  navigator.clipboard.writeText = async (t) => { window.__clip = t; };
  navigator.clipboard.read = async () => [];
})()`);

  for (const platform of PLATFORMS) {
    const mac = platform === 'mac';

    test(`Paste and Match Style follows Paste in the Edit menu, with ${mac ? '⌥⇧⌘V' : 'no key'}, and pastes plain words (${platform})`, async (t) => {
      const page = await load(t, platform);
      const edit = await menuLabels(page, 'Edit');
      assert.deepEqual(edit.slice(edit.indexOf('Cut'), edit.indexOf('Cut') + 5), ['Cut', 'Copy', 'Paste', 'Paste and Match Style', 'Delete']);
      await clipboard(page, ' and plain words');
      await caretInParagraph(page);
      await openBar(page, 'Edit');
      const row = (await rows(page))[0].find((r) => r.label === 'Paste and Match Style');
      assert.deepEqual(row, { label: 'Paste and Match Style', keys: mac ? '⌥⇧⌘V' : '', dimmed: false, submenu: false });
      await click(page, await itemAt(page, 'Paste and Match Style'));
      await frames(page);
      assert.equal(await paragraph(page), 'A paragraph with bold, italic, code, and  inline. and plain words');
      await roundTrip(page, [[PARAGRAPH, PARAGRAPH.replace('inline.</p>', 'inline. and plain words</p>')]]);
      // the key is not bound twice in a region, nor shared with a key of the browser outside a text
      assert.deepEqual(await page.evaluate('window.BeesonEditorShell.keyClashes()'), []);
      assert.deepEqual(await page.evaluate('window.BeesonEditorShell.keyClashes(true)'), []);
      assert.deepEqual(errors(page), []);
    });

    test(`the menu of a text has Paste and Match Style after Paste, and it pastes the words of copied elements (${platform})`, async (t) => {
      const page = await load(t, platform);
      // a list item copied in the editor is pasted into a text as its words, which Paste does not do
      await clipboard(page, '<!--beeson-->\n<ul>\n  <li class="fragment">Copied <strong>bold</strong> item</li>\n</ul>');
      // the menu of a right-click on the paragraph, and the same menu opened with Shift+F10 at the
      // caret, which a right-click moves
      await clickText(page, await page.evaluate(`(() => {
      const r = document.querySelector(${js(P)}).getBoundingClientRect();
      return { x: r.right - 4, y: r.top + r.height / 2 };
    })()`), { button: 'right' });
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu .item')`);
      assert.deepEqual((await rows(page))[0].slice(0, 4), [
        { label: 'Cut', keys: mac ? '⌘X' : 'Ctrl+X', dimmed: true, submenu: false },
        { label: 'Copy', keys: mac ? '⌘C' : 'Ctrl+C', dimmed: true, submenu: false },
        { label: 'Paste', keys: mac ? '⌘V' : 'Ctrl+V', dimmed: false, submenu: false },
        { label: 'Paste and Match Style', keys: mac ? '⌥⇧⌘V' : '', dimmed: false, submenu: false },
      ]);
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-edit-menu')`);
      await caretInParagraph(page);
      await press(page, 'Shift+F10');
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu .item')`);
      await click(page, await itemAt(page, 'Paste and Match Style'));
      await frames(page);
      assert.equal(await paragraph(page), 'A paragraph with bold, italic, code, and  inline.Copied bold item');
      await roundTrip(page, [[PARAGRAPH, PARAGRAPH.replace('inline.</p>', 'inline.Copied bold item</p>')]]);
      // Paste leaves a text of elements out of a text
      await caretInParagraph(page);
      await openBar(page, 'Edit');
      await click(page, await itemAt(page, 'Paste'));
      await frames(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`Paste and Match Style on the slide pastes the copied block${mac ? ', and ⌥⇧⌘V is left to the browser in a text' : ''} (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clipboard(page, '');
      await page.evaluate(`window.__keys = []; document.addEventListener('keydown', (ev) => window.__keys.push(ev.key + (ev.defaultPrevented ? ':prevented' : '')))`);
      if (mac) {
        // in a text, the browser pastes as its Paste and Match Style, which text/typing.ts makes plain
        await caretInParagraph(page);
        await press(page, 'Mod+Alt+Shift+V');
        await frames(page);
        assert.deepEqual(await page.evaluate('window.__keys'), ['V']);
        assert.equal(await render(page), page.source);
        await press(page, 'Escape');
      } else {
        await clickText(page, P);
        await press(page, 'Escape');
      }
      // the paragraph selected as a block is copied, and pasted on the slide after it, drawn 20 px off
      // it, while the list and the small paragraph after it are kept at their places
      await frames(page);
      assert.equal((await status(page)).dirty, false);
      await exec(page, 'edit.copy');
      if (mac) await press(page, 'Mod+Alt+Shift+V');
      else await choose(page, 'Edit', 'Paste and Match Style');
      await page.waitFor(`document.querySelectorAll(${js(P)}).length === 2`);
      const SMALL = '<p class="small fragment" data-fragment-index="3"';
      await roundTrip(page, [
        [`${PARAGRAPH}\n  <ul>`, `${PARAGRAPH}\n  ${PARAGRAPH.replace('<p>', '<p style="translate: 20px -141px">')}\n  <ul style="translate: 0px -161px">`],
        [`${SMALL}>`, `${SMALL} style="translate: 0px -161px">`],
      ]);
      assert.deepEqual(errors(page), []);
    });

    test(`File > Revert to Saved asks first, then shows the file again on the same slide without the draft (${platform})`, async (t) => {
      const page = await load(t, platform, { open: false, drafts: true });
      await exec(page, 'file.recent.clear');
      assert.deepEqual((await page.evaluate(`window.BeesonEditor.status()`)).problems, []);
      assert.equal(await render(page), page.source);
      assert.equal((await state(page, 'file.revert')).enabled, false);
      const file = await menuLabels(page, 'File');
      assert.deepEqual(file.slice(0, file.indexOf('Revert to Saved') + 1), ['Open…', 'Open Recent', '|', 'Save', 'Save As…', 'Autosave', 'Revert to Saved']);
      await caretInParagraph(page);
      await type(page, ' typed');
      await page.waitFor('window.BeesonEditor.status().draft', 5000);
      assert.equal((await state(page, 'file.revert')).enabled, true);

      // Cancel and Esc keep the edits
      await choose(page, 'File', 'Revert to Saved');
      assert.deepEqual(await card(page, 'revert'), {
        title: 'Do you want to revert to the most recently saved version?',
        text: 'Your current changes will be lost.',
        buttons: ['Revert', 'Cancel'],
      });
      assert.equal(await page.evaluate('document.activeElement.textContent'), 'Cancel');
      await cardButton(page, 'revert', 'Cancel');
      assert.equal(await card(page, 'revert'), null);
      await choose(page, 'File', 'Revert to Saved');
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await card(page, 'revert'), null);
      assert.ok((await paragraph(page)).endsWith(' typed'));
      assert.equal((await status(page)).dirty, true);

      // Revert loads the page again from the file. a read that Chrome has not answered when the new
      // page is shown fails with this error, which is thus not a failure of the click on Revert
      await page.evaluate('window.__before = true');
      await choose(page, 'File', 'Revert to Saved');
      await cardButton(page, 'revert', 'Revert').catch((error) => {
        if (!/Inspected target navigated or closed/.test(error.message)) throw error;
      });
      await page.waitFor(`!window.__before && document.readyState === 'complete'`);
      await page.waitFor(deckSettled);
      await page.waitFor(ready);
      await page.waitFor(`window.BeesonEditor.status().state === 'loaded'`);
      const after = await status(page);
      assert.deepEqual({ dirty: after.dirty, draft: after.draft, recover: after.recover, undo: after.undo }, { dirty: false, draft: false, recover: false, undo: false });
      assert.equal(await page.evaluate('Reveal.getIndices().h'), TEXT);
      assert.equal(await paragraph(page), 'A paragraph with bold, italic, code, and  inline.');
      assert.equal(await render(page), page.source);
      assert.equal(await card(page, 'recover'), null);
      assert.deepEqual(errors(page), []);
    });

    test(`File > Open Recent lists the decks opened here by name, opens one without the picker, and ends with Clear Menu (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'file.recent.clear');
      await openBar(page, 'File');
      assert.deepEqual((await rows(page))[0].slice(0, 2), [
        { label: 'Open…', keys: mac ? '⌘O' : 'Ctrl+O', dimmed: false, submenu: false },
        { label: 'Open Recent', keys: '', dimmed: true, submenu: false },
      ]);
      await press(page, 'Escape');
      // two files of the deck in the origin private file system, chosen with the pickers
      const a = `recent-a-${platform}.html`;
      const b = `recent-b-${platform}.html`;
      await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      for (const name of [${js(a)}, ${js(b)}]) {
        const w = await (await root.getFileHandle(name, { create: true })).createWritable();
        await w.write(${js(page.source)});
        await w.close();
      }
      window.__picked = 0;
      window.showOpenFilePicker = async () => { window.__picked++; return [await root.getFileHandle(${js(a)})]; };
      window.showSaveFilePicker = async () => { window.__picked++; return root.getFileHandle(${js(b)}); };
    })()`);
      await choose(page, 'File', 'Open…');
      await page.waitFor('window.__picked === 1');
      await page.waitFor(`window.BeesonEditorShell.menuItems('File', 'Open Recent').length === 3`);
      await choose(page, 'File', 'Save As…');
      await page.waitFor(`window.__picked === 2 && window.BeesonEditorShell.menuItems('File', 'Open Recent').length === 4`);
      assert.deepEqual(await menuLabels(page, 'File', 'Open Recent'), [b, a, '|', 'Clear Menu']);
      const file = await menuLabels(page, 'File');
      assert.deepEqual(file.slice(0, 3), ['Open…', '{Open Recent}', '|']);

      // the deck kept in a, opened from the submenu, is the file of the next save
      await caretInParagraph(page);
      await type(page, '!');
      await choose(page, 'File', 'Open Recent', a);
      assert.deepEqual((await card(page, 'ask')).buttons, ['Save and open…', 'Open without saving', 'Cancel']);
      await cardButton(page, 'ask', 'Open without saving');
      await page.waitFor(`window.BeesonEditorShell.menuItems('File', 'Open Recent')[0]?.command === 'file.recent.1' && window.BeesonEditor.state('file.recent.1').label === ${js(a)}`);
      assert.equal(await page.evaluate('window.__picked'), 2);
      assert.equal((await status(page)).dirty, false);
      assert.equal(await render(page), page.source);
      await caretInParagraph(page);
      await type(page, '!');
      await press(page, 'Mod+S');
      await page.waitFor('!window.BeesonEditor.status().dirty');
      const saved = await page.evaluate(`(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle(${js(a)})).getFile()).text())()`);
      assert.equal(saved, page.source.replace(PARAGRAPH, PARAGRAPH.replace('inline.</p>', 'inline.!</p>')));
      assert.equal(await page.evaluate('window.__picked'), 2);

      // the list is kept through a reload, and it is not offered without the open picker
      await written(page, [a, b]);
      await page.goto(page.url);
      await page.waitFor(ready);
      await page.waitFor(`window.BeesonEditorShell.menuItems('File', 'Open Recent').length === 4`);
      assert.deepEqual(await menuLabels(page, 'File', 'Open Recent'), [a, b, '|', 'Clear Menu']);
      await page.evaluate('window.showOpenFilePicker = undefined');
      assert.deepEqual((await menuLabels(page, 'File')).slice(0, 2), ['Open…', 'Open Recent']);
      assert.equal((await state(page, 'file.recent.none')).enabled, false);
      await page.goto(page.url);
      await page.waitFor(ready);
      await page.waitFor(`window.BeesonEditorShell.menuItems('File', 'Open Recent').length === 4`);

      // Clear Menu empties the list, also after a reload
      await choose(page, 'File', 'Open Recent', 'Clear Menu');
      assert.deepEqual((await menuLabels(page, 'File')).slice(0, 2), ['Open…', 'Open Recent']);
      await written(page, []);
      await page.goto(page.url);
      await page.waitFor(ready);
      await wait(page, 300);
      assert.deepEqual((await menuLabels(page, 'File')).slice(0, 2), ['Open…', 'Open Recent']);
      assert.deepEqual(errors(page), []);
    });

    test(`Clear Menu empties Open Recent at once, while its list is still being written to the database (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'file.recent.clear');
      const name = `recent-slow-${platform}.html`;
      await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      const w = await (await root.getFileHandle(${js(name)}, { create: true })).createWritable();
      await w.write(${js(page.source)});
      await w.close();
      window.showOpenFilePicker = async () => [await root.getFileHandle(${js(name)})];
    })()`);
      await choose(page, 'File', 'Open…');
      await page.waitFor(`window.BeesonEditorShell.menuItems('File', 'Open Recent').length === 3`);
      // a database that does not answer, as one under load answers late
      const labels = await page.evaluate(`(() => {
      indexedDB.open = () => ({});
      window.BeesonEditor.exec('file.recent.clear');
      const E = window.BeesonEditor;
      return window.BeesonEditorShell.menuItems('File').slice(0, 2).map((i) => i.command ? E.state(i.command).label : '{' + i.label + '}');
    })()`);
      assert.deepEqual(labels, ['Open…', 'Open Recent']);
      assert.deepEqual(errors(page), []);
    });

    test(`Clear Menu at the start of the editor is kept when the read of Open Recent answers after it (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'file.recent.clear');
      const name = `recent-late-${platform}.html`;
      await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      const w = await (await root.getFileHandle(${js(name)}, { create: true })).createWritable();
      await w.write(${js(page.source)});
      await w.close();
      window.showOpenFilePicker = async () => [await root.getFileHandle(${js(name)})];
    })()`);
      await choose(page, 'File', 'Open…');
      await written(page, [name]);
      // the database answers 1 s late, as on a slow runner, hence the menu is cleared while the
      // read of the start is in flight
      const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `{
        const open = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function (...args) {
          const ask = open.apply(this, args);
          let fn = null;
          Object.defineProperty(ask, 'onsuccess', { get: () => fn, set: (f) => { fn = f; } });
          ask.addEventListener('success', (ev) => setTimeout(() => fn?.call(ask, ev), 1000));
          return ask;
        };
      }`,
      });
      t.after(() => page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {}));
      await page.goto(page.url);
      await page.waitFor(ready);
      await exec(page, 'file.recent.clear');
      await wait(page, 3000);
      assert.deepEqual((await menuLabels(page, 'File')).slice(0, 2), ['Open…', 'Open Recent']);
      await written(page, []);
    });

    test(`the card of a deck that cannot read itself offers the file of the deck kept for Open Recent (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'file.recent.clear');
      const name = `recent-card-${platform}.html`;
      await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      const w = await (await root.getFileHandle(${js(name)}, { create: true })).createWritable();
      await w.write(${js(page.source)});
      await w.close();
      window.showOpenFilePicker = async () => [await root.getFileHandle(${js(name)})];
    })()`);
      await choose(page, 'File', 'Open…');
      await page.waitFor(`window.BeesonEditor.state('file.recent.1').label === ${js(name)}`);
      // a page whose fetch of itself fails asks for its file, as a deck opened from file: does
      const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: 'window.fetch = () => Promise.reject(new TypeError("offline")); window.showOpenFilePicker = async () => { window.__picked = true; throw new DOMException("cancelled", "AbortError"); };',
      });
      t.after(() => page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {}));
      await written(page, [name]);
      await page.goto(page.url);
      await page.waitFor(ready);
      await page.waitFor(`(() => { const b = document.querySelector('dialog.beeson-edit-dialog:not([hidden]) button.primary'); return b?.textContent === ${js(`Open ${name}`)}; })()`);
      const shown = await page.evaluate(`(() => { const c = [...document.querySelectorAll('dialog.beeson-edit-dialog')].find((c) => !c.hidden); return { title: c.querySelector('h3').textContent, buttons: [...c.querySelectorAll('button')].map((b) => b.textContent), focused: document.activeElement.textContent, text: c.querySelector('p').textContent }; })()`);
      assert.equal(shown.title, 'Choose the file of this deck');
      assert.deepEqual(shown.buttons, [`Open ${name}`, 'Choose editor-layouts.html…']);
      assert.equal(shown.focused, `Open ${name}`);
      assert.match(shown.text, new RegExp(`Open ${name.replace(/\./g, '\\.')}, the file of this deck that you chose on `));
      const at = await page.evaluate(`(() => { const r = document.querySelector('dialog.beeson-edit-dialog:not([hidden]) button.primary').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await clickText(page, at);
      await page.waitFor(`window.BeesonEditor.status().state === 'loaded'`);
      assert.equal(await page.evaluate('window.__picked ?? false'), false);
      assert.deepEqual((await status(page)).problems, []);
      assert.equal(await page.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-dialog')].some((c) => !c.hidden)`), false);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page).filter((e) => !e.includes('offline')), []);
    });

    // the deck of layers does not have a video, which the test server sends without ranges, hence
    // the videos of the deck of layouts hold every connection of the print view and its fonts do not load
    test(`File > Export To > PDF… prints the print view of the saved deck with a page per step (${platform})`, async (t) => {
      const deck = 'test/pages/layers.html';
      const page = await load(t, platform, { deck, n: 2 });
      assert.deepEqual((await menuLabels(page, 'File')).slice(-4), ['|', '{Export To}', '|', 'Print…']);
      assert.deepEqual(await menuLabels(page, 'File', 'Export To'), ['PDF…', 'HTML…', 'PowerPoint…']);
      // the tab of the print view is kept for the test, and its print is recorded
      await page.evaluate(`(() => {
      const real = window.open;
      window.__printed = 0;
      window.open = (...a) => {
        window.__url = a[0];
        const win = real.apply(window, a);
        if (!win) return win;
        window.__view = win;
        // a method of the window is bound to it, and the global Reveal, also a function, is not
        const native = (f) => typeof f === 'function' && Function.prototype.toString.call(f).includes('[native code]');
        return new Proxy(win, { get: (w, k) => k === 'print' ? () => { window.__printed++; } : native(w[k]) ? w[k].bind(w) : w[k] });
      };
    })()`);
      await choose(page, 'File', 'Export To', 'PDF…');
      await page.waitFor('window.__printed === 1', 60000);
      const url = new URL(await page.evaluate('window.__url'));
      assert.equal(url.pathname, `/${deck}`);
      assert.deepEqual([...url.searchParams.keys()].sort(), ['edit-platform', 'print-pdf', 'still']);
      const pages = await page.evaluate(`window.__view.document.querySelectorAll('.pdf-page').length`);
      assert.match((await status(page)).message, /^The print view of layers\.html is open in a new tab, with one page per step/);
      await page.evaluate('window.__view.close()');
      // npm run pdf prints the same pages, one per step of each slide
      const print = await browser.newPage();
      t.after(() => print.close().catch(() => {}));
      await printView(print, `${server.origin}/${deck}?print-pdf&still`);
      assert.equal(pages, await print.evaluate(`document.querySelectorAll('.pdf-page').length`));
      assert.ok(pages > 3, `${pages} pages for the 3 slides of the deck`);
      // the editor is shown again in front of the print view, since a hidden tab does not get frames
      await page.send('Page.bringToFront');

      // with unsaved changes, the saved file is printed, and the edits are kept
      const step = '<p id="plain-1" class="fragment" data-fragment-index="1">The first step.</p>';
      const edited = step.replace('step.</p>', 'step!</p>');
      await clickText(page, await page.evaluate(`(() => {
      const p = document.getElementById('plain-1');
      const r = document.createRange();
      r.setStart(p.firstChild, p.firstChild.length - 1);
      r.setEnd(p.firstChild, p.firstChild.length);
      const box = r.getBoundingClientRect();
      return { x: box.right - 1, y: box.top + box.height / 2 };
    })()`));
      await press(page, 'Backspace');
      await type(page, '!');
      await byteExact(page, [[step, edited]]);
      await choose(page, 'File', 'Export To', 'PDF…');
      assert.deepEqual(await card(page, 'ask'), {
        title: 'The deck has unsaved changes',
        text: 'The PDF is printed from the file. Save the edits into it first, export the saved file without them, or go on editing.',
        buttons: ['Save and export', 'Export the saved file', 'Cancel'],
      });
      await cardButton(page, 'ask', 'Export the saved file');
      await page.waitFor('window.__printed === 2', 60000);
      assert.equal(await page.evaluate(`[...window.__view.document.querySelectorAll('#plain-1')].every((p) => p.textContent === 'The first step.')`), true);
      await page.evaluate('window.__view.close()');
      await page.send('Page.bringToFront');
      assert.equal((await status(page)).dirty, true);
      await roundTrip(page, [[step, edited]]);
      assert.deepEqual(errors(page), []);
    });

    test(`File > Export To > HTML… writes a copy of the deck with its edits, and the deck keeps its file (${platform})`, async (t) => {
      const page = await load(t, platform);
      const name = `export-${platform}.html`;
      await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      window.showSaveFilePicker = async (o) => { window.__suggested = o.suggestedName; return root.getFileHandle(${js(name)}, { create: true }); };
    })()`);
      await caretInParagraph(page);
      await type(page, '!');
      await choose(page, 'File', 'Export To', 'HTML…');
      await page.waitFor(`(async () => { try { return (await (await (await navigator.storage.getDirectory()).getFileHandle(${js(name)})).getFile()).size > 0; } catch { return false; } })()`);
      const edited = page.source.replace(PARAGRAPH, PARAGRAPH.replace('inline.</p>', 'inline.!</p>'));
      const copy = await page.evaluate(`(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle(${js(name)})).getFile()).text())()`);
      assert.equal(copy, edited);
      assert.equal(await page.evaluate('window.__suggested'), 'editor-layouts.html');
      assert.equal((await status(page)).dirty, true);
      assert.equal(readFileSync(LAYOUTS, 'utf8'), page.source);
      await roundTrip(page, [[PARAGRAPH, PARAGRAPH.replace('inline.</p>', 'inline.!</p>')]]);
      assert.deepEqual(errors(page), []);
    });
  }
});

// tests of R7.3 on both platforms with trusted input: Save as Picture… and Size and Position… in
// the menu of a figure, the Grid and Guides submenu in the menu of a slide, Edit > Spelling and
// Grammar > Check Spelling While Typing with the menu of the browser on a second right-click, and
// the search field of the Help menu
describe('Save as Picture…, Grid and Guides, Spelling', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  // slides of the deck of layouts: a paragraph and a list, a figure with a raster image, and a video
  const TEXT = 2;
  const WHITE_FIGURE = 6;
  const VIDEO = 7;
  const P = '.reveal section.present > p:not(.small)';

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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const ready = 'window.BeesonEditor && window.BeesonEditor.ready.then(() => true)';
  const menus = (page) => page.evaluate(`document.querySelectorAll('.beeson-edit-menu').length`);
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

  // a listener that runs before those of the editor and records, after each contextmenu event,
  // whether its default was prevented, i.e. whether the menu of the browser was kept from opening
  const RECORD = `window.__context = []; addEventListener('contextmenu', (e) => setTimeout(() => window.__context.push(e.defaultPrevented)), true);`;

  // the editor on the slide n of a deck served over HTTP
  async function load(t, platform, { deck = LAYOUTS, n = TEXT, record = false, page: reuse } = {}) {
    const page = reuse ?? (await browser.newPage({ width: 1600, height: 1000 }));
    if (!reuse) t.after(() => page.close().catch(() => {}));
    if (record) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORD });
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor(ready);
    // the choice of spelling of a test that failed is not left to the next, and a page reloaded
    // keeps it
    if (!reuse && (await page.evaluate(`localStorage.getItem('beeson-spelling') !== null`))) {
      await page.evaluate(`localStorage.removeItem('beeson-spelling')`);
      return load(t, platform, { deck, n, page });
    }
    page.source = readFileSync(deck, 'utf8');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`)).problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the rows of the open menus, the last opened last
  const rows = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu')].map((m) => [...m.querySelectorAll('.item')].map((i) => ({
  label: i.querySelector('.label')?.firstChild?.textContent ?? '',
  path: i.querySelector('.label .path')?.textContent ?? '',
  keys: i.querySelector('.keys')?.textContent ?? '',
  dimmed: i.getAttribute('aria-disabled') === 'true',
  submenu: i.getAttribute('aria-haspopup') === 'menu',
  hi: i.classList.contains('hi'),
})))`);
  const labels = (list) => list.map((r) => r.label);

  // the center of the last item labeled label of the open menus, or null
  const itemAt = (page, label) => page.evaluate(`(() => {
  const item = [...document.querySelectorAll('.beeson-edit-menu .item')].filter((i) => i.querySelector('.label')?.firstChild?.textContent === ${js(label)}).at(-1);
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  async function openBar(page, bar) {
    await clickText(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu .item')`, 3000);
  }

  // a trusted click on each label of a path of the open menu, with the pointer moved onto a submenu
  // row so that it opens
  async function pick(page, ...path) {
    const open = await menus(page);
    for (const [i, label] of path.entries()) {
      const at = await itemAt(page, label);
      assert.ok(at, `${label} is not in the open menu`);
      if (i < path.length - 1) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
        await page.waitFor(`document.querySelectorAll('.beeson-edit-menu').length > ${open + i}`);
      } else await clickText(page, at);
    }
    await frames(page);
  }

  // a trusted right-click at a point, and the menus open after it
  async function rightClick(page, at, modifiers = '') {
    await click(page, at, { button: 'right', modifiers });
    await frames(page);
  }

  const point = (page, selector, fx = 0.5, fy = 0.5) => page.evaluate(`(() => {
  const r = [...document.querySelectorAll(${js(selector)})].map((e) => e.getBoundingClientRect()).find((r) => r.width && r.height);
  return { x: r.left + r.width * ${fx}, y: r.top + r.height * ${fy} };
})()`);

  // the Help menu opened again with text typed into its search field
  async function search(page, text) {
    await press(page, 'Escape');
    await openBar(page, 'Help');
    await type(page, text);
  }

  // a point of the slide shown away from every element, in its lower left corner
  const empty = (page) => page.evaluate(`(() => { const r = document.querySelector('.reveal section.present').getBoundingClientRect(); return { x: r.left + 20, y: r.bottom - 20 }; })()`);

  for (const platform of PLATFORMS) {
    const mac = platform === 'mac';

    test(`Save as Picture… follows Replace Image… in the menu of an image and downloads its file under its own name without a fetch (${platform})`, async (t) => {
      const page = await load(t, platform, { n: WHITE_FIGURE });
      await page.evaluate(`(() => {
      window.__saved = [];
      HTMLAnchorElement.prototype.click = function () { window.__saved.push({ name: this.download, href: this.href }); };
      window.__open = [];
      window.open = (...a) => { window.__open.push(a); return null; };
    })()`);
      await rightClick(page, await point(page, '.reveal section.present img.white-figure'));
      const menu = labels((await rows(page))[0]);
      assert.equal(menu[menu.indexOf('Replace Image…') + 1], 'Save as Picture…');
      assert.ok(menu.indexOf('Size and Position…') > menu.indexOf('Save as Picture…'));
      // the fetches of the picture by a script alone, since another file of the deck may be answered
      // during the save, and the picture may be drawn again by an img
      const fetches = () => page.evaluate(`performance.getEntriesByType('resource').filter((r) => r.name.endsWith('/demo/figure-light.png') && ['fetch', 'xmlhttprequest'].includes(r.initiatorType)).length`);
      const fetched = await fetches();
      await pick(page, 'Save as Picture…');
      assert.equal(await menus(page), 0);
      const saved = await page.evaluate('window.__saved');
      assert.equal(saved.length, 1);
      assert.equal(saved[0].name, 'figure-light.png');
      assert.equal(saved[0].href, `${server.origin}/demo/figure-light.png`);
      assert.deepEqual(await page.evaluate('window.__open'), []);
      assert.equal(await fetches(), fetched, 'the picture was fetched to be saved');
      const bytes = await page.evaluate(`fetch(${js(saved[0].href)}).then((r) => r.arrayBuffer()).then((b) => [...new Uint8Array(b)])`);
      assert.equal(sha(Buffer.from(bytes)), sha(readFileSync('demo/figure-light.png')));
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`Save Media as… in the menu of a video downloads the video of the mode shown (${platform})`, async (t) => {
      const page = await load(t, platform, { n: VIDEO });
      await page.evaluate(`window.__saved = []; HTMLAnchorElement.prototype.click = function () { window.__saved.push({ name: this.download, href: this.href }); };`);
      await rightClick(page, await point(page, '.reveal section.present video'));
      const menu = labels((await rows(page))[0]);
      assert.ok(menu.includes('Save Media as…'));
      assert.ok(!menu.includes('Save as Picture…'));
      await pick(page, 'Save Media as…');
      const saved = await page.evaluate('window.__saved');
      assert.equal(saved.length, 1);
      const shown = await page.evaluate(`[...document.querySelectorAll('.reveal section.present video')].find((v) => v.getBoundingClientRect().width).getAttribute('src')`);
      assert.equal(saved[0].name, shown.split('/').pop());
      assert.ok(['clip-dark.mp4', 'clip-light.mp4'].includes(saved[0].name));
      assert.deepEqual(errors(page), []);
    });

    test(`Size and Position… opens the Arrange tab with the focus on W, or on X when W is set by the layout (${platform})`, async (t) => {
      const page = await load(t, platform, { n: WHITE_FIGURE });
      await rightClick(page, await point(page, '.reveal section.present img.white-figure'));
      await pick(page, 'Size and Position…');
      await page.waitFor(`document.activeElement && document.activeElement.matches('#beeson-edit-num-width, #beeson-edit-num-x')`, 3000);
      const focus = await page.evaluate(`(() => {
      const a = document.activeElement;
      const w = document.querySelector('#beeson-edit-num-width');
      return { id: a.id, width: !!w && !w.disabled, selected: a.selectionStart === 0 && a.selectionEnd === a.value.length, shown: !!a.closest('#beeson-edit-panel-format') && a.getBoundingClientRect().width > 0 };
    })()`);
      assert.equal(focus.id, focus.width ? 'beeson-edit-num-width' : 'beeson-edit-num-x');
      assert.ok(focus.selected && focus.shown);
      await press(page, 'Escape');

      // an image with its own width gets the focus on W
      const figureBox = await load(t, platform, { n: 3 });
      await rightClick(figureBox, await point(figureBox, '.reveal section.present figure img', 0.5, 0.4));
      await pick(figureBox, 'Size and Position…');
      await figureBox.waitFor(`document.activeElement && document.activeElement.matches('#beeson-edit-num-width, #beeson-edit-num-x')`, 3000);
      const id = await figureBox.evaluate(`document.activeElement.id`);
      const width = await figureBox.evaluate(`!document.querySelector('#beeson-edit-num-width').disabled`);
      assert.equal(id, width ? 'beeson-edit-num-width' : 'beeson-edit-num-x');
      await byteExact(figureBox);
      assert.deepEqual([...errors(page), ...errors(figureBox)], []);
    });

    test(`the menu of a slide has Grid and Guides with Gridlines, Snap to Grid, and Grid Settings…, then Rulers (${platform})`, async (t) => {
      const page = await load(t, platform);
      await rightClick(page, await empty(page));
      const slide = (await rows(page))[0];
      const at = labels(slide).indexOf('Grid and Guides');
      assert.ok(at > 0, 'Grid and Guides is not in the menu of the slide');
      assert.ok(slide[at].submenu);
      assert.equal(slide[at + 1].label, 'Rulers');
      assert.ok(labels(slide).indexOf('Reset Slide') < at);
      await pick(page, 'Grid and Guides', 'Gridlines');
      assert.equal(await menus(page), 0);
      assert.equal((await state(page, 'view.grid')).checked, true);

      await rightClick(page, await empty(page));
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await itemAt(page, 'Grid and Guides')) });
      await page.waitFor(`document.querySelectorAll('.beeson-edit-menu').length > 1`);
      const grid = (await rows(page))[1];
      assert.deepEqual(labels(grid), ['Gridlines', 'Snap to Grid', 'Grid Settings…']);
      assert.equal(grid[0].keys, mac ? "⌘'" : "Ctrl+'");
      await pick(page, 'Gridlines');
      assert.equal((await state(page, 'view.grid')).checked, false);

      const rulers = (await state(page, 'view.rulers')).checked;
      await rightClick(page, await empty(page));
      await pick(page, 'Rulers');
      assert.equal((await state(page, 'view.rulers')).checked, !rulers);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`Check Spelling While Typing is kept in the browser, set only in the page, and a save leaves the file as it was (${platform})`, async (t) => {
      const page = await load(t, platform);
      await openBar(page, 'Edit');
      const edit = (await rows(page))[0];
      const spelling = edit.find((r) => r.label === 'Spelling and Grammar');
      assert.ok(spelling?.submenu, 'Spelling and Grammar is not a submenu of Edit');
      assert.ok(labels(edit).indexOf('Spelling and Grammar') < labels(edit).indexOf('Substitutions'));
      assert.equal((await state(page, 'edit.spelling')).checked, true);
      await pick(page, 'Spelling and Grammar', 'Check Spelling While Typing');
      assert.equal((await state(page, 'edit.spelling')).checked, false);
      assert.equal(await page.evaluate(`document.querySelector(${js(P)}).spellcheck`), false);
      assert.equal(await page.evaluate(`document.querySelector('.reveal section.present h2').spellcheck`), false);
      await byteExact(page);
      const { text } = await saveAndReopen(page, `r7-3-spelling-${platform}.html`);
      assert.equal(text, page.source);
      assert.ok(!/spellcheck/.test(text));

      await load(t, platform, { page });
      assert.equal((await state(page, 'edit.spelling')).checked, false);
      assert.equal(await page.evaluate(`document.querySelector(${js(P)}).spellcheck`), false);
      await openBar(page, 'Edit');
      await pick(page, 'Spelling and Grammar', 'Check Spelling While Typing');
      assert.equal((await state(page, 'edit.spelling')).checked, true);
      assert.equal(await page.evaluate(`document.querySelector(${js(P)}).spellcheck`), true);
      assert.equal(await page.evaluate(`localStorage.getItem('beeson-spelling')`), null);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`a second right-click in a text, or a right-click with ${mac ? '⌥' : 'Alt'} held, opens the menu of the browser (${platform})`, async (t) => {
      const page = await load(t, platform, { record: true });
      const at = await point(page, P, 0.1);
      await clickText(page, at);
      await frames(page);
      await rightClick(page, at);
      const text = (await rows(page))[0];
      assert.ok(labels(text).includes('Cut'));
      assert.match(await page.evaluate(`document.querySelector('.beeson-edit-menu .note').textContent`), /^Right-click again for spelling guesses/);
      await rightClick(page, at);
      assert.equal(await menus(page), 0, 'the second right-click opened a menu of the editor');
      await page.waitFor('window.__context.length === 2');
      assert.deepEqual(await page.evaluate('window.__context'), [true, false]);

      // a right-click after the menu of the browser opens the menu of the editor again
      await rightClick(page, at);
      assert.equal(await menus(page), 1);
      await press(page, 'Escape');
      await rightClick(page, await empty(page), 'Alt');
      assert.equal(await menus(page), 0, 'a right-click with Alt opened a menu of the editor');
      await rightClick(page, await empty(page));
      assert.equal(await menus(page), 1);
      await page.waitFor('window.__context.length === 5');
      assert.deepEqual(await page.evaluate('window.__context'), [true, false, true, false, true]);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`the search field of the Help menu lists the commands with their path and keys, Return runs one, and Esc closes the menu (${platform})`, async (t) => {
      const page = await load(t, platform);
      await openBar(page, 'Help');
      assert.equal(await page.evaluate(`document.activeElement.matches('.beeson-edit-menu .search input')`), true);
      assert.deepEqual(labels((await rows(page))[0]), ['Keyboard Shortcuts']);

      // a key of the editor is typed into the field, e.g. G, which jumps to a slide outside it
      await press(page, 'g');
      assert.equal(await page.evaluate(`document.activeElement.value`), 'g');
      await press(page, 'Backspace');
      assert.equal(await page.evaluate(`document.activeElement.value`), '');

      await type(page, 'save as');
      let found = (await rows(page))[0];
      const saveAs = found.find((r) => r.label === 'Save As…');
      assert.ok(saveAs, 'Save As… is not found');
      assert.equal(saveAs.path, 'File');
      assert.equal(saveAs.keys, mac ? '⇧⌘S' : 'Ctrl+Shift+S');
      assert.ok(found[0].hi);

      await search(page, 'match style');
      found = (await rows(page))[0];
      const match = found.find((r) => r.label === 'Paste and Match Style');
      assert.equal(match?.path, 'Edit');
      assert.equal(match.keys, mac ? '⌥⇧⌘V' : '');

      await search(page, 'zzzq');
      assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-menu .results .note')?.textContent`), 'The search does not match any menu item');

      // the arrow keys move the highlight through the results, and Return runs the highlighted one
      await search(page, 'spelling');
      found = (await rows(page))[0];
      assert.equal(found[0].label, 'Check Spelling While Typing');
      assert.equal(found[0].path, 'Edit ▸ Spelling and Grammar');
      assert.ok(found[0].hi);
      await press(page, 'ArrowDown');
      assert.ok(!(await rows(page))[0][0].hi);
      await press(page, 'ArrowUp');
      assert.ok((await rows(page))[0][0].hi);
      assert.equal(await page.evaluate(`document.activeElement.getAttribute('aria-activedescendant') === document.querySelector('.beeson-edit-menu .item.hi').id`), true);
      await press(page, 'Enter');
      await frames(page);
      assert.equal(await menus(page), 0);
      assert.equal((await state(page, 'edit.spelling')).checked, false);
      await search(page, 'spelling');
      await press(page, 'Enter');
      assert.equal((await state(page, 'edit.spelling')).checked, true);

      await openBar(page, 'Help');
      await type(page, 'keyboard');
      await press(page, 'Enter');
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-keys[open]')`, 3000);
      await press(page, 'Escape');
      await frames(page);

      await openBar(page, 'Help');
      await type(page, 'grid');
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await menus(page), 0);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }
});
