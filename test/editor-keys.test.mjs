import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { byteExact, click, clickText, editorPage, press, saveAndReopen, type } from './helpers/editor.mjs';
import { serve } from '../scripts/webdriver.mjs';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const HEADING = ['<h2>Text, a list, and a backdrop</h2>', '<h2>Text, a list, and a backdrop now</h2>'];

const keysPage = async (browser, platform) => {
  const page = await editorPage(browser, { deck: LAYOUTS, query: `edit&still&edit-platform=${platform}` });
  await page.evaluate(`(() => { window.__keys = []; window.addEventListener('keydown', (e) => window.__keys.push([e.key, e.defaultPrevented]), true); })()`);
  return page;
};

const slide = (page) => page.evaluate('Reveal.getIndices().h');
const prevented = (page) => page.evaluate('window.__keys.splice(0).map(([key, p]) => key + (p ? ":prevented" : ""))');
const blur = (page) => page.evaluate('document.activeElement.blur()');

async function raw(page, key, code, keyCode, modifiers = 0) {
  const text = key.length === 1 && !(modifiers & 6) ? key : undefined;
  await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers, ...(text ? { text, unmodifiedText: text } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
}

const TAKEN = {
  mac: {
    '⌘1': 'the tabs of Chrome', '⌘2': 'the tabs of Chrome', '⌘3': 'the tabs of Chrome', '⌘4': 'the tabs of Chrome', '⌘5': 'the tabs of Chrome', '⌘6': 'the tabs of Chrome', '⌘7': 'the tabs of Chrome', '⌘8': 'the tabs of Chrome', '⌘9': 'the tabs of Chrome',
    '⇧⌘P': 'a private window of Firefox',
    '⌥⌘I': 'the developer tools',
    '⌘{': 'the previous tab',
    '⇧⌘[': 'the previous tab',
    '⌃Space': 'the input source of macOS',
  },
  other: {
    'Ctrl+1': 'the tabs of Chrome', 'Ctrl+2': 'the tabs of Chrome', 'Ctrl+3': 'the tabs of Chrome', 'Ctrl+4': 'the tabs of Chrome', 'Ctrl+5': 'the tabs of Chrome', 'Ctrl+6': 'the tabs of Chrome', 'Ctrl+7': 'the tabs of Chrome', 'Ctrl+8': 'the tabs of Chrome', 'Ctrl+9': 'the tabs of Chrome',
    F5: 'the reload of the page',
    'Ctrl+Shift+=': 'the zoom of the browser',
  },
};

for (const platform of PLATFORMS) {
  test(`no command lists a key that the browser or the system takes before the page, on ${platform}`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await keysPage(browser, platform);
    await page.evaluate(`window.BeesonEditor.exec('help.keys')`);
    const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-keys .row')].map((r) => [r.children[0].textContent, r.children[1].textContent.split(', ')])`);
    assert.ok(rows.length > 50, `the sheet lists ${rows.length} rows`);
    const taken = rows.flatMap(([label, keys]) => keys.filter((k) => TAKEN[platform][k]).map((k) => `${label}: ${k}, taken for ${TAKEN[platform][k]}`));
    assert.deepEqual(taken, []);
    assert.deepEqual(page.errors, []);
  });
}

for (const platform of PLATFORMS) {
  const redo = platform === 'mac' ? 'Mod+Shift+Z' : 'Mod+Y';
  const other = platform === 'mac' ? 'Mod+Y' : 'Mod+Shift+Z';
  const fallback = platform === 'mac' ? 'Ctrl+Z' : 'Meta+Z';

  test(`undo and redo are named after the typing and run by every key of ${platform}`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await keysPage(browser, platform);
    await page.evaluate('Reveal.slide(2)');
    await clickText(page, '.reveal section.present > h2');
    await press(page, 'End');
    await type(page, ' now');
    await byteExact(page, [HEADING]);
    assert.equal((await page.evaluate(`window.BeesonEditor.state('edit.undo')`)).label, 'Undo Typing');
    assert.equal((await page.evaluate(`window.BeesonEditor.state('edit.redo')`)).label, 'Redo');
    await press(page, 'Mod+Z');
    await page.waitFor('!window.BeesonEditor.status().undo');
    await byteExact(page);
    assert.deepEqual(await page.evaluate(`window.BeesonEditor.state('edit.redo')`), { id: 'edit.redo', label: 'Redo Typing', enabled: true, checked: null });
    await press(page, redo);
    await page.waitFor('!window.BeesonEditor.status().redo');
    await byteExact(page, [HEADING]);
    await press(page, fallback);
    await page.waitFor('!window.BeesonEditor.status().undo');
    await byteExact(page);
    await press(page, other);
    await page.waitFor('!window.BeesonEditor.status().redo');
    await byteExact(page, [HEADING]);
    assert.deepEqual(await prevented(page), ['End', 'z:prevented', redo.endsWith('Z') ? 'Z:prevented' : 'y:prevented', 'z:prevented', other.endsWith('Z') ? 'Z:prevented' : 'y:prevented']);
    assert.deepEqual(page.errors, []);
  });

  test(`in a text, Backspace and the clipboard keys are left to the browser, and Select All is a command, on ${platform}`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await keysPage(browser, platform);
    await page.evaluate('Reveal.slide(2)');
    await clickText(page, '.reveal section.present > h2');
    await press(page, 'End');
    for (const key of ['Backspace', 'Mod+A', 'Mod+C', 'Mod+X', 'Mod+V', 'D', 'G', 'PageDown', 'Home']) await press(page, key);
    assert.deepEqual(await prevented(page), ['End', 'Backspace', 'a:prevented', 'c', 'x', 'v', 'd', 'g', 'PageDown', 'Home']);
    assert.equal(await slide(page), 2);
    assert.equal(await page.evaluate('window.BeesonEditor.status().undo'), true);
    assert.deepEqual(page.errors, []);
  });

  test(`the keys of reveal.js do nothing on ${platform}, and the slides are changed by the commands`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await keysPage(browser, platform);
    await blur(page);
    for (const key of ['B', 'O', 'Escape', 'Space', 'N', 'P', 'F', 'V']) await press(page, key);
    await raw(page, ':', 'Semicolon', 58, 8);
    await raw(page, ';', 'Semicolon', 59);
    await raw(page, '.', 'Period', 190);
    assert.deepEqual(await page.evaluate('({ h: Reveal.getIndices().h, paused: Reveal.isPaused(), overview: Reveal.isOverview(), keyboard: Reveal.getConfig().keyboard })'), { h: 0, paused: false, overview: false, keyboard: false });
    assert.deepEqual(await prevented(page), ['b', 'o', 'Escape', ' ', 'n', 'p', 'f', 'v', ':', ';', '.']);
    await press(page, 'PageDown');
    assert.equal(await slide(page), 1);
    await press(page, 'ArrowRight');
    await press(page, 'ArrowDown');
    assert.equal(await slide(page), 3);
    await press(page, 'PageUp');
    await press(page, 'ArrowLeft');
    assert.equal(await slide(page), 1);
    await press(page, 'End');
    assert.equal(await slide(page), 16);
    await press(page, 'PageDown');
    assert.equal(await slide(page), 16);
    await press(page, 'Home');
    assert.equal(await slide(page), 0);
    await press(page, 'ArrowUp');
    assert.equal(await slide(page), 0);
    await page.evaluate('Reveal.slide(2)');
    await clickText(page, '.reveal section.present > h2');
    await press(page, 'Escape');
    await press(page, 'ArrowRight');
    assert.equal(await slide(page), 2);
    assert.equal(await page.evaluate(`document.querySelector('.reveal section.present > h2').style.translate`), '1px');
    assert.deepEqual(page.errors, []);
  });

  test(`G opens the field of the slide number on ${platform}, and D flips only the slide`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await keysPage(browser, platform);
    await blur(page);
    await press(page, 'G');
    assert.equal(await page.evaluate(`document.activeElement.matches('.beeson-edit-goto input')`), true);
    await type(page, '5');
    await press(page, 'Enter');
    assert.equal(await slide(page), 4);
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-goto').hidden`), true);
    const row = `document.querySelectorAll('.beeson-edit-nav .row')[4]`;
    await page.evaluate(`${row}.focus()`);
    await press(page, 'G');
    assert.equal(await page.evaluate(`document.activeElement.matches('.beeson-edit-goto input')`), true);
    await press(page, 'Escape');
    assert.equal(await page.evaluate(`document.activeElement === ${row}`), true);
    await page.evaluate(`document.querySelector('.beeson-edit-bottom button').focus()`);
    await press(page, 'G');
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-goto').hidden`), true);
    await blur(page);
    if (platform === 'mac') {
      await press(page, 'Ctrl+Mod+G');
      assert.equal(await page.evaluate(`document.activeElement.matches('.beeson-edit-goto input')`), true);
      await type(page, '99');
      await press(page, 'Enter');
      assert.equal(await slide(page), 16);
    }
    const mode = () => page.evaluate(`({ theme: Beeson.theme.get(), checked: window.BeesonEditor.state('view.slideDark').checked })`);
    const before = await mode();
    assert.equal(before.checked, before.theme === 'dark');
    await press(page, 'D');
    const after = await mode();
    assert.notEqual(after.theme, before.theme);
    assert.equal(after.checked, after.theme === 'dark');
    await press(page, 'D');
    assert.deepEqual(await mode(), before);
    assert.deepEqual(page.errors, []);
  });

  test(`F6 moves the focus through the regions of the window on ${platform}`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await keysPage(browser, platform);
    await page.evaluate(`(() => { for (const id of ['view.notes', 'view.steps']) if (!window.BeesonEditor.state(id).checked) window.BeesonEditor.exec(id); if (!window.BeesonEditor.state('view.navigator').checked) window.BeesonEditor.exec('view.navigator'); })()`);
    await blur(page);
    const where = () => page.evaluate(`(() => {
      const a = document.activeElement;
      if (a === document.body) return 'canvas';
      if (a.closest('aside.notes')) return 'notes';
      for (const [name, sel] of [['menubar', '.beeson-edit-menubar'], ['toolbar', '.beeson-edit-top'], ['navigator', '.beeson-edit-nav'], ['inspector', '.beeson-edit-inspector'], ['status', '.beeson-edit-bottom']]) if (a.closest(sel)) return name;
      return a.tagName;
    })()`);
    const seen = [];
    for (let i = 0; i < 7; i++) {
      await press(page, 'F6');
      seen.push(await where());
    }
    assert.deepEqual(seen, ['notes', 'inspector', 'status', 'menubar', 'toolbar', 'navigator', 'canvas']);
    const back = [];
    for (let i = 0; i < 7; i++) {
      await press(page, 'Shift+F6');
      back.push(await where());
    }
    assert.deepEqual(back, ['navigator', 'toolbar', 'menubar', 'status', 'inspector', 'notes', 'canvas']);
    await clickText(page, '.reveal section.present h1');
    await press(page, 'F6');
    assert.equal(await where(), 'notes');
    assert.deepEqual(page.errors, []);
  });

  test(`? opens the sheet of every command with a key on ${platform}`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await keysPage(browser, platform);
    await blur(page);
    await raw(page, '?', 'Slash', 191, 8);
    const sheet = await page.evaluate(`(() => {
      const d = document.querySelector('dialog.beeson-edit-keys');
      return { open: d.open, focused: d.contains(document.activeElement), bars: [...d.querySelectorAll('h3')].map((h) => h.textContent), rows: Object.fromEntries([...d.querySelectorAll('.row')].map((r) => [r.firstChild.textContent, r.lastChild.textContent])) };
    })()`);
    assert.equal(sheet.open, true);
    assert.equal(sheet.focused, true);
    assert.deepEqual(sheet.bars.slice(0, 2), ['File', 'Edit']);
    const mac = platform === 'mac';
    const expected = {
      'Open…': mac ? '⌘O' : 'Ctrl+O',
      Save: mac ? '⌘S' : 'Ctrl+S',
      'Save As…': mac ? '⇧⌘S' : 'Ctrl+Shift+S',
      Present: mac ? '⌘↩' : 'Ctrl+Enter',
      'Present from Start': mac ? '⇧⌘↩' : 'Ctrl+Shift+Enter',
      Undo: mac ? '⌘Z' : 'Ctrl+Z',
      Redo: mac ? '⇧⌘Z, ⌘Y' : 'Ctrl+Y, Ctrl+Shift+Z',
      'Slide in Dark Mode': 'D',
      'Next Slide': mac ? '⇟, →, ↓' : 'Page Down, Right Arrow, Down Arrow',
      'Previous Slide': mac ? '⇞, ←, ↑' : 'Page Up, Left Arrow, Up Arrow',
      'First Slide': mac ? '↖' : 'Home',
      'Last Slide': mac ? '↘' : 'End',
      'Go to Slide…': mac ? 'G, ⌃⌘G' : 'G',
      'Next Pane': 'F6',
      'Previous Pane': mac ? '⇧F6' : 'Shift+F6',
      'Keyboard Shortcuts': '?',
    };
    for (const [label, keys] of Object.entries(expected)) assert.equal(sheet.rows[label], keys, label);
    if (!mac) for (const keys of Object.values(sheet.rows)) assert.doesNotMatch(keys, /Ctrl\+Alt/);
    await press(page, 'D');
    await press(page, 'PageDown');
    assert.equal(await slide(page), 0);
    await press(page, 'Escape');
    assert.equal(await page.evaluate(`document.querySelector('dialog.beeson-edit-keys').open`), false);
    await page.waitFor('document.activeElement === document.body', 2000);
    assert.deepEqual(page.errors, []);
  });

  test(`Save, Save As, Open, and Present are run by their keys on ${platform}`, async (t) => {
    const browser = await launch();
    t.after(() => browser.close());
    const page = await keysPage(browser, platform);
    await page.evaluate(`(() => {
      window.__written = [];
      window.BeesonEditor.attach({ name: 'deck.html', createWritable: async () => ({ write: async (text) => window.__written.push(text), close: async () => {} }) });
      window.showSaveFilePicker = async () => { window.__picker = 'save'; throw new DOMException('cancelled', 'AbortError'); };
      window.showOpenFilePicker = async () => { window.__picker = 'open'; throw new DOMException('cancelled', 'AbortError'); };
    })()`);
    await page.evaluate('Reveal.slide(2)');
    await clickText(page, '.reveal section.present > h2');
    await press(page, 'End');
    await type(page, ' now');
    await press(page, 'Mod+S');
    await page.waitFor('window.__written.length === 1 && !window.BeesonEditor.status().dirty');
    assert.ok((await page.evaluate('window.__written[0]')).includes(HEADING[1]));
    await press(page, 'Mod+Shift+S');
    await page.waitFor(`window.__picker === 'save'`);
    await blur(page);
    await press(page, 'Mod+O');
    await page.waitFor(`window.__picker === 'open'`);
    const SHOW = `document.querySelector('.beeson-edit-show iframe')`;
    await page.evaluate(`window.addEventListener('message', (e) => { try { if (JSON.parse(e.data).eventName === 'ready') window.__ready = true; } catch {} })`);
    const present = async (key, end) => {
      await page.evaluate('window.__ready = false');
      await press(page, key);
      await page.waitFor(`!!${SHOW}?.getAttribute('src')`);
      assert.ok((await page.evaluate(`${SHOW}.src`)).endsWith(end));
      await page.waitFor('window.__ready', 30000);
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-edit-show')`);
    };
    await present('Mod+Enter', `?still&edit-platform=${platform}&from-editor#/2`);
    await present('Mod+Shift+Enter', `?still&edit-platform=${platform}&from-editor`);
    assert.equal(await slide(page), 0);
    assert.deepEqual(page.errors, []);
  });
}

test('press() of Enter runs the default action of the key on a focused button and summary', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.evaluate(`(() => {
    window.__pressed = 0;
    const button = document.body.appendChild(document.createElement('button'));
    button.addEventListener('click', () => window.__pressed++);
    document.body.appendChild(document.createElement('details')).appendChild(document.createElement('summary'));
    button.focus();
  })()`);
  await press(page, 'Enter');
  await page.waitFor('window.__pressed === 1');
  await page.evaluate(`document.querySelector('summary').focus()`);
  await press(page, 'Enter');
  await page.waitFor(`document.querySelector('details').open`);
  await page.evaluate(`document.querySelector('button').focus()`);
  await press(page, 'Mod+Enter');
  await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
  assert.equal(await page.evaluate('window.__pressed'), 1);
});

describe('Mod+D for Duplicate and Duplicate Slide', () => {
  const DECK = 'test-deck.html';
  const FIGURES = 4;
  const PLATFORMS = ['mac', 'other'];
  const DUPLICATE = { mac: '⌘D', other: 'Ctrl+D' };

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
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const slides = (page) => page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`);
  const figures = (page) => page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('figure').length`);

  async function load(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`)).problems, []);
    await page.evaluate(`Reveal.slide(${FIGURES})`);
    await settle(page);
    return page;
  }

  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const findItem = `(l) => [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.firstChild?.textContent === l)`;
  const closeMenus = async (page) => { await page.evaluate('window.BeesonEditorShell?.closeMenus?.(); true'); await settle(page); };

  async function openBar(page, bar) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)})`));
    await settle(page);
  }

  async function itemIn(page, bar, label) {
    await openBar(page, bar);
    const out = await page.evaluate(`(() => { const i = (${findItem})(${js(label)}); return i ? { keys: i.querySelector('.keys')?.textContent ?? '', dimmed: i.getAttribute('aria-disabled') === 'true' } : null; })()`);
    await closeMenus(page);
    return out;
  }

  const below = (page) => page.evaluate(`(() => { const r = document.querySelector('.reveal .slides').getBoundingClientRect(); return { x: Math.round(r.left + 6), y: Math.round(r.bottom + 12) }; })()`);

  for (const platform of PLATFORMS) {
    const live = { keys: '', dimmed: false };
    const keyed = { keys: DUPLICATE[platform], dimmed: false };

    test(`with a figure selected, Duplicate Slide is listed without a key, and Mod+D duplicates the figure (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, '.reveal .slides > section.present img');
      await settle(page);
      assert.deepEqual(await itemIn(page, 'Slide', 'Duplicate Slide'), live);
      assert.deepEqual(await itemIn(page, 'Edit', 'Duplicate'), keyed);
      await press(page, 'Mod+D');
      await settle(page);
      assert.equal(await figures(page), 2);
      assert.equal(await slides(page), 13);
      assert.equal(await undoLabel(page), 'Undo Duplicate');
      await undo(page);
      assert.equal(await render(page), page.source);
      await click(page, '.reveal .slides > section.present img');
      await settle(page);
      await openBar(page, 'Slide');
      await click(page, await rect(page, `(${findItem})('Duplicate Slide')`));
      await settle(page);
      assert.equal(await slides(page), 14);
      assert.equal(await undoLabel(page), 'Undo Duplicate Slide');
      await undo(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`in the navigator, Mod+D duplicates the slide as Edit > Duplicate, and Duplicate Slide is listed with the key (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, await rect(page, `document.querySelectorAll('.beeson-edit-nav .row')[${FIGURES}]`));
      await settle(page);
      assert.deepEqual(await itemIn(page, 'Slide', 'Duplicate Slide'), keyed);
      assert.deepEqual(await itemIn(page, 'Edit', 'Duplicate'), keyed);
      await click(page, await rect(page, `document.querySelectorAll('.beeson-edit-nav .row')[${FIGURES}]`));
      await settle(page);
      await press(page, 'Mod+D');
      await settle(page);
      assert.equal(await slides(page), 14);
      assert.equal(await undoLabel(page), 'Undo Duplicate Slide');
      await undo(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`with nothing selected on the canvas, Mod+D duplicates the slide, and Duplicate Slide is listed with the key (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, await below(page));
      await settle(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 0);
      assert.deepEqual(await itemIn(page, 'Slide', 'Duplicate Slide'), keyed);
      assert.deepEqual(await itemIn(page, 'Edit', 'Duplicate'), keyed);
      await click(page, await below(page));
      await settle(page);
      await press(page, 'Mod+D');
      await settle(page);
      assert.equal(await slides(page), 14);
      assert.equal(await undoLabel(page), 'Undo Duplicate Slide');
      await undo(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`the sheet of shortcuts lists Mod+D at Duplicate, and not at Duplicate Slide (${platform})`, async (t) => {
      const page = await load(t, platform);
      await page.evaluate(`window.BeesonEditor.exec('help.keys')`);
      await settle(page);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-keys .row')].map((r) => ({ label: r.firstElementChild.textContent, keys: r.querySelector('kbd').textContent.split(', ') }))`);
      const keysOf = (label) => rows.find((r) => r.label === label)?.keys ?? [];
      assert.deepEqual(keysOf('Duplicate Slide'), []);
      assert.ok(keysOf('Duplicate').includes(DUPLICATE[platform]), js(keysOf('Duplicate')));
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('command keys that act in a text', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test-deck.html';
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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const wait = (page, ms = 150) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undoLabel = (page) => state(page, 'edit.undo').then((s) => s.label);
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const slides = (page) => page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`);

  async function load(t, platform, size = { width: 1600, height: 1000 }) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${FIGURES})`);
    await wait(page);
    return page;
  }

  async function resize(page, width, height) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await wait(page, 300);
  }

  const watchKeys = (page) => page.evaluate(`(() => { window.__keys = {}; addEventListener('keydown', (ev) => { window.__keys[ev.key.toLowerCase()] = ev.defaultPrevented; }, true); return true; })()`);
  const prevented = (page, key) => page.evaluate(`window.__keys[${js(key)}] ?? null`);

  async function caret(page) {
    const at = await page.evaluate(`(() => {
    const el = Reveal.getCurrentSlide().querySelector(':scope > p');
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = w.nextNode(); node; node = w.nextNode()) {
      const i = node.textContent.indexOf('matplotlib');
      if (i < 0) continue;
      const r = document.createRange(); r.setStart(node, i + 4); r.setEnd(node, i + 5);
      const b = r.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2 };
    }
    return null;
  })()`);
    await clickText(page, at);
    await wait(page);
    assert.equal(await page.evaluate(`document.activeElement.matches('p') && document.activeElement.isContentEditable`), true, 'the click does not put the caret into the paragraph');
  }

  const KEYS = {
    mac: { hide: 'Mod+Shift+H', zoom: 'Mod+Shift+0' },
    other: { hide: 'Ctrl+Shift+H', zoom: null },
  };

  for (const platform of PLATFORMS) {
    const K = KEYS[platform];

    test(`the keys of New Slide, Hide Slide, and Zoom to Selection act with the caret in a paragraph (${platform})`, async (t) => {
      const page = await load(t, platform);
      await watchKeys(page);
      if (K.zoom) {
        await caret(page);
        assert.equal((await state(page, 'zoom.fit')).checked, true);
        await press(page, K.zoom);
        await wait(page, 300);
        assert.equal((await state(page, 'zoom.fit')).checked, false, `${K.zoom} in a text does not zoom to the block`);
        assert.equal(await prevented(page, '0'), true);
        await exec(page, 'zoom.fit');
        await wait(page);
      }
      const n = await slides(page);
      await caret(page);
      await press(page, 'Ctrl+M');
      await wait(page, 300);
      assert.equal(await slides(page), n + 1, 'Ctrl+M in a text does not make a new slide');
      assert.equal(await undoLabel(page), 'Undo New Slide');
      assert.equal(await prevented(page, 'm'), true);
      await undo(page);
      await wait(page);
      assert.equal(await render(page), page.source);
      await page.evaluate(`Reveal.slide(${FIGURES})`);
      await wait(page);
      await caret(page);
      await press(page, K.hide);
      await wait(page);
      assert.equal(await undoLabel(page), 'Undo Hide Slide', `${K.hide} in a text does not hide the slide`);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal .slides > section')[${FIGURES}].getAttribute('data-visibility')`), 'hidden');
      const hidden = await render(page);
      await undo(page);
      await wait(page);
      assert.equal(await render(page), page.source);
      await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
      assert.equal(await render(page), hidden);
      await undo(page);
      await page.evaluate(`Reveal.slide(${FIGURES})`);
      await wait(page);
      await caret(page);
      await press(page, 'Shift+2');
      await press(page, 'd');
      await press(page, 'Shift+0');
      await wait(page);
      assert.equal((await state(page, 'zoom.fit')).checked, true, 'Shift+2 or Shift+0 in a text zooms');
      assert.ok((await render(page)).includes('matp2d0lotlib'), 'Shift+2, D, and Shift+0 are not typed into the text');
      assert.equal(await undoLabel(page), 'Undo Typing');
      const { text } = await saveAndReopen(page, `r17-8-keys-${platform}.html`);
      assert.equal(text, await render(page));
      assert.deepEqual(page.errors, []);
    });

    test(`Move Slide Up and Move Slide Down are dimmed with the caret in a paragraph or in a cell (${platform})`, async (t) => {
      const page = await load(t, platform);
      const moves = async () => ({ up: (await state(page, 'slide.moveUp')).enabled, down: (await state(page, 'slide.moveDown')).enabled });
      assert.deepEqual(await moves(), { up: false, down: false }, 'the two are not dimmed on the canvas');
      await caret(page);
      assert.deepEqual(await moves(), { up: false, down: false }, 'the two are live with the caret in a paragraph');
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await wait(page);
      await clickText(page, await rect(page, `Reveal.getCurrentSlide().querySelector('table').rows[1].cells[1]`));
      await wait(page);
      assert.equal(await page.evaluate(`!!document.activeElement.closest('td, th')`), true, 'the click does not put the caret into a cell');
      assert.deepEqual(await moves(), { up: false, down: false }, 'the two are live with the caret in a cell');
      await press(page, 'Alt+ArrowUp');
      await wait(page);
      assert.equal(await page.evaluate('Reveal.getIndices().h'), FIGURES, 'Alt+ArrowUp in a cell moves the slide');
      await click(page, `.beeson-edit-nav .row:nth-child(${FIGURES + 1})`);
      await wait(page);
      assert.deepEqual(await moves(), { up: true, down: true }, 'the two are dimmed in the navigator');
      assert.deepEqual(page.errors, []);
    });

    test(`Mod+D with the caret in a cell of a table is kept from the browser and changes nothing (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'insert.table', { rows: 3, columns: 3 });
      await wait(page);
      const inserted = await render(page);
      await watchKeys(page);
      await clickText(page, await rect(page, `Reveal.getCurrentSlide().querySelector('table').rows[1].cells[1]`));
      await wait(page);
      assert.equal((await state(page, 'edit.duplicate')).enabled, false);
      await press(page, 'Mod+D');
      await wait(page);
      assert.equal(await prevented(page, 'd'), true, 'Mod+D in a cell reaches the browser');
      assert.equal(await render(page), inserted);
      assert.equal(await undoLabel(page), 'Undo Insert Table');
      assert.deepEqual(page.errors, []);
    });

    test(`Mod+B and Mod+I on a framed formula change nothing (${platform})`, async (t) => {
      const page = await load(t, platform);
      await watchKeys(page);
      const check = async (before, label, what) => {
        for (const key of ['Mod+B', 'Mod+I']) {
          await press(page, key);
          await wait(page);
          assert.equal(await render(page), before, `${key} on ${what} changes the file`);
          assert.equal(await undoLabel(page), label, `${key} on ${what} is an entry of the history`);
          assert.equal(await page.evaluate(`!!Reveal.getCurrentSlide().querySelector('div.math :is(strong, em, b, i)')`), false, `${key} on ${what} sets the display in bold or italic`);
        }
      };
      const math = await rect(page, `Reveal.getCurrentSlide().querySelector('div.math mjx-container')`);
      if (math) {
        await clickText(page, math);
        await press(page, 'Escape');
        await wait(page);
        assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.className)'), ['math']);
        await check(page.source, 'Undo', 'the display of the slide');
      }
      await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === 'Insert')`));
      await wait(page);
      await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.firstChild?.textContent === 'Formula')`));
      await wait(page);
      await type(page, 'x^2 + y^2');
      await wait(page);
      const below = await page.evaluate(`(() => { const r = document.querySelector('.reveal .slides').getBoundingClientRect(); return { x: Math.round(r.left + 6), y: Math.round(r.bottom + 12) }; })()`);
      await clickText(page, below);
      await wait(page);
      assert.equal(await page.evaluate(`document.activeElement.matches('div.math')`), true, 'the new formula does not have the focus');
      await check(await render(page), await undoLabel(page), 'a new formula');
      assert.deepEqual(page.errors, []);
    });
  }

  const findItem = `(l) => [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.firstChild?.textContent === l)`;
  async function openBar(page, bar) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)})`));
    await wait(page);
  }
  async function choose(page, bar, label) {
    await openBar(page, bar);
    await clickText(page, await rect(page, `(${findItem})(${js(label)})`));
    await wait(page);
  }
  const view = async (page) => {
    await openBar(page, 'View');
    const out = await page.evaluate(`(() => {
    const c = (l) => (${findItem})(l)?.getAttribute('aria-checked');
    const drawn = (s) => !!document.querySelector(s)?.getClientRects().length;
    return { navigator: c('Navigator'), format: c('Format'), nav: drawn('.beeson-edit-nav'), inspector: drawn('.beeson-edit-inspector') };
  })()`);
    await page.evaluate('window.BeesonEditorShell?.closeMenus?.(); true');
    await wait(page);
    return out;
  };

  for (const platform of PLATFORMS) {
    test(`the inspector closed for the navigator in a narrow window is given back once the window has room for it (${platform})`, async (t) => {
      const BOTH = { navigator: 'true', format: 'true', nav: true, inspector: true };
      const page = await load(t, platform, { width: 760, height: 900 });
      assert.deepEqual(await view(page), { navigator: 'false', format: 'true', nav: false, inspector: true });
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await view(page), { navigator: 'true', format: 'false', nav: true, inspector: false }, 'View > Navigator does not show the navigator in place of the inspector');
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await view(page), { navigator: 'false', format: 'true', nav: false, inspector: true }, 'the inspector is not given back with the navigator hidden');
      await resize(page, 1600, 900);
      assert.deepEqual(await view(page), { navigator: 'false', format: 'true', nav: false, inspector: true });
      await resize(page, 760, 900);
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await view(page), { navigator: 'true', format: 'false', nav: true, inspector: false });
      await resize(page, 1600, 900);
      assert.deepEqual(await view(page), BOTH, 'the inspector is not given back at 1600 px');
      await choose(page, 'View', 'Format');
      await resize(page, 760, 900);
      await resize(page, 1600, 900);
      assert.deepEqual(await view(page), { navigator: 'true', format: 'false', nav: true, inspector: false }, 'Format closed by the user is opened again');
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`View > Navigator after the window was narrowed with the navigator off shows it in one choice (${platform})`, async (t) => {
      const page = await load(t, platform);
      assert.equal((await view(page)).nav, true);
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await view(page), { navigator: 'false', format: 'true', nav: false, inspector: true });
      await resize(page, 760, 900);
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await view(page), { navigator: 'true', format: 'false', nav: true, inspector: false }, 'one choice of View > Navigator does not show the navigator');
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('keys after an undo frames a block', () => {
  const PLATFORMS = ['mac', 'other'];
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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const wait = (page, ms = 150) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undoLabel = (page) => state(page, 'edit.undo').then((s) => s.label);
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  async function load(t, platform, n, deck = 'test-deck.html', size = { width: 1600, height: 1000 }) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    await reopen(page, n);
    return page;
  }

  async function reopen(page, n) {
    await page.evaluate('document.activeElement?.blur?.(); getSelection().removeAllRanges(); true');
    await wait(page);
    await page.evaluate(`(async () => { while (window.BeesonEditor.state('edit.undo').enabled) await window.BeesonEditor.undo(); return true; })()`);
    assert.equal(await render(page), page.source, 'the history does not undo to the file');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await wait(page);
    await page.evaluate(`Promise.resolve(window.BeesonEditor.exec('selection.clear')).then(() => true)`);
  }

  const findItem = `(l) => [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.firstChild?.textContent === l)`;
  const closeMenus = async (page) => { await page.evaluate('window.BeesonEditorShell?.closeMenus?.(); true'); await wait(page); };

  async function openBar(page, bar) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)})`));
    await wait(page);
  }

  async function choose(page, bar, label) {
    await openBar(page, bar);
    await clickText(page, await rect(page, `(${findItem})(${js(label)})`));
    await wait(page);
  }

  const word = (page) => page.evaluate(`(() => {
  const el = Reveal.getCurrentSlide().querySelector(':scope > p');
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = w.nextNode(); node; node = w.nextNode()) {
    const at = node.textContent.indexOf('matplotlib');
    if (at < 0) continue;
    const r = document.createRange(); r.setStart(node, at + 4); r.setEnd(node, at + 5);
    const b = r.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2 };
  }
  return null;
})()`);

  const outcome = async (page) => ({
    text: await render(page),
    undo: await undoLabel(page),
    ...(await page.evaluate(`(() => {
    const p = Reveal.getCurrentSlide().querySelector(':scope > p'), s = getSelection(), a = document.activeElement;
    return {
      children: Reveal.getCurrentSlide().children.length,
      selected: window.BeesonEditor.selection().map((el) => el.tagName.toLowerCase()),
      focus: a === document.body ? 'body' : a.tagName.toLowerCase() + (a.isContentEditable ? ' editable' : ''),
      caret: !!(p && s.rangeCount && p.contains(s.anchorNode) && a.contains(s.anchorNode)),
    };
  })()`)),
  });

  const caret = async (page) => {
    await clickText(page, await word(page));
    await wait(page);
    assert.equal(await page.evaluate(`document.activeElement.matches('p') && document.activeElement.isContentEditable`), true, 'the click does not put the caret into the paragraph');
  };

  const ROUTES = {
    'Mod+Z': (page) => press(page, 'Mod+Z'),
    'the toolbar': (page) => click(page, '.beeson-edit-top [data-command="edit.undo"]'),
    'Edit > Undo': async (page) => {
      await openBar(page, 'Edit');
      assert.equal(await page.evaluate(`(${findItem})('Undo Move') ? true : false`), true, 'the Edit menu does not list Undo Move');
      await clickText(page, await rect(page, `(${findItem})('Undo Move')`));
    },
  };
  const KEYS = ['Backspace', 'ArrowLeft', 'Mod+D', 'Mod+X', 'q'];

  for (const platform of PLATFORMS) {
    test(`after an undo that frames a paragraph with the caret left in it, every key acts on the text as at a caret (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      for (const key of KEYS) {
        await reopen(page, FIGURES);
        await caret(page);
        await press(page, key);
        await wait(page);
        const expected = await outcome(page);
        for (const [route, undo] of Object.entries(ROUTES)) {
          await reopen(page, FIGURES);
          await clickText(page, await word(page));
          await press(page, 'Escape');
          await press(page, 'ArrowRight');
          await wait(page);
          assert.equal(await undoLabel(page), 'Undo Move');
          await caret(page);
          await undo(page);
          await wait(page);
          const undone = await outcome(page);
          assert.equal(undone.text, page.source, `the undo by ${route} does not restore the file`);
          assert.equal(await state(page, 'edit.undo').then((s) => s.enabled), false, `the undo by ${route} is not of the Move`);
          assert.equal(undone.caret, true, `the undo by ${route} takes the caret out of the paragraph`);
          await press(page, key);
          await wait(page);
          assert.deepEqual(await outcome(page), expected, `${key} after the undo by ${route} does not act as at a caret`);
        }
      }
      const { text } = await saveAndReopen(page, `r16-3-keys-${platform}.html`);
      assert.equal(text, await render(page));
      assert.deepEqual(page.errors, []);
    });
  }

  const view = async (page) => {
    await openBar(page, 'View');
    const out = await page.evaluate(`(() => {
    const c = (l) => (${findItem})(l)?.getAttribute('aria-checked');
    const drawn = (s) => !!document.querySelector(s)?.getClientRects().length;
    return { navigator: c('Navigator'), slideOnly: c('Slide Only'), nav: drawn('.beeson-edit-nav'), inspector: drawn('.beeson-edit-inspector') };
  })()`);
    await closeMenus(page);
    return out;
  };

  for (const platform of PLATFORMS) {
    test(`View > Navigator in a narrow window with the navigator off and the inspector open shows the navigator in one choice (${platform})`, async (t) => {
      const OFF = { navigator: 'false', slideOnly: 'true', nav: false, inspector: true };
      const ON = { navigator: 'true', slideOnly: 'false', nav: true, inspector: false };
      for (const item of ['Slide Only', 'Navigator']) {
        const page = await load(t, platform, 1, 'test-deck.html', { width: 800, height: 900 });
        await choose(page, 'View', 'Navigator');
        await choose(page, 'View', 'Navigator');
        assert.deepEqual(await view(page), OFF, 'the navigator is not off with the inspector open');
        await choose(page, 'View', item);
        assert.deepEqual(await view(page), ON, `one choice of ${item} does not show the navigator in place of the inspector`);
        assert.equal(await render(page), page.source);
        assert.deepEqual(page.errors, []);
        await page.close();
      }
    });
  }
});
