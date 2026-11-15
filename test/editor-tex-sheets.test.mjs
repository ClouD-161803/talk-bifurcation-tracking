// the Preamble and Bibliography sheets of the File menu on test/pages/tex-sheets/index.html: the
// definitions of preamble.tex and of the files that it follows, with the skipped lines, an edit of
// the preamble that defines a macro and a kind of theorem on the open deck as one entry of the
// history, the entries of references.bib as references with a search, an edit of an entry that
// redraws its reference on the slide, and the save of preamble.tex, references.bib, and tex.js
// through the folder of the deck, by a download without the pickers, and with a followed file that
// is not read. on file: without the folder permission, as in Firefox and Safari, the folder of the
// deck is chosen with a file input. the sheets close with Esc and are stacked on a phone

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { deckTex } from '../scripts/tex.mjs';
import { editorPage, press, type } from './helpers/editor.mjs';

const DIR = 'test/pages/tex-sheets';
const DECK = `${DIR}/index.html`;
const SOURCE = readFileSync(DECK, 'utf8');
const PREAMBLE = readFileSync(`${DIR}/preamble.tex`, 'utf8');
const BIB = readFileSync(`${DIR}/references.bib`, 'utf8');
const SHEET = 'dialog.beeson-edit-tex[open]';
const ADDED = '\\newcommand{\\Q}{\\mathbb{Q}}\n\\newtheorem{conjecture}[theorem]{Conjecture}\n';

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
const status = (page) => page.evaluate('window.BeesonEditor.status()');
const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
const value = (page) => page.evaluate(`document.querySelector('${SHEET} textarea').value`);
// a server answers 404 for a package of the preamble that is not next to the deck, e.g. physics.sty
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico') && !/404/.test(e));

async function open(platform = 'mac', page = null) {
  page ??= await browser.newPage();
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = SOURCE;
  const s = await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`);
  assert.deepEqual(s.problems, []);
  return page;
}

// the sheet of the File menu with id opened, once its source is read
async function sheet(page, id) {
  await exec(page, id);
  await page.waitFor(`!!document.querySelector('${SHEET}:not([aria-busy])')`);
}

// text typed at the end of the source of the open sheet, or in place of the first match of find
async function typeInto(page, text, find = null) {
  await page.evaluate(`(() => {
    const t = document.querySelector('${SHEET} textarea');
    t.focus();
    const at = ${find === null ? 't.value.length' : `t.value.indexOf(${js(find)})`};
    t.setSelectionRange(at, ${find === null ? 'at' : `at + ${js(find)}.length`});
    return true;
  })()`);
  await type(page, text);
}

const rows = (page, selector) => page.evaluate(`[...document.querySelectorAll('${SHEET} ${selector}')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim())`);
const red = (page, name) => page.evaluate(`!!document.querySelector('tr[data-case="${name}"]').querySelector('[fill="red"], [data-mjx-error]')`);
const headOf = (page, kind) => page.evaluate(`document.querySelector('.reveal .slides p.theorem[data-kind="${kind}"]').dataset.head ?? null`);

// the text of the files that npm run tex reads for the deck, with the saved sources in place of
// the files of the deck, and the tex.js that it writes from them
function npmRunTex(files) {
  const dir = mkdtempSync(join(tmpdir(), 'tex-sheets-'));
  try {
    for (const name of ['index.html', 'preamble.tex', 'references.bib', 'defs.tex', 'mymath.sty']) copyFileSync(join(DIR, name), join(dir, name));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return deckTex(join(dir, 'index.html')).text;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// a save into a folder of the private file system, which the stub of showDirectoryPicker gives as
// the folder that the person chooses, and the files of the folder after it
const SAVE_INTO = (folder) => `(async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(${js(folder)}, { create: true });
  const deck = await dir.getFileHandle('index.html', { create: true });
  window.__picked = 0;
  window.showDirectoryPicker = async () => { window.__picked++; return dir; };
  window.BeesonEditor.attach(deck);
  await window.BeesonEditor.save();
  const files = {};
  for await (const [name, h] of dir.entries()) files[name] = await (await h.getFile()).text();
  return { files, picked: window.__picked };
})()`;

// the pickers taken away, as in Firefox and Safari, and each download kept with its name and text
const NO_PICKERS = `{
  window.showOpenFilePicker = undefined;
  window.showSaveFilePicker = undefined;
  window.showDirectoryPicker = undefined;
  window.__downloads = [];
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push(fetch(this.href).then((r) => r.text()).then((text) => ({ name: this.download, text }))); };
  true;
}`;
const downloads = (page) => page.evaluate('Promise.all(window.__downloads)');

test('File > Preamble… lists the definitions of preamble.tex and of the files that it follows, with the skipped lines', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await sheet(page, 'file.preamble');
  assert.equal(await value(page), PREAMBLE);
  await page.waitFor(`document.querySelectorAll('${SHEET} [data-macro] .sample svg').length === 3`);
  assert.deepEqual(await rows(page, '[data-macro]'), ['\\dist 0 arguments', '\\half 0 arguments', '\\vb 1 argument']);
  assert.deepEqual(await rows(page, '[data-kind]'), ['theorem Theorem, plain, numbered']);
  const skipped = await rows(page, '.skipped');
  assert.equal(skipped.length, 1);
  assert.match(skipped[0], /^preamble\.tex:4 \\usepackage\{tikz\} MathJax does not have an extension for the package tikz$/);
  assert.deepEqual(await rows(page, '[data-unread]'), []);
  assert.deepEqual(errors(page), []);
});

test('an edit of the preamble defines a macro and a kind of theorem on the open deck, and is one entry of the history', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  assert.equal(await red(page, 'a macro that is not defined yet'), true);
  assert.equal(await headOf(page, 'conjecture'), 'conjecture.');
  await sheet(page, 'file.preamble');
  // two inputs less than a second apart are one entry
  await typeInto(page, ADDED.slice(0, 10));
  await typeInto(page, ADDED.slice(10));
  assert.equal(await value(page), PREAMBLE + ADDED);
  await page.waitFor(`!!document.querySelector('${SHEET} [data-macro="Q"] .sample svg')`);
  await page.waitFor(`!document.querySelector('tr[data-case="a macro that is not defined yet"]').querySelector('[fill="red"], [data-mjx-error]')`);
  await page.waitFor(`document.querySelector('.reveal .slides p.theorem[data-kind="conjecture"]').dataset.head === 'Conjecture 2.'`);
  assert.equal(await headOf(page, 'theorem'), 'Theorem 1.');
  assert.equal((await status(page)).dirty, true);
  assert.equal(await undoLabel(page), 'Undo Edit Preamble');

  await press(page, 'Mod+Z');
  await page.waitFor(`document.querySelector('${SHEET} textarea').value === ${js(PREAMBLE)}`);
  await page.waitFor(`!document.querySelector('${SHEET} [data-macro="Q"]')`);
  await page.waitFor(`document.querySelector('.reveal .slides p.theorem[data-kind="conjecture"]').dataset.head === 'conjecture.'`);
  assert.equal((await status(page)).dirty, false, 'the deck is clean once the edit of the preamble is undone');

  await press(page, 'Mod+Shift+Z');
  await page.waitFor(`document.querySelector('${SHEET} textarea').value === ${js(PREAMBLE + ADDED)}`);
  await page.waitFor(`document.querySelector('.reveal .slides p.theorem[data-kind="conjecture"]').dataset.head === 'Conjecture 2.'`);
  assert.equal((await status(page)).dirty, true);
  assert.equal(await page.evaluate('window.BeesonEditor.render()'), SOURCE, 'an edit of the preamble changes the deck');
  assert.deepEqual(errors(page), []);
});

test('File > Bibliography… lists the entries as references with a search, and an edit of an entry redraws its reference on the slide', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await sheet(page, 'file.bibliography');
  assert.deepEqual(await rows(page, 'button[data-key]'), [
    'Koon et al., Chaos 10 (2000) koon2000',
    'Gómez et al., Nonlinearity 17 (2004) gomez2004',
    'Szebehely, Academic Press (1967) szebehely1967',
  ]);
  const search = async (q) => {
    await page.evaluate(`(() => { const s = document.querySelector('${SHEET} input[type=search]'); s.focus(); s.select(); return true; })()`);
    await type(page, q);
    return rows(page, 'button[data-key]');
  };
  assert.deepEqual(await search('gomez'), ['Gómez et al., Nonlinearity 17 (2004) gomez2004']);
  assert.deepEqual(await search('1967'), ['Szebehely, Academic Press (1967) szebehely1967']);
  assert.deepEqual(await search('heteroclinic'), ['Koon et al., Chaos 10 (2000) koon2000']);
  assert.equal((await search('koon')).length, 2);

  await page.evaluate(`document.querySelector('${SHEET} button[data-key="koon2000"]').click()`);
  await page.waitFor(`document.querySelector('${SHEET} textarea').value.startsWith('@article{koon2000,')`);
  assert.equal(await value(page), BIB.slice(BIB.indexOf('@article{koon2000'), BIB.indexOf('}\n\n@article{gomez2004') + 1));
  await typeInto(page, '{2001}', '{2000}');
  await page.waitFor(`document.querySelector('${SHEET} .preview').textContent === 'Koon et al., Chaos 10 (2001)'`);
  await page.waitFor(`document.querySelector('.reveal .slides div.refs .ref[data-key="koon2000"]')?.textContent.includes('(2001)')`);
  assert.equal(await undoLabel(page), 'Undo Edit Bibliography');
  await press(page, 'Mod+Z');
  await page.waitFor(`document.querySelector('${SHEET} .preview').textContent === 'Koon et al., Chaos 10 (2000)'`);
  await page.waitFor(`document.querySelector('.reveal .slides div.refs .ref[data-key="koon2000"]')?.textContent.includes('(2000)')`);
  assert.deepEqual(errors(page), []);
});

test('a save writes preamble.tex, references.bib, and tex.js into the folder of the deck, with the tex.js of npm run tex', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await sheet(page, 'file.preamble');
  await typeInto(page, ADDED);
  await press(page, 'Escape');
  await sheet(page, 'file.bibliography');
  await page.evaluate(`document.querySelector('${SHEET} button[data-key="koon2000"]').click()`);
  await typeInto(page, '{2001}', '{2000}');
  await press(page, 'Escape');
  const saved = await page.evaluate(SAVE_INTO('tex-save'));
  assert.equal(saved.picked, 1);
  assert.deepEqual(Object.keys(saved.files).sort(), ['index.html', 'preamble.tex', 'references.bib', 'tex.js']);
  assert.equal(saved.files['index.html'], SOURCE);
  assert.equal(saved.files['preamble.tex'], PREAMBLE + ADDED);
  assert.equal(saved.files['references.bib'], BIB.replace('{2000}', '{2001}'));
  assert.equal(saved.files['tex.js'], npmRunTex({ 'preamble.tex': saved.files['preamble.tex'], 'references.bib': saved.files['references.bib'] }));
  assert.match(saved.files['tex.js'], /"Q": "\\\\mathbb\{Q\}"/);
  assert.match((await status(page)).message, /preamble\.tex, references\.bib, and tex\.js written/);
  assert.equal((await status(page)).dirty, false);
  // a second save does not write them again
  const again = await page.evaluate(SAVE_INTO('tex-save-again'));
  assert.deepEqual(Object.keys(again.files), ['index.html']);
  assert.deepEqual(errors(page), []);
});

test('without the pickers, the changed preamble.tex and tex.js are downloaded with the deck', { timeout: 120000 }, async (t) => {
  const page = await open('other');
  t.after(() => page.close());
  await page.evaluate(NO_PICKERS);
  await sheet(page, 'file.preamble');
  await typeInto(page, ADDED);
  await page.evaluate('window.BeesonEditor.save()');
  const got = await downloads(page);
  assert.deepEqual(got.map((d) => d.name), ['preamble.tex', 'tex.js', 'index.html']);
  assert.equal(got[0].text, PREAMBLE + ADDED);
  assert.equal(got[1].text, npmRunTex({ 'preamble.tex': PREAMBLE + ADDED }));
  assert.match((await status(page)).message, /Put preamble\.tex and tex\.js next to it/);
  assert.deepEqual(errors(page), []);
});

test('a followed file that is not read is listed, and tex.js is not written while it is unread', { timeout: 120000 }, async (t) => {
  const page = await open('other');
  t.after(() => page.close());
  await page.evaluate(NO_PICKERS);
  await page.evaluate(`{
    const fetched = window.fetch;
    window.fetch = (url, options) => (String(url).endsWith('/defs.tex') ? Promise.reject(new TypeError('Failed to fetch')) : fetched(url, options));
    true;
  }`);
  await sheet(page, 'file.preamble');
  await page.waitFor(`!!document.querySelector('${SHEET} [data-unread="defs.tex"]')`);
  assert.deepEqual(await rows(page, '[data-macro]'), ['\\dist 0 arguments', '\\vb 1 argument']);
  await typeInto(page, ADDED);
  await page.evaluate('window.BeesonEditor.save()');
  assert.deepEqual((await downloads(page)).map((d) => d.name), ['preamble.tex', 'index.html']);
  assert.match((await status(page)).message, /tex\.js was not written, since defs\.tex is not read/);
});

test('on file: without the folder permission, the folder of the deck is chosen with a file input, as in Firefox and Safari', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: DECK, query: 'edit&still&edit-platform=other' });
  t.after(() => page.close());
  await page.evaluate(NO_PICKERS);
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await exec(page, 'file.preamble');
  await page.waitFor(`!!document.querySelector('${SHEET} input[type=file]')`);
  assert.match(await page.evaluate(`document.querySelector('${SHEET} .note').textContent`), /Choose the folder of the deck/);
  const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('${SHEET} input[type=file]')` });
  const files = ['preamble.tex', 'references.bib', 'tex.js', 'defs.tex', 'mymath.sty', 'index.html'].map((name) => resolve(DIR, name));
  await page.send('DOM.setFileInputFiles', { files, objectId: result.objectId });
  await page.waitFor(`document.querySelector('${SHEET} textarea').value === ${js(PREAMBLE)}`);
  await page.waitFor(`document.querySelectorAll('${SHEET} [data-macro]').length === 3`);
  await typeInto(page, ADDED);
  await page.evaluate('window.BeesonEditor.save()');
  const got = await downloads(page);
  assert.deepEqual(got.map((d) => d.name), ['preamble.tex', 'tex.js', 'index.html']);
  assert.equal(got[1].text, npmRunTex({ 'preamble.tex': PREAMBLE + ADDED }));
});

test('a sheet closes with Esc and gives the focus back, and it is stacked on a phone', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await page.evaluate(`document.querySelector('.beeson-edit-menubar button').focus()`);
  const before = await page.evaluate('document.activeElement.textContent');
  await sheet(page, 'file.preamble');
  assert.equal(await page.evaluate(`document.querySelector('${SHEET}').contains(document.activeElement)`), true);
  await press(page, 'Escape');
  await page.waitFor(`!document.querySelector('${SHEET}')`);
  assert.equal(await page.evaluate('document.activeElement.textContent'), before);

  const phone = await open('other', await browser.newPage({ width: 390, height: 844, mobile: true }));
  t.after(() => phone.close());
  for (const id of ['file.preamble', 'file.bibliography']) {
    await sheet(phone, id);
    const boxes = await phone.evaluate(`(() => {
      const d = document.querySelector('${SHEET}').getBoundingClientRect();
      const [a, b] = [...document.querySelector('${SHEET} .body').children].map((c) => c.getBoundingClientRect());
      return { left: d.left, right: d.right, first: a.bottom, second: b.top };
    })()`);
    assert.ok(boxes.left >= 0 && boxes.right <= 390, `${id}: the sheet is wider than the phone`);
    assert.ok(boxes.second >= boxes.first - 1, `${id}: the parts of the sheet are not stacked`);
    await press(phone, 'Escape');
    await phone.waitFor(`!document.querySelector('${SHEET}')`);
  }
});
