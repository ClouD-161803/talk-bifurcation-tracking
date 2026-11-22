import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, captured, center, click, clickText, press, saveAndReopen, type, typeKeys } from './helpers/editor.mjs';

describe('list styles and the space after the caret', () => {
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

  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await undo(page);
    await byteExact(page);
    for (let i = 0; i < undos; i++) await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r14-7-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
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

  const ITEM = '.reveal section.present ul > li, .reveal section.present ol > li';
  const PARA = '.reveal section.present > p';
  const HEAD = '.reveal section.present > h2';

  const caretAtEnd = (page, i) => page.evaluate(`(() => {
  const li = document.querySelectorAll(${js(ITEM)})[${i}];
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim() && n.parentElement.closest('li') === li) last = n;
  li.closest('[contenteditable="true"]').focus();
  getSelection().collapse(last, last.length);
})()`);

  const caretIn = (page) => page.evaluate(`(() => {
  const s = getSelection();
  const n = s.focusNode;
  const el = n && (n.nodeType === 1 ? n : n.parentElement);
  return { tag: el?.localName ?? null, text: el?.textContent.trim().slice(0, 29) ?? null, editing: !!el?.closest('[contenteditable="true"]'), active: document.activeElement.localName, collapsed: s.isCollapsed };
})()`);

  const listPart = (text) => {
    const at = text.indexOf('<h2>Figures are first');
    return text.slice(at, text.indexOf('<figure class="figure-box">', at));
  };

  const kinds = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present ul > li, .reveal section.present ol > li, .reveal section.present > p')].map((e) => e.parentElement.localName + '>' + e.localName + ':' + e.textContent.slice(0, 8)).join(' | ')`);

  for (const platform of PLATFORMS) {
    for (const [id, tag] of [['text.list.ol', 'ol'], ['text.list.ul', 'ul']]) {
      test(`${tag === 'ol' ? 'Numbers' : 'Arrows'} after Paragraphs on a span of items acts on every paragraph of the span (${platform})`, async (t) => {
        const page = await load(t, platform);
        await clickText(page, await pointOf(page, ITEM, 'toggle', 2));
        await press(page, 'Mod+A');
        await exec(page, 'text.list.none');
        assert.equal(await kinds(page), 'section>p:Export y | section>p:Dark and | section>p:You migh | section>p:You shou');
        await exec(page, id);
        assert.equal(await kinds(page), `section>p:Export y | ${tag}>li:Dark and | ${tag}>li:You migh | ${tag}>li:You shou`);
        await press(page, 'Mod+I');
        const part = listPart(await render(page));
        assert.equal(part.match(new RegExp(`<${tag}`, 'g'))?.length, 1, `the list style does not make one list: ${part}`);
        assert.equal(part.match(/<em>/g)?.length, 3, `Italic after the list style does not format each item: ${part}`);
        await roundTrip(page, 3);
      });
    }
  }

  const caretBefore = (page, needle) => page.evaluate(`(() => {
  const li = ${find(ITEM, needle)};
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i < 0) continue;
    li.closest('[contenteditable="true"]').focus();
    getSelection().collapse(n, i);
    return;
  }
})()`);

  const ITEM_2 = '<li class="fragment" data-fragment-index="2">';

  for (const platform of PLATFORMS) {
    test(`Return before a space keeps the space at the start of the new item (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await caretBefore(page, ' with the same');
      await press(page, 'Enter');
      await type(page, 'X');
      const text = await render(page);
      assert.ok(text.includes(`${ITEM_2}Two elements</li>`), 'the first part is not written');
      assert.ok(text.includes(`${ITEM_2}X with the same index are shown together.</li>`), `the space after the caret is dropped: ${text.match(/>X[^<]*</)?.[0]}`);
      await roundTrip(page, 2);
    });

    test(`a paste of several lines before a space keeps the space after the last line (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await caretBefore(page, ' with the same');
      await page.evaluate(`window.BeesonEditor.exec('edit.paste', ' one\\ntwo\\nthree')`);
      await frames(page);
      const text = await render(page);
      assert.ok(text.includes(`${ITEM_2}Two elements one</li>`), 'the first line is not pasted at the caret');
      assert.ok(text.includes(`${ITEM_2}three with the same index are shown together.</li>`), `the space after the caret is dropped: ${text.match(/>three[^<]*</)?.[0]}`);
      await roundTrip(page, 1);
    });
  }

  for (const platform of PLATFORMS) {
    for (const [name, keys] of [['Shift+Tab', ['Shift+Tab']], ['Backspace', ['Home', 'Backspace']]]) {
      test(`after an undo of the outdent of ${name}, typing lands where the caret was before the outdent (${platform})`, async (t) => {
        const page = await load(t, platform);
        await clickText(page, await pointOf(page, ITEM, 'You might', 4));
        await press(page, 'Home');
        await press(page, 'Tab');
        const nested = await render(page);
        for (const key of keys) await press(page, key);
        assert.notEqual(await render(page), nested, `${name} does not outdent the item`);
        await undo(page);
        assert.equal(await render(page), nested);
        await type(page, 'Q');
        assert.match(listPart(await render(page)), />QYou might have noticed/, `Q is not typed at the start of the item: ${(await render(page)).match(/[^>]{0,20}Q<\/li>|>[^<]{0,10}Q[^<]{0,10}/)?.[0]}`);
      });
    }
    test(`after an undo of an outdent, the caret is in the nested item, and Shift+Tab takes it out again (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, ITEM, 'You might', 4));
      await press(page, 'Home');
      await press(page, 'Tab');
      const nested = await render(page);
      await press(page, 'Shift+Tab');
      const out = await render(page);
      assert.notEqual(out, nested);
      await undo(page);
      assert.equal(await render(page), nested);
      const caret = await caretIn(page);
      assert.equal(caret.tag, 'li', `the caret is in a ${caret.tag}`);
      assert.match(caret.text, /^You might/);
      assert.equal(await page.evaluate(`window.BeesonEditor.state('text.outdent').enabled`), true);
      await press(page, 'Shift+Tab');
      assert.equal(await render(page), out, 'Shift+Tab does not take the item out again');
      await undo(page);
      await undo(page);
      await redo(page);
      assert.equal(await render(page), nested);
      assert.equal((await caretIn(page)).tag, 'li');
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('the caret after undo of Return or typing', () => {
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
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const labels = async (page) => [(await state(page, 'edit.undo')).label, (await state(page, 'edit.redo')).label];
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

  const SLIDE = '.reveal .slides section.present';
  const find = (needle) => `[...document.querySelectorAll('${SLIDE} p, ${SLIDE} li')].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  const pointOf = (page, needle) => page.evaluate(`(() => {
  const r = ${find(needle)}.getClientRects()[0];
  return { x: r.left + Math.min(r.width / 2, 80), y: r.top + r.height / 2 };
})()`);

  const selected = (page) => page.evaluate(`(() => {
  const el = document.activeElement;
  return { els: window.BeesonEditor.selection().map((e) => e.localName), caret: !!el && !!el.closest('.reveal .slides') && el.isContentEditable };
})()`);

  async function key(page, ch) {
    const base = { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), modifiers: 0 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page);
  }

  async function typedIn(page, base, needle, ch) {
    await key(page, ch);
    const text = await render(page);
    assert.equal(text.length, base.length + 1, `the key ${ch} is not typed`);
    let i = 0;
    while (text[i] === base[i]) i++;
    assert.equal(text[i], ch);
    assert.equal(text.slice(0, i) + text.slice(i + 1), base);
    const at = base.indexOf(needle);
    assert.ok(i >= at && i <= at + needle.length, `the key ${ch} is not typed into the text of ${needle}`);
  }

  const DESIGN = "Design the complete slide first, then break it up into steps. Direct the viewer's attention.";
  const SAME = 'Two elements with the same index are shown together.';

  for (const platform of PLATFORMS) {
    for (const [where, needle] of [['a paragraph', DESIGN], ['a list item', SAME]]) {
      test(`after an undo and a redo of Return in ${where}, the caret stays in the text (${platform})`, async (t) => {
        const page = await load(t, platform, 'test-deck.html', 2);
        await clickText(page, await pointOf(page, needle));
        await caretIn(page, needle);
        await press(page, 'Enter');
        await wait(page);
        const split = await render(page);
        assert.notEqual(split, page.source, 'Return does not change the file');
        await press(page, 'Mod+Z');
        await wait(page);
        assert.equal(await render(page), page.source);
        assert.deepEqual(await selected(page), { els: [], caret: true }, 'the caret is not in the text after the undo');
        await press(page, 'Mod+Shift+Z');
        await wait(page);
        assert.equal(await render(page), split);
        assert.deepEqual(await selected(page), { els: [], caret: true }, 'the caret is not in the text after the redo');
        await press(page, 'Mod+Z');
        await wait(page);
        await typedIn(page, page.source, needle, 'q');
        assert.deepEqual(page.errors, []);
      });
    }

    test(`an undo of typing in one item of a list keeps the caret in the list when it is in another item (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 2);
      await clickText(page, await pointOf(page, SAME));
      await caretIn(page, SAME);
      await type(page, ' XY');
      await wait(page, 1200);
      assert.ok((await render(page)).includes(`${SAME} XY</li>`));
      await clickText(page, await pointOf(page, 'When exporting'));
      await wait(page);
      await press(page, 'Mod+Z');
      await wait(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(await selected(page), { els: [], caret: true }, 'the caret is not in the list after the undo');
      const at = page.source.indexOf('<li class="fragment" data-fragment-index="1">Each step');
      await typedIn(page, page.source, page.source.slice(at, page.source.indexOf('</ul>', at)), 'q');
      assert.deepEqual(page.errors, []);
    });
  }

  const X = '#beeson-edit-num-x';

  for (const platform of PLATFORMS) {
    test(`the toolbar button Undo enters a value typed into a field of the inspector, then undoes it (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 4);
      await clickText(page, await center(page, `${SLIDE} figure.figure-box img.for-dark`));
      await press(page, 'ArrowRight');
      await wait(page, 1100);
      const moved = await render(page);
      assert.notEqual(moved, page.source);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await wait(page);
      await exec(page, 'arrange.sizeAndPosition');
      await wait(page);
      await clickText(page, await center(page, X));
      await page.evaluate(`document.querySelector(${js(X)}).select()`);
      await type(page, '300');
      await wait(page);
      await click(page, await center(page, '[data-command="edit.undo"]'));
      await wait(page, 500);
      assert.equal(await render(page), moved, 'the toolbar Undo does not undo the typed value alone');
      assert.deepEqual(await labels(page), ['Undo Move', 'Redo Position']);
      assert.equal(await page.evaluate(`document.activeElement === document.querySelector(${js(X)})`), true, 'the field does not keep the focus');
      await press(page, 'Tab');
      await wait(page, 500);
      assert.equal(await render(page), moved, 'Tab enters a value after the undo');
      assert.deepEqual(await labels(page), ['Undo Move', 'Redo Position']);
      await undo(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });
  }

  const caretIn = (page, needle, all = false) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].find((c) => c.nodeType === 3 && c.data.trim());
  li.closest('[contenteditable="true"]').focus();
  if (${all}) getSelection().setBaseAndExtent(n, 0, n, n.length);
  else getSelection().collapse(n, n.length);
})()`);

  const cutPart = (text) => text.slice(text.indexOf('<li>Alpha'), text.indexOf('<li>Echo'));
  const starts = (page) => page.evaluate(`[...document.querySelectorAll('${SLIDE} > ol')].map((ol) => ol.start)`);

  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r15-13-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
  }

  for (const platform of PLATFORMS) {
    for (const [text, items] of [['\nA\nB', ['A', 'B']], ['\n\nA', ['A']], [' \r\nA\n', ['A']]]) {
      test(`a paste of ${js(text)} into an empty item makes an item for each line with text, in the same list (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        await caretIn(page, 'Bravo');
        await press(page, 'Enter');
        await wait(page);
        const empty = await render(page);
        await exec(page, 'edit.paste', text);
        await wait(page);
        const part = cutPart(await render(page));
        assert.equal(part, `<li>Alpha</li>\n    <li>Bravo</li>\n    ${items.map((i) => `<li>${i}</li>\n    `).join('')}<li>Charlie</li>\n    <li>Delta</li>\n    `, `the paste does not make items of the list: ${part}`);
        assert.equal((await state(page, 'edit.undo')).label, 'Undo Paste');
        await roundTrip(page, empty);
      });
    }

    test(`a paste of lines with a blank first line over a selected text gives the text back at the undo (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      await caretIn(page, 'Bravo', true);
      await exec(page, 'edit.paste', '\nA\nB');
      await wait(page);
      const part = cutPart(await render(page));
      assert.equal(part, '<li>Alpha</li>\n    <li>A</li>\n    <li>B</li>\n    <li>Charlie</li>\n    <li>Delta</li>\n    ', `the paste does not replace Bravo: ${part}`);
      await roundTrip(page, page.source);
    });
  }

  async function cutAfterBravo(page) {
    await caretIn(page, 'Bravo');
    await press(page, 'Enter');
    await press(page, 'Enter');
    await wait(page);
    const cut = await render(page);
    assert.match(cutPart(cut), /<li>Bravo<\/li>\n {2}<\/ol>\n {2}<p><\/p>\n {2}<ol start="3">\n {4}<li>Charlie<\/li>/);
    return cut;
  }

  const CHANGES = {
    'Alpha made a paragraph': { act: async (page) => { await caretIn(page, 'Alpha'); await exec(page, 'text.list.none'); }, tag: '<ol start="2">', starts: [1, 2, 7] },
    'the first list made a dash list': { act: async (page) => { await caretIn(page, 'Bravo'); await exec(page, 'text.list.ul'); }, tag: '<ol>', starts: [1, 7] },
    'the first list deleted': {
      act: async (page) => {
        await caretIn(page, 'Alpha');
        await press(page, 'Escape');
        await wait(page);
        assert.deepEqual((await selected(page)).els, ['ol']);
        await press(page, 'Backspace');
      },
      tag: '<ol>',
      starts: [1, 7],
    },
  };

  for (const platform of PLATFORMS) {
    for (const [name, change] of Object.entries(CHANGES)) {
      test(`the start of a list cut off by Return goes on with the numbered list before it after ${name} (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        const cut = await cutAfterBravo(page);
        await change.act(page);
        await wait(page);
        const text = await render(page);
        assert.ok(text.includes(`${change.tag}\n    <li>Charlie</li>`), `the list of Charlie does not start with ${change.tag}: ${text.slice(text.indexOf('<h2>'), text.indexOf('<li>Charlie') + 16)}`);
        assert.deepEqual(await starts(page), change.starts);
        await roundTrip(page, cut);
      });
    }
  }

  const START = '.beeson-edit-inspector input[name="Start at"]';

  async function showTab(page, name) {
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await wait(page);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === ${js(name)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (at) await clickText(page, at);
    await wait(page);
  }

  for (const platform of PLATFORMS) {
    test(`Return in Start at with the shown number keeps the start of a cut-off list, in one entry (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      const cut = await cutAfterBravo(page);
      await clickText(page, await pointOf(page, 'Charlie'));
      await showTab(page, 'Text');
      assert.equal(await page.evaluate(`document.querySelector(${js(START)}).value`), '3');
      await click(page, START, { count: 3 });
      await type(page, '3');
      await press(page, 'Enter');
      await wait(page);
      assert.equal(await render(page), cut, 'the shown number changes the file');
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Start At');
      await caretIn(page, 'Alpha');
      await press(page, 'Enter');
      await wait(page);
      assert.deepEqual(await starts(page), [1, 3, 7], 'the start entered into Start at is changed');
      await undo(page);
      assert.equal(await render(page), cut);
      await undo(page);
      assert.equal(await render(page), cut);
      assert.equal((await state(page, 'edit.undo')).label, 'Undo New Paragraph');
      await caretIn(page, 'Alpha');
      await press(page, 'Enter');
      await wait(page);
      assert.deepEqual(await starts(page), [1, 4, 7]);
      await undo(page);
      assert.equal(await render(page), cut);
      assert.deepEqual(page.errors, []);
    });
  }

  test('Start at takes 0 and negative numbers, from the field and from its arrows, and the deck counts from them', async (t) => {
    const page = await load(t, 'mac', LISTS, 0);
    await clickText(page, await pointOf(page, 'Alpha'));
    await showTab(page, 'Text');
    assert.equal(await page.evaluate(`document.querySelector(${js(START)}).value`), '1');
    await click(page, START, { count: 3 });
    await type(page, '0');
    await press(page, 'Enter');
    await page.waitFor(`document.querySelector('${SLIDE} > ol').start === 0`);
    assert.match(await render(page), /<ol start="0">\s*<li>Alpha/);
    await click(page, START);
    await press(page, 'ArrowDown');
    await page.waitFor(`document.querySelector('${SLIDE} > ol').start === -1`);
    assert.match(await render(page), /<ol start="-1">\s*<li>Alpha/);
    await saveAndReopen(page, 'start-at-negative.html');
    assert.deepEqual(page.errors, []);
  });

  const POSTER = '#beeson-edit-panel-format input[name=poster-frame]';

  const held = (page) => page.evaluate(`(() => {
  const a = document.activeElement;
  const slider = document.querySelector(${js(POSTER)});
  const same = slider === window.posterSlider;
  window.posterSlider = slider;
  return { els: window.BeesonEditor.selection().map((e) => e.localName), focus: a && a.localName + (a.type ? '.' + a.type : ''), same };
})()`);

  for (const platform of PLATFORMS) {
    test(`an undo and a redo of a change to the selected video keep the selection and the focus on the slider of the inspector (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 10);
      const at = await center(page, ".reveal:not(.beeson-peek) .slides > section.present video");
      await clickText(page, at);
      await clickText(page, at);
      await wait(page);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await page.waitFor(`!!document.querySelector('${POSTER}:not([disabled])')`, 10000);
      const r = await page.evaluate(`(() => { const r = document.querySelector(${js(POSTER)}).getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height / 2 }; })()`);
      await clickText(page, r);
      await captured(page, `window.BeesonEditor.render() !== ${js(page.source)}`);
      const poster = await render(page);
      assert.deepEqual(await held(page), { els: ['video'], focus: 'input.range', same: false });
      await press(page, 'Mod+Z');
      await wait(page, 600);
      assert.equal(await render(page), page.source);
      assert.deepEqual(await held(page), { els: ['video'], focus: 'input.range', same: true }, 'the undo changes the selection or the focus');
      await press(page, platform === 'mac' ? 'Mod+Shift+Z' : 'Mod+Y');
      await wait(page, 600);
      assert.equal(await render(page), poster);
      assert.deepEqual(await held(page), { els: ['video'], focus: 'input.range', same: true }, 'the redo changes the selection or the focus');
      assert.deepEqual(page.errors, []);
    });
  }
});

describe('pastes with blank lines, and undo of Return', () => {
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
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
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

  async function roundTrip(page, base) {
    const edited = await render(page);
    assert.notEqual(edited, base, 'the action does not change the file');
    await undo(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), edited, 'the redo does not write the edit again');
    const { text } = await saveAndReopen(page, `r17-7-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    return edited;
  }

  async function undoAll(page) {
    for (let n = 0; n < 20 && (await state(page)).enabled; n++) await undo(page);
    assert.equal(await render(page), page.source, 'the undo of every entry does not give the file back byte for byte');
  }
  const state = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo')`);

  const SLIDE = '.reveal .slides section.present';
  const find = (needle) => `[...document.querySelectorAll('${SLIDE} li')].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  const caretIn = (page, needle, at = null) => page.evaluate(`(() => {
  const li = ${find(needle)};
  const n = [...li.childNodes].filter((c) => c.nodeType === 3 && c.data.trim()).at(${at === null ? -1 : 0});
  li.closest('[contenteditable="true"]').focus();
  if (${at === true}) getSelection().setBaseAndExtent(n, 0, n, n.length);
  else getSelection().collapse(n, ${at === null ? 'n.length' : Number(at)});
})()`);

  const caretInParagraph = (page, text) => page.evaluate(`(() => {
  const p = [...document.querySelectorAll('${SLIDE} > p')].find((p) => p.textContent.trim() === ${js(text)});
  p.closest('[contenteditable="true"]').focus();
  getSelection().collapse(p.firstChild ?? p, 0);
})()`);

  const starts = (page) => page.evaluate(`[...document.querySelectorAll('${SLIDE} > ol')].map((ol) => ol.start)`);

  async function key(page, ch) {
    const base = { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), modifiers: ch === ch.toUpperCase() ? 8 : 0 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(page, 600);
  }

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
  const FRAG2 = '<li class="fragment" data-fragment-index="2">';

  for (const platform of PLATFORMS) {
    const CASES = [
      [LISTS, 0, 'Bravo', '<li>Bravo</li>\n    <li>Aone</li>\n    <li>Btwo</li>\n    <li>Cthree</li>\n    <li>Charlie</li>'],
      ['test-deck.html', 2, SAME, `${FRAG2}${SAME}</li>\n    ${FRAG2}Aone</li>\n    ${FRAG2}Btwo</li>\n    ${FRAG2}Cthree</li>\n    <li class="fragment" data-fragment-index="3">When`],
    ];
    for (const [deck, slide, needle, items] of CASES) {
      test(`a paste with a blank first line at the end of an item with text starts a new item in the same list in ${deck} (${platform})`, async (t) => {
        const page = await load(t, platform, deck, slide);
        await caretIn(page, needle);
        await exec(page, 'edit.paste', '\nAone\n\nBtwo\n\nCthree');
        await wait(page);
        const text = await render(page);
        assert.ok(text.includes(items), `the lines are not new items of the list: ${js(text.slice(text.indexOf(needle) - 10, text.indexOf(needle) + 260))}`);
        assert.equal(await undoLabel(page), 'Undo Paste');
        await roundTrip(page, page.source);
      });
    }

    test(`a paste of blank lines over a selected text of an item takes the text off, in one entry (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      await caretIn(page, 'Bravo', true);
      await exec(page, 'edit.paste', '\n\n');
      await wait(page);
      assert.equal(await render(page), page.source.replace('<li>Bravo</li>', '<li></li>'));
      assert.equal(await undoLabel(page), 'Undo Paste');
      await roundTrip(page, page.source);
    });
  }

  const STEPS = [
    ['the first undo', [undo1], (n) => `<li>${n}</li>\n    <li>|</li>`],
    ['the second undo', [undo1, undo1], (n) => `<li>${n}|</li>`],
    ['the first redo', [undo1, undo1, redo1], (n) => `<li>${n}</li>\n    <li>|</li>`],
    ['the second redo', [undo1, undo1, redo1, redo1], (n) => `<li>${n}</li>\n  </ol>\n  <p>|</p>`],
  ];
  async function undo1(page) { await press(page, 'Mod+Z'); await wait(page); }
  async function redo1(page) { await press(page, 'Mod+Shift+Z'); await wait(page); }

  for (const platform of PLATFORMS) {
    for (const [name, steps, where] of STEPS) {
      test(`after Return twice at the end of an item and ${name}, a typed key is written in the text of the step (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        await caretIn(page, 'Echo');
        await press(page, 'Enter');
        await wait(page);
        const one = await render(page);
        await press(page, 'Enter');
        await wait(page);
        const two = await render(page);
        for (const step of steps) await step(page);
        const base = [one, page.source, one, two][steps.length - 1];
        assert.equal(await render(page), base);
        assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), [], 'a block is selected');
        await typedAt(page, base, where('Echo'), 'q');
        await undo(page);
        assert.equal(await render(page), base);
        await undoAll(page);
      });
    }

    test(`after a redo of Return in the middle of an item, the caret is at the start of the new item (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      await caretIn(page, 'Bravo', 2);
      await press(page, 'Enter');
      await wait(page);
      const split = await render(page);
      assert.ok(split.includes('<li>Br</li>\n    <li>avo</li>'));
      await undo1(page);
      assert.equal(await render(page), page.source);
      await redo1(page);
      assert.equal(await render(page), split);
      await typedAt(page, split, '<li>|avo</li>', 'q');
      await undo(page);
      await undoAll(page);
    });

    test(`an undo of typing in an item after a click into the heading puts the caret into the item (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 2);
      await caretIn(page, SAME);
      await type(page, ' XY');
      await wait(page, 1200);
      const typed = await render(page);
      assert.ok(typed.includes(`${SAME} XY</li>`));
      const h2 = await page.evaluate(`(() => { const r = document.querySelector('${SLIDE} h2').getClientRects()[0]; return { x: r.left + 40, y: r.top + r.height / 2 }; })()`);
      await clickText(page, h2);
      await wait(page);
      await press(page, 'Mod+Z');
      await wait(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), [], 'a block is selected');
      await typedAt(page, page.source, `${SAME}|</li>`, 'q');
      await undoAll(page);
    });

    for (const [keys, label, text, at] of [['XY', 'Undo Typing', SAME, 4], ['"', 'Undo Smart Quote', SAME.replace('Two ', 'Two "'), 5]]) {
      test(`an undo of ${label.slice(5).toLowerCase()} inside an item after a click into the heading puts the caret where the text changed (${platform})`, async (t) => {
        const page = await load(t, platform, 'test-deck.html', 2);
        await caretIn(page, SAME, 4);
        await typeKeys(page, keys);
        await page.waitFor(`${find(SAME.slice(0, 3))}.textContent.length > ${SAME.length}`);
        const h2 = await page.evaluate(`(() => { const r = document.querySelector('${SLIDE} h2').getClientRects()[0]; return { x: r.left + 40, y: r.top + r.height / 2 }; })()`);
        await clickText(page, h2);
        await page.waitFor(`document.querySelector('${SLIDE} h2').contains(getSelection().focusNode)`);
        assert.equal(await undoLabel(page), label);
        await press(page, 'Mod+Z');
        await page.waitFor(`window.BeesonEditor.state('edit.redo').enabled`);
        const caret = await page.evaluate(`(() => {
        const li = ${find(SAME.slice(0, 3))};
        const s = getSelection();
        if (!s.rangeCount || !s.isCollapsed || !li.contains(s.focusNode)) return null;
        const r = document.createRange();
        r.setStart(li, 0);
        r.setEnd(s.focusNode, s.focusOffset);
        return { text: li.textContent, at: r.toString().length };
      })()`);
        assert.deepEqual(caret, { text, at });
      });
    }
  }

  for (const platform of PLATFORMS) {
    test(`Backspace at the start of a paragraph after a list joins its text onto the last item, and the lists around it (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 2);
      await caretIn(page, SAME);
      await press(page, 'Enter');
      await press(page, 'Enter');
      await type(page, 'Between');
      await wait(page, 1200);
      const between = await render(page);
      assert.ok(between.includes(`${SAME}</li>\n  </ul>\n  <p>Between</p>\n  <ul>`));
      await caretInParagraph(page, 'Between');
      await press(page, 'Backspace');
      await wait(page);
      assert.equal(await render(page), page.source.replace(`${SAME}</li>`, `${SAME}Between</li>`));
      assert.equal(await undoLabel(page), 'Undo Join Paragraphs');
      await typedAt(page, await render(page), `${SAME}|Between</li>`, 'q');
      await undo(page);
      await roundTrip(page, between);
    });

    test(`a forward Delete in the empty paragraph between two lists takes it off and joins the lists (${platform})`, async (t) => {
      const page = await load(t, platform, 'test-deck.html', 2);
      await caretIn(page, SAME);
      await press(page, 'Enter');
      await press(page, 'Enter');
      await wait(page);
      const empty = await render(page);
      assert.ok(empty.includes(`${SAME}</li>\n  </ul>\n  <p></p>\n  <ul>`));
      await press(page, 'Delete');
      await wait(page);
      assert.equal(await render(page), page.source);
      assert.equal(await undoLabel(page), 'Undo Join Paragraphs');
      await roundTrip(page, empty);
    });
  }

  const START = '.beeson-edit-inspector input[name="Start at"]';

  async function showTab(page, name) {
    if (!(await page.evaluate(`window.BeesonEditor.state('shell.format').checked`))) await exec(page, 'shell.format');
    await wait(page);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-inspector .ed-tabs button')].find((b) => b.textContent.trim() === ${js(name)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (at) await clickText(page, at);
    await wait(page);
  }

  async function typedStart(page, value) {
    await caretIn(page, 'Bravo');
    await press(page, 'Enter');
    await press(page, 'Enter');
    await wait(page);
    const cut = await render(page);
    assert.ok(cut.includes('<ol start="3">\n    <li>Charlie</li>'));
    await clickText(page, await page.evaluate(`(() => { const r = ${find('Charlie')}.getClientRects()[0]; return { x: r.left + 30, y: r.top + r.height / 2 }; })()`));
    await showTab(page, 'Text');
    assert.equal(await page.evaluate(`document.querySelector(${js(START)}).value`), '3');
    await click(page, await page.evaluate(`(() => { const r = document.querySelector(${js(START)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`), { count: 3 });
    await type(page, value);
    return cut;
  }

  for (const platform of PLATFORMS) {
    const LEAVES = {
      Tab: (page) => press(page, 'Tab'),
      'a click outside the field': async (page) => clickText(page, await page.evaluate(`(() => { const r = document.querySelector('${SLIDE} h2').getClientRects()[0]; return { x: r.left + 40, y: r.top + r.height / 2 }; })()`)),
    };
    for (const [name, leave] of Object.entries(LEAVES)) {
      test(`the shown number of a cut-off list typed into Start at and entered with ${name} is kept (${platform})`, async (t) => {
        const page = await load(t, platform, LISTS, 0);
        const cut = await typedStart(page, '3');
        await leave(page);
        await wait(page);
        assert.equal(await render(page), cut, 'the shown number changes the file');
        assert.equal(await undoLabel(page), 'Undo Start At');
        await caretIn(page, 'Alpha');
        await press(page, 'Enter');
        await wait(page);
        assert.deepEqual(await starts(page), [1, 3, 7], 'the start entered into Start at is changed');
        await undo(page);
        await undo(page);
        assert.equal(await render(page), cut);
        await undoAll(page);
      });
    }

    test(`a typed 2.5 in Start at is refused, and the field shows its value again (${platform})`, async (t) => {
      const page = await load(t, platform, LISTS, 0);
      const cut = await typedStart(page, '2.5');
      await press(page, 'Enter');
      await wait(page);
      assert.equal(await render(page), cut);
      assert.equal(await undoLabel(page), 'Undo New Paragraph');
      assert.equal(await page.evaluate(`document.querySelector(${js(START)}).value`), '3');
      await caretIn(page, 'Alpha');
      await press(page, 'Enter');
      await wait(page);
      assert.deepEqual(await starts(page), [1, 4, 7], 'the cut-off list does not go on with the list before');
      await undoAll(page);
    });
  }
});
