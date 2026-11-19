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
  minifyWhitespace: true,
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
  minifySyntax: true,
  banner: { js: `/*! editor.js ${version}, the in-place editor of the beeson theme. MIT license. */` },
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/editor/tex/sheets.ts', root))],
  outfile: fileURLToPath(new URL('theme/editor-tex.js', root)),
  banner: { js: `/*! editor-tex.js ${version}, the sheets of the preamble and the bibliography of the beeson editor. MIT license. */` },
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/editor/pdf/render.ts', root))],
  outfile: fileURLToPath(new URL('theme/editor-pdf.js', root)),
  banner: { js: `/*! editor-pdf.js ${version}, the renders of the PDF figures of the beeson editor and of npm run tex. MIT license. */` },
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

const realPathIgnoringCase = (path) => {
  try {
    return realpathSync.native(fileURLToPath(new URL(path, root))).toLowerCase();
  } catch {
    return path.toLowerCase();
  }
};
const editorInputs = new Set(Object.keys(editor.metafile.inputs).map(realPathIgnoringCase));

function writeApartFromEditor(result, file, { shared = [], under = null, allowed }) {
  const inputs = result.metafile.inputs;
  const keep = new Set(shared.map(realPathIgnoringCase));
  const folder = under && realPathIgnoringCase(under) + (process.platform === 'win32' ? '\\' : '/');
  const stray = Object.keys(inputs).filter((path) => {
    const r = realPathIgnoringCase(path);
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
  metafile: true,
  write: false,
  banner: { js: `/*! editor-session.js ${version}, the engine of the port of a session of the beeson editor. MIT license. */` },
});
writeApartFromEditor(engine, 'theme/editor-session.js', { allowed: 'may share no module with theme/editor.js, whose values it takes from src/editor/session/host.ts' });

const session = await build({
  ...common,
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/session/client/main.ts'],
  outfile: fileURLToPath(new URL('theme/session.js', root)),
  minifySyntax: true,
  metafile: true,
  write: false,
  banner: { js: `/*! session.js ${version}, the client of the synchronous editor of the beeson theme. MIT license. */` },
});
writeApartFromEditor(session, 'theme/session.js', { shared: ['src/editor/merge.ts', 'src/editor/tokens.ts', 'src/qr.ts'], under: 'src/session', allowed: 'may share with theme/editor.js only src/editor/merge.ts, src/editor/tokens.ts, src/qr.ts, and src/session/ as values' });
