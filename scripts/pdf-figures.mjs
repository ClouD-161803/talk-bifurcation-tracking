import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { launch } from './chrome.mjs';
import { attributes } from './figures.mjs';
import { sources } from './sources.mjs';

const { hashOf, modeOf, pageOf, renderHash, tonesOf } = await sources(['pdffigure']);

const read = (file) => {
  try {
    return readFileSync(file);
  } catch {
    return null;
  }
};

export function deckPdfFigures(html) {
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  const figures = [];
  for (const [tag] of text.matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const values = attributes(tag);
    if (!('data-pdf' in values)) continue;
    figures.push({ pdf: values['data-pdf'], page: pageOf(values['data-page']), mode: modeOf((values.class ?? '').split(/\s+/)), src: values.src ?? '' });
  }
  return figures;
}

const themeOf = (dir) => (existsSync(join(dir, 'theme', 'beeson.css')) ? join(dir, 'theme') : join(import.meta.dirname, '..', 'theme'));

export function pdfFigureStatus(deck) {
  const dir = dirname(resolve(deck));
  const figures = deckPdfFigures(readFileSync(deck, 'utf8'));
  if (!figures.length) return [];
  const tones = tonesOf(readFileSync(join(themeOf(dir), 'beeson.css'), 'utf8'));
  return figures.map((figure) => {
    if (!figure.pdf || !figure.src || /^[a-z]+:/i.test(figure.src)) return { ...figure, state: 'invalid' };
    const pdf = read(join(dir, figure.pdf));
    if (!pdf) return { ...figure, state: 'no source' };
    const png = read(join(dir, figure.src));
    if (!png) return { ...figure, state: 'missing' };
    const hash = renderHash(new Uint8Array(pdf), figure.page, figure.mode, figure.mode ? tones[figure.mode] : null);
    return { ...figure, state: hashOf(new Uint8Array(png)) === hash ? 'current' : 'stale' };
  });
}

const problem = (figure, deck) =>
  ({
    stale: `${figure.src} is not the render of page ${figure.page} of ${figure.pdf}, run npm run tex`,
    missing: `${figure.src} is missing, run npm run tex`,
    'no source': `${figure.pdf} is not found, for the PDF figure ${figure.src} of ${basename(deck)}`,
    invalid: `${basename(deck)}: a PDF figure without data-pdf or without a src next to the deck, for ${figure.pdf || figure.src}`,
  })[figure.state];

export function pdfFigureProblems(deck) {
  return pdfFigureStatus(deck)
    .filter((figure) => figure.state !== 'current')
    .map((figure) => problem(figure, deck));
}

export async function renderPdfFigures(deck, { log = console.log } = {}) {
  const dir = dirname(resolve(deck));
  const figures = pdfFigureStatus(deck);
  const todo = figures.filter((figure) => figure.state === 'stale' || figure.state === 'missing');
  for (const figure of figures.filter((f) => f.state === 'no source' || f.state === 'invalid')) {
    log(problem(figure, deck));
    process.exitCode = 1;
  }
  if (!todo.length) return;
  const theme = themeOf(dir);
  const tones = tonesOf(readFileSync(join(theme, 'beeson.css'), 'utf8'));
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    for (const file of ['vendor/pdfjs/pdf.js', 'editor-pdf.js']) await page.evaluate(readFileSync(join(theme, file), 'utf8'));
    for (const figure of todo) {
      const pdf = readFileSync(join(dir, figure.pdf)).toString('base64');
      try {
        const png = await page.evaluate(`(async () => {
          const bytes = Uint8Array.from(atob(${JSON.stringify(pdf)}), (c) => c.charCodeAt(0));
          const { renders } = await window.BeesonPdf.render(bytes, ${figure.page}, [${JSON.stringify(figure.mode)}], ${JSON.stringify(tones)});
          let text = '';
          for (const b of renders[0].png) text += String.fromCharCode(b);
          return btoa(text);
        })()`);
        writeFileSync(join(dir, figure.src), Buffer.from(png, 'base64'));
        log(`${figure.src}: page ${figure.page} of ${figure.pdf}, ${figure.mode ?? 'in its own colors'}`);
      } catch (error) {
        log(`${figure.src}: page ${figure.page} of ${figure.pdf} is not rendered: ${error.message.split('\n')[0]}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await browser.close();
  }
}
