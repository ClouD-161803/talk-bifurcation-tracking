// the layer commands Bring to Front, Bring Forward, Send Backward, and Send to Back, for elements
// in the flow and out of it, in the order that the Object List shows, with the z-index taken off
// again

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { resolve } from 'node:path';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, clickText, drag, press, saveAndReopen, type } from './helpers/editor.mjs';

// regression tests of R13.1 on both platforms with trusted input: the four layer commands of
// commands/order.ts for an element in the flow, e.g. a paragraph moved onto a figure, as Bring to
// Front of Keynote (K70). each edit of the file is checked byte for byte, after an undo and a redo,
// and after a save and an open
describe('layer commands for an element in the flow', () => {
  const DECK = 'test-deck.html';
  // the slide of the demo deck with a paragraph, a list, and a figure in a figure box
  const FIGURES = [...readFileSync(DECK, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => m[0].includes('Figures are first class citizens'));
  const PLATFORMS = ['mac', 'other'];
  const KEYS = {
    mac: { front: 'Mod+Shift+F', forward: 'Mod+Alt+Shift+F', backward: 'Mod+Alt+Shift+B', back: 'Mod+Shift+B' },
    other: { front: 'Mod+Shift+ArrowUp', forward: 'Mod+ArrowUp', backward: 'Mod+ArrowDown', back: 'Mod+Shift+ArrowDown' },
  };
  const P = '.reveal section.present > p';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const PLATE = [...readFileSync(LAYOUTS, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => m[0].includes('A figure slide with a paper image'));
  const ROW = '.beeson-edit-objects .row';
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };

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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const orders = async (page) => Object.fromEntries(await Promise.all(['front', 'forward', 'backward', 'back'].map(async (o) => [o, (await state(page, `arrange.order.${o}`)).enabled])));
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  // the start tags of a text that differ from those of base
  const changedTags = (base, text) => {
    const a = base.match(/<[a-z][^>]*>/g), b = text.match(/<[a-z][^>]*>/g);
    return b.filter((t, i) => t !== a[i]);
  };
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`);

  // the editor on the demo deck served over HTTP, with the storage of the origin emptied first, and
  // with slide n shown
  async function load(t, platform, n = FIGURES, deck = DECK) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
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

  // the boxes of the children of the current slide, to compare their places before and after a command
  const boxes = (page) => page.evaluate(`[...document.querySelector('.reveal section.present').children].map((e) => { const r = e.getBoundingClientRect(); return e.localName + ' ' + [r.left, r.top, r.width, r.height].map(Math.round).join(' '); })`);

  // a point of the text of the paragraph over the shown picture of the figure, in CSS px
  const textOverPicture = (page) => page.evaluate(`(() => {
  const p = document.querySelector(${js(P)});
  const img = [...document.querySelectorAll('.reveal section.present figure img')].find((i) => i.getClientRects().length);
  const b = img.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(p);
  for (const r of range.getClientRects()) {
    const x = Math.max(r.left, b.left + 20), y = r.top + r.height / 2;
    if (x + 10 < Math.min(r.right, b.right) && y > b.top && y < b.bottom) return { x: x + 10, y };
  }
  return null;
})()`);

  // the element of the slide drawn at a point, past the frames and the chrome of the editor
  const drawnAt = (page, at) => page.evaluate(`(() => {
  const hit = document.elementsFromPoint(${at.x}, ${at.y}).find((e) => e.closest('.reveal section.present'));
  return hit ? (hit.closest(${js(P)}) ? 'p' : hit.localName) : null;
})()`);

  // the rows of the object list, from front to back
  const rows = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].map((r) => r.querySelector('.name').textContent)`);

  // the element of the slide with the figures drawn at a point of the text of its paragraph over the
  // picture, in the show or in the print view of a deck, on the page of its last step
  const drawnInDeck = (page) => page.evaluate(`(() => {
  const slides = [...document.querySelectorAll('.reveal .slides section')].filter((x) => x.textContent.includes('Figures are first'));
  const s = slides.at(-1);
  s.scrollIntoView();
  const p = s.querySelector(':scope > p');
  const img = [...s.querySelectorAll('figure img')].find((i) => i.getClientRects().length);
  const b = img.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(p);
  for (const r of range.getClientRects()) {
    const x = Math.max(r.left, b.left + 20) + 10, y = r.top + r.height / 2;
    if (x < Math.min(r.right, b.right) && y > b.top && y < b.bottom) {
      const hit = document.elementsFromPoint(x, y).find((e) => s.contains(e));
      return hit ? (p.contains(hit) ? 'p' : hit.localName) : null;
    }
  }
  return 'no text over the picture';
})()`);

  async function checkEdit(page, edited, base) {
    assert.notEqual(edited, base);
    await undo(page);
    await frames(page);
    assert.equal(await render(page), base);
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited);
    await saveAndReopen(page, `r13-1-${Math.random().toString(36).slice(2)}.html`);
    assert.deepEqual(errors(page), []);
  }

  for (const platform of PLATFORMS) {
    test(`${platform}: a paragraph dragged onto the figure is brought in front of its picture`, async (t) => {
      const page = await load(t, platform);
      const scale = await page.evaluate(`document.querySelector('.reveal section.present').getBoundingClientRect().width / 1920`);
      await clickText(page, P);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['p']);
      // the paragraph is moved by its handle by 700 by 100 slide px onto the picture
      const from = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-handle')].find((d) => !d.hidden && d.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await drag(page, from, { dx: 700 * scale, dy: 100 * scale, steps: 12 });
      await frames(page);
      const dragged = await render(page);
      assert.notEqual(dragged, page.source);
      const at = await textOverPicture(page);
      assert.ok(at, 'the text of the paragraph is not over the picture');
      assert.equal(await drawnAt(page, at), 'img', 'the paragraph is not under the picture before Bring to Front');
      const placed = await boxes(page);

      // the heading in the flow is drawn under the moved paragraph, hence the back commands pass it
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: true, back: true }, 'the layer commands of the moved paragraph');
      await press(page, KEYS[platform].front);
      await frames(page);
      assert.equal(await drawnAt(page, at), 'p', 'the paragraph is not drawn over the picture after Bring to Front');
      assert.deepEqual(await boxes(page), placed, 'an element is moved on the slide by Bring to Front');
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: true, back: true });
      assert.equal(await undoLabel(page), 'Undo Bring to Front');
      const front = await render(page);
      const tags = changedTags(dragged, front);
      assert.equal(tags.length, 1, `Bring to Front changes the tags ${js(tags)}`);
      assert.deepEqual(tags[0].match(/^<p style="([^"]*)">$/)[1].split('; ').sort(), ['position: relative', 'translate: 700px 111px', 'z-index: 1']);
      await checkEdit(page, front, dragged);
      await frames(page);
      assert.equal(await drawnAt(page, at), 'p');
      await press(page, LIST_KEY[platform]);
      await frames(page);
      assert.equal((await rows(page))[0], 'Text: Export your matplotlib figure with…', 'the object list does not show the paragraph in front');

      // the show and the print view of the saved deck draw the paragraph over the picture
      const file = `.r13-1-${platform}.html`;
      writeFileSync(file, front);
      t.after(() => rmSync(file, { force: true }));
      const offline = await launch();
      t.after(() => offline.close());
      const show = await offline.newPage({ width: 1600, height: 1000 });
      await show.goto(deckUrl(file, 'still', `/${FIGURES}`));
      await show.waitFor(deckSettled);
      assert.equal(await drawnInDeck(show), 'p', 'the show does not draw the paragraph over the picture');
      await printView(show, deckUrl(file, 'print-pdf&still'));
      assert.equal(await drawnInDeck(show), 'p', 'the print view does not draw the paragraph over the picture');

      // Send to Back puts it under the picture and the heading, without a move on the slide
      if ((await selected(page))[0] !== 'p') {
        await clickText(page, at);
        await press(page, 'Escape');
        await frames(page);
      }
      await press(page, KEYS[platform].back);
      await frames(page);
      assert.equal(await drawnAt(page, at), 'img', 'the paragraph is not drawn under the picture after Send to Back');
      assert.deepEqual(await boxes(page), placed, 'an element is moved on the slide by Send to Back');
      assert.deepEqual(changedTags(front, await render(page)), [tags[0].replace('z-index: 1', 'z-index: -1')], 'Send to Back does not put the paragraph behind the heading');
      assert.deepEqual(errors(page), []);
    });
  }

  for (const platform of PLATFORMS) {
    test(`${platform}: the figure is brought in front of a paragraph raised by Bring to Front with a z-index, and moved in the file otherwise`, async (t) => {
      const page = await load(t, platform);
      const scale = await page.evaluate(`document.querySelector('.reveal section.present').getBoundingClientRect().width / 1920`);
      await clickText(page, P);
      await press(page, 'Escape');
      const from = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-handle')].find((d) => !d.hidden && d.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await drag(page, from, { dx: 700 * scale, dy: 100 * scale, steps: 12 });
      await press(page, KEYS[platform].front);
      await frames(page);
      const at = await textOverPicture(page);
      const raised = await render(page);
      // a click on the picture selects the figure, which is then brought in front of the paragraph
      const img = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.reveal section.present figure img')].find((i) => i.getClientRects().length).getBoundingClientRect(); return { x: r.left + 20, y: r.bottom - 20 }; })()`);
      await clickText(page, img);
      await frames(page);
      assert.deepEqual(await selected(page), ['figure']);
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: true, back: true });
      await press(page, KEYS[platform].front);
      await frames(page);
      assert.equal(await drawnAt(page, at), 'img');
      const front = await render(page);
      assert.deepEqual(changedTags(raised, front), ['<figure class="figure-box" style="z-index: 1">']);
      await checkEdit(page, front, raised);
      // Send to Back puts the figure behind the heading and the list in the flow, with a z-index under
      // 0 in place of its z-index
      await clickText(page, img);
      await frames(page);
      assert.deepEqual(await selected(page), ['figure']);
      await press(page, KEYS[platform].back);
      await frames(page);
      assert.equal(await drawnAt(page, at), 'p');
      const back = await render(page);
      assert.deepEqual(changedTags(front, back), ['<figure class="figure-box" style="z-index: -1">'], 'Send to Back does not put the figure behind the heading and the list');
      await checkEdit(page, back, front);
    });

    test(`${platform}: a plate does not have layer commands, and a heading moved over it is put after it in the file`, async (t) => {
      const page = await load(t, platform, PLATE, LAYOUTS);
      await clickText(page, '.reveal section.present .plate img');
      await frames(page);
      assert.deepEqual(await selected(page), ['div']);
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: false, back: false });
      // the heading is moved by its handle onto the plate, under which it is drawn
      await clickText(page, '.reveal section.present > h2');
      await press(page, 'Escape');
      const from = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-handle')].find((d) => !d.hidden && d.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const scale = await page.evaluate(`document.querySelector('.reveal section.present').getBoundingClientRect().width / 1920`);
      await drag(page, from, { dx: 0, dy: 400 * scale, steps: 10 });
      await frames(page);
      const moved = await render(page);
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: false, back: false });
      await press(page, KEYS[platform].forward);
      await frames(page);
      const front = await render(page);
      // the heading of a figure slide is out of the flow, hence it is moved after the plate in the file
      assert.ok(front.indexOf('<h2 style="translate: 0px') > front.indexOf('<div class="plate">'), 'the heading is not put after the plate');
      assert.doesNotMatch(front, /z-index/);
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: true, back: true });
      await checkEdit(page, front, moved);
      await clickText(page, '.reveal section.present .plate img');
      await frames(page);
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: false, back: false });
    });
  }

  // the list of the slide with the figures, sent behind the paragraph before it, which takes a
  // negative z-index since the list is in the flow after it
  for (const platform of PLATFORMS) {
    test(`${platform}: a list sent behind the paragraph before it is drawn in the show and in the print view`, async (t) => {
      const page = await load(t, platform);
      await clickText(page, P);
      await press(page, 'Escape');
      await press(page, 'ArrowDown');
      await frames(page);
      const nudged = await render(page);
      await clickText(page, '.reveal section.present > ul li');
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['ul']);
      await press(page, KEYS[platform].back);
      await frames(page);
      const back = await render(page);
      assert.deepEqual(changedTags(nudged, back), ['<ul style="translate: 0px 20px; position: relative; z-index: -1">']);
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: false, back: false });
      await checkEdit(page, back, nudged);
      // two steps of Bring Forward put the list over the heading, then over the paragraph again as in
      // the file, and take the declarations off
      for (const step of [1, 2]) {
        await clickText(page, '.reveal section.present > ul li');
        await press(page, 'Escape');
        await frames(page);
        assert.deepEqual(await selected(page), ['ul']);
        await press(page, KEYS[platform].forward);
        await frames(page);
        if (step === 1) assert.notEqual(await render(page), nudged, 'Bring Forward passes the heading and the paragraph at once');
      }
      assert.equal(await render(page), nudged, 'Bring Forward leaves declarations on the list back in the order of the file');
      const file = `.r13-1-back-${platform}.html`;
      writeFileSync(file, back);
      t.after(() => rmSync(file, { force: true }));
      const offline = await launch();
      t.after(() => offline.close());
      const view = await offline.newPage({ width: 1600, height: 1000 });
      // the first element at a point of the text of the list, on the page of the last step
      const hit = () => view.evaluate(`(() => {
      const s = [...document.querySelectorAll('.reveal .slides section')].filter((x) => x.textContent.includes('Figures are first')).at(-1);
      s.scrollIntoView();
      const r = s.querySelector(':scope > ul li').getBoundingClientRect();
      const e = document.elementsFromPoint(r.left + r.width / 2, r.top + 10)[0];
      return e?.closest('ul') ? 'ul' : e?.className ?? null;
    })()`);
      await view.goto(deckUrl(file, 'still', `/${FIGURES}`));
      await view.waitFor(deckSettled);
      assert.equal(await hit(), 'ul', 'the show does not draw the list');
      await printView(view, deckUrl(file, 'print-pdf&still'));
      assert.equal(await hit(), 'ul', 'the print view draws the list under the background of its page');
    });
  }

  // a paragraph that is not moved, ordered by the commands or by its row and brought back to the
  // order of the file, keeps the style of the file, and Reset Slide takes the order off
  const exec = (page, id) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)})).then(() => true)`);
  async function selectP(page) {
    await clickText(page, P);
    await press(page, 'Escape');
    await frames(page);
    assert.deepEqual(await selected(page), ['p']);
  }
  const rowOf = (page, name) => page.evaluate(`(() => { const rs = [...document.querySelectorAll(${js(ROW)})]; const r = rs.find((x) => x.querySelector('.name').textContent.startsWith(${js(name)})).getBoundingClientRect(); const all = rs.map((x) => x.getBoundingClientRect()); return { x: r.left + 60, y: r.top + r.height / 2, own: r.top, top: all[0].top, bottom: all.at(-1).bottom }; })()`);

  for (const platform of PLATFORMS) {
    test(`${platform}: a paragraph that is not moved is put back to the style of the file by Send Backward and Bring Forward`, async (t) => {
      const page = await load(t, platform);
      await selectP(page);
      // Bring Forward passes the list, which is a layer since it is moved, and the figure stays over it
      await press(page, KEYS[platform].forward);
      await frames(page);
      assert.deepEqual(changedTags(page.source, await render(page)), ['<p style="position: relative; z-index: 1">', '<figure class="figure-box" style="z-index: 1">']);
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: true, back: true }, 'the commands that put the paragraph back are dimmed');
      await press(page, KEYS[platform].backward);
      await frames(page);
      assert.equal(await render(page), page.source, 'Send Backward leaves a declaration on the paragraph');
      await press(page, KEYS[platform].front);
      await frames(page);
      assert.notEqual(await render(page), page.source);
      for (const _ of [1, 2]) {
        await press(page, KEYS[platform].backward);
        await frames(page);
      }
      assert.equal(await render(page), page.source, 'two steps of Send Backward leave a declaration on the paragraph or the figure');
      // Send to Back passes the heading in the flow, and Bring Forward puts the paragraph back over it
      await press(page, KEYS[platform].back);
      await frames(page);
      assert.deepEqual(changedTags(page.source, await render(page)), ['<p style="position: relative; z-index: -1">']);
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: false, back: false });
      await press(page, KEYS[platform].forward);
      await frames(page);
      assert.equal(await render(page), page.source, 'Bring Forward leaves a declaration on the paragraph');
      const { text } = await saveAndReopen(page, `r13-1-home-${platform}.html`);
      assert.equal(text, page.source);
    });

    test(`${platform}: a paragraph dragged in the object list to the front and back over the heading keeps the style of the file`, async (t) => {
      const page = await load(t, platform);
      await press(page, LIST_KEY[platform]);
      await frames(page);
      const NAME = 'Text: Export your matplotlib';
      let at = await rowOf(page, NAME);
      await drag(page, { x: at.x, y: at.y }, { dy: at.top + 2 - at.y, steps: 8 });
      await frames(page);
      assert.ok((await rows(page))[0].startsWith(NAME), `the row of the paragraph is not in front: ${js(await rows(page))}`);
      assert.match(await render(page), /<p style="position: relative; z-index: 1">Export/);
      // the row of the heading in the flow is the bottom row, under the paragraph in the file
      at = await rowOf(page, NAME);
      const heading = await rowOf(page, 'Text: Figures are first');
      await drag(page, { x: at.x, y: at.y }, { dy: heading.own + 2 - at.y, steps: 8 });
      await frames(page);
      assert.equal(await render(page), page.source, 'a drag back to the order of the file leaves a declaration on the paragraph');
    });

    test(`${platform}: Reset Slide takes off the z-index and the position written by a layer command`, async (t) => {
      const page = await load(t, platform);
      await selectP(page);
      await press(page, KEYS[platform].front);
      await frames(page);
      const front = await render(page);
      assert.match(front, /<p style="position: relative; z-index: 1">Export/);
      await exec(page, 'slide.reset');
      await frames(page);
      const reset = await render(page);
      const slide = reset.match(/<section>\s*<h2>Figures are first[\s\S]*?<\/section>/)[0];
      assert.doesNotMatch(slide, /z-index|position/, 'Reset Slide keeps the order of a layer command');
      await checkEdit(page, reset, front);
    });
  }
});

// regression tests of R15.2 on both platforms with trusted input. the layer commands of
// commands/order.ts and a drag of a row of the object list follow the order that the object list
// shows, also past a text in the flow that was never moved (D25, D26). the declarations that they
// write are taken off every element once the slide is drawn in the same order without them (juror
// item 3b). a text sent to the back is still drawn and clicked, and the declarations of the author
// are kept
describe('layers in the order of the Object List', () => {
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const slideOf = (deck, has) => [...readFileSync(deck, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => has(m[0]));
  // the slide of the demo deck with a heading, a paragraph, a list, and a figure in a figure box
  const FIGURES = slideOf(DECK, (s) => s.includes('Figures are first class citizens'));
  const TITLE = slideOf(DECK, (s) => s.startsWith('<section class="title"'));
  const SPLIT = slideOf(LAYOUTS, (s) => s.startsWith('<section class="split"'));
  const PLATFORMS = ['mac', 'other'];
  const KEYS = {
    mac: { front: 'Mod+Shift+F', forward: 'Mod+Alt+Shift+F', backward: 'Mod+Alt+Shift+B', back: 'Mod+Shift+B' },
    other: { front: 'Mod+Shift+ArrowUp', forward: 'Mod+ArrowUp', backward: 'Mod+ArrowDown', back: 'Mod+Shift+ArrowDown' },
  };
  const S = '.reveal section.present';
  const EL = { h2: `${S} > h2`, p: `${S} > p`, ul: `${S} > ul`, figure: `${S} > figure` };
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };
  const ROW = '.beeson-edit-objects .row';
  const ROWS = { h2: 'Text: Figures are first', p: 'Text: Export your matplotlib', ul: 'Text: Dark and light mode', figure: 'Figure: Zero-velocity' };

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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const orders = async (page) => Object.fromEntries(await Promise.all(['front', 'forward', 'backward', 'back'].map(async (o) => [o, (await state(page, `arrange.order.${o}`)).enabled])));
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`);
  // the rows of the object list from front to back, and the same rows by their key in ROWS
  // the rows without the row of the backdrop, which is at the ground of the list
  const rows = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].filter((r) => r.dataset.kind !== 'Backdrop').map((r) => r.querySelector('.name').textContent)`);
  const named = async (page) => (await rows(page)).map((r) => Object.keys(ROWS).find((k) => r.startsWith(ROWS[k])) ?? r);

  async function load(t, platform, { n = FIGURES, deck = DECK } = {}) {
    const page = await browser.newPage({ width: 1600, height: 1000 });
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

  // the element of selector selected as an object, by a click and Esc out of its text
  async function pick(page, selector, name) {
    await clickText(page, selector);
    await frames(page);
    if (js(await selected(page)) !== js([name])) await press(page, 'Escape');
    await frames(page);
    assert.deepEqual(await selected(page), [name]);
  }

  async function layer(page, platform, name, order) {
    await pick(page, EL[name], name);
    await press(page, KEYS[platform][order]);
    await frames(page);
  }

  async function checkEdit(page, edited, base) {
    assert.notEqual(edited, base);
    await undo(page);
    await frames(page);
    assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited);
    await saveAndReopen(page, `r15-2-${Math.random().toString(36).slice(2)}.html`);
    assert.deepEqual(errors(page), []);
  }

  // a point of the text of the first element of selector inside the box of the shown picture of the
  // figure of its slide, in CSS px, or null
  const textOverPicture = (selector) => `(() => {
  const el = document.querySelector(${js(selector)});
  const img = [...el.closest('section').querySelectorAll('figure img')].find((i) => i.getClientRects().length);
  const b = img.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  for (const r of range.getClientRects()) {
    const x = Math.min(r.right, b.right) - 12, y = r.top + r.height / 2;
    if (x > Math.max(r.left, b.left) + 4 && y > b.top && y < b.bottom) return { x, y };
  }
  return null;
})()`;
  // the child of the slide drawn at a point, or null
  const childAt = (page, at, slide = S) => page.evaluate(`(() => {
  const hit = document.elementsFromPoint(${at.x}, ${at.y}).find((e) => e.closest(${js(slide)}));
  const child = hit?.closest(${js(slide + ' > *')});
  return child ? child.localName : null;
})()`);

  for (const platform of PLATFORMS) {
    test(`${platform}: a figure dragged over the heading and the paragraph is sent behind both by Send to Back`, async (t) => {
      const page = await load(t, platform);
      await press(page, LIST_KEY[platform]);
      await frames(page);
      const scale = await page.evaluate(`document.querySelector(${js(S)}).getBoundingClientRect().width / 1920`);
      const img = await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(S + ' figure img')})].find((i) => i.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await clickText(page, img);
      await frames(page);
      assert.deepEqual(await selected(page), ['figure']);
      // the drag of finding 2 of the judge opus in round 6, in slide px
      await drag(page, img, { dx: -556 * scale, dy: -226 * scale, steps: 12 });
      await frames(page);
      const dragged = await render(page);
      assert.notEqual(dragged, page.source);
      const overH2 = await page.evaluate(textOverPicture(EL.h2));
      const overP = await page.evaluate(textOverPicture(EL.p));
      assert.ok(overH2 && overP, 'the figure is not dragged over the heading and the paragraph');
      assert.equal(await childAt(page, overH2), 'figure');
      assert.equal(await childAt(page, overP), 'figure');
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: true, back: true });

      await press(page, KEYS[platform].back);
      await frames(page);
      assert.equal(await childAt(page, overH2), 'h2', 'Send to Back leaves the figure over the heading');
      assert.equal(await childAt(page, overP), 'p', 'Send to Back leaves the figure over the paragraph');
      assert.equal((await named(page)).at(-1), 'figure', 'the figure is not at the back of the object list');
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: false, back: false });
      const back = await render(page);
      await checkEdit(page, back, dragged);

      // the show and the print view of the saved deck draw the heading over the figure
      const file = `.r15-2-back-${platform}.html`;
      writeFileSync(file, back);
      t.after(() => rmSync(file, { force: true }));
      const offline = await launch();
      t.after(() => offline.close());
      const show = await offline.newPage({ width: 1600, height: 1000 });
      const inDeck = async () => {
        await show.evaluate(`(() => { const s = [...document.querySelectorAll('.reveal .slides section')].filter((x) => x.textContent.includes('Figures are first')).at(-1); s.scrollIntoView(); s.id = 'r15-2'; return true; })()`);
        const at = await show.evaluate(textOverPicture('#r15-2 > h2'));
        assert.ok(at, 'the figure is not over the heading in the deck');
        return childAt(show, at, '#r15-2');
      };
      await show.goto(deckUrl(file, 'still', `/${FIGURES}`));
      await show.waitFor(deckSettled);
      assert.equal(await inDeck(), 'h2', 'the show draws the figure over the heading');
      await printView(show, deckUrl(file, 'print-pdf&still'));
      assert.equal(await inDeck(), 'h2', 'the print view draws the figure over the heading');
    });

    test(`${platform}: Send to Back and Send Backward pass the texts in the flow, one layer of the object list at a time`, async (t) => {
      const page = await load(t, platform);
      await press(page, LIST_KEY[platform]);
      await frames(page);
      assert.deepEqual(await named(page), ['figure', 'ul', 'p', 'h2']);
      await pick(page, EL.ul, 'ul');
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: true, back: true }, 'a command that passes a text in the flow is dimmed');
      await press(page, KEYS[platform].back);
      await frames(page);
      assert.deepEqual(await named(page), ['figure', 'p', 'h2', 'ul'], 'Send to Back does not put the list behind the texts');
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: false, back: false });
      await undo(page);
      await frames(page);
      assert.equal(await render(page), page.source, 'the undo does not give the file back byte for byte');

      // Send Backward passes the paragraph only, and two steps of Bring Forward put the list back in
      // the order of the file
      await layer(page, platform, 'ul', 'backward');
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2'], 'Send Backward does not pass one layer');
      await layer(page, platform, 'ul', 'backward');
      assert.deepEqual(await named(page), ['figure', 'p', 'h2', 'ul']);
      await layer(page, platform, 'ul', 'forward');
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2'], 'Bring Forward does not pass one layer');
      await layer(page, platform, 'ul', 'forward');
      assert.deepEqual(await named(page), ['figure', 'ul', 'p', 'h2']);
      assert.equal(await render(page), page.source, 'a declaration is left once the list is back in the order of the file');
      // Bring Forward of the paragraph passes the list and leaves the paragraph under the figure
      await layer(page, platform, 'p', 'forward');
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2']);
      await layer(page, platform, 'p', 'backward');
      assert.equal(await render(page), page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: the declarations of the layer commands are taken off every element once the slide is in the order of the file, and those of the author are kept`, async (t) => {
      // a copy of the demo deck in which the author wrote a position on the list and a z-index on the
      // figure
      const file = `.r15-2-author-${platform}.html`;
      const authored = readFileSync(DECK, 'utf8').replace('<ul style="translate: 0px 20px">', '<ul style="translate: 0px 20px; position: relative">').replace('<figure class="figure-box">\n    <img class="for-dark" src="demo/figure-dark.png"', '<figure class="figure-box" style="z-index: 2">\n    <img class="for-dark" src="demo/figure-dark.png"');
      assert.ok(authored.includes('position: relative">') && authored.includes('style="z-index: 2"'));
      writeFileSync(file, authored);
      t.after(() => rmSync(file, { force: true }));
      const page = await load(t, platform, { deck: file });
      await press(page, LIST_KEY[platform]);
      await frames(page);
      const opened = await named(page);
      assert.deepEqual(opened, ['figure', 'ul', 'p', 'h2']);
      await layer(page, platform, 'p', 'front');
      await layer(page, platform, 'figure', 'front');
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2']);
      await layer(page, platform, 'p', 'backward');
      assert.deepEqual(await named(page), opened);
      assert.equal(await render(page), page.source, 'a declaration is left on an element that the last command did not move, or one of the author is changed');
      await layer(page, platform, 'h2', 'front');
      await layer(page, platform, 'ul', 'back');
      await layer(page, platform, 'h2', 'back');
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2']);
      await layer(page, platform, 'ul', 'forward');
      assert.deepEqual(await named(page), opened);
      assert.equal(await render(page), page.source, 'a declaration is left on the heading or the list, or one of the author is taken off');
      const { text } = await saveAndReopen(page, `.r15-2-clean-${platform}.html`);
      assert.equal(text, page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: a text of the text column of a split slide sent to the back is drawn over the panel`, async (t) => {
      const page = await load(t, platform, { deck: LAYOUTS, n: SPLIT });
      await press(page, LIST_KEY[platform]);
      await frames(page);
      const P = `${S} .text-column > p`;
      await pick(page, P, 'p');
      assert.equal((await orders(page)).back, true, 'Send to Back is dimmed for the paragraph over the heading');
      await press(page, KEYS[platform].back);
      await frames(page);
      const first = await page.evaluate(`document.querySelector(${js(P)}).textContent.trim().split(' ')[0]`);
      assert.ok((await rows(page)).at(-1).startsWith(`Text: ${first}`), 'the paragraph is not at the back of the object list');
      for (const sel of [P, `${S} .text-column > h2`]) {
        const top = await page.evaluate(`(() => {
        const el = document.querySelector(${js(sel)});
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getClientRects()[0];
        return el.contains(document.elementsFromPoint(r.left + 8, r.top + r.height / 2)[0]);
      })()`);
        assert.ok(top, `${sel} is drawn under the panel`);
      }
      await checkEdit(page, await render(page), page.source);
    });

    test(`${platform}: a subtitle of the title slide sent to the back is drawn and clicked`, async (t) => {
      const page = await load(t, platform, { n: TITLE });
      await press(page, LIST_KEY[platform]);
      await frames(page);
      const SUB = `${S} .title-text > p.sub`;
      await pick(page, SUB, 'p');
      await press(page, KEYS[platform].back);
      await frames(page);
      assert.ok((await rows(page)).at(-1).startsWith('Text: Template for the Beeson'), 'the subtitle is not at the back of the object list');
      const back = await render(page);
      assert.notEqual(back, page.source);
      await press(page, 'Escape');
      await press(page, 'Escape');
      await frames(page);
      const at = await page.evaluate(`(() => { const range = document.createRange(); range.selectNodeContents(document.querySelector(${js(SUB)})); const r = range.getClientRects()[0]; return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
      assert.ok(await page.evaluate(`document.querySelector(${js(SUB)}).contains(document.elementsFromPoint(${at.x}, ${at.y})[0])`), 'the subtitle is drawn under another element');
      await clickText(page, at);
      await frames(page);
      assert.ok(await page.evaluate(`document.querySelector(${js(SUB)}).contains(document.activeElement)`), 'a click on the subtitle does not put the caret in it');
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['p']);
      await checkEdit(page, back, page.source);
    });

    test(`${platform}: a row of the list dragged to the bottom of the object list and back passes the texts in the flow`, async (t) => {
      const page = await load(t, platform);
      await press(page, LIST_KEY[platform]);
      await frames(page);
      const box = (name) => page.evaluate(`(() => { const rs = [...document.querySelectorAll(${js(ROW)})]; const r = rs.find((x) => x.querySelector('.name').textContent.startsWith(${js(ROWS[name])})).getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; })()`);
      let from = await box('ul');
      const bottom = await box('h2');
      await drag(page, { x: from.x, y: from.y }, { dy: bottom.bottom - 2 - from.y, steps: 8 });
      await frames(page);
      assert.deepEqual(await named(page), ['figure', 'p', 'h2', 'ul'], 'the row of the list is not dragged behind the texts');
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Reorder');
      const dragged = await render(page);
      assert.notEqual(dragged, page.source);
      await undo(page);
      await frames(page);
      assert.equal(await render(page), page.source, 'the undo does not give the file back byte for byte');
      await redo(page);
      await frames(page);
      assert.equal(await render(page), dragged);
      from = await box('ul');
      const p = await box('p');
      await drag(page, { x: from.x, y: from.y }, { dy: p.top + 2 - from.y, steps: 8 });
      await frames(page);
      assert.deepEqual(await named(page), ['figure', 'ul', 'p', 'h2']);
      assert.equal(await render(page), page.source, 'a drag back to the order of the file leaves a declaration');
      // a drag by one row is one step of Send Backward
      from = await box('ul');
      const below = await box('p');
      await drag(page, { x: from.x, y: from.y }, { dy: below.bottom - 2 - from.y, steps: 8 });
      await frames(page);
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2']);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R16.2 on both platforms with trusted input. the layer commands of
// commands/order.ts move the selected element in the one order of the slide that the object list
// shows. Bring Forward and Send Backward pass one row, also past a backdrop, which the list does not
// show (finding G4). a z-index that a command writes gives the order that the list shows (G5). the
// commands and a drag of a row order the texts of the block of a closing slide among the other
// objects of the slide (G6). after each step, the order drawn, the order that a click hits, and the
// order of the list are the same
describe('Bring Forward and Send Backward pass one row', () => {
  const DECK = 'test-deck.html';
  const slideOf = (text, has) => [...text.matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => has(m[0]));
  const SOURCE = readFileSync(DECK, 'utf8');
  const STEPS = slideOf(SOURCE, (s) => s.includes('Show your steps one at a time'));
  const CLOSING = slideOf(SOURCE, (s) => s.startsWith('<section class="closing"'));
  const PLATFORMS = ['mac', 'other'];
  const KEYS = {
    mac: { front: 'Mod+Shift+F', forward: 'Mod+Alt+Shift+F', backward: 'Mod+Alt+Shift+B', back: 'Mod+Shift+B' },
    other: { front: 'Mod+Shift+ArrowUp', forward: 'Mod+ArrowUp', backward: 'Mod+ArrowDown', back: 'Mod+Shift+ArrowDown' },
  };
  const LABELS = { front: 'Bring to Front', forward: 'Bring Forward', backward: 'Send Backward', back: 'Send to Back' };
  const S = '.reveal section.present';
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };
  const ROW = '.beeson-edit-objects .row';

  // a copy of the demo deck in which the foot of slide 3 is moved up over the list, and the QR code
  // of the closing slide over the heading and the subtitle
  const FOOT = '<div class="foot">Slides can have backdrops';
  const QR = '<div class="qr" data-qr="https://github.com/beeson-group/slides">';
  const OVERLAPS = SOURCE.replace(FOOT, '<div class="foot" style="translate: 0px -150px">Slides can have backdrops')
    .replace(QR, '<div class="qr" data-qr="https://github.com/beeson-group/slides" style="translate: -1589px -245px">');

  const STEP_EL = { h2: `${S} > h2`, p: `${S} > p`, ul: `${S} > ul`, foot: `${S} > .foot` };
  const STEP_ROWS = { h2: 'Text: Show your steps', p: 'Text: Design the complete', ul: 'Text: Each step is', foot: 'Text: Slides can have' };
  const CLOSE_EL = { h1: `${S} .title-text > h1`, sub: `${S} .title-text > .sub`, who: `${S} .title-text > .who`, qr: `${S} > .qr` };
  const CLOSE_ROWS = { h1: 'Text: Thank you', sub: 'Text: Questions', who: 'Text: github.com', qr: 'QR Code' };

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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const orders = async (page) => Object.fromEntries(await Promise.all(['front', 'forward', 'backward', 'back'].map(async (o) => [o, (await state(page, `arrange.order.${o}`)).enabled])));
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`);
  // the rows without the row of the backdrop, which is at the ground of the list
  const rows = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].filter((r) => r.dataset.kind !== 'Backdrop').map((r) => r.querySelector('.name').textContent)`);
  // the rows of the object list from front to back, each by its key in names
  const named = async (page, names) => (await rows(page)).map((r) => Object.keys(names).find((k) => r.startsWith(names[k])) ?? r);

  async function load(t, platform, n) {
    const file = `.r16-2-${platform}-${n}.html`;
    writeFileSync(file, OVERLAPS);
    t.after(() => rmSync(file, { force: true }));
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${file}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = OVERLAPS;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(page.source)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    await press(page, LIST_KEY[platform]);
    await frames(page);
    return page;
  }

  // the element of the row of names[name] selected by a click on this row of the object list
  async function pick(page, names, name) {
    const at = await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(ROW)})].find((x) => x.querySelector('.name').textContent.startsWith(${js(names[name])})).getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
    await click(page, at);
    await frames(page);
    assert.equal((await selected(page)).length, 1);
  }

  // whether the row of names[name] is the one row selected in the object list
  const rowSelected = (page, names, name) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})]
  .filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.querySelector('.name').textContent.startsWith(${js(names[name])})).join()`);

  // the command of order run by its key on the element of the row of names[name], then undone and
  // redone, which gives the text before and after the command byte for byte, with the row selected
  // throughout
  async function layer(page, platform, order, names, name) {
    await pick(page, names, name);
    const base = await render(page);
    await press(page, KEYS[platform][order]);
    await frames(page);
    const edited = await render(page);
    if (edited === base) return edited;
    assert.equal((await state(page, 'edit.undo')).label, `Undo ${LABELS[order]}`);
    await undo(page);
    await frames(page);
    assert.equal(await render(page), base, `the undo of ${LABELS[order]} does not give the text back byte for byte`);
    assert.equal(await rowSelected(page, names, name), 'true', `the undo of ${LABELS[order]} selects another row`);
    await redo(page);
    await frames(page);
    assert.equal(await render(page), edited);
    assert.equal(await rowSelected(page, names, name), 'true', `the redo of ${LABELS[order]} selects another row`);
    return edited;
  }

  // a point of the text of the element of selector a inside the box of the element of b, in CSS px
  const overlap = (page, a, b) => page.evaluate(`(() => {
  const el = document.querySelector(${js(a)});
  const box = [...document.querySelectorAll(${js(b)})].find((e) => e.getClientRects().length).getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  for (const r of range.getClientRects()) {
    const x = Math.max(r.left, box.left) + 12, y = r.top + r.height / 2;
    if (x < Math.min(r.right, box.right) - 4 && y > box.top && y < box.bottom) return { x, y };
  }
  return null;
})()`);
  // the key in els of the element drawn on top at a point, i.e. the one that a click there hits
  const topAt = (page, at, els) => page.evaluate(`(() => {
  const els = ${js(els)};
  for (const hit of document.elementsFromPoint(${at.x}, ${at.y})) {
    const k = Object.keys(els).find((n) => document.querySelector(els[n]).contains(hit));
    if (k) return k;
  }
  return null;
})()`);
  // whether the rows of list show a in front of b
  const listedOver = (list, a, b) => list.indexOf(a) < list.indexOf(b);

  for (const platform of PLATFORMS) {
    test(`${platform}: Bring Forward and Send Backward of the list of slide 3 pass one row of the object list, past the backdrop (G4)`, async (t) => {
      const page = await load(t, platform, STEPS);
      const pair = { foot: STEP_EL.foot, ul: STEP_EL.ul };
      const at = await overlap(page, STEP_EL.foot, STEP_EL.ul);
      assert.ok(at, 'the foot is not over the list');
      assert.deepEqual(await named(page, STEP_ROWS), ['foot', 'ul', 'p', 'h2']);
      assert.equal(await topAt(page, at, pair), 'foot');
      await pick(page, STEP_ROWS, 'ul');
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: true, back: true });

      await layer(page, platform, 'forward', STEP_ROWS, 'ul');
      assert.deepEqual(await named(page, STEP_ROWS), ['ul', 'foot', 'p', 'h2'], 'Bring Forward does not pass the foot');
      assert.equal(await topAt(page, at, pair), 'ul', 'the foot is drawn over the list brought forward');
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: true, back: true }, 'Send Backward or Send to Back is dimmed');

      await layer(page, platform, 'backward', STEP_ROWS, 'ul');
      assert.deepEqual(await named(page, STEP_ROWS), ['foot', 'ul', 'p', 'h2']);
      assert.equal(await topAt(page, at, pair), 'foot');
      assert.equal(await render(page), page.source, 'a declaration is left once the list is back in the order of the file');
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: true, back: true });

      await layer(page, platform, 'backward', STEP_ROWS, 'ul');
      assert.deepEqual(await named(page, STEP_ROWS), ['foot', 'p', 'ul', 'h2'], 'Send Backward does not pass one row');
      await layer(page, platform, 'back', STEP_ROWS, 'ul');
      assert.deepEqual(await named(page, STEP_ROWS), ['foot', 'p', 'h2', 'ul']);
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: false, back: false });
      await layer(page, platform, 'front', STEP_ROWS, 'ul');
      assert.deepEqual(await named(page, STEP_ROWS), ['ul', 'foot', 'p', 'h2']);
      assert.equal(await topAt(page, at, pair), 'ul');
      await layer(page, platform, 'backward', STEP_ROWS, 'ul');
      assert.deepEqual(await named(page, STEP_ROWS), ['foot', 'ul', 'p', 'h2']);
      assert.equal(await render(page), page.source, 'a declaration is left once the list is back in the order of the file');
      const { text } = await saveAndReopen(page, `.r16-2-g4-${platform}.html`);
      assert.equal(text, page.source);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: the order of the heading of the closing slide and the QR code is drawn as the object list shows it (G5)`, async (t) => {
      const page = await load(t, platform, CLOSING);
      const pair = { h1: CLOSE_EL.h1, qr: CLOSE_EL.qr };
      const at = await overlap(page, CLOSE_EL.h1, CLOSE_EL.qr);
      assert.ok(at, 'the QR code is not over the heading');
      // the theme draws the block of a closing slide in front of the QR code
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'sub', 'h1', 'qr']);
      assert.equal(await topAt(page, at, pair), 'h1');
      await layer(page, platform, 'front', CLOSE_ROWS, 'qr');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['qr', 'who', 'sub', 'h1']);
      assert.equal(await topAt(page, at, pair), 'qr', 'the QR code brought to the front is drawn under the heading');
      // the steps of the finding: Bring to Front of the heading, of the subtitle, and of the heading
      for (const name of ['h1', 'sub', 'h1']) {
        await layer(page, platform, 'front', CLOSE_ROWS, name);
        const list = await named(page, CLOSE_ROWS);
        assert.equal(await topAt(page, at, pair), listedOver(list, 'h1', 'qr') ? 'h1' : 'qr', `the object list ${list.join(' | ')} is not the order drawn`);
      }
      await pick(page, CLOSE_ROWS, 'qr');
      const list = await named(page, CLOSE_ROWS);
      const o = await orders(page);
      assert.equal(o.front, list[0] !== 'qr', 'Bring to Front of the QR code is not dimmed only at the front of the list');
      if (o.front) await layer(page, platform, 'front', CLOSE_ROWS, 'qr');
      assert.equal((await named(page, CLOSE_ROWS))[0], 'qr');
      assert.equal(await topAt(page, at, pair), 'qr', 'the QR code brought to the front is drawn under the heading');
      await layer(page, platform, 'back', CLOSE_ROWS, 'qr');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'sub', 'h1', 'qr']);
      assert.equal(await topAt(page, at, pair), 'h1', 'the QR code sent to the back is drawn over the heading');
      assert.equal(await render(page), page.source, 'a declaration is left once the slide is in the order of the file');
      await saveAndReopen(page, `.r16-2-g5-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: the layer commands and a drag of a row order the texts of the block of the closing slide among the objects of the slide (G6)`, async (t) => {
      const page = await load(t, platform, CLOSING);
      const pair = { h1: CLOSE_EL.h1, qr: CLOSE_EL.qr };
      const subPair = { sub: CLOSE_EL.sub, qr: CLOSE_EL.qr };
      const at = await overlap(page, CLOSE_EL.h1, CLOSE_EL.qr);
      const atSub = await overlap(page, CLOSE_EL.sub, CLOSE_EL.qr);
      assert.ok(at && atSub, 'the QR code is not over the heading and the subtitle');

      // the theme draws the block of a closing slide in front of the QR code. the block is a stacking
      // context, hence the QR code passes all of its texts or none, and Bring Forward and Send Backward
      // of the QR code, which pass one row, are dimmed
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'sub', 'h1', 'qr']);
      assert.equal(await topAt(page, at, pair), 'h1');
      assert.equal(await topAt(page, atSub, subPair), 'sub');
      await pick(page, CLOSE_ROWS, 'qr');
      assert.deepEqual(await orders(page), { front: true, forward: false, backward: false, back: false });
      await layer(page, platform, 'front', CLOSE_ROWS, 'qr');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['qr', 'who', 'sub', 'h1'], 'Bring to Front of the QR code stops under the block');
      assert.equal(await topAt(page, at, pair), 'qr');
      assert.equal(await topAt(page, atSub, subPair), 'qr');
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: false, back: true });
      await layer(page, platform, 'back', CLOSE_ROWS, 'qr');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'sub', 'h1', 'qr']);
      assert.equal(await topAt(page, at, pair), 'h1');
      assert.equal(await topAt(page, atSub, subPair), 'sub');
      assert.equal(await render(page), page.source, 'a declaration is left once the slide is in the order of the file');

      // the heading passes one text of the block at a time, in front of the QR code
      await pick(page, CLOSE_ROWS, 'h1');
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: false, back: false });
      await layer(page, platform, 'forward', CLOSE_ROWS, 'h1');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'h1', 'sub', 'qr'], 'Bring Forward of the heading does not pass one row');
      assert.equal(await topAt(page, at, pair), 'h1');
      await layer(page, platform, 'front', CLOSE_ROWS, 'h1');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['h1', 'who', 'sub', 'qr']);
      assert.equal(await topAt(page, at, pair), 'h1');
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: true, back: false });
      await layer(page, platform, 'backward', CLOSE_ROWS, 'h1');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'h1', 'sub', 'qr']);
      await layer(page, platform, 'backward', CLOSE_ROWS, 'h1');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'sub', 'h1', 'qr']);
      assert.equal(await topAt(page, at, pair), 'h1');
      assert.equal(await render(page), page.source, 'a declaration is left once the slide is in the order of the file');

      // a drag of the row of the heading to the top of the list
      const box = (name) => page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(ROW)})].find((x) => x.querySelector('.name').textContent.startsWith(${js(CLOSE_ROWS[name])})).getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2, top: r.top }; })()`);
      const from = await box('h1');
      const top = await box('who');
      await drag(page, from, { dy: top.top + 2 - from.y, steps: 8 });
      await frames(page);
      assert.deepEqual(await named(page, CLOSE_ROWS), ['h1', 'who', 'sub', 'qr'], 'the row of the heading is not dragged to the top');
      assert.equal(await topAt(page, at, pair), 'h1');
      assert.equal(await topAt(page, atSub, subPair), 'sub');
      assert.equal((await state(page, 'edit.undo')).label, 'Undo Reorder');
      const dragged = await render(page);
      await undo(page);
      await frames(page);
      assert.equal(await render(page), page.source, 'the undo of the drag does not give the file back byte for byte');
      await redo(page);
      await frames(page);
      assert.equal(await render(page), dragged);
      await saveAndReopen(page, `.r16-2-g6-${platform}.html`);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R18.1 on both platforms with trusted input. a layer command of
// commands/order.ts changes the order drawn and not the order of the steps, and the file is back to
// the source once the rows are in their first order, by the same bytes for the same order whatever
// the route (finding C2). a list, whose items the theme positions, is drawn and listed in the order
// of the layers of z-index 0 (C3). the selection of a command stays over its undo and redo (C4)
describe('layers change the drawn order, not the steps', () => {
  const SOURCE = readFileSync('test-deck.html', 'utf8');
  const slideOf = (text, has) => [...text.matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => has(m[0]));
  const STEPS = slideOf(SOURCE, (s) => s.includes('Show your steps one at a time'));
  const FIGURES = slideOf(SOURCE, (s) => s.includes('Figures are first class citizens'));
  const CLOSING = slideOf(SOURCE, (s) => s.startsWith('<section class="closing"'));
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const LAYOUTS_SOURCE = readFileSync(LAYOUTS, 'utf8');
  const BACKDROP = slideOf(LAYOUTS_SOURCE, (s) => s.includes('A figure slide with a backdrop'));
  const PLATFORMS = ['mac', 'other'];
  const KEYS = {
    mac: { front: 'Mod+Shift+F', forward: 'Mod+Alt+Shift+F', backward: 'Mod+Alt+Shift+B', back: 'Mod+Shift+B', undo: 'Mod+Z', redo: 'Mod+Shift+Z' },
    other: { front: 'Mod+Shift+ArrowUp', forward: 'Mod+ArrowUp', backward: 'Mod+ArrowDown', back: 'Mod+Shift+ArrowDown', undo: 'Mod+Z', redo: 'Mod+Shift+Z' },
  };
  const S = '.reveal section.present';
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };
  const ROW = '.beeson-edit-objects .row';

  // copies of the demo deck. in each, the foot of slide 3 is moved over the list: written last, also
  // as a step after the items, which have no index (FRAGFOOT), or written after the heading
  // (FOOTFIRST). in OVERLAPS the QR code of the closing slide is over the heading, and in FIGOVER the
  // figure of slide 5 is over the list
  const FOOT = '<div class="foot">Slides can have backdrops';
  const MOVED_FOOT = '<div class="foot" style="translate: 0px -150px">Slides can have backdrops';
  const QR = '<div class="qr" data-qr="https://github.com/beeson-group/slides">';
  const OVERLAPS = SOURCE.replace(FOOT, MOVED_FOOT).replace(QR, QR.replace('>', ' style="translate: -1589px -245px">'));
  const FRAGFOOT = SOURCE.replace(/<section[\s\S]*?<\/section>/g, (s) => (s.includes('Show your steps one at a time') ? s.replace(/ data-fragment-index="\d"/g, '') : s))
    .replace(FOOT, '<div class="foot fragment" style="translate: 0px -150px">Slides can have backdrops');
  const footLine = SOURCE.split('\n').find((l) => l.includes(FOOT));
  const FOOTFIRST = SOURCE.replace(`${footLine}\n`, '').replace('<h2>Show your steps one at a time</h2>\n', `<h2>Show your steps one at a time</h2>\n${footLine.replace(FOOT, MOVED_FOOT)}\n`);
  const FIGOVER = SOURCE.replace('<figure class="figure-box">', '<figure class="figure-box" style="translate: -530px -40px">');

  const STEP_EL = { h2: `${S} > h2`, p: `${S} > p`, ul: `${S} > ul`, foot: `${S} > .foot` };
  const STEP_ROWS = { h2: 'Text: Show your steps', p: 'Text: Design the complete', ul: 'Text: Each step is', foot: 'Text: Slides can have' };
  const FIG_ROWS = { h2: 'Text: Figures are first', p: 'Text: Export your', ul: 'Text: Dark and light', fig: 'Figure' };
  const CAP_EL = { cap: `${S} > .caption`, bd: `${S} > .backdrop` };
  const CAP_ROWS = { h2: 'Text: A figure slide with', cap: 'Text: A backdrop over' };
  const CLOSE_ROWS = { h1: 'Text: Thank you', sub: 'Text: Questions', who: 'Text: github.com', qr: 'QR Code' };

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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const state = (page, id) => page.evaluate(`window.BeesonEditor.state(${js(id)})`);
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const orders = async (page) => Object.fromEntries(await Promise.all(['front', 'forward', 'backward', 'back'].map(async (o) => [o, (await state(page, `arrange.order.${o}`)).enabled])));
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => [e.localName, ...e.classList].filter((c) => !c.startsWith('beeson')).join('.'))`);
  // the rows without the row of the backdrop, which is at the ground of the list
  const rows = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].filter((r) => r.dataset.kind !== 'Backdrop').map((r) => r.querySelector('.name').textContent)`);
  // the rows of the object list from front to back, each by its key in names
  const named = async (page, names) => (await rows(page)).map((r) => Object.keys(names).find((k) => r.startsWith(names[k])) ?? r);

  // the deck text saved as file and opened with the editor at slide n, with the object list shown
  async function load(t, platform, text, n, file = `.r18-1-${platform}-${n}.html`) {
    if (text !== LAYOUTS_SOURCE) {
      writeFileSync(file, text);
      t.after(() => rmSync(file, { force: true }));
    }
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${file}?edit&still&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    await press(page, LIST_KEY[platform]);
    await frames(page);
    return page;
  }

  const rowAt = (page, names, name) => page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(ROW)})].find((x) => x.querySelector('.name').textContent.startsWith(${js(names[name])})).getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
  // the element of the row of names[name] selected by a click on this row of the object list
  async function pick(page, names, name) {
    await click(page, await rowAt(page, names, name));
    await frames(page);
    assert.equal((await selected(page)).length, 1);
  }

  // the command of order run by its key on the selection, with a check of its history entry
  async function layer(page, platform, order) {
    const base = await render(page);
    await press(page, KEYS[platform][order]);
    await frames(page);
    const edited = await render(page);
    assert.notEqual(edited, base, `the command ${order} does not change the file`);
    return edited;
  }

  // the texts of the steps of slide n of text in the show without the editor, in the order shown
  async function stepsOf(t, text, n, file) {
    writeFileSync(file, text);
    t.after(() => rmSync(file, { force: true }));
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/${file}`);
    await page.waitFor(deckSettled);
    await page.evaluate(`Reveal.slide(${n})`);
    return page.evaluate(`[...Reveal.getCurrentSlide().querySelectorAll('.fragment')]
    .sort((a, b) => a.dataset.fragmentIndex - b.dataset.fragmentIndex).map((f) => f.textContent.trim().slice(0, 14)).filter((s) => s)`);
  }

  // a point of the text of the element of selector a inside the box of the element of b, in CSS px
  const overlap = (page, a, b) => page.evaluate(`(() => {
  const el = document.querySelector(${js(a)});
  const box = [...document.querySelectorAll(${js(b)})].find((e) => e.getClientRects().length).getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  for (const r of range.getClientRects()) {
    const x = Math.max(r.left, box.left) + 12, y = r.top + r.height / 2;
    if (x < Math.min(r.right, box.right) - 4 && y > box.top && y < box.bottom) return { x, y };
  }
  return null;
})()`);
  // the key in els of the element drawn on top at a point, i.e. the one that a click there hits
  const topAt = (page, at, els) => page.evaluate(`(() => {
  const els = ${js(els)};
  for (const hit of document.elementsFromPoint(${at.x}, ${at.y})) {
    const k = Object.keys(els).find((n) => document.querySelector(els[n]).contains(hit));
    if (k) return k;
  }
  return null;
})()`);

  for (const platform of PLATFORMS) {
    test(`${platform}: Send Backward of a foot that is a step after the items of the list keeps the order of the steps of slide 3 (C2)`, async (t) => {
      const page = await load(t, platform, FRAGFOOT, STEPS);
      assert.deepEqual(await named(page, STEP_ROWS), ['foot', 'ul', 'p', 'h2']);
      await pick(page, STEP_ROWS, 'foot');
      await layer(page, platform, 'backward');
      assert.deepEqual(await named(page, STEP_ROWS), ['ul', 'foot', 'p', 'h2']);
      const at = await overlap(page, STEP_EL.foot, STEP_EL.ul);
      assert.equal(await topAt(page, at, { foot: STEP_EL.foot, ul: STEP_EL.ul }), 'ul');
      const { text } = await saveAndReopen(page, `.r18-1-c2a-${platform}.html`);
      assert.deepEqual(errors(page), []);
      // a page of the show is opened last, since the page of the editor is then in the background
      const source = await stepsOf(t, FRAGFOOT, STEPS, `.r18-1-${platform}-show-a.html`);
      assert.deepEqual(source, ['Each step is a', 'Two elements w', 'When exporting', 'Slides can hav']);
      assert.deepEqual(await stepsOf(t, text, STEPS, `.r18-1-${platform}-show-b.html`), source, 'Send Backward changes the order of the steps in the show');
    });

    test(`${platform}: three Send Backward and three Bring Forward of the foot of slide 3 give the file back, drawn as listed at each step (C2, C3)`, async (t) => {
      const page = await load(t, platform, OVERLAPS, STEPS);
      const pair = { foot: STEP_EL.foot, ul: STEP_EL.ul };
      const at = await overlap(page, STEP_EL.foot, STEP_EL.ul);
      await pick(page, STEP_ROWS, 'foot');
      const expect = [['ul', 'foot', 'p', 'h2'], ['ul', 'p', 'foot', 'h2'], ['ul', 'p', 'h2', 'foot'], ['ul', 'p', 'foot', 'h2'], ['ul', 'foot', 'p', 'h2'], ['foot', 'ul', 'p', 'h2']];
      for (const [i, order] of ['backward', 'backward', 'backward', 'forward', 'forward', 'forward'].entries()) {
        await layer(page, platform, order);
        const list = await named(page, STEP_ROWS);
        assert.deepEqual(list, expect[i], `step ${i + 1}`);
        assert.equal(await topAt(page, at, pair), list.indexOf('foot') < list.indexOf('ul') ? 'foot' : 'ul', `the order drawn at step ${i + 1} is not the order listed`);
      }
      assert.equal(await render(page), OVERLAPS, 'the file is not the source once the rows are in their first order');
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: Send Backward three times, a drag of the row to the bottom, and Send to Back of the figure of slide 5 write the same bytes (C2)`, async (t) => {
      const page = await load(t, platform, FIGOVER, FIGURES);
      assert.deepEqual(await named(page, FIG_ROWS), ['fig', 'ul', 'p', 'h2']);
      await pick(page, FIG_ROWS, 'fig');
      for (let i = 0; i < 3; i++) await layer(page, platform, 'backward');
      const stepped = await render(page);
      assert.deepEqual(await named(page, FIG_ROWS), ['ul', 'p', 'h2', 'fig']);
      for (let i = 0; i < 3; i++) await undo(page);
      await frames(page);
      assert.equal(await render(page), FIGOVER);
      await pick(page, FIG_ROWS, 'fig');
      const back = await layer(page, platform, 'back');
      assert.deepEqual(await named(page, FIG_ROWS), ['ul', 'p', 'h2', 'fig']);
      assert.equal(stepped, back, 'Send Backward three times and Send to Back write different bytes for the same order');
      await undo(page);
      await frames(page);
      assert.equal(await render(page), FIGOVER);
      const from = await rowAt(page, FIG_ROWS, 'fig');
      const last = await page.evaluate(`[...document.querySelectorAll(${js(ROW)})].at(-1).getBoundingClientRect().bottom`);
      await drag(page, from, { dy: last - 3 - from.y, steps: 12 });
      await frames(page);
      assert.deepEqual(await named(page, FIG_ROWS), ['ul', 'p', 'h2', 'fig']);
      assert.equal(await render(page), back, 'a drag of the row and Send to Back write different bytes for the same order');
      assert.deepEqual(errors(page), []);
    });

    // the heading is drawn under the backdrop over the whole slide, hence Send Backward of the caption,
    // which would put it under the backdrop, is dimmed and does not change the file (R21.3, V20)
    test(`${platform}: Send Backward and Send to Back of the caption of a figure slide with a backdrop do not put it under the backdrop (C2)`, async (t) => {
      const page = await load(t, platform, LAYOUTS_SOURCE, BACKDROP, LAYOUTS);
      const list = await named(page, CAP_ROWS);
      await pick(page, CAP_ROWS, 'cap');
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: false, back: false });
      await press(page, KEYS[platform].backward);
      await press(page, KEYS[platform].back);
      await frames(page);
      assert.deepEqual(await named(page, CAP_ROWS), list);
      assert.equal(await render(page), LAYOUTS_SOURCE, 'the caption is moved in the file');
      const at = await page.evaluate(`(() => { const r = document.querySelector(${js(CAP_EL.cap)}).getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
      assert.equal(await topAt(page, at, CAP_EL), 'cap', 'the backdrop is drawn over the caption');
      assert.deepEqual(errors(page), []);
    });

    test(`${platform}: the object list shows a foot written before the list under it, and Bring to Front brings it over the list (C3)`, async (t) => {
      const page = await load(t, platform, FOOTFIRST, STEPS);
      const pair = { foot: STEP_EL.foot, ul: STEP_EL.ul };
      const at = await overlap(page, STEP_EL.foot, STEP_EL.ul);
      assert.ok(at, 'the foot is not over the list');
      assert.equal(await topAt(page, at, pair), 'ul');
      assert.deepEqual(await named(page, STEP_ROWS), ['ul', 'foot', 'p', 'h2'], 'the object list shows the foot over the list drawn over it');
      await pick(page, STEP_ROWS, 'foot');
      assert.deepEqual(await orders(page), { front: true, forward: true, backward: true, back: true });
      await layer(page, platform, 'front');
      assert.deepEqual(await named(page, STEP_ROWS), ['foot', 'ul', 'p', 'h2']);
      assert.equal(await topAt(page, at, pair), 'foot', 'Bring to Front does not draw the foot over the list');
      const { text } = await saveAndReopen(page, `.r18-1-c3-${platform}.html`);
      assert.deepEqual(errors(page), []);
      assert.deepEqual(await stepsOf(t, text, STEPS, `.r18-1-${platform}-show-c.html`), await stepsOf(t, FOOTFIRST, STEPS, `.r18-1-${platform}-show-d.html`));
    });

    // the theme draws the block of the closing slide in front of the QR code, and the block is a
    // stacking context, hence the QR code passes all of its texts at once
    test(`${platform}: the QR code stays selected over the undo and the redo of Bring to Front, and Send to Back then moves it (C4)`, async (t) => {
      const page = await load(t, platform, OVERLAPS, CLOSING);
      const pair = { h1: `${S} .title-text > h1`, qr: `${S} > .qr` };
      const at = await overlap(page, pair.h1, pair.qr);
      assert.ok(at, 'the QR code is not over the heading');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'sub', 'h1', 'qr']);
      assert.equal(await topAt(page, at, pair), 'h1');
      await pick(page, CLOSE_ROWS, 'qr');
      const base = await render(page);
      const edited = await layer(page, platform, 'front');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['qr', 'who', 'sub', 'h1']);
      assert.equal(await topAt(page, at, pair), 'qr');
      await press(page, KEYS[platform].undo);
      await frames(page);
      assert.equal(await render(page), base, 'the undo does not give the file back byte for byte');
      assert.deepEqual(await selected(page), ['div.qr'], 'the undo selects another element');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'sub', 'h1', 'qr']);
      assert.equal(await topAt(page, at, pair), 'h1');
      await press(page, KEYS[platform].redo);
      await frames(page);
      assert.equal(await render(page), edited);
      assert.deepEqual(await selected(page), ['div.qr'], 'the redo selects another element');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['qr', 'who', 'sub', 'h1']);
      assert.equal(await topAt(page, at, pair), 'qr');
      await layer(page, platform, 'back');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'sub', 'h1', 'qr'], 'Send to Back after the redo does not move the QR code');
      assert.equal(await topAt(page, at, pair), 'h1');
      assert.equal(await render(page), base, 'a declaration is left once the slide is in the order of the file');
      assert.deepEqual(await selected(page), ['div.qr']);
      assert.deepEqual(errors(page), []);
    });
  }
});

// regression tests of R20.11 on both platforms with trusted input. the layer commands of
// commands/order.ts stay fast on a slide with many children (F1) and keep a caption in its place
// (F2). a new text box, formula, or figure is drawn in front of the shapes of its slide, and Send
// to Back of a shape draws the words of the text column over it. Reset Slide keeps the place of a
// line. Reset Rotation of a group gives the file back after many turns and a nudge (F12, O4, N3),
// and Esc during a drag does not revive an older turn (F13) or change the selection (F14)
describe('fast layer commands and new elements in front', () => {
  const SOURCE = readFileSync('test-deck.html', 'utf8');
  const DECK = 'test/pages/editor-r20-11.html';
  const DECK_SOURCE = readFileSync(DECK, 'utf8');
  const slideOf = (text, has) => [...text.matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => has(m[0]));
  const STEPS = slideOf(SOURCE, (s) => s.includes('Show your steps one at a time'));
  const FIGURES = slideOf(SOURCE, (s) => s.includes('Figures are first class citizens'));
  const [UNDER, ROOM, LINED] = [0, 1, 2];
  const PLATFORMS = ['mac', 'other'];
  const KEYS = {
    mac: { front: 'Mod+Shift+F', forward: 'Mod+Alt+Shift+F', backward: 'Mod+Alt+Shift+B', back: 'Mod+Shift+B', group: 'Alt+Mod+G' },
    other: { front: 'Mod+Shift+ArrowUp', forward: 'Mod+ArrowUp', backward: 'Mod+ArrowDown', back: 'Mod+Shift+ArrowDown', group: 'Mod+G' },
  };
  const LIST_KEY = { mac: 'Mod+Shift+L', other: 'Alt+F10' };
  const ROW = '.beeson-edit-objects .row';
  const S = '.reveal section.present';
  const IMG = `${S} figure img.for-light`;

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
  const render = (page) => page.evaluate('window.BeesonEditor.render()');
  const undo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.undo()).then(() => true)');
  const redo = (page) => page.evaluate('Promise.resolve(window.BeesonEditor.redo()).then(() => true)');
  const exec = (page, id, arg) => page.evaluate(`Promise.resolve(window.BeesonEditor.exec(${js(id)}${arg ? `, ${js(arg)}` : ''})).then(() => true)`);
  const errors = (page) => page.errors.filter((e) => !e.includes('favicon.ico'));
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName).join(',')`);
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const mouse = (page, type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const ms = async (f) => {
    const t0 = performance.now();
    await f();
    return Math.round(performance.now() - t0);
  };

  // the deck text opened with the editor at slide n, from a file of the root where file is given
  async function load(t, platform, text, n, file = null, theme = '') {
    if (file) {
      writeFileSync(file, text);
      t.after(() => rmSync(file, { force: true }));
    }
    const page = await browser.newPage({ width: 1600, height: 1000 });
    t.after(() => page.close().catch(() => {}));
    await page.goto(`${server.origin}/theme/beeson.css`);
    await page.evaluate('localStorage.clear()');
    await page.goto(`${server.origin}/${file ?? (text === DECK_SOURCE ? DECK : 'test-deck.html')}?edit&still${theme}&edit-platform=${platform}`);
    await page.waitFor(deckSettled);
    await page.waitFor('window.BeesonEditor && window.BeesonEditor.ready.then(() => true)');
    page.source = text;
    const s = await page.evaluate(`window.BeesonEditor.open(${js(text)})`);
    assert.deepEqual(s.problems, []);
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    return page;
  }

  // the object list shown, and the point of its row whose name starts with which, or of the row at
  // the index which
  const showList = async (page, platform) => {
    await press(page, LIST_KEY[platform]);
    await frames(page);
  };
  const rowAt = (page, which) => page.evaluate(`(() => {
  const rows = [...document.querySelectorAll(${js(ROW)})];
  const r = (typeof ${js(which)} === 'number' ? rows[${js(which)}] : rows.find((x) => x.querySelector('.name').textContent.startsWith(${js(which)}))).getBoundingClientRect();
  return { x: r.left + 60, y: r.top + r.height / 2 };
})()`);
  const rowNames = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].map((r) => r.querySelector('.name').textContent)`);

  // the top left corners of the elements of the selectors, in CSS px
  const corners = (page, selectors) => page.evaluate(`${js(selectors)}.map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })`);

  // what is drawn at a point of the words of the element of a inside the box of the element of b,
  // with the shapes taking the pointer, which the theme gives to the elements under them
  const drawnAt = (page, a, b) => page.evaluate(`(() => {
  const el = document.querySelector(${js(a)});
  const box = document.querySelector(${js(b)}).getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  let at = null;
  for (const r of range.getClientRects()) {
    const x = Math.max(r.left, box.left) + 8, y = r.top + r.height / 2;
    if (!at && r.width > 4 && x < Math.min(r.right, box.right) - 4 && y > box.top + 2 && y < box.bottom - 2) at = { x, y };
  }
  if (!at) return 'no point of the words over the box';
  const style = document.createElement('style');
  style.textContent = '.reveal .slides section .shape { pointer-events: auto !important }';
  document.head.append(style);
  const hit = document.elementFromPoint(at.x, at.y);
  style.remove();
  return hit === el || el.contains(hit) ? 'words' : hit?.closest('.shape') ? 'shape' : hit?.localName ?? 'nothing';
})()`);

  // the kind of what is drawn at the center of the element of selector, with the shapes taking the
  // pointer
  const drawnAtCenter = (page, selector) => page.evaluate(`(() => {
  const r = document.querySelector(${js(selector)}).getBoundingClientRect();
  const style = document.createElement('style');
  style.textContent = '.reveal .slides section .shape { pointer-events: auto !important }';
  document.head.append(style);
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  style.remove();
  return hit?.closest('.shape') ? 'shape' : hit?.closest('.math, .figure-box, p') ? 'new' : hit?.localName ?? 'nothing';
})()`);

  // a drag of the element of selector onto the center of the shape of the slide, by the move handle
  // of a text block, which a drag of its words would select, and else from its center
  async function dragOntoShape(page, selector) {
    const mid = (s) => page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(s)})].find((e) => !e.hidden && e.getClientRects().length)?.getBoundingClientRect(); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const [from, to] = [await mid(selector), await mid(`${S} > .shape`)];
    const grip = (await mid('.beeson-handle')) ?? from;
    await drag(page, grip, { dx: to.x - from.x, dy: to.y - from.y });
    await frames(page);
    const now = await mid(selector);
    assert.ok(Math.abs(now.x - to.x) < 4 && Math.abs(now.y - to.y) < 4, `the drag did not put the element onto the shape: ${js([from, now, to])}`);
  }

  // the opened deck again after the undo of each entry, which are at most six
  async function undoAll(page) {
    for (let i = 0; i < 6 && (await render(page)) !== page.source; i++) await undo(page);
    assert.equal(await render(page), page.source);
  }

  // a slide with a heading, n paragraphs in the flow, m translated figures, and a foot, put before
  // the closing slide of source, and its index
  function manyChildren(n, m, source = SOURCE, title = 'Many children') {
    const ps = Array.from({ length: n }, (_, i) => `  <p style="font-size: 22px; margin: 0">Paragraph number ${i} of a long slide.</p>`).join('\n');
    const figs = Array.from({ length: m }, (_, i) => `  <div class="figure-box" style="translate: ${-900 + i * 40}px ${-300 + i * 30}px"><img src="demo/figure-dark.png" alt="f${i}"></div>`).join('\n');
    const slide = `<section>\n  <h2>${title}</h2>\n${ps}\n${figs}\n  <div class="foot">A foot.</div>\n</section>\n\n`;
    const text = source.replace('<section class="closing">', `${slide}<section class="closing">`);
    return { text, n: slideOf(text, (s) => s.includes(title)) };
  }

  // the times in ms on the slide n, with the object list shown: the Arrange menu opened with the
  // first figure selected, the four Order commands on it, Shift-clicks on the rows of the next four
  // figures, and Bring to Front of the five. the slide is given back after each command
  async function layerTimes(page, platform, n) {
    await page.evaluate(`Reveal.slide(${n})`);
    await frames(page);
    const names = await rowNames(page);
    const figs = names.map((r, i) => [r, i]).filter(([r]) => /^(Figure|Image|Picture)/.test(r)).map(([, i]) => i);
    assert.ok(figs.length >= 5, js(names));
    await clickText(page, await rowAt(page, figs[0]));
    await frames(page);
    const at = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.beeson-edit-menubar button')].find((x) => x.textContent === 'Arrange'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const menu = await ms(async () => {
      await clickText(page, at);
      await frames(page);
    });
    await page.evaluate('window.BeesonEditorShell.closeMenus()');
    await frames(page);
    const commands = {};
    for (const o of ['back', 'forward', 'front', 'backward']) {
      const base = await render(page);
      commands[o] = await ms(async () => {
        await press(page, KEYS[platform][o]);
        await frames(page);
      });
      if ((await render(page)) !== base) {
        await undo(page);
        await frames(page);
      }
      assert.equal(await render(page), base);
    }
    const shifts = [];
    for (const i of figs.slice(1, 5)) {
      const row = await rowAt(page, i);
      shifts.push(await ms(async () => {
        await click(page, row, { modifiers: 'Shift' });
        await frames(page);
      }));
    }
    assert.equal((await selected(page)).split(',').length, 5);
    const base = await render(page);
    const front = await ms(async () => {
      await press(page, KEYS[platform].front);
      await frames(page);
    });
    assert.notEqual(await render(page), base);
    await undo(page);
    await frames(page);
    assert.equal(await render(page), base);
    return { rows: names.length, menu, command: Math.max(...Object.values(commands)), shift: Math.max(...shifts), front };
  }

  // each time on a slide with 47 rows is bounded by RATIO times the same time on a slide with 9 rows,
  // and SLACK ms for the pauses of a machine that other tests load at once. the bound thus scales
  // with a slower machine. before the fix of F1, the menu took about 970 ms, a command 700 ms, a
  // Shift-click 5 to 12 s, and Bring to Front of 5 about 45 s on the slide with 47 rows, i.e. over
  // 100 times its time with 9 rows. the rows are 5.2 times as many, and on the runners of GitHub
  // Bring to Front took 2 to 5.8 times as long, hence a bound of 4 times failed there
  const RATIO = 8;
  const SLACK = 150;

  for (const platform of PLATFORMS) {
    // F1: every place among the siblings was tried for each moved element, by each of the four Order
    // commands at each refresh of the inspector
    test(`the Arrange menu, a layer command, and a Shift-click run without a pause on a slide with 47 rows (${platform})`, { timeout: 180000 }, async (t) => {
      const few = manyChildren(2, 5, SOURCE, 'Few children');
      const { text, n } = manyChildren(25, 20, few.text);
      const page = await load(t, platform, text, n, `.r20-11-many-${platform}.html`);
      await showList(page, platform);
      const names = await rowNames(page);
      assert.ok(names.filter((r) => !r.startsWith('Backdrop')).length >= 47, `the slide has ${names.length} rows`);
      assert.equal(names.filter((r) => /^(Figure|Image|Picture)/.test(r)).length, 20, js(names));
      // the slide with few rows is measured first, after which the code of the editor is warm
      await layerTimes(page, platform, few.n);
      const small = await layerTimes(page, platform, few.n);
      const large = await layerTimes(page, platform, n);
      // a time over its bound is measured again, twice at most, and the lowest one counts, since one
      // time on a machine that runs other tests at once holds the pauses of the machine too
      const TIMES = ['menu', 'command', 'shift', 'front'];
      const over = () => TIMES.filter((k) => large[k] >= RATIO * small[k] + SLACK);
      for (let again = 0; again < 2 && over().length; again++) {
        const next = await layerTimes(page, platform, n);
        for (const k of TIMES) large[k] = Math.min(large[k], next[k]);
      }
      t.diagnostic(`with ${small.rows} rows ${js(small)}, with ${large.rows} rows ${js(large)}`);
      for (const k of TIMES) {
        assert.ok(large[k] < RATIO * small[k] + SLACK, `${k} took ${large[k]} ms with ${large.rows} rows, and ${small[k]} ms with ${small.rows} rows`);
      }
      assert.deepEqual(errors(page), []);
    });

    // F2: Bring Forward and Bring to Front moved the tag of the caption after the list, and its words
    // from y 363 to y 642
    for (const o of ['forward', 'front']) {
      test(`Bring ${o === 'front' ? 'to Front' : 'Forward'} of a caption on a content slide keeps its words in their place (${platform})`, async (t) => {
        const page = await load(t, platform, SOURCE, STEPS);
        await showList(page, platform);
        await clickText(page, await rowAt(page, 'Text: Design the complete'));
        await frames(page);
        await exec(page, 'text.style.caption');
        await frames(page);
        const caption = `${S} > p.caption`;
        const was = await corners(page, [caption, `${S} > ul`]);
        const base = await render(page);
        await press(page, KEYS[platform][o]);
        await frames(page);
        const edited = await render(page);
        assert.notEqual(edited, base, 'the command does not change the file');
        assert.deepEqual(await corners(page, [caption, `${S} > ul`]), was, 'the caption or the list moved');
        assert.match(edited, /<p class="caption" style="[^"]*z-index: \d+[^"]*">Design the complete[\s\S]*?<ul>/, 'the caption is not kept before the list');
        await undo(page);
        assert.equal(await render(page), base);
        await redo(page);
        assert.equal(await render(page), edited);
        assert.deepEqual(errors(page), []);
      });
    }

    // a new element was written before the shape in the file, hence drawn under it once dragged onto it
    test(`a new text box dragged onto a shape is drawn in front of it (${platform})`, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, ROOM);
      await click(page, '.beeson-edit-top [data-command="insert.text"]');
      await sleep(200);
      await type(page, 'Box over the shape');
      await sleep(300);
      assert.match(await render(page), /<p style="[^"]*z-index: \d+[^"]*">Box over the shape<\/p>/, 'the insert does not hold the layer of the text box');
      await press(page, 'Escape');
      await frames(page);
      const box = `${S} > p:nth-of-type(2)`;
      assert.equal(await page.evaluate(`document.querySelector(${js(box)}).textContent`), 'Box over the shape');
      await dragOntoShape(page, box);
      assert.equal(await drawnAtCenter(page, box), 'new');
      await undoAll(page);
      assert.deepEqual(errors(page), []);
    });

    test(`a new formula dragged onto a shape is drawn in front of it, and its undo gives the file back (${platform})`, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, ROOM);
      await exec(page, 'insert.formula');
      await sleep(300);
      await type(page, 'x^2 + y^2 = r^2');
      await sleep(300);
      // a click on the pasteboard closes the TeX field and leaves the slide without a selection
      await clickText(page, { x: 8, y: 500 });
      await sleep(300);
      const inserted = await render(page);
      assert.match(inserted, /<div class="math" style="[^"]*z-index: \d+/, 'the insert does not hold the layer of the formula');
      const math = `${S} > .math`;
      await dragOntoShape(page, `${math} mjx-container`);
      assert.equal(await drawnAtCenter(page, `${math} mjx-container`), 'new');
      await undoAll(page);
      assert.deepEqual(errors(page), []);
    });

    test(`a new figure dragged onto a shape is drawn in front of it (${platform})`, { timeout: 60000 }, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, ROOM);
      await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
      await page.evaluate(`window.__done = window.BeesonEditor.exec('insert.image').then(() => true); 0`);
      await page.waitFor(`!!document.querySelector('input.beeson-media-input')`);
      const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelector('input.beeson-media-input')` });
      await page.send('DOM.setFileInputFiles', { files: [resolve('demo/figure-light.png')], objectId: result.objectId });
      await page.waitFor('window.__done', 20000);
      await sleep(300);
      const img = `${S} > .figure-box img`;
      assert.ok(await page.evaluate(`!!document.querySelector(${js(img)})`), 'no figure was inserted');
      assert.equal(await page.evaluate(`window.BeesonEditor.state('edit.undo').label`), 'Undo Insert Image');
      await dragOntoShape(page, img);
      assert.equal(await drawnAtCenter(page, img), 'new');
      await undoAll(page);
      assert.deepEqual(errors(page), []);
    });

    test(`Send to Back of a shape over the words of the text column draws the words over it and keeps the layout (${platform})`, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, UNDER);
      const shape = `${S} > .shape`;
      const els = [`${S} > h2`, `${S} > p`, `${S} > ul`, shape];
      assert.equal(await drawnAt(page, `${S} > p`, shape), 'shape');
      const was = await corners(page, els);
      await showList(page, platform);
      await clickText(page, await rowAt(page, 'Rounded Rectangle'));
      await frames(page);
      await press(page, KEYS[platform].back);
      await frames(page);
      const edited = await render(page);
      assert.notEqual(edited, DECK_SOURCE);
      assert.deepEqual(await corners(page, els), was, 'the layout changed');
      assert.equal(await drawnAt(page, `${S} > p`, shape), 'words');
      assert.equal(await drawnAt(page, `${S} > ul`, shape), 'words');
      await undo(page);
      assert.equal(await render(page), DECK_SOURCE);
      assert.deepEqual(errors(page), []);
    });

    // Reset Slide took the translate off a line, which moved it to the upper left corner of its slide
    test(`Reset Slide leaves the place of a line (${platform})`, async (t) => {
      const page = await load(t, platform, DECK_SOURCE, LINED);
      const line = `${S} > svg.line`;
      const was = await corners(page, [line]);
      await exec(page, 'slide.reset');
      await frames(page);
      const edited = await render(page);
      assert.match(edited, /<p>A moved paragraph\.<\/p>/, 'Reset Slide does not take the translate off the paragraph');
      assert.match(edited, /<svg class="line" width="400" height="1" style="translate: 700px 600px">/);
      assert.deepEqual(await corners(page, [line]), was, 'the line moved');
      await undo(page);
      assert.equal(await render(page), DECK_SOURCE);
      assert.deepEqual(errors(page), []);
    });
  }

  // a typed value of a field of the Arrange pane
  const PANEL = '#beeson-edit-panel-format';
  async function typeField(page, id, value) {
    await page.evaluate(`[...document.querySelectorAll('${PANEL} .ed-tabs button')].find((b) => b.textContent === 'Arrange')?.click()`);
    await frames(page);
    await page.evaluate(`(() => { const i = document.querySelector('#beeson-edit-num-${id}'); i.focus(); i.select(); })()`);
    await type(page, String(value));
    await press(page, 'Enter');
    await frames(page);
  }

  // a drag of the shown rotate handle by deg degrees about the center of the frame of the selection
  async function dragRotor(page, deg) {
    const o = await page.evaluate(`(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const shown = (el) => !el.hidden && el.getClientRects().length > 0;
    return { c: mid([...document.querySelectorAll('.beeson-frame.union, .beeson-frame.selected')].find(shown)), r: mid([...document.querySelectorAll('.beeson-rotor')].find(shown)) };
  })()`);
    const radius = Math.hypot(o.r.x - o.c.x, o.r.y - o.c.y), from = Math.atan2(o.r.y - o.c.y, o.r.x - o.c.x);
    await mouse(page, 'mouseMoved', o.r.x, o.r.y);
    await mouse(page, 'mousePressed', o.r.x, o.r.y, { button: 'left', buttons: 1, clickCount: 1 });
    let at = o.r;
    for (let i = 1; i <= 10; i++) {
      const a = from + ((deg * Math.PI) / 180) * (i / 10);
      at = { x: o.c.x + radius * Math.cos(a), y: o.c.y + radius * Math.sin(a) };
      await mouse(page, 'mouseMoved', at.x, at.y, { button: 'left', buttons: 1 });
    }
    await frames(page);
    await mouse(page, 'mouseReleased', at.x, at.y, { button: 'left', buttons: 0, clickCount: 1 });
    await frames(page);
  }

  // the paragraph and the figure of the figures slide made one group, with the figure turned by 20
  // degrees by itself first where own is set
  async function groupOnFigures(page, platform, own) {
    await clickText(page, IMG);
    if (own) {
      await typeField(page, 'angle', 20);
      await clickText(page, IMG);
    }
    const p = await page.evaluate(`(() => { const r = Reveal.getCurrentSlide().querySelector(':scope > p').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
    await click(page, p, { modifiers: 'Shift' });
    await press(page, KEYS[platform].group);
    await frames(page);
  }

  // the group selected anew by a click on the pasteboard and a click on the picture, since a click
  // on a member of a selected group selects the member
  async function reselect(page) {
    await clickText(page, { x: 8, y: 500 });
    await frames(page);
    await clickText(page, IMG);
    await frames(page);
  }

  // a step of a run of turns: f and an angle types the angle, h and a number of degrees drags the
  // rotate handle by them, and nudge moves the group by 1 px to the right
  async function step(page, s) {
    if (s.startsWith('f')) await typeField(page, 'angle', Number(s.slice(1)));
    else if (s.startsWith('h')) await dragRotor(page, Number(s.slice(1)));
    else if (s === 'nudge') {
      await reselect(page);
      await press(page, 'ArrowRight');
      await frames(page);
    }
  }

  // F12, O4, and N3: Reset Rotation after three or more turns of a group with a member turned by
  // itself, or after a nudge between two turns, left a translate of 1 to 4 px on a member
  const RUNS = [
    [true, ['f30', 'f75', 'f140']],
    [true, ['f30', 'f75', 'f140', 'f200', 'f260']],
    [true, ['h40', 'f110', 'h-30']],
    [false, ['f30', 'f75', 'f140', 'f200', 'f260']],
    [false, ['f30', 'nudge', 'f75']],
    [true, ['f30', 'nudge', 'f75', 'f140']],
  ];
  for (const platform of PLATFORMS) {
    for (const [own, steps] of RUNS) {
      test(`Reset Rotation of a group${own ? ' with a member turned by itself' : ''} after ${steps.join(' ')} gives the file back (${platform})`, { timeout: 60000 }, async (t) => {
        const page = await load(t, platform, SOURCE, FIGURES, null, '&theme=light');
        await groupOnFigures(page, platform, own);
        assert.match(await render(page), /data-group="g1"/);
        // the file of the nudges of the run alone, without the turns
        const nudges = steps.filter((s) => s === 'nudge');
        for (const s of nudges) await step(page, s);
        const expected = await render(page);
        for (let i = 0; i < nudges.length; i++) await undo(page);
        await reselect(page);
        for (const s of steps) await step(page, s);
        await exec(page, 'arrange.resetRotation');
        await frames(page);
        assert.equal(await render(page), expected);
        assert.deepEqual(errors(page), []);
      });
    }

    // F13: the cancel of a move drag set the offset of a stale rest of the turn to the nudged one,
    // hence Reset Rotation dropped the nudge
    test(`a move drag cancelled by Esc does not change what Reset Rotation gives back after a nudge (${platform})`, { timeout: 60000 }, async (t) => {
      const results = [];
      for (const cancel of [false, true]) {
        const page = await load(t, platform, SOURCE, FIGURES, null, '&theme=light');
        await clickText(page, IMG);
        await typeField(page, 'angle', 30);
        // Esc leaves the field with the figure selected, and a click would select its picture
        await press(page, 'Escape');
        await frames(page);
        assert.equal(await selected(page), 'figure');
        await press(page, 'ArrowRight');
        await frames(page);
        const nudged = await render(page);
        if (cancel) {
          const c = await page.evaluate(`(() => { const r = document.querySelector(${js(IMG)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          await drag(page, c, { dx: 60, dy: 0, hold: true });
          await press(page, 'Escape');
          await mouse(page, 'mouseReleased', c.x + 60, c.y, { button: 'left', buttons: 0, clickCount: 1 });
          await frames(page);
          assert.equal(await render(page), nudged, 'the cancelled drag changed the file');
        }
        await exec(page, 'arrange.resetRotation');
        await frames(page);
        results.push(await render(page));
        assert.deepEqual(errors(page), []);
        // a page left open keeps its draft 1 s after its last edit, and on a slow machine this draft
        // was kept after the next page emptied the storage, whose dialog then took the click on IMG
        await page.close();
      }
      assert.match(results[0], /<figure class="figure-box" style="translate: [^"]+">/);
      assert.equal(results[1], results[0]);
    });

    // F14: Esc in a drag of a line end emptied the selection, and in a drag of a line selected with a
    // figure it left the line alone selected
    test(`Esc during a drag of a line end or of a line keeps the selection of the press (${platform})`, async (t) => {
      const page = await load(t, platform, SOURCE, FIGURES, null, '&theme=light');
      await exec(page, 'insert.line', { from: { x: 200, y: 900 }, to: { x: 700, y: 950 } });
      await frames(page);
      const base = await render(page);
      assert.equal(await selected(page), 'svg');
      const held = async (from, dx, dy) => {
        await drag(page, from, { dx, dy, hold: true });
        await press(page, 'Escape');
        await frames(page);
        const afterEsc = await selected(page);
        await mouse(page, 'mouseReleased', from.x + dx, from.y + dy, { button: 'left', buttons: 0, clickCount: 1 });
        await frames(page);
        return [afterEsc, await selected(page)];
      };
      const end = await page.evaluate(`(() => { const g = [...document.querySelectorAll('.beeson-line-end')].find((x) => x.getClientRects().length && x.dataset.end === '2'); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      assert.deepEqual(await held(end, 80, -60), ['svg', 'svg'], 'the selection after Esc in a drag of the line end');
      assert.equal(await render(page), base);
      await clickText(page, IMG);
      await frames(page);
      const mid = await page.evaluate(`(() => { const r = document.querySelector('${S} svg.line line').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await click(page, mid, { modifiers: 'Shift' });
      await frames(page);
      const both = await selected(page);
      assert.equal(both.split(',').length, 2);
      assert.deepEqual(await held(mid, 50, -40), [both, both], 'the selection after Esc in a drag of the line with the figure');
      assert.equal(await render(page), base);
      assert.deepEqual(errors(page), []);
    });
  }
});
