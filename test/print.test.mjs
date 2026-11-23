import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';

function pageImages(pdf) {
  const text = pdf.toString('latin1');
  const objects = new Map();
  for (const m of text.matchAll(/(\d+) 0 obj\b(.*?)(stream\r?\n|endobj)/gs)) {
    objects.set(m[1], { dictionary: m[2], start: m.index + m[0].length });
  }
  const image = (id) => {
    const { dictionary, start } = objects.get(id);
    if (!/\/Subtype \/Image/.test(dictionary)) return null;
    const [width, height, length] = ['Width', 'Height', 'Length'].map((key) => Number(dictionary.match(`/${key} (\\d+)`)[1]));
    const data = inflateSync(pdf.subarray(start, start + length));
    const colors = new Set();
    for (let i = 0; i + 2 < data.length; i += 3) colors.add(data.readUIntBE(i, 3));
    return { width, height, colors: colors.size };
  };
  const pages = (id) => {
    const { dictionary } = objects.get(id);
    const kids = dictionary.match(/\/Kids \[(.*?)\]/s);
    if (kids) return [...kids[1].matchAll(/(\d+) 0 R/g)].flatMap(([, kid]) => pages(kid));
    const table = dictionary.match(/\/XObject <<(.*?)>>/s)?.[1] ?? '';
    return [[...table.matchAll(/\/\w+ (\d+) 0 R/g)].map(([, object]) => image(object)).filter(Boolean)];
  };
  return pages(text.match(/\/Pages (\d+) 0 R/)[1]);
}

const PRINT = 300000;

test('a video without a poster is printed with its frame on every step', { timeout: PRINT }, async (t) => {
  const server = await serve('.', { delay: (path) => (path.endsWith('.mp4') ? 1500 : 0) });
  const browser = await launch({ offline: false });
  t.after(async () => {
    await browser.close();
    server.close();
  });
  const page = await browser.newPage();
  await printView(page, `${server.origin}/test/pages/video-steps.html?print-pdf&still`);

  const [width, height] = await page.evaluate(`[document.querySelector('video').videoWidth, document.querySelector('video').videoHeight]`);
  const frames = pageImages(await page.pdf()).map((images) => images.filter((i) => i.width === width && i.height === height).length);

  assert.deepEqual(frames, [1, 1, 1, 1]);
});

test('the videos of the print view are loaded again one after the other', { timeout: PRINT }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await printView(page, deckUrl('test/pages/video-steps.html', 'print-pdf&still'));

  assert.equal(await page.evaluate(`document.querySelectorAll('video').length`), 4);
  assert.equal(await page.evaluate(`window.loadedAtOnce`), 1);
});

test('a tycho viewer is printed with its scene', { timeout: PRINT }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await printView(page, deckUrl('test-deck.html', 'print-pdf&still'));
  const step = await page.evaluate(`[...document.querySelectorAll('.pdf-page')]
    .findIndex((p) => p.querySelector('h2')?.textContent === 'Embedding TyCHO scenes')`);

  const images = pageImages(await page.pdf())[step];

  const scene = images.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
  assert.ok(scene.colors > 100, `the largest image of the page has ${scene.colors} colors, and it is ${scene.width} by ${scene.height}`);
});

test('a tycho viewer is printed with its scene on every step of its slide', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await printView(page, deckUrl('test/pages/viewer-steps.html', 'print-pdf&still'));

  const stills = await page.evaluate(`[...document.querySelectorAll('.pdf-page')].map((p) => {
    const image = p.querySelector('img[alt="A still of a tycho scene"]');
    if (!image) return null;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) painted++;
    return { width: image.naturalWidth, height: image.naturalHeight, painted };
  })`);

  assert.equal(stills.length, 19);
  const empty = stills.map((still, i) => [i + 1, still]).filter(([, still]) => !still || still.painted < still.width * still.height);
  assert.deepEqual(empty, []);
  assert.equal(new Set(stills.map((still) => `${still.width}x${still.height}`)).size, 1, 'the still has one size on every step');
});

test('a slide with a picture past its bottom is printed on one page', { timeout: PRINT }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await printView(page, deckUrl('test/pages/print-past-bottom.html', 'print-pdf&still'));

  const pages = pageImages(await page.pdf()).length;

  assert.equal(pages, 3, `the PDF of three slides has ${pages} pages`);
  const foot = await page.evaluate(`(() => {
    const last = document.querySelectorAll('.pdf-page')[2];
    const p = last.getBoundingClientRect();
    const f = last.querySelector('.foot').getBoundingClientRect();
    return { inside: f.top >= p.top && f.bottom <= p.bottom, height: f.height };
  })()`);
  assert.ok(foot.height > 0 && foot.inside, 'the footnote of the last slide is cut');
});

test('a page of the print view is numbered as its slide is in the deck', { timeout: PRINT }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const deck = 'test/pages/print-numbers.html';
  await page.goto(deckUrl(deck, 'still'));
  await page.waitFor(`!!window.Reveal?.isReady()`);
  const shown = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('.reveal .slides > section')].map((slide) => {
      window.Reveal.slide(window.Reveal.getIndices(slide).h);
      return [slide.querySelector('h1, h2').textContent, document.querySelector('.slide-number').textContent.replace(/\\s+/g, '')];
    }))`);
  await printView(page, deckUrl(deck, 'print-pdf&still'));

  const printed = await page.evaluate(`[...document.querySelectorAll('.pdf-page')].map((p) =>
    [p.querySelector('h1, h2').textContent, p.querySelector('.slide-number-pdf')?.textContent.replace(/\\s+/g, '') ?? ''])`);

  assert.deepEqual(printed, [
    ['Title', ''],
    ['Steps', '1/2'], ['Steps', '1/2'], ['Steps', '1/2'], ['Steps', '1/2'],
    ['Section', ''],
    ['Plain', '2/2'],
    ['Closing', ''],
    ['Appendix one', 'A1'],
    ['Appendix two', 'A2'],
  ]);
  assert.deepEqual(printed.map(([heading, number]) => [heading, shown[heading]]), printed);
});

test('the check fails on a video without a poster', () => {
  const out = mkdtempSync(join(tmpdir(), 'beeson-poster-'));
  try {
    const run = spawnSync(process.execPath, ['scripts/check.mjs', '--deck', 'test/pages/video-steps.html', '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /video without a poster: \.\.\/\.\.\/demo\/clip-dark\.mp4/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the check reads the heads of a backdrop that is a step', { timeout: 120000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'beeson-heads-'));
  try {
    const run = spawnSync(process.execPath, ['scripts/check.mjs', '--deck', 'test/pages/title-step.html', '--out', out], { encoding: 'utf8' });
    assert.doesNotMatch(run.stdout + run.stderr, /heads are not painted/);
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

for (const [page, lost] of [['once', false], ['never', true]]) test(`the check opens a slide again when its first open has no WebGL, and reports a viewer that has no WebGL at the second open either: ${page}`, { timeout: 180000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'beeson-webgl-'));
  try {
    const run = spawnSync(process.execPath, ['scripts/check.mjs', '--deck', `test/pages/viewer-webgl-${page}.html`, '--themes', 'dark', '--out', out], { encoding: 'utf8' });
    if (lost) {
      assert.equal(run.status, 1, run.stdout + run.stderr);
      assert.match(run.stderr, /dark-01\.png \(#\/0\/0\): WebGL is not available/);
    } else assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
