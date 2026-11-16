// npm run tex writes the script tex.js next to a deck, from the preamble.tex and the references.bib
// next to it: the macros and the environments for MathJax, the kinds of theorem, and the references
// of the entries that the deck cites. The lines of the preamble and the entries of the bibliography
// that are not read are printed with their reason, and so is a key that is cited without an entry.
// The TikZ figures of figures.mjs are compiled, and the PDF figures of pdf-figures.mjs rendered.
// In an older talk, the macros of theme/macros.js are written into a preamble.tex once.
//
//   node scripts/tex.mjs [deck]     the deck is index.html unless it is given
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { compileFigures } from './figures.mjs';
import { renderPdfFigures } from './pdf-figures.mjs';
import { sources } from './sources.mjs';

const { folderTex, preambleOf, skippedLines, texScript } = await sources(['texfile']);

/** What npm run tex writes for a deck, with the lines that are skipped and the keys without an entry. Nothing is written. */
export function deckTex(deck) {
  const dir = dirname(resolve(deck));
  const text = (name) => {
    try {
      return readFileSync(join(dir, name), 'utf8');
    } catch {
      return null;
    }
  };
  const { tex, preamble, bibliography, missing } = folderTex(text, readFileSync(deck, 'utf8'));
  return { file: join(dir, 'tex.js'), text: texScript(tex), tex, preamble, bibliography, missing };
}

// the macros of theme/macros.js of an older talk are written into a preamble.tex, each under the
// comment lines above it, the file is deleted, and its script tag in the deck is pointed at tex.js
function convertMacros(deck) {
  const dir = dirname(resolve(deck));
  const file = join(dir, 'theme', 'macros.js');
  if (!existsSync(file)) return;
  if (existsSync(join(dir, 'preamble.tex'))) {
    console.log('theme/macros.js is left in place, since preamble.tex exists: move its macros into preamble.tex, and delete it');
    return;
  }
  const source = readFileSync(file, 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  const comments = {};
  let above = [];
  for (const line of source.split(/\r?\n/)) {
    const comment = /^\s*\/\/ ?(.*)$/.exec(line);
    const key = /^\s*["']?([A-Za-z@]+)["']?\s*:/.exec(line);
    if (comment) above.push(comment[1]);
    else {
      if (key && above.length) comments[key[1]] = above;
      above = [];
    }
  }
  writeFileSync(join(dir, 'preamble.tex'), preambleOf(window.beesonMacros ?? {}, comments));
  rmSync(file);
  writeFileSync(deck, readFileSync(deck, 'utf8').replace(/(<script\b[^>]*\ssrc\s*=\s*["'])theme\/macros\.js(["'])/, '$1tex.js$2'));
  console.log('preamble.tex: written from theme/macros.js, which is deleted');
}

async function main() {
  const [deck = 'index.html'] = process.argv.slice(2);
  if (!existsSync(deck)) {
    console.error(`${deck} is not found`);
    process.exit(1);
  }
  convertMacros(deck);
  const { file, text, tex, preamble, bibliography, missing } = deckTex(deck);
  writeFileSync(file, text);
  const count = (items, one, many = `${one}s`) => `${Object.keys(items).length} ${Object.keys(items).length === 1 ? one : many}`;
  console.log(`tex.js: ${count(tex.macros, 'macro')}, ${count(tex.environments, 'environment')}, ${count(tex.theorems, 'kind of theorem', 'kinds of theorem')}, and ${count(tex.references, 'reference')}`);
  compileFigures(deck);
  await renderPdfFigures(deck);
  const name = basename(deck);
  for (const line of skippedLines(preamble, bibliography, missing, name)) console.log(line);
  if (!/<script\b[^>]*\ssrc\s*=\s*["']tex\.js["']/.test(readFileSync(deck, 'utf8'))) {
    console.log(`${name} does not load tex.js: put <script src="tex.js"></script> before the script of theme/mathjax-config.js`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
