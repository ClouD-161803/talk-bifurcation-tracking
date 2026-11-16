// the dot of unread comments on the Comments button against the title bar of the editor, read from
// the tokens of src/editor/shell/shell.ts and from the CSS of src/session/client/comments-pane.ts

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { contrast } from './helpers/editor.mjs';

const shell = readFileSync(new URL('../src/editor/shell/shell.ts', import.meta.url), 'utf8');
const pane = readFileSync(new URL('../src/session/client/comments-pane.ts', import.meta.url), 'utf8');

const tokens = (name) => Object.fromEntries([...shell.match(new RegExp(`const ${name} = \`([^\`]*)\``))[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
// a token as rgb() or rgba()
const rgb = (c) => (c.startsWith('#') ? `rgb(${[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(', ')})` : c);
// top drawn with its alpha over the opaque ground
const over = (top, ground) => {
  const [r, g, b, a = 1] = top.match(/[\d.]+/g).map(Number);
  const under = ground.match(/[\d.]+/g).map(Number);
  return `rgb(${[r, g, b].map((v, i) => v * a + under[i] * (1 - a)).join(', ')})`;
};
// the token of the background of the dot, set by the last rule on .count or .count.dot
const dot = () => {
  let token = null;
  for (const [, selector, body] of pane.matchAll(/([^{}`]+)\{([^}]*)\}/g)) {
    const m = /\.beeson-session-comments \.count(\.dot)?$/.test(selector.trim()) && body.match(/background:\s*var\((--[\w-]+)\)/);
    if (m) token = m[1];
  }
  return token;
};

for (const mode of ['TOKENS_LIGHT', 'TOKENS_DARK']) {
  test(`the dot of unread comments has a contrast of 3:1 against the title bar, at rest and under hover (${mode})`, () => {
    const t = tokens(mode);
    const ink = rgb(t[dot()]);
    const bar = rgb(t['--ed-bg']);
    assert.ok(contrast(ink, bar) >= 3, `${dot()} at rest: ${contrast(ink, bar).toFixed(2)}:1`);
    const hovered = over(t['--ed-hover'], bar);
    assert.ok(contrast(ink, hovered) >= 3, `${dot()} under hover: ${contrast(ink, hovered).toFixed(2)}:1`);
  });
}
