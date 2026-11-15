// bundles src/main.ts into theme/beeson.js, src/editor/main.ts into theme/editor.js,
// src/session/client/main.ts into theme/session.js, and src/edit/main.ts into theme/edit.mjs, which
// are committed so that a toolchain is not required for a talk

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
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

const editor = await build({
  ...common,
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/editor/main.ts'],
  outfile: fileURLToPath(new URL('theme/editor.js', root)),
  metafile: true,
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
// be a second copy with its own state, hence it may share with the editor only these modules, which
// hold none (src/qr.ts only constant tables, for the Share dialog), and the modules of src/session/.
// a path is compared by its real path in lowercase, since a path written in another case is a second
// module on a file system that ignores case
const real = (path) => {
  try {
    return realpathSync.native(fileURLToPath(new URL(path, root))).toLowerCase();
  } catch {
    return path.toLowerCase();
  }
};
const SHARED = new Set(['src/editor/merge.ts', 'src/editor/tokens.ts', 'src/qr.ts'].map(real));
const SESSION = real('src/session') + (process.platform === 'win32' ? '\\' : '/');

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
const editorInputs = new Set(Object.keys(editor.metafile.inputs).map(real));
const stray = Object.keys(inputs).filter((path) => {
  const r = real(path);
  return editorInputs.has(r) && !SHARED.has(r) && !r.startsWith(SESSION);
});
if (stray.length) {
  const by = (path) => Object.keys(inputs).filter((from) => inputs[from].imports.some((i) => i.path === path));
  const lines = stray.map((path) => `  ${path}, imported by ${by(path).join(', ')}`);
  throw new Error(`theme/session.js may share with theme/editor.js only src/editor/merge.ts, src/editor/tokens.ts, src/qr.ts, and src/session/ as values, and a type with import type:\n${lines.join('\n')}`);
}
for (const file of session.outputFiles) {
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, file.contents);
}
