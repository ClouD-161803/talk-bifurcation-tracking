import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { click, clickText, press, saveAndReopen, type } from './helpers/editor.mjs';

const PLATFORMS = ['mac', 'other'];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

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

async function open(t, platform, { deck = 'test-deck.html', text = readFileSync(deck, 'utf8'), width = 1920, height = 1080 } = {}) {
  const page = await browser.newPage({ width, height });
  t.after(() => page.close());
  await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = text;
  await page.evaluate('localStorage.clear()');
  assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(text)})`)).problems, []);
  await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
  return page;
}

async function slideOf(page, selector) {
  await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Reveal.slide(Reveal.getIndices(el.closest('section')).h); })()`);
  await sleep(150);
}

const rowBox = (page, text) => page.evaluate(`(() => {
  const row = [...document.querySelectorAll('.beeson-edit-side .rows .row')].find((r) => r.querySelector('.text').textContent.startsWith(${JSON.stringify(text)}));
  row.scrollIntoView({ block: 'nearest' });
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  return { row: box(row), chip: box(row.querySelector('.chip')) };
})()`);

const rowChip = async (page, text) => {
  const { chip } = await rowBox(page, text);
  return { x: (chip.left + chip.right) / 2, y: (chip.top + chip.bottom) / 2 };
};

const menuBox = (page) => page.evaluate(`(() => { const r = document.querySelector('.beeson-edit-menu').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })()`);
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const platform of PLATFORMS) {
  test(`the menu of a step chip leaves its row visible on ${platform}`, async (t) => {
    for (const [width, height, at] of [[1920, 1080, 'Each step'], [1440, 520, 'Two elements']]) {
      const page = await open(t, platform, { width, height });
      await slideOf(page, 'li.fragment');
      const box = await rowBox(page, at);
      await clickText(page, { x: (box.chip.left + box.chip.right) / 2, y: (box.chip.top + box.chip.bottom) / 2 });
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
      const menu = await menuBox(page);
      assert.ok(!overlap(menu, box.row), `at ${width} by ${height} the menu ${JSON.stringify(menu)} covers its row ${JSON.stringify(box.row)}`);
      assert.ok(menu.top >= 0 && menu.bottom <= height && menu.left >= 0 && menu.right <= width, 'the menu leaves the window');
      if (menu.top >= box.row.bottom || menu.bottom <= box.row.top) assert.ok(Math.abs(menu.left - box.chip.left) < 8, 'the menu is not at its chip');
      else assert.ok(menu.right <= box.row.left, 'the menu is neither under nor beside its row');
      assert.deepEqual(errors(page), []);
    }
  });
}

const LI1 = '<li class="fragment" data-fragment-index="1">Each step';
const LI2 = '<li class="fragment" data-fragment-index="2">Two elements';
const LI3 = '<li class="fragment" data-fragment-index="3">When exporting';
const REDO = { mac: 'Mod+Shift+Z', other: 'Mod+Y' };
const rendered = (page) => page.evaluate('window.BeesonEditor.render()');

const rows = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-side .rows .row')].map((r) => ({
  step: r.dataset.step,
  text: r.querySelector('.text').textContent.slice(0, 12),
  start: r.querySelector('.chip').dataset.start,
  marked: r.querySelector('.chip svg.start')?.classList[1] ?? '',
  meta: r.querySelector('.meta').textContent,
}))`);

async function pick(page, text, label) {
  const box = await rowBox(page, text);
  await clickText(page, { x: (box.chip.left + box.chip.right) / 2, y: (box.chip.top + box.chip.bottom) / 2 });
  await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
  const item = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label').textContent === ${JSON.stringify(label)});
    if (!item || item.getAttribute('aria-disabled') === 'true') return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  assert.ok(item, `the menu of the chip does not have an enabled item ${label}`);
  await sleep(300);
  await clickText(page, item);
  await page.evaluate('window.BeesonEditor.status()');
}

const menuLabels = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => (i.getAttribute('aria-checked') === 'true' ? '✓ ' : '') + i.querySelector('.label').textContent)`);

async function choose(page, label) {
  const item = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label').textContent === ${JSON.stringify(label)});
    if (!item || item.getAttribute('aria-disabled') === 'true') return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  assert.ok(item, `the open menu does not have an enabled item ${label}`);
  await sleep(300);
  await clickText(page, item);
  await page.evaluate('window.BeesonEditor.status()');
}

const cards = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-side .rows .step:not(.plain)')].map((c) => ({
  head: c.querySelector('.list-head')?.querySelector('.chip').textContent ?? null,
  rows: [...c.querySelectorAll('.row')].map((r) => (r.classList.contains('nested') ? '  ' : '') + r.dataset.step + ' ' + r.querySelector('.text').textContent.slice(0, 12)),
}))`);

async function undoRedo(page, platform, before, after) {
  await press(page, 'Mod+Z');
  assert.equal(await rendered(page), before, 'an undo does not give the file before the edit');
  await press(page, REDO[platform]);
  assert.equal(await rendered(page), after, 'a redo does not give the edit again');
}

const newProblems = (page, text) => {
  const before = new Set(textProblems(page.source, THEME));
  return textProblems(text, THEME).filter((p) => !before.has(p));
};

for (const platform of PLATFORMS) {
  test(`After Previous writes its delay as data-autoslide on the step before, and the chip shows each start on ${platform}`, async (t) => {
    const page = await open(t, platform);
    await slideOf(page, 'li.fragment');
    const source = page.source;
    await clickText(page, await rowChip(page, 'Each step'));
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.textContent.includes('After Previous')).getAttribute('aria-disabled')`), 'true');
    await press(page, 'Escape');

    await pick(page, 'Two elements', 'After Previous');
    const after = source.replace(LI1, '<li class="fragment" data-fragment-index="1" data-autoslide="500">Each step');
    assert.equal(await rendered(page), after);
    let r = await rows(page);
    assert.deepEqual(r.slice(0, 3).map((x) => [x.step, x.start, x.marked]), [['0', 'click', ''], ['1', 'after', 'after'], ['2', 'click', '']]);
    assert.match(r[1].meta, /After Previous, 0\.5 s/);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Set Start of Step');
    await undoRedo(page, platform, source, after);

    const field = '.beeson-edit-side .detail input.delay';
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(field)}).disabled`), false);
    await click(page, field, { count: 3 });
    await type(page, '1.5');
    await press(page, 'Enter');
    await press(page, 'Escape');
    await page.evaluate('window.BeesonEditor.status()');
    const slow = source.replace(LI1, '<li class="fragment" data-fragment-index="1" data-autoslide="1500">Each step');
    assert.equal(await rendered(page), slow);
    assert.match((await rows(page))[1].meta, /After Previous, 1\.5 s/);
    await undoRedo(page, platform, after, slow);

    await page.evaluate(`window.BeesonEditor.exec('steps.move', { el: [...document.querySelectorAll('.reveal section.present li')][2], gap: 0 })`);
    const moved = source
      .replace(LI1, '<li class="fragment" data-fragment-index="2" data-autoslide="1500">Each step')
      .replace(LI2, '<li class="fragment" data-fragment-index="3">Two elements')
      .replace(LI3, '<li class="fragment" data-fragment-index="1">When exporting');
    assert.equal(await rendered(page), moved);
    r = await rows(page);
    assert.deepEqual(r.slice(0, 3).map((x) => [x.text, x.step, x.start]), [['When exporti', '0', 'click'], ['Each step is', '1', 'click'], ['Two elements', '2', 'after']]);
    await pick(page, 'Each step', 'With Previous');
    r = await rows(page);
    assert.deepEqual(r.slice(0, 3).map((x) => [x.step, x.start, x.marked]), [['0', 'click', ''], ['0', 'with', 'with'], ['1', 'after', 'after']]);
    await pick(page, 'Two elements', 'On Click');
    assert.doesNotMatch(await rendered(page), /data-autoslide/);
    await press(page, 'Mod+Z');
    const text = await rendered(page);
    assert.match(text, /data-autoslide="1500"/);
    assert.deepEqual(newProblems(page, text), []);
    await saveAndReopen(page);
    assert.deepEqual(errors(page), []);
  });
}

test('a step After Previous is shown by itself after its delay in the deck', async (t) => {
  const text = readFileSync('test-deck.html', 'utf8').replace(LI1, '<li class="fragment" data-fragment-index="1" data-autoslide="600">Each step');
  const file = `.after-previous-${process.pid}.html`;
  writeFileSync(file, text);
  t.after(() => rmSync(file, { force: true }));
  const page = await browser.newPage({ width: 1280, height: 720 });
  t.after(() => page.close());
  await page.goto(`${server.origin}/${file}?still`);
  await page.waitFor(deckSettled);
  await slideOf(page, 'li.fragment');
  const shown = () => page.evaluate(`[...document.querySelectorAll('.reveal section.present li.fragment')].map((li) => li.classList.contains('visible'))`);
  assert.deepEqual(await shown(), [false, false, false]);
  await page.evaluate(`(() => {
    const slide = document.querySelector('.reveal section.present');
    const items = [...slide.querySelectorAll('li.fragment')];
    window.__shownAt = items.map(() => null);
    addEventListener('keydown', () => { window.__key = performance.now(); }, { capture: true, once: true });
    new MutationObserver(() => items.forEach((li, i) => {
      if (window.__shownAt[i] === null && li.classList.contains('visible')) window.__shownAt[i] = performance.now() - window.__key;
    })).observe(slide, { subtree: true, attributeFilter: ['class'] });
    return true;
  })()`);
  await press(page, 'ArrowRight');
  await page.waitFor('window.__shownAt[1] !== null');
  await page.waitFor('performance.now() - window.__key > window.__shownAt[1] + 900');
  const [first, second, third] = await page.evaluate('window.__shownAt');
  assert.ok(second - first >= 590, `the second step is shown ${Math.round(second - first)} ms after the first, before its delay of 600 ms`);
  assert.equal(third, null, 'the step after the delayed step is shown without a click');
  assert.deepEqual(errors(page), []);
});

const UL = '<ul>\n    <li class="fragment" data-fragment-index="1">Each step';
const ALL = '<ul class="fragment" data-fragment-index="1">\n    <li>Each step';

for (const platform of PLATFORMS) {
  test(`a list is delivered all at once or item by item from its row and its context menu on ${platform}`, async (t) => {
    const page = await open(t, platform);
    await slideOf(page, 'li.fragment');
    const source = page.source;
    assert.deepEqual(await cards(page), [{ head: '1–3', rows: ['  0 Each step is', '  1 Two elements', '  2 When exporti'] }]);
    const head = await page.evaluate(`(() => { const r = document.querySelector('.beeson-edit-side .list-head .chip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await clickText(page, head);
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    assert.deepEqual(await menuLabels(page), ['List All at Once', '✓ List Item by Item', 'With the Slide']);
    await choose(page, 'List All at Once');
    const all = source
      .replace(UL, ALL)
      .replace(LI2, '<li>Two elements')
      .replace(LI3, '<li>When exporting');
    assert.equal(await rendered(page), all);
    assert.deepEqual(await cards(page), [{ head: null, rows: ['0 Each step is'] }]);
    assert.match(await page.evaluate(`document.querySelector('.beeson-edit-side .rows .row .meta').textContent`), /^List · /);
    await undoRedo(page, platform, source, all);
    assert.deepEqual(newProblems(page, all), []);

    await click(page, await page.evaluate(`(() => { const r = document.querySelector('.reveal section.present ul li').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; })()`), { button: 'right' });
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    assert.ok((await menuLabels(page)).includes('Show List Item by Item'));
    await choose(page, 'Show List Item by Item');
    assert.equal(await rendered(page), source);
    await press(page, REDO[platform]);
    assert.equal(await rendered(page), source);
    await clickText(page, await rowChip(page, 'Two elements'));
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    assert.deepEqual((await menuLabels(page)).slice(-2), ['List All at Once', '✓ List Item by Item']);
    await press(page, 'Escape');
    await saveAndReopen(page);
    assert.deepEqual(errors(page), []);
  });
}

test('a list delivered all at once moves the later steps up, and item by item moves them down', async (t) => {
  const deck = 'test/pages/editor-layouts.html';
  const page = await open(t, 'mac', { deck });
  await slideOf(page, 'p.small.fragment');
  const source = page.source;
  const P = '<p class="small fragment" data-fragment-index="3">';
  assert.deepEqual(await cards(page), [{ head: '1–2', rows: ['  0 A first item', '  1 A second ite'] }, { head: null, rows: ['2 A small para'] }]);
  await page.evaluate(`window.BeesonEditor.exec('steps.deliver', { el: document.querySelector('.reveal section.present ul'), by: 'all' })`);
  const all = source
    .replace('<ul>\n    <li class="fragment" data-fragment-index="1">A first item', '<ul class="fragment" data-fragment-index="1">\n    <li>A first item')
    .replace('<li class="fragment" data-fragment-index="2">A second item', '<li>A second item')
    .replace(P, '<p class="small fragment" data-fragment-index="2">');
  assert.equal(await rendered(page), all);
  assert.deepEqual(await cards(page), [{ head: null, rows: ['0 A first item'] }, { head: null, rows: ['1 A small para'] }]);
  await page.evaluate(`window.BeesonEditor.exec('steps.effect', { el: document.querySelector('.reveal section.present ul'), effect: 'only' })`);
  await page.evaluate(`window.BeesonEditor.exec('steps.deliver', { el: document.querySelector('.reveal section.present ul li'), by: 'item' })`);
  assert.equal(await rendered(page), source
    .replace('<li class="fragment" data-fragment-index="1">A first item', '<li class="fragment current-visible" data-fragment-index="1">A first item')
    .replace('<li class="fragment" data-fragment-index="2">A second item', '<li class="fragment current-visible" data-fragment-index="2">A second item'));
  await page.evaluate(`window.BeesonEditor.exec('steps.deliver', { el: document.querySelector('.reveal section.present ul'), by: null })`);
  assert.deepEqual(await cards(page), [{ head: null, rows: ['0 A small para'] }]);
  await page.evaluate(`window.BeesonEditor.exec('steps.deliver', { el: document.querySelector('.reveal section.present ul'), by: 'item' })`);
  assert.deepEqual(await cards(page), [{ head: null, rows: ['0 A small para'] }, { head: '2–3', rows: ['  1 A first item', '  2 A second ite'] }]);
  assert.deepEqual(newProblems(page, await rendered(page)), []);
  assert.deepEqual(errors(page), []);
});

test('a list keeps the delay of its step through a change of its delivery', async (t) => {
  const text = readFileSync('test-deck.html', 'utf8').replace('<p>Design the complete slide first', '<p class="fragment" data-fragment-index="1" data-autoslide="700">Design the complete slide first')
    .replace(LI1, '<li class="fragment" data-fragment-index="2">Each step')
    .replace(LI2, '<li class="fragment" data-fragment-index="3">Two elements')
    .replace(LI3, '<li class="fragment" data-fragment-index="4">When exporting');
  const page = await open(t, 'other', { text });
  await slideOf(page, 'li.fragment');
  await page.evaluate(`window.BeesonEditor.exec('steps.deliver', { el: document.querySelector('.reveal section.present ul'), by: 'all' })`);
  const all = await rendered(page);
  assert.match(all, /<p class="fragment" data-fragment-index="1" data-autoslide="700">Design/);
  assert.match(all, /<ul class="fragment" data-fragment-index="2">/);
  assert.match((await rows(page))[1].meta, /After Previous, 0\.7 s/);
  await page.evaluate(`window.BeesonEditor.exec('steps.deliver', { el: document.querySelector('.reveal section.present ul'), by: 'item' })`);
  assert.equal(await rendered(page), text);
});

for (const platform of PLATFORMS) {
  test(`an undo of Show with Slide writes the class and the index of the step in their order on ${platform}`, async (t) => {
    const page = await open(t, platform);
    await slideOf(page, 'li.fragment');
    const p = `document.querySelector('.reveal section.present > p')`;
    await page.evaluate(`window.BeesonEditor.exec('steps.set', { el: ${p}, to: 'last' })`);
    const stepped = await rendered(page);
    assert.match(stepped, /<p class="fragment" data-fragment-index="4">Design/);
    await page.evaluate(`window.BeesonEditor.exec('steps.set', { el: ${p}, to: null })`);
    const unstepped = await rendered(page);
    await press(page, 'Mod+Z');
    assert.equal(await rendered(page), stepped);
    await press(page, REDO[platform]);
    assert.equal(await rendered(page), unstepped);
    await press(page, 'Mod+Z');
    assert.equal(await rendered(page), stepped);
  });
}

test('the meta of a selected list head is drawn in the color of the selection', async (t) => {
  const page = await open(t, 'mac');
  await slideOf(page, 'li.fragment');
  const text = await page.evaluate(`(() => { const r = document.querySelector('.beeson-edit-side .list-head .text').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
  await clickText(page, text);
  await page.waitFor(`!!document.querySelector('.beeson-edit-side .list-head.selected')`);
  const colors = await page.evaluate(`(() => { const h = document.querySelector('.beeson-edit-side .list-head.selected'); const m = h.querySelector('.meta'); return { head: getComputedStyle(h).color, meta: getComputedStyle(m).color }; })()`);
  assert.equal(colors.meta, colors.head);
});
