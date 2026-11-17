// the TikZ Figure pane of the Format tab in a session: the name of the source, Edit Source…, and the
// state of the figure, and for a source of From Data the fields of its data, curves, axes, and
// labels, each of which writes the source again as Apply does. a source that lost the shape of From
// Data shows the fields turned off, and a source of another shape does not show them. a test that
// runs TeX is skipped without latex and dvisvgm

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { findTools } from '../scripts/figures.mjs';
import { fromHeader, writeFigure } from '../src/editor/tex/from-data.ts';
import { front } from './helpers/apply.mjs';
import { open, sessionUrl, TALK } from './helpers/client.mjs';
import { center, click } from './helpers/editor.mjs';
import { startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const tools = findTools();
const WITHOUT_TEX = !tools.latex || !tools.dvisvgm ? 'latex and dvisvgm are not installed, as on the test runners of CI' : false;
const E = 'window.BeesonEditor';
const CSV = 't,x,y pos\n0,1,0\n1,0.5,0.2\n2,0.25,0.3\n3,0.12,0.35\n';
const DECAY = writeFigure(fromHeader('figures/decay.csv', ['t', 'x', 'y pos']));
const ORBIT = '\\begin{tikzpicture}\n\\draw[accent] (0,0) circle (1);\n\\end{tikzpicture}\n';
const LOST = DECAY.replace('\\end{axis}', '\\draw (0,0) -- (1,1);\n\\end{axis}');
// the figures side by side, each moved up by the height of those before it
const tag = (name, i) => `<div class="tikz" data-figure="${name}" style="width: 500px; height: 300px; translate: ${600 * i}px ${-300 * i}px"></div>`;
const DECK = TALK.replace('<p>First slide</p>', `<p>First slide</p>\n  ${tag('decay', 0)}\n  ${tag('orbit', 1)}\n  ${tag('lost', 2)}`);
const PANEL = '#beeson-edit-panel-format';

let browser;
before(async () => {
  browser = await launch({ offline: false });
});
after(() => browser?.close());

const wait = (page) => page.evaluate('new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), 50))');
const pane = (page) => page.evaluate(`(() => {
  const p = document.querySelector('${PANEL}');
  const field = p.querySelector('fieldset');
  return {
    tabs: [...p.querySelectorAll('.ed-tabs button')].map((b) => b.textContent),
    headings: [...p.querySelectorAll('h5')].map((h) => h.textContent),
    text: p.textContent,
    off: field ? field.disabled : null,
    data: p.querySelector('.ed-tikz .path')?.textContent ?? null,
    curves: p.querySelectorAll('.ed-tikz .curve').length,
    deletable: [...p.querySelectorAll('.ed-tikz .curve button')].map((b) => !b.disabled),
  };
})()`);
// a value set into the field of the pane labeled label, and its change
const set = (page, label, value) => page.evaluate(`(() => {
  const el = document.querySelector('${PANEL} [aria-label=${JSON.stringify(label)}]');
  if (!el) throw new Error('the pane does not have a field ${label}');
  if (el.type === 'checkbox') el.checked = ${JSON.stringify(value)};
  else el.value = ${JSON.stringify(value)};
  el.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
async function press(page, text) {
  const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('${PANEL} button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === ${JSON.stringify(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  assert.ok(at, `the pane does not have a button ${text}`);
  await click(page, at);
  await wait(page);
}

test('the TikZ Figure pane shows the file and the state of a figure, and writes the source of From Data again from its fields', { skip: WITHOUT_TEX, timeout: 300000 }, async (t) => {
  const folder = talkFolder(t, DECK);
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  mkdirSync(join(folder.talk, 'figures'));
  for (const [name, text] of [['decay.csv', CSV], ['decay.tex', DECAY], ['orbit.tex', ORBIT], ['lost.tex', LOST]]) writeFileSync(join(folder.talk, 'figures', name), text);
  const edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config } });
  t.after(async () => {
    await stopEdit(edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  const read = (name) => (existsSync(join(folder.talk, name)) ? readFileSync(join(folder.talk, name), 'utf8') : null);
  const page = await open(browser, sessionUrl(edit), { name: 'Ann', width: 1600, height: 1000 });
  t.after(() => page.close());
  await front(page);
  await page.waitFor(`['decay', 'orbit', 'lost'].every((n) => !!window.beesonFigures?.[n])`, 90_000);
  await page.evaluate(`${E}.state('shell.format').checked || ${E}.exec('shell.format')`);
  const select = async (name) => {
    await click(page, await center(page, `.reveal .slides > section.present .tikz[data-figure="${name}"]`));
    await wait(page);
  };

  await select('decay');
  await page.waitFor(`document.querySelectorAll('${PANEL} .ed-tikz .curve').length === 2`);
  let shown = await pane(page);
  assert.deepEqual(shown.tabs, ['TikZ Figure', 'Arrange']);
  assert.deepEqual(shown.headings, ['File', 'Data', 'Curves', 'X Axis', 'Y Axis', 'Labels']);
  assert.ok(shown.text.includes('decay.tex') && shown.text.includes('Edit Source…'), shown.text);
  assert.match(shown.text, /Compiled/);
  assert.equal(shown.data, 'figures/decay.csv');
  assert.equal(shown.off, false);

  const figure = fromHeader('figures/decay.csv', ['t', 'x', 'y pos']);
  const written = (what) => until(() => read('figures/decay.tex') === writeFigure(figure), what);
  await set(page, 'Label of curve 1', 'decay of x');
  figure.curves[0].label = 'decay of x';
  await written('the label of curve 1 to be written');
  await set(page, 'Kind of curve 2', 'points');
  figure.curves[1].kind = 'points';
  await written('the kind of curve 2 to be written');
  await set(page, 'Color of curve 2', 'violet');
  figure.curves[1].color = 'violet';
  await written('the color of curve 2 to be written');
  await press(page, 'Legend');
  figure.labels = 'legend';
  await written('the legend to be written');
  await set(page, 'Logarithmic y axis', true);
  await set(page, 'Min of the y axis', '0.01');
  figure.axes.y = { ...figure.axes.y, log: true, min: '0.01' };
  await written('the y axis to be written');
  await set(page, 'Label of the x axis', 'time in s');
  figure.axes.x.label = 'time in s';
  await written('the label of the x axis to be written');

  // a new curve takes the next column, and the last curve is not deleted
  await press(page, 'Add Curve');
  figure.curves.push({ part: 'x-2', column: 'x', kind: 'line', color: 'data3', label: 'x' });
  await written('the new curve to be written');
  await set(page, 'Column of curve 3', 'y pos');
  figure.curves[2].column = 'y pos';
  await written('the column of curve 3 to be written');
  await press(page, 'Delete curve 3');
  await press(page, 'Delete curve 2');
  figure.curves.splice(1, 2);
  await written('the curves to be deleted');
  await page.waitFor(`document.querySelectorAll('${PANEL} .ed-tikz .curve').length === 1`);
  assert.deepEqual((await pane(page)).deletable, [false]);

  // the data is replaced by a CSV file chosen in the pane
  await page.evaluate(`(() => {
    const input = document.querySelector('${PANEL} input[type=file]');
    const dt = new DataTransfer();
    dt.items.add(new File(['time,a,b\\n0,1,2\\n1,2,3\\n'], 'other.csv'));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const replaced = { ...fromHeader('figures/other.csv', ['time', 'a', 'b']), axes: figure.axes, labels: figure.labels };
  await until(() => read('figures/decay.tex') === writeFigure(replaced), 'the new data to be written');
  assert.equal(read('figures/other.csv'), 'time,a,b\n0,1,2\n1,2,3\n');
  await page.waitFor(`document.querySelector('${PANEL} .ed-tikz .path')?.textContent === 'figures/other.csv'`);

  // a source of another shape shows the file alone
  await select('orbit');
  await page.waitFor(`[...document.querySelectorAll('${PANEL} h5')].map((h) => h.textContent).join() === 'File'`);
  shown = await pane(page);
  assert.ok(shown.text.includes('orbit.tex'), shown.text);
  assert.equal(shown.off, null);

  // a source that lost the shape of From Data shows the fields turned off, with a note
  await select('lost');
  await page.waitFor(`document.querySelector('${PANEL} fieldset')?.disabled === true`);
  shown = await pane(page);
  assert.ok(shown.text.includes('The source is no longer in the shape that From Data writes, hence these fields are off. Edit it with Edit Source…'), shown.text);
  assert.deepEqual(page.errors.filter((e) => !/figures\/[\w-]+\.js/.test(e)), []);
});
