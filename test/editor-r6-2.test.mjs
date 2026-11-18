// the fixes of R6.2 on both platforms: the ghost of a step dragged in the Steps tab beside its drop
// line, Preview of the transition of a slide, and Use Rehearsed Timings in a show opened from the
// editor

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, drag, press } from './helpers/editor.mjs';

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

// the editor on deck served over HTTP, opened with text, at the slide of index, or at the slide of
// the first element matched by a selector
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
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// two boxes overlap when they share an area, or a line of a box of zero height
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top <= b.bottom && b.top <= a.bottom;

for (const platform of PLATFORMS) {
  // round 2 of the council, finding 40 of qwen3: the ghost of a dragged step covered the row and
  // the drop line it aimed at
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
    assert.deepEqual(errors(page), []);
  });
}

// the next preview of a transition is recorded in window.previews, as its layer is at the start of each
// phase and at its end. a phase may be over before the test reads it on a slow runner (issue #132), hence
// the record is made in the page. each entry is made of the kind, the opacity of each shot, the opacities
// of the animations of each shot, and the number of animations of the heading of the next slide. with
// escape, Esc is sent at the start of the phase play
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
    assert.deepEqual(errors(page), []);
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
    assert.deepEqual(errors(page), []);
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
    assert.deepEqual(errors(page), []);
  });
}

// the demo deck with a rehearsed second on each of its first two slides, in a file of its own
const TIMED = () => readFileSync('test-deck.html', 'utf8').replace('<section class="title">', '<section class="title" data-timing="1">').replace('<section class="section">', '<section class="section" data-timing="1">');

for (const platform of PLATFORMS) {
  test(`with Use Rehearsed Timings on, a show opened from the editor moves on after the timings on ${platform}`, async (t) => {
    const file = `.timed-${process.pid}-${platform}.html`;
    const text = TIMED();
    writeFileSync(file, text);
    t.after(() => rmSync(file, { force: true }));
    const page = await editor(platform, { deck: file, text });
    assert.equal((await page.evaluate(`window.BeesonEditor.state('play.useTimings')`)).checked, false);
    // the show is played in place, in a frame over the editor, and Esc ends it
    const SHOW = `document.querySelector('.beeson-edit-show iframe')?.contentWindow`;
    const shown = async () => page.evaluate(`(() => { try { const R = ${SHOW}?.Reveal; return R?.isReady?.() ? R.getIndices().h : null; } catch { return null; } })()`);
    const end = async () => {
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector('.beeson-edit-show')`);
    };

    // without the switch, the show waits for a key
    await press(page, 'Mod+Shift+Enter');
    // the show is the demo deck, with its surfaces, videos, and viewers
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
    // the delays are set in the show only
    assert.equal(readFileSync(file, 'utf8'), text);
    assert.equal(await page.evaluate('window.BeesonEditor.render()'), text);
    assert.deepEqual(errors(page), []);
  });
}
