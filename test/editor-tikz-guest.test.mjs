import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { findTools } from '../scripts/figures.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { fromHeader, writeFigure } from '../src/editor/tex/from-data.ts';
import { front } from './helpers/apply.mjs';
import { C, open, TALK } from './helpers/client.mjs';
import { center, click } from './helpers/editor.mjs';
import { post, startEdit, stopEdit, talkFolder } from './helpers/session.mjs';

const tools = findTools();
const WITHOUT_TEX = !tools.latex || !tools.dvisvgm ? 'latex and dvisvgm are not installed, as on the test runners of CI' : false;
const E = 'window.BeesonEditor';
const SECRET = 'a secret of the relay of the tests';
const ONLY = 'Only the host changes a TikZ figure';
const CSV = 't,x,y\n0,1,0\n1,0.5,0.2\n2,0.25,0.3\n';
const DECAY = writeFigure(fromHeader('figures/decay.csv', ['t', 'x', 'y']));
const ORBIT = '\\begin{tikzpicture}\n\\draw[accent] (0,0) circle (1);\n\\end{tikzpicture}\n';
const DECK = TALK.replace('<p>First slide</p>', '<p>First slide</p>\n  <div class="tikz" data-figure="decay" style="width: 500px; height: 300px"></div>\n  <div class="tikz" data-figure="orbit" style="width: 300px; height: 300px; translate: 600px -300px"></div>');
const PANEL = '#beeson-edit-panel-format';
const FIGURE = (name) => `.reveal .slides > section.present .tikz[data-figure="${name}"]`;

let browser;
before(async () => {
  browser = await launch({ offline: false });
});
after(() => browser?.close());

const wait = (page) => page.evaluate('new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), 50))');
const message = (page) => page.evaluate(`${E}.status().message`);
const clear = (page) => page.evaluate(`${C}.app.note = null, ${C}.app.report()`);

test('a guest is told that only the host changes a TikZ figure, and sees the figures and their state', { skip: WITHOUT_TEX, timeout: 240000 }, async (t) => {
  const folder = talkFolder(t, DECK);
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  mkdirSync(join(folder.talk, 'figures'));
  for (const [name, text] of [['decay.csv', CSV], ['decay.tex', DECAY], ['orbit.tex', ORBIT]]) writeFileSync(join(folder.talk, 'figures', name), text);
  const edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config } });
  t.after(async () => {
    await stopEdit(edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  const relay = await startRelay({ host: '127.0.0.1', secret: SECRET });
  t.after(() => relay.close());
  const shared = await post(edit.port, `${edit.base}.session/share`, { relay: relay.url, secret: SECRET });
  assert.equal(shared.status, 200, shared.text);
  const read = (name) => readFileSync(join(folder.talk, name), 'utf8');

  const page = await open(browser, `${relay.url}${edit.base}index.html?edit&session`, { name: 'Ben', width: 1600, height: 1000 });
  t.after(() => page.close());
  await front(page);
  assert.equal(await page.evaluate(`${C}.host`), false);
  await page.waitFor(`['decay', 'orbit'].every((n) => !!window.beesonFigures?.[n]) && !!document.querySelector('${FIGURE('orbit')} > svg')`, 90_000);
  const text = await page.evaluate(`${E}.render()`);

  for (const id of ['insert.tikzData', 'insert.tikzFile', 'insert.tikzBlank']) {
    await clear(page);
    await page.evaluate(`${E}.exec(${JSON.stringify(id)}, { files: [new File(['t,x\\n0,1\\n'], 'a.csv')] })`);
    await wait(page);
    assert.equal(await message(page), ONLY, id);
    assert.equal(await page.evaluate(`${E}.render()`), text);
  }

  await click(page, await center(page, FIGURE('orbit')));
  await wait(page);
  await clear(page);
  await page.evaluate(`${E}.exec('format.tikzSource')`);
  await wait(page);
  assert.equal(await message(page), ONLY);
  assert.equal(await page.evaluate(`!!document.querySelector('dialog.beeson-edit-tikz')?.open`), false);
  await click(page, await center(page, FIGURE('orbit')), { count: 2 });
  await wait(page);
  assert.equal(await page.evaluate(`!!document.querySelector('dialog.beeson-edit-tikz')?.open`), false);

  await page.evaluate(`${E}.state('shell.format').checked || ${E}.exec('shell.format')`);
  await click(page, await center(page, FIGURE('decay')));
  await wait(page);
  await page.waitFor(`document.querySelectorAll('${PANEL} .ed-tikz .curve').length === 2`);
  const pane = await page.evaluate(`(() => {
    const p = document.querySelector('${PANEL}');
    return {
      text: p.textContent,
      off: p.querySelector('fieldset')?.disabled ?? null,
      edit: [...p.querySelectorAll('button')].find((b) => b.textContent === 'Edit Source…')?.disabled ?? null,
    };
  })()`);
  assert.ok(pane.text.includes(ONLY), pane.text);
  assert.match(pane.text, /Compiled/);
  assert.equal(pane.off, true);
  assert.equal(pane.edit, true);
  assert.ok(!pane.text.includes('no longer in the shape'), pane.text);
  assert.equal(read('figures/decay.tex'), DECAY);
  assert.equal(read('figures/orbit.tex'), ORBIT);
});
