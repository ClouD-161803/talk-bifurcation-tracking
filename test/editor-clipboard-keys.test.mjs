// the clipboard keys ⌘C, ⌘X, and ⌘V, or Ctrl with the letter, act on the selected elements as Cut,
// Copy, and Paste of the Edit menu do, wherever the focus is left by a click: on a tab of the Format
// pane or in the Object List (#70), on a display framed with Esc before another element is selected
// or the slide is clicked (#70, #71), and in the TeX field of a display as a click opens it (#71). a
// text and a field keep the keys of the browser. a key is sent with the editing command that Chrome
// runs for it, since a key alone over the DevTools protocol does not fire the event copy, cut, or
// paste

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, clickText, openFormula, press, typeKeys } from './helpers/editor.mjs';

const PLATFORMS = ['mac', 'other'];
const DECK = 'test/pages/editor-clipboard-keys.html';
const MARK = '<!--beeson-->';
const MOD = { mac: 4, other: 2 };
const LETTER = { copy: 'c', cut: 'x', paste: 'v', selectAll: 'a' };
// the display of the deck, at its step and with a colored symbol, which a copy keeps
const DISPLAY = String.raw`\[ E = \class{mass}{m} c^2 \]`;
const STEP = 'class="math fragment" data-fragment-index="1"';
const INLINE = String.raw`Gamma \(a^2 + b^2\) item.`;
const FORMULA = String.raw`\(a^2 + b^2\)`;

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
const count = (page, selector) => page.evaluate(`Reveal.getCurrentSlide().querySelectorAll(${js(selector)}).length`);
const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
const active = (page) => page.evaluate(`document.activeElement?.localName`);
const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName + (el.classList.contains('math') ? '.math' : ''))`);
const plain = (page) => page.evaluate('navigator.clipboard.readText()');
const times = (text, part) => text.split(part).length - 1;
const html = (page) => page.evaluate(`navigator.clipboard.read().then(async (items) => { for (const i of items) if (i.types.includes('text/html')) return (await i.getType('text/html')).text(); return ''; })`);

async function load(t, platform) {
  const page = await browser.newPage({ width: 1600, height: 1000 });
  t.after(() => page.close().catch(() => {}));
  const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
  await page.goto(url);
  await page.evaluate('localStorage.clear()');
  await page.goto(url);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(DECK, 'utf8');
  page.platform = platform;
  const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
  assert.deepEqual(s.problems, []);
  await page.send('Page.bringToFront');
  await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await page.waitFor(`!!document.querySelector('.reveal section.present div.math mjx-container')`);
  return page;
}

// a trusted key of the clipboard, with the editing command that Chrome runs for it
async function clipKey(page, command) {
  const letter = LETTER[command];
  const base = { key: letter, code: `Key${letter.toUpperCase()}`, windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0), modifiers: MOD[page.platform] };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: [command] });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// the bottom of the figure, below the TeX field of the display, which is put beside the display
const figurePoint = (page) => page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector('figure img').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 20 }; })()`);
// a point of the slide under its text and left of its figure, where nothing is
const emptyPoint = (page) => page.evaluate(`(() => { const r = Reveal.getCurrentSlide().getBoundingClientRect(); return { x: r.left + 40, y: r.bottom - 40 }; })()`);
const displayPoint = (page) => page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector('div.math mjx-container').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

async function selectFigure(page) {
  await clickText(page, await figurePoint(page));
  await page.waitFor(`(() => { const s = window.BeesonEditor.selection(); return s.length === 1 && s[0].localName === 'figure'; })()`);
}

// a click on the display opens its TeX field with all of its TeX selected
async function openTex(page) {
  await clickText(page, await displayPoint(page));
  await page.waitFor(`(() => { const f = document.activeElement; return f?.matches('.beeson-math textarea') && f.value.trim() && f.selectionStart === 0 && f.selectionEnd === f.value.length; })()`);
}

// Esc closes the TeX field, and the display is framed with the focus on its formula
async function frameDisplay(page) {
  await openTex(page);
  await press(page, 'Escape');
  await page.waitFor(`(() => { const s = window.BeesonEditor.selection(); return !document.querySelector('.beeson-math') && document.activeElement?.localName === 'mjx-container' && s.length === 1 && s[0].matches('div.math'); })()`);
}

for (const platform of PLATFORMS) {
  test(`the clipboard keys cut, copy, and paste a figure after a click on a tab of the Format pane (${platform})`, async (t) => {
    const page = await load(t, platform);
    await selectFigure(page);
    await click(page, '#beeson-edit-tab-format');
    await page.waitFor(`document.activeElement?.id === 'beeson-edit-tab-format'`);
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t.startsWith(${js(MARK)}))`);
    await clipKey(page, 'paste');
    await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll('figure').length === 2`);
    assert.equal(await undoLabel(page), 'Undo Paste');
    assert.deepEqual(await selected(page), ['figure'], 'the copy is not selected');
    await click(page, '#beeson-edit-tab-format');
    await page.waitFor(`document.activeElement?.id === 'beeson-edit-tab-format'`);
    await clipKey(page, 'cut');
    await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll('figure').length === 1`);
    assert.equal(await undoLabel(page), 'Undo Cut');
    assert.deepEqual(errors(page), []);
  });

  test(`the clipboard keys copy and paste a figure selected in the Object List (${platform})`, async (t) => {
    const page = await load(t, platform);
    await page.evaluate(`window.BeesonEditor.exec('view.objects')`);
    const row = `[...document.querySelectorAll('.beeson-edit-objects .row')].find((r) => r.dataset.kind === 'Figure')`;
    await page.waitFor(`!!${row}?.getBoundingClientRect().width`);
    await clickText(page, await page.evaluate(`(() => { const r = ${row}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    await page.waitFor(`(() => { const s = window.BeesonEditor.selection(); return s.length === 1 && s[0].localName === 'figure' && !!document.activeElement?.closest('.beeson-edit-objects'); })()`);
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t.startsWith(${js(MARK)}))`);
    await clipKey(page, 'paste');
    await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll('figure').length === 2`);
    assert.equal(await undoLabel(page), 'Undo Paste');
    assert.equal(await page.evaluate(`document.querySelectorAll('.reveal .slides > section').length`), 2, 'a slide is pasted');
  });

  test(`the clipboard keys copy and paste a figure selected after a display was framed with Esc (${platform})`, async (t) => {
    const page = await load(t, platform);
    await frameDisplay(page);
    await selectFigure(page);
    assert.notEqual(await active(page), 'mjx-container', 'the formula keeps the focus after the figure is selected');
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t.startsWith(${js(MARK)}))`);
    assert.ok((await plain(page)).includes('<figure'), 'the figure is not on the clipboard');
    await clipKey(page, 'paste');
    await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll('figure').length === 2`);
    assert.equal(await count(page, 'div.math'), 1);
    assert.equal(await undoLabel(page), 'Undo Paste');
  });

  test(`a display copied with the key after Esc is pasted with the key after a click on the empty slide (${platform})`, async (t) => {
    const page = await load(t, platform);
    await frameDisplay(page);
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t.startsWith(${js(MARK)}))`);
    await clickText(page, await emptyPoint(page));
    await page.waitFor(`window.BeesonEditor.selection().length === 0`);
    assert.notEqual(await active(page), 'mjx-container', 'the formula keeps the focus after the click on the empty slide');
    await clipKey(page, 'paste');
    await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll('div.math').length === 2`);
    assert.deepEqual(await selected(page), ['div.math']);
    const saved = await page.evaluate('window.BeesonEditor.render()');
    assert.equal(times(saved, DISPLAY), 2, 'the deck does not have two displays with the TeX and its colored symbol');
    assert.equal(times(saved, STEP), 2, 'the copy of the display is not at its step');
  });

  test(`an inline formula framed with Esc is copied and pasted with its text element by the keys (${platform})`, async (t) => {
    const page = await load(t, platform);
    const li = `Reveal.getCurrentSlide().querySelector('li')`;
    await openFormula(page, '.reveal section.present li mjx-container');
    await page.waitFor(`!!document.activeElement?.matches('.beeson-math textarea')`);
    await press(page, 'Escape');
    await page.waitFor(`(() => { const s = window.BeesonEditor.selection(); return !document.querySelector('.beeson-math') && s.length === 1 && s[0].contains(${li}); })()`);
    const kind = await page.evaluate(`window.BeesonEditor.selection()[0].localName`);
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t.startsWith(${js(MARK)}))`);
    await clipKey(page, 'paste');
    await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll(${js(kind)}).length === 2`);
    assert.equal(await undoLabel(page), 'Undo Paste');
    assert.equal(times(await page.evaluate('window.BeesonEditor.render()'), INLINE), 2, 'the deck does not have two copies of the inline formula');
  });

  test(`the copy key in the TeX field of a display as a click opens it copies the display, with its TeX as the plain text (${platform})`, async (t) => {
    const page = await load(t, platform);
    await openTex(page);
    const tex = await page.evaluate('document.activeElement.value');
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t === ${js(tex)})`);
    const copied = await html(page);
    assert.ok(copied.includes(STEP) && copied.includes(DISPLAY), `the display is not the HTML of the clipboard: ${copied}`);
    // a click away closes the field, and the key pastes the display on the slide
    await clickText(page, await emptyPoint(page));
    await page.waitFor(`!document.querySelector('.beeson-math')`);
    await clipKey(page, 'paste');
    await page.waitFor(`Reveal.getCurrentSlide().querySelectorAll('div.math').length === 2`);
    assert.equal(await undoLabel(page), 'Undo Paste');
    const saved = await page.evaluate('window.BeesonEditor.render()');
    assert.equal(times(saved, DISPLAY), 2, 'the deck does not have two displays with the TeX and its colored symbol');
    assert.equal(times(saved, STEP), 2, 'the copy of the display is not at its step');
    assert.deepEqual(errors(page), []);
  });

  test(`the copy key in the TeX field copies only the selected TeX once the selection is changed (${platform})`, async (t) => {
    const page = await load(t, platform);
    await openTex(page);
    const tex = await page.evaluate('document.activeElement.value');
    await press(page, 'ArrowRight');
    for (let i = 0; i < 3; i++) await press(page, 'Shift+ArrowLeft');
    await page.waitFor(`document.activeElement.selectionStart === ${tex.length - 3} && document.activeElement.selectionEnd === ${tex.length}`);
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t === ${js(tex.slice(-3))})`);
    assert.ok(!(await html(page)).includes(MARK), 'the display is on the clipboard');
  });

  // the browser copies the words without the glyphs of a formula, and a paste into a text reads
  // only the plain text, hence the TeX is put on the clipboard between its delimiters
  test(`words copied out of a text with a formula are pasted with the formula, typeset and saved as TeX (${platform})`, async (t) => {
    const page = await load(t, platform);
    const li = `Reveal.getCurrentSlide().querySelector('li')`;
    const p = `Reveal.getCurrentSlide().querySelector('p')`;
    await clickText(page, await page.evaluate(`(() => { const r = ${li}.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`));
    await page.waitFor(`document.activeElement === ${li}`);
    await clipKey(page, 'selectAll');
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t.includes('Gamma'))`);
    assert.equal(await plain(page), INLINE, 'the plain text of the clipboard is not the words with the TeX of the formula');
    await clickText(page, `.reveal section.present p`);
    await page.waitFor(`document.activeElement === ${p}`);
    await press(page, 'End');
    await clipKey(page, 'paste');
    await page.waitFor(`/item\\.$/.test(${p}.textContent) || ${p}.querySelectorAll('mjx-container').length > 0`);
    await page.waitFor(`${p}.querySelectorAll('mjx-container[contenteditable="false"]').length === 1`);
    assert.equal(await undoLabel(page), 'Undo Paste');
    // the caret is left after the pasted words
    await typeKeys(page, 'Z');
    await page.waitFor(`/item\\.Z$/.test(${p}.textContent)`);
    const saved = await page.evaluate('window.BeesonEditor.render()');
    assert.equal(times(saved, FORMULA), 2, 'the deck does not have the pasted formula as TeX');
    assert.ok(saved.includes(`slide.Gamma ${FORMULA} item.Z</p>`), 'the paragraph is not saved with the pasted words');
    assert.deepEqual(errors(page), []);
  });

  test(`TeX pasted into a text with Edit > Paste is typeset (${platform})`, async (t) => {
    const page = await load(t, platform);
    const p = `Reveal.getCurrentSlide().querySelector('p')`;
    await clickText(page, `.reveal section.present p`);
    await page.waitFor(`document.activeElement === ${p}`);
    await press(page, 'End');
    await page.evaluate(`Promise.resolve(window.BeesonEditor.exec('edit.paste', ${js(INLINE)})).then(() => true)`);
    await page.waitFor(`${p}.querySelectorAll('mjx-container[contenteditable="false"]').length === 1`);
    assert.ok((await page.evaluate('window.BeesonEditor.render()')).includes(`${INLINE}</p>`), 'the paragraph is not saved with the pasted TeX');
    assert.deepEqual(errors(page), []);
  });

  test(`a text keeps the copy and the paste of the browser (${platform})`, async (t) => {
    const page = await load(t, platform);
    await clickText(page, '.reveal section.present p');
    await page.waitFor(`document.activeElement?.localName === 'p'`);
    await press(page, 'Home');
    for (let i = 0; i < 5; i++) await press(page, 'Shift+ArrowRight');
    await page.waitFor(`String(getSelection()) === 'Alpha'`);
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t === 'Alpha')`);
    await press(page, 'End');
    await clipKey(page, 'paste');
    await page.waitFor(`/slide\\.\\s?Alpha$/.test(Reveal.getCurrentSlide().querySelector('p').textContent)`);
    assert.equal(await count(page, 'p'), 1);
    assert.equal(await count(page, 'figure'), 1);
  });

  test(`a field of the Format pane keeps the copy and the paste of the browser (${platform})`, async (t) => {
    const page = await load(t, platform);
    await selectFigure(page);
    const field = `[...document.querySelectorAll('.beeson-edit-inspector textarea')].find((f) => f.getAttribute('aria-label') === 'Description' && f.getBoundingClientRect().width)`;
    await page.waitFor(`!!${field}`);
    await clickText(page, await page.evaluate(`(() => { const r = ${field}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    await page.waitFor(`document.activeElement === ${field}`);
    await page.evaluate(`(() => { const f = ${field}; f.select(); return true; })()`);
    const value = await page.evaluate(`${field}.value`);
    assert.ok(value.trim(), 'the field is empty');
    await clipKey(page, 'copy');
    await page.waitFor(`navigator.clipboard.readText().then((t) => t === ${js(value)})`);
    await clipKey(page, 'paste');
    await page.waitFor(`${field}.value === ${js(value)} && ${field}.selectionStart === ${value.length}`);
    assert.equal(await count(page, 'figure'), 1);
  });
}
