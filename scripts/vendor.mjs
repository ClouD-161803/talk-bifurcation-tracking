import { buildSync } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const out = join(root, 'theme', 'vendor');

function copy(from, to) {
  mkdirSync(dirname(join(out, to)), { recursive: true });
  cpSync(join(modules, from), join(out, to), { recursive: true });
}

for (const dir of ['reveal', 'fonts', 'mathjax', 'three']) rmSync(join(out, dir), { recursive: true, force: true });

copy('reveal.js/dist/reveal.js', 'reveal/reveal.js');
copy('reveal.js/dist/reveal.css', 'reveal/reveal.css');
copy('reveal.js/dist/reset.css', 'reveal/reset.css');
copy('reveal.js/dist/plugin/notes.js', 'reveal/notes.js');
copy('reveal.js/dist/plugin/highlight.js', 'reveal/highlight.js');
copy('highlight.js/LICENSE', 'reveal/LICENSE-highlight.js');
copy('reveal.js/LICENSE', 'reveal/LICENSE');

const fontsource = '@fontsource/stix-two-text';
const ranges = JSON.parse(readFileSync(join(modules, fontsource, 'unicode.json'), 'utf8'));
const faces = [];
for (const weight of [400, 500]) {
  for (const style of ['normal', 'italic']) {
    const file = `stix-two-text-greek-${weight}-${style}.woff2`;
    copy(`${fontsource}/files/${file}`, `fonts/${file}`);
    faces.push(`@font-face {
  font-family: 'STIX Two Text';
  font-style: ${style};
  font-weight: ${weight};
  font-display: block;
  src: url(./${file}) format('woff2');
  unicode-range: ${ranges.greek};
}
`);
  }
}
writeFileSync(
  join(out, 'fonts', 'stix-two-text.css'),
  `/* The Greek of STIX Two Text, written by scripts/vendor.mjs from ${fontsource}. */\n${faces.join('\n')}`,
);
copy(`${fontsource}/LICENSE`, 'fonts/LICENSE');

copy('mathjax/tex-svg-nofont.js', 'mathjax/tex-svg.js');
copy('mathjax/input/tex/extensions', 'mathjax/input/tex/extensions');
copy('mathjax/LICENSE', 'mathjax/LICENSE');
copy('@mathjax/mathjax-tex-font/svg.js', 'mathjax/mathjax-tex-font/svg.js');
copy('mathjax/LICENSE', 'mathjax/mathjax-tex-font/LICENSE');
copy('@mathjax/mathjax-mhchem-font-extension/svg.js', 'mathjax/mathjax-mhchem-font-extension/svg.js');
copy('mathjax/LICENSE', 'mathjax/mathjax-mhchem-font-extension/LICENSE');

const three = JSON.parse(readFileSync(join(modules, 'three/package.json'), 'utf8')).version;
buildSync({
  stdin: { contents: "export * from 'three';", resolveDir: root, loader: 'js' },
  outfile: join(out, 'three/three.js'),
  bundle: true,
  format: 'iife',
  globalName: 'THREE',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  banner: { js: `/*! three.js ${three}, https://threejs.org, MIT license, bundled by scripts/vendor.mjs. */` },
  logLevel: 'warning',
});
copy('three/LICENSE', 'three/LICENSE');

rmSync(join(out, 'pdfjs'), { recursive: true, force: true });
const pdfjs = JSON.parse(readFileSync(join(modules, 'pdfjs-dist/package.json'), 'utf8')).version;
buildSync({
  stdin: {
    contents: `import * as lib from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
globalThis.pdfjsWorker = { WorkerMessageHandler };
globalThis.pdfjsLib = lib;`,
    resolveDir: root,
    loader: 'js',
  },
  outfile: join(out, 'pdfjs/pdf.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  banner: { js: `/*! pdf.js ${pdfjs}, https://mozilla.github.io/pdf.js, Apache-2.0 license, bundled by scripts/vendor.mjs. */` },
  logLevel: 'warning',
});
copy('pdfjs-dist/LICENSE', 'pdfjs/LICENSE');

function size(path) {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((total, name) => total + size(join(path, name)), 0);
}
console.log(`theme/vendor: ${(size(out) / 2 ** 20).toFixed(2)} MiB`);
