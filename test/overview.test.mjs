// checks of the gestures of the overview (src/overview.ts) on the demo deck, in Chrome. the row of
// slides is moved with a sideways wheel, the overview is opened with a pinch closed on a touch
// screen at the full view, and a slide is shown with a pinch open

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';

async function openDeck(t, { mobile = false } = {}) {
  const browser = await launch();
  t.after(() => browser.close());
  const page = mobile ? await browser.newPage({ width: 844, height: 390, mobile: true, scale: 3 }) : await browser.newPage();
  await page.goto(deckUrl('test-deck.html'));
  await page.waitFor(deckSettled);
  const wheel = (deltaX, deltaY, modifiers = 0) => page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 300, deltaX, deltaY, modifiers });
  const touch = (type, points) => page.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  // pinch moves two fingers on a horizontal line through x and y, from a distance of from CSS px
  // apart to a distance of to
  const pinch = async (x, y, from, to) => {
    const at = (d) => [[x - d / 2, y], [x + d / 2, y]];
    await touch('touchStart', at(from));
    for (let i = 1; i <= 8; i++) await touch('touchMove', at(from + ((to - from) * i) / 8));
    await touch('touchEnd', []);
  };
  return { page, wheel, touch, pinch };
}

// slideOf returns the index in the row of the slide with this heading, which must be in the deck
async function slideOf(page, heading) {
  const h = await page.evaluate(`Reveal.getHorizontalSlides().findIndex((s) => s.querySelector('h1, h2')?.textContent.trim() === ${JSON.stringify(heading)})`);
  assert.ok(h >= 0, `the slide "${heading}" is in the deck`);
  return h;
}

// the overview is opened in the middle of the deck, so that the row can be moved both ways.
// overview returns the index of this slide
async function overview(page) {
  const h = await slideOf(page, 'Figures are first class citizens, too');
  assert.ok(h >= 2 && h <= (await page.evaluate(`Reveal.getHorizontalSlides().length`)) - 2, `the slide ${h} is in the middle of the deck`);
  await page.evaluate(`Reveal.slide(${h})`);
  await page.evaluate(`Reveal.toggleOverview(true)`);
  await page.waitFor(`Reveal.isOverview()`);
  return h;
}

// the distance between two neighboring slides of the row on the screen, in CSS px
const step = `(() => {
  const h = Reveal.getIndices().h;
  const slides = Reveal.getHorizontalSlides();
  return slides[h + 1].getBoundingClientRect().left - slides[h].getBoundingClientRect().left;
})()`;

// swipe sends the wheels of one swipe, each given as [deltaX, deltaY], from within the page to the
// element under the pointer, hence the wheels are a few ms apart. swipe returns, for each wheel,
// whether it was prevented and the slide of the row after it
const swipe = (page, wheels) => page.evaluate(`${JSON.stringify(wheels)}.map(([deltaX, deltaY]) => {
  const ev = new WheelEvent('wheel', { deltaX, deltaY, cancelable: true, bubbles: true });
  document.elementFromPoint(400, 300).dispatchEvent(ev);
  return { prevented: ev.defaultPrevented, h: Reveal.getIndices().h };
})`);

test('in the overview, a sideways wheel moves the row by the length of the swipe', { timeout: 60000 }, async (t) => {
  const { page, wheel } = await openDeck(t);
  const h = await overview(page);
  const width = await page.evaluate(step);
  assert.ok(width > 50, `the slides of the row are ${width} px apart`);

  // a notch of a horizontal mouse wheel, sent by the browser, moves the row by a slide
  await page.evaluate(`window.notch = 0; window.addEventListener('wheel', (ev) => { notch = ev.timeStamp; })`);
  await wheel(30, 0);
  await page.waitFor(`Reveal.getIndices().h === ${h + 1}`);
  // a long swipe of two fingers on a trackpad passes several slides, in many small events. it is
  // sent after a pause, which ends the swipe of the notch above
  await page.waitFor(`notch > 0 && performance.now() - notch > 300`);
  await swipe(page, Array.from({ length: 25 }, () => [-(2.5 * width) / 25, 1]));
  assert.equal(await page.evaluate(`Reveal.getIndices().h`), h - 2);
  assert.ok(await page.evaluate(`Reveal.isOverview()`));
});

// Chrome does not let a page prevent the rest of a swipe whose first wheel the page did not prevent
test('in the overview, a wheel does not go back in the history of the browser', { timeout: 60000 }, async (t) => {
  const { page, wheel } = await openDeck(t);
  await overview(page);
  await page.evaluate(`window.prevented = []; window.addEventListener('wheel', (ev) => prevented.push(ev.defaultPrevented))`);
  for (const [dx, dy] of [[0, 2], [5, 1], [20, 2]]) await wheel(dx, dy);
  await page.waitFor(`prevented.length === 3`);
  assert.deepEqual(await page.evaluate(`prevented`), [true, true, true]);
});

test('in the overview, a vertical wheel does not move the row', { timeout: 60000 }, async (t) => {
  const { page } = await openDeck(t);
  const h = await overview(page);
  const wheels = await swipe(page, [[4, 120], [4, -120], [4, 40], [4, 300]]);
  assert.deepEqual(wheels, wheels.map(() => ({ prevented: true, h })));
});

test('in the overview, a swipe back from past the end of the row moves the row by the length of the swipe', { timeout: 60000 }, async (t) => {
  const { page } = await openDeck(t);
  await overview(page);
  // the second slide of the row, whatever its content, so that a swipe passes the start of the row
  await page.evaluate(`Reveal.slide(1)`);
  await page.waitFor(`Reveal.getIndices().h === 1`);
  const width = await page.evaluate(step);
  assert.ok(width > 50, `the slides of the row are ${width} px apart`);
  // 4 widths toward the start, and 1.5 widths back, i.e. 2.5 widths toward the start
  const wheels = await swipe(page, [...Array.from({ length: 40 }, () => [-width / 10, 0]), ...Array.from({ length: 15 }, () => [width / 10, 0])]);
  assert.deepEqual([wheels[39].h, wheels.at(-1).h], [0, 0]);
});

test('in the overview, a slide shown with a key during a swipe is kept by the next wheel of the swipe', { timeout: 60000 }, async (t) => {
  const { page } = await openDeck(t);
  const h = await overview(page);
  assert.ok(h + 3 < (await page.evaluate(`Reveal.getHorizontalSlides().length`)), `three slides follow the slide ${h}`);
  // the momentum of a trackpad sends wheels for about a second after the fingers are lifted
  const row = await page.evaluate(`(() => {
    const send = (deltaX) => document.elementFromPoint(400, 300).dispatchEvent(new WheelEvent('wheel', { deltaX, cancelable: true, bubbles: true }));
    const at = () => Reveal.getIndices().h;
    send(3);
    const swiped = at();
    Reveal.right();
    Reveal.right();
    const keyed = at();
    send(1);
    return [swiped, keyed, at()];
  })()`);
  assert.deepEqual(row, [h + 1, h + 3, h + 3]);
});

test('in the overview, a swipe measures the row only when it sets off', { timeout: 60000 }, async (t) => {
  const { page } = await openDeck(t);
  await overview(page);
  // a read of a box after a move of the row forces a layout. the first wheel sets the swipe off, and
  // the next ones do not pass a slide
  const reads = await page.evaluate(`(() => {
    const send = (deltaX) => document.elementFromPoint(400, 300).dispatchEvent(new WheelEvent('wheel', { deltaX, cancelable: true, bubbles: true }));
    send(5);
    const read = Element.prototype.getBoundingClientRect;
    let reads = 0;
    Element.prototype.getBoundingClientRect = function () { reads++; return read.call(this); };
    for (let i = 0; i < 10; i++) send(2);
    Element.prototype.getBoundingClientRect = read;
    return reads;
  })()`);
  assert.equal(reads, 0);
});

test('outside the overview, a wheel does not move the show', { timeout: 60000 }, async (t) => {
  const { page, wheel } = await openDeck(t);
  const h = await slideOf(page, 'Figures are first class citizens, too');
  await page.evaluate(`Reveal.slide(${h}); window.wheels = 0; window.addEventListener('wheel', () => wheels++)`);
  for (const [dx, dy] of [[300, 0], [-300, 0], [0, 300]]) await wheel(dx, dy);
  await page.waitFor(`wheels === 3`);
  assert.equal(await page.evaluate(`Reveal.getIndices().h`), h);
  assert.equal(await page.evaluate(`Reveal.isOverview()`), false);
});

// Chrome and Firefox send the pinch of a trackpad as a wheel with Ctrl, which zooms the page
test('a pinch on a trackpad does not open the overview, nor move its row', { timeout: 60000 }, async (t) => {
  const { page, wheel } = await openDeck(t);
  const h = await slideOf(page, 'Figures are first class citizens, too');
  await page.evaluate(`Reveal.slide(${h}); window.wheels = 0; window.addEventListener('wheel', () => wheels++)`);
  for (const dy of [-40, -40, -40]) await wheel(0, dy, 2);
  await page.waitFor(`wheels === 3`);
  assert.equal(await page.evaluate(`Reveal.isOverview()`), false);

  await overview(page);
  for (const [dx, dy] of [[30, -4], [60, 4]]) await wheel(dx, dy, 2);
  await page.waitFor(`wheels === 5`);
  assert.equal(await page.evaluate(`Reveal.getIndices().h`), h);
  assert.ok(await page.evaluate(`Reveal.isOverview()`));
});

test('on a touch screen at the full view, a pinch closed opens the overview', { timeout: 60000 }, async (t) => {
  const { page, pinch } = await openDeck(t, { mobile: true });
  const h = await slideOf(page, 'Figures are first class citizens, too');
  await page.evaluate(`Reveal.slide(${h})`);
  assert.equal(await page.evaluate(`visualViewport.scale`), 1);
  await pinch(420, 200, 400, 80);
  await page.waitFor(`Reveal.isOverview()`);
  assert.equal(await page.evaluate(`Reveal.getIndices().h`), h);
});

// the camera of a TyCHO viewer is dollied and panned with two fingers
test('on a touch screen, a pinch closed on a TyCHO viewer is left to the viewer', { timeout: 60000 }, async (t) => {
  const { page, pinch } = await openDeck(t, { mobile: true });
  const h = await slideOf(page, 'Embedding TyCHO scenes');
  await page.evaluate(`Reveal.slide(${h})`);
  await page.waitFor(`Reveal.getCurrentSlide().querySelector('tycho-viewer')?.getBoundingClientRect().width > 100`);
  const box = await page.evaluate(`(() => {
    const r = Reveal.getCurrentSlide().querySelector('tycho-viewer').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width };
  })()`);
  const from = 0.8 * box.width;
  for (const x of [box.x - from / 2, box.x + from / 2]) {
    assert.ok(await page.evaluate(`!!document.elementFromPoint(${x}, ${box.y})?.closest('tycho-viewer')`), `the viewer is under a finger at ${x}, ${box.y}`);
  }
  await page.evaluate(`window.ends = 0; document.addEventListener('touchend', (ev) => { if (!ev.touches.length) ends++; })`);
  await pinch(box.x, box.y, from, 0.2 * from);
  await page.waitFor(`ends === 1`);
  assert.equal(await page.evaluate(`Reveal.isOverview()`), false);
});

test('on a zoomed page, a pinch closed does not open the overview', { timeout: 60000 }, async (t) => {
  const { page, pinch } = await openDeck(t, { mobile: true });
  await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.waitFor(`visualViewport.scale > 1.5`);
  await page.evaluate(`window.ends = 0; document.addEventListener('touchend', (ev) => { if (!ev.touches.length) ends++; })`);
  await pinch(420, 200, 400, 80);
  await page.waitFor(`ends === 1`);
  assert.equal(await page.evaluate(`Reveal.isOverview()`), false);
});

test('in the overview, a pinch open shows the slide under the fingers', { timeout: 60000 }, async (t) => {
  const { page, pinch } = await openDeck(t, { mobile: true });
  const h = await overview(page);
  const next = await page.evaluate(`(() => {
    const r = Reveal.getHorizontalSlides()[${h + 1}].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await pinch(next.x, next.y, 40, 300);
  await page.waitFor(`!Reveal.isOverview()`);
  assert.equal(await page.evaluate(`Reveal.getIndices().h`), h + 1);
});

test('in the overview, a pinch open between the slides shows the current slide', { timeout: 60000 }, async (t) => {
  const { page, pinch } = await openDeck(t, { mobile: true });
  const h = await overview(page);
  const above = await page.evaluate(`Reveal.getHorizontalSlides()[${h}].getBoundingClientRect().top / 2`);
  await pinch(420, above, 40, 300);
  await page.waitFor(`!Reveal.isOverview()`);
  assert.equal(await page.evaluate(`Reveal.getIndices().h`), h);
});

// Safari sends the gesture events of a pinch next to its touches, and shows its tabs at a pinch
// closed at the full view unless the gesture is prevented. Safari on iOS sends the touchstart of
// the first finger, and gesturestart at a scale of 1 when the second finger touches. the touchstart
// of the second finger follows, then gesturechange as the fingers move, gestureend, and a touchend
// per finger. when the two fingers touch together, Safari on iOS sends one touchstart of both, and
// gesturestart once the fingers have moved, at a scale below 1. desktop Safari sends the same
// gesture events at a pinch on a trackpad, without touches. Chrome does not send them, hence they
// are made in the page
const gesture = (type, scale) => `(() => {
  const ev = new Event('${type}', { bubbles: true, cancelable: true });
  ev.scale = ${scale};
  document.body.dispatchEvent(ev);
  return ev.defaultPrevented;
})()`;

test('in Safari on a touch screen, a pinch closed is taken from Safari and opens the overview', { timeout: 60000 }, async (t) => {
  const { page, touch } = await openDeck(t, { mobile: true });
  await touch('touchStart', [[300, 200]]);
  assert.equal(await page.evaluate(gesture('gesturestart', 1)), false);
  await touch('touchStart', [[300, 200], [500, 200]]);
  assert.equal(await page.evaluate(gesture('gesturechange', 0.9)), true);
  assert.equal(await page.evaluate(`Reveal.isOverview()`), false);
  assert.equal(await page.evaluate(gesture('gesturechange', 0.5)), true);
  assert.ok(await page.evaluate(`Reveal.isOverview()`));
  await page.evaluate(gesture('gestureend', 0.5));
  await touch('touchEnd', [[300, 200]]);
  await touch('touchEnd', []);
});

test('in Safari on a touch screen, a pinch closed of two fingers that touch together is taken from Safari', { timeout: 60000 }, async (t) => {
  const { page, touch } = await openDeck(t, { mobile: true });
  await touch('touchStart', [[300, 200], [500, 200]]);
  assert.equal(await page.evaluate(gesture('gesturestart', 0.97)), true);
  assert.equal(await page.evaluate(gesture('gesturechange', 0.97)), true);
  assert.equal(await page.evaluate(`Reveal.isOverview()`), false);
  assert.equal(await page.evaluate(gesture('gesturechange', 0.5)), true);
  assert.ok(await page.evaluate(`Reveal.isOverview()`));
  await page.evaluate(gesture('gestureend', 0.5));
  await touch('touchEnd', []);
});

test('in Safari, a pinch open at the full view is left to the zoom of the page', { timeout: 60000 }, async (t) => {
  const { page, touch } = await openDeck(t, { mobile: true });
  await touch('touchStart', [[300, 200]]);
  assert.equal(await page.evaluate(gesture('gesturestart', 1)), false);
  await touch('touchStart', [[300, 200], [500, 200]]);
  assert.equal(await page.evaluate(gesture('gesturechange', 1.03)), false);
  assert.equal(await page.evaluate(gesture('gesturechange', 2)), false);
  await page.evaluate(gesture('gestureend', 2));
  await touch('touchEnd', [[300, 200]]);
  await touch('touchEnd', []);
  assert.equal(await page.evaluate(`Reveal.isOverview()`), false);
});

test('in desktop Safari, a pinch on a trackpad does not open the overview', { timeout: 60000 }, async (t) => {
  const { page } = await openDeck(t);
  assert.equal(await page.evaluate(gesture('gesturestart', 0.97)), false);
  assert.equal(await page.evaluate(gesture('gesturechange', 0.5)), false);
  assert.equal(await page.evaluate(`Reveal.isOverview()`), false);
});

// an iPad with a trackpad sends the gesture events of a pinch on the trackpad without touches
test('in Safari, a pinch on a trackpad after a tap of two fingers does not open the overview', { timeout: 60000 }, async (t) => {
  const { page, touch } = await openDeck(t, { mobile: true });
  await page.evaluate(`window.ends = 0; document.addEventListener('touchend', (ev) => { if (!ev.touches.length) ends++; })`);
  await touch('touchStart', [[300, 200], [500, 200]]);
  await touch('touchEnd', []);
  await page.waitFor(`ends === 1`);
  assert.equal(await page.evaluate(gesture('gesturestart', 0.97)), false);
  assert.equal(await page.evaluate(gesture('gesturechange', 0.5)), false);
  assert.equal(await page.evaluate(`Reveal.isOverview()`), false);
});
