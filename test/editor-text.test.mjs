// the structure and the formats of the text of a slide, on both platforms: Return splits a block,
// Backspace and Delete join two, Tab and Shift+Tab change the level of a list item, the list
// switch, the links, the formats of the words, their tones, and the paragraph styles. each edit is
// checked byte for byte, after an undo and a redo, against the scope rule, and after a save and an
// open of the saved text

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { deckSettled, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { normalizeHref } from '../src/editor/text/link.ts';
import { byteExact, click, clickText, press, saveAndReopen, selectPicture, type, typeKeys } from './helpers/editor.mjs';
import { smartLink } from '../src/editor/text/substitute.ts';

const LAYOUTS = 'test/pages/editor-layouts.html';
const PLATFORMS = ['mac', 'other'];
const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));

const FIRST = '<li class="fragment" data-fragment-index="1">A first item</li>';
const PARAGRAPH = '<p>A paragraph with <strong>bold</strong>, <em>italic</em>, <code>code</code>, and \\(x^2\\) inline.</p>';
const LIST = `<ul>
    ${FIRST}
    <li class="fragment" data-fragment-index="2">A second item
      <ul>
        <li>A nested item</li>
      </ul>
    </li>
  </ul>`;

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

// the editor on the third slide of the deck of layouts, served over HTTP, where a save is written
// into the origin private file system
let last = null;

async function textPage(platform) {
  await last?.close().catch(() => {});
  const page = await browser.newPage();
  last = page;
  await page.goto(`${server.origin}/${LAYOUTS}?edit&still&edit-platform=${platform}`);
  await page.waitFor(deckSettled);
  await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
  page.source = readFileSync(LAYOUTS, 'utf8');
  const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
  assert.deepEqual(status.problems, []);
  await page.evaluate('Reveal.slide(2)');
  return page;
}

// selects the characters start to end of the text of the first element at selector whose text
// contains has, with its block focused
const select = (page, selector, has, start, end = start) =>
  page.evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(has)}));
    const at = (k) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let left = k;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (left <= n.length) return [n, left];
        left -= n.length;
      }
      return [el, el.childNodes.length];
    };
    el.closest('[contenteditable="true"]').focus();
    const r = document.createRange();
    r.setStart(...at(${start}));
    r.setEnd(...at(${end}));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);

const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
const redo = (page) => page.evaluate('window.BeesonEditor.redo()');

// a trusted key with its key, code, and Windows key code given, for a symbol that press() does not
// know. mods holds the bits Alt 1, Ctrl 2, Meta 4, and Shift 8
async function raw(page, key, code, keyCode, mods) {
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers: mods });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers: mods });
}

// the problems of the scope rule in the rendered text that the file did not have before
async function inScope(page) {
  const now = textProblems(await page.evaluate('window.BeesonEditor.render()'), THEME);
  for (const p of textProblems(page.source, THEME)) {
    const i = now.indexOf(p);
    if (i >= 0) now.splice(i, 1);
  }
  assert.deepEqual(now, []);
}

// the edit checked byte for byte, then after an undo, which gives the file with the edits before,
// and again after a redo
async function roundTrip(page, edits, label, before = []) {
  await byteExact(page, edits);
  await inScope(page);
  if (label) assert.equal((await state(page, 'edit.undo')).label, `Undo ${label}`);
  await undo(page);
  await byteExact(page, before);
  await redo(page);
  await byteExact(page, edits);
}

// the errors of the page, apart from the request of a favicon, which the server does not have
const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

let saves = 0;

async function saved(page, edits) {
  const { text } = await saveAndReopen(page, `text-${++saves}.html`);
  page.source = text;
  await byteExact(page);
  assert.ok(edits.every(([, after]) => text.includes(after)));
}

test('an address typed into the link dialog is made an href', () => {
  assert.equal(normalizeHref(' example.com/a '), 'https://example.com/a');
  assert.equal(normalizeHref('http://example.com'), 'http://example.com');
  assert.equal(normalizeHref('me@example.com'), 'mailto:me@example.com');
  assert.equal(normalizeHref('#/7'), '#/7');
  assert.equal(normalizeHref('javascript:alert(1)'), null);
  assert.equal(normalizeHref('  '), null);
});

for (const platform of PLATFORMS) {
  const mod = platform === 'mac' ? 4 : 2;

  test(`Return splits a list item at the caret, and Backspace at the start of the second joins them on ${platform}`, async () => {
    const page = await textPage(platform);
    const split = [FIRST, `<li class="fragment" data-fragment-index="1">A first</li>\n    <li class="fragment" data-fragment-index="1"> item</li>`];
    await select(page, '.reveal section.present li', 'A first item', 7);
    await press(page, 'Enter');
    await roundTrip(page, [split], 'New Paragraph');
    await select(page, '.reveal section.present li', ' item', 0);
    await press(page, 'Backspace');
    await byteExact(page);
    assert.equal((await state(page, 'edit.undo')).label, 'Undo Join Paragraphs');
    await undo(page);
    await byteExact(page, [split]);
    // Delete at the end of the first part joins them too
    await select(page, '.reveal section.present li', 'A first', 7);
    await press(page, 'Delete');
    await byteExact(page);
    await undo(page);
    await byteExact(page, [split]);
    await saved(page, [split]);
    assert.deepEqual(errors(page), []);
  });

  test(`Return in a nested item splits it, and Backspace at its start takes it out of its list on ${platform}`, async () => {
    const page = await textPage(platform);
    const nested = ['<li>A nested item</li>', '<li>A </li>\n        <li>nested item</li>'];
    await select(page, '.reveal section.present li li', 'A nested item', 2);
    await press(page, 'Enter');
    await roundTrip(page, [nested], 'New Paragraph');
    await select(page, '.reveal section.present li li', 'nested item', 0);
    await press(page, 'Backspace');
    const out = ['<li>A nested item</li>\n      </ul>\n    </li>', '<li>A </li>\n      </ul>\n    </li>\n    <li>nested item</li>'];
    await roundTrip(page, [out], 'Decrease Indent Level', [nested]);
    await saved(page, [out]);
    assert.deepEqual(errors(page), []);
  });

  test(`Tab nests a list item in a ul of the item before, and Shift+Tab takes it out on ${platform}`, async () => {
    const page = await textPage(platform);
    // Tab in the first item is taken, and does not change its level
    await select(page, '.reveal section.present li', 'A first item', 3);
    await press(page, 'Tab');
    await byteExact(page);
    assert.equal(await page.evaluate('window.BeesonEditor.status().undo'), false);
    await select(page, '.reveal section.present li', 'A first item', 12);
    await press(page, 'Enter');
    await type(page, 'Another');
    const top = [FIRST, `${FIRST}\n    <li class="fragment" data-fragment-index="1">Another</li>`];
    await byteExact(page, [top]);
    await press(page, 'Tab');
    const nested = [FIRST, '<li class="fragment" data-fragment-index="1">A first item\n      <ul>\n        <li class="fragment" data-fragment-index="1">Another</li>\n      </ul>\n    </li>'];
    await roundTrip(page, [nested], 'Increase Indent Level', [top]);
    await select(page, '.reveal section.present li li', 'Another', 3);
    await press(page, 'Shift+Tab');
    await roundTrip(page, [top], 'Decrease Indent Level', [nested]);
    await undo(page);
    await byteExact(page, [nested]);
    await saved(page, [nested]);
    assert.deepEqual(errors(page), []);
  });

  test(`a list is switched between chevrons, numbers, and paragraphs on ${platform}`, async () => {
    const page = await textPage(platform);
    await select(page, '.reveal section.present li', 'A first item', 3);
    assert.deepEqual(await state(page, 'text.list.ul'), { id: 'text.list.ul', label: 'Arrows', enabled: true, checked: true });
    await exec(page, 'text.list.ol');
    const ol = [LIST, LIST.replace(/^<ul>/, '<ol>').replace(/<\/ul>$/, '</ol>')];
    await roundTrip(page, [ol], 'List Style');
    await undo(page);
    await select(page, '.reveal section.present li', 'A first item', 3);
    await exec(page, 'text.list.none');
    const none = [`<ul>\n    ${FIRST}`, '<p class="fragment" data-fragment-index="1">A first item</p>\n  <ul>'];
    await roundTrip(page, [none], 'List Style');
    await undo(page);
    await select(page, '.reveal section.present > p', 'A paragraph', 3);
    await exec(page, 'text.list.ul');
    const ul = [PARAGRAPH, `<ul>\n    ${PARAGRAPH.replace(/^<p>/, '<li>').replace(/<\/p>$/, '</li>')}\n  </ul>`];
    await roundTrip(page, [ul], 'List Style');
    await saved(page, [ul]);
    assert.deepEqual(errors(page), []);
  });

  test(`a link to a slide is written as href="#/7", from the dialog of Mod+K and from exec on ${platform}`, async () => {
    const page = await textPage(platform);
    await select(page, '.reveal section.present > p', 'A paragraph', 2, 11);
    await press(page, 'Mod+K');
    await page.waitFor(`document.querySelector('dialog.beeson-edit-link[open]') !== null`);
    assert.equal(await page.evaluate('window.BeesonEditor.status().undo'), false);
    await click(page, 'dialog.beeson-edit-link [data-kind="slide"]');
    await page.evaluate(`(() => { const s = document.querySelector('dialog.beeson-edit-link select'); s.value = '7'; s.dispatchEvent(new Event('change')); s.focus(); })()`);
    await press(page, 'Enter');
    await page.waitFor(`window.BeesonEditor.render().includes('href="#/7"')`);
    const link = [PARAGRAPH, PARAGRAPH.replace('paragraph', '<a href="#/7">paragraph</a>')];
    await roundTrip(page, [link], 'Link');
    // the caret in the link opens the dialog on its slide, and Remove takes the link off
    await select(page, '.reveal section.present a', 'paragraph', 3);
    assert.equal((await state(page, 'text.link')).label, 'Edit Link…');
    await press(page, 'Mod+K');
    await page.waitFor(`document.querySelector('dialog.beeson-edit-link[open]') !== null`);
    assert.equal(await page.evaluate(`document.querySelector('dialog.beeson-edit-link select').value`), '7');
    await click(page, 'dialog.beeson-edit-link .remove');
    await page.waitFor(`!window.BeesonEditor.render().includes('href="#/7"')`);
    await byteExact(page);
    await undo(page);
    await byteExact(page, [link]);
    // a webpage typed without its scheme, and Esc, which closes the dialog without a change
    await select(page, '.reveal section.present > p', 'A paragraph', 17, 21);
    await press(page, 'Mod+K');
    await page.waitFor(`document.activeElement?.name === 'href'`);
    await press(page, 'Escape');
    await page.waitFor(`document.querySelector('dialog.beeson-edit-link') === null`);
    await byteExact(page, [link]);
    await press(page, 'Mod+K');
    await page.waitFor(`document.activeElement?.name === 'href'`);
    await type(page, 'example.com');
    await press(page, 'Enter');
    await page.waitFor(`window.BeesonEditor.render().includes('example.com')`);
    const web = [PARAGRAPH, link[1].replace('<strong>bold</strong>', '<a href="https://example.com"><strong>bold</strong></a>')];
    await byteExact(page, [web]);
    await inScope(page);
    await undo(page);
    await byteExact(page, [link]);
    await saved(page, [link]);
    assert.deepEqual(errors(page), []);
  });

  test(`superscript, subscript, code, the tones, and Clear Formatting on the words of a selection on ${platform}`, async () => {
    const page = await textPage(platform);
    const word = (html) => [PARAGRAPH, PARAGRAPH.replace('paragraph', html)];
    await select(page, '.reveal section.present > p', 'A paragraph', 2, 11);
    if (platform === 'mac') await raw(page, '=', 'Equal', 187, 2 | mod);
    else await raw(page, '.', 'Period', 190, mod);
    await roundTrip(page, [word('<sup>paragraph</sup>')], 'Superscript');
    await select(page, '.reveal section.present > p', 'A paragraph', 2, 11);
    assert.equal((await state(page, 'text.superscript')).checked, true);
    // subscript takes superscript off, and a second subscript takes itself off
    if (platform === 'mac') await raw(page, '-', 'Minus', 189, 2 | mod);
    else await raw(page, ',', 'Comma', 188, mod);
    await roundTrip(page, [word('<sub>paragraph</sub>')], 'Subscript', [word('<sup>paragraph</sup>')]);
    await select(page, '.reveal section.present > p', 'A paragraph', 2, 11);
    await exec(page, 'text.subscript');
    await byteExact(page);
    await exec(page, 'text.code');
    await roundTrip(page, [word('<code>paragraph</code>')], 'Code');
    await select(page, '.reveal section.present > p', 'A paragraph', 2, 11);
    await exec(page, 'text.code');
    for (const tone of ['accent', 'violet', 'blue', 'red', 'subtle', 'muted']) {
      await exec(page, `text.tone.${tone}`);
      await byteExact(page, [word(`<span class="tone-${tone}">paragraph</span>`)]);
      assert.equal((await state(page, `text.tone.${tone}`)).checked, true);
    }
    await inScope(page);
    await exec(page, 'text.tone.text');
    await byteExact(page);
    // the caret in a word sets the format on the word
    await select(page, '.reveal section.present > p', 'A paragraph', 5);
    await press(page, 'Mod+B');
    await roundTrip(page, [word('<strong>paragraph</strong>')], 'Bold');
    await select(page, '.reveal section.present > p', 'A paragraph', 5);
    await exec(page, 'text.tone.accent');
    await select(page, '.reveal section.present > p', 'A paragraph', 0, 35);
    if (platform === 'mac') await raw(page, '\\', 'Backslash', 220, mod);
    else await press(page, 'Mod+Space');
    const clear = [PARAGRAPH, '<p>A paragraph with bold, italic, code, and \\(x^2\\) inline.</p>'];
    await roundTrip(page, [clear], 'Clear Formatting', [word('<strong><span class="tone-accent">paragraph</span></strong>')]);
    await saved(page, [clear]);
    assert.deepEqual(errors(page), []);
  });

  test(`the paragraph styles, and Bigger and Smaller along them on ${platform}`, async () => {
    const page = await textPage(platform);
    const as = (open, close) => [PARAGRAPH, PARAGRAPH.replace(/^<p>/, open).replace(/<\/p>$/, close)];
    const block = () => select(page, '.reveal section.present > :is(p, h3, div)', 'A paragraph', 3);
    const smaller = () => raw(page, '<', 'Comma', 188, mod | 8);
    const bigger = () => raw(page, '>', 'Period', 190, mod | 8);
    // each style after the one before, with the caret kept in the retagged block
    const steps = [
      [() => exec(page, 'text.style.subheading'), as('<h3>', '</h3>'), 'Paragraph Style', 'h3'],
      [smaller, as('<p>', '</p>'), 'Smaller', 'p'],
      [smaller, as('<p class="small">', '</p>'), 'Smaller', 'p'],
      [smaller, as('<div class="foot">', '</div>'), 'Smaller', 'div'],
      [bigger, as('<p class="small">', '</p>'), 'Bigger', 'p'],
      [() => exec(page, 'text.style.caption'), as('<p class="caption">', '</p>'), 'Paragraph Style', 'p'],
    ];
    await block();
    assert.equal((await state(page, 'text.style.body')).checked, true);
    let before = [];
    for (const [run, edit, label, tag] of steps) {
      await run();
      assert.equal(await page.evaluate('document.activeElement.localName'), tag);
      await roundTrip(page, [edit], label, before);
      before = [edit];
      await block();
    }
    assert.equal((await state(page, 'text.style.caption')).checked, true);
    await smaller();
    await byteExact(page, [as('<div class="foot">', '</div>')]);
    await block();
    assert.equal((await state(page, 'text.smaller')).enabled, false);
    await exec(page, 'text.style.body');
    await byteExact(page);
    // a style is set on a block selected on the canvas too, after Esc leaves its text
    await press(page, 'Escape');
    assert.equal(await page.evaluate('document.activeElement.localName'), 'body');
    await exec(page, 'text.style.subheading');
    await byteExact(page, [as('<h3>', '</h3>')]);
    await saved(page, [as('<h3>', '</h3>')]);
    assert.deepEqual(errors(page), []);
  });
}

// regression tests of R23.1 on both platforms, for six gaps of the acceptance audit of round 8: a
// moved or turned element glides in a Magic Move of the show, the formula key writes into a new
// empty text box, a paragraph style keeps a trailing space, the effect of a step is set on an
// element shown with the slide, an empty list item is drawn without its mark outside the editor,
// Oval gives the ellipse of a letterboxed picture, and Text Color > Text gives a small paragraph
// the text color. after each edit an undo gives the file byte for byte, a redo gives the edit, and
// a save is opened again without problems
describe('Magic Move glide, formula key, and list marks', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r23-1.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const SLIDE = '.reveal .slides > section.present';

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
  const sleep = (ms) => new Promise((d) => setTimeout(d, ms));
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}, ${js(arg ?? null)} ?? undefined)).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undoLabel = async (page) => (await state(page, 'edit.undo')).label;

  function edited(edits) {
    let text = SOURCE;
    for (const [a, b] of edits) {
      assert.equal(text.split(a).length, 2, `${a} does not occur once in the deck`);
      text = text.replace(a, () => b);
    }
    return text;
  }

  // the editor on the deck at slide
  async function load(t, platform, slide = 0) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`)).problems, []);
    await page.evaluate(`Reveal.slide(${slide})`);
    await sleep(150);
    return page;
  }

  // the deck without the editor at slide, as the show draws it
  async function show(t, slide = 0, query = '') {
    const page = await browser.newPage({ width: 1600, height: 900 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/${DECK}${query}#/${slide}`);
    await page.waitFor(deckSettled);
    await sleep(200);
    return page;
  }

  // the edit is one entry of the history with label: an undo gives the file back byte for byte, a
  // redo gives the edit, and a save is opened again as it is
  async function roundTrip(page, expected, label) {
    assert.equal(await render(page), expected);
    if (label) assert.equal(await undoLabel(page), label);
    await undo(page);
    assert.equal(await render(page), SOURCE, 'the undo does not give the file back byte for byte');
    await redo(page);
    assert.equal(await render(page), expected, 'the redo does not give the edit back');
    const { text } = await saveAndReopen(page, `r23-1-${Math.random().toString(36).slice(2)}.html`);
    assert.equal(text, expected);
  }

  // the caret put into the block of selector by a click on its first characters
  async function caretIn(page, selector) {
    const at = await page.evaluate(`(() => {
    const el = document.querySelector(${js(`${SLIDE} ${selector}`)});
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n = w.nextNode();
    while (n && !n.data.trim()) n = w.nextNode();
    const i = n.data.search(/\\S/);
    const r = document.createRange();
    r.setStart(n, i + 1);
    r.setEnd(n, i + 2);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
    await clickText(page, at);
    await frames(page);
  }

  // the block of selector selected as an object, by a click into its text and Esc
  async function selectTextElement(page, selector) {
    await caretIn(page, selector);
    await press(page, 'Escape');
    await frames(page);
  }

  // G10. the shape moved between the two slides of the Magic Move is between its two places during
  // the move, and the turned one is between its two angles. the shape left in place stays there at
  // full opacity. the shapes are read in the page at each frame of the move, since on a slow runner
  // one read sent 160 ms after the move was started was answered after its end
  test('a moved and a turned element glide in a Magic Move of the show, and an element left in place stays', async (t) => {
    const page = await show(t, 0);
    const read = `(() => {
    const s = document.querySelector(${js(SLIDE)});
    const at = (id) => s.querySelector('[data-id="' + id + '"]');
    const box = (id) => { const r = at(id).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; };
    return { moved: box('moved'), still: box('still'), opacity: getComputedStyle(at('still')).opacity, turn: parseFloat(getComputedStyle(at('turned')).rotate) || 0 };
  })()`;
    const from = await page.evaluate(read);
    const moving = await page.evaluate(`new Promise((done) => {
    const read = () => ${read};
    const seen = [];
    Reveal.next();
    const start = performance.now();
    const frame = () => {
      seen.push(read());
      if (performance.now() - start < 1060) requestAnimationFrame(frame);
      else done(seen);
    };
    requestAnimationFrame(frame);
  })`);
    const to = await page.evaluate(read);
    assert.ok(to.moved[0] - from.moved[0] > 100, `the shape is not moved by the slides: ${js([from, to])}`);
    // the frame in which the moved shape is nearest to the middle of its way
    const half = (from.moved[0] + to.moved[0]) / 2;
    const mid = moving.reduce((a, b) => (Math.abs(b.moved[0] - half) < Math.abs(a.moved[0] - half) ? b : a));
    const between = (a, b, v) => v > Math.min(a, b) + 5 && v < Math.max(a, b) - 5;
    assert.ok(between(from.moved[0], to.moved[0], mid.moved[0]) && between(from.moved[1], to.moved[1], mid.moved[1]), `the moved shape is not between its places: ${js([from.moved, mid.moved, to.moved])}`);
    assert.ok(mid.turn > 5 && mid.turn < 85, `the turned shape is not between its angles: ${mid.turn}`);
    assert.equal(to.turn, 90);
    for (const f of moving) assert.deepEqual([f.still, f.opacity], [from.still, '1'], 'the shape left in place moves or fades');
    assert.deepEqual(to.still, from.still);
    assert.deepEqual(errors(page), []);
  });

  // the key of an inline formula: Cmd+Option+E on a Mac, and Alt+= elsewhere, sent as the browser
  // sends it
  async function formulaKey(page, platform) {
    if (platform === 'mac') return press(page, 'Mod+Alt+E');
    const base = { key: '=', code: 'Equal', windowsVirtualKeyCode: 187, modifiers: 1 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '=', unmodifiedText: '=' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  // a new text box on the empty slide, with the caret in it
  async function newBox(page) {
    await click(page, '.beeson-edit-top [data-command="insert.text"]');
    await sleep(300);
    assert.equal(await page.evaluate(`!!document.querySelector(${js(`${SLIDE} .beeson-pending`)})`), true, 'the box is not drawn');
  }

  // the TeX typed into the open sheet of a formula and applied with Mod+Enter
  async function applyTex(page, tex) {
    await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
    await type(page, tex);
    await sleep(300);
    await press(page, 'Mod+Enter');
    await sleep(500);
  }

  // a trusted click on the title of a menu of the menu bar, then on each item of path in turn
  async function choose(page, bar, ...path) {
    const i = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].findIndex((b) => b.textContent === ${js(bar)})`);
    assert.ok(i >= 0, `the menu bar does not have ${bar}`);
    await click(page, `.beeson-edit-menubar [role=menuitem]:nth-child(${i + 1})`);
    await frames(page);
    for (const label of path) {
      const at = await page.evaluate(`(() => {
      const items = [...document.querySelectorAll('.beeson-edit-menu .item')].filter((i) => i.querySelector('.label')?.textContent === ${js(label)} && i.getBoundingClientRect().width);
      const r = items.at(-1)?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    })()`);
      assert.ok(at, `the ${bar} menu does not have ${label}`);
      await clickText(page, at);
      await frames(page);
    }
  }

  // the text of the empty slide in the file, with the paragraph written there
  const emptySlide = (text) => text.match(/<section>\n  <h2>Empty<\/h2>[\s\S]*?<\/section>/)[0];

  for (const platform of PLATFORMS) {
    for (const route of ['key', 'menu']) {
      test(`G2: the formula ${route === 'key' ? 'key' : 'of Insert > Inline Formula'} in a new empty text box writes the formula into the box (${platform})`, async (t) => {
        const page = await load(t, platform, 2);
        await newBox(page);
        if (route === 'key') await formulaKey(page, platform);
        else await exec(page, 'math.inline');
        await applyTex(page, String.raw`\theta_1`);
        const text = await render(page);
        assert.match(emptySlide(text), /\n  <p( style="[^"]*")?>\\\(\\theta_1\\\)<\/p>\n<\/section>$/, `the formula is not written: ${emptySlide(text)}`);
        assert.equal(await page.evaluate(`document.querySelectorAll(${js(`${SLIDE} p mjx-container`)}).length`), 1, 'the formula is not typeset');
        // one entry, whose undo gives the file back
        await undo(page);
        assert.equal(await render(page), SOURCE, 'one undo does not give the file back');
        await redo(page);
        assert.equal(await render(page), text, 'the redo does not give the formula back');
        const saved = await saveAndReopen(page, `r23-1-g2-${route}-${platform}.html`);
        assert.equal(saved.text, text);
        assert.deepEqual(errors(page), []);
      });
    }

    test(`G2: a paragraph style chosen behind a trailing space keeps the space (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await newBox(page);
      await type(page, 'The swing ');
      await sleep(100);
      await choose(page, 'Format', 'Text', 'Small');
      await press(page, 'End');
      await type(page, 'slows.');
      await sleep(1300);
      const text = await render(page);
      assert.match(emptySlide(text), /<p( style="[^"]*")? class="small">The swing slows\.<\/p>/, `the space is lost: ${emptySlide(text)}`);
      assert.deepEqual(errors(page), []);
    });
  }

  // the center of the chip of the row of the Steps pane whose text starts with text
  const chipOf = (page, text) => page.evaluate(`(() => {
  const row = [...document.querySelectorAll('.beeson-edit-side .rows .row')].find((r) => r.querySelector('.text').textContent.startsWith(${js(text)}));
  const r = row.querySelector('.chip').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

  // the item label of the open menu taken with a trusted click, once it is enabled
  async function pickItem(page, label) {
    await page.waitFor(`!!document.querySelector('.beeson-edit-menu')`);
    const item = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.querySelector('.label')?.textContent === ${js(label)});
    if (!item || item.getAttribute('aria-disabled') === 'true') return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(item, `the menu does not have an enabled item ${label}`);
    // an item is taken at a release 250 ms after the press that opened its menu
    await sleep(300);
    await clickText(page, item);
    await frames(page);
  }

  const ALPHA = '<p>Alpha stays with the slide.</p>';
  const EFFECT = '.beeson-edit-side [aria-label="Effect of the step"]';

  // G12. the paragraph Alpha is shown with the slide, and Beta is step 1
  for (const platform of PLATFORMS) {
    test(`G12: the Effect control of the Steps pane makes an element shown with the slide the last step with the effect (${platform})`, async (t) => {
      const page = await load(t, platform, 3);
      await exec(page, 'view.steps');
      await frames(page);
      await selectTextElement(page, 'p');
      const control = await page.evaluate(`(() => { const b = document.querySelector(${js(EFFECT)}); return b && { disabled: b.disabled, text: b.textContent }; })()`);
      assert.deepEqual(control, { disabled: false, text: '—' }, 'the Effect control is not enabled for an element shown with the slide');
      await clickText(page, EFFECT);
      await pickItem(page, 'Dim');
      await roundTrip(page, edited([[ALPHA, '<p class="semi-fade-out fragment" data-fragment-index="2">Alpha stays with the slide.</p>']]), 'Undo Set Effect of Step');
      assert.deepEqual(errors(page), []);
    });

    test(`G12: the effect entries of the menu of a row make an element shown with the slide the last step with the effect (${platform})`, async (t) => {
      const page = await load(t, platform, 3);
      await exec(page, 'view.steps');
      await frames(page);
      await clickText(page, await chipOf(page, 'Alpha'));
      await pickItem(page, 'Fade Out');
      await roundTrip(page, edited([[ALPHA, '<p class="fade-out fragment" data-fragment-index="2">Alpha stays with the slide.</p>']]), 'Undo Set Effect of Step');
      assert.deepEqual(errors(page), []);
    });
  }

  // the content of the mark of each item of the slide of lists in root, which is none for an item
  // drawn without its mark
  const marks = (root = 'document') => `[...${root}.querySelectorAll('li')].map((li) => [li.closest('ul, ol').localName + (li.closest('ul, ol').className ? '.' + li.closest('ul, ol').className : ''), li.textContent, getComputedStyle(li, '::before').content])`;
  const LISTS = [['ul', 'A chevron', '""'], ['ul', '', 'none'], ['ul.dots', '', 'none'], ['ul.dashes', '', 'none'], ['ol', '', 'none']];

  // G7. the slide of lists has an empty item in a list of chevrons, of dots, of dashes, and of numbers,
  // whose marks the editor draws, since an empty item is the placeholder of a new slide
  for (const platform of PLATFORMS) {
    test(`G7: an empty list item is drawn without its mark in the show and in the print view, and with it in the editor (${platform})`, async (t) => {
      const page = await show(t, 4);
      assert.deepEqual(await page.evaluate(marks(`document.querySelector(${js(SLIDE)})`)), LISTS);
      assert.deepEqual(errors(page), []);
      const print = await browser.newPage({ width: 1600, height: 900 });
      t.after(() => print.close().catch(() => {}));
      await printView(print, `${server.origin}/${DECK}?print-pdf`);
      const pages = await print.evaluate(`[...document.querySelectorAll('.pdf-page section')].filter((s) => s.querySelector('h2')?.textContent === 'Lists').map((s) => ${marks('s')})`);
      assert.ok(pages.length >= 1, 'the print view does not have the slide of lists');
      for (const p of pages) assert.deepEqual(p, LISTS);
      const editor = await load(t, platform, 4);
      const drawn = await editor.evaluate(marks(`document.querySelector(${js(SLIDE)})`));
      assert.deepEqual(drawn.map((m) => m[2] !== 'none'), [true, true, true, true, true], `a mark is not drawn in the editor: ${js(drawn)}`);
      assert.deepEqual(errors(editor), []);
    });
  }

  // the picture of the shown image of the slide of pictures as drawn, in screen px: its box, and the
  // part of the box that the picture fills under object-fit contain
  const drawn = (page) => page.evaluate(`(() => {
  const img = [...document.querySelectorAll(${js(`${SLIDE} figure img`)})].find((i) => i.getBoundingClientRect().width);
  const r = img.getBoundingClientRect();
  const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  const round = (v) => Math.round(v * 10) / 10;
  return { box: [r.width, r.height].map(round), picture: [r.left + (r.width - w) / 2, r.top + (r.height - h) / 2, w, h].map(round) };
})()`);

  // G8. the picture of 1200 by 1440 px is drawn letterboxed at 600 by 720 px in the figure box of 600 by
  // 800 px, hence Oval writes its width, and the figure is moved by the 40 px that the picture rises
  for (const platform of PLATFORMS) {
    test(`G8: Oval on a picture drawn smaller than its box gives the ellipse of the picture, for both pictures of a pair (${platform})`, async (t) => {
      const page = await load(t, platform, 5);
      const before = await drawn(page);
      assert.notDeepEqual(before.box, before.picture.slice(2), 'the picture is not letterboxed');
      await selectPicture(page, `${SLIDE} figure img.for-dark`);
      await exec(page, 'figure.oval');
      await frames(page);
      const now = await drawn(page);
      assert.deepEqual(now.box, now.picture.slice(2), 'the box of the oval picture is not the picture');
      assert.deepEqual(now.picture, before.picture, 'the picture is moved');
      const expected = edited([
        ['<figure class="figure-box">\n    <img class="for-dark" src="../../demo/figure-dark.png" alt="A pair">\n    <img class="for-light" src="../../demo/figure-light.png" alt="A pair">',
          '<figure class="figure-box" style="translate: 0px 40px">\n    <img class="for-dark oval" src="../../demo/figure-dark.png" alt="A pair" style="width: 600px">\n    <img class="for-light oval" src="../../demo/figure-light.png" alt="A pair" style="width: 600px">'],
      ]);
      await roundTrip(page, expected, 'Undo Oval');
      assert.deepEqual(errors(page), []);
    });
  }

  // the color of the words of selector, and of a paragraph of body text, which is the text color
  const colors = (page, selector) => page.evaluate(`(() => {
  const s = document.querySelector(${js(SLIDE)});
  const el = s.querySelector(${js(selector)});
  return [getComputedStyle(el.querySelector('span') ?? el).color, getComputedStyle(s.querySelector('p')).color];
})()`);

  test('G1: the class tone-text is a class of the theme, which the scope rule allows', () => {
    assert.ok(new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8'))).has('tone-text'));
  });

  // G1. on the slide of colors, the small paragraph, the caption, and the footnote are drawn in a
  // color of their own, and the paragraph of body text holds words in orange
  for (const platform of PLATFORMS) {
    test(`G1: Text Color > Text draws the words of a small paragraph, a caption, and a footnote in the text color (${platform})`, async (t) => {
      let page;
      for (const [selector, tag] of [['p.small', '<p class="small">Small words here.</p>'], ['p.caption', '<p class="caption">Caption words here.</p>'], ['div.foot', '<div class="foot">Footnote words here.</div>']]) {
        page = await load(t, platform, 6);
        const [own, text] = await colors(page, selector);
        assert.notEqual(own, text, `${selector} is drawn in the text color`);
        await selectTextElement(page, selector);
        assert.equal((await state(page, 'text.tone.text')).checked, false, `Text is checked on ${selector}`);
        await exec(page, 'text.tone.text');
        await frames(page);
        assert.equal((await state(page, 'text.tone.text')).checked, true, `Text is not checked on ${selector}`);
        const words = tag.replace(/^(<[^>]+>)(.*)(<\/\w+>)$/, '$1<span class="tone-text">$2</span>$3');
        await roundTrip(page, edited([[tag, words]]), 'Undo Text Color');
        const [now, body] = await colors(page, selector);
        assert.equal(now, body, `the words of ${selector} are not drawn in the text color`);
      }
      page = await load(t, platform, 6);
      // on a block in the text color, Text takes the tone of its words off
      await selectTextElement(page, 'p');
      await exec(page, 'text.tone.text');
      await roundTrip(page, edited([['<p>Body words <span class="tone-accent">in orange</span> here.</p>', '<p>Body words in orange here.</p>']]), 'Undo Text Color');
      assert.deepEqual(errors(page), []);
    });
  }
});

// tests of R7.4 on both platforms with trusted input: ⌘] and ⌘[ for the list level, the name of an
// insert in Undo, Copy Style and Paste Style for a figure, Change Case with Shift+F3 at the head of
// its submenu, Smart Web and Email Links, and dash lists in the speaker notes. after each edit the
// text is checked byte for byte, after an undo and a redo, and after a save and an open
describe('list levels, Change Case, and notes dash lists', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATFORMS = ['mac', 'other'];
  const TEXT = 2;
  const FIGURE_BOX = 3;
  const WHITE_FIGURE = 6;
  const SPLIT = 10;
  const P = '.reveal section.present > p:not(.small)';
  const NOTES = '.reveal section.present > aside.notes';
  const PARAGRAPH = '<p>A paragraph with <strong>bold</strong>, <em>italic</em>, <code>code</code>, and \\(x^2\\) inline.</p>';

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
  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${js(id)}${arg === undefined ? '' : `, ${js(arg)}`})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);

  // the editor on slide n of a deck, the layouts by default, opened from its file without problems
  async function load(t, platform, n = 0, deck = LAYOUTS) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the edited text, the text before byte for byte after an undo, the edit again after a redo, and
  // an open of the saved text without problems
  let saves = 0;
  async function roundTrip(page, edited, undos = 1) {
    assert.equal(await render(page), edited);
    for (let i = 0; i < undos; i++) await undo(page);
    await byteExact(page);
    for (let i = 0; i < undos; i++) await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r7-4-${++saves}.html`);
    assert.equal(text, edited);
    page.source = text;
    return text;
  }

  // a press of a bracket key with the command modifier, which press() does not know
  async function bracket(page, platform, key) {
    const modifiers = platform === 'mac' ? 4 : 2;
    const [code, keyCode] = key === ']' ? ['BracketRight', 221] : ['BracketLeft', 219];
    const base = { key, code, windowsVirtualKeyCode: keyCode, modifiers };
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  // the caret put after the text at of the first element at selector, or at its end, with its block
  // focused, by a click and then the range
  async function caretIn(page, selector, at = null) {
    await click(page, selector);
    await frames(page);
    return page.evaluate(`(() => {
    const el = document.querySelector(${js(selector)});
    const r = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let placed = false;
    for (let n = walker.nextNode(); n && ${js(at)} !== null; n = walker.nextNode()) {
      const i = n.data.indexOf(${js(at)});
      if (i >= 0) { r.setStart(n, i + ${js(at ?? '')}.length); placed = true; break; }
    }
    if (!placed) { r.selectNodeContents(el); r.collapse(false); }
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return true;
  })()`);
  }

  async function openBar(page, bar) {
    await click(page, await page.evaluate(`(() => {
    const r = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((b) => b.textContent.trim() === ${js(bar)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`));
    await frames(page);
  }

  // the items of the last open menu as [label, keys, disabled], with '|' for a rule
  const lastMenu = (page) => page.evaluate(`(() => {
  const menus = [...document.querySelectorAll('.beeson-edit-menu')];
  const m = menus.at(-1);
  return [...m.querySelectorAll(':scope .item, :scope .rule, :scope [role=separator]')].map((i) => i.classList.contains('item') ? [i.querySelector('.label').textContent, i.querySelector('.keys')?.textContent ?? '', i.getAttribute('aria-disabled') === 'true'] : '|');
})()`);

  // a click on the item labeled label of the open menus
  async function choose(page, label) {
    const at = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('.beeson-edit-menu .item')].reverse().find((i) => i.querySelector('.label')?.textContent === ${js(label)});
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
    assert.ok(at, `the open menus do not have an item ${label}`);
    await click(page, at);
    await frames(page);
  }

  // the menus of a path opened from the menu bar, e.g. Format, Font, Change Case
  async function openPath(page, path) {
    await openBar(page, path[0]);
    for (const name of path.slice(1)) await choose(page, name);
  }

  // the parts of a zip, from its central directory, as a map of a name to a Buffer, as in
  // pptx.test.mjs
  function unzip(file) {
    const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const parts = new Map();
    let at = file.readUInt32LE(end + 16);
    for (let n = 0; n < file.readUInt16LE(end + 10); n += 1) {
      const method = file.readUInt16LE(at + 10);
      const size = file.readUInt32LE(at + 20);
      const nameLength = file.readUInt16LE(at + 28);
      const local = file.readUInt32LE(at + 42);
      const name = file.toString('utf8', at + 46, at + 46 + nameLength);
      const start = local + 30 + file.readUInt16LE(local + 26) + file.readUInt16LE(local + 28);
      const data = file.subarray(start, start + size);
      parts.set(name, method === 8 ? inflateRawSync(data) : data);
      at += 46 + nameLength;
    }
    return parts;
  }

  const KEY = { mac: { indent: '⌘]', outdent: '⌘[', cycle: '⇧F3' }, other: { indent: 'Ctrl+]', outdent: 'Ctrl+[', cycle: 'Shift+F3' } };

  for (const platform of PLATFORMS) {
    test(`⌘] and ⌘[ change the level of a list item as Tab and Shift+Tab do, and the menu shows them (${platform})`, async (t) => {
      // Tab on a page of its own, closed before the next, since the first indent after an open
      // writes the step that reveal.js numbered on the page, and a later one the step of the file
      const second = '.reveal section.present > ul > li:nth-child(2)';
      const tab = await load(t, platform, TEXT);
      await caretIn(tab, second, 'A sec');
      await press(tab, 'Tab');
      await frames(tab);
      const tabbed = await render(tab);
      await tab.close();
      const page = await load(t, platform, TEXT);
      await caretIn(page, second, 'A sec');
      await bracket(page, platform, ']');
      await frames(page);
      const indented = await render(page);
      assert.notEqual(indented, page.source, `${KEY[platform].indent} did not indent the item`);
      assert.equal(indented, tabbed, 'Tab and the bracket key differ');
      assert.equal(await undoLabel(page), 'Undo Increase Indent Level');
      await undo(page);
      await byteExact(page);
      // the nested item is taken out a level with the left bracket, as with Shift+Tab
      const nested = '.reveal section.present > ul ul > li';
      await caretIn(page, nested, 'A nes');
      await bracket(page, platform, '[');
      await frames(page);
      const outdented = await render(page);
      assert.notEqual(outdented, page.source, `${KEY[platform].outdent} did not outdent the item`);
      await roundTrip(page, outdented);
      // the List submenu of Format > Text shows the bracket keys, Keynote's keys of the two items, on
      // a Mac, and elsewhere Tab and Shift+Tab, since ] and [ are typed with AltGr on some layouts
      const shown = platform === 'mac' ? KEY.mac : { indent: 'Tab', outdent: 'Shift+Tab' };
      await caretIn(page, '.reveal section.present > ul > li:nth-child(1)', 'A fir');
      await openPath(page, ['Format', 'Text']);
      const items = await lastMenu(page);
      assert.deepEqual(items.find((i) => i[0] === 'Increase Indent Level')?.[1], shown.indent);
      assert.deepEqual(items.find((i) => i[0] === 'Decrease Indent Level')?.[1], shown.outdent);
      await press(page, 'Escape');
      assert.deepEqual(errors(page), []);
    });

    test(`an insert is named Insert and its kind in Undo, while the menu keeps its label (${platform})`, async (t) => {
      // slide 3 does not have a footnote, which Footnote would only give the caret
      const page = await load(t, platform, FIGURE_BOX);
      for (const [id, label] of [['insert.text', 'Text Box'], ['insert.code', 'Code Box'], ['insert.footnote', 'Footnote']]) {
        await exec(page, id);
        await frames(page);
        assert.equal(await undoLabel(page), `Undo Insert ${label}`);
        await press(page, 'Escape');
        await sleep(150);
        // a text box left empty is written as an empty paragraph in the entry of its insert
        if (id === 'insert.text') {
          assert.equal(await undoLabel(page), 'Undo Insert Text Box');
          await undo(page);
          await sleep(100);
        }
        await byteExact(page);
      }
      // the Edit menu reads Undo Typing after a text box is typed, as Keynote does, with Undo Insert
      // Text Box under it, and Insert still lists Text Box
      await exec(page, 'insert.text');
      await frames(page);
      await typeKeys(page, 'x');
      await sleep(300);
      await openBar(page, 'Edit');
      assert.equal((await lastMenu(page))[0][0], 'Undo Typing');
      await press(page, 'Escape');
      await openBar(page, 'Insert');
      assert.ok((await lastMenu(page)).some((i) => i[0] === 'Text Box'), 'Insert does not list Text Box');
      await press(page, 'Escape');
      await undo(page);
      await sleep(100);
      assert.equal(await undoLabel(page), 'Undo Insert Text Box');
      await undo(page);
      await sleep(100);
      await byteExact(page);
      // a QR code and a table, each one entry named for its kind
      await exec(page, 'insert.qr');
      await frames(page);
      assert.equal(await undoLabel(page), 'Undo Insert QR Code');
      await roundTrip(page, await render(page));
      await exec(page, 'insert.table', { rows: 2, columns: 2 });
      await frames(page);
      assert.equal(await undoLabel(page), 'Undo Insert Table');
      await roundTrip(page, await render(page));
      assert.deepEqual(errors(page), []);
    });

    test(`a new formula is named Insert Formula in Undo, and one left empty is taken off again (${platform})`, async (t) => {
      const page = await load(t, platform, TEXT);
      await exec(page, 'insert.formula');
      await sleep(200);
      assert.equal(await undoLabel(page), 'Undo Insert Formula');
      // the TeX field closed with an empty TeX takes the formula off, which finds its entry by name
      await press(page, 'Escape');
      await sleep(400);
      await byteExact(page);
      assert.equal((await state(page, 'edit.undo')).enabled, false, 'the empty formula is still in the history');
      assert.deepEqual(errors(page), []);
    });

    test(`Copy Style and Paste Style carry white-figure, invert, and the mode of a figure to an image and a video (${platform})`, async (t) => {
      const page = await load(t, platform, WHITE_FIGURE);
      const copy = platform === 'mac' ? 'Mod+Alt+C' : 'Mod+Shift+C';
      const paste = platform === 'mac' ? 'Mod+Alt+V' : 'Mod+Shift+V';
      // the image of the figure box of slide 3 is shown in one mode only
      await page.evaluate(`Reveal.slide(${FIGURE_BOX})`);
      await frames(page);
      await click(page, '.reveal section.present .figure-box > img');
      await frames(page);
      assert.equal((await state(page, 'text.copyStyle')).enabled, true, 'Copy Style is dimmed on an image');
      // the first click selects the figure, whose style is the style of the image shown in it
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`), ['figure']);
      const mode = await page.evaluate(`[...document.querySelectorAll('.reveal section.present .figure-box > img')].find((e) => e.getBoundingClientRect().width).className`);
      assert.match(mode, /^for-(dark|light)$/);
      await press(page, copy);
      // on the white figure of slide 6, white-figure is taken off and the mode is set
      await page.evaluate(`Reveal.slide(${WHITE_FIGURE})`);
      await frames(page);
      await click(page, '.reveal section.present .plate > img');
      await frames(page);
      assert.equal((await state(page, 'text.pasteStyle')).enabled, true, 'Paste Style is dimmed on an image');
      await press(page, paste);
      await frames(page);
      assert.equal(await undoLabel(page), 'Undo Paste Style');
      const img = '<img class="white-figure" src="../../demo/figure-light.png" alt="A white raster figure">';
      const styled = page.source.replace(img, `<img class="${mode}" src="../../demo/figure-light.png" alt="A white raster figure">`);
      await roundTrip(page, styled);
      // the white-figure style of slide 6 goes to the video of the split slide, which takes only the mode, in a
      // class written after its attributes
      await page.evaluate(`Reveal.slide(${SPLIT})`);
      await frames(page);
      await click(page, '.reveal section.present .figure-box > video');
      await frames(page);
      await press(page, paste);
      await frames(page);
      const video = '<video src="../../demo/clip-dark.mp4" poster="../../demo/clip-dark.png" muted loop></video>';
      await roundTrip(page, page.source.replace(video, `<video src="../../demo/clip-dark.mp4" poster="../../demo/clip-dark.png" muted loop class="${mode}"></video>`));
      // a text style is not pasted on a figure, and a figure style not on a text
      await caretIn(page, '.reveal section.present .text-column > p', 'Words');
      assert.equal((await state(page, 'text.pasteStyle')).enabled, false, 'the style of a figure is pasted on a text');
      await press(page, copy);
      await click(page, '.reveal section.present .figure-box > video');
      await frames(page);
      assert.equal((await state(page, 'text.pasteStyle')).enabled, false, 'the style of a text is pasted on a figure');
      assert.deepEqual(errors(page), []);
    });

    test(`the Format Painter carries the style of a figure to the next figure clicked (${platform})`, async (t) => {
      const page = await load(t, platform, WHITE_FIGURE);
      await click(page, '.reveal section.present .plate > img');
      await frames(page);
      assert.equal((await state(page, 'text.formatPainter')).enabled, true, 'the Format Painter is dimmed on an image');
      await exec(page, 'text.formatPainter');
      await page.evaluate(`Reveal.slide(${FIGURE_BOX})`);
      await frames(page);
      await click(page, '.reveal section.present .figure-box > img');
      await sleep(100);
      assert.equal((await state(page, 'text.formatPainter')).checked, false, 'the painter is still armed');
      const shown = await page.evaluate(`[...document.querySelectorAll('.reveal section.present .figure-box > img')].find((e) => e.getBoundingClientRect().width).getAttribute('src')`);
      const name = shown.includes('dark') ? 'dark' : 'light';
      const before = `<img class="for-${name}" src="../../demo/figure-${name}.png"`;
      await roundTrip(page, page.source.replace(before, `<img class="white-figure" src="../../demo/figure-${name}.png"`));
      assert.deepEqual(errors(page), []);
    });

    test(`Change Case with ${KEY[platform].cycle} heads its submenu, and its item cycles the case (${platform})`, async (t) => {
      const page = await load(t, platform, TEXT);
      await caretIn(page, P, 'A parag');
      await openPath(page, ['Format', 'Font', 'Change Case']);
      const items = await lastMenu(page);
      assert.deepEqual(items.slice(0, 3), [['Change Case', KEY[platform].cycle, false], '|', ['Sentence case.', '', false]]);
      await choose(page, 'Change Case');
      await frames(page);
      assert.equal(await undoLabel(page), 'Undo Change Case');
      await roundTrip(page, page.source.replace(PARAGRAPH, PARAGRAPH.replace('paragraph', 'PARAGRAPH')));
      // the sheet of shortcuts lists the key at Change Case
      await exec(page, 'help.keys');
      await frames(page);
      const rows = await page.evaluate(`[...document.querySelectorAll('dialog.beeson-edit-keys .row')].map((r) => [r.firstChild.textContent, r.lastChild.textContent])`);
      await press(page, 'Escape');
      assert.ok(rows.some(([label, keys]) => label === 'Change Case' && keys === KEY[platform].cycle), 'the sheet does not list Change Case');
      assert.deepEqual(errors(page), []);
    });

    test(`Smart Web and Email Links writes an a with href at the space after an address, and one undo takes it away (${platform})`, async (t) => {
      const page = await load(t, platform, TEXT);
      assert.equal((await state(page, 'text.smart.links')).checked, true, 'Smart Links is off');
      await caretIn(page, P);
      await typeKeys(page, ' See www.example.com/a. ');
      await frames(page);
      const typed = PARAGRAPH.replace('inline.</p>', 'inline. See www.example.com/a. </p>');
      const linked = PARAGRAPH.replace('inline.</p>', 'inline. See <a href="https://www.example.com/a">www.example.com/a</a>. </p>');
      assert.equal(await undoLabel(page), 'Undo Smart Link');
      assert.equal(await render(page), page.source.replace(PARAGRAPH, linked));
      // one undo leaves the typed text, and the next takes the typing
      await undo(page);
      assert.equal(await render(page), page.source.replace(PARAGRAPH, typed));
      await undo(page);
      await byteExact(page);
      await redo(page);
      await redo(page);
      await roundTrip(page, page.source.replace(PARAGRAPH, linked), 2);
      // an email address gets a mailto link, and a word with a dot is left as typed
      await caretIn(page, P);
      await typeKeys(page, 'me@example.org e.g. ');
      await frames(page);
      const mail = linked.replace('</a>. </p>', '</a>. <a href="mailto:me@example.org">me@example.org</a> e.g. </p>');
      // three entries: the address typed, its link, and the words typed after it
      await roundTrip(page, page.source.replace(linked, mail), 3);
      // switched off in Edit > Substitutions, an address stays text
      await openPath(page, ['Edit', 'Substitutions']);
      await choose(page, 'Smart Web and Email Links');
      assert.equal((await state(page, 'text.smart.links')).checked, false);
      await caretIn(page, P);
      await typeKeys(page, 'http://x.org ');
      await frames(page);
      assert.equal(await render(page), page.source.replace(mail, mail.replace(' e.g. </p>', ' e.g. http://x.org </p>')));
      await exec(page, 'text.smart.links');
      assert.deepEqual(errors(page), []);
    });

    test(`a line of the speaker notes becomes a dash list with a dash and a space, Return, and Backspace (${platform})`, async (t) => {
      const page = await load(t, platform, TEXT);
      if (!(await state(page, 'view.notes')).checked) await exec(page, 'view.notes');
      await frames(page);
      const notes = '<aside class="notes">Notes of a content slide.</aside>';
      await caretIn(page, NOTES);
      await press(page, 'Enter');
      await typeKeys(page, '- first');
      await frames(page);
      assert.equal(await render(page), page.source.replace(notes, '<aside class="notes">Notes of a content slide.<ul><li>first</li></ul></aside>'));
      // Return starts the next item, and Return in an empty item ends the list
      await press(page, 'Enter');
      await typeKeys(page, 'second');
      await press(page, 'Enter');
      await press(page, 'Enter');
      await typeKeys(page, 'after');
      await frames(page);
      const listed = '<aside class="notes">Notes of a content slide.<ul><li>first</li><li>second</li></ul>after</aside>';
      assert.equal(await render(page), page.source.replace(notes, listed));
      page.source = page.source.replace(notes, listed);
      // Backspace at the start of an item makes it a line again
      await caretIn(page, `${NOTES} li:nth-child(2)`);
      await page.evaluate(`(() => { const r = document.createRange(); r.setStart(document.querySelector(${js(`${NOTES} li:nth-child(2)`)}).firstChild, 0); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
      await press(page, 'Backspace');
      await frames(page);
      assert.equal(await undoLabel(page), 'Undo Join Paragraphs');
      const joined = '<aside class="notes">Notes of a content slide.<ul><li>first</li></ul>second<br>after</aside>';
      await roundTrip(page, page.source.replace(listed, joined));
      assert.deepEqual(errors(page), []);
    });

    test(`an insert of a script right after a dash item of the speaker notes is an undo of its own (${platform})`, async (t) => {
      const page = await load(t, platform, TEXT);
      if (!(await state(page, 'view.notes')).checked) await exec(page, 'view.notes');
      await frames(page);
      await caretIn(page, NOTES);
      await press(page, 'Enter');
      await typeKeys(page, '- ');
      await page.evaluate(`document.execCommand('insertText', false, 'x')`);
      await frames(page);
      const notes = (item) => page.source.replace('Notes of a content slide.</aside>', `Notes of a content slide.<ul><li>${item}</li></ul></aside>`);
      assert.equal(await render(page), notes('x'));
      assert.equal(await undoLabel(page), 'Undo Typing');
      await undo(page);
      assert.equal(await render(page), notes('<br>'));
      assert.equal(await undoLabel(page), 'Undo Arrows');
      assert.deepEqual(errors(page), []);
    });

    test(`Arrows and Paragraphs of Format > Text make a line of the notes an item and back (${platform})`, async (t) => {
      const page = await load(t, platform, TEXT);
      if (!(await state(page, 'view.notes')).checked) await exec(page, 'view.notes');
      await frames(page);
      const notes = '<aside class="notes">Notes of a content slide.</aside>';
      await caretIn(page, NOTES, 'Notes of');
      await openPath(page, ['Format', 'Text']);
      const items = await lastMenu(page);
      assert.deepEqual(items.filter((i) => ['Paragraphs', 'Arrows', 'Numbers'].includes(i[0])).map((i) => [i[0], i[2]]), [['Paragraphs', false], ['Arrows', false], ['Numbers', true]]);
      await choose(page, 'Arrows');
      assert.equal(await undoLabel(page), 'Undo List Style');
      assert.equal((await state(page, 'text.list.ul')).checked, true);
      const listed = '<aside class="notes"><ul><li>Notes of a content slide.</li></ul></aside>';
      await roundTrip(page, page.source.replace(notes, listed));
      await caretIn(page, `${NOTES} li`, 'Notes');
      await openPath(page, ['Format', 'Text']);
      await choose(page, 'Paragraphs');
      await roundTrip(page, page.source.replace(listed, notes));
      assert.deepEqual(errors(page), []);
    });
  }

  test('the speaker view of reveal.js and the PowerPoint file show the list of the notes', async (t) => {
    const listed = readFileSync(LAYOUTS, 'utf8').replace('<aside class="notes">Notes of a content slide.</aside>', '<aside class="notes">Notes of a content slide.<ul><li>first</li><li>second</li></ul>after</aside>');
    // the deck saved next to the layouts, so that its paths to the theme hold
    const deck = 'test/pages/r7-4-notes.tmp.html';
    writeFileSync(deck, listed);
    t.after(() => rmSync(deck, { force: true }));
    // the editor opens the deck with the list in its notes and renders it unchanged
    const page = await load(t, 'mac', TEXT, deck);
    assert.equal(await render(page), listed);
    await page.close();
    const show = await browser.newPage({ width: 1280, height: 720 });
    t.after(() => show.close().catch(() => {}));
    await show.goto(`${server.origin}/${deck}`);
    await show.waitFor(deckSettled);
    const notes = await show.evaluate(`Reveal.getSlideNotes(Reveal.getSlides().find((s) => s.querySelector('h2')?.textContent === 'Text, a list, and a backdrop'))`);
    assert.equal(notes, 'Notes of a content slide.<ul><li>first</li><li>second</li></ul>after');
    // the speaker view writes the notes as HTML into its notes box
    assert.match(readFileSync('theme/vendor/reveal/notes.js', 'utf8'), /notesValue\.innerHTML = data\.notes;/);
    const folder = mkdtempSync(join(tmpdir(), 'beeson-r7-4-'));
    try {
      const output = join(folder, 'deck.pptx');
      // the notes are written the same with --still, and the recordings of the backdrops, 5 min of
      // this test on a runner, are compared in test/pptx.test.mjs
      const run = spawnSync(process.execPath, ['scripts/export-pptx.mjs', '--still', deck, output], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      const parts = unzip(readFileSync(output));
      const name = [...parts.keys()].find((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n) && parts.get(n).toString().includes('Notes of a content slide.'));
      assert.ok(name, 'the notes of the slide are not in the PowerPoint file');
      const xml = parts.get(name).toString();
      const paragraphs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
      assert.deepEqual(paragraphs, ['Notes of a content slide.', '– first', '– second', 'after']);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test('an address at the end of the text before a space is found, without the punctuation after it', () => {
    assert.deepEqual(smartLink('see https://example.com/a.'), { start: 4, end: 25, href: 'https://example.com/a' });
    assert.deepEqual(smartLink('www.example.com'), { start: 0, end: 15, href: 'https://www.example.com' });
    assert.deepEqual(smartLink('(me@example.org)'), { start: 1, end: 15, href: 'mailto:me@example.org' });
    assert.deepEqual(smartLink('to me@example.org,'), { start: 3, end: 17, href: 'mailto:me@example.org' });
    assert.deepEqual(smartLink('https://en.wikipedia.org/wiki/Halo_(orbit)'), { start: 0, end: 42, href: 'https://en.wikipedia.org/wiki/Halo_(orbit)' });
    assert.equal(smartLink('e.g.'), null);
    assert.equal(smartLink('http://'), null);
    assert.equal(smartLink('a \\(www.x.org'), null);
  });
});

// regression tests of R19.7 on both platforms, the findings D16, D17, and D18 of the fourth
// review of round 7: the keys that type a character in the speaker notes, Bold in the notes after
// a display was framed, and the inspector closed for the navigator in a narrow window, after the
// deck is opened again
describe('the keys and Bold in the speaker notes', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test-deck.html';
  // the indices of the slides of index.html with the steps, the equations, and the figures
  const STEPS = 2;
  const EQUATIONS = 3;
  const FIGURES = 4;

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
  const wait = (page, ms = 150) => page.evaluate(`new Promise((d) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => d(true))), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undoLabel = (page) => state(page, 'edit.undo').then((s) => s.label);
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  const rect = (page, expr) => page.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  const urlOf = (platform) => `${server.origin}/${DECK}?edit&still&theme=light&edit-platform=${platform}`;

  // opens the deck at url, with the storage of the browser as it is
  async function open(page, url, n) {
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await wait(page, 300);
  }

  async function load(t, platform, n, size = { width: 1600, height: 1000 }) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    await page.goto(urlOf(platform));
    await page.evaluate('localStorage.clear()');
    await open(page, urlOf(platform), n);
    return page;
  }

  // the speaker notes of the slide shown, with the caret put by a click and then moved to their end
  const NOTES = `Reveal.getCurrentSlide().querySelector('aside.notes')`;
  async function notesCaret(page) {
    if (!(await state(page, 'view.notes')).checked) await exec(page, 'view.notes');
    await wait(page, 300);
    await click(page, await page.evaluate(`(() => { const r = ${NOTES}.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + Math.min(10, r.height / 2) }; })()`));
    await wait(page);
    await page.evaluate(`(() => { const r = document.createRange(); r.selectNodeContents(${NOTES}); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); return true; })()`);
    assert.equal(await page.evaluate(`!!document.activeElement.closest('aside.notes')`), true, 'the click does not put the caret into the notes');
  }

  // a key as a real keyboard sends it, e.g. Shift+0 with the key ) and the text )
  const REAL = {
    ')': { code: 'Digit0', windowsVirtualKeyCode: 48, modifiers: 8 },
    '!': { code: 'Digit1', windowsVirtualKeyCode: 49, modifiers: 8 },
    '@': { code: 'Digit2', windowsVirtualKeyCode: 50, modifiers: 8 },
    '?': { code: 'Slash', windowsVirtualKeyCode: 191, modifiers: 8 },
    d: { code: 'KeyD', windowsVirtualKeyCode: 68, modifiers: 0 },
    g: { code: 'KeyG', windowsVirtualKeyCode: 71, modifiers: 0 },
  };
  async function real(page, key) {
    const base = { key, ...REAL[key] };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: key, unmodifiedText: key });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  for (const platform of PLATFORMS) {
    // D16: the notes take every bare key that types a character, also with Shift
    test(`the speaker notes take every key that types a character, also ) of Shift+0 (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES);
      await notesCaret(page);
      await exec(page, 'notes.zoomIn');
      await wait(page);
      const font = await page.evaluate(`getComputedStyle(${NOTES}).fontSize`);
      for (const key of Object.keys(REAL)) {
        const before = await page.evaluate(`${NOTES}.textContent`);
        await real(page, key);
        await wait(page, 100);
        assert.equal(await page.evaluate(`${NOTES}.textContent`), before + key, `the key ${key} is not typed into the notes`);
      }
      assert.equal(await page.evaluate(`getComputedStyle(${NOTES}).fontSize`), font, 'a key resets the zoom of the notes');
      assert.match(await render(page), /typeface of the slides\.\)!@\?dg<\/aside>/);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    // D17: Bold and Italic act on a text of the notes, also after a display was framed
    test(`Bold and Italic are live in the notes after a display of math was framed (${platform})`, async (t) => {
      const page = await load(t, platform, EQUATIONS);
      await click(page, await rect(page, `Reveal.getCurrentSlide().querySelector('div.math mjx-container')`));
      await wait(page);
      assert.deepEqual(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName)`), ['div']);
      await notesCaret(page);
      await page.evaluate(`(() => { const t = ${NOTES}.firstChild; getSelection().setBaseAndExtent(t, 0, t, 7); return true; })()`);
      assert.equal((await state(page, 'text.bold')).enabled, true, 'Bold is dimmed in the notes');
      assert.equal((await state(page, 'text.italic')).enabled, true, 'Italic is dimmed in the notes');
      await press(page, 'Mod+B');
      await wait(page);
      assert.equal(await undoLabel(page), 'Undo Bold');
      assert.match(await render(page), /<aside class="notes"><strong>The dis<\/strong>play is held/);
      assert.deepEqual(errors(page), []);
    });
  }

  // whether the navigator and the inspector are drawn, and whether Format is checked
  const panes = (page) => page.evaluate(`(() => {
  const drawn = (s) => (document.querySelector(s)?.getBoundingClientRect().width ?? 0) > 0;
  return { nav: drawn('.beeson-edit-nav'), inspector: drawn('.beeson-edit-inspector'), format: window.BeesonEditor.state('shell.format').checked };
})()`);
  async function resize(page, width, height) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await wait(page, 400);
  }

  for (const platform of PLATFORMS) {
    // D18: the inspector closed only to make room for the navigator comes back after a reopen
    test(`the inspector closed for the navigator in a narrow window is given back after the deck is opened again (${platform})`, async (t) => {
      const page = await load(t, platform, FIGURES, { width: 760, height: 900 });
      assert.deepEqual(await panes(page), { nav: false, inspector: true, format: true });
      await exec(page, 'view.navigator');
      await wait(page, 300);
      assert.deepEqual(await panes(page), { nav: true, inspector: false, format: false });
      await open(page, urlOf(platform), FIGURES);
      assert.equal((await panes(page)).inspector, true, 'the inspector is not shown after the deck is opened again at 760 px');
      await resize(page, 1600, 900);
      assert.deepEqual(await panes(page), { nav: true, inspector: true, format: true }, 'the inspector is not given back at 1600 px after the deck is opened again');
      // Format closed by hand stays closed after a reopen
      await exec(page, 'shell.format');
      await wait(page);
      await open(page, urlOf(platform), FIGURES);
      assert.deepEqual(await panes(page), { nav: true, inspector: false, format: false }, 'Format closed by hand is opened again');
      assert.deepEqual(errors(page), []);
    });
  }
});
