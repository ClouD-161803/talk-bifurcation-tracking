import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { findTools } from '../scripts/figures.mjs';
import { front } from './helpers/apply.mjs';
import { C, open, sessionUrl, TALK } from './helpers/client.mjs';
import { center, click, press } from './helpers/editor.mjs';
import { startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const tools = findTools();
const WITHOUT_TEX = !tools.latex || !tools.dvisvgm ? 'latex and dvisvgm are not installed, as on the test runners of CI' : false;
const E = 'window.BeesonEditor';
const ORBIT = '\\begin{tikzpicture}\n\\draw[accent] (0,0) circle (1);\n\\end{tikzpicture}\n';
const DECK = TALK.replace('<p>First slide</p>', '<p>First slide</p>\n  <div class="tikz" data-figure="orbit" style="width: 600px; height: 400px; translate: 0px 120px"></div>');
const SHEET = 'dialog.beeson-edit-tikz';
const FIGURE = '.reveal .slides > section.present .tikz[data-figure="orbit"]';
const DRAWN = `document.querySelector('${FIGURE} > svg')?.outerHTML ?? ''`;

let browser;
before(async () => {
  browser = await launch({ offline: false });
});
after(() => browser?.close());

const wait = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const typeSource = (page, text) => page.evaluate(`(() => { const t = document.querySelector('${SHEET} textarea'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })); })()`);
const sheet = (page) => page.evaluate(`(() => {
  const d = document.querySelector('${SHEET}');
  if (!d?.open) return null;
  return {
    source: d.querySelector('textarea').value,
    hint: d.querySelector('.hint')?.textContent ?? '',
    buttons: [...d.querySelectorAll('button')].filter((b) => b.offsetWidth).map((b) => b.textContent),
    errors: [...d.querySelectorAll('.errors li')].map((li) => li.textContent),
    marked: [...d.querySelectorAll('.gutter .error')].map((l) => l.textContent),
    note: d.querySelector('.note')?.textContent ?? '',
  };
})()`);
async function button(page, label) {
  const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('${SHEET} button')].find((b) => b.textContent === ${JSON.stringify(label)} && b.offsetWidth); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  assert.ok(at, `the sheet does not show a button ${label}`);
  await click(page, at);
  await wait(page);
}

async function session(t, deck = DECK) {
  const folder = talkFolder(t, deck);
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  mkdirSync(join(folder.talk, 'figures'));
  writeFileSync(join(folder.talk, 'figures', 'orbit.tex'), ORBIT);
  const edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config } });
  t.after(async () => {
    await stopEdit(edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  const read = (name) => readFileSync(join(folder.talk, name), 'utf8');
  const write = (name, text) => writeFileSync(join(folder.talk, name), text);
  return { edit, read, write, remove: (name) => unlinkSync(join(folder.talk, name)) };
}

async function page(t, edit, options = {}) {
  const p = await open(browser, sessionUrl(edit), { name: 'Ann', ...options });
  t.after(() => p.close());
  await front(p);
  await p.waitFor(`!!window.beesonFigures?.orbit && !!document.querySelector('${FIGURE} > svg')`, 60_000);
  return p;
}

test('Edit Source shows the source, draws a preview on a pause in typing, lists its errors at their lines, and draws the output again at Cancel', { skip: WITHOUT_TEX, timeout: 240000 }, async (t) => {
  const { edit, read } = await session(t);
  const p = await page(t, edit);
  await click(p, await center(p, FIGURE));
  await wait(p);
  await p.evaluate(`${E}.exec('format.tikzSource')`);
  await p.waitFor(`document.querySelector('${SHEET}')?.open && document.querySelector('${SHEET} textarea').value !== ''`);
  const shown = await sheet(p);
  assert.equal(shown.source, ORBIT);
  assert.match(shown.hint, /^(⌘↩|Ctrl\+Enter) to apply, Esc to cancel$/);
  assert.deepEqual(shown.buttons.filter((b) => b === 'Cancel' || b === 'Apply'), ['Cancel', 'Apply']);
  assert.equal(await p.evaluate(`getComputedStyle(document.querySelector('${SHEET} textarea')).fontFamily.includes('monospace')`), true);

  const output = await p.evaluate(DRAWN);
  await typeSource(p, '\\begin{tikzpicture}\n\\undefinedmacro\n\\end{tikzpicture}\n');
  await p.waitFor(`document.querySelectorAll('${SHEET} .errors li').length > 0`, 60_000);
  const failed = await sheet(p);
  assert.match(failed.errors[0], /^Line 2: Undefined control sequence/);
  assert.deepEqual(failed.marked, ['2']);
  assert.equal(await p.evaluate(DRAWN), output);

  await typeSource(p, '\\begin{tikzpicture}\n\\draw[blue] (0,0) rectangle (3,1);\n\\end{tikzpicture}\n');
  await p.waitFor(`(${DRAWN}) !== ${JSON.stringify(output)} && (${DRAWN}) !== ''`, 60_000);
  assert.deepEqual((await sheet(p)).errors, []);
  await press(p, 'Escape');
  await wait(p);
  assert.equal(await sheet(p), null);
  assert.equal(await p.evaluate(DRAWN), output);
  assert.equal(read('figures/orbit.tex'), ORBIT);
  assert.deepEqual(p.errors.filter((e) => !/figures\/[\w-]+\.js/.test(e)), []);
});

test('Apply writes the source over the text that the sheet opened with, and offers the text of another person who changed it since', { skip: WITHOUT_TEX, timeout: 240000 }, async (t) => {
  const { edit, read, write } = await session(t);
  const p = await page(t, edit);
  const hash = await p.evaluate('window.beesonFigures.orbit.hash');
  await click(p, await center(p, FIGURE), { count: 2 });
  await p.waitFor(`document.querySelector('${SHEET}')?.open && document.querySelector('${SHEET} textarea').value !== ''`);
  const square = '\\begin{tikzpicture}\n\\draw[violet] (0,0) rectangle (2,2);\n\\end{tikzpicture}\n';
  await typeSource(p, square);
  await press(p, 'Mod+Enter');
  await until(() => read('figures/orbit.tex') === square, 'the source to be written');
  assert.equal(await sheet(p), null);
  await p.waitFor(`window.beesonFigures.orbit.hash !== ${JSON.stringify(hash)}`, 60_000);

  await p.evaluate(`${E}.exec('format.tikzSource')`);
  await p.waitFor(`document.querySelector('${SHEET}')?.open && document.querySelector('${SHEET} textarea').value === ${JSON.stringify(square)}`);
  const theirs = square.replace('violet', 'red');
  write('figures/orbit.tex', theirs);
  const mine = square.replace('violet', 'blue');
  await typeSource(p, mine);
  await button(p, 'Apply');
  await p.waitFor(`/changed/.test(document.querySelector('${SHEET} .note')?.textContent ?? '')`);
  const asked = await sheet(p);
  assert.equal(asked.note, 'Someone else changed figures/orbit.tex since this sheet opened. Use their text, or apply yours over it.');
  assert.equal(read('figures/orbit.tex'), theirs);
  await button(p, 'Use Their Text');
  assert.equal((await sheet(p)).source, theirs);
  await typeSource(p, theirs.replace('(2,2)', '(3,2)'));
  await button(p, 'Apply');
  await until(() => read('figures/orbit.tex') === theirs.replace('(2,2)', '(3,2)'), 'the source to be written over their text');
  assert.equal(await sheet(p), null);
});

test('after Apply the slide shows the last good output when the compile of the source fails, and a preview is compiled in the box of the style', { skip: WITHOUT_TEX, timeout: 240000 }, async (t) => {
  const bare = '<div class="tikz" data-figure="bare" style="translate: 700px -300px"></div>';
  const { edit, read, write, remove } = await session(t, DECK.replace('translate: 0px 120px"></div>', `translate: 0px 120px"></div>\n  ${bare}`));
  write('figures/part.tex', '\\draw[blue] (0,0) rectangle (3,1);\n');
  write('figures/bare.tex', ORBIT);
  const p = await page(t, edit);
  const output = await p.evaluate(DRAWN);
  await p.evaluate(`(() => {
    window.boxes = [];
    const send = window.fetch;
    window.fetch = (url, options) => {
      if (String(url).includes('figures/preview')) window.boxes.push(JSON.parse(options.body).box);
      return send(url, options);
    };
  })()`);
  await click(p, await center(p, FIGURE));
  await wait(p);
  await p.evaluate(`${E}.exec('format.tikzSource')`);
  await p.waitFor(`document.querySelector('${SHEET}')?.open && document.querySelector('${SHEET} textarea').value !== ''`);
  const input = '\\begin{tikzpicture}\n\\input{figures/part.tex}\n\\end{tikzpicture}\n';
  await typeSource(p, input);
  await p.waitFor(`(${DRAWN}) !== ${JSON.stringify(output)} && (${DRAWN}) !== ''`, 60_000);
  assert.deepEqual(await p.evaluate('window.boxes'), [{ width: 600, height: 400 }]);

  remove('figures/part.tex');
  await button(p, 'Apply');
  await until(() => read('figures/orbit.tex') === input, 'the source to be written');
  await p.waitFor(`${C}.figures?.errors.orbit?.length > 0 && ${C}.figures.compiling === null`, 60_000);
  await p.waitFor(`(${DRAWN}) === ${JSON.stringify(output)}`, 10_000);

  await p.evaluate(`${C}.app.selection.set('elements', [document.querySelector('.reveal .slides > section.present .tikz[data-figure="bare"]')])`);
  await p.evaluate(`${E}.exec('format.tikzSource')`);
  await p.waitFor(`document.querySelector('${SHEET}')?.open && document.querySelector('${SHEET} textarea').value !== ''`);
  await typeSource(p, ORBIT.replace('accent', 'blue'));
  await p.waitFor('window.boxes.length === 2', 60_000);
  assert.deepEqual(await p.evaluate('window.boxes[1]'), { width: null, height: null });
  await press(p, 'Escape');
});

test('Blank opens the sheet with Insert, which writes the source and puts the figure on the slide, and whose Cancel leaves neither, and the sheet fits a phone', { skip: WITHOUT_TEX, timeout: 240000 }, async (t) => {
  const { edit, read } = await session(t);
  const p = await page(t, edit);
  const text = await p.evaluate(`${E}.render()`);
  const written = () => readdirSync(join(edit.folder, 'figures')).sort();
  const blank = async () => {
    await p.evaluate(`${E}.exec('insert.tikzBlank')`);
    await p.waitFor(`document.querySelector('${SHEET}')?.open && document.querySelector('${SHEET} textarea').value !== ''`);
    assert.deepEqual((await sheet(p)).buttons.filter((b) => b === 'Cancel' || b === 'Insert'), ['Cancel', 'Insert']);
    assert.equal(await p.evaluate(`${E}.render()`), text);
  };
  const before = written();
  await blank();
  await button(p, 'Cancel');
  assert.equal(await sheet(p), null);
  assert.equal(await p.evaluate(`${E}.render()`), text);
  assert.deepEqual(written(), before);

  await blank();
  const source = (await sheet(p)).source;
  await button(p, 'Insert');
  await until(() => /<div class="tikz" data-figure="figure" style="width: 800px; height: 600px/.test(read('index.html')), 'index.html to hold the figure figure');
  assert.equal(read('figures/figure.tex'), source);
  assert.equal(await sheet(p), null);
  assert.deepEqual(await p.evaluate(`${E}.selection().map((e) => e.dataset.figure)`), ['figure']);

  const phone = await page(t, edit, { name: 'Ben', width: 390, height: 844, mobile: true });
  await phone.evaluate(`${C}.app.selection.set('elements', [document.querySelector('${FIGURE}')])`);
  await wait(phone);
  await phone.evaluate(`${E}.exec('format.tikzSource')`);
  await phone.waitFor(`document.querySelector('${SHEET}')?.open && document.querySelector('${SHEET} textarea').value !== ''`);
  const fit = await phone.evaluate(`(() => {
    const d = document.querySelector('${SHEET}').getBoundingClientRect();
    const t = document.querySelector('${SHEET} textarea').getBoundingClientRect();
    const b = [...document.querySelectorAll('${SHEET} button')].filter((b) => b.offsetWidth).map((b) => b.getBoundingClientRect());
    return { left: d.left, right: d.right, width: innerWidth, field: t.width, buttons: b.every((r) => r.right <= innerWidth && r.left >= 0) };
  })()`);
  assert.ok(fit.left >= 0 && fit.right <= fit.width, JSON.stringify(fit));
  assert.ok(fit.field > 250 && fit.buttons, JSON.stringify(fit));
});
