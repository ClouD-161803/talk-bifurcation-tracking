import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';
import { press } from './helpers/editor.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const QUIET = 900;
const DATE_NOW_SLIP = 1;

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

async function open(t) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(deckUrl('test/pages/timed-steps.html'));
  await page.waitFor(deckSettled);
  return page;
}

const STATE = `({
  slide: Reveal.getIndices().h,
  shown: [...Reveal.getCurrentSlide().querySelectorAll('.fragment.visible')].map((f) => f.textContent).filter(Boolean),
})`;
const state = (page) => page.evaluate(STATE);

const onVirtualTime = new WeakSet();

async function wait(page, ms) {
  if (!onVirtualTime.has(page)) return sleep(ms);
  const expired = page.next('Emulation.virtualTimeBudgetExpired');
  await page.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms });
  await expired;
}

async function inDelay(t, keys, at) {
  const page = await open(t);
  await page.evaluate(`window.addEventListener('keydown', () => (window.keys ??= []).push(${STATE}), true)`);
  await page.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  onVirtualTime.add(page);
  await keys(page);
  assert.deepEqual((await page.evaluate('window.keys')).at(-1), at);
  return page;
}

async function settled(page) {
  let now = await state(page);
  for (;;) {
    await wait(page, QUIET);
    const next = await state(page);
    if (JSON.stringify(next) === JSON.stringify(now)) return now;
    now = next;
  }
}

const ALL = ['Click', 'Timed one', 'Timed two'];

test('a click plays the timed steps after it, and Back goes to the step of the click without playing them again', async (t) => {
  const page = await open(t);
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 1, shown: [] });
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 1, shown: ALL });
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 1, shown: ['Click'] });
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 1, shown: [] });
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 1, shown: ALL });
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 1, shown: [...ALL, 'Click again'] });
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 1, shown: ALL });
  assert.deepEqual(page.errors, []);
});

test('Back while a timed step is still to come stops it, and PageUp goes back as the left arrow does', async (t) => {
  const page = await open(t);
  await press(page, 'ArrowRight');
  await press(page, 'ArrowRight');
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 1, shown: [] });
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 1, shown: ALL });
  await press(page, 'PageUp');
  assert.deepEqual(await settled(page), { slide: 1, shown: ['Click'] });
  assert.deepEqual(page.errors, []);
});

test('a delay on the last step moves on to the next slide, and Back from there stays on the last step', async (t) => {
  const page = await open(t);
  await page.evaluate('Reveal.slide(2)');
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 3, shown: [] });
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 2, shown: ['Moves on'] });
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 2, shown: [] });
  assert.deepEqual(page.errors, []);
});

const step = (page) => page.evaluate(`Math.max(-1, ...[...Reveal.getCurrentSlide().querySelectorAll('.fragment.visible')].map((f) => Number(f.dataset.fragmentIndex)))`);

test('a delay on a last step that dims the step before moves on to the next slide, and Back lands on the last step', async (t) => {
  const page = await open(t);
  await page.evaluate('Reveal.slide(4)');
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 4, shown: ['Dims one'] });
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 5, shown: [] });
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 4, shown: ['Dims one', 'Dims two'] });
  assert.equal(await step(page), 1);
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 4, shown: ['Dims one'] });
  assert.deepEqual(page.errors, []);
});

test('the restore step of a slide without a delay on its last step waits for a key', async (t) => {
  const page = await open(t);
  await page.evaluate('Reveal.slide(1, 0, 3)');
  assert.deepEqual(await settled(page), { slide: 1, shown: [...ALL, 'Click again'] });
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 1, shown: [...ALL, 'Click again'] });
  assert.equal(await step(page), 4);
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 2, shown: [] });
  assert.deepEqual(page.errors, []);
});

test('a key during a delay shows the next step at once, the later delays still play, and Back lands on the step of the key', async (t) => {
  const page = await inDelay(t, async (page) => {
    await press(page, 'ArrowRight');
    assert.deepEqual(await settled(page), { slide: 1, shown: [] });
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
  }, { slide: 1, shown: ['Click'] });
  assert.deepEqual(await settled(page), { slide: 1, shown: ALL });
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 1, shown: ['Click', 'Timed one'] });
  await press(page, 'ArrowLeft');
  assert.deepEqual(await settled(page), { slide: 1, shown: ['Click'] });
  assert.deepEqual(page.errors, []);
});

test('the keys of a remote during the delay of the last step go on to the next slide, whose delay still plays', async (t) => {
  const page = await inDelay(t, async (page) => {
    await page.evaluate('Reveal.slide(4)');
    await press(page, 'PageDown');
    await press(page, 'PageDown');
    await press(page, 'Space');
  }, { slide: 4, shown: ['Dims one', 'Dims two'] });
  assert.deepEqual(await settled(page), { slide: 5, shown: [] });
  await press(page, 'PageDown');
  assert.deepEqual(await settled(page), { slide: 5, shown: ['Later', 'Later timed'] });
  assert.deepEqual(page.errors, []);
});

test('the key A pauses the delays, which stay paused through the steps of the keys, and A again plays them', async (t) => {
  const page = await inDelay(t, async (page) => {
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await press(page, 'A');
  }, { slide: 1, shown: ['Click'] });
  assert.deepEqual(await settled(page), { slide: 1, shown: ['Click'] });
  await press(page, 'ArrowRight');
  assert.deepEqual(await settled(page), { slide: 1, shown: ['Click', 'Timed one'] });
  await press(page, 'A');
  assert.deepEqual(await settled(page), { slide: 1, shown: ALL });
  assert.deepEqual(page.errors, []);
});

test('a slide whose last step moves on by a delay keeps the look of its last step until it has left the screen', async (t) => {
  const page = await open(t);
  await page.evaluate(`document.head.insertAdjacentHTML('beforeend', '<style>.reveal .slides section .fragment { transition: none !important; }</style>')`);
  await page.evaluate('Reveal.slide(4, 0, 0)');
  assert.deepEqual(await settled(page), { slide: 4, shown: ['Dims one'] });
  await page.evaluate(`(() => {
    const slide = Reveal.getSlides()[4];
    const [one, two] = ['Dims one', 'Dims two'].map((text) => [...slide.querySelectorAll('.fragment')].find((f) => f.textContent === text));
    window.samples = [];
    const end = performance.now() + 2000;
    const sample = () => {
      if (two.classList.contains('visible')) window.samples.push([one, two].map((f) => Number(getComputedStyle(f).opacity)).join(' '));
      if (performance.now() < end) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })()`);
  await press(page, 'ArrowRight');
  await page.waitFor('Reveal.getIndices().h === 5', 5000);
  await sleep(1200);
  assert.deepEqual([...new Set(await page.evaluate('window.samples'))], ['0.45 1']);
  assert.deepEqual(page.errors, []);
});

test('a key that does not move the deck leaves the running delay alone', async (t) => {
  const page = await inDelay(t, async (page) => {
    await page.evaluate(`(() => {
      window.times = {};
      Reveal.on('fragmentshown', (ev) => { for (const f of ev.fragments) window.times[f.textContent] = Date.now(); });
    })()`);
    await page.evaluate('Reveal.slide(6)');
    await press(page, 'ArrowRight');
    await wait(page, 500);
    await press(page, 'D');
  }, { slide: 6, shown: ['Slow'] });
  await wait(page, 2000);
  const times = await page.evaluate('window.times');
  assert.ok(Math.abs(times['Slow timed'] - times.Slow - 1000) <= DATE_NOW_SLIP, `the delay of 1000 ms took ${times['Slow timed'] - times.Slow} ms`);
  assert.deepEqual(page.errors, []);
});
