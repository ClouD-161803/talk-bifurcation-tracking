// tests of TeX in a session of the edit command, each on a copy of test/pages/tex-sheets with two
// pages. the edit command writes tex.js for a citation added or deleted on a page and for a change
// of preamble.tex on disk, and every page draws the deck with the new tex.js, a guest of the relay
// among them. a start, a join, and a talk folder without the sources leave every file as it is

import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { launch } from '../scripts/chrome.mjs';
import { startRelay } from '../scripts/relay.mjs';
import { deckTex } from '../scripts/tex.mjs';
import { caretAtEnd, front } from './helpers/apply.mjs';
import { clean, converge, open, sessionUrl, show } from './helpers/client.mjs';
import { press, type, typeKeys } from './helpers/editor.mjs';
import { fileMenu } from './helpers/session-mode.mjs';
import { post, startEdit, stopEdit, talkFolder, until } from './helpers/session.mjs';

const DIR = 'test/pages/tex-sheets';
const DECK = readFileSync(`${DIR}/index.html`, 'utf8').replaceAll('../../../theme/', 'theme/');
const SOURCES = ['preamble.tex', 'references.bib', 'tex.js', 'defs.tex', 'mymath.sty'];
const SECRET = 'a secret of the relay of the tests';
const HOST_BIB = 'In a session, the host adds a paper to references.bib in the talk folder.';
const LIST = '.beeson-cite';
// each citation of the deck as key=number, with ! after a paper that tex.js does not have
const NUMBERS = `[...document.querySelectorAll('.reveal .slides cite[data-key]')].map((c) => c.dataset.key + '=' + (c.dataset.n ?? '') + (c.hasAttribute('data-missing') ? '!' : '')).join(' ')`;
// the formula of \Q drawn in red, as MathJax draws a macro that it does not know
const RED = `!!document.querySelector('tr[data-case="a macro that is not defined yet"]').querySelector('[fill="red"], [data-mjx-error]')`;
const HEAD = `document.querySelector('.reveal .slides p.theorem[data-kind="conjecture"]').dataset.head`;
// the edit command answers 404 for a package of the preamble that is not in the talk folder, e.g.
// physics.sty
const MISSING = [/404/];

let browser;
before(async () => {
  browser = await launch({ offline: false });
});
after(() => browser?.close());

// a talk folder with the deck of test/pages/tex-sheets, the files of names next to it as change
// returns them, and copies of theme/ and brand/, with the edit command started on it. snapshot()
// returns the text and the modification time of index.html and of each file of names
async function texTalk(t, { names = SOURCES, change = (name, text) => text } = {}) {
  const folder = talkFolder(t, DECK);
  for (const name of names) writeFileSync(join(folder.talk, name), change(name, readFileSync(join(DIR, name), 'utf8')));
  for (const dir of ['theme', 'brand']) cpSync(resolve(dir), join(folder.talk, dir), { recursive: true });
  const server = {
    ...folder,
    file: join(folder.talk, 'index.html'),
    edit: null,
    read: (name = 'index.html') => readFileSync(join(folder.talk, name), 'utf8'),
    write: (name, text) => writeFileSync(join(folder.talk, name), text),
    snapshot: () => Object.fromEntries(['index.html', ...names].map((name) => [name, { text: server.read(name), at: statSync(join(folder.talk, name)).mtimeMs }])),
  };
  server.before = server.snapshot();
  t.after(async () => {
    if (server.edit) await stopEdit(server.edit);
    rmSync(folder.root, { recursive: true, force: true });
  });
  server.edit = await startEdit(folder.talk, { env: { XDG_CONFIG_HOME: folder.config, APPDATA: folder.config } });
  return server;
}

// a page of the editor for each of urls, returned once every page reads as index.html
async function pages(t, server, urls = [sessionUrl(server.edit), sessionUrl(server.edit)]) {
  const list = [];
  for (const [i, url] of urls.entries()) list.push(await open(browser, url, { name: ['Ann', 'Ben'][i] }));
  t.after(() => Promise.all(list.map((page) => page.close())));
  await converge(server, list);
  return list;
}

// waits until each page of list reads expression as true. each page is brought to the front in
// turn, since a page behind does not draw frames. a timeout names the page and what it reads
async function onEvery(list, expression, timeout = 30_000) {
  for (const [i, page] of list.entries()) {
    await front(page);
    await page.waitFor(expression, timeout).catch(async (e) => {
      throw new Error(`page ${i} reads ${NUMBERS} as ${JSON.stringify(await page.evaluate(NUMBERS))} and tex.js as ${JSON.stringify(await page.evaluate('Object.keys(window.beesonTex?.macros ?? {}).join(" ")'))}: ${e.message}`);
    });
  }
}

// the paper of key cited at the end of the text element of expression, with \cite{ typed and the
// paper chosen in the list by query
async function cite(page, expression, query, key) {
  await front(page);
  await caretAtEnd(page, expression);
  await type(page, ' \\cite{');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length > 0`);
  await type(page, query);
  await page.waitFor(`document.querySelector('${LIST} li[aria-selected="true"]')?.dataset.key === ${JSON.stringify(key)}`);
  await press(page, 'Enter');
  await page.waitFor(`!document.querySelector('${LIST}')`);
}

test('a paper of references.bib that tex.js does not have, cited on one page, is written into tex.js, and is numbered the same on both pages', { timeout: 180_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  assert.ok(!server.read('tex.js').includes('szebehely1967'));
  await show(ann, 'Citations');
  await show(ben, 'Citations');
  await cite(ann, `document.querySelector('.reveal section.present p:nth-of-type(3)')`, 'szeb', 'szebehely1967');
  await until(() => server.read('tex.js').includes('"szebehely1967"'), 'the reference of szebehely1967 in tex.js');
  assert.equal(server.read('tex.js'), deckTex(server.file).text, 'tex.js is the one of npm run tex');
  await onEvery([ann, ben], `${NUMBERS} === 'koon2000=1 gomez2004=2 szebehely1967=3'`);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a citation deleted on one page is taken out of tex.js, and the others are numbered again on both pages', { timeout: 180_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann, ben] = await pages(t, server);
  assert.ok(server.read('tex.js').includes('"koon2000"'));
  await show(ann, 'Citations');
  await show(ben, 'Citations');
  await front(ann);
  await ann.evaluate(`(() => {
    const c = document.querySelector('.reveal .slides cite[data-key="koon2000"]');
    c.closest('p').focus();
    const r = document.createRange();
    r.selectNode(c);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);
  await press(ann, 'Backspace');
  await until(() => !server.read().includes('koon2000'), 'the citation of koon2000 deleted from index.html');
  await until(() => !server.read('tex.js').includes('koon2000'), 'the reference of koon2000 taken out of tex.js');
  assert.equal(server.read('tex.js'), deckTex(server.file).text, 'tex.js is the one of npm run tex');
  await onEvery([ann, ben], `${NUMBERS} === 'gomez2004=1'`);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('a start of the edit command and a join of two pages do not write any file of the talk folder', { timeout: 180_000 }, async (t) => {
  // a tex.js that the sources would not give, which a derivation at the start would write again
  const server = await texTalk(t, { change: (name, text) => (name === 'tex.js' ? text.replace('    "half": "\\\\frac{1}{2}",\n', '') : text) });
  assert.notEqual(server.read('tex.js'), deckTex(server.file).text);
  const [ann, ben] = await pages(t, server);
  await show(ann, 'Citations');
  await show(ben, 'Citations');
  assert.deepEqual(server.snapshot(), server.before);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('tex.js is not written in a talk folder without preamble.tex and references.bib', { timeout: 180_000 }, async (t) => {
  const server = await texTalk(t, { names: ['tex.js'] });
  const [ann, ben] = await pages(t, server);
  // an agent cites a paper that tex.js does not have
  server.write('index.html', server.read().replace('low-energy transfer</p>', 'low-energy transfer<cite data-key="szebehely1967"></cite></p>'));
  await converge(server, [ann, ben]);
  await show(ann, 'Citations');
  await caretAtEnd(ann, `document.querySelector('.reveal section.present p:nth-of-type(2)')`);
  await typeKeys(ann, ' again');
  await until(() => server.read().includes('halo orbits<cite data-key="gomez2004"></cite>. again'), 'the typing in index.html');
  await converge(server, [ann, ben]);
  assert.deepEqual(server.snapshot()['tex.js'], server.before['tex.js']);
  clean(ann, MISSING);
  clean(ben, MISSING);
});

test('File > Preamble… and File > Bibliography… are off in a session with a note, and a BibTeX entry pasted into the list of Insert > Citation… is refused with its note', { timeout: 180_000 }, async (t) => {
  const server = await texTalk(t);
  const [ann] = await pages(t, server, [sessionUrl(server.edit)]);
  const bib = server.read('references.bib');
  for (const id of ['file.preamble', 'file.bibliography']) assert.equal(await ann.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)}).enabled`), false, `${id} is enabled in a session`);
  const items = await fileMenu(ann);
  assert.deepEqual([items['file.preamble'], items['file.bibliography']], [
    { label: 'Preamble…In a session, the host edits preamble.tex in the talk folder', disabled: true },
    { label: 'Bibliography…In a session, the host edits references.bib in the talk folder', disabled: true },
  ]);
  await show(ann, 'Citations');
  await caretAtEnd(ann, `document.querySelector('.reveal section.present p:nth-of-type(3)')`);
  await ann.evaluate(`Promise.resolve(window.BeesonEditor.exec('insert.citation')).then(() => true)`);
  await ann.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 3`);
  assert.equal(await ann.evaluate(`document.querySelector('${LIST} input').placeholder`), 'Author, year, title, or key');
  await ann.evaluate(`(() => {
    const input = document.querySelector('${LIST} input');
    input.value = 'conley';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await ann.waitFor(`document.querySelector('${LIST} .note').textContent === ${JSON.stringify(`No entry of references.bib matches conley. ${HOST_BIB}`)}`);
  await ann.evaluate(`(() => {
    const data = new DataTransfer();
    data.setData('text/plain', '@article{conley1968, author = {Conley, Charles}, title = {Low energy transit orbits}, year = {1968}}');
    document.querySelector('${LIST} input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return true;
  })()`);
  await ann.waitFor(`document.querySelector('${LIST} .note').textContent === ${JSON.stringify(HOST_BIB)}`);
  assert.equal(await ann.evaluate(`!!document.querySelector('.reveal .slides cite[data-key="conley1968"]')`), false);
  await converge(server, [ann]);
  assert.equal(server.read('references.bib'), bib);
  assert.ok(!server.read().includes('conley1968'));
  clean(ann, MISSING);
});
