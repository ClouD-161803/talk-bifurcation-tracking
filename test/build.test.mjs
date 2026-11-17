// check of build.mjs, run on a copy so that theme/beeson.js is not touched

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// a copy of the source and of build.mjs in a folder with a space in its name
function copy(t) {
  const root = mkdtempSync(join(tmpdir(), 'slides build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['build.mjs', 'package.json', 'tsconfig.json', 'src']) {
    cpSync(resolve(path), join(root, path), { recursive: true });
  }
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'junction');
  return root;
}

test('the theme is built in a folder with a space in its name', (t) => {
  const root = copy(t);
  execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'pipe', cwd: root });

  // a talk runs the compiled files, hence each must be built from the current source
  for (const file of ['theme/beeson.js', 'theme/editor.js', 'theme/editor-tex.js', 'theme/editor-session.js', 'theme/edit.mjs', 'theme/session.js']) {
    assert.ok(readFileSync(join(root, file), 'utf8') === readFileSync(resolve(file), 'utf8'), `${file} is not built from the current source, run npm run build`);
  }
});

// the client reaches the editor through its handover, hence a stateful module of the editor in
// its bundle fails the build, and a type does not
test('the client of a session imports a module of the editor only as a type', (t) => {
  const root = copy(t);
  const client = join(root, 'src/session/client/dom.ts');
  appendFileSync(client, "\nimport type { App } from '../../editor/app.ts';\nexport type Seen = App;\n");
  execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'pipe', cwd: root });
  appendFileSync(client, "\nimport { make as editorMake } from '../../editor/ui/dom.ts';\nexport const seen = editorMake;\n");
  let message = '';
  try {
    execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'pipe', cwd: root });
  } catch (e) {
    message = String(e.stderr);
  }
  assert.match(message, /src\/editor\/ui\/dom\.ts, imported by src\/session\/client\/dom\.ts/);
});

// a module of theme/editor.js outside src/editor/, e.g. src/shapes.ts with its observers, would be a
// second copy as well, and so would a module of the editor imported with a path in another case on a
// file system that ignores case
test('the client of a session shares a module with the editor only under src/session/, or merge.ts and tokens.ts', (t) => {
  const root = copy(t);
  const client = join(root, 'src/session/client/dom.ts');
  const before = readFileSync(client, 'utf8');
  const refusal = (lines) => {
    writeFileSync(client, before + lines);
    try {
      execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'pipe', cwd: root });
      return '';
    } catch (e) {
      return String(e.stderr);
    }
  };
  assert.match(refusal("\nimport { mountShapes } from '../../shapes.ts';\nexport const seen = mountShapes;\n"), /src\/shapes\.ts, imported by src\/session\/client\/dom\.ts/);
  if (existsSync(join(root, 'SRC'))) {
    assert.match(refusal("\nimport { make as editorMake } from '../../Editor/ui/dom.ts';\nexport const seen = editorMake;\n"), /src\/Editor\/ui\/dom\.ts, imported by src\/session\/client\/dom\.ts/);
  }
});

// the session code of the editor runs beside theme/editor.js, and it reaches the editor only
// through the handover of src/editor/session/host.ts. a module of the editor bundled into it would
// be a second copy with its own state, also a module of its own folder such as caret.ts
test('the session code of the editor shares no module with theme/editor.js', (t) => {
  const root = copy(t);
  const tree = join(root, 'src/editor/session/tree.ts');
  const before = readFileSync(tree, 'utf8');
  const refusal = (lines) => {
    writeFileSync(tree, before + lines);
    try {
      execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'pipe', cwd: root });
      return '';
    } catch (e) {
      return String(e.stderr);
    }
  };
  assert.match(refusal("\nimport { make as editorMake } from '../ui/dom.ts';\nexport const seen = editorMake;\n"), /src\/editor\/ui\/dom\.ts, imported by src\/editor\/session\/tree\.ts/);
  assert.match(refusal("\nimport { markOf as editorMark } from './caret.ts';\nexport const seen = editorMark;\n"), /src\/editor\/session\/caret\.ts, imported by src\/editor\/session\/tree\.ts/);
});

// a page without a session does not load the engine of a session, which hence is not in theme/editor.js
test('theme/editor.js holds none of the session code, which theme/editor-session.js holds', () => {
  const mark = /Symbol\(["']reread["']\)/;
  assert.doesNotMatch(readFileSync(resolve('theme/editor.js'), 'utf8'), mark);
  assert.match(readFileSync(resolve('theme/editor-session.js'), 'utf8'), mark);
});

test('the theme bundle carries none of the editor, which is all in theme/editor.js', () => {
  const theme = readFileSync(resolve('theme/beeson.js'), 'utf8');
  const editor = readFileSync(resolve('theme/editor.js'), 'utf8');
  for (const mark of ['BeesonEditor', 'beeson-edit', 'showOpenFilePicker']) assert.ok(!theme.includes(mark), `${mark} is in theme/beeson.js`);
  assert.ok(editor.includes('BeesonEditor'));
});

// the editor is loaded at each ?edit from a file, without a toolchain, hence its bundle is kept under
// a budget, which leaves room for the editing features of Keynote and PowerPoint
test('theme/editor.js is under 1280 kB', () => {
  const size = statSync(resolve('theme/editor.js')).size;
  assert.ok(size < 1280 * 1024, `theme/editor.js is ${Math.round(size / 1024)} kB`);
});

// the engine of the port of a session is loaded beside theme/session.js at each ?edit&session
test('theme/editor-session.js is under 40 kB', () => {
  const size = statSync(resolve('theme/editor-session.js')).size;
  assert.ok(size < 40 * 1024, `theme/editor-session.js is ${Math.round(size / 1024)} kB`);
});

// the edit command is copied into a talk with theme/, and it is imported by the tests of the sync
// core without starting anything
test('theme/edit.mjs is under 256 kB and starts nothing when it is imported', () => {
  const size = statSync(resolve('theme/edit.mjs')).size;
  assert.ok(size < 256 * 1024, `theme/edit.mjs is ${Math.round(size / 1024)} kB`);
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', "const m = await import(process.argv[1]); console.log(typeof m.Authority, typeof m.Replica, typeof m.diff)", pathToFileURL(resolve('theme/edit.mjs')).href], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(out.trim(), 'function function function');
});

// the client is loaded at each ?edit&session, beside theme/editor.js
test('theme/session.js is under 288 kB', () => {
  const size = statSync(resolve('theme/session.js')).size;
  assert.ok(size < 288 * 1024, `theme/session.js is ${Math.round(size / 1024)} kB`);
});
