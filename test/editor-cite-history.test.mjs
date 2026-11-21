import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { editorPage, press, type, typeKeys } from './helpers/editor.mjs';
import { freshDeck } from './helpers/fresh.mjs';

const DIR = 'test/pages/tex-sheets';
const DECK = `${DIR}/index.html`;
const SOURCE = readFileSync(DECK, 'utf8');
const LIST = '.beeson-cite';

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
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
const errors = (page) => page.errors.filter((e) => !/404/.test(e));
const PARA = (words) => `[...document.querySelectorAll('.reveal section.present p')].find((p) => p.textContent.startsWith(${js(words)}))`;
const html = (page, words) => page.evaluate(`${PARA(words)}.innerHTML`);

async function open(t, title) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=mac`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  const s = await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`);
  assert.deepEqual(s.problems, []);
  await page.evaluate(`Reveal.slide(Reveal.getIndices([...document.querySelectorAll('.reveal .slides > section')].find((s) => s.querySelector('h2')?.textContent === ${js(title)})).h)`);
  await page.waitFor(`document.querySelector('.reveal section.present h2')?.textContent === ${js(title)}`);
  return page;
}

async function caretAfter(page, words) {
  await page.evaluate(`(() => {
    const p = ${PARA(words)};
    p.focus();
    const r = document.createRange();
    r.selectNodeContents(p);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);
  await page.waitFor(`document.activeElement === ${PARA(words)}`);
}

async function openList(page) {
  await type(page, ' \\cite{');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 3`);
}

async function cut(page) {
  const base = { key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, modifiers: 4 };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, commands: ['cut'] });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

test('a space and a word typed right after a new citation at the end of a paragraph are put after the citation (#66)', { timeout: 120000 }, async (t) => {
  const page = await open(t, 'Citations');
  await caretAfter(page, 'Invariant');
  await openList(page);
  await type(page, 'koon');
  await page.waitFor(`document.querySelector('${LIST} li[aria-selected="true"]')?.dataset.key === 'koon2000'`);
  await press(page, 'Enter');
  await page.waitFor(`!document.querySelector('${LIST}')`);
  await typeKeys(page, ' more');
  await page.waitFor(`${PARA('Invariant')}.textContent.endsWith('more')`);
  assert.match(await render(page), /<p>Invariant manifolds guide a low-energy transfer<cite data-key="koon2000"><\/cite> more<\/p>/);
  assert.deepEqual(errors(page), []);
});

test('an Undo after a citation brace typed after a pause takes the citation back, and the next one the typing (#67)', { timeout: 120000 }, async (t) => {
  const page = await open(t, 'Citations');
  await caretAfter(page, 'Invariant');
  const plain = await html(page, 'Invariant');
  await openList(page);
  await type(page, 'gomez');
  await page.waitFor(`document.querySelectorAll('${LIST} li[data-key]').length === 1`);
  await sleep(1500);
  await type(page, '}');
  await page.waitFor(`!document.querySelector('${LIST}') && !!${PARA('Invariant')}.querySelector('cite')`);
  await undo(page);
  assert.equal(await html(page, 'Invariant'), `${plain} \\cite{gomez`);
  await undo(page);
  assert.equal(await html(page, 'Invariant'), plain);
  assert.deepEqual(errors(page), []);
});

test('an Undo after a key and Backspace typed after a pause takes back the typing before them (#67)', { timeout: 120000 }, async (t) => {
  const page = await open(t, 'Citations');
  await caretAfter(page, 'Invariant');
  const plain = await html(page, 'Invariant');
  await typeKeys(page, ' x');
  await page.waitFor(`${PARA('Invariant')}.textContent.endsWith('x')`);
  await sleep(1500);
  await typeKeys(page, 'y');
  await page.waitFor(`${PARA('Invariant')}.textContent.endsWith('xy')`);
  await press(page, 'Backspace');
  await page.waitFor(`${PARA('Invariant')}.textContent.endsWith(' x')`);
  await undo(page);
  assert.equal(await html(page, 'Invariant'), plain);
  assert.deepEqual(errors(page), []);
});

const R29 = 'test/pages/editor-r29-1.html';
const GLUED = readFileSync(R29, 'utf8')
  .replaceAll('"../../theme/', '"theme/')
  .replace('<table><tr>', '<table data-anchor="a2"><tr>')
  .replace('translate: 1300px 700px"></div>', 'translate: 1300px 700px" data-anchor="a1"></div>\n  <svg class="line" width="1148" height="357" style="translate: 252px 403px; z-index: 1" data-from="a1 0.5 0.5" data-to="a2 1 0.5"><defs><marker id="line-1" orient="auto-start-reverse"><path d="M-4-2.5 1 0-4 2.5z"></path></marker></defs><line x1="1148" y1="357" x2="0" y2="0"></line></svg>');

test('words that move an attached line, taken back by one Backspace, leave the line where it was (#67)', { timeout: 120000 }, async (t) => {
  const page = await editorPage(browser, { deck: freshDeck(t, GLUED), text: GLUED, page: { width: 1600, height: 1000 } });
  t.after(() => page.close());
  await page.evaluate('(Reveal.slide(2), true)');
  await page.waitFor('Reveal.getIndices().h === 2');
  const LINE = `window.BeesonEditor.render().match(/<svg class="line"[^>]*>/)[0]`;
  const drawn = await page.evaluate(LINE);
  const P = `Reveal.getCurrentSlide().querySelector('p')`;
  await page.evaluate(`(() => { const p = ${P}; p.focus(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); return true; })()`);
  await page.waitFor(`document.activeElement === ${P}`);
  const words = ' and many more words that wrap the paragraph onto a second line and onto a third line of the column';
  await page.send('Input.insertText', { text: words });
  await page.waitFor(`${LINE} !== ${js(drawn)}`);
  await page.evaluate(`(() => {
    const p = ${P};
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const at = n.data.indexOf(${js(words)});
      if (at < 0) continue;
      const r = document.createRange();
      r.setStart(n, at);
      r.setEnd(n, at + ${words.length});
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      return true;
    }
    throw new Error('the words are not in one text node');
  })()`);
  await press(page, 'Backspace');
  await page.waitFor(`!${P}.textContent.includes('many more words')`);
  await page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const place = (tag) => [tag.match(/translate: [^;"]*/)[0], tag.match(/height="[^"]*"/)[0]];
  assert.deepEqual(place(await page.evaluate(LINE)), place(drawn), 'the line is left where the words pushed it');
  await undo(page);
  assert.equal(await page.evaluate(LINE), drawn);
  assert.deepEqual(errors(page), []);
});

for (const [title, words, select] of [
  ['Theorems', 'A theorem', `(p) => { const n = p.lastChild; const r = document.createRange(); r.setStart(n, n.data.length - 3); r.setEnd(n, n.data.length); return r; }`],
  ['Citations', 'A heteroclinic', `(p) => { const r = document.createRange(); r.setStart(p.firstChild, p.firstChild.data.indexOf('orbits')); r.setEnd(p.lastChild, p.lastChild.data.length); return r; }`],
]) {
  test(`a cut right after typing in ${title === 'Theorems' ? 'a theorem' : 'a range across a citation'} is an entry of its own, labeled Cut (#68)`, { timeout: 120000 }, async (t) => {
    const page = await open(t, title);
    await caretAfter(page, words);
    await typeKeys(page, ' abc def');
    await page.waitFor(`${PARA(words)}.textContent.endsWith('abc def')`);
    const typed = await html(page, words);
    await page.evaluate(`(() => { const r = (${select})(${PARA(words)}); getSelection().removeAllRanges(); getSelection().addRange(r); return true; })()`);
    await cut(page);
    await page.waitFor(`${PARA(words)}.innerHTML !== ${js(typed)}`);
    assert.equal(await undoLabel(page), 'Undo Cut');
    await undo(page);
    assert.equal(await html(page, words), typed);
    assert.deepEqual(errors(page), []);
  });
}
