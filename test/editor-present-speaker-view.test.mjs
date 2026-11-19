import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { press } from './helpers/editor.mjs';

const PLATFORMS = ['mac', 'other'];
const LAST = 12;

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
const ready = (w) => `(() => { try { const w = ${w}; return !!w?.Reveal?.isReady() && (!w.MathJax || (w.MathJax.startup?.promise?.then(() => true) ?? false)); } catch { return false; } })()`;
const stageGone = `!document.querySelector('.beeson-edit-show')`;
const at = (page, w) => page.evaluate(`(() => { const i = ${w}.Reveal.getIndices(); return \`\${i.h}/\${i.v}/\${i.f ?? -1}\`; })()`);
const toEnd = (w) => `(() => { const R = ${w}.Reveal; R.slide(R.getHorizontalSlides().length - 1); while (R.availableFragments().next) R.nextFragment(); return R.isLastSlide(); })()`;
const atEnd = (w) => `(() => { try { const R = ${w}.Reveal; return R.isLastSlide() && !R.availableFragments().next; } catch { return false; } })()`;

async function present(t, platform, n) {
  const page = await load(t, platform, n);
  await press(page, 'Mod+Enter');
  await page.waitFor(ready(SHOW), 20000);
  await sleep(300);
  return page;
}

const SPEAKER = 'window.__speakerKept';
const CURRENT = `${SPEAKER}?.document.querySelector('#current-slide iframe')?.contentWindow`;
const keepSpeaker = (w) => `(() => { const w = ${w}; const real = w.open; w.open = function (...a) { const v = real.apply(w, a); window.__speakerKept = v; return v; }; return true; })()`;

const clickIn = (w) => `(() => {
  const w = ${w};
  const el = w.Reveal.getCurrentSlide().querySelector('h1, h2') ?? w.Reveal.getCurrentSlide();
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + 8, clientY: r.top + r.height / 2, button: 0, isPrimary: true, pointerId: 1 };
  el.dispatchEvent(new w.PointerEvent('pointerdown', o));
  el.dispatchEvent(new w.PointerEvent('pointerup', o));
  el.dispatchEvent(new w.MouseEvent('click', o));
  return true;
})()`;
const keyIn = (w, key, keyCode) => `(${w}.document.dispatchEvent(new KeyboardEvent('keydown', { key: ${js(key)}, keyCode: ${keyCode}, bubbles: true, cancelable: true })), true)`;

async function openSpeaker(page, w) {
  await page.evaluate(keepSpeaker(w));
  await press(page, 's');
  await page.waitFor(ready(CURRENT), 20000);
  await sleep(1200);
}

for (const platform of PLATFORMS) {
  test(`the show played by Present stays at its step once s opens the speaker view, and the editor follows it (${platform})`, async (t) => {
    const page = await present(t, platform, 3);
    const start = await at(page, SHOW);
    await openSpeaker(page, SHOW);
    const seen = [];
    for (let i = 0; i < 8; i++) {
      seen.push(await at(page, SHOW));
      await sleep(400);
    }
    assert.deepEqual(seen, seen.map(() => start), 'the show moves without input after s');
    await page.evaluate(`(() => { window.__events = []; window.addEventListener('message', (e) => { try { const m = JSON.parse(e.data); if (m.namespace === 'reveal') window.__events.push(m.eventName + ' ' + m.state.indexh); } catch {} }); return true; })()`);
    await page.evaluate(`${SHOW}.Reveal.slide(6)`);
    assert.ok(await within(page, `window.__events.includes('slidechanged 6')`, 3000), 'the show does not post its slide to the editor');
    await sleep(1500);
    assert.equal(await at(page, SHOW), '6/0/-1', 'the show moves without input after a change of slide');
    await page.evaluate(`${SHOW}.focus()`);
    await press(page, 'Escape');
    await page.waitFor(stageGone, 5000);
    assert.equal(await page.evaluate('Reveal.getIndices().h'), 6);
    assert.ok(await within(page, `${SPEAKER}.closed`, 3000), 'the speaker view is left open');
    assert.deepEqual(page.errors, []);
  });
}

for (const platform of PLATFORMS) {
  test(`a click or a key forward in the speaker view at the last step ends the show played by Present (${platform})`, async (t) => {
    for (const how of ['click', 'ArrowRight']) {
      const page = await present(t, platform, LAST);
      assert.equal(await page.evaluate(toEnd(SHOW)), true);
      await openSpeaker(page, SHOW);
      assert.ok(await within(page, atEnd(CURRENT), 3000), 'the speaker view is not at the last step');
      await page.evaluate(how === 'click' ? clickIn(CURRENT) : keyIn(CURRENT, 'ArrowRight', 39));
      assert.ok(await within(page, stageGone, 5000), `a ${how} in the speaker view at the last step does not end the show`);
      assert.equal(await page.evaluate('Reveal.getIndices().h'), LAST, 'the editor is not on the last slide');
      assert.ok(await within(page, `${SPEAKER}.closed`, 3000), 'the speaker view is left open');
      assert.deepEqual(page.errors, []);
    }
  });

  test(`a click before the last step in the speaker view moves the show on and does not end it (${platform})`, async (t) => {
    const page = await present(t, platform, LAST - 1);
    await openSpeaker(page, SHOW);
    const start = await at(page, SHOW);
    await page.evaluate(clickIn(CURRENT));
    assert.ok(await within(page, `(() => { const i = ${SHOW}?.Reveal.getIndices(); return !!i && \`\${i.h}/\${i.v}/\${i.f ?? -1}\` !== ${js(start)}; })()`, 3000), 'a click in the speaker view does not move the show');
    await sleep(800);
    assert.equal(await page.evaluate(stageGone), false, 'a click before the last step ends the show');
  });
}

const DISPLAY = `!!document.querySelector('dialog.beeson-edit-presenter[open]')`;
for (const platform of PLATFORMS) {
  test(`a click in the tab of Presenter View at the last step ends the show and the presenter display (${platform})`, async (t) => {
    const page = await load(t, platform, LAST);
    await press(page, 'Alt+Enter');
    await page.waitFor(`${DISPLAY} && ${ready(TAB)}`, 20000);
    for (let i = 0; i < 12 && !(await page.evaluate(atEnd(TAB))); i++) {
      await press(page, 'ArrowRight');
      await sleep(400);
    }
    assert.equal(await page.evaluate(atEnd(TAB)), true, 'the tab is not at the last step');
    assert.equal(await page.evaluate(DISPLAY), true, 'the display ends before the click');
    await page.evaluate(clickIn(TAB));
    assert.ok(await within(page, `!${DISPLAY}`, 5000), 'a click in the tab at the last step does not end the show');
    assert.ok(await within(page, `${TAB}.closed`, 3000), 'the tab of the show is left open');
    assert.equal(await page.evaluate('Reveal.getIndices().h'), LAST, 'the editor is not on the last slide');
    assert.deepEqual(page.errors, []);
  });

  test(`a click in the tab of Presenter View before the last step moves the show, and the display follows it (${platform})`, async (t) => {
    const page = await load(t, platform, LAST - 1);
    await press(page, 'Alt+Enter');
    await page.waitFor(`${DISPLAY} && ${ready(TAB)}`, 20000);
    await sleep(1200);
    const start = await at(page, TAB);
    await page.evaluate(clickIn(TAB));
    await sleep(800);
    assert.notEqual(await at(page, TAB), start, 'a click in the tab does not move the show');
    assert.equal(await page.evaluate(DISPLAY), true, 'a click before the last step ends the show');
    await press(page, 'Escape');
    await page.waitFor(`!${DISPLAY}`, 5000);
  });
}

const COUNT = `document.querySelector('.beeson-edit-bottom .count').textContent`;
for (const platform of PLATFORMS) {
  test(`the status bar does not number a hidden slide past the slides of the show (${platform})`, async (t) => {
    const page = await load(t, platform);
    const read = async (n) => {
      await page.evaluate(`Reveal.slide(${n})`);
      await frames(page);
      return page.evaluate(COUNT);
    };
    const hide = async (n) => {
      await page.evaluate(`Reveal.slide(${n})`);
      await frames(page);
      await page.evaluate(`window.BeesonEditor.exec('slide.hide')`);
      await frames(page);
    };
    await hide(LAST);
    assert.equal(await read(LAST), `Hidden slide, after slide ${LAST} of ${LAST}`);
    await hide(3);
    assert.equal(await read(3), `Hidden slide, after slide 3 of ${LAST - 1}`);
    assert.equal(await read(4), `Slide 4 of ${LAST - 1}`);
    await hide(0);
    assert.equal(await read(0), `Hidden slide, before slide 1 of ${LAST - 2}`);
    assert.equal(await read(LAST), `Hidden slide, after slide ${LAST - 2} of ${LAST - 2}`);
    for (let n = 0; n <= LAST; n++) {
      const text = await read(n);
      for (const [, k, total] of text.matchAll(/(\d+) of (\d+)/g)) assert.ok(Number(k) <= Number(total), `slide ${n} reads ${text}`);
    }
    assert.deepEqual(page.errors, []);
  });
}
