// the kind of a list, i.e. Arrows, Dots, Dashes, Numbers, and Paragraphs, its levels by Tab, its
// start number in Start at, and a moved list kept whole

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';
import { editProblems, themeClasses } from '../src/editor/model/scope.ts';

// regression tests of R12.6 on both platforms with trusted input: the text and the lists of a slide,
// i.e. Italic after Tab over a whole list, the selection kept by a list style, the caret after an
// undo in a nested list, Tab on a new empty item, Tab in a paragraph or a heading, the entries of a
// paste and a cut, the paragraph that ends a moved list, Backspace at the start of a list, and the
// check of the paragraph style menu over mixed blocks. after each edit the text is checked byte for
// byte after an undo, the edit again after a redo, and after a save and an open
describe('Tab, Italic, and list styles on lists', () => {
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
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
  let saves = 0;

  async function load(t, platform, n = 4) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/test-deck.html?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync('test-deck.html', 'utf8');
    page.platform = platform;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // roundTrip checks page.source byte for byte after undos undos, the edit after as many redos, and
  // an open of the saved edit without problems
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await undo(page);
    await byteExact(page);
    for (let i = 0; i < undos; i++) await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r12-6-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  const find = (selector, needle = '') => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  // the client point of the character at offset k of needle, 2 px inside its left edge with edge
  const pointOf = (page, selector, needle, k = 0, edge = false) => page.evaluate(`(() => {
  const el = ${find(selector, needle)};
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i + ${k});
    r.setEnd(n, i + ${k} + 1);
    const b = r.getBoundingClientRect();
    return { x: ${edge} ? b.left + 2 : b.left + b.width / 2, y: b.top + b.height / 2 };
  }
})()`);

  const ITEM = '.reveal section.present ul > li, .reveal section.present ol > li';
  const PARA = '.reveal section.present > p';
  const HEAD = '.reveal section.present > h2';

  // caretAtEnd puts the caret at the end of the own text of item i of the slide, counted in page
  // order, i.e. before a nested list of the item
  const caretAtEnd = (page, i) => page.evaluate(`(() => {
  const li = document.querySelectorAll(${js(ITEM)})[${i}];
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim() && n.parentElement.closest('li') === li) last = n;
  li.closest('[contenteditable="true"]').focus();
  getSelection().collapse(last, last.length);
})()`);

  // caretIn gives the tag and the text of the element of the focus of the window, the active element,
  // and whether the window is collapsed
  const caretIn = (page) => page.evaluate(`(() => {
  const s = getSelection();
  const n = s.focusNode;
  const el = n && (n.nodeType === 1 ? n : n.parentElement);
  return { tag: el?.localName ?? null, text: el?.textContent.trim().slice(0, 29) ?? null, editing: !!el?.closest('[contenteditable="true"]'), active: document.activeElement.localName, collapsed: s.isCollapsed };
})()`);

  // the part of the file from the h2 of slide 5 to its figure
  const listPart = (text) => {
    const at = text.indexOf('<h2>Figures are first');
    return text.slice(at, text.indexOf('<figure class="figure-box">', at));
  };

  // pressCommand sends a key with the editing command of the browser, which a key event of the
  // DevTools protocol runs only when the command is named
  async function pressCommand(page, keys, command) {
    const modifiers = page.platform === 'mac' ? 4 : 2;
    const key = keys.slice(-1);
    const base = { key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), modifiers };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [command] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  // pressKey sends Mod+], which press() does not know, and else passes keys to press()
  async function pressKey(page, keys) {
    if (keys !== 'Mod+]') return press(page, keys);
    const base = { key: ']', code: 'BracketRight', windowsVirtualKeyCode: 221, modifiers: page.platform === 'mac' ? 4 : 2 };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  for (const platform of PLATFORMS) {
    // text-lists-find-1: Italic after Tab on the whole list wrote one more empty item with step 3
    test(`Italic after Tab on a whole list selected with the command A formats the items and adds no item (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'toggle', 2));
      await press(page, 'Mod+A');
      await press(page, 'Tab');
      const nested = await render(page);
      assert.match(listPart(nested), /<li class="fragment" data-fragment-index="1">Dark[\s\S]*<ul>[\s\S]*data-fragment-index="3"/);
      await press(page, 'Mod+I');
      const part = listPart(await render(page));
      assert.equal(part.match(/<li\b/g).length, 3, `the italic changes the number of items: ${part}`);
      assert.doesNotMatch(part, /<li[^>]*>\s*<\/li>/, 'the italic writes an empty item');
      assert.equal(part.match(/<em>/g)?.length, 3, `the italic does not format each item: ${part}`);
      await roundTrip(page, 2);
    });

    // text-lists-find-2: Numbers, Dashes, and Paragraphs collapsed the selection to a caret
    test(`Numbers and then Paragraphs act on every item of a list selected with the command A (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'toggle', 2));
      await press(page, 'Mod+A');
      await exec(page, 'text.list.ol');
      assert.equal((await caretIn(page)).collapsed, false, 'Numbers collapses the selection');
      await press(page, 'Mod+I');
      let part = listPart(await render(page));
      assert.equal(part.match(/<em>/g)?.length, 3, `Italic after Numbers does not format each item: ${part}`);
      await undo(page);
      await exec(page, 'text.list.none');
      part = listPart(await render(page));
      assert.doesNotMatch(part, /<ol|<ul|<li/, `Paragraphs after Numbers leaves a list: ${part}`);
      assert.equal(part.match(/<p class="fragment"/g)?.length, 3);
      await roundTrip(page, 2);
    });

    test(`Dashes on a word of a paragraph keeps the word selected for Italic (${platform})`, async (t) => {
      const page = await load(t, platform);
      await click(page, await pointOf(page, PARA, 'styles', 2), { count: 2 });
      await exec(page, 'text.list.ul');
      assert.equal((await caretIn(page)).collapsed, false, 'Dashes collapses the selection');
      await press(page, 'Mod+I');
      assert.match(listPart(await render(page)), /<ul>\n {4}<li>Export your matplotlib figure with the <em>styles<\/em> of the template/);
      await roundTrip(page, 2);
    });

    // text-lists-find-3: the caret was left in the white space of a nested list after an undo
    test(`after the undo of an outdented empty nested item, Shift+Tab and Return act on the item of the caret (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'You should', 0, true));
      await press(page, 'Home');
      await press(page, 'Tab');
      await caretAtEnd(page, 2);
      await press(page, 'Enter');
      await press(page, 'Enter');
      await undo(page);
      await undo(page);
      const c = await caretIn(page);
      assert.ok(c.tag === 'li' || c.tag === 'code', `the caret is not in an item after the undo: ${js(c)}`);
      assert.match(c.text, /^You should|^invert/);
      const nested = await render(page);
      await press(page, 'Shift+Tab');
      assert.notEqual(listPart(await render(page)), listPart(nested), 'Shift+Tab does not move the item out');
      await press(page, 'Enter');
      const part = listPart(await render(page));
      assert.doesNotMatch(part, /<(ul|ol)>\s*<\/\1>/, `Return writes an empty list: ${part}`);
      assert.doesNotMatch(part, /<li[^>]*>\s*<(ul|ol)>/, `Return writes an item that starts with a list: ${part}`);
      await roundTrip(page, 3);
    });

    // feel-1: the text typed after Tab on a new empty item went to the item above
    for (const key of ['Tab', 'Mod+]']) {
      test(`text typed after ${key} on a new empty item goes into the nested item (${platform})`, async (t) => {
        const page = await load(t, platform, 2);
        await caretAtEnd(page, 0);
        await press(page, 'Enter');
        await pressKey(page, key);
        await type(page, 'Sub-point');
        const text = await render(page);
        const near = text.match(/of appearance[\s\S]{0,160}/)?.[0];
        assert.ok(/of appearance\s*<ul>\s*<li class="fragment" data-fragment-index="1">Sub-point<\/li>\s*<\/ul>/.test(text), `the text is not in the nested item: ${near}`);
        await roundTrip(page, 3);
      });
    }

    // feel-2 and text-lists-find-4: Tab outside a list moved the focus out of the text
    for (const [name, n, selector, needle] of [['the paragraph', 4, PARA, 'Export'], ['the heading', 4, HEAD, 'Figures'], ['the heading of a section slide', 1, '.reveal section.present h2', 'Chapter']]) {
      test(`Tab and Shift+Tab in ${name} keep the caret in its text (${platform})`, async (t) => {
        const page = await load(t, platform, n);
        await clickText(page, await pointOf(page, selector, needle, 1, true));
        const before = await caretIn(page);
        await press(page, 'Tab');
        assert.deepEqual(await caretIn(page), before, 'Tab moves the caret');
        await press(page, 'Shift+Tab');
        assert.deepEqual(await caretIn(page), before, 'Shift+Tab moves the caret');
        assert.equal(await render(page), page.source);
        await type(page, 'Q');
        assert.ok((await render(page)).includes(`${needle[0]}Q${needle.slice(1)}`), 'the typed text is lost');
      });
    }

    // text-lists-find-5: a paste and a cut were part of the entry of the typing
    test(`a paste after typing and a cut are entries of their own, named Paste and Cut (${platform})`, async (t) => {
      const page = await load(t, platform);
      await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
      await click(page, await pointOf(page, PARA, 'matplotlib', 3), { count: 2 });
      await pressCommand(page, 'Mod+c', 'copy');
      await clickText(page, await pointOf(page, PARA, 'frameless.', 9));
      await press(page, 'End');
      await type(page, ' abc ');
      await pressCommand(page, 'Mod+v', 'paste');
      const pasted = await render(page);
      // a double-click on Windows selects the space after the word as well, and it is copied with it
      assert.match(pasted, /frameless\. abc matplotlib ?<\/p>/, `the paste is not in the text: ${pasted.match(/frameless\.[^<]*/)?.[0]}`);
      assert.equal(await undoLabel(page), 'Undo Paste');
      await undo(page);
      assert.ok((await render(page)).includes('frameless. abc </p>'), 'the undo of the paste takes back the typing too');
      await redo(page);
      assert.equal(await render(page), pasted);
      await click(page, await pointOf(page, PARA, 'template', 3), { count: 2 });
      await pressCommand(page, 'Mod+x', 'cut');
      assert.ok(listPart(await render(page)).includes('styles of the. It will'), 'the cut does not take the word out');
      assert.equal(await undoLabel(page), 'Undo Cut');
      await undo(page);
      assert.equal(await render(page), pasted);
      await undo(page);
      await undo(page);
      await byteExact(page);
    });

    // text-lists-find-6: the paragraph that ends a list with a translate was drawn over the list
    test(`the paragraph that Return makes after a moved list is moved with it (${platform})`, async (t) => {
      const page = await load(t, platform);
      await caretAtEnd(page, 2);
      await press(page, 'Enter');
      await press(page, 'Enter');
      await type(page, 'After');
      const text = await render(page);
      assert.match(listPart(text), /<\/ul>\n {2}<p style="translate: 0px 20px">After<\/p>/, `the paragraph is not moved with the list: ${listPart(text)}`);
      const gap = await page.evaluate(`(() => {
      const s = document.querySelector('.reveal section.present');
      const ul = s.querySelector(':scope > ul');
      const p = [...s.querySelectorAll(':scope > p')].pop();
      return p.getBoundingClientRect().top - ul.getBoundingClientRect().bottom;
    })()`);
      assert.ok(gap >= 0, `the paragraph overlaps the list by ${-gap} px`);
      await roundTrip(page, 3);
    });

    // text-lists-find-8: Backspace at the start of the first item did nothing
    test(`Backspace at the start of the first item of a list takes its dash off, and a second joins it to the paragraph (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'Dark and light', 0, true));
      await press(page, 'Home');
      await press(page, 'Backspace');
      const text = listPart(await render(page));
      assert.match(text, /frameless\.<\/p>\n {2}<p class="fragment" data-fragment-index="1" style="translate: 0px 20px">Dark and light mode: [^<]*<code>for-dark<\/code> and <code>for-light<\/code>\.<\/p>\n {2}<ul style="translate: 0px 20px">\n {4}<li class="fragment" data-fragment-index="2">/, text);
      assert.equal(await undoLabel(page), 'Undo Remove Bullet');
      assert.deepEqual(await caretIn(page), { tag: 'p', text: 'Dark and light mode: export o', editing: true, active: 'p', collapsed: true });
      await roundTrip(page);
      await clickText(page, await pointOf(page, PARA, 'Dark and light', 0, true));
      await press(page, 'Home');
      await press(page, 'Backspace');
      assert.match(listPart(await render(page)), /frameless\.Dark and light mode/);
    });

    // plots-objects-outline-6: the menu of the paragraph style checked Body over a heading and a paragraph
    test(`the paragraph style menu checks no style over a heading and a paragraph selected as blocks (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, HEAD, 'Figures', 3));
      await press(page, 'Escape');
      await click(page, await pointOf(page, PARA, 'Export', 3), { modifiers: 'Shift' });
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 2);
      const checked = await page.evaluate(`['body', 'small', 'subheading', 'caption', 'footnote'].filter((s) => window.BeesonEditor.state('text.style.' + s).checked)`);
      assert.deepEqual(checked, []);
    });
  }
});

// tests of R20.4 on both platforms with trusted input: the bullet kinds of a list, i.e. the chevron
// of a ul, the ring of a ul.dots, and the dash of a ul.dashes, drawn by the theme in the show and
// in the print view, and written by Dots and Dashes of Format > Text and of the Text pane. after
// each edit of the file the text is checked byte for byte after an undo, the edit again after a
// redo, and after a save and an open
describe('the chevron, ring, and dash of lists', () => {
  const DECK = 'test/pages/editor-r20-4.html';
  const PLATFORMS = ['mac', 'other'];
  const KINDS = 0;
  const NESTED = 1;
  const APART = 2;
  const DASHES = 3;

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
  const settle = async (page) => {
    await page.evaluate('new Promise((d) => setTimeout(() => d(true), 120))');
    await frames(page);
  };
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  let saves = 0;

  // the editor on slide n of the deck, served over HTTP, with the storage of the origin emptied
  async function load(t, platform, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    page.platform = platform;
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the edit checked against base after an undo, again after a redo, and after a save and an open,
  // whose text becomes page.source
  async function roundTrip(page, base = page.source) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r20-4-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  // the shown element of selector with a text node of its own that holds needle, as an expression
  const find = (selector, needle) => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && [...el.childNodes].some((n) => n.nodeType === 3 && n.data.includes(${js(needle)})))`;
  const TEXT = '.reveal section.present li, .reveal section.present p';

  // the caret put after needle in the item or paragraph that holds it
  async function caretIn(page, needle) {
    await page.evaluate(`(() => {
    const el = ${find(TEXT, needle)};
    const n = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes(${js(needle)}));
    el.closest('[contenteditable="true"]').focus();
    getSelection().collapse(n, n.data.indexOf(${js(needle)}) + ${js(needle)}.length);
  })()`);
    await settle(page);
  }

  // the client point of the middle of the text needle
  const pointOf = (page, needle) => page.evaluate(`(() => {
  const el = ${find(TEXT, needle)};
  const n = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes(${js(needle)}));
  const r = document.createRange();
  r.setStart(n, n.data.indexOf(${js(needle)}));
  r.setEnd(n, n.data.indexOf(${js(needle)}) + ${js(needle)}.length);
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
})()`);

  // the box and the look of the ::before of each item of selector, in px, and whether its
  // background is the color of --accent, read from a probe in the first slide
  const marks = (page, selector) => page.evaluate(`(() => {
  const probe = document.createElement('div');
  probe.style.background = 'var(--accent)';
  document.querySelector('.reveal .slides section').append(probe);
  const accent = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return [...document.querySelectorAll(${js(selector)})].map((li) => {
    const s = getComputedStyle(li, '::before');
    const px = (v) => Math.round(parseFloat(v) * 100) / 100;
    return {
      text: [...li.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('').trim(),
      width: px(s.width), height: px(s.height), left: px(s.left), middle: px(parseFloat(s.top) + parseFloat(s.height) / 2),
      round: s.borderRadius, clip: s.clipPath, mask: s.maskImage || s.webkitMaskImage || 'none', content: s.content,
      accent: s.backgroundColor === accent, pad: getComputedStyle(li).paddingLeft,
      hollow: s.backgroundColor === 'rgba(0, 0, 0, 0)', ring: px(s.borderTopWidth), ringAccent: s.borderTopColor === accent,
      points: s.clipPath.split(',').length,
    };
  });
})()`);

  // checkMarks tests the marks of the items Alpha, Dot one, Dash one, and Inner arrow of the first
  // slide: a chevron, a hollow ring, a dash, and a chevron, each in --accent and centered on the
  // middle of the dash, with the text of each item at 54 px
  function checkMarks(all) {
    const by = Object.fromEntries(all.map((m) => [m.text, m]));
    const arrow = by.Alpha;
    assert.match(arrow.clip, /^polygon\(/, `the chevron is not a polygon: ${js(arrow)}`);
    assert.equal(arrow.points, 6, `the chevron does not have six points: ${js(arrow)}`);
    assert.ok(arrow.width > 0 && arrow.height > 0 && arrow.left + arrow.width <= 28, `the chevron is not inside the place of the dash: ${js(arrow)}`);
    const dot = by['Dot one'];
    assert.ok(dot.width === dot.height && dot.width >= 8 && dot.width <= 16 && dot.round === '50%' && dot.clip === 'none', `the dot is not round: ${js(dot)}`);
    assert.ok(dot.hollow && dot.ringAccent && dot.ring >= 2 && dot.ring <= 3, `the dot is not a hollow ring in --accent: ${js(dot)}`);
    const dash = by['Dash one'];
    assert.deepEqual([dash.width, dash.height, dash.clip, dash.round], [28, 2, 'none', '0px'], `the dash changed: ${js(dash)}`);
    const inner = by['Inner arrow'];
    assert.match(inner.clip, /^polygon\(/, `a plain list in a dash list does not keep the chevron: ${js(inner)}`);
    for (const m of [arrow, dot, dash, inner]) {
      assert.equal(m.content, '""', `the mark of ${m.text} is a glyph`);
      assert.equal(m.mask, 'none', `the mark of ${m.text} has a mask`);
      assert.ok(m === dot ? m.ringAccent : m.accent, `the mark of ${m.text} is not in --accent`);
      assert.equal(m.pad, '54px', `the text of ${m.text} moved`);
    }
    for (const m of [arrow, dot]) assert.ok(Math.abs(m.middle - dash.middle) < 0.75, `the mark of ${m.text} is not centered on the dash: ${m.middle} and ${dash.middle}`);
  }

  test('the theme draws a chevron, a ring, and a dash in --accent in both modes, in the show and in the print view', async (t) => {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    for (const [query, items] of [['still', '.reveal .slides section li'], ['print-pdf&still', '.pdf-page li']]) {
      if (query === 'still') {
        await page.goto(deckUrl(DECK, query));
        await page.waitFor(deckSettled);
      } else await printView(page, deckUrl(DECK, query));
      for (const mode of ['dark', 'light']) {
        await page.evaluate(`document.documentElement.dataset.theme = ${js(mode)}; true`);
        await frames(page);
        checkMarks((await marks(page, items)).slice(0, 6));
      }
    }
  });

  test('dots and dashes are classes of the theme in the scope rule', () => {
    const theme = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
    for (const c of ['dots', 'dashes']) assert.ok(theme.has(c), c);
    assert.deepEqual(editProblems('ul', [], { classes: { dots: true } }, theme), []);
    assert.deepEqual(editProblems('ul', [], { classes: { dashes: true } }, theme), []);
  });

  const LIST_IDS = ['text.list.none', 'text.list.ul', 'text.list.dots', 'text.list.dashes', 'text.list.ol'];
  const checked = async (page) => {
    const out = [];
    for (const id of LIST_IDS) if ((await state(page, id)).checked) out.push(id.slice(10));
    return out;
  };

  for (const platform of PLATFORMS) {
    test(`Dashes and Dots set the kind of the list of the caret on its start tag alone, as one entry List Style (${platform})`, async (t) => {
      const page = await load(t, platform, KINDS);
      await caretIn(page, 'Bravo');
      assert.deepEqual(await checked(page), ['ul']);
      await exec(page, 'text.list.dashes');
      await settle(page);
      assert.equal(await render(page), page.source.replace('<ul>\n    <li>Alpha', '<ul class="dashes">\n    <li>Alpha'));
      assert.equal(await undoLabel(page), 'Undo List Style');
      assert.deepEqual(await checked(page), ['dashes'], 'Arrows is checked on a dash list');
      assert.equal(await page.evaluate('getSelection().anchorNode.parentElement.textContent'), 'Bravo', 'the caret left the item');
      await roundTrip(page);
      await caretIn(page, 'Bravo');
      await exec(page, 'text.list.dots');
      await settle(page);
      assert.ok((await render(page)).includes('<ul class="dots">\n    <li>Alpha'));
      assert.deepEqual(await checked(page), ['dots']);
      await roundTrip(page);
    });

    test(`Dots makes a paragraph a dot list of one item, and Dashes retags a numbered list without its start (${platform})`, async (t) => {
      const page = await load(t, platform, KINDS);
      await caretIn(page, 'A lone paragraph');
      assert.deepEqual(await checked(page), ['none']);
      await exec(page, 'text.list.dots');
      await settle(page);
      assert.equal(await render(page), page.source.replace('<p>A lone paragraph</p>', '<ul class="dots">\n    <li>A lone paragraph</li>\n  </ul>'));
      assert.equal(await undoLabel(page), 'Undo List Style');
      await roundTrip(page);
      await caretIn(page, 'Four');
      await exec(page, 'text.list.dashes');
      await settle(page);
      assert.equal(await render(page), page.source.replace('<ol start="4">\n    <li>Four</li>\n  </ol>', '<ul class="dashes">\n    <li>Four</li>\n  </ul>'));
      await roundTrip(page);
    });

    test(`Numbers on a dash list takes the class off, and Arrows takes the class attribute off (${platform})`, async (t) => {
      const page = await load(t, platform, KINDS);
      const list = '<ul class="dashes">\n    <li>Dash one\n      <ul>\n        <li>Inner arrow</li>\n      </ul>\n    </li>\n    <li>Dash two</li>\n  </ul>';
      assert.ok(page.source.includes(list));
      await caretIn(page, 'Dash two');
      assert.deepEqual(await checked(page), ['dashes']);
      await exec(page, 'text.list.ol');
      await settle(page);
      assert.equal(await render(page), page.source.replace(list, list.replace('<ul class="dashes">', '<ol>').replace(/<\/ul>$/, '</ol>')));
      await roundTrip(page);
      await undo(page);
      await caretIn(page, 'Dash two');
      await exec(page, 'text.list.ul');
      await settle(page);
      assert.equal(await render(page), readFileSync(DECK, 'utf8').replace(list, list.replace('<ul class="dashes">', '<ul>')));
      assert.deepEqual(await checked(page), ['ul']);
    });

    test(`Dots with the caret at the second level changes only the nested list (${platform})`, async (t) => {
      const page = await load(t, platform, KINDS);
      await caretIn(page, 'Inner arrow');
      assert.deepEqual(await checked(page), ['ul']);
      await exec(page, 'text.list.dots');
      await settle(page);
      assert.equal(await render(page), page.source.replace('<ul>\n        <li>Inner arrow', '<ul class="dots">\n        <li>Inner arrow'));
      assert.deepEqual(await checked(page), ['dots']);
      await roundTrip(page);
    });

    test(`Tab in a dash list writes a nested dash list, and Shift+Tab with followers keeps the class on their list (${platform})`, async (t) => {
      const page = await load(t, platform, DASHES);
      const part = (text) => text.slice(text.indexOf('<li>One'), text.indexOf('</section>', text.indexOf('<li>One')));
      await caretIn(page, 'Two');
      await press(page, 'Tab');
      await settle(page);
      const one = await render(page);
      assert.match(part(one), /^<li>One\s*<ul class="dashes">\s*<li>Two<\/li>\s*<\/ul>\s*<\/li>/, `Tab does not write a nested dash list: ${part(one)}`);
      await roundTrip(page);
      await caretIn(page, 'Three');
      await press(page, 'Tab');
      await settle(page);
      const both = await render(page);
      assert.match(part(both), /^<li>One\s*<ul class="dashes">\s*<li>Two<\/li>\s*<li>Three<\/li>\s*<\/ul>\s*<\/li>/, `Tab does not join the nested list: ${part(both)}`);
      await roundTrip(page);
      // Shift+Tab on Two, whose follower Three goes into a list at the end of Two
      await caretIn(page, 'Two');
      await press(page, 'Shift+Tab');
      await settle(page);
      const out = await render(page);
      assert.match(part(out), /<\/li>\s*<li>Two\s*<ul class="dashes">\s*<li>Three<\/li>\s*<\/ul>\s*<\/li>/, `the followers lost the kind: ${part(out)}`);
      await roundTrip(page);
    });

    test(`Dashes on a list selected as an object sets its nested plain lists and keeps a nested numbered list (${platform})`, async (t) => {
      const page = await load(t, platform, NESTED);
      await clickText(page, await pointOf(page, 'Top two'));
      await press(page, 'Escape');
      await settle(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['ul']);
      await exec(page, 'text.list.dashes');
      await settle(page);
      const want = page.source
        .replace('<ul>\n    <li>Top one', '<ul class="dashes">\n    <li>Top one')
        .replace('<ul>\n        <li>Sub arrow', '<ul class="dashes">\n        <li>Sub arrow');
      assert.equal(await render(page), want);
      assert.equal(await undoLabel(page), 'Undo List Style');
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName + "." + el.className)'), ['ul.dashes'], 'the list is not selected again');
      assert.equal((await state(page, 'text.list.dashes')).checked, true);
      await roundTrip(page);
      // Arrows takes the class off at both levels
      await clickText(page, await pointOf(page, 'Top two'));
      await press(page, 'Escape');
      await settle(page);
      await exec(page, 'text.list.ul');
      await settle(page);
      assert.equal(await render(page), readFileSync(DECK, 'utf8'));
    });

    test(`a plain list and a dash list are not joined after the paragraph between them is deleted (${platform})`, async (t) => {
      const page = await load(t, platform, APART);
      await caretIn(page, 'Dash item');
      await exec(page, 'text.list.dashes');
      await settle(page);
      assert.equal(await render(page), page.source.replace('<ul>\n    <li>Dash item', '<ul class="dashes">\n    <li>Dash item'));
      await roundTrip(page);
      await caretIn(page, 'Between');
      await press(page, 'Escape');
      await settle(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['p']);
      await press(page, 'Delete');
      await settle(page);
      assert.equal(await render(page), page.source.replace('  <p>Between</p>\n', ''));
      await roundTrip(page);
    });

    test(`the Text pane chooses the kind of text and the bullet in two selectors, and the bullets are drawn large (${platform})`, async (t) => {
      const page = await load(t, platform, KINDS);
      // the Text pane of the item of the caret
      const textPane = async () => {
        if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
        await page.waitFor(`!!document.querySelector('.beeson-edit-inspector .ed-tabs button')`);
        const tab = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === 'Text'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await click(page, tab);
        await settle(page);
      };
      await caretIn(page, 'Bravo');
      await textPane();
      // the buttons of the selector of aria-label, with their words, state, and the size of their mark
      const selector = (label) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-inspector [role="group"][aria-label="${label}"] button')].map((b) => {
      const r = b.getBoundingClientRect();
      const mark = b.querySelector('svg')?.getBoundingClientRect();
      return { id: b.dataset.command, text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), disabled: b.disabled, title: b.title, mark: mark ? Math.round(mark.width) : 0, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })`);
      const kinds = await selector('List');
      assert.deepEqual(kinds.map((s) => s.text), ['Paragraphs', 'Bullets', 'Numbers']);
      assert.deepEqual(kinds.map((s) => s.pressed), ['false', 'true', 'false']);
      let bullets = await selector('Bullet');
      assert.deepEqual(bullets.map((s) => s.text), ['Arrows', 'Dots', 'Dashes']);
      assert.deepEqual(bullets.map((s) => s.id), ['text.list.ul', 'text.list.dots', 'text.list.dashes']);
      assert.deepEqual(bullets.map((s) => s.pressed), ['true', 'false', 'false']);
      // each bullet is drawn at 20 px beside its name, and every target is at least 24 px high
      assert.ok(bullets.every((s) => s.mark >= 20 && !s.disabled), `a bullet is not drawn large: ${js(bullets)}`);
      assert.ok([...kinds, ...bullets].every((s) => s.height >= 24), `a target is less than 24 px high: ${js([...kinds, ...bullets])}`);
      await click(page, bullets[2]);
      await settle(page);
      assert.equal(await render(page), page.source.replace('<ul>\n    <li>Alpha', '<ul class="dashes">\n    <li>Alpha'));
      assert.equal(await undoLabel(page), 'Undo List Style');
      assert.deepEqual((await selector('List')).map((s) => s.pressed), ['false', 'true', 'false']);
      assert.deepEqual((await selector('Bullet')).map((s) => s.pressed), ['false', 'false', 'true']);
      assert.ok(await page.evaluate(`!!getSelection().anchorNode?.parentElement?.closest('li')`), 'the caret left the text');
      // Bullets keeps the dashes of the list
      const dashed = await render(page);
      await click(page, (await selector('List'))[1]);
      await settle(page);
      assert.equal(await render(page), dashed);
      // Numbers dims the bullets, and Bullets on the numbered list sets the default bullet, Arrows
      await click(page, (await selector('List'))[2]);
      await settle(page);
      bullets = await selector('Bullet');
      assert.ok(bullets.every((s) => s.disabled && / only /.test(s.title)), `the bullets are not dimmed with a reason on a numbered list: ${js(bullets)}`);
      const numbered = await render(page);
      assert.equal(numbered, page.source.replace('<ul>\n    <li>Alpha', '<ol>\n    <li>Alpha').replace('<li>Bravo</li>\n  </ul>', '<li>Bravo</li>\n  </ol>'));
      await click(page, (await selector('List'))[1]);
      await settle(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual((await selector('Bullet')).map((s) => s.pressed), ['true', 'false', 'false']);
      await click(page, (await selector('List'))[0]);
      await settle(page);
      await roundTrip(page);
      assert.deepEqual(errors(page), []);
    });

    test(`Bullets on a dot list and a dash list selected together keeps the bullet of each (${platform})`, async (t) => {
      const page = await load(t, platform, KINDS);
      await clickText(page, await pointOf(page, 'Dot one'));
      await press(page, 'Escape');
      await click(page, await pointOf(page, 'Dash one'), { modifiers: 'Shift' });
      await settle(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.className)'), ['dots', 'dashes']);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      const bullets = `[...document.querySelectorAll('.beeson-edit-inspector [role="group"][aria-label="List"] button')].find((b) => b.textContent.trim() === 'Bullets')`;
      await page.waitFor(`${bullets}?.getAttribute('aria-pressed') === 'true'`);
      await click(page, await page.evaluate(`(() => { const r = ${bullets}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
      await settle(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`Format > Text lists Dots and Dashes between Arrows and Numbers, disabled in the notes, and Dashes in a new text box is written once its text is typed (${platform})`, async (t) => {
      const page = await load(t, platform, KINDS);
      await caretIn(page, 'Bravo');
      const text = await page.evaluate(`(() => {
      const E = window.BeesonEditor;
      const walk = (items) => items.flatMap((i) => i.rule ? [] : i.command ? [E.state(i.command).label] : walk(typeof i.items === 'function' ? i.items() : i.items));
      const format = window.BeesonEditorShell.menuItems('Format');
      const items = format.find((i) => i.label === 'Text').items;
      return walk(typeof items === 'function' ? items() : items);
    })()`);
      const at = text.indexOf('Arrows');
      assert.deepEqual(text.slice(at - 1, at + 4), ['Paragraphs', 'Arrows', 'Dots', 'Dashes', 'Numbers']);
      for (const id of ['text.list.dots', 'text.list.dashes']) assert.equal((await state(page, id)).enabled, true, `${id} is dimmed in a list`);
      // the notes take only arrows
      if (!(await state(page, 'view.notes')).checked) await exec(page, 'view.notes');
      await frames(page);
      await clickText(page, '.reveal section.present > aside.notes');
      await settle(page);
      assert.equal((await state(page, 'text.list.ul')).enabled, true, 'the caret is not in the notes');
      for (const id of ['text.list.dots', 'text.list.dashes']) assert.equal((await state(page, id)).enabled, false, `${id} is enabled in the notes`);
      await exec(page, 'view.notes');
      await frames(page);
      // a new text box on the last slide
      await page.evaluate(`Reveal.slide(${DASHES})`);
      await frames(page);
      await exec(page, 'insert.text');
      await frames(page);
      await exec(page, 'text.list.dashes');
      assert.equal((await state(page, 'text.list.dashes')).checked, true);
      assert.equal((await state(page, 'text.list.ul')).checked, false);
      await type(page, 'Item');
      await settle(page);
      assert.match(await render(page), /<ul class="dashes"(?: style="[^"]*")?>\s*<li>Item<\/li>\s*<\/ul>/, `the new text is not a dash list: ${(await render(page)).match(/[^\n]*\n[^\n]*Item[^\n]*\n?[^\n]*/)?.[0]}`);
    });
  }
});

// regression tests of R32.2 on both platforms: a list made of a moved paragraph is moved as a whole,
// i.e. the translate and the width of the paragraph go on its ol or ul, and its items are written
// without them, also after Enter. the laptop test of round 10 saved a numbered list of twelve items
// typed into a new text box with style="translate: 0px 24px" on each item
describe('a moved list kept whole', () => {
  const PLATFORMS = ['mac', 'other'];
  const SLIDE = '.reveal .slides > section.present';
  const PANEL = '#beeson-edit-panel-format';
  const DECK = 'test-deck.html';
  const MOVED = 'test/pages/editor-r32-2.html';

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
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);

  // the editor on slide n of a deck, by default the demo deck, served over HTTP, with the storage of
  // the origin emptied
  async function load(t, platform, n, deck = DECK) {
    const source = readFileSync(deck, 'utf8');
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${deck}?edit&still&edit-platform=${platform}`;
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

  // the boxes in slide px of the elements of the current slide that are drawn, by selector, keyed by
  // their tag and first words, those of its first item for a list, rounded to 0.1 px
  const boxes = (page, selector) => page.evaluate(`(() => {
  const slides = document.querySelector('.reveal .slides');
  const s = slides.getBoundingClientRect();
  const k = s.width / slides.offsetWidth;
  const r1 = (v) => Math.round(v * 10) / 10;
  const out = {};
  for (const el of document.querySelectorAll(${js(selector)})) {
    const r = el.getBoundingClientRect();
    if (!r.width || el.closest('[data-generated], .beeson-pending')) continue;
    const words = el.matches('ul, ol') ? el.querySelector('li')?.textContent ?? '' : el.textContent;
    out[el.localName + ' ' + words.trim().slice(0, 24)] = { left: r1((r.left - s.left) / k), top: r1((r.top - s.top) / k), width: r1(r.width / k) };
  }
  return out;
})()`);

  // asserts that a list is drawn at the place of the paragraph that it is made of, i.e. with its left
  // edge and its width, and with its top edge moved only by the margins of a list of the theme, which
  // differ from those of a paragraph by 10 px
  function samePlace(list, p, what) {
    assert.ok(list, `${what} is not drawn`);
    assert.deepEqual([list.left, list.width], [p.left, p.width], `${what} is not drawn at the left edge and with the width of the paragraph`);
    assert.ok(Math.abs(list.top - p.top) <= 10, `${what} is drawn ${list.top - p.top} px under the paragraph`);
  }

  // the lines of the rendered file that are not lines of the source
  const added = (page, text) => {
    const old = new Set(page.source.split('\n'));
    return text.split('\n').filter((l) => !old.has(l));
  };

  // a new text box of the Text button on the current slide, with words typed into it
  async function newBox(page, words) {
    await click(page, '.beeson-edit-top [data-command="insert.text"]');
    await sleep(300);
    await type(page, words);
    await sleep(250);
  }

  // the start tag of the new box, a p with the translate and the width of its place
  async function boxTag(page) {
    const tags = added(page, await render(page)).filter((l) => l.includes('<p'));
    assert.equal(tags.length, 1, `the new box is not one paragraph: ${tags.join(' | ')}`);
    const tag = /<p[^>]*>/.exec(tags[0])[0];
    assert.match(tag, /^<p style="width: \d+px; translate: -?\d+px -?\d+px">$/, 'the new box is not written with a width and a translate');
    return tag;
  }

  // the lines of the rendered list of words, i.e. its start tag, its items, and its end tag
  const listLines = (text, words) => {
    const lines = text.split('\n');
    const first = lines.findIndex((l) => l.includes(`>${words}`));
    let start = first;
    while (start > 0 && !/<(ol|ul)\b/.test(lines[start])) start--;
    let end = first;
    while (end < lines.length - 1 && !/<\/(ol|ul)>/.test(lines[end])) end++;
    return lines.slice(start, end + 1).map((l) => l.trim());
  };

  // items 1, 2, and 3 of the observation: the tester's flow, i.e. a new text box made a numbered list
  // with Numbers of the Text pane, twelve items typed with Enter, and the last item emptied with
  // Backspace. the list takes the place of the box, and its items are written without it
  for (const platform of PLATFORMS) {
    test(`1: a new text box made a numbered list of twelve items by the Text pane is moved as a list, and its items are written without a translate (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      const others = await boxes(page, `${SLIDE} > *`);
      await newBox(page, 'item 1');
      const tag = await boxTag(page);
      const style = /style="([^"]*)"/.exec(tag)[1];
      const placed = (await boxes(page, `${SLIDE} > p`))['p item 1'];
      const typed = await render(page);
      await click(page, `${PANEL} [data-command="text.list.ol"]`);
      await frames(page);
      const listed = await render(page);
      assert.deepEqual(listLines(listed, 'item 1'), [`<ol style="${style}">`, '<li>item 1</li>', '</ol>'], 'the list does not take the place of the box');
      // the list is drawn where the box was, and the other elements of the slide keep their places
      const list = (await boxes(page, `${SLIDE} > ol`))['ol item 1'];
      samePlace(list, placed, 'the list');
      const kept = await boxes(page, `${SLIDE} > *`);
      for (const [k, v] of Object.entries(others)) assert.deepEqual(kept[k], v, `${k} is moved`);
      const headingBefore = await boxes(page, `${SLIDE} > h2`);
      // one undo gives the box back byte for byte, and a redo the list
      assert.equal((await state(page, 'edit.undo')).label, 'Undo List Style');
      await undo(page);
      await frames(page);
      assert.equal(await render(page), typed, 'the undo does not give the box back');
      await redo(page);
      await frames(page);
      assert.equal(await render(page), listed, 'the redo does not give the list back');
      // the caret is put back into the item for the typing that goes on
      await page.evaluate(`(() => { const li = document.querySelector(${js(`${SLIDE} > ol > li`)}); li.closest('[contenteditable="true"]')?.focus(); getSelection().collapse(li.firstChild, li.firstChild.data.length); })()`);
      for (let i = 2; i <= 12; i++) {
        await press(page, 'Enter');
        await type(page, `item ${i}`);
      }
      for (let i = 0; i < 'item 12'.length; i++) await press(page, 'Backspace');
      await sleep(300);
      const typedOut = await render(page);
      // the list keeps its left edge and its width, and its top edge moves with the heading of the
      // slide, whose column is centered by the theme
      const heading = await boxes(page, `${SLIDE} > h2`);
      const items = Array.from({ length: 11 }, (_, i) => `<li>item ${i + 1}</li>`);
      assert.deepEqual(listLines(typedOut, 'item 1'), [`<ol style="${style}">`, ...items, '<li></li>', '</ol>'], 'an item is written with a translate');
      const shift = Object.values(heading)[0].top - Object.values(headingBefore)[0].top;
      assert.deepEqual((await boxes(page, `${SLIDE} > ol`))['ol item 1'], { ...list, top: Math.round((list.top + shift) * 10) / 10 }, 'the list is moved by Enter');
      const { text } = await saveAndReopen(page, `r32-2-1-${platform}.html`);
      assert.equal(text, typedOut);
      assert.deepEqual(errors(page), []);
    });
  }

  // the same with Numbers of the Format menu chosen before the first key, as a typing style, and with
  // Paragraphs of the Format menu, after which the box is written with its start tag again
  for (const platform of PLATFORMS) {
    test(`1: Numbers chosen in a new text box before the first key makes a list moved as a whole, and Paragraphs gives the box back (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(300);
      await exec(page, 'text.list.ol');
      await type(page, 'first');
      await sleep(250);
      await press(page, 'Enter');
      await type(page, 'second');
      await sleep(250);
      const text = await render(page);
      const lines = listLines(text, 'first');
      assert.match(lines[0], /^<ol style="width: \d+px; translate: -?\d+px -?\d+px">$/, 'the list is not moved as a whole');
      assert.deepEqual(lines.slice(1), ['<li>first</li>', '<li>second</li>', '</ol>'], 'an item is written with a translate');
      const style = /style="([^"]*)"/.exec(lines[0])[1];
      // Paragraphs on the list selected as a block gives each item the place of the list
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((e) => e.localName)'), ['ol']);
      await exec(page, 'text.list.none');
      await frames(page);
      const paragraphs = added(page, await render(page)).map((l) => l.trim());
      assert.deepEqual(paragraphs, [`<p style="${style}">first</p>`, `<p style="${style}">second</p>`], 'the paragraphs do not get the place of the list');
      await undo(page);
      await frames(page);
      assert.equal(await render(page), text, 'the undo does not give the list back');
      assert.deepEqual(errors(page), []);
    });
  }

  // item 1 of the observation: a text box selected as a block and made a list, and made a paragraph
  // again, is written with the bytes of the box
  for (const platform of PLATFORMS) {
    test(`1: a text box selected as a block, made a list and a paragraph again, is written byte for byte (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await newBox(page, 'moved words');
      const tag = await boxTag(page);
      const typed = await render(page);
      const placed = (await boxes(page, `${SLIDE} > p`))['p moved words'];
      await press(page, 'Escape');
      await frames(page);
      await exec(page, 'text.list.ul');
      await frames(page);
      const style = /style="([^"]*)"/.exec(tag)[1];
      assert.deepEqual(listLines(await render(page), 'moved words'), [`<ul style="${style}">`, '<li>moved words</li>', '</ul>']);
      samePlace((await boxes(page, `${SLIDE} > ul`))['ul moved words'], placed, 'the list');
      await exec(page, 'text.list.none');
      await frames(page);
      assert.equal(await render(page), typed, 'the paragraph is not written with the bytes of the box');
      assert.deepEqual(errors(page), []);
    });
  }

  // a paragraph with a translate in the file, made a list at the caret, and an item of a moved list
  // made a paragraph at the caret, which takes the translate of the list
  for (const platform of PLATFORMS) {
    test(`1: a paragraph with a translate in the file made a list at the caret gives its translate to the list, and an item made a paragraph takes it back (${platform})`, async (t) => {
      const page = await load(t, platform, 0, MOVED);
      const placed = (await boxes(page, `${SLIDE} > p`))['p A moved paragraph of wor'];
      const others = await boxes(page, `${SLIDE} > *`);
      await clickText(page, await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(`${SLIDE} > p`)})].find((p) => p.textContent.startsWith('A moved')).getBoundingClientRect(); return { x: r.right - 20, y: r.top + r.height / 2 }; })()`));
      await frames(page);
      await press(page, 'End');
      await exec(page, 'text.list.ol');
      await frames(page);
      const listed = await render(page);
      assert.deepEqual(listLines(listed, 'A moved paragraph of words.'), ['<ol style="translate: 0px 24px">', '<li>A moved paragraph of words.</li>', '</ol>']);
      const list = (await boxes(page, `${SLIDE} > ol`))['ol A moved paragraph of wor'];
      samePlace(list, placed, 'the list');
      // the paragraph after the list follows it by the margins of a list of the theme, and the
      // elements before it keep their places
      const kept = await boxes(page, `${SLIDE} > *`);
      for (const [k, v] of Object.entries(others)) {
        if (k.startsWith('p A moved')) continue;
        if (k.startsWith('p More words')) samePlace(kept[k], v, k);
        else assert.deepEqual(kept[k], v, `${k} is moved`);
      }
      await press(page, 'Enter');
      await type(page, 'Second');
      await sleep(250);
      assert.deepEqual(listLines(await render(page), 'A moved paragraph of words.'), ['<ol style="translate: 0px 24px">', '<li>A moved paragraph of words.</li>', '<li>Second</li>', '</ol>'], 'the new item is written with a translate');
      const second = (await boxes(page, `${SLIDE} li`))['li Second'];
      // Paragraphs at the caret in the second item takes it off the list, with the translate of the list
      await exec(page, 'text.list.none');
      await frames(page);
      const out = await render(page);
      assert.ok(out.includes('<p style="translate: 0px 24px">Second</p>'), 'the paragraph does not take the translate of the list');
      assert.equal((await boxes(page, `${SLIDE} > p`))['p Second'].top, second.top, 'the paragraph is not drawn at the height of the item');
      const { text } = await saveAndReopen(page, `r32-2-4-${platform}.html`);
      assert.equal(text, out);
      assert.deepEqual(errors(page), []);
    });
  }

  // item 3: a list whose items have a translate in the file is opened as it is, and Enter in it moves
  // the translate of its items to the list, where every item keeps its place
  for (const platform of PLATFORMS) {
    test(`3: items with a translate in the file are kept until the list is edited, and Enter writes it on the list (${platform})`, async (t) => {
      const page = await load(t, platform, 1, MOVED);
      assert.equal(await render(page), page.source, 'the list is changed by the open');
      const placed = await boxes(page, `${SLIDE} li`);
      await clickText(page, await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(`${SLIDE} li`)})].find((li) => li.textContent === 'Beta').getBoundingClientRect(); return { x: r.right - 10, y: r.top + r.height / 2 }; })()`));
      await frames(page);
      await press(page, 'End');
      await press(page, 'Enter');
      await type(page, 'Gamma');
      await sleep(250);
      const out = await render(page);
      assert.deepEqual(listLines(out, 'Alpha'), ['<ol style="translate: 0px 24px">', '<li>Alpha</li>', '<li>Beta</li>', '<li>Gamma</li>', '</ol>']);
      const now = await boxes(page, `${SLIDE} li`);
      for (const k of ['li Alpha', 'li Beta']) assert.deepEqual(now[k], placed[k], `${k} is moved`);
      assert.equal(now['li Gamma'].left, placed['li Beta'].left, 'the new item is not under the item before it');
      // the undo of the typing and of Enter gives the file back byte for byte, and the redo the list
      await undo(page);
      await undo(page);
      await frames(page);
      assert.equal(await render(page), page.source, 'the undo does not give the items their translate back');
      await redo(page);
      await redo(page);
      await frames(page);
      assert.equal(await render(page), out, 'the redo does not give the list back');
      const { text } = await saveAndReopen(page, `r32-2-5-${platform}.html`);
      assert.equal(text, out);
      assert.deepEqual(errors(page), []);
    });
  }

  // item 2: the moved list of slide 5 selected as a block and made paragraphs gives each paragraph
  // its translate, and the paragraphs are one text, which Dashes over all of them makes the list
  // again, byte for byte
  for (const platform of PLATFORMS) {
    test(`2: a moved list made paragraphs gives each its translate, and Dashes over them gives the list back byte for byte (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      const tops = Object.values(await boxes(page, `${SLIDE} li`)).map((b) => b.top);
      await clickText(page, await page.evaluate(`(() => { const r = document.querySelector(${js(`${SLIDE} ul > li`)}).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; })()`));
      await frames(page);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((e) => e.localName)'), ['ul']);
      await exec(page, 'text.list.none');
      await frames(page);
      const paragraphs = added(page, await render(page)).map((l) => l.trim());
      assert.equal(paragraphs.length, 3);
      for (const p of paragraphs) assert.match(p, /^<p class="fragment" data-fragment-index="\d" style="translate: 0px 20px">/, 'a paragraph does not take the translate of the list');
      // the first paragraph is drawn where the first item was, and the others under it by the gap of
      // the theme between two paragraphs, which is wider than that between two items
      const now = Object.values(await boxes(page, `${SLIDE} > p.fragment`)).map((b) => b.top);
      assert.equal(now[0], tops[0], 'the first paragraph is not drawn where the first item was');
      await clickText(page, await page.evaluate(`(() => { const r = document.querySelector(${js(`${SLIDE} > p.fragment`)}).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; })()`));
      await frames(page);
      await press(page, 'Mod+A');
      await exec(page, 'text.list.ul');
      await frames(page);
      assert.equal(await render(page), page.source, 'Dashes does not give the list back');
      assert.deepEqual(errors(page), []);
    });
  }

  // puts the caret at the start of the item of the current slide whose text starts with words
  const caretAtStart = (page, words) => page.evaluate(`(() => {
  const li = [...document.querySelectorAll(${js(`${SLIDE} li`)})].find((el) => el.textContent.startsWith(${js(words)}));
  li.closest('[contenteditable="true"]')?.focus();
  getSelection().collapse(li.firstChild, 0);
  return true;
})()`);

  // item 2, the repair: Backspace at the start of the first item of a text box made a list takes the
  // dash off, and the paragraph gets the place of the list back. a list of one item is thus written
  // with the bytes of the box, and the first of two items is written before the list with its place
  for (const platform of PLATFORMS) {
    test(`2: Backspace at the start of the first item of a text box made a list gives the paragraph the place of the list (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await newBox(page, 'alpha');
      const style = /style="([^"]*)"/.exec(await boxTag(page))[1];
      const typed = await render(page);
      const placed = (await boxes(page, `${SLIDE} > p`))['p alpha'];
      await click(page, `${PANEL} [data-command="text.list.ol"]`);
      await frames(page);
      const listed = await render(page);
      await caretAtStart(page, 'alpha');
      await press(page, 'Backspace');
      await sleep(250);
      const back = await render(page);
      assert.deepEqual(added(page, back).map((l) => l.trim()), [`<p style="${style}">alpha</p>`], 'the paragraph does not take the place of the list');
      assert.equal(back, typed, 'the paragraph is not written with the bytes of the box');
      assert.deepEqual((await boxes(page, `${SLIDE} > p`))['p alpha'], placed, 'the paragraph is not drawn where the box was');
      await undo(page);
      await frames(page);
      assert.equal(await render(page), listed, 'the undo does not give the list back');
      await redo(page);
      await frames(page);
      assert.equal(await render(page), typed, 'the redo does not give the box back');
      // with two items, the first is written before the list, with the place of the list
      await undo(page);
      await frames(page);
      await caretAtStart(page, 'alpha');
      await press(page, 'End');
      await press(page, 'Enter');
      await type(page, 'beta');
      await sleep(250);
      const list = (await boxes(page, `${SLIDE} > ol`))['ol alpha'];
      await caretAtStart(page, 'alpha');
      await press(page, 'Backspace');
      await sleep(250);
      const out = await render(page);
      assert.deepEqual(added(page, out).map((l) => l.trim()), [`<p style="${style}">alpha</p>`, `<ol style="${style}">`, '<li>beta</li>', '</ol>'], 'the paragraph does not take the place of the list');
      samePlace((await boxes(page, `${SLIDE} > p`))['p alpha'], list, 'the paragraph');
      const { text } = await saveAndReopen(page, `r32-2-6-${platform}.html`);
      assert.equal(text, out);
      assert.deepEqual(errors(page), []);
    });
  }

  // item 2, the repair: Enter on the empty last item of a text box made a list ends the list with a
  // paragraph that takes the width of the list together with its translate
  for (const platform of PLATFORMS) {
    test(`2: Enter on the empty last item of a text box made a list writes the paragraph with the width and the translate of the list (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await newBox(page, 'alpha');
      const style = /style="([^"]*)"/.exec(await boxTag(page))[1];
      await click(page, `${PANEL} [data-command="text.list.ol"]`);
      await frames(page);
      await caretAtStart(page, 'alpha');
      await press(page, 'End');
      await press(page, 'Enter');
      await type(page, 'beta');
      await press(page, 'Enter');
      await sleep(150);
      await press(page, 'Enter');
      await type(page, 'gamma');
      await sleep(250);
      const out = await render(page);
      assert.deepEqual(added(page, out).map((l) => l.trim()), [`<ol style="${style}">`, '<li>alpha</li>', '<li>beta</li>', '</ol>', `<p style="${style}">gamma</p>`], 'the paragraph does not take the place of the list');
      const drawn = await boxes(page, `${SLIDE} > *`);
      assert.deepEqual([drawn['p gamma'].left, drawn['p gamma'].width], [drawn['ol alpha'].left, drawn['ol alpha'].width], 'the paragraph is not drawn at the left edge and with the width of the list');
      const { text } = await saveAndReopen(page, `r32-2-7-${platform}.html`);
      assert.equal(text, out);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R15.4 on both platforms with trusted input: a value under 1 refused by the
// field Start at, the start of a list cut off by Return kept in step with the count of the list
// before it, and a paste of several lines with blank lines into a list item. after each edit the
// text is checked byte for byte after an undo, the edit again after a redo, and after a save and
// an open
describe('Start at and starts of cut lists', () => {
  const LISTS = 'test/pages/editor-r13-3.html';
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
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  let saves = 0;

  // the editor on slide n of deck, served over HTTP, with the storage of the origin emptied
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

  // the edit checked against base after a number of undos, again after as many redos, and after a
  // save and an open
  async function roundTrip(page, base, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    for (let i = 0; i < undos; i++) await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r15-4-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  const find = (selector, needle = '') => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;
  const ITEM = '.reveal section.present ol > li, .reveal section.present ul > li';

  // the client point of the middle of the text needle in an item of the current slide
  const pointOf = (page, needle) => page.evaluate(`(() => {
  const el = ${find(ITEM, needle)};
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + ${js(needle)}.length);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }
})()`);

  // the caret put at the end, or with end false at the start, of the item that holds needle
  const caretIn = (page, needle, end = true) => page.evaluate(`(() => {
  const li = ${find(ITEM, needle)};
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) texts.push(n);
  li.closest('[contenteditable="true"]').focus();
  const n = ${end} ? texts.at(-1) : texts[0];
  getSelection().collapse(n, ${end} ? n.length : 0);
})()`);

  // the start of each numbered list of the current slide, as the page has it
  const starts = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present > ol')].map((ol) => ol.start)`);

  // the tab of the inspector named name shown, with the Format pane open
  async function showTab(page, name) {
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === ${js(name)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (at) await click(page, at);
    await frames(page);
  }

  const START = '.beeson-edit-inspector input[name="Start at"]';
  const field = (page) => page.evaluate(`document.querySelector(${js(START)}).value`);

  // value typed over the text of the field Start at, and Return
  async function typeStart(page, value) {
    await click(page, START, { count: 3 });
    await type(page, value);
    await press(page, 'Enter');
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    // D33: a 0 typed into Start at took the attribute start off and showed 1
    test(`the field Start at refuses a value under 1 and keeps the value before (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      await click(page, await pointOf(page, 'Bravo'));
      await showTab(page, 'Text');
      await typeStart(page, '12');
      const twelve = await render(page);
      assert.equal(twelve, page.source.replace('<ol>', '<ol start="12">'));
      for (const value of ['0', '-3']) {
        await typeStart(page, value);
        assert.equal(await render(page), twelve, `a typed ${value} changes the file`);
        assert.equal(await field(page), '12', `the field does not go back to 12 after a typed ${value}`);
      }
      assert.equal(await undoLabel(page), 'Undo Start At');
      await undo(page);
      assert.equal(await render(page), page.source, 'a refused value adds an entry to the history');
      await redo(page);
      assert.equal(await render(page), twelve);
      await roundTrip(page, page.source);
    });
  }

  // the part of the file of the first slide of the deck of lists from Alpha to Echo
  const cutPart = (text) => text.slice(text.indexOf('<li>Alpha'), text.indexOf('<li>Echo'));

  // Return twice at the end of Bravo, which cuts the list of Alpha to Echo after Bravo
  async function cutAfterBravo(page) {
    await caretIn(page, 'Bravo');
    await press(page, 'Enter');
    await press(page, 'Enter');
    const cut = await render(page);
    assert.match(cutPart(cut), /<li>Bravo<\/li>\n {2}<\/ol>\n {2}<p><\/p>\n {2}<ol start="3">\n {4}<li>Charlie<\/li>/);
    return cut;
  }

  for (const platform of PLATFORMS) {
    // D32: the list cut off by Return kept start="3" after an item was added to the list before it
    test(`the start of a list cut off by Return goes on with the count of the list before it, at an added and a removed item (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      const cut = await cutAfterBravo(page);
      await caretIn(page, 'Alpha');
      await press(page, 'Enter');
      await type(page, 'Ab');
      const added = await render(page);
      assert.match(cutPart(added), /<li>Ab<\/li>\n {4}<li>Bravo<\/li>\n {2}<\/ol>\n {2}<p><\/p>\n {2}<ol start="4">\n {4}<li>Charlie<\/li>/, `the second list does not go on from 3: ${cutPart(added)}`);
      assert.deepEqual(await starts(page), [1, 4, 7]);
      await roundTrip(page, cut, 2);
      // Backspace at the start of Bravo joins it to Ab, which takes an item off the first list
      await caretIn(page, 'Bravo', false);
      await press(page, 'Backspace');
      const joined = await render(page);
      assert.match(cutPart(joined), /<li>AbBravo<\/li>\n {2}<\/ol>\n {2}<p><\/p>\n {2}<ol start="3">\n {4}<li>Charlie<\/li>/, `the second list does not go on from 2: ${cutPart(joined)}`);
      assert.deepEqual(await starts(page), [1, 3, 7]);
      await roundTrip(page, added);
    });

    test(`after an undo and a redo of the cut, the start of the second list still goes on with the first list (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      const cut = await cutAfterBravo(page);
      await undo(page);
      await redo(page);
      assert.equal(await render(page), cut);
      await caretIn(page, 'Alpha');
      await press(page, 'Enter');
      assert.deepEqual(await starts(page), [1, 4, 7], 'the second list does not go on with the first list after a redo of the cut');
      await undo(page);
      assert.equal(await render(page), cut);
      assert.deepEqual(await starts(page), [1, 3, 7]);
    });

    test(`a start typed into Start at, or that the file had, is not changed at an edit of the list before it (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      await cutAfterBravo(page);
      await click(page, await pointOf(page, 'Charlie'));
      await showTab(page, 'Text');
      await typeStart(page, '10');
      assert.ok((await render(page)).includes('<ol start="10">\n    <li>Charlie'));
      await caretIn(page, 'Alpha');
      await press(page, 'Enter');
      assert.deepEqual(await starts(page), [1, 10, 7], 'a typed start is changed');
      // the list of Seventh has start="7" in the file, which an item added before it does not change
      await caretIn(page, 'Delta');
      await press(page, 'Enter');
      assert.deepEqual(await starts(page), [1, 10, 7], 'the start of the file is changed');
    });
  }

  // the part of the file of slide 3 of the demo deck from its ul to its backdrop
  const listPart = (text) => {
    const at = text.indexOf('<h2>Show your steps one at a time');
    return text.slice(text.indexOf('<ul>', at), text.indexOf('<div class="backdrop"', at));
  };
  const ITEM_2 = '<li class="fragment" data-fragment-index="2">';

  for (const platform of PLATFORMS) {
    // D14: a blank line pasted into a list ended the list and split it in two around a paragraph
    for (const [name, text] of [['one blank line', ' one\n\ntwo'], ['two blank lines', ' one\n\n\ntwo'], ['a line of spaces', ' one\n  \ntwo']]) {
      test(`a paste of several lines with ${name} into a list item makes an item for each line with text, in the same list (${platform})`, async (t) => {
        const page = await load(t, platform, 'test-deck.html', 2);
        await caretIn(page, 'Two elements with the same');
        await exec(page, 'edit.paste', text);
        await frames(page);
        const part = listPart(await render(page));
        assert.equal(part.match(/<ul>/g)?.length, 1, `the paste splits the list: ${part}`);
        assert.ok(!part.includes('<p'), `the paste writes a paragraph: ${part}`);
        assert.ok(part.includes(`${ITEM_2}Two elements with the same index are shown together. one</li>\n    ${ITEM_2}two</li>\n    <li class="fragment" data-fragment-index="3">When exporting`), `the lines are not items of the list: ${part}`);
        assert.equal(await undoLabel(page), 'Undo Paste');
        await roundTrip(page, page.source);
      });
    }

    test(`Return on an empty item still ends the list (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 2);
      await caretIn(page, 'Two elements with the same');
      await press(page, 'Enter');
      await press(page, 'Enter');
      await type(page, 'X');
      const part = listPart(await render(page));
      assert.match(part, /together\.<\/li>\n {2}<\/ul>\n {2}<p>X<\/p>\n {2}<ul>/, `Return on an empty item does not end the list: ${part}`);
    });
  }
});
