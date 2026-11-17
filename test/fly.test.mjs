// checks of the fly of src/fly.ts, i.e. an element moved by its step from the box of a source to its
// own box, in a test deck in Chrome, played and drawn still

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';

const probe = `(() => {
  const box = document.getElementById('box');
  return { transform: getComputedStyle(box).transform, transition: box.style.transition, origin: box.style.transformOrigin,
    held: document.getElementById('before').hasAttribute('data-held') };
})()`;

test('a step flies its element in from the box of its source and then clears the transition, and a step with data-focus holds every step shown', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ motion: true });
  await page.goto(deckUrl('test/pages/fly.html'));
  await page.waitFor(deckSettled);

  await page.evaluate('Reveal.next()');
  await page.evaluate('Reveal.next()');
  const flying = await page.evaluate(probe);
  assert.match(flying.transition, /^transform 0\.5s /);
  assert.notEqual(flying.transform, 'none');
  // the origin is the center of the ring, in pixels of the slide from the corner of the box
  const [x, y] = flying.origin.split(' ').map(parseFloat);
  assert.ok(Math.abs(x - 45) < 0.5 && Math.abs(y - 50) < 0.5, flying.origin);
  assert.equal(flying.held, false);

  await page.waitFor(`${probe}.transition === ''`, 3000);
  const landed = await page.evaluate(probe);
  assert.equal(landed.transform, 'none');
  assert.equal(landed.origin, '');

  await page.evaluate('Reveal.next()');
  assert.equal((await page.evaluate(probe)).held, true);
  await page.evaluate('Reveal.prev()');
  assert.equal((await page.evaluate(probe)).held, false);
  assert.deepEqual(page.errors, []);
});

test('in a deck drawn still, the element of a fly is shown in its place', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ motion: true });
  await page.goto(deckUrl('test/pages/fly.html', 'still'));
  await page.waitFor(deckSettled);
  await page.evaluate('Reveal.next()');
  await page.evaluate('Reveal.next()');
  const shown = await page.evaluate(probe);
  assert.equal(shown.transition, '');
  assert.equal(shown.transform, 'none');
  assert.deepEqual(page.errors, []);
});
