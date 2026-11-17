// checks of the strip bundles of src/bundle.ts on the bundle of test/pages/bundle.html: the faults of
// its JSON script, its states drawn live and in the print view, its compass turned with the camera,
// a strip grown and shrunk, and the bundle turned and its camera written in the editor

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { parseBundle } from '../src/bundle.ts';
import { drag, editorPage } from './helpers/editor.mjs';

const DECK = 'test/pages/bundle.html';
const STATES = ['', 'a', 'a b'];
const bundle = `Beeson.surfaces.find((s) => s.el.matches('[data-bundle]'))`;

test('a bundle that cannot be drawn is reported with the reason', () => {
  assert.match(parseBundle('{'), /malformed/);
  assert.match(parseBundle('{"orbit": [[0, 0, 0]], "strips": []}'), /fewer than three/);
  const orbit = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [{ id: 'a', half_width: 1, ribs: [0], directions: [[0, 0, 1]] }] })), /1 directions for 3 points/);
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [{ id: 'a', half_width: 0, ribs: [0], directions: orbit }] })), /positive half_width/);
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [{ id: 'a', half_width: 1, ribs: [3], directions: orbit }] })), /not a point of the orbit/);
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [], arrows: [{ id: 'Sun', toward: [0, 0] }] })), /arrow Sun/);
  assert.equal(typeof parseBundle(JSON.stringify({ orbit, strips: [] })), 'object');
});

test('a bundle without strips, or with a strip without ribs or with a malformed point, is reported with the reason', () => {
  const orbit = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  assert.match(parseBundle(JSON.stringify({ orbit })), /strips/);
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [{ id: 'a', half_width: 1, directions: orbit }] })), /ribs of the strip a/);
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [{ id: 'a', half_width: 1, ribs: [0], directions: [[0, 0, 1], [0, 0], [0, 0, 1]] }] })), /direction 1 of the strip a/);
  assert.match(parseBundle(JSON.stringify({ orbit: [[0, 0, 0], [1, 0], [0, 1, 0]], strips: [] })), /point 1 of the orbit/);
  assert.match(parseBundle(JSON.stringify({ orbit, libration_point: [0, 0], strips: [] })), /libration_point/);
  assert.match(parseBundle(JSON.stringify({ orbit, strips: [], arrows: { id: 'Sun' } })), /arrows/);
});

// #131: under reduced motion, which is set on the Windows and macOS runners, the deck is drawn
// still, and its bundles are mounted a second time at the start
for (const motion of ['no-preference', 'reduce']) test(`a deck with malformed bundles is started, and each bundle is reported once and left blank (${motion})`, { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
  await page.goto(deckUrl('test/pages/bundle-malformed.html'));
  await page.waitFor(deckSettled);
  const mode = await page.evaluate('document.documentElement.dataset.theme');
  // the keys of the theme are bound after the surfaces and the bundles are mounted
  await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', keyCode: 68, which: 68, bubbles: true }))`);
  await page.waitFor(`document.documentElement.dataset.theme !== '${mode}'`, 5000);
  assert.equal(await page.evaluate(`document.querySelectorAll('.surface[data-bundle] canvas').length`), 0);
  assert.deepEqual(page.errors.map((e) => e.replace(/, since .*/, '')), ['console.error: beeson: the bundle bare is not drawn', 'console.error: beeson: the bundle ribless is not drawn']);
});

// the state of each bundle shown, the share of its canvas that is drawn, a digest of the canvas, and
// the opacities of the labels of the strip a and of the Sun, on the slide or on each page in print
const shown = `Promise.all([...document.querySelectorAll('.surface[data-bundle]')].filter((s) => s.getClientRects().length).map(async (s) => {
  const canvas = s.querySelector('canvas'), ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let drawn = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) drawn++;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const label = Number(s.querySelector('.label[data-at="a"]').style.opacity);
  const sun = Number(s.querySelector('.label[data-at="Sun"]').style.opacity);
  return { state: s.dataset.shown, drawn: drawn / (data.length / 4), digest: [...digest.slice(0, 8)].join('.'), label, sun };
}))`;

// with the camera at the azimuth az in degrees: the length of the needle of the Sun, its angle in
// degrees from the direction of the Sun in the scene, whether the canvas is drawn halfway along the
// needle, and the distances from the middle of the compass to the tip and to the label
const compass = (az) => `(() => {
  const b = ${bundle};
  b.azimuth = ${az} * Math.PI / 180;
  b.draw();
  const { needle: [m, t], scene: [a, c] } = b.probe().arrows.find((r) => r.id === 'Sun');
  const turn = Math.atan2(t[1] - m[1], t[0] - m[0]) - Math.atan2(c[1] - a[1], c[0] - a[0]);
  const canvas = b.el.querySelector('canvas'), k = canvas.width / b.el.offsetWidth;
  const px = canvas.getContext('2d').getImageData(Math.round((k * (m[0] + t[0])) / 2) - 1, Math.round((k * (m[1] + t[1])) / 2) - 1, 3, 3).data;
  const lab = b.el.querySelector('.label[data-at="Sun"]');
  return {
    length: Math.hypot(t[0] - m[0], t[1] - m[1]),
    angle: (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) * 180) / Math.PI,
    drawn: px.some((v, i) => i % 4 === 3 && v > 0),
    label: Math.hypot(parseFloat(lab.style.left) - m[0], parseFloat(lab.style.top) - m[1]),
  };
})()`;

// the WebGL context of the renderer of the surfaces, kept in window.gl when it is created, as the
// renderer is not exposed by the theme
const KEEP_GL = `const get = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
  const c = get.call(this, type, ...rest);
  if (c && /webgl/.test(type)) window.gl = c;
  return c;
};`;

// the share of the canvas of the bundle that is drawn
const share = `(() => {
  const canvas = document.querySelector('.surface[data-bundle] canvas');
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n / (data.length / 4);
})()`;

// the share of the image of WebGL that is drawn, without the compass, which is drawn in 2D over it.
// the bundle is drawn again, and the image is read in the same task, before WebGL clears it
const webgl = `(() => {
  ${bundle}.draw();
  const gl = window.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4 * w * h);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
  return n / (w * h);
})()`;

// waits until the context of WebGL is not lost, and for a frame after its restore, in which the
// surfaces are drawn again. on a crowded runner, the context may be lost under the load
const live = (page) => page.evaluate(`new Promise((done) => {
  if (!window.gl || !window.gl.isContextLost()) return done();
  window.gl.canvas.addEventListener('webglcontextrestored', () => requestAnimationFrame(() => done()), { once: true });
})`);

test('a bundle is drawn at each of its states, live and in the print view, with its compass toward its arrow', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());

  const page = await browser.newPage();
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: KEEP_GL });
  await page.goto(deckUrl(DECK, 'still'));
  await page.waitFor(deckSettled);
  const states = [];
  for (let f = -1; f <= 1; f++) {
    await page.evaluate(`Reveal.slide(0, 0, ${f})`);
    await live(page);
    const [s] = await page.evaluate(shown);
    states.push({ ...s, webgl: await page.evaluate(webgl) });
  }
  assert.deepEqual(page.errors, []);
  assert.deepEqual(states.map((s) => s.state), STATES);
  // the orbit is drawn before any strip, and more of the canvas is drawn with each strip
  const at = (state) => states.find((s) => s.state === state);
  assert.ok(at('').webgl > 0.002, `${(100 * at('').webgl).toFixed(2)}% of the image of WebGL is drawn without a strip`);
  assert.ok(at('a').webgl > at('').webgl + 0.01 && at('a b').webgl > at('a').webgl, JSON.stringify(states));
  assert.ok(at('a').drawn > at('').drawn + 0.01 && at('a b').drawn > at('a').drawn, JSON.stringify(states));
  assert.equal(new Set(states.map((s) => s.digest)).size, STATES.length);
  assert.deepEqual(states.map((s) => s.label), [0, 1, 1]);
  assert.ok(states.every((s) => s.sun === 1), 'the label of the Sun is shown at every step');

  // the needle is drawn toward the Sun of the scene, within the error of the perspective, and its
  // label is past its tip, at four turns of the camera
  for (const az of [-60, 30, 120, 210]) {
    const c = await page.evaluate(compass(az));
    assert.ok(c.length > 20 && c.angle < 5 && c.drawn, `at the azimuth ${az}, the needle is ${JSON.stringify(c)}`);
    assert.ok(c.label > c.length, `at the azimuth ${az}, the label is ${c.label} from the middle of the compass, and the tip ${c.length}`);
  }

  const print = await browser.newPage();
  await print.send('Page.addScriptToEvaluateOnNewDocument', { source: KEEP_GL });
  await printView(print, deckUrl(DECK, 'print-pdf&still'));
  await live(print);
  const pages = await print.evaluate(shown);
  assert.deepEqual(print.errors, []);
  // the step added after the last one, which restores the dimmed steps, is printed at the same state
  assert.deepEqual(pages.map((s) => s.state).filter((state, i, all) => state !== all[i - 1]), STATES);
  for (const s of pages) {
    assert.ok(Math.abs(s.drawn - at(s.state).drawn) < 0.002, `a page at the state "${s.state}" is drawn over ${s.drawn}, and the slide over ${at(s.state).drawn}`);
  }
});

// the strip a at each frame of the page from the step on, until the bundle has settled
const sample = (step) => `new Promise((done) => {
  const b = ${bundle}, seen = [];
  ${step};
  const frame = () => {
    const p = b.probe();
    seen.push(p.strips[0]);
    if (p.settled) done({ seen, last: p });
    else requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})`;

// a context of WebGL is lost, e.g. at a reset of the GPU or under a heavy load, and the browser
// restores it later. the strips shown at a step taken meanwhile are drawn once it is restored
test('a bundle is drawn again when the context of WebGL is restored, at the state of a step taken while it was lost', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: KEEP_GL });
  await page.goto(deckUrl(DECK, 'still'));
  await page.waitFor(deckSettled);
  const base = await page.evaluate(share);
  await page.evaluate(`new Promise((done) => {
    window.gl.canvas.addEventListener('webglcontextlost', () => done(), { once: true });
    window.lose = window.gl.getExtension('WEBGL_lose_context');
    window.lose.loseContext();
  })`);
  await page.evaluate('Reveal.slide(0, 0, 0)');
  await page.evaluate(`new Promise((done) => {
    window.gl.canvas.addEventListener('webglcontextrestored', () => requestAnimationFrame(() => done()), { once: true });
    window.lose.restoreContext();
  })`);
  const restored = await page.evaluate(share);
  assert.equal(await page.evaluate(`${bundle}.el.dataset.shown`), 'a');
  assert.ok(restored > base + 0.01, `${(100 * restored).toFixed(2)}% of the canvas is drawn at the strip a after the restore, and ${(100 * base).toFixed(2)}% without a strip`);
  assert.deepEqual(page.errors, []);
});

// at a crash of the GPU process, as on a crowded runner of Windows, the context is restored by the
// browser, and a bundle is then drawn on its canvas as before the crash
test('a bundle is drawn after a crash of the GPU process, at a step taken once the context is restored', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: KEEP_GL });
  await page.goto(deckUrl(DECK, 'still'));
  await page.waitFor(deckSettled);
  const base = await page.evaluate(share);
  await page.evaluate(`window.gl.canvas.addEventListener('webglcontextrestored', () => { window.restored = true; }, { once: true })`);
  await page.send('Browser.crashGpuProcess');
  await page.waitFor('window.restored === true');
  await page.evaluate('Reveal.slide(0, 0, 0)');
  await page.evaluate('new Promise((done) => requestAnimationFrame(() => done()))');
  const drawn = await page.evaluate(share);
  assert.equal(await page.evaluate(`${bundle}.el.dataset.shown`), 'a');
  assert.ok(drawn > base + 0.01, `${(100 * drawn).toFixed(2)}% of the canvas is drawn at the strip a after the crash, and ${(100 * base).toFixed(2)}% without a strip before it`);
  assert.deepEqual(page.errors, []);
});

test('a strip is grown from its first segment to its last and then as a sheet, and shrunk back', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ motion: true });
  await page.goto(deckUrl(DECK));
  await page.waitFor(deckSettled);

  const grown = await page.evaluate(sample('Reveal.next()'));
  assert.equal(grown.last.state, 'a');
  const growing = grown.seen.filter((r) => r.grow > 0 && r.grow < 1);
  assert.ok(growing.length >= 5, `the growth was seen at ${growing.length} frames`);
  for (const r of growing) {
    // a later segment is never ahead of an earlier one, and the sheet waits for the last segment
    r.ribs.forEach((g, k) => k && assert.ok(g <= r.ribs[k - 1] + 1e-12, `the segment ${k} is at ${g} and the one before at ${r.ribs[k - 1]}`));
    if (r.sheet > 0) assert.equal(r.ribs.at(-1), 1);
  }
  assert.ok(growing.some((r) => r.ribs[0] === 1 && r.ribs.at(-1) < 1), 'the segments are grown one after another');
  assert.deepEqual(grown.last.strips.map((r) => r.grow), [1, 0]);

  const shrunk = await page.evaluate(sample('Reveal.prev()'));
  assert.equal(shrunk.last.state, '');
  assert.ok(shrunk.seen.some((r) => r.grow > 0 && r.grow < 1), 'the strip is shrunk over several frames');
  assert.deepEqual(shrunk.last.strips.map((r) => r.grow), [0, 0]);
  assert.deepEqual(page.errors, []);
});

test('a bundle is turned by a drag in the editor, shown in the Surface pane without heights, and its camera is written by Use Current View', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser, { deck: DECK });
  if (!(await page.evaluate(`window.BeesonEditor.state('shell.format')`)).checked) await page.evaluate(`window.BeesonEditor.exec('shell.format')`);
  const camera = () => page.evaluate(`${bundle}.view()`);
  assert.deepEqual((await camera()).written, { azimuth: -60, elevation: 32, zoom: 1, turn: 90, zscale: 1 });
  await drag(page, '.surface[data-bundle]', { dx: 80, dy: 30 });
  const turned = await camera();
  assert.ok(Math.abs(turned.azimuth + 60) > 10, `the azimuth is ${turned.azimuth}`);
  assert.ok(turned.elevation > 32, `the elevation is ${turned.elevation}`);
  const PANES = '#beeson-edit-panel-format .ed-panes';
  await page.waitFor(`document.querySelector('${PANES}')?.dataset.pane === 'surface'`);
  const sections = await page.evaluate(`[...document.querySelectorAll('${PANES} .ed-sec > h5')].map((h) => h.textContent)`);
  assert.ok(sections.includes('Camera') && !sections.includes('Heights'), JSON.stringify(sections));
  await page.evaluate(`window.BeesonEditor.exec('surface.useView')`);
  const az = Math.round(turned.azimuth), el = Math.round(turned.elevation);
  await page.waitFor(`window.BeesonEditor.render().includes('<div class="surface" data-bundle="ring" data-azimuth="${az}" data-elevation="${el}">')`);
  assert.deepEqual(page.errors, []);
});
