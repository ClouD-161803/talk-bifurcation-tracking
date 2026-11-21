import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { crc32 } from 'node:zlib';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { deckPdfFigures, pdfFigureProblems, renderPdfFigures } from '../scripts/pdf-figures.mjs';
import { hashOf, mapColors, renderHash, tonesOf, withHash } from '../src/pdffigure.ts';

const TONES = tonesOf(readFileSync('theme/beeson.css', 'utf8'));
const PDF = resolve('test/pages/figure.pdf');

test('the tones of each mode are --bg and --text of theme/beeson.css', () => {
  assert.deepEqual(TONES, { dark: { bg: '#050505', text: '#f2f2ef' }, light: { bg: '#faf8f3', text: '#141413' } });
});

test('black is mapped to the text and white to the background of each mode, and the hue is kept in the dark mode', () => {
  const pixels = () => new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 128, 0, 0, 255, 255]);
  const light = pixels();
  mapColors(light, 'light', TONES.light);
  assert.deepEqual([...light.slice(0, 8)], [0x14, 0x14, 0x13, 255, 0xfa, 0xf8, 0xf3, 128]);
  const dark = pixels();
  mapColors(dark, 'dark', TONES.dark);
  assert.deepEqual([...dark.slice(0, 8)], [0xf2, 0xf2, 0xef, 255, 0x05, 0x05, 0x05, 128]);
  const [r, g, b] = dark.slice(8, 11);
  assert.ok(b > r && b > g, `${r} ${g} ${b}`);
  const more = () => new Uint8ClampedArray([255, 0, 0, 255, 128, 128, 128, 255]);
  const darkMore = more();
  mapColors(darkMore, 'dark', TONES.dark);
  assert.deepEqual([...darkMore], [242, 141, 139, 255, 123, 123, 122, 255]);
  const lightMore = more();
  mapColors(lightMore, 'light', TONES.light);
  assert.deepEqual([...lightMore], [250, 20, 19, 255, 135, 134, 131, 255]);
  const own = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 128, 255, 0, 0, 255]);
  mapColors(own, null, null);
  assert.deepEqual([...own], [0, 0, 0, 255, 255, 255, 255, 255, 127, 127, 127, 255, 255, 0, 0, 255]);
});

test('the hash of a render is read back from its PNG, and it changes with the PDF, the page, the mode, and the tones', () => {
  const png = new Uint8Array(readFileSync('demo/figure-light.png'));
  assert.equal(hashOf(png), null);
  const bytes = new Uint8Array(readFileSync(PDF));
  const hash = renderHash(bytes, 1, 'dark', TONES.dark);
  const hashed = withHash(png, hash);
  assert.equal(hashOf(hashed), hash);
  const broken = hashed.slice();
  broken[8 + 25 + 8 + 'beeson-pdf'.length + 1 + hash.length] ^= 1;
  assert.equal(hashOf(broken), null);
  const body = Buffer.concat([Buffer.from('tEXtComment\0'), Buffer.alloc(1 << 20, 'x')]);
  const big = Buffer.alloc(body.length + 8);
  big.writeUInt32BE(body.length - 4, 0);
  body.copy(big, 4);
  big.writeUInt32BE(crc32(body), body.length + 4);
  assert.equal(hashOf(new Uint8Array(Buffer.concat([hashed.subarray(0, 33), big, hashed.subarray(33)]))), hash);
  const others = [renderHash(bytes.slice(1), 1, 'dark', TONES.dark), renderHash(bytes, 2, 'dark', TONES.dark), renderHash(bytes, 1, 'light', TONES.dark), renderHash(bytes, 1, null, null), renderHash(bytes, 1, 'dark', TONES.light)];
  assert.equal(new Set([hash, ...others]).size, 6);
});

test('the PDF figures of a deck are the images with data-pdf, with the mode of their class', () => {
  const html = `<!-- <img src="a.png" data-pdf="x.pdf"> -->
<img class="for-dark fragment" src="a-dark.png" data-pdf="a.pdf" alt="">
<img class='for-light' src="a-light.png" data-pdf="a.pdf" data-page="3">
<img src="b.png" data-pdf="b.pdf" data-page="0">
<img src="c.png">`;
  assert.deepEqual(deckPdfFigures(html), [
    { pdf: 'a.pdf', page: 1, mode: 'dark', src: 'a-dark.png' },
    { pdf: 'a.pdf', page: 3, mode: 'light', src: 'a-light.png' },
    { pdf: 'b.pdf', page: 1, mode: null, src: 'b.png' },
  ]);
});

test('a deck without PDF figures is not checked for them, even with tones that are not #rrggbb', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beeson-pdf-'));
  try {
    mkdirSync(join(dir, 'theme'));
    writeFileSync(join(dir, 'theme', 'beeson.css'), 'html[data-theme="dark"] { --bg: #000; --text: rgb(255 255 255); }');
    const deck = join(dir, 'index.html');
    writeFileSync(deck, '<section><img src="a.png" alt=""></section>');
    assert.deepEqual(pdfFigureProblems(deck), []);
    await renderPdfFigures(deck);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('npm run tex renders a hand-written PDF figure, and npm run check reports it once it is stale', { timeout: 300000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'beeson-pdf-'));
  try {
    mkdirSync(join(dir, 'figures'));
    copyFileSync(PDF, join(dir, 'figures', 'plot.pdf'));
    const deck = join(dir, 'index.html');
    const figure = (page) => `<section><figure class="figure-box">
  <img class="for-dark" src="figures/plot-dark.png" data-pdf="figures/plot.pdf"${page ? ` data-page="${page}"` : ''} alt="A plot">
  <img class="for-light" src="figures/plot-light.png" data-pdf="figures/plot.pdf"${page ? ` data-page="${page}"` : ''} alt="A plot">
  <img src="figures/plot.png" data-pdf="figures/plot.pdf" alt="A plot in its own colors">
  <img src="figures/gone.png" data-pdf="figures/gone.pdf" alt="">
</figure></section>\n`;
    writeFileSync(deck, figure(null));
    assert.deepEqual(pdfFigureProblems(deck), [
      'figures/plot-dark.png is missing, run npm run tex',
      'figures/plot-light.png is missing, run npm run tex',
      'figures/plot.png is missing, run npm run tex',
      'figures/gone.pdf is not found, for the PDF figure figures/gone.png of index.html',
    ]);
    const tex = () => spawnSync(process.execPath, [resolve('scripts/tex.mjs'), deck], { encoding: 'utf8' });
    const run = tex();
    assert.match(run.stdout, /figures\/plot-dark\.png: page 1 of figures\/plot\.pdf, dark/, run.stderr);
    assert.match(run.stdout, /figures\/plot\.png: page 1 of figures\/plot\.pdf, in its own colors/);
    assert.match(run.stdout, /figures\/gone\.pdf is not found/);
    assert.deepEqual(pdfFigureProblems(deck), ['figures/gone.pdf is not found, for the PDF figure figures/gone.png of index.html']);
    const light = readFileSync(join(dir, 'figures', 'plot-light.png'));

    assert.doesNotMatch(tex().stdout, /plot-light\.png: page/);
    assert.deepEqual(readFileSync(join(dir, 'figures', 'plot-light.png')), light);

    writeFileSync(deck, figure(2));
    assert.deepEqual(pdfFigureProblems(deck).slice(0, 2), [
      'figures/plot-dark.png is not the render of page 2 of figures/plot.pdf, run npm run tex',
      'figures/plot-light.png is not the render of page 2 of figures/plot.pdf, run npm run tex',
    ]);
    writeFileSync(join(dir, 'figures', 'plot.pdf'), Buffer.concat([readFileSync(PDF), Buffer.from('\n%\n')]));
    assert.equal(pdfFigureProblems(deck).length, 4);
    tex();
    assert.deepEqual(pdfFigureProblems(deck), ['figures/gone.pdf is not found, for the PDF figure figures/gone.png of index.html']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
