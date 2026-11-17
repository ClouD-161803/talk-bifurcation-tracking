// the TikZ figures in a session of the edit command: a new output of a figure on disk is loaded by
// every page, which draws each instance of the figure again with it and tells the state of the
// figures. TeX is not looked up, hence the outputs are written by the test

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { figureScript } from '../scripts/figures.mjs';
import { front } from './helpers/apply.mjs';
import { C, clean, converge, open, sessionUrl, TALK } from './helpers/client.mjs';
import { startEdit, stopEdit, talkFolder } from './helpers/session.mjs';

let browser;
before(async () => {
  browser = await launch({ offline: false });
});
after(() => browser?.close());

const FIGURE = '<div class="tikz" data-figure="orbit" style="width: 300px; height: 200px"></div>';
const DECK = TALK.replace('<p>First slide</p>', `<p>First slide</p>\n  ${FIGURE}\n  ${FIGURE}`);
// an output of the figure orbit with hash, whose SVG of each mode is marked with mark
const output = (hash, mark) => {
  const svg = (mode) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" data-mark="${mark}-${mode}"><rect id="tikz-orbit-${mode}-a" width="40" height="20"/></svg>`;
  return figureScript('orbit', { hash, width: 40, height: 20, scale: 1, parts: [], inputs: [], dark: svg('dark'), light: svg('light') });
};
// the marks of the instances of the figure on a page
const MARKS = `[...document.querySelectorAll('.reveal .slides .tikz[data-figure="orbit"] > svg')].map((svg) => svg.dataset.mark).join(' ')`;

test('a new output of a figure on disk is drawn on every page, in each instance of the figure', { timeout: 120_000 }, async (t) => {
  const folder = talkFolder(t, DECK);
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  mkdirSync(join(folder.talk, 'figures'));
  mkdirSync(join(folder.root, 'no-tex'));
  writeFileSync(join(folder.talk, 'figures', 'orbit.tex'), '\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}\n');
  writeFileSync(join(folder.talk, 'figures', 'orbit.js'), output('1111111111111111', 'one'));
  const server = { ...folder, file: join(folder.talk, 'index.html'), read: () => DECK };
  server.edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config, BEESON_TEXBIN: join(folder.root, 'no-tex') } });
  t.after(async () => {
    await stopEdit(server.edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  const list = [await open(browser, sessionUrl(server.edit), { name: 'Ann' }), await open(browser, sessionUrl(server.edit), { name: 'Ben' })];
  t.after(() => Promise.all(list.map((page) => page.close())));
  await converge(server, list);
  for (const page of list) {
    await front(page);
    await page.waitFor(`${MARKS} === 'one-dark one-dark'`);
    await page.evaluate(`window.__figures = []; ${C}.on('figures', (state) => window.__figures.push(state.outputs.orbit))`);
  }
  writeFileSync(join(folder.talk, 'figures', 'orbit.js'), output('2222222222222222', 'two'));
  for (const page of list) {
    await front(page);
    await page.waitFor(`${MARKS} === 'two-dark two-dark'`, 20_000);
    assert.equal(await page.evaluate(`${C}.figures.outputs.orbit`), '2222222222222222');
    assert.deepEqual(await page.evaluate('window.__figures'), ['2222222222222222']);
    assert.equal(await page.evaluate(`window.beesonFigures.orbit.hash`), '2222222222222222');
  }
  // the ids of the two instances differ, also after the redraw
  const ids = await list[0].evaluate(`[...document.querySelectorAll('.tikz[data-figure="orbit"] rect')].map((r) => r.id).join(' ')`);
  assert.equal(new Set(ids.split(' ')).size, 2, ids);
  // a page that joins later draws the output on disk
  const late = await open(browser, sessionUrl(server.edit), { name: 'Cy' });
  t.after(() => late.close());
  await front(late);
  await late.waitFor(`${MARKS} === 'two-dark two-dark'`);
  for (const page of [...list, late]) clean(page);
});
