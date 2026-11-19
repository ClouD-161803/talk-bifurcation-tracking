import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { createHash } from 'node:crypto';
import { deckSettled, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { byteExact, center, click, clickText, drag, openFormula, press, saveAndReopen, type, typeKeys } from './helpers/editor.mjs';

describe('a formula as an object with its menu', () => {
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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  let saves = 0;

  async function load(t, platform, { n = 0, edit = true } = {}) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/test-deck.html?${edit ? 'edit&' : ''}still&theme=light&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    if (edit) {
      await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
      page.source = readFileSync('test-deck.html', 'utf8');
      const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
      assert.deepEqual(s.problems, []);
    }
    if (n) await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  async function roundTrip(page, undos = 1) {
    const edited = await render(page);
    assert.notEqual(edited, page.source, 'the action does not change the file');
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.undo()');
    await byteExact(page);
    for (let i = 0; i < undos; i++) await page.evaluate('window.BeesonEditor.redo()');
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, `r9-4-${++saves}.html`);
    assert.equal(text, edited);
    assert.deepEqual(errors(page), []);
    page.source = text;
    return edited;
  }

  const MENU = `(() => {
  const m = [...document.querySelectorAll('.beeson-edit-menu')].filter((m) => m.getClientRects().length).at(-1);
  if (!m) return null;
  return { cls: m.className, items: [...m.querySelectorAll('.item')].map((e) => ({ label: e.querySelector('.label')?.textContent ?? '', off: e.getAttribute('aria-disabled') === 'true' })) };
})()`;
  const menu = (page) => page.evaluate(MENU);
  const mathJaxMenus = (page) => page.evaluate(`document.querySelectorAll('[class*=CtxtMenu_Menu]').length`);
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName + (e.getAttribute('class') ? '.' + e.getAttribute('class').split(' ')[0] : ''))`);
  const item = (m, label) => m?.items.find((i) => i.label === label);

  async function closeMenu(page) {
    await press(page, 'Escape');
    await frames(page);
  }

  async function submenu(page, label) {
    const at = await page.evaluate(`(() => {
    const m = [...document.querySelectorAll('.beeson-edit-menu')].filter((m) => m.getClientRects().length).at(-1);
    const r = [...m.querySelectorAll('.item')].find((i) => i.querySelector('.label')?.textContent === ${JSON.stringify(label)}).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await sleep(350);
    const m = await menu(page);
    await page.evaluate('window.BeesonEditorShell.closeMenus()');
    await frames(page);
    return m;
  }

  for (const platform of PLATFORMS) {
    test(`a right-click on a formula opens the element menu of the editor (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 3 });
      const cases = [
        ['the display', 3, '.reveal section.present div.math mjx-container', 'div.math'],
        ['an inline formula', 3, '.reveal section.present p mjx-container', 'p.fragment'],
        ['the formula of a caption', 4, '.reveal section.present figcaption mjx-container', 'figure.figure-box'],
      ];
      for (const [what, n, sel, owner] of cases) {
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        await click(page, sel, { button: 'right' });
        await sleep(300);
        assert.equal(await mathJaxMenus(page), 0, `a right-click on ${what} opens the menu of MathJax`);
        const m = await menu(page);
        assert.ok(m, `a right-click on ${what} does not open a menu of the editor`);
        assert.match(m.cls, /\belement\b/, `the menu of ${what} is not the element menu`);
        assert.equal(item(m, 'Edit Formula…')?.off, false, `Edit Formula… is not offered on ${what}`);
        assert.deepEqual(await selected(page), [owner], `a right-click on ${what} does not select its object`);
        assert.equal(await page.evaluate('document.body.scrollTop + document.documentElement.scrollTop'), 0, `the page is scrolled by a right-click on ${what}`);
        await closeMenu(page);
      }
      await page.evaluate('Reveal.slide(3)');
      await frames(page);
      await click(page, '.reveal section.present p mjx-container', { button: 'right' });
      await sleep(200);
      await click(page, await page.evaluate(`(() => { const i = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.textContent.includes('Edit Formula')); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
      await sleep(300);
      assert.equal(await page.evaluate(`document.querySelector('.beeson-math textarea')?.value`), '\\tilde U');
      await press(page, 'Escape');
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  test('without edit, a right-click on a formula opens the menu of MathJax as before', async (t) => {
    const page = await load(t, 'mac', { n: 3, edit: false });
    await page.evaluate('Reveal.slide(3, 0, 9)');
    await frames(page);
    await click(page, '.reveal section.present div.math mjx-container', { button: 'right' });
    await sleep(300);
    assert.ok((await mathJaxMenus(page)) > 0);
  });

  const styleOf = (page, sel) => page.evaluate(`document.querySelector(${js(sel)}).getAttribute('style')`);
  const sheetOpen = (page) => page.evaluate(`!!document.querySelector('.beeson-math')`);

  for (const platform of PLATFORMS) {
    for (const mod of platform === 'mac' ? ['Shift', 'Mod'] : ['Shift']) {
      test(`a ${mod}-click on a formula adds it to the selection or takes it out, without its sheet (${platform})`, async (t) => {
        const page = await load(t, platform, { n: 3 });
        const para = '.reveal section.present > p:first-of-type';
        const math = '.reveal section.present div.math';
        await clickText(page, para);
        await press(page, 'Escape');
        await frames(page);
        assert.deepEqual(await selected(page), ['p']);
        await click(page, math, { modifiers: mod });
        await sleep(300);
        assert.equal(await sheetOpen(page), false, `a ${mod}-click on a formula opens its sheet`);
        assert.deepEqual(await selected(page), ['p', 'div.math']);
        await click(page, math, { modifiers: mod });
        await sleep(300);
        assert.equal(await sheetOpen(page), false);
        assert.deepEqual(await selected(page), ['p'], `a second ${mod}-click on the formula does not take it out of the selection`);
        await click(page, math, { modifiers: mod });
        await sleep(300);
        assert.deepEqual(await selected(page), ['p', 'div.math']);
        await press(page, 'ArrowRight');
        await press(page, 'ArrowRight');
        await frames(page);
        assert.match((await styleOf(page, para)) ?? '', /translate/, 'the arrow keys do not nudge the selection');
        assert.match((await styleOf(page, math)) ?? '', /translate/, 'the arrow keys do not nudge the formula');
        await press(page, 'Escape');
        await frames(page);
        assert.deepEqual(await selected(page), []);
        await roundTrip(page, 2);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  const framed = (page) => page.evaluate(`document.querySelectorAll('.beeson-frame.selected:not([hidden])').length`);

  for (const platform of PLATFORMS) {
    test(`Esc from the sheet of a display selects it as an object for Delete and the arrow keys (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 3 });
      const math = '.reveal section.present div.math';
      for (const how of ['the key', 'Cancel']) {
        await clickText(page, math);
        await sleep(300);
        assert.equal(await sheetOpen(page), true, 'a click on a formula does not open its sheet');
        if (how === 'Cancel') await click(page, '.beeson-math button:not(.primary)');
        else await press(page, 'Escape');
        await frames(page);
        assert.equal(await sheetOpen(page), false);
        assert.deepEqual(await selected(page), ['div.math'], `the formula is not selected after ${how}`);
        assert.equal(await framed(page), 1);
        await press(page, 'ArrowRight');
        await frames(page);
        assert.match((await styleOf(page, math)) ?? '', /translate/, `an arrow key after ${how} does not nudge the formula`);
        await roundTrip(page);
        await clickText(page, math);
        await sleep(300);
        await press(page, 'Escape');
        await frames(page);
        await press(page, 'Escape');
        await frames(page);
        assert.deepEqual(await selected(page), [], `a second Esc after ${how} does not clear the selection`);
        assert.equal(await framed(page), 0);
        assert.equal(await page.evaluate(`document.activeElement.closest('mjx-container') === null`), true, 'the formula keeps the focus after the selection is cleared');
      }
      await clickText(page, math);
      await sleep(300);
      await press(page, 'Escape');
      await frames(page);
      await press(page, 'Backspace');
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelectorAll(${js(math)}).length`), 0, 'Backspace does not delete the formula');
      await roundTrip(page);
    });

    test(`Esc from the sheet of an inline formula selects its block as an object (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 3 });
      const para = '.reveal section.present p[data-fragment-index="2"]';
      await openFormula(page, `${para} mjx-container`);
      await sleep(300);
      assert.equal(await sheetOpen(page), true);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['p.fragment']);
      await press(page, 'ArrowDown');
      await frames(page);
      assert.match((await styleOf(page, para)) ?? '', /translate/, 'an arrow key does not nudge the block of the formula');
      await roundTrip(page);
    });
  }

  const itemAt = (page, label) => page.evaluate(`(() => { const i = [...document.querySelectorAll('.beeson-edit-menu .item')].filter((i) => i.getClientRects().length).find((i) => i.querySelector('.label')?.textContent === ${js(label)}); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

  async function objectMenu(page, at, sel, what) {
    await click(page, at, { button: 'right' });
    await sleep(250);
    assert.deepEqual(await selected(page), sel, `a right-click on ${what} drops the selection`);
    const m = await menu(page);
    assert.ok(m, `a right-click on ${what} does not open a menu of the editor`);
    assert.match(m.cls, /\belement\b/, `a right-click on ${what} opens the ${m.cls} menu`);
    assert.ok(item(m, 'Lock') || item(m, 'Unlock'), `the menu of ${what} does not offer Lock`);
    return m;
  }

  for (const platform of PLATFORMS) {
    test(`a right-click on a selected block, several blocks, a group, or the handle opens the element menu (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 4 });
      const para = '.reveal section.present > p';
      const head = '.reveal section.present > h2';
      await clickText(page, para);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['p']);
      await objectMenu(page, para, ['p'], 'a selected block');
      await closeMenu(page);
      const handle = await center(page, '.beeson-handle:not([hidden])');
      await objectMenu(page, handle, ['p'], 'the handle of a block');
      await closeMenu(page);
      await clickText(page, head);
      await press(page, 'Escape');
      await click(page, para, { modifiers: 'Shift' });
      await frames(page);
      assert.deepEqual(await selected(page), ['h2', 'p']);
      let m = await objectMenu(page, para, ['h2', 'p'], 'one of two selected blocks');
      assert.equal(item(m, 'Group')?.off, false);
      assert.equal(item(await submenu(page, 'Group'), 'Group')?.off, false);
      await page.evaluate(`window.BeesonEditor.exec('arrange.group')`);
      await frames(page);
      m = await objectMenu(page, para, ['h2', 'p'], 'a member of a selected group');
      assert.equal(item(await submenu(page, 'Group'), 'Ungroup')?.off, false);
      await roundTrip(page);
      await clickText(page, '.reveal section.present > ul');
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['ul']);
      await objectMenu(page, '.reveal section.present > ul li', ['ul'], 'a selected list');
      await click(page, await itemAt(page, 'Delete'));
      await frames(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present > ul').length`), 0);
      await roundTrip(page);
    });

    test(`a right-click on a code box selected as an object opens the element menu (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 5 });
      await clickText(page, '.reveal section.present pre code');
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['pre']);
      const m = await objectMenu(page, '.reveal section.present pre code', ['pre'], 'a selected code box');
      assert.equal(item(m, 'Delete')?.off, false);
      await closeMenu(page);
      assert.deepEqual(errors(page), []);
    });
  }

  async function drawArrow(page, x0, y) {
    await page.evaluate(`window.BeesonEditor.exec('insert.arrow')`);
    await sleep(150);
    await drag(page, { x: x0, y }, { dx: 300, steps: 12 });
    await sleep(200);
    assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present svg.line').length`), 1, 'the arrow is not drawn');
    await press(page, 'Escape');
    await press(page, 'Escape');
    await frames(page);
    assert.deepEqual(await selected(page), []);
    page.source = await render(page);
    const r = await page.evaluate(`(() => { const r = document.querySelector('.reveal section.present svg.line line').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    return r;
  }

  for (const platform of PLATFORMS) {
    test(`a right-click on the stroke of a line selects it and opens its element menu (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 6 });
      for (const [n, where] of [[6, 'an empty part of a slide'], [3, 'a text']]) {
        await page.evaluate(`Reveal.slide(${n})`);
        await frames(page);
        const s = await page.evaluate(`(() => { const r = document.querySelector('.reveal section.present').getBoundingClientRect(); const p = document.querySelector('.reveal section.present > p')?.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, py: p ? p.top + p.height / 2 : null }; })()`);
        const y = n === 3 ? s.py : s.t + s.h * 0.93;
        const at = await drawArrow(page, s.l + s.w * 0.15, y);
        for (const before of ['selected', 'not selected']) {
          if (before === 'selected') {
            await clickText(page, at);
            await frames(page);
            assert.deepEqual(await selected(page), ['svg.line']);
          }
          const m = await objectMenu(page, at, ['svg.line'], `a line ${before} over ${where}`);
          assert.equal(item(m, 'Delete')?.off, false);
          await closeMenu(page);
          await press(page, 'Escape');
          await frames(page);
        }
        await objectMenu(page, at, ['svg.line'], `a line over ${where}`);
        await click(page, await itemAt(page, 'Delete'));
        await frames(page);
        assert.equal(await page.evaluate(`document.querySelectorAll('.reveal section.present svg.line').length`), 0);
        await roundTrip(page);
      }
    });
  }

  for (const platform of PLATFORMS) {
    test(`a copy drag of a line leaves it in place and moves a copy (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 6 });
      const s = await page.evaluate(`(() => { const r = document.querySelector('.reveal section.present').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
      const at = await drawArrow(page, s.l + s.w * 0.15, s.t + s.h * 0.85);
      const lines = () => page.evaluate(`[...document.querySelectorAll('.reveal section.present svg.line')].map((l) => ({ style: l.style.translate, marker: l.querySelector('marker')?.id }))`);
      const [first] = await lines();
      await clickText(page, at);
      await drag(page, at, { dx: 0, dy: -200, steps: 10, modifiers: platform === 'mac' ? 'Alt' : 'Ctrl', hold: true });
      const readout = await page.evaluate(`[...document.querySelectorAll('.beeson-offset')].filter((r) => !r.hidden && r.getClientRects().length).map((r) => r.textContent).join(' ')`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y - 200, button: 'left', clickCount: 1, modifiers: platform === 'mac' ? 1 : 2 });
      await sleep(300);
      assert.match(readout, /Copy/, 'the readout of a copy drag of a line does not read Copy');
      const after = await lines();
      assert.equal(after.length, 2, 'a copy drag of a line does not copy it');
      assert.deepEqual(after[0], first, 'the line dragged with the copy key is moved');
      assert.notEqual(after[1].marker, first.marker, 'the copy has the id of the marker of its original');
      assert.notEqual(after[1].style, first.style, 'the copy is not put where it was dropped');
      assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Duplicate');
      assert.equal(await page.evaluate(`window.BeesonEditor.selection()[0] === document.querySelectorAll('.reveal section.present svg.line')[1]`), true, 'the copy is not selected');
      await roundTrip(page);
    });
  }

  const handles = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-handle')].filter((h) => !h.hidden && h.getClientRects().length).map((h) => getComputedStyle(h).cursor)`);
  const cursorAt = (page, p) => page.evaluate(`getComputedStyle(document.elementFromPoint(${p.x}, ${p.y})).cursor`);

  for (const platform of PLATFORMS) {
    test(`a locked block or QR code does not show a move cursor (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 12 });
      const qr = await center(page, '.reveal section.present .qr');
      assert.equal(await cursorAt(page, qr), 'move', 'the QR code does not show a move cursor before its lock');
      await clickText(page, qr);
      await page.evaluate(`window.BeesonEditor.exec('arrange.lock')`);
      await frames(page);
      await roundTrip(page);
      await clickText(page, qr);
      await frames(page);
      assert.notEqual(await cursorAt(page, qr), 'move', 'a locked QR code shows a move cursor');
      await page.evaluate('Reveal.slide(3)');
      await frames(page);
      const para = '.reveal section.present > p';
      await clickText(page, para);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await handles(page), ['move']);
      await page.evaluate(`window.BeesonEditor.exec('arrange.lock')`);
      await frames(page);
      assert.ok((await page.evaluate(`document.querySelector(${js(para)}).hasAttribute('data-locked')`)));
      assert.deepEqual((await handles(page)).filter((c) => c === 'move'), [], 'a locked block shows its handle with a move cursor');
      await roundTrip(page);
    });
  }

  for (const platform of PLATFORMS) {
    test(`a TeX error is shown once in the sheet of a formula (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 5 });
      await page.evaluate(`window.BeesonEditor.exec('insert.formula')`);
      await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
      await page.evaluate(`(() => { const f = document.querySelector('.beeson-math textarea'); f.focus(); f.select(); })()`);
      await type(page, 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}{2a}');
      await page.waitFor(`!!document.querySelector('.beeson-math .error:not(.prompt)')?.textContent`);
      await sleep(300);
      const sheet = await page.evaluate(`(() => { const m = document.querySelector('.beeson-math'); return { boxes: m.querySelectorAll('.preview [data-mjx-error], .preview mjx-merror').length, message: m.querySelector('.error').textContent, insert: m.querySelector('button.primary').disabled }; })()`);
      assert.equal(sheet.boxes, 0, 'the preview shows the error box of MathJax beside the message under it');
      assert.match(sheet.message, /brace/i);
      assert.equal(sheet.insert, true);
      await page.evaluate(`document.querySelector('.beeson-math textarea').select()`);
      await type(page, 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
      await page.waitFor(`!document.querySelector('.beeson-math .error').textContent`);
      assert.equal(await page.evaluate(`document.querySelectorAll('.beeson-math .preview svg').length`), 1);
      assert.deepEqual(errors(page), []);
    });
  }

  const STUB = (off) => `(() => {
  window.spoken = [];
  const stub = { speaking: false, current: null,
    speak(u) { this.current = u; this.speaking = true; window.spoken.push(u.text); },
    cancel() { const u = this.current; this.current = null; if (this.speaking) { this.speaking = false; u?.onend?.(new Event('end')); } } };
  Object.defineProperty(window, 'speechSynthesis', { value: ${off ? 'undefined' : 'stub'}, configurable: true });
  return true;
})()`;
  const cmd = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const labels = (items) => items.map((i) => (i.rule ? '-' : i.command ?? i.label));

  for (const platform of PLATFORMS) {
    test(`Edit > Speech reads the selection or the slide aloud (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 3 });
      await page.evaluate(STUB(false));
      const edit = labels(await page.evaluate(`window.BeesonEditorShell.menuItems('Edit')`));
      assert.ok(edit.includes('Speech'), `the Edit menu does not have Speech: ${edit.join(', ')}`);
      assert.equal(edit.indexOf('Speech'), edit.indexOf('Substitutions') + 1, 'Speech does not follow Substitutions');
      assert.deepEqual(labels(await page.evaluate(`window.BeesonEditorShell.menuItems('Edit', 'Speech')`)), ['edit.startSpeaking', 'edit.stopSpeaking']);
      assert.equal((await cmd(page, 'edit.startSpeaking')).enabled, true);
      assert.equal((await cmd(page, 'edit.stopSpeaking')).enabled, false);
      await page.evaluate(`window.BeesonEditor.exec('edit.startSpeaking')`);
      let spoken = await page.evaluate('window.spoken');
      assert.equal(spoken.length, 1);
      assert.match(spoken[0], /^Equations are first class citizens\s+You can type LaTeX/);
      assert.doesNotMatch(spoken[0], /\\\\/, 'the TeX of a formula is spoken');
      assert.equal((await cmd(page, 'edit.stopSpeaking')).enabled, true, 'Stop Speaking is not enabled while a text is spoken');
      await page.evaluate(`window.BeesonEditor.exec('edit.stopSpeaking')`);
      assert.equal(await page.evaluate('window.speechSynthesis.speaking'), false);
      assert.equal((await cmd(page, 'edit.stopSpeaking')).enabled, false);
      const para = '.reveal section.present > p:first-of-type';
      await clickText(page, para);
      await page.evaluate(`(() => { const t = document.querySelector(${js(para)}).firstChild; getSelection().setBaseAndExtent(t, 8, t, 16); })()`);
      if (platform === 'mac') await press(page, 'Mod+Alt+Shift+S');
      else await page.evaluate(`window.BeesonEditor.exec('edit.startSpeaking')`);
      spoken = await page.evaluate('window.spoken');
      assert.equal(spoken.at(-1), 'type LaT');
      await click(page, para, { button: 'right' });
      await sleep(250);
      const m = await menu(page);
      assert.match(m.cls, /\btext\b/);
      assert.ok(item(m, 'Speech'), 'the text menu does not have Speech');
      await closeMenu(page);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['p']);
      await page.evaluate(`window.BeesonEditor.exec('edit.startSpeaking')`);
      spoken = await page.evaluate('window.spoken');
      assert.match(spoken.at(-1), /^You can type LaTeX in equation boxes\..*expressed as$/s);
      await byteExact(page);
      assert.equal((await cmd(page, 'edit.undo')).enabled, false);
      assert.deepEqual(errors(page), []);
    });

    test(`Start Speaking and Stop Speaking are dimmed without speechSynthesis (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 3 });
      await page.evaluate(STUB(true));
      assert.equal((await cmd(page, 'edit.startSpeaking')).enabled, false);
      assert.equal((await cmd(page, 'edit.stopSpeaking')).enabled, false);
    });
  }

  const formatTab = (page) => page.evaluate(`document.querySelector('.beeson-edit-inspector .ed-tabs [aria-selected="true"]')?.textContent ?? null`);

  for (const platform of PLATFORMS) {
    test(`a display formula is framed while its Formula pane is shown (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 3 });
      const math = '.reveal section.present div.math';
      const ways = {
        'reached with Tab': async () => page.evaluate(`document.querySelector(${js(math)} + ' mjx-container').focus()`),
        'clicked': async () => {
          await clickText(page, math);
          await sleep(300);
        },
        'selected by Esc from its sheet': async () => {
          await clickText(page, math);
          await sleep(300);
          await press(page, 'Escape');
        },
      };
      for (const [how, reach] of Object.entries(ways)) {
        await reach();
        await frames(page);
        assert.equal(await formatTab(page), 'Formula', `the Formula pane is not shown for a display ${how}`);
        assert.equal(await framed(page), 1, `a display ${how} is not framed while its pane is shown`);
        if (how === 'clicked') {
          assert.equal(await sheetOpen(page), true);
          await press(page, 'Escape');
          continue;
        }
        await click(page, '.beeson-edit-inspector textarea');
        await frames(page);
        assert.equal(await formatTab(page), 'Formula');
        assert.equal(await framed(page), 1, `a display ${how} is not framed while its TeX is in the pane`);
        await clickText(page, { x: 1300, y: 960 });
        await press(page, 'Escape');
        await frames(page);
      }
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }

  const ends = (page) => page.evaluate(`(() => {
  const svg = document.querySelector('.reveal section.present svg.line');
  const l = svg.querySelector('line'), r = svg.getBoundingClientRect(), k = r.width / svg.width.baseVal.value;
  const at = (n) => ({ x: r.left + Number(l.getAttribute('x' + n)) * k, y: r.top + Number(l.getAttribute('y' + n)) * k });
  const grip = (n) => [...document.querySelectorAll('.beeson-line-end')].filter((g) => !g.hidden && g.dataset.end === n).map((g) => { const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })[0];
  return [1, 2].map((n) => ({ end: at(n), grip: grip(String(n)) }));
})()`);

  for (const platform of PLATFORMS) {
    test(`each grip of a selected line is on the end point of its line, with or without an arrowhead (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 6 });
      const s = await page.evaluate(`(() => { const r = document.querySelector('.reveal section.present').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
      const at = await drawArrow(page, s.l + s.w * 0.15, s.t + s.h * 0.85);
      for (const heads of ['end', 'start', 'both', 'none']) {
        await clickText(page, at);
        await page.evaluate(`window.BeesonEditor.exec(${js('line.heads.' + heads)})`);
        await frames(page);
        assert.deepEqual(await selected(page), ['svg.line']);
        for (const [i, e] of (await ends(page)).entries()) {
          assert.ok(e.grip, `the end ${i + 1} of the line does not have a grip`);
          const off = Math.hypot(e.grip.x - e.end.x, e.grip.y - e.end.y);
          assert.ok(off < 1, `with heads ${heads} the grip of the end ${i + 1} is ${off.toFixed(1)} px off the end point of its line`);
        }
      }
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('the TeX popover by the keyboard', () => {
  const OUTLINE = 'test/pages/editor-outline.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const MATH = 3;
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
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg !== undefined ? `, ${js(arg)}` : ''})).then(() => true)`);
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const near = (a, b, by = 2) => Math.abs(a - b) <= by;
  const sameRect = (a, b, by = 2) => !!a && !!b && near(a.left, b.left, by) && near(a.top, b.top, by) && near(a.width, b.width, by) && near(a.height, b.height, by);
  const mouse = (page, type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const rectOf = (page, selector) => page.evaluate(`(() => { const e = document.querySelector(${js(selector)}); if (!e || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.matches('div.math') ? 'math' : el.localName)`);

  async function load(t, platform, { deck = OUTLINE, n = 0, size = { width: 1600, height: 1000 } } = {}) {
    const page = await browser.newPage(size);
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
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

  async function checkEdit(page, before, edited, name) {
    assert.equal(await render(page), edited);
    await undo(page);
    assert.equal(await render(page), before);
    await redo(page);
    assert.equal(await render(page), edited);
    const { text } = await saveAndReopen(page, name);
    assert.equal(text, edited);
  }

  const PART = { current: '.col.now', next: '.col.upcoming', notes: '.notes', clock: '.clock', timer: '.group.timer' };
  const DISPLAY = 'dialog.beeson-edit-presenter[open]';
  const LAYOUT_KEY = `localStorage.getItem('beeson-presenter-layout:' + location.pathname)`;
  const PARTS_KEY = `localStorage.getItem('beeson-presenter-parts:' + location.pathname)`;
  const partRect = (page, part) => rectOf(page, `${DISPLAY} ${PART[part]}`);
  const frameRect = (page, part) => rectOf(page, `${DISPLAY} .layout .frame[data-part="${part}"]`);
  const centerOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const gripOf = async (page, part) => {
    const r = await rectOf(page, `${DISPLAY} .layout .frame[data-part="${part}"] .grip`);
    assert.ok(r, `the frame of ${part} does not have a grip`);
    return centerOf(r);
  };
  const shotRatio = (page, which) => page.evaluate(`(() => { const r = document.querySelector('${DISPLAY} .shot.${which}').getBoundingClientRect(); return r.width / r.height; })()`);
  const customizing = (page) => page.evaluate(`!!document.querySelector('${DISPLAY} .layout:not([hidden])')`);

  async function customize(page) {
    if (await page.evaluate(`!!document.querySelector('${DISPLAY} .parts[hidden]')`)) await click(page, `${DISPLAY} .bar.top button[aria-label="Display Options"]`);
    const buttons = await page.evaluate(`[...document.querySelectorAll('${DISPLAY} .parts button')].map((b) => b.textContent)`);
    assert.deepEqual(buttons, ['Customize Presenter Display'], 'the popover does not have the button Customize Presenter Display');
    await click(page, `${DISPLAY} .parts button`);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`while the presenter display is customized, each shown part is framed, moved by a drag, and resized by its corner, and Use Auto Layout puts it back (${platform})`, async (t) => {
      const page = await load(t, platform, { n: 1 });
      await exec(page, 'play.customizePresenter');
      await page.waitFor(`!!document.querySelector(${js(DISPLAY)})`);
      const auto = {};
      for (const p of Object.keys(PART)) auto[p] = await partRect(page, p);
      await press(page, 'Escape');
      const shot0 = await rectOf(page, `${DISPLAY} .shot.next`);
      await drag(page, `${DISPLAY} .notes .text`, { dx: -200, dy: 60 });
      await drag(page, `${DISPLAY} .shot.next`, { dx: -200, dy: 60 });
      await frames(page);
      assert.ok(sameRect(await partRect(page, 'notes'), auto.notes), 'a drag moved the notes outside the customizing');
      assert.ok(sameRect(await rectOf(page, `${DISPLAY} .shot.next`), shot0), 'a drag moved the next slide outside the customizing');
      assert.equal(await customizing(page), false, 'the frames are drawn outside the customizing');

      await customize(page);
      assert.equal(await customizing(page), true, 'the button does not start the customizing');
      assert.equal(await page.evaluate(`!!document.querySelector('${DISPLAY} .parts:not([hidden])')`), false, 'the popover is still open while the display is customized');
      for (const p of Object.keys(PART)) {
        const f = await frameRect(page, p);
        const r = await partRect(page, p);
        assert.ok(f && r && near(f.left, r.left, 4) && near(f.top, r.top, 4) && near(f.width, r.width, 8) && near(f.height, r.height, 8), `the frame of ${p} is ${js(f)} around ${js(r)}`);
      }
      const notes0 = await partRect(page, 'notes');
      const r0 = await partRect(page, 'current');
      await drag(page, centerOf(notes0), { dx: -300, dy: -40 });
      await frames(page);
      const notes1 = await partRect(page, 'notes');
      assert.ok(near(notes1.left, notes0.left - 300) && near(notes1.top, notes0.top - 40), `the notes moved from ${js(notes0)} to ${js(notes1)}`);
      assert.ok(sameRect(await partRect(page, 'current'), r0), 'the current slide moved with the notes');
      await drag(page, await gripOf(page, 'current'), { dx: -240, dy: 30 });
      await frames(page);
      const r1 = await partRect(page, 'current');
      assert.ok(near(r1.left, r0.left) && near(r1.top, r0.top), `the corner across from the grip moved from ${js(r0)} to ${js(r1)}`);
      assert.ok(near(r1.width, r0.width - 240), `the width of the current slide is ${r1.width}, not ${r0.width - 240}`);
      assert.ok(near(await shotRatio(page, 'current'), 16 / 9, 0.02), 'the current slide does not keep its aspect ratio');
      const n0 = await partRect(page, 'next');
      await drag(page, await gripOf(page, 'next'), { dx: -100, dy: 10 });
      await frames(page);
      const n1 = await partRect(page, 'next');
      assert.ok(near(n1.width, n0.width - 100), `the width of the next slide is ${n1.width}, not ${n0.width - 100}`);
      assert.ok(near(await shotRatio(page, 'next'), 16 / 9, 0.02), 'the next slide does not keep its aspect ratio');
      await drag(page, await gripOf(page, 'notes'), { dx: -50, dy: -30 });
      await frames(page);
      const notes2 = await partRect(page, 'notes');
      assert.ok(near(notes2.width, notes1.width - 50) && near(notes2.height, notes1.height - 30), `the notes are ${js(notes2)} after a resize of ${js(notes1)} by -50, -30`);
      const c0 = await partRect(page, 'clock');
      await drag(page, centerOf(c0), { dx: -500, dy: 300 });
      const c1 = await partRect(page, 'clock');
      assert.ok(near(c1.left, c0.left - 500) && near(c1.top, c0.top + 300), `the clock moved from ${js(c0)} to ${js(c1)}`);
      const t0 = await partRect(page, 'timer');
      await drag(page, await gripOf(page, 'timer'), { dx: 60, dy: 30 });
      const t1 = await partRect(page, 'timer');
      assert.ok(t1.height > t0.height + 15, `the timer is ${js(t1)} after a drag of its corner from ${js(t0)}`);
      await drag(page, centerOf(c1), { dx: -2000, dy: -2000 });
      const c2 = await partRect(page, 'clock');
      assert.ok(near(c2.left, 0) && near(c2.top, 0), `the clock is dragged out of the display to ${js(c2)}`);
      const stored = JSON.parse(await page.evaluate(LAYOUT_KEY));
      assert.deepEqual(Object.keys(stored).sort(), Object.keys(PART).sort());
      assert.ok(Object.values(stored).every((b) => Object.values(b).every((v) => v >= 0 && v <= 1)), `the layout ${js(stored)} is not in fractions`);
      assert.equal(await page.evaluate(PARTS_KEY), null);
      assert.equal(await page.evaluate(`document.querySelector('${DISPLAY} .count').textContent`), '2 / 3');
      await press(page, 'ArrowRight');
      assert.equal(await page.evaluate(`document.querySelector('${DISPLAY} .count').textContent`), '3 / 3');
      await press(page, 'Escape');
      assert.equal(await customizing(page), false, 'Esc does not end the customizing');
      assert.ok(await page.evaluate(`!!document.querySelector(${js(DISPLAY)})`), 'Esc ends the display with the customizing');
      const placed = {};
      for (const p of Object.keys(PART)) placed[p] = await partRect(page, p);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
      await frames(page);
      const small = await partRect(page, 'notes');
      const scaled = { left: (placed.notes.left * 1200) / 1600, top: (placed.notes.top * 800) / 1000, width: (placed.notes.width * 1200) / 1600, height: (placed.notes.height * 800) / 1000 };
      assert.ok(sameRect(small, scaled, 3), `the notes are ${js(small)} at 1200 × 800, after ${js(placed.notes)} at 1600 × 1000`);
      assert.ok(near(await shotRatio(page, 'current'), 16 / 9, 0.02));
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
      await frames(page);
      await drag(page, `${DISPLAY} .notes .text`, { dx: 200, dy: 60 });
      assert.ok(sameRect(await partRect(page, 'notes'), placed.notes), 'a drag moved the notes after the customizing');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector(${js(DISPLAY)})`);
      await exec(page, 'play.customizePresenter');
      await page.waitFor(`!!document.querySelector(${js(DISPLAY)})`);
      assert.ok(sameRect(await partRect(page, 'notes'), placed.notes), 'the layout is not kept for the deck');
      await click(page, `${DISPLAY} .parts label:nth-child(4)`);
      await customize(page);
      assert.equal(await frameRect(page, 'clock'), null, 'a hidden part is framed');
      assert.ok(await frameRect(page, 'notes'));
      const tools = await page.evaluate(`[...document.querySelectorAll('${DISPLAY} .layout button')].map((b) => b.textContent)`);
      assert.deepEqual(tools, ['Use Auto Layout', 'Done']);
      await click(page, `${DISPLAY} .layout button:first-of-type`);
      await frames(page);
      assert.equal(await page.evaluate(LAYOUT_KEY), null, 'Use Auto Layout does not clear the stored layout');
      for (const p of ['current', 'next', 'notes', 'timer']) {
        const r = await partRect(page, p);
        assert.ok(sameRect(r, auto[p]), `Use Auto Layout puts ${p} at ${js(r)}, not at ${js(auto[p])}`);
      }
      await click(page, `${DISPLAY} .layout button:last-of-type`);
      assert.equal(await customizing(page), false, 'Done does not end the customizing');
      await press(page, 'Escape');
      await page.waitFor(`!document.querySelector(${js(DISPLAY)})`);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }

  const SHEET = '.beeson-math';
  const focusIn = (page, selector) => page.evaluate(`!!document.activeElement?.closest(${js(selector)})`);
  const focused = (page) => page.evaluate(`(() => { const a = document.activeElement; return a?.localName === 'textarea' ? 'field' : a?.localName === 'button' ? a.textContent : a?.localName ?? null; })()`);
  const sheetOpen = (page) => page.evaluate(`!!document.querySelector(${js(SHEET)})`);
  const typeset = (page) => page.waitFor(`(() => { const b = document.querySelector('${SHEET} button.primary'); return !!b && !b.disabled; })()`);

  async function tabTo(page, stop) {
    for (let i = 0; i < 6 && (await focused(page)) !== stop; i++) await press(page, 'Tab');
    assert.equal(await focused(page), stop, `Tab does not reach ${stop}`);
  }

  async function enter(page) {
    const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '\r', unmodifiedText: '\r' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  const TEX = String.raw`\[\ddot x - \class{coriolis}{2\dot y} = -\frac{\partial \tilde U}{\partial x},\]`;
  const LIVE_MATH = '.reveal section.present div.math mjx-container';

  async function openTex(page) {
    await click(page, LIVE_MATH, { count: 2 });
    await page.waitFor(`!!document.querySelector(${js(SHEET)}) && !!document.querySelector('${SHEET} .preview mjx-container')`);
    await frames(page);
  }

  for (const platform of PLATFORMS) {
    test(`the TeX popover of a formula takes the focus, keeps Tab and Shift+Tab inside it, and closes by Esc from each of its controls (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS, n: MATH });
      await openTex(page);
      assert.equal(await focused(page), 'field', 'the focus is not in the TeX field when the popover opens');
      await typeset(page);
      const reached = new Set(['field']);
      for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
        await press(page, key);
        assert.ok(await focusIn(page, SHEET), `the focus leaves the popover after ${key}`);
        reached.add(await focused(page));
      }
      assert.deepEqual([...reached].sort(), ['Apply', 'Cancel', 'field'], 'Tab does not reach each control of the popover');
      for (const stop of ['field', 'Apply', 'Cancel']) {
        if (!(await sheetOpen(page))) await openTex(page);
        await page.evaluate(`document.querySelector('${SHEET} textarea').select()`);
        await type(page, 'y');
        await sleep(300);
        await typeset(page);
        await tabTo(page, stop);
        await press(page, 'Escape');
        await frames(page);
        assert.equal(await sheetOpen(page), false, `Esc with the focus on ${stop} does not close the popover`);
        assert.equal(await render(page), page.source, `Esc with the focus on ${stop} changes the formula`);
        assert.deepEqual(await selected(page), ['math'], `after Esc from ${stop}, the formula is not selected`);
      }
      await openTex(page);
      await page.evaluate(`document.querySelector('${SHEET} textarea').select()`);
      await type(page, 'y');
      await sleep(300);
      await typeset(page);
      await tabTo(page, 'Cancel');
      await enter(page);
      await frames(page);
      assert.equal(await sheetOpen(page), false, 'Return on Cancel does not close the popover');
      assert.equal(await render(page), page.source, 'Return on Cancel changes the formula');
      assert.deepEqual(errors(page), []);
    });

    test(`Return on Apply of the TeX popover applies the TeX, and the formula is then selected for the keys of the editor (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS, n: MATH });
      await openTex(page);
      await page.evaluate(`document.querySelector('${SHEET} textarea').select()`);
      await type(page, String.raw`\ddot x = 0,`);
      await sleep(300);
      await typeset(page);
      await tabTo(page, 'Apply');
      await enter(page);
      await page.waitFor(`!document.querySelector(${js(SHEET)})`);
      await frames(page);
      const applied = page.source.replace(TEX, () => String.raw`\[\ddot x = 0,\]`);
      assert.equal(await render(page), applied, 'Return on Apply does not apply the TeX');
      assert.deepEqual(await selected(page), ['math'], 'the formula is not selected after the popover closes');
      await press(page, 'ArrowRight');
      await sleep(1100);
      const nudged = await render(page);
      assert.match(nudged, /<div class="math fragment" data-fragment-index="1" data-keep style="translate: [^"]+">/, 'the arrow key does not nudge the formula');
      await checkEdit(page, applied, nudged, `r11-4-nudge-${platform}.html`);
      await page.evaluate(`Reveal.slide(${MATH})`);
      await frames(page);
      await openTex(page);
      await press(page, 'Escape');
      await frames(page);
      await press(page, 'Delete');
      await frames(page);
      const removed = await render(page);
      assert.ok(!removed.includes(String.raw`\ddot x = 0,`), 'Delete does not remove the formula after the popover closes');
      await checkEdit(page, nudged, removed, `r11-4-delete-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });

    test(`after Insert of a new formula from its TeX popover, the formula is selected for the keys of the editor (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS, n: 4 });
      await exec(page, 'insert.formula');
      await page.waitFor(`!!document.querySelector('${SHEET} textarea') && document.activeElement === document.querySelector('${SHEET} textarea')`);
      await type(page, 'E = mc^2');
      await sleep(300);
      await typeset(page);
      await tabTo(page, 'Insert');
      await enter(page);
      await page.waitFor(`!document.querySelector(${js(SHEET)})`);
      await frames(page);
      const inserted = await render(page);
      assert.match(inserted, /<div class="math">\\\[E = mc\^2\\\]<\/div>/);
      assert.deepEqual(await selected(page), ['math'], 'the new formula is not selected');
      await press(page, 'Delete');
      await frames(page);
      assert.equal(await render(page), page.source, 'Delete does not remove the new formula');
      await undo(page);
      assert.equal(await render(page), inserted);
      await undo(page);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }

  const CANVAS = `(() => { const c = document.querySelector('.beeson-edit-canvas'), v = window.BeesonEditorShell.stage.viewport; return { x: c.scrollLeft, y: c.scrollTop, zoomed: c.classList.contains('zoomed'), left: v.left, top: v.top, width: v.width, height: v.height }; })()`;
  for (const platform of PLATFORMS) {
    test(`a marquee held at the edge of a zoomed canvas scrolls it, and selects what it covers at the release (${platform})`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS, n: MATH, size: { width: 1600, height: 600 } });
      await exec(page, 'zoom.actual');
      await frames(page);
      const start = { x: 640, y: 1000 };
      const at = await page.evaluate(`(() => {
      const c = document.querySelector('.beeson-edit-canvas'), st = window.BeesonEditorShell.stage, v = st.viewport;
      c.scrollLeft += st.toScreen(${js(start)}).x - v.left - 300;
      c.scrollTop += st.toScreen({ x: 0, y: 560 }).y - v.top;
      st.place();
      return st.toScreen(${js(start)});
    })()`);
      await frames(page);
      const before = await page.evaluate(CANVAS);
      assert.ok(before.zoomed, 'the canvas is not zoomed at Actual Size');
      const math0 = await rectOf(page, '.reveal section.present div.math');
      assert.ok(math0.top + math0.height < before.top, `the display is in view before the marquee, at ${js(math0)}`);
      const edge = before.top + 4;
      await drag(page, at, { dx: 0, dy: edge - at.y, hold: true });
      for (let i = 0; i < 12; i++) {
        await mouse(page, 'mouseMoved', at.x, edge - (i % 2));
        await sleep(100);
      }
      await mouse(page, 'mouseMoved', at.x, edge);
      await frames(page);
      const held = await page.evaluate(CANVAS);
      assert.ok(held.y < before.y - 50, `the canvas is scrolled from ${before.y} to ${held.y} while the marquee is held at its top edge`);
      const { corner, box } = await page.evaluate(`(() => {
      const r = document.querySelector('.beeson-marquee')?.getBoundingClientRect();
      return { corner: window.BeesonEditorShell.stage.toScreen(${js(start)}), box: r && { left: r.left, top: r.top, width: r.width, height: r.height } };
    })()`);
      assert.ok(box && near(box.top + box.height, corner.y) && near(box.left, corner.x) && near(box.top, edge), `the marquee is ${js(box)}, from the start corner ${js(corner)} to the pointer at ${edge}`);
      await mouse(page, 'mouseReleased', at.x, edge);
      await frames(page);
      const picked = await selected(page);
      assert.ok(picked.includes('ol'), `the marquee does not select the list: ${js(picked)}`);
      assert.ok(picked.includes('math'), `the marquee does not select the display, which it covers after the scroll: ${js(picked)}`);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('a formula sheet replaced by another', () => {
  const PLATFORMS = ['mac', 'other'];
  const SLIDE = '.reveal .slides > section.present';
  const DECK = 'test/pages/editor-r29-1.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const [FORMULA, BREAKS, FLOW] = [0, 1, 2];

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
  const status = (page) => page.evaluate('window.BeesonEditor.status()');
  const call = (page, fn, ...args) => page.evaluate(`(${fn})(${args.map(js).join(', ')})`);

  async function load(t, platform, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${DECK}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = SOURCE;
    assert.deepEqual((await page.evaluate(`window.BeesonEditor.open(${js(SOURCE)})`)).problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await sleep(150);
    return page;
  }

  const changed = (text, file) => {
    const was = file.split('\n');
    return text.split('\n').filter((l, i) => l !== was[i]).join('\n');
  };

  async function formulaKey(page, platform) {
    if (platform === 'mac') return press(page, 'Mod+Alt+E');
    const base = { key: '=', code: 'Equal', windowsVirtualKeyCode: 187, modifiers: 1 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '=', unmodifiedText: '=' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async function clickAway(page) {
    const at = await page.evaluate(`(() => { const r = document.querySelector(${js(SLIDE)}).getBoundingClientRect(); return { x: r.left + 40, y: r.bottom - 30 }; })()`);
    await clickText(page, at);
    await sleep(300);
  }

  const ROUTES = [
    ['a new text box', async (page) => {
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(300);
      assert.equal(await page.evaluate(`!!document.querySelector(${js(`${SLIDE} .beeson-pending`)})`), true, 'the box is not drawn');
    }, `${SLIDE} .beeson-pending`, true],
    ['the empty words of a shape', async (page) => {
      await clickText(page, `${SLIDE} > .shape`);
      await frames(page);
      await press(page, 'Enter');
      await frames(page);
      assert.equal(await page.evaluate(`!!document.activeElement?.matches(${js(`${SLIDE} > .shape > p`)})`), true, 'the caret is not in the words of the shape');
    }, `${SLIDE} > .shape > p[data-generated]`, false],
  ];

  for (const platform of PLATFORMS) {
    for (const [name, open, left, kept] of ROUTES) {
      test(`1: the sheet of a formula in ${name} replaced by the sheet of another formula ${kept ? 'keeps it empty' : 'drops it, and the file and the history are kept'} (${platform})`, async (t) => {
        const page = await load(t, platform, FORMULA);
        const label = (await state(page, 'edit.undo')).label;
        await open(page);
        await formulaKey(page, platform);
        await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
        await type(page, 'x^2');
        await sleep(300);
        await clickText(page, `${SLIDE} > p mjx-container`);
        await sleep(400);
        assert.equal(await page.evaluate(`document.querySelector('.beeson-math .title')?.textContent ?? null`), 'Edit Formula', 'the sheet of the formula of the slide is not open');
        assert.equal(await page.evaluate(`document.querySelector('.beeson-math textarea').value`), 'a', 'the sheet does not hold the TeX of the formula of the slide');
        assert.equal(await page.evaluate(`document.querySelector(${js(left)})?.outerHTML ?? null`), null, 'the box is left when its sheet is replaced');
        for (const k of [1, 2]) {
          await clickAway(page);
          assert.equal(await page.evaluate(`!!document.querySelector('.beeson-math')`), false, 'the sheet is still open');
          assert.equal(await page.evaluate(`document.querySelector(${js(left)})?.outerHTML ?? null`), null, `the box is left after click away ${k}`);
          if (kept) {
            assert.equal((await render(page)).match(/<p( [^>]*)?><\/p>/g)?.length, 1, 'the empty box is not written as an empty paragraph');
            assert.equal((await state(page, 'edit.undo')).label, 'Undo Insert Text Box');
          } else {
            assert.equal(await render(page), page.source, 'the file is changed');
            assert.equal((await state(page, 'edit.undo')).label, label, 'the history has an entry');
            assert.equal((await status(page)).dirty, false, 'the editor reports unsaved changes');
          }
        }
        assert.deepEqual(errors(page), []);
      });
    }
  }

  for (const platform of PLATFORMS) {
    test(`1: a new text box with a formula entered is kept when the sheet of a second formula is replaced (${platform})`, async (t) => {
      const page = await load(t, platform, FORMULA);
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(300);
      await formulaKey(page, platform);
      await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
      await type(page, 'x^2');
      await sleep(400);
      await press(page, 'Mod+Enter');
      await page.waitFor(`!document.querySelector('.beeson-math')`);
      await sleep(300);
      const entered = await render(page);
      assert.ok(entered.includes('\\(x^2\\)'), 'the formula is not written into the box');
      const label = (await state(page, 'edit.undo')).label;
      await formulaKey(page, platform);
      await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
      await type(page, 'y');
      await sleep(300);
      await clickText(page, `${SLIDE} > p mjx-container`);
      await sleep(400);
      await clickAway(page);
      assert.equal(await render(page), entered, 'the box with its formula is not kept');
      assert.equal((await state(page, 'edit.undo')).label, label, 'the history is changed');
      assert.deepEqual(errors(page), []);
    });
  }

  let saves = 0;
  async function show(t, text, n, query = '') {
    const file = `test/pages/editor-r29-1-${process.pid}-${++saves}.html`;
    writeFileSync(file, text);
    t.after(() => rmSync(file, { force: true }));
    const page = await browser.newPage({ width: 1600, height: 900 });
    t.after(() => page.close().catch(() => {}));
    if (query === '?print-pdf') {
      await printView(page, `${server.origin}/${file}${query}`);
      return page;
    }
    await page.goto(`${server.origin}/${file}${query}#/${n}`);
    await page.waitFor(deckSettled);
    await sleep(200);
    return page;
  }

  const textElementOf = (selector, needle) => `[...document.querySelectorAll(${js(selector)})].find((el) => el.getBoundingClientRect().width && el.textContent.includes(${js(needle)}))`;

  async function erase(page, selector, needle, count) {
    const at = await page.evaluate(`(() => { const r = ${textElementOf(selector, needle)}.getBoundingClientRect(); return { x: r.right - 4, y: r.bottom - 12 }; })()`);
    await clickText(page, at);
    await frames(page);
    await page.evaluate(`(() => { const el = ${textElementOf(selector, needle)}; const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
    await press(page, 'Backspace', { count });
    await press(page, 'Escape');
    await frames(page);
  }

  const marks = (root) => `[...${root}.querySelectorAll('li, p')].map((el) => [el.localName, el.innerHTML, el.localName === 'li' ? getComputedStyle(el, '::before').content : '', Math.round(el.getBoundingClientRect().height) > 0])`;

  for (const platform of PLATFORMS) {
    test(`2: an item and a paragraph with a line break, emptied in the editor, are saved empty (${platform})`, async (t) => {
      const page = await load(t, platform, BREAKS);
      await erase(page, `${SLIDE} li`, 'First line', 'First line'.length + 1 + 'second line'.length);
      await erase(page, `${SLIDE} li`, 'Words', ' here'.length);
      await erase(page, `${SLIDE} > p`, 'Para one', 'Para one'.length + 1 + 'Para two'.length);
      const edited = await render(page);
      assert.equal(changed(edited, page.source), '    <li></li>\n    <li>Words<br>kept</li>\n  <p></p>', 'the emptied blocks are not saved empty');
      for (let i = 0; i < 3; i++) await undo(page);
      assert.equal(await render(page), page.source, 'three undos do not give the file back');
      for (let i = 0; i < 3; i++) await redo(page);
      assert.equal(await render(page), edited, 'three redos do not write the edits again');
      const { text } = await saveAndReopen(page, 'r29-1-breaks.html');
      assert.equal(text, edited);
      assert.deepEqual(errors(page), []);
      const expected = [['li', '', 'none', true], ['li', 'Keep', '""', true], ['li', 'Words<br>kept', '""', true], ['p', '', '', true], ['p', 'Tail', '', true]];
      const shown = await show(t, edited, BREAKS);
      assert.deepEqual(await shown.evaluate(marks(`document.querySelector(${js(SLIDE)})`)), expected, 'the show draws the emptied item with its dash');
      assert.deepEqual(errors(shown), []);
      const print = await show(t, edited, BREAKS, '?print-pdf');
      const pages = await print.evaluate(`[...document.querySelectorAll('.pdf-page section')].filter((s) => s.querySelector('h2')?.textContent === 'Breaks').map((s) => ${marks('s')})`);
      assert.ok(pages.length >= 1, 'the print view does not have the slide Breaks');
      for (const p of pages) assert.deepEqual(p, expected, 'the print view draws the emptied item with its dash');
    });
  }

  function screenOf(p) {
    const s = document.querySelector('.reveal .slides');
    const r = s.getBoundingClientRect();
    const k = r.width / s.offsetWidth;
    return { x: r.left + p.x * k, y: r.top + p.y * k, k };
  }

  function boxIn(sel) {
    const s = document.querySelector('.reveal .slides');
    const r = s.getBoundingClientRect();
    const k = r.width / s.offsetWidth;
    const b = document.querySelector(sel).getBoundingClientRect();
    return { left: (b.left - r.left) / k, top: (b.top - r.top) / k, width: b.width / k, height: b.height / k };
  }

  function endsOf(sel) {
    const svg = document.querySelector(sel);
    const [tx, ty] = (svg.style.translate || '0px 0px').split(/\s+/).map((v) => parseFloat(v) || 0);
    const c = svg.querySelector(':scope > line');
    return [+c.getAttribute('x1') + tx, +c.getAttribute('y1') + (ty || 0), +c.getAttribute('x2') + tx, +c.getAttribute('y2') + (ty || 0)].map(Math.round);
  }

  for (const platform of PLATFORMS) {
    test(`3: a line glued to a table pushed down by typing follows it in the entry of the typing (${platform})`, async (t) => {
      const page = await load(t, platform, FLOW);
      const table = await call(page, boxIn, `${SLIDE} table`);
      await exec(page, 'insert.line');
      const a = await call(page, screenOf, { x: 1400, y: 760 });
      await drag(page, a, { dx: (table.left + table.width - 1400) * a.k, dy: (table.top + table.height / 2 - 760) * a.k, steps: 12 });
      await sleep(150);
      const drawn = await render(page);
      const tag = /<svg class="line"[^>]*>/.exec(drawn)?.[0] ?? '';
      assert.ok(/data-from="a1 0\.5 0\.5"/.test(tag) && /data-to="a2 1 0\.5"/.test(tag), `the line is not glued to the shape and the table: ${tag}`);
      const line = `${SLIDE} > svg.line`;
      const end = (box) => [Math.round(box.left + box.width), Math.round(box.top + box.height / 2)];
      assert.deepEqual((await call(page, endsOf, line)).slice(2), end(table), 'the line is not drawn to the table');
      const p = await call(page, boxIn, `${SLIDE} > p`);
      await clickText(page, await call(page, screenOf, { x: p.left + p.width - 4, y: p.top + p.height / 2 }));
      await frames(page);
      await press(page, 'End');
      await typeKeys(page, ' and many more words that wrap the paragraph onto a second line and onto a third line of the column');
      await sleep(150);
      await press(page, 'Escape');
      await frames(page);
      const pushed = await call(page, boxIn, `${SLIDE} table`);
      assert.ok(pushed.top - table.top > 60, `the typing does not push the table down: ${table.top} to ${pushed.top}`);
      assert.deepEqual((await call(page, endsOf, line)).slice(2), end(pushed), 'the line is left behind by the table');
      const typed = await render(page);
      const saved = /<svg class="line"[^>]*>/.exec(typed)?.[0] ?? '';
      assert.notEqual(saved, tag, 'the save writes the line off its glue');
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Typing', 'the glue is not in the entry of the typing');
      await undo(page);
      await frames(page);
      assert.equal(await render(page), drawn, 'one undo of the typing does not put the line back');
      await redo(page);
      await frames(page);
      assert.equal(await render(page), typed, 'a redo of the typing does not move the line again');
      const { text } = await saveAndReopen(page, 'r29-1-flow.html');
      assert.equal(text, typed);
      assert.deepEqual(errors(page), []);
    });
  }
});

describe('the commit key of the formula sheets', () => {
  const LAYOUTS = 'test/pages/editor-layouts.html';
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

  let last = null;

  async function editor(platform, index = 2, deck = LAYOUTS) {
    await last?.close().catch(() => {});
    const page = await browser.newPage();
    last = page;
    await page.send('Page.bringToFront');
    await page.goto(`${server.origin}/${deck}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(deck, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${index})`);
    await wait(page, 300);
    return page;
  }

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const wait = (page, ms) => page.evaluate(`new Promise((d) => setTimeout(() => d(true), ${ms}))`);
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const until = async (page, expr, ms = 3000) => {
    for (const end = Date.now() + ms; Date.now() < end; await wait(page, 50)) if (await page.evaluate(expr)) return true;
    return false;
  };

  let saves = 0;
  async function saved(page) {
    const { text } = await saveAndReopen(page, `r6-6-${++saves}.html`);
    page.source = text;
    await byteExact(page);
    return text;
  }

  async function undoAll(page, source) {
    const text = await render(page);
    let n = 0;
    while ((await render(page)) !== source) {
      assert.ok(n++ < 20, 'the undo does not reach the text of the deck');
      await undo(page);
    }
    await byteExact(page);
    for (let i = 0; i < n; i++) await redo(page);
    assert.equal(await render(page), text);
  }

  const SLOW = `(() => {
  for (const name of ['typesetPromise', 'tex2svgPromise']) {
    const t = MathJax[name].bind(MathJax);
    MathJax[name] = (...a) => new Promise((d) => setTimeout(d, 150)).then(() => t(...a));
  }
})()`;

  const sheetOpen = `!!document.querySelector('.beeson-math textarea')`;
  const sheetClosed = `!document.querySelector('.beeson-math')`;

  for (const platform of PLATFORMS) {
    test(`the commit key of the Insert Formula sheet typed before the preview lands on ${platform}`, async () => {
      const page = await editor(platform, 2);
      const source = page.source;
      await exec(page, 'insert.formula');
      assert.ok(await until(page, sheetOpen), 'the sheet is not open');
      assert.equal(await page.evaluate(`document.querySelector('.beeson-math .title').textContent`), 'Insert Formula');
      await page.evaluate(SLOW);
      await type(page, 'x^2');
      await press(page, 'Mod+Enter');
      assert.ok(await until(page, sheetClosed), 'the key is lost, and the sheet is still open');
      await wait(page, 400);
      assert.match(await render(page), /<div class="math">\\\[x\^2\\\]<\/div>/);
      await undoAll(page, source);
      await saved(page);
      assert.deepEqual(errors(page), []);
    });

    test(`the commit key of the Edit Formula sheet typed after an error lands on ${platform}`, async () => {
      const page = await editor(platform, 3);
      const OLD = String.raw`-\frac{\partial \tilde U}{\partial x},`;
      await click(page, '.reveal section.present div.math mjx-container');
      assert.ok(await until(page, sheetOpen), 'the sheet is not open');
      assert.equal(await page.evaluate(`document.querySelector('.beeson-math .title').textContent`), 'Edit Formula');
      await page.evaluate(`(() => {
      const f = document.querySelector('.beeson-math textarea');
      f.value = f.value.replace(${JSON.stringify(OLD)}, ${JSON.stringify(String.raw`-\frac{a}{`)});
      const at = f.value.lastIndexOf('{') + 1;
      f.setSelectionRange(at, at);
      f.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
      const dimmed = `[...document.querySelectorAll('.beeson-math button')].find((b) => b.textContent === 'Apply').disabled`;
      assert.ok(await until(page, dimmed), 'the error does not dim Apply');
      await page.evaluate(SLOW);
      await type(page, 'b}');
      await press(page, 'Mod+Enter');
      assert.ok(await until(page, sheetClosed), 'the key is lost, and the sheet is still open');
      await wait(page, 400);
      await byteExact(page, [[OLD, String.raw`-\frac{a}{b}`]]);
      await undoAll(page, readFileSync(LAYOUTS, 'utf8'));
      await saved(page);
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`the label of Fade says that it is played from the slide into the next slide on ${platform}`, async () => {
      const page = await editor(platform, 3);
      const [title, group] = await page.evaluate(`[
      document.querySelector('.beeson-edit-transition button[data-command="slide.transition.fade"]').title,
      document.querySelector('.beeson-edit-transition .seg').getAttribute('aria-label'),
    ]`);
      assert.equal(title, 'Fade from this slide into the next slide, the default of the theme');
      assert.match(group, /next slide/);
      assert.deepEqual(errors(page), []);
    });
  }

  async function tiles(page, index) {
    await page.evaluate(`Reveal.slide(${index})`);
    await wait(page, 300);
    await exec(page, 'slide.layoutChooser');
    assert.ok(await until(page, `document.querySelectorAll('.beeson-edit-layouts .tile .pic').length === 8`), 'the chooser is not open');
    await frames(page);
    const list = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-layouts .tile')].map((t) => {
    const r = t.querySelector('.pic').getBoundingClientRect();
    return {
      layout: t.dataset.layout,
      name: t.textContent.trim(),
      marked: t.getAttribute('aria-selected') === 'true',
      markup: t.querySelector('.pic').shadowRoot.querySelector('.slides').innerHTML,
      look: [t.querySelector('.pic'), ...t.querySelector('.pic').shadowRoot.querySelectorAll('*')].flatMap((el, i) => {
        const b = el.getBoundingClientRect();
        const of = (s) => [...s].filter((k) => i || !k.startsWith('outline')).map((k) => k + ': ' + s.getPropertyValue(k)).join('; ');
        return [[el.localName, b.left - r.left, b.top - r.top, b.width, b.height, of(getComputedStyle(el))].join('; '),
          ...['::before', '::after', '::marker'].map((p) => p + ' ' + of(getComputedStyle(el, p))),
          ...(el.localName === 'canvas' ? [el.toDataURL()] : [])];
      }).concat((() => { const up = []; for (let e = t; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); up.push([s.opacity, s.filter, s.mixBlendMode, s.clipPath, s.mask, s.backdropFilter].join(' ')); } return up; })()),
      clip: { x: r.left + 4, y: r.top + 4, width: r.width - 8, height: r.height - 8, scale: 1 },
    };
  })`);
    for (const t of list) {
      t.png = await page.screenshot(t.clip);
      t.pixels = createHash('sha1').update(t.png).digest('hex');
    }
    await press(page, 'Escape');
    return list;
  }

  for (const platform of PLATFORMS) {
    test(`the tiles of the layout chooser are samples of the layouts, the same on every slide, on ${platform}`, async () => {
      const page = await editor(platform, 2);
      const content = await tiles(page, 2);
      const figure = await tiles(page, 8);

      assert.deepEqual(content.map((t) => t.name), ['Title', 'Section', 'Content', 'Content, Narrow', 'Content, Wide', 'Figure', 'Split', 'Closing']);
      assert.equal(new Set(content.map((t) => t.markup)).size, 8, 'two tiles have the same markup');
      assert.equal(new Set(content.map((t) => t.pixels)).size, 8, 'two tiles are drawn alike');
      assert.deepEqual(figure.map((t) => t.markup), content.map((t) => t.markup), 'a tile depends on the current slide');
      for (const [i, t] of figure.entries()) assert.deepEqual(t.look, content[i].look, `the tile of ${t.layout} is drawn from the current slide`);
      assert.deepEqual(content.filter((t) => t.marked).map((t) => t.layout), ['content']);
      assert.deepEqual(figure.filter((t) => t.marked).map((t) => t.layout), ['figure']);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });
  }
});
