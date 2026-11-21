import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { deckSettled, deckUrl, launch, printView } from '../scripts/chrome.mjs';
import { serve } from '../scripts/webdriver.mjs';
import { click, clickText, drag, press, saveAndReopen } from './helpers/editor.mjs';

describe('layer commands for an element in the flow', () => {
  const DECK = 'test-deck.html';
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
  const orders = async (page) => Object.fromEntries(await Promise.all(['front', 'forward', 'backward', 'back'].map(async (o) => [o, (await state(page, `arrange.order.${o}`)).enabled])));
  const undoLabel = (page) => page.evaluate(`window.BeesonEditor.state('edit.undo').label`);
  const changedTags = (base, text) => {
    const a = base.match(/<[a-z][^>]*>/g), b = text.match(/<[a-z][^>]*>/g);
    return b.filter((t, i) => t !== a[i]);
  };
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`);

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

  const boxes = (page) => page.evaluate(`[...document.querySelector('.reveal section.present').children].map((e) => { const r = e.getBoundingClientRect(); return e.localName + ' ' + [r.left, r.top, r.width, r.height].map(Math.round).join(' '); })`);

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

  const drawnAt = (page, at) => page.evaluate(`(() => {
  const hit = document.elementsFromPoint(${at.x}, ${at.y}).find((e) => e.closest('.reveal section.present'));
  return hit ? (hit.closest(${js(P)}) ? 'p' : hit.localName) : null;
})()`);

  const rows = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].map((r) => r.querySelector('.name').textContent)`);

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
    assert.deepEqual(page.errors, []);
  }

  for (const platform of PLATFORMS) {
    test(`${platform}: a paragraph dragged onto the figure is brought in front of its picture`, async (t) => {
      const page = await load(t, platform);
      const scale = await page.evaluate(`document.querySelector('.reveal section.present').getBoundingClientRect().width / 1920`);
      await clickText(page, P);
      await press(page, 'Escape');
      await frames(page);
      assert.deepEqual(await selected(page), ['p']);
      const from = await page.evaluate(`(() => { const r = [...document.querySelectorAll('.beeson-handle')].find((d) => !d.hidden && d.getClientRects().length).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await drag(page, from, { dx: 700 * scale, dy: 100 * scale, steps: 12 });
      await frames(page);
      const dragged = await render(page);
      assert.notEqual(dragged, page.source);
      const at = await textOverPicture(page);
      assert.ok(at, 'the text of the paragraph is not over the picture');
      assert.equal(await drawnAt(page, at), 'img', 'the paragraph is not under the picture before Bring to Front');
      const placed = await boxes(page);

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
      assert.deepEqual(page.errors, []);
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
      assert.ok(front.indexOf('<h2 style="translate: 0px') > front.indexOf('<div class="plate">'), 'the heading is not put after the plate');
      assert.doesNotMatch(front, /z-index/);
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: true, back: true });
      await checkEdit(page, front, moved);
      await clickText(page, '.reveal section.present .plate img');
      await frames(page);
      assert.deepEqual(await orders(page), { front: false, forward: false, backward: false, back: false });
    });
  }

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

describe('layers in the order of the Object List', () => {
  const DECK = 'test-deck.html';
  const LAYOUTS = 'test/pages/editor-layouts.html';
  const slideOf = (deck, has) => [...readFileSync(deck, 'utf8').matchAll(/<section[\s\S]*?<\/section>/g)].findIndex((m) => has(m[0]));
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
  const orders = async (page) => Object.fromEntries(await Promise.all(['front', 'forward', 'backward', 'back'].map(async (o) => [o, (await state(page, `arrange.order.${o}`)).enabled])));
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`);
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
    assert.deepEqual(page.errors, []);
  }

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

      await layer(page, platform, 'ul', 'backward');
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2'], 'Send Backward does not pass one layer');
      await layer(page, platform, 'ul', 'backward');
      assert.deepEqual(await named(page), ['figure', 'p', 'h2', 'ul']);
      await layer(page, platform, 'ul', 'forward');
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2'], 'Bring Forward does not pass one layer');
      await layer(page, platform, 'ul', 'forward');
      assert.deepEqual(await named(page), ['figure', 'ul', 'p', 'h2']);
      assert.equal(await render(page), page.source, 'a declaration is left once the list is back in the order of the file');
      await layer(page, platform, 'p', 'forward');
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2']);
      await layer(page, platform, 'p', 'backward');
      assert.equal(await render(page), page.source);
      assert.deepEqual(page.errors, []);
    });

    test(`${platform}: the declarations of the layer commands are taken off every element once the slide is in the order of the file, and those of the author are kept`, async (t) => {
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
      assert.deepEqual(page.errors, []);
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
      from = await box('ul');
      const below = await box('p');
      await drag(page, { x: from.x, y: from.y }, { dy: below.bottom - 2 - from.y, steps: 8 });
      await frames(page);
      assert.deepEqual(await named(page), ['figure', 'p', 'ul', 'h2']);
      assert.deepEqual(page.errors, []);
    });
  }
});

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
  const orders = async (page) => Object.fromEntries(await Promise.all(['front', 'forward', 'backward', 'back'].map(async (o) => [o, (await state(page, `arrange.order.${o}`)).enabled])));
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => e.localName)`);
  const rows = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].filter((r) => r.dataset.kind !== 'Backdrop').map((r) => r.querySelector('.name').textContent)`);
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

  async function pick(page, names, name) {
    const at = await page.evaluate(`(() => { const r = [...document.querySelectorAll(${js(ROW)})].find((x) => x.querySelector('.name').textContent.startsWith(${js(names[name])})).getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
    await click(page, at);
    await frames(page);
    assert.equal((await selected(page)).length, 1);
  }

  const rowSelected = (page, names, name) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})]
  .filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.querySelector('.name').textContent.startsWith(${js(names[name])})).join()`);

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
  const topAt = (page, at, els) => page.evaluate(`(() => {
  const els = ${js(els)};
  for (const hit of document.elementsFromPoint(${at.x}, ${at.y})) {
    const k = Object.keys(els).find((n) => document.querySelector(els[n]).contains(hit));
    if (k) return k;
  }
  return null;
})()`);
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
      assert.deepEqual(page.errors, []);
    });

    test(`${platform}: the order of the heading of the closing slide and the QR code is drawn as the object list shows it (G5)`, async (t) => {
      const page = await load(t, platform, CLOSING);
      const pair = { h1: CLOSE_EL.h1, qr: CLOSE_EL.qr };
      const at = await overlap(page, CLOSE_EL.h1, CLOSE_EL.qr);
      assert.ok(at, 'the QR code is not over the heading');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['who', 'sub', 'h1', 'qr']);
      assert.equal(await topAt(page, at, pair), 'h1');
      await layer(page, platform, 'front', CLOSE_ROWS, 'qr');
      assert.deepEqual(await named(page, CLOSE_ROWS), ['qr', 'who', 'sub', 'h1']);
      assert.equal(await topAt(page, at, pair), 'qr', 'the QR code brought to the front is drawn under the heading');
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
      assert.deepEqual(page.errors, []);
    });

    test(`${platform}: the layer commands and a drag of a row order the texts of the block of the closing slide among the objects of the slide (G6)`, async (t) => {
      const page = await load(t, platform, CLOSING);
      const pair = { h1: CLOSE_EL.h1, qr: CLOSE_EL.qr };
      const subPair = { sub: CLOSE_EL.sub, qr: CLOSE_EL.qr };
      const at = await overlap(page, CLOSE_EL.h1, CLOSE_EL.qr);
      const atSub = await overlap(page, CLOSE_EL.sub, CLOSE_EL.qr);
      assert.ok(at && atSub, 'the QR code is not over the heading and the subtitle');

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
      assert.deepEqual(page.errors, []);
    });
  }
});

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
  const orders = async (page) => Object.fromEntries(await Promise.all(['front', 'forward', 'backward', 'back'].map(async (o) => [o, (await state(page, `arrange.order.${o}`)).enabled])));
  const selected = (page) => page.evaluate(`window.BeesonEditor.selection().map((e) => [e.localName, ...e.classList].filter((c) => !c.startsWith('beeson')).join('.'))`);
  const rows = (page) => page.evaluate(`[...document.querySelectorAll(${js(ROW)})].filter((r) => r.dataset.kind !== 'Backdrop').map((r) => r.querySelector('.name').textContent)`);
  const named = async (page, names) => (await rows(page)).map((r) => Object.keys(names).find((k) => r.startsWith(names[k])) ?? r);

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
  async function pick(page, names, name) {
    await click(page, await rowAt(page, names, name));
    await frames(page);
    assert.equal((await selected(page)).length, 1);
  }

  async function layer(page, platform, order) {
    const base = await render(page);
    await press(page, KEYS[platform][order]);
    await frames(page);
    const edited = await render(page);
    assert.notEqual(edited, base, `the command ${order} does not change the file`);
    return edited;
  }

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
      assert.deepEqual(page.errors, []);
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
      assert.deepEqual(page.errors, []);
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
      assert.deepEqual(page.errors, []);
    });

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
      assert.deepEqual(page.errors, []);
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
      assert.deepEqual(page.errors, []);
      assert.deepEqual(await stepsOf(t, text, STEPS, `.r18-1-${platform}-show-c.html`), await stepsOf(t, FOOTFIRST, STEPS, `.r18-1-${platform}-show-d.html`));
    });

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
      assert.deepEqual(page.errors, []);
    });
  }
});
