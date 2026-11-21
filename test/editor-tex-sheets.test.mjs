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
const errors = (page) => page.errors.filter((e) => !/404/.test(e));

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

async function sheet(page, id) {
  await exec(page, id);
  await page.waitFor(`!!document.querySelector('${SHEET}:not([aria-busy])')`);
}

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

const SAVE_ONTO = (folder, seed) => `(async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(${js(folder)}, { create: true });
  for (const [name, text] of Object.entries(${js(seed)})) {
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  }
  return true;
})()`;

const EXTERNAL = '\\newcommand{\\Z}{\\mathbb{Z}}\n';

const CITE_MISSING = `{
  const p = [...document.querySelectorAll('.reveal .slides p')].at(-1);
  const cite = document.createElement('cite');
  cite.setAttribute('data-key', 'szebehely1967');
  p.append(cite);
  true;
}`;
const REFUSED = `window.showDirectoryPicker = async () => { throw new DOMException('The user aborted a request.', 'AbortError'); }, true`;
const SAVE_IN_MEMORY = `(async () => {
  let text = ${js(SOURCE)};
  const deck = {
    kind: 'file',
    name: 'index.html',
    getFile: async () => new File([text], 'index.html'),
    createWritable: async () => ({ write: async (t) => void (text = t), close: async () => {} }),
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    isSameEntry: async (other) => other === deck,
  };
  window.BeesonEditor.attach(deck);
  const done = await Promise.race([window.BeesonEditor.save().then(() => true), new Promise((r) => setTimeout(() => r(false), 10000))]);
  return { done, text };
})()`;

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
  assert.match(skipped[0], /^preamble\.tex:2 \\usepackage\{tikz\} MathJax does not have an extension for the package tikz$/);
  assert.deepEqual(await rows(page, '[data-unread]'), []);
  assert.deepEqual(errors(page), []);
});

test('an edit of the preamble defines a macro and a kind of theorem on the open deck, and is one entry of the history', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  assert.equal(await red(page, 'a macro that is not defined yet'), true);
  assert.equal(await headOf(page, 'conjecture'), 'conjecture.');
  await sheet(page, 'file.preamble');
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

test('a citation taken out of the deck without a sheet open is taken out of tex.js at a save', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await page.evaluate(`document.querySelector('.reveal .slides cite[data-key="gomez2004"]').remove(), true`);
  const saved = await page.evaluate(SAVE_INTO('tex-uncited'));
  assert.doesNotMatch(saved.files['index.html'], /gomez2004/);
  assert.equal(saved.files['tex.js'], npmRunTex({ 'index.html': saved.files['index.html'] }));
  assert.match((await status(page)).message, /tex\.js written/);
  const again = await page.evaluate(SAVE_INTO('tex-uncited-again'));
  assert.deepEqual(Object.keys(again.files), ['index.html']);

  const other = await open('other');
  t.after(() => other.close());
  await other.evaluate(NO_PICKERS);
  await other.evaluate(`document.querySelector('.reveal .slides cite[data-key="gomez2004"]').remove(), true`);
  await other.evaluate('window.BeesonEditor.save()');
  const got = await downloads(other);
  assert.deepEqual(got.map((d) => d.name), ['tex.js', 'index.html']);
  assert.equal(got[0].text, npmRunTex({ 'index.html': got[1].text }));
  assert.deepEqual(errors(page), []);
});

test('a source changed next to the deck after the sheets read it is read again before a save, and an edited source is not written over it', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await sheet(page, 'file.bibliography');
  await page.evaluate(`document.querySelector('${SHEET} button[data-key="koon2000"]').click()`);
  await typeInto(page, '{2001}', '{2000}');
  await press(page, 'Escape');
  await page.evaluate(SAVE_ONTO('tex-reread', { 'preamble.tex': PREAMBLE + EXTERNAL }));
  const saved = await page.evaluate(SAVE_INTO('tex-reread'));
  assert.equal(saved.files['preamble.tex'], PREAMBLE + EXTERNAL);
  assert.equal(saved.files['tex.js'], npmRunTex({ 'preamble.tex': PREAMBLE + EXTERNAL, 'references.bib': saved.files['references.bib'] }));
  assert.match(saved.files['tex.js'], /"Z": "\\\\mathbb\{Z\}"/);

  const edited = await open();
  t.after(() => edited.close());
  await sheet(edited, 'file.preamble');
  await typeInto(edited, ADDED);
  await press(edited, 'Escape');
  await edited.evaluate(SAVE_ONTO('tex-kept', { 'preamble.tex': PREAMBLE + EXTERNAL }));
  const kept = await edited.evaluate(SAVE_INTO('tex-kept'));
  assert.equal(kept.files['preamble.tex'], PREAMBLE + EXTERNAL);
  assert.equal(kept.files['tex.js'], undefined);
  assert.match((await status(edited)).message, /preamble\.tex was changed next to the deck/);
  assert.deepEqual(errors(page), []);
});

test('a citation taken out without a sheet open does not write over a tex.js that npm run tex wrote since the deck was opened', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  const newer = npmRunTex({ 'preamble.tex': PREAMBLE + EXTERNAL });
  await page.evaluate(SAVE_ONTO('tex-newer', { 'preamble.tex': PREAMBLE + EXTERNAL, 'references.bib': BIB, 'tex.js': newer }));
  await page.evaluate(`document.querySelector('.reveal .slides cite[data-key="gomez2004"]').remove(), true`);
  const saved = await page.evaluate(SAVE_INTO('tex-newer'));
  assert.equal(saved.files['tex.js'], npmRunTex({ 'preamble.tex': PREAMBLE + EXTERNAL, 'index.html': saved.files['index.html'] }));
  assert.match(saved.files['tex.js'], /"Z": /);
  assert.deepEqual(errors(page), []);
});

test('a references.bib read again before a save keeps the chosen entry in the Bibliography sheet', { timeout: 120000 }, async (t) => {
  const OTHER = '@misc{aaa2020,\n  title = {An entry added above the others},\n  year  = {2020},\n}\n\n';
  const page = await open();
  t.after(() => page.close());
  await sheet(page, 'file.preamble');
  await typeInto(page, ADDED);
  await press(page, 'Escape');
  await sheet(page, 'file.bibliography');
  await page.evaluate(`document.querySelector('${SHEET} button[data-key="koon2000"]').click()`);
  const chosen = await value(page);
  assert.match(chosen, /^@article\{koon2000,/);
  await page.evaluate(SAVE_ONTO('tex-entry', { 'references.bib': OTHER + BIB }));
  await page.evaluate(SAVE_INTO('tex-entry'));
  assert.equal(await value(page), chosen);
  assert.deepEqual(errors(page), []);
});

test('on file: a save that cites a paper missing from tex.js, with the folder refused, writes the deck and says that tex.js was not written', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: DECK, query: 'edit&still&edit-platform=other' });
  t.after(() => page.close());
  await page.evaluate(CITE_MISSING);
  await page.evaluate(REFUSED);
  const saved = await page.evaluate(SAVE_IN_MEMORY);
  assert.equal(saved.done, true, 'the save is not finished');
  assert.match(saved.text, /szebehely1967/);
  assert.match((await status(page)).message, /tex\.js was not written/);
});

test('on file: a save that cites a paper missing from tex.js does not wait for the files that a closed sheet asks for', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: DECK, query: 'edit&still&edit-platform=other' });
  t.after(() => page.close());
  await page.evaluate(REFUSED);
  await page.evaluate(`window.BeesonEditor.attach({ kind: 'file', name: 'index.html' }), true`);
  await exec(page, 'file.preamble');
  await page.waitFor(`!!document.querySelector('${SHEET} input[type=file]') && /Choose the folder of the deck/.test(document.querySelector('${SHEET} .note').textContent)`);
  await press(page, 'Escape');
  await page.evaluate(CITE_MISSING);
  const saved = await page.evaluate(SAVE_IN_MEMORY);
  assert.equal(saved.done, true, 'the save is not finished');
  assert.match(saved.text, /szebehely1967/);
  assert.match((await status(page)).message, /tex\.js was not written/);
});
