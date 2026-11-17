// the click model of Keynote for text elements, with trusted input: the first click on a text element
// selects it as a box, a drag from it moves it, a second click or a double click puts the caret in,
// and one click and Delete remove it. Alt-click and the submenu Select of the context menu reach
// the elements under the pointer behind the front one, and the Delete button of the toolbar
// deletes the selection

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { center, click, clickText, drag, editorPage, press } from './helpers/editor.mjs';

const DECK = 'test/pages/editor-overlap.html';
const BACK = '.reveal section.present > p:nth-of-type(1)';
const FRONT = '.reveal section.present > p:nth-of-type(2)';
const SHAPE = '.reveal section.present > .shape';
const js = (v) => JSON.stringify(v);

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

async function open(t, platform = 'other', options) {
  const page = await editorPage(browser, { deck: DECK, query: `edit&still&edit-platform=${platform}`, page: options });
  t.after(() => page.close().catch(() => {}));
  return page;
}

const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
// the selectors among selectors whose element is selected as an object
const selected = (page, selectors) => page.evaluate(`${js(selectors)}.filter((s) => window.BeesonEditor.selection().includes(document.querySelector(s)))`);
const caretIn = (page, selector) => page.evaluate(`(() => { const el = document.querySelector(${js(selector)}); const s = getSelection(); return !!el && document.activeElement === el && !!s.rangeCount && el.contains(s.anchorNode); })()`);
const count = (page, selector) => page.evaluate(`document.querySelectorAll(${js(selector)}).length`);
// a point on the first line of the words of the element of selector, at the fraction fx of its width
const onWords = (page, selector, fx = 0.3) => page.evaluate(`(() => {
  const el = document.querySelector(${js(selector)});
  const r = document.createRange();
  r.selectNodeContents(el);
  const b = r.getClientRects()[0];
  return { x: b.left + b.width * ${fx}, y: b.top + b.height / 2 };
})()`);
// the center of the box where the two paragraphs and the shape overlap, or null
const overlap = (page) => page.evaluate(`(() => {
  const [a, b, c] = [${js(BACK)}, ${js(FRONT)}, ${js(SHAPE)}].map((s) => document.querySelector(s).getBoundingClientRect());
  const left = Math.max(a.left, b.left, c.left), right = Math.min(a.right, b.right, c.right);
  const top = Math.max(a.top, b.top, c.top), bottom = Math.min(a.bottom, b.bottom, c.bottom);
  return right > left && bottom > top ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
})()`);

for (const platform of ['mac', 'other']) {
  test(`${platform}: one click on a paragraph selects it as a box, a second click puts the caret in, and one click and Delete remove it`, async (t) => {
    const page = await open(t, platform);
    const at = await onWords(page, BACK);
    await click(page, at);
    assert.deepEqual(await selected(page, [BACK]), [BACK], 'the first click does not select the paragraph');
    assert.equal(await caretIn(page, BACK), false, 'the first click puts a caret into the paragraph');
    await click(page, at);
    assert.equal(await caretIn(page, BACK), true, 'a click on the selected paragraph does not put the caret in');
    await press(page, 'Escape');
    assert.deepEqual(await selected(page, [BACK]), [BACK], 'Esc does not select the paragraph as a box');
    await click(page, await onWords(page, FRONT, 0.2));
    assert.deepEqual(await selected(page, [BACK, FRONT]), [FRONT]);
    await press(page, 'Backspace');
    assert.equal(await count(page, '.reveal section.present > p'), 1, 'one click and Backspace do not delete the paragraph');
    assert.deepEqual(page.errors, []);
  });

  test(`${platform}: Alt-click selects the element behind, one layer further back at each click, and the front one after the last`, async (t) => {
    const page = await open(t, platform);
    const at = await overlap(page);
    assert.ok(at, 'the three elements do not overlap');
    await click(page, at);
    assert.deepEqual(await selected(page, [SHAPE, FRONT, BACK]), [SHAPE], 'a click does not select the front element');
    const order = [];
    for (let i = 0; i < 3; i++) {
      await click(page, at, { modifiers: 'Alt' });
      order.push(...(await selected(page, [SHAPE, FRONT, BACK])));
    }
    assert.deepEqual(order, [FRONT, BACK, SHAPE], 'Alt-click does not go from front to back and around');
    // with none of them selected, Alt-click selects the second from the front
    await press(page, 'Escape');
    await click(page, at, { modifiers: 'Alt' });
    assert.deepEqual(await selected(page, [SHAPE, FRONT, BACK]), [FRONT], 'Alt-click without a selection does not select the second from the front');
    assert.equal((await caretIn(page, FRONT)) || (await caretIn(page, BACK)), false, 'Alt-click puts a caret in');
    assert.deepEqual(page.errors, []);
  });
}

test('a drag from a paragraph that is not selected moves it, and a drag in the text of the caret selects words', async (t) => {
  const page = await open(t);
  await drag(page, await onWords(page, BACK, 0.2), { dx: 0, dy: 300 });
  const moved = await page.evaluate(`document.querySelector(${js(BACK)}).style.translate`);
  assert.ok(parseFloat(moved.split(' ')[1]) > 50, `a drag from the words of the paragraph does not move it: ${moved}`);
  const now = await onWords(page, BACK, 0.2);
  await click(page, now);
  assert.equal(await caretIn(page, BACK), true);
  await drag(page, now, { dx: 120, dy: 0 });
  assert.equal(await page.evaluate(`document.querySelector(${js(BACK)}).style.translate`), moved, 'a drag in the text moves the paragraph');
  assert.ok((await page.evaluate('getSelection().toString()')).length > 3, 'a drag in the text does not select words');
  assert.deepEqual(page.errors, []);
});

test('a double click on a paragraph that is not selected puts the caret in with the word selected', async (t) => {
  const page = await open(t);
  const word = await page.evaluate(`(() => {
    const n = document.querySelector(${js(BACK)}).firstChild, i = n.data.indexOf('paragraph');
    const r = document.createRange();
    r.setStart(n, i + 2);
    r.setEnd(n, i + 3);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  await click(page, word, { count: 2 });
  assert.equal(await caretIn(page, BACK), true, 'a double click does not put the caret in');
  assert.equal(await page.evaluate('getSelection().toString()'), 'paragraph', 'a double click does not select the word');
  assert.deepEqual(page.errors, []);
});

test('a click on a cell of a table puts the caret in it at once', async (t) => {
  const page = await open(t);
  await page.evaluate('Reveal.slide(1)');
  await page.waitFor(`!!document.querySelector('.reveal section.present table')`);
  await frames(page);
  await click(page, '.reveal section.present td');
  assert.equal(await page.evaluate(`!!document.activeElement?.closest('.reveal section.present table')`), true, 'a click on a cell does not put the caret in');
  assert.deepEqual(page.errors, []);
});

test('with the caret in an item of a list, one click on another item moves the caret there', async (t) => {
  const page = await open(t);
  const FIRST = '.reveal section.present li:nth-of-type(1)', SECOND = '.reveal section.present li:nth-of-type(2)';
  await page.evaluate('Reveal.slide(2)');
  await page.waitFor(`!!document.querySelector(${js(SECOND)})`);
  const at = await onWords(page, FIRST);
  await click(page, at);
  await click(page, at);
  assert.equal(await caretIn(page, FIRST), true, 'a second click does not put the caret into the item');
  await click(page, await onWords(page, SECOND));
  assert.equal(await caretIn(page, SECOND), true, 'one click on another item of the list that is edited does not move the caret');
  assert.deepEqual(page.errors, []);
});

test('a drag of a display formula does not open its TeX, and Alt-click reaches the paragraph behind a formula', async (t) => {
  const page = await editorPage(browser, { query: 'edit&still&edit-platform=other' });
  t.after(() => page.close().catch(() => {}));
  const MATH = '.reveal section.present > .math', LEAD = '.reveal section.present > p:not(.fragment)';
  const n = await page.evaluate(`Reveal.getSlides().findIndex((s) => s.querySelector('h2')?.textContent === 'Equations are first class citizens')`);
  await page.evaluate(`Reveal.slide(${n})`);
  await page.waitFor(`!!document.querySelector(${js(MATH + ' mjx-container')})`);
  const from = await center(page, `${MATH} mjx-container`);
  const to = await onWords(page, LEAD);
  await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
  await frames(page);
  assert.notEqual(await page.evaluate(`document.querySelector(${js(MATH)}).style.translate`), '', 'a drag from a display formula does not move it');
  assert.equal(await count(page, '.beeson-math'), 0, 'the TeX of a formula is opened after a drag of the formula');
  assert.deepEqual(await selected(page, [MATH, LEAD]), [MATH]);
  await click(page, to, { modifiers: 'Alt' });
  await frames(page);
  assert.deepEqual(await selected(page, [MATH, LEAD]), [LEAD], 'Alt-click on a formula does not select the paragraph behind it');
  assert.equal(await count(page, '.beeson-math'), 0, 'the TeX of a formula is opened by an Alt-click');
  assert.deepEqual(page.errors, []);
});

test('Alt-click on an inline formula of the text that has the caret reaches the element behind, while Alt is held and repeats', async (t) => {
  const page = await editorPage(browser, { query: 'edit&still&edit-platform=other' });
  t.after(() => page.close().catch(() => {}));
  const LEAD = '.reveal section.present > p:nth-of-type(1)', WHERE = '.reveal section.present > p:nth-of-type(2)';
  const n = await page.evaluate(`Reveal.getSlides().findIndex((s) => s.querySelector('h2')?.textContent === 'Equations are first class citizens')`);
  await page.evaluate(`Reveal.slide(${n})`);
  await page.waitFor(`!!document.querySelector(${js(WHERE + ' mjx-container')})`);
  const formula = await center(page, `${WHERE} mjx-container`);
  const from = await onWords(page, LEAD);
  await drag(page, from, { dx: formula.x - from.x, dy: formula.y - from.y });
  await frames(page);
  const words = await onWords(page, WHERE, 0.8);
  await click(page, words);
  await click(page, words);
  assert.equal(await caretIn(page, WHERE), true, 'two clicks do not put the caret into the paragraph');
  // Windows repeats the keydown of a held Alt between the press and the release of the click
  const alt = { key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 };
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: formula.x, y: formula.y, modifiers: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: formula.x, y: formula.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 1 });
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', autoRepeat: true, ...alt });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: formula.x, y: formula.y, button: 'left', clickCount: 1, modifiers: 1 });
  await frames(page);
  assert.deepEqual(await selected(page, [LEAD, WHERE]), [LEAD], 'Alt-click on the inline formula does not select the paragraph behind it');
  assert.equal(await count(page, '.beeson-math'), 0, 'the TeX of the inline formula is opened by an Alt-click with a held Alt');
  assert.deepEqual(page.errors, []);
});

test('a press on the selected paragraph that the browser cancels does not put the caret in', async (t) => {
  const page = await open(t);
  const at = await onWords(page, BACK);
  await click(page, at);
  assert.deepEqual(await selected(page, [BACK]), [BACK]);
  await page.evaluate(`(() => {
    const el = document.elementFromPoint(${at.x}, ${at.y});
    const init = { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: ${at.x}, clientY: ${at.y} };
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new PointerEvent('pointercancel', { ...init, buttons: 0 }));
  })()`);
  await frames(page);
  assert.equal(await caretIn(page, BACK), false, 'a cancelled press puts the caret into the paragraph');
  assert.deepEqual(page.errors, []);
});

test('the Delete button deletes the slide chosen in the slide list, as Edit > Delete does', async (t) => {
  const page = await open(t);
  const slides = await count(page, '.reveal .slides > section');
  await click(page, '.beeson-edit-nav .row:nth-of-type(2)');
  await frames(page);
  assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-top [data-command="element.delete"]').disabled`), false);
  await click(page, '.beeson-edit-top [data-command="element.delete"]');
  await page.waitFor(`document.querySelectorAll('.reveal .slides > section').length === ${slides - 1}`);
  assert.equal(await count(page, '.reveal .slides > section h2'), slides - 1);
  assert.equal(await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section h2')].some((h) => h.textContent === 'A table')`), false, 'another slide than the chosen one is deleted');
  assert.deepEqual(page.errors, []);
});

test('the helper clickText with Shift adds a paragraph to the selection with one click', async (t) => {
  const page = await open(t);
  await clickText(page, await onWords(page, BACK), { modifiers: 'Shift' });
  assert.deepEqual(await selected(page, [BACK]), [BACK]);
  assert.deepEqual(page.errors, []);
});

test('the context menu lists the elements under the pointer in its submenu Select, front to back, and a choice selects one', async (t) => {
  const page = await open(t);
  await click(page, await overlap(page), { button: 'right' });
  await page.waitFor(`!!document.querySelector('.beeson-edit-menu.context')`);
  const item = await page.evaluate(`(() => {
    const i = [...document.querySelectorAll('.beeson-edit-menu.context .item')].find((x) => x.querySelector('.label').textContent.trim() === 'Select');
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  assert.ok(item, 'the context menu does not have the submenu Select');
  await click(page, item);
  await page.waitFor(`document.querySelectorAll('.beeson-edit-menu').length === 2`);
  const labels = await page.evaluate(`[...[...document.querySelectorAll('.beeson-edit-menu')].at(-1).querySelectorAll('.item .label')].map((l) => l.textContent.trim())`);
  assert.deepEqual(labels, ['Rectangle', 'Text: A front paragraph, over the back…', 'Text: A back paragraph, under the other…'], 'Select does not list the elements from front to back');
  const third = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-edit-menu')].at(-1).querySelectorAll('.item')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, third);
  assert.deepEqual(await selected(page, [SHAPE, FRONT, BACK]), [BACK], 'a choice in Select does not select the element');
  assert.deepEqual(page.errors, []);
});

for (const platform of ['mac', 'other']) {
  test(`${platform}: the Delete button follows Redo, is dimmed without a selection, gives its key, and deletes the selection`, async (t) => {
    const page = await open(t, platform);
    const BUTTON = '.beeson-edit-top [data-command="element.delete"]';
    const next = await page.evaluate(`document.querySelector('.beeson-edit-top [data-command="edit.redo"]')?.nextElementSibling?.dataset.command ?? null`);
    assert.equal(next, 'element.delete', 'the Delete button does not follow Redo');
    assert.equal(await page.evaluate(`document.querySelector(${js(BUTTON)}).disabled`), true, 'the Delete button is not dimmed without a selection');
    assert.match(await page.evaluate(`document.querySelector(${js(BUTTON)}).title`), /^Delete \(.+\)$/, 'the tooltip of Delete does not give its key');
    await click(page, await onWords(page, BACK));
    assert.equal(await page.evaluate(`document.querySelector(${js(BUTTON)}).disabled`), false, 'the Delete button is dimmed with a selection');
    await click(page, BUTTON);
    assert.equal(await count(page, '.reveal section.present > p'), 1, 'the Delete button does not delete the paragraph');
    assert.deepEqual(page.errors, []);
  });
}

for (const size of [{ width: 760, height: 700 }, { width: 390, height: 844, mobile: true }]) test(`${size.width} px wide: Delete is reached in the toolbar or in More`, async (t) => {
  const page = await open(t, 'other', size);
  await click(page, await onWords(page, BACK));
  const folded = await page.evaluate(`(() => { const b = document.querySelector('.beeson-edit-top [data-command="element.delete"]'); return !b || b.getClientRects().length === 0; })()`);
  if (folded) {
    await click(page, '.beeson-edit-top .more-groups');
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu [data-command="element.delete"]')`);
    await click(page, '.beeson-edit-menu [data-command="element.delete"]');
  } else await click(page, '.beeson-edit-top [data-command="element.delete"]');
  assert.equal(await count(page, '.reveal section.present > p'), 1, 'Delete is not reached in a narrow window');
  assert.deepEqual(page.errors, []);
  t.diagnostic(folded ? 'in More' : 'in the toolbar');
});

// a trusted tap of one finger at the point x, y
async function tap(page, { x, y }) {
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('on a phone, a tap selects a paragraph as a box, and a second tap puts the caret in', async (t) => {
  const page = await open(t, 'other', { width: 390, height: 844, mobile: true });
  const at = await onWords(page, BACK, 0.5);
  await tap(page, at);
  await page.waitFor(`window.BeesonEditor.selection().includes(document.querySelector(${js(BACK)}))`);
  assert.equal(await caretIn(page, BACK), false, 'the first tap puts a caret into the paragraph');
  // a second tap within the time of a double tap would be a double tap
  await page.evaluate('new Promise((d) => setTimeout(() => d(true), 600))');
  await tap(page, at);
  await page.waitFor(`document.activeElement === document.querySelector(${js(BACK)})`);
  assert.equal(await caretIn(page, BACK), true, 'the second tap does not put the caret in');
  assert.deepEqual(page.errors, []);
});

// a trusted swipe of one finger from the point x, y by dy, in steps of 10 px
async function swipe(page, { x, y }, dy) {
  const at = (k) => [{ x, y: y + Math.sign(dy) * k, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let k = 10; k <= Math.abs(dy); k += 10) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('on a phone, a swipe that starts on a paragraph that is not selected leaves the paragraph where it is', async (t) => {
  const page = await open(t, 'other', { width: 390, height: 844, mobile: true });
  const style = await page.evaluate(`document.querySelector(${js(BACK)}).getAttribute('style')`);
  await swipe(page, await onWords(page, BACK, 0.5), -120);
  await frames(page);
  assert.equal(await page.evaluate(`document.querySelector(${js(BACK)}).getAttribute('style')`), style, 'the swipe moves the paragraph');
  assert.equal((await page.evaluate('window.BeesonEditor.status()')).dirty, false, 'the swipe changes the deck');
  assert.deepEqual(await selected(page, [BACK]), [], 'the swipe selects the paragraph');
  assert.deepEqual(page.errors, []);
});
