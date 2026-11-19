import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, click, press } from './helpers/editor.mjs';

describe('ends of Present from the speaker view', () => {
  const PLATFORMS = ['mac', 'other'];
  const LAST = 11;

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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const within = (page, expression, timeout) => page.waitFor(expression, timeout).then(() => true, () => false);

  async function load(t, platform, n = 0) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/test-deck.html?edit&still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(readFileSync('test-deck.html', 'utf8'))})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await page.evaluate(`(() => { const real = window.open; window.__shows = []; window.open = function (...a) { const w = real.apply(window, a); window.__shows.push(w); return w; }; return true; })()`);
    await frames(page);
    return page;
  }

  const SHOW = `document.querySelector('.beeson-edit-show iframe')?.contentWindow`;
  const TAB = 'window.__shows?.at(-1)';
  const DISPLAY = `!!document.querySelector('dialog.beeson-edit-presenter[open]')`;
  const ready = (w) => `(() => { try { const w = ${w}; return !!w?.Reveal?.isReady() && (!w.MathJax || (w.MathJax.startup?.promise?.then(() => true) ?? false)); } catch { return false; } })()`;
  const stageGone = `!document.querySelector('.beeson-edit-show')`;

  const SPEAKER = 'window.__speakerKept';
  const CURRENT = `${SPEAKER}?.document.querySelector('#current-slide iframe')?.contentWindow`;
  const UPCOMING = `${SPEAKER}?.document.querySelector('#upcoming-slide iframe')?.contentWindow`;
  const keepSpeaker = (w) => `(() => { const w = ${w}; const real = w.open; w.open = function (...a) { const v = real.apply(w, a); window.__speakerKept = v; return v; }; return true; })()`;
  const speakerClosed = `(() => { try { return ${SPEAKER}.closed; } catch { return true; } })()`;
  const keyIn = (w, key, keyCode) => `(() => { const w = ${w}; w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: ${js(key)}, keyCode: ${keyCode}, bubbles: true, cancelable: true })); return true; })()`;
  const KEYS = [['Escape', 27], ['e', 69]];

  for (const platform of PLATFORMS) {
    test(`Esc or E in the frame of the upcoming slide of the speaker view ends Present on the slide shown (${platform})`, async (t) => {
      for (const [key, keyCode] of KEYS) {
        const page = await load(t, platform, 4);
        await press(page, 'Mod+Enter');
        await page.waitFor(ready(SHOW), 20000);
        await sleep(300);
        await page.evaluate(keepSpeaker(SHOW));
        await press(page, 's');
        await page.waitFor(`${ready(CURRENT)} && ${ready(UPCOMING)}`, 20000);
        await sleep(1200);
        await page.evaluate(`(() => { const R = ${SHOW}.Reveal; R.slide(4); while (R.availableFragments().next) R.nextFragment(); return true; })()`);
        assert.ok(await within(page, `(() => { try { return ${UPCOMING}.Reveal.getIndices().h === 5 && ${CURRENT}.Reveal.getIndices().h === 4; } catch { return false; } })()`, 5000), 'the speaker view does not show slide 6 as upcoming');
        await sleep(600);
        await page.evaluate(keyIn(UPCOMING, key, keyCode));
        assert.ok(await within(page, stageGone, 5000), `${key} in the upcoming frame does not end the show`);
        assert.equal(await page.evaluate('Reveal.getIndices().h'), 4, `${key} in the upcoming frame leaves the editor on another slide than the one shown`);
        assert.deepEqual(errors(page), []);
      }
    });
  }

  async function presenterView(t, platform, n) {
    const page = await load(t, platform, n);
    await press(page, 'Alt+Enter');
    await page.waitFor(`${DISPLAY} && ${ready(TAB)}`, 20000);
    await sleep(1200);
    return page;
  }

  for (const platform of PLATFORMS) {
    test(`Presenter View ended from the speaker view of its tab closes the speaker view too (${platform})`, async (t) => {
      for (const [key, keyCode] of KEYS) {
        const page = await presenterView(t, platform, LAST);
        await page.evaluate(keepSpeaker(TAB));
        const { targetInfos } = await page.send('Target.getTargets');
        const tab = targetInfos.find((x) => x.type === 'page' && x.url.includes('from-editor'));
        const { sessionId } = await page.send('Target.attachToTarget', { targetId: tab.targetId, flatten: false });
        await page.send('Target.sendMessageToTarget', { sessionId, message: js({ id: 1, method: 'Runtime.evaluate', params: { expression: "Reveal.getPlugin('notes').open(), 1", userGesture: true } }) });
        await page.waitFor(ready(CURRENT), 20000);
        await sleep(1200);
        await page.evaluate(keyIn(CURRENT, key, keyCode));
        assert.ok(await within(page, `!${DISPLAY} && ${TAB}.closed`, 5000), `${key} in the speaker view does not end Presenter View`);
        assert.ok(await within(page, speakerClosed, 3000), `${key} in the speaker view leaves the speaker view open`);
        assert.equal(await page.evaluate('Reveal.getIndices().h'), LAST);
        assert.deepEqual(errors(page), []);
      }
    });
  }

  for (const platform of PLATFORMS) {
    test(`E or Esc in the tab of Presenter View ends it as the display does, before the tab opens the editor (${platform})`, async (t) => {
      for (const [key, keyCode] of [...KEYS].reverse()) {
        const page = await presenterView(t, platform, 3);
        await page.evaluate(keyIn(TAB, key, keyCode));
        assert.ok(await within(page, `!${DISPLAY} && ${TAB}.closed`, 5000), `${key} in the tab does not end Presenter View`);
        assert.equal(await page.evaluate('Reveal.getIndices().h'), 3, `${key} in the tab leaves the editor on another slide`);
        assert.deepEqual(errors(page), []);
      }
    });
  }
});

describe('the keys of PowerPoint in the show', () => {
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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  async function load(t, platform, n = 0) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/test-deck.html?edit&still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync('test-deck.html', 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await page.evaluate(`(() => { const real = window.open; window.__shows = []; window.open = function (...a) { const w = real.apply(window, a); window.__shows.push(w); return w; }; return true; })()`);
    await frames(page);
    return page;
  }

  const DISPLAY = 'dialog.beeson-edit-presenter[open]';
  const TAB = 'window.__shows.at(-1)';
  const tabClosed = `(() => { try { return ${TAB}.closed; } catch { return true; } })()`;

  for (const platform of PLATFORMS) {
    test(`Esc and End of the presenter display end the show in its tab too (${platform})`, async (t) => {
      for (const how of ['Escape', 'End']) {
        const page = await load(t, platform, 1);
        await press(page, 'Alt+Enter');
        await page.waitFor(`!!document.querySelector(${js(DISPLAY)}) && !!${TAB}?.Reveal?.isReady()`, 20000);
        await sleep(300);
        await press(page, 'ArrowRight');
        await press(page, 'ArrowRight');
        await page.waitFor(`${TAB}.Reveal.getIndices().h === 2`, 5000);
        if (how === 'Escape') await press(page, 'Escape');
        else await click(page, `${DISPLAY} button.end`);
        await page.waitFor(`!document.querySelector(${js(DISPLAY)})`);
        await sleep(300);
        assert.equal(await page.evaluate(tabClosed), true, `${how} of the presenter display leaves the show tab open`);
        assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelector('h2').textContent`), 'Show your steps one at a time', 'the editor is not at the slide shown last');
        await byteExact(page);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }

  const SHOW = `document.querySelector('.beeson-edit-show iframe')?.contentWindow`;
  const showReady = `(() => { try { const w = ${SHOW}; return !!w?.Reveal?.isReady() && (!w.MathJax || (w.MathJax.startup?.promise?.then(() => true) ?? false)); } catch { return false; } })()`;
  const at = (page) => page.evaluate(`(() => { const i = ${SHOW}.Reveal.getIndices(); return [i.h, i.f ?? -1]; })()`);
  async function present(t, platform, n) {
    const page = await load(t, platform, n);
    await press(page, 'Mod+Enter');
    await page.waitFor(showReady, 20000);
    await sleep(300);
    return page;
  }

  for (const platform of PLATFORMS) {
    test(`in the show played by Present, Return goes forward and Backspace goes back, and p stays the pointer (${platform})`, async (t) => {
      const page = await present(t, platform, 2);
      assert.deepEqual(await at(page), [2, -1]);
      await press(page, 'ArrowRight');
      await press(page, 'Enter');
      await sleep(200);
      assert.deepEqual(await at(page), [2, 1], 'Return does not go forward');
      await press(page, 'Backspace');
      await sleep(200);
      assert.deepEqual(await at(page), [2, 0], 'Backspace does not go back');
      await press(page, 'p');
      await page.waitFor(`!!${SHOW}.document.querySelector('.pointer-dot')`, 3000);
      await press(page, 'p');
      await page.waitFor(`!${SHOW}.document.querySelector('.pointer-dot')`, 3000);
      assert.deepEqual(await at(page), [2, 0], 'p moves the show');
      await press(page, 'o');
      await page.waitFor(`${SHOW}.Reveal.isOverview()`, 3000);
      await press(page, 'Enter');
      await page.waitFor(`!${SHOW}.Reveal.isOverview()`, 3000);
      assert.equal(await page.evaluate(`${SHOW}.Reveal.getIndices().h`), 2, 'Return in the overview moves the show');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-edit-show')`);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`in the show played by Present, a slide number typed before Return goes to its slide (${platform})`, async (t) => {
      const page = await present(t, platform, 0);
      assert.deepEqual(await at(page), [0, -1]);
      await press(page, '5');
      await press(page, 'Enter');
      await sleep(300);
      assert.equal(await page.evaluate(`${SHOW}.Reveal.getIndices().h`), 4, '5 and Return do not go to slide 5');
      await press(page, '1');
      await press(page, '0');
      await press(page, 'Enter');
      await sleep(300);
      assert.equal(await page.evaluate(`${SHOW}.Reveal.getIndices().h`), 9, '10 and Return do not go to slide 10');
      await press(page, '2');
      await press(page, 'ArrowLeft');
      await press(page, 'Enter');
      await sleep(300);
      assert.equal(await page.evaluate(`${SHOW}.Reveal.getIndices().h`), 9, 'a number is kept after another key');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-edit-show')`);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelector('h2').textContent`), 'Embedding TyCHO scenes');
      assert.deepEqual(errors(page), []);
    });
  }

  test('a deck opened by itself does not take Return, Backspace, or a number', async (t) => {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/test-deck.html?still#/2`);
    await page.waitFor(deckSettled);
    const here = () => page.evaluate('(() => { const i = Reveal.getIndices(); return [i.h, i.f ?? -1]; })()');
    assert.deepEqual(await here(), [2, -1]);
    for (const key of ['Enter', 'Backspace', '5', 'Enter']) await press(page, key);
    await sleep(300);
    assert.deepEqual(await here(), [2, -1]);
    assert.deepEqual(errors(page), []);
  });

  const rectOf = (page, selector) => page.evaluate(`(() => { const e = document.querySelector(${js(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top }; })()`);
  for (const platform of PLATFORMS) {
    test(`the presenter display keeps its customized layout with the show tab, and Esc ends the customizing before the show (${platform})`, async (t) => {
      const page = await load(t, platform, 1);
      await page.evaluate(`localStorage.setItem('beeson-presenter-layout:' + location.pathname, ${js(JSON.stringify({ notes: { x: 0.05, y: 0.6, w: 0.4, h: 0.3 } }))}), true`);
      await press(page, 'Alt+Enter');
      await page.waitFor(`!!document.querySelector(${js(DISPLAY)}) && !!${TAB}?.Reveal?.isReady()`, 20000);
      await sleep(300);
      const notes = await rectOf(page, `${DISPLAY} .notes`);
      assert.ok(Math.abs(notes.left - 80) <= 2 && Math.abs(notes.top - 600) <= 2, `the notes are at ${js(notes)}, not at the stored layout`);
      await click(page, `${DISPLAY} .bar.top button[aria-label="Display Options"]`);
      await click(page, `${DISPLAY} .parts button`);
      await page.waitFor(`!!document.querySelector('${DISPLAY} .layout:not([hidden])')`, 3000);
      await press(page, 'ArrowRight');
      await page.waitFor(`${TAB}.Reveal.getIndices().h === 2`, 5000);
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('${DISPLAY} .layout:not([hidden])')`);
      assert.ok(await page.evaluate(`!!document.querySelector(${js(DISPLAY)})`), 'Esc while the display is customized ends the display');
      assert.equal(await page.evaluate(tabClosed), false, 'Esc while the display is customized ends the show');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector(${js(DISPLAY)})`);
      await sleep(300);
      assert.equal(await page.evaluate(tabClosed), true, 'Esc leaves the show tab open');
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('the parts of the presenter display', () => {
  const OUTLINE = 'test/pages/editor-outline.html';
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

  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg !== undefined ? `, ${JSON.stringify(arg)}` : ''})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));

  async function load(t, platform, { deck = OUTLINE, n = 0, size = { width: 1600, height: 1000 } } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const PARTS = `(() => {
  const d = document.querySelector('dialog.beeson-edit-presenter[open]');
  if (!d) return null;
  const seen = (sel) => { const e = d.querySelector(sel); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const pop = d.querySelector('.parts');
  return {
    shown: ['.shot.current', '.shot:not(.current)', '.notes', '.clock', '.elapsed'].filter(seen).length,
    hidden: { current: !seen('.shot.current'), next: !seen('.shot:not(.current)'), notes: !seen('.notes'), clock: !seen('.clock'), timer: !seen('.elapsed') },
    open: !!pop && !pop.hidden,
    boxes: pop ? [...pop.querySelectorAll('input[type=checkbox]')].map((b) => b.closest('label').textContent.trim() + (b.checked ? ' on' : ' off')) : [],
  };
})()`;
  const KEY = `localStorage.getItem('beeson-presenter-parts:' + location.pathname)`;
  const box = (label) => `.beeson-edit-presenter .parts label:nth-child(${['Current Slide', 'Next Slide', 'Presenter Notes', 'Clock', 'Timer'].indexOf(label) + 1})`;
  const count = (page) => page.evaluate(`document.querySelector('.beeson-edit-presenter .count').textContent`);

  for (const platform of PLATFORMS) {
    test(`Customize Presenter Display… of the Play menu opens the display with a popover of its parts, and each part unchecked is hidden and kept for the deck (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 1 });
      await page.evaluate(`(() => { window.__opened = 0; window.open = () => { window.__opened++; return null; }; return true; })()`);
      const play = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].findIndex((b) => b.textContent === 'Play')`);
      assert.ok(play >= 0, 'the menu bar does not have the Play menu');
      await click(page, `.beeson-edit-menubar [role=menuitem]:nth-child(${play + 1})`);
      const item = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].findIndex((i) => i.querySelector('.label')?.textContent === 'Customize Presenter Display…')`);
      assert.ok(item >= 0, 'the Play menu does not have Customize Presenter Display…');
      await click(page, `.beeson-edit-menu .item:nth-of-type(${item + 1})`);
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open]')`);
      let parts = await page.evaluate(PARTS);
      assert.equal(parts.open, true, 'the popover of the parts is not open');
      assert.deepEqual(parts.boxes, ['Current Slide on', 'Next Slide on', 'Presenter Notes on', 'Clock on', 'Timer on']);
      assert.equal(parts.shown, 5);
      assert.equal(await page.evaluate('window.__opened'), 0, 'Customize Presenter Display… opened the show');
      await click(page, box('Next Slide'));
      await click(page, box('Clock'));
      parts = await page.evaluate(PARTS);
      assert.deepEqual(parts.hidden, { current: false, next: true, notes: false, clock: true, timer: false });
      assert.deepEqual(JSON.parse(await page.evaluate(KEY)), ['next', 'clock']);
      assert.equal(await count(page), '2 / 3');
      await press(page, 'ArrowRight');
      assert.equal(await count(page), '3 / 3');
      await press(page, 'Escape');
      parts = await page.evaluate(PARTS);
      assert.equal(parts?.open, false, 'Esc did not close the popover, or it ended the display');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('dialog.beeson-edit-presenter[open]')`);
      await exec(page, 'play.customizePresenter');
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter[open]')`);
      parts = await page.evaluate(PARTS);
      assert.deepEqual(parts.boxes, ['Current Slide on', 'Next Slide off', 'Presenter Notes on', 'Clock off', 'Timer on']);
      assert.deepEqual(parts.hidden, { current: false, next: true, notes: false, clock: true, timer: false });
      await click(page, box('Next Slide'));
      await click(page, box('Clock'));
      assert.equal((await page.evaluate(PARTS)).shown, 5);
      assert.equal(await page.evaluate(KEY), null);
      await press(page, 'Escape');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('dialog.beeson-edit-presenter[open]')`);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`the button Display Options of the presenter display opens and closes the popover of its parts, which a click outside closes (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 1 });
      await exec(page, 'play.rehearse');
      await page.waitFor(`!!document.querySelector('dialog.beeson-edit-presenter.rehearse[open]')`);
      assert.equal((await page.evaluate(PARTS)).open, false);
      const button = `.beeson-edit-presenter .bar.top button[aria-label="Display Options"]`;
      await click(page, button);
      assert.equal((await page.evaluate(PARTS)).open, true, 'the button does not open the popover');
      assert.equal(await page.evaluate(`document.querySelector('${button}').getAttribute('aria-expanded')`), 'true');
      for (const label of ['Current Slide', 'Presenter Notes', 'Timer']) await click(page, box(label));
      const parts = await page.evaluate(PARTS);
      assert.deepEqual(parts.hidden, { current: true, next: false, notes: true, clock: false, timer: true });
      assert.ok(await page.evaluate(`document.querySelector('.beeson-edit-presenter .shot:not(.current)').getBoundingClientRect().width > innerWidth * 0.8`), 'the next slide does not take the width of the stage');
      assert.ok(await page.evaluate(`!!document.querySelector('.beeson-edit-presenter .shot:not(.current) .pic').shadowRoot?.querySelector('section')`));
      await click(page, '.beeson-edit-presenter .bar.foot .count');
      assert.equal((await page.evaluate(PARTS)).open, false, 'a click outside does not close the popover');
      assert.equal(await count(page), '2 / 3', 'a click outside moved the display');
      await click(page, button);
      await click(page, button);
      assert.equal((await page.evaluate(PARTS)).open, false, 'a second click on the button does not close the popover');
      assert.deepEqual(JSON.parse(await page.evaluate(KEY)), ['current', 'notes', 'timer']);
      await press(page, 'Escape');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('dialog.beeson-edit-presenter[open]')`);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }
});
