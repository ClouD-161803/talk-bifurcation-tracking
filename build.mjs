// bundles src/main.ts into theme/beeson.js, src/editor/main.ts into theme/editor.js,
// src/session/client/main.ts into theme/session.js, and src/edit/main.ts into theme/edit.mjs, which
// are committed so that a toolchain is not required for a talk

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('.', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

const common = {
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  define: { __VERSION__: JSON.stringify(version) },
};

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/main.ts', root))],
  outfile: fileURLToPath(new URL('theme/beeson.js', root)),
  banner: {
    js: `/*! beeson.js ${version}, the reveal.js theme of the Beeson group. MIT license. The orbit engine is ported from src/lib/orbits.ts of https://github.com/ClouD-161803/ClouD-161803.github.io (MIT). */`,
  },
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/editor/main.ts', root))],
  outfile: fileURLToPath(new URL('theme/editor.js', root)),
  // the whitespace is taken out to keep the bundle under its budget, and the names are kept
  minifyWhitespace: true,
  banner: { js: `/*! editor.js ${version}, the in-place editor of the beeson theme. MIT license. */` },
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/edit/main.ts', root))],
  outfile: fileURLToPath(new URL('theme/edit.mjs', root)),
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: `/*! edit.mjs ${version}, the edit command of the synchronous editor of the beeson theme. MIT license. */` },
});

// the client of a session runs beside theme/editor.js, and it reaches the editor only through the
// handover of src/session/client/handover.ts. a stateful module of the editor bundled into it would
// be a second copy with its own state, hence only these two modules, which hold none, may be
const SHARED = new Set(['src/editor/merge.ts', 'src/editor/tokens.ts']);

const session = await build({
  ...common,
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/session/client/main.ts'],
  outfile: fileURLToPath(new URL('theme/session.js', root)),
  minifyWhitespace: true,
  metafile: true,
  write: false,
  banner: { js: `/*! session.js ${version}, the client of the synchronous editor of the beeson theme. MIT license. */` },
});
const inputs = session.metafile.inputs;
const stray = Object.keys(inputs).filter((path) => path.startsWith('src/editor/') && !SHARED.has(path));
if (stray.length) {
  const by = (path) => Object.keys(inputs).filter((from) => inputs[from].imports.some((i) => i.path === path));
  const lines = stray.map((path) => `  ${path}, imported by ${by(path).join(', ')}`);
  throw new Error(`theme/session.js may import from src/editor/ only merge.ts and tokens.ts as values, and a type with import type:\n${lines.join('\n')}`);
}
for (const file of session.outputFiles) {
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, file.contents);
}
