// the keys of the editor, sent as trusted input on both platforms: one dispatch runs the command
// of a key in the region of the focus, the keys of reveal.js are off, and the sheet of the keys
// lists every command with a key

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { byteExact, click, clickText, drag, editorPage, press, saveAndReopen, selectPicture, type } from './helpers/editor.mjs';
import { serve } from '../scripts/webdriver.mjs';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const HEADING = ['<h2>Text, a list, and a backdrop</h2>', '<h2>Text, a list, and a backdrop now</h2>'];

const keysPage = async (browser, platform) => {
  const page = await editorPage(browser, { deck: LAYOUTS, query: `edit&still&edit-platform=${platform}` });
  // the keys seen by a listener after the dispatch, with whether the default was prevented
  await page.evaluate(`(() => { window.__keys = []; window.addEventListener('keydown', (e) => window.__keys.push([e.key, e.defaultPrevented]), true); })()`);
  return page;
};

const slide = (page) => page.evaluate('Reveal.getIndices().h');
const prevented = (page) => page.evaluate('window.__keys.splice(0).map(([key, p]) => key + (p ? ":prevented" : ""))');
const blur = (page) => page.evaluate('document.activeElement.blur()');

// a trusted key with its key, code, and Windows key code given, for a key that press() does not
// know, e.g. ? or a key code of the pause of reveal.js
async function raw(page, key, code, keyCode, modifiers = 0) {
  const text = key.length === 1 && !(modifiers & 6) ? key : undefined;
  await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers, ...(text ? { text, unmodifiedText: text } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
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
    // the fallback modifier, Control on a Mac and Meta elsewhere, undoes too
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
    // Select All is the command of the registry, which selects the text of the block as the browser
    // does, and a second one selects every element of the slide
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
    // the colon and the semicolon, whose key codes 58 and 59 pause reveal.js in Firefox
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
    // with a block selected, an arrow nudges it and the slide stays
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
    assert.equal(await page.evaluate('document.activeElement.className'), 'jump-to-slide-input');
    await type(page, '5');
    await press(page, 'Enter');
    assert.equal(await slide(page), 4);
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-goto').hidden`), true);
    // Esc closes the field and gives the focus back
    const row = `document.querySelectorAll('.beeson-edit-nav .row')[4]`;
    await page.evaluate(`${row}.focus()`);
    await press(page, 'G');
    assert.equal(await page.evaluate('document.activeElement.className'), 'jump-to-slide-input');
    await press(page, 'Escape');
    assert.equal(await page.evaluate(`document.activeElement === ${row}`), true);
    // a plain key on a button of the bars is left to the button
    await page.evaluate(`document.querySelector('.beeson-edit-bottom button').focus()`);
    await press(page, 'G');
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-goto').hidden`), true);
    await blur(page);
    if (platform === 'mac') {
      await press(page, 'Ctrl+Mod+G');
      assert.equal(await page.evaluate('document.activeElement.className'), 'jump-to-slide-input');
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
    // F6 is taken in a text too
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
    // every key of Windows and Linux is free of Ctrl+Alt, which AltGr sends
    if (!mac) for (const keys of Object.values(sheet.rows)) assert.doesNotMatch(keys, /Ctrl\+Alt/);
    // only the keys of the sheet are live while it is open, and Esc closes it
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
    // Save is taken in a text
    await press(page, 'Mod+S');
    await page.waitFor('window.__written.length === 1 && !window.BeesonEditor.status().dirty');
    assert.ok((await page.evaluate('window.__written[0]')).includes(HEADING[1]));
    await press(page, 'Mod+Shift+S');
    await page.waitFor(`window.__picker === 'save'`);
    await blur(page);
    await press(page, 'Mod+O');
    await page.waitFor(`window.__picker === 'open'`);
    // Present plays the deck in a frame over the editor, and Esc in the show returns to the editor.
    // the frame is of another origin on file:, hence the show is ready at the event posted by reveal.js
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
    // the editor is at the slide shown last, the first slide of the show from the start
    assert.equal(await slide(page), 0);
    assert.deepEqual(page.errors, []);
  });
}

test('press() of Enter runs the default action of the key on a focused button and summary', async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  // a native button and summary without a keydown listener, as a keyboard meets them
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
  // with a command modifier, Enter is a command and does not press the button
  await page.evaluate(`document.querySelector('button').focus()`);
  await press(page, 'Mod+Enter');
  await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
  assert.equal(await page.evaluate('window.__pressed'), 1);
});

// regression tests of R7.10 on both platforms with trusted input. a group and a lock of the image
// of a figure are written on the figure, and every other attribute that the editor sets on an
// image of a dark and light pair is written on both images.
// a press on the slide gives the keys to the canvas after a click on a tab, a button, or a field of
// the inspector or the status bar. an indent of a list item writes the step index of the file and
// not the one that reveal.js renumbered on the page. after each edit the text is checked byte for
// byte, after an undo and a redo, and after a save and an open
describe('the keys after a click on a control', () => {
  const PLATFORMS = ['mac', 'other'];
  // the slides of the demo deck with the stepped list and with the figure of a dark and light pair
  const STEPS = 2;
  const FIGURE = 4;
  const IMG = '.reveal section.present figure.figure-box > img';
  const DARK = '.reveal section.present figure.figure-box > img.for-dark';
  const LIGHT = '.reveal section.present figure.figure-box > img.for-light';
  const PARA = '.reveal section.present > p';

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
  let saves = 0;

  // the selected elements, each named by its tag and its classes of the deck
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => [el.localName, ...el.classList].filter((c) => !c.startsWith('beeson-') && c !== 'visible' && c !== 'current-fragment').join('.'))`);
  // the element that has the keys, named by its tag, its classes, and its text
  const focused = (page) => page.evaluate(`(() => {
  const a = document.activeElement;
  return a && a !== document.body ? [a.localName, ...a.classList].join('.') + ' ' + JSON.stringify((a.textContent ?? '').trim().slice(0, 20)) : 'body';
})()`);

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
    const { text } = await saveAndReopen(page, `r7-10-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  // the center of a control of the chrome found by its text, its title, or its aria label, in the
  // right part of the window or in the status bar at its bottom
  const controlAt = (page, name, where = 'inspector') => page.evaluate(`(() => {
  const right = (r) => r.left > innerWidth * 0.7;
  const bottom = (r) => r.top > innerHeight - 60;
  const ok = ${where === 'inspector' ? 'right' : 'bottom'};
  const named = (b) => [b.textContent.trim(), b.title, b.getAttribute('aria-label')].includes(${js(name)});
  const b = [...document.querySelectorAll('button, [role="tab"], input, select')].find((b) => named(b) && b.getBoundingClientRect().width && ok(b.getBoundingClientRect()));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  // items 2 and 3 of the list of the steps slide indented one after the other into item 1, each with
  // its step index of the file
  const FIRST = '    <li class="fragment" data-fragment-index="1">Each step is a reveal.js "fragment", i.e.<code> class="fragment"</code>, with a <code>data-fragment-index</code> of appearance';
  const SECOND = '<li class="fragment" data-fragment-index="2">Two elements with the same index are shown together.</li>\n';
  const THIRD = '<li class="fragment" data-fragment-index="3">When exporting to PDF or PPTX, you will get one slide per step.</li>\n';
  const LIST = `${FIRST}</li>\n    ${SECOND}    ${THIRD}`;
  const ONE = `${FIRST}\n      <ul>\n        ${SECOND}      </ul>\n    </li>\n    ${THIRD}`;
  const TWO = `${FIRST}\n      <ul>\n        ${SECOND}        ${THIRD}      </ul>\n    </li>\n`;

  for (const platform of PLATFORMS) {
    for (const how of ['Tab', 'button']) {
      test(`the first indent of a stepped list item writes the step index of the file, by ${how} (${platform})`, async (t) => {
        const page = await load(t, platform, { n: STEPS });
        // reveal.js numbers the steps of the page from 0, hence item 2 of index 2 in the file is 1 here
        const pageIndex = await page.evaluate(`document.querySelectorAll('.reveal section.present li')[1].dataset.fragmentIndex`);
        assert.equal(pageIndex, '1', 'reveal.js does not renumber the steps of the page as this test assumes');
        const indent = async (item) => {
          await clickText(page, item);
          await press(page, 'End');
          await frames(page);
          if (how === 'Tab') await press(page, 'Tab');
          else {
            const at = await controlAt(page, 'Increase Indent Level');
            assert.ok(at, 'the Text pane does not offer Increase Indent Level');
            await clickText(page, at);
          }
          await frames(page);
        };
        await indent('.reveal section.present > ul > li:nth-child(2)');
        await byteExact(page, [[LIST, ONE]]);
        await indent('.reveal section.present > ul > li:nth-child(2)');
        await byteExact(page, [[LIST, TWO]]);
        await roundTrip(page, 2);
      });
    }
  }

  // the controls of the chrome that may keep the keys after a click: the tabs Format and Steps at
  // the head of the inspector, the tabs of the panes of an image, a check box of the Image pane, and
  // the buttons and the zoom slider of the status bar. each is found by a test of its element b and
  // its box r in the window, with the image selected first where image is set
  const CONTROLS = [
    { name: 'the tab Format', find: "b.textContent.trim() === 'Format' && r.left > innerWidth * 0.7 && r.top > 80" },
    { name: 'the tab Steps', find: "b.textContent.trim() === 'Steps' && r.left > innerWidth * 0.7 && r.top > 80" },
    { name: 'the pane tab Image', find: "b.textContent.trim() === 'Image' && r.left > innerWidth * 0.7", image: true },
    { name: 'the pane tab Arrange', find: "b.textContent.trim() === 'Arrange' && r.left > innerWidth * 0.7", image: true },
    { name: 'the check box Decorative', find: "b.type === 'checkbox' && b.labels?.[0]?.textContent.trim() === 'Decorative'", image: true },
    { name: 'the button Fit', find: "b.textContent.trim() === 'Fit' && r.top > innerHeight - 60" },
    { name: 'the zoom slider', find: "b.type === 'range' && r.top > innerHeight - 60" },
    { name: 'the mode button', find: "b.getAttribute('aria-label') === 'Flip the mode of the slide' && r.top > innerHeight - 60", undo: true },
    { name: 'the button Next slide', find: "b.getAttribute('aria-label') === 'Next slide' && r.top > innerHeight - 60", back: true },
  ];

  const controlOf = (page, find) => page.evaluate(`(() => {
  const b = [...document.querySelectorAll('button, input, select')].find((b) => { const r = b.getBoundingClientRect(); return r.width && (${find}); });
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  // the declaration translate of the start tag of the figure of the pair in the text of the editor
  const figureTranslate = async (page) => (await render(page)).match(/<figure class="figure-box"[^>]*>/)?.[0].match(/translate: ([^;"]+)/)?.[1] ?? null;

  for (const platform of PLATFORMS) {
    for (const control of CONTROLS) {
      test(`a click on the image gives the keys to the slide after a click on ${control.name} (${platform})`, async (t) => {
        const page = await load(t, platform);
        if (control.image) {
          await clickText(page, IMG);
          await frames(page);
        }
        const at = await controlOf(page, control.find);
        assert.ok(at, `the window does not show ${control.name}`);
        await clickText(page, at);
        await frames(page);
        // the slide of the image again after Next slide, and the mode of the deck after the flip
        if (control.back) await page.evaluate(`Reveal.slide(${FIGURE})`);
        if (control.undo) await clickText(page, at);
        if (control.image && control.find.includes('checkbox')) await page.evaluate('window.BeesonEditor.undo()');
        await frames(page);
        const chrome = await focused(page);
        await clickText(page, IMG);
        await frames(page);
        // the click selects the figure, or the image alone where the figure was selected before it
        assert.deepEqual(await selected(page), [control.image ? 'img.for-dark' : 'figure.figure-box']);
        // ArrowRight nudges the figure by one slide pixel, also from its image
        await press(page, 'ArrowRight');
        await frames(page);
        assert.equal(await figureTranslate(page), '1px 0px', `ArrowRight does not nudge the figure, with the keys on ${chrome}`);
        assert.equal(await focused(page), 'body', `the keys stay on ${chrome} after a click on the image`);
        await page.evaluate('window.BeesonEditor.undo()');
        await byteExact(page);
        // Esc selects the figure of the image, and Backspace deletes it
        if (control.image) {
          await press(page, 'Escape');
          await frames(page);
        }
        assert.deepEqual(await selected(page), ['figure.figure-box'], 'Esc does not select the figure of the image');
        await press(page, 'Backspace');
        await frames(page);
        assert.equal(await page.evaluate(`document.querySelectorAll(${js(IMG)}).length`), 0, 'Backspace does not delete the figure');
        await roundTrip(page);
      });
    }
  }

  // a press on a line or on the grip of its end, which the line module takes before the presses of
  // the canvas, gives the keys to the slide as well
  const LINE = '.reveal section.present svg.line';
  const lineState = (page) => page.evaluate(`(() => {
  const svg = document.querySelector(${js(LINE)});
  const l = svg.querySelector('line');
  return { translate: svg.style.translate, x2: l.getAttribute('x2') };
})()`);

  for (const platform of PLATFORMS) {
    for (const part of ['line', 'end grip']) {
      test(`a press on the ${part} of a line gives the keys to the slide after a click on the tab Format (${platform})`, async (t) => {
        const page = await load(t, platform);
        await exec(page, 'insert.arrow', { from: { x: 150, y: 960 }, to: { x: 650, y: 960 } });
        await frames(page);
        page.source = await render(page);
        const format = await controlOf(page, CONTROLS[0].find);
        await clickText(page, format);
        await frames(page);
        assert.match(await focused(page), /^button/);
        if (part === 'line') {
          await press(page, 'Escape');
          await clickText(page, format);
          const r = await page.evaluate(`(() => { const r = document.querySelector(${js(LINE)} + ' line').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          await clickText(page, r);
        } else {
          const end = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-line-end')].find((g) => !g.hidden && g.dataset.end === '2' && g.getBoundingClientRect().width); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          await drag(page, end, { dx: 20, dy: 0 });
        }
        await frames(page);
        assert.deepEqual(await selected(page), ['svg.line']);
        const before = await lineState(page);
        await press(page, 'ArrowRight');
        await frames(page);
        assert.notDeepEqual(await lineState(page), before, `ArrowRight does not nudge the line, with the keys on ${await focused(page)}`);
        assert.equal(await focused(page), 'body', 'the keys stay on the tab Format after a press on the line');
        await press(page, 'Backspace');
        await frames(page);
        assert.equal(await page.evaluate(`document.querySelectorAll(${js(LINE)}).length`), 0, 'Backspace does not delete the line');
        await roundTrip(page, part === 'line' ? 2 : 3);
      });
    }
  }

  // the start tags of the paragraph and of the pair of images of the figure slide
  const P_TAG = '<p>Export your matplotlib figure';
  const FIG_TAG = '<figure class="figure-box">';
  const DARK_TAG = '<img class="for-dark" src="demo/figure-dark.png" alt="Zero-velocity curves of the Earth–Moon system, dark version">';
  const LIGHT_TAG = '<img class="for-light" src="demo/figure-light.png" alt="Zero-velocity curves of the Earth–Moon system, light version">';
  const withAttr = (tag, attr) => tag.replace(/>$/, ` ${attr}>`);
  const theme = (page) => page.evaluate('document.documentElement.dataset.theme');
  // the mode of the deck flipped by the button of the status bar
  async function flipMode(page) {
    const was = await theme(page);
    await clickText(page, await controlOf(page, CONTROLS.find((c) => c.undo).find));
    await frames(page);
    assert.notEqual(await theme(page), was, 'the mode button does not flip the mode');
  }

  for (const platform of PLATFORMS) {
    test(`a group of the figure of an image and a paragraph is written on the figure and holds in the other mode (${platform})`, async (t) => {
      const page = await load(t, platform);
      assert.equal(await theme(page), 'dark');
      await clickText(page, IMG);
      await click(page, PARA, { modifiers: 'Shift' });
      await frames(page);
      assert.deepEqual((await selected(page)).sort(), ['figure.figure-box', 'p']);
      await press(page, platform === 'mac' ? 'Mod+Alt+G' : 'Mod+G');
      await frames(page);
      await byteExact(page, [[P_TAG, '<p data-group="g1">Export your matplotlib figure'], [FIG_TAG, withAttr(FIG_TAG, 'data-group="g1"')]]);
      await roundTrip(page);
      // in light mode a click on the picture selects the group with the figure, and a drag moves
      // the paragraph and the figure
      await page.evaluate(`Reveal.slide(${FIGURE})`);
      await flipMode(page);
      await clickText(page, IMG);
      await frames(page);
      assert.deepEqual((await selected(page)).sort(), ['figure.figure-box', 'p'], 'the click in light mode does not select the group');
      await drag(page, IMG, { dx: -60, dy: -40 });
      await frames(page);
      const text = await render(page);
      const tags = [...text.matchAll(/<(p|figure) [^>]*data-group="g1"[^>]*>/g)].map((m) => [m[1], m[0].match(/translate: ([^;"]+)/)?.[1] ?? null]);
      assert.equal(tags.length, 2, `the group is not written on two tags: ${js(tags)}`);
      assert.ok(tags.every(([, tr]) => tr && tr === tags[0][1]), `the drag in light mode does not move the whole group: ${js(tags)}`);
      await roundTrip(page);
    });

    test(`a lock of the figure of an image is written on the figure and holds in the other mode (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, IMG);
      await frames(page);
      await press(page, 'Mod+L');
      await frames(page);
      await byteExact(page, [[FIG_TAG, withAttr(FIG_TAG, 'data-locked')]]);
      await roundTrip(page);
      await page.evaluate(`Reveal.slide(${FIGURE})`);
      await flipMode(page);
      await clickText(page, IMG);
      await drag(page, IMG, { dx: -80, dy: -100 });
      await frames(page);
      await byteExact(page);
      await press(page, 'ArrowLeft');
      await frames(page);
      await byteExact(page);
      // the unlock in light mode takes the lock off the figure
      await exec(page, 'arrange.unlock');
      await frames(page);
      assert.ok(!(await render(page)).includes('data-locked'), 'the unlock in light mode leaves a lock in the file');
      await roundTrip(page);
    });

    test(`a flip of an image is written on both images of the pair, and its alt and Paper are not (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, IMG);
      await frames(page);
      await exec(page, 'arrange.flipHorizontal');
      await frames(page);
      await byteExact(page, [[DARK_TAG, DARK_TAG.replace('>', ' style="scale: -1 1">')], [LIGHT_TAG, LIGHT_TAG.replace('>', ' style="scale: -1 1">')]]);
      await roundTrip(page);
      // the alt, the mode, and White Figure of the dark image are its own
      await page.evaluate(`Reveal.slide(${FIGURE})`);
      await clickText(page, IMG);
      await frames(page);
      await exec(page, 'figure.alt', 'Curves of the dark version');
      await exec(page, 'figure.whiteFigure');
      await frames(page);
      const text = await render(page);
      assert.ok(text.includes('<img class="for-light" src="demo/figure-light.png" alt="Zero-velocity curves of the Earth–Moon system, light version" style="scale: -1 1">'), 'the alt or Paper of the dark image is written on the light image');
      assert.ok(text.includes('<img class="for-dark white-figure" src="demo/figure-dark.png" alt="Curves of the dark version" style="scale: -1 1">'));
      assert.deepEqual(errors(page), []);
    });
  }

  // Delete and Cut of the image selected in its figure take the figure off, with both images of the
  // pair and the caption, as Keynote takes off an image with its caption
  for (const platform of PLATFORMS) {
    // Cut is run as a command, since its key is left to the clipboard event of the browser
    for (const key of ['Backspace', 'edit.cut']) {
      test(`${key === 'Backspace' ? 'Delete' : 'Cut'} of the image of a figure takes the figure off with both images of the pair (${platform})`, async (t) => {
        const page = await load(t, platform);
        await selectPicture(page, IMG);
        await frames(page);
        assert.deepEqual(await selected(page), ['img.for-dark']);
        if (key === 'Backspace') await press(page, key);
        else await exec(page, key);
        await frames(page);
        const figure = page.source.match(/\n *<figure class="figure-box">[\s\S]*?<\/figure>/)[0];
        await byteExact(page, [[figure, '']]);
        await roundTrip(page);
      });
    }
  }
});

// the key of Duplicate Slide of R16.7 on both platforms, with trusted input. Mod+D is the key of
// Edit > Duplicate, which duplicates the selected figure, and the slide in the navigator and with
// nothing selected. the Slide menu thus lists Duplicate Slide with the key only where the key runs
// it, as it lists Delete Slide, and the item stays live
describe('Mod+D for Duplicate and Duplicate Slide', () => {
  const DECK = 'test-deck.html';
  // the index of the figures slide in index.html
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
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
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

  // the key printed and the dimmed state of the item label of the menu bar, read from the open menu,
  // which is then closed
  async function itemIn(page, bar, label) {
    await openBar(page, bar);
    const out = await page.evaluate(`(() => { const i = (${findItem})(${js(label)}); return i ? { keys: i.querySelector('.keys')?.textContent ?? '', dimmed: i.getAttribute('aria-disabled') === 'true' } : null; })()`);
    await closeMenus(page);
    return out;
  }

  // a point of the canvas under the slide
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
      // the item of the Slide menu duplicates the slide while the figure is selected
      await click(page, '.reveal .slides > section.present img');
      await settle(page);
      await openBar(page, 'Slide');
      await click(page, await rect(page, `(${findItem})('Duplicate Slide')`));
      await settle(page);
      assert.equal(await slides(page), 14);
      assert.equal(await undoLabel(page), 'Undo Duplicate Slide');
      await undo(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
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
      assert.deepEqual(errors(page), []);
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
      assert.deepEqual(errors(page), []);
    });

    test(`the sheet of shortcuts lists Mod+D at Duplicate, and not at Duplicate Slide (${platform})`, async (t) => {
      const page = await load(t, platform);
      await page.evaluate(`window.BeesonEditor.exec('help.keys')`);
      await settle(page);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-keys .row')].map((r) => ({ label: r.firstElementChild.textContent, keys: r.querySelector('kbd').textContent.split(', ') }))`);
      const keysOf = (label) => rows.find((r) => r.label === label)?.keys ?? [];
      assert.deepEqual(keysOf('Duplicate Slide'), []);
      assert.ok(keysOf('Duplicate').includes(DUPLICATE[platform]), js(keysOf('Duplicate')));
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R17.8 on both platforms, the requirements 8 and 8a and the defects N36 to
// N41 of the check of round 7: the keys with a command modifier that act in a text, Move Slide Up
// and Down dimmed in a text, Mod+D kept from the browser in a cell, Mod+B and Mod+I on a framed
// formula, and the inspector given back once the window has room for it
describe('command keys that act in a text', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test-deck.html';
  // the index of the figures slide in index.html
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
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
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

  // whether the last keydown of a key reached the window with its default prevented, read after the
  // handler of the editor, which is the first listener of the capture phase
  const watchKeys = (page) => page.evaluate(`(() => { window.__keys = {}; addEventListener('keydown', (ev) => { window.__keys[ev.key.toLowerCase()] = ev.defaultPrevented; }, true); return true; })()`);
  const prevented = (page, key) => page.evaluate(`window.__keys[${js(key)}] ?? null`);

  // the caret put by a click into the word matplotlib of the first paragraph of the figures slide
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

    // item 1: New Slide, Hide Slide, and on a Mac Zoom to Selection act by their keys in a text, as
    // their items of the menu do, and a key that the text takes is typed
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
      // the text takes Shift with a digit and a bare letter. press() sends Shift+2 with the text 2, and
      // Shift+0, the key of Actual Size, with the text 0
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
      assert.deepEqual(errors(page), []);
    });

    // item 2: Move Slide Up and Down are dimmed in a text, where Alt with an arrow moves the caret or
    // adds a row, as on the canvas
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
      // the navigator still moves the slide
      await click(page, `.beeson-edit-nav .row:nth-child(${FIGURES + 1})`);
      await wait(page);
      assert.deepEqual(await moves(), { up: true, down: true }, 'the two are dimmed in the navigator');
      assert.deepEqual(errors(page), []);
    });

    // item 3: Mod+D is kept from the browser, which bookmarks the page, also where Duplicate is dimmed
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
      assert.deepEqual(errors(page), []);
    });

    // item 4: a display of math is not set in bold or italic, neither a new one nor one of the deck
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
      // the display of the slide, framed by a click and Esc
      const math = await rect(page, `Reveal.getCurrentSlide().querySelector('div.math mjx-container')`);
      if (math) {
        await clickText(page, math);
        await press(page, 'Escape');
        await wait(page);
        assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.className)'), ['math']);
        await check(page.source, 'Undo', 'the display of the slide');
      }
      // a new formula, closed by a click on the canvas under the slide
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
      assert.deepEqual(errors(page), []);
    });
  }

  // item 5: whether the navigator and the inspector are drawn, and the check marks of the View menu
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
      // the navigator hidden again leaves room for the inspector
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await view(page), { navigator: 'false', format: 'true', nav: false, inspector: true }, 'the inspector is not given back with the navigator hidden');
      await resize(page, 1600, 900);
      assert.deepEqual(await view(page), { navigator: 'false', format: 'true', nav: false, inspector: true });
      // a wider window gives the inspector back beside the navigator
      await resize(page, 760, 900);
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await view(page), { navigator: 'true', format: 'false', nav: true, inspector: false });
      await resize(page, 1600, 900);
      assert.deepEqual(await view(page), BOTH, 'the inspector is not given back at 1600 px');
      // Format closed by the user stays closed
      await choose(page, 'View', 'Format');
      await resize(page, 760, 900);
      await resize(page, 1600, 900);
      assert.deepEqual(await view(page), { navigator: 'true', format: 'false', nav: true, inspector: false }, 'Format closed by the user is opened again');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    // N36: View > Navigator after the window was narrowed shows the navigator in one choice
    test(`View > Navigator after the window was narrowed with the navigator off shows it in one choice (${platform})`, async (t) => {
      const page = await load(t, platform);
      assert.equal((await view(page)).nav, true);
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await view(page), { navigator: 'false', format: 'true', nav: false, inspector: true });
      await resize(page, 760, 900);
      await choose(page, 'View', 'Navigator');
      assert.deepEqual(await view(page), { navigator: 'true', format: 'false', nav: true, inspector: false }, 'one choice of View > Navigator does not show the navigator');
      assert.deepEqual(errors(page), []);
    });
  }
});
