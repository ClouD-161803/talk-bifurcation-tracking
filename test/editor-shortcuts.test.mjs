import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, captured, click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

describe('keys listed in context menus and the sheet', () => {
  const PLATFORMS = ['mac', 'other'];
  const PANEL = '#beeson-edit-panel-format';
  const VIDEOS = 10;

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
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  let saves = 0;

  async function load(t, platform, { deck = 'test-deck.html', n = 0, size = { width: 1440, height: 900 }, format = true, mode = null, query = '' } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    if (mode) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}${mode ? `&theme=${mode}` : ''}${query}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (format && !(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await page.evaluate(`Reveal.slide(${n})`);
    await sleep(150);
    await frames(page);
    return page;
  }

  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r8-4-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    page.source = text;
    return edited;
  }

  const boxOf = (page, selector) => page.evaluate(`(() => {
  const el = [...document.querySelectorAll(${js(selector)})].find((e) => e.getClientRects().length);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
})()`);

  const SLOW_SEEK = `(() => {
  const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get() { return d.get.call(this); },
    set(v) { if (this.isConnected) d.set.call(this, v); else setTimeout(() => d.set.call(this, v), 900); },
  });
  return true;
})()`;
  const SLIDER = `${PANEL} input[name="poster-frame"]`;
  const posterBytes = (page, video) => page.evaluate(`fetch(document.querySelector(${js(video)}).poster).then((r) => r.arrayBuffer()).then((b) => [...new Uint8Array(b)].reduce((h, x) => (h * 31 + x) >>> 0, b.byteLength))`);

  for (const platform of PLATFORMS) {
    test(`a poster is captured at the time of the slider after a seek slower than 500 ms (${platform})`, async (t) => {
      const page = await load(t, platform, { n: VIDEOS });
      const mode = await page.evaluate(`[...document.querySelectorAll('.reveal section.present video')].find((v) => v.getBoundingClientRect().width).classList.contains('for-dark') ? 'dark' : 'light'`);
      const video = `.reveal section.present video.for-${mode}`;
      const clip = `clip-${mode}`;
      await clickText(page, video);
      await frames(page);
      await page.waitFor(`!!document.querySelector(${js(SLIDER)}) && !document.querySelector(${js(SLIDER)}).disabled`);
      await page.evaluate(SLOW_SEEK);
      const r = await boxOf(page, SLIDER);
      await clickText(page, { x: r.left + 8 + (r.width - 16) * 0.5, y: r.top + r.height / 2 });
      await captured(page, `window.BeesonEditor.render().includes('poster="media/${clip}.png"')`);
      const half = await posterBytes(page, video);
      await page.evaluate(`document.querySelector(${js(SLIDER)}).focus()`);
      await press(page, 'Home');
      await captured(page, `window.BeesonEditor.render().includes('poster="media/${clip}-2.png"')`);
      const first = await posterBytes(page, video);
      assert.notEqual(half, first, 'the poster at the middle of the video is its first frame');
      await page.evaluate('window.showDirectoryPicker = () => navigator.storage.getDirectory()');
      await roundTrip(page, 2);
    });
  }

  const ROWS = `[...([...document.querySelectorAll('.beeson-edit-menu')].at(-1)?.querySelectorAll('.item') ?? [])].map((el) => ({
  command: el.dataset.command ?? null,
  label: el.querySelector('.label')?.firstChild?.textContent ?? '',
  keys: el.querySelector('.keys')?.textContent ?? '',
}))`;

  const menuBarRows = (page) => page.evaluate(`(() => {
  const shell = window.BeesonEditorShell;
  const out = [];
  const walk = (items) => {
    shell.openMenu(items, { x: 40, y: 40 });
    out.push(...${ROWS}.filter((r) => r.command));
    shell.closeMenus();
    for (const it of items) if (it.items) walk(typeof it.items === 'function' ? it.items() : it.items);
  };
  for (const bar of ['File', 'Edit', 'Insert', 'Format', 'Arrange', 'Slide', 'View', 'Help']) walk(shell.menuItems(bar));
  return out;
})()`);

  function differences(bar, rows, where) {
    const out = [];
    for (const r of rows.filter((r) => r.command)) {
      const same = bar.filter((b) => b.command === r.command);
      const named = same.length ? same : bar.filter((b) => b.label === r.label);
      if (named.length && !named.some((b) => b.keys === r.keys)) out.push(`${where}: ${r.label} is listed with "${r.keys}" and in the menu bar with "${named.map((b) => b.keys).join('", "')}"`);
    }
    return out;
  }

  for (const platform of PLATFORMS) {
    test(`every item of every context menu is listed with the keys of the menu bar (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 4 });
      const bar = await menuBarRows(page);
      assert.ok(bar.some((b) => b.command === 'arrange.unlock' && b.keys), 'Arrange > Unlock is not listed with its keys');
      const found = [];
      const context = async (at, where, keys = bar) => {
        await click(page, at, { button: 'right' });
        await frames(page);
        const rows = await page.evaluate(ROWS);
        assert.ok(rows.length > 2, `the context menu of ${where} is not open`);
        found.push(...differences(keys, rows, where));
        await press(page, 'Escape');
        await frames(page);
        return rows;
      };
      const IMAGE = '.reveal section.present figure.figure-box > img';
      await context(IMAGE, 'an element');
      await clickText(page, IMAGE);
      await exec(page, 'arrange.lock');
      const locked = await context(IMAGE, 'a locked element');
      assert.ok(locked.some((r) => r.label === 'Unlock'), 'the menu of a locked element does not list Unlock');
      await context('.reveal section.present > p', 'a text');
      await click(page, '.beeson-edit-nav .row');
      await frames(page);
      const navBar = await menuBarRows(page);
      await context('.beeson-edit-nav .row', 'a slide of the navigator', navBar);
      const canvas = await boxOf(page, '.beeson-edit-canvas');
      await context({ x: canvas.left + 12, y: canvas.top + 12 }, 'the canvas');
      const nav = await boxOf(page, '.beeson-edit-nav');
      await page.evaluate(`window.BeesonEditorShell.context('navigator', ${nav.left + 20}, ${nav.bottom - 20})`);
      found.push(...differences(navBar, await page.evaluate(ROWS), 'the navigator'));
      await press(page, 'Escape');
      assert.deepEqual(found, []);
      assert.deepEqual(page.errors, []);
    });
  }

  const KEY_NAMES = new Set(['Ctrl', 'Shift', 'Alt', 'Meta', 'Esc', 'Enter', 'Tab', 'Backspace', 'Delete', 'Spacebar', 'Menu', 'Up Arrow', 'Down Arrow', 'Left Arrow', 'Right Arrow', 'Home', 'End', 'Page Up', 'Page Down', 'drag', ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)]);
  const ODD_PARTS = (label) => label.split(', ').flatMap((key) => key.split(/\+(?!$)/)).filter((part) => !(/^[\x21-\x7E]$/.test(part) || KEY_NAMES.has(part)));

  test('every key of the keyboard sheet and the menus of Windows and Linux is written with ASCII characters and the names of the keys', async (t) => {
    const page = await load(t, 'other', { n: 1 });
    const menus = (await menuBarRows(page)).filter((r) => r.keys).map((r) => [r.label, r.keys]);
    await exec(page, 'help.keys');
    await page.waitFor(`!!document.querySelector('dialog.beeson-edit-keys[open] kbd')`);
    const sheet = await page.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-keys[open] .row')].map((r) => [r.querySelector('span').textContent, r.querySelector('kbd').textContent])`);
    assert.ok(sheet.length > 40, 'the keyboard sheet is not filled');
    const odd = [...menus, ...sheet].filter(([, keys]) => ODD_PARTS(keys).length || !/^[\x20-\x7E]+$/.test(keys)).map(([label, keys]) => `${label}: ${keys}`);
    assert.deepEqual([...new Set(odd)], []);
    assert.ok(sheet.some(([label, keys]) => label === 'Zoom Out' && keys.split(', ').includes('Ctrl+-')), 'Zoom Out is not listed as Ctrl+-');
    assert.deepEqual(page.errors, []);
  });

  function formulaThenType(page, platform, text) {
    const key = (type, base, modifiers = 0) => page.send('Input.dispatchKeyEvent', { type, modifiers, ...base });
    const sent = [];
    const trigger = platform === 'mac'
      ? [{ key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69 }, 4 | 1]
      : [{ key: '=', code: 'Equal', windowsVirtualKeyCode: 187 }, 1];
    sent.push(key('rawKeyDown', ...trigger), key('keyUp', ...trigger));
    for (const c of text) {
      const base = { key: c, code: c === ' ' ? 'Space' : `Key${c.toUpperCase()}`, windowsVirtualKeyCode: c === ' ' ? 32 : c.toUpperCase().charCodeAt(0) };
      sent.push(key('keyDown', { ...base, text: c, unmodifiedText: c }), key('keyUp', base));
    }
    return Promise.all(sent);
  }

  for (const platform of PLATFORMS) {
    test(`every key typed back to back after Insert > Formula in a text reaches the TeX field of its inline formula (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 4, format: false });
      const PARA = '.reveal section.present > p';
      await clickText(page, PARA);
      await press(page, 'End');
      await frames(page);
      assert.ok(await page.evaluate(`document.activeElement.isContentEditable && !!document.activeElement.closest('.reveal')`), 'the caret is not in the paragraph');
      await formulaThenType(page, platform, 'abc d');
      await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
      await sleep(300);
      const field = await page.evaluate(`(() => { const f = document.querySelector('.beeson-math textarea'); return { value: f.value, focused: f === document.activeElement }; })()`);
      assert.deepEqual(field, { value: 'abc d', focused: true });
      await byteExact(page);
      await page.evaluate(`[...document.querySelectorAll('.beeson-math button')].find((b) => b.textContent === 'Insert').click()`);
      await page.waitFor(`!document.querySelector('.beeson-math')`);
      assert.match(await render(page), /\\\(abc d\\\)/);
      await roundTrip(page);
    });
  }

  const PAIR_DECK = 'test/pages/editor-r8-4.html';

  const imageTags = (text) => Object.fromEntries(['dark', 'light'].map((m) => [m, text.match(new RegExp(`<img class="for-${m}[^>]*>`))[0]]));
  const indexOf = (tag) => tag.match(/data-fragment-index="(\d+)"/)?.[1] ?? null;

  for (const platform of PLATFORMS) {
    for (const mode of ['dark', 'light']) {
      test(`an image pair in a slide is one item of the Steps pane, and its step is written on both images in ${mode} mode (${platform})`, async (t) => {
        const page = await load(t, platform, { deck: PAIR_DECK, n: 0, mode });
        await exec(page, 'view.steps');
        await frames(page);
        const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-inspector .rows .row .chip')].map((c) => c.getAttribute('aria-label'))`);
        assert.equal(rows.filter((r) => /A figure/.test(r)).length, 1, `the pair is not one row: ${rows.join(' | ')}`);
        await exec(page, 'steps.oneByOne');
        const text = await render(page);
        const tags = imageTags(text);
        const para = text.match(/<p[^>]*>A paragraph before/)[0];
        assert.ok(indexOf(tags.dark) && indexOf(tags.dark) === indexOf(tags.light), `the images are not at one step: ${tags.dark} ${tags.light}`);
        assert.match(tags.dark, /class="for-dark fragment"/);
        assert.match(tags.light, /class="for-light fragment"/);
        assert.deepEqual([indexOf(para), indexOf(tags.dark), indexOf(tags.light)], ['1', '2', '2'], 'the paragraph is not at step 1 and the pair at step 2');
        const badges = await page.evaluate(`document.querySelectorAll('.beeson-badges .beeson-badge').length`);
        assert.equal(badges, 2, 'the paragraph and the pair do not each have one number on the slide');
        await roundTrip(page);
      });
    }
  }

  const LISTED = {
    mac: { chrome: { Lock: '⌘L', Unlock: '⌥⌘L', Rulers: '⌘R' }, safari: { Lock: '⌃⌘L', Unlock: '⌃⌥⌘L', Rulers: '⌃⌘R' } },
    other: { chrome: { Lock: 'Ctrl+L', Unlock: 'Ctrl+Shift+L', Rulers: 'Alt+Shift+R' }, safari: { Lock: 'Ctrl+L', Unlock: 'Ctrl+Shift+L', Rulers: 'Alt+Shift+R' } },
  };

  for (const platform of PLATFORMS) {
    for (const browserName of ['chrome', 'safari']) {
      test(`Lock, Unlock, and Rulers list the key of Keynote first where the browser passes it to the page, in ${browserName} (${platform})`, async (t) => {
        const page = await load(t, platform, { n: 4, query: browserName === 'safari' ? '&edit-browser=safari' : '' });
        const rows = await menuBarRows(page);
        const keysOf = (id) => rows.find((r) => r.command === id)?.keys ?? '';
        const want = LISTED[platform][browserName];
        assert.deepEqual({ Lock: keysOf('arrange.lock'), Unlock: keysOf('arrange.unlock'), Rulers: keysOf('view.rulers') }, want);
        if (platform !== 'mac') return;
        const IMAGE = '.reveal section.present figure.figure-box > img';
        const locks = browserName === 'safari' ? [['Ctrl+Mod+L', 'Ctrl+Mod+Alt+L'], ['Mod+L', 'Mod+Alt+L']] : [['Mod+L', 'Mod+Alt+L'], ['Ctrl+Mod+L', 'Ctrl+Mod+Alt+L']];
        for (const [lock, unlock] of locks) {
          await clickText(page, IMAGE);
          await press(page, lock);
          await frames(page);
          assert.equal((await state(page, 'edit.undo')).label, 'Undo Lock', `${lock} does not lock the picture`);
          await press(page, unlock);
          await frames(page);
          assert.equal((await state(page, 'edit.undo')).label, 'Undo Unlock', `${unlock} does not unlock the picture`);
          await byteExact(page);
        }
        for (const key of ['Mod+R', 'Ctrl+Mod+R']) {
          const shown = (await state(page, 'view.rulers')).checked;
          await press(page, key);
          await frames(page);
          assert.equal((await state(page, 'view.rulers')).checked, !shown, `${key} does not toggle the rulers`);
        }
        assert.deepEqual(page.errors, []);
      });
    }
  }

  const fitTags = (text) => ({
    para: text.match(/<p[^>]*>The stable and the unstable/)[0],
    note: text.match(/<p[^>]*>A note in the style Small/)[0],
    list: text.match(/<ul[^>]*>/)[0],
  });

  for (const platform of PLATFORMS) {
    test(`a change of layout away from Split takes the style Small off the blocks that the fit of the panel shrank (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: PAIR_DECK, n: 1 });
      await exec(page, 'slide.layout.split');
      await sleep(300);
      await frames(page);
      const split = fitTags(await render(page));
      assert.match(split.para, /class="small"/, 'the panel is not fitted, and the test does not show the finding');
      assert.match(split.list, /class="small"/, 'the list of the panel is not fitted');
      await page.evaluate('window.BeesonEditor.undo()');
      await page.evaluate('window.BeesonEditor.redo()');
      await exec(page, 'slide.layout.content');
      await sleep(300);
      await frames(page);
      const content = fitTags(await render(page));
      assert.doesNotMatch(content.para, /small/, `the paragraph fitted to the panel is still small after the change to Content: ${content.para}`);
      assert.doesNotMatch(content.list, /small/, `the list fitted to the panel is still small after the change to Content: ${content.list}`);
      assert.equal(content.note, '<p class="small">A note in the style Small', 'the note in the style Small before the change to Split lost its style');
      await byteExact(page);
      await page.evaluate('window.BeesonEditor.undo()');
      assert.match(fitTags(await render(page)).para, /class="small"/, 'the undo of the change to Content does not give back the fit');
      await page.evaluate('window.BeesonEditor.redo()');
      await byteExact(page);
      const { text } = await saveAndReopen(page, `r8-4-${++saves}.html`);
      assert.equal(text, page.source);
      assert.deepEqual(page.errors, []);
    });
  }

  const texFields = (page) => page.evaluate(`[...document.querySelectorAll('textarea')]
  .filter((f) => f.getClientRects().length && (f.closest('.beeson-math') || f.name === 'tex'))
  .map((f) => [f.closest('.beeson-math') ? 'popover' : 'pane', f.value])`);

  for (const platform of PLATFORMS) {
    for (const where of ['slide', 'text']) {
      test(`one TeX field is shown while the popover of a new formula in a ${where} is open (${platform})`, async (t) => {
        const page = await load(t, platform, { n: where === 'slide' ? 5 : 4 });
        if (where === 'slide') await exec(page, 'insert.formula');
        else {
          await clickText(page, '.reveal section.present > p');
          await press(page, 'End');
          await frames(page);
          await formulaThenType(page, platform, '');
        }
        await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
        await sleep(300);
        await frames(page);
        assert.deepEqual(await texFields(page), [['popover', '']], 'the TeX field of the new formula is not shown once, in its popover');
        await page.evaluate(`(() => { const f = document.querySelector('.beeson-math textarea'); f.value = 'x^2'; f.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
        await sleep(200);
        await page.evaluate(`[...document.querySelectorAll('.beeson-math button')].find((b) => b.textContent === 'Insert').click()`);
        await page.waitFor(`!document.querySelector('.beeson-math')`);
        await sleep(300);
        await frames(page);
        if (where === 'slide') assert.deepEqual(await texFields(page), [['pane', 'x^2']], 'the Formula pane does not show the TeX of the formula once the popover is closed');
        assert.match(await render(page), where === 'slide' ? /\\\[x\^2\\\]/ : /\\\(x\^2\\\)/);
        await roundTrip(page, where === 'slide' ? 2 : 1);
      });
    }
  }

  const layoutRow = (page) => page.evaluate(`(() => {
  const menu = [...document.querySelectorAll('.beeson-edit-menu')].at(-1);
  const el = menu && [...menu.querySelectorAll('.item')].find((i) => i.querySelector('.label')?.firstChild?.textContent === 'Layout');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { command: el.dataset.command ?? null, submenu: el.getAttribute('aria-haspopup') === 'menu', left: r.left, right: r.right, top: r.top, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
  const chooserOf = (page) => page.evaluate(`(() => {
  const d = document.querySelector('dialog.beeson-edit-layouts[open]');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, marked: [...d.querySelectorAll('.tile[aria-selected="true"]')].map((t) => t.dataset.layout), focused: document.activeElement?.dataset?.layout ?? null };
})()`);

  async function openLayouts(page, from) {
    if (from === 'menu bar') await click(page, await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((x) => x.textContent === 'Slide'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    else await click(page, '.beeson-edit-nav .row[aria-current="true"]', { button: 'right' });
    await frames(page);
    const row = await layoutRow(page);
    assert.ok(row, `the menu of the ${from} does not have an item Layout`);
    assert.ok(!row.submenu, `Layout in the menu of the ${from} is a submenu of text items`);
    await clickText(page, row);
    await sleep(100);
    await frames(page);
    return row;
  }

  for (const platform of PLATFORMS) {
    for (const from of ['menu bar', 'thumbnail']) {
      test(`Layout in the menu of the ${from} opens the layout tiles beside it (${platform})`, async (t) => {
        const page = await load(t, platform, { n: 2 });
        let row = await openLayouts(page, from);
        let chooser = await chooserOf(page);
        assert.ok(chooser, `Layout of the menu of the ${from} does not open the layout tiles`);
        assert.deepEqual([chooser.marked, chooser.focused], [['content'], 'content'], 'the layout of the slide is not marked and focused');
        assert.ok(chooser.left >= row.right - 4 || chooser.right <= row.left + 4, `the tiles are not beside the item: ${js(chooser)} ${js(row)}`);
        assert.ok(chooser.top <= row.bottom && chooser.bottom >= row.top, `the tiles are not at the height of the item: ${js(chooser)} ${js(row)}`);
        await press(page, 'ArrowRight');
        assert.equal((await chooserOf(page)).focused, 'narrow');
        await press(page, 'Escape');
        await frames(page);
        assert.equal(await chooserOf(page), null, 'Esc does not close the tiles');
        await byteExact(page);
        row = await openLayouts(page, from);
        await press(page, 'ArrowRight');
        await press(page, 'ArrowRight');
        await press(page, 'Enter');
        await sleep(300);
        await frames(page);
        assert.equal(await chooserOf(page), null, 'Enter does not close the tiles');
        assert.equal((await state(page, 'slide.layout.wide')).checked, true, 'Enter on the tile Content, Wide does not change the layout');
        await roundTrip(page);
      });
    }
  }

  const shellBoxes = (page) => page.evaluate(`(() => {
  const box = (sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width } : null;
  };
  return { nav: box('body > .beeson-edit-nav'), canvas: box('.beeson-edit-canvas'), inspector: box('body > .beeson-edit-inspector'), slide: box('.reveal:not(.beeson-peek) .slides > section.present'), format: box('.beeson-edit-header [data-command="shell.format"]') };
})()`);

  for (const platform of PLATFORMS) {
    test(`the canvas is at least half of a window of 1440, 1024, 900, and 760 px (${platform})`, async (t) => {
      const narrow = [];
      for (const width of [1440, 1024, 900, 760]) {
        const page = await load(t, platform, { n: 2, size: { width, height: 800 } });
        await sleep(200);
        await frames(page);
        const b = await shellBoxes(page);
        assert.ok(b.inspector, `the Format tab is not shown at ${width} px`);
        if (b.canvas.width < width / 2) {
          narrow.push(`the canvas is ${Math.round(b.canvas.width)} px wide in a window of ${width} px, beside a navigator of ${Math.round(b.nav?.width ?? 0)} px`);
          await page.close();
          continue;
        }
        assert.ok(b.inspector.left >= b.canvas.right - 1, `the inspector is drawn over the canvas at ${width} px`);
        if (width >= 1024) assert.ok(Math.abs(b.nav.width - 200) <= 1, `the navigator is changed at ${width} px`);
        if (width === 760) {
          assert.equal(b.nav, null, 'the navigator is shown beside the inspector at 760 px');
          assert.ok(b.format, 'the Format button is not in the toolbar at 760 px');
          await clickText(page, { x: (b.format.left + b.format.right) / 2, y: (b.format.top + b.format.bottom) / 2 });
          await sleep(150);
          await frames(page);
          const closed = await shellBoxes(page);
          assert.equal(closed.inspector, null, 'the Format button does not close the inspector');
          assert.ok(closed.nav && Math.abs(closed.nav.width - 140) <= 1, 'the navigator is not shown at its smallest width once the inspector is closed');
          await clickText(page, { x: (b.format.left + b.format.right) / 2, y: (b.format.top + b.format.bottom) / 2 });
          await sleep(150);
          await frames(page);
          assert.ok((await shellBoxes(page)).inspector, 'the Format button does not open the inspector');
        }
        assert.deepEqual(page.errors, []);
        await page.close();
      }
      assert.deepEqual(narrow, []);
    });
  }
});

describe('the key of each menu item runs it', () => {
  const DECK = 'test-deck.html';
  const FIGURES = 4;
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
  const settle = (page) => page.evaluate('new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), 150))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');

  async function load(t, platform, size = { width: 1600, height: 1000 }) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${FIGURES})`);
    await settle(page);
    return page;
  }

  async function checkEdit(page, name, before = page.source) {
    const edited = await render(page);
    assert.notEqual(edited, before);
    await undo(page);
    assert.equal(await render(page), before);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
  }

  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const findItem = `(l) => [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.firstChild?.textContent === l)`;
  const closeMenus = async (page) => { await page.evaluate('window.BeesonEditorShell?.closeMenus?.(); true'); await settle(page); };

  async function openBar(page, bar) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)})`));
    await settle(page);
  }

  async function choose(page, bar, label) {
    await openBar(page, bar);
    await clickText(page, await rect(page, `(${findItem})(${js(label)})`));
    await settle(page);
  }

  async function itemsIn(page, bar, labels) {
    await openBar(page, bar);
    const out = await page.evaluate(`Object.fromEntries(${js(labels)}.map((l) => { const i = (${findItem})(l); return [l, i ? { keys: i.querySelector('.keys')?.textContent ?? '', dimmed: i.getAttribute('aria-disabled') === 'true' } : null]; }))`);
    await closeMenus(page);
    return out;
  }

  const wordAt = (page, word) => page.evaluate(`(() => {
  const el = Reveal.getCurrentSlide().querySelector(':scope > p');
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = w.nextNode(); node; node = w.nextNode()) {
    const at = node.textContent.indexOf(${js(word)});
    if (at < 0) continue;
    const r = document.createRange(); r.setStart(node, at); r.setEnd(node, at + ${js(word)}.length);
    const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }
  return null;
})()`);

  const state = (page) => page.evaluate(`(() => {
  const a = document.activeElement;
  return {
    slides: document.querySelectorAll('.reveal .slides > section').length,
    children: Reveal.getCurrentSlide().children.length,
    selected: window.BeesonEditor.selection().map((el) => el.tagName.toLowerCase()),
    focus: a === document.body ? 'body' : a.tagName.toLowerCase() + (a.isContentEditable ? ' editable' : ''),
    words: getSelection().toString(),
  };
})()`);

  const below = (page) => page.evaluate(`(() => { const r = document.querySelector('.reveal .slides').getBoundingClientRect(); return { x: Math.round(r.left + 6), y: Math.round(r.bottom + 12) }; })()`);

  async function newFormula(page) {
    await choose(page, 'Insert', 'Formula');
    await type(page, 'x^2 + y^2');
    await settle(page);
    await clickText(page, await below(page));
    await settle(page);
  }

  const watchKeys = (page) => page.evaluate(`(() => { window.__keys = {}; addEventListener('keydown', (ev) => { window.__keys[ev.key.toLowerCase()] = ev.defaultPrevented; }, true); return true; })()`);
  const prevented = (page, key) => page.evaluate(`window.__keys[${js(key)}] ?? null`);

  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);

  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);

  const KEYS = {
    mac: { duplicate: '⌘D', deselect: '⇧⌘A', delete: '⌫', press: 'Backspace' },
    other: { duplicate: 'Ctrl+D', deselect: 'Ctrl+Shift+A', delete: 'Delete', press: 'Delete' },
  };

  for (const platform of PLATFORMS) {
    const K = KEYS[platform];

    test(`Mod+D and Mod+Shift+A run Duplicate and Deselect at a caret in a text, and the Edit menu lists them (${platform})`, async (t) => {
      const page = await load(t, platform);
      await watchKeys(page);
      const caret = async () => {
        await clickText(page, await wordAt(page, 'your'));
        await settle(page);
        assert.equal((await state(page)).focus, 'p editable');
      };
      await caret();
      await press(page, 'Escape');
      await press(page, 'Mod+D');
      await settle(page);
      const copied = await render(page);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll(':scope > p').length`), 2);
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      await caret();
      assert.deepEqual(await itemsIn(page, 'Edit', ['Duplicate', 'Deselect']), { Duplicate: { keys: K.duplicate, dimmed: false }, Deselect: { keys: K.deselect, dimmed: false } });
      await caret();
      await choose(page, 'Edit', 'Duplicate');
      assert.equal(await render(page), copied, 'Edit > Duplicate in a text does not duplicate the block of the caret');
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      await caret();
      await press(page, 'Mod+D');
      await settle(page);
      assert.equal(await prevented(page, 'd'), true, 'the browser does not get Mod+D');
      assert.equal((await state(page)).slides, 13, 'Mod+D in a text does not duplicate the slide');
      assert.equal(await render(page), copied, 'Mod+D in a text does not duplicate the block of the caret');
      assert.equal(await undoLabel(page), 'Undo Duplicate');
      await checkEdit(page, `r15-7-duplicate-${platform}.html`);
      await caret();
      await press(page, 'Mod+Shift+A');
      await settle(page);
      assert.deepEqual(await state(page), { slides: 13, children: 7, selected: [], focus: 'body', words: '' }, 'Mod+Shift+A leaves the text with nothing selected, as Edit > Deselect does');
      assert.equal(await prevented(page, 'a'), true);
      await caret();
      await choose(page, 'Edit', 'Deselect');
      assert.deepEqual(await state(page), { slides: 13, children: 7, selected: [], focus: 'body', words: '' });
      await caret();
      await press(page, 'Escape');
      await settle(page);
      assert.deepEqual((await state(page)).selected, ['p']);
      assert.equal(await render(page), copied);
      assert.deepEqual(page.errors, []);
    });

    test(`Edit > Delete lists the key that deletes the words selected in a text (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, await wordAt(page, 'matplotlib'), { count: 2 });
      await settle(page);
      assert.equal((await state(page)).words.trim(), 'matplotlib');
      assert.deepEqual(await itemsIn(page, 'Edit', ['Delete']), { Delete: { keys: K.delete, dimmed: false } });
      assert.deepEqual(await itemsIn(page, 'Slide', ['Delete Slide']), { 'Delete Slide': { keys: '', dimmed: false } });
      await click(page, await wordAt(page, 'matplotlib'), { count: 2 });
      await settle(page);
      await press(page, K.press);
      await settle(page);
      const s = await state(page);
      assert.equal(s.slides, 13);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelector(':scope > p').textContent.includes('matplotlib')`), false);
      await checkEdit(page, `r15-7-delete-${platform}.html`);
      assert.deepEqual(page.errors, []);
    });

    test(`Mod+D duplicates a framed formula after Insert > Formula, and the Edit menu lists its keys (${platform})`, async (t) => {
      const page = await load(t, platform);
      await watchKeys(page);
      await newFormula(page);
      const inserted = await render(page);
      assert.deepEqual(await state(page), { slides: 13, children: 7, selected: ['div'], focus: 'div editable', words: '' });
      assert.deepEqual(await itemsIn(page, 'Edit', ['Duplicate', 'Deselect', 'Delete']), {
        Duplicate: { keys: K.duplicate, dimmed: false },
        Deselect: { keys: K.deselect, dimmed: false },
        Delete: { keys: K.delete, dimmed: false },
      });
      await press(page, 'Mod+D');
      await settle(page);
      const s = await state(page);
      assert.equal(s.slides, 13, 'Mod+D does not duplicate the slide');
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll(':scope > div.math').length`), 2);
      assert.equal(await prevented(page, 'd'), true);
      await checkEdit(page, `r15-7-formula-${platform}.html`, inserted);
      assert.deepEqual(page.errors, []);
    });

    test(`Mod+Shift+A and the Delete key act on a framed formula after Insert > Formula (${platform})`, async (t) => {
      const page = await load(t, platform);
      await newFormula(page);
      const inserted = await render(page);
      await press(page, 'Mod+Shift+A');
      await settle(page);
      assert.deepEqual((await state(page)).selected, [], 'Mod+Shift+A deselects the formula');
      assert.equal(await render(page), inserted);
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      await newFormula(page);
      await press(page, K.press);
      await settle(page);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll(':scope > div.math').length`), 0, 'the key deletes the formula');
      assert.equal(await render(page), page.source);
      await undo(page);
      await settle(page);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll(':scope > div.math').length`), 1);
      assert.deepEqual(page.errors, []);
    });
  }

  const firstEditItem = async (page) => {
    await openBar(page, 'Edit');
    const label = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length)?.querySelector('.label')?.textContent`);
    await closeMenus(page);
    return label;
  };

  const openItems = (page, labels) => page.evaluate(`Object.fromEntries(${js(labels)}.map((l) => { const i = (${findItem})(l); return [l, i ? { keys: i.querySelector('.keys')?.textContent ?? '', dimmed: i.getAttribute('aria-disabled') === 'true' } : null]; }))`);
  const cell = (page) => rect(page, `Reveal.getCurrentSlide().querySelector('table').rows[1].cells[1]`);
  const size = (page) => page.evaluate(`(() => { const t = Reveal.getCurrentSlide().querySelector('table'); return [t.rows.length, t.rows[0].cells.length]; })()`);
  const ADD = ['Add Row Above', 'Add Row Below', 'Add Column Before', 'Add Column After'];

  for (const platform of PLATFORMS) {
    const K = KEYS[platform];

    test(`Delete Slide and Duplicate Slide list their keys only where the keys run them, and Edit > Delete and Edit > Duplicate list their keys in the navigator (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await below(page));
      await settle(page);
      assert.deepEqual(await itemsIn(page, 'Slide', ['Delete Slide', 'Duplicate Slide']), { 'Delete Slide': { keys: '', dimmed: false }, 'Duplicate Slide': { keys: K.duplicate, dimmed: false } });
      await clickText(page, '.reveal .slides > section.present img');
      await settle(page);
      assert.deepEqual(await itemsIn(page, 'Slide', ['Delete Slide', 'Duplicate Slide']), { 'Delete Slide': { keys: '', dimmed: false }, 'Duplicate Slide': { keys: '', dimmed: false } });
      const row = await rect(page, `document.querySelectorAll('.beeson-edit-nav .row')[${FIGURES}]`);
      await clickText(page, row);
      await settle(page);
      assert.deepEqual(await itemsIn(page, 'Slide', ['Delete Slide']), { 'Delete Slide': { keys: K.delete, dimmed: false } });
      assert.deepEqual(await itemsIn(page, 'Edit', ['Delete', 'Duplicate']), { Delete: { keys: K.delete, dimmed: false }, Duplicate: { keys: K.duplicate, dimmed: false } });
      await click(page, row, { button: 'right' });
      await settle(page);
      assert.deepEqual(await openItems(page, ['Delete Slide']), { 'Delete Slide': { keys: K.delete, dimmed: false } });
      await closeMenus(page);
      await clickText(page, row);
      await press(page, K.press);
      await settle(page);
      assert.equal((await state(page)).slides, 12);
      assert.equal(await undoLabel(page), 'Undo Delete Slide');
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`the cell menu lists the keys of its Add items with the caret in a cell and with the cell selected (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await settle(page);
      const inserted = await render(page);
      const arrows = platform === 'mac' ? ['⌥↑', '⌥↓', '⌥←', '⌥→'] : ['Alt+Up Arrow', 'Alt+Down Arrow', 'Alt+Left Arrow', 'Alt+Right Arrow'];
      const listed = Object.fromEntries(ADD.map((l, i) => [l, { keys: arrows[i], dimmed: false }]));
      for (const how of ['caret', 'cell']) {
        await clickText(page, await cell(page));
        await settle(page);
        if (how === 'cell') await press(page, 'Escape');
        await settle(page);
        const focus = (await state(page)).focus;
        assert.equal(focus, how === 'caret' ? 'td editable' : focus);
        await click(page, await cell(page), { button: 'right' });
        await settle(page);
        assert.deepEqual(await openItems(page, ADD), listed, `with the ${how}`);
        await closeMenus(page);
      }
      await clickText(page, await cell(page));
      await settle(page);
      await press(page, 'Alt+ArrowUp');
      await settle(page);
      assert.deepEqual(await size(page), platform === 'mac' ? [3, 3] : [4, 3]);
      if (platform !== 'mac') await undo(page);
      await settle(page);
      assert.equal(await render(page), inserted);
      await press(page, 'Escape');
      await press(page, 'Alt+ArrowUp');
      await settle(page);
      assert.deepEqual(await size(page), [4, 3]);
      await clickText(page, await cell(page));
      await settle(page);
      assert.deepEqual(await itemsIn(page, 'Edit', ['Duplicate']), { Duplicate: { keys: K.duplicate, dimmed: true } });
      assert.deepEqual(page.errors, []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`Edit > Delete of a slide in the navigator is the entry Delete Slide (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, await rect(page, `document.querySelectorAll('.beeson-edit-nav .row')[3]`));
      await settle(page);
      await choose(page, 'Edit', 'Delete');
      assert.equal((await state(page)).slides, 12);
      assert.equal(await undoLabel(page), 'Undo Delete Slide');
      assert.equal(await firstEditItem(page), 'Undo Delete Slide');
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      await page.evaluate(`Reveal.slide(${FIGURES})`);
      await settle(page);
      await clickText(page, '.reveal .slides > section.present img');
      await settle(page);
      await choose(page, 'Edit', 'Delete');
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('figure').length`), 0);
      assert.equal(await undoLabel(page), 'Undo Delete');
      await undo(page);
      await settle(page);
      assert.equal(await render(page), page.source);
      await clickText(page, await below(page));
      await settle(page);
      await choose(page, 'Edit', 'Duplicate');
      assert.equal((await state(page)).slides, 14);
      assert.equal(await undoLabel(page), 'Undo Duplicate Slide');
      await checkEdit(page, `r15-7-duplicate-slide-${platform}.html`);
      assert.deepEqual(page.errors, []);
    });

    test(`View > Navigator is checked only while the navigator is drawn (${platform})`, async (t) => {
      const page = await load(t, platform, { width: 800, height: 900 });
      const checks = async () => {
        await openBar(page, 'View');
        const out = await page.evaluate(`(() => { const c = (l) => (${findItem})(l)?.getAttribute('aria-checked'); return { navigator: c('Navigator'), slideOnly: c('Slide Only'), drawn: !!document.querySelector('.beeson-edit-nav')?.getClientRects().length }; })()`);
        await closeMenus(page);
        return out;
      };
      assert.deepEqual(await checks(), { navigator: 'false', slideOnly: 'true', drawn: false });
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await checks(), { navigator: 'true', slideOnly: 'false', drawn: true });
      assert.equal(await page.evaluate(`!!document.querySelector('.beeson-edit-inspector')?.getClientRects().length`), false, 'the navigator is shown in place of the inspector');
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await checks(), { navigator: 'false', slideOnly: 'true', drawn: false });
      await choose(page, 'View', 'Slide Only');
      assert.deepEqual(await checks(), { navigator: 'true', slideOnly: 'false', drawn: true });
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });
  }

  const card = (page, name) => page.evaluate(`(() => { const d = document.querySelector('dialog.beeson-edit-dialog.${name}'); return d && !d.hidden && d.open ? { text: d.textContent, code: d.querySelector('code')?.textContent ?? null, buttons: [...d.querySelectorAll('.row button')].map((b) => b.textContent) } : null; })()`);
  const cardButton = (page, name, label) => rect(page, `[...document.querySelectorAll('dialog.beeson-edit-dialog.${name} .row button')].find((b) => b.textContent === ${js(label)})`);

  async function exportPowerPoint(page) {
    await openBar(page, 'File');
    await clickText(page, await rect(page, `(${findItem})('Export To')`));
    await settle(page);
    const items = await page.evaluate(`(() => { const m = [...document.querySelectorAll('.beeson-edit-menu')].filter((m) => m.getClientRects().length).at(-1); return [...m.querySelectorAll('.item')].map((i) => i.querySelector('.label')?.textContent); })()`);
    assert.deepEqual(items, ['PDF…', 'Editable HTML…', 'PowerPoint…'], 'File > Export To does not list PowerPoint… after PDF… and Editable HTML…');
    await clickText(page, await rect(page, `(${findItem})('PowerPoint…')`));
    await settle(page);
    return items;
  }

  for (const platform of PLATFORMS) {
    test(`File > Export To > PowerPoint… shows the command that writes the file, and copies it (${platform})`, async (t) => {
      const page = await load(t, platform);
      await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
      assert.deepEqual(await exportPowerPoint(page), ['PDF…', 'Editable HTML…', 'PowerPoint…']);
      const shown = await card(page, 'pptx');
      assert.ok(shown, 'the card of PowerPoint… is not open');
      assert.equal(shown.code, 'npm run pptx -- test-deck.html');
      assert.match(shown.text, /saved test-deck\.html/);
      assert.deepEqual(shown.buttons, ['Copy Command', 'Close']);
      await page.evaluate(`navigator.clipboard.writeText('nothing').then(() => true)`);
      await clickText(page, await cardButton(page, 'pptx', 'Copy Command'));
      await settle(page);
      assert.equal(await page.evaluate('navigator.clipboard.readText()'), 'npm run pptx -- test-deck.html');
      assert.ok(await card(page, 'pptx'), 'Copy Command closes the card');
      await press(page, 'Escape');
      await settle(page);
      assert.equal(await card(page, 'pptx'), null, 'Esc does not close the card');
      await exportPowerPoint(page);
      await clickText(page, await cardButton(page, 'pptx', 'Close'));
      await settle(page);
      assert.equal(await card(page, 'pptx'), null);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`File > Export To > PowerPoint… with unsaved changes asks to save first, as Present does (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await wordAt(page, 'your'));
      await type(page, 'q');
      await settle(page);
      const edited = await render(page);
      assert.notEqual(edited, page.source);
      await exportPowerPoint(page);
      const ask = await card(page, 'ask');
      assert.ok(ask, 'the deck is not asked to be saved first');
      assert.match(ask.text, /PowerPoint/);
      assert.deepEqual(ask.buttons, ['Save and export', 'Export the saved file', 'Cancel']);
      assert.equal(await card(page, 'pptx'), null);
      await press(page, 'Escape');
      await settle(page);
      assert.equal(await card(page, 'ask'), null);
      assert.equal(await card(page, 'pptx'), null, 'Esc on the question shows the command');
      await exportPowerPoint(page);
      await clickText(page, await cardButton(page, 'ask', 'Export the saved file'));
      await settle(page);
      assert.equal((await card(page, 'pptx'))?.code, 'npm run pptx -- test-deck.html');
      await press(page, 'Escape');
      await settle(page);
      assert.equal(await render(page), edited, 'the edits are not kept');
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('no Duplicate key printed in a cell', () => {
  const PLATFORMS = ['mac', 'other'];
  const ROWS = 'test/pages/editor-r27-2.html';

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
  const count = (page) => page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`);

  async function load(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${ROWS}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(readFileSync(ROWS, 'utf8'))})`);
    assert.deepEqual(s.problems, []);
    await frames(page);
    return page;
  }

  async function keyIn(page, bar, label) {
    const i = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].findIndex((b) => b.textContent === ${js(bar)})`);
    await click(page, `.beeson-edit-menubar [role=menuitem]:nth-child(${i + 1})`);
    const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => ({ label: i.querySelector('.label')?.textContent, keys: i.querySelector('.keys')?.textContent ?? '' }))`);
    await page.evaluate('window.BeesonEditorShell.closeMenus(); true');
    return items.find((i) => i.label === label)?.keys;
  }

  for (const platform of PLATFORMS) {
    test(`with the caret in a cell, the Slide menu does not print the key of Duplicate, which is dimmed there (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, 'section.present td');
      await frames(page);
      await click(page, 'section.present td');
      await frames(page);
      assert.equal(await page.evaluate(`document.activeElement?.closest('td, th') !== null`), true, 'the caret is not in a cell');
      const slides = await count(page);
      await press(page, 'Mod+d');
      await frames(page);
      assert.equal(await count(page), slides, 'the key of Duplicate duplicates the slide from a cell, hence this test is out of date');
      await click(page, 'section.present td');
      await frames(page);
      assert.equal(await keyIn(page, 'Slide', 'Duplicate Slide'), '', 'the Slide menu prints a key beside Duplicate Slide that does not run it');
      assert.deepEqual(page.errors, []);
    });
  }
});
