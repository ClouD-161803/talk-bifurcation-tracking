// return, Backspace, and Delete at an empty or first list item, which cut a list, end it, take an
// item out one level, or join two lists of one kind

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

// regression tests of R11.2 on both platforms with trusted input: Return on an empty item in the
// middle of a list, Bigger, Smaller, and the paragraph style on several blocks, Shift+click and the
// column of the caret across the items of a list, and the delay of several steps. after each edit
// the text is checked byte for byte after an undo, the edit again after a redo, and after a save
// and an open
describe('Return on an empty item mid-list', () => {
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
  const exec = (page, id, arg = '') => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg ? `, ${arg}` : ''})`);
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let saves = 0;

  // the editor on slide n of the demo deck, counted from 0, served over HTTP
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
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // roundTrip checks the text in page.source byte for byte after undos undos, the edit after as many
  // redos, and an open of the saved edit without problems, whose text becomes page.source
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await undo(page);
    await byteExact(page);
    for (let i = 0; i < undos; i++) await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r11-2-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  // the shown element of selector that holds needle, as an expression
  const find = (selector, needle = '') => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  // the client point of the character at offset k of needle, 2 px inside its left edge with edge,
  // else at its center
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

  // the caret put after k characters of needle, in the text node that holds it
  const caretAt = (page, selector, needle, k) => page.evaluate(`(() => {
  const el = ${find(selector, needle)};
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i >= 0) return void getSelection().collapse(n, i + ${k});
  }
})()`);

  const ITEM = '.reveal section.present ul > li, .reveal section.present ol > li';
  const PARA = '.reveal section.present > p';
  const ITEMS = [
    '<li class="fragment" data-fragment-index="1">Dark and light mode: export one file per mode, marked <code>for-dark</code> and <code>for-light</code>.</li>',
    '<li class="fragment" data-fragment-index="2">You might have noticed a toggle on the top right: try clicking it on this slide.</li>',
    '<li class="fragment" data-fragment-index="3">You should give black-on-white plots the class <code>invert</code> to invert them in dark mode.</li>',
  ];
  const SMALL_ITEMS = ITEMS.map((li) => li.replace('<li class="fragment"', '<li class="fragment small"'));

  // the caret put at the end of the text of item i of the lists of the slide, counted in page order
  const caretAtEnd = (page, i) => page.evaluate(`(() => {
  const li = document.querySelectorAll(${js(ITEM)})[${i}];
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) last = n;
  li.closest('[contenteditable="true"]').focus();
  getSelection().collapse(last, last.length);
})()`);

  // the tag and the text of the editing host of the caret
  const caretElement = (page) => page.evaluate(`(() => {
  const n = getSelection().focusNode;
  const host = (n.nodeType === 1 ? n : n.parentElement).closest('[contenteditable="true"]');
  return host ? { tag: host.localName, text: host.textContent.trim() } : null;
})()`);

  // the line of the file that holds the start of the text head
  const line = (text, head) => text.split('\n').find((l) => l.includes(`>${head}`))?.trim();

  // difference 1 of R11.2: Return on an empty item in the middle of a list of the first level added
  // one more empty item. in Keynote and PowerPoint it takes the bullet off the line, which becomes a
  // paragraph between the items before it and the items after it
  for (const platform of PLATFORMS) {
    for (const kind of ['ul', 'ol']) {
      test(`Return on an empty item in the middle of a list of kind ${kind} cuts the list at a new paragraph (${platform})`, async (t) => {
        const page = await load(t, platform);
        await clickText(page, await pointOf(page, ITEM, 'Dark and light', 2));
        if (kind === 'ol') {
          await exec(page, 'text.list.ol');
          page.source = await render(page);
        }
        const open = `<${kind} style="translate: 0px 20px">`;
        // the second part of a numbered list goes on with its count
        const second = kind === 'ol' ? open.replace('>', ' start="2">') : open;
        assert.ok(page.source.includes(open));
        await caretAtEnd(page, 0);
        await press(page, 'Enter');
        const added = await render(page);
        assert.ok(added.includes('<li class="fragment" data-fragment-index="1"></li>'), 'Return at the end of an item does not add an empty item');
        page.source = added;
        await press(page, 'Enter');
        const cut = await render(page);
        const shape = new RegExp(`${escape(ITEMS[0])}\\n  </${kind}>\\n  <p style="translate: 0px 20px"></p>\\n  ${escape(second)}\\n    ${escape(ITEMS[1])}\\n    ${escape(ITEMS[2])}\\n  </${kind}>`);
        assert.match(cut, shape, `the list is not cut at a paragraph: ${cut.match(/for-light<\/code>\.[\s\S]{0,220}/)?.[0]}`);
        assert.equal(await undoLabel(page), 'Undo New Paragraph');
        assert.deepEqual(await caretElement(page), { tag: 'p', text: '' }, 'the caret is not in the new paragraph');
        await type(page, 'Z');
        const typed = await render(page);
        assert.ok(typed.includes(`</${kind}>\n  <p style="translate: 0px 20px">Z</p>\n  ${second}`), 'the typed text is not in the new paragraph');
        await undo(page);
        assert.equal(await render(page), cut);
        await undo(page);
        assert.equal(await render(page), added, 'the cut of the list is not one entry of the history');
        await redo(page);
        assert.equal(await render(page), cut);
        await redo(page);
        assert.equal(await render(page), typed);
        const { text } = await saveAndReopen(page, `r11-2-${++saves}.html`);
        assert.equal(text, typed);
        assert.deepEqual(errors(page), []);
      });
    }

    // an empty first item is taken off its list, which then starts at the item after it
    test(`Return on an empty first item of a list makes it a paragraph before the list (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'Dark and light', 2));
      await caretAt(page, ITEM, 'Dark and light', 0);
      await press(page, 'Enter');
      page.source = await render(page);
      await page.evaluate(`(() => { const li = document.querySelectorAll(${js(ITEM)})[0]; li.focus(); getSelection().collapse(li, 0); })()`);
      await press(page, 'Enter');
      const cut = await render(page);
      assert.ok(cut.includes(`<p></p>\n  <ul style="translate: 0px 20px">\n    ${ITEMS[0]}`), `the empty first item is not a paragraph before the list: ${cut.match(/frameless\.<\/p>[\s\S]{0,160}/)?.[0]}`);
      assert.deepEqual(await caretElement(page), { tag: 'p', text: '' });
      await roundTrip(page);
    });

    // R9.6 moves an empty nested item out one level at the end of its list. in the middle of a list
    // it does the same, and the items after it go into a list at its end, as with Shift+Tab
    test(`Return on an empty nested item in the middle of its list moves it out one level (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'toggle', 2));
      await press(page, 'Tab');
      await caretAt(page, ITEM, 'You should', 2);
      await press(page, 'Tab');
      await caretAtEnd(page, 1);
      await press(page, 'Enter');
      const added = await render(page);
      assert.match(added, /this slide\.<\/li>\s*<li class="fragment" data-fragment-index="2"><\/li>\s*<li class="fragment" data-fragment-index="3">You should/, 'the empty item is not added between the two nested items');
      page.source = added;
      await press(page, 'Enter');
      const out = await render(page);
      assert.match(out, /for-light<\/code>\.\s*<ul>\s*<li class="fragment" data-fragment-index="2">You might[^\n]*<\/li>\s*<\/ul>\s*<\/li>\s*<li class="fragment" data-fragment-index="2">\s*<ul>\s*<li class="fragment" data-fragment-index="3">You should/, `the empty item is not moved out one level: ${out.match(/for-light<\/code>\.[\s\S]{0,300}/)?.[0]}`);
      assert.equal(await undoLabel(page), 'Undo New Paragraph');
      // the caret is in the outdented item. this item does not have a text of its own before its
      // nested list, hence the browser puts the caret at the start of the nested list
      assert.equal(await page.evaluate(`(() => { const n = getSelection().focusNode; const li = (n.nodeType === 1 ? n : n.parentElement).closest('[contenteditable="true"]'); return li.localName === 'li' && li.textContent.trim().startsWith('You should') && !li.parentElement.closest('li'); })()`), true, 'the caret is not in the outdented item');
      await roundTrip(page);
    });
  }

  // the trusted key Mod+Shift with key on a US layout, which press() does not know
  async function modShift(page, platform, key, code, keyCode) {
    const base = { key, code, windowsVirtualKeyCode: keyCode, modifiers: (platform === 'mac' ? 4 : 2) | 8 };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  const SMALLER = ['<', 'Comma', 188];
  const BIGGER = ['>', 'Period', 190];

  // the paragraph and the list of slide 5 selected as objects, by a click, Esc, and a Shift+click
  async function selectBoth(page) {
    await clickText(page, await pointOf(page, PARA, 'figure', 2));
    await press(page, 'Escape');
    await frames(page);
    await click(page, await pointOf(page, ITEM, 'toggle', 2), { modifiers: 'Shift' });
    await frames(page);
  }

  // difference 2 of R11.2: Bigger, Smaller, and the paragraph style on several selected blocks and
  // on a text selected over several items acted on one block
  for (const platform of PLATFORMS) {
    test(`Smaller and Bigger on a paragraph and a list selected as objects act on every block, as one entry each (${platform})`, async (t) => {
      const page = await load(t, platform);
      await selectBoth(page);
      await modShift(page, platform, ...SMALLER);
      await frames(page);
      const text = await render(page);
      assert.ok(text.includes('<p class="small">Export your matplotlib figure'), 'Smaller does not set Small on the paragraph');
      for (const li of SMALL_ITEMS) assert.ok(text.includes(li), `Smaller does not set Small on ${li.slice(0, 70)}`);
      await roundTrip(page);
      await selectBoth(page);
      await modShift(page, platform, ...BIGGER);
      await frames(page);
      assert.equal(await render(page), readFileSync('test-deck.html', 'utf8'), 'Bigger does not set Body on every block');
      await undo(page);
      assert.equal(await render(page), page.source);
    });

    test(`a paragraph style of the Text pane on a paragraph and a list selected as objects acts on every block (${platform})`, async (t) => {
      const page = await load(t, platform);
      await selectBoth(page);
      await exec(page, 'text.style.small');
      await frames(page);
      const text = await render(page);
      assert.ok(text.includes('<p class="small">Export your matplotlib figure'), 'Small is not set on the paragraph');
      for (const li of SMALL_ITEMS) assert.ok(text.includes(li), `Small is not set on ${li.slice(0, 70)}`);
      assert.equal(await undoLabel(page), 'Undo Paragraph Style');
      await roundTrip(page);
    });

    for (const [name, how] of [['Smaller', 'key'], ['Small', 'pane']]) {
      test(`${name} on a text selected over two items acts on both items and keeps the selection (${platform})`, async (t) => {
        const page = await load(t, platform);
        await clickText(page, await pointOf(page, ITEM, 'toggle', 2));
        await caretAt(page, ITEM, 'slide.', 2);
        for (let i = 0; i < 8; i++) await press(page, 'Shift+ArrowRight');
        if (how === 'key') await modShift(page, platform, ...SMALLER);
        else await exec(page, 'text.style.small');
        await frames(page);
        const text = await render(page);
        assert.equal(line(text, 'Dark and'), ITEMS[0], 'the item before the selection is changed');
        assert.equal(line(text, 'You might'), SMALL_ITEMS[1], 'the first item of the selection is not Small');
        assert.equal(line(text, 'You should'), SMALL_ITEMS[2], 'the last item of the selection is not Small');
        // Backspace deletes the same selection over the two items after the change
        await press(page, 'Backspace');
        assert.equal(line(await render(page), 'You might'), SMALL_ITEMS[1].replace('slide.</li>', 'sl should give black-on-white plots the class <code>invert</code> to invert them in dark mode.</li>'), 'the selection over the two items is not kept');
        await undo(page);
        await roundTrip(page);
      });
    }

    for (const [from, to, way] of [['toggle', 'plots', 'forward'], ['plots', 'toggle', 'backward']]) {
      test(`a Shift+click in another item extends the selection from the caret across the items, ${way} (${platform})`, async (t) => {
        const page = await load(t, platform);
        await clickText(page, await pointOf(page, ITEM, from, 2));
        await caretAt(page, ITEM, from, 0);
        await click(page, await pointOf(page, ITEM, to, 0, true), { modifiers: 'Shift' });
        await frames(page);
        await type(page, 'Z');
        const text = await render(page);
        assert.equal(line(text, 'You might'), '<li class="fragment" data-fragment-index="2">You might have noticed a Zplots the class <code>invert</code> to invert them in dark mode.</li>', `the Shift+click does not extend the selection: ${line(text, 'You might')}`);
        assert.equal(line(text, 'You should'), undefined);
        await roundTrip(page);
      });
    }
  }

  // the left of the caret in the window, in CSS pixels
  const caretX = (page) => page.evaluate(`(() => {
  const r = getSelection().getRangeAt(0).cloneRange();
  const box = r.getClientRects()[0] ?? r.getBoundingClientRect();
  return box.left;
})()`);

  // the caret put at the client x on the last or the first line of item i
  const caretOnLine = (page, i, x, last) => page.evaluate(`(() => {
  const li = document.querySelectorAll(${js(ITEM)})[${i}];
  const r = document.createRange();
  r.selectNodeContents(li);
  const lines = [...r.getClientRects()].filter((b) => b.height > 0);
  const y = ${last} ? Math.max(...lines.map((b) => b.bottom)) - 6 : Math.min(...lines.map((b) => b.top)) + 6;
  const p = document.caretPositionFromPoint ? document.caretPositionFromPoint(${x}, y) : null;
  const q = p ? [p.offsetNode, p.offset] : (() => { const c = document.caretRangeFromPoint(${x}, y); return [c.startContainer, c.startOffset]; })();
  li.closest('[contenteditable="true"]').focus();
  getSelection().collapse(...q);
})()`);

  // the right of the last line and of the first line of item i, in CSS pixels
  const lineEnds = (page, i) => page.evaluate(`(() => {
  const li = document.querySelectorAll(${js(ITEM)})[${i}];
  const r = document.createRange();
  r.selectNodeContents(li);
  const lines = [...r.getClientRects()].filter((b) => b.height > 0 && b.width > 0);
  const bottom = Math.max(...lines.map((b) => b.bottom));
  const top = Math.min(...lines.map((b) => b.top));
  return { last: Math.max(...lines.filter((b) => b.bottom > bottom - 4).map((b) => b.right)), first: Math.max(...lines.filter((b) => b.top < top + 4).map((b) => b.right)) };
})()`);

  // the caret keeps its column over a short item between two long ones: the short item takes the
  // caret to its end, and the next arrow puts the caret back in its column, as in a text editor
  for (const platform of PLATFORMS) {
    test(`ArrowDown and ArrowUp keep the column of the caret across a short item (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'Dark and light', 2));
      await caretAtEnd(page, 0);
      await press(page, 'Enter');
      await type(page, 'ab');
      const one = await lineEnds(page, 0);
      const three = await lineEnds(page, 2);
      const short = await lineEnds(page, 1);
      const x = Math.min(one.last, three.first) - 40;
      assert.ok(x > short.last + 60, `the column at ${x} is not right of the short item, which ends at ${short.last}`);
      await caretOnLine(page, 0, x, true);
      const x0 = await caretX(page);
      await press(page, 'ArrowDown');
      assert.equal((await caretElement(page)).text, 'ab');
      await press(page, 'ArrowDown');
      assert.match((await caretElement(page)).text, /^You might/);
      const x1 = await caretX(page);
      assert.ok(Math.abs(x1 - x0) < 20, `ArrowDown puts the caret at x ${x1}, away from its column at ${x0}`);
      await press(page, 'ArrowUp');
      assert.equal((await caretElement(page)).text, 'ab');
      await press(page, 'ArrowUp');
      assert.match((await caretElement(page)).text, /^Dark and light/);
      const x2 = await caretX(page);
      assert.ok(Math.abs(x2 - x0) < 20, `ArrowUp puts the caret at x ${x2}, away from its column at ${x0}`);
      // a caret moved by ArrowLeft takes a new column
      await press(page, 'ArrowLeft');
      await press(page, 'ArrowLeft');
      const x3 = await caretX(page);
      await press(page, 'ArrowDown');
      await press(page, 'ArrowDown');
      const x4 = await caretX(page);
      assert.ok(Math.abs(x4 - x3) < 20, `after ArrowLeft, ArrowDown puts the caret at x ${x4}, away from its new column at ${x3}`);
      assert.deepEqual(errors(page), []);
    });
  }

  // difference 3 of R11.2: with several rows of the Steps list selected, a delay typed into the field
  // was written only into the first row
  const ROW = (text) => `[...document.querySelectorAll('.beeson-edit-side .rows .row')].find((r) => r.querySelector('.text').textContent.startsWith(${js(text)}))`;
  const pointIn = (page, el, fx = 0.5) => page.evaluate(`(() => { const el = ${el}; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height / 2 }; })()`);
  const openSteps = async (page) => {
    if (!(await page.evaluate(`window.BeesonEditor.state('view.steps').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
    await frames(page);
  };
  const DELAY = '.beeson-edit-side input.delay';
  const LI = (k) => `document.querySelectorAll('.reveal section.present ul > li')[${k}]`;
  const field = (page) => page.evaluate(`(() => { const f = document.querySelector(${js(DELAY)}); return { value: f.value, placeholder: f.placeholder, disabled: f.disabled }; })()`);
  const [TWO, LAST] = ['Two elements wi', 'When exporting '];

  for (const platform of PLATFORMS) {
    test(`a delay typed with several rows selected is written into each row, as one entry, and a mixed delay shows Multiple (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await openSteps(page);
      // the second and the third item of the slide start after the step before, at 1 s and 2 s
      await exec(page, 'steps.start', `{ start: 'after', el: ${LI(1)} }`);
      await exec(page, 'steps.start', `{ start: 'after', el: ${LI(2)} }`);
      await exec(page, 'steps.delay', `{ delay: 1, el: ${LI(1)} }`);
      await exec(page, 'steps.delay', `{ delay: 2, el: ${LI(2)} }`);
      page.source = await render(page);
      assert.ok(page.source.includes('data-fragment-index="1" data-autoslide="1000"') && page.source.includes('data-fragment-index="2" data-autoslide="2000"'), 'the delays are not set up');
      await clickText(page, await pointIn(page, ROW(TWO), 0.7));
      await click(page, await pointIn(page, ROW(LAST), 0.7), { modifiers: 'Shift' });
      await frames(page);
      const mixed = await field(page);
      await clickText(page, DELAY);
      await page.evaluate(`document.querySelector(${js(DELAY)}).select()`);
      await type(page, '3');
      await press(page, 'Enter');
      await frames(page);
      const text = await render(page);
      assert.ok(text.includes('data-fragment-index="1" data-autoslide="3000"'), 'the delay is not written into the first selected row');
      assert.ok(text.includes('data-fragment-index="2" data-autoslide="3000"'), 'the delay is not written into the second selected row');
      assert.deepEqual(mixed, { value: '', placeholder: 'Multiple', disabled: false }, 'the field does not show a mixed delay');
      assert.deepEqual(await field(page), { value: '3', placeholder: '', disabled: false });
      await roundTrip(page);
    });
  }
});

// regression tests of R13.6 on both platforms with trusted input: the caret after an undo and a
// redo of Remove Bullet, the name of the outdent of Backspace, and Backspace at the start of a first
// item with a nested list. after each edit the text is checked byte for byte after an undo, the edit again
// after a redo, and after a save and an open
describe('Remove Bullet undone, Backspace at a first item', () => {
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
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  let saves = 0;

  async function load(t, platform, n) {
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

  // command sends Mod+Z or Mod+Shift+Z with the editing command of the browser, which a key event of
  // the DevTools protocol runs only when the command is named
  async function command(page, name) {
    const modifiers = (page.platform === 'mac' ? 4 : 2) | (name === 'redo' ? 8 : 0);
    const base = { key: name === 'redo' ? 'Z' : 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [name] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await frames(page);
    await frames(page);
  }

  const find = (selector, needle = '') => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  // the client point 2 px inside the left edge of the character at offset k of needle
  const pointOf = (page, selector, needle, k = 0) => page.evaluate(`(() => {
  const el = ${find(selector, needle)};
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i + ${k});
    r.setEnd(n, i + ${k} + 1);
    const b = r.getBoundingClientRect();
    return { x: b.left + 2, y: b.top + b.height / 2 };
  }
})()`);

  const ITEM = '.reveal section.present ul > li';

  // finding 1: after an undo or a redo of Remove Bullet, the focus was on body and the typing was lost
  for (const platform of PLATFORMS) {
    // the paragraph takes the translate of a moved list, as the list of slide 5
    for (const [n, needle, place] of [
      [2, 'Each step is', ''],
      [4, 'Dark and light mode', ' style="translate: 0px 20px"'],
    ]) {
      test(`after an undo and a redo of Remove Bullet on slide ${n + 1}, the next key goes into the text (${platform})`, async (t) => {
        const page = await load(t, platform, n);
        await clickText(page, await pointOf(page, ITEM, needle));
        await press(page, 'Home');
        await press(page, 'Backspace');
        assert.equal(await undoLabel(page), 'Undo Remove Bullet');
        const unlisted = await render(page);
        assert.ok(unlisted.includes(`<p class="fragment" data-fragment-index="1"${place}>${needle}`), 'the item is not made a paragraph');
        await command(page, 'undo');
        await byteExact(page);
        await type(page, 'Q');
        assert.ok((await render(page)).includes(`<li class="fragment" data-fragment-index="1">Q${needle}`), `the Q is not the first character of the item, the focus is in ${await page.evaluate('document.activeElement.localName')}`);
        await command(page, 'undo');
        await byteExact(page);
        // a typing clears the redos, hence the bullet is taken off again for the redo
        await clickText(page, await pointOf(page, ITEM, needle));
        await press(page, 'Home');
        await press(page, 'Backspace');
        await command(page, 'undo');
        await command(page, 'redo');
        assert.equal(await render(page), unlisted);
        await type(page, 'W');
        const typed = await render(page);
        assert.ok(typed.includes(`<p class="fragment" data-fragment-index="1"${place}>W${needle}`), `the W is not the first character of the paragraph, the focus is in ${await page.evaluate('document.activeElement.localName')}`);
        const { text } = await saveAndReopen(page, `r13-6-${++saves}.html`);
        assert.equal(text, typed);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // roundTrip checks page.source byte for byte after undos undos, the edit after as many redos, and
  // an open of the saved edit without problems
  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r13-6-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
  }

  // the part of the file from the h2 of slide 5 to its figure
  const listPart = (text) => {
    const at = text.indexOf('<h2>Figures are first');
    return text.slice(at, text.indexOf('<figure class="figure-box">', at));
  };

  // the item "You might..." of slide 5 made the first item of a list nested in "Dark and light..."
  async function nested(t, platform) {
    const page = await load(t, platform, 4);
    await clickText(page, await pointOf(page, ITEM, 'You might'));
    await press(page, 'Home');
    await press(page, 'Tab');
    assert.match(listPart(await render(page)), /for-light<\/code>\.\n {6}<ul>\n {8}<li class="fragment" data-fragment-index="2">You might/);
    return page;
  }

  // finding 4: Backspace at the start of a nested first item outdents it, and was named Join Paragraphs
  for (const platform of PLATFORMS) {
    test(`Backspace at the start of a nested first item is named as the outdent, Decrease Indent Level (${platform})`, async (t) => {
      const page = await nested(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'You might'));
      await press(page, 'Home');
      await press(page, 'Backspace');
      assert.equal(await undoLabel(page), 'Undo Decrease Indent Level');
      // the outdent takes back the Tab
      await byteExact(page);
      await page.evaluate('window.BeesonEditor.undo()');
      assert.match(listPart(await render(page)), /for-light<\/code>\.\n {6}<ul>\n {8}<li class="fragment" data-fragment-index="2">You might/);
      await page.evaluate('window.BeesonEditor.redo()');
      await byteExact(page);
    });
  }

  // finding 5: Backspace at the start of a first item with a nested list did nothing
  for (const platform of PLATFORMS) {
    test(`Backspace at the start of a first item with a nested list takes its dash off and keeps the nested items in the list (${platform})`, async (t) => {
      const page = await nested(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'Dark and light'));
      await press(page, 'Home');
      await press(page, 'Backspace');
      const part = listPart(await render(page));
      assert.match(part, /frameless\.<\/p>\n {2}<p class="fragment" data-fragment-index="1" style="translate: 0px 20px">Dark and light mode: [^<]*<code>for-dark<\/code> and <code>for-light<\/code>\.<\/p>\n {2}<ul style="translate: 0px 20px">\n {4}<li class="fragment" data-fragment-index="2">You might[^<]*<\/li>\n {4}<li class="fragment" data-fragment-index="3">You should/, part);
      assert.equal(await undoLabel(page), 'Undo Remove Bullet');
      await type(page, 'W');
      assert.ok(listPart(await render(page)).includes('<p class="fragment" data-fragment-index="1" style="translate: 0px 20px">WDark'), 'the caret is not at the start of the paragraph');
      await page.evaluate('window.BeesonEditor.undo()');
      await roundTrip(page, 2);
    });
  }
});

// regression tests of R15.11 on both platforms with trusted input: two lists of one kind joined
// when the paragraph between them is deleted, cut, or taken off by Backspace, a dash list and a
// numbered list left apart, and a range of cells pasted onto a slide as a new table with its bold
// and its formula. after each edit the text is checked byte for byte after an undo, the edit again
// after a redo, and after a save and an open
describe('two lists of one kind joined', () => {
  const LISTS = 'test/pages/editor-r13-3.html';
  const TABLES = 'test/pages/editor-tables.html';
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
  const settle = (page) => page.evaluate('new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), 100))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
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
    page.platform = platform;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await settle(page);
    return page;
  }

  // the edit checked against base after an undo, again after a redo, and after a save and an open
  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r15-11-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  const find = (selector, needle) => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;
  const ITEM = '.reveal section.present ol > li, .reveal section.present ul > li';

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

  // the lists of the current slide, each as its tag, its start above 1, and the first word of each
  // of its items
  const lists = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present > :is(ul, ol)')].map((l) => l.localName + (l.start > 1 ? ':' + l.start : '') + ' ' + [...l.children].filter((c) => c.localName === 'li').map((li) => li.textContent.trim().split(' ')[0]).join(','))`);

  // a trusted Mod+X or Mod+C, which the browser turns into a cut or a copy event, and the data that
  // it wrote
  async function clip(page, command) {
    const [key, code, kc] = command === 'cut' ? ['x', 'KeyX', 88] : ['c', 'KeyC', 67];
    const modifiers = page.platform === 'mac' ? 4 : 2;
    await page.evaluate(`(() => { window.__w = []; const o = DataTransfer.prototype.setData; DataTransfer.prototype.setData = function (t, v) { window.__w.push([t, v]); return o.call(this, t, v); }; })()`);
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: kc, modifiers, commands: [command] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc, modifiers });
    await settle(page);
    const w = await page.evaluate('window.__w');
    return { plain: w.find((x) => x[0] === 'text/plain')?.[1] ?? '', html: w.find((x) => x[0] === 'text/html')?.[1] ?? '' };
  }

  // the paragraph of the caret selected as an object by Esc
  async function selectParagraph(page) {
    await press(page, 'Escape');
    await settle(page);
    assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName)`), ['p'], 'the paragraph is not selected');
  }

  // the part of the file of slide 3 of the demo deck from its ul to its backdrop
  const listPart = (text) => {
    const at = text.indexOf('<h2>Show your steps one at a time');
    return text.slice(text.indexOf('<ul>', at), text.indexOf('<div class="backdrop"', at));
  };

  // Return twice at the end of the second item of slide 3 of the demo deck, which cuts its list in
  // two around an empty paragraph
  async function cutDemoList(page) {
    await caretIn(page, 'Two elements with the same');
    await press(page, 'Enter');
    await press(page, 'Enter');
    await settle(page);
    assert.deepEqual(await lists(page), ['ul Each,Two', 'ul When']);
  }

  for (const platform of PLATFORMS) {
    test(`two dash lists are joined after Delete of the paragraph between them, and after Backspace in an empty one (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 2);
      await cutDemoList(page);
      const empty = await render(page);
      // Backspace in the empty paragraph takes it off, which gives the list of the file back
      await press(page, 'Backspace');
      await settle(page);
      assert.equal(await render(page), page.source, `Backspace does not give the one list back: ${listPart(await render(page))}`);
      assert.deepEqual(await lists(page), ['ul Each,Two,When']);
      assert.equal(await undoLabel(page), 'Undo Join Paragraphs');
      await roundTrip(page, empty);
      await undo(page);
      await undo(page);
      assert.equal(await render(page), page.source);
      // a paragraph with text, selected as an object and deleted
      await caretIn(page, 'Two elements with the same');
      await press(page, 'Enter');
      await press(page, 'Enter');
      await type(page, 'Between');
      await settle(page);
      const between = await render(page);
      assert.match(listPart(between), /together\.<\/li>\n {2}<\/ul>\n {2}<p>Between<\/p>\n {2}<ul>/);
      await selectParagraph(page);
      await press(page, 'Delete');
      await settle(page);
      assert.equal(await render(page), page.source, `Delete does not give the one list back: ${listPart(await render(page))}`);
      assert.deepEqual(await lists(page), ['ul Each,Two,When']);
      assert.equal(await undoLabel(page), 'Undo Delete');
      await roundTrip(page, between);
    });

    test(`two numbered lists are joined after Cut of the paragraph between them, with the count continued and the start of the second dropped (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      // Backspace at the start of Seventh makes it a paragraph between the list of Alpha to Echo and
      // the list of Eighth, which keeps start="7"
      await caretIn(page, 'Seventh', false);
      await press(page, 'Backspace');
      await settle(page);
      const parted = await render(page);
      assert.ok(parted.includes('<li>Echo</li>\n  </ol>\n  <p>Seventh</p>\n  <ol start="7">\n    <li>Eighth</li>\n  </ol>'), parted);
      await selectParagraph(page);
      await clip(page, 'cut');
      await settle(page);
      const joined = await render(page);
      assert.ok(joined.includes('<li>Echo</li>\n    <li>Eighth</li>\n  </ol>\n</section>'), `the lists are not joined: ${joined.slice(joined.indexOf('<li>Echo'), joined.indexOf('</section>') + 10)}`);
      assert.ok(!joined.includes('start='), 'the start of the second list is kept');
      assert.deepEqual(await lists(page), ['ol Alpha,Bravo,Charlie,Delta,Echo,Eighth']);
      assert.equal(await undoLabel(page), 'Undo Cut');
      await roundTrip(page, parted);
    });

    test(`a dash list and a numbered list are left apart after Delete of the paragraph between them (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 2);
      await cutDemoList(page);
      await type(page, 'Between');
      await caretIn(page, 'When exporting');
      await exec(page, 'text.list.ol');
      await settle(page);
      assert.deepEqual(await lists(page), ['ul Each,Two', 'ol When']);
      const numbered = await render(page);
      await page.evaluate(`(() => { const p = ${find('.reveal section.present > p', 'Between')}; p.focus(); getSelection().collapse(p.firstChild, 3); })()`);
      await selectParagraph(page);
      await press(page, 'Delete');
      await settle(page);
      assert.deepEqual(await lists(page), ['ul Each,Two', 'ol When']);
      assert.match(listPart(await render(page)), /together\.<\/li>\n {2}<\/ul>\n {2}<ol>\n {4}<li class="fragment" data-fragment-index="3">When/);
      await roundTrip(page, numbered);
    });
  }

  const at = (page, r, c) => page.evaluate(`(() => { const t = Reveal.getCurrentSlide().querySelector('table'); const b = t.rows[${r}].cells[${c}].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);

  // the cells from a to b selected as a block, with a click and a Shift-click
  async function range(page, a, b) {
    await click(page, await at(page, ...a));
    await settle(page);
    await click(page, await at(page, ...b), { modifiers: 'Shift' });
    await settle(page);
    assert.ok(await page.evaluate(`(() => { const o = document.querySelector('.beeson-table-bars .cell.range'); return !!o && !o.hidden; })()`), 'the range is not selected');
  }


  // a paste event with the data plain and html at the focus, as the browser sends it
  async function paste(page, plain, html) {
    const done = await page.evaluate(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${js(plain)}); dt.setData('text/html', ${js(html)}); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(ev); return ev.defaultPrevented; })()`);
    assert.ok(done, 'the paste is not taken by the editor');
    await settle(page);
  }

  for (const platform of PLATFORMS) {
    test(`a range with a bold word and a formula pasted onto a slide is a new table with the bold and the formula (${platform})`, async (t) => {
      const page = await load(t, platform, TABLES, 1);
      const europa = await at(page, 2, 0);
      await click(page, europa);
      await settle(page);
      await click(page, europa, { count: 2 });
      await settle(page);
      await press(page, 'Mod+B');
      await settle(page);
      await press(page, 'Escape');
      await settle(page);
      const bold = await render(page);
      assert.ok(bold.includes('<tr><td><strong>Europa</strong></td><td>2.53e-5</td><td>Jupiter</td></tr>'));
      await range(page, [1, 0], [2, 1]);
      const { plain, html } = await clip(page, 'copy');
      assert.ok(html.includes('<td><strong>Europa</strong></td>') && html.includes('<td>\\(0.01215\\)</td>'), html);
      // the range is let go, and the paste is onto the first slide, whose table has merged cells
      await press(page, 'Escape');
      await press(page, 'Escape');
      await page.evaluate('Reveal.slide(0)');
      await settle(page);
      await page.evaluate('document.activeElement?.blur()');
      await paste(page, plain, html);
      const pasted = await render(page);
      // the place of the table is left to placeTable, the column of 2.53e-5 is one of numbers, and
      // the cells of the range keep their kind
      const right = '<td style="text-align: right">';
      const table = `<tbody>\n      <tr><td>Moon</td><td style="text-align: right">\\(0.01215\\)</td></tr>\n      <tr><td><strong>Europa</strong></td>${right}2.53e-5</td></tr>\n    </tbody>\n  </table>`;
      assert.ok(pasted.includes(table), `the new table is not written with its bold and its formula:\n${pasted.slice(pasted.indexOf('</table>') + 8, pasted.indexOf('A plain table'))}`);
      assert.equal(await undoLabel(page), 'Undo Paste');
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('table')[1].querySelectorAll('strong').length`), 1);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('table')[1].querySelectorAll('mjx-container').length`), 1);
      await roundTrip(page, bold);
    });
  }
});

// regression tests of R16.4 on both platforms with trusted input: the start of a list numbered by
// hand kept after its first item is taken off, the caret after an undo and a redo of Backspace in
// an empty paragraph after a list and of Return on an empty list item, and two lists left apart
// when they are locked or when the element deleted between them is a figure of the figure box. each edit
// is undone to the file byte for byte
describe('a hand-numbered start kept and Backspace undo', () => {
  const PLATFORMS = ['mac', 'other'];
  const LISTS = 'test/pages/editor-r13-3.html';
  const DECK = 'test/pages/editor-r16-4.html';

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
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
  let saves = 0;

  async function load(t, platform, deck, slide) {
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
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  // the edit checked against base after an undo, again after a redo, and after a save and an open
  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r16-4-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  // every entry undone, which must give the file of the page back byte for byte
  async function undoAll(page) {
    for (let n = 0; n < 20 && (await state(page)).enabled; n++) await undo(page);
    assert.equal(await render(page), page.source, 'the undo of every entry does not give the file back byte for byte');
  }
  const state = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo')`);

  const SLIDE = '.reveal .slides section.present';
  const find = (needle) => `[...document.querySelectorAll('${SLIDE} li')].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  // the caret put at the end of the item that holds needle, or with all true its text selected
  const caretIn = (page, needle, all = false) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].find((c) => c.nodeType === 3 && c.data.trim());
  li.closest('[contenteditable="true"]').focus();
  if (${all}) getSelection().setBaseAndExtent(n, 0, n, n.length);
  else getSelection().collapse(n, n.length);
})()`);

  // the caret put into the empty paragraph of the current slide
  const caretInEmpty = (page) => page.evaluate(`(() => {
  const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => !p.textContent.trim());
  p.closest('[contenteditable="true"]').focus();
  getSelection().collapse(p, 0);
})()`);

  const starts = (page) => page.evaluate(`[...document.querySelectorAll('${SLIDE} > ol')].map((ol) => ol.start)`);

  // one trusted key press of a letter with its text, as a keyboard types it, with Shift for a
  // capital
  async function key(page, ch) {
    const base = { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), modifiers: ch === ch.toUpperCase() ? 8 : 0 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page, 600);
  }

  // the key ch, typed after the file is base, must add one character to base at the bar of where,
  // a part of base with a bar at the caret, e.g. '<p>|</p>'
  async function typedAt(page, base, where, ch) {
    await key(page, ch);
    const text = await render(page);
    const at = base.indexOf(where.replace('|', ''));
    assert.ok(at >= 0, `${where} is not in the file`);
    const i = at + where.indexOf('|');
    let d = 0;
    while (d < text.length && text[d] === base[d]) d++;
    const got = text.length === base.length ? 'nowhere' : js(text.slice(Math.max(0, d - 30), d + 30));
    assert.ok(text === base.slice(0, i) + ch + base.slice(i), `the key ${ch} is not typed at ${js(where)} but ${got}`);
  }

  const SEVENTH = '<ol start="7">\n    <li>Seventh</li>\n    <li>Eighth</li>\n  </ol>';

  for (const platform of PLATFORMS) {
    // G16: the list of Eighth was marked as cut off, hence it went on with the list of Alpha to Echo
    const ROUTES = {
      'made a paragraph': { act: async (page) => { await caretIn(page, 'Seventh'); await exec(page, 'text.list.none'); } },
      'emptied and taken off by Return': {
        prep: async (page) => { await caretIn(page, 'Seventh', true); await press(page, 'Backspace'); },
        act: (page) => press(page, 'Enter'),
      },
    };
    for (const [route, { prep, act }] of Object.entries(ROUTES)) {
      test(`a list numbered by hand keeps its start after its first item is ${route} (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        assert.ok(page.source.includes(SEVENTH));
        if (prep) await prep(page);
        await wait(page);
        const base = await render(page);
        await act(page);
        await wait(page);
        const text = await render(page);
        assert.ok(/<\/ol>\n {2}<p>(Seventh)?<\/p>\n {2}<ol start="7">\n {4}<li>Eighth<\/li>/.test(text), `the list of Eighth does not keep start="7": ${js(text.slice(text.indexOf('<li>Echo'), text.indexOf('</section>')))}`);
        assert.deepEqual(await starts(page), [1, 7]);
        // a new item of the list before leaves the start as it is
        await caretIn(page, 'Alpha');
        await press(page, 'Enter');
        await wait(page);
        assert.deepEqual(await starts(page), [1, 7], 'a new item of the list before renumbers the list of Eighth');
        await undo(page);
        assert.equal(await render(page), text);
        await undo(page);
        assert.equal(await render(page), base);
        // the save and the open of roundTrip() clear the history, hence every entry is undone first
        if (prep) {
          await undoAll(page);
          await redo(page);
          assert.equal(await render(page), base);
        }
        await redo(page);
        await roundTrip(page, base);
      });
    }
  }

  for (const platform of PLATFORMS) {
    // G12: the caret was put back by its count of characters, which an empty paragraph does not
    // change, hence it went into the item after the paragraph or to the end of the list before it
    const CASES = [
      [0, '<p>|</p>\n  <ol start="2">', '<li>Pone|</li>', ['  </ol>\n  <p></p>\n  <ol start="2">\n', '']],
      [1, '</ul>\n  <p>|</p>', '<li>Btwo|</li>', ['</ul>\n  <p></p>\n', '</ul>\n']],
    ];
    for (const [slide, empty, last, [from, to]] of CASES) {
      test(`after an undo of Backspace in an empty paragraph after a list on slide ${slide}, the caret is in the paragraph, and after the redo at the end of the list (${platform})`, async (t) => {
        const page = await load(t, platform, DECK, slide);
        await caretInEmpty(page);
        await press(page, 'Backspace');
        await wait(page);
        const dropped = await render(page);
        assert.equal(dropped, page.source.replace(from, to), 'Backspace does not take the paragraph off');
        assert.equal(await undoLabel(page), 'Undo Join Paragraphs');
        await press(page, 'Mod+Z');
        await wait(page);
        assert.equal(await render(page), page.source);
        await typedAt(page, page.source, empty, 'Y');
        await undo(page);
        assert.equal(await render(page), page.source);
        // the redo puts the caret at the end of the last item of the list
        await caretInEmpty(page);
        await press(page, 'Backspace');
        await wait(page);
        await press(page, 'Mod+Z');
        await wait(page);
        await press(page, 'Mod+Shift+Z');
        await wait(page);
        assert.equal(await render(page), dropped);
        await typedAt(page, dropped, last, 'q');
        await undo(page);
        assert.equal(await render(page), dropped);
        await undoAll(page);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  for (const platform of PLATFORMS) {
    // G17: the text of the caret was taken off by the step, and the caret was not put back
    for (const [needle, what] of [['Echo', 'ends the list'], ['Bravo', 'cuts the list']]) {
      test(`after an undo of Return on an empty item that ${what}, the caret is in the item, and after the redo in the new paragraph (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        await caretIn(page, needle);
        await press(page, 'Enter');
        await wait(page);
        const item = await render(page);
        await press(page, 'Enter');
        await wait(page);
        const ended = await render(page);
        assert.ok(ended.includes(`<li>${needle}</li>\n  </ol>\n  <p></p>`), `Return does not take the empty item off: ${ended.slice(ended.indexOf('<li>Alpha'), ended.indexOf('</section>'))}`);
        assert.equal(await undoLabel(page), 'Undo New Paragraph');
        await press(page, 'Mod+Z');
        await wait(page);
        assert.equal(await render(page), item);
        await typedAt(page, item, `<li>${needle}</li>\n    <li>|</li>`, 'q');
        await undo(page);
        assert.equal(await render(page), item);
        // the typed key took the redo of Return away, hence Return is pressed again in the item
        await page.evaluate(`(() => { const li = ${find(needle)}.nextElementSibling; li.closest('[contenteditable="true"]').focus(); getSelection().collapse(li, 0); })()`);
        await press(page, 'Enter');
        await wait(page);
        assert.equal(await render(page), ended);
        await press(page, 'Mod+Z');
        await wait(page);
        await press(page, 'Mod+Shift+Z');
        await wait(page);
        assert.equal(await render(page), ended);
        await typedAt(page, ended, `<li>${needle}</li>\n  </ol>\n  <p>|</p>`, 'q');
        await undo(page);
        assert.equal(await render(page), ended);
        await undoAll(page);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  for (const platform of PLATFORMS) {
    // G14: two locked lists compared equal, hence the second was taken off and its items moved
    for (const k of ['Delete', 'Backspace']) {
      test(`${k} of the paragraph between two locked lists leaves both lists as they are (${platform})`, async (t) => {
        const page = await load(t, platform, DECK, 2);
        await page.evaluate(`(() => { const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => p.textContent.includes('Middle')); p.closest('[contenteditable="true"]').focus(); getSelection().collapse(p.firstChild, 3); })()`);
        await press(page, 'Escape');
        await wait(page);
        assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName)`), ['p']);
        await press(page, k);
        await wait(page);
        const text = await render(page);
        const part = text.slice(text.indexOf('<h2>Locked'), text.indexOf('</section>', text.indexOf('<h2>Locked')));
        assert.equal(text, page.source.replace('  <p>Middle three</p>\n', ''), `the locked lists are changed: ${js(part)}`);
        await roundTrip(page, page.source);
      });
    }

    // G13: every element taken from between two lists of the file joined them, also one drawn
    // outside the flow of their column
    test(`Delete of a figure of the zone between two lists in the file leaves both lists as they are (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 3);
      await click(page, await center(page, `${SLIDE} figure.figure-box img`));
      await wait(page);
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName)`), ['figure']);
      await press(page, 'Delete');
      await wait(page);
      const text = await render(page);
      const figure = page.source.slice(page.source.indexOf('  <figure class="figure-box">'), page.source.indexOf('</figure>') + 10);
      const part = text.slice(text.indexOf('<h2>A figure'), text.indexOf('</section>', text.indexOf('<h2>A figure')));
      assert.equal(text, page.source.replace(figure, ''), `the lists are changed: ${js(part)}`);
      assert.equal(await page.evaluate(`document.querySelectorAll('${SLIDE} > ul').length`), 2);
      await roundTrip(page, page.source);
    });
  }
});

// regression tests of R18.2 on both platforms with trusted input: Backspace and Delete in an empty
// paragraph next to a locked list, the caret after an undo and a redo of Return on an empty nested
// item, and the id of a list cut by List None. each edit is undone to the file byte for byte
describe('Backspace by a locked list, and List None', () => {
  const PLATFORMS = ['mac', 'other'];
  const LOCKED = 'test/pages/editor-r16-4.html';
  const DECK = 'test/pages/editor-r18-2.html';

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
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id) => page.evaluate(`window.BeesonEditor.exec(${js(id)})`);
  let saves = 0;

  async function load(t, platform, deck, slide) {
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
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  // the edit checked against base after an undo, again after a redo, and after a save and an open
  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r18-2-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    return edited;
  }

  // every entry undone, which must give the file of the page back byte for byte
  async function undoAll(page) {
    for (let n = 0; n < 20 && (await state(page)).enabled; n++) await undo(page);
    assert.equal(await render(page), page.source, 'the undo of every entry does not give the file back byte for byte');
  }
  const state = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo')`);

  const SLIDE = '.reveal .slides section.present';
  const find = (needle) => `[...document.querySelectorAll('${SLIDE} li')].findLast((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  // the caret put at the end of the item that holds needle, or with all true its text selected
  const caretIn = (page, needle, all = false) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].find((c) => c.nodeType === 3 && c.data.trim());
  li.closest('[contenteditable="true"]').focus();
  if (${all}) getSelection().setBaseAndExtent(n, 0, n, n.length);
  else getSelection().collapse(n, n.length);
})()`);

  // the caret put into the empty paragraph of the current slide
  const caretInEmpty = (page) => page.evaluate(`(() => {
  const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => !p.textContent.trim());
  p.closest('[contenteditable="true"]').focus();
  getSelection().collapse(p, 0);
})()`);

  // the caret put into the empty item of the current slide
  const caretInEmptyItem = (page) => page.evaluate(`(() => {
  const li = [...document.querySelectorAll('${SLIDE} li')].find((li) => !li.textContent.trim());
  li.closest('[contenteditable="true"]').focus();
  getSelection().collapse(li, 0);
})()`);

  // one trusted key press of a letter with its text, as a keyboard types it, with Shift for a
  // capital
  async function key(page, ch) {
    const base = { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), modifiers: ch === ch.toUpperCase() ? 8 : 0 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page, 600);
  }

  // the key ch, typed after the file is base, must add one character to base at the bar of where,
  // a part of base with a bar at the caret, e.g. '<p>|</p>'
  async function typedAt(page, base, where, ch) {
    await key(page, ch);
    const text = await render(page);
    const at = base.indexOf(where.replace('|', ''));
    assert.ok(at >= 0, `${where} is not in the file`);
    const i = at + where.indexOf('|');
    let d = 0;
    while (d < text.length && text[d] === base[d]) d++;
    const got = text.length === base.length ? 'nowhere' : js(text.slice(Math.max(0, d - 30), d + 30));
    assert.ok(text === base.slice(0, i) + ch + base.slice(i), `the key ${ch} is not typed at ${js(where)} but ${got}`);
  }


  for (const platform of PLATFORMS) {
    // C9: the paragraph was taken off, and the caret was put into the locked list, which takes no key
    test(`Backspace in an empty paragraph after a locked list leaves the paragraph and its caret in place (${platform})`, async (t) => {
      const page = await load(t, platform, LOCKED, 2);
      await page.evaluate(`(() => { const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => p.textContent.includes('Middle')); p.closest('[contenteditable="true"]').focus(); getSelection().selectAllChildren(p); })()`);
      await press(page, 'Backspace');
      await wait(page, 1200);
      const emptied = await render(page);
      assert.match(emptied, /<\/ul>\n {2}<p>(<br>)?<\/p>\n {2}<ul data-locked>/);
      await caretInEmpty(page);
      await press(page, 'Backspace');
      await wait(page);
      assert.equal(await render(page), emptied, 'Backspace changes the file');
      await key(page, 'q');
      const text = await render(page);
      assert.match(text, /<\/ul>\n {2}<p>q(<br>)?<\/p>\n {2}<ul data-locked>/, `the key q is not typed into the paragraph: ${js(text.slice(text.indexOf('<h2>Locked'), text.indexOf('</section>', text.indexOf('<h2>Locked'))))}`);
      await undoAll(page);
      assert.deepEqual(errors(page), []);
    });

    // the same with a forward Delete, on a paragraph that is empty in the file, since an emptied
    // paragraph keeps a br, at which Delete does not take it off
    test(`a forward Delete in an empty paragraph before a locked list leaves the paragraph and its caret in place (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 2);
      await caretInEmpty(page);
      await press(page, 'Delete');
      await wait(page);
      assert.equal(await render(page), page.source, 'Delete changes the file');
      await typedAt(page, page.source, '<p>|</p>', 'q');
      await undoAll(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    // C8: the caret was put back by the restore of the item that holds the nested list, at the end of
    // the item before
    test(`after an undo and a redo of Return on an empty nested item, a typed key is written in the empty item (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 0);
      await caretIn(page, 'Nsub');
      await press(page, 'Enter');
      await wait(page);
      const one = await render(page);
      assert.equal((one.match(/<li><\/li>/g) ?? []).length, 1, `Return does not add an empty nested item: ${js(one.slice(one.indexOf('<h2>A nested'), one.indexOf('</section>')))}`);
      await press(page, 'Enter');
      await wait(page);
      const two = await render(page);
      assert.notEqual(two, one, 'Return does not move the empty item out');
      assert.equal(await undoLabel(page), 'Undo New Paragraph');
      await press(page, 'Mod+Z');
      await wait(page);
      assert.equal(await render(page), one);
      await typedAt(page, one, '<li>|</li>', 'q');
      await undo(page);
      assert.equal(await render(page), one);
      await caretInEmptyItem(page);
      await press(page, 'Enter');
      await wait(page);
      assert.equal(await render(page), two);
      await press(page, 'Mod+Z');
      await wait(page);
      await press(page, 'Mod+Shift+Z');
      await wait(page);
      assert.equal(await render(page), two);
      await typedAt(page, two, '<li>|</li>', 'q');
      await undo(page);
      assert.equal(await render(page), two);
      await undoAll(page);
      assert.deepEqual(errors(page), []);
    });

    // C10: the list after the cut was written with every attribute of the list, its id included
    test(`List None on a middle item of a list with an id leaves the id on the first list alone (${platform})`, async (t) => {
      const page = await load(t, platform, DECK, 1);
      await caretIn(page, 'Itwo');
      await exec(page, 'text.list.none');
      await wait(page);
      const text = await render(page);
      const part = text.slice(text.indexOf('<ol id="plan"'), text.indexOf('</section>', text.indexOf('<ol id="plan"')));
      assert.equal(part, '<ol id="plan" data-id="plan">\n    <li>Ione</li>\n  </ol>\n  <p>Itwo</p>\n  <ol data-id="plan" start="2">\n    <li>Ithree</li>\n  </ol>\n', `the id is written twice: ${js(part)}`);
      assert.equal(await page.evaluate(`document.querySelectorAll('#plan').length`), 1);
      await roundTrip(page, page.source);
    });
  }
});

// regression tests of R19.6 on both platforms: a paste with a blank first line and Return over a
// selected text of a list item, each undone to the file byte for byte (D13), and the caret after a
// forward Delete in the empty paragraph between two lists and after its redo (D14)
describe('blank-line pastes and Delete between lists', () => {
  const PLATFORMS = ['mac', 'other'];
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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);

  async function load(t, platform, deck, slide) {
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
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }


  const SLIDE = '.reveal .slides section.present';
  const find = (needle) => `[...document.querySelectorAll('${SLIDE} li')].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  // the caret put at the end of the item that holds needle, or at the offset at of its first text,
  // or with at true its first text selected
  const caretIn = (page, needle, at = null) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].filter((c) => c.nodeType === 3 && c.data.trim()).at(${at === null ? -1 : 0});
  li.closest('[contenteditable="true"]').focus();
  if (${at === true}) getSelection().setBaseAndExtent(n, 0, n, n.length);
  else getSelection().collapse(n, ${at === null ? 'n.length' : Number(at)});
})()`);

  // the caret put at the start of the paragraph of the current slide whose text is text
  const caretInParagraph = (page, text) => page.evaluate(`(() => {
  const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => p.textContent.trim() === ${js(text)});
  p.closest('[contenteditable="true"]').focus();
  getSelection().collapse(p.firstChild ?? p, 0);
})()`);


  // one trusted key press of a letter with its text, as a keyboard types it, with Shift for a
  // capital
  async function key(page, ch) {
    const base = { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), modifiers: ch === ch.toUpperCase() ? 8 : 0 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page, 600);
  }

  // the key ch, typed after the file is base, must add one character to base at the bar of where,
  // a part of base with a bar at the caret, e.g. '<p>|</p>'
  async function typedAt(page, base, where, ch) {
    await key(page, ch);
    const text = await render(page);
    const at = base.indexOf(where.replace('|', ''));
    assert.ok(at >= 0, `${where} is not in the file`);
    const i = at + where.indexOf('|');
    let d = 0;
    while (d < text.length && text[d] === base[d]) d++;
    const got = text.length === base.length ? 'nowhere' : js(text.slice(Math.max(0, d - 30), d + 30));
    assert.ok(text === base.slice(0, i) + ch + base.slice(i), `the key ${ch} is not typed at ${js(where)} but ${got}`);
  }

  const SAME = 'Two elements with the same index are shown together.';
  async function undo1(page) { await press(page, 'Mod+Z'); await wait(page); }
  async function redo1(page) { await press(page, 'Mod+Shift+Z'); await wait(page); }

  // the text from offset from to offset to of the first text of the item that holds needle selected
  const selectText = (page, needle, from, to) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].find((c) => c.nodeType === 3 && c.data.trim());
  li.closest('[contenteditable="true"]').focus();
  getSelection().setBaseAndExtent(n, ${from}, n, ${to});
})()`);

  for (const platform of PLATFORMS) {
    // D13: the undo of the paste left <li>Bvo</li> and <li>Bra</li>, since the selected text was
    // taken off before the entry of the paste read the item
    const PASTES = [
      ['\nAone\nBtwo', 1, 3, '<li>B</li>\n    <li>Aone</li>\n    <li>Btwovo</li>'],
      ['\nAone', 3, 5, '<li>Bra</li>\n    <li>Aone</li>'],
    ];
    for (const [text, from, to, items] of PASTES) {
      test(`a paste of ${js(text)} over a selected text after other text of an item is undone byte for byte (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        await selectText(page, 'Bravo', from, to);
        await exec(page, 'edit.paste', text);
        await wait(page);
        assert.equal(await render(page), page.source.replace('<li>Bravo</li>', items));
        assert.equal(await undoLabel(page), 'Undo Paste');
        await undo(page);
        assert.equal(await render(page), page.source, 'one undo does not give the file back byte for byte');
        await redo(page);
        assert.equal(await render(page), page.source.replace('<li>Bravo</li>', items));
        assert.deepEqual(errors(page), []);
      });
    }

    // D13: the undo of Return over 'ra' left <li>Bvo</li>
    test(`Return over a selected text of an item is undone byte for byte (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      await selectText(page, 'Bravo', 1, 3);
      await press(page, 'Enter');
      await wait(page);
      assert.equal(await render(page), page.source.replace('<li>Bravo</li>', '<li>B</li>\n    <li>vo</li>'));
      await undo1(page);
      assert.equal(await render(page), page.source, 'one undo does not give the file back byte for byte');
      await redo1(page);
      assert.equal(await render(page), page.source.replace('<li>Bravo</li>', '<li>B</li>\n    <li>vo</li>'));
      await typedAt(page, await render(page), '<li>|vo</li>', 'w');
      assert.deepEqual(errors(page), []);
    });
  }

  const WHEN = '<li class="fragment" data-fragment-index="3">|When';

  // the caret put into the empty paragraph between two lists: on slide 3 of the demo deck by Return
  // twice at the end of an item, and in the deck of R16.4 directly
  async function emptyBetween(page, deck) {
    if (deck === 'test-deck.html') {
      await caretIn(page, SAME);
      await press(page, 'Enter');
      await press(page, 'Enter');
    } else await caretInParagraph(page, '');
    await wait(page);
  }

  for (const platform of PLATFORMS) {
    // D14: after the Delete, the focus was on body, and the key was lost
    for (const [deck, slide, where] of [['test-deck.html', 2, WHEN], ['test/pages/editor-r16-4.html', 0, '<li>|Qtwo</li>']]) {
      test(`after a forward Delete in the empty paragraph between two lists of ${deck}, a key is typed at the start of the first item of the second list (${platform})`, async (t) => {
        const page = await load(t, platform, deck, slide);
        await emptyBetween(page, deck);
        await press(page, 'Delete');
        await wait(page);
        assert.equal(await undoLabel(page), 'Undo Join Paragraphs');
        await typedAt(page, await render(page), where, 'w');
      });
    }

    // D14: after the redo, the focus was on body, or in the heading where the caret was put
    for (const away of [false, true]) {
      test(`after a redo of a forward Delete between two lists${away ? ' with the caret in the heading' : ''}, a key is typed at the start of the first item of the second list (${platform})`, async (t) => {
        const page = await load(t, platform, 'test-deck.html', 2);
        await emptyBetween(page, 'test-deck.html');
        await press(page, 'Delete');
        await wait(page);
        const joined = await render(page);
        await undo1(page);
        if (away) {
          const at = await page.evaluate(`(() => { const r = document.querySelector('${SLIDE} h2').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
          await click(page, at);
          await click(page, at);
          await wait(page);
          assert.ok(await page.evaluate(`!!document.activeElement?.matches('${SLIDE} h2')`), 'the caret is not in the heading');
        }
        await redo1(page);
        assert.equal(await render(page), joined);
        await typedAt(page, joined, WHEN, 'w');
      });
    }
  }
});
