// the citations of the editor on test/pages/tex-sheets/index.html: \cite{ typed in a text opens a
// list of the bibliography at the caret, filtered as the author types, Enter inserts the citation
// in place of the typed text as one entry of the history, a comma adds a second paper, and Esc
// leaves the typed text. Insert > Citation… and its key open the same list. a click on the number
// of a citation shows the full entries in the Format pane, where a paper is changed, added, or
// removed and the DOI opened. a BibTeX entry pasted into the list is added to references.bib and
// cited, and a DOI alone is not resolved. the reference is drawn at once, and a save writes tex.js
// with it. on file: without the folder permission, the list asks for the files of the deck

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { deckTex } from '../scripts/tex.mjs';
import { click, editorPage, press, type } from './helpers/editor.mjs';

const DIR = 'test/pages/tex-sheets';
const DECK = `${DIR}/index.html`;
const SOURCE = readFileSync(DECK, 'utf8');
const BIB = readFileSync(`${DIR}/references.bib`, 'utf8');
const LIST = '.beeson-cite';
const PANEL = '#beeson-edit-panel-format';
const PLAIN = '<p>Invariant manifolds guide a low-energy transfer</p>';
const cited = (keys) => `<p>Invariant manifolds guide a low-energy transfer<cite data-key="${keys}"></cite></p>`;
const KOON = '<cite data-key="koon2000"></cite>';
const KEY = { mac: 'Ctrl+Mod+C', other: 'Alt+Shift+C' };
const ENTRY = `@article{conley1968,
  author  = {Conley, Charles C.},
  title   = {Low energy transit orbits in the restricted three-body problem},
  journal = {SIAM Journal on Applied Mathematics},
  volume  = {16},
  year    = {1968},
  doi     = {10.1137/0116060},
}`;

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
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const status = (page) => page.evaluate('window.BeesonEditor.status()');
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
// a server answers 404 for a package of the preamble that is not next to the deck, e.g. physics.sty
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico') && !/404/.test(e));
const expect = (...edits) => edits.reduce((text, [a, b]) => {
  assert.equal(text.split(a).length, 2, `${a} does not occur once in the deck`);
  return text.replace(a, () => b);
}, SOURCE);

async function open(platform = 'mac', page = null) {
  page ??= await browser.newPage();
  await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  const s = await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`);
  assert.deepEqual(s.problems, []);
  await citations(page);
  return page;
}

// the slide of the citations shown
async function citations(page) {
  await page.evaluate(`Reveal.slide(Reveal.getIndices([...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent === 'Citations')).h)`);
  await page.waitFor(`document.querySelector('.reveal section.present h2')?.textContent === 'Citations'`);
}

// the caret at the end of the paragraph that starts with words
async function caretAfter(page, words) {
  await page.evaluate(`(() => {
    const p = [...document.querySelectorAll('.reveal section.present p')].find((p) => p.textContent.startsWith(${js(words)}));
    p.focus();
    const r = document.createRange();
    r.selectNodeContents(p);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);
  await page.waitFor(`document.activeElement?.matches('.reveal section.present p')`);
}

// the words typed after the brace of \cite{ selected, so that the next typing replaces them
const selectQuery = (page) => page.evaluate(`(() => {
  const s = getSelection();
  const n = s.anchorNode;
  const r = document.createRange();
  r.setStart(n, n.data.lastIndexOf('{') + 1);
  r.setEnd(n, s.anchorOffset);
  s.removeAllRanges();
  s.addRange(r);
  return true;
})()`);

// the rows of the open list, each as its text, and the key of the chosen row
const rows = (page) => page.evaluate(`[...document.querySelectorAll('${LIST} li[data-key]')].map((li) => li.textContent.replace(/\\s+/g, ' ').trim())`);
const chosen = (page) => page.evaluate(`document.querySelector('${LIST} li[aria-selected="true"]')?.dataset.key ?? null`);
const listOpen = (page) => page.evaluate(`!!document.querySelector('${LIST}')`);
const lastText = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present p')].at(-1).textContent`);
const refKeys = (page) => page.evaluate(`[...document.querySelectorAll('.reveal section.present div.refs .ref')].map((r) => r.dataset.key)`);
const numberOf = (page, keys) => page.evaluate(`document.querySelector('.reveal section.present cite[data-key="${keys}"]')?.dataset.n ?? null`);

// the list open with its rows after \cite{ typed at the end of the last paragraph
async function typeCite(page) {
  await caretAfter(page, 'Invariant');
  await type(page, ' \\cite{');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 3`);
  // a pause before the next key, as on a slow runner, where the typing is then two entries of the
  // history
  await sleep(1100);
}

// the insert of a citation undone, and the typing before it, which is one entry of the history or
// more, since the tests wait for the list between keys and keys more than a second apart are two
// entries
async function undoCitation(page) {
  assert.equal(await undoLabel(page), 'Undo Insert Citation');
  await undo(page);
  for (let n = 0; n < 4 && (await render(page)) !== SOURCE; n++) {
    assert.equal(await undoLabel(page), 'Undo Typing');
    await undo(page);
  }
  assert.equal(await render(page), SOURCE);
}

// a paste of text onto target, as the clipboard of the browser sends it
const paste = (page, target, text) => page.evaluate(`(() => {
  const dt = new DataTransfer();
  dt.setData('text/plain', ${js(text)});
  ${target}.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  return true;
})()`);

// the text of the files that npm run tex reads for the deck, with the saved files in place of the
// files of the deck, and the tex.js that it writes from them
function npmRunTex(files) {
  const dir = mkdtempSync(join(tmpdir(), 'tex-cite-'));
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
  window.showDirectoryPicker = async () => dir;
  window.BeesonEditor.attach(deck);
  await window.BeesonEditor.save();
  const files = {};
  for await (const [name, h] of dir.entries()) files[name] = await (await h.getFile()).text();
  return files;
})()`;

test('\\cite{ typed in a text opens the bibliography at the caret, filtered as the author types, and Enter inserts the citation as one entry', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await typeCite(page);
  assert.deepEqual(await rows(page), [
    'Koon et al., Chaos 10 (2000) koon2000',
    'Gómez et al., Nonlinearity 17 (2004) gomez2004',
    'Szebehely, Academic Press (1967) szebehely1967',
  ]);
  // the list is put under the caret
  const at = await page.evaluate(`(() => {
    const l = document.querySelector('${LIST}').getBoundingClientRect();
    const c = getSelection().getRangeAt(0).getBoundingClientRect();
    return { dx: Math.abs(l.left - c.left), dy: l.top - c.bottom };
  })()`);
  assert.ok(at.dx < 40 && at.dy >= 0 && at.dy < 40, `the list is not at the caret: ${js(at)}`);
  for (const [query, keys] of [['gomez', ['gomez2004']], ['1967', ['szebehely1967']], ['heteroclinic', ['koon2000']], ['koon2', ['koon2000']]]) {
    await selectQuery(page);
    await type(page, query);
    await page.waitFor(`[...document.querySelectorAll('${LIST} li[data-key]')].map((li) => li.dataset.key).join() === ${js(keys.join())}`);
  }
  assert.equal(await chosen(page), 'koon2000');
  await selectQuery(page);
  await type(page, 'szeb');
  await page.waitFor(`document.querySelector('${LIST} li[aria-selected="true"]')?.dataset.key === 'szebehely1967'`);
  await press(page, 'Enter');
  await page.waitFor(`!document.querySelector('${LIST}')`);
  // the citation is put after the words, in place of the typed text and of the space before it
  assert.equal(await render(page), expect([PLAIN, cited('szebehely1967')]));
  assert.equal(await undoLabel(page), 'Undo Insert Citation');
  // the reference is drawn at once, numbered after the two papers above it
  await page.waitFor(`document.querySelector('.reveal section.present cite[data-key="szebehely1967"]')?.dataset.n === '3'`);
  assert.deepEqual(await refKeys(page), ['koon2000', 'gomez2004', 'szebehely1967']);
  assert.match(await page.evaluate(`document.querySelector('.reveal section.present .ref[data-key="szebehely1967"]').textContent`), /Szebehely, Academic Press \(1967\)/);
  // the caret is after the citation, and a typed character is put after it, outside the cite
  await type(page, '.');
  await sleep(50);
  assert.equal(await render(page), expect([PLAIN, cited('szebehely1967').replace('</cite></p>', '</cite>.</p>')]));
  await undo(page);
  assert.equal(await render(page), expect([PLAIN, cited('szebehely1967')]));

  await undo(page);
  await page.waitFor(`[...document.querySelectorAll('.reveal section.present p')].at(-1).textContent.endsWith('\\\\cite{szeb')`);
  await redo(page);
  assert.equal(await render(page), expect([PLAIN, cited('szebehely1967')]));
  await page.waitFor(`document.querySelector('.reveal section.present cite[data-key="szebehely1967"]')?.dataset.n === '3'`);

  // a save writes tex.js with the reference of the new paper
  const files = await page.evaluate(SAVE_INTO('cite-save'));
  assert.deepEqual(Object.keys(files).sort(), ['index.html', 'tex.js']);
  assert.equal(files['index.html'], expect([PLAIN, cited('szebehely1967')]));
  assert.equal(files['tex.js'], npmRunTex({ 'index.html': files['index.html'] }));
  assert.match(files['tex.js'], /"szebehely1967": \{"authors":"Szebehely"/);
  assert.match((await status(page)).message, /tex\.js written/);
  assert.deepEqual(errors(page), []);
});

test('a comma adds a second paper to the citation, a closing brace ends it, and Esc closes the list with the typed text kept', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await typeCite(page);
  await type(page, 'koon');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 2`);
  await type(page, ',');
  // the typed words before the comma are replaced by the key of the chosen paper
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 3`);
  assert.match(await lastText(page), /\\cite\{koon2000,$/);
  await type(page, '1967');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 1`);
  await press(page, 'Enter');
  await page.waitFor(`!document.querySelector('${LIST}')`);
  assert.equal(await render(page), expect([PLAIN, cited('koon2000,szebehely1967')]));
  await page.waitFor(`document.querySelector('.reveal section.present cite[data-key="koon2000,szebehely1967"]')?.dataset.n === '1,3'`);
  await undoCitation(page);

  // a closing brace inserts the citation as Enter does
  await typeCite(page);
  await type(page, 'gomez2004}');
  await page.waitFor(`!document.querySelector('${LIST}')`);
  assert.equal(await render(page), expect([PLAIN, cited('gomez2004')]));
  assert.equal(await numberOf(page, 'gomez2004'), '2');
  await undoCitation(page);

  await typeCite(page);
  await type(page, 'gom');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 1`);
  await press(page, 'Escape');
  await page.waitFor(`!document.querySelector('${LIST}')`);
  assert.match(await lastText(page), /transfer\s\\cite\{gom$/);
  // the key is not taken by the editor, and the caret stays in the text
  assert.equal(await page.evaluate(`document.activeElement === [...document.querySelectorAll('.reveal section.present p')].at(-1)`), true);
  await type(page, 'ez');
  await sleep(100);
  assert.equal(await listOpen(page), false, 'the list opens again after Esc');
  assert.deepEqual(errors(page), []);
});

for (const platform of ['mac', 'other']) {
  test(`Insert > Citation… and ${KEY[platform]} open the list at the caret with a search field, and the sheet of keys lists the key without a clash (${platform})`, { timeout: 120000 }, async (t) => {
    const page = await open(platform);
    t.after(() => page.close());
    assert.ok((await page.evaluate(`window.BeesonEditorShell.menuItems('Insert').map((i) => i.label ?? i.command)`)).includes('insert.citation'), 'Citation… is not an item of the Insert menu');
    await caretAfter(page, 'Invariant');
    await exec(page, 'insert.citation');
    await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 3 && document.activeElement === document.querySelector('${LIST} input[type=search]')`);
    await type(page, 'gomez');
    await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 1`);
    await press(page, 'Enter');
    await page.waitFor(`!document.querySelector('${LIST}')`);
    assert.equal(await render(page), expect([PLAIN, cited('gomez2004')]));
    assert.equal(await undoLabel(page), 'Undo Insert Citation');
    assert.equal(await page.evaluate(`document.activeElement === [...document.querySelectorAll('.reveal section.present p')].at(-1)`), true, 'the caret is not given back to the text');
    await undo(page);
    assert.equal(await render(page), SOURCE);

    await caretAfter(page, 'Invariant');
    await press(page, KEY[platform]);
    await page.waitFor(`document.activeElement === document.querySelector('${LIST} input[type=search]')`);
    await press(page, 'Escape');
    await page.waitFor(`!document.querySelector('${LIST}')`);
    assert.equal(await render(page), SOURCE);
    assert.equal(await page.evaluate(`document.activeElement === [...document.querySelectorAll('.reveal section.present p')].at(-1)`), true);

    await exec(page, 'help.keys');
    await page.waitFor(`!!document.querySelector('dialog.beeson-edit-keys[open]')`);
    const listed = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-keys section')].filter((s) => s.querySelector('h3').textContent.startsWith('Insert')).flatMap((s) => [...s.querySelectorAll('.row')].map((r) => [r.querySelector('span').textContent, r.querySelector('kbd').textContent]))`);
    assert.deepEqual(listed.filter(([label]) => label === 'Citation…'), [['Citation…', platform === 'mac' ? '⌃⌘C' : 'Alt+Shift+C']]);
    await press(page, 'Escape');
    assert.deepEqual(await page.evaluate('window.BeesonEditorShell.keyClashes()'), []);
    assert.deepEqual(await page.evaluate('window.BeesonEditorShell.keyClashes(true)'), []);
    assert.deepEqual(await page.evaluate('window.BeesonEditorShell.sheetClashes()'), []);
    assert.deepEqual(errors(page), []);
  });
}

test('a click on the number of a citation selects it, and the Format pane shows the full entries, with the paper changed, added, and removed, and the DOI linked', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await click(page, '.reveal section.present cite[data-key="koon2000"]');
  await page.waitFor(`!!document.querySelector('${PANEL} [data-pane="citation"] .ed-cite[data-key="koon2000"]')`);
  // the citation is the range of the text
  assert.equal(await page.evaluate(`(() => { const f = getSelection().getRangeAt(0).cloneContents(); return f.childNodes.length === 1 && f.firstChild.localName === 'cite'; })()`), true);
  const entry = await page.evaluate(`document.querySelector('${PANEL} .ed-cite[data-key="koon2000"]').textContent.replace(/\\s+/g, ' ')`);
  assert.match(entry, /Wang Sang Koon, Martin W\. Lo, Jerrold E\. Marsden, and Shane D\. Ross/);
  assert.match(entry, /Heteroclinic connections between periodic orbits and resonance transitions in celestial mechanics/);
  assert.match(entry, /Chaos 10 \(2000\)/);
  assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-cite[data-key="koon2000"] a.doi')?.href`), 'https://doi.org/10.1063/1.166509');
  assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-cite a.doi')?.target`), '_blank');

  // Add Paper… opens the list with a search field, and the paper chosen is added to the citation
  await page.evaluate(`document.querySelector('${PANEL} [data-pane="citation"] button.add').click()`);
  await page.waitFor(`document.activeElement === document.querySelector('${LIST} input[type=search]')`);
  await type(page, 'szeb');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 1`);
  await press(page, 'Enter');
  await page.waitFor(`!!document.querySelector('${PANEL} .ed-cite[data-key="szebehely1967"]')`);
  assert.equal(await render(page), expect([KOON, '<cite data-key="koon2000,szebehely1967"></cite>']));
  assert.equal(await undoLabel(page), 'Undo Change Citation');
  await page.waitFor(`document.querySelector('.reveal section.present cite[data-key="koon2000,szebehely1967"]')?.dataset.n === '1,2'`);
  assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-cite[data-key="szebehely1967"] a.doi')`), null, 'a paper without a DOI is linked');

  // a paper of two is taken out of the citation
  await page.evaluate(`document.querySelector('${PANEL} .ed-cite[data-key="szebehely1967"] button.remove').click()`);
  await page.waitFor(`!document.querySelector('${PANEL} .ed-cite[data-key="szebehely1967"]')`);
  assert.equal(await render(page), SOURCE);
  assert.equal(await page.evaluate(`document.querySelector('${PANEL} .ed-cite[data-key="koon2000"] button.remove')`), null, 'the only paper of a citation can be removed');

  // Change Paper… replaces the paper
  await page.evaluate(`document.querySelector('${PANEL} .ed-cite[data-key="koon2000"] button.change').click()`);
  await page.waitFor(`document.activeElement === document.querySelector('${LIST} input[type=search]')`);
  await type(page, '1967');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 1`);
  await press(page, 'Enter');
  await page.waitFor(`!!document.querySelector('${PANEL} .ed-cite[data-key="szebehely1967"]')`);
  assert.equal(await render(page), expect([KOON, '<cite data-key="szebehely1967"></cite>']));
  assert.equal(await undoLabel(page), 'Undo Change Citation');
  await page.waitFor(`!!document.querySelector('.reveal section.present div.refs .ref[data-key="szebehely1967"]')`);
  await undo(page);
  assert.equal(await render(page), SOURCE);
  await page.waitFor(`document.querySelector('.reveal section.present cite[data-key="koon2000"]')?.dataset.n === '1'`);
  assert.deepEqual(errors(page), []);
});

test('a BibTeX entry pasted into the list is added to references.bib and cited, and a DOI alone is not resolved', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await typeCite(page);
  const host = `[...document.querySelectorAll('.reveal section.present p')].at(-1)`;
  await paste(page, host, '10.1137/0116060');
  await page.waitFor(`/DOI/.test(document.querySelector('${LIST} .note')?.textContent ?? '')`);
  assert.match(await page.evaluate(`document.querySelector('${LIST} .note').textContent`), /does not fetch/);
  assert.match(await lastText(page), /\\cite\{$/);

  await paste(page, host, ENTRY);
  await page.waitFor(`!document.querySelector('${LIST}')`);
  assert.equal(await render(page), expect([PLAIN, cited('conley1968')]));
  assert.equal(await undoLabel(page), 'Undo Insert Citation');
  await page.waitFor(`document.querySelector('.reveal section.present cite[data-key="conley1968"]')?.dataset.n === '3'`);
  assert.match(await page.evaluate(`document.querySelector('.reveal section.present .ref[data-key="conley1968"]').textContent`), /Conley, SIAM Journal on Applied Mathematics 16 \(1968\)/);
  const files = await page.evaluate(SAVE_INTO('cite-paste'));
  assert.deepEqual(Object.keys(files).sort(), ['index.html', 'references.bib', 'tex.js']);
  assert.equal(files['references.bib'], `${BIB}\n${ENTRY}\n`);
  assert.equal(files['tex.js'], npmRunTex({ 'index.html': files['index.html'], 'references.bib': files['references.bib'] }));

  // an entry pasted into the search field of Insert > Citation… is cited at the caret
  await caretAfter(page, 'The same tubes');
  await exec(page, 'insert.citation');
  await page.waitFor(`document.activeElement === document.querySelector('${LIST} input[type=search]')`);
  await paste(page, `document.querySelector('${LIST} input[type=search]')`, ENTRY.replace(/conley1968/, 'conley1968b'));
  await page.waitFor(`!document.querySelector('${LIST}')`);
  assert.match(await render(page), /halo orbits<cite data-key="gomez2004"><\/cite>\.<cite data-key="conley1968b"><\/cite><\/p>/);
  assert.deepEqual(errors(page), []);
});

test('on file: without the folder permission, the list says that the bibliography is not read, and its button asks for the files of the deck', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: DECK, query: 'edit&still&edit-platform=other' });
  t.after(() => page.close());
  await page.evaluate(`{
    window.showOpenFilePicker = undefined;
    window.showSaveFilePicker = undefined;
    window.showDirectoryPicker = undefined;
    true;
  }`);
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  await citations(page);
  await caretAfter(page, 'Invariant');
  await type(page, ' \\cite{');
  await page.waitFor(`/not read/.test(document.querySelector('${LIST} .note')?.textContent ?? '')`);
  assert.equal(await page.evaluate(`document.querySelectorAll('${LIST} li[data-key]').length`), 0);
  await click(page, `${LIST} button.choose`);
  // the list stays open, with the caret in the text
  assert.equal(await listOpen(page), true);
  const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('dialog.beeson-edit-tex input[type=file]')` });
  const files = ['preamble.tex', 'references.bib', 'tex.js', 'defs.tex', 'mymath.sty', 'index.html'].map((name) => resolve(DIR, name));
  await page.send('DOM.setFileInputFiles', { files, objectId: result.objectId });
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 3`);
  await press(page, 'Enter');
  await page.waitFor(`!document.querySelector('${LIST}')`);
  assert.equal(await render(page), expect([PLAIN, cited('koon2000')]));
});

test('the list fits a phone', { timeout: 120000 }, async (t) => {
  const page = await open('other', await browser.newPage({ width: 390, height: 844, mobile: true }));
  t.after(() => page.close());
  await typeCite(page);
  const box = await page.evaluate(`(() => { const r = document.querySelector('${LIST}').getBoundingClientRect(); return { left: r.left, right: r.right }; })()`);
  assert.ok(box.left >= 0 && box.right <= 390, `the list is wider than the phone: ${js(box)}`);
});

test('a closing brace after a key that matches no paper is kept in the text, and the list is closed', { timeout: 120000 }, async (t) => {
  const page = await open();
  t.after(() => page.close());
  await typeCite(page);
  await type(page, 'nokey');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 0`);
  await type(page, '}');
  await page.waitFor(`!document.querySelector('${LIST}')`);
  assert.match(await lastText(page), /\\cite\{nokey\}$/);
  assert.deepEqual(errors(page), []);
});
