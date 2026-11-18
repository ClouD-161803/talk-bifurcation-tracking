// bundles src/main.ts into theme/beeson.js, src/editor/main.ts into theme/editor.js, the sheets of
// the preamble and the bibliography into theme/editor-tex.js, which editor.js loads at their first
// open, the renders of PDF figures into theme/editor-pdf.js, which editor.js loads at the first
// PDF, the engine of the port of a session into theme/editor-session.js, which editor.js loads in
// a session, src/session/client/main.ts into theme/session.js, and src/edit/main.ts into
// theme/edit.mjs. the bundles are committed so that a toolchain is not required for a talk

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
  // the whitespace is taken out and the syntax is shortened to keep the bundle under its budget, and
  // the names are kept
  minifyWhitespace: true,
  minifySyntax: true,
  banner: { js: `/*! editor.js ${version}, the in-place editor of the beeson theme. MIT license. */` },
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/editor/tex/sheets.ts', root))],
  outfile: fileURLToPath(new URL('theme/editor-tex.js', root)),
  minifyWhitespace: true,
  banner: { js: `/*! editor-tex.js ${version}, the sheets of the preamble and the bibliography of the beeson editor. MIT license. */` },
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/editor/pdf/render.ts', root))],
  outfile: fileURLToPath(new URL('theme/editor-pdf.js', root)),
  minifyWhitespace: true,
  banner: { js: `/*! editor-pdf.js ${version}, the renders of the PDF figures of the beeson editor and of npm run tex. MIT license. */` },
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/edit/main.ts', root))],
  outfile: fileURLToPath(new URL('theme/edit.mjs', root)),
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // the whitespace is taken out to keep the bundle under its budget
  minifyWhitespace: true,
  banner: { js: `/*! edit.mjs ${version}, the edit command of the synchronous editor of the beeson theme. MIT license. */` },
});

// the client of a session and the engine of its port run beside theme/editor.js, and they reach the
// editor only through the handovers of src/session/client/handover.ts and src/editor/session/host.ts.
// a stateful module of the editor bundled into either would be a second copy with its own state,
// hence the client may share with the editor only src/editor/merge.ts, src/editor/tokens.ts, and
// src/qr.ts, which hold none (src/qr.ts only constant tables, for the Share dialog), and the
// modules of src/session/, and the engine none. a path is compared by its real path in lowercase,
// since a path written in another case is a second module on a file system that ignores case
const real = (path) => {
  try {
    return realpathSync.native(fileURLToPath(new URL(path, root))).toLowerCase();
  } catch {
    return path.toLowerCase();
  }
};
const editorInputs = new Set(Object.keys(editor.metafile.inputs).map(real));

// writes the bundle of result to file, once it shares with theme/editor.js only the modules of shared
// and of the folder under. allowed is the rule that the error states
function apart(result, file, { shared = [], under = null, allowed }) {
  const inputs = result.metafile.inputs;
  const keep = new Set(shared.map(real));
  const folder = under && real(under) + (process.platform === 'win32' ? '\\' : '/');
  const stray = Object.keys(inputs).filter((path) => {
    const r = real(path);
    return editorInputs.has(r) && !keep.has(r) && !(folder && r.startsWith(folder));
  });
  if (stray.length) {
    const by = (path) => Object.keys(inputs).filter((from) => inputs[from].imports.some((i) => i.path === path));
    const lines = stray.map((path) => `  ${path}, imported by ${by(path).join(', ')}`);
    throw new Error(`${file} ${allowed}, and a type with import type:\n${lines.join('\n')}`);
  }
  for (const out of result.outputFiles) {
    mkdirSync(dirname(out.path), { recursive: true });
    writeFileSync(out.path, out.contents);
  }
}

const engine = await build({
  ...common,
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/editor/session/entry.ts'],
  outfile: fileURLToPath(new URL('theme/editor-session.js', root)),
  minifyWhitespace: true,
  metafile: true,
  write: false,
  banner: { js: `/*! editor-session.js ${version}, the engine of the port of a session of the beeson editor. MIT license. */` },
});
apart(engine, 'theme/editor-session.js', { allowed: 'may share no module with theme/editor.js, whose values it takes from src/editor/session/host.ts' });

const session = await build({
  ...common,
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/session/client/main.ts'],
  outfile: fileURLToPath(new URL('theme/session.js', root)),
  minifyWhitespace: true,
  // the syntax is shortened to keep the bundle under its budget, and the names are kept
  minifySyntax: true,
  metafile: true,
  write: false,
  banner: { js: `/*! session.js ${version}, the client of the synchronous editor of the beeson theme. MIT license. */` },
});
apart(session, 'theme/session.js', { shared: ['src/editor/merge.ts', 'src/editor/tokens.ts', 'src/qr.ts'], under: 'src/session', allowed: 'may share with theme/editor.js only src/editor/merge.ts, src/editor/tokens.ts, src/qr.ts, and src/session/ as values' });
