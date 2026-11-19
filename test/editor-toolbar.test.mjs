import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { byteExact, center, click, clickText, drag, press, saveAndReopen, selectFigure, type } from './helpers/editor.mjs';
import { serve } from '../scripts/webdriver.mjs';

describe('the toolbar overflow, menu bar, and dialog keys', () => {
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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const run = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)}).then(() => true)`);
  let saves = 0;

  async function load(t, platform, { n = 0, mode = 'light', width = 1600, height = 1000, stored = {} } = {}) {
    const page = await browser.newPage({ width, height });
    t.after(() => page.close().catch(() => {}));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
    const url = `${server.origin}/test-deck.html?edit&still&theme=${mode}&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate(`localStorage.clear(); for (const [k, v] of Object.entries(${js(stored)})) localStorage.setItem(k, v); true`);
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync('test-deck.html', 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function roundTrip(page) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r9-7-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  const BAR = `(() => {
  const t = document.querySelector('.beeson-edit-top');
  const bs = [...t.querySelectorAll('button.tb')].filter((b) => b.getClientRects().length).map((b) => {
    const r = b.getBoundingClientRect();
    const l = b.querySelector('.label');
    return { id: b.dataset.command ?? (b.classList.contains('more-groups') ? 'more' : ''), left: Math.round(r.left), right: Math.round(r.right), label: !!l && getComputedStyle(l).display !== 'none' };
  });
  return { over: t.scrollWidth - t.clientWidth, buttons: bs, off: bs.filter((b) => b.right > innerWidth).map((b) => b.id) };
})()`;

  const TOOLBAR_KEY = 'beeson-edit-toolbar:/test-deck.html';

  const menuLabels = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item .label')].map((l) => l.textContent)`);

  for (const platform of PLATFORMS) {
    test(`a customized toolbar wider than the window folds its last groups into » and keeps every button in view (${platform})`, async (t) => {
      for (const width of [1280, 1100]) {
        const page = await load(t, platform, { width, height: 900 });
        await run(page, 'view.customizeToolbar');
        for (const id of ['file.open', 'find.open', 'view.notes', 'arrange.ungroup', 'play.rehearse', 'arrange.group']) {
          await page.evaluate(`document.querySelector('.beeson-edit-customize .item[data-item="${id}"]').focus()`);
          await press(page, 'Enter');
        }
        await click(page, '.beeson-edit-customize .done');
        await frames(page);
        const bar = await page.evaluate(BAR);
        assert.deepEqual(bar.off, [], `${width}: buttons off screen`);
        assert.ok(bar.over <= 0, `${width}: the toolbar overflows by ${bar.over} px`);
        assert.ok(bar.buttons.some((b) => b.id === "more"), `${width}: no » menu ${js(bar)}`);
        assert.ok(bar.buttons.every((b) => b.label), `${width}: the labels are hidden`);
        await click(page, '.beeson-edit-top .more-groups');
        assert.ok((await menuLabels(page)).length > 0, `${width}: the menu » is empty`);
        for (const { id } of bar.buttons) if (id !== 'more') assert.ok(await page.evaluate(`!document.querySelector('.beeson-edit-menu .item[data-command="${id}"]')`), `${width}: ${id} is both in the toolbar and in »`);
        await press(page, 'Escape');
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });

    test(`the labels of the default toolbar are kept at every width at which they fit (${platform})`, async (t) => {
      for (const width of [1100, 1099, 1080]) {
        const page = await load(t, platform, { width, height: 800 });
        const bar = await page.evaluate(BAR);
        assert.ok(bar.buttons.every((b) => b.label), `${width}: the labels are hidden`);
        assert.ok(bar.over <= 0, `${width}: the toolbar overflows by ${bar.over} px`);
        assert.ok(!bar.buttons.some((b) => b.id === 'more'), `${width}: » is shown though every button fits`);
        await page.close();
      }
      const page = await load(t, platform, { width: 1600, height: 900, stored: { [TOOLBAR_KEY]: js({ items: null, show: 'icon' }) } });
      assert.ok((await page.evaluate(BAR)).buttons.every((b) => !b.label), 'a label is shown with Icon Only');
      assert.deepEqual(errors(page), []);
    });
  }

  const FIGURES = 4;
  const KEYS = {
    toolbar: { mac: ['Alt+Mod+T', '⌥⌘T'], other: ['Ctrl+F1', 'Ctrl+F1'] },
    format: { mac: ['Ctrl+Mod+1', '⌃⌘1'], other: ['Ctrl+Shift+1', 'Ctrl+Shift+1'] },
    steps: { mac: ['Ctrl+Mod+2', '⌃⌘2'], other: ['Ctrl+Shift+2', 'Ctrl+Shift+2'] },
    notes: { mac: ['Ctrl+Mod+3', '⌃⌘3'], other: ['Ctrl+Shift+3', 'Ctrl+Shift+3'] },
    deselect: { mac: ['Mod+Shift+A', '⇧⌘A'], other: ['Mod+Shift+A', 'Ctrl+Shift+A'] },
    useSelection: { mac: ['Mod+E', '⌘E'], other: ['Mod+E', 'Ctrl+E'] },
  };

  async function sheetRows(page) {
    await run(page, 'help.keys');
    const rows = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('.beeson-edit-keys .row')].map((r) => [r.children[0].textContent, r.children[1].textContent]))`);
    await press(page, 'Escape');
    return rows;
  }

  async function menuKeys(page, title) {
    await click(page, `.beeson-edit-menubar [role=menuitem]:nth-child(${(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].findIndex((b) => b.textContent === ${js(title)})`)) + 1})`);
    const items = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => [i.querySelector('.label')?.textContent, i.querySelector('.keys, .key, kbd')?.textContent ?? '']))`);
    await press(page, 'Escape');
    return items;
  }

  const checked = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)}).checked`);

  for (const platform of PLATFORMS) {
    test(`View has Hide Toolbar, and the toolbar, the panes, Deselect All, and Use Selection for Find have keys in the menus and the sheet (${platform})`, async (t) => {
      const page = await load(t, platform, { n: FIGURES });
      const key = (name) => KEYS[name][platform][0];
      const shown = (name) => KEYS[name][platform][1];
      const view = await menuKeys(page, 'View');
      assert.equal(view['Hide Toolbar'], shown('toolbar'), 'View > Hide Toolbar');
      assert.equal(view.Format, shown('format'));
      assert.equal(view.Steps, shown('steps'));
      assert.equal(view.Notes, shown('notes'));
      const edit = await menuKeys(page, 'Edit');
      assert.match(edit.Deselect ?? edit['Deselect All'], new RegExp(shown('deselect').replace(/[+]/g, '\\+')));
      assert.equal(edit['Use Selection for Find'], shown('useSelection'));
      const sheet = await sheetRows(page);
      assert.equal(sheet['Hide Toolbar'], shown('toolbar'));
      assert.equal(sheet['Use Selection for Find'], shown('useSelection'));
      for (const name of ['format', 'steps', 'notes']) assert.ok(Object.values(sheet).includes(shown(name)), `the sheet does not list ${shown(name)}`);

      const topShown = () => page.evaluate(`document.querySelector('.beeson-edit-top').getClientRects().length > 0`);
      await press(page, key('toolbar'));
      assert.equal(await topShown(), false, 'the key does not hide the toolbar');
      assert.equal((await menuKeys(page, 'View'))['Show Toolbar'], shown('toolbar'));
      await press(page, key('toolbar'));
      assert.equal(await topShown(), true, 'the key does not show the toolbar again');

      assert.equal(await checked(page, 'shell.format'), true);
      await press(page, key('format'));
      assert.equal(await checked(page, 'shell.format'), false, 'the key of Format does not hide the inspector');
      await press(page, key('steps'));
      assert.equal(await checked(page, 'view.steps'), true, 'the key of Steps does not show the steps');
      await press(page, key('format'));
      assert.equal(await checked(page, 'shell.format'), true, 'the key of Format does not show the Format tab');
      const notes = await checked(page, 'view.notes');
      await press(page, key('notes'));
      assert.equal(await checked(page, 'view.notes'), !notes, 'the key of Notes does not switch the notes');
      await press(page, key('notes'));

      await clickText(page, '.reveal section.present figure img');
      assert.ok((await page.evaluate('window.BeesonEditor.selection().length')) > 0, 'the figure is not selected');
      await press(page, key('deselect'));
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 0, 'Deselect All leaves the figure selected');

      const word = await center(page, '.reveal section.present > p');
      await clickText(page, { x: word.x - 200, y: word.y });
      await click(page, { x: word.x - 200, y: word.y }, { count: 2 });
      const selected = await page.evaluate('getSelection().toString().trim()');
      assert.ok(selected.length > 1, 'no word is selected');
      await press(page, key('useSelection'));
      assert.equal(await page.evaluate(`document.querySelector('.beeson-find input')?.value`), selected, 'the selection is not the query of Find');
      assert.deepEqual(errors(page), []);
    });
  }

  const OTHER_KEYS = {
    'Edit Mask': 'Ctrl+Shift+M',
    'Merge Cells': 'Alt+Shift+M',
    'Delete Row': 'Ctrl+Shift+Backspace',
    'Delete Column': 'Alt+Shift+Backspace',
    'Auto-Align': 'Alt+Shift+U',
    'Hide Slide': 'Ctrl+Shift+H',
    Rulers: 'Alt+Shift+R',
  };

  test('the commands with a key on the Mac have a key on Windows and Linux, listed in the sheet, and the keys run them (other)', async (t) => {
    const page = await load(t, 'other', { n: FIGURES });
    const sheet = await sheetRows(page);
    for (const [label, key] of Object.entries(OTHER_KEYS)) {
      assert.equal(sheet[label], key, `${label} is listed with ${sheet[label]}`);
      assert.doesNotMatch(key, /Ctrl\+Alt|Alt\+Ctrl/);
    }
    assert.deepEqual(await page.evaluate('window.BeesonEditorShell.sheetClashes()'), []);
    assert.deepEqual(await page.evaluate('window.BeesonEditorShell.keyClashes(true)'), []);
    for (const [key, id] of [['Alt+Shift+R', 'view.rulers']]) {
      const was = await checked(page, id);
      await press(page, key);
      assert.equal(await checked(page, id), !was, `${key} does not switch ${id}`);
      await press(page, key);
    }
    await clickText(page, '.reveal section.present figure img');
    await press(page, 'Ctrl+Shift+M');
    assert.equal(await page.evaluate(`window.BeesonEditor.state('image.editMask').enabled`), false, 'Ctrl+Shift+M does not open the mask');
    await press(page, 'Escape');
    await press(page, 'Escape');
    await press(page, 'Escape');
    await press(page, 'Ctrl+Shift+H');
    assert.equal(await page.evaluate(`document.querySelector('.reveal .slides > section.present').dataset.visibility`), 'hidden', 'Ctrl+Shift+H does not hide the slide');
    await roundTrip(page);
  });

  for (const platform of PLATFORMS) {
    test(`the menu bar has the order of Keynote (${platform})`, async (t) => {
      const page = await load(t, platform);
      const titles = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].map((b) => b.textContent)`);
      assert.deepEqual(titles, ['File', 'Edit', 'Insert', 'Slide', 'Format', 'Arrange', 'View', 'Play', 'Help']);
      await run(page, 'help.keys');
      const heads = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-keys h3')].map((h) => h.textContent).filter((h) => !['Other', 'Mouse'].includes(h))`);
      assert.deepEqual(heads, titles.filter((h) => heads.includes(h)));
      assert.deepEqual(errors(page), []);
    });
  }

  const focusIn = (page, selector) => page.evaluate(`!!document.activeElement?.closest(${js(selector)})`);
  const open = (page, selector) => page.evaluate(`!!document.querySelector(${js(selector)})?.open`);

  for (const platform of PLATFORMS) {
    test(`Tab stays inside the Link popover, and Esc closes it at the first press (${platform})`, async (t) => {
      const page = await load(t, platform, { n: FIGURES });
      const p = await center(page, '.reveal section.present > p');
      await clickText(page, { x: p.x - 200, y: p.y });
      await click(page, { x: p.x - 200, y: p.y }, { count: 2 });
      await press(page, 'Mod+K');
      assert.ok(await open(page, 'dialog.beeson-edit-link'), 'the Link popover is not open');
      for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Tab']) {
        await press(page, key);
        assert.ok(await focusIn(page, 'dialog.beeson-edit-link'), `the focus leaves the popover after ${key}`);
      }
      await press(page, 'Escape');
      assert.equal(await open(page, 'dialog.beeson-edit-link'), false, 'the first Esc does not close the popover');
      assert.ok(await focusIn(page, '.reveal section.present > p'), 'the focus does not go back to the paragraph');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`Tab stays inside the sheet of keyboard shortcuts, and Esc closes it at the first press (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, '.beeson-edit-nav .row[aria-current="true"], .beeson-edit-nav [aria-current="true"]');
      const before = await page.evaluate(`document.activeElement.outerHTML.slice(0, 80)`);
      await press(page, '?');
      assert.ok(await open(page, 'dialog.beeson-edit-keys'), '? does not open the sheet');
      for (const key of ['Tab', 'Shift+Tab', 'Tab']) {
        await press(page, key);
        assert.ok(await focusIn(page, 'dialog.beeson-edit-keys'), `the focus leaves the sheet after ${key}`);
      }
      await press(page, 'Escape');
      assert.equal(await open(page, 'dialog.beeson-edit-keys'), false, 'the first Esc does not close the sheet');
      assert.equal(await page.evaluate(`document.activeElement.outerHTML.slice(0, 80)`), before, 'the focus does not go back');
      assert.deepEqual(errors(page), []);
    });

    test(`Return in the field of Grid Settings presses OK, and the field has the focus ring of the editor (${platform})`, async (t) => {
      const page = await load(t, platform);
      void run(page, 'view.grid.settings');
      await page.waitFor(`!!document.querySelector('dialog.beeson-grid-sheet[open] input[name="spacing"]')`);
      assert.equal(await page.evaluate(`document.activeElement.name`), 'spacing');
      await press(page, 'Tab');
      await press(page, 'Shift+Tab');
      const ring = await page.evaluate(`(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, color: s.outlineColor }; })()`);
      const focus = await page.evaluate(`(() => { const p = document.createElement('div'); p.style.color = 'var(--ed-focus)'; document.querySelector('dialog.beeson-grid-sheet').append(p); const c = getComputedStyle(p).color; p.remove(); return c; })()`);
      assert.deepEqual(ring, { style: 'solid', color: focus }, 'the field does not have the ring of the editor');
      await page.evaluate(`document.activeElement.select()`);
      await type(page, '60');
      await press(page, 'Enter');
      assert.equal(await open(page, 'dialog.beeson-grid-sheet'), false, 'Return does not close the sheet');
      void run(page, 'view.grid.settings');
      await page.waitFor(`!!document.querySelector('dialog.beeson-grid-sheet[open] input[name="spacing"]')`);
      assert.equal(await page.evaluate(`document.activeElement.value`), '60', 'Return does not apply the spacing');
      await press(page, 'Escape');
      assert.deepEqual(errors(page), []);
    });
  }

  for (const [platform, answer] of [['mac', 'save'], ['other', 'cancel']]) {
    test(`Return on the card of Present with unsaved changes presses ${answer === 'save' ? 'the default button' : 'the focused button'} (${platform})`, async (t) => {
      const page = await load(t, platform, { n: FIGURES });
      await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      window.BeesonEditor.attach(await root.getFileHandle('r9-7-present.html', { create: true }));
      return true;
    })()`);
      const p = await center(page, '.reveal section.present > p');
      await clickText(page, { x: p.x, y: p.y });
      await clickText(page, { x: p.x, y: p.y });
      await press(page, 'End');
      await type(page, 'x');
      await press(page, 'Escape');
      void run(page, 'file.present');
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-dialog.ask[open]')`);
      await press(page, 'Enter');
      await page.waitFor(`!document.querySelector('dialog.beeson-edit-dialog.ask[open]')`);
      await sleep(300);
      const shown = () => page.evaluate(`!!document.querySelector('.beeson-edit-show')`);
      if (answer === 'save') {
        assert.equal(await shown(), true, 'the show is not opened');
        await page.waitFor('window.BeesonEditor.status().dirty === false').catch(() => assert.fail('the deck is not saved'));
      } else assert.equal(await shown(), false);
      assert.deepEqual(errors(page), []);
    });
  }

  async function clickItem(page, label) {
    const at = await page.evaluate(`(() => { const i = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)}); if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    assert.ok(at, `the open menu does not have ${label}`);
    await clickText(page, at);
  }
  const percentText = (page) => page.evaluate(`document.querySelector('.beeson-edit-bottom .percent .value').textContent`);
  for (const platform of PLATFORMS) {
    test(`a typed percentage sets the zoom from the status bar and from View > Zoom (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, '.beeson-edit-bottom .percent');
      await clickItem(page, 'Zoom…');
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-dialog[open] input[name="percent"]')`);
      assert.equal(await page.evaluate(`document.activeElement.name`), 'percent');
      await page.evaluate(`document.activeElement.select()`);
      await type(page, '140');
      await press(page, 'Enter');
      await frames(page);
      assert.equal(await percentText(page), '140%', 'the typed percentage is not the zoom');
      for (const [typed, shown] of [['1000', '400%'], ['5', '10%']]) {
        void run(page, 'zoom.custom');
        await page.waitFor(`!!document.querySelector('dialog.beeson-edit-dialog[open] input[name="percent"]')`);
        await page.evaluate(`document.activeElement.select()`);
        await type(page, typed);
        await press(page, 'Enter');
        await frames(page);
        assert.equal(await percentText(page), shown, `${typed} is not clamped`);
      }
      void run(page, 'zoom.custom');
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-dialog[open] input[name="percent"]')`);
      assert.equal(await page.evaluate(`document.activeElement.value`), '10');
      await type(page, '7');
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await percentText(page), '10%');
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`the face of the Zoom popup shows the percentage, and its item is Fit Slide (${platform})`, async (t) => {
      const page = await load(t, platform);
      const face = () => page.evaluate(`document.querySelector('.beeson-edit-top [data-command="toolbar.zoom"] .readout').textContent`);
      assert.match(await percentText(page), /^\d+%$/);
      assert.equal(await face(), await percentText(page), 'the face does not show the fitted percentage');
      await click(page, '.beeson-edit-top [data-command="toolbar.zoom"]');
      const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => [i.querySelector('.label').textContent, i.getAttribute('aria-checked')])`);
      assert.deepEqual(items[0], ['Fit Slide', 'true']);
      await clickItem(page, '200%');
      await frames(page);
      assert.equal(await face(), '200%');
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`the status bar does not show a fixed sentence of help (${platform})`, async (t) => {
      const page = await load(t, platform, { width: 1440 });
      const cut = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-bottom *')].filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow === 'ellipsis').map((e) => e.textContent)`);
      assert.deepEqual(cut, [], 'a text of the status bar is cut');
      assert.ok(!(await page.evaluate(`document.querySelector('.beeson-edit-bottom').textContent`)).includes('Click a text'), 'the sentence of help is shown');
    });
  }

  for (const platform of PLATFORMS) {
    test(`Customize Toolbar dims the items that the toolbar holds (${platform})`, async (t) => {
      const page = await load(t, platform);
      await run(page, 'view.customizeToolbar');
      const item = (id) => page.evaluate(`(() => { const i = document.querySelector('.beeson-edit-customize .item[data-item="${id}"]'); return { disabled: i.getAttribute('aria-disabled'), opacity: Number(getComputedStyle(i).opacity) }; })()`);
      const undo = await item('edit.undo');
      assert.equal(undo.disabled, 'true', 'Undo is not dimmed though it is in the toolbar');
      assert.ok(undo.opacity < 1);
      assert.deepEqual(await item('file.open'), { disabled: null, opacity: 1 });
      await page.evaluate(`document.querySelector('.beeson-edit-customize .item[data-item="file.open"]').focus()`);
      await press(page, 'Enter');
      assert.equal((await item('file.open')).disabled, 'true', 'Open is not dimmed once added');
      await click(page, '.beeson-edit-customize .done');
      assert.deepEqual(errors(page), []);
    });
  }

  const VIEWS = ['Navigator', 'Slide Only', 'Slide Sorter', 'Format', 'Steps', 'Notes'];
  for (const platform of PLATFORMS) {
    test(`the View menu lists the views in the order of Keynote, with one name each (${platform})`, async (t) => {
      const page = await load(t, platform);
      const menu = Object.keys(await menuKeys(page, 'View')).filter((l) => VIEWS.includes(l));
      assert.deepEqual(menu, VIEWS, 'the View menu');
      assert.ok(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-bottom button')].some((b) => b.textContent === 'Navigator')`), 'the status bar does not name the navigator');
    });
  }

  for (const platform of PLATFORMS) {
    test(`the resize cursor stays while the edge of the navigator is dragged past its limit (${platform})`, async (t) => {
      const page = await load(t, platform);
      const from = await center(page, '.beeson-edit-nav-edge');
      await drag(page, from, { dx: 500, hold: true });
      const at = { x: from.x + 500, y: from.y };
      const cursor = await page.evaluate(`getComputedStyle(document.elementFromPoint(${at.x}, ${at.y})).cursor`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      assert.equal(cursor, 'ew-resize', 'the cursor past the limit');
      assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-nav').getBoundingClientRect().width`), 360);
      assert.equal(await page.evaluate(`getComputedStyle(document.body).cursor`), 'auto', 'the cursor is kept after the drag');
    });
  }

  for (const platform of PLATFORMS) {
    test(`the notes pane does not have a frame while it has the focus (${platform})`, async (t) => {
      const page = await load(t, platform);
      await run(page, 'view.notes');
      await frames(page);
      const outline = await page.evaluate(`(() => { const n = document.querySelector('.reveal .slides section.present > aside.notes'); return [document.activeElement === n, getComputedStyle(n).outlineColor]; })()`);
      assert.deepEqual(outline, [true, 'rgba(0, 0, 0, 0)']);
    });
  }

  const ALTGR = new Set(['[', ']', '\\', '{', '}', '|', '@', '~', '#', '`']);
  const altGr = (key) => ALTGR.has(key.split('+').at(-1));
  test('a command with a key that needs AltGr shows a key that every layout has, and no key of Windows and Linux takes Ctrl+Alt (other)', async (t) => {
    const page = await load(t, 'other');
    await page.evaluate(`window.BeesonEditorShell.define({ id: 'test.app', label: 'App', run: (a) => { window.app = a; } })`);
    await page.evaluate(`window.BeesonEditor.exec('test.app')`);
    const commands = await page.evaluate(`window.app.commands.list().filter((c) => c.keys?.other?.length).map((c) => ({ id: c.id, label: typeof c.label === 'string' ? c.label : c.id, keys: c.keys.other }))`);
    for (const c of commands) {
      for (const k of c.keys) assert.doesNotMatch(k, /(Ctrl|Mod)\+(.*\+)?Alt|Alt\+(.*\+)?(Ctrl|Mod)/, `${c.id} takes ${k}`);
      if (c.keys.some(altGr)) {
        assert.ok(c.keys.some((k) => !altGr(k)), `${c.id} has only keys that need AltGr`);
        assert.ok(!altGr(c.keys[0]), `${c.id} shows ${c.keys[0]} first`);
      }
    }
    const sheet = await sheetRows(page);
    const labels = await page.evaluate(`Object.fromEntries(['text.indent', 'text.outdent', 'text.clear'].map((id) => [id, window.app.commands.get(id)?.label]))`);
    for (const [id, label] of Object.entries(labels)) {
      assert.ok(label, `${id} is not defined`);
      const keys = sheet[label].split(', ');
      assert.equal(keys.length, 2, `${label} is listed with ${sheet[label]}`);
      assert.ok(keys.some((k) => /[\]\[\\]$/.test(k)) && keys.some((k) => !/[\]\[\\]$/.test(k)), `${label} is listed with ${sheet[label]}`);
    }
    assert.deepEqual(errors(page), []);
  });

  const SHELL = `(() => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  return { nav: box('.beeson-edit-nav'), inspector: box('.beeson-edit-inspector'), canvas: box('.beeson-edit-canvas'), slide: box('.reveal') };
})()`;
  async function resizeTo(page, width, height = 700) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    await frames(page);
  }
  function whole(b, what) {
    const right = Math.min(b.canvas.right, b.inspector?.left ?? Infinity);
    const s = b.slide;
    assert.ok(s.left >= b.canvas.left - 1 && s.right <= right + 1 && s.top >= b.canvas.top - 1 && s.bottom <= b.canvas.bottom + 1, `the slide ${js(s)} is not whole on the canvas ${js(b.canvas)} ${what}`);
  }
  const stateOf = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  for (const platform of PLATFORMS) {
    test(`in a window 760 px wide the slide is whole at Fit beside the inspector, and the navigator is still on and shown when asked for (${platform})`, async (t) => {
      const page = await load(t, platform, { width: 760 });
      if (!(await stateOf(page, 'shell.format')).checked) await run(page, 'shell.format');
      await frames(page);
      let b = await page.evaluate(SHELL);
      assert.ok(b.inspector && !b.nav, `the inspector and the navigator at 760 px: ${js(b)}`);
      assert.equal(await page.evaluate('window.BeesonEditorShell.stage.zoom'), null, 'the zoom is not Fit');
      whole(b, 'at 760 px');
      assert.equal((await stateOf(page, 'view.navigator')).checked, false, 'View > Navigator reads as on while the navigator is hidden');
      await resizeTo(page, 1440);
      assert.ok((await page.evaluate(SHELL)).nav, 'the navigator is not shown again at 1440 px');
      assert.equal((await stateOf(page, 'view.navigator')).checked, true);
      await resizeTo(page, 760);
      await run(page, 'view.navigator');
      await frames(page);
      b = await page.evaluate(SHELL);
      assert.ok(b.nav, 'View > Navigator does not show the navigator at 760 px');
      assert.equal(b.inspector, null, 'the inspector is not closed for the navigator');
      assert.equal((await stateOf(page, 'view.navigator')).checked, true);
      whole(b, 'with the navigator at 760 px');
      await run(page, 'view.navigator');
      await resizeTo(page, 1440);
      assert.equal((await page.evaluate(SHELL)).nav, null, 'the navigator is shown though it was hidden');
      assert.equal((await stateOf(page, 'view.navigator')).checked, false);
      assert.deepEqual(errors(page), []);
    });
  }

  const CODE = 5;
  const numbersSwitch = `(() => {
  const input = document.querySelector('.beeson-edit-inspector input[data-command="code.numbers"]');
  const label = input?.closest('label');
  const next = label?.nextElementSibling;
  return { disabled: input?.disabled, title: label?.title ?? '', note: next?.matches('.ed-note') && !next.hidden ? next.textContent : '', warn: !!next?.classList.contains('warn') };
})()`;
  for (const platform of PLATFORMS) {
    test(`the dimmed switch of the line numbers says that the line steps need them (${platform})`, async (t) => {
      const page = await load(t, platform, { n: CODE });
      if (!(await stateOf(page, 'shell.format')).checked) await run(page, 'shell.format');
      await clickText(page, '.reveal section.present pre');
      await page.waitFor(`!!document.querySelector('.beeson-edit-inspector input[data-command="code.numbers"]')`);
      const dim = await page.evaluate(numbersSwitch);
      assert.equal(dim.disabled, true);
      assert.match(dim.title, /Line steps are shown only with line numbers/, 'the dimmed switch does not have a tooltip');
      assert.match(dim.note, /Line steps are shown only with line numbers/, 'the pane does not say why the switch is dimmed');
      assert.equal(dim.warn, false, 'the note is not muted');
      await page.evaluate(`window.BeesonEditor.exec('code.lines', { el: document.querySelector('.reveal section.present pre code'), value: '' })`);
      await frames(page);
      assert.deepEqual(await page.evaluate(numbersSwitch), { disabled: false, title: '', note: '', warn: false });
      await roundTrip(page);
    });
  }
});

describe('the cuts and the View button', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const SECTIONS = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].map((m) => m[0]);
  const MATH = SECTIONS.findIndex((s) => s.includes('<h2>Math, an ordered list, and a zone</h2>'));
  const FIGURE_BOX = '.reveal .slides section.present figure.figure-box';
  const MATH_TAG = '<section>\n  <h2>Math, an ordered list, and a zone</h2>';
  const VIEW = '.beeson-edit-top [data-command="toolbar.view"]';

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
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const has = (page, id) => page.evaluate(`(() => { try { window.BeesonEditor.state(${js(id)}); return true; } catch { return false; } })()`);
  const menuItems = (page) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].map((m) => ({ label: m.querySelector('.label')?.textContent ?? m.textContent.trim(), checked: m.getAttribute('aria-checked') === 'true' }))`);
  const pick = (page, label) =>
    page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].find((m) => (m.querySelector('.label')?.textContent ?? '') === ${js(label)}).click()`);
  const box = (page, selector) => page.evaluate(`(() => { const e = document.querySelector(${js(selector)}); const r = e?.getBoundingClientRect(); return r && !e.hidden && r.width ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null; })()`);
  const guides = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-hand-guide')].filter((g) => !g.hidden && !g.classList.contains('off')).map((g) => [g.dataset.axis, Number(g.dataset.at)])`);

  async function load(t, platform, { n = 0, storage = {}, size = { width: 1600, height: 1000 } } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate(`(() => { localStorage.clear(); for (const [k, v] of Object.entries(${js(storage)})) localStorage.setItem(k, v); return true; })()`);
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

  async function barMenu(page, title) {
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((x) => x.textContent === ${js(title)}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, at);
    await frames(page);
    const labels = (await menuItems(page)).map((i) => i.label);
    await press(page, 'Escape');
    await frames(page);
    return labels;
  }

  const chromeText = (page) => page.evaluate(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.reveal .slides')) continue;
    for (const a of ['aria-label', 'title', 'alt', 'placeholder']) if (el.getAttribute(a)) out.push(el.getAttribute(a));
  }
  out.push(document.body.innerText);
  return out.join('\\n');
})()`);

  for (const platform of PLATFORMS) {
    test(`the accessibility checker is gone: its command, its pane, its button in the status bar, and its toolbar item (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      for (const id of ['view.accessibility', 'review.altText', 'review.tableHeader']) assert.equal(await has(page, id), false, `${id} is still a command`);
      assert.ok(!(await barMenu(page, 'View')).includes('Check Accessibility'));
      assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-edit-a11y, .beeson-edit-bottom .a11y').length`), 0);
      assert.equal(await page.evaluate(`getComputedStyle(document.body).gridTemplateAreas.includes('a11y')`), false, 'the grid keeps a column for the pane');
      await exec(page, 'view.customizeToolbar');
      await frames(page);
      const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-customize .item')].map((i) => i.dataset.item)`);
      assert.ok(items.includes('file.open') && !items.includes('view.accessibility'), js(items));
      await click(page, '.beeson-edit-customize .done');
      const visited = [];
      for (let i = 0; i < 8; i++) {
        await press(page, 'F6');
        visited.push(await page.evaluate(`(() => { const a = document.activeElement; return a && a !== document.body ? (a.closest('[class*="beeson-edit-"]')?.className.match(/beeson-edit-[a-z0-9]+/)?.[0] ?? a.localName) : 'canvas'; })()`));
      }
      assert.ok(!visited.some((v) => v.includes('a11y')), js(visited));
      assert.deepEqual(errors(page), []);
    });

    test(`a toolbar customized with the Accessibility button is drawn without it (${platform})`, async (t) => {
      const key = `beeson-edit-toolbar:/${LAYOUTS}`;
      const page = await load(t, platform, { storage: { [key]: js({ items: ['toolbar.view', 'view.accessibility', 'separator', 'edit.undo', 'file.open'], show: 'both' }) } });
      const ids = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-top .tb')].filter((b) => b.getClientRects().length).map((b) => b.dataset.command)`);
      assert.deepEqual(ids, ['toolbar.view', 'edit.undo', 'file.open']);
      assert.deepEqual(errors(page), []);
    });

    test(`an edit, a zoom, and a change of slide do not run a check of the deck (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await click(page, '.reveal .slides section.present h2');
      await press(page, 'End');
      await type(page, ' more');
      await press(page, 'Escape');
      await exec(page, 'zoom.actual');
      await exec(page, 'navigate.next');
      await page.evaluate('new Promise((d) => setTimeout(d, 600))');
      const bar = await page.evaluate(`document.querySelector('.beeson-edit-bottom').innerText`);
      assert.doesNotMatch(bar, /Good to go|Investigate|Accessibility/);
      assert.equal(await page.evaluate(`[...document.querySelectorAll('style')].some((s) => s.textContent.includes('.beeson-edit-a11y'))`), false);
      assert.deepEqual(errors(page), []);
    });

    test(`the outline view is gone, and the thumbnails, the object list, and the Slide Sorter stay (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH, storage: { 'beeson-outline': '1' } });
      assert.equal(await has(page, 'view.outline'), false);
      assert.ok(!(await barMenu(page, 'View')).includes('Outline'));
      assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-edit-outline, .beeson-edit-nav.outlined').length`), 0);
      assert.ok(await box(page, '.beeson-edit-nav [aria-current="true"]'), 'the thumbnails are not shown');
      assert.equal(await has(page, 'view.lightTable'), true);
      await exec(page, 'view.objects');
      await frames(page);
      assert.ok(await box(page, '.beeson-edit-objects'), 'the object list is not shown');
      await page.evaluate(`document.querySelector('.beeson-edit-nav [aria-current="true"]').focus()`);
      await exec(page, 'edit.duplicate');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`), SECTIONS.length + 1);
      assert.deepEqual(errors(page), []);
    });

    test(`a click on the View button shows and hides the navigator, and it is pressed while the navigator is shown (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      const split = await page.evaluate(`(() => { const b = document.querySelector(${js(VIEW)}); const s = b.closest('.beeson-edit-split'); return s ? { arrow: !!s.querySelector('.more'), first: s.closest('.beeson-edit-top').querySelector('.tb') === b, popup: b.getAttribute('aria-haspopup') } : null; })()`);
      assert.deepEqual(split, { arrow: true, first: true, popup: null });
      const pressed = () => page.evaluate(`document.querySelector(${js(VIEW)}).getAttribute('aria-pressed')`);
      assert.equal(await pressed(), 'true');
      assert.equal((await state(page, 'view.navigator')).checked, true);
      await click(page, VIEW);
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-edit-menu').length`), 0, 'a menu was opened');
      assert.equal((await state(page, 'view.navigator')).checked, false);
      assert.equal(await box(page, '.beeson-edit-nav'), null);
      assert.equal(await pressed(), 'false');
      await click(page, VIEW);
      await frames(page);
      assert.equal((await state(page, 'view.navigator')).checked, true);
      assert.ok(await box(page, '.beeson-edit-nav'));
      assert.equal(await pressed(), 'true');
      await page.evaluate(`document.querySelector(${js(VIEW)}).focus()`);
      await press(page, 'Space');
      await frames(page);
      assert.equal((await state(page, 'view.navigator')).checked, false);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`the arrow of the View button lists Slide Sorter, Rulers, and Gridlines with their checks (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      const arrow = '.beeson-edit-split:has(> [data-command="toolbar.view"]) .more';
      await click(page, arrow);
      await frames(page);
      assert.deepEqual(await menuItems(page), [
        { label: 'Slide Sorter', checked: false },
        { label: 'Rulers', checked: false },
        { label: 'Gridlines', checked: false },
      ]);
      await pick(page, 'Rulers');
      await frames(page);
      assert.equal((await state(page, 'view.rulers')).checked, true);
      assert.equal((await state(page, 'view.navigator')).checked, true, 'the arrow toggled the navigator');
      await click(page, arrow);
      await frames(page);
      assert.deepEqual((await menuItems(page)).map((i) => i.checked), [false, true, false]);
      await pick(page, 'Slide Sorter');
      await frames(page);
      assert.equal((await state(page, 'view.lightTable')).checked, true);
      assert.ok(await box(page, '.beeson-edit-sorter'));
      const view = await barMenu(page, 'View');
      for (const label of ['Navigator', 'Slide Sorter', 'Steps', 'Notes', 'Rulers', 'Gridlines']) assert.ok(view.includes(label), `the View menu has no ${label}: ${js(view)}`);
      for (const label of ['Outline', 'Light Table', 'Check Accessibility', 'Show Guides']) assert.ok(!view.includes(label), `the View menu has ${label}`);
      assert.deepEqual(errors(page), []);
    });

    test(`Light Table is named Slide Sorter in its command, its table, the keys sheet, and the messages (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      assert.equal((await state(page, 'view.lightTable')).label, 'Slide Sorter');
      await exec(page, 'view.lightTable');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-sorter').getAttribute('aria-label')`), 'Slide Sorter');
      assert.doesNotMatch(await chromeText(page), /light table/i);
      await exec(page, 'view.lightTable');
      await exec(page, 'help.keys');
      await frames(page);
      assert.doesNotMatch(await chromeText(page), /light table|Show Guides|Check Accessibility/i);
      assert.deepEqual(errors(page), []);
    });

    test(`Show Guides is cut, and the guides are shown and snapped to while the rulers are shown (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      assert.equal(await has(page, 'view.guides'), false);
      const move = async () => {
        const k = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); return s.getBoundingClientRect().width / s.offsetWidth; })()`);
        await selectFigure(page, `${FIGURE_BOX} > img`);
        const figureBox = await box(page, FIGURE_BOX);
        await drag(page, { x: figureBox.left + figureBox.width / 2, y: figureBox.top + figureBox.height / 2 }, { dx: -183 * k, dy: 0, modifiers: 'Shift' });
        await frames(page);
        const moved = await page.evaluate(`document.querySelector(${js(FIGURE_BOX)}).style.translate`);
        await page.evaluate('window.BeesonEditor.undo()');
        await frames(page);
        return moved;
      };
      const free = await move();
      assert.notEqual(free, '-187px');
      for (const id of ['view.guides.add', 'view.guides.clear', 'slide.guides.copy', 'slide.guides.paste']) assert.equal((await state(page, id)).enabled, false, `${id} without the rulers`);
      await exec(page, 'view.rulers');
      await frames(page);
      await exec(page, 'view.guides.add', { x: [1013], y: [] });
      await frames(page);
      assert.deepEqual(await guides(page), [['x', 1013]]);
      for (const id of ['view.guides.clear', 'slide.guides.copy']) assert.equal((await state(page, id)).enabled, true, `${id} with the rulers`);
      await byteExact(page, [[MATH_TAG, MATH_TAG.replace('<section>', '<section data-guides="x1013">')]]);
      assert.equal(await move(), '-187px', 'the zone does not snap to the shown guide');
      await press(page, platform === 'mac' ? 'Mod+Ctrl+Alt+G' : 'Alt+F9');
      await frames(page);
      assert.deepEqual(await guides(page), [['x', 1013]]);
      await exec(page, 'view.rulers');
      await frames(page);
      assert.deepEqual(await guides(page), []);
      assert.equal((await state(page, 'view.guides.clear')).enabled, false);
      assert.equal(await move(), free, 'the zone snaps to a hidden guide');
      const x = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); const r = s.getBoundingClientRect(); return r.left + 1013 * r.width / s.offsetWidth; })()`);
      const slide = await box(page, '.reveal .slides');
      await drag(page, { x, y: slide.top + 8 }, { dx: 60, dy: 0 });
      await frames(page);
      await exec(page, 'view.rulers');
      await frames(page);
      assert.deepEqual(await guides(page), [['x', 1013]]);
      await byteExact(page, [[MATH_TAG, MATH_TAG.replace('<section>', '<section data-guides="x1013">')]]);
      assert.deepEqual(errors(page), []);
    });

    test(`the title bar sets the state of the file apart from its name by a gap and a muted color, without a dash (${platform})`, async (t) => {
      const page = await load(t, platform, { n: MATH });
      await exec(page, 'view.rulers');
      await exec(page, 'view.guides.add', { x: [500], y: [] });
      await frames(page);
      const doc = await page.evaluate(`(() => {
      const d = document.querySelector('.beeson-edit-titlebar .doc');
      const file = d.querySelector('.file'), state = d.querySelector('.state');
      const f = file.getBoundingClientRect(), s = state.getBoundingClientRect();
      return { text: d.textContent, kids: [...d.children].map((c) => c.className), gap: s.left - f.right, state: state.textContent, colors: [getComputedStyle(file).color, getComputedStyle(state).color] };
    })()`);
      assert.doesNotMatch(doc.text, /—/);
      assert.deepEqual(doc.kids, ['file', 'state']);
      assert.ok(doc.state.length > 0, 'the state is empty after an edit');
      assert.ok(doc.gap >= 8, `the gap is ${doc.gap} px`);
      assert.notEqual(doc.colors[0], doc.colors[1]);
      assert.deepEqual(errors(page), []);
    });
  }
});
