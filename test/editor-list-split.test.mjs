import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

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
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id, arg = '') => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg ? `, ${arg}` : ''})`);
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await undo(page);
    await byteExact(page);
    for (let i = 0; i < undos; i++) await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r11-2-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    page.source = text;
    return edited;
  }

  const find = (selector, needle = '') => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

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

  const caretAtEnd = (page, i) => page.evaluate(`(() => {
  const li = document.querySelectorAll(${js(ITEM)})[${i}];
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) last = n;
  li.closest('[contenteditable="true"]').focus();
  getSelection().collapse(last, last.length);
})()`);

  const caretElement = (page) => page.evaluate(`(() => {
  const n = getSelection().focusNode;
  const host = (n.nodeType === 1 ? n : n.parentElement).closest('[contenteditable="true"]');
  return host ? { tag: host.localName, text: host.textContent.trim() } : null;
})()`);

  const line = (text, head) => text.split('\n').find((l) => l.includes(`>${head}`))?.trim();

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
        assert.deepEqual(page.errors, []);
      });
    }

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
      assert.equal(await page.evaluate(`(() => { const n = getSelection().focusNode; const li = (n.nodeType === 1 ? n : n.parentElement).closest('[contenteditable="true"]'); return li.localName === 'li' && li.textContent.trim().startsWith('You should') && !li.parentElement.closest('li'); })()`), true, 'the caret is not in the outdented item');
      await roundTrip(page);
    });
  }

  async function modShift(page, platform, key, code, keyCode) {
    const base = { key, code, windowsVirtualKeyCode: keyCode, modifiers: (platform === 'mac' ? 4 : 2) | 8 };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  const SMALLER = ['<', 'Comma', 188];
  const BIGGER = ['>', 'Period', 190];

  async function selectBoth(page) {
    await clickText(page, await pointOf(page, PARA, 'figure', 2));
    await press(page, 'Escape');
    await frames(page);
    await click(page, await pointOf(page, ITEM, 'toggle', 2), { modifiers: 'Shift' });
    await frames(page);
  }

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

  const caretX = (page) => page.evaluate(`(() => {
  const r = getSelection().getRangeAt(0).cloneRange();
  const box = r.getClientRects()[0] ?? r.getBoundingClientRect();
  return box.left;
})()`);

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

  const lineEnds = (page, i) => page.evaluate(`(() => {
  const li = document.querySelectorAll(${js(ITEM)})[${i}];
  const r = document.createRange();
  r.selectNodeContents(li);
  const lines = [...r.getClientRects()].filter((b) => b.height > 0 && b.width > 0);
  const bottom = Math.max(...lines.map((b) => b.bottom));
  const top = Math.min(...lines.map((b) => b.top));
  return { last: Math.max(...lines.filter((b) => b.bottom > bottom - 4).map((b) => b.right)), first: Math.max(...lines.filter((b) => b.top < top + 4).map((b) => b.right)) };
})()`);

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
      await press(page, 'ArrowLeft');
      await press(page, 'ArrowLeft');
      const x3 = await caretX(page);
      await press(page, 'ArrowDown');
      await press(page, 'ArrowDown');
      const x4 = await caretX(page);
      assert.ok(Math.abs(x4 - x3) < 20, `after ArrowLeft, ArrowDown puts the caret at x ${x4}, away from its new column at ${x3}`);
      assert.deepEqual(page.errors, []);
    });
  }

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

  async function command(page, name) {
    const modifiers = (page.platform === 'mac' ? 4 : 2) | (name === 'redo' ? 8 : 0);
    const base = { key: name === 'redo' ? 'Z' : 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [name] });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await frames(page);
    await frames(page);
  }

  const find = (selector, needle = '') => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

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

  for (const platform of PLATFORMS) {
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
        assert.deepEqual(page.errors, []);
      });
    }
  }

  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r13-6-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
  }

  const listPart = (text) => {
    const at = text.indexOf('<h2>Figures are first');
    return text.slice(at, text.indexOf('<figure class="figure-box">', at));
  };

  async function nested(t, platform) {
    const page = await load(t, platform, 4);
    await clickText(page, await pointOf(page, ITEM, 'You might'));
    await press(page, 'Home');
    await press(page, 'Tab');
    assert.match(listPart(await render(page)), /for-light<\/code>\.\n {6}<ul>\n {8}<li class="fragment" data-fragment-index="2">You might/);
    return page;
  }

  for (const platform of PLATFORMS) {
    test(`Backspace at the start of a nested first item is named as the outdent, Decrease Indent Level (${platform})`, async (t) => {
      const page = await nested(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'You might'));
      await press(page, 'Home');
      await press(page, 'Backspace');
      assert.equal(await undoLabel(page), 'Undo Decrease Indent Level');
      await byteExact(page);
      await page.evaluate('window.BeesonEditor.undo()');
      assert.match(listPart(await render(page)), /for-light<\/code>\.\n {6}<ul>\n {8}<li class="fragment" data-fragment-index="2">You might/);
      await page.evaluate('window.BeesonEditor.redo()');
      await byteExact(page);
    });
  }

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
