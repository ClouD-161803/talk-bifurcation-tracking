import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, press, saveAndReopen } from './helpers/editor.mjs';

const PLATFORMS = ['mac', 'other'];
const PANEL = '#beeson-edit-panel-format';
const LEAD = 'LaTeX in equation boxes.';
const SPANNED = 'LaTeX in <span class="hl-equation-boxes">equation boxes</span>.';
const STEP2 = '<p class="fragment" data-fragment-index="2">';
const STEP3 = '<p class="fragment" data-fragment-index="3" data-highlight="coriolis">';
const STEP4 = '<p class="fragment" data-fragment-index="4" data-highlight="potential" data-tone="violet">';

let browser;
let server;
before(async () => {
  browser = await launch({ offline: false });
  server = await serve('.');
});
after(async () => {
  await browser?.close();
  server?.close();
});

const js = (v) => JSON.stringify(v);
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');

async function open(t, platform) {
  const page = await browser.newPage();
  t.after(() => page.close().catch(() => {}));
  const url = `${server.origin}/test-deck.html?edit&still&edit-platform=${platform}`;
  await page.goto(url);
  await page.evaluate('localStorage.clear()');
  await page.goto(url);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync('test-deck.html', 'utf8');
  assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`)).problems, []);
  const n = await page.evaluate(`Reveal.getSlides().findIndex((s) => s.querySelector('h2')?.textContent === 'Equations are first class citizens')`);
  assert.ok(n >= 0, 'the slide of stepped math is not in the deck');
  await page.evaluate(`Reveal.slide(${n})`);
  await page.waitFor(`Reveal.getCurrentSlide().querySelector('h2')?.textContent === 'Equations are first class citizens'`);
  return page;
}

async function selectWords(page, words) {
  await page.evaluate(`(() => {
    document.activeElement?.blur();
    const p = [...Reveal.getCurrentSlide().querySelectorAll('p')].find((p) => p.textContent.includes(${js(words)}));
    const n = [...p.querySelectorAll('*'), p].flatMap((el) => [...el.childNodes]).find((n) => n.nodeType === 3 && n.data.includes(${js(words)}));
    p.closest('[contenteditable="true"]').focus();
    const at = n.data.indexOf(${js(words)});
    getSelection().setBaseAndExtent(n, at, n, at + ${js(words)}.length);
  })()`);
  await frames(page);
}

async function textPane(page) {
  if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
  await page.waitFor(`!!document.querySelector('${PANEL} [aria-label="Step of the color"]')`);
}

async function choose(page, label) {
  const item = `[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].find((i) => i.textContent.trim().startsWith(${js(label)}))`;
  await page.waitFor(`!!${item}`);
  const at = await page.evaluate(`(() => { const r = ${item}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, at);
  await frames(page);
}

const listed = (page) => page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-colored li')].map((l) => l.querySelector('.sym').textContent + ': ' + l.querySelector('.at').textContent)`);

let saves = 0;
async function roundTrip(page) {
  const edited = await render(page);
  assert.notEqual(edited, page.source, 'the edit did not change the text');
  await page.evaluate('window.BeesonEditor.undo()');
  await byteExact(page);
  await page.evaluate('window.BeesonEditor.redo()');
  assert.equal(await render(page), edited);
  const { text } = await saveAndReopen(page, `step-color-${++saves}.html`);
  assert.equal(text, edited);
  page.source = text;
}

for (const platform of PLATFORMS) {
  test(`words colored violet at step 2 in the Text pane are a span of a class that the paragraph of step 2 highlights (${platform})`, async (t) => {
    const page = await open(t, platform);
    await selectWords(page, 'equation boxes');
    await textPane(page);
    assert.equal(await page.evaluate(`document.querySelector('${PANEL} [aria-label="Step of the color"]').textContent`), 'From the Start');
    await click(page, `${PANEL} [aria-label="Step of the color"]`);
    await choose(page, 'Step 2');
    const dimmed = await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-swatches button:disabled')].map((b) => b.title)`);
    assert.deepEqual(dimmed, ['Text', 'Subtle', 'Muted']);
    await click(page, `${PANEL} .ed-swatches [data-command="text.tone.violet"]`);
    await page.waitFor(`!!Reveal.getCurrentSlide().querySelector('span.hl-equation-boxes')`);
    await byteExact(page, [
      [LEAD, SPANNED],
      [STEP2, '<p class="fragment" data-fragment-index="2" data-highlight="hl-equation-boxes" data-tone="violet">'],
    ]);
    assert.equal((await state(page, 'edit.undo')).label, 'Undo Color Words at Step');
    await page.waitFor(`Reveal.getCurrentSlide().querySelector('span.hl-equation-boxes').classList.contains('hl-target')`);
    await selectWords(page, 'equation');
    await page.waitFor(`document.querySelectorAll('${PANEL} .ed-colored li').length === 1`);
    assert.deepEqual(await listed(page), ['equation boxes: Violet, Step 2']);
    await roundTrip(page);
    await selectWords(page, 'equation');
    await textPane(page);
    await page.waitFor(`!!document.querySelector('${PANEL} .ed-colored button')`);
    await click(page, `${PANEL} .ed-colored button`);
    await page.waitFor(`!Reveal.getCurrentSlide().querySelector('span.hl-equation-boxes')`);
    await byteExact(page, [
      [SPANNED, LEAD],
      ['<p class="fragment" data-fragment-index="2" data-highlight="hl-equation-boxes" data-tone="violet">', STEP2],
    ]);
    assert.deepEqual(page.errors, []);
  });
}

test('a step chosen for the words of one slide is not kept for the words of another slide', async (t) => {
  const page = await open(t, 'mac');
  await selectWords(page, 'equation boxes');
  await textPane(page);
  await click(page, `${PANEL} [aria-label="Step of the color"]`);
  await choose(page, 'Step 2');
  await page.waitFor(`document.querySelector('${PANEL} [aria-label="Step of the color"]').textContent.startsWith('Step 2')`);
  const n = await page.evaluate(`Reveal.getSlides().findIndex((s, i) => i !== Reveal.getIndices().h && !!s.querySelector(':scope > p') && !s.querySelector('.fragment'))`);
  await page.evaluate(`Reveal.slide(${n})`);
  await page.waitFor(`Reveal.getIndices().h === ${n}`);
  const words = await page.evaluate(`Reveal.getCurrentSlide().querySelector(':scope > p').firstChild.data.trim().split(' ')[0]`);
  await selectWords(page, words);
  await textPane(page);
  await frames(page);
  assert.equal(await page.evaluate(`document.querySelector('${PANEL} [aria-label="Step of the color"]').textContent`), 'From the Start');
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-swatches button:disabled')].map((b) => b.title)`), []);
});

test('after a color at a new step, the next color is set at the step that was made', async (t) => {
  const page = await open(t, 'mac');
  const n = await page.evaluate(`Reveal.getSlides().findIndex((s) => s.querySelector('h2')?.textContent === 'Figures are first class citizens, too')`);
  await page.evaluate(`Reveal.slide(${n})`);
  await page.waitFor(`Reveal.getIndices().h === ${n}`);
  const button = `document.querySelector('${PANEL} [aria-label="Step of the color"]')`;
  const colored = `Reveal.getCurrentSlide().querySelector('[data-highlight="hl-matplotlib-figure"]')`;
  await selectWords(page, 'matplotlib figure');
  await textPane(page);
  await click(page, `${PANEL} [aria-label="Step of the color"]`);
  await choose(page, 'New Step');
  await page.waitFor(`${button}.textContent.startsWith('New Step')`);
  await click(page, `${PANEL} .ed-swatches [data-command="text.tone.violet"]`);
  await page.waitFor(`${colored}?.dataset.tone === 'violet'`);
  await page.waitFor(`/^Step \\d/.test(${button}.textContent)`);
  await page.waitFor(`document.querySelector('${PANEL} .ed-swatches [data-command="text.tone.violet"]').getAttribute('aria-pressed') === 'true'`);
  await selectWords(page, 'matplotlib figure');
  await click(page, `${PANEL} .ed-swatches [data-command="text.tone.red"]`);
  await page.waitFor(`${colored}?.dataset.tone === 'red'`);
  assert.match(await page.evaluate(`${button}.textContent`), /^Step \d/);
  assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-swatches [data-command="text.tone.red"]').getAttribute('aria-pressed')`), 'true');
  assert.deepEqual(page.errors, []);
});

test('Format > Text Color > Color at a Step… opens the steps of the Text pane, and a step of another color is refused', async (t) => {
  const page = await open(t, 'mac');
  await selectWords(page, 'equation boxes');
  await exec(page, 'text.color');
  await page.waitFor(`[...document.querySelectorAll('.beeson-edit-menu [role^="menuitem"]')].some((i) => i.textContent.trim() === 'From the Start')`);
  await press(page, 'Escape');
  await assert.rejects(exec(page, 'text.color', { tone: 'violet', step: 2 }), /Orange/);
  await byteExact(page);
  await selectWords(page, 'equation boxes');
  await exec(page, 'text.color', { tone: 'accent', step: 2 });
  const joined = '<p class="fragment" data-fragment-index="3" data-highlight="coriolis hl-equation-boxes">';
  await byteExact(page, [[LEAD, SPANNED], [STEP3, joined]]);
  await roundTrip(page);
  await selectWords(page, 'equation boxes');
  await exec(page, 'text.color', { tone: 'violet', step: 3 });
  await byteExact(page, [
    [joined, STEP3],
    [STEP4, '<p class="fragment" data-fragment-index="4" data-highlight="potential hl-equation-boxes" data-tone="violet">'],
  ]);
  await roundTrip(page);
  assert.deepEqual(page.errors, []);
});

test('two text elements selected as objects are colored at a step with one class, as one entry of the history', async (t) => {
  const page = await open(t, 'other');
  await clickText(page, await center(page, '.reveal section.present > p:not(.fragment)'));
  await press(page, 'Escape');
  const step2 = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector('p[data-fragment-index="2"]').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
  await click(page, step2, { modifiers: 'Shift' });
  assert.deepEqual(await page.evaluate('window.BeesonEditor.selection().map((el) => el.localName)'), ['p', 'p']);
  await exec(page, 'text.color', { tone: 'violet', step: 3 });
  const edited = await render(page);
  const name = /<p class="fragment" data-fragment-index="4" data-highlight="potential ([a-z0-9-]+)" data-tone="violet">/.exec(edited)?.[1];
  assert.ok(name?.startsWith('hl-'), 'the paragraph of step 4 does not highlight a new class');
  assert.equal(edited.split(`<span class="${name}">`).length, 3, 'the two paragraphs are not wrapped in spans of the class');
  await roundTrip(page);
  assert.deepEqual(page.errors, []);
});
