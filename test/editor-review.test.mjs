import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { duration, seconds, seenAt, stepsOf } from '../src/editor/present.ts';
import { groupsOf } from '../src/editor/navigator/sorter.ts';
import { byteExact, click, clickText, drag, press, readAtPlay, saveAndReopen } from './helpers/editor.mjs';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const SOURCE = readFileSync(LAYOUTS, 'utf8');
const NARROW = '<section class="narrow">';
const WIDE = '<section class="wide">';

test('the steps of a slide are ordered as reveal.js orders its fragments', () => {
  const f = (index, kind = 'in', final = false) => ({ index, kind, final });
  assert.deepEqual(stepsOf([f(2), f(null), f(1), f(null, 'in', true), f(null)]), [1, 2, 0, 4, 3]);
  assert.deepEqual(stepsOf([]), []);
  assert.deepEqual(stepsOf([f(0), f(0)]), [0, 0]);
  assert.deepEqual([0, 1, 2].map((k) => seenAt('in', 1, k)), [false, false, true]);
  assert.deepEqual([0, 1, 2].map((k) => seenAt('out', 1, k)), [true, true, false]);
  assert.deepEqual([0, 1, 2].map((k) => seenAt('current', 1, k)), [false, false, true]);
});

test('the times of the presenter view are written as on a clock', () => {
  assert.equal(duration(0), '0:00');
  assert.equal(duration(42_400), '0:42');
  assert.equal(duration(62_000), '1:02');
  assert.equal(duration(3_723_000, true), '1:02:03');
  assert.equal(seconds(200), 1);
  assert.equal(seconds(1_600), 2);
});

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

async function reviewPage(platform, n, text = SOURCE, change = '') {
  await last?.close().catch(() => {});
  const page = await browser.newPage();
  last = page;
  await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = text;
  if (change) await page.evaluate(change);
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(text)})`);
  assert.deepEqual(status.problems, []);
  await page.evaluate(`Reveal.slide(${n})`);
  await frames(page);
  return page;
}

const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function roundTrip(page, edits) {
  await byteExact(page, edits);
  await undo(page);
  await byteExact(page);
  await redo(page);
  await byteExact(page, edits);
}

let saves = 0;
async function saved(page) {
  const before = await render(page);
  const { text } = await saveAndReopen(page, `review-${++saves}.html`);
  assert.equal(text, before);
  page.source = text;
}

async function menuOf(page, name) {
  await click(page, await page.evaluate(`(() => {
    const t = [...document.querySelectorAll('.beeson-edit-header [aria-haspopup="menu"]')].find((b) => b.textContent === ${JSON.stringify(name)});
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
  await frames(page);
  return page.evaluate(`[...document.querySelectorAll('[role="menu"] .item')].map((i) => i.textContent.trim())`);
}

for (const platform of PLATFORMS) {
  test(`the Play menu holds Present and the presenter view, and Mod+Enter plays the saved deck in place at the current slide on ${platform}`, async () => {
    const page = await reviewPage(platform, 4);
    const titles = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [aria-haspopup="menu"]')].map((b) => b.textContent)`);
    assert.deepEqual(titles.slice(-3), ['View', 'Play', 'Help']);
    const items = await menuOf(page, 'Play');
    for (const name of ['Present', 'Present from Start', 'Presenter View', 'Rehearse Timings', 'Clear Timings']) assert.ok(items.some((i) => i.startsWith(name)), `the Play menu does not have ${name}`);
    assert.ok(!(await menuOf(page, 'File')).some((i) => i.startsWith('Present')), 'Present is still in the File menu');
    await press(page, 'Escape');
    await page.evaluate(`window.open = (url) => { window.__opened = url; return null; }`);
    await press(page, 'Mod+Enter');
    await page.waitFor(`!!document.querySelector('.beeson-edit-show iframe')?.getAttribute('src')`);
    assert.ok((await page.evaluate(`document.querySelector('.beeson-edit-show iframe').getAttribute('src')`)).endsWith(`?still&edit-platform=${platform}&from-editor#/4`));
    assert.equal(await page.evaluate('window.__opened ?? null'), null);
    assert.equal(await page.evaluate(`!!document.querySelector('dialog.beeson-edit-presenter[open]')`), false);
    await page.waitFor(`(() => { const w = document.querySelector('.beeson-edit-show iframe').contentWindow; return !!w.Reveal?.isReady() && (w.MathJax?.startup?.promise?.then(() => true) ?? false); })()`);
    await press(page, 'Escape');
    await page.waitFor(`!document.querySelector('.beeson-edit-show')`);
    await press(page, 'Alt+Enter');
    await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open]')`);
    assert.ok((await page.evaluate('window.__opened')).endsWith('#/4'));
    const text = await page.evaluate(`document.querySelector('dialog.beeson-edit-presenter').textContent`);
    assert.match(text, /Current: Slide 5/);
    assert.match(text, /A wide slide with a table and code|Next/);
    await press(page, 'ArrowRight');
    await frames(page);
    assert.match(await page.evaluate(`document.querySelector('dialog.beeson-edit-presenter').textContent`), /Current: Slide 6/);
    await press(page, 'Escape');
    await page.waitFor(`!document.querySelector('dialog.beeson-edit-presenter[open]')`);
    await byteExact(page);
    assert.deepEqual(page.errors, []);
  });

  test(`a rehearsal writes data-timing on each slide shown, as one entry of the history, on ${platform}`, async () => {
    const page = await reviewPage(platform, 4);
    await page.evaluate(`(() => {
      window.__keys = [];
      window.addEventListener('keydown', (ev) => window.__keys.push({ key: ev.key, at: performance.now() }), true);
      window.__before = performance.now();
      window.BeesonEditor.exec('play.rehearse');
      window.__start = performance.now();
    })()`);
    await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open].rehearse')`);
    await wait(1100);
    await press(page, 'ArrowRight');
    await wait(1100);
    await press(page, 'ArrowRight');
    await press(page, 'Escape');
    await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter.asking')`);
    await press(page, 'Enter');
    await page.waitFor(`!document.querySelector('dialog.beeson-edit-presenter[open]')`);
    const times = await page.evaluate(`[4, 5].map((i) => document.querySelectorAll('.reveal .slides > section')[i].getAttribute('data-timing'))`);
    const [before, after, arrow, escape] = await page.evaluate(`[window.__before, window.__start, ...['ArrowRight', 'Escape'].map((key) => window.__keys.find((k) => k.key === key).at)]`);
    const ok = (t, lo, hi) => Number(t) >= seconds(lo - 50) && Number(t) <= seconds(hi + 50);
    assert.match(times[0] ?? '', /^\d+$/);
    assert.ok(ok(times[0], arrow - after, arrow - before), `slide 5 is shown for ${Math.round(arrow - after)} to ${Math.round(arrow - before)} ms, and its data-timing is ${times[0]}`);
    assert.match(times[1] ?? '', /^\d+$/);
    assert.ok(ok(times[1], escape - arrow, escape - arrow), `slide 6 is shown for ${Math.round(escape - arrow)} ms, and its data-timing is ${times[1]}`);
    const edits = [[NARROW, `<section class="narrow" data-timing="${times[0]}">`], [WIDE, `<section class="wide" data-timing="${times[1]}">`]];
    await roundTrip(page, edits);
    assert.equal((await state(page, 'play.clearTimings')).enabled, true);
    await saved(page);
    await exec(page, 'play.clearTimings');
    assert.ok(!(await render(page)).includes('data-timing'));
    await undo(page);
    await byteExact(page);
    assert.deepEqual(page.errors, []);
  });

  test(`Don't Keep leaves the timings of the slides as they were on ${platform}`, async () => {
    const page = await reviewPage(platform, 4);
    await exec(page, 'play.rehearse');
    await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open].rehearse')`);
    await press(page, 'Escape');
    await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter.asking')`);
    await press(page, 'Escape');
    await page.waitFor(`!document.querySelector('dialog.beeson-edit-presenter[open]')`);
    await byteExact(page);
    assert.equal(await page.evaluate('window.BeesonEditor.status().dirty'), false);
  });

  test(`the transitions None and Fade are written as data-transition of the next slide on ${platform}`, async () => {
    const page = await reviewPage(platform, 4);
    assert.equal((await state(page, 'slide.transition.fade')).checked, true);
    await exec(page, 'slide.transition.none');
    assert.equal((await state(page, 'slide.transition.none')).checked, true);
    const none = [[WIDE, '<section class="wide" data-transition="none">']];
    await roundTrip(page, none);
    await exec(page, 'slide.transition.fade');
    await byteExact(page);
    await undo(page);
    await byteExact(page, none);
    await saved(page);
    if (!(await state(page, 'view.steps')).checked) await exec(page, 'view.steps');
    await frames(page);
    const pressed = () => page.evaluate(`[...document.querySelectorAll('.beeson-edit-transition [data-command^="slide.transition."]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.command)`);
    assert.deepEqual(await pressed(), ['slide.transition.none']);
    await click(page, '.beeson-edit-transition [data-command="slide.transition.fade"]');
    await frames(page);
    await byteExact(page, [[none[0][1], WIDE]]);
    assert.deepEqual(await pressed(), ['slide.transition.fade']);
    await click(page, '.reveal section.present > h2');
    await frames(page);
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-side .slot').hidden`), true, 'the transition is shown with a text selected');
    assert.deepEqual(page.errors, []);
  });

  test(`Magic Move writes data-auto-animate on both slides and the same data-id on the heading and the figure on ${platform}`, async () => {
    const page = await reviewPage(platform, 3);
    const count = await page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`);
    await exec(page, 'slide.magicMove');
    await frames(page);
    assert.equal(await page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`), count + 1);
    assert.equal(await page.evaluate('Reveal.getIndices().h'), 4, 'the copy is not shown');
    const text = await render(page);
    const occurrences = (s) => text.split(s).length - 1;
    const heading = '<h2 data-id="magic-1">Math, an ordered list, and a zone</h2>';
    assert.equal(occurrences(`<section data-auto-animate>\n  ${heading}`), 2);
    assert.equal(occurrences('<figure class="figure-box fragment" data-fragment-index="2" data-id="magic-3">'), 2);
    assert.equal(occurrences('data-id="magic-2"'), 2);
    assert.equal(await page.evaluate(`window.BeesonEditor.state('slide.transition.magic').checked`), false, 'the check is not on the copy');
    await page.evaluate('Reveal.slide(3)');
    await frames(page);
    assert.equal((await state(page, 'slide.transition.magic')).checked, true);
    await undo(page);
    await byteExact(page);
    await redo(page);
    assert.equal(await render(page), text);
    await saved(page);
    await exec(page, 'slide.transition.fade');
    const off = await render(page);
    assert.equal(off.split('data-auto-animate>\n  <h2 data-id="magic-1">').length - 1, 0);
    assert.equal(off.split(heading).length - 1, 2);
    assert.deepEqual(page.errors, []);
  });

  test(`the Slide Sorter groups the slides under the section slides, and a drag moves a slide on ${platform}`, async () => {
    const page = await reviewPage(platform, 4);
    await exec(page, 'view.lightTable');
    await frames(page);
    const heads = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-sorter .head > .name')].map((h) => h.textContent)`);
    assert.deepEqual(heads, ['Opening', 'Content', 'Appendix']);
    const tile = (n) => `.beeson-edit-sorter .tile[aria-label^="Slide ${n}:"]`;
    assert.equal(await page.evaluate(`document.querySelector('${tile(5)}').getAttribute('aria-selected')`), 'true');
    assert.equal(await page.evaluate(`document.activeElement === document.querySelector('${tile(5)}')`), true);
    await press(page, 'ArrowRight');
    await frames(page);
    assert.equal(await page.evaluate('Reveal.getIndices().h'), 5);
    await press(page, 'ArrowLeft');
    await frames(page);
    const from = await page.evaluate(`(() => { const r = document.querySelector('${tile(5)} .frame').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const to = await page.evaluate(`(() => { const r = document.querySelector('${tile(7)} .frame').getBoundingClientRect(); return { x: r.left + r.width * 0.8, y: r.top + r.height / 2 }; })()`);
    await drag(page, from, { dx: to.x - from.x, dy: to.y - from.y });
    await page.waitFor(`document.querySelectorAll('.reveal .slides > section')[6].matches('.narrow')`);
    const moved = await render(page);
    assert.ok(moved.indexOf(WIDE) < moved.indexOf(NARROW));
    await undo(page);
    await byteExact(page);
    await redo(page);
    assert.equal(await render(page), moved);
    await saved(page);
    await page.evaluate(`document.querySelector('${tile(3)}').focus()`);
    await press(page, 'Enter');
    await frames(page);
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-sorter').hidden`), true);
    assert.equal(await page.evaluate('Reveal.getIndices().h'), 2);
    assert.deepEqual(page.errors, []);
  });
}

test('the groups of the Slide Sorter follow the section and closing slides', () => {
  const s = (cls = '', h = '') => ({ classList: { contains: (c) => cls.split(' ').includes(c) }, querySelectorAll: () => (h ? [{ textContent: h, closest: () => null }] : []) });
  const deck = [s('title', 'T'), s(), s('section', 'One'), s(), s('section', 'Two'), s('closing', 'Bye'), s(), s('section', 'Late')];
  assert.deepEqual(groupsOf(deck).map((g) => [g.title, g.slides.length]), [['Opening', 2], ['One', 2], ['Two', 2], ['Appendix', 2]]);
});

describe('Present in place over the editor', () => {
  const PLATFORMS = ['mac', 'other'];
  const PRESENT = 'test/pages/editor-present.html';

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
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  let saves = 0;

  async function load(t, platform, { deck = 'test-deck.html', n = 0, mode = 'light', width = 1600, height = 1000 } = {}) {
    const page = await browser.newPage({ width, height });
    t.after(() => page.close().catch(() => {}));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
    const url = `${server.origin}/${deck}?edit&still&theme=${mode}&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await page.evaluate(`(() => { const real = window.open; window.__shows = []; window.open = function (...a) { const w = real.apply(window, a); window.__shows.push(w); return w; }; return true; })()`);
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
    const { text } = await saveAndReopen(page, `r9-8-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(page.errors, []);
    page.source = text;
    return edited;
  }

  const SHOW = `(document.querySelector('.beeson-edit-show iframe')?.contentWindow ?? window.__shows?.at(-1))`;
  const showReady = `(() => { try { const w = ${SHOW}; if (!w?.Reveal?.isReady()) return false; return !w.MathJax || (w.MathJax.startup?.promise?.then(() => true) ?? false); } catch { return false; } })()`;
  const showHeading = (page) => page.evaluate(`${SHOW}.Reveal.getCurrentSlide().querySelector('h1, h2').textContent.trim()`);
  const editorHeading = (page) => page.evaluate(`Reveal.getCurrentSlide().querySelector('h1, h2').textContent.trim()`);

  for (const platform of PLATFORMS) {
    test(`Present opens the show at the current slide after a hidden slide, and at the next shown slide from a hidden one (${platform})`, async (t) => {
      for (const [n, heading, shown] of [[3, 'Four', 'Four'], [4, 'Five', 'Five'], [1, 'Two', 'Three']]) {
        const page = await load(t, platform, { deck: PRESENT, n });
        assert.equal(await editorHeading(page), heading);
        await press(page, 'Mod+Enter');
        await page.waitFor(showReady, 20000);
        assert.equal(await showHeading(page), shown, `Present from the slide ${heading} shows another slide`);
        await page.close();
      }
    });
  }

  const stageGone = `!document.querySelector('.beeson-edit-show')`;

  for (const platform of PLATFORMS) {
    test(`Present plays the show in place over the whole screen, and Esc ends it at the slide shown last (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await press(page, 'Mod+Enter');
      await page.waitFor(showReady, 20000);
      assert.equal(await page.evaluate('window.__shows.length'), 0, 'Present opens the show in a new tab');
      assert.equal(await page.evaluate(`document.fullscreenElement?.className ?? null`), 'beeson-edit-show', 'the show is not full screen');
      assert.equal(await showHeading(page), 'Show your steps one at a time');
      assert.equal(await page.evaluate(`!!${SHOW}.BeesonEditor || !!${SHOW}.document.querySelector('script[src$="editor.js"]')`), false, 'the editor is loaded in the show');
      await press(page, 'ArrowRight');
      await page.waitFor(`${SHOW}.Reveal.getIndices().f === 0`);
      await page.evaluate(`${SHOW}.Reveal.slide(6), true`);
      await sleep(300);
      await press(page, 'Escape');
      await page.waitFor(stageGone);
      assert.equal(await page.evaluate('document.fullscreenElement'), null);
      assert.equal(await editorHeading(page), 'Chapter two', 'the editor is not at the slide shown last');
      await byteExact(page);
      assert.deepEqual(page.errors, []);
    });

    test(`a show that the browser does not take into full screen fills the window, and Esc ends it (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await page.evaluate(`Element.prototype.requestFullscreen = function () { return Promise.reject(new TypeError('refused')); }, true`);
      await press(page, 'Mod+Enter');
      await page.waitFor(showReady, 20000);
      const box = await page.evaluate(`(() => { const r = document.querySelector('.beeson-edit-show iframe').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
      assert.deepEqual(box, [0, 0, 1600, 1000], 'the show does not fill the window');
      await page.evaluate(`${SHOW}.Reveal.slide(4), true`);
      await sleep(300);
      await press(page, 'Escape');
      await page.waitFor(stageGone);
      assert.equal(await editorHeading(page), 'Figures are first class citizens, too');
      await byteExact(page);
      assert.deepEqual(page.errors, []);
    });

    test(`Present with unsaved changes asks first, and the saved file is then played in place over the whole screen (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await page.evaluate(`window.BeesonEditor.exec('slide.hide')`);
      await press(page, 'Mod+Enter');
      await page.waitFor(`[...document.querySelectorAll('dialog[open] button')].some((b) => b.textContent === 'Discard changes')`);
      const at = await page.evaluate(`(() => { const r = [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Discard changes').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await clickText(page, at);
      await page.waitFor(showReady, 20000);
      assert.equal(await page.evaluate('window.__shows.length'), 0, 'Present opens the show in a new tab');
      assert.equal(await page.evaluate(`document.fullscreenElement?.className ?? null`), 'beeson-edit-show', 'the show is not full screen');
      assert.equal(await showHeading(page), 'Show your steps one at a time');
      await press(page, 'Escape');
      await page.waitFor(stageGone);
      assert.equal(await page.evaluate('window.BeesonEditor.status().dirty'), false);
      assert.equal(await page.evaluate(`document.querySelector('.reveal .slides [data-visibility="hidden"]')`), null);
      assert.deepEqual(page.errors, []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`with Use Rehearsed Timings on, the show in place moves on after the timing of its slide (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: PRESENT, n: 3 });
      await page.evaluate(`localStorage.setItem('beeson-use-timings', '1'), true`);
      await press(page, 'Mod+Enter');
      await page.waitFor(showReady, 20000);
      assert.equal(await showHeading(page), 'Four');
      await page.waitFor(`${SHOW}.Reveal.getCurrentSlide().querySelector('h2').textContent === 'Five'`, 5000);
      await press(page, 'Escape');
      await page.waitFor(stageGone);
      assert.equal(await editorHeading(page), 'Five');
      assert.deepEqual(page.errors, []);
    });
  }

  const inShow = (expression) => `(() => { const w = ${SHOW}; return ${expression}; })()`;
  const stageUp = `!!document.querySelector('.beeson-edit-show')`;
  const fullStage = `document.fullscreenElement?.className === 'beeson-edit-show'`;
  async function present(t, platform, options) {
    const page = await load(t, platform, { n: 2, ...options });
    await press(page, 'Mod+Enter');
    await page.waitFor(showReady, 20000);
    await sleep(300);
    return page;
  }

  for (const platform of PLATFORMS) {
    test(`in the show in place, d and the toggle at the top right flip the theme of the address, p the pointer, and o the overview (${platform})`, async (t) => {
      const page = await present(t, platform, { mode: 'light' });
      assert.equal(await page.evaluate(inShow(`new URL(w.location.href).searchParams.get('theme')`)), 'light', 'the show is not given the theme of the address of the editor');
      assert.equal(await page.evaluate(inShow('w.document.documentElement.dataset.theme')), 'light');
      await press(page, 'd');
      await page.waitFor(inShow(`w.document.documentElement.dataset.theme === 'dark'`), 3000);
      const toggle = await page.evaluate(inShow(`(() => {
      const b = w.document.querySelector('.theme-switch');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const s = w.getComputedStyle(b);
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      return { x, y, shown: r.width > 0 && Number(s.opacity) > 0 && s.visibility === 'visible' && w.document.elementFromPoint(x, y) === b, right: x > w.innerWidth * 0.75 && y < w.innerHeight * 0.25 };
    })()`));
      assert.ok(toggle?.shown, 'the toggle of the theme is not shown in the show');
      assert.ok(toggle.right, 'the toggle of the theme is not at the top right');
      await clickText(page, toggle);
      await page.waitFor(inShow(`w.document.documentElement.dataset.theme === 'light'`), 3000);
      await press(page, 'p');
      await page.waitFor(inShow(`!!w.document.querySelector('.pointer-dot')`), 3000);
      await press(page, 'p');
      await page.waitFor(inShow(`!w.document.querySelector('.pointer-dot')`), 3000);
      await press(page, 'o');
      await sleep(500);
      assert.ok(await page.evaluate(stageUp), 'o ends the show');
      assert.equal(await page.evaluate(inShow('w.Reveal.isOverview()')), true, 'o does not open the overview');
      await press(page, 'o');
      await page.waitFor(inShow('!w.Reveal.isOverview()'), 3000);
      assert.ok(await page.evaluate(fullStage));
      await press(page, 'Escape');
      await page.waitFor(stageGone);
      assert.deepEqual(page.errors, []);
    });

    test(`in the show in place, f leaves full screen and enters it again, and the show goes on (${platform})`, async (t) => {
      const page = await present(t, platform);
      assert.ok(await page.evaluate(fullStage));
      await press(page, 'f');
      await sleep(500);
      assert.ok(await page.evaluate(stageUp), 'f ends the show');
      assert.equal(await page.evaluate('document.fullscreenElement'), null, 'f does not leave full screen');
      await press(page, 'ArrowRight');
      await page.waitFor(`${SHOW}.Reveal.getIndices().f === 0`, 3000);
      await press(page, 'f');
      await sleep(500);
      assert.ok(await page.evaluate(fullStage), 'f does not enter full screen again');
      await press(page, 'ArrowRight');
      await page.waitFor(`${SHOW}.Reveal.getIndices().f === 1`, 3000);
      await press(page, 'Escape');
      await page.waitFor(stageGone);
      assert.equal(await page.evaluate('document.fullscreenElement'), null);
      assert.equal(await editorHeading(page), 'Show your steps one at a time');
      assert.deepEqual(page.errors, []);
    });

    test(`in the show in place, e returns to the editor at the slide shown, and the deck is never loaded with edit in the frame (${platform})`, async (t) => {
      const page = await present(t, platform);
      await page.evaluate(`(() => { const f = document.querySelector('.beeson-edit-show iframe'); window.__loads = []; f.addEventListener('load', () => window.__loads.push(f.contentWindow?.location.href ?? null), true); return true; })()`);
      await page.evaluate(`${SHOW}.Reveal.slide(4), true`);
      await sleep(300);
      await press(page, 'e');
      await page.waitFor(stageGone, 10000);
      await sleep(300);
      assert.deepEqual(await page.evaluate('window.__loads'), [], 'e loads another page into the frame of the show');
      assert.equal(await page.evaluate('document.fullscreenElement'), null);
      assert.equal(await editorHeading(page), 'Figures are first class citizens, too', 'e does not return to the editor at the slide shown');
      await byteExact(page);
      assert.deepEqual(page.errors, []);
    });

    test(`in the show in place, s opens the speaker view with the notes, and the show goes on (${platform})`, async (t) => {
      const page = await present(t, platform);
      await page.evaluate(inShow(`(() => { const real = w.open; w.open = function (...a) { const v = real.apply(w, a); w.__speaker = v; return v; }; return true; })()`));
      await press(page, 's');
      await sleep(1000);
      assert.ok(await page.evaluate(stageUp), 'the speaker view ends the show');
      await page.waitFor(inShow(`/A new element is faded in/.test(w.__speaker?.document.querySelector('.speaker-controls-notes .value')?.textContent ?? '')`), 60000);
      await press(page, 'ArrowRight');
      await page.waitFor(`${SHOW}.Reveal.getIndices().f === 0`, 3000);
      await page.evaluate(inShow('(w.__speaker.close(), true)'));
      await press(page, 'Escape');
      await page.waitFor(stageGone);
      assert.equal(await editorHeading(page), 'Show your steps one at a time');
      assert.deepEqual(page.errors, []);
    });

    test(`in the show in place, the show goes on when the speaker view leaves full screen late (${platform})`, async (t) => {
      const page = await present(t, platform);
      await page.waitFor(fullStage, 5000);
      await page.evaluate(`(() => {
      const late = (ev) => {
        if (document.fullscreenElement || !ev.isTrusted) return;
        ev.stopImmediatePropagation();
        window.removeEventListener('fullscreenchange', late, true);
        setTimeout(() => {
          document.dispatchEvent(new Event('fullscreenchange'));
          setTimeout(() => (window.__late = !!document.querySelector('.beeson-edit-show')), 300);
        }, 2500);
      };
      window.addEventListener('fullscreenchange', late, true);
      return true;
    })()`);
      await page.evaluate(inShow(`(() => { const real = w.open; w.open = function (...a) { const v = real.apply(w, a); w.__speaker = v; return v; }; return true; })()`));
      await press(page, 's');
      await page.waitFor(`window.__late !== undefined`, 60000);
      const up = await page.evaluate('window.__late');
      await page.evaluate(inShow('(w.__speaker?.close(), true)')).catch(() => {});
      assert.equal(up, true, 'the show ends when the speaker view leaves full screen late');
      assert.deepEqual(page.errors, []);
    });

    test(`in the show in place, the scrubber opens near the bottom edge, and a click on a tick shows its slide (${platform})`, async (t) => {
      const page = await present(t, platform);
      const move = (x, y) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await move(800, 990);
      await page.waitFor(inShow(`w.document.querySelector('.reveal').classList.contains('scrubbing')`), 3000);
      const target = await page.evaluate(inShow(`(() => {
      const ticks = [...w.document.querySelectorAll('.scrub-tick')];
      const slides = w.Reveal.getSlides();
      const box = w.document.querySelector('.scrub').getBoundingClientRect();
      const i = 6;
      return { h: w.Reveal.getIndices(slides[i]).h, now: w.Reveal.getIndices().h, x: box.left + box.width * parseFloat(ticks[i].style.left) / 100 };
    })()`));
      assert.notEqual(target.h, target.now);
      await move(target.x, 990);
      await clickText(page, { x: target.x, y: 990 });
      await page.waitFor(`${SHOW}.Reveal.getIndices().h === ${target.h}`, 3000);
      const heading = await showHeading(page);
      await press(page, 'Escape');
      await page.waitFor(stageGone);
      assert.equal(await editorHeading(page), heading);
      assert.deepEqual(page.errors, []);
    });
  }

  const VIEW = `(() => {
  const d = document.querySelector('dialog.beeson-edit-presenter');
  const [at] = d.querySelector('.count').textContent.split('/').map(Number);
  const m = /Step (\\d+) of (\\d+)/.exec(d.textContent);
  const clone = d.querySelector('.shot.current .pic').shadowRoot.querySelector('.slides > section');
  const opacity = [...clone.querySelectorAll('.fragment')].map((f) => (getComputedStyle(f).visibility === 'hidden' ? 0 : Number(getComputedStyle(f).opacity)));
  return { at, step: m ? Number(m[1]) : 0, n: m ? Number(m[2]) : 0, opacity };
})()`;
  const TAB = `window.__shows.at(-1)`;

  for (const platform of PLATFORMS) {
    test(`the presenter view counts and draws the steps of each slide as the show plays them, the restore step included (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await press(page, 'Alt+Enter');
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open]') && !!${TAB}?.Reveal?.isReady()`, 20000);
      await sleep(300);
      let view = await page.evaluate(VIEW);
      assert.deepEqual([view.at, view.step, view.n], [3, 0, 4], 'the view does not count the restore step of slide 3');
      await press(page, 'ArrowRight');
      await press(page, 'ArrowRight');
      view = await page.evaluate(VIEW);
      assert.deepEqual(view.opacity, [0.45, 1, 0], 'the view does not dim the earlier step of slide 3 as the show does');
      await press(page, 'ArrowRight');
      await press(page, 'ArrowRight');
      view = await page.evaluate(VIEW);
      assert.deepEqual(view.opacity, [1, 1, 1], 'the restore step of slide 3 does not show every step at full opacity');
      assert.deepEqual(await page.evaluate(`${TAB}.Reveal.getIndices()`), { h: 2, v: 0, f: 3 }, 'the show does not play the restore step of slide 3');
      for (let i = 0; i < 60 && !(await page.evaluate(`/End of the show/.test(document.querySelector('dialog.beeson-edit-presenter').textContent)`)); i++) {
        await press(page, 'ArrowRight');
        view = await page.evaluate(VIEW);
        const show = await page.evaluate(`${TAB}.Reveal.getIndices()`);
        assert.deepEqual([show.h, show.f ?? -1], [view.at - 1, view.step - 1], `the show is not at slide ${view.at}, step ${view.step} of the view`);
        const steps = await page.evaluate(`new Set([...${TAB}.Reveal.getCurrentSlide().querySelectorAll('.fragment')].map((f) => f.dataset.fragmentIndex)).size`);
        assert.equal(view.n, steps, `the view counts ${view.n} steps on slide ${view.at}, and the show ${steps}`);
      }
      await page.evaluate(`${TAB}.Reveal.slide(2, 0, -1), true`);
      await sleep(600);
      for (let k = 1; k <= 4; k++) {
        await page.evaluate(`${TAB}.Reveal.next(), true`);
        await page.waitFor(`(() => { const v = ${VIEW}; return v.at === 3 && v.step === ${k}; })()`, 5000).catch(() => {});
        view = await page.evaluate(VIEW);
        assert.deepEqual([view.at, view.step, view.n], [3, k, 4], `the view does not follow step ${k} of the show`);
      }
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('dialog.beeson-edit-presenter[open]')`);
      await page.evaluate(`${TAB}.close(), true`);
      await byteExact(page);
      assert.deepEqual(page.errors, []);
    });
  }

  const LOOK = `(() => {
  const d = document.querySelector('dialog.beeson-edit-presenter[open]');
  const bg = (el, pseudo) => getComputedStyle(el, pseudo).backgroundColor;
  return { stage: bg(d), head: bg(d.querySelector('.bar')), foot: bg(d.querySelector('.bar.foot')), backdrop: bg(d, '::backdrop'), text: getComputedStyle(d).color };
})()`;
  for (const platform of PLATFORMS) {
    test(`the presenter display and the rehearsal are drawn on a black stage in the light and the dark appearance (${platform})`, async (t) => {
      const looks = [];
      for (const mode of ['light', 'dark']) {
        const page = await load(t, platform, { mode, n: 2 });
        await press(page, 'Alt+Enter');
        await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open]')`, 20000);
        looks.push(['presenter display', mode, await page.evaluate(LOOK)]);
        await press(page, 'Escape');
        await page.waitFor(`!document.querySelector('dialog.beeson-edit-presenter[open]')`);
        await page.evaluate(`${TAB}?.close(), true`);
        await page.evaluate(`window.BeesonEditor.exec('play.rehearse'), true`);
        await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter.rehearse[open]')`, 20000);
        looks.push(['rehearsal', mode, await page.evaluate(LOOK)]);
        assert.deepEqual(page.errors, []);
        await page.close();
      }
      const off = [];
      for (const [what, mode, look] of looks) {
        for (const part of ['stage', 'head', 'foot', 'backdrop']) if (look[part] !== 'rgb(0, 0, 0)') off.push(`${what}, ${mode}: ${part} ${look[part]}`);
        if (Math.min(...look.text.match(/\d+/g).slice(0, 3).map(Number)) <= 200) off.push(`${what}, ${mode}: text ${look.text}`);
      }
      assert.deepEqual(off, [], 'the presenter display or the rehearsal is not drawn on a black stage');
    });
  }

  const SEG = `[...document.querySelectorAll('.beeson-edit-transition [data-command^="slide.transition."]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.command.split('.').pop())`;
  const TAGS = `[...document.querySelectorAll('.reveal .slides > section')].slice(2, 5).map((s) => [s.getAttribute('data-transition'), s.hasAttribute('data-auto-animate')])`;
  const segment = (kind) => `.beeson-edit-transition [data-command="slide.transition.${kind}"]`;
  for (const platform of PLATFORMS) {
    test(`the transition of a slide is played when the show leaves it, as in Keynote, and the control shows the file in that direction (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      if (!(await page.evaluate(`window.BeesonEditor.state('view.steps').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
      await frames(page);
      const goTo = async (n) => {
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
      };
      await clickText(page, segment('magic'));
      await frames(page);
      assert.deepEqual(await page.evaluate(SEG), ['magic']);
      assert.deepEqual(await page.evaluate(TAGS), [[null, true], [null, true], [null, false]]);
      await goTo(3);
      assert.deepEqual(await page.evaluate(SEG), ['fade'], 'slide 4 does not show the Fade by which the show leaves it');
      await clickText(page, segment('none'));
      await frames(page);
      assert.deepEqual(await page.evaluate(TAGS), [[null, true], [null, true], ['none', false]], 'None on slide 4 is not written as the cut from slide 4 into slide 5');
      assert.deepEqual(await page.evaluate(SEG), ['none']);
      const plan = await readAtPlay(page, `(() => { const l = document.querySelector('.beeson-edit-preview'); return l && { kind: l.dataset.kind, shots: [...l.querySelectorAll('.shot')].map((s) => s.shadowRoot.querySelector('h1, h2')?.textContent.trim()) }; })()`, () => click(page, '.beeson-edit-transition .preview'));
      const headings = await page.evaluate(`[...document.querySelectorAll('.reveal .slides > section')].slice(3, 5).map((s) => s.querySelector('h1, h2').textContent.trim())`);
      assert.deepEqual(plan, { kind: 'none', shots: headings }, 'Preview on slide 4 does not play the cut from slide 4 into slide 5');
      await goTo(2);
      assert.deepEqual(await page.evaluate(SEG), ['magic']);
      await clickText(page, segment('fade'));
      await frames(page);
      assert.deepEqual(await page.evaluate(TAGS), [[null, false], [null, false], ['none', false]]);
      assert.deepEqual(await page.evaluate(SEG), ['fade']);
      assert.match(await page.evaluate(`document.querySelector('${segment('fade')}').title`), /next slide/);
      await goTo(12);
      assert.deepEqual(await page.evaluate(SEG), [], 'the last slide shows a transition');
      assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-transition [data-command^="slide.transition."]')].every((b) => b.disabled)`), true);
      await roundTrip(page, 3);
    });
  }

  const ROW = (text) => `[...document.querySelectorAll('.beeson-edit-side .rows .row')].find((r) => r.querySelector('.text').textContent.startsWith(${js(text)}))`;
  const pointIn = (page, el, fx = 0.5) => page.evaluate(`(() => { const el = ${el}; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height / 2 }; })()`);
  const SELECTED_ROWS = `[...document.querySelectorAll('.beeson-edit-side .rows .row.selected')].map((r) => r.querySelector('.text').textContent.slice(0, 15))`;
  async function choose(page, label) {
    const item = await pointIn(page, `[...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label').textContent === ${js(label)} && i.getAttribute('aria-disabled') !== 'true')`);
    await sleep(300);
    await clickText(page, item);
  }
  const openSteps = async (page) => {
    if (!(await page.evaluate(`window.BeesonEditor.state('view.steps').checked`))) await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
    await frames(page);
  };
  const [HEADING, PARA, LAST] = ['Show your steps', 'Design the comp', 'When exporting '];
  for (const platform of PLATFORMS) {
    test(`Shift and Mod clicks on rows of the Steps list add their elements to the selection (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await openSteps(page);
      await clickText(page, await pointIn(page, ROW(HEADING), 0.7));
      await click(page, await pointIn(page, ROW(PARA), 0.7), { modifiers: 'Shift' });
      await frames(page);
      assert.deepEqual(await page.evaluate(SELECTED_ROWS), [HEADING, PARA], 'Shift does not add a row to the selection');
      await click(page, await pointIn(page, ROW(LAST), 0.7), { modifiers: 'Mod' });
      await frames(page);
      assert.deepEqual((await page.evaluate(SELECTED_ROWS)).sort(), [HEADING, PARA, LAST].sort(), 'Mod does not add a row to the selection');
      await click(page, await pointIn(page, ROW(LAST), 0.7), { modifiers: 'Mod' });
      await frames(page);
      assert.deepEqual(await page.evaluate(SELECTED_ROWS), [HEADING, PARA], 'Mod does not take a row off the selection');
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`the chip menu of a selected row gives every selected element one step together, as one entry of the history (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await openSteps(page);
      await clickText(page, '.reveal section.present > p');
      await press(page, 'Escape');
      await click(page, '.reveal section.present > h2', { modifiers: 'Shift' });
      await frames(page);
      assert.deepEqual(await page.evaluate(SELECTED_ROWS), [HEADING, PARA]);
      await clickText(page, await pointIn(page, `${ROW(PARA)}.querySelector('.chip')`));
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
      assert.deepEqual(await page.evaluate(SELECTED_ROWS), [HEADING, PARA], 'the chip menu selects its row alone');
      await choose(page, 'New Step at End');
      await frames(page);
      const steps = await page.evaluate(`[${ROW(HEADING)}.dataset.step, ${ROW(PARA)}.dataset.step, ${ROW(LAST)}.dataset.step]`);
      assert.equal(steps[0], steps[1], 'the two elements are not given one step');
      assert.equal(Number(steps[0]), Number(steps[2]) + 1, 'the step is not new at the end');
      await roundTrip(page, 1);
    });
  }

  const TWO = 'Two elements wi';
  const overlap = (text) => `(() => { const r = ${ROW(text)}; return r.querySelector('.chip').getBoundingClientRect().right - r.querySelector('.text').getBoundingClientRect().left; })()`;
  for (const platform of PLATFORMS) {
    test(`the chip of a row with a start mark or Show Last does not cover its text (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await openSteps(page);
      for (const [row, label] of [[TWO, 'With Previous'], [TWO, 'After Previous'], [LAST, 'Show Last']]) {
        await clickText(page, await pointIn(page, `${ROW(row)}.querySelector('.chip')`));
        await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
        await choose(page, label);
        await frames(page);
        assert.ok((await page.evaluate(overlap(row))) <= 0, `the chip of ${label} covers the text of its row by ${await page.evaluate(overlap(row))} px`);
      }
      assert.deepEqual(page.errors, []);
    });

    test(`the two Preview buttons of the Steps tab name what they play (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 2 });
      await openSteps(page);
      const labels = await page.evaluate(`[document.querySelector('.beeson-edit-transition .preview'), document.querySelector('.beeson-edit-side .head button.play')].map((b) => b?.textContent.trim())`);
      assert.deepEqual(labels, ['Preview Transition', 'Preview Steps']);
      assert.deepEqual(page.errors, []);
    });
  }

  const SPEAKER_FRAME = (w) => `${w}.__speaker?.document.querySelector('#current-slide iframe')?.contentWindow`;
  const keepSpeaker = (w) => `(() => { const w = ${w}; const real = w.open; w.open = function (...a) { const v = real.apply(w, a); w.__speaker = v; window.__speakerKept = v; return v; }; return true; })()`;
  const speakerReady = (w) => `(() => { try { return !!${SPEAKER_FRAME(w)}?.Reveal?.isReady?.(); } catch { return false; } })()`;
  const speakerKey = (keyCode) => `(window.__speakerKept.document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: ${keyCode}, bubbles: true })), true)`;
  const within = (page, expression, timeout) => page.waitFor(expression, timeout).then(() => true, () => false);

  for (const platform of PLATFORMS) {
    test(`e in the speaker view of a deck opened by itself opens the editor in the window of the show at the slide shown, and closes the speaker view (${platform})`, async (t) => {
      const page = await browser.newPage({ width: 1600, height: 1000 });
      t.after(() => page.close().catch(() => {}));
      await page.goto(`${server.origin}/test-deck.html?still&edit-platform=${platform}#/2`);
      await page.waitFor(deckSettled);
      await page.evaluate(keepSpeaker('window'));
      await press(page, 's');
      await page.waitFor(speakerReady('window'), 60000);
      await sleep(500);
      await page.evaluate(speakerKey(69));
      assert.ok(await within(page, `new URLSearchParams(location.search).has('edit') && !!window.BeesonEditor`, 10000), 'e in the speaker view does not open the editor in the window of the show');
      await page.waitFor('window.BeesonEditor.ready.then(() => true)');
      assert.equal(await page.evaluate('Reveal.getIndices().h'), 2, 'the editor is not opened at the slide shown');
      const left = await page.evaluate(`(() => { const v = window.open('', 'reveal.js - Notes'); if (!v) return false; const open = !!v.document.querySelector('#current-slide'); if (!open) v.close(); return open; })()`);
      assert.equal(left, false, 'the speaker view is left open after e opens the editor');
    });

    test(`e and Esc in the speaker view of the show in place end the show and return to the editor at the slide shown (${platform})`, async (t) => {
      for (const [name, keyCode] of [['e', 69], ['Esc', 27]]) {
        const page = await present(t, platform);
        await page.evaluate(`${SHOW}.Reveal.slide(3)`);
        await page.evaluate(keepSpeaker(SHOW));
        await press(page, 's');
        await page.waitFor(speakerReady(SHOW), 60000);
        await sleep(500);
        const shown = await showHeading(page);
        await page.evaluate(speakerKey(keyCode));
        assert.ok(await within(page, stageGone, 5000), `${name} in the speaker view does not end the show`);
        assert.equal(await editorHeading(page), shown, `${name} in the speaker view does not return to the slide shown`);
        assert.deepEqual(page.errors, []);
      }
    });

    test(`the speaker view is closed with the show in place, when the show is ended with e or Esc in its own window (${platform})`, async (t) => {
      for (const key of ['e', 'Escape']) {
        const page = await present(t, platform);
        await page.evaluate(keepSpeaker(SHOW));
        await press(page, 's');
        await page.waitFor(speakerReady(SHOW), 60000);
        await sleep(500);
        await page.evaluate(`${SHOW}.focus()`);
        await press(page, key);
        await page.waitFor(stageGone, 5000);
        assert.ok(await within(page, 'window.__speakerKept.closed', 3000), `the speaker view is left open after ${key} in the show`);
        assert.deepEqual(page.errors, []);
      }
    });
  }
});

describe('Preview Transition and Use Rehearsed Timings', () => {
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

  async function editor(platform, { deck = 'test-deck.html', text = readFileSync(deck, 'utf8'), index = 0, change = '' } = {}) {
    await last?.close().catch(() => {});
    const page = await browser.newPage();
    last = page;
    await page.send('Page.bringToFront');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    await page.evaluate('localStorage.clear()');
    page.source = text;
    if (change) await page.evaluate(change);
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(text)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(typeof index === 'number' ? `Reveal.slide(${index})` : `Reveal.slide(Reveal.getIndices(document.querySelector(${JSON.stringify(index)}).closest('section')).h)`);
    await frames(page);
    return page;
  }

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');

  const wait = (ms) => new Promise((done) => setTimeout(done, ms));

  const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top <= b.bottom && b.top <= a.bottom;

  for (const platform of PLATFORMS) {
    test(`the ghost of a dragged step leaves its drop line and the row after it in view on ${platform}`, async () => {
      const page = await editor(platform, { index: 'div.math[data-keep]' });
      if (!(await page.evaluate(`window.BeesonEditor.state('view.steps').checked`))) await exec(page, 'view.steps');
      await frames(page);
      const at = await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.beeson-edit-side .rows .step:not(.plain)')];
      const grip = cards.at(-1).querySelector('.row .grip').getBoundingClientRect();
      const y = (cards[0].getBoundingClientRect().bottom + cards[1].getBoundingClientRect().top) / 2;
      return { x: grip.left + grip.width / 2, y: grip.top + grip.height / 2, to: y };
    })()`);
      await drag(page, at, { dy: at.to - at.y, steps: 12, hold: true });
      const boxes = await page.evaluate(`(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      const line = document.querySelector('.beeson-edit-side .drop-line');
      const ghost = document.querySelector('.beeson-steps-ghost');
      const target = document.querySelectorAll('.beeson-edit-side .rows .step:not(.plain)')[1];
      return { shown: !!line && !line.hidden && !!ghost, line: line && box(line), ghost: ghost && box(ghost), target: box(target) };
    })()`);
      await press(page, 'Escape');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.to, button: 'left', clickCount: 1 });
      assert.ok(boxes.shown, 'the drag does not show its drop line and its ghost');
      assert.ok(!overlap(boxes.ghost, boxes.line), `the ghost ${JSON.stringify(boxes.ghost)} covers the drop line ${JSON.stringify(boxes.line)}`);
      assert.ok(!overlap(boxes.ghost, boxes.target), `the ghost ${JSON.stringify(boxes.ghost)} covers the row after the drop line ${JSON.stringify(boxes.target)}`);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
      assert.deepEqual(page.errors, []);
    });
  }

  const record = (page, { escape = false } = {}) => page.evaluate(`(() => {
  const log = (window.previews = []);
  const state = (layer) => {
    const shots = [...layer.querySelectorAll('.shot')];
    return {
      kind: layer.dataset.kind,
      phase: layer.dataset.phase ?? 'hold',
      shots: shots.map((s) => Number(getComputedStyle(s).opacity)),
      fades: shots.map((s) => s.getAnimations().map((a) => a.effect.getKeyframes().map((k) => Number(k.opacity)))),
      moving: shots[1]?.shadowRoot?.querySelector('h2')?.getAnimations().length ?? 0,
    };
  };
  new MutationObserver(() => {
    const layer = document.querySelector('.beeson-edit-preview');
    if (!layer) {
      if (log.length && log.at(-1).phase !== 'ended') log.push({ phase: 'ended' });
      return;
    }
    const now = state(layer);
    if (log.at(-1)?.phase === now.phase) return;
    log.push(now);
    if (${escape} && now.phase === 'play') {
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      log.push({ phase: 'escaped', removed: !document.querySelector('.beeson-edit-preview') });
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-phase'] });
  return true;
})()`);
  const recorded = async (page) => {
    await page.waitFor(`window.previews.at(-1)?.phase === 'ended'`, 10000);
    return page.evaluate('window.previews');
  };
  const idle = (page) => page.evaluate(`({ h: Reveal.getIndices().h, undo: window.BeesonEditor.state('edit.undo').enabled })`);

  for (const platform of PLATFORMS) {
    test(`Preview plays the fade into the slide from the slide before and leaves the slide as it was on ${platform}`, async () => {
      const page = await editor(platform, { index: 3 });
      const before = await idle(page);
      const items = await page.evaluate(`window.BeesonEditor.state('slide.previewTransition')`);
      assert.equal(items.enabled, true);
      assert.equal(items.label, 'Preview Transition');
      await record(page);
      await exec(page, 'slide.previewTransition');
      const [hold, play, end] = await recorded(page);
      assert.deepEqual([hold.kind, hold.phase, hold.shots], ['fade', 'hold', [1, 0]]);
      assert.equal(play.phase, 'play');
      assert.deepEqual(play.fades, [[[1, 0]], [[0, 1]]], 'the slide before is not faded out, and the slide faded in');
      assert.equal(end.phase, 'ended');
      assert.deepEqual(await idle(page), before);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`Preview cuts into a slide with None, and Esc ends it, from the head of the Steps tab on ${platform}`, async () => {
      const page = await editor(platform, { index: 3 });
      await exec(page, 'slide.transition.none');
      const edited = await page.evaluate('window.BeesonEditor.render()');
      if (!(await page.evaluate(`window.BeesonEditor.state('view.steps').checked`))) await exec(page, 'view.steps');
      await frames(page);
      await record(page, { escape: true });
      await click(page, '.beeson-edit-transition .preview');
      const log = await recorded(page);
      assert.deepEqual(log.map((p) => p.phase), ['hold', 'play', 'escaped', 'ended']);
      assert.equal(log[0].kind, 'none');
      assert.deepEqual(log[1].shots, [0, 1]);
      assert.equal(log[2].removed, true, 'Esc does not end the preview');
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), edited);
      assert.deepEqual(page.errors, []);
    });

    test(`Preview plays Magic Move into the next slide, moving the matched heading on ${platform}`, async () => {
      const page = await editor(platform, { index: 3 });
      await exec(page, 'slide.magicMove');
      await page.evaluate('window.BeesonEditor.status()');
      await page.evaluate('Reveal.slide(3)');
      await frames(page);
      const edited = await page.evaluate('window.BeesonEditor.render()');
      await record(page);
      await exec(page, 'slide.previewTransition');
      const [hold, play] = await recorded(page);
      assert.equal(hold.kind, 'magic');
      assert.equal(play.phase, 'play');
      assert.equal(play.moving, 1, 'the heading of the next slide is not moved');
      assert.equal(await page.evaluate('Reveal.getIndices().h'), 3);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), edited);
      assert.deepEqual(page.errors, []);
    });
  }

  const TIMED = () => readFileSync('test-deck.html', 'utf8').replace('<section class="title">', '<section class="title" data-timing="1">').replace('<section class="section">', '<section class="section" data-timing="1">');

  for (const platform of PLATFORMS) {
    test(`with Use Rehearsed Timings on, a show opened from the editor moves on after the timings on ${platform}`, async (t) => {
      const file = `.timed-${process.pid}-${platform}.html`;
      const text = TIMED();
      writeFileSync(file, text);
      t.after(() => rmSync(file, { force: true }));
      const page = await editor(platform, { deck: file, text });
      assert.equal((await page.evaluate(`window.BeesonEditor.state('play.useTimings')`)).checked, false);
      const SHOW = `document.querySelector('.beeson-edit-show iframe')?.contentWindow`;
      const shown = async () => page.evaluate(`(() => { try { const R = ${SHOW}?.Reveal; return R?.isReady?.() ? R.getIndices().h : null; } catch { return null; } })()`);
      const end = async () => {
        await press(page, 'Escape');
        await page.waitFor(`!document.querySelector('.beeson-edit-show')`);
      };

      await press(page, 'Mod+Shift+Enter');
      await page.waitFor(`(() => { try { return !!${SHOW}?.Reveal?.isReady?.(); } catch { return false; } })()`, 60000);
      await wait(1800);
      assert.equal(await shown(), 0);
      await end();

      await exec(page, 'play.useTimings');
      assert.equal((await page.evaluate(`window.BeesonEditor.state('play.useTimings')`)).checked, true);
      await press(page, 'Mod+Shift+Enter');
      await page.waitFor(`(() => { try { return ${SHOW}?.Reveal?.isReady?.() && ${SHOW}.Reveal.getIndices().h === 2; } catch { return false; } })()`, 60000);
      const delays = await page.evaluate(`[...${SHOW}.document.querySelectorAll('.reveal .slides > section')].slice(0, 3).map((s) => s.getAttribute('data-autoslide'))`);
      assert.deepEqual(delays, ['1000', '1000', null]);
      await end();
      assert.equal(readFileSync(file, 'utf8'), text);
      assert.equal(await page.evaluate('window.BeesonEditor.render()'), text);
      assert.deepEqual(page.errors, []);
    });
  }
});
