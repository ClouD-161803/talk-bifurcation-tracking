// the spaces of a word that is cut, formatted, or pasted with the space after it, set as smart cut
// and paste of PowerPoint, from the key and from Paste of the menus

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

// regression tests of R18.6 on both platforms with trusted keys: a format set on a word selected
// with the space after it, as a double-click selects a word on Windows, leaves the space out, and a
// cut of a word between a space and a space or a punctuation mark takes the space before it out, as
// Chrome does only on macOS, apart from a text of code. the selections are set with a Range, since a
// double-click on a Mac does not select the space and Chrome on a Mac takes the space off a cut of a
// double-clicked word by itself. each edit is undone to the file byte for byte and redone
describe('a word formatted or cut with its space', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r18-6.html';
  const MOD = { mac: 4, other: 2 };

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
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  let saves = 0;

  async function load(t, platform) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    page.platform = platform;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate('Reveal.slide(0)');
    await frames(page);
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    return page;
  }

  // the characters from of the text node that holds needle in the block of selector, up to to, are
  // selected in the focused text, as a double-click or a drag selects them
  const select = (page, selector, needle, from, to) => page.evaluate(`(() => {
  const el = document.querySelector('.reveal section.present ' + ${js(selector)});
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i < 0) continue;
    el.closest('[contenteditable="true"]').focus();
    getSelection().setBaseAndExtent(n, i + ${from}, n, i + ${to});
    return getSelection().toString();
  }
  return null;
})()`);

  // the edit checked against page.source after an undo, again after a redo, and after a save and an
  // open
  async function roundTrip(page, edited) {
    assert.equal(await render(page), edited);
    await undo(page);
    assert.equal(await render(page), page.source, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not give the edit back');
    const { text } = await saveAndReopen(page, `r18-6-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
  }

  // a key with the modifier of the platform and with the editing command of a real keyboard, which
  // press() does not send
  async function chord(page, key, command) {
    const base = { key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), modifiers: MOD[page.platform], commands: [command] };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await frames(page);
  }

  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const MENU_ITEM = (label) => `[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.textContent === ${js(label)})`;

  // Cut of the Edit menu of the menu bar, clicked
  async function menuCut(page) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === 'Edit')`));
    await frames(page);
    await click(page, await rect(page, MENU_ITEM('Cut')));
    await page.waitFor(`window.BeesonEditor.render() !== ${js(page.source)}`).catch(() => {});
    await frames(page);
    await page.evaluate('window.BeesonEditorShell?.closeMenus?.(); true');
    await frames(page);
  }

  const CUTS = { 'Mod+X': (page) => chord(page, 'x', 'cut'), 'Cut of the Edit menu': menuCut };

  const FORMATS = {
    Italic: [() => 'Mod+I', 'em'],
    Bold: [() => 'Mod+B', 'strong'],
    Strikethrough: [(platform) => (platform === 'mac' ? 'Mod+Shift+X' : 'Alt+Shift+5'), 's'],
  };

  for (const platform of PLATFORMS) {
    // item 2 of the laptop report: Windows wrote <em>styles </em>of
    for (const [name, [keys, tag]] of Object.entries(FORMATS)) {
      test(`${name} on a word selected with the space after it leaves the space out of the format (${platform})`, async (t) => {
        const page = await load(t, platform);
        assert.equal(await select(page, 'p', 'styles of', 0, 7), 'styles ');
        await press(page, keys(platform));
        await frames(page);
        const edited = page.source.replace('the styles of', `the <${tag}>styles</${tag}> of`);
        const text = await render(page);
        assert.equal(text, edited, `${name} formats the space: ${js(text.match(/Export[^\n]*/)?.[0])}`);
        assert.equal(await undoLabel(page), `Undo ${name}`);
        await roundTrip(page, edited);
      });
    }

    // item 3 of the laptop report: a cut on Windows and Linux left "of the . It will"
    for (const [name, cut] of Object.entries(CUTS)) {
      test(`${name} of a word before a full stop takes the space before it out (${platform})`, async (t) => {
        const page = await load(t, platform);
        assert.equal(await select(page, 'p', 'template.', 0, 8), 'template');
        await cut(page);
        const edited = page.source.replace('of the template. It', 'of the. It');
        const text = await render(page);
        assert.equal(text, edited, `${name} leaves the space: ${js(text.match(/Export[^\n]*/)?.[0])}`);
        assert.equal(await undoLabel(page), 'Undo Cut');
        await roundTrip(page, edited);
      });

      test(`${name} of a word between two spaces takes one space out (${platform})`, async (t) => {
        const page = await load(t, platform);
        assert.equal(await select(page, 'p', 'styles of', 0, 6), 'styles');
        await cut(page);
        await roundTrip(page, page.source.replace('the styles of', 'the of'));
      });

      // a space of code is a part of the code
      for (const [where, selector, before] of [['inline code', 'p code', 'f(a, b)'], ['a code box', 'pre code', 'g(a, b)']]) {
        test(`${name} of a word in ${where} keeps the space before it (${platform})`, async (t) => {
          const page = await load(t, platform);
          assert.equal(await select(page, selector, before, 5, 6), 'b');
          await cut(page);
          const edited = page.source.replace(before, before.replace('b', ''));
          const text = await render(page);
          assert.equal(text, edited, `${name} takes a space of the code out: ${js(text.match(/[fg]\(a,[^<]*/g))}`);
          await roundTrip(page, edited);
        });
      }
    }
  }
});

// regression tests of R24.1 on both platforms: a word copied with the space after it, as a double
// click takes it on Windows, pasted with the spaces of PowerPoint, and Undo by the key in a number
// field of the inspector while a typed value is not entered. after each paste the text is checked
// byte for byte after an undo, the paste again after a redo, and after a save and an open
describe('a word pasted with the spaces of PowerPoint', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test-deck.html';
  const LISTS = 'test/pages/editor-r13-3.html';

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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
  let saves = 0;

  // the editor on slide n of a deck, served over HTTP, with the storage of the origin emptied
  async function load(t, platform, deck, n) {
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
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the shown element of selector whose text holds needle, as an expression
  const textElementOf = (selector, needle) => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  // the caret put at the mark | of at, e.g. 'steps.| Direct', into the block of selector, by a click
  // into the block and a collapse of the selection there
  async function caretAt(page, selector, at) {
    const needle = at.replace('|', '');
    const k = at.indexOf('|');
    const point = await page.evaluate(`(() => { const r = ${textElementOf(selector, needle)}.getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; })()`);
    await click(page, point);
    await frames(page);
    await page.evaluate(`(() => {
    const el = ${textElementOf(selector, needle)};
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = n.data.indexOf(${js(needle)});
      if (i < 0) continue;
      el.closest('[contenteditable="true"]')?.focus();
      getSelection().collapse(n, i + ${k});
      return;
    }
    throw new Error('the text ${needle} is not in the block');
  })()`);
  }

  // a paste of text at the caret as the browser sends it into a text, i.e. the event beforeinput with
  // the clipboard text on its DataTransfer. the system clipboard is not used, since other tests share it
  async function paste(page, text) {
    await page.evaluate(`(() => {
    const data = new DataTransfer();
    data.setData('text/plain', ${js(text)});
    const n = getSelection().anchorNode;
    const target = n instanceof Element ? n : n.parentElement;
    const ev = new InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer: data, bubbles: true, cancelable: true, composed: true });
    if (target.dispatchEvent(ev)) throw new Error('the editor left the paste to the browser');
  })()`);
    await frames(page);
  }

  // the paste checked against page.source after an undo, again after a redo, and after a save and an
  // open. it returns the line of the edited text that holds probe. a paste into code is an entry
  // Typing, as on the base
  async function roundTrip(page, probe) {
    const edited = await render(page);
    const line = edited.split('\n').find((l) => l.includes(probe)) ?? '';
    assert.equal((await state(page, 'edit.undo')).label, probe === 'attention' ? 'Undo Paste' : 'Undo Typing', 'the paste is not one entry');
    await undo(page);
    assert.equal(await render(page), page.source, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the paste again');
    const { text } = await saveAndReopen(page, `r24-1-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return line;
  }

  const P = '.reveal section.present > p';
  const CODE = '.reveal section.present pre code';

  // each case gives the slide, the block, the caret, the clipboard text, and the saved text of the
  // block after the paste. on Windows a double click takes "break " with the space after it, and a
  // cut puts this text on the clipboard
  const CASES = [
    // the space after the word is dropped before a space, and a space is put after a full stop
    ['a word behind a full stop and before a space', 2, P, 'steps.| Direct', 'break ', 'then break it up into steps. break Direct'],
    // the space after the word is dropped at the end of the text
    ['a word at the end of the text', 2, P, 'attention.|', 'break ', 'the viewer\'s attention. break</p>'],
    // the space after the word is dropped before a closing mark, and a space is put after a letter
    ['a word behind a letter and before a full stop', 2, P, 'steps|.', 'break ', 'into steps break. Direct'],
    // the space after the word is kept before a letter, and a space is not put at the start
    ['a word at the start of the text', 2, P, '|Design the', 'break ', '<p>break Design the complete'],
    // a text without a space at its end, and a text of several words, are pasted as on the base
    ['a word without a space after it', 2, P, 'steps.| Direct', 'break', 'into steps.break Direct'],
    ['several words with a space after them', 2, P, 'steps.| Direct', 'break it ', 'into steps.break it  Direct'],
    // a part of a word pasted into a word does not gain a space
    ['a part of a word pasted into a word', 2, P, 'Des|ign the', 'ak ', '<p>Desak ign the'],
    ['a part of a word without a space pasted into a word', 2, P, 'Des|ign the', 'ak', '<p>Desakign the'],
    // a paste into code is kept as it is
    ['a word pasted into code', 5, CODE, 'def| halo', 'break ', 'defbreak  halo_family'],
  ];

  for (const platform of PLATFORMS) {
    for (const [name, n, selector, at, clip, expected] of CASES) {
      test(`a paste of ${js(clip)} as ${name} gives ${js(expected)} (${platform})`, async (t) => {
        const page = await load(t, platform, DECK, n);
        await caretAt(page, selector, at);
        await paste(page, clip);
        const line = await roundTrip(page, selector === CODE ? 'halo_family' : 'attention');
        assert.ok(line.includes(expected), `the paste saved ${js(line.trim())}`);
      });
    }
  }

  // the tab name of the inspector shown, with the Format pane open
  async function showTab(page, name) {
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === ${js(name)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (at) await click(page, at);
    await frames(page);
  }

  // a trusted key with the command modifier of the platform, carrying the edit command name that the
  // key gives on Windows and Linux. the browser runs name unless the page prevents the key
  async function command(page, platform, key, name) {
    const base = { key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), modifiers: platform === 'mac' ? 4 : 2 };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [name] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  const START = '.beeson-edit-inspector input[name="Start at"]';
  const ITEM = '.reveal section.present ol > li';

  for (const platform of PLATFORMS) {
    test(`one Undo by the key in Start at with 2.5 typed and not entered puts the shown 1 back, selected, without an entry of the history (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      await click(page, await page.evaluate(`(() => { const r = ${textElementOf(ITEM, 'Bravo')}.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`));
      await frames(page);
      await showTab(page, 'Text');
      const field = `document.querySelector(${js(START)})`;
      assert.equal(await page.evaluate(`${field}?.value`), '1', 'the Text pane does not have a field Start at that shows 1');
      await click(page, START, { count: 3 });
      const label = (await state(page, 'edit.undo')).label;
      for (const key of '2.5') await type(page, key);
      assert.equal(await page.evaluate(`${field}.value`), '2.5');
      await command(page, platform, 'z', 'undo');
      await frames(page);
      const now = await page.evaluate(`(() => { const f = ${field}; return { value: f.value, focused: document.activeElement === f, all: f.selectionStart === 0 && f.selectionEnd === f.value.length }; })()`);
      assert.deepEqual(now, { value: '1', focused: true, all: true }, 'one Undo does not put the shown value back, selected');
      assert.equal(await render(page), page.source, 'the Undo changes the file');
      assert.equal((await state(page, 'edit.undo')).label, label, 'the Undo changes the history');
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R25.1 on both platforms: a selection of a backdrop and a build of its pane
// read no file of the list of backdrops, Paste of the Edit menu and of the text menu sets the
// spaces of one word as the paste of the key does, and the top row fits a narrow window with a
// wide interface font
describe('Paste of the menus sets the spaces', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const BACKDROP = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => m[0].includes('A figure slide with a backdrop'));
  const PANEL = '#beeson-edit-panel-format';
  // the files of the list of backdrops, which are not next to a page under test/pages/
  const FILES = /brand\/transfer\.js|demo\/broucke-sample\.js/;

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
  const wait = (page, ms) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => d(true)), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  let saves = 0;

  // the editor on slide n of a deck, served over HTTP, with the storage of the origin emptied
  async function load(t, platform, deck, n, size = { width: 1600, height: 1000 }) {
    const page = await browser.newPage(size);
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
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the URLs of the files of the list of backdrops that the page requested
  const requested = (page) => page.evaluate(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => ${FILES}.test(n))`);

  // the names of the entries of the Drawing popup of the Format pane, opened by a click
  async function drawingItems(page) {
    await click(page, `${PANEL} [aria-label="Drawing"]`);
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu.select')`);
    return page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu.select .item')].map((i) => i.querySelector('.label')?.textContent ?? i.textContent)`);
  }

  for (const platform of PLATFORMS) {
    // the files are read only when the Drawing popup or the list of Media > Backdrop… is opened,
    // hence a deck without brand/ and demo/ does not log a 404 at a selection of its backdrop
    test(`a selection of a backdrop and a build of its pane do not request a file of the list of backdrops (${platform})`, async (t) => {
      const page = await load(t, platform, LAYOUTS, BACKDROP);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await exec(page, 'backdrop.select');
      await wait(page, 600);
      assert.equal(await page.evaluate(`!!document.querySelector('${PANEL} [aria-label="Drawing"]')`), true, 'the Backdrop pane is not built');
      // the pane is built again for the backdrop of the title slide
      await page.evaluate(`Reveal.slide(0)`);
      await frames(page);
      await exec(page, 'backdrop.select');
      await wait(page, 600);
      assert.deepEqual(await requested(page), []);
      assert.deepEqual(errors(page), []);
    });

    test(`the Drawing popup opened before the list of Media > Backdrop… lists an entry whose file is not found at its place (${platform})`, async (t) => {
      const page = await load(t, platform, LAYOUTS, BACKDROP);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await exec(page, 'backdrop.select');
      await frames(page);
      const items = await drawingItems(page);
      assert.deepEqual(items, ['Beeson Logo', 'Cislunar Manifolds', 'Earth Manifolds', 'Broucke Families', 'mark'], 'the popup leaves out an entry whose file is not found');
      assert.ok((await requested(page)).length > 0, 'the popup does not read the files');
      assert.deepEqual(errors(page).filter((e) => !FILES.test(e)), []);
    });
  }

  // the caret put at the mark | of at, e.g. 'steps.| Direct', into the paragraph of the current slide
  async function caretAt(page, at) {
    const needle = at.replace('|', '');
    await page.evaluate(`(() => {
    const el = [...document.querySelectorAll('.reveal section.present > p')].find((p) => p.textContent.includes(${js(needle)}));
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = n.data.indexOf(${js(needle)});
      if (i < 0) continue;
      el.closest('[contenteditable="true"]')?.focus();
      getSelection().collapse(n, i + ${at.indexOf('|')});
      return;
    }
    throw new Error('the text ${needle} is not in the paragraph');
  })()`);
  }

  // the point near the left end of the paragraph of the current slide that holds the text of at
  const pointOf = (page, at) => page.evaluate(`(() => { const r = [...document.querySelectorAll('.reveal section.present > p')].find((p) => p.textContent.includes(${js(at.replace('|', ''))})).getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; })()`);

  // the caret put into the paragraph by a click, then collapsed at the mark
  async function enterText(page, at) {
    await click(page, await pointOf(page, at));
    await frames(page);
    await caretAt(page, at);
  }

  // readText of the page gives text, so that the system clipboard, which other tests share, is not
  // read by the editor
  const stubClipboard = (page, text) => page.evaluate(`Object.defineProperty(navigator.clipboard, 'readText', { configurable: true, value: async () => ${js(text)} })`);

  // an entry of the open menu chosen by a click
  async function clickItem(page, item) {
    const at = await page.evaluate(`(() => { const e = [...document.querySelectorAll('[role=menu] [role^=menuitem]')].find((x) => x.getClientRects().length && (x.querySelector('.label')?.textContent ?? x.textContent).trim() === ${js(item)}); const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, at);
    await wait(page, 300);
  }

  const menuOpen = `[...document.querySelectorAll('[role=menu] [role^=menuitem]')].some((x) => x.getClientRects().length)`;

  // an entry of the Edit menu of the menu bar chosen by clicks
  async function barMenu(page, item) {
    await click(page, '.beeson-edit-menubar [role=menuitem]:nth-child(2)');
    await page.waitFor(menuOpen);
    await clickItem(page, item);
  }

  // an entry of the menu of the text, opened by a right-click into the paragraph. a right-click
  // selects a word on a Mac, hence the caret is put at the mark again while the menu is open
  async function textMenu(page, at, item) {
    await click(page, await pointOf(page, at), { button: 'right' });
    await page.waitFor(menuOpen);
    await caretAt(page, at);
    await clickItem(page, item);
  }

  // the paste checked against page.source after an undo, again after a redo, and after a save and an
  // open. it returns the line of the edited text that holds probe
  async function roundTrip(page, probe) {
    const edited = await render(page);
    const line = edited.split('\n').find((l) => l.includes(probe)) ?? '';
    assert.notEqual(edited, page.source, 'the paste does not change the file');
    await undo(page);
    assert.equal(await render(page), page.source, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the paste again');
    const { text } = await saveAndReopen(page, `r25-1-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return line;
  }

  // each case gives the route, the entry, the caret, the clipboard text, and the saved text, which
  // are those of the paste by the key in test/editor-smart-cut-paste.test.mjs
  const CASES = [
    ['Paste of the Edit menu', 'bar', 'Paste', 'steps.| Direct', 'break ', 'then break it up into steps. break Direct'],
    ['Paste of the Edit menu', 'bar', 'Paste', 'attention.|', 'break ', 'the viewer\'s attention. break</p>'],
    ['Paste of the Edit menu', 'bar', 'Paste', 'steps|.', 'break ', 'into steps break. Direct'],
    ['Paste of the Edit menu', 'bar', 'Paste', 'steps.| Direct', 'break it ', 'into steps.break it  Direct'],
    ['Paste of the Edit menu', 'bar', 'Paste', 'Des|ign the', 'ak ', '<p>Desak ign the'],
    ['Paste of the text menu', 'text', 'Paste', 'steps.| Direct', 'break ', 'then break it up into steps. break Direct'],
    ['Paste and Match Style of the text menu', 'text', 'Paste and Match Style', 'steps.| Direct', 'break ', 'then break it up into steps. break Direct'],
  ];

  for (const platform of PLATFORMS) {
    for (const [name, route, item, at, clip, expected] of CASES) {
      test(`${name} of ${js(clip)} at ${js(at)} gives ${js(expected)} as the key does (${platform})`, async (t) => {
        const page = await load(t, platform, DECK, 2);
        await stubClipboard(page, clip);
        await enterText(page, at);
        if (route === 'bar') await barMenu(page, item);
        else await textMenu(page, at, item);
        const line = await roundTrip(page, 'attention');
        assert.ok(line.includes(expected), `the paste saved ${js(line.trim())}`);
      });
    }
  }

  // Verdana is about as wide as DejaVu Sans, the interface font of WSL, in which the Autosave button
  // was at 480 to 584 px in a window of 560 px
  const WIDE = 'Verdana, "DejaVu Sans", sans-serif';
  // the menus and the buttons of the top row that are cut off, the right end of the elements of the
  // row, and the scroll widths of the body and of the row
  const topRow = (page) => page.evaluate(`(() => {
  const W = innerWidth;
  const row = document.querySelector('.beeson-edit-titlebar');
  const cut = [];
  for (const b of row.querySelectorAll('.beeson-edit-menubar [role=menuitem], .right button')) {
    const r = b.getBoundingClientRect();
    if (!r.width) continue;
    const hit = document.elementFromPoint(Math.min(r.right - 2, W - 1), r.top + r.height / 2);
    if (r.left < -0.5 || r.right > W + 0.5 || b.scrollWidth > b.clientWidth + 0.5 || !b.contains(hit)) cut.push((b.textContent || b.className) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
  }
  const right = Math.max(...[row, ...row.querySelectorAll('*')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().right));
  return { cut, right, body: document.body.scrollWidth, row: row.scrollWidth, width: W };
})()`);

  for (const platform of PLATFORMS) {
    for (const font of [null, WIDE]) {
      test(`the top row fits every window from 480 px on with ${font ? 'a wide' : 'the default'} interface font (${platform})`, async (t) => {
        const page = await load(t, platform, DECK, 1, { width: 560, height: 700 });
        if (font) await page.evaluate(`document.documentElement.style.setProperty('--ed-font', ${js(font)})`);
        await wait(page, 300);
        for (const width of [480, 500, 520, 560, 600, 700, 800, 900, 1000, 1280]) {
          await page.send('Emulation.setDeviceMetricsOverride', { width, height: 700, deviceScaleFactor: 1, mobile: false });
          await wait(page, 300);
          const m = await topRow(page);
          assert.deepEqual(m.cut, [], `a menu or a button of the top row is cut off at ${width} px`);
          assert.ok(m.row <= m.width && m.right <= m.width + 0.5, `the top row is ${m.row} px wide and ends at ${m.right} px in a window of ${m.width} px`);
          // the status bar is wider than a window below 520 px, which this test does not cover
          if (width >= 560) assert.ok(m.body <= m.width, `the body is ${m.body} px wide in a window of ${m.width} px`);
        }
        assert.deepEqual(errors(page), []);
      });
    }
  }
});

// regression tests of R26.5 on both platforms, for texts, lists, and slides: the sheet of a formula
// closed by a click away drops an empty new box, a word pasted with its space next to a line break
// or a formula, an item emptied in the editor drawn without its mark, a data-id kept by a copy of
// a slide, the marks of centered and nested lists, and the gap after the number of an item
describe('a word pasted by a break or formula', () => {
  const PLATFORMS = ['mac', 'other'];
  const SLIDE = '.reveal .slides > section.present';
  const DECK = 'test/pages/editor-r26-5.html';

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
  const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}, ${js(arg ?? null)} ?? undefined)).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const status = (page) => page.evaluate('window.BeesonEditor.status()');

  // the editor on slide n of a deck, served over HTTP, with the storage of the origin emptied, and
  // opened with source, by default the file itself
  async function load(t, platform, deck, n, source = readFileSync(deck, 'utf8'), query = 'edit&still') {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?${query}&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = source;
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(source)})`)).problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await sleep(150);
    return page;
  }

  // the key of an inline formula: Cmd+Option+E on a Mac, and Alt+= elsewhere, sent as the browser
  // sends it
  async function formulaKey(page, platform) {
    if (platform === 'mac') return press(page, 'Mod+Alt+E');
    const base = { key: '=', code: 'Equal', windowsVirtualKeyCode: 187, modifiers: 1 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '=', unmodifiedText: '=' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  // a trusted click on an empty point of the canvas, near the lower right corner of the slide
  async function clickAway(page) {
    const at = await page.evaluate(`(() => { const r = document.querySelector(${js(SLIDE)}).getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 30 }; })()`);
    await clickText(page, at);
    await sleep(300);
  }

  // 1. finding audit-fixes 2. the sheet of an inline formula opened in a new empty text box, or in
  // the empty words of a shape, and closed by a click away without an insert, acts as a click away
  // without the sheet. the words of the shape are dropped, and the file and the history are left as
  // they were. the text box is kept, written as an empty paragraph in the entry of its insert
  const ROUTES = [
    ['a new text box', 'test/pages/editor-r23-1.html', 2, async (page) => {
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(300);
      assert.equal(await page.evaluate(`!!document.querySelector(${js(`${SLIDE} .beeson-pending`)})`), true, 'the box is not drawn');
    }, `${SLIDE} .beeson-pending`, true],
    ['the empty words of a shape', 'test/pages/editor-r23-2.html', 3, async (page) => {
      await clickText(page, `${SLIDE} > .shape`);
      await frames(page);
      await press(page, 'Enter');
      await frames(page);
      assert.equal(await page.evaluate(`!!document.activeElement?.matches(${js(`${SLIDE} > .shape > p`)})`), true, 'the caret is not in the words of the shape');
    }, `${SLIDE} > .shape > p[data-generated]`, false],
  ];

  for (const platform of PLATFORMS) {
    for (const [name, deck, n, open, left, kept] of ROUTES) {
      test(`1: the sheet of a formula in ${name} closed by a click away ${kept ? 'keeps it empty' : 'drops it, and the file and the history are kept'} (${platform})`, async (t) => {
        const page = await load(t, platform, deck, n);
        const label = (await state(page, 'edit.undo')).label;
        await open(page);
        await formulaKey(page, platform);
        await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
        await type(page, 'x^2');
        await sleep(300);
        await clickAway(page);
        assert.equal(await page.evaluate(`!!document.querySelector('.beeson-math')`), false, 'the sheet is still open');
        for (const k of [1, 2]) {
          assert.equal(await page.evaluate(`document.querySelector(${js(left)})?.outerHTML ?? null`), null, `the box is left after click away ${k}`);
          if (kept) {
            assert.equal((await render(page)).match(/<p( [^>]*)?><\/p>/g)?.length, 1, 'the empty box is not written as an empty paragraph');
            assert.equal((await state(page, 'edit.undo')).label, 'Undo Insert Text Box');
          } else {
            assert.equal(await render(page), page.source, 'the file is changed');
            assert.equal((await state(page, 'edit.undo')).label, label, 'the history has an entry');
            assert.equal((await status(page)).dirty, false, 'the editor reports unsaved changes');
          }
          await clickAway(page);
        }
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the shown element of selector whose text holds needle, as an expression
  const textElementOf = (selector, needle) => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  // the caret put at the mark | of at, e.g. 'where |', into the block of selector, by a click into the
  // block and a collapse of the selection in the first text node that holds the text around the mark
  async function caretAt(page, selector, at) {
    const needle = at.replace('|', '');
    const k = at.indexOf('|');
    const point = await page.evaluate(`(() => { const r = ${textElementOf(selector, needle)}.getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; })()`);
    await clickText(page, point);
    await frames(page);
    await page.evaluate(`(() => {
    const el = ${textElementOf(selector, needle)};
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = n.data.indexOf(${js(needle)});
      if (i < 0) continue;
      el.closest('[contenteditable="true"]')?.focus();
      getSelection().collapse(n, i + ${k});
      return;
    }
    throw new Error(${js(`the text ${needle} is not in the block`)});
  })()`);
  }

  // a paste of text at the caret as the browser sends it into a text, i.e. the event beforeinput with
  // the clipboard text on its DataTransfer. the system clipboard is not used, since other tests share it
  async function paste(page, text) {
    await page.evaluate(`(() => {
    const data = new DataTransfer();
    data.setData('text/plain', ${js(text)});
    const n = getSelection().anchorNode;
    const target = n instanceof Element ? n : n.parentElement;
    const ev = new InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer: data, bubbles: true, cancelable: true, composed: true });
    if (target.dispatchEvent(ev)) throw new Error('the editor left the paste to the browser');
  })()`);
    await frames(page);
  }

  // the lines of text that differ from those of the file, for a short message of a failed assertion
  const changed = (text, file) => {
    const was = file.split('\n');
    return text.split('\n').filter((l, i) => l !== was[i]).join('\n');
  };

  // the edit of entries entries of the history checked against page.source after as many undos,
  // again after as many redos, and after a save and an open
  let saves = 0;
  async function roundTrip(page, entries = 1) {
    const edited = await render(page);
    for (let i = 0; i < entries; i++) await undo(page);
    const back = await render(page);
    assert.ok(back === page.source, `the undo does not give the file back byte for byte: ${changed(back, page.source)}`);
    for (let i = 0; i < entries; i++) await redo(page);
    assert.ok((await render(page)) === edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r26-5-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  // 2. finding review-fixes 2. a word copied with the space after it, as a double click takes it on
  // Windows, is pasted next to a formula as next to a word, and a space is not put at the start of a
  // line after a line break. each case gives the slide of index.html, the block, the caret, and the
  // saved text around the paste
  const P = '.reveal section.present > p';
  const LI = '.reveal section.present li';
  const SPACES = [
    ['before an inline formula', 3, P, 'where |', 'where break \\(\\tilde U\\) is the effective'],
    ['after an inline formula', 3, P, '| and ', 'couple \\(x\\) break and \\(y\\).'],
    ['after an inline formula and before a space', 3, P, '| is the', '\\(\\tilde U\\) break is the effective'],
    ['at the start of a line after a line break', 9, LI, '|It\'s really', 'Then paste it in.<br>break It\'s really that simple.'],
    ['at the start of a line after two line breaks', 3, P, '|For instance', 'equations.<br><br>break For instance'],
  ];

  for (const platform of PLATFORMS) {
    for (const [name, n, selector, at, expected] of SPACES) {
      test(`2: a paste of "break " ${name} gives ${js(expected)} (${platform})`, async (t) => {
        const page = await load(t, platform, 'test-deck.html', n);
        await caretAt(page, selector, at);
        await paste(page, 'break ');
        const edited = await roundTrip(page);
        const was = page.source.split('\n');
        assert.ok(edited.includes(expected), `the paste saved ${js(edited.split('\n').find((l, i) => l !== was[i])?.trim())}`);
      });
    }
  }

  // the deck text written to a file of the root, served as a show at slide n, or as the print view
  async function show(t, text, n, query = '') {
    const file = `test/pages/editor-r26-5-${process.pid}-${++saves}.html`;
    writeFileSync(file, text);
    t.after(() => rmSync(file, { force: true }));
    const page = await browser.newPage({ width: 1600, height: 900 });
    t.after(() => page.close().catch(() => {}));
    if (query === '?print-pdf') {
      await printView(page, `${server.origin}/${file}${query}`);
      return page;
    }
    await page.goto(`${server.origin}/${file}${query}#/${n}`);
    await page.waitFor(deckSettled);
    await sleep(200);
    return page;
  }

  // the text, the mark, and the height of each item and paragraph under root
  const marks = (root) => `[...${root}.querySelectorAll('li, p')].map((el) => [el.localName, el.innerHTML, el.localName === 'li' ? getComputedStyle(el, '::before').content : '', Math.round(el.getBoundingClientRect().height) > 0])`;

  // 3. finding audit-fixes 1. an item and a paragraph emptied by Backspace are saved empty, without
  // the line break that the browser puts into an empty text, hence the theme draws the item without
  // its dash in the show and in the print view, and both keep the height of a line
  for (const platform of PLATFORMS) {
    test(`3: an item and a paragraph emptied in the editor are saved empty, and the item is drawn without its dash outside the editor (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 0);
      for (const [selector, needle] of [[`${SLIDE} li`, 'Two'], [`${SLIDE} > p`, 'Gone soon']]) {
        const at = await page.evaluate(`(() => { const r = ${textElementOf(selector, needle)}.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
        await clickText(page, at);
        await frames(page);
        await press(page, 'End');
        for (const _ of needle) await press(page, 'Backspace');
        await press(page, 'Escape');
        await frames(page);
      }
      const edited = await roundTrip(page, 2);
      assert.equal(changed(edited, page.source), '    <li></li>\n  <p></p>', 'the emptied blocks are not saved empty');
      const expected = [['li', 'One', '""', true], ['li', '', 'none', true], ['p', '', '', true]];
      const shown = await show(t, edited, 0);
      assert.deepEqual(await shown.evaluate(marks(`document.querySelector(${js(SLIDE)})`)), expected, 'the show draws the emptied item with its dash');
      assert.deepEqual(errors(shown), []);
      const print = await show(t, edited, 0, '?print-pdf');
      const pages = await print.evaluate(`[...document.querySelectorAll('.pdf-page section')].filter((s) => s.querySelector('h2')?.textContent === 'Items').map((s) => ${marks('s')})`);
      assert.ok(pages.length >= 1, 'the print view does not have the slide Items');
      for (const p of pages) assert.deepEqual(p, expected, 'the print view draws the emptied item with its dash');
    });
  }

  // the block of selector with the text needle emptied by a click into it, End, a Backspace for each
  // character, and Esc
  async function empty(page, selector, needle) {
    const at = await page.evaluate(`(() => { const r = ${textElementOf(selector, needle)}.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
    await clickText(page, at);
    await frames(page);
    await press(page, 'End');
    for (const _ of needle) await press(page, 'Backspace');
    await press(page, 'Escape');
    await frames(page);
  }

  // 3. a nested item is written inside the block of its outer item, and emptied it is saved empty and
  // drawn without its dash as a top item is
  for (const platform of PLATFORMS) {
    test(`3: a nested item emptied in the editor is saved empty, and it is drawn without its dash outside the editor (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 5);
      await empty(page, `${SLIDE} li li`, 'Nested item');
      const edited = await roundTrip(page);
      assert.equal(changed(edited, page.source), '    <li>Top<ul><li></li></ul></li>', 'the emptied nested item is not saved empty');
      const expected = [['li', 'Top<ul><li></li></ul>', '""', true], ['li', '', 'none', true], ['p', 'Below', '', true]];
      const shown = await show(t, edited, 5);
      assert.deepEqual(await shown.evaluate(marks(`document.querySelector(${js(SLIDE)})`)), expected, 'the show draws the emptied nested item with its dash');
      assert.deepEqual(errors(shown), []);
      const print = await show(t, edited, 5, '?print-pdf');
      const pages = await print.evaluate(`[...document.querySelectorAll('.pdf-page section')].filter((s) => s.querySelector('h2')?.textContent === 'Nested').map((s) => ${marks('s')})`);
      assert.ok(pages.length >= 1, 'the print view does not have the slide Nested');
      for (const p of pages) assert.deepEqual(p, expected, 'the print view draws the emptied nested item with its dash');
    });
  }

  // 3. a heading emptied in the editor keeps the line break of the browser in the file, since the theme
  // gives the height of a line only to an empty item or paragraph, hence the heading keeps its line in
  // the show, and the list under it stays where the editor draws it
  const heights = `(() => { const s = document.querySelector(${js(SLIDE)}); return { h2: s.querySelector('h2').offsetHeight, ul: s.querySelector('ul').offsetTop }; })()`;
  for (const platform of PLATFORMS) {
    test(`3: a heading emptied in the editor keeps its line in the show (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 5);
      const was = await page.evaluate(heights);
      await empty(page, `${SLIDE} h2`, 'Nested');
      const editor = await page.evaluate(heights);
      const edited = await roundTrip(page);
      assert.equal(changed(edited, page.source), '  <h2><br></h2>', 'the emptied heading is not saved with its line break');
      const shown = await show(t, edited, 5);
      const live = await shown.evaluate(heights);
      assert.ok(was.h2 > 0 && editor.h2 === was.h2, `the editor draws the emptied heading at ${js(editor)}, where it was ${js(was)}`);
      assert.deepEqual(live, editor, 'the show draws the emptied heading and the list under it elsewhere than the editor');
    });
  }

  // 4. finding audit-fixes 4. the slide Pair has a text whose data-id equals its id. a copy of the
  // slide by each route gives the copy a fresh id and keeps its data-id, so that Magic Move pairs the
  // copy with the text of the slide before it
  for (const platform of PLATFORMS) {
    for (const route of ['Magic Move to Copy of Slide', 'Duplicate Slide', 'Copy and Paste of the slide']) {
      test(`4: ${route} keeps the data-id of a text whose data-id equals its id (${platform})`, async (t) => {
        const page = await load(t, platform, DECK, 1);
        if (route === 'Duplicate Slide') await exec(page, 'slide.duplicate');
        else if (route === 'Magic Move to Copy of Slide') await exec(page, 'slide.magicMove');
        else {
          await exec(page, 'slide.copy');
          await exec(page, 'slide.paste');
        }
        await sleep(300);
        const live = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section p')].filter((p) => p.textContent === 'Intro').map((p) => p.id + '|' + p.dataset.id)`);
        assert.deepEqual(live, ['intro|intro', 'intro-1|intro'], 'the copy does not keep the data-id');
        const edited = await roundTrip(page);
        assert.deepEqual([...edited.matchAll(/<p id="([^"]+)" data-id="([^"]+)"/g)].map((m) => `${m[1]}|${m[2]}`), ['intro|intro', 'intro-1|intro'], 'the file does not keep the data-id of the copy');
      });
    }
  }

  // the place of the mark and of the first words of each item shown under root, in slide px: the
  // left and the right of the box of its ::before, read from the box model of the DevTools
  // protocol, the left of its first letter, and the top of the mark under the top of the line of
  // these words. root is an expression of the page, and the items are those of selector under it
  async function placed(page, root, selector = 'li') {
    const words = await page.evaluate(`(() => {
    const scale = document.querySelector('.reveal .slides').getBoundingClientRect().width / Reveal.getConfig().width;
    return [...${root}.querySelectorAll(${js(selector)})].map((li) => {
      const text = [...li.childNodes].find((n) => n.nodeType === 3 && n.data.trim());
      const r = document.createRange();
      const k = text.data.search(/\\S/);
      r.setStart(text, k);
      r.setEnd(text, k + 1);
      const box = r.getBoundingClientRect();
      return { text: text.data.trim().slice(0, 12), left: box.left, top: box.top, scale };
    });
  })()`);
    await page.evaluate(`window.probed = [...${root}.querySelectorAll(${js(selector)})]`);
    // the protocol hands out the node of an object only after the document is requested
    await page.send('DOM.getDocument', { depth: -1 });
    const out = [];
    const { result } = await page.send('Runtime.evaluate', { expression: 'window.probed', returnByValue: false });
    const { result: list } = await page.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true });
    const items = list.filter((p) => /^\d+$/.test(p.name)).sort((a, b) => a.name - b.name);
    for (let i = 0; i < items.length; i++) {
      const { nodeId } = await page.send('DOM.requestNode', { objectId: items[i].value.objectId });
      const { node } = await page.send('DOM.describeNode', { nodeId, depth: 1 });
      const before = node.pseudoElements?.find((p) => p.pseudoType === 'before');
      const w = words[i];
      let mark = null;
      if (before) {
        const { model } = await page.send('DOM.getBoxModel', { backendNodeId: before.backendNodeId });
        const q = model.border;
        mark = { left: q[0], right: q[2], top: q[1] };
      }
      const s = w.scale;
      out.push({ text: w.text, gap: mark && Math.round((w.left - mark.left) / s), after: mark && Math.round((w.left - mark.right) / s), drop: mark && Math.round((mark.top - w.top) / s) });
    }
    return out;
  }

  // 5. finding review-fixes 3. the slide Centered has a centered list of chevrons whose first item
  // holds a wider nested list, a centered numbered list with a nested numbered list, a centered list
  // of rings with a nested list, and a list at the left. the slide Shaped has a list of chevrons in a
  // shape, which centers its words. every chevron starts 45 px before its words as at the left, a
  // number 54 px, and a ring 47 px, and each mark is drawn as far under the top of its line as at the
  // left of the item. a nested item is 36 px high
  const CENTERED = [['Short', 45, 28], ['A much longe', 45, 19], ['Bravo', 45, 28], ['A long outer', 54, 1], ['Inner', 54, 1], ['Ring', 47, 30], ['A much longe', 45, 19], ['Plain left', 45, 28]];
  const SHAPED = [['Goal', 45, 28], ['A much longe', 45, 28]];

  for (const platform of PLATFORMS) {
    for (const where of ['show', 'editor']) {
      test(`5: the mark of each item of a centered list, a nested list, and a list in a shape is drawn beside its words (${where}, ${platform})`, async (t) => {
        const page = where === 'editor' ? await load(t, platform, DECK, 2) : await show(t, readFileSync(DECK, 'utf8'), 2);
        const centered = await placed(page, `document.querySelector(${js(SLIDE)})`);
        assert.deepEqual(centered.map((m) => [m.text, m.gap, m.drop]), CENTERED, `a mark is not beside its words: ${js(centered)}`);
        await page.evaluate('Reveal.slide(3)');
        await sleep(300);
        const shaped = await placed(page, `document.querySelector(${js(SLIDE)})`);
        assert.deepEqual(shaped.map((m) => [m.text, m.gap, m.drop]), SHAPED, `a mark of the shape is not 54 px before its words: ${js(shaped)}`);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // 6. the slide Numbers has four numbered lists that start at 1, 9, 12, and 123. the number of each
  // item ends 30 px before its words, the gap of one digit, and the words stay 54 px into the item
  const NUMBERS = [['One', 30], ['Nine', 30], ['Twelve', 30], ['Many', 30]];

  for (const platform of PLATFORMS) {
    for (const where of ['show', 'editor', 'print view']) {
      test(`6: the number of an item ends 30 px before its words for 1, 9, 12, and 123 (${where}, ${platform})`, async (t) => {
        let page;
        let root = `document.querySelector(${js(SLIDE)})`;
        if (where === 'editor') page = await load(t, platform, DECK, 4);
        else if (where === 'show') page = await show(t, readFileSync(DECK, 'utf8'), 4);
        else {
          page = await show(t, readFileSync(DECK, 'utf8'), 4, '?print-pdf');
          root = `[...document.querySelectorAll('.pdf-page section')].find((s) => s.querySelector('h2')?.textContent === 'Numbers')`;
        }
        const numbers = await placed(page, root);
        assert.deepEqual(numbers.map((m) => [m.text, m.after]), NUMBERS, `a number does not end 30 px before its words: ${js(numbers)}`);
        const indent = await page.evaluate(`[...${root}.querySelectorAll('li')].map((li) => getComputedStyle(li).paddingLeft)`);
        assert.deepEqual(indent, ['54px', '54px', '54px', '54px'], 'the words of an item are moved');
        assert.deepEqual(errors(page), []);
      });
    }
  }
});
