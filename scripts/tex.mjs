import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { compileFigures } from './figures.mjs';
import { renderPdfFigures } from './pdf-figures.mjs';
import { sources } from './sources.mjs';

const { folderTex, preambleOf, skippedLines, texScript } = await sources(['texfile']);

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
  await compileFigures(deck);
  await renderPdfFigures(deck);
  const name = basename(deck);
  for (const line of skippedLines(preamble, bibliography, missing, name)) console.log(line);
  if (!/<script\b[^>]*\ssrc\s*=\s*["']tex\.js["']/.test(readFileSync(deck, 'utf8'))) {
    console.log(`${name} does not load tex.js: put <script src="tex.js"></script> before the script of theme/mathjax-config.js`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
