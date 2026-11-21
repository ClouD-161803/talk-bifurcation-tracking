import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';
import { builtIn } from '../src/backdrops.ts';
import { systemOf } from '../src/poincare.ts';
import { ALPHAS, planeOf, shownTori, toriSpec } from '../src/tori.ts';

const boxes = `[...document.querySelectorAll('.backdrop[data-backdrop]')].map((b) => {
  const cs = getComputedStyle(b), px = (name) => parseFloat(cs[name]);
  return {
    name: b.closest('section').querySelector('h1, h2').textContent,
    scene: b.dataset.backdrop, cx: +b.dataset.cx, cy: +b.dataset.cy, half: +b.dataset.half,
    left: px('left'), top: px('top'), width: px('width'), height: px('height'),
  };
})`;

function cuts(box, trajectories) {
  const slide = { width: 1920, height: 1080 };
  const scale = box.height / 2 / box.half,
    found = new Set();
  for (const s of trajectories) {
    for (let i = 0; i < s.pts.length; i += 2) {
      const x = (s.pts[i] - box.cx) * scale + box.width / 2,
        y = -(s.pts[i + 1] - box.cy) * scale + box.height / 2;
      if (x < 0 && box.left > 0) found.add('left');
      if (x > box.width && box.left + box.width < slide.width) found.add('right');
      if (y < 0 && box.top > 0) found.add('top');
      if (y > box.height && box.top + box.height < slide.height) found.add('bottom');
    }
  }
  return [...found].join(' ');
}

const filed = `(async () => {
  const out = [];
  for (const b of Beeson.backdrops.filter((b) => b.el.dataset.trajectories !== undefined)) {
    const section = b.el.closest('section'), { h, v } = Reveal.getIndices(section);
    Reveal.slide(h, v);
    await b.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const cs = getComputedStyle(b.el), px = (name) => parseFloat(cs[name]);
    const box = { ...b.view, left: px('left'), top: px('top'), width: px('width'), height: px('height') };
    const name = section.querySelector('h1, h2, .foot').textContent;
    out.push([name, b.el.dataset.trajectories, b.trajectories.length, (${cuts})(box, b.trajectories)]);
  }
  return out;
})()`;

test('no backdrop is cut at an edge of its box inside the slide', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(deckUrl('test-deck.html', 'still'));
  await page.waitFor(deckSettled);

  const cropped = (await page.evaluate(boxes))
    .map((b) => [b.name, b.builtIn, cuts(b, builtIn(b.builtIn))])
    .filter((b) => b[2]);
  assert.deepEqual(cropped, []);

  const files = await page.evaluate(filed);
  assert.ok(files.length > 0);
  assert.deepEqual(
    files.filter(([, , count, cut]) => !count || cut),
    [],
  );
});

const headPixels = `(() => {
  const b = Beeson.backdrops.find((o) => Reveal.getCurrentSlide().contains(o.el));
  const { width, height } = b.head;
  const data = b.head.getContext('2d').getImageData(0, 0, width, height).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]) n++;
  return [b.raf > 0, n];
})()`;

test('a head is drawn on the path of a spacecraft alone', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ motion: true });
  await page.goto(deckUrl('test-deck.html'));
  await page.waitFor(deckSettled);
  await new Promise((done) => setTimeout(done, 800));
  const [titleRunning, titlePixels] = await page.evaluate(headPixels);
  assert.ok(titleRunning, 'the backdrop of the title slide is traced');
  assert.ok(titlePixels > 5 && titlePixels < 60, `${titlePixels} pixels on the title slide`);

  const slideTo = (selector) => `(() => {
    const { h, v } = Reveal.getIndices(document.querySelector('${selector}').closest('section'));
    Reveal.slide(h, v);
  })()`;
  await page.evaluate(slideTo('.backdrop[data-backdrop="wideRibbon"]'));
  await new Promise((done) => setTimeout(done, 800));
  const [ribbonRunning, ribbonPixels] = await page.evaluate(headPixels);
  assert.ok(ribbonRunning, 'the wide ribbon is traced');
  assert.equal(ribbonPixels, 0);
});

const alphas = (from, to) => `(() => {
  const b = Beeson.backdrops.find((o) => Reveal.getCurrentSlide().contains(o.el));
  const c = document.createElement('canvas');
  c.width = b.base.width;
  c.height = b.base.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(b.base, 0, 0);
  ctx.drawImage(b.head, 0, 0);
  const { data } = ctx.getImageData(0, ${from}, c.width, ${to - from});
  return Array.from({ length: ${to - from} }, (_, r) => Array.from({ length: c.width }, (_, x) => data[4 * (r * c.width + x) + 3]));
})()`;
const outliers = (values) => {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const mode = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  return values.filter((v) => Math.abs(v - mode) > 3).length;
};
const center = (rows) => rows.reduce((best, row, r) => (row.reduce((a, b) => a + b) > rows[best].reduce((a, b) => a + b) ? r : best), 0);

test('a trajectory is traced in one stroke, hence without beads, and its trace ends on its still', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ motion: true });
  await page.goto(deckUrl('test/pages/trace.html'));
  await page.waitFor(deckSettled);
  await page.evaluate('Reveal.slide(1)');
  await new Promise((done) => setTimeout(done, 900));
  const [plain, glowing] = await page.evaluate(`[${alphas(310, 340)}, ${alphas(735, 780)}]`);
  await page.waitFor('Beeson.backdrops[0].done', 10000);
  await new Promise((done) => setTimeout(done, 100));
  const [plainStill, glowingStill] = await page.evaluate(`[${alphas(310, 340)}, ${alphas(735, 780)}]`);

  const row = plain[center(plain)];
  const end = row.findLastIndex((a) => a > 0);
  assert.ok(end > 400 && end < 1600, `the trace has reached x = ${end} px after 0.9 s of 2 s`);
  assert.ok(outliers(row.slice(150, end - 20)) <= 2, `the alpha along the trajectory is off at ${outliers(row.slice(150, end - 20))} pixels`);
  const still = plainStill[center(plainStill)];
  assert.ok(outliers(still.slice(150, 1770)) <= 2, `the alpha along the still is off at ${outliers(still.slice(150, 1770))} pixels`);

  const r = center(glowing) + 4;
  const off = glowing[r].slice(150, glowing[center(glowing)].findLastIndex((a) => a > 0) - 40).map((a, x) => Math.abs(a - glowingStill[r][150 + x]));
  assert.ok(glowing[r][300] > 0, 'the glow is drawn 4 px off the trajectory');
  assert.ok(Math.max(...off) <= 3, `the glow during the trace is off its still by up to ${Math.max(...off)}`);

  const changed = await page.evaluate(`(() => {
    const b = Beeson.backdrops[0], ctx = b.base.getContext('2d');
    const before = ctx.getImageData(0, 0, b.base.width, b.base.height).data;
    b.redraw();
    const after = ctx.getImageData(0, 0, b.base.width, b.base.height).data;
    let n = 0;
    for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > 1) n++;
    return n;
  })()`);
  assert.equal(changed, 0);
});

test('the last frame of a trace is its still, with the trajectories overlapped in the order of the file', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ motion: true });
  await page.goto(deckUrl('test/pages/trace.html'));
  await page.waitFor(deckSettled);
  await page.evaluate('Reveal.slide(2)');
  await page.waitFor('Beeson.backdrops.some((o) => Reveal.getCurrentSlide().contains(o.el) && o.trajectories.length === 3 && o.W > 0)');
  const out = await page.evaluate(`(() => {
    const b = Beeson.backdrops.find((o) => Reveal.getCurrentSlide().contains(o.el));
    const read = () => {
      const c = document.createElement('canvas');
      c.width = b.W;
      c.height = b.H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(b.base, 0, 0);
      return ctx.getImageData(0, 0, b.W, b.H).data;
    };
    b.reset();
    b.t0 = 0;
    for (let k = 0; k < 120; k++) b.frame((1000 * k) / 60);
    b.frame(1996);
    const traced = b.finished, last = read();
    b.frame(2001);
    const still = read();
    const premultiplied = (d, i, c) => (c === 3 ? d[i + 3] : (d[i + c] * d[i + 3]) / 255);
    let changed = 0, near = 0;
    for (let i = 0; i < last.length; i += 4) {
      if ([0, 1, 2, 3].every((c) => Math.abs(premultiplied(last, i, c) - premultiplied(still, i, c)) <= 8)) continue;
      const x = (i / 4) % b.W, y = Math.floor(i / 4 / b.W);
      if (Math.hypot(x - 1824, y - 540) < 16) near++;
      else changed++;
    }
    return { traced, finished: b.finished, changed, near };
  })()`);
  assert.equal(out.traced, false, 'the trace is not finished 4 ms before its end');
  assert.equal(out.finished, true);
  assert.equal(out.changed, 0, `${out.changed} pixels away from the head are changed from the last frame to the still`);
  assert.ok(out.near > 0, 'the end of the violet trajectory is drawn in the still');
});

test('the trajectories of a backdrop with data-stagger are started one after another', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ motion: true });
  await page.goto(deckUrl('test-deck.html'));
  await page.waitFor(deckSettled);
  const stagger = await page.evaluate(`(() => {
    const el = document.querySelector('.backdrop[data-stagger]');
    const { h, v } = Reveal.getIndices(el.closest('section'));
    Reveal.slide(h, v);
    return +el.dataset.stagger;
  })()`);
  const staggered = `Beeson.backdrops.find((b) => b.el.hasAttribute('data-stagger'))`;
  await page.waitFor(`${staggered}.idx[0] > 0`);
  await new Promise((done) => setTimeout(done, 1300));
  const started = await page.evaluate(`${staggered}.idx.map((j) => j > 0)`);
  const count = started.filter(Boolean).length;
  assert.deepEqual(started, started.map((_, i) => i < count));
  assert.ok(count >= 2 && count <= Math.ceil(1.6 / stagger) + 1, `${count} of ${started.length} trajectories started`);
});

test('the tint at the pointer is a disc of its radius', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(deckUrl('test/pages/trace.html'));
  await page.waitFor(deckSettled);
  await page.evaluate('Reveal.slide(3)');
  await page.waitFor('Beeson.backdrops.some((o) => Reveal.getCurrentSlide().contains(o.el) && o.W > 0)');
  for (const at of [0, 0.3]) {
    const tint = await page.evaluate(`(() => {
      const b = Beeson.backdrops.find((o) => Reveal.getCurrentSlide().contains(o.el));
      b.complete();
      const box = b.el.getBoundingClientRect();
      b.glow(box.left + (b.X(${at}) / b.W) * box.width, box.top + (b.Y(0) / b.H) * box.height, 30);
      const { x, y, r } = b.pointer;
      const c = document.createElement('canvas');
      c.width = b.W;
      c.height = b.H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(b.head, 0, 0);
      const d = ctx.getImageData(0, 0, b.W, b.H).data;
      let far = 0, left = Infinity, right = -Infinity;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const px = (i / 4) % b.W, py = Math.floor(i / 4 / b.W);
        far = Math.max(far, Math.hypot(px + 0.5 - x, py + 0.5 - y));
        left = Math.min(left, px - x);
        right = Math.max(right, px + 1 - x);
      }
      return { r, far, left, right };
    })()`);
    const where = `with the pointer at x = ${at}, the tint of radius ${tint.r} px`;
    assert.ok(tint.far <= tint.r + 2, `${where} reaches ${tint.far.toFixed(1)} px from the pointer`);
    assert.ok(tint.left <= -tint.r + 2 && tint.right >= tint.r - 2, `${where} runs along the trajectory from ${tint.left} px to ${tint.right} px`);
  }
});

test('a backdrop that is a step is traced from its step on', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ motion: true });
  await page.goto(deckUrl('test/pages/title-step.html'));
  await page.waitFor(deckSettled);
  const state = `(() => {
    const b = Beeson.backdrops[0];
    return { tracing: b.tracing, done: b.done, opacity: getComputedStyle(b.el).opacity };
  })()`;
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  await wait(600);
  assert.deepEqual(await page.evaluate(state), { tracing: false, done: false, opacity: '0' });

  await page.evaluate('Reveal.next()');
  await wait(600);
  assert.deepEqual(await page.evaluate(state), { tracing: true, done: false, opacity: '1' });

  await page.evaluate('Reveal.prev()');
  await wait(600);
  assert.deepEqual(await page.evaluate(state), { tracing: false, done: false, opacity: '0' });
});

test('Beeson.remount, Beeson.preview, and Beeson.fitWindow draw a backdrop for the editor', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(deckUrl('test-deck.html', 'still'));
  await page.waitFor(deckSettled);
  const out = await page.evaluate(`(async () => {
    const el = document.querySelector('.backdrop[data-backdrop="tubes"][data-cx="0.97"]');
    const { h, v } = Reveal.getIndices(el.closest('section'));
    Reveal.slide(h, v);
    const before = Beeson.backdrops.find((b) => b.el === el).trajectories.length;
    el.dataset.backdrop = 'wideRibbon';
    const o = Beeson.remount(el);
    await o.ready;
    const after = Beeson.backdrops.filter((b) => b.el === el);
    const div = document.createElement('div');
    div.style.cssText = 'position: fixed; left: 0; top: 0; width: 192px; height: 108px';
    div.dataset.backdrop = 'tubes';
    div.dataset.half = '0.5';
    div.dataset.cx = '0.97';
    document.body.append(div);
    const p = Beeson.preview(div);
    await p.ready;
    const count = Beeson.backdrops.length;
    const inked = (() => { const c = p.canvases[0], d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })();
    const fitted = await Beeson.fitWindow(el);
    p.destroy();
    return { before, entries: after.length, same: after[0] === o, trajectories: o.trajectories.length, done: o.done, canvases: el.querySelectorAll(':scope > canvas').length, previewIn: Beeson.backdrops.includes(p), count, inked, fitted };
  })()`);
  assert.equal(out.entries, 1);
  assert.equal(out.same, true);
  assert.ok(out.trajectories > out.before, `${out.trajectories} trajectories of wideRibbon, ${out.before} of tubes`);
  assert.equal(out.done, true);
  assert.equal(out.canvases, 2);
  assert.equal(out.previewIn, false);
  assert.ok(out.inked > 100, `${out.inked} pixels of the preview are drawn`);
  assert.ok(out.fitted && out.fitted.half > 0 && Number.isFinite(out.fitted.cx), JSON.stringify(out.fitted));
});

test('a drawing of a file that is taken out of the page before the load is redrawn without an error', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(deckUrl('test-deck.html', 'still'));
  await page.waitFor(deckSettled);
  const out = await page.evaluate(`(async () => {
    const div = document.createElement('div');
    div.style.cssText = 'position: fixed; left: 0; top: 0; width: 192px; height: 108px';
    div.dataset.trajectories = document.querySelector('.backdrop[data-trajectories]').dataset.trajectories;
    document.body.append(div);
    const p = Beeson.preview(div);
    div.remove();
    await p.ready;
    try {
      p.redraw();
    } catch (e) {
      return { trajectories: p.trajectories.length, error: String(e) };
    }
    return { trajectories: p.trajectories.length, error: null };
  })()`);
  assert.ok(out.trajectories > 0, 'the file of the drawing is not loaded');
  assert.equal(out.error, null);
  assert.deepEqual(page.errors, []);
});

const DOTS = 'test/pages/backdrops-dots.html';
const dotted = `(async () => {
  const out = [];
  for (const b of Beeson.backdrops) {
    const { h, v } = Reveal.getIndices(b.el.closest('section'));
    Reveal.slide(h, v);
    await b.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    b.complete();
    const inked = (c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0, edge = 0, sum = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = 4 * (y * c.width + x);
          if (!d[i + 3]) continue;
          n++;
          sum += d[i] + d[i + 1] + d[i + 2];
          if (x < 2 || y < 2 || x >= c.width - 2 || y >= c.height - 2) edge++;
        }
      }
      return { n, edge, tint: n ? Math.round(sum / n) : 0 };
    };
    const c = b.canvases[0];
    const dark = inked(c);
    document.documentElement.dataset.theme = 'light';
    b.redraw();
    const light = inked(c);
    document.documentElement.dataset.theme = 'dark';
    b.redraw();
    out.push({ name: b.el.closest('section').querySelector('h2').textContent, view: b.view, fitted: b.fittedToDrawing, extent: b.extent, span: b.span, period: b.period, done: b.done, canvases: b.el.querySelectorAll(':scope > canvas').length, dark, light });
  }
  return out;
})()`;

test('the tori of data-tori, the system of data-system, and the plane of data-plane are read with their defaults', () => {
  const alphas = ALPHAS.map(Number);
  assert.deepEqual(ALPHAS, ['0.02', '0.04', '0.06', '0.08', '0.10', '0.12', '0.14', '0.16', '0.18', '0.20']);
  assert.deepEqual(shownTori(undefined, alphas), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(shownTori(' ', alphas), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(shownTori('0.10  0.02', alphas), [0, 4]);
  assert.deepEqual(shownTori('0.1 0.5', alphas), [4]);
  assert.deepEqual(shownTori('none', alphas), []);
  assert.equal(toriSpec(alphas.map(() => true)), null);
  assert.equal(toriSpec(alphas.map(() => false)), 'none');
  assert.equal(toriSpec(alphas.map((_, n) => n === 0 || n === 4)), '0.02 0.10');
  for (const shown of [[true, false, true], [false, false, false, false, false, false, false, false, false, true]]) {
    const all = alphas.map((_, n) => !!shown[n]);
    assert.deepEqual(shownTori(toriSpec(all), alphas), all.flatMap((on, n) => (on ? [n] : [])));
  }
  assert.equal(systemOf(undefined), 'earth-moon-l2');
  assert.equal(systemOf('sun-earth-l1'), 'sun-earth-l1');
  assert.equal(systemOf('toString'), 'earth-moon-l2');
  assert.equal(planeOf(undefined), 'xy');
  assert.equal(planeOf('xz'), 'xz');
  assert.equal(planeOf('yz'), 'xy');
});

test('the file of a Poincaré section or of the tori is loaded once, and only by a deck that draws it', { timeout: 60000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const files = `[...document.querySelectorAll('script[src*="/backdrops/"]')].map((s) => s.src.split('/').pop()).sort()`;
  const page = await browser.newPage();
  await page.goto(deckUrl('test-deck.html', 'still'));
  await page.waitFor(deckSettled);
  assert.deepEqual(await page.evaluate(files), []);
  await page.goto(deckUrl(DOTS, 'still'));
  await page.waitFor(deckSettled);
  assert.equal(await page.evaluate('Beeson.backdrops.length'), 6);
  assert.deepEqual(await page.evaluate(files), ['poincare-earth-moon-l2.js', 'poincare-sun-earth-l1.js', 'tori.js']);
  assert.deepEqual(page.errors, []);
});

test('a Poincaré section and the tori are drawn inside their boxes in both modes', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(deckUrl(DOTS, 'still'));
  await page.waitFor(deckSettled);
  const out = await page.evaluate(dotted);
  const [moon, sun, all, one, two, none] = out;
  for (const b of out) {
    assert.equal(b.done, true, b.name);
    assert.equal(b.canvases, 1, b.name);
    assert.equal(b.period, 0, b.name);
    assert.ok(b.dark.n > 0 && b.light.n > 0, `${b.name}: ${b.dark.n} and ${b.light.n} pixels are drawn`);
    assert.notEqual(b.light.tint, b.dark.tint, `${b.name} is drawn in the same colors in both modes`);
  }
  for (const b of [moon, all, one, two, none]) {
    assert.equal(b.fitted, true, b.name);
    assert.equal(b.dark.edge, 0, `${b.name} is cut at an edge of its box`);
    const scale = 540 / b.view.half;
    const slack = Math.min(720 - scale * (b.extent.x1 - b.extent.x0), 1080 - scale * (b.extent.y1 - b.extent.y0));
    assert.ok(slack > 27 && slack < 33, `${b.name}: the drawing is ${slack} px short of its box in the tighter direction`);
  }
  assert.deepEqual(sun.view, { cx: 0.1, cy: 0, half: 2 });
  assert.equal(sun.fitted, false);
  assert.ok(moon.dark.n > 5000, `${moon.dark.n} pixels of the section`);
  assert.ok(all.dark.n > two.dark.n && two.dark.n > 3 * none.dark.n, `${all.dark.n} pixels of ten tori, ${two.dark.n} of one, ${none.dark.n} of none`);
  assert.ok(Math.abs(moon.span - 0.5) < 1e-9 && Math.abs(sun.span - 13) < 1e-9, `${moon.span} ${sun.span}`);
  assert.ok(Math.abs(all.span - 23.1) < 1e-9, `${all.span}`);
  assert.ok(Math.abs(one.span - 14.4) < 1e-9 && Math.abs(none.span - 13.2) < 1e-9, `${one.span} ${none.span}`);
  assert.ok(one.extent.x1 - one.extent.x0 > 3 * (two.extent.x1 - two.extent.x0), 'the plane x, z is not drawn wider than the plane x, y');
  const warnings = await page.evaluate('window.warnings');
  assert.deepEqual(warnings.filter((w) => /data-tori/.test(w)), ['beeson: data-tori="0.5 0.04" is not none or a list of 0.02 to 0.20 in steps of 0.02']);
  assert.deepEqual(page.errors, []);
});

test('a Poincaré section is built up once to its still, and the tori run without end', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ motion: true });
  await page.goto(deckUrl(DOTS));
  await page.waitFor(deckSettled);
  const ink = `((b) => { const c = b.canvases[0]; return c.toDataURL(); })`;
  await page.waitFor('Beeson.backdrops[0].done && !Beeson.backdrops[0].tracing', 30000);
  const built = await page.evaluate(`(() => { const b = Beeson.backdrops[0], traced = ${ink}(b); b.complete(); return traced === ${ink}(b); })()`);
  assert.equal(built, true, 'the last frame of the section is not its still');
  await page.evaluate('Reveal.slide(1)');
  await page.waitFor('Beeson.backdrops[1].done');
  assert.equal(await page.evaluate('Beeson.backdrops[1].tracing'), false, 'a section without data-live is traced');
  await page.evaluate(`(() => {
    Reveal.slide(2);
    const b = Beeson.backdrops[2];
    window.frames = new Set();
    const read = () => { if (b.tracing) window.frames.add(${ink}(b)); if (window.frames.size < 4) requestAnimationFrame(read); };
    requestAnimationFrame(read);
  })()`);
  await page.waitFor('window.frames.size >= 4', 30000);
  assert.deepEqual(await page.evaluate('(({ tracing, done }) => ({ tracing, done }))(Beeson.backdrops[2])'), { tracing: true, done: false });
  await page.evaluate('Reveal.slide(3)');
  await page.waitFor('!Beeson.backdrops[2].tracing');
  assert.deepEqual(page.errors, []);
});
