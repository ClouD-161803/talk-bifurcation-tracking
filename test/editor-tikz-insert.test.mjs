import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { findTools } from '../scripts/figures.mjs';
import { fromHeader, writeFigure } from '../src/editor/tex/from-data.ts';
import { front } from './helpers/apply.mjs';
import { open, sessionUrl, TALK } from './helpers/client.mjs';
import { center, click, editorPage, press } from './helpers/editor.mjs';
import { startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const tools = findTools();
const WITHOUT_TEX = !tools.latex || !tools.dvisvgm ? 'latex and dvisvgm are not installed, as on the test runners of CI' : false;
const E = 'window.BeesonEditor';

let browser;
before(async () => {
  browser = await launch({ offline: false });
});
after(() => browser?.close());

const wait = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const message = (page) => page.evaluate(`${E}.status().message`);
const labels = (page) => page.evaluate(`[...[...document.querySelectorAll('[role=menu]')].at(-1).querySelectorAll('[role^=menuitem]')].map((r) => r.textContent.trim())`);
async function row(page, text) {
  const at = await page.evaluate(`(() => {
    const r = [...[...document.querySelectorAll('[role=menu]')].at(-1).querySelectorAll('[role^=menuitem]')].find((r) => r.textContent.trim().startsWith(${JSON.stringify(text)}));
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  assert.ok(at, `the open menu does not have a row ${text}`);
  await click(page, at);
  await wait(page);
}

test('Insert > TikZ Figure is a submenu after Video… and in the list of the Media button, and tells how to start the edit command without a session', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: 'test/pages/tikz.html', clear: true, page: { width: 1440, height: 900 } });
  t.after(() => page.close());
  const menu = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menubar button')].find((x) => x.textContent === 'Insert'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, menu);
  await wait(page);
  const items = await labels(page);
  const video = items.findIndex((l) => l.startsWith('Video…'));
  assert.ok(video >= 0, items.join(' | '));
  assert.ok(items[video + 1].startsWith('TikZ Figure'), items.join(' | '));
  await row(page, 'TikZ Figure');
  assert.deepEqual((await labels(page)).map((l) => l.replace(/\s+/g, ' ')), ['From Data…', 'From File…', 'Blank']);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait(page);

  await click(page, await center(page, '[aria-label="Media options"]'));
  await wait(page);
  const media = await labels(page);
  assert.equal(media.filter((l) => l.startsWith('TikZ Figure')).length, 1, media.join(' | '));
  assert.ok(!media.some((l) => l === 'Blank'), media.join(' | '));
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait(page);

  const text = await page.evaluate(`${E}.render()`);
  for (const id of ['insert.tikzData', 'insert.tikzFile', 'insert.tikzBlank']) {
    await page.evaluate(`${E}.exec(${JSON.stringify(id)})`);
    await wait(page);
    assert.match(await message(page), /^TikZ figures are compiled only while the edit command runs\. Start it with Edit\.command, Edit\.cmd, or Edit\.sh next to the deck, or with npm run edit/);
    assert.equal(await page.evaluate(`${E}.render()`), text);
  }

  await page.evaluate('Reveal.slide(3)');
  await wait(page);
  const error = `document.querySelector('.reveal .slides > section.present .tikz[data-figure="missing"] .tikz-error')?.textContent`;
  assert.equal(await page.evaluate(error), 'figure missing is not compiled: run npm run tex');
  await page.evaluate(`Beeson.figures.compiling('missing')`);
  assert.equal(await page.evaluate(error), 'figure missing is being compiled');
  await page.evaluate(`Beeson.figures.compiling(null)`);
  assert.equal(await page.evaluate(error), 'figure missing is not compiled: run npm run tex');
});

async function session(t, { tex = true } = {}) {
  const folder = talkFolder(t, TALK);
  for (const dir of ['theme', 'brand', 'styles']) if (existsSync(dir)) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  mkdirSync(join(folder.root, 'no-tex'));
  const edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config, ...(tex ? {} : { BEESON_TEXBIN: join(folder.root, 'no-tex') }) } });
  t.after(async () => {
    await stopEdit(edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  const page = await open(browser, sessionUrl(edit), { name: 'Ann' });
  t.after(() => page.close());
  await front(page);
  await page.waitFor(`!!window.BeesonSession.client().figures`);
  const read = (name) => (existsSync(join(folder.talk, name)) ? readFileSync(join(folder.talk, name), 'utf8') : null);
  return { page, read, talk: folder.talk };
}

test('Insert > TikZ Figure tells that TeX is not found on the computer of the host', { timeout: 120000 }, async (t) => {
  const { page, read } = await session(t, { tex: false });
  for (const id of ['insert.tikzData', 'insert.tikzFile', 'insert.tikzBlank']) {
    await page.evaluate(`${E}.exec(${JSON.stringify(id)})`);
    await wait(page);
    assert.equal(await message(page), 'TeX with latex and dvisvgm is not found on the computer of the host');
  }
  assert.equal(read('figures/figure.tex'), null);
});

const file = (text, name) => `{ files: [new File([${JSON.stringify(text)}], ${JSON.stringify(name)})] }`;
const TAG = (name) => new RegExp(`<div class="tikz" data-figure="${name}" style="width: 800px; height: 600px(; translate: -?\\d+px -?\\d+px)?"></div>`);

test('From File…, From Data…, and Blank write a source under a free name and put a figure of 800 by 600 px on the slide, which the edit command compiles', { skip: WITHOUT_TEX, timeout: 240000 }, async (t) => {
  const { page, read } = await session(t);
  const drawn = (name) => page.waitFor(`!!document.querySelector('.reveal .slides .tikz[data-figure="${name}"] > svg') && !!window.beesonFigures?.[${JSON.stringify(name)}]`, 60_000);

  const orbit = '\\begin{tikzpicture}\n\\draw[accent] (0,0) circle (1);\n\\end{tikzpicture}\n';
  await page.evaluate(`${E}.exec('insert.tikzFile', ${file(orbit, 'Orbit.tex')})`);
  await until(() => TAG('orbit').test(read('index.html')), 'index.html to hold the figure orbit');
  assert.equal(read('figures/orbit.tex'), orbit);
  assert.deepEqual(await page.evaluate(`${E}.selection().map((e) => e.dataset.figure)`), ['orbit']);
  await drawn('orbit');

  const csv = 't,x,y pos\n0,1,0\n1,0.5,0.2\n2,0.25,0.3\n';
  await page.evaluate(`${E}.exec('insert.tikzData', ${file(csv, 'decay.csv')})`);
  await until(() => TAG('decay').test(read('index.html')), 'index.html to hold the figure decay');
  assert.equal(read('figures/decay.csv'), csv);
  assert.equal(read('figures/decay.tex'), writeFigure(fromHeader('figures/decay.csv', ['t', 'x', 'y pos'])));
  await drawn('decay');
  assert.deepEqual(await page.evaluate('window.beesonFigures.decay.parts'), ['x', 'y-pos']);
  assert.ok(!read('index.html').includes('data-part'));

  await page.evaluate(`${E}.exec('insert.tikzFile', ${file(orbit, 'orbit.tex')})`);
  await until(() => TAG('orbit-2').test(read('index.html')), 'index.html to hold the figure orbit-2');
  await page.evaluate(`${E}.exec('insert.tikzBlank')`);
  await page.waitFor(`document.querySelector('dialog.beeson-edit-tikz')?.open && document.querySelector('dialog.beeson-edit-tikz textarea').value !== ''`);
  await press(page, 'Mod+Enter');
  await until(() => TAG('figure').test(read('index.html')), 'index.html to hold the figure figure');
  assert.match(read('figures/figure.tex'), /^\\begin\{tikzpicture\}[\s\S]*\\end\{tikzpicture\}\n$/);
  await drawn('figure');
  assert.deepEqual(page.errors.filter((e) => !/figures\/[\w-]+\.js/.test(e)), []);
});
