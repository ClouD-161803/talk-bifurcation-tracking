// the Steps tab of the inspector with trusted input on either platform: a row dragged from step 3
// to step 1 writes the indexes of the slide and the data-keep that names the moved step, the menu
// of a chip sets the step, the start, the effect, and Show Last, a row selects its element and a
// selected element marks its row, Alt with an arrow moves a step, each row shows 30 characters of
// its text at 1440 by 900, and Preview plays the steps and ends on the last layer of the slide.
// after each edit an undo gives the file byte for byte, a redo gives the edit, and a save is
// opened again without problems

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deckSettled, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { center, click, clickText, drag, press, previewFrames, readAtPlay, recordPreview, saveAndReopen, selectFigure, selectPicture, type } from './helpers/editor.mjs';
import { editProblems, textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { tokenize } from '../src/editor/tokens.ts';

const PLATFORMS = ['mac', 'other'];
const REDO = { mac: 'Mod+Shift+Z', other: 'Mod+Y' };
// the errors of a page, apart from the request of a favicon, which test/pages does not have
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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

// the demo deck with the formula of the slide of stepped math held through step 3, since no deck
// has a data-keep of a number
const KEEP_BEFORE = '<div class="math fragment" data-fragment-index="1" data-keep>';
const KEEP_AFTER = '<div class="math fragment" data-fragment-index="1" data-keep="3">';
const demo = () => readFileSync('test-deck.html', 'utf8').replace(KEEP_BEFORE, KEEP_AFTER);

// the editor on a deck served over HTTP, opened with text, with the Steps tab shown
async function open(t, platform, { deck = 'test-deck.html', text = readFileSync(deck, 'utf8'), width = 1920, height = 1080 } = {}) {
  const page = await browser.newPage({ width, height });
  t.after(() => page.close());
  await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = text;
  // the drafts that an earlier test left in the shared browser are not offered
  await page.evaluate('localStorage.clear()');
  assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(text)})`)).problems, []);
  await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
  return page;
}

// the slide of the element matched by selector is shown
async function slideOf(page, selector) {
  await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Reveal.slide(Reveal.getIndices(el.closest('section')).h); })()`);
  await sleep(150);
}

const rendered = (page) => page.evaluate('window.BeesonEditor.render()');
const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);

// the rows in their order: the step written on the row, its text, its chip, and its marks
const rows = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-side .rows .row')].map((r) => ({
  step: r.dataset.step,
  text: r.querySelector('.text').textContent,
  chip: r.querySelector('.chip').textContent,
  meta: r.querySelector('.meta').textContent,
  selected: r.classList.contains('selected'),
}))`);

// the center of a part of the row whose text starts with text
async function rowPart(page, text, part = '.grip') {
  const at = await page.evaluate(`(() => {
    const row = [...document.querySelectorAll('.beeson-edit-side .rows .row')].find((r) => r.querySelector('.text').textContent.startsWith(${JSON.stringify(text)}));
    const r = (${JSON.stringify(part)} ? row.querySelector(${JSON.stringify(part)}) : row).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  return at;
}

// an item of the menu of the chip of the row with text, chosen with two trusted clicks
async function pick(page, text, label) {
  await click(page, await rowPart(page, text, '.chip'));
  await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
  const item = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label').textContent === ${JSON.stringify(label)});
    if (!item || item.getAttribute('aria-disabled') === 'true') return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  assert.ok(item, `the menu of the chip does not have an enabled item ${label}`);
  // an item is taken at a release 250 ms after the press that opened its menu
  await sleep(300);
  await click(page, item);
  await page.evaluate('window.BeesonEditor.status()');
}

// the edit is undone to the text before it byte for byte, and redone to the text after it
async function undoRedo(page, platform, before, after) {
  await press(page, 'Mod+Z');
  assert.equal(await rendered(page), before, 'an undo does not give the file before the edit');
  await press(page, REDO[platform]);
  assert.equal(await rendered(page), after, 'a redo does not give the edit again');
}

for (const platform of PLATFORMS) {
  test(`a row dragged from step 3 to step 1 writes the indexes and its data-keep on ${platform}`, async (t) => {
    const page = await open(t, platform, { text: demo() });
    await slideOf(page, 'div.math[data-keep]');
    assert.deepEqual((await rows(page)).map((r) => r.step), ['0', '1', '2', '3', '', '']);
    const grip = await rowPart(page, 'The Coriolis');
    const top = await page.evaluate(`document.querySelector('.beeson-edit-side .rows .step:not(.plain)').getBoundingClientRect().top`);

    // a drag shows a line where the row goes and a ghost of the row, and Esc cancels it
    await drag(page, grip, { dy: top - 3 - grip.y, steps: 12, hold: true });
    const during = await page.evaluate(`({ line: !document.querySelector('.beeson-edit-side .drop-line').hidden, ghost: !!document.querySelector('.beeson-steps-ghost'), dragging: !!document.querySelector('.beeson-edit-side .row.dragging') })`);
    assert.deepEqual(during, { line: true, ghost: true, dragging: true });
    await press(page, 'Escape');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: grip.x, y: top - 3, button: 'left', clickCount: 1 });
    assert.equal(await rendered(page), page.source);
    assert.equal(await page.evaluate(`!!document.querySelector('.beeson-steps-ghost')`), false);

    await drag(page, grip, { dy: top - 3 - grip.y, steps: 12 });
    await page.evaluate('window.BeesonEditor.status()');
    assert.deepEqual((await rows(page)).map((r) => [r.step, r.text.slice(0, 12)]), [
      ['0', 'The Coriolis'],
      ['1', '\\ddot x - \\c'],
      ['2', 'where \\tilde'],
      ['3', 'The effectiv'],
      ['', 'Equations ar'],
      ['', 'You can type'],
    ]);
    const edited = page.source
      .replace(KEEP_AFTER, '<div class="math fragment" data-fragment-index="2" data-keep="1">')
      .replace('<p class="fragment" data-fragment-index="2">where', '<p class="fragment" data-fragment-index="3">where')
      .replace('<p class="fragment" data-fragment-index="3" data-highlight="coriolis">', '<p class="fragment" data-fragment-index="1" data-highlight="coriolis">');
    assert.notEqual(edited, page.source);
    assert.equal(await rendered(page), edited);
    assert.equal(await undoLabel(page), 'Undo Move Step');
    await undoRedo(page, platform, page.source, edited);
    await saveAndReopen(page);
    assert.deepEqual(errors(page), []);
  });

  test(`the menu of a chip sets the step, the start, the effect, and Show Last on ${platform}`, async (t) => {
    const page = await open(t, platform);
    await slideOf(page, 'div.math[data-keep]');
    const source = page.source;
    const where = '<p class="fragment" data-fragment-index="2">where';
    const coriolis = '<p class="fragment" data-fragment-index="3" data-highlight="coriolis">';
    const effective = '<p class="fragment" data-fragment-index="4" data-highlight="potential" data-tone="violet">';

    await pick(page, 'where', 'Step 1');
    const joined = source
      .replace(where, '<p class="fragment" data-fragment-index="1">where')
      .replace(coriolis, '<p class="fragment" data-fragment-index="2" data-highlight="coriolis">')
      .replace(effective, '<p class="fragment" data-fragment-index="3" data-highlight="potential" data-tone="violet">');
    assert.equal(await rendered(page), joined);
    let r = await rows(page);
    assert.deepEqual(r.map((x) => x.step), ['0', '0', '1', '2', '', '']);
    assert.match(r[1].meta, /With Previous/);
    assert.equal(r[1].selected, true, 'the row of the chip is not selected');
    await undoRedo(page, platform, source, joined);

    // On Click puts the row back into a step of its own after the step it was shown with
    await pick(page, 'where', 'On Click');
    assert.equal(await rendered(page), source);
    await undoRedo(page, platform, joined, source);

    await pick(page, 'The Coriolis', 'Fade Out');
    const faded = source.replace(coriolis, '<p class="fragment fade-out" data-fragment-index="3" data-highlight="coriolis">');
    assert.equal(await rendered(page), faded);
    assert.match((await rows(page))[2].meta, /Fade Out/);
    await undoRedo(page, platform, source, faded);

    await pick(page, 'The Coriolis', 'Only at Its Step');
    const only = source.replace(coriolis, '<p class="fragment current-visible" data-fragment-index="3" data-highlight="coriolis">');
    assert.equal(await rendered(page), only);
    await undoRedo(page, platform, faded, only);

    await pick(page, 'The effective', 'Show Last');
    const last = only.replace(effective, '<p class="fragment" data-highlight="potential" data-tone="violet" data-final>');
    assert.equal(await rendered(page), last);
    r = await rows(page);
    assert.equal(r[3].chip, 'Last');
    await undoRedo(page, platform, only, last);

    // With the Slide takes the class fragment and the effect off the element
    await pick(page, 'The Coriolis', 'With the Slide');
    const plain = last.replace('<p class="fragment current-visible" data-fragment-index="3" data-highlight="coriolis">', '<p data-highlight="coriolis">');
    assert.equal(await rendered(page), plain);
    await undoRedo(page, platform, last, plain);
    await saveAndReopen(page);
    assert.deepEqual(errors(page), []);
  });

  test(`a row selects its element, a selected element marks its row, and Alt with an arrow moves a step on ${platform}`, async (t) => {
    const page = await open(t, platform);
    await slideOf(page, '.reveal .slides section .figure-box > img');
    await click(page, '.reveal section.present .figure-box > img');
    await page.evaluate('window.BeesonEditor.status()');
    let r = await rows(page);
    assert.deepEqual(r.filter((x) => x.selected).map((x) => x.meta.split(' · ')[0]), ['Figure']);
    assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-badge.on').length`), 0);

    await click(page, await rowPart(page, 'You might', '.body'));
    await page.evaluate('window.BeesonEditor.status()');
    r = await rows(page);
    assert.deepEqual(r.filter((x) => x.selected).map((x) => x.text.slice(0, 9)), ['You might']);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-badge.on')].map((b) => b.textContent)`), ['2']);
    assert.equal(await page.evaluate(`document.activeElement.classList.contains('row')`), true);
    // the frame of the selection is drawn around the item of the row
    const framed = await page.evaluate(`(() => {
      const li = [...document.querySelectorAll('.reveal section.present li')].find((li) => li.textContent.startsWith('You might')).getBoundingClientRect();
      return [...document.querySelectorAll('.beeson-frame.selected')].some((f) => { const b = f.getBoundingClientRect(); return b.width && Math.abs(b.left - li.left) < 12 && Math.abs(b.top - li.top) < 12; });
    })()`);
    assert.equal(framed, true, 'a click on a row does not select its element');

    // the arrows move between the rows, and Alt with Up moves the step of the row earlier
    await press(page, 'ArrowDown');
    r = await rows(page);
    assert.deepEqual(r.filter((x) => x.selected).map((x) => x.text.slice(0, 8)), ['You shou']);
    const source = page.source;
    await press(page, 'Alt+ArrowUp');
    await page.evaluate('window.BeesonEditor.status()');
    const earlier = source
      .replace('<li class="fragment" data-fragment-index="2">You might', '<li class="fragment" data-fragment-index="3">You might')
      .replace('<li class="fragment" data-fragment-index="3">You should', '<li class="fragment" data-fragment-index="2">You should');
    assert.equal(await rendered(page), earlier);
    assert.equal(await undoLabel(page), 'Undo Move Step Earlier');
    await undoRedo(page, platform, source, earlier);
    assert.deepEqual(errors(page), []);
  });

  test(`Preview plays the steps of the slide and ends on its last layer on ${platform}`, async (t) => {
    const page = await open(t, platform, { deck: 'test/pages/layers.html' });
    const layers = () => page.evaluate(`[...document.querySelectorAll('.beeson-shown-steps button')].map((b) => (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + b.textContent)`);
    assert.deepEqual(await layers(), ['*Up to step 2', 'From step 3']);
    // the span in the text of a paragraph is a step of its own, listed on a locked row
    assert.deepEqual((await rows(page)).filter((r) => r.step).map((r) => [r.step, r.text.slice(0, 12)]), [['0', 'The old step'], ['1', 'The old span'], ['2', 'The old lead'], ['2', 'The new lead'], ['3', 'The new step']]);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-edit-side .row.locked .chip')].map((c) => c.disabled)`), [true]);
    // each frame of the preview is recorded in the page as it is drawn, since the wait for its step
    // 2 timed out on a slow runner, where the preview was past this step at the first read
    await recordPreview(page, `({
      shown: ['old-lead', 'old-step', 'old-span', 'new-lead', 'new-step'].filter((id) => { const el = document.getElementById(id); return getComputedStyle(el).visibility === 'visible' && !el.closest('.beeson-pv-off'); }),
      label: document.querySelector('.beeson-edit-side .head .play').textContent,
    })`);
    await click(page, '.beeson-edit-side .head .play');
    const played = await previewFrames(page);
    const at = (step) => played.find((f) => f.step === step);
    // before the first step, only the lead-in of the old derivation is shown
    assert.deepEqual(played[0], { step: '0', playing: true, read: { shown: ['old-lead'], label: 'Stop' } });
    assert.deepEqual(at('2')?.read.shown, ['old-lead', 'old-step', 'old-span']);
    assert.deepEqual(at('4')?.read.shown, ['new-lead', 'new-step']);
    assert.deepEqual(await layers(), ['Up to step 2', '*From step 3']);
    assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-pv-off, .beeson-pv-dim').length`), 0);
    assert.equal(await page.evaluate(`document.querySelector('.beeson-edit-side .head .play').textContent`), 'Preview Steps');

    // Esc stops a preview, which also ends on the last layer
    await page.evaluate(`[...document.querySelectorAll('.beeson-shown-steps button')][0].click()`);
    await click(page, '.beeson-edit-side .head .play');
    await page.waitFor(`document.documentElement.classList.contains('beeson-previewing')`);
    await press(page, 'Escape');
    assert.equal(await page.evaluate(`document.documentElement.classList.contains('beeson-previewing')`), false);
    assert.deepEqual(await layers(), ['Up to step 2', '*From step 3']);
    assert.equal(await rendered(page), page.source);
    assert.deepEqual(errors(page), []);
  });

  // reveal.js numbers the indexes of the page from 0, and an edit writes the indexes of the file,
  // hence the steps of a preview after an edit are read from the tags
  test(`a preview after an edit plays the steps of the edit on ${platform}`, async (t) => {
    const page = await open(t, platform);
    await slideOf(page, 'div.math[data-keep]');
    await pick(page, 'where', 'With Previous');
    assert.deepEqual((await rows(page)).map((r) => r.step), ['0', '0', '1', '2', '', '']);
    await recordPreview(page, `[...document.querySelectorAll('.reveal section.present .fragment')].filter((f) => f.classList.contains('beeson-pv-off')).map((f) => f.textContent.slice(0, 12))`);
    await click(page, '.beeson-edit-side .head .play');
    const played = await previewFrames(page);
    assert.deepEqual(played.find((f) => f.step === '2')?.read, ['The effectiv']);
    assert.deepEqual(errors(page), []);
  });

  // the sans of the system is wider on Linux, e.g. DejaVu Sans, hence a row shows fewer characters
  // there. a long text is cut with an ellipsis and shown whole in its tooltip, as in the Animation
  // Pane of PowerPoint, and at least 24 characters of it are shown in any font
  test(`each row shows its text, or at least 24 characters of it with an ellipsis and a tooltip, at 1440 by 900 on ${platform}`, async (t) => {
    const page = await open(t, platform, { width: 1440, height: 900 });
    const slides = await page.evaluate('Reveal.getTotalSlides()');
    let checked = 0;
    for (let h = 0; h < slides; h++) {
      await page.evaluate(`Reveal.slide(${h})`);
      await sleep(80);
      // the width of the first 24 characters of each cut text, in the font of its row, the width of
      // the box of the text, and its tooltip
      const short = await page.evaluate(`(() => {
        const ctx = document.createElement('canvas').getContext('2d');
        return [...document.querySelectorAll('.beeson-edit-side .rows .text')].filter((el) => el.scrollWidth > el.clientWidth).map((el) => {
          const s = getComputedStyle(el);
          ctx.font = s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
          return { text: el.textContent, need: ctx.measureText(el.textContent.slice(0, 24) + '…').width, has: el.clientWidth, overflow: s.textOverflow, tip: el.title };
        });
      })()`);
      checked += short.length;
      for (const row of short) {
        assert.ok(row.need <= row.has, `only ${row.has} px of the ${Math.ceil(row.need)} px of "${row.text.slice(0, 24)}" are shown`);
        assert.equal(row.overflow, 'ellipsis', row.text);
        assert.equal(row.tip, row.text, `the cut text "${row.text.slice(0, 24)}…" is not shown whole in a tooltip`);
      }
    }
    assert.ok(checked > 5, `only ${checked} rows are cut`);
    assert.deepEqual(errors(page), []);
  });
}

// the steps, code boxes, and formulas of R7.5 with trusted input on either platform: Play From a
// step of the Steps tab, the line steps of a code box listed as rows of the Steps tab, the stepper
// of the Delay field, the glyphs of the TeX completion list, and the switch Small of the Code pane.
// after each edit an undo gives the file byte for byte, a redo gives the edit, and a save is
// opened again without problems
describe('Play From, code line steps, and Delay', () => {
  const PLATFORMS = ['mac', 'other'];
  const PANEL = '#beeson-edit-panel-format';
  const SIDE = '.beeson-edit-side';
  const REDO = { mac: 'Mod+Shift+Z', other: 'Mod+Y' };
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const CODE = '<code class="language-python" data-line-numbers="1-3|4|5-7|8-9">def halo_family():';
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const js = (v) => JSON.stringify(v);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const rendered = (page) => page.evaluate('window.BeesonEditor.render()');
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);

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

  // the editor on a deck served over HTTP, opened with text, on the slide of the element matched by
  // at, with the Format tab or the Steps tab shown
  async function open(t, platform, { deck = 'test-deck.html', text = readFileSync(deck, 'utf8'), at = 'pre > code', tab = 'format', width = 1600, height = 1000 } = {}) {
    const page = await browser.newPage({ width, height });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    await page.evaluate('localStorage.clear()');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(text)})`)).problems, []);
    if (tab === 'format' && !(await page.evaluate(`window.BeesonEditor.state('shell.format').checked`))) await page.evaluate(`window.BeesonEditor.exec('shell.format')`);
    if (tab === 'steps') await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
    await page.evaluate(`Reveal.slide(Reveal.getIndices(document.querySelector(${js(at)}).closest('section')).h)`);
    await sleep(150);
    await frames(page);
    return page;
  }

  async function undoRedo(page, platform, before, after) {
    await press(page, 'Mod+Z');
    await frames(page);
    assert.equal(await rendered(page), before, 'an undo does not give the file before the edit');
    await press(page, REDO[platform]);
    await frames(page);
    assert.equal(await rendered(page), after, 'a redo does not give the edit again');
  }

  // the problems of the scope rule in text that the source of the page did not have
  const newProblems = (page, text) => {
    const old = textProblems(page.source, THEME);
    return textProblems(text, THEME).filter((p) => !old.includes(p));
  };

  // saved writes the text into a file, opens it again without problems, and checks it byte for byte
  let saves = 0;
  async function saved(page, text) {
    const out = await saveAndReopen(page, `r7-5-${++saves}.html`);
    assert.equal(out.text, text);
  }

  // selectCode selects the code box of the current slide as a block, by a click in its first line
  // and Esc
  async function selectCode(page) {
    const at = await page.evaluate(`(() => {
    const code = document.querySelector('.reveal section.present pre > code');
    const r = document.createRange();
    r.setStart(code.firstChild, 2);
    r.setEnd(code.firstChild, 3);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
    await clickText(page, at);
    await press(page, 'Escape');
    await frames(page);
  }

  const SMALL = `${PANEL} label:has(> input[data-command="code.small"])`;

  for (const platform of PLATFORMS) {
    test(`the switch Small of the Code pane sets the code at 18 px, and off restores the tag on ${platform}`, async (t) => {
      const page = await open(t, platform);
      const source = page.source;
      await selectCode(page);
      const box = `${SMALL} input`;
      assert.equal(await page.evaluate(`document.querySelector(${js(box)}).checked`), false);
      assert.equal(await page.evaluate(`document.querySelector(${js(box)}).disabled`), false);
      const size = () => page.evaluate(`getComputedStyle(document.querySelector('.reveal section.present pre')).fontSize`);
      assert.equal(await size(), '22px');
      await clickText(page, SMALL);
      await frames(page);
      const small = source.replace('<pre><code class="language-python"', '<pre style="font-size: 18px"><code class="language-python"');
      assert.equal(await rendered(page), small);
      assert.equal(await size(), '18px');
      assert.equal(await page.evaluate(`document.querySelector(${js(box)}).checked`), true);
      assert.equal(await undoLabel(page), 'Undo Small Code');
      assert.deepEqual(newProblems(page, small), []);
      await undoRedo(page, platform, source, small);
      // off takes the declaration out, and the tag is as it was, byte for byte
      await clickText(page, SMALL);
      await frames(page);
      assert.equal(await rendered(page), source);
      assert.equal(await size(), '22px');
      assert.equal(await page.evaluate(`document.querySelector(${js(box)}).checked`), false);
      await undoRedo(page, platform, small, source);
      await clickText(page, SMALL);
      await frames(page);
      await saved(page, small);
      assert.deepEqual(errors(page), []);
    });

    test(`Small keeps the other declarations of the pre, and off gives its tag back byte for byte on ${platform}`, async (t) => {
      const text = readFileSync('test-deck.html', 'utf8').replace('<pre><code class="language-python"', '<pre style="translate: 0px 12px;"><code class="language-python"');
      const page = await open(t, platform, { text });
      await selectCode(page);
      await clickText(page, SMALL);
      await frames(page);
      const small = await rendered(page);
      assert.match(small, /<pre style="translate: 0px 12px; font-size: 18px;?"><code class="language-python"/);
      assert.deepEqual(newProblems(page, small), []);
      await undoRedo(page, platform, text, small);
      await clickText(page, SMALL);
      await frames(page);
      assert.equal(await rendered(page), text);
      assert.deepEqual(errors(page), []);
    });
  }

  const LI1 = '<li class="fragment" data-fragment-index="1">Each step';
  const LI2 = '<li class="fragment" data-fragment-index="2">Two elements';

  // the rows of the Steps tab in their order: the step written on the row, its text, its chip, and
  // its meta line
  const rows = (page) =>
    page.evaluate(`[...document.querySelectorAll('${SIDE} .rows .row')].map((r) => ({
    step: r.dataset.step,
    text: r.querySelector('.text').textContent,
    chip: r.querySelector('.chip').textContent,
    meta: r.querySelector('.meta').textContent,
    selected: r.classList.contains('selected'),
  }))`);

  // the center of a part of the first row whose text starts with text
  const rowPart = (page, text, part = '.text') =>
    page.evaluate(`(() => {
    const row = [...document.querySelectorAll('${SIDE} .rows .row')].find((r) => r.querySelector('.text').textContent.startsWith(${js(text)}));
    const r = row.querySelector(${js(part)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);

  // the labels of the open menu, with a mark on a dimmed item
  const menuLabels = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => (i.getAttribute('aria-disabled') === 'true' ? '-' : '') + i.querySelector('.label').textContent)`);

  // an item of the open menu chosen by a trusted click, 250 ms after the press that opened it
  async function choose(page, label) {
    const at = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label').textContent === ${js(label)});
    if (!item || item.getAttribute('aria-disabled') === 'true') return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the open menu does not have an enabled item ${label}`);
    await sleep(300);
    await clickText(page, at);
    await frames(page);
  }

  const DELAY = `${SIDE} .detail input.delay`;
  const STEPPER = `${SIDE} .detail .ed-num .stepper button`;

  for (const platform of PLATFORMS) {
    test(`the Delay field of a step After Previous has a stepper in steps of 0.1 s on ${platform}`, async (t) => {
      const page = await open(t, platform, { at: 'li.fragment', tab: 'steps' });
      const source = page.source;
      await clickText(page, await rowPart(page, 'Two elements', '.chip'));
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
      await choose(page, 'After Previous');
      const half = source.replace(LI1, LI1.replace('>', ' data-autoslide="500">'));
      assert.equal(await rendered(page), half);
      // the field is the number field of the Arrange pane, with its unit and its two arrows
      const field = () => page.evaluate(`(() => {
      const box = document.querySelector('${SIDE} .detail .ed-num');
      return { value: box.querySelector('input').value, unit: box.querySelector('.unit').textContent, arrows: [...box.querySelectorAll('.stepper button')].map((b) => b.getAttribute('aria-label') + (b.disabled ? ' (dimmed)' : '')) };
    })()`);
      assert.deepEqual(await field(), { value: '0.5', unit: 's', arrows: ['Increase Delay', 'Decrease Delay'] });
      // a click on the upper arrow adds 0.1 s
      await clickText(page, `${STEPPER}:first-child`);
      await frames(page);
      const more = source.replace(LI1, LI1.replace('>', ' data-autoslide="600">'));
      assert.equal(await rendered(page), more);
      assert.equal((await field()).value, '0.6');
      assert.match((await rows(page)).find((r) => r.text.startsWith('Two elements')).meta, /After Previous, 0\.6 s/);
      assert.equal(await undoLabel(page), 'Undo Set Delay of Step');
      await undoRedo(page, platform, half, more);
      // the lower arrow takes 0.1 s off, and the arrow keys of the field step it too, by 1 s with Shift
      await clickText(page, `${STEPPER}:last-child`);
      await frames(page);
      assert.equal(await rendered(page), half);
      await clickText(page, DELAY);
      await press(page, 'Shift+ArrowUp');
      await frames(page);
      assert.equal(await rendered(page), source.replace(LI1, LI1.replace('>', ' data-autoslide="1500">')));
      await press(page, 'ArrowDown');
      await frames(page);
      const typed = source.replace(LI1, LI1.replace('>', ' data-autoslide="1400">'));
      assert.equal(await rendered(page), typed);
      assert.equal((await field()).value, '1.4');
      // the shortest delay is 0.1 s, as reveal.js reads 0 as no delay
      await page.evaluate(`document.querySelector(${js(DELAY)}).select()`);
      await type(page, '0');
      await press(page, 'Enter');
      await frames(page);
      const least = source.replace(LI1, LI1.replace('>', ' data-autoslide="100">'));
      assert.equal(await rendered(page), least);
      assert.equal((await field()).value, '0.1');
      await press(page, 'Escape');
      await undoRedo(page, platform, typed, least);
      // a step at a click has the field and its arrows dimmed
      await clickText(page, await rowPart(page, 'When exporting'));
      await frames(page);
      assert.deepEqual(await field(), { value: '', unit: 's', arrows: ['Increase Delay (dimmed)', 'Decrease Delay (dimmed)'] });
      assert.deepEqual(newProblems(page, least), []);
      await saved(page, least);
      assert.deepEqual(errors(page), []);
    });
  }

  // the options of the completion list: the text of each, and whether its glyph is drawn
  const options = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-complete [role=option]')].map((o) => ({ text: o.querySelector('.name').textContent, glyph: !!o.querySelector('.glyph svg') }))`);

  for (const platform of PLATFORMS) {
    test(`the TeX completion list draws the glyph of each command beside its name, typeset once on ${platform}`, async (t) => {
      const page = await open(t, platform, { at: 'div.math[data-keep]' });
      await clickText(page, 'div.math[data-keep] mjx-container');
      await sleep(200);
      await press(page, 'Escape');
      await sleep(200);
      await clickText(page, `${PANEL} textarea[name="tex"]`);
      await press(page, 'Mod+ArrowDown');
      await type(page, String.raw` + \L`);
      await page.waitFor(`[...document.querySelectorAll('.beeson-complete [role=option]')].every((o) => o.querySelector('.glyph svg'))`);
      const first = await options(page);
      assert.deepEqual(first.slice(0, 3).map((o) => o.text), [String.raw`\LL`, String.raw`\Lambda`, String.raw`\le`]);
      assert.ok(first.every((o) => o.glyph), js(first));
      // the glyph is a picture beside the name, hidden from a screen reader, and the name is read
      // first in the text of an option
      assert.equal(await page.evaluate(`document.querySelector('.beeson-complete .glyph').getAttribute('aria-hidden')`), 'true');
      assert.ok((await page.evaluate(`document.querySelector('.beeson-complete [role=option]').textContent`)).startsWith(String.raw`\LL`));
      const box = await page.evaluate(`(() => { const g = document.querySelector('.beeson-complete .glyph').getBoundingClientRect(), n = document.querySelector('.beeson-complete .name').getBoundingClientRect(); return { gap: n.left - g.right, w: g.width, h: g.height }; })()`);
      assert.ok(box.gap >= 0 && box.gap < 20 && box.w > 10 && box.h > 10, js(box));
      // the command class does not draw a symbol, and its glyph is left empty. a list opened again
      // takes its glyphs from the cache, without typesetting them again
      await type(page, 'a');
      await page.waitFor(`[...document.querySelectorAll('.beeson-complete [role=option]')].every((o) => o.querySelector('.glyph svg') || o.querySelector('.name').textContent === '\\\\class')`);
      assert.ok((await options(page)).some((o) => o.text === String.raw`\class` && !o.glyph));
      // the preview of the formula, which is typeset 150 ms after a key, is not counted as a glyph
      await page.evaluate(`(() => { const mj = window.MathJax, f = mj.tex2svgPromise, field = document.querySelector(${js(`${PANEL} textarea[name="tex"]`)}); window.typeset = 0; mj.tex2svgPromise = (...a) => { if (a[0] !== field.value) window.typeset++; return f.apply(mj, a); }; })()`);
      await press(page, 'Backspace');
      await frames(page);
      assert.deepEqual(await options(page), first);
      assert.equal(await page.evaluate('window.typeset'), 0);
      await press(page, 'Escape');
      assert.equal(await page.evaluate(`!!document.querySelector('.beeson-complete')`), false);
      assert.deepEqual(errors(page), []);
    });
  }

  const PARA = '<p>Copy-paste the code';
  const LINES = 'data-line-numbers="1-3|4|5-7|8-9"';

  // the steps of the line rows, by the text of their meta line
  const lineRows = async (page) => (await rows(page)).filter((r) => r.meta.startsWith('Line')).map((r) => `${r.step} ${r.meta.split(' · ')[0]}`);

  // the number of lines of the code box dimmed by the highlight of the editor, or 0 without it
  const DIMMED = `(CSS.highlights.get('beeson-code-dim')?.size ?? 0)`;
  const dimmed = (page) => page.evaluate(DIMMED);

  for (const platform of PLATFORMS) {
    test(`the line steps of a code box are rows of the Steps tab, kept in sync with its Code pane on ${platform}`, async (t) => {
      const page = await open(t, platform);
      const source = page.source;
      await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
      await frames(page);
      // each group after the first is a row at its step, and the first group is lit with the slide
      assert.deepEqual(await lineRows(page), ['0 Line 4', '1 Lines 5–7', '2 Lines 8–9']);
      const four = (await rows(page)).find((r) => r.meta.startsWith('Line 4'));
      assert.deepEqual([four.chip, four.text, four.meta], ['1', 'for z0 in np.linspace(Z_START, Z_END, STEPS + 1) / DU:', 'Line 4 · On Click · Highlight']);
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.beeson-badge')].map((b) => b.textContent)`), ['1', '2', '3']);
      // a row pointed at dims the other lines of the box, as a group of the Code pane does
      const at = await rowPart(page, 'if len(members)');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
      await frames(page);
      assert.equal(await dimmed(page), 6);
      // a press selects the box, and marks the line row in place of the row of the box
      await clickText(page, at);
      await frames(page);
      assert.equal(await page.evaluate(`window.BeesonEditor.state('steps.playFrom').label`), 'Play From Selected Step');
      assert.deepEqual((await rows(page)).filter((r) => r.selected).map((r) => r.meta.split(' · ')[0]), ['Lines 5–7']);
      assert.equal(await page.evaluate(`window.BeesonEditor.state('code.small').enabled`), true);
      // Delete does not take a line step off, since it is set in the Code pane
      await press(page, 'Delete');
      await frames(page);
      assert.equal(await rendered(page), source);
      // the groups typed into the Code pane are the rows, and the pane names their steps of the slide
      await page.evaluate(`window.BeesonEditor.exec('shell.format')`);
      await frames(page);
      const field = `${PANEL} input[name="line-steps"]`;
      await page.evaluate(`document.querySelector(${js(field)}).select()`);
      await clickText(page, field);
      await page.evaluate(`document.querySelector(${js(field)}).select()`);
      await type(page, '1-3|4|5-9');
      await press(page, 'Enter');
      await frames(page);
      const fewer = source.replace(LINES, 'data-line-numbers="1-3|4|5-9"');
      assert.equal(await rendered(page), fewer);
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-groups .at')].map((s) => s.textContent)`), ['With the slide', 'Step 1', 'Step 2']);
      await press(page, 'Escape');
      await undoRedo(page, platform, source, fewer);
      await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
      await frames(page);
      assert.deepEqual(await lineRows(page), ['0 Line 4', '1 Lines 5–9']);
      await press(page, 'Mod+Z');
      await frames(page);
      assert.deepEqual(await lineRows(page), ['0 Line 4', '1 Lines 5–7', '2 Lines 8–9']);
      assert.deepEqual(errors(page), []);
    });

    test(`the line steps of a code box move with the other steps, and are not split on ${platform}`, async (t) => {
      const text = readFileSync('test-deck.html', 'utf8').replace(PARA, '<p class="fragment">Copy-paste the code');
      const page = await open(t, platform, { text, tab: 'steps' });
      assert.deepEqual(await lineRows(page), ['1 Line 4', '2 Lines 5–7', '3 Lines 8–9']);
      assert.equal((await rows(page)).find((r) => r.text.startsWith('Copy-paste')).step, '0');
      // the paragraph dragged under the last card is shown after the lines, and the index of the
      // code puts its line steps before it, as the highlight plugin numbers its copies of the code
      const from = await rowPart(page, 'Copy-paste', '.body');
      const to = await page.evaluate(`(() => { const c = [...document.querySelectorAll('${SIDE} .rows .step:not(.plain)')].at(-1).getBoundingClientRect(); return c.bottom + 2; })()`);
      await drag(page, from, { dy: to - from.y, steps: 12 });
      await frames(page);
      const moved = await rendered(page);
      assert.equal(moved, text.replace('<p class="fragment">', '<p class="fragment" data-fragment-index="4">').replace(LINES, `${LINES} data-fragment-index="1"`));
      assert.deepEqual(await lineRows(page), ['0 Line 4', '1 Lines 5–7', '2 Lines 8–9']);
      assert.equal((await rows(page)).find((r) => r.text.startsWith('Copy-paste')).step, '3');
      assert.deepEqual(newProblems(page, moved), []);
      await undoRedo(page, platform, text, moved);
      // a step put between two line steps is refused, and the file is kept
      await clickText(page, await rowPart(page, 'Copy-paste'));
      await press(page, 'Alt+ArrowUp');
      await frames(page);
      assert.equal(await rendered(page), moved);
      assert.match(await page.evaluate('window.BeesonEditor.status().message'), /another step cannot be put between them/);
      // All at Once keeps the line steps, which are set in the Code pane
      await page.evaluate(`window.BeesonEditor.exec('steps.allAtOnce')`);
      await frames(page);
      const once = await rendered(page);
      assert.equal(once, text.replace('<p class="fragment">', '<p>').replace(LINES, `${LINES} data-fragment-index="1"`));
      assert.deepEqual(await lineRows(page), ['0 Line 4', '1 Lines 5–7', '2 Lines 8–9']);
      await undoRedo(page, platform, moved, once);
      await saved(page, once);
      assert.deepEqual(errors(page), []);
    });

    test(`Play From plays the steps of the slide in place from the chosen step on ${platform}`, async (t) => {
      // the deck is served with the paragraph as a fragment, since the preview plays the page
      const text = readFileSync('test-deck.html', 'utf8').replace(PARA, '<p class="fragment">Copy-paste the code');
      const deck = `.play-from-${process.pid}-${platform}.html`;
      writeFileSync(deck, text);
      t.after(() => rmSync(deck, { force: true }));
      const page = await open(t, platform, { deck, tab: 'steps' });
      const play = `${SIDE} .head .play`;
      const label = () => page.evaluate(`document.querySelector(${js(play)}).textContent`);
      assert.equal(await label(), 'Preview Steps');
      // a chosen row turns the button into Play From, as in the Animation Pane of PowerPoint
      await clickText(page, await rowPart(page, 'if len(members)'));
      await frames(page);
      assert.equal(await label(), 'Play From');
      // each frame of the preview is recorded in the page as it is drawn, since a read of its first
      // step came a step late on a slow runner
      const state = `({ para: !document.querySelector('.reveal section.present p.fragment').classList.contains('beeson-pv-off'), dimmed: ${DIMMED}, label: document.querySelector(${js(play)}).textContent })`;
      await recordPreview(page, state);
      await clickText(page, play);
      // the slide starts at the step before the chosen one: the paragraph and line 4 are shown. the
      // last frame is the last step again, with the dimmed lines restored
      const played = await previewFrames(page);
      assert.deepEqual(played[0], { step: '2', playing: true, read: { para: true, dimmed: 8, label: 'Stop' } });
      assert.deepEqual(played.map((f) => [f.step, f.playing, f.read.dimmed]), [['2', true, 8], ['3', true, 6], ['4', true, 7], ['4', true, 0]]);
      assert.equal(await dimmed(page), 0);
      assert.equal(await label(), 'Play From');
      // the chip menu of a row ends with Play From its step, before the delivery of a list, and a
      // line row has only this item
      await clickText(page, await rowPart(page, 'Copy-paste', '.chip'));
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
      assert.equal((await menuLabels(page)).at(-1), 'Play From Step 1');
      await press(page, 'Escape');
      await clickText(page, await rowPart(page, 'members.append', '.chip'));
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
      assert.deepEqual(await menuLabels(page), ['Play From Step 4']);
      await recordPreview(page, state);
      await choose(page, 'Play From Step 4');
      await page.waitFor('window.__preview.length > 0');
      assert.deepEqual(await page.evaluate('window.__preview[0]'), { step: '3', playing: true, read: { para: true, dimmed: 6, label: 'Stop' } });
      // Esc stops the preview, and the file is not changed
      await press(page, 'Escape');
      await frames(page);
      assert.equal(await page.evaluate(`document.documentElement.classList.contains('beeson-previewing')`), false);
      assert.equal(await dimmed(page), 0);
      // a row shown with the slide has Play From dimmed
      await clickText(page, await rowPart(page, 'Code boxes', '.chip'));
      await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
      assert.equal((await menuLabels(page)).at(-1), '-Play From Step');
      await press(page, 'Escape');
      assert.equal(await rendered(page), text);
      assert.deepEqual(errors(page), []);
    });
  }
});

// the selection of the Steps tab through an undo and a redo of R16.6, with trusted input on either
// platform. a delay After Previous is written as data-autoslide on the step before, hence its undo
// changes another element than the selected one. the row of the step is still the one selected
// row after the undo and after the redo, and the Delay field writes its step again
describe('the selected row through undo and redo', () => {
  const PLATFORMS = ['mac', 'other'];
  const SIDE = '.beeson-edit-side';
  const REDO = { mac: 'Mod+Shift+Z', other: 'Mod+Y' };
  const STEPPER = `${SIDE} .detail .ed-num .stepper button`;
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const js = (v) => JSON.stringify(v);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const rendered = (page) => page.evaluate('window.BeesonEditor.render()');

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

  // the editor on the demo deck, on the slide of the element matched by at, with the Steps tab shown
  async function open(t, platform, at) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/test-deck.html?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync('test-deck.html', 'utf8');
    await page.evaluate('localStorage.clear()');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`)).problems, []);
    await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
    await page.evaluate(`Reveal.slide(Reveal.getIndices(document.querySelector(${js(at)}).closest('section')).h)`);
    await sleep(150);
    await frames(page);
    return page;
  }

  // the texts of the selected rows of the Steps tab, each cut to its first 12 characters
  const selectedRows = (page) =>
    page.evaluate(`[...document.querySelectorAll('${SIDE} .rows .row.selected')].map((r) => r.querySelector('.text').textContent.slice(0, 12))`);

  // the center of the chip of the first row whose text starts with text
  const chipOf = (page, text) =>
    page.evaluate(`(() => {
    const row = [...document.querySelectorAll('${SIDE} .rows .row')].find((r) => r.querySelector('.text').textContent.startsWith(${js(text)}));
    const r = row.querySelector('.chip').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);

  // After Previous chosen from the menu of the chip of the row of text, 300 ms after the press that
  // opened the menu
  async function afterPrevious(page, text) {
    await click(page, await chipOf(page, text));
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    const at = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label').textContent === 'After Previous');
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    await sleep(300);
    await click(page, at);
    await frames(page);
  }

  // the step of row, the tag of the step before it, on which its delay is written, and the slide
  const CASES = [
    { name: 'an item of a list', at: 'li.fragment', row: 'Two elements', before: '<li class="fragment" data-fragment-index="1">Each step' },
    { name: 'a paragraph after another paragraph', at: 'div.math.fragment[data-keep]', row: 'The Coriolis', before: '<p class="fragment" data-fragment-index="2">where' },
  ];

  for (const platform of PLATFORMS) {
    for (const c of CASES) {
      test(`the row of ${c.name} is the selected row after an undo and a redo of its delay on ${platform}`, async (t) => {
        const page = await open(t, platform, c.at);
        const source = page.source;
        assert.ok(source.includes(c.before));
        const delayed = (ms) => source.replace(c.before, c.before.replace('>', ` data-autoslide="${ms}">`));
        await afterPrevious(page, c.row);
        assert.equal(await rendered(page), delayed(500));
        const one = [c.row.slice(0, 12)];
        assert.deepEqual(await selectedRows(page), one);
        await click(page, `${STEPPER}:first-child`);
        await frames(page);
        assert.equal(await rendered(page), delayed(600));
        // the undo changes the tag of the step before, and the row of the step stays the selection
        await press(page, 'Mod+Z');
        await frames(page);
        assert.equal(await rendered(page), delayed(500));
        assert.deepEqual(await selectedRows(page), one, 'the selected rows after the undo');
        await press(page, REDO[platform]);
        await frames(page);
        assert.equal(await rendered(page), delayed(600));
        assert.deepEqual(await selectedRows(page), one, 'the selected rows after the redo');
        // the lower arrow of the Delay field takes 0.1 s off the delay of the same step
        await click(page, `${STEPPER}:last-child`);
        await frames(page);
        assert.equal(await rendered(page), delayed(500));
        assert.deepEqual(errors(page), []);
      });
    }
  }
});

// tests of R20.8 on both platforms: a block centered with the class center, an element ghosted with
// the class ghost, the effect Dim of a step written as semi-fade-out and drawn at the opacity of a
// ghost, a line paired in Magic Move, a line as a step, the transition Push, and a picture clipped
// to an ellipse with the class oval. each edit is undone to the file byte for
// byte, redone, and saved and opened again without a problem. the opacities of the theme are read in
// the show and in the print view of the deck
describe('center, ghost, Dim, and lines as steps', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r20-8.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  // the figure of the first slide
  const FIGURE = '<figure class="figure-box">\n    <img src="../../demo/figure-light.png" alt="A figure">';
  const PANEL = '#beeson-edit-panel-format';
  const GHOST = '0.25';

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
  const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}, ${js(arg ?? null)} ?? undefined)).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undoLabel = async (page) => (await state(page, 'edit.undo')).label;
  const style = (page, selector, prop) => page.evaluate(`getComputedStyle(document.querySelector('.reveal section.present ' + ${js(selector)}))[${js(prop)}]`);
  // without transitions, so that an opacity is read at its end
  const still = (page) => page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  async function load(t, platform, slide = 0) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = SOURCE;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await frames(page);
    return page;
  }

  // the source with each pair [old, new] replaced once, each old text found once in it
  function edited(edits) {
    let text = SOURCE;
    for (const [a, b] of edits) {
      assert.equal(text.split(a).length, 2, `${a} does not occur once in the deck`);
      text = text.replace(a, () => b);
    }
    return text;
  }

  // the edit checked after an undo, a redo, and a save and an open, with the label of its undo
  async function roundTrip(page, expected, label) {
    assert.equal(await render(page), expected);
    if (label) assert.equal(await undoLabel(page), label);
    await undo(page);
    assert.equal(await render(page), SOURCE, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), expected, 'the redo does not give the edit back');
    const { text } = await saveAndReopen(page, `r20-8-${Math.random().toString(36).slice(2)}.html`);
    assert.equal(text, expected);
  }

  // the caret put into the block of selector by a click on its first characters
  async function caretIn(page, selector) {
    const at = await page.evaluate(`(() => {
    const el = document.querySelector('.reveal section.present ' + ${js(selector)});
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n = w.nextNode();
    while (n && !n.data.trim()) n = w.nextNode();
    const i = n.data.search(/\\S/);
    const r = document.createRange();
    r.setStart(n, i + 1);
    r.setEnd(n, i + 2);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
    await clickText(page, at);
    await frames(page);
  }

  // the block of selector selected as an object, by a click into its text and Esc, or added to the
  // selection by a click with Shift
  async function selectTextElement(page, selector, modifiers = '') {
    if (modifiers) await clickText(page, await center(page, `.reveal section.present ${selector}`), { modifiers });
    else {
      await caretIn(page, selector);
      await press(page, 'Escape');
    }
    await frames(page);
  }

  // the line of the svg of selector selected by a press 2 px under its middle
  async function selectLine(page, selector) {
    const at = await page.evaluate(`(() => {
    const r = document.querySelector('.reveal section.present ' + ${js(selector)} + ' line').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 + 2 };
  })()`);
    await clickText(page, at);
    await frames(page);
  }

  async function showPane(page, name) {
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === ${js(name)})?.click()`);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`Center and Left set and take off the class center on a paragraph, keeping its style (${platform})`, async (t) => {
      const page = await load(t, platform);
      await caretIn(page, 'p');
      assert.equal((await state(page, 'text.align.left')).checked, true);
      await exec(page, 'text.align.center');
      await frames(page);
      const expected = edited([['<p>Alpha', '<p class="center">Alpha']]);
      assert.equal(await render(page), expected);
      assert.equal(await style(page, 'p', 'textAlign'), 'center');
      assert.equal((await state(page, 'text.align.center')).checked, true);
      assert.equal((await state(page, 'text.align.left')).checked, false);
      assert.equal((await state(page, 'text.style.body')).checked, true, 'a centered paragraph is not read as Body');
      await roundTrip(page, expected, 'Undo Alignment');
      await caretIn(page, 'p');
      await exec(page, 'text.align.left');
      assert.equal(await render(page), SOURCE);
      assert.deepEqual(errors(page), []);
    });

    test(`Center acts on a list and a display selected as objects, on a caption, and on a small paragraph, and draws the display centered (${platform})`, async (t) => {
      const page = await load(t, platform);
      await selectTextElement(page, 'ul');
      await selectTextElement(page, 'div.math', 'Shift');
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 2);
      await exec(page, 'text.align.center');
      await frames(page);
      const both = edited([['<ul>', '<ul class="center">'], ['<div class="math">', '<div class="math center">']]);
      assert.equal(await render(page), both);
      assert.equal(await style(page, 'div.math mjx-container', 'textAlign'), 'center');
      assert.equal(await style(page, 'ul', 'textAlign'), 'center');
      await roundTrip(page, both, 'Undo Alignment');
      await caretIn(page, '.caption');
      await exec(page, 'text.align.center');
      await caretIn(page, 'p.small');
      await exec(page, 'text.align.center');
      await frames(page);
      assert.equal(await render(page), edited([
        ['<p class="small">Beta', '<p class="small center">Beta'],
        ['<ul>', '<ul class="center">'],
        ['<div class="math">', '<div class="math center">'],
        ['<figcaption class="caption">', '<figcaption class="caption center">'],
      ]));
      assert.equal((await state(page, 'text.style.small')).checked, true, 'a centered small paragraph is not read as Small');
      assert.deepEqual(errors(page), []);
    });

    test(`the Text pane shows Left and Center, and the Format Painter carries the alignment (${platform})`, async (t) => {
      const page = await load(t, platform);
      await caretIn(page, 'p');
      await showPane(page, 'Text');
      assert.equal(await page.evaluate(`document.querySelectorAll('${PANEL} [data-command="text.align.left"], ${PANEL} [data-command="text.align.center"]').length`), 2);
      await click(page, `${PANEL} [data-command="text.align.center"]`);
      await frames(page);
      assert.equal(await render(page), edited([['<p>Alpha', '<p class="center">Alpha']]));
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} [data-command="text.align.center"]').getAttribute('aria-pressed')`), 'true');
      await caretIn(page, 'p');
      await exec(page, 'text.copyStyle');
      await caretIn(page, 'p.small');
      await exec(page, 'text.pasteStyle');
      await frames(page);
      assert.equal(await render(page), edited([['<p>Alpha', '<p class="center">Alpha'], ['<p class="small">Beta', '<p class="small center">Beta']]));
      assert.deepEqual(errors(page), []);
    });

    test(`Faint writes the class ghost on a figure, a block, and a line, and each is drawn at the ghost opacity (${platform})`, async (t) => {
      const page = await load(t, platform);
      await selectFigure(page, '.reveal section.present figure img');
      await selectTextElement(page, 'p', 'Shift');
      await showPane(page, 'Arrange');
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} [data-command="arrange.faint"]')?.checked`), false);
      await click(page, `${PANEL} label:has(> [data-command="arrange.faint"])`);
      await frames(page);
      const expected = edited([['<p>Alpha', '<p class="faint">Alpha'], [FIGURE, FIGURE.replace('figure-box', 'figure-box faint')]]);
      assert.equal(await render(page), expected);
      assert.equal(await style(page, 'figure', 'opacity'), GHOST);
      assert.equal(await style(page, 'p', 'opacity'), GHOST);
      assert.equal(await page.evaluate(`document.querySelector('${PANEL} [data-command="arrange.faint"]')?.checked`), true);
      await roundTrip(page, expected, 'Undo Faint');
      // a line, and the command again takes the class off
      await exec(page, 'selection.clear');
      await selectLine(page, 'svg.line');
      await exec(page, 'arrange.faint');
      const line = edited([['<p>Alpha', '<p class="faint">Alpha'], [FIGURE, FIGURE.replace('figure-box', 'figure-box faint')], ['<svg class="line tone-accent" width="200" height="1" style="translate: 200px 900px"><defs><marker id="line-1"', '<svg class="line tone-accent faint" width="200" height="1" style="translate: 200px 900px"><defs><marker id="line-1"']]);
      assert.equal(await render(page), line);
      assert.equal(await style(page, 'svg.line', 'opacity'), GHOST);
      await exec(page, 'arrange.faint');
      assert.equal(await render(page), expected);
      assert.deepEqual(errors(page), []);
    });

    test(`Reset Slide keeps the class ghost, and a ghosted step is drawn ghosted in the editor (${platform})`, async (t) => {
      const page = await load(t, platform);
      await selectTextElement(page, 'p');
      await exec(page, 'arrange.faint');
      await exec(page, 'slide.reset');
      await frames(page);
      assert.ok((await render(page)).includes('<p class="faint">Alpha'), 'Reset Slide took ghost off');
      await page.evaluate('Reveal.slide(3)');
      await frames(page);
      assert.equal(await style(page, 'p.faint', 'opacity'), GHOST);
      assert.deepEqual(errors(page), []);
    });

    test(`Dim of the Steps pane writes semi-fade-out, and Preview Steps draws the element dimmed from its step on (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await still(page);
      await selectTextElement(page, 'p:nth-of-type(4)');
      await exec(page, 'steps.effect', { effect: 'dim' });
      await frames(page);
      const expected = edited([['<p class="fragment" data-fragment-index="3">Theta', '<p class="fragment semi-fade-out" data-fragment-index="3">Theta']]);
      assert.equal(await render(page), expected);
      await roundTrip(page, expected);
      // the element is drawn at full opacity while the slide is edited, since every step is shown
      assert.equal(await style(page, 'p:nth-of-type(2)', 'opacity'), '1');
      // each frame of the preview is recorded in the page as it is drawn, since the preview goes on
      // by a clock of 800 ms a step, and a wait for one step from the test may miss it
      await recordPreview(page, `[...document.querySelectorAll('.reveal section.present p')].map((p) => getComputedStyle(p).opacity)`);
      await page.evaluate(`Promise.resolve(window.BeesonEditor.exec('steps.preview')).then(() => true)`);
      const played = await previewFrames(page);
      const seen = [0, 1, 2, 3].map((k) => played.find((f) => f.step === String(k))?.read);
      assert.ok(seen.every(Boolean), `the preview did not draw each of its steps 0 to 3: ${js(played.map((f) => f.step))}`);
      assert.deepEqual(seen.map((s) => s[1]), ['1', GHOST, GHOST, GHOST], 'the dimmed Zeta');
      assert.deepEqual(seen.map((s) => s[3]), ['1', '1', '1', GHOST], 'Theta, dimmed at its own step');
      assert.deepEqual(errors(page), []);
    });

    test(`Magic Move pairs a line by its tone and heads, and Magic Move to Copy gives a line a data-id (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'slide.transition.magic');
      const text = await render(page);
      const ids = [...text.matchAll(/<svg class="line[^"]*"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(ids.length, 2, 'the accent lines of the two slides are not both given a data-id');
      assert.equal(ids[0], ids[1]);
      assert.ok(text.includes('<svg class="line" width="300" height="1" style="translate: 200px 800px">'), 'the plain line without a match was given a data-id');
      await undo(page);
      assert.equal(await render(page), SOURCE);
      await exec(page, 'slide.magicMove');
      const copy = await render(page);
      const copies = [...copy.matchAll(/<svg class="line tone-accent"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(copies.length, 2, 'the line and its copy do not both have a data-id');
      assert.equal(copies[0], copies[1]);
      await undo(page);
      assert.equal(await render(page), SOURCE);
      assert.deepEqual(errors(page), []);
    });

    test(`a line is added as the last step and is listed as a Line in the Steps pane (${platform})`, async (t) => {
      const page = await load(t, platform);
      await selectLine(page, 'svg.line');
      assert.equal((await state(page, 'steps.add')).enabled, true);
      await exec(page, 'steps.add');
      await frames(page);
      const expected = edited([['<svg class="line tone-accent" width="200" height="1" style="translate: 200px 900px"><defs><marker id="line-1"', '<svg class="line tone-accent fragment" width="200" height="1" style="translate: 200px 900px" data-fragment-index="1"><defs><marker id="line-1"']]);
      assert.equal(await render(page), expected);
      if (!(await state(page, 'view.steps')).checked) await exec(page, 'view.steps');
      await frames(page);
      const kinds = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-side .rows .row .kind')].map((k) => k.textContent)`);
      assert.ok(kinds.includes('Line'), `the rows are ${kinds}`);
      await roundTrip(page, expected);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`Push writes slide-out on the slide and slide-in on the next one, is checked, and is played in the preview (${platform})`, async (t) => {
      const page = await load(t, platform);
      await exec(page, 'slide.transition.push');
      await frames(page);
      const expected = edited([['<section>\n  <h2>Centered', '<section data-transition="fade-in slide-out">\n  <h2>Centered'], ['<section>\n  <h2>Two lines', '<section data-transition="slide-in fade-out">\n  <h2>Two lines']]);
      assert.equal(await render(page), expected);
      const checked = [];
      for (const k of ['none', 'fade', 'magic', 'push']) if ((await state(page, `slide.transition.${k}`)).checked) checked.push(k);
      assert.deepEqual(checked, ['push']);
      assert.equal(await page.evaluate(`!!document.querySelector('.beeson-edit-transition [data-command="slide.transition.push"]')`), true);
      await roundTrip(page, expected, 'Undo Transition');
      const kind = await readAtPlay(page, `(() => { const l = document.querySelector('.beeson-edit-preview'); return [l.dataset.kind, [...l.querySelectorAll('.shot')].map((s) => s.getAnimations().length)]; })()`, () => exec(page, 'slide.previewTransition'));
      assert.deepEqual(kind, ['push', [1, 1]]);
      // Fade gives the file back
      await exec(page, 'slide.transition.fade');
      assert.equal(await render(page), SOURCE);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`Oval clips a picture to an ellipse from the Image pane, and Edit Mask keeps the ellipse (${platform})`, async (t) => {
      const page = await load(t, platform);
      const img = '.reveal section.present figure img';
      await selectPicture(page, img);
      await showPane(page, 'Image');
      assert.equal((await state(page, 'figure.oval')).checked, false);
      await click(page, `${PANEL} label:has(> [data-command="figure.oval"])`);
      await frames(page);
      // the picture is drawn letterboxed in its figure box, hence Oval writes its width and keeps it in place
      const expected = edited([[FIGURE, '<figure class="figure-box" style="translate: 0px 40px">\n    <img src="../../demo/figure-light.png" alt="A figure" style="width: 600px" class="oval">']]);
      assert.equal(await render(page), expected);
      assert.equal(await style(page, 'figure img', 'clipPath'), 'inset(0px round 50%)');
      assert.equal((await state(page, 'figure.oval')).checked, true);
      await roundTrip(page, expected, 'Undo Oval');
      // a mask set on the oval picture is written with the ellipse
      await click(page, img, { count: 2 });
      await page.waitFor(`!!document.querySelector('dialog.beeson-mask-bar[open]')`);
      await page.evaluate(`(() => {
      const s = document.querySelector('dialog.beeson-mask-bar input[type=range]');
      const [lo, hi] = [Number(s.dataset.lo), Number(s.dataset.hi)];
      s.value = String(Math.round(Math.log(1.5 / lo) / Math.log(hi / lo) * 1000));
      s.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
      await frames(page);
      await press(page, 'Enter');
      await frames(page);
      assert.match(await render(page), /<img src="\.\.\/\.\.\/demo\/figure-light\.png" alt="A figure" style="width: 600px; scale: 1\.5; clip-path: inset\(16\.667% round 50%\)" class="oval">/);
      assert.equal(await style(page, 'figure img', 'clipPath'), 'inset(16.667% round 50%)');
      assert.deepEqual(errors(page), []);
    });

    test(`Oval on a cropped picture keeps its crop inside the ellipse, and taking it off gives the crop back (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await selectPicture(page, '.reveal section.present figure img');
      await exec(page, 'figure.oval');
      await frames(page);
      const expected = edited([['<img src="../../demo/figure-light.png" alt="A cropped figure" style="scale: 2; clip-path: inset(25%)">', '<img src="../../demo/figure-light.png" alt="A cropped figure" style="scale: 2; clip-path: inset(25% round 50%)" class="oval">']]);
      assert.equal(await render(page), expected);
      assert.equal(await style(page, 'figure img', 'clipPath'), 'inset(25% round 50%)');
      assert.equal(await style(page, 'figure img', 'scale'), '2');
      await roundTrip(page, expected, 'Undo Oval');
      await selectPicture(page, '.reveal section.present figure img');
      await exec(page, 'figure.oval');
      assert.equal(await render(page), SOURCE);
      assert.deepEqual(errors(page), []);
    });

    test(`a ghosted picture replaced by a video stays ghosted (${platform})`, async (t) => {
      const page = await load(t, platform, 5);
      await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
      await selectPicture(page, '.reveal section.present figure img');
      await page.evaluate(`window.__done = window.BeesonEditor.exec('media.replace').then(() => true); 0`);
      await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
      const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
      await page.send('DOM.setFileInputFiles', { files: [resolve('demo/clip-light.mp4')], objectId: result.objectId });
      await page.waitFor('window.__done', 20000);
      await frames(page);
      assert.match(await render(page), /<video class="faint"[^>]*>/);
      assert.equal(await style(page, 'figure video', 'opacity'), GHOST);
      assert.deepEqual(errors(page), []);
    });
  }

  // the values of Push move the slide left out to the left while the next one comes in from the
  // right, in the show of the theme
  test('the slide left by Push is moved out while the next slide is moved in', { timeout: 60000 }, async (t) => {
    // without reduced motion, which is the setting of the Windows runner of GitHub, and under which
    // a slide is changed without a move
    const page = await browser.newPage({ width: 1600, height: 900, motion: true });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/${DECK}`);
    await page.waitFor(deckSettled);
    // the values are set a second before the move, as if they were in the file, so that the next
    // slide has ended its move to its place of a future slide
    await page.evaluate(`(() => { const [a, b] = document.querySelectorAll('.slides > section'); a.dataset.transition = 'fade-in slide-out'; b.dataset.transition = 'slide-in fade-out'; })()`);
    await sleep(1000);
    // the places of both slides are read at each frame from the call on, since the move may have
    // ended by a fixed time on a busy machine
    const seen = await page.evaluate(`new Promise((done) => {
    const left = document.querySelector('.reveal .slides').getBoundingClientRect().left;
    const out = [];
    const t0 = performance.now();
    const read = () => {
      const [a, b] = [...document.querySelectorAll('.slides > section')].slice(0, 2).map((s) => s.getBoundingClientRect().left);
      out.push({ a: a - left, b: b - left });
      if (performance.now() - t0 < 2000) requestAnimationFrame(read);
      else done(out);
    };
    Reveal.next();
    read();
  })`);
    assert.ok(seen.some((f) => f.a < -100 && f.b > 100), `no frame had the slide left moved out to the left and the next slide moving in from the right: ${JSON.stringify(seen.filter((_, i) => i % 6 === 0))}`);
    assert.deepEqual(errors(page), []);
  });

  // the opacity of the dimmed Zeta in the show: full before its step, and the ghost opacity at its
  // step, at the later steps, and on the complete slide
  test('a semi-fade-out fragment is drawn at the ghost opacity from its step on, and on the complete slide', { timeout: 60000 }, async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close().catch(() => {}));
    await still(page);
    await page.goto(`${server.origin}/${DECK}?still`);
    await page.waitFor(deckSettled);
    await page.evaluate('Reveal.slide(2)');
    const seen = [];
    for (let i = 0; i < 5; i++) {
      if (i) await page.evaluate('Reveal.next()');
      await sleep(150);
      seen.push(await page.evaluate(`[getComputedStyle(Reveal.getCurrentSlide().querySelector('.semi-fade-out')).opacity, Reveal.getCurrentSlide().hasAttribute('data-complete')]`));
    }
    assert.deepEqual(seen, [['1', false], [GHOST, false], [GHOST, false], [GHOST, false], [GHOST, true]]);
    assert.deepEqual(errors(page), []);
  });

  // a ghosted step stays ghosted at its step, at the later step, on the complete slide, and on every
  // page of the print view on which it is shown
  test('a ghosted fragment is drawn at the ghost opacity at its step, after it, with data-complete, and in the print view', { timeout: 90000 }, async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close().catch(() => {}));
    await still(page);
    await page.goto(`${server.origin}/${DECK}?still`);
    await page.waitFor(deckSettled);
    await page.evaluate('Reveal.slide(3)');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      if (i) await page.evaluate('Reveal.next()');
      await sleep(150);
      seen.push(await page.evaluate(`(() => { const s = Reveal.getCurrentSlide(), g = s.querySelector('.faint'); return [g.classList.contains('visible') ? getComputedStyle(g).opacity : 'hidden', s.hasAttribute('data-complete')]; })()`));
    }
    assert.deepEqual(seen, [['hidden', false], [GHOST, false], [GHOST, false], [GHOST, true]]);
    const print = await browser.newPage();
    t.after(() => print.close().catch(() => {}));
    await printView(print, `${server.origin}/${DECK}?print-pdf`);
    const pages = await print.evaluate(`[...document.querySelectorAll('.pdf-page section')].filter((s) => s.querySelector('.faint')).map((s) => {
    const g = s.querySelector('.faint');
    return g.classList.contains('visible') ? getComputedStyle(g).opacity : 'hidden';
  })`);
    assert.ok(pages.length >= 3, `the print view has ${pages.length} pages of the slide`);
    assert.deepEqual(pages.filter((p) => p !== 'hidden'), Array(pages.filter((p) => p !== 'hidden').length).fill(GHOST));
    assert.ok(pages.filter((p) => p !== 'hidden').length >= 2);
  });

  // the class center is a class of the theme on a text block, and never on a slide, whose class
  // center reveal.js reads in its print layout
  test('the scope rule allows center, ghost, oval, and the crop of an oval picture, and refuses center on a section', () => {
    const theme = new Set(themeClasses(readFileSync(new URL('../theme/beeson.css', import.meta.url), 'utf8')));
    assert.ok(theme.has('center') && theme.has('faint') && theme.has('oval'));
    const attrs = (html) => tokenize(html).find((x) => x.type === 'start').attrs;
    assert.deepEqual(editProblems('p', attrs('<p>'), { classes: { center: true, faint: true } }, theme), []);
    assert.deepEqual(editProblems('section', attrs('<section>'), { classes: { center: true } }, theme), ['the class center on a section']);
    assert.deepEqual(editProblems('section', attrs('<section>'), { classes: { faint: true } }, theme), []);
    assert.deepEqual(textProblems('<section class="center"><p class="center">A</p></section>', theme), ['the class center on a section']);
    // the crop of an oval picture is cut with the ellipse
    assert.deepEqual(editProblems('img', attrs('<img class="oval">'), { style: { scale: '2', 'clip-path': 'inset(25% round 50%)' } }, theme), []);
    assert.deepEqual(editProblems('img', attrs('<img>'), { style: { 'clip-path': 'inset(25% round 40%)' } }, theme), ['clip-path inset(25% round 40%) on a img']);
  });
});

// regression tests of R21.4 on both platforms, for the findings V14 and V15 with V21 of the review
// of round 8: a dimmed step in the presenter display and in Preview Transition, and the marks of a
// centered list
describe('a dimmed step in the presenter display', () => {
  const PLATFORMS = ['mac', 'other'];
  const SLIDE = '.reveal .slides > section.present';
  const GHOST = '0.25';

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
  const wait = (page, ms = 300) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  async function load(t, platform, deck, slide = 0) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await wait(page);
    return page;
  }

  // the computed opacity of the paragraph that starts with each of words, in the clone drawn into
  // the first element that matches host
  const opacitiesOf = (host, words) => `(() => {
  const root = document.querySelector(${js(host)})?.shadowRoot;
  if (!root) return null;
  return ${js(words)}.map((w) => { const p = [...root.querySelectorAll('p')].find((e) => e.textContent.startsWith(w)); return p ? getComputedStyle(p).opacity : null; });
})()`;
  const opacities = (page, host, words) => page.evaluate(opacitiesOf(host, words));

  // V14. on slide 3 of the fixture of R20.8, Zeta is a step set to Dim at index 1, which the show
  // draws at the ghost opacity from its step on. Eta and Theta are plain steps after it
  for (const platform of PLATFORMS) {
    test(`V14 ${platform}: the presenter display draws a step set to Dim at the ghost opacity from its step on`, async (t) => {
      const page = await load(t, platform, 'test/pages/editor-r20-8.html', 2);
      await page.evaluate('(() => { window.open = () => null; return true; })()');
      await press(page, 'Alt+Enter');
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open] .shot.current .pic')`, 20000);
      const current = [];
      const next = [];
      for (let k = 0; k < 4; k++) {
        await wait(page, 400);
        current.push(await opacities(page, 'dialog.beeson-edit-presenter[open] .shot.current .pic', ['Zeta', 'Eta']));
        next.push(await opacities(page, 'dialog.beeson-edit-presenter[open] .shot.next .pic', ['Zeta']));
        await press(page, 'ArrowRight');
      }
      assert.deepEqual(current.map((s) => s[0]), ['1', GHOST, GHOST, GHOST], 'Zeta on the current slide');
      // a plain step before the last shown one is still dimmed to 0.45, as in the show
      assert.deepEqual(current.map((s) => s[1]), ['1', '1', '1', '0.45'], 'Eta on the current slide');
      assert.equal(next[0][0], GHOST, 'Zeta on the next step');
      assert.deepEqual(errors(page), []);
    });

    test(`V14 ${platform}: Preview Transition draws a step set to Dim at the ghost opacity on the slide it leaves`, async (t) => {
      const page = await load(t, platform, 'test/pages/editor-r20-8.html', 2);
      const dim = await readAtPlay(page, opacitiesOf('.beeson-edit-preview .shot', ['Zeta', 'Eta', 'Theta']), () => exec(page, 'slide.previewTransition'));
      assert.deepEqual(dim, [GHOST, '1', '1']);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }

  // the left of the mark, the left and the right of the first words, and the left and the right of
  // the box of each item of the n-th list of the slide, and the width of the list, in slide px from
  // the left of the list. the mark is the box of the ::before of its item, read from the box model of
  // the DevTools protocol, since a centered list draws it in the line of the words
  const marks = async (page, n) => {
    const items = await page.evaluate(`(() => {
  const list = document.querySelectorAll('${SLIDE} > :is(ul, ol)')[${n}];
  const box = list.getBoundingClientRect();
  const scale = box.width / list.offsetWidth;
  window.probed = [...list.children];
  return [...list.children].map((li) => {
    const r = li.getBoundingClientRect();
    const node = li.firstChild;
    const range = document.createRange();
    range.setStart(node, node.data.length - node.data.trimStart().length);
    range.setEnd(node, node.data.trimEnd().length);
    const words = range.getBoundingClientRect();
    const at = (x) => Math.round((x - box.left) / scale);
    return { origin: box.left, scale, words: at(words.left), end: at(words.right), left: at(r.left), right: at(r.right), width: Math.round(box.width / scale) };
  });
})()`);
    // the protocol hands out the node of an object only after the document is requested
    await page.send('DOM.getDocument', { depth: -1 });
    const { result } = await page.send('Runtime.evaluate', { expression: 'window.probed', returnByValue: false });
    const { result: props } = await page.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true });
    const lis = props.filter((p) => /^\d+$/.test(p.name)).sort((a, b) => a.name - b.name);
    for (const [i, m] of items.entries()) {
      const { nodeId } = await page.send('DOM.requestNode', { objectId: lis[i].value.objectId });
      const { node } = await page.send('DOM.describeNode', { nodeId, depth: 1 });
      const before = node.pseudoElements.find((p) => p.pseudoType === 'before');
      const { model } = await page.send('DOM.getBoxModel', { backendNodeId: before.backendNodeId });
      m.mark = Math.round((model.border[0] - m.origin) / m.scale);
      delete m.origin;
      delete m.scale;
    }
    return items;
  };

  // V15 and V21. each mark of a centered list is drawn beside the words of its item, at the distance
  // of an uncentered list, and the item with its mark is centered on the list. the four lists of
  // slide 1 of the fixture of R20.4 are a list of chevrons, of dots, of dashes, and of numbers
  const KINDS = [['chevrons', '<ul class="center">\n    <li>Alpha'], ['dots', '<ul class="dots center">'], ['dashes', '<ul class="dashes center">'], ['numbers', '<ol start="4" class="center">']];
  for (const platform of PLATFORMS) {
    test(`V15 ${platform}: Center draws the mark of each item of a list of chevrons, dots, dashes, or numbers beside its centered words`, async (t) => {
      const page = await load(t, platform, 'test/pages/editor-r20-4.html');
      for (const [n, [kind, written]] of KINDS.entries()) {
        const before = await marks(page, n);
        await page.evaluate(`(() => { const li = document.querySelectorAll('${SLIDE} > :is(ul, ol)')[${n}].querySelector('li'); li.focus(); getSelection().collapse(li.firstChild, 1); return true; })()`);
        await wait(page, 100);
        await exec(page, 'text.align.center');
        await wait(page);
        assert.ok((await render(page)).includes(written), `${kind}: the list is not written with the class center`);
        for (const [i, m] of (await marks(page, n)).entries()) {
          // an item that holds a nested list is as wide as the nested list, and its words are centered in it
          assert.ok(Math.abs(m.words - m.mark - (before[i].words - before[i].mark)) <= 2, `${kind}, item ${i + 1}: the mark at ${js(m)} is not beside its words`);
          // the item with its mark runs from its words less the padding of an uncentered item to the end of its words
          const start = m.words - (before[i].words - before[i].left);
          assert.ok(Math.abs(start + m.end - m.width) <= 2 && start > 0, `${kind}, item ${i + 1}: the item at ${js(m)} is not centered on the list`);
        }
      }
      for (let i = 0; i < KINDS.length; i++) await undo(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }
});
