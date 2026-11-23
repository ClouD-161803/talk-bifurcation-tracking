import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { center, click, clickText, drag, editorPage, press } from './helpers/editor.mjs';

const DECK = 'test/pages/stacks.html';
const TWO = ['two-text', 'two-math'];

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

async function open(t, page) {
  const p = await editorPage(browser, { deck: DECK, page });
  t.after(() => p.close());
  return p;
}

const tabs = (page) => page.evaluate(`(() => { const box = document.querySelector('.beeson-step-tabs'); return !box || box.hidden ? null : [...box.querySelectorAll('button[aria-pressed]')].map((b) => (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + b.textContent); })()`);
const tab = (n) => `document.querySelectorAll('.beeson-step-tabs button')[${n}]`;
async function showTab(page, n) {
  await click(page, await page.evaluate(`(() => { const r = ${tab(n)}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
  await page.waitFor(`${tab(n)}?.getAttribute('aria-pressed') === 'true'`);
}
const boxes = (page, ids) => page.evaluate(`${JSON.stringify(ids)}.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })`);
const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.id || el.localName)`);

test('an edit in one tab of a stack does not move the elements of another tab', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  assert.deepEqual(await tabs(page), ['Up to step 1', '*From step 2']);
  const before = await boxes(page, TWO);
  await showTab(page, 0);
  await page.evaluate(`window.BeesonEditor.exec('insert.text')`);
  await page.waitFor(`!!document.querySelector('.r-stack > :first-child > p.beeson-pending')`);
  await press(page, 'Escape');
  await press(page, 'Escape');
  await clickText(page, '#one-text');
  await page.waitFor(`document.getElementById('one-text').contains(document.activeElement)`);
  await press(page, 'End');
  await press(page, 'Enter');
  await press(page, 'Enter');
  await page.waitFor(`document.querySelector('.r-stack > :first-child').querySelectorAll(':scope > p').length === 4`);
  await press(page, 'Escape');
  await showTab(page, 1);
  const now = await boxes(page, TWO);
  now.flat().forEach((v, i) => assert.ok(Math.abs(v - before.flat()[i]) <= 0.5, `${JSON.stringify(now)} against ${JSON.stringify(before)}`));
  assert.deepEqual(page.errors, []);
});

test('the elements of a tab that is not shown cannot be clicked, cycled to, or caught by a marquee', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await showTab(page, 0);
  await click(page, await center(page, '#two-math'));
  for (const id of await selected(page)) assert.ok(!TWO.includes(id), id);
  await click(page, await center(page, '.present h2'));
  const seen = new Set();
  for (let n = 0; n < 6; n++) {
    await press(page, 'Tab');
    for (const id of await selected(page)) seen.add(id);
  }
  assert.deepEqual([...seen].sort(), ['h2', 'one-math', 'one-text', 'shared']);
  await press(page, 'Escape');
  const slide = await page.evaluate(`(() => { const r = document.querySelector('.reveal').getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4, w: r.width - 8, h: r.height - 8 }; })()`);
  await drag(page, { x: slide.x, y: slide.y }, { dx: slide.w, dy: slide.h });
  assert.deepEqual((await selected(page)).sort(), ['h2', 'one-math', 'one-text', 'shared']);
  assert.deepEqual(page.errors, []);
});

test('on a slide whose ranges hide elements, the hidden elements are skipped by Tab and by a marquee', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: 'test/pages/layers.html' });
  t.after(() => page.close());
  await page.evaluate('Reveal.slide(1)');
  await page.waitFor(`document.querySelectorAll('.beeson-step-tabs button[aria-pressed]').length === 4`);
  await click(page, await center(page, '.present h2'));
  const seen = new Set();
  for (let n = 0; n < 4; n++) {
    await press(page, 'Tab');
    for (const id of await selected(page)) seen.add(id);
  }
  assert.deepEqual([...seen].sort(), ['h2', 'panel-0']);
  await press(page, 'Escape');
  const slide = await page.evaluate(`(() => { const r = document.querySelector('.reveal').getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4, w: r.width - 8, h: r.height - 8 }; })()`);
  await drag(page, { x: slide.x, y: slide.y }, { dx: slide.w, dy: slide.h });
  assert.deepEqual((await selected(page)).sort(), ['h2', 'panel-0']);
  assert.deepEqual(page.errors, []);
});

const rendered = (page) => page.evaluate('window.BeesonEditor.render()');
const run = (page, id) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)})`);
const boxOf = (page, el) => page.evaluate(`(() => { const r = ${el}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
const ADD = `document.querySelector('.beeson-step-tabs button.add')`;
const menuItem = (label) => `[...document.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.includes(${JSON.stringify(label)}) && b.getClientRects().length)`;

test('the + tab adds a copy of the tab shown just before the next tab, and undo gives back the tab shown before', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await showTab(page, 0);
  await click(page, await boxOf(page, ADD));
  await page.waitFor(`document.querySelector('.r-stack').children.length === 3`);
  assert.deepEqual(await tabs(page), ['Up to step 1', '*Step 2', 'From step 3']);
  const text = await rendered(page);
  assert.match(text, /<div class="fragment" data-fragment-index="2">\s*<p id="[^"]+" style="translate: 0px 20px">The first form\./);
  assert.match(text, /<div class="fragment" data-fragment-index="3">\s*<p id="two-text">/);
  assert.match(text, /<p id="shared" class="fragment" data-fragment-index="1">/);
  await run(page, 'edit.undo');
  await page.waitFor(`document.querySelector('.r-stack').children.length === 2`);
  assert.deepEqual(await tabs(page), ['*Up to step 1', 'From step 2']);
  assert.equal(await rendered(page), page.source);
  await run(page, 'edit.redo');
  await page.waitFor(`document.querySelector('.r-stack').children.length === 3`);
  assert.deepEqual(await tabs(page), ['Up to step 1', '*Step 2', 'From step 3']);
  assert.deepEqual(page.errors, []);
});

test('Delete Tab takes off a tab and renumbers the steps, and the last but one unwraps the stack in place', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await page.evaluate('Reveal.slide(1)');
  await page.waitFor(`document.querySelectorAll('.beeson-step-tabs button:not(.add)').length === 3`);
  await click(page, await boxOf(page, tab(1)), { button: 'right' });
  await page.waitFor(`!!${menuItem('Delete Tab')}`);
  await click(page, await boxOf(page, menuItem('Delete Tab')));
  await page.waitFor(`document.querySelectorAll('#three > *').length === 2`);
  assert.deepEqual(await tabs(page), ['Before step 1', '*From step 1']);
  assert.match(await rendered(page), /<p>The first\.<\/p>\s*<p class="fragment" data-fragment-index="1">The third\.<\/p>/);
  await showTab(page, 0);
  const first = await page.evaluate(`(() => { const r = document.querySelector('#three > :first-child').getBoundingClientRect(); return [r.left, r.top]; })()`);
  await page.evaluate(`${tab(1)}.focus()`);
  await press(page, 'Delete');
  await page.waitFor(`!document.getElementById('three')`);
  const text = await rendered(page);
  const slide = text.split('<h2>Three forms</h2>')[1].split('</section>')[0];
  assert.doesNotMatch(slide, /r-stack|The third/);
  assert.match(slide, /^\s*<p>The first\.<\/p>\s*$/);
  const now = await page.evaluate(`(() => { const p = [...document.querySelectorAll('.present p')].find((p) => p.textContent === 'The first.'); const r = p.getBoundingClientRect(); return [r.left, r.top]; })()`);
  now.forEach((v, i) => assert.ok(Math.abs(v - first[i]) <= 0.5, `${now} against ${first}`));
  await run(page, 'edit.undo');
  await page.waitFor(`document.querySelectorAll('#three > *').length === 2`);
  assert.deepEqual(page.errors, []);
});

const innerShown = (page) => page.evaluate(`[...document.querySelectorAll('#inner > *')].map((c) => [...c.querySelectorAll('.fragment')].filter((f) => !f.closest('.beeson-off')).length)`);

test('the + tab copies the steps inside the shown tab into the new tab, and Delete Tab takes them out of the plan', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await page.evaluate('Reveal.slide(3)');
  await page.waitFor(`document.querySelectorAll('.beeson-step-tabs button:not(.add)').length === 3`);
  await showTab(page, 0);
  await click(page, await boxOf(page, ADD));
  await page.waitFor(`document.querySelectorAll('#inner > *').length === 4`);
  assert.deepEqual(await tabs(page), ['Up to step 1', '*Steps 2\u20133', 'Steps 4\u20135', 'From step 6']);
  const text = await rendered(page);
  assert.match(text, /<div>\s*<p>The first form\.<\/p>\s*<p class="fragment" data-fragment-index="1">Its step\.<\/p>/);
  assert.match(text, /<div class="fragment" data-fragment-index="2">\s*<p>The first form\.<\/p>\s*<p class="fragment" data-fragment-index="3">Its step\.<\/p>/);
  assert.match(text, /<div class="fragment" data-fragment-index="4">\s*<p>The second form\.<\/p>\s*<p class="fragment" data-fragment-index="5">Its own step\.<\/p>/);
  assert.match(text, /<div class="fragment" data-fragment-index="6">\s*<p>The third form\./);
  const seen = [];
  for (let n = 0; n < 4; n++) {
    await showTab(page, n);
    seen.push(await innerShown(page));
  }
  assert.deepEqual(seen, [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 0]]);
  await page.evaluate(`${tab(2)}.focus()`);
  await press(page, 'Delete');
  await page.waitFor(`document.querySelectorAll('#inner > *').length === 3`);
  const after = (await rendered(page)).split('<h2>Inner steps</h2>')[1];
  assert.doesNotMatch(after, /The second form/);
  assert.match(after, /<div class="fragment" data-fragment-index="2">\s*<p>The first form\.<\/p>\s*<p class="fragment" data-fragment-index="3">Its step\.<\/p>/);
  assert.match(after, /<div class="fragment" data-fragment-index="4">\s*<p>The third form\./);
  assert.deepEqual(page.errors, []);
});

test('the + tab is at least 24 px on a phone, and a tap adds a tab', { timeout: 120000 }, async (t) => {
  const page = await open(t, { width: 844, height: 390, mobile: true });
  const add = await boxOf(page, ADD);
  assert.ok(add.w >= 24 && add.h >= 24, JSON.stringify(add));
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: add.x, y: add.y }] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitFor(`document.querySelector('.r-stack').children.length === 3`);
  assert.deepEqual(page.errors, []);
});

test('a row of a tab in the Steps pane shows its tab', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await run(page, 'view.steps');
  const row = `[...document.querySelectorAll('.beeson-edit-side .rows .row.tab')].find((r) => r.textContent.includes('second form'))`;
  await page.waitFor(`!!${row}?.getBoundingClientRect().width`);
  await click(page, await boxOf(page, `${row}.querySelector('.body')`));
  await page.waitFor(`${tab(1)}.getAttribute('aria-pressed') === 'true'`);
  assert.equal(await page.evaluate(`getComputedStyle(document.getElementById('two-text')).visibility`), 'visible');
  assert.deepEqual(page.errors, []);
});

test('a row of a tab in the Steps pane cannot be given a step, a start, or an effect', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await run(page, 'view.steps');
  const row = `[...document.querySelectorAll('.beeson-edit-side .rows .row.tab')].find((r) => r.textContent.includes('second form'))`;
  await page.waitFor(`!!${row}?.getBoundingClientRect().width`);
  await click(page, await boxOf(page, `${row}.querySelector('.chip')`));
  await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => i.querySelector('.label').textContent)`), ['Play From Step 2']);
  await press(page, 'Escape');
  await page.waitFor(`!document.querySelector('.beeson-edit-menu')`);
  await click(page, await boxOf(page, `${row}.querySelector('.body')`));
  await page.waitFor(`${row}.classList.contains('selected')`);
  assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-side .detail').classList.contains('off')`), true);
  assert.equal(await page.evaluate(`window.BeesonEditor.state('steps.earlier').enabled`), false);
  assert.equal(await page.evaluate(`window.BeesonEditor.state('steps.later').enabled`), false);
  const child = `document.querySelector('.present .r-stack').children[1]`;
  for (const [id, arg] of [['steps.set', '{ to: null }'], ['steps.set', '{ to: 0 }'], ['steps.start', "{ start: 'with' }"], ['steps.effect', "{ effect: 'out' }"], ['steps.final', '{ on: true }'], ['steps.earlier', '{}'], ['steps.later', '{}'], ['steps.move', '{ gap: 0 }']]) {
    await page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}, { el: ${child}, ...${arg} })`);
  }
  await page.evaluate(`${row}.focus()`);
  await press(page, 'Delete');
  assert.equal(await rendered(page), page.source);
  assert.deepEqual(page.errors, []);
});

test('Insert > Stack wraps the selection in a stack in place, and Show on Every Tab takes it out again', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await page.evaluate('Reveal.slide(2)');
  await page.waitFor(`document.querySelector('.present h2')?.textContent === 'Plain'`);
  const place = () => page.evaluate(`(() => { const r = document.getElementById('plain-1').getBoundingClientRect(); return [r.left, r.top]; })()`);
  const before = await place();
  await click(page, await center(page, '#plain-1'));
  await page.waitFor(`window.BeesonEditor.selection()[0]?.id === 'plain-1'`);
  await run(page, 'insert.stack');
  await page.waitFor(`!!document.querySelector('.present .r-stack > div > #plain-1')`);
  assert.deepEqual(await tabs(page), ['*Up to step 1']);
  assert.ok(await page.evaluate(`!!${ADD}`));
  for (const [v, i] of (await place()).map((v, i) => [v, i])) assert.ok(Math.abs(v - before[i]) <= 0.5, `${v} against ${before[i]}`);
  assert.match(await rendered(page), /<div class="r-stack">\s*<div>\s*<p id="plain-1" class="fragment" data-fragment-index="1">/);
  assert.equal(await page.evaluate(`window.BeesonEditor.state('arrange.everyTab').checked`), false);
  await run(page, 'arrange.everyTab');
  await page.waitFor(`document.getElementById('plain-1').parentElement.localName === 'section'`);
  for (const [v, i] of (await place()).map((v, i) => [v, i])) assert.ok(Math.abs(v - before[i]) <= 0.5, `${v} against ${before[i]}`);
  assert.equal(await page.evaluate(`window.BeesonEditor.state('arrange.everyTab').checked`), true);
  assert.deepEqual(page.errors, []);
});

const MAKE = 'test/pages/stacks-make.html';
const shownBoxes = (page) => page.evaluate(`Object.fromEntries([...document.querySelectorAll('.present [id]')].filter((el) => !el.closest('aside') && getComputedStyle(el).visibility === 'visible' && el.getClientRects().length).map((el) => { const r = el.getBoundingClientRect(); return [el.id, [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 2) / 2)]; }))`);
const refusal = (page) => page.evaluate(`window.BeesonEditor.exec('stack.make').then(() => null, (e) => e.message)`);

test('Make Stack puts the elements replaced in place into a stack, and every tab looks as before', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: MAKE });
  t.after(() => page.close());
  const labels = await tabs(page);
  assert.equal(labels.length, 5);
  const before = [];
  for (let i = 0; i < labels.length; i++) {
    await showTab(page, i);
    before.push(await shownBoxes(page));
  }
  await showTab(page, 0);
  await run(page, 'stack.make');
  await page.waitFor(`!!document.querySelector('.present .r-stack')`);
  assert.deepEqual((await tabs(page)).map((l) => l.replace('*', '')), labels.map((l) => l.replace('*', '')));
  for (let i = 0; i < labels.length; i++) {
    await showTab(page, i);
    const now = await shownBoxes(page);
    assert.deepEqual(Object.keys(now).sort(), Object.keys(before[i]).sort(), `tab ${i}`);
    for (const id of Object.keys(now)) now[id].forEach((v, k) => assert.ok(Math.abs(v - before[i][id][k]) <= 1, `${id} in tab ${i}: ${now[id]} against ${before[i][id]}`));
  }
  const text = await rendered(page);
  assert.match(text, /<div class="r-stack"><div>\s*<p class="fragment" data-fragment-index="1" id="lead-1"/);
  assert.match(text, /<div class="fragment" data-fragment-index="2">\s*<p id="lead-2"/);
  assert.match(text, /<div class="math fragment" data-fragment-index="5" id="eq-5"/);
  assert.doesNotMatch(text.split('id="twice"')[0], /current-visible/);
  await run(page, 'edit.undo');
  await page.waitFor(`!document.querySelector('.present .r-stack')`);
  assert.equal(await rendered(page), page.source);
  assert.deepEqual(page.errors, []);
});

test('Make Stack refuses an element shown in more than one tab, and one inside a column, and names it', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: MAKE });
  t.after(() => page.close());
  await page.evaluate('Reveal.slide(1)');
  await page.waitFor(`document.querySelector('.present h2')?.textContent === 'Twice'`);
  assert.match(await refusal(page), /the paragraph “Shown until the third step\.”.*more than one tab/);
  await page.evaluate('Reveal.slide(2)');
  await page.waitFor(`document.querySelector('.present h2')?.textContent === 'Columns'`);
  assert.match(await refusal(page), /the paragraph “In a column\.”.*column/);
  assert.equal(await rendered(page), page.source);
});

test('the tabs of a slide without a stack end without a button, and Make Stack is in the Slide menu only where elements are replaced in place', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: MAKE });
  t.after(() => page.close());
  assert.equal((await tabs(page)).length, 5);
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-step-tabs button:not([aria-pressed])')].map((b) => b.textContent)`), []);
  assert.equal((await page.evaluate(`window.BeesonEditor.state('stack.make')`)).enabled, true);
  const stacked = await open(t);
  assert.equal((await stacked.evaluate(`window.BeesonEditor.state('stack.make')`)).enabled, false);
  assert.deepEqual(await stacked.evaluate(`[...document.querySelectorAll('.beeson-step-tabs button:not([aria-pressed])')].map((b) => b.getAttribute('aria-label'))`), ['Add Tab']);
});

test('Make Stack refuses elements that a style of the deck sizes as children of the slide, and leaves the slide as it was', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: MAKE });
  t.after(() => page.close());
  await page.evaluate(`Reveal.slide([...document.querySelectorAll('.reveal .slides > section')].findIndex((s) => s.id === 'placed'))`);
  await page.waitFor(`document.querySelector('.present h2')?.textContent === 'Placed' && document.querySelectorAll('.beeson-step-tabs button[aria-pressed]').length === 2`);
  const before = [];
  for (let i = 0; i < 2; i++) {
    await showTab(page, i);
    before.push(await shownBoxes(page));
  }
  await showTab(page, 0);
  assert.match(await refusal(page), /Make Stack cannot keep the size of the paragraph “The equations of motion are:”, since a style of this deck sizes it as a child of the slide/);
  assert.equal(await rendered(page), page.source);
  assert.equal((await page.evaluate('window.BeesonEditor.status()')).undo, false);
  for (let i = 0; i < 2; i++) {
    await showTab(page, i);
    assert.deepEqual(await shownBoxes(page), before[i], `tab ${i}`);
  }
  assert.deepEqual(page.errors, []);
});

test('Delete Tab and Show on Every Tab keep the elements below the stack in place', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await page.evaluate('Reveal.slide(4)');
  await page.waitFor(`document.querySelector('.present h2')?.textContent === 'Below' && document.querySelectorAll('.beeson-step-tabs button:not(.add)').length === 2`);
  await showTab(page, 0);
  const place = (id) => page.evaluate(`(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return [r.left, r.top]; })()`);
  const near = (now, was) => now.forEach((v, i) => assert.ok(Math.abs(v - was[i]) <= 0.5, `${now} against ${was}`));
  const outside = (text) => text.replace(/<h2>Below<\/h2>[\s\S]*?<\/section>/, '');
  const below = await place('below');
  const tall = await place('tall-3');
  await click(page, await center(page, '#tall-3'));
  await page.waitFor(`window.BeesonEditor.selection()[0]?.id === 'tall-3'`);
  await run(page, 'arrange.everyTab');
  await page.waitFor(`document.getElementById('tall-3').parentElement.localName === 'section'`);
  near(await place('tall-3'), tall);
  near(await place('below'), below);
  assert.equal(outside(await rendered(page)), outside(page.source));
  await run(page, 'edit.undo');
  await page.waitFor(`document.getElementById('tall-3').parentElement.parentElement.id === 'tall'`);
  await page.evaluate(`${tab(0)}.focus()`);
  await press(page, 'Delete');
  await page.waitFor(`!document.getElementById('tall-1')`);
  near(await place('below'), below);
  const text = await rendered(page);
  assert.equal(outside(text), outside(page.source));
  assert.match(text, /<p id="below" style="translate: [^"]+">Below the stack\.<\/p>/);
  assert.deepEqual(page.errors, []);
});

const NESTED = 5;
const seenIn = (root, id) => `(() => { const el = ${root}?.querySelector('#${id}'); return !!el && getComputedStyle(el).visibility === 'visible'; })()`;
const thumbOf = (pics, i) => `document.querySelectorAll('${pics}')[${i}]?.shadowRoot`;

test('a slide with stacks is shown complete, with the last tab of each stack, also nested, on the slide, its thumbnail, and its tile in Slide Sorter', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  assert.deepEqual(await tabs(page), ['Up to step 1', '*From step 2']);
  await page.evaluate(`Reveal.slide(${NESTED})`);
  await page.waitFor(`document.querySelector('.present h2')?.textContent === 'Nested' && !document.querySelector('.beeson-step-tabs').hidden`);
  assert.deepEqual(await tabs(page), ['Before step 1', 'Step 1', '*From step 2']);
  for (const [id, shown] of [['outer-1', false], ['nested-1', false], ['nested-2', true], ['nested-after', true]]) assert.equal(await page.evaluate(seenIn('document.querySelector(".present")', id)), shown, id);
  await page.evaluate(`document.documentElement.classList.contains('beeson-nav') || window.BeesonEditor.exec('view.navigator')`);
  await page.waitFor(seenIn(thumbOf('.beeson-edit-nav .row .pic', NESTED), 'nested-2'));
  for (const [id, shown] of [['outer-1', false], ['nested-1', false], ['nested-after', true]]) assert.equal(await page.evaluate(seenIn(thumbOf('.beeson-edit-nav .row .pic', NESTED), id)), shown, id);
  await page.evaluate(`window.BeesonEditor.exec('view.lightTable')`);
  await page.waitFor(seenIn(thumbOf('.beeson-edit-sorter .tile .pic', NESTED), 'nested-2'));
  assert.equal(await page.evaluate(seenIn(thumbOf('.beeson-edit-sorter .tile .pic', NESTED), 'nested-1')), false);
  assert.deepEqual(page.errors, []);
});

test('a tab picked by hand stays while the slide is shown, the last tab is shown again at the next arrival, and nothing is written or recorded', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await showTab(page, 0);
  await click(page, await center(page, '.present h2'));
  await press(page, 'Escape');
  assert.deepEqual(await tabs(page), ['*Up to step 1', 'From step 2']);
  await page.evaluate('Reveal.slide(1)');
  await page.waitFor(`document.querySelector('.present h2')?.textContent === 'Three forms'`);
  await page.evaluate('Reveal.slide(0)');
  await page.waitFor(`document.querySelector('.present h2')?.textContent === 'Stack'`);
  await page.waitFor(`${tab(1)}?.getAttribute('aria-pressed') === 'true'`);
  assert.equal(await rendered(page), page.source);
  assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').enabled`), false);
  assert.deepEqual(page.errors, []);
});
