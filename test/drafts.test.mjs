import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';
import { byteExact, clickText, contrast, editorPage, GROUND, INK, press } from './helpers/editor.mjs';

const DECK = 'test/pages/drafts.html';
const FINISHED = '<section>\n      <h2>A finished slide</h2>';
const LAST = '<section>\n      <h2>The last slide</h2>';

let browser;
before(async () => {
  browser = await launch();
});
after(() => browser?.close());

async function open(t, { platform = 'mac', theme = 'dark', page } = {}) {
  const p = await editorPage(browser, { deck: DECK, query: `edit&still&theme=${theme}&edit-platform=${platform}`, page });
  t.after(() => p.close());
  return p;
}

const js = (v) => JSON.stringify(v);
const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${arg}`})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const SLIDE_CHIP = `document.querySelector('.beeson-draft-chip.on-slide')`;
const chipsIn = (rows) => `[...document.querySelectorAll('${rows}')].map((r) => !!r.querySelector('.beeson-draft-chip')?.getClientRects().length)`;

async function showNavigator(page) {
  await page.evaluate(`document.documentElement.classList.contains('beeson-nav') || window.BeesonEditor.exec('view.navigator')`);
  await page.waitFor(`document.querySelectorAll('.beeson-edit-nav .row').length === 4`);
}

async function row(page, n, modifiers = '') {
  const at = await page.evaluate(`(() => {
    const r = document.querySelectorAll('.beeson-edit-nav .row')[${n}];
    r.scrollIntoView({ block: 'nearest' });
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  await clickText(page, at, { modifiers });
  await frames(page);
}

const chipLook = (page, chip) => page.evaluate(`(() => {
  const chip = ${chip};
  const r = chip.getBoundingClientRect();
  return { ink: ${INK}(chip), ground: getComputedStyle(chip).backgroundColor, text: chip.textContent, box: [r.left, r.top, r.right, r.bottom] };
})()`);

for (const theme of ['dark', 'light']) {
  test(`the chip Draft is drawn on a draft, on its thumbnail, and on its tile in Slide Sorter, and can be read in the ${theme} mode`, { timeout: 120000 }, async (t) => {
    const page = await open(t, { theme });
    await showNavigator(page);
    assert.equal(await page.evaluate(`${SLIDE_CHIP}.hidden`), true);
    await page.evaluate('Reveal.slide(1)');
    await page.waitFor(`!${SLIDE_CHIP}.hidden`);
    const look = await chipLook(page, SLIDE_CHIP);
    assert.equal(look.text, 'Draft');
    assert.ok(contrast(look.ink, look.ground) >= 4.5, `${look.ink} on ${look.ground}`);
    const slide = await page.evaluate(`(() => { const r = document.querySelector('.reveal:not(.beeson-peek)').getBoundingClientRect(); const c = document.querySelector('.beeson-edit-canvas').getBoundingClientRect(); return [r.left, c.top, r.right, r.bottom]; })()`);
    assert.ok(look.box[0] >= slide[0] && look.box[1] >= slide[1] && look.box[2] <= slide[2] && look.box[3] <= slide[3], `${look.box} inside ${slide}`);
    assert.deepEqual(await page.evaluate(chipsIn('.beeson-edit-nav .row')), [false, true, false, false]);
    const nav = await chipLook(page, `document.querySelectorAll('.beeson-edit-nav .row')[1].querySelector('.beeson-draft-chip')`);
    assert.ok(contrast(nav.ink, nav.ground) >= 4.5, `${nav.ink} on ${nav.ground}`);
    assert.match(await page.evaluate(`document.querySelectorAll('.beeson-edit-nav .row')[1].getAttribute('aria-label')`), /, draft/);
    await page.evaluate('Reveal.slide(0)');
    await page.waitFor(`${SLIDE_CHIP}.hidden`);
    await exec(page, 'view.lightTable');
    await page.waitFor(`document.querySelectorAll('.beeson-edit-sorter .tile').length === 4`);
    assert.deepEqual(await page.evaluate(chipsIn('.beeson-edit-sorter .tile')), [false, true, true, false]);
    assert.deepEqual(page.errors, []);
  });
}

test('the chip Draft is drawn over the slide, inside the canvas, on a phone', { timeout: 120000 }, async (t) => {
  const page = await open(t, { page: { width: 390, height: 844, mobile: true } });
  await page.evaluate('Reveal.slide(1)');
  await page.waitFor(`!${SLIDE_CHIP}.hidden`);
  const look = await chipLook(page, SLIDE_CHIP);
  const slide = await page.evaluate(`(() => { const r = document.querySelector('.reveal:not(.beeson-peek)').getBoundingClientRect(); const c = document.querySelector('.beeson-edit-canvas').getBoundingClientRect(); return [Math.max(0, r.left), c.top, Math.min(innerWidth, r.right), r.bottom]; })()`);
  assert.equal(await page.evaluate('innerWidth'), 390);
  assert.ok(look.box[0] >= slide[0] && look.box[1] >= slide[1] && look.box[2] <= slide[2] && look.box[3] <= slide[3], `${look.box} inside ${slide}`);
  assert.ok(look.box[3] - look.box[1] >= 12, `${look.box}`);
  assert.deepEqual(page.errors, []);
});

for (const platform of ['mac', 'other']) {
  test(`Set as Draft and its key write data-draft on every selected slide as one change of the history, and show its state (${platform})`, { timeout: 120000 }, async (t) => {
    const page = await open(t, { platform });
    await showNavigator(page);
    await row(page, 0);
    await exec(page, 'slide.selectAll');
    assert.equal((await state(page, 'slide.draft')).checked, false);
    await exec(page, 'slide.draft');
    await byteExact(page, [[FINISHED, FINISHED.replace('<section>', '<section data-draft>')], [LAST, LAST.replace('<section>', '<section data-draft>')]]);
    assert.deepEqual(await state(page, 'slide.draft'), { id: 'slide.draft', label: 'Set as Draft', enabled: true, checked: true });
    await page.waitFor(`${js([true, true, false, true])}.join() === ${chipsIn('.beeson-edit-nav .row')}.join()`);
    assert.equal((await state(page, 'edit.undo')).label, 'Undo Set as Draft');
    await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    await row(page, 1);
    await press(page, platform === 'mac' ? 'Mod+Alt+Shift+D' : 'Ctrl+Shift+D');
    await page.waitFor(`!document.querySelectorAll('.reveal .slides > section')[1].hasAttribute('data-draft')`);
    assert.equal((await state(page, 'slide.draft')).checked, false);
    assert.doesNotMatch(await page.evaluate('window.BeesonEditor.render()'), /<section data-draft>\n {6}<h2>A {3}draft/);
    assert.deepEqual(page.errors, []);
  });
}

test('a duplicate of a draft is a draft, and a draft cut and pasted stays a draft', { timeout: 120000 }, async (t) => {
  const page = await open(t);
  await showNavigator(page);
  await row(page, 1);
  await exec(page, 'slide.duplicate');
  await page.waitFor(`document.querySelectorAll('.reveal .slides > section').length === 5`);
  const drafts = `[...document.querySelectorAll('.reveal .slides > section')].map((s) => s.hasAttribute('data-draft'))`;
  assert.deepEqual(await page.evaluate(drafts), [false, true, true, true, false]);
  assert.equal((await page.evaluate('window.BeesonEditor.render()')).split('<section data-draft>\n      <h2>A   draft').length, 3);
  await row(page, 1);
  await page.evaluate(`window.__clip = new DataTransfer()`);
  await exec(page, 'slide.cut', 'window.__clip');
  await page.waitFor(`document.querySelectorAll('.reveal .slides > section').length === 4`);
  await row(page, 3);
  await exec(page, 'slide.paste', `window.__clip.getData('text/plain')`);
  await page.waitFor(`document.querySelectorAll('.reveal .slides > section').length === 5`);
  assert.deepEqual(await page.evaluate(drafts), [false, true, true, false, true]);
  assert.deepEqual(page.errors, []);
});

test('a draft is shown in the show like any other slide, and the theme does not draw the chip', { timeout: 120000 }, async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(deckUrl(DECK, 'still'));
  await page.waitFor(deckSettled);
  assert.equal(await page.evaluate('Reveal.getTotalSlides()'), 3);
  assert.equal(await page.evaluate(`!!document.querySelector('.beeson-draft-chip')`), false);
  assert.doesNotMatch(readFileSync('theme/beeson.js', 'utf8'), /data-draft|beeson-draft/);
  assert.deepEqual(page.errors, []);
});

test('the check prints a line for each draft and passes', { timeout: 600000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'beeson-drafts-'));
  try {
    const run = spawnSync(process.execPath, ['scripts/check.mjs', '--deck', DECK, '--themes', 'dark', '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(run.stdout.split('\n').filter((line) => line.startsWith('draft:')), ['draft: slide 2, A draft slide', 'draft: slide 3, A hidden draft']);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
