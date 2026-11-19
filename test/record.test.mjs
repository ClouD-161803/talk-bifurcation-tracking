import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { recorder } from '../scripts/record.mjs';

const DECK = 'test/pages/record.html';
const FPS = 60;

const VIDEO = { mean: 1.5, max: 192, few: 0.08 };
const LAYERS = { mean: 0.005, max: 160, few: 0.0001 };

let browser, page, rec;
let title;

const LAB = `window.lab = (() => {
  const bytes = (b64) => {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  };
  const image = (b64) => createImageBitmap(new Blob([bytes(b64)], { type: 'image/png' }));
  const pixels = (draw, w, h) => {
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    draw(x);
    return x.getImageData(0, 0, w, h).data;
  };
  const stats = (a, b) => {
    let max = 0, sum = 0, few = 0;
    for (let i = 0; i < a.length; i += 4) {
      let m = 0;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a[i + c] - b[i + c]);
        sum += d;
        if (d > m) m = d;
      }
      if (m > max) max = m;
      if (m > 8) few++;
    }
    const n = a.length / 4;
    return { mean: sum / (3 * n), max, few: few / n };
  };
  return {
    async size(b64) {
      const i = await image(b64);
      return [i.width, i.height];
    },
    async hash(b64) {
      const i = await image(b64);
      const data = pixels((x) => x.drawImage(i, 0, 0), i.width, i.height);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
    async compare(first, second) {
      const [a, b] = await Promise.all([image(first), image(second)]);
      return stats(pixels((x) => x.drawImage(a, 0, 0), a.width, a.height), pixels((x) => x.drawImage(b, 0, 0), a.width, a.height));
    },
    async layers(still, top, shot) {
      const [s, t, o] = await Promise.all([image(still), image(top), image(shot)]);
      const a = pixels((x) => { x.drawImage(s, 0, 0); x.drawImage(t, 0, 0); }, o.width, o.height);
      return stats(a, pixels((x) => x.drawImage(o, 0, 0), o.width, o.height));
    },
    async video(mp4, frames) {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([bytes(mp4)], { type: 'video/mp4' }));
      await new Promise((done, fail) => { v.onloadeddata = done; v.onerror = () => fail(new Error(v.error?.message)); });
      const out = { width: v.videoWidth, height: v.videoHeight, duration: v.duration, frames: [] };
      for (const { time, png } of frames) {
        v.currentTime = time;
        await new Promise((done) => { v.onseeked = done; });
        const o = await image(png);
        const a = pixels((x) => x.drawImage(v, 0, 0, o.width, o.height), o.width, o.height);
        out.frames.push(stats(a, pixels((x) => x.drawImage(o, 0, 0), o.width, o.height)));
      }
      return out;
    },
  };
})()`;

const b64 = (buffer) => buffer.toString('base64');

async function stepsOf(name, p = page) {
  const names = await p.evaluate(`[...document.querySelectorAll('.pdf-page')].map((p) => p.querySelector('h1, h2')?.textContent ?? '')`);
  const steps = names.flatMap((n, i) => (n === name ? [i] : []));
  assert.ok(steps.length, `no step of ${name}`);
  return steps;
}

async function shot(i, p = page) {
  const y = await p.evaluate(`window.scrollY + document.querySelectorAll('.pdf-page')[${i}].getBoundingClientRect().top`);
  await p.evaluate(`window.scrollTo(0, ${y})`);
  await p.waitFor(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))`);
  return p.screenshot({ x: 0, y, width: 1920, height: 1080, scale: 1 });
}

async function layers(name, { still, tops }, p = page) {
  const steps = await stepsOf(name, p);
  assert.equal(tops.length, steps.length);
  for (const [k, i] of steps.entries()) {
    assert.deepEqual(await page.evaluate(`lab.size(${JSON.stringify(b64(tops[k]))})`), [3840, 2160]);
    const s = await page.evaluate(`lab.layers(${JSON.stringify(b64(still))}, ${JSON.stringify(b64(tops[k]))}, ${JSON.stringify(b64(await shot(i, p)))})`);
    console.log(name, 'step', k, JSON.stringify(s));
    assert.ok(s.mean <= LAYERS.mean && s.max <= LAYERS.max && s.few <= LAYERS.few, `${name}, step ${k}: ${JSON.stringify(s)}`);
  }
}

async function record(p, steps, options, limit = 100_000) {
  let last = null;
  const traced = new Proxy(p, {
    get(target, key) {
      const value = target[key];
      if (typeof value !== 'function') return value;
      return (...args) => {
        last = { call: `${String(key)}(${JSON.stringify(args[0] ?? '').slice(0, 80)})`, at: performance.now() };
        return value.apply(target, args);
      };
    },
  });
  let timer;
  const hang = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(`the recording hangs at ${last?.call}, called ${last ? ((performance.now() - last.at) / 1000).toFixed(1) : '?'} s ago`)), limit);
  });
  try {
    return await Promise.race([rec.record(traced, steps, options), hang]);
  } finally {
    clearTimeout(timer);
  }
}

let edges;
async function edgesPage() {
  if (!edges) {
    edges = await browser.newPage({ scale: 2 });
    await printView(edges, deckUrl('test/pages/record-edges.html', 'print-pdf&still&pdfPageHeightOffset=0'));
  }
  return edges;
}

before(async () => {
  browser = await launch({ wholeFrames: true });
  page = await browser.newPage({ scale: 2 });
  await printView(page, deckUrl(DECK, 'print-pdf&still&pdfPageHeightOffset=0'));
  await page.evaluate(LAB);
  rec = await recorder(browser, { fps: FPS, scale: 2 });
  const steps = await stepsOf('A title with steps');
  title = await record(page, steps, { keep: [0, 30, 'last'] }, 280_000);
}, { timeout: 300000 });

after(async () => {
  await browser?.close();
});

test('a backdrop is reported live at the steps where the deck traces it', { timeout: 60000 }, async () => {
  const live = await rec.live(page);
  const at = async (name) => (await stepsOf(name)).map((i) => live[i]);
  assert.deepEqual(await at('A title with steps'), [[0], [0], [0], [0]]);
  assert.deepEqual(await at('A closing slide'), [[0]]);
  assert.deepEqual(await at('A loop'), [[0]]);
  assert.deepEqual(await at('A trace that is a step'), [[], [0]]);
  assert.deepEqual(await at('A still backdrop that is a step'), [[], []]);
  assert.deepEqual(await at('Two traces from two steps'), [[0], [0, 1]]);
});

test('a recording of a trace ends with its last frame, the still', { timeout: 60000 }, () => {
  const { recording, still, tops } = title;
  assert.equal(recording.frames, FPS + 1);
  assert.equal(recording.duration, (recording.frames * 1000) / FPS);
  assert.equal(recording.loop, false);
  assert.equal(tops.length, 4);
  assert.deepEqual(title.kept.last, still);
  assert.deepEqual(title.kept[0], recording.poster);
});

test('a recording plays in Chrome with the composed frames', { timeout: 120000 }, async () => {
  const { recording, kept } = title;
  const result = await page.evaluate(`lab.video(${JSON.stringify(b64(recording.data))}, ${JSON.stringify([
    { time: 0.5 / FPS, png: b64(kept[0]) },
    { time: 30.5 / FPS, png: b64(kept[30]) },
  ])})`);
  assert.equal(result.width, 3840);
  assert.equal(result.height, 2160);
  assert.ok(Math.abs(result.duration - recording.frames / FPS) < 1e-3, `duration ${result.duration}`);
  console.log('video against composed frames', JSON.stringify(result.frames));
  for (const s of result.frames) {
    assert.ok(s.mean <= VIDEO.mean && s.max <= VIDEO.max && s.few <= VIDEO.few, JSON.stringify(s));
  }
});

test('two recordings of one backdrop give the same frames', { timeout: 120000 }, async () => {
  const again = await record(page, await stepsOf('A title with steps'), { keep: [0, 30, 'last'] });
  for (const k of [0, 30, 'last']) {
    const s = await page.evaluate(`lab.compare(${JSON.stringify(b64(title.kept[k]))}, ${JSON.stringify(b64(again.kept[k]))})`);
    assert.ok(s.max <= 4 && s.few === 0, `frame ${k}: ${JSON.stringify(s)}`);
  }
});

test('the still with the picture of the words of a step is the step of the print view', { timeout: 300000 }, async () => {
  const slides = [['A title with steps', title]];
  for (const name of ['A closing slide', 'Two traces from two steps']) slides.push([name, await record(page, await stepsOf(name), {}, 140_000)]);
  for (const [name, result] of slides) await layers(name, result);
});

test('a loop is recorded over one period', { timeout: 120000 }, async () => {
  const loop = await record(page, await stepsOf('A loop'), { keep: [0, 'end'] });
  assert.equal(loop.recording.loop, true);
  assert.equal(loop.recording.frames, 9 * FPS);
  const [a, b] = await page.evaluate(`Promise.all([lab.hash(${JSON.stringify(b64(loop.kept[0]))}), lab.hash(${JSON.stringify(b64(loop.kept.end))})])`);
  assert.equal(a, b);
});

test('a backdrop that is a step is recorded from its step', { timeout: 120000 }, async () => {
  const steps = await stepsOf('A trace that is a step');
  await assert.rejects(record(page, steps), /does not trace a backdrop/);
  const { recording, tops } = await record(page, steps.slice(1));
  assert.equal(recording.frames, FPS + 1);
  assert.equal(tops.length, 1);
});

test('a traced backdrop that is not drawn is not live, and its slide is not recorded', { timeout: 120000 }, async () => {
  const p = await edgesPage();
  const steps = await stepsOf('A backdrop that is not drawn', p);
  const live = await rec.live(p);
  assert.deepEqual(steps.map((i) => live[i]), [[]]);
  await assert.rejects(record(p, steps), /does not trace a backdrop/);
});

test('a step that adds an element to its page keeps the elements under a recorded backdrop under it', { timeout: 120000 }, async () => {
  const p = await edgesPage();
  const name = 'A plot stepped over a trace';
  const counts = await p.evaluate(`[...document.querySelectorAll('.pdf-page')].map((p) => p.querySelectorAll('*').length)`);
  const steps = await stepsOf(name, p);
  assert.notEqual(counts[steps[0]], counts[steps[1]]);
  await layers(name, await record(p, steps), p);
});

test('an error of the encoder is reported with its reason and the option --still', { timeout: 120000 }, async (t) => {
  await page.evaluate(`(() => {
    const Real = window.VideoEncoder;
    window.__realEncoder = Real;
    window.VideoEncoder = class extends Real {
      constructor(init) {
        super(init);
        this.fail = init.error;
        this.count = 0;
      }
      encode(frame, options) {
        super.encode(frame, options);
        if (++this.count === 1) setTimeout(() => { this.close(); this.fail(new DOMException('the stub failed', 'EncodingError')); }, 0);
      }
    };
    return true;
  })()`);
  t.after(() => page.evaluate(`(window.VideoEncoder = window.__realEncoder, delete window.__realEncoder)`));
  await assert.rejects(record(page, await stepsOf('A closing slide')), (e) => {
    assert.match(e.message, /EncodingError: the stub failed/);
    assert.match(e.message, /--still/);
    return true;
  });
});

test('a recording leaves the print view as it was, without an error in the page', async () => {
  const state = await page.evaluate(`({
    classes: document.documentElement.className,
    marked: document.querySelectorAll('[data-rec]').length,
    done: Beeson.backdrops.every((o) => o.done || !o.el.isConnected),
    now: performance.now === Performance.prototype.now,
  })`);
  assert.doesNotMatch(state.classes, /\brec-/);
  assert.equal(state.marked, 0);
  assert.ok(state.done);
  assert.ok(state.now);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(edges?.errors ?? [], []);
});

const stubbed = (supported) => ({
  async newPage(options) {
    const p = await browser.newPage(options);
    await p.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if (window.VideoEncoder) VideoEncoder.isConfigSupported = async (config) => ({ supported: (${supported})(config), config })`,
    });
    return p;
  },
});

test('the software encoder is asked for first, and the encoder of the system after it', { timeout: 60000 }, async () => {
  assert.equal(rec.acceleration, 'prefer-software');
  const hardware = await recorder(stubbed(`(config) => config.hardwareAcceleration !== 'prefer-software'`), { fps: FPS, scale: 2 });
  assert.equal(hardware.acceleration, 'no-preference');
});

test('a browser that does not encode H.264 at 3840 by 2160 px is refused, with the option --still', { timeout: 60000 }, async () => {
  await assert.rejects(recorder(stubbed(`() => false`), { fps: FPS, scale: 2 }), /--still/);
});
