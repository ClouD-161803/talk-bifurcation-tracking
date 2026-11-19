// inserts: every key typed right after an insert of a text box, a code box, a formula, or a
// footnote lands, a new formula is one entry Insert Formula, and inserts stay off the placeholders
// of a new slide

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { resolve } from 'node:path';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

// the fixes of R5.7 on both platforms: every key typed back to back into a new text box, code box,
// formula, and footnote lands, the Format Painter is dimmed in a code box, the running head of the
// Slide pane does not leave typeset items of MathJax behind, and a change of layout to Split fits
// the text of the text column of every slide changed. each edit of the file is checked byte for byte, after an
// undo and a redo, and after a save and an open
describe('keys typed right after an insert', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
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

  let last = null;

  // the editor on the slide at index of a deck, served over HTTP
  async function editor(platform, index = 2, deck = LAYOUTS, size) {
    await last?.close().catch(() => {});
    const page = await browser.newPage(size);
    last = page;
    await page.send('Page.bringToFront');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    // on a loaded runner, the unsaved edits of the page before are kept in the storage of the browser
    // before the page is closed, and they would then be offered on a dialog over the slide
    await page.evaluate('localStorage.clear()');
    page.source = readFileSync(deck, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${index})`);
    await frames(page);
    return page;
  }

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const wait = (page, ms) => page.evaluate(`new Promise((d) => setTimeout(() => d(true), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  // on a loaded runner, the keys of a burst are written seconds later, hence a state is read until
  // it is the expected one, for 15 s at most
  const until = async (page, expr, ms = 15000) => {
    for (const end = Date.now() + ms; Date.now() < end; await wait(page, 50)) if (await page.evaluate(expr)) return true;
    return false;
  };
  // the text rendered by the editor once it has the pattern, or the last text read
  const renderedWith = async (page, pattern, ms = 15000) => {
    let text = await render(page);
    for (const end = Date.now() + ms; !pattern.test(text) && Date.now() < end; text = await render(page)) await wait(page, 50);
    return text;
  };

  let saves = 0;
  async function saved(page) {
    const { text } = await saveAndReopen(page, `r5-7-${++saves}.html`);
    page.source = text;
    await byteExact(page);
    return text;
  }

  // the trusted key events of a text, with a newline sent as Enter, all sent over the DevTools
  // protocol before the first one is handled
  function burst(page, text) {
    const sent = [];
    for (const c of text) {
      const base = c === '\n'
        ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }
        : { key: c, code: c === ' ' ? 'Space' : `Key${c.toUpperCase()}`, windowsVirtualKeyCode: c === ' ' ? 32 : c.toUpperCase().charCodeAt(0), text: c, unmodifiedText: c };
      sent.push(page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base }));
      sent.push(page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: base.key, code: base.code, windowsVirtualKeyCode: base.windowsVirtualKeyCode }));
    }
    return Promise.all(sent);
  }

  // undoes every entry down to the text of the deck, and redoes them all, back to the text edited
  async function undoAll(page, source) {
    const text = await render(page);
    let n = 0;
    while ((await render(page)) !== source) {
      assert.ok(n++ < 20, 'the undo does not reach the text of the deck');
      await undo(page);
    }
    await byteExact(page);
    for (let i = 0; i < n; i++) await redo(page);
    assert.equal(await render(page), text);
  }

  // each new text written into the file by its first key, with the slide it is put on, the text
  // typed, and a pattern of the elements that every key must reach in the file. Enter in a text box
  // starts a new paragraph, as in an existing one, and in a footnote it starts a new line
  const NEW_TEXTS = [
    { id: 'insert.code', slide: 5, keys: 'a\nbc\n\nd', written: /<pre><code class="language-python">a\nbc\n\nd\n?<\/code><\/pre>/ },
    { id: 'insert.text', slide: 2, keys: 'a\nbc d', written: /<p>a<\/p>\s*<p>bc d<\/p>/ },
    { id: 'insert.footnote', slide: 3, keys: 'a\nbc d', written: /<div class="foot">a<br>bc d<\/div>/ },
  ];

  for (const platform of PLATFORMS) {
    for (const { id, slide, keys, written } of NEW_TEXTS) {
      test(`every key typed back to back into a new text of ${id} lands on ${platform}`, async () => {
        const page = await editor(platform, slide);
        const source = page.source;
        await exec(page, id);
        await frames(page);
        // the write of the new element is slowed as on a loaded machine, so that the keys after the
        // first one come while it is written
        await page.evaluate(`(() => { const t = MathJax.typesetPromise.bind(MathJax); MathJax.typesetPromise = (n) => new Promise((d) => setTimeout(d, 150)).then(() => t(n)); })()`);
        await burst(page, keys);
        await wait(page, 600);
        const text = await renderedWith(page, written);
        assert.match(text, written, `a key is lost: ${JSON.stringify(text.split('\n').filter((l) => !source.includes(l)))}`);
        await undoAll(page, source);
        await saved(page);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`Enter at the end of a code box starts a new line of its code on ${platform}`, async () => {
      const page = await editor(platform, 5);
      const CODE = 'x = 1\ny = x + 1</code>';
      await page.evaluate(`(() => {
      const c = document.querySelector('.reveal section.present pre code');
      c.closest('[contenteditable="true"]').focus();
      const r = document.createRange();
      r.selectNodeContents(c);
      r.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    })()`);
      await burst(page, '\nz');
      await wait(page, 200);
      await renderedWith(page, /x = 1\ny = x \+ 1\nz<\/code>/);
      await byteExact(page, [[CODE, 'x = 1\ny = x + 1\nz</code>']]);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present pre code').length`), 1);
      await undoAll(page, page.source);
      await saved(page);
      assert.deepEqual(errors(page), []);
    });

    test(`every key typed back to back after Insert > Formula reaches its TeX field on ${platform}`, async () => {
      const page = await editor(platform, 5);
      await exec(page, 'insert.formula');
      await burst(page, 'abc d');
      await wait(page, 300);
      await until(page, `(() => { const f = document.querySelector('.beeson-math textarea'); return !!f && f.value === 'abc d' && f === document.activeElement; })()`);
      const field = await page.evaluate(`(() => { const f = document.querySelector('.beeson-math textarea'); return f && { value: f.value, focused: f === document.activeElement }; })()`);
      assert.deepEqual(field, { value: 'abc d', focused: true });
      assert.deepEqual(errors(page), []);
    });

    // the keys come while the formula is written, before its TeX field is open, and D, which flips
    // the mode of the slide on the canvas, is a key of the TeX
    test(`every key typed while Insert > Formula writes its formula reaches its TeX field on ${platform}`, async () => {
      const page = await editor(platform, 5);
      const source = page.source;
      const dark = (await state(page, 'view.slideDark')).checked;
      await page.evaluate(`(() => { const t = MathJax.typesetPromise.bind(MathJax); MathJax.typesetPromise = (n) => new Promise((d) => setTimeout(d, 150)).then(() => t(n)); })()`);
      await page.evaluate(`void window.BeesonEditor.exec('insert.formula'), true`);
      await burst(page, 'abc d');
      assert.ok(await until(page, `!!document.querySelector('.beeson-math textarea')`), 'the TeX field does not open');
      await wait(page, 300);
      await until(page, `(() => { const f = document.querySelector('.beeson-math textarea'); return !!f && f.value === 'abc d' && f === document.activeElement; })()`);
      const field = await page.evaluate(`(() => { const f = document.querySelector('.beeson-math textarea'); return { value: f.value, focused: f === document.activeElement }; })()`);
      assert.deepEqual(field, { value: 'abc d', focused: true });
      assert.equal((await state(page, 'view.slideDark')).checked, dark, 'a key of the TeX flips the mode of the slide');
      await page.evaluate(`[...document.querySelectorAll('.beeson-math button')].find((b) => b.textContent === 'Insert').click()`);
      assert.ok(await until(page, `!document.querySelector('.beeson-math')`), 'the formula is not inserted');
      assert.match(await render(page), /<div class="math">\\\[abc d\\\]<\/div>/);
      await undoAll(page, source);
      await saved(page);
      assert.deepEqual(errors(page), []);
    });
  }

  // the caret put at the end of the first element at selector, or the whole text of it selected,
  // with its block focused
  const caretIn = (page, selector, whole = false) =>
    page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    el.closest('[contenteditable="true"]').focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    if (!${whole}) r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);
  // the change of the selection is reported to the editor in a later task, hence the state of the
  // painter is read until it is the expected one
  const painterIs = (page, on) => until(page, `window.BeesonEditor.state('text.formatPainter').enabled === ${on}`);

  for (const platform of PLATFORMS) {
    test(`the Format Painter is dimmed in a code box and live again in a text on ${platform}`, async () => {
      const page = await editor(platform, 5);
      const source = page.source;
      await caretIn(page, '.reveal section.present h2');
      await frames(page);
      assert.ok(await painterIs(page, true), 'the painter is dimmed in a heading');
      await caretIn(page, '.reveal section.present pre code');
      await frames(page);
      assert.ok(await painterIs(page, false), 'the painter is live with the caret in a code box');
      await caretIn(page, '.reveal section.present pre code', true);
      await frames(page);
      assert.ok(await painterIs(page, false), 'the painter is live with the code of a box selected');
      // Esc leaves the text of the code box and selects the box
      await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await frames(page);
      assert.equal(await page.evaluate(`document.activeElement?.closest?.('pre') ? 'text' : 'element'`), 'element');
      assert.ok(await painterIs(page, false), 'the painter is live with a code box selected');
      await caretIn(page, '.reveal section.present td');
      await frames(page);
      assert.ok(await painterIs(page, true), 'the painter is dimmed in a cell after a code box');
      // a painter armed in a text does not paint a code box
      await caretIn(page, '.reveal section.present h2', true);
      await exec(page, 'text.formatPainter');
      assert.equal((await state(page, 'text.formatPainter')).checked, true);
      await caretIn(page, '.reveal section.present pre code', true);
      await page.evaluate(`document.querySelector('.reveal section.present pre code').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);
      await wait(page, 100);
      assert.equal(await render(page), source, 'the painter wrote a style into a code box');
      assert.deepEqual(errors(page), []);
    });
  }

  // the typeset items in the list of MathJax, and those of them whose formula is off the page
  const mathItems = (page) =>
    page.evaluate(`(() => { const items = Array.from(MathJax.startup.document.math); return { all: items.length, gone: items.filter((m) => !m.typesetRoot?.isConnected).length }; })()`);

  for (const platform of PLATFORMS) {
    test(`the Slide pane rebuilt many times leaves no typeset items of MathJax behind on ${platform}`, async () => {
      const page = await editor(platform, 2);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      const sel = '.beeson-edit-inspector .ed-sec .ed-note.running-head mjx-container';
      const shown = async () => assert.ok(await until(page, `!!document.querySelector(${JSON.stringify(sel)})`), 'the running head of the Slide pane is not typeset');
      await shown();
      const first = await mathItems(page);
      for (let k = 0; k < 12; k++) {
        await page.evaluate(`Reveal.slide(${k % 2 ? 2 : 3})`);
        await shown();
      }
      await page.evaluate('Reveal.slide(2)');
      await shown();
      await wait(page, 200);
      const now = await mathItems(page);
      assert.equal(now.gone, 0, `MathJax keeps ${now.gone} typeset items of running heads that are off the page`);
      assert.equal(now.all, first.all);
      assert.deepEqual(errors(page), []);
    });
  }

  // the center of the row of the navigator whose title starts with title
  const rowOf = (page, title) =>
    page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-nav .row')].find((r) => r.querySelector('.title').textContent.startsWith(${JSON.stringify(title)}));
    r.scrollIntoView({ block: 'center' });
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  const showSlide = (page, title) =>
    page.evaluate(`Reveal.slide(Reveal.getIndices([...document.querySelectorAll('.reveal section h2')].find((h) => h.textContent.startsWith(${JSON.stringify(title)})).closest('section')).h)`);

  // the texts of the text column of the current slide that run past its bottom, and the texts marked by
  // overflow.ts
  const textColumnFit = (page) =>
    page.evaluate(`(() => {
    const panel = document.querySelector('.reveal section.present > .text-column');
    if (!panel) return null;
    const p = panel.getBoundingClientRect();
    const out = [...panel.children].filter((el) => !el.matches('.foot, aside')).filter((el) => el.getBoundingClientRect().bottom > p.bottom + 1).map((el) => el.localName);
    // a text that the theme draws over the footnote of the panel is marked, and no other text is
    const f = panel.querySelector(':scope > .foot')?.getBoundingClientRect();
    const onFoot = (el) => { const r = el.getBoundingClientRect(); return !!f && f.height > 0 && !el.closest('.foot') && r.bottom > f.top + 1 && r.top < f.bottom - 1; };
    const texts = [...panel.querySelectorAll('[contenteditable="true"]')];
    const wrong = texts.filter((el) => el.classList.contains('beeson-overflow') !== onFoot(el)).map((el) => el.localName);
    return { out, wrong };
  })()`);

  // the text of the slide of a deck whose heading starts with title
  const slideText = (text, title) => text.split('<section').find((t) => t.includes(`<h2>${title}`)) ?? null;

  // four slides in a row selected with Shift, since a Ctrl click is a right click in Chrome on the
  // Mac. the last is shown, and the first is more than two slides away from it, where reveal.js
  // does not lay out a slide
  const FOUR = ['Show your steps', 'Equations are first', 'Figures are first', 'Code boxes', 'Chapter two', 'Explain concepts', 'Color the terms'];

  for (const platform of PLATFORMS) {
    test(`a change of layout to Split of slides selected in the navigator fits the text of the text column of each as on the slide shown on ${platform}`, async () => {
      // the text of each slide changed to Split alone, while it is shown
      const alone = {};
      for (const title of FOUR) {
        const page = await editor(platform, 0, 'test-deck.html', { width: 1600, height: 1000 });
        await showSlide(page, title);
        await frames(page);
        await exec(page, 'slide.layout.split');
        await wait(page, 300);
        alone[title] = slideText(await render(page), title);
      }
      assert.ok(alone[FOUR[0]].includes('class="small"'), 'the text of the first slide is not shrunk in a panel');
      const page = await editor(platform, 0, 'test-deck.html', { width: 1600, height: 1000 });
      await showSlide(page, FOUR.at(-1));
      await frames(page);
      assert.equal(await page.evaluate(`[...document.querySelectorAll('.reveal section h2')].find((h) => h.textContent.startsWith(${JSON.stringify(FOUR[0])})).getBoundingClientRect().height`), 0, 'the first slide is laid out');
      await click(page, await rowOf(page, FOUR.at(-1)));
      await click(page, await rowOf(page, FOUR[0]), { modifiers: 'Shift' });
      await frames(page);
      const picked = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-nav .row[aria-selected="true"] .title')].map((t) => t.textContent)`);
      assert.equal(picked.length, FOUR.length, `the navigator does not have the slides selected: ${JSON.stringify(picked)}`);
      const source = page.source;
      await exec(page, 'slide.layout.split');
      await wait(page, 300);
      const split = await render(page);
      for (const title of FOUR) assert.equal(slideText(split, title), alone[title], `the text of the text column of ${title} is not fit as on the slide shown`);
      await showSlide(page, FOUR[0]);
      await wait(page, 300);
      assert.deepEqual(await textColumnFit(page), { out: [], wrong: [] }, `a text runs past the bottom of the panel of ${FOUR[0]}, or its mark is wrong`);
      // the fit is a part of the change of layout, undone and redone with it
      await undo(page);
      assert.equal(await render(page), source);
      await redo(page);
      assert.equal(await render(page), split);
      await saved(page);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R8.6 on both platforms with trusted input, for three gaps that R8.3 and R8.4
// left. a new formula is one entry of the history, Insert Formula, from the command to the close
// of its TeX field, and an empty or cancelled one leaves no entry. a block converted by the Text
// pane or the Format menu is selected again after an undo and after a redo. the element of every
// insert is kept off the empty placeholders of a new slide. after each edit the text is checked
// byte for byte, after an undo and a redo, and after a save and an open
describe('a new formula as one history entry', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const PANEL = '#beeson-edit-panel-format';
  // the slide of the layouts deck with a paragraph, a list, and a small paragraph
  const TEXT = 2;
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
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const meets = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

  // the editor on slide n of a deck, the layouts by default, opened from its file without problems,
  // with the Format tab shown
  async function load(t, platform, n = TEXT, deck = LAYOUTS) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    // without this, headless Chrome cancels the file chooser, and the cancel races the file of choose
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
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

  // the labels of the first two items of the Edit menu, i.e. Undo and Redo, read from the menu
  // opened with a click on the menu bar
  async function editLabels(page) {
    await clickText(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === 'Edit').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await frames(page);
    const labels = await page.evaluate(`[...[...document.querySelectorAll('.beeson-edit-menu')].at(-1).querySelectorAll('.item .label')].slice(0, 2).map((l) => l.textContent)`);
    await press(page, 'Escape');
    await frames(page);
    return labels;
  }

  let saves = 0;
  // the edited text, the text before byte for byte after one undo, the labels of the Edit menu
  // before and after the undo, the edit again after one redo, checked further by redone, and an
  // open of the saved text
  async function oneEntry(page, label, redone = async () => {}) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    assert.deepEqual(await editLabels(page), [`Undo ${label}`, 'Redo']);
    await undo(page);
    await frames(page);
    await byteExact(page);
    assert.equal((await state(page, 'edit.undo')).enabled, false, `one undo does not take ${label} off`);
    assert.deepEqual(await editLabels(page), ['Undo', `Redo ${label}`]);
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited);
    await redone();
    assert.deepEqual(await editLabels(page), [`Undo ${label}`, 'Redo']);
    const { text } = await saveAndReopen(page, `r8-6-${++saves}.html`);
    assert.equal(text, edited);
    page.source = text;
    return edited;
  }

  const sheetOpen = (page) => page.waitFor(`!!document.querySelector('.beeson-math textarea') && document.activeElement === document.querySelector('.beeson-math textarea')`);
  const sheetClosed = (page) => page.waitFor(`!document.querySelector('.beeson-math')`);
  // the file as it was, with nothing to undo or redo
  async function noEntry(page) {
    await sleep(300);
    await byteExact(page);
    assert.equal((await state(page, 'edit.undo')).enabled, false, 'the formula left an entry to undo');
    assert.equal((await state(page, 'edit.redo')).enabled, false, 'the formula left an entry to redo');
  }
  // a point of the canvas under the slide, where a click selects nothing
  const outside = (page) => page.evaluate(`(() => { const r = document.querySelector('.reveal .slides').getBoundingClientRect(); return { x: r.left + 6, y: r.bottom + 12 }; })()`);

  // the key of Insert > Formula, ⌥⌘E on a Mac and Alt+= elsewhere, the second of which press() of
  // the helpers does not type
  async function formulaKey(page, platform) {
    if (platform === 'mac') return press(page, 'Mod+Alt+E');
    const key = { key: '=', code: 'Equal', windowsVirtualKeyCode: 187, modifiers: 1 };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  }

  // gap 1 of R8.6: Insert > Formula on a slide was two entries, the insert and its TeX
  for (const platform of PLATFORMS) {
    test(`a new display formula is one entry Insert Formula up to its close with the commit key (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'insert.formula');
      await sheetOpen(page);
      await type(page, 'x^2 + y^2');
      await press(page, 'Mod+Enter');
      await sheetClosed(page);
      await frames(page);
      const edited = await oneEntry(page, 'Insert Formula', async () => {
        assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName + '.' + e.classList[0])`), ['div.math'], 'the formula is not selected after the redo');
      });
      assert.match(edited, /<div class="math">\\\[x\^2 \+ y\^2\\\]<\/div>/);
      assert.deepEqual(errors(page), []);
    });

    test(`a new display formula closed with a click away keeps its TeX as one entry Insert Formula (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'insert.formula');
      await sheetOpen(page);
      await type(page, '\\alpha');
      await sleep(400);
      await clickText(page, await outside(page));
      await sheetClosed(page);
      await sleep(200);
      const edited = await oneEntry(page, 'Insert Formula');
      assert.match(edited, /<div class="math">\\\[\\alpha\\\]<\/div>/);
      assert.deepEqual(errors(page), []);
    });

    test(`a new display formula closed with Esc or left empty is taken off without an entry (${platform})`, async (t) => {
      const page = await load(t, platform);
      // Esc after a TeX is typed
      await exec(page, 'insert.formula');
      await sheetOpen(page);
      await type(page, 'x');
      await press(page, 'Escape');
      await sheetClosed(page);
      await noEntry(page);
      // a click away with the field empty
      await exec(page, 'insert.formula');
      await sheetOpen(page);
      await clickText(page, await outside(page));
      await sheetClosed(page);
      await noEntry(page);
      // the commit key with the field empty, which leaves the sheet open as Insert is dimmed
      await exec(page, 'insert.formula');
      await sheetOpen(page);
      await press(page, 'Mod+Enter');
      await sleep(300);
      if (await page.evaluate(`!!document.querySelector('.beeson-math')`)) await press(page, 'Escape');
      await sheetClosed(page);
      await noEntry(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present div.math').length`), 0);
      assert.deepEqual(errors(page), []);
    });

    test(`a new inline formula of Insert > Formula in a text is one entry, and none after Esc (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, P);
      await press(page, 'End');
      await frames(page);
      await formulaKey(page, platform);
      await sheetOpen(page);
      await press(page, 'Escape');
      await sheetClosed(page);
      await noEntry(page);
      await clickText(page, P);
      await press(page, 'End');
      await formulaKey(page, platform);
      await sheetOpen(page);
      await type(page, 'z');
      await press(page, 'Mod+Enter');
      await sheetClosed(page);
      await frames(page);
      // the entry is named for the inline formula, as its item of the Insert menu is
      const edited = await oneEntry(page, 'Insert Inline Formula');
      assert.match(edited, /<p>A paragraph with [^\n]*\\\(z\\\)[^\n]*<\/p>/);
      assert.deepEqual(errors(page), []);
    });
  }

  // the selection, each element as its tag, its style class, and its first words
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => [e.localName, ...[...e.classList].filter((c) => ['small', 'caption', 'foot'].includes(c))].join('.') + ' ' + e.textContent.trim().slice(0, 18))`);

  // gap 2 of R8.6: an undo and a redo dropped the selection of a list made with Dashes of the Text
  // pane from a paragraph selected as a block. each conversion of the Text pane and of the Format
  // menu is checked on the same paragraph, as [name, label of the entry, control, block made]. since
  // R9.6, the entry of a list is named List Style and that of a paragraph style Paragraph Style
  const CONVERSIONS = [
    ['Dashes of the Text pane', 'List Style', { pane: 'text.list.ul' }, 'ul'],
    ['Numbers of the Text pane', 'List Style', { pane: 'text.list.ol' }, 'ol'],
    ['Dashes of the Format menu', 'List Style', { exec: 'text.list.ul' }, 'ul'],
    ['Numbers of the Format menu', 'List Style', { exec: 'text.list.ol' }, 'ol'],
    ['Small of the Format menu', 'Paragraph Style', { exec: 'text.style.small' }, 'p.small'],
    ['Subheading of the Format menu', 'Paragraph Style', { exec: 'text.style.subheading' }, 'h3'],
    ['Caption of the Format menu', 'Paragraph Style', { exec: 'text.style.caption' }, 'p.caption'],
    ['Footnote of the Format menu', 'Paragraph Style', { exec: 'text.style.footnote' }, 'div.foot'],
    ['Smaller of the Text pane', 'Smaller', { pane: 'text.smaller' }, 'p.small'],
    ['Bigger of the Text pane', 'Bigger', { pane: 'text.bigger' }, 'h3'],
  ];
  for (const platform of PLATFORMS) {
    for (const [name, label, how, tag] of CONVERSIONS) {
      test(`a paragraph made ${tag} with ${name} is selected after the command, an undo, and a redo (${platform})`, async (t) => {
        const page = await load(t, platform);
        await clickText(page, P);
        await press(page, 'Escape');
        await frames(page);
        const block = await selected(page);
        assert.deepEqual(block, ['p A paragraph with b']);
        if (how.pane) await click(page, `${PANEL} [data-command="${how.pane}"]`);
        else await exec(page, how.exec);
        await frames(page);
        const made = [`${tag} A paragraph with b`];
        assert.deepEqual(await selected(page), made, `the block made by ${label} is not selected`);
        assert.equal((await state(page, 'edit.undo')).label, `Undo ${label}`);
        const edited = await render(page);
        await undo(page);
        await frames(page);
        await byteExact(page);
        assert.deepEqual(await selected(page), block, `the paragraph is not selected after the undo of ${label}`);
        await redo(page);
        await frames(page);
        assert.equal(await render(page), edited);
        assert.deepEqual(await selected(page), made, `the block made by ${label} is not selected after the redo`);
        // the block selected again takes the next command, Paragraphs or Body
        await exec(page, tag === 'ul' || tag === 'ol' ? 'text.list.none' : 'text.style.body');
        await frames(page);
        assert.deepEqual(await selected(page), block, 'the block selected after the redo does not take the next command');
        const { text } = await saveAndReopen(page, `r8-6-${++saves}.html`);
        assert.equal(text, page.source);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the box in slide px of the prompt of each empty block of the current slide that shows its
  // placeholder, i.e. of the text of the placeholder as it is drawn
  const promptBoxes = (page) => page.evaluate(`(() => {
  const slides = document.querySelector('.reveal .slides');
  const s = slides.getBoundingClientRect();
  const k = s.width / slides.offsetWidth;
  const ctx = document.createElement('canvas').getContext('2d');
  return [...document.querySelectorAll('.reveal section.present :is(h1, h2, h3, p)')].filter((el) => el.getClientRects().length && !['none', 'normal'].includes(getComputedStyle(el, '::before').content)).map((el) => {
    const before = getComputedStyle(el, '::before');
    ctx.font = before.font;
    const r = el.getBoundingClientRect();
    const left = (r.left - s.left) / k + parseFloat(getComputedStyle(el).paddingLeft);
    return { name: el.localName + (el.className ? '.' + el.classList[0] : ''), left, top: (r.top - s.top) / k, right: left + ctx.measureText(JSON.parse(before.content)).width, bottom: (r.bottom - s.top) / k };
  });
})()`);
  // the box in slide px of the first shown element of selector
  const slideRect = (page, selector) => page.evaluate(`(() => {
  const slides = document.querySelector('.reveal .slides');
  const s = slides.getBoundingClientRect();
  const k = s.width / slides.offsetWidth;
  const el = [...document.querySelectorAll(${js(selector)})].find((e) => e.getClientRects().length);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: (r.left - s.left) / k, top: (r.top - s.top) / k, right: (r.right - s.left) / k, bottom: (r.bottom - s.top) / k };
})()`);

  // the file chosen for an insert of a picture, given to the file chooser of the page
  async function choose(page, id, file) {
    const chosen = exec(page, id);
    await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
    const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
    await page.send('DOM.setFileInputFiles', { files: [resolve(file)], objectId: result.objectId });
    await chosen;
  }

  // each insert as its name, its run on the current slide, and the selector of the element it makes
  const NEW = '.reveal section.present';
  const INSERTS = [
    ['a table', (page) => exec(page, 'insert.table', { rows: 3, columns: 3 }), `${NEW} table`],
    ['a QR code', (page) => exec(page, 'insert.qr'), `${NEW} .qr`],
    ['a text box', (page) => exec(page, 'insert.text'), `${NEW} .beeson-pending`],
    ['a code box', (page) => exec(page, 'insert.code'), `${NEW} pre.beeson-pending`],
    ['a formula', async (page) => {
      await exec(page, 'insert.formula');
      await sheetOpen(page);
      await type(page, 'x^2 + y^2 = r^2');
      await press(page, 'Mod+Enter');
      await sheetClosed(page);
    }, `${NEW} div.math`],
    ['an image', (page) => choose(page, 'insert.image', 'demo/figure-light.png'), `${NEW} img`],
    ['a video', (page) => choose(page, 'insert.video', 'demo/clip-dark.mp4'), `${NEW} video`],
  ];

  // gap 3 of R8.6: an empty block that shows its placeholder counted as taken space for a new table
  // only. each insert is run on a new slide of each layout with two placeholders, with nothing
  // selected, and its element is kept off both placeholders and inside the slide
  for (const platform of PLATFORMS) {
    for (const layout of ['content', 'split', 'figure']) {
      test(`every insert on a new ${layout} slide keeps its element off the two placeholders (${platform})`, async (t) => {
        const page = await load(t, platform, 0, 'test-deck.html');
        for (const [what, run, selector] of INSERTS) {
          await exec(page, `slide.new.${layout}`);
          await frames(page);
          // the caret of the new slide is in its title, and the second Esc leaves its block
          await press(page, 'Escape');
          await press(page, 'Escape');
          await frames(page);
          const holders = await promptBoxes(page);
          assert.equal(holders.length, 2, `the new ${layout} slide does not show two placeholders`);
          await run(page);
          await sleep(300);
          await frames(page);
          const box = await slideRect(page, selector);
          assert.ok(box, `${what} is not on the new ${layout} slide`);
          for (const h of holders) assert.ok(!meets(box, h), `${what} at ${js(box)} is drawn over the placeholder ${h.name} at ${js(h)} of a new ${layout} slide`);
          assert.ok(box.left >= -0.5 && box.top >= -0.5 && box.right <= 1920.5 && box.bottom <= 1080.5, `${what} at ${js(box)} is not inside the new ${layout} slide`);
          await page.evaluate(`Reveal.slide(0)`);
          await frames(page);
        }
        assert.deepEqual(errors(page), []);
      });
    }
  }
});
