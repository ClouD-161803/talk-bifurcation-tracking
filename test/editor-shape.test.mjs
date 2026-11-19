// shapes drawn with Insert > Shape, their Shape pane, the words typed into them and formatted by
// the Text pane, a text color chosen on a selected shape, and copies of groups and lines

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, deckUrl, launch } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { declarationProblem, textProblems, themeClasses } from '../src/editor/model/scope.ts';
import { ELEMENT_KINDS, elementText } from '../src/editor/model/templates.ts';
import { byteExact, click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';
import { shapePath } from '../src/shapes.ts';

// the shapes of commands/shape.ts on both platforms, driven with trusted input: Insert > Shape
// writes a div.shape before the notes of the slide, a drag in its drawing mode draws the box, the
// grips resize it with a free aspect, the Shape pane sets its tone, fill, outline, corners, and
// geometry, a typed key starts its words, and it is moved, copied, grouped, locked, ordered, kept
// by Change Layout and the resets, and named in the Object List. each edit is checked byte for
// byte, after an undo and a redo, against the scope rule, and after a save and an open
describe('shapes drawn by Insert > Shape', () => {
  const DECK = 'test/pages/editor-r20-2.html';
  const PLATFORMS = ['mac', 'other'];
  const THEME = new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8')));
  const PANEL = '#beeson-edit-panel-format';
  const [EMPTY, EVERY, FRAME, CARD] = [0, 1, 2, 3];

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

  async function shapePage(platform, n = EMPTY) {
    await last?.close().catch(() => {});
    const page = await browser.newPage();
    last = page;
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const free = (platform) => (platform === 'mac' ? 'Meta' : 'Alt');

  async function inScope(page) {
    const now = textProblems(await render(page), THEME);
    for (const p of textProblems(page.source, THEME)) {
      const i = now.indexOf(p);
      if (i >= 0) now.splice(i, 1);
    }
    assert.deepEqual(now, []);
  }

  // the screen point of a point in slide px
  const screen = (page, x, y) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  return { x: r.left + ${x} * k, y: r.top + ${y} * k };
})()`);

  // the shapes of the current slide: classes, the place and the size of the style, the words, and
  // the path of the svg child
  const shapes = (page) => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('.shape')].map((el) => ({
  cls: [...el.classList].filter((c) => !c.startsWith('beeson-')).join(' '), translate: el.style.translate, width: el.style.width, height: el.style.height, rotate: el.style.rotate,
  words: [...el.querySelectorAll('p')].map((p) => p.textContent).join('|'), d: el.querySelector(':scope > svg path')?.getAttribute('d') ?? null,
}))`);

  // the rendered text without the one shape inserted into it, and that shape
  async function inserted(page, source = page.source) {
    const text = await render(page);
    const m = /\n[ \t]*(<div class="shape[^\n]*<\/div>)/.exec(text);
    assert.ok(m, 'a shape is not in the rendered text');
    assert.equal(text.slice(0, m.index) + text.slice(m.index + m[0].length), source);
    return { shape: m[1], text, at: m.index };
  }

  // the caret put back at the end of the words of the shape of the current slide
  const caretBack = (page) => page.evaluate(`(() => { const p = Reveal.getCurrentSlide().querySelector('.shape p'); p.focus(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);

  const objectNames = (page) => page.evaluate(`[...document.querySelectorAll('.beeson-edit-objects .row')].map((r) => r.textContent.trim())`);

  test('the scope rule takes the width and the height of a shape in px, and the template of a shape is in it', () => {
    assert.equal(declarationProblem('div', ['shape', 'rounded'], 'height', '127px'), null);
    assert.equal(declarationProblem('div', ['shape'], 'width', '525px'), null);
    assert.notEqual(declarationProblem('div', ['figure-box'], 'height', '127px'), null);
    assert.notEqual(declarationProblem('div', ['shape'], 'width', '40%'), null);
    assert.ok(ELEMENT_KINDS.includes('shape'));
    const [t] = elementText('shape', { eol: '\n', step: '  ' }, '');
    assert.equal(t, '<div class="shape rounded" style="width: 240px; height: 240px"></div>');
    assert.deepEqual(textProblems(t, THEME), []);
    for (const c of ['shape', 'rounded', 'ellipse', 'triangle', 'arrow', 'arrow-both', 'brace', 'plus', 'equals', 'round-s', 'round-l', 'fill-none', 'fill-ground', 'fill-translucent', 'weight-6', 'weight-8', 'no-outline', 'flip-x', 'flip-y']) assert.ok(THEME.has(c), c);
  });

  for (const platform of PLATFORMS) {
    test(`Insert Shape with a box writes a rounded rectangle before the notes, undone and redone byte for byte, and saved, on ${platform}`, async () => {
      const page = await shapePage(platform);
      assert.equal((await state(page, 'insert.shape.rounded')).enabled, true);
      await exec(page, 'insert.shape.rounded', { box: { left: 300, top: 400, width: 500, height: 200 } });
      await frames(page);
      const { shape, text } = await inserted(page);
      assert.equal(shape, '<div class="shape rounded" style="width: 500px; height: 200px; translate: 300px 400px"></div>');
      // in front of every element of the slide, before its notes
      assert.ok(/<div class="shape[^\n]*<\/div>\n\s*<aside class="notes">Notes of the empty slide/.test(text));
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Insert Shape');
      // the shapes are in the submenu Shape of the Insert menu, before Line
      const sub = await page.evaluate(`window.BeesonEditorShell.menuItems('Insert', 'Shape').filter((i) => i.command).map((i) => i.command)`);
      assert.deepEqual(sub, ['rounded', 'rectangle', 'ellipse', 'triangle', 'arrow', 'arrow-both', 'brace', 'plus', 'equals'].map((k) => `insert.shape.${k}`));
      const top = await page.evaluate(`window.BeesonEditorShell.menuItems('Insert').map((i) => i.command ?? i.label ?? '|')`);
      assert.equal(top[top.indexOf('insert.line') - 1], 'Shape', top.join(' '));
      const rect = await page.evaluate(`(() => { const el = Reveal.getCurrentSlide().querySelector('.shape'); const s = document.querySelector('.reveal .slides'); const k = s.getBoundingClientRect().width / s.offsetWidth; const r = el.getBoundingClientRect(), o = s.getBoundingClientRect(); return [Math.round((r.left - o.left) / k), Math.round((r.top - o.top) / k), Math.round(r.width / k), Math.round(r.height / k)]; })()`);
      assert.deepEqual(rect, [300, 400, 500, 200]);
      // the shape is selected, and the Shape pane is shown with Arrange
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await frames(page);
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].map((b) => b.textContent)`), ['Shape', 'Arrange']);
      await inScope(page);
      await undo(page);
      await byteExact(page);
      await redo(page);
      assert.equal((await inserted(page)).shape, shape);
      const { text: saved } = await saveAndReopen(page, `r20-2-insert-${platform}.html`);
      assert.ok(saved.includes(shape));
      assert.deepEqual(errors(page), []);
    });

    test(`a drag in the mode of Insert Shape draws the box, with Shift a square, a click a shape of 240 px, and Esc leaves the mode, on ${platform}`, async () => {
      const page = await shapePage(platform);
      await exec(page, 'insert.shape.ellipse');
      assert.equal((await state(page, 'insert.shape.ellipse')).checked, true);
      const a = await screen(page, 300, 300);
      const b = await screen(page, 700, 500);
      await drag(page, a, { dx: b.x - a.x, dy: b.y - a.y, modifiers: free(platform) });
      await frames(page);
      let [s] = await shapes(page);
      assert.equal(s.cls, 'shape ellipse');
      assert.equal(s.translate, '300px 300px');
      assert.ok(Math.abs(parseFloat(s.width) - 400) <= 2 && Math.abs(parseFloat(s.height) - 200) <= 2, `${s.width} ${s.height}`);
      assert.equal((await state(page, 'insert.shape.ellipse')).checked, null);
      await undo(page);
      await byteExact(page);
      // with Shift the box is a square of the longer side
      await exec(page, 'insert.shape.rectangle');
      await drag(page, a, { dx: b.x - a.x, dy: b.y - a.y, modifiers: `Shift+${free(platform)}` });
      await frames(page);
      [s] = await shapes(page);
      assert.equal(s.cls, 'shape');
      assert.equal(s.width, s.height);
      assert.ok(Math.abs(parseFloat(s.width) - 400) <= 2, s.width);
      await undo(page);
      // a click places a shape of 240 by 240 px with its upper left corner at the click
      await exec(page, 'insert.shape.triangle');
      await click(page, a, { modifiers: free(platform) });
      await frames(page);
      [s] = await shapes(page);
      assert.deepEqual([s.cls, s.translate, s.width, s.height], ['shape triangle', '300px 300px', '240px', '240px']);
      assert.ok(s.d?.startsWith('M120 1.5L'), s.d);
      await undo(page);
      await byteExact(page);
      // Esc leaves the mode, and a drag from an empty point then draws a marquee
      await exec(page, 'insert.shape.rounded');
      await press(page, 'Escape');
      assert.equal((await state(page, 'insert.shape.rounded')).checked, null);
      await drag(page, await screen(page, 300, 700), { dx: 100, dy: 100 });
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`the grips resize a shape with a free aspect, Shift on a corner keeps it, the fields W and H write each side, and a flip turns a drawn geometry, on ${platform}`, async () => {
      const page = await shapePage(platform);
      await exec(page, 'insert.shape.rounded', { box: { left: 400, top: 300, width: 400, height: 200 } });
      await frames(page);
      const source = await render(page);
      const grip = (h) => page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-grip[data-handle="${h}"]')].find((g) => !g.hidden && g.getBoundingClientRect().width); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const k = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); return s.getBoundingClientRect().width / s.offsetWidth; })()`);
      // the side grip at the right stretches the width alone
      await drag(page, await grip('e'), { dx: 100 * k, modifiers: free(platform) });
      await frames(page);
      let [s] = await shapes(page);
      assert.deepEqual([s.translate, s.width, s.height], ['400px 300px', '500px', '200px']);
      await undo(page);
      assert.equal(await render(page), source);
      // the side grip at the bottom stretches the height alone
      await drag(page, await grip('s'), { dy: 100 * k, modifiers: free(platform) });
      await frames(page);
      [s] = await shapes(page);
      assert.deepEqual([s.width, s.height], ['400px', '300px']);
      await undo(page);
      // a corner grip with Shift keeps the aspect of 2 to 1
      await drag(page, await grip('se'), { dx: 200 * k, dy: 20 * k, modifiers: `Shift+${free(platform)}` });
      await frames(page);
      [s] = await shapes(page);
      assert.ok(Math.abs(parseFloat(s.width) / parseFloat(s.height) - 2) < 0.02, `${s.width} ${s.height}`);
      await undo(page);
      assert.equal(await render(page), source);
      // the fields W and H each write their side alone, since a shape does not keep its aspect
      await exec(page, 'arrange.setSize', { w: 300 });
      await frames(page);
      [s] = await shapes(page);
      assert.deepEqual([s.width, s.height], ['300px', '200px']);
      await exec(page, 'arrange.setSize', { h: 300 });
      await frames(page);
      [s] = await shapes(page);
      assert.deepEqual([s.width, s.height], ['300px', '300px']);
      await inScope(page);
      await undo(page);
      await undo(page);
      assert.equal(await render(page), source);
      // a flip is dimmed on a rectangle, and toggles flip-x on a triangle, also at an undo and a redo
      assert.equal((await state(page, 'arrange.flipHorizontal')).enabled, false);
      await exec(page, 'shape.kind.triangle');
      await exec(page, 'arrange.flipHorizontal');
      await frames(page);
      [s] = await shapes(page);
      assert.equal(s.cls, 'shape triangle flip-x');
      assert.equal(await page.evaluate(`getComputedStyle(Reveal.getCurrentSlide().querySelector('.shape > svg')).scale`), '-1 1');
      await exec(page, 'arrange.flipVertical');
      await frames(page);
      [s] = await shapes(page);
      assert.equal(s.cls, 'shape triangle flip-x flip-y');
      await inScope(page);
      await undo(page);
      await undo(page);
      await undo(page);
      await frames(page);
      assert.equal(await render(page), source);
      [s] = await shapes(page);
      assert.equal(s.d, null, 'the svg of the triangle is kept after the undo of Change Shape');
      await redo(page);
      await frames(page);
      [s] = await shapes(page);
      assert.ok(s.d?.startsWith('M200 1.5L'), `the svg is not drawn again at the redo: ${s.d}`);
      // an outline of 8 px insets the path by 4 px, also after an undo and a redo of the width
      await exec(page, 'shape.weight.8');
      await frames(page);
      assert.ok((await shapes(page))[0].d.startsWith('M200 4L'));
      await undo(page);
      await frames(page);
      assert.ok((await shapes(page))[0].d.startsWith('M200 1.5L'), 'the undo of the outline does not draw the svg again');
      await redo(page);
      await frames(page);
      assert.ok((await shapes(page))[0].d.startsWith('M200 4L'), 'the redo of the outline does not draw the svg again');
      assert.deepEqual(errors(page), []);
    });

    test(`the Shape pane sets the tone, the fill, the outline, the corners, and the geometry of every selected shape, on ${platform}`, async () => {
      const page = await shapePage(platform);
      await exec(page, 'insert.shape.rounded', { box: { left: 200, top: 300, width: 400, height: 200 } });
      await exec(page, 'insert.shape.rounded', { box: { left: 800, top: 300, width: 400, height: 200 } });
      await click(page, await screen(page, 230, 330), { modifiers: 'Shift' });
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 2);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await frames(page);
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].map((b) => b.textContent)`), ['Shape', 'Arrange']);
      const source = await render(page);
      const steps = [
        ['shape.tone.accent', 'shape rounded tone-accent'],
        ['shape.fill.none', 'shape rounded tone-accent fill-none'],
        ['shape.fill.ground', 'shape rounded tone-accent fill-ground'],
        ['shape.fill.translucent', 'shape rounded tone-accent fill-translucent'],
        ['shape.fill.tint', 'shape rounded tone-accent'],
        ['shape.weight.6', 'shape rounded tone-accent weight-6'],
        ['shape.weight.8', 'shape rounded tone-accent weight-8'],
        ['shape.weight.none', 'shape rounded tone-accent no-outline'],
        ['shape.weight.3', 'shape rounded tone-accent'],
        ['shape.corner.small', 'shape rounded tone-accent round-s'],
        ['shape.corner.large', 'shape rounded tone-accent round-l'],
        ['shape.corner.medium', 'shape rounded tone-accent'],
        ['shape.tone.text', 'shape rounded'],
      ];
      for (const [id, cls] of steps) {
        await click(page, `${PANEL} [data-command="${id}"]`);
        await frames(page);
        assert.deepEqual((await shapes(page)).map((s) => s.cls), [cls, cls], id);
        assert.equal((await state(page, id)).checked, true, id);
      }
      await inScope(page);
      // the geometry keeps the words, the box, and the other classes, and the corners are dimmed
      await exec(page, 'shape.tone.blue');
      await exec(page, 'shape.kind.arrow');
      await frames(page);
      let all = await shapes(page);
      assert.deepEqual(all.map((s) => [s.cls, s.width, s.height]), [['shape tone-blue arrow', '400px', '200px'], ['shape tone-blue arrow', '400px', '200px']]);
      assert.ok(all.every((s) => s.d?.startsWith('M1.5 ')), all[0].d);
      assert.equal((await state(page, 'shape.corner.small')).enabled, false);
      await exec(page, 'shape.kind.ellipse');
      await frames(page);
      all = await shapes(page);
      assert.deepEqual(all.map((s) => [s.cls, s.d]), [['shape tone-blue ellipse', null], ['shape tone-blue ellipse', null]]);
      // the pop-up Shape lists the geometries, and a choice in it changes the geometry
      await clickText(page, `${PANEL} .ed-shape-kind`);
      await frames(page);
      const items = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-menu .item')].map((i) => i.textContent.trim())`);
      for (const label of ['Rectangle', 'Rounded Rectangle', 'Ellipse', 'Triangle', 'Block Arrow', 'Double Block Arrow', 'Brace', 'Plus', 'Equals']) assert.ok(items.some((t) => t.startsWith(label)), `${label} in ${items}`);
      await click(page, await page.evaluate(`(() => { const i = [...document.querySelectorAll('.beeson-edit-menu .item')].find((i) => i.textContent.trim().startsWith('Triangle')); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
      await frames(page);
      all = await shapes(page);
      assert.deepEqual(all.map((s) => s.cls), ['shape tone-blue triangle', 'shape tone-blue triangle']);
      await inScope(page);
      for (let i = 0; i < steps.length + 4; i++) await undo(page);
      await frames(page);
      assert.equal(await render(page), source);
      assert.deepEqual((await shapes(page)).map((s) => s.d), [null, null]);
      const { text } = await saveAndReopen(page, `r20-2-pane-${platform}.html`);
      assert.equal(text, source);
      assert.deepEqual(errors(page), []);
    });

    test(`a typed key starts the words of a selected shape, Return and a double click put the caret at their end, on ${platform}`, async () => {
      const page = await shapePage(platform);
      await exec(page, 'insert.shape.rounded', { box: { left: 400, top: 300, width: 600, height: 300 } });
      await frames(page);
      const { shape, text: source } = await inserted(page);
      await press(page, 'Shift+G');
      await frames(page);
      await page.send('Input.insertText', { text: 'oal' });
      await sleep(50);
      await frames(page);
      let [s] = await shapes(page);
      assert.equal(s.words, 'Goal');
      assert.equal((await inserted(page, page.source)).shape, shape.replace('></div>', '><p>Goal</p></div>'));
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Typing');
      // the caret is in the words, and the shape keeps its frame
      assert.equal(await page.evaluate(`!!document.activeElement.closest('.shape')`), true);
      assert.equal(await page.evaluate(`[...document.querySelectorAll('.beeson-frame.selected')].filter((f) => !f.hidden && f.getBoundingClientRect().width > 300).length > 0`), true);
      // the Text pane formats the words of the shape
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await frames(page);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].map((b) => b.textContent)`), ['Shape', 'Text', 'Arrange']);
      await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === 'Shape').click()`);
      await caretBack(page);
      // the words are centered in the shape at the body size
      const words = await page.evaluate(`(() => { const el = Reveal.getCurrentSlide().querySelector('.shape'), p = el.querySelector('p'); const a = el.getBoundingClientRect(), b = p.getBoundingClientRect(); return { dx: Math.round(b.left + b.width / 2 - a.left - a.width / 2), dy: Math.round(b.top + b.height / 2 - a.top - a.height / 2), size: getComputedStyle(p).fontSize }; })()`);
      assert.deepEqual(words, { dx: 0, dy: 0, size: '48px' });
      // the first key is one entry, and the typing after it another
      await undo(page);
      await frames(page);
      assert.equal((await shapes(page))[0].words, 'G');
      await undo(page);
      await frames(page);
      assert.equal(await render(page), source);
      await redo(page);
      await redo(page);
      await frames(page);
      assert.equal((await shapes(page))[0].words, 'Goal');
      await inScope(page);
      // Return with the shape selected puts the caret at the end of its words
      await press(page, 'Escape');
      await press(page, 'Escape');
      await clickText(page, await screen(page, 430, 330));
      assert.equal(await page.evaluate(`window.BeesonEditor.selection()[0]?.matches('.shape') ?? false`), true);
      await press(page, 'Enter');
      await page.send('Input.insertText', { text: 's' });
      await sleep(50);
      [s] = await shapes(page);
      assert.equal(s.words, 'Goals');
      // a double click on an empty shape puts the caret into it, and an empty p is not written
      await exec(page, 'insert.shape.ellipse', { box: { left: 1100, top: 300, width: 300, height: 300 } });
      await frames(page);
      const empty = await render(page);
      await exec(page, 'selection.clear');
      await click(page, await screen(page, 1250, 450), { count: 2 });
      await frames(page);
      assert.equal(await page.evaluate(`!!document.activeElement.closest('.shape.ellipse')`), true, 'the caret is not in the empty shape');
      assert.equal(await render(page), empty);
      await page.send('Input.insertText', { text: 'x' });
      await sleep(50);
      await frames(page);
      assert.ok((await render(page)).includes('<div class="shape ellipse" style="width: 300px; height: 300px; translate: 1100px 300px"><p>x</p></div>'));
      await exec(page, 'selection.clear');
      await frames(page);
      // a first click on the words of a shape that is not selected selects the shape
      await clickText(page, await screen(page, 700, 450));
      await frames(page);
      assert.equal(await page.evaluate(`window.BeesonEditor.selection().length === 1 && window.BeesonEditor.selection()[0].matches('.shape.rounded')`), true);
      assert.equal(await page.evaluate(`!!document.activeElement.closest('.shape')`), false);
      await clickText(page, await screen(page, 700, 450));
      await frames(page);
      assert.equal(await page.evaluate(`!!document.activeElement.closest('.shape.rounded')`), true);
      await inScope(page);
      assert.deepEqual(errors(page), []);
    });

    test(`a shape is named in the Object List, moved, copied, grouped, locked, and ordered byte for byte, on ${platform}`, async () => {
      const page = await shapePage(platform, EVERY);
      if (!(await state(page, 'view.objects')).checked) await exec(page, 'view.objects');
      await frames(page);
      const names = await objectNames(page);
      for (const n of ['Rounded Rectangle: Goal', 'Rectangle', 'Ellipse', 'Triangle', 'Block Arrow', 'Double Block Arrow', 'Brace', 'Plus', 'Equals']) assert.ok(names.includes(n), `${n} in ${names}`);
      // a click on the empty rectangle selects it, and a drag moves it
      const r = await screen(page, 750, 340);
      await clickText(page, r);
      await frames(page);
      assert.equal(await page.evaluate(`[...window.BeesonEditor.selection()[0]?.classList ?? []].filter((c) => !c.startsWith('beeson-')).join(' ')`), 'shape');
      const up = await screen(page, 750, 300);
      await drag(page, r, { dx: 0, dy: up.y - r.y, modifiers: free(platform) });
      await frames(page);
      const moved = await render(page);
      assert.ok(moved.includes('<div class="shape" style="width: 300px; height: 160px; translate: 600px 220px"></div>'), moved.split('\n').filter((l) => l.includes('class="shape"')).join('\n'));
      await undo(page);
      await byteExact(page);
      // a duplicate, a copy and a paste, and Select All
      await clickText(page, r);
      await press(page, 'Mod+D');
      await frames(page);
      assert.equal((await shapes(page)).filter((s) => s.cls === 'shape').length, 2);
      await inScope(page);
      await undo(page);
      await byteExact(page);
      await exec(page, 'selection.all');
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 10);
      // a group of two shapes, a lock, and the layer order
      await clickText(page, r);
      await click(page, await screen(page, 982, 340), { modifiers: 'Shift' });
      // Align Left with Align to Selection moves the ellipse to the left edge of the rectangle
      await exec(page, 'arrange.alignTo.selection');
      await exec(page, 'arrange.align.left');
      await frames(page);
      assert.ok((await render(page)).includes('<div class="shape ellipse tone-red fill-none" style="width: 300px; height: 160px; translate: 600px 260px"></div>'));
      await undo(page);
      await byteExact(page);
      await exec(page, 'arrange.group');
      await frames(page);
      assert.equal((await render(page)).match(/data-group=/g)?.length, 2);
      await inScope(page);
      await undo(page);
      await byteExact(page);
      await clickText(page, await screen(page, 1460, 400));
      await exec(page, 'arrange.lock');
      await frames(page);
      assert.ok((await render(page)).includes('<div class="shape triangle" style="width: 200px; height: 160px; translate: 1360px 260px" data-locked>'));
      await undo(page);
      await byteExact(page);
      await clickText(page, await screen(page, 160, 300));
      assert.equal(await page.evaluate(`window.BeesonEditor.selection()[0]?.matches('.shape.rounded') ?? false`), true);
      await exec(page, 'arrange.order.front');
      await frames(page);
      const front = await render(page);
      assert.notEqual(front, page.source);
      assert.ok(await page.evaluate(`(() => { const all = [...Reveal.getCurrentSlide().querySelectorAll('.shape')]; return getComputedStyle(all[0]).zIndex !== 'auto' || all.at(-1).matches('.rounded'); })()`));
      await undo(page);
      await byteExact(page);
      // a deck with every kind of shape is saved byte for byte and drawn the same after an open
      const before = await shapes(page);
      const { text } = await saveAndReopen(page, `r20-2-every-${platform}.html`);
      assert.equal(text, page.source);
      await frames(page);
      assert.deepEqual(await shapes(page), before);
      assert.deepEqual(errors(page), []);
    });

    test(`Change Layout keeps a shape at its place, and Reset Slide, Reset Position, and Reset Size leave its place and its size, on ${platform}`, async () => {
      const page = await shapePage(platform, CARD);
      const tag = '<div class="shape rounded" style="width: 500px; height: 300px; translate: 1100px 400px; rotate: 30deg">';
      const box = () => page.evaluate(`(() => { const el = Reveal.getCurrentSlide().querySelector('.shape'); const s = document.querySelector('.reveal .slides'); const k = s.getBoundingClientRect().width / s.offsetWidth; const r = el.getBoundingClientRect(), o = s.getBoundingClientRect(); return [Math.round((r.left - o.left) / k), Math.round((r.top - o.top) / k)]; })()`);
      const at = await box();
      await exec(page, 'slide.layout.narrow');
      await frames(page);
      let text = await render(page);
      assert.ok(text.includes(`${tag}<p>Card</p></div>`), 'Change Layout moved or changed the shape');
      assert.ok(!/<div class="col">[\s\S]*class="shape/.test(text), 'the shape is in the text column');
      assert.deepEqual(await box(), at);
      await undo(page);
      await frames(page);
      await byteExact(page);
      // Reset Slide takes the rotation off and leaves the place and the size
      await exec(page, 'slide.reset');
      await frames(page);
      text = await render(page);
      assert.ok(text.includes('<div class="shape rounded" style="width: 500px; height: 300px; translate: 1100px 400px"><p>Card</p></div>'), 'Reset Slide took the place or the size off the shape');
      await undo(page);
      await frames(page);
      await byteExact(page);
      await clickText(page, await screen(page, 1350, 650));
      assert.equal(await page.evaluate(`window.BeesonEditor.selection()[0]?.matches('.shape') ?? false`), true);
      assert.equal((await state(page, 'arrange.resetPosition')).enabled, false);
      assert.equal((await state(page, 'arrange.resetSize')).enabled, false);
      assert.equal((await state(page, 'arrange.resetRotation')).enabled, true);
      await exec(page, 'arrange.resetPosition');
      await exec(page, 'arrange.resetSize');
      await byteExact(page);
      await exec(page, 'arrange.resetRotation');
      await frames(page);
      assert.ok((await render(page)).includes('<div class="shape rounded" style="width: 500px; height: 300px; translate: 1100px 400px"><p>Card</p></div>'));
      assert.deepEqual(errors(page), []);
    });

    test(`a press inside a shape without a fill goes through it, and a press on its outline or its words selects it, on ${platform}`, async () => {
      const page = await shapePage(platform, FRAME);
      // inside the frame, away from its words, a click selects nothing and a drag does not move it
      await clickText(page, await screen(page, 300, 400));
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 0);
      await drag(page, await screen(page, 300, 400), { dx: 40, dy: 40 });
      await frames(page);
      await byteExact(page);
      await exec(page, 'selection.clear');
      // on the outline, at the left edge
      await clickText(page, await screen(page, 202, 550));
      await frames(page);
      assert.equal(await page.evaluate(`window.BeesonEditor.selection()[0]?.matches('.shape') ?? false`), true);
      await exec(page, 'selection.clear');
      // on its words
      await clickText(page, await screen(page, 800, 550));
      await frames(page);
      assert.equal(await page.evaluate(`window.BeesonEditor.selection()[0]?.matches('.shape') ?? false`), true);
      assert.deepEqual(errors(page), []);
    });
  }
});

// the fixes of R21.1 on both platforms, driven with trusted input: the Text pane formats the words
// of a selected shape, the alignment of its words reads and sets how they are drawn, an Alt key of
// a command runs it while a shape is selected, Magic Move pairs a shape with its dimmed copy and a
// curve by its arrowheads, an outline weight is drawn on a translucent shape, and a press anywhere on the
// outline of a shape without a fill hits it. each edit is checked byte for byte, after an undo and
// a redo, and after a save and an open
describe('the Text pane on the words of shapes', () => {
  const DECK = 'test/pages/editor-r21-1.html';
  const PLATFORMS = ['mac', 'other'];
  const PANEL = '#beeson-edit-panel-format';
  const [WORDS, TRIANGLE, TRANSLUCENT, FRAME, STEP, CURVE] = [0, 1, 2, 3, 4, 6];
  const SHAPE_P = 'translate: 1100px 400px"><p>Goal</p></div>';
  const PARAGRAPH = 'A paragraph beside a card.';

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

  async function shapePage(platform, n) {
    await last?.close().catch(() => {});
    const page = await browser.newPage();
    last = page;
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
  const undo = (page) => page.evaluate('window.BeesonEditor.undo()');
  const redo = (page) => page.evaluate('window.BeesonEditor.redo()');
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const errors = (page) => page.errors.filter((e) => !e.includes('/favicon.ico'));

  // the screen point of a point in slide px
  const screen = (page, x, y) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  return { x: r.left + ${x} * k, y: r.top + ${y} * k };
})()`);

  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName + '.' + [...el.classList].filter((c) => !c.startsWith('beeson-')).join('.'))`);
  const caretInShape = (page) => page.evaluate(`(() => { const s = getSelection(); return !!(s.rangeCount && s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('.shape')); })()`);

  // a click at the center of the shape of the current slide that matches selector, which selects it
  // as an object
  async function clickShape(page, selector = '.shape') {
    const at = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await clickText(page, at);
    await frames(page);
  }

  // the shape selected as an object whatever is selected before: a click on a shape that is selected
  // already puts the caret into its words
  async function selectShape(page) {
    await exec(page, 'selection.clear');
    await frames(page);
    await clickShape(page);
  }

  // the tag that the command id writes on the paragraph of the slide WORDS selected as a block, with
  // the words of the paragraph replaced by those of the shape
  async function blockEdit(page, id) {
    await clickText(page, await screen(page, 300, 300));
    await press(page, 'Escape');
    await frames(page);
    await exec(page, id);
    const text = await render(page);
    await undo(page);
    await byteExact(page);
    const line = text.split('\n').find((l) => l.includes(PARAGRAPH));
    assert.ok(line && line !== `  <p>${PARAGRAPH}</p>`, `${id} does not change the paragraph selected as a block`);
    return line.trim().replace(PARAGRAPH, 'Goal');
  }

  // the commands or titles of the buttons of the Text tab of the Format pane that are disabled
  async function disabledInText(page) {
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === 'Text').click()`);
    await frames(page);
    return page.evaluate(`[...document.querySelectorAll('${PANEL} button')].filter((b) => !b.closest('.ed-tabs') && b.offsetParent && b.disabled).map((b) => b.dataset.command ?? b.title ?? b.textContent)`);
  }

  // a trusted press of Alt+=, whose key press() of test/helpers/editor.mjs does not know
  async function altEquals(page) {
    const base = { key: '=', code: 'Equal', windowsVirtualKeyCode: 187, modifiers: 1 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '=', unmodifiedText: '=' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  test('the class left of the words of a shape is a class of the theme', () => {
    assert.ok(new Set(themeClasses(readFileSync('theme/beeson.css', 'utf8'))).has('left'));
  });

  for (const platform of PLATFORMS) {
    test(`V1: the Text pane formats every word of a selected shape, as of a paragraph selected as a block, on ${platform}`, async () => {
      const page = await shapePage(platform, WORDS);
      const ids = ['text.bigger', 'text.bold'];
      const edits = {};
      for (const id of ids) edits[id] = await blockEdit(page, id);
      const paragraphDisabled = await disabledInText(page);
      await clickShape(page);
      assert.deepEqual(await selected(page), ['div.shape.rounded.tone-accent']);
      assert.equal(await caretInShape(page), false);
      for (const id of [...ids, 'text.italic', 'text.smaller', 'text.tone.violet', 'text.align.left']) assert.equal((await state(page, id)).enabled, true, id);
      // Subtle is not a tone of a shape, which a text color colors as a shape
      assert.deepEqual((await disabledInText(page)).filter((b) => !paragraphDisabled.includes(b)), ['text.tone.subtle'], 'the buttons of the Text tab disabled for a selected shape and not for a paragraph');
      for (const id of ids) {
        await selectShape(page);
        await exec(page, id);
        await frames(page);
        await byteExact(page, [[SHAPE_P, `translate: 1100px 400px">${edits[id]}</div>`]]);
        await undo(page);
        await byteExact(page);
        await redo(page);
        await byteExact(page, [[SHAPE_P, `translate: 1100px 400px">${edits[id]}</div>`]]);
        await undo(page);
      }
      await selectShape(page);
      await exec(page, 'text.tone.violet');
      await frames(page);
      await byteExact(page, [['<div class="shape rounded tone-accent" style="width: 500px; height: 300px; translate: 1100px 400px">', '<div class="shape rounded tone-violet" style="width: 500px; height: 300px; translate: 1100px 400px">']]);
      await undo(page);
      await byteExact(page);
      // Dashes sets the words as a list, and the shape stays selected
      await selectShape(page);
      await exec(page, 'text.list.ul');
      await frames(page);
      await byteExact(page, [[SHAPE_P, 'translate: 1100px 400px"><ul>\n  <li>Goal</li>\n</ul></div>']]);
      assert.deepEqual(await selected(page), ['div.shape.rounded.tone-accent']);
      await exec(page, 'text.list.none');
      await frames(page);
      await byteExact(page);
      await selectShape(page);
      await exec(page, 'text.bold');
      const { text } = await saveAndReopen(page, `r21-1-v1-${platform}.html`);
      assert.ok(text.includes(`${edits['text.bold']}</div>`));
      assert.deepEqual(errors(page), []);
    });

    test(`V17 and V22: Center is checked for the words of a shape, and Align Left aligns them to the left with the class left, on ${platform}`, async () => {
      const page = await shapePage(platform, WORDS);
      // with the caret in the words
      await clickShape(page);
      await press(page, 'Enter');
      await frames(page);
      assert.equal(await caretInShape(page), true);
      assert.equal((await state(page, 'text.align.center')).checked, true);
      assert.equal((await state(page, 'text.align.left')).checked, false);
      // with the shape selected
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['div.shape.rounded.tone-accent']);
      assert.equal((await state(page, 'text.align.center')).checked, true);
      assert.equal((await state(page, 'text.align.left')).checked, false);
      await exec(page, 'text.align.left');
      await frames(page);
      const left = [[SHAPE_P, 'translate: 1100px 400px"><p class="left">Goal</p></div>']];
      await byteExact(page, left);
      const drawn = () => page.evaluate(`(() => { const s = Reveal.getCurrentSlide().querySelector('.shape'), p = s.querySelector('p'); const r = document.createRange(); r.selectNodeContents(p); const k = s.getBoundingClientRect().width / s.offsetWidth; return { align: getComputedStyle(p).textAlign, inset: Math.round((r.getBoundingClientRect().left - s.getBoundingClientRect().left) / k) }; })()`);
      let d = await drawn();
      assert.equal(d.align, 'left');
      assert.ok(d.inset <= 30, `the words start ${d.inset} px inside the shape`);
      assert.equal((await state(page, 'text.align.left')).checked, true);
      assert.equal((await state(page, 'text.align.center')).checked, false);
      await undo(page);
      await byteExact(page);
      assert.ok((await drawn()).inset > 100, 'the words are not centered after the undo');
      await redo(page);
      await byteExact(page, left);
      // Center takes the class off, with the caret in the words too. the shape is still selected
      // after the redo, hence it is selected again as an object before Enter puts the caret in
      await selectShape(page);
      await press(page, 'Enter');
      await frames(page);
      assert.equal(await caretInShape(page), true);
      assert.equal((await state(page, 'text.align.left')).checked, true);
      await exec(page, 'text.align.center');
      await frames(page);
      await byteExact(page);
      d = await drawn();
      assert.equal(d.align, 'center');
      await undo(page);
      await byteExact(page, left);
      const { text } = await saveAndReopen(page, `r21-1-v17-${platform}.html`);
      assert.ok(text.includes('<p class="left">Goal</p></div>'));
      assert.deepEqual(errors(page), []);
    });

    test(`V2: the keys of Rulers and Insert Formula run their commands while a shape is selected, and a letter still starts its words, on ${platform}`, async () => {
      const page = await shapePage(platform, TRIANGLE);
      await clickShape(page);
      assert.deepEqual(await selected(page), ['div.shape.triangle']);
      const rulers = (await state(page, 'view.rulers')).checked;
      await press(page, platform === 'mac' ? 'Mod+R' : 'Alt+Shift+R');
      await frames(page);
      assert.equal((await state(page, 'view.rulers')).checked, !rulers, 'the rulers are not toggled');
      await byteExact(page);
      if (platform === 'mac') await press(page, 'Mod+Alt+E');
      else await altEquals(page);
      await frames(page);
      const text = await render(page);
      assert.match(text, /<div class="math"[^\n]*>\\\[\\\]<\/div>/, 'a formula is not inserted');
      assert.ok(text.includes('<div class="shape triangle" style="width: 200px; height: 160px; translate: 1360px 260px"></div>'), 'the shape is changed');
      await undo(page);
      await byteExact(page);
      await clickShape(page);
      await press(page, 'q');
      await frames(page);
      assert.ok((await render(page)).includes('<div class="shape triangle" style="width: 200px; height: 160px; translate: 1360px 260px"><p>q</p></div>'));
      assert.deepEqual(errors(page), []);
    });

    test(`V16: Magic Move pairs a shape with its copy that has the step effect Dim, on ${platform}`, async () => {
      const page = await shapePage(platform, STEP);
      await exec(page, 'slide.transition.magic');
      const text = await render(page);
      const ids = [...text.matchAll(/<div class="shape[^"]*"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(ids.length, 2, 'the shape and its dimmed copy are not both given a data-id');
      assert.equal(ids[0], ids[1]);
      await undo(page);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`V5: Magic Move does not pair a curved arrow with a headless curve, on ${platform}`, async () => {
      const page = await shapePage(platform, CURVE);
      await exec(page, 'slide.transition.magic');
      const text = await render(page);
      assert.doesNotMatch(text, /<svg class="line[^"]*"[^>]*data-id=/, 'a curve is paired with a curve of other heads');
      await undo(page);
      await byteExact(page);
      assert.deepEqual(errors(page), []);
    });

    test(`V3: an outline of 6 or 8 px set on a veil is drawn, and the Outline control reads the drawn outline of a veil, on ${platform}`, async () => {
      const page = await shapePage(platform, TRANSLUCENT);
      const border = () => page.evaluate(`getComputedStyle(Reveal.getCurrentSlide().querySelector('.shape.fill-translucent:not(.equals)')).borderTopWidth`);
      const stroke = () => page.evaluate(`getComputedStyle(Reveal.getCurrentSlide().querySelector('.shape.equals > svg path')).strokeWidth`);
      assert.equal(await border(), '0px');
      await clickShape(page, '.shape.fill-translucent:not(.equals)');
      assert.deepEqual(await selected(page), ['div.shape.fill-translucent']);
      await exec(page, 'shape.weight.8');
      await frames(page);
      await byteExact(page, [['<div class="shape fill-translucent"', '<div class="shape fill-translucent weight-8"']]);
      assert.equal(await border(), '8px');
      assert.equal((await state(page, 'shape.weight.8')).checked, true);
      await undo(page);
      await byteExact(page);
      // a translucent shape without a weight class is drawn without an outline, which the control reads as None
      assert.equal((await state(page, 'shape.weight.none')).checked, true);
      assert.equal((await state(page, 'shape.weight.3')).checked, false);
      assert.equal((await state(page, 'shape.weight.3')).enabled, false);
      await redo(page);
      assert.equal(await border(), '8px');
      await clickShape(page, '.shape.equals');
      await exec(page, 'shape.weight.6');
      await frames(page);
      assert.equal(await stroke(), '6px');
      const { text } = await saveAndReopen(page, `r21-1-v3-${platform}.html`);
      assert.ok(text.includes('<div class="shape equals fill-translucent weight-6"'));
      assert.deepEqual(errors(page), []);
    });

    test(`V4: a press anywhere on the drawn outline of a shape without a fill, and within 6 px of it, hits the shape at each weight, on ${platform}`, async () => {
      const page = await shapePage(platform, FRAME);
      for (const [id, w] of [['none', 0], ['3', 3], ['6', 6], ['8', 8]]) {
        await clickShape(page);
        await exec(page, `shape.weight.${id}`);
        await press(page, 'Escape');
        await press(page, 'Escape');
        await frames(page);
        assert.equal(await page.evaluate(`getComputedStyle(Reveal.getCurrentSlide().querySelector('.shape')).borderLeftWidth`), `${w}px`);
        const missed = [];
        for (let d = -5; d <= w + 5; d++) {
          const at = await screen(page, 200 + d + 0.5, 500);
          const hit = await page.evaluate(`document.elementFromPoint(${at.x}, ${at.y})?.closest('.shape') === Reveal.getCurrentSlide().querySelector('.shape')`);
          if (!hit) missed.push(d);
        }
        assert.deepEqual(missed, [], `the presses that pass through the outline of ${w} px`);
        const inside = await screen(page, 200 + w + 20, 500);
        assert.equal(await page.evaluate(`document.elementFromPoint(${inside.x}, ${inside.y})?.closest('.shape') ?? null`), null, `a press 20 px inside the outline of ${w} px hits the shape`);
      }
      assert.deepEqual(errors(page), []);
    });
  }
});

// tests of R26.3 on both platforms where the editor is used: the brace kept inside its box at the
// cusp, a double click on a word of a shape that is not selected, the Text pane on a shape whose
// words are a list, the geometry of a shape drawn during the drag that draws it, and Tab and
// Shift+Tab through the objects of a slide
describe('braces, double clicks, and lists in shapes', () => {
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

  test('a brace of an empty box, e.g. of a shape taken off the slide, is drawn without a number that is not one', () => {
    for (const [w, h, s] of [[0, 0, 0], [0, 0, 3], [3, 3, 3]]) assert.ok(!shapePath('brace', w, h, s).includes('NaN'), `${w} by ${h} with ${s}: ${shapePath('brace', w, h, s)}`);
  });

  test('the ink of a brace stays inside its box at the cusp, at each weight and with a flip, with its miter join kept', async (t) => {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(deckUrl('test/pages/shapes.html', 'still'));
    await page.waitFor(deckSettled);
    // the stroke of each brace drawn by the theme is probed past the right and the left edge of its
    // box around the cusp, i.e. with the joins and the miter limit of the browser
    const out = await page.evaluate(`(() => {
    const slide = Reveal.getCurrentSlide();
    const cases = [[160, 240, ''], [160, 240, 'weight-6'], [160, 240, 'weight-8'], [40, 80, 'weight-8'], [80, 400, ''], [80, 400, 'weight-8'], [60, 200, ''], [160, 240, 'weight-8 flip-x']];
    return cases.map(([bw, bh, cls]) => {
      const el = Object.assign(document.createElement('div'), { className: 'shape brace ' + cls });
      el.style.cssText = 'width: ' + bw + 'px; height: ' + bh + 'px';
      slide.append(el);
      window.Beeson.mount(el);
      const w = el.offsetWidth, h = el.offsetHeight;
      const path = el.querySelector(':scope > svg path');
      const { strokeLinejoin: join, strokeWidth: width } = getComputedStyle(path);
      const cusp = path.isPointInStroke(new DOMPoint(w - 0.5, h / 2));
      let right = 0, left = 0;
      for (let y = h / 2 - 20; y <= h / 2 + 20; y += 0.25) {
        for (let d = 0.25; d <= 20; d += 0.25) {
          if (path.isPointInStroke(new DOMPoint(w + d, y))) right = Math.max(right, d);
          if (path.isPointInStroke(new DOMPoint(-d, y))) left = Math.max(left, d);
        }
      }
      el.remove();
      return { size: w + ' by ' + h + ' ' + cls, right, left, join, width, cusp };
    });
  })()`);
    for (const c of out) {
      assert.equal(c.join, 'miter', c.size);
      assert.equal(c.width, c.size.includes('weight-8') ? '8px' : c.size.includes('weight-6') ? '6px' : '3px', c.size);
      assert.deepEqual([c.right, c.left], [0, 0], `${c.size}: the ink reaches ${c.right} px past the right edge and ${c.left} px past the left`);
      // the tip of the cusp still reaches the right edge of the box
      assert.ok(c.cusp, `${c.size}: the cusp does not reach the edge`);
    }
    assert.deepEqual(errors(page), [], js(errors(page)));
  });

  const PAGE = 'test/pages/editor-r26-3.html';
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg ? `, ${js(arg)}` : ''})).then(() => true)`);
  // the selected objects by their words, a line as line
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName === 'svg' ? 'line' : el.textContent.trim()).sort()`);

  // the editor on slide n of the test deck, served over HTTP, with the storage of the origin emptied
  async function load(t, platform, n) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    const url = `${server.origin}/${PAGE}?edit&still&edit-platform=${platform}`;
    await page.goto(url);
    await page.evaluate('localStorage.clear()');
    await page.goto(url);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(PAGE, 'utf8');
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the center of the word in the shown element of selector whose text holds it, in CSS px
  const wordAt = (page, selector, word) => page.evaluate(`(() => {
  const el = [...document.querySelectorAll(${js(selector)})].find((e) => e.getBoundingClientRect().width && e.textContent.includes(${js(word)}));
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.data.indexOf(${js(word)});
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + ${word.length});
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }
  return null;
})()`);
  const words = (page) => page.evaluate('getSelection().toString()');

  for (const platform of PLATFORMS) {
    test(`a double click on a word of a shape that is not selected selects the word (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      assert.deepEqual(await selected(page), []);
      await click(page, await wordAt(page, '.reveal section.present .shape p', 'the'), { count: 2 });
      await frames(page);
      assert.equal(await words(page), 'the', 'the double click does not select the word');
      assert.equal(await render(page), page.source);
      // a triple click selects the words of the paragraph
      await click(page, await wordAt(page, '.reveal section.present .shape p', 'bridge'), { count: 3 });
      await frames(page);
      assert.equal((await words(page)).trim(), 'Build the bridge');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`a drag over the words of a selected locked shape selects them and does not move the shape (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      const from = await wordAt(page, '.reveal section.present .shape[data-locked] p', 'Locked');
      await clickText(page, from);
      await frames(page);
      assert.deepEqual(await selected(page), ['Locked words here']);
      await drag(page, { x: from.x - 30, y: from.y }, { dx: 160 });
      await frames(page);
      assert.ok((await words(page)).length > 3, `the drag selects ${js(await words(page))}`);
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`the Text pane formats the words of a selected shape whose words are a list (${platform})`, async (t) => {
      const page = await load(t, platform, 1);
      await clickText(page, await wordAt(page, '.reveal section.present .shape li', 'Goal'));
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection()[0].matches("div.shape")'), true, 'the shape is not selected');
      for (const id of ['text.smaller', 'text.tone.accent', 'text.bold']) assert.equal((await state(page, id)).enabled, true, `${id} is disabled: ${js(await state(page, id))}`);
      await exec(page, 'text.bold');
      const after = await render(page);
      assert.notEqual(after, page.source, 'Bold does not change the words of the shape');
      assert.equal(after, page.source.replace('<li>Goal</li>', '<li><strong>Goal</strong></li>').replace('<li>Path</li>', '<li><strong>Path</strong></li>'));
      await undo(page);
      assert.equal(await render(page), page.source);
      await redo(page);
      assert.equal(await render(page), after);
      await saveAndReopen(page);
      assert.deepEqual(errors(page), []);
    });

    test(`the Text pane formats a nested list item of a selected shape, after Tab in its words (${platform})`, async (t) => {
      const page = await load(t, platform, 1);
      const at = await wordAt(page, '.reveal section.present .shape li', 'Path');
      await clickText(page, at);
      await frames(page);
      await clickText(page, at);
      await frames(page);
      await press(page, 'Tab');
      await frames(page);
      await press(page, 'Escape');
      await frames(page);
      const indented = await render(page);
      assert.match(indented, /<li>Goal\s*<ul>\s*<li>Path<\/li>\s*<\/ul>\s*<\/li>/, 'Tab does not indent Path');
      assert.equal(await page.evaluate('window.BeesonEditor.selection()[0].matches("div.shape")'), true, 'the shape is not selected');
      // a nested item is part of the block of its item, hence Smaller sets Small on Goal, whose look
      // Path takes
      const look = (word) => page.evaluate(`(() => { const li = [...document.querySelectorAll('.reveal section.present .shape li')].find((e) => e.firstChild.data.trim() === ${js(word)}); const s = getComputedStyle(li); return s.fontSize + ' ' + s.color; })()`);
      const formats = { 'text.smaller': [/<li class="small">Goal/, '<li>Path</li>'], 'text.bold': [/<li><strong>Goal\s*<\/strong>/, '<li><strong>Path</strong></li>'] };
      for (const [id, [outer, inner]] of Object.entries(formats)) {
        await exec(page, id);
        const after = await render(page);
        const shape = after.slice(after.indexOf('<h2>List</h2>'), after.indexOf('<h2>Objects</h2>'));
        assert.match(after, outer, `${id} does not format Goal`);
        assert.ok(shape.includes(inner), `${id} does not format the nested Path: ${js(shape)}`);
        if (id === 'text.smaller') assert.equal(await look('Path'), await look('Goal'), 'Path does not take the look of Small');
        await undo(page);
        assert.equal(await render(page), indented);
        await redo(page);
        assert.equal(await render(page), after);
        await undo(page);
      }
      // a nested item starts a sentence of its own, as a block does
      await exec(page, 'text.case.sentence');
      assert.equal(await render(page), indented, 'Sentence case changes the nested Path');
      await exec(page, 'text.bold');
      await saveAndReopen(page);
      assert.deepEqual(errors(page), []);
    });

    test(`after Dashes on a selected shape, its words are formatted by the Text pane (${platform})`, async (t) => {
      const page = await load(t, platform, 0);
      await clickText(page, await wordAt(page, '.reveal section.present .shape:not([data-locked]) p', 'Build'));
      await frames(page);
      await exec(page, 'text.list.ul');
      await frames(page);
      assert.match(await render(page), /<ul>\s*<li>Build the bridge<\/li>\s*<\/ul>/);
      assert.equal(await page.evaluate('window.BeesonEditor.selection()[0].matches("div.shape")'), true, 'the shape is not selected');
      for (const id of ['text.smaller', 'text.tone.accent', 'text.bold']) assert.equal((await state(page, id)).enabled, true, `${id} is disabled: ${js(await state(page, id))}`);
      const before = await render(page);
      await exec(page, 'text.bold');
      const after = await render(page);
      assert.notEqual(after, before, 'Bold does not change the words of the shape');
      assert.equal(after, before.replace('<li>Build the bridge</li>', '<li><strong>Build the bridge</strong></li>'));
      await undo(page);
      assert.equal(await render(page), before);
      await redo(page);
      assert.equal(await render(page), after);
      await saveAndReopen(page);
      assert.deepEqual(errors(page), []);
    });
  }

  const KINDS = ['rounded', 'rectangle', 'ellipse', 'triangle', 'arrow', 'arrow-both', 'brace', 'plus', 'equals'];
  const mouse = (page, type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

  for (const platform of PLATFORMS) {
    test(`a shape is drawn with its geometry from the first move of the drag that draws it, with the readout (${platform})`, async (t) => {
      const page = await load(t, platform, 3);
      const box = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().getBoundingClientRect(); return { x: r.left, y: r.top, scale: r.width / 1920 }; })()`);
      let n = 0;
      for (const kind of KINDS) {
        await exec(page, `insert.shape.${kind}`);
        const from = { x: box.x + (200 + 150 * n) * box.scale, y: box.y + 300 * box.scale };
        await mouse(page, 'mouseMoved', from.x, from.y);
        await mouse(page, 'mousePressed', from.x, from.y);
        // the first move past the click distance, then the drag to 120 by 300 slide px
        for (const [dx, dy] of [[10, 8], [60, 150], [120, 300]]) {
          await mouse(page, 'mouseMoved', from.x + dx * box.scale, from.y + dy * box.scale);
          await frames(page);
          const shown = await page.evaluate(`(() => {
          const g = document.querySelector('.beeson-overlay .beeson-shape-ghost');
          const r = g && !g.hasAttribute('hidden') ? g.getBoundingClientRect() : null;
          const path = g?.querySelector('path');
          const ps = path ? getComputedStyle(path) : null;
          const out = document.querySelector('.beeson-overlay .beeson-offset');
          const m = document.querySelector('.beeson-overlay .beeson-marquee');
          return { r: r && { left: r.left, top: r.top, width: r.width, height: r.height }, kind: g?.dataset.kind, view: g?.getAttribute('viewBox'), d: path?.getAttribute('d'), stroke: ps?.stroke, fill: ps?.fill,
            readout: out && !out.hidden ? out.textContent : null, marquee: !!m && !m.hidden && m.getBoundingClientRect().width > 0 };
        })()`);
          const at = `${kind} at ${dx} by ${dy}`;
          assert.ok(shown.r, `${at}: the geometry is not drawn during the drag`);
          assert.equal(shown.kind, kind, at);
          assert.ok(Math.abs(shown.r.left - from.x) < 1.5 && Math.abs(shown.r.top - from.y) < 1.5, `${at}: ${js(shown.r)}`);
          assert.ok(Math.abs(shown.r.width - dx * box.scale) < 1.5 && Math.abs(shown.r.height - dy * box.scale) < 1.5, `${at}: ${js(shown.r)}`);
          assert.equal(shown.readout, `w: ${dx} px  h: ${dy} px`, at);
          assert.equal(shown.marquee, false, `${at}: a plain rectangle is drawn over the shape`);
          assert.notEqual(shown.stroke, 'none', at);
          // the path of a drawn geometry is the path of the theme, in slide px
          const [, , w, h] = shown.view.split(' ').map(Number);
          assert.ok(Math.abs(w - dx) < 0.6 && Math.abs(h - dy) < 0.6, `${at}: ${shown.view}`);
          if (['triangle', 'arrow', 'arrow-both', 'brace', 'plus', 'equals'].includes(kind)) assert.equal(shown.d, shapePath(kind, w, h, 3), at);
          else assert.equal((shown.d.match(/A/g) ?? []).length, { rectangle: 0, rounded: 4, ellipse: 2 }[kind], `${at}: ${shown.d}`);
          if (kind === 'brace') assert.equal(shown.fill, 'none', at);
        }
        await mouse(page, 'mouseReleased', from.x + 120 * box.scale, from.y + 300 * box.scale);
        await frames(page);
        assert.equal(await page.evaluate(`(() => { const g = document.querySelector('.beeson-overlay .beeson-shape-ghost'); return !!g && !g.hasAttribute('hidden') && g.getBoundingClientRect().width > 0; })()`), false, `${kind}: the geometry is left after the release`);
        const made = await page.evaluate(`(() => { const el = window.BeesonEditor.selection()[0]; return [el.matches('.shape'), el.classList.contains(${js(kind)}), el.style.width, el.style.height]; })()`);
        assert.deepEqual(made, [true, kind !== 'rectangle', '120px', '300px'], kind);
        n++;
      }
      // Esc during the drag takes the geometry off and draws nothing
      const before = await render(page);
      await exec(page, 'insert.shape.triangle');
      const from = { x: box.x + 300 * box.scale, y: box.y + 700 * box.scale };
      await mouse(page, 'mouseMoved', from.x, from.y);
      await mouse(page, 'mousePressed', from.x, from.y);
      await mouse(page, 'mouseMoved', from.x + 100, from.y + 100);
      await frames(page);
      await press(page, 'Escape');
      await mouse(page, 'mouseReleased', from.x + 100, from.y + 100);
      await frames(page);
      assert.equal(await page.evaluate(`(() => { const g = document.querySelector('.beeson-overlay .beeson-shape-ghost'); return !!g && !g.hasAttribute('hidden') && g.getBoundingClientRect().width > 0; })()`), false);
      assert.equal(await render(page), before);
      assert.deepEqual(errors(page), []);
    });
  }

  // the rows of the sheet of keyboard shortcuts by its group and label, opened from the Help menu
  async function sheetRows(page) {
    await exec(page, 'help.keys');
    await frames(page);
    const rows = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('dialog.beeson-edit-keys section')].flatMap((s) => [...s.querySelectorAll('.row')].map((r) => [s.querySelector('h3').textContent + ' > ' + r.firstChild.textContent, r.lastChild.textContent])))`);
    await press(page, 'Escape');
    await frames(page);
    return rows;
  }

  // the objects of the slide of objects in the order of the Object List, from back to front, i.e.
  // from its last row up, in which Tab walks them as in Keynote and PowerPoint
  const ORDER = [['Objects'], ['A paragraph.'], ['Back'], ['Locked'], ['One', 'Two'], ['line']];

  for (const platform of PLATFORMS) {
    test(`Tab and Shift+Tab select the next and the previous object in the order of the Object List, from back to front, around both ends (${platform})`, async (t) => {
      const page = await load(t, platform, 2);
      await exec(page, 'view.objects');
      await frames(page);
      const rows = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-objects .row')].map((r) => r.textContent.trim())`);
      assert.deepEqual(rows.filter((r) => !/: (One|Two)$/.test(r)), ['Line', 'Group', 'Ellipse: Locked', 'Rectangle: Back', 'Text: A paragraph.', 'Text: Objects']);
      await clickText(page, await wordAt(page, '.reveal section.present .shape p', 'Back'));
      await frames(page);
      assert.deepEqual(await selected(page), ['Back']);
      const at = ORDER.findIndex((o) => o[0] === 'Back');
      for (let k = 1; k <= ORDER.length; k++) {
        await press(page, 'Tab');
        await frames(page);
        assert.deepEqual(await selected(page), ORDER[(at + k) % ORDER.length], `Tab ${k}`);
      }
      for (let k = 1; k <= ORDER.length + 1; k++) {
        await press(page, 'Shift+Tab');
        await frames(page);
        assert.deepEqual(await selected(page), ORDER[(at - k + 2 * ORDER.length) % ORDER.length], `Shift+Tab ${k}`);
      }
      // the locked shape is selected as a click selects it, and it is not moved by a key
      while (!(await selected(page)).includes('Locked')) await press(page, 'Tab');
      await press(page, 'ArrowRight');
      await frames(page);
      assert.equal(await render(page), page.source);
      const sheet = await sheetRows(page);
      const keys = platform === 'mac' ? ['⇥', '⇧⇥'] : ['Tab', 'Shift+Tab'];
      const listed = js(Object.entries(sheet).filter(([, k]) => k.includes('⇥') || k.includes('Tab')));
      assert.equal(sheet['Other > Select Next Object'], keys[0], listed);
      assert.equal(sheet['Other > Select Previous Object'], keys[1], listed);
      assert.deepEqual(errors(page), []);
    });

    test(`Tab keeps its meaning in a list item, in a table cell, and in a field of a pane (${platform})`, async (t) => {
      const page = await load(t, platform, 4);
      // in a list item it indents the item
      await clickText(page, await wordAt(page, '.reveal section.present li', 'Second'));
      await frames(page);
      await press(page, 'Tab');
      await frames(page);
      assert.notEqual(await render(page), page.source, 'Tab does not indent the list item');
      assert.equal(await page.evaluate('!!document.activeElement.closest("li") && document.activeElement.isContentEditable'), true);
      await undo(page);
      assert.equal(await render(page), page.source);
      // in a table cell it moves to the next cell
      await clickText(page, await wordAt(page, '.reveal section.present td', 'A1'));
      await frames(page);
      await press(page, 'Tab');
      await frames(page);
      assert.equal(await page.evaluate('(getSelection().anchorNode?.parentElement?.closest("td") ?? getSelection().anchorNode)?.textContent'), 'B1');
      // in a field of a pane it moves the focus and keeps the selection
      await press(page, 'Escape');
      await clickText(page, await wordAt(page, '.reveal section.present h2', 'Text'));
      await press(page, 'Escape');
      await frames(page);
      const before = await selected(page);
      assert.deepEqual(before, ['Text']);
      if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
      await frames(page);
      await page.evaluate(`[...document.querySelectorAll('.beeson-edit-inspector input, .beeson-edit-inspector button')].find((i) => i.getBoundingClientRect().width && !i.disabled).focus()`);
      const field = await page.evaluate('document.activeElement.outerHTML.slice(0, 80)');
      await press(page, 'Tab');
      await frames(page);
      assert.deepEqual(await selected(page), before, 'Tab in a field changes the selection');
      assert.notEqual(await page.evaluate('document.activeElement.outerHTML.slice(0, 80)'), field, 'Tab does not move the focus');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });
  }
});

// issue #184: a text color chosen while a shape is selected as a box is written as the tone of the
// shape, as with Shape Color, and the words of the shape are drawn in the color they had. with
// words of the shape selected, the color is written on the words and the tone of the shape is
// kept. with a shape and a paragraph selected, the tone is written on the shape as a shape tone
// and on the paragraph as a span. each change is one entry of the history, and the file is
// compared byte for byte after the change, its undo, and its redo
describe('a text color chosen on a selected shape', () => {
  const DECK = 'test/pages/editor-r20-2.html';
  const PANEL = '#beeson-edit-panel-format';
  const GOAL = '<div class="shape rounded tone-accent weight-6" style="width: 400px; height: 160px; translate: 120px 260px"><p>Goal</p></div>';
  const CARD = '<div class="shape rounded" style="width: 500px; height: 300px; translate: 1100px 400px; rotate: 30deg"><p>Card</p></div>';
  const BESIDE = '<p>A paragraph beside a card.</p>';

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

  async function shapePage(n) {
    const page = await browser.newPage();
    await page.goto(`${server.origin}/${DECK}?edit&still&edit-platform=other`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = readFileSync(DECK, 'utf8');
    const status = await page.evaluate(`window.BeesonEditor.open(${JSON.stringify(page.source)})`);
    assert.deepEqual(status.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    if (!(await state(page, 'shell.format')).checked) await exec(page, 'shell.format');
    await frames(page);
    return page;
  }

  const exec = (page, id, arg) => page.evaluate(`window.BeesonEditor.exec(${JSON.stringify(id)}${arg ? `, ${JSON.stringify(arg)}` : ''})`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${JSON.stringify(id)})`);
  const frames = (page) => page.evaluate('new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(true))))');
  const screen = (page, x, y) => page.evaluate(`(() => {
  const s = document.querySelector('.reveal .slides');
  const r = s.getBoundingClientRect(), k = r.width / s.offsetWidth;
  return { x: r.left + ${x} * k, y: r.top + ${y} * k };
})()`);
  const tab = (page, name) => page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === ${JSON.stringify(name)})?.click()`);
  const swatch = (page, id) => page.evaluate(`document.querySelector('${PANEL} [data-command="${id}"]')?.getAttribute('aria-pressed') ?? null`);
  // the computed color of the words of each shape of the current slide
  const colors = (page) => page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('.shape p')].map((p) => getComputedStyle(p.querySelector('span') ?? p).color)`);
  const shapeColor = (page) => page.evaluate(`getComputedStyle(Reveal.getCurrentSlide().querySelector('.shape')).color`);

  // the file after the edit, after its undo, and after its redo, each compared byte for byte with
  // the deck changed by edits, and by earlier before the edit
  async function oneEntry(page, edits, earlier = []) {
    await byteExact(page, edits);
    await page.evaluate('window.BeesonEditor.undo()');
    await frames(page);
    await byteExact(page, earlier);
    await page.evaluate('window.BeesonEditor.redo()');
    await frames(page);
    await byteExact(page, edits);
  }

  test('a text color chosen with a shape selected as a box colors the shape and not its words', async () => {
    const page = await shapePage(1);
    await click(page, await screen(page, 140, 280));
    assert.equal(await page.evaluate(`window.BeesonEditor.selection().map((el) => [...el.classList].filter((c) => !c.startsWith('beeson-')).join(' ')).join()`), 'shape rounded tone-accent weight-6');
    const words = await colors(page);
    // Format > Text Color runs the same commands as the swatches of the Text pane
    await exec(page, 'text.tone.blue');
    await frames(page);
    // the tone class is written last, as Shape Color writes it
    const blue = [[GOAL, GOAL.replace('tone-accent weight-6', 'weight-6 tone-blue')]];
    await oneEntry(page, blue);
    assert.deepEqual(await colors(page), words);
    assert.equal((await state(page, 'text.tone.blue')).checked, true);
    assert.equal((await state(page, 'shape.tone.blue')).checked, true);
    await tab(page, 'Text');
    await frames(page);
    assert.equal(await swatch(page, 'text.tone.blue'), 'true');
    assert.equal(await swatch(page, 'text.tone.accent'), 'false');
    await click(page, `${PANEL} [data-command="text.tone.text"]`);
    await frames(page);
    await oneEntry(page, [[GOAL, GOAL.replace(' tone-accent', '')]], blue);
    assert.deepEqual(await colors(page), words);
    assert.equal(await swatch(page, 'text.tone.text'), 'true');
    // the shape tones do not have a Subtle
    assert.equal((await state(page, 'text.tone.subtle')).enabled, false);
    await page.close();
  });

  test('a text color chosen with words of a shape selected colors the words and not the shape', async () => {
    const page = await shapePage(1);
    await click(page, await screen(page, 140, 280));
    const tone = await shapeColor(page);
    await click(page, await screen(page, 320, 340), { count: 2 });
    await frames(page);
    assert.equal(await page.evaluate('getSelection().toString().trim()'), 'Goal');
    await exec(page, 'text.tone.red');
    await frames(page);
    await oneEntry(page, [[GOAL, GOAL.replace('<p>Goal</p>', '<p><span class="tone-red">Goal</span></p>')]]);
    assert.equal(await shapeColor(page), tone);
    await page.close();
  });

  test('a text color chosen with a shape and a paragraph selected colors the shape as a shape and the paragraph as words', async () => {
    const page = await shapePage(3);
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p);
    await click(page, await screen(page, 1180, 470), { modifiers: 'Shift' });
    assert.equal(await page.evaluate(`window.BeesonEditor.selection().map((el) => el.localName).sort().join()`), 'div,p');
    const card = (await colors(page))[0];
    await exec(page, 'text.tone.violet');
    await frames(page);
    await oneEntry(page, [
      [BESIDE, '<p><span class="tone-violet">A paragraph beside a card.</span></p>'],
      [CARD, CARD.replace('shape rounded', 'shape rounded tone-violet')],
    ]);
    assert.equal((await colors(page))[0], card);
    assert.equal((await state(page, 'text.tone.violet')).checked, true);
    await page.close();
  });
});

// regression tests of R23.2 on both platforms, for the findings of three slides built by hand: a
// copy of a group does not move the elements beside it, the arrowheads of copied lines keep ids of
// their own, a drag on the words of a selected shape moves or copies it, a new slide may hold its
// title only, the formula key writes into the empty words of a shape, and the empty placeholders of
// a new content slide take the same room in the show as in the editor. after each edit an undo
// gives the file back byte for byte
describe('copies of groups and lines, drags on shapes', () => {
  const PLATFORMS = ['mac', 'other'];
  const DECK = 'test/pages/editor-r23-2.html';
  const SOURCE = readFileSync(DECK, 'utf8');
  const SLIDE = '.reveal .slides > section.present';
  const [CARDS, ARROWS, WORDS, HOLLOW, PROMPTS] = [0, 1, 2, 3, 4];

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
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}, ${js(arg ?? null)} ?? undefined)).then(() => true)`);
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const undoLabel = async (page) => (await state(page, 'edit.undo')).label;
  const copyKey = (platform) => (platform === 'mac' ? 'Alt' : 'Ctrl');

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

  // the screen box in px of each element in window.kept
  const keptBoxes = (page) => page.evaluate(`window.kept.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })`);

  // H3. the card is a group of a shape, a display, and a label, the last two placed with translate
  // from their places in the flow. a copy of the group by each route leaves the three where they are
  for (const platform of PLATFORMS) {
    for (const route of ['a drag with the copy key', 'Edit > Duplicate', 'Copy and Paste']) {
      test(`H3: ${route} of a group does not move the elements of the slide (${platform})`, async (t) => {
        const page = await load(t, platform, CARDS);
        await page.evaluate(`window.kept = [...document.querySelector(${js(SLIDE)}).querySelectorAll(':scope > .shape, :scope > .math, :scope > p')]`);
        const was = await keptBoxes(page);
        assert.equal(was.length, 3);
        const at = await page.evaluate(`(() => { const r = document.querySelector(${js(`${SLIDE} > .shape`)}).getBoundingClientRect(); return { x: r.left + 24, y: r.bottom - 24 }; })()`);
        await click(page, at);
        await frames(page);
        assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 3, 'the group is not selected');
        if (route === 'Edit > Duplicate') await exec(page, 'edit.duplicate');
        else if (route === 'Copy and Paste') {
          await exec(page, 'edit.copy');
          await exec(page, 'edit.paste');
        } else await drag(page, at, { dx: 700, dy: 0, modifiers: copyKey(platform) });
        await sleep(300);
        assert.equal(await page.evaluate(`document.querySelectorAll(${js(`${SLIDE} > :is(.shape, .math, p)`)}).length`), 6, 'the group is not copied');
        assert.deepEqual(await keptBoxes(page), was, 'an element of the slide is moved by the copy');
        assert.equal(await undoLabel(page), route === 'Copy and Paste' ? 'Undo Paste' : 'Undo Duplicate');
        await undo(page);
        assert.equal(await render(page), SOURCE, 'one undo does not give the file back');
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the ids of the markers of the deck, and for each line whether its arrowhead names the marker of
  // its own svg, with the fill of the head and the stroke of the line
  const heads = `(() => {
  const ids = [...document.querySelectorAll('.reveal .slides marker')].map((m) => m.id);
  const lines = [...document.querySelectorAll('.reveal .slides svg.line')].map((svg) => {
    const line = svg.querySelector('line');
    const id = /url\\(#([^)]+)\\)/.exec(line.getAttribute('marker-end'))[1];
    const marker = document.getElementById(id);
    return { own: marker?.closest('svg') === svg, fill: getComputedStyle(marker.querySelector('path')).fill, stroke: getComputedStyle(line).stroke };
  });
  return { ids, lines };
})()`;

  const unique = (ids) => new Set(ids).size === ids.length;

  // H5. the slide of arrows has an orange and a blue arrow, line-1 and line-2. each copy of the slide
  // gives every marker of the deck an id of its own, and each arrowhead the tone of its line
  for (const platform of PLATFORMS) {
    for (const route of ['Duplicate Slide', 'Magic Move to Copy of Slide', 'Copy and Paste of the slide']) {
      test(`H5: ${route} gives each marker an id of its own and each arrowhead the tone of its line (${platform})`, async (t) => {
        const page = await load(t, platform, ARROWS);
        if (route === 'Duplicate Slide') await exec(page, 'slide.duplicate');
        else if (route === 'Magic Move to Copy of Slide') await exec(page, 'slide.magicMove');
        else {
          await exec(page, 'slide.copy');
          await exec(page, 'slide.paste');
        }
        await sleep(300);
        const { ids, lines } = await page.evaluate(heads);
        assert.equal(lines.length, 4, 'the slide is not copied');
        assert.ok(unique(ids), `a marker id is given twice: ${ids}`);
        const file = [...(await render(page)).matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
        assert.ok(file.length === 4 && unique(file), `a marker id is written twice: ${file}`);
        for (const l of lines) {
          assert.ok(l.own, 'an arrowhead names the marker of another line');
          assert.equal(l.fill, l.stroke, 'an arrowhead is not drawn in the tone of its line');
        }
        await undo(page);
        assert.equal(await render(page), SOURCE, 'one undo does not give the file back');
        // the two arrows copied and pasted together onto the same slide
        const lined = await load(t, platform, ARROWS);
        await exec(lined, 'selection.all');
        await exec(lined, 'edit.copy');
        await exec(lined, 'edit.paste');
        await sleep(200);
        const pasted = await lined.evaluate(heads);
        assert.ok(pasted.lines.length === 4 && unique(pasted.ids) && pasted.lines.every((l) => l.own && l.fill === l.stroke), `the pasted lines share a marker: ${js(pasted)}`);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the screen point at the boundary after the character i of the words of the shape of the slide
  const wordPoint = (page, i) => page.evaluate(`(() => {
  const n = document.querySelector(${js(`${SLIDE} .shape p`)}).firstChild;
  const r = document.createRange();
  r.setStart(n, ${i});
  r.setEnd(n, ${i});
  const b = r.getBoundingClientRect();
  return { x: b.left, y: b.top + b.height / 2 };
})()`);

  const shapes = (page) => page.evaluate(`[...document.querySelectorAll(${js(`${SLIDE} > .shape`)})].map((s) => s.style.translate)`);
  const editing = (page) => page.evaluate(`!!document.activeElement?.closest(${js(`${SLIDE} .shape p`)})`);

  // H2. the shape of the slide of words holds the word Build. once the shape is selected, a press on
  // its words is a press on the shape until its words are edited
  for (const platform of PLATFORMS) {
    test(`H2: a drag on the words of a selected shape moves it or copies it, and a click puts the caret there (${platform})`, async (t) => {
      const page = await load(t, platform, WORDS);
      const k = await page.evaluate(`(() => { const s = document.querySelector('.reveal .slides'); return s.getBoundingClientRect().width / s.offsetWidth; })()`);
      const word = await wordPoint(page, 2);
      await click(page, word);
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 1, 'the shape is not selected');
      assert.equal(await editing(page), false);
      // a plain drag moves the shape
      await drag(page, word, { dx: 200 * k, dy: 100 * k });
      await sleep(200);
      assert.deepEqual(await shapes(page), ['800px 500px'], 'a drag on the words of the selected shape does not move it');
      assert.equal(await undoLabel(page), 'Undo Move');
      assert.equal(await editing(page), false);
      // a drag with the copy key copies the shape that is still selected
      const moved = await wordPoint(page, 2);
      await drag(page, moved, { dx: -200 * k, dy: 200 * k, modifiers: copyKey(platform) });
      await sleep(300);
      assert.deepEqual(await shapes(page), ['800px 500px', '600px 700px'], 'a drag with the copy key on the words of the selected shape does not copy it');
      assert.equal(await undoLabel(page), 'Undo Duplicate');
      await undo(page);
      await undo(page);
      assert.equal(await render(page), SOURCE, 'two undos do not give the file back');
      // a click without a move puts the caret into the words at the point of the click
      await click(page, await page.evaluate(`(() => { const r = document.querySelector(${js(SLIDE)}).getBoundingClientRect(); return { x: r.left + 40, y: r.bottom - 40 }; })()`));
      await frames(page);
      await click(page, word);
      await frames(page);
      assert.equal(await page.evaluate('window.BeesonEditor.selection().length'), 1);
      await click(page, word);
      await frames(page);
      assert.equal(await editing(page), true, 'a click on the words of the selected shape does not put the caret there');
      const caret = await page.evaluate(`(() => { const s = getSelection(); return [s.isCollapsed, s.anchorNode.textContent, s.anchorOffset]; })()`);
      assert.deepEqual(caret, [true, 'Build', 2]);
      // a drag inside the words that are edited selects text, and the shape stays
      const from = await wordPoint(page, 0), to = await wordPoint(page, 5);
      await drag(page, { x: from.x + 2, y: from.y }, { dx: to.x - from.x - 2 });
      await frames(page);
      assert.equal(await page.evaluate('getSelection().toString()'), 'Build', 'a drag in the edited words does not select them');
      assert.deepEqual(await shapes(page), ['600px 400px']);
      assert.equal(await render(page), SOURCE);
      assert.deepEqual(errors(page), []);
    });
  }

  // the slide of Title Only after the slide of words, as the file holds it
  const TITLE_ONLY = SOURCE.replace('<section>\n  <h2>Hollow</h2>', '<section>\n  <h2></h2>\n</section>\n\n<section>\n  <h2>Hollow</h2>');

  // a new slide of the layout Title Only is a content slide with its h2 and nothing else, added from
  // Insert > New Slide and from the tile of the Add Slide button. Change Layout reads it as Content
  for (const platform of PLATFORMS) {
    for (const route of ['Insert > New Slide', 'the Add Slide button']) {
      test(`Title Only from ${route} writes a content slide with its title only (${platform})`, async (t) => {
        const page = await load(t, platform, WORDS);
        if (route === 'Insert > New Slide') {
          assert.equal((await state(page, 'slide.new.titleOnly')).label, 'Title Only');
          await exec(page, 'slide.new.titleOnly');
        } else {
          await click(page, '.beeson-edit-top [data-command="slide.gallery"]');
          await page.waitFor(`!!document.querySelector('.beeson-edit-gallery .tile')`);
          // each tile with its name and the blocks of its small picture
          const tiles = await page.evaluate(`[...document.querySelectorAll('.beeson-edit-gallery .tile')].map((t) => [t.dataset.layout, t.textContent, [...(t.querySelector('.pic').shadowRoot?.querySelector('section')?.children ?? [])].map((c) => c.localName + ':' + c.textContent)])`);
          assert.deepEqual(tiles.find((x) => x[0] === 'titleOnly'), ['titleOnly', 'Title Only', ['h2:Title of the slide']], `the gallery does not have the tile Title Only with its picture: ${js(tiles)}`);
          assert.equal(tiles.length, 9);
          await click(page, `.beeson-edit-gallery .tile[data-layout="titleOnly"]`);
        }
        await sleep(300);
        assert.equal(await render(page), TITLE_ONLY);
        assert.equal(await page.evaluate('Reveal.getIndices().h'), WORDS + 1);
        assert.equal((await state(page, 'slide.layout.content')).checked, true, 'Change Layout does not read the slide as Content');
        assert.equal(await undoLabel(page), 'Undo Title Only');
        await undo(page);
        assert.equal(await render(page), SOURCE, 'one undo does not give the file back');
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the key of an inline formula: Cmd+Option+E on a Mac, and Alt+= elsewhere, sent as the browser
  // sends it
  async function formulaKey(page, platform) {
    if (platform === 'mac') return press(page, 'Mod+Alt+E');
    const base = { key: '=', code: 'Equal', windowsVirtualKeyCode: 187, modifiers: 1 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: '=', unmodifiedText: '=' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  const HOLLOW_SHAPE = '<div class="shape rounded" style="width: 400px; height: 240px; translate: 600px 400px"></div>';

  // H1. the shape of the slide Hollow is empty. Return puts the caret into its empty words, and the
  // formula key or Insert > Inline Formula there writes the formula as the words of the shape
  for (const platform of PLATFORMS) {
    for (const route of ['key', 'menu']) {
      test(`H1: the formula ${route === 'key' ? 'key' : 'of Insert > Inline Formula'} in the empty words of a shape writes the formula into the shape (${platform})`, async (t) => {
        const page = await load(t, platform, HOLLOW);
        await click(page, `${SLIDE} > .shape`);
        await frames(page);
        await press(page, 'Enter');
        await frames(page);
        assert.equal(await page.evaluate(`!!document.activeElement?.matches(${js(`${SLIDE} > .shape > p`)})`), true, 'the caret is not in the words of the shape');
        if (route === 'key') await formulaKey(page, platform);
        else await exec(page, 'math.inline');
        await page.waitFor(`!!document.querySelector('.beeson-math textarea')`);
        await type(page, 'z^2');
        await sleep(300);
        await press(page, 'Mod+Enter');
        await sleep(500);
        const expected = SOURCE.replace(HOLLOW_SHAPE, HOLLOW_SHAPE.replace('></div>', '><p>\\(z^2\\)</p></div>'));
        assert.equal(await render(page), expected, 'the formula is not written into the shape');
        assert.equal(await page.evaluate(`document.querySelectorAll(${js(`${SLIDE} > .shape p mjx-container`)}).length`), 1, 'the formula is not typeset');
        await undo(page);
        assert.equal(await render(page), SOURCE, 'one undo does not give the file back');
        await page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
        assert.equal(await render(page), expected, 'the redo does not give the formula back');
        const saved = await saveAndReopen(page, `r23-2-h1-${route}-${platform}.html`);
        assert.equal(saved.text, expected);
        assert.deepEqual(errors(page), []);
      });
    }
  }

  // the box in slide px of the text box under the empty placeholders of the slide Prompts, and the
  // heights of the two placeholders
  const underBox = (page) => page.evaluate(`(() => {
  const s = document.querySelector(${js(SLIDE)});
  const k = s.getBoundingClientRect().width / s.offsetWidth;
  const of = (el) => { const r = el.getBoundingClientRect(), o = s.getBoundingClientRect(); return [(r.left - o.left) / k, (r.top - o.top) / k, r.height / k].map((v) => Math.round(v)); };
  return { under: of(s.querySelector('p[style]')), p: of(s.querySelector(':scope > p:not([style])'))[2], li: of(s.querySelector('li'))[2] };
})()`);

  // the empty paragraph and the empty item of a new content slide take the height of a line in the
  // editor, where their prompts are drawn, and in the show, hence a text box under them placed with
  // translate is drawn at the same place in both
  for (const platform of PLATFORMS) {
    test(`the empty placeholders of a content slide take the same room in the show as in the editor (${platform})`, async (t) => {
      const editor = await load(t, platform, PROMPTS);
      const edited = await underBox(editor);
      const page = await browser.newPage({ width: 1600, height: 900 });
      t.after(() => page.close().catch(() => {}));
      await page.goto(`${server.origin}/${DECK}#/${PROMPTS}`);
      await page.waitFor(deckSettled);
      await sleep(200);
      const shown = await underBox(page);
      assert.ok(edited.p > 0 && edited.li > 0, `a placeholder is drawn without a height in the editor: ${js(edited)}`);
      assert.deepEqual(shown, edited, 'the text box under the placeholders is drawn at another place in the show');
      assert.deepEqual(errors(page), []);
      assert.deepEqual(errors(editor), []);
    });
  }
});
