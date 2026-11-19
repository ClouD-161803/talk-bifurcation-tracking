import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';

const DECK = 'test/pages/video-play.html';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

let held = null;
let server;
let browser;

before(async () => {
  server = await serve('.', { delay: (path) => (held && path.endsWith('clip-b.mp4') ? held.promise : 0) });
  browser = await launch({ offline: false });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function newPage(t) {
  const page = await browser.newPage();
  t.after(() => page.close());
  return page;
}

const recordEvents = `(() => {
  window.videoEvents = [];
  const start = performance.now();
  for (const video of document.querySelectorAll('video')) {
    for (const type of ['play', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'canplay', 'loadeddata', 'emptied', 'error']) {
      video.addEventListener(type, () => videoEvents.push(video.id + ' ' + type + ' ' + Math.round(performance.now() - start)));
    }
  }
})()`;

async function open(t, hash) {
  const page = await newPage(t);
  await page.goto(deckUrl(DECK, '', hash));
  await page.waitFor(deckSettled);
  await page.evaluate(recordEvents);
  return page;
}

const errorsOf = (page) => page.errors.filter((error) => !error.includes('/favicon.ico'));

const stateOf = (id) => `(() => {
  const video = document.getElementById('${id}'), style = getComputedStyle(video);
  return {
    playing: !video.paused,
    time: video.currentTime,
    opacity: style.opacity,
    visibility: style.visibility,
    covered: video.hasAttribute('data-covered'),
  };
})()`;

async function until(page, id, expected) {
  const matches = `(() => { const state = ${stateOf(id)}; return Object.entries(${JSON.stringify(expected)}).every(([key, value]) => state[key] === value); })()`;
  await page.waitFor(matches).catch(() => {});
  const state = await page.evaluate(stateOf(id));
  const seen = Object.fromEntries(Object.keys(expected).map((key) => [key, state[key]]));
  const details = () => page.evaluate(`(() => {
    const video = document.getElementById('${id}');
    return JSON.stringify({
      readyState: video.readyState, networkState: video.networkState, preload: video.preload, error: video.error?.code ?? null,
      page: document.visibilityState, indices: Reveal.getIndices(),
      events: (window.videoEvents ?? []).filter((event) => event.startsWith('${id} ')).slice(-12),
    });
  })()`);
  if (JSON.stringify(seen) !== JSON.stringify(expected)) assert.deepEqual(seen, expected, `${id}: ${await details()}`);
  return state;
}

const recordStarts = `window.starts = {};
document.addEventListener('DOMContentLoaded', () => {
  for (const video of document.querySelectorAll('video')) {
    const frame = (now, { mediaTime, expectedDisplayTime }) => {
      if (mediaTime > 0) starts[video.id] = expectedDisplayTime - 1000 * mediaTime;
      else video.requestVideoFrameCallback(frame);
    };
    video.requestVideoFrameCallback(frame);
  }
})`;

test('two videos of one step are started together, also when one of them is loaded later', { timeout: 120000 }, async (t) => {
  held = Promise.withResolvers();
  t.after(() => { held.resolve(); held = null; });
  const page = await newPage(t);
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: recordStarts });
  await page.send('Page.navigate', { url: `${server.origin}/${DECK}#/1` });
  await page.waitFor('!!window.Reveal?.isReady?.()');
  await page.evaluate('Reveal.next()');
  await sleep(1000);
  const waiting = await page.evaluate(`[left, right].map((video) => [video.readyState, video.paused, video.currentTime])`);
  assert.ok(waiting[1][0] < 3, `the second clip is held back: ${JSON.stringify(waiting)}`);
  assert.deepEqual(waiting[0].slice(1), [true, 0], 'the first clip waits for the second');
  held.resolve();
  await page.waitFor(`'left' in starts && 'right' in starts`, 30000);
  const { left, right } = await page.evaluate('starts');
  assert.ok(Math.abs(left - right) < 100, `the clips started at ${left} ms and ${right} ms`);
  const [a, b] = await page.evaluate(`[left, right].map((video) => video.getBoundingClientRect().toJSON())`);
  assert.ok(a.right <= b.left && a.top === b.top && a.width === b.width && a.height === b.height, JSON.stringify([a, b]));
  assert.deepEqual(errorsOf(page), []);
});

test('a video of the style play shows its poster until its step, and it is played from its step on without being dimmed', { timeout: 120000 }, async (t) => {
  const page = await open(t, '/0');
  const poster = { playing: false, time: 0, opacity: '1', visibility: 'visible', covered: false };
  await until(page, 'play', poster);
  await page.evaluate('Reveal.next()');
  await until(page, 'play', { playing: false, time: 0 });
  await page.evaluate('Reveal.next()');
  await until(page, 'play', { playing: true });
  await page.waitFor(`play.currentTime > 0.2`);
  const before = await page.evaluate('play.currentTime');
  await page.evaluate('Reveal.next()');
  assert.ok(await page.evaluate('play.currentTime') >= before, 'it is not restarted at a later step');
  await sleep(600);
  await until(page, 'play', { playing: true, opacity: '1' });
  await page.evaluate('Reveal.prev()');
  await page.evaluate('Reveal.prev()');
  await until(page, 'play', poster);
  assert.deepEqual(errorsOf(page), []);
});

test('a video shown in the place of another covers it, and the one under it is paused until the step is undone', { timeout: 120000 }, async (t) => {
  const page = await open(t, '/2');
  const boxes = await page.evaluate(`[first, second].map((video) => JSON.stringify(video.getBoundingClientRect()))`);
  assert.equal(boxes[0], boxes[1], 'the clips are stacked in one place');
  await page.evaluate('Reveal.next()');
  await until(page, 'first', { playing: true });
  await until(page, 'second', { playing: false, visibility: 'hidden' });
  await page.evaluate('Reveal.next()');
  await until(page, 'second', { playing: true, visibility: 'visible', covered: false });
  await until(page, 'first', { playing: false, time: 0, visibility: 'hidden', covered: true });
  const undone = Date.now();
  await page.evaluate('Reveal.prev()');
  await until(page, 'second', { playing: false, time: 0, opacity: '0', visibility: 'hidden' });
  const again = await until(page, 'first', { playing: true, visibility: 'visible', covered: false });
  const since = (Date.now() - undone) / 1000;
  assert.ok(again.time <= since + 0.5, `the first clip is at ${again.time} s, ${since} s after the step`);
  await page.evaluate('Reveal.prev()');
  await until(page, 'first', { playing: false, time: 0, opacity: '1', visibility: 'visible', covered: false });
  assert.deepEqual(errorsOf(page), []);
});

test('a covered video is rewound once the fade set in the CSS for a covered video is over', { timeout: 120000 }, async (t) => {
  const page = await browser.newPage({ motion: true });
  t.after(() => page.close());
  await page.goto(deckUrl(DECK, '', '/2'));
  await page.waitFor(deckSettled);
  await page.evaluate(`document.head.append(Object.assign(document.createElement('style'), {
    textContent: '.reveal .slides section video.fragment[data-covered] { transition: opacity 1500ms ease-out, visibility 0s 1500ms; }',
  }))`);
  await page.evaluate('Reveal.next()');
  await page.waitFor('!first.paused && first.currentTime > 0.2', 30000);
  await page.evaluate(`(() => {
    const start = performance.now();
    window.rewind = null;
    first.addEventListener('seeking', () => (rewind = { after: performance.now() - start, visibility: getComputedStyle(first).visibility }), { once: true });
    Reveal.next();
  })()`);
  await page.waitFor('!!window.rewind', 30000);
  const { after, visibility } = await page.evaluate('rewind');
  assert.ok(after >= 1500, `the covered clip is rewound ${Math.round(after)} ms after the step`);
  assert.equal(visibility, 'hidden');
  assert.deepEqual(errorsOf(page), []);
});

test('a video in a fragment is played from its step on, and it does not call for the step that restores the dimmed fragments', { timeout: 120000 }, async (t) => {
  const page = await open(t, '/3');
  assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelector('[data-restore]')`), null);
  await until(page, 'inside', { playing: false });
  await page.evaluate('Reveal.next()');
  await until(page, 'inside', { playing: true });
  await page.evaluate('Reveal.next()');
  await until(page, 'inside', { playing: true });
  await page.waitFor(`getComputedStyle(inside.parentElement).opacity === '1'`).catch(() => {});
  assert.equal(await page.evaluate(`getComputedStyle(inside.parentElement).opacity`), '1');
  await page.evaluate('Reveal.prev()');
  await page.evaluate('Reveal.prev()');
  await until(page, 'inside', { playing: false, time: 0 });
  assert.deepEqual(errorsOf(page), []);
});

test('the print view shows each video of a step, with the video under a later one hidden', { timeout: 120000 }, async (t) => {
  const page = await newPage(t);
  await printView(page, deckUrl(DECK, 'print-pdf'));
  const shown = await page.evaluate(`[...document.querySelectorAll('.pdf-page')].map((page) => [...page.querySelectorAll('video')]
    .filter((video) => getComputedStyle(video).visibility !== 'hidden').map((video) => video.id).join(' '))`);
  assert.deepEqual(shown, [
    'play', 'play', 'play', 'play', 'play',
    'left right', 'left right',
    'first', 'first', 'second',
    '', 'inside', 'inside',
  ]);
});
