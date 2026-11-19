import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { deckSettled, launch } from '../scripts/chrome.mjs';
import { byteExact, click, clickText, editorPage, press, type, typeKeys } from './helpers/editor.mjs';
import { serve } from '../scripts/webdriver.mjs';

const DECK = 'test/pages/editor-layouts.html';
const TEXT = 2;

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const js = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
const render = (page) => page.evaluate('window.BeesonEditor.render()');
const checked = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)}).checked`);
const PENDING = `document.querySelector('.reveal section.present .beeson-pending')`;
const emptyParagraphs = (text) => text.match(/<p( [^>]*)?><\/p>/g) ?? [];

async function load(t) {
  const page = await editorPage(browser, { deck: DECK, page: { width: 1600, height: 1000 }, clear: true });
  t.after(() => page.close().catch(() => {}));
  await page.evaluate(`Reveal.slide(${TEXT})`);
  await frames(page);
  return page;
}

test('a new text box left without text by Esc is kept as an empty paragraph, and its undo takes it off', async (t) => {
  const page = await load(t);
  await exec(page, 'insert.text');
  await frames(page);
  assert.equal(await page.evaluate(`${PENDING} === document.activeElement`), true, 'the caret is not in the new box');
  await press(page, 'Escape');
  await sleep(300);
  const text = await render(page);
  assert.equal(emptyParagraphs(text).length, 1, 'the empty box is not written into the file');
  assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present p:empty').length`), 1, 'the empty box is not on the slide');
  assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Insert Text Box');
  await page.evaluate('window.BeesonEditor.undo()');
  await sleep(100);
  assert.equal(await render(page), page.source, 'the undo does not take the empty box off');
});

test('a new text box left without text by a click on the canvas is kept, and is typed into later', async (t) => {
  const page = await load(t);
  await exec(page, 'insert.text');
  await frames(page);
  const at = await page.evaluate(`(() => { const r = document.querySelector('.reveal section.present').getBoundingClientRect(); return { x: r.left - 20, y: r.top + r.height / 2 }; })()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await sleep(300);
  assert.equal(emptyParagraphs(await render(page)).length, 1, 'the empty box is not written into the file');
  await page.evaluate(`document.querySelector('.reveal section.present p:empty').focus()`);
  await press(page, 'x');
  await sleep(300);
  assert.equal(emptyParagraphs(await render(page)).length, 0);
  assert.match(await render(page), /<p( [^>]*)?>x<\/p>/, 'the text typed later is not written into the box');
});

test('Insert Text Box opens the Format tab, from a closed inspector and from the Steps tab', async (t) => {
  const page = await load(t);
  if (await checked(page, 'shell.format')) await exec(page, 'shell.format');
  assert.equal(await checked(page, 'shell.format'), false);
  await exec(page, 'insert.text');
  await frames(page);
  assert.equal(await checked(page, 'shell.format'), true, 'the Format tab is not opened from a closed inspector');
  assert.equal(await page.evaluate(`${PENDING} === document.activeElement`), true, 'the caret is not kept in the new box');
  await page.evaluate('window.BeesonEditor.undo()');
  await exec(page, 'view.steps');
  await frames(page);
  assert.equal(await checked(page, 'view.steps'), true);
  await exec(page, 'insert.text');
  await frames(page);
  assert.equal(await checked(page, 'shell.format'), true, 'the Format tab is not opened from the Steps tab');
  assert.equal(await checked(page, 'view.steps'), false);
});

describe('the first letter undone and a first Paste', () => {
  const PLATFORMS = ['mac', 'other'];

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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => press(page, 'Mod+Z').then(() => sleep(250));
  const redo = (page) => press(page, 'Mod+Shift+Z').then(() => sleep(250));

  async function load(t, platform, n = 0) {
    const text = readFileSync('test-deck.html', 'utf8');
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/test-deck.html?edit&still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const BOX = (mark) => `(() => {
  const s = Reveal.getCurrentSlide();
  const p = s.querySelector('p.beeson-pending') ?? [...s.querySelectorAll('p')].find((e) => e.textContent.startsWith(${js(mark)}));
  if (!p) return null;
  const r = p.getBoundingClientRect();
  const a = getSelection().anchorNode;
  return { text: p.textContent, left: r.left, top: r.top, pending: p.classList.contains('beeson-pending'), focused: document.activeElement === p, caret: !!a && p.contains(a) && getSelection().isCollapsed };
})()`;
  const boxOf = (page, mark) => page.evaluate(BOX(mark));
  const labels = (page) => page.evaluate(`({ undo: window.BeesonEditor.state('edit.undo').label, redo: window.BeesonEditor.state('edit.redo').label })`);
  const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
  const kept = (a, b, what) => assert.ok(a && b && near(a.left, b.left) && near(a.top, b.top), `${what} moves the text box from ${js(a)} to ${js(b)}`);

  async function newBox(page) {
    await click(page, '.beeson-edit-top [data-command="insert.text"]');
    await sleep(250);
    const empty = await boxOf(page, '\u0000');
    assert.equal(empty?.pending, true, 'Text does not add an empty text box');
    return empty;
  }

  async function menu(page, bar, item) {
    await click(page, await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menubar [role=menuitem]')].find((e) => e.textContent.trim() === ${js(bar)}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    await sleep(250);
    const at = await page.evaluate(`(() => { const e = [...document.querySelectorAll('[role=menu] [role^=menuitem]')].find((x) => x.getClientRects().length && x.textContent.trim().startsWith(${js(item)})); const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await clickText(page, at);
    await sleep(500);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`an undo of the first letter of a new text box leaves the empty box with the caret (${platform})`, async (t) => {
      for (const n of [4, 0, 11]) {
        const page = await load(t, platform, n);
        const empty = await newBox(page);
        await type(page, 'h');
        await sleep(1300);
        const written = await render(page);
        assert.notEqual(written, page.source, `the letter is not written on slide ${n + 1}`);
        await undo(page);
        const back = await boxOf(page, 'h');
        assert.deepEqual(back && { text: back.text, pending: back.pending, focused: back.focused, caret: back.caret }, { text: '', pending: true, focused: true, caret: true }, `an undo of the first letter on slide ${n + 1} does not leave the empty box with the caret`);
        kept(empty, back, `an undo of the first letter on slide ${n + 1}`);
        await byteExact(page);
        assert.equal((await labels(page)).undo, 'Undo Insert Text Box', `the entry under the letter on slide ${n + 1} is not the insert of the box`);
        await redo(page);
        assert.equal(await render(page), written);
        const again = await boxOf(page, 'h');
        assert.deepEqual(again && { text: again.text, pending: again.pending, caret: again.caret }, { text: 'h', pending: false, caret: true }, `a redo of the letter on slide ${n + 1} does not put the caret into the text`);
        kept(empty, again, `a redo of the letter on slide ${n + 1}`);
        await undo(page);
        await undo(page);
        assert.equal(await boxOf(page, 'h'), null, `a second undo on slide ${n + 1} does not take the box`);
        await byteExact(page);
        await redo(page);
        const box = await boxOf(page, 'h');
        assert.deepEqual(box && { text: box.text, pending: box.pending, caret: box.caret }, { text: '', pending: true, caret: true }, `a redo of the box on slide ${n + 1}`);
        await redo(page);
        assert.equal(await render(page), written);
        assert.equal((await boxOf(page, 'h'))?.caret, true);
        await undo(page);
        await type(page, 'k');
        await sleep(300);
        assert.equal((await boxOf(page, 'k'))?.text, 'k', `the key after the undo on slide ${n + 1} is not typed into the box`);
        assert.match(await render(page), /<p[^>]*>k<\/p>/);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }

  for (const platform of PLATFORMS) {
    test(`an undo of a word typed into a new text box leaves the empty box (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await newBox(page);
      await typeKeys(page, 'Hello');
      await sleep(1200);
      await type(page, '!');
      await sleep(300);
      assert.equal((await boxOf(page, 'H'))?.text, 'Hello!');
      await undo(page);
      assert.equal((await boxOf(page, 'H'))?.text, 'Hello');
      await undo(page);
      const back = await boxOf(page, 'H');
      assert.deepEqual(back && { text: back.text, pending: back.pending, caret: back.caret }, { text: '', pending: true, caret: true }, 'an undo of the word does not leave the empty box');
      await byteExact(page);
      await redo(page);
      const again = await boxOf(page, 'H');
      assert.deepEqual(again && { text: again.text, caret: again.caret }, { text: 'Hello', caret: true }, 'a redo of the word');
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`Edit > Paste of the menu bar writes a new text box (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await page.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
      await page.evaluate(`navigator.clipboard.writeText('Pasted words')`);
      const empty = await newBox(page);
      await menu(page, 'Edit', 'Paste');
      const pasted = await boxOf(page, 'Pasted');
      assert.equal(pasted?.text, 'Pasted words');
      assert.equal(pasted?.pending, false, 'the paste of the menu is not written');
      kept(empty, pasted, 'the paste of the menu');
      const written = await render(page);
      assert.match(written, /<p[^>]*>Pasted words<\/p>/);
      await type(page, 'x');
      await sleep(300);
      assert.match(await render(page), /<p[^>]*>Pasted wordsx<\/p>/);
      await press(page, 'Escape');
      await press(page, 'Escape');
      await clickText(page, { x: 1580, y: 600 });
      await sleep(300);
      assert.match(await render(page), /<p[^>]*>Pasted wordsx<\/p>/, 'the words are lost after the box is left');
      await undo(page);
      assert.equal(await render(page), written);
      await undo(page);
      assert.equal((await boxOf(page, 'Pasted'))?.pending, true, 'an undo of the paste does not leave the empty box');
      await undo(page);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`a new text box emptied by Backspace is taken out of the file when it is left (${platform})`, async (t) => {
      for (const n of [4, 11]) {
        const page = await load(t, platform, n);
        const undoBefore = (await labels(page)).undo;
        await newBox(page);
        await type(page, 'h');
        await sleep(300);
        await press(page, 'Backspace');
        await sleep(300);
        await press(page, 'Escape');
        await press(page, 'Escape');
        await sleep(300);
        await byteExact(page);
        assert.equal(await page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('p')].filter((p) => !p.textContent.trim() && !p.closest('.foot, aside') && !p.hasAttribute('data-generated')).length`), 0, `an empty paragraph is left on slide ${n + 1}`);
        assert.equal((await labels(page)).undo, undoBefore, `the entries of the emptied box are left in the history on slide ${n + 1}`);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });

    test(`a new text box emptied by Backspace is taken out of the file at the click on Text, which adds a new box (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await newBox(page);
      await type(page, 'h');
      await sleep(300);
      await press(page, 'Backspace');
      await sleep(300);
      await newBox(page);
      await sleep(300);
      assert.equal(await page.evaluate(`Reveal.getCurrentSlide().querySelectorAll('p.beeson-pending').length`), 1, 'the new box is not kept');
      await byteExact(page);
      await type(page, 'k');
      await sleep(300);
      assert.match(await render(page), /<p[^>]*>k<\/p>/);
      assert.doesNotMatch(await render(page), /<p( style="[^"]*")?>(<br>)?<\/p>/, 'the emptied box is kept in the file');
      assert.deepEqual(errors(page), []);
    });

    test(`a new text box emptied after another change is taken out of the file in one entry (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      await newBox(page);
      await type(page, 'h');
      await sleep(300);
      await clickText(page, 'section.present h2');
      await press(page, 'End');
      await type(page, 'Z');
      await sleep(1200);
      const typed = await render(page);
      await clickText(page, await page.evaluate(`(() => { const p = [...Reveal.getCurrentSlide().querySelectorAll('p')].find((e) => e.textContent === 'h'); const r = p.getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height / 2 }; })()`));
      await press(page, 'End');
      await press(page, 'Backspace');
      await sleep(300);
      await press(page, 'Escape');
      await press(page, 'Escape');
      await sleep(300);
      const left = await render(page);
      assert.doesNotMatch(left, /<p( style="[^"]*")?>(<br>)?<\/p>/, 'the emptied box is kept in the file');
      assert.equal(left, typed.replace(/\n[ \t]*<p( style="[^"]*")?>h<\/p>/, ''));
      await undo(page);
      assert.match(await render(page), /<p( style="[^"]*")?>(<br>)?<\/p>/, 'one undo does not give the emptied box back');
      await undo(page);
      assert.equal(await render(page), typed);
      assert.deepEqual(errors(page), []);
    });
  }

  const INK = `(() => {
  const s = document.querySelector('.reveal .slides');
  const S = s.getBoundingClientRect(), k = S.width / s.offsetWidth;
  const box = (r) => ({ left: (r.left - S.left) / k, top: (r.top - S.top) / k, right: (r.right - S.left) / k, bottom: (r.bottom - S.top) / k });
  const c = Reveal.getCurrentSlide();
  const p = c.querySelector('p.beeson-pending') ?? [...c.querySelectorAll('p')].find((e) => e.textContent === 'Note');
  const ink = [];
  for (const e of c.querySelectorAll(':scope > h2, :scope > p, :scope > div.math')) {
    if (e === p || !e.getClientRects().length) continue;
    const r = document.createRange();
    r.selectNodeContents(e);
    for (const q of r.getClientRects()) if (q.width > 1 && q.height > 1) ink.push({ what: e.localName, ...box(q) });
  }
  return { box: p && box(p.getBoundingClientRect()), ink, surface: box(c.querySelector('.surface').getBoundingClientRect()) };
})()`;
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  for (const platform of PLATFORMS) {
    test(`a new text box on slide 8 is put off the words and the formulas (${platform})`, async (t) => {
      const page = await load(t, platform, 7);
      await sleep(500);
      await newBox(page);
      const { box, ink, surface } = await page.evaluate(INK);
      assert.ok(ink.length > 5, 'the words of slide 8 are not measured');
      const under = ink.filter((q) => meets(box, q));
      assert.deepEqual(under, [], `the text box ${js(box)} lies over words or formulas`);
      assert.ok(box.left >= 0 && box.top >= 0 && box.right <= 1920 && box.bottom <= 1080, `the text box ${js(box)} is not inside the slide`);
      assert.ok(box.right - box.left >= 500, `the text box ${js(box)} is narrower than a half`);
      assert.ok(meets(box, surface), 'the text box is not over the surface');
      await type(page, 'Note');
      await sleep(400);
      const written = await page.evaluate(INK);
      assert.ok(near(written.box.left, box.left, 1) && near(written.box.top, box.top, 1), `the first key moves the text box from ${js(box)} to ${js(written.box)}`);
      assert.match(await render(page), /<p style="translate: -?\d+px -?\d+px; width: \d+px">Note<\/p>|<p style="width: \d+px; translate: -?\d+px -?\d+px">Note<\/p>/);
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('an emptied new text box clicked away', () => {
  const PLATFORMS = ['mac', 'other'];

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
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => press(page, 'Mod+Z').then(() => sleep(250));
  const redo = (page) => press(page, 'Mod+Shift+Z').then(() => sleep(250));
  const labels = (page) => page.evaluate(`(() => { const u = window.BeesonEditor.state('edit.undo'), r = window.BeesonEditor.state('edit.redo'); return { undo: u.label, redo: r.label, undoOn: !!u.enabled, redoOn: !!r.enabled }; })()`);
  const pendings = (page) => page.evaluate(`document.querySelectorAll('.reveal .slides p.beeson-pending').length`);

  async function load(t, platform, n = 0) {
    const text = readFileSync('test-deck.html', 'utf8');
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/test-deck.html?edit&still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function emptied(page, pause) {
    await click(page, '.beeson-edit-top [data-command="insert.text"]');
    await sleep(300);
    await type(page, 'h');
    await sleep(pause);
    await press(page, 'Backspace');
    await sleep(300);
    assert.equal(await pendings(page), 0);
  }

  for (const platform of PLATFORMS) {
    test(`a click into another text that leaves an emptied text box leaves the caret there (${platform})`, async (t) => {
      for (const [n, pause] of [[4, 300], [4, 1300], [0, 300]]) {
        const page = await load(t, platform, n);
        const at = `on slide ${n + 1} with a pause of ${pause} ms`;
        await emptied(page, pause);
        const target = n === 0 ? 'section.present .title-text h1' : 'section.present h2';
        await clickText(page, target);
        await sleep(700);
        assert.deepEqual(await page.evaluate(`(() => { const t = document.querySelector(${js(target)}); const a = getSelection().anchorNode; return { slide: Reveal.getIndices().h, caret: !!a && t.contains(a) }; })()`), { slide: n, caret: true }, `the click does not leave the caret in the text ${at}`);
        await press(page, 'End');
        await type(page, 'Z');
        await sleep(300);
        const written = await render(page);
        const tag = n === 0 ? 'h1' : 'h2';
        const was = page.source.split(/<section/)[n + 1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))[1];
        assert.ok(written.includes(`${was}Z</${tag}>`), `the letter is not typed at the end of the text ${at}`);
        assert.doesNotMatch(written, /<p( style="[^"]*")?>(<br>)?<\/p>/, `the emptied box is kept ${at}`);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });

    test(`a click on a row of the navigator that leaves an emptied text box shows its slide (${platform})`, async (t) => {
      for (const [n, row] of [[4, 2], [0, 4]]) {
        const page = await load(t, platform, n);
        await emptied(page, 300);
        await page.evaluate(`window.__shown = []; Reveal.on('slidechanged', (e) => window.__shown.push(e.indexh))`);
        await click(page, `.beeson-edit-nav .row:nth-child(${row})`);
        await sleep(700);
        assert.deepEqual(await page.evaluate(`({ slide: Reveal.getIndices().h, shown: window.__shown, row: document.activeElement.matches('.beeson-edit-nav .row') })`), { slide: row - 2, shown: [row - 2], row: true }, `the click on the row of slide ${row - 1} from slide ${n + 1}`);
        await byteExact(page);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }

  for (const platform of PLATFORMS) {
    test(`a text box left empty after an undo of its first letter leaves nothing to redo (${platform})`, async (t) => {
      for (const leaveBy of ['Escape', 'click']) {
        const page = await load(t, platform, 4);
        await clickText(page, 'section.present h2');
        await press(page, 'End');
        await type(page, 'Q');
        await sleep(1300);
        const older = await render(page);
        await click(page, '.beeson-edit-top [data-command="insert.text"]');
        await sleep(300);
        await type(page, 'h');
        await sleep(1300);
        await undo(page);
        assert.equal(await pendings(page), 1);
        if (leaveBy === 'Escape') {
          await press(page, 'Escape');
          await press(page, 'Escape');
        } else await clickText(page, { x: 1580, y: 600 });
        await sleep(300);
        assert.equal(await pendings(page), 0, `the box is held outside the file after ${leaveBy}`);
        const left = await render(page);
        assert.equal(left.match(/<p( [^>]*)?><\/p>/g)?.length, 1, `the empty box is not written after ${leaveBy}`);
        const l = await labels(page);
        assert.deepEqual({ redo: l.redoOn, undo: l.undo }, { redo: false, undo: 'Undo Insert Text Box' }, `the history after the box is left by ${leaveBy}: ${js(l)}`);
        await redo(page);
        assert.equal(await render(page), left, `a redo after the box is left by ${leaveBy} changes the file`);
        await undo(page);
        assert.equal(await render(page), older);
        await undo(page);
        await byteExact(page);
        assert.deepEqual(errors(page), []);
        await page.close();
      }
    });
  }
});
