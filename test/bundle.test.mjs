// checks of the bundles of src/bundle.ts. the eigendirections of data/lyapunov/l1-eigendirections.json
// are checked against their copy in the deck. the bundle of the Floquet slide is stepped in Chrome
// through its stages, live and in the print view, its compass is turned with the camera, and it is
// grown and shrunk with the animation

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { parseBundle } from '../src/bundle.ts';

const FILE = readFileSync('data/lyapunov/l1-eigendirections.json', 'utf8');

test('the eigendirections are unit vectors along a closed orbit, in the same JSON as the block of the deck', () => {
  const data = parseBundle(FILE);
  assert.equal(typeof data, 'object', String(data));
  const block = readFileSync('index.html', 'utf8').match(/<script type="application\/json" id="eigendirections">(.*?)<\/script>/s);
  assert.ok(block, 'the deck has the block id="eigendirections"');
  assert.equal(block[1], FILE.trim());

  // the points are spaced evenly in arclength, also from the last back to the first
  const gaps = data.orbit.map((p, i) => Math.hypot(...p.map((x, k) => data.orbit[(i + 1) % data.orbit.length][k] - x)));
  assert.ok(Math.max(...gaps) / Math.min(...gaps) < 1.05, `the gaps of the orbit run from ${Math.min(...gaps)} to ${Math.max(...gaps)}`);
  assert.deepEqual(data.strips.map((r) => r.id), ['unstable', 'stable']);
  for (const r of data.strips) {
    for (const d of r.directions) assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-4, `a direction of ${r.id} has the norm ${Math.hypot(...d)}`);
  }
  // the two multipliers of the pair off 1 are inverse, since the monodromy matrix is symplectic
  const [unstable, stable] = data.strips.map((r) => r.multiplier);
  assert.ok(unstable > 1 && Math.abs(unstable * stable - 1) < 1e-8, `the multipliers are ${unstable} and ${stable}`);

  // the arrow of the Earth points at x = -mu of the rotating frame, in the drawing centered on L1 and
  // divided by its unit. x of L1 is the root between the two bodies of the balance on the x axis
  const mu = data.mass_ratio;
  const balance = (x) => x - (1 - mu) / (x + mu) ** 2 + mu / (x - 1 + mu) ** 2;
  let [lo, hi] = [-mu + 1e-9, 1 - mu - 1e-9];
  for (let i = 0; i < 100; i++) [lo, hi] = balance((lo + hi) / 2) < 0 ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
  const earth = data.arrows.find((a) => a.id === 'Earth');
  assert.ok(Math.abs(earth.toward[0] - (-mu - lo) / data.unit) < 1e-4 && earth.toward[1] === 0 && earth.toward[2] === 0, `the Earth is drawn at ${earth.toward}`);
});

test('a bundle that cannot be drawn is reported with the reason', () => {
  assert.match(parseBundle('{'), /malformed/);
  assert.match(parseBundle('{"orbit": [[0, 0, 0]], "strips": []}'), /fewer than three/);
  const orbit = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [{ id: 'a', half_width: 1, ribs: [0], directions: [[0, 0, 1]] }] })), /1 directions for 3 points/);
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [{ id: 'a', half_width: 1, ribs: [3], directions: orbit }] })), /not a point of the orbit/);
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [], arrows: [{ id: 'Earth', toward: [0, 0] }] })), /arrow Earth/);
});

// the stage of the bundle, the share of its canvas that is drawn, a digest of the canvas, and the
// opacities of the labels of the unstable strip and of the Earth, on the slide or on each page of
// the slide in print
const bundles = `Promise.all([...document.querySelectorAll('.surface[data-bundle]')].filter((s) => s.getClientRects().length).map(async (s) => {
  const canvas = s.querySelector('canvas'), ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let drawn = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) drawn++;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const label = Number(s.querySelector('.lab[data-at="unstable"]').style.opacity);
  const earth = Number(s.querySelector('.lab[data-at="Earth"]').style.opacity);
  return { stage: s.dataset.shown, drawn: drawn / (data.length / 4), digest: [...digest.slice(0, 8)].join('.'), label, earth };
}))`;

// Reveal.getSlides() leaves out the slides that are not numbered, hence the sections are counted here
const sections = `[...document.querySelectorAll('.reveal .slides > section')]`;
const slideOf = `${sections}.findIndex((s) => s.querySelector('.surface[data-bundle]'))`;
const STAGES = ['', 'unstable', 'unstable stable'];

// with the camera at the azimuth az in degrees: the length of the needle of the Earth, its angle in
// degrees from the direction of the Earth from L1 in the scene, whether the canvas is drawn at its
// middle, and the distances from the middle of the compass to the tip and to the label
const compass = (az) => `(() => {
  const b = Beeson.surfaces.find((s) => s.el.closest('section') === Reveal.getCurrentSlide());
  b.azimuth = ${az} * Math.PI / 180;
  b.draw();
  const { needle: [m, t], scene: [a, c] } = b.probe().arrows.find((r) => r.id === 'Earth');
  const turn = Math.atan2(t[1] - m[1], t[0] - m[0]) - Math.atan2(c[1] - a[1], c[0] - a[0]);
  const canvas = b.el.querySelector('canvas'), k = canvas.width / b.el.offsetWidth;
  const px = canvas.getContext('2d').getImageData(Math.round((k * (m[0] + t[0])) / 2) - 1, Math.round((k * (m[1] + t[1])) / 2) - 1, 3, 3).data;
  const lab = b.el.querySelector('.lab[data-at="Earth"]');
  return {
    length: Math.hypot(t[0] - m[0], t[1] - m[1]),
    angle: (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) * 180) / Math.PI,
    drawn: px.some((v, i) => i % 4 === 3 && v > 0),
    label: Math.hypot(parseFloat(lab.style.left) - m[0], parseFloat(lab.style.top) - m[1]),
  };
})()`;

test('the bundle of the Floquet slide is drawn at each of its stages, live and in the print view', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());

  const page = await browser.newPage();
  await page.goto(deckUrl('index.html', 'still'));
  await page.waitFor(deckSettled);
  const h = await page.evaluate(slideOf);
  assert.ok(h >= 0, 'the deck has a bundle');
  const steps = await page.evaluate(`Math.max(...[...${sections}[${h}].querySelectorAll('[data-fragment-index]')].map((f) => Number(f.dataset.fragmentIndex)))`);
  const live = [];
  for (let f = -1; f <= steps; f++) {
    await page.evaluate(`Reveal.slide(${h}, 0, ${f})`);
    live.push(...(await page.evaluate(bundles)));
  }
  assert.deepEqual(page.errors, []);
  assert.deepEqual([...new Set(live.map((s) => s.stage))], STAGES);
  // the orbit is drawn before any strip, and more of the canvas is drawn with each strip
  const at = (stage) => live.find((s) => s.stage === stage);
  assert.ok(at('').drawn > 0.002, `${(100 * at('').drawn).toFixed(2)}% of the canvas is drawn without a strip`);
  assert.ok(at('unstable').drawn > at('').drawn + 0.02 && at('unstable stable').drawn > at('unstable').drawn);
  assert.equal(new Set(STAGES.map((stage) => at(stage).digest)).size, STAGES.length);
  assert.deepEqual(STAGES.map((stage) => at(stage).label), [0, 1, 1]);
  assert.ok(live.every((s) => s.earth === 1), 'the label of the Earth is shown at every step');

  // the needle is drawn toward the Earth of the scene, within the error of the perspective, and its
  // label is past its tip, at four turns of the camera
  for (const az of [-60, 30, 120, 210]) {
    const c = await page.evaluate(compass(az));
    assert.ok(c.length > 20 && c.angle < 5 && c.drawn, `at the azimuth ${az}, the needle is ${JSON.stringify(c)}`);
    assert.ok(c.label > c.length, `at the azimuth ${az}, the label is ${c.label} from the middle of the compass, and the tip ${c.length}`);
  }

  const print = await browser.newPage();
  await printView(print, deckUrl('index.html', 'print-pdf&still'));
  const pages = await print.evaluate(bundles);
  assert.deepEqual(print.errors, []);
  assert.deepEqual(pages.map((s) => s.stage).filter((stage, i, all) => stage !== all[i - 1]), STAGES);
  assert.ok(pages.every((s) => s.earth === 1), 'the label of the Earth is printed on every page');
  for (const s of pages) {
    assert.ok(Math.abs(s.drawn - at(s.stage).drawn) < 0.002, `a page at the stage "${s.stage}" is drawn over ${s.drawn}, and the slide over ${at(s.stage).drawn}`);
  }
});

test('a strip is grown from its first segment to its last and then as a sheet, and shrunk back', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(deckUrl('index.html'));
  await page.waitFor(deckSettled);
  const h = await page.evaluate(slideOf);
  const probe = `Beeson.surfaces.find((s) => s.el.closest('section') === Reveal.getCurrentSlide()).probe()`;
  const f = await page.evaluate(`Number(${sections}[${h}].querySelector('[data-surface-stage="unstable"]').dataset.fragmentIndex)`);
  await page.evaluate(`Reveal.slide(${h}, 0, ${f - 1})`);
  await page.waitFor(`(${probe}).settled`);

  const seen = [];
  const watch = async (stage) => {
    for (;;) {
      const p = await page.evaluate(probe);
      assert.equal(p.stage, stage);
      seen.push(p.strips[0]);
      if (p.settled) return p;
      await new Promise((done) => setTimeout(done, 100));
    }
  };
  await page.evaluate(`Reveal.slide(${h}, 0, ${f})`);
  const grown = await watch('unstable');
  const growing = seen.filter((r) => r.grow > 0 && r.grow < 1);
  assert.ok(growing.length >= 5, `the growth was seen at ${growing.length} frames`);
  for (const r of growing) {
    // a later segment is never ahead of an earlier one, and the sheet waits for the last segment
    r.ribs.forEach((g, k) => k && assert.ok(g <= r.ribs[k - 1] + 1e-12, `the segment ${k} is at ${g} and the one before at ${r.ribs[k - 1]}`));
    if (r.sheet > 0) assert.equal(r.ribs.at(-1), 1);
  }
  assert.ok(growing.some((r) => r.ribs[0] === 1 && r.ribs.at(-1) < 1), 'the segments are grown one after another');
  assert.deepEqual(grown.strips.map((r) => r.grow), [1, 0]);

  seen.length = 0;
  await page.evaluate(`Reveal.slide(${h}, 0, ${f - 1})`);
  const shrunk = await watch('');
  assert.ok(seen.some((r) => r.grow > 0 && r.grow < 1), 'the strip is shrunk over several frames');
  assert.deepEqual(shrunk.strips.map((r) => r.grow), [0, 0]);
  assert.deepEqual(page.errors, []);
});
