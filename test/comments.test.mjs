import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { commentsOf, docstrings, hashComments, markupComments, scriptComments, styleComments, texComments } from './helpers/comments.mjs';

const root = join(import.meta.dirname, '..');
const BUNDLES = /^theme\/(?:beeson|editor|editor-tex|editor-pdf|editor-session|session)\.js$|^theme\/edit\.mjs$/;

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && !f.startsWith('theme/vendor/') && lstatSync(join(root, f)).isFile());

const legalBanner = (file, comment) => BUNDLES.test(file) && comment.at === 0 && comment.text.startsWith('/*! ');
const TALK_WITH_COMMENTS = 'test-deck.html';
const commentOfTalk = (file, comment) => file === TALK_WITH_COMMENTS && comment.text.startsWith('<!--');

const lineOf = (text, at) => text.slice(0, at).split('\n').length;

test('the files of the repository do not have comments, and a bundle has only its legal banner', () => {
  const hits = tracked.flatMap((file) => {
    const text = readFileSync(join(root, file), 'utf8');
    return commentsOf(file, text)
      .filter((c) => !legalBanner(file, c) && !commentOfTalk(file, c))
      .map((c) => `${file}:${lineOf(text, c.at)}: ${c.text.slice(0, 100)}`);
  });
  assert.deepEqual(hits, []);
});

test('each bundle opens with its legal banner', () => {
  const bundles = tracked.filter((f) => BUNDLES.test(f));
  assert.equal(bundles.length, 7);
  for (const file of bundles) assert.match(readFileSync(join(root, file), 'utf8'), /^\/\*! \S+ \d+\.\d+\.\d+\S*, .+ MIT license\./, file);
});

test('a comment is found in a script, but not in its strings, regular expressions, or template literals', () => {
  const script = [
    '#!/usr/bin/env node',
    "const a = 'http://x' + \"/* not */\" + `//${'y'}`;",
    'const b = /\\/\\/ not/g.test(a) ? x / 2 / 3 : `${{ c: `/x/` }.c}`;',
    'if (a) /re/.test(a); // one',
    '/* two */ const c = { d: 1 } / 2;',
    'const css = `',
    '  a { b: c; } /* three */',
    '  // four',
    '`;',
  ].join('\n');
  assert.deepEqual(
    scriptComments(script).map((c) => c.text),
    ['// one', '/* two */', '/* three */', '// four'],
  );
});

test('a comment is found in markup, style, TeX, and a file of hash comments', () => {
  const html = '<p>a</p><!-- one --><script>const u = "<!-- x -->"; // two\n</script><script type="application/json">{"a": "//"}</script><style>a { b: "/*"; } /* three */</style>';
  assert.deepEqual(markupComments(html).map((c) => c.text), ['<!-- one -->', '// two', '/* three */']);
  assert.deepEqual(styleComments('a { content: "/* x */"; } /* one */').map((c) => c.text), ['/* one */']);
  assert.deepEqual(texComments('50\\% of a % one\n\\\\% two').map((c) => c.text), ['% one', '% two']);
  assert.deepEqual(hashComments('#!/bin/sh\n# one\nrun: a "#b" # two').map((c) => c.text), ['# one', '# two']);
});

test('a docstring of a module, a function, or a class is found in Python, but not a string assigned to a name', () => {
  const python = ['"""one', 'more"""', 'import a', 'x = """not', '"""', 'def f(a,', '      b):', "    'two'", '    return {', '        "k":', '            "not"}', 'class C:', '', '    r\'\'\'three\'\'\''].join('\n');
  assert.deepEqual(docstrings(python).map((c) => c.text), ['"""one', "'two'", "r'''three'''"]);
  assert.deepEqual(commentsOf('a.py', '# four\n' + python).map((c) => c.text), ['# four', '"""one', "'two'", "r'''three'''"]);
});
