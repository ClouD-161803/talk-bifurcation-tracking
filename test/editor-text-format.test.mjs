import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

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
  for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
  await byteExact(page);
  for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
  assert.equal(await render(page), edited);
  const { text } = await saveAndReopen(page, `r9-6-${++saves}.html`);
  assert.equal(text, edited);
  assert.deepEqual(page.errors, []);
  page.source = text;
  return edited;
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
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
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

const selection = (page) => page.evaluate(`(() => {
  const s = getSelection();
  if (!s.rangeCount) return null;
  const r = s.getRangeAt(0);
  const host = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('[contenteditable="true"]');
  const head = document.createRange();
  if (host) { head.selectNodeContents(host); head.setEnd(r.startContainer, r.startOffset); }
  return { text: s.toString(), collapsed: s.isCollapsed, before: host ? head.toString() : null };
})()`);

const PARA = '.reveal section.present > p';

for (const platform of PLATFORMS) {
  for (const [key, tag] of [['B', 'strong'], ['I', 'em']]) {
    for (const [where, k, after] of [
      ['inside', 3, `<p>Export your matplotlib <${tag}>figXure</${tag}> with`],
      ['at the end of', 6, `<p>Export your matplotlib figure<${tag}>X</${tag}> with`],
      ['at the start of', 0, `<p>Export your matplotlib <${tag}>X</${tag}>figure with`],
    ]) {
      test(`Mod+${key} with the caret ${where} a word keeps the caret where it was (${platform})`, async (t) => {
        const page = await load(t, platform);
        await clickText(page, await pointOf(page, PARA, 'figure', 2));
        await caretAt(page, PARA, 'figure', k);
        const before = await selection(page);
        await press(page, `Mod+${key}`);
        const now = await selection(page);
        assert.equal(now.collapsed, true, `Mod+${key} selects "${now.text}"`);
        assert.equal(now.before, before.before, 'the caret moved');
        await type(page, 'X');
        const text = await render(page);
        assert.ok(text.includes(after), `the paragraph is written as ${text.match(/<p>Export[^\n]*/)?.[0]}`);
        await roundTrip(page, k === 3 ? 2 : 1);
      });
    }
  }
}

const WATCH_F3 = `window.addEventListener('keydown', (e) => { if (e.key === 'F3') window.f3 = e; }, true)`;
const prevented = async (page, keys) => {
  await page.evaluate('window.f3 = null');
  await press(page, keys);
  return page.evaluate('window.f3 ? window.f3.defaultPrevented : null');
};

for (const platform of PLATFORMS) {
  test(`F3, Shift+F3, and Mod+Shift+F3 are prevented in every state (${platform})`, async (t) => {
    const page = await load(t, platform);
    await page.evaluate(WATCH_F3);
    const states = [
      ['on the canvas', async () => {
        await press(page, 'Escape');
        await press(page, 'Escape');
      }],
      ['in a text between two words', async () => {
        await clickText(page, await pointOf(page, PARA, 'figure', 2));
        await caretAt(page, PARA, 'figure', 6);
      }],
      ['in the empty field of the Find panel', async () => {
        await press(page, 'Mod+F');
        await page.waitFor(`document.activeElement?.closest('.beeson-find') !== null`);
      }],
    ];
    for (const [where, enter] of states) {
      await enter();
      for (const keys of ['F3', 'Shift+F3', 'Mod+Shift+F3']) assert.equal(await prevented(page, keys), true, `${keys} ${where} is left to the browser`);
    }
    assert.equal(await render(page), page.source);
    assert.deepEqual(page.errors, []);
  });
}

const ITEM = '.reveal section.present ul > li';
const ITEMS = [
  '<li class="fragment" data-fragment-index="1">Dark and light mode: export one file per mode, marked <code>for-dark</code> and <code>for-light</code>.</li>',
  '<li class="fragment" data-fragment-index="2">You might have noticed a toggle on the top right: try clicking it on this slide.</li>',
  '<li class="fragment" data-fragment-index="3">You should give black-on-white plots the class <code>invert</code> to invert them in dark mode.</li>',
];
const caretAtEnd = (page, i) => page.evaluate(`(() => {
  const li = document.querySelectorAll(${js(ITEM)})[${i}];
  const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) last = n;
  getSelection().collapse(last, last.length);
})()`);
const hostText = (page) => page.evaluate(`(() => {
  const n = getSelection().focusNode;
  return (n.nodeType === 1 ? n : n.parentElement).closest('[contenteditable="true"]')?.textContent.trim() ?? null;
})()`);
const written = (text, head) => text.split('\n').find((l) => l.includes(`>${head}`) || l.includes(`<strong>${head}`) || l.includes(`<em>${head}`))?.trim();

for (const platform of PLATFORMS) {
  test(`the arrows move the caret over the border of two items and of two paragraphs (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickText(page, await pointOf(page, ITEM, 'Dark and light', 2));
    await caretAtEnd(page, 0);
    await press(page, 'ArrowRight');
    assert.match(await hostText(page), /^You might/, 'ArrowRight at the end of an item stays in it');
    await press(page, 'ArrowLeft');
    assert.match(await hostText(page), /^Dark and light/, 'ArrowLeft at the start of an item stays in it');
    await press(page, 'ArrowDown');
    assert.match(await hostText(page), /^You might/, 'ArrowDown on the last line of an item stays in it');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    assert.match(await hostText(page), /^You should/, 'ArrowDown does not reach the third item');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    assert.match(await hostText(page), /^Dark and light/, 'ArrowUp on the first line of an item stays in it');
    await caretAtEnd(page, 0);
    await press(page, 'ArrowRight');
    await type(page, 'Q');
    assert.equal(written(await render(page), 'QYou'), ITEMS[1].replace('>You', '>QYou'));
    await roundTrip(page);

    await page.evaluate('Reveal.slide(8)');
    await frames(page);
    await clickText(page, await pointOf(page, '.reveal section.present > p', 'gravitational', 2));
    await caretAt(page, '.reveal section.present > p', 'blue,', 5);
    await press(page, 'ArrowRight');
    assert.match(await hostText(page), /^and the centrifugal/, 'ArrowRight at the end of a paragraph stays in it');
    await press(page, 'ArrowUp');
    assert.match(await hostText(page), /^The gravitational/, 'ArrowUp on the first line of a paragraph stays in it');
  });

  const dragOver = async (page, quick = false) => {
    const from = await pointOf(page, ITEM, 'toggle', 0);
    const to = await pointOf(page, ITEM, 'mode.', 4);
    const [x0, x1] = [from.x - 3, to.x + 8];
    await clickText(page, { x: x0, y: from.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: from.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
    const sent = [];
    for (let i = 1; i <= 10; i++) {
      sent.push(page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10, button: 'left', buttons: 1 }));
      if (!quick) await sent.at(-1);
    }
    sent.push(page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: to.y, button: 'left', clickCount: 1 }));
    await Promise.all(sent);
    await frames(page);
  };

  test(`a drag from one item into the next selects over both, and Bold acts on both (${platform})`, async (t) => {
    const page = await load(t, platform);
    await dragOver(page);
    await press(page, 'Mod+B');
    const text = await render(page);
    assert.equal(written(text, 'You might'), ITEMS[1].replace('toggle on the top right: try clicking it on this slide.', '<strong>toggle on the top right: try clicking it on this slide.</strong>'));
    assert.equal(written(text, 'You should'), ITEMS[2].replace('>You should', '><strong>You should').replace('mode.</li>', 'mode.</strong></li>'));
    await roundTrip(page);
  });

  test(`a quick drag from one item into the next selects over both (${platform})`, async (t) => {
    const page = await load(t, platform);
    await dragOver(page, true);
    await press(page, 'Mod+B');
    const text = await render(page);
    assert.equal(written(text, 'You might'), ITEMS[1].replace('toggle on the top right: try clicking it on this slide.', '<strong>toggle on the top right: try clicking it on this slide.</strong>'));
    assert.equal(written(text, 'You should'), ITEMS[2].replace('>You should', '><strong>You should').replace('mode.</li>', 'mode.</strong></li>'));
    await roundTrip(page);
  });

  test(`Tab after a drag over two items indents both (${platform})`, async (t) => {
    const page = await load(t, platform);
    await dragOver(page);
    await press(page, 'Tab');
    const nested = /for-light<\/code>\.\s*<ul>\s*<li class="fragment" data-fragment-index="2">You might[^\n]*<\/li>\s*<li class="fragment" data-fragment-index="3">You should[^\n]*<\/li>\s*<\/ul>\s*<\/li>/;
    assert.match(await render(page), nested, 'Tab does not indent both items');
    await roundTrip(page);
    const tabbed = page.source;
    await dragOver(page);
    await press(page, 'Shift+Tab');
    assert.equal(await render(page), readFileSync('test-deck.html', 'utf8'), 'Shift+Tab does not outdent both items');
    await page.evaluate('window.BeesonEditor.undo()');
    assert.equal(await render(page), tabbed);
  });

  test(`Mod+A in an item selects the text of the whole list, and Bold acts on every item (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickText(page, await pointOf(page, ITEM, 'toggle', 2));
    await press(page, 'Mod+A');
    await press(page, 'Mod+B');
    const text = await render(page);
    for (const [i, head] of [[0, 'Dark'], [1, 'You might'], [2, 'You should']]) {
      assert.equal(written(text, head), ITEMS[i].replace(/(data-fragment-index="\d">)(.*)<\/li>/, '$1<strong>$2</strong></li>'));
    }
    await roundTrip(page);
  });

  test(`Shift with the arrows selects over the border of two items, and Backspace deletes the selection (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickText(page, await pointOf(page, ITEM, 'toggle', 2));
    await caretAt(page, ITEM, 'slide.', 5);
    for (let i = 0; i < 5; i++) await press(page, 'Shift+ArrowRight');
    await press(page, 'Backspace');
    const text = await render(page);
    assert.equal(written(text, 'You might'), ITEMS[1].replace('slide.</li>', 'slide should give black-on-white plots the class <code>invert</code> to invert them in dark mode.</li>'));
    assert.equal(written(text, 'You should'), undefined);
    await roundTrip(page);
  });

  test(`a typed character replaces a selection over two items (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickText(page, await pointOf(page, ITEM, 'toggle', 2));
    await caretAt(page, ITEM, 'slide.', 5);
    for (let i = 0; i < 5; i++) await press(page, 'Shift+ArrowRight');
    await type(page, 'Z');
    assert.equal(written(await render(page), 'You might'), ITEMS[1].replace('slide.</li>', 'slideZ should give black-on-white plots the class <code>invert</code> to invert them in dark mode.</li>'));
    await roundTrip(page);
  });
}

const selectText = (page, selector, needle, k = needle.length) => page.evaluate(`(() => {
  const el = ${find(selector, needle)};
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(needle)});
    if (i < 0) continue;
    el.closest('[contenteditable="true"]').focus();
    return void getSelection().setBaseAndExtent(n, i, n, i + ${k});
  }
})()`);

for (const platform of PLATFORMS) {
  for (const [name, run] of [
    ['Bold', (page) => press(page, 'Mod+B')],
    ['Italic', (page) => press(page, 'Mod+I')],
    ['a text color', (page) => page.evaluate(`window.BeesonEditor.exec('text.tone.accent')`)],
  ]) {
    test(`an undo and a redo of ${name} on a word select the word again (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, PARA, 'figure', 2));
      await selectText(page, PARA, 'figure');
      await run(page);
      assert.equal((await selection(page)).text, 'figure');
      for (const step of ['undo', 'redo']) {
        await caretAt(page, PARA, 'Export', 0);
        await page.evaluate(`window.BeesonEditor.${step}()`);
        await frames(page);
        const s = await selection(page);
        assert.equal(s.text, 'figure', `after the ${step}, "${s.text}" is selected, with "${s.before}" before the caret`);
      }
      await roundTrip(page);
    });
  }
}

async function modShift(page, platform, key, code, keyCode) {
  const base = { key, code, windowsVirtualKeyCode: keyCode, modifiers: (platform === 'mac' ? 4 : 2) | 8 };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

for (const platform of PLATFORMS) {
  for (const [name, key, code, keyCode] of [['Bigger', '>', 'Period', 190], ['Smaller', '<', 'Comma', 188]]) {
    test(`${name} on a selected word keeps the word selected (${platform})`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, await pointOf(page, PARA, 'figure', 2));
      await selectText(page, PARA, 'figure');
      await modShift(page, platform, key, code, keyCode);
      await frames(page);
      assert.notEqual(await render(page), page.source, `Mod+Shift+${key} does not change the paragraph`);
      const s = await selection(page);
      assert.equal(s.text, 'figure', `after ${name}, "${s.text}" is selected, with "${s.before}" before the caret`);
      await roundTrip(page);
    });
  }
}

const findButton = (page, label) => page.evaluate(`(() => {
  const b = [...document.querySelectorAll('.beeson-find button')].find((e) => e.textContent.trim() === ${js(label)});
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
const findOpen = (page) => page.evaluate(`(() => { const f = document.querySelector('.beeson-find'); return !!f && !f.hidden; })()`);

for (const platform of PLATFORMS) {
  for (const label of ['Replace All', 'Replace']) {
    test(`after ${label} leaves no match, the focus stays in the Find panel and Esc closes it (${platform})`, async (t) => {
      const page = await load(t, platform);
      await press(page, 'Ctrl+H');
      await page.waitFor(`document.activeElement?.closest('.beeson-find') !== null`);
      await type(page, 'frameless');
      await clickText(page, await page.evaluate(`(() => {
        const r = document.querySelectorAll('.beeson-find input')[1].getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`));
      await type(page, 'borderless');
      await clickText(page, await findButton(page, label));
      await page.waitFor(`window.BeesonEditor.render().includes('borderless')`);
      await frames(page);
      const active = await page.evaluate(`(() => { const a = document.activeElement; return a.closest('.beeson-find') ? 'panel' : a.outerHTML.slice(0, 60); })()`);
      assert.equal(active, 'panel', `after ${label}, the focus is on ${active}`);
      await type(page, 'Z');
      assert.ok(!(await render(page)).includes('borderZ'), `the Z after ${label} is typed into the slide`);
      await press(page, 'Escape');
      assert.equal(await findOpen(page), false, `Esc after ${label} leaves the Find panel open`);
      await roundTrip(page);
    });
  }
}

const linkPopover = (page) => page.evaluate(`(() => {
  const d = document.querySelector('dialog.beeson-edit-link[open]');
  const s = getSelection();
  const at = s.rangeCount ? s.getRangeAt(0).startContainer : null;
  return {
    open: !!d,
    href: d?.querySelector('input[name="href"]').value ?? null,
    buttons: d ? [...d.querySelectorAll('.buttons button')].filter((b) => !b.disabled).map((b) => b.textContent) : [],
    focus: document.activeElement.localName,
    inLink: !!at && s.isCollapsed && !!(at.nodeType === 1 ? at : at.parentElement).closest('a'),
  };
})()`);

for (const platform of PLATFORMS) {
  test(`a click on a link places the caret and opens its popover with its address (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickText(page, await pointOf(page, PARA, 'figure', 2));
    await selectText(page, PARA, 'template');
    await press(page, 'Mod+K');
    await page.waitFor(`document.querySelector('dialog.beeson-edit-link[open]') !== null`);
    await type(page, 'example.com');
    await press(page, 'Enter');
    await page.waitFor(`window.BeesonEditor.render().includes('<a href="https://example.com">template</a>')`);
    page.source = await render(page);
    await clickText(page, await pointOf(page, PARA, 'Export', 2));
    assert.equal((await linkPopover(page)).open, false);
    await clickText(page, await pointOf(page, PARA, 'template', 3));
    await frames(page);
    let p = await linkPopover(page);
    assert.deepEqual(p, { open: true, href: 'https://example.com', buttons: ['Remove', 'Open Link', 'Done'], focus: 'p', inLink: true });
    await press(page, 'Escape');
    p = await linkPopover(page);
    assert.deepEqual([p.open, p.focus, p.inLink], [false, 'p', true]);
    await clickText(page, await pointOf(page, PARA, 'template', 3));
    await frames(page);
    assert.equal((await linkPopover(page)).open, true);
    await type(page, 'X');
    assert.equal((await linkPopover(page)).open, false);
    assert.match(await render(page), /<a href="https:\/\/example\.com">temp?Xp?late<\/a>/);
    await roundTrip(page);
  });
}

for (const platform of PLATFORMS) {
  test(`Mod+K with the caret at the end of a word links the word (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickText(page, await pointOf(page, PARA, 'figure', 2));
    await caretAt(page, PARA, 'template', 8);
    await press(page, 'Mod+K');
    await page.waitFor(`document.querySelector('dialog.beeson-edit-link[open]') !== null`);
    await type(page, 'example.com');
    await press(page, 'Enter');
    await frames(page);
    assert.ok((await render(page)).includes('the <a href="https://example.com">template</a>.'), 'the word is not linked');
    await roundTrip(page);
  });
}

const PANE_KEYS = {
  mac: { bold: 'Bold (⌘B)', italic: 'Italic (⌘I)', strike: 'Strikethrough (⇧⌘X)', superscript: 'Superscript (⌃⌘+)', subscript: 'Subscript (⌃⌘−)', outdent: 'Decrease Indent Level (⌘[)', indent: 'Increase Indent Level (⌘])' },
  other: { bold: 'Bold (Ctrl+B)', italic: 'Italic (Ctrl+I)', strike: 'Strikethrough (Alt+Shift+5)', superscript: 'Superscript (Ctrl+.)', subscript: 'Subscript (Ctrl+,)', outdent: 'Decrease Indent Level (Shift+Tab)', indent: 'Increase Indent Level (Tab)' },
};
for (const platform of PLATFORMS) {
  test(`the format buttons of the Text pane give their keys in their tooltips (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickText(page, await pointOf(page, ITEM, 'Dark and light', 2));
    await frames(page);
    const titles = await page.evaluate(`Object.fromEntries(${js(Object.keys(PANE_KEYS[platform]))}.map((id) => [id, document.querySelector('#beeson-edit-panel-format [data-command="text.' + id + '"]')?.title ?? null]))`);
    assert.deepEqual(titles, PANE_KEYS[platform]);
  });
}

const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);

for (const platform of PLATFORMS) {
  test(`each entry of the history made by a control is named after its action (${platform})`, async (t) => {
    const page = await load(t, platform);
    const steps = [
      ['Text Color', async () => {
        await clickText(page, await pointOf(page, PARA, 'figure', 2));
        await selectText(page, PARA, 'figure');
        await exec(page, 'text.tone.accent');
      }],
      ['Paragraph Style', () => exec(page, 'text.style.small')],
      ['List Style', async () => {
        await clickText(page, await pointOf(page, ITEM, 'Dark and light', 2));
        await exec(page, 'text.list.ol');
      }],
      ['Figure Mode', async () => {
        await clickText(page, await page.evaluate(`(() => {
          const r = [...document.querySelectorAll('.reveal section.present img')].find((i) => i.getClientRects().length).getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })()`));
        await exec(page, 'figure.mode.both');
      }],
      ['Edit Alt Text', () => exec(page, 'figure.alt', 'Zero-velocity curves')],
      ['Text Column Width', () => exec(page, 'slide.width.wide')],
      ['Transition', () => exec(page, 'slide.transition.none')],
      ['Change Layout', () => exec(page, 'slide.layout.split')],
    ];
    const labels = [];
    for (const [, run] of steps) {
      await run();
      await frames(page);
      labels.push(await undoLabel(page));
    }
    assert.deepEqual(labels, steps.map(([name]) => `Undo ${name}`));
    for (let i = 0; i < steps.length; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
  });
}

const COLORED = '.reveal section.present > p';
const acrossSpan = (page) => page.evaluate(`(() => {
  const p = ${find(COLORED, 'Coriolis')};
  p.focus();
  getSelection().setBaseAndExtent(p.firstChild, 1, p.querySelector('span').firstChild, 8);
})()`);
const ACTIONS = [
  ['Bold', (page) => press(page, 'Mod+B')],
  ['Italic', (page) => press(page, 'Mod+I')],
  ['Strikethrough', (page) => exec(page, 'text.strike')],
  ['a text color', (page) => exec(page, 'text.tone.violet')],
  ['Change Case', (page) => exec(page, 'text.case.upper')],
  ['a link', (page) => exec(page, 'text.link', { href: 'https://example.com' })],
  ['Paste and Match Style', (page) => exec(page, 'edit.pasteAndMatchStyle', 'Pasted')],
];
const CASES = [
  ...ACTIONS.map(([name, run]) => [name, 'a range across the start of the span', acrossSpan, run]),
  ['Bold', 'the whole span', (page) => selectText(page, COLORED, 'Coriolis terms'), ACTIONS[0][1]],
  ['Bold', 'the paragraph selected as a block', (page) => press(page, 'Escape'), ACTIONS[0][1]],
];
for (const platform of PLATFORMS) {
  for (const [name, shape, pick, run] of CASES) {
    test(`${name} on ${shape} colored at a step does not write the runtime classes of the span (${platform})`, async (t) => {
      const page = await load(t, platform, 3);
      assert.equal(await page.evaluate(`${find(COLORED, 'Coriolis')}.querySelector('span').className`), 'coriolis hl-target hl-accent');
      await clickText(page, await pointOf(page, COLORED, 'Coriolis', 2));
      await pick(page);
      await run(page);
      await frames(page);
      const text = await render(page);
      assert.notEqual(text, page.source, `${name} does not change the paragraph`);
      const line = text.split('\n').find((l) => l.includes('couple'))?.trim();
      assert.ok(!/hl-target|hl-accent/.test(text), `${name} writes ${line}`);
      const { text: saved } = await saveAndReopen(page, `r9-6-hl-${++saves}.html`);
      assert.equal(saved, text);
      assert.deepEqual(page.errors, []);
    });
  }
}

for (const platform of PLATFORMS) {
  test(`Return on an empty item moves it out one level, then ends the list (${platform})`, async (t) => {
    const page = await load(t, platform);
    await caretAtEnd(page, 2);
    await press(page, 'Enter');
    const added = await render(page);
    assert.notEqual(added, page.source, 'Return at the end of an item does not add one');
    await press(page, 'Tab');
    assert.notEqual(await render(page), added, 'Tab does not indent the empty item');
    await press(page, 'Enter');
    assert.equal(await render(page), added, 'Return on an empty nested item does not move it out one level');
    assert.equal(await undoLabel(page), 'Undo New Paragraph');
    await press(page, 'Enter');
    const ended = await render(page);
    assert.ok(!ended.includes('<li class="fragment" data-fragment-index="3"></li>'), 'Return on an empty item of the first level keeps it');
    await type(page, 'Z');
    const typed = await render(page);
    assert.match(typed, /in dark mode\.<\/li>\s*<\/ul>\s*<p style="translate: 0px 20px">Z<\/p>/, `the list is not ended: ${typed.match(/in dark mode[\s\S]{0,80}/)?.[0]}`);
    await page.evaluate('window.BeesonEditor.undo()');
    await page.evaluate('window.BeesonEditor.undo()');
    assert.equal(await render(page), added, 'the end of the list is not one entry');
    await page.evaluate('window.BeesonEditor.redo()');
    await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), typed);
    const { text } = await saveAndReopen(page, `r9-6-${++saves}.html`);
    assert.equal(text, typed);
    assert.deepEqual(page.errors, []);
  });
}
