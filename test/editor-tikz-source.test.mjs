// the Edit Source sheet of a TikZ figure in a session: the source in a monospace field, opened from
// the Format menu and by a double click on the figure. a pause in typing draws a preview on the
// slide, or lists the errors at their lines, Cancel draws the output again, and Apply writes the
// source over the text that the sheet opened with, which another person may have changed since.
// Blank opens the sheet with Insert, whose Cancel takes the new figure off the slide. the sheet
// fits the screen of a phone. a test that runs TeX is skipped without latex and dvisvgm

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { findTools } from '../scripts/figures.mjs';
import { front } from './helpers/apply.mjs';
import { open, sessionUrl, TALK } from './helpers/client.mjs';
import { center, click, press } from './helpers/editor.mjs';
import { startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const tools = findTools();
const WITHOUT_TEX = !tools.latex || !tools.dvisvgm ? 'latex and dvisvgm are not installed, as on the test runners of CI' : false;
const E = 'window.BeesonEditor';
const ORBIT = '\\begin{tikzpicture}\n\\draw[accent] (0,0) circle (1);\n\\end{tikzpicture}\n';
const DECK = TALK.replace('<p>First slide</p>', '<p>First slide</p>\n  <div class="tikz" data-figure="orbit" style="width: 600px; height: 400px; translate: 0px 120px"></div>');
const SHEET = 'dialog.beeson-edit-tikz';
const FIGURE = '.reveal .slides > section.present .tikz[data-figure="orbit"]';
// the SVG drawn on the slide, which a preview replaces
const DRAWN = `document.querySelector('${FIGURE} > svg')?.outerHTML ?? ''`;

let browser;
before(async () => {
  browser = await launch({ offline: false });
});
after(() => browser?.close());

const wait = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
// the source typed into the field of the sheet
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

async function session(t) {
  const folder = talkFolder(t, DECK);
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
  return { edit, read, write };
}

async function page(t, edit, options = {}) {
  const p = await open(browser, sessionUrl(edit), { name: 'Ann', ...options });
  t.after(() => p.close());
  await front(p);
  // the edit command compiles the figure of the deck at its start
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
  // the output on the slide is kept while the source does not compile
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
  // a double click on the figure opens the sheet
  await click(p, await center(p, FIGURE), { count: 2 });
  await p.waitFor(`document.querySelector('${SHEET}')?.open && document.querySelector('${SHEET} textarea').value !== ''`);
  const square = '\\begin{tikzpicture}\n\\draw[violet] (0,0) rectangle (2,2);\n\\end{tikzpicture}\n';
  await typeSource(p, square);
  await press(p, 'Mod+Enter');
  await until(() => read('figures/orbit.tex') === square, 'the source to be written');
  assert.equal(await sheet(p), null);
  await p.waitFor(`window.beesonFigures.orbit.hash !== ${JSON.stringify(hash)}`, 60_000);

  // someone else writes the source while the sheet is open
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

test('Blank opens the sheet with Insert, whose Cancel takes the new figure off the slide, and the sheet fits a phone', { skip: WITHOUT_TEX, timeout: 240000 }, async (t) => {
  const { edit } = await session(t);
  const p = await page(t, edit);
  const text = await p.evaluate(`${E}.render()`);
  await p.evaluate(`${E}.exec('insert.tikzBlank')`);
  await p.waitFor(`document.querySelector('${SHEET}')?.open && document.querySelector('${SHEET} textarea').value !== ''`);
  assert.deepEqual((await sheet(p)).buttons.filter((b) => b === 'Cancel' || b === 'Insert'), ['Cancel', 'Insert']);
  assert.match(await p.evaluate(`${E}.render()`), /data-figure="figure"/);
  await button(p, 'Cancel');
  assert.equal(await sheet(p), null);
  await p.waitFor(`${E}.render() === ${JSON.stringify(text)}`);

  const phone = await page(t, edit, { name: 'Ben', width: 390, height: 844, mobile: true });
  await click(phone, await center(phone, FIGURE));
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
