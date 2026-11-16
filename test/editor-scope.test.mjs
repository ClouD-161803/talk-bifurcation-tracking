// the classes, attributes, and declarations of the focus, the late steps, the flies, and the plot
// steps in the editor: a move keeps them in the file, the scope rule of src/editor/model/scope.ts
// takes them as written by the theme, and the Steps pane names them

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { attributeProblem, declarationProblem, themeClasses } from '../src/editor/model/scope.ts';
import { click, editorPage, press } from './helpers/editor.mjs';

const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));

test('a focus, a fly, and the seconds of a late step on an element of the class late are in the scope rule', () => {
  assert.ok(THEME.has('late'));
  assert.equal(declarationProblem('p', ['fragment', 'late'], '--delay', '1.2s'), null);
  assert.notEqual(declarationProblem('p', ['fragment'], '--delay', '1.2s'), null);
  assert.notEqual(declarationProblem('p', ['fragment', 'late'], '--delay', 'soon'), null);
  assert.equal(attributeProblem('data-focus'), null);
  for (const name of ['data-fly-from', 'data-fly-to', 'data-fly-duration']) assert.equal(attributeProblem(name), null);
});

test('a late step nudged in the editor keeps its class and its seconds', { timeout: 120000 }, async (t) => {
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser, { deck: 'test/pages/late.html' });
  await click(page, 'section > p.late');
  await press(page, 'Escape');
  await page.waitFor(`(() => { const s = window.BeesonEditor.selection(); return s.length === 1 && s[0].matches('section > p.late'); })()`);
  await press(page, 'ArrowRight');
  const html = await page.evaluate('window.BeesonEditor.render()');
  assert.match(html, /<p class="fragment late" style="--delay: 1s; translate: 1px 0px">A line shown late\.<\/p>/);
  assert.deepEqual(page.errors, []);
});

test('a play once and a hide of a plot are in the scope rule, and the Steps pane lists a hide as a plot step named after its ids', { timeout: 120000 }, async (t) => {
  for (const name of ['data-plot-once', 'data-plot-hide']) assert.equal(attributeProblem(name), null);
  const browser = await launch();
  t.after(() => browser.close());
  const page = await editorPage(browser, { deck: 'test/pages/plot-once.html' });
  await page.evaluate(`window.BeesonEditor.exec('view.steps')`);
  await page.waitFor(`document.querySelectorAll('.beeson-edit-side .rows .row').length >= 2`);
  const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-side .rows .row')].map((r) => r.querySelector('.meta .kind').textContent + ': ' + r.querySelector('.text').textContent)`);
  assert.deepEqual(rows.filter((r) => r.startsWith('Plot step')), ['Plot step: Show fill line', 'Plot step: Hide fill']);
  assert.deepEqual(page.errors, []);
});
