import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

describe('a word formatted or cut with its space', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r18-6.html';

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
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate('Reveal.slide(0)');
    await frames(page);
    await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    return page;
  }

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

  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const MENU_ITEM = (label) => `[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.getClientRects().length && i.querySelector('.label')?.textContent === ${js(label)})`;

  async function menuCut(page) {
    await click(page, await rect(page, `[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === 'Edit')`));
    await frames(page);
    await click(page, await rect(page, MENU_ITEM('Cut')));
    await page.waitFor(`window.BeesonEditor.render() !== ${js(page.source)}`).catch(() => {});
    await frames(page);
    await page.evaluate('window.BeesonEditorShell?.closeMenus?.(); true');
    await frames(page);
  }

  const CUTS = { 'Mod+X': async (page) => { await press(page, 'Mod+X', { command: 'cut' }); await frames(page); }, 'Cut of the Edit menu': menuCut };

  const FORMATS = {
    Italic: [() => 'Mod+I', 'em'],
    Bold: [() => 'Mod+B', 'strong'],
    Strikethrough: [(platform) => (platform === 'mac' ? 'Mod+Shift+X' : 'Alt+Shift+5'), 's'],
  };

  for (const platform of PLATFORMS) {
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

  const textElementOf = (selector, needle) => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

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

  const CASES = [
    ['a word behind a full stop and before a space', 2, P, 'steps.| Direct', 'break ', 'then break it up into steps. break Direct'],
    ['a word at the end of the text', 2, P, 'attention.|', 'break ', 'the viewer\'s attention. break</p>'],
    ['a word behind a letter and before a full stop', 2, P, 'steps|.', 'break ', 'into steps break. Direct'],
    ['a word at the start of the text', 2, P, '|Design the', 'break ', '<p>break Design the complete'],
    ['a word without a space after it', 2, P, 'steps.| Direct', 'break', 'into steps.break Direct'],
    ['several words with a space after them', 2, P, 'steps.| Direct', 'break it ', 'into steps.break it  Direct'],
    ['a part of a word pasted into a word', 2, P, 'Des|ign the', 'ak ', '<p>Desak ign the'],
    ['a part of a word without a space pasted into a word', 2, P, 'Des|ign the', 'ak', '<p>Desakign the'],
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

  async function showTab(page, name) {
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === ${js(name)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (at) await click(page, at);
    await frames(page);
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
      await press(page, 'Mod+Z', { command: 'undo' });
      await frames(page);
      const now = await page.evaluate(`(() => { const f = ${field}; return { value: f.value, focused: document.activeElement === f, all: f.selectionStart === 0 && f.selectionEnd === f.value.length }; })()`);
      assert.deepEqual(now, { value: '1', focused: true, all: true }, 'one Undo does not put the shown value back, selected');
      assert.equal(await render(page), page.source, 'the Undo changes the file');
      assert.equal((await state(page, 'edit.undo')).label, label, 'the Undo changes the history');
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('Paste of the menus sets the spaces', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const BACKDROP = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => m[0].includes('A figure slide with a backdrop'));
  const PANEL = '#beeson-edit-panel-format';
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

  const requested = (page) => page.evaluate(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => ${FILES}.test(n))`);

  async function drawingItems(page) {
    await click(page, `${PANEL} [aria-label="Drawing"]`);
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu.select')`);
    return page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu.select .item')].map((i) => i.querySelector('.label')?.textContent ?? i.textContent)`);
  }

  for (const platform of PLATFORMS) {
    test(`a selection of a backdrop and a build of its pane do not request a file of the list of backdrops (${platform})`, async (t) => {
      const page = await load(t, platform, LAYOUTS, BACKDROP);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await exec(page, 'backdrop.select');
      await wait(page, 600);
      assert.equal(await page.evaluate(`!!document.querySelector('${PANEL} [aria-label="Drawing"]')`), true, 'the Backdrop pane is not built');
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

  const pointOf = (page, at) => page.evaluate(`(() => { const r = [...document.querySelectorAll('.reveal section.present > p')].find((p) => p.textContent.includes(${js(at.replace('|', ''))})).getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; })()`);

  async function enterText(page, at) {
    await click(page, await pointOf(page, at));
    await frames(page);
    await caretAt(page, at);
  }

  const stubClipboard = (page, text) => page.evaluate(`Object.defineProperty(navigator.clipboard, 'readText', { configurable: true, value: async () => ${js(text)} })`);

  async function clickItem(page, item) {
    const at = await page.evaluate(`(() => { const e = [...document.querySelectorAll('[role=menu] [role^=menuitem]')].find((x) => x.getClientRects().length && (x.querySelector('.label')?.textContent ?? x.textContent).trim() === ${js(item)}); const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, at);
    await wait(page, 300);
  }

  const menuOpen = `[...document.querySelectorAll('[role=menu] [role^=menuitem]')].some((x) => x.getClientRects().length)`;

  async function barMenu(page, item) {
    await click(page, '.beeson-edit-menubar [role=menuitem]:nth-child(2)');
    await page.waitFor(menuOpen);
    await clickItem(page, item);
  }

  async function textMenu(page, at, item) {
    await click(page, await pointOf(page, at), { button: 'right' });
    await page.waitFor(menuOpen);
    await caretAt(page, at);
    await clickItem(page, item);
  }

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

  const WIDE = 'Verdana, "DejaVu Sans", sans-serif';
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
          if (width >= 560) assert.ok(m.body <= m.width, `the body is ${m.body} px wide in a window of ${m.width} px`);
        }
        assert.deepEqual(errors(page), []);
      });
    }
  }
});

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

  async function clickAway(page) {
    const at = await page.evaluate(`(() => { const r = document.querySelector(${js(SLIDE)}).getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 30 }; })()`);
    await clickText(page, at);
    await sleep(300);
  }

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
        await press(page, platform === 'mac' ? 'Mod+Alt+E' : 'Alt+=');
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

  const textElementOf = (selector, needle) => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

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

  const changed = (text, file) => {
    const was = file.split('\n');
    return text.split('\n').filter((l, i) => l !== was[i]).join('\n');
  };

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

  const marks = (root) => `[...${root}.querySelectorAll('li, p')].map((el) => [el.localName, el.innerHTML, el.localName === 'li' ? getComputedStyle(el, '::before').content : '', Math.round(el.getBoundingClientRect().height) > 0])`;

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

  async function empty(page, selector, needle) {
    const at = await page.evaluate(`(() => { const r = ${textElementOf(selector, needle)}.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
    await clickText(page, at);
    await frames(page);
    await press(page, 'End');
    for (const _ of needle) await press(page, 'Backspace');
    await press(page, 'Escape');
    await frames(page);
  }

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
